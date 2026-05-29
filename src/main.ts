import { Plugin, TFile, Notice, WorkspaceLeaf, Platform, moment, addIcon, setIcon, MarkdownRenderer, Menu } from 'obsidian';
import { VIEW_TYPE_DIWA, KATANA_ICON_ID, KATANA_ICON_SVG, DEFAULT_SETTINGS, JOURNAL_ICON_ID, JOURNAL_ICON_SVG, DAILY_ICON_ID, DAILY_ICON_SVG, GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG, TASK_ICON_ID, TASK_ICON_SVG, PF_ICON_ID, PF_ICON_SVG, SETTINGS_ICON_ID, SETTINGS_ICON_SVG, PROJECT_ICON_ID, PROJECT_ICON_SVG, REVIEW_ICON_ID, REVIEW_ICON_SVG, VIEW_TYPE_DESKTOP_HUB, DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB } from './constants';
import { DiwaSettings, GawaLayoutPreferences, TaskEntry, ThoughtEntry } from './types';
import { sanitizeGawaLayoutPreferences } from './gawaLayout';
import { isTablet, parseContextString } from './utils';
import { DiwaView } from './view';
import { DesktopHubView } from './views/DesktopHubView';
import { MobileHubView } from './views/MobileHubView';
import { TabletHubView } from './views/TabletHubView';
import { DiwaSettingTab } from './settings';
import { EditEntryModal } from './modals/EditEntryModal';
import { EditThoughtModal } from './modals/EditThoughtModal';
import { EditTaskModal } from './modals/EditTaskModal';
import { MobilePostComposerModal } from './modals/MobilePostComposerModal';
import { ConfirmModal } from './modals/ConfirmModal';

import { VaultService } from './services/VaultService';
import { IndexService } from './services/IndexService';
import { TaskLinkService } from './services/TaskLinkService';
import { TaskReflectionService } from './services/TaskReflectionService';
import { FocusService } from './services/FocusService';
import { RefreshCoordinator, type RefreshScope } from './application/RefreshCoordinator';
import { TaskController } from './views/TaskController';
import { ThoughtController } from './views/ThoughtController';
import { ThoughtProcessor } from './views/ThoughtProcessor';
import { enableImageZoom } from './utils/imageZoom';
import { getCanonicalCapturePath } from './utils/settingsPaths';
import { normalizeVaultRelativePath } from './utils/vaultFiles';

const OPENABLE_DIWA_TAB_IDS = new Set([
    'review-gawa',
    'dues',
    'projects',
    'review',
    'monthly-review',
    'settings',
    'journal',
    'export',
    'finance-analytics',
]);

const REMOVED_DIWA_TAB_FALLBACKS: Record<string, string> = {
    manual: 'settings',
};

const DEFAULT_OPENABLE_DIWA_TAB_ID = 'settings';

class TaskIndexCompat {
    constructor(private readonly plugin: DiwaPlugin) {}

    getAll(): TaskEntry[] {
        return Array.from(this.plugin.index?.taskIndex?.values() ?? []);
    }

    set(tasks: TaskEntry[]): void {
        if (!this.plugin.index?.taskIndex) return;
        this.plugin.index.taskIndex.clear();
        for (const task of tasks) {
            const path = task.filePath?.trim();
            if (!path) continue;
            this.plugin.index.taskIndex.set(path, task);
        }
    }

    get(taskIdOrPath: string): TaskEntry | undefined {
        if (!this.plugin.index?.taskIndex) return undefined;
        const byPath = this.plugin.index.taskIndex.get(taskIdOrPath);
        if (byPath) return byPath;
        for (const task of this.plugin.index.taskIndex.values()) {
            if (task.taskId === taskIdOrPath || task.id === taskIdOrPath) return task;
        }
        return undefined;
    }
}

export default class DiwaPlugin extends Plugin {
	settings: DiwaSettings;
    settingsInitialized: boolean = false;
    zenCaptureDraft: string = '';
    private pendingJournalInputFocus = false;
    private unloading = false;
    private startupRunToken = 0;
    private legacyMigrationTimer: number | null = null;
    private responsiveHubReconcileTimer: number | null = null;
    private readonly scheduledThoughtRenderTimers = new Map<HTMLElement, number>();
    private readonly thoughtRenderTokens = new WeakMap<HTMLElement, number>();
    private readonly thoughtContentRenderCache = new Map<string, HTMLElement>();
    private reactiveRuntimeEventsRegistered = false;
    private reconcilingResponsiveHubLeaves = false;
    private globalDomStateCaptured = false;
    private initialHostBottomBarInlineValue: string | null = null;
    private initialBodyHadTabletClass = false;
    private initialBodyHadDesktopClass = false;
    
    // Services
    vault: VaultService;
    index: IndexService;
    // Compatibility facade for runtime callers expecting plugin.taskIndex.getAll()/set()
    taskIndex: TaskIndexCompat;
    // Shared singleton task controller (canonical public name)
    controller: TaskController;
    // Backward-compatible alias used by existing view code
    taskController: TaskController;
    thoughtController: ThoughtController;
    thoughtProcessor: ThoughtProcessor;
    taskLink: TaskLinkService;
    taskReflection: TaskReflectionService;
    refreshCoordinator: RefreshCoordinator;
    services?: {
        focus: FocusService;
    };

    getTaskController(): TaskController {
        if (!this.controller) {
            this.controller = new TaskController(this);
            this.taskController = this.controller;
            console.warn('[DIWA] TaskController was missing and has been re-created');
        }
        return this.controller;
    }

    getThoughtController(): ThoughtController {
        if (!this.thoughtController) {
            this.thoughtController = new ThoughtController(this);
            this.thoughtController.beginIndexing();
            this.thoughtController.hydrateFromIndex(Array.from(this.index?.thoughtIndex?.values() ?? []));
            this.thoughtController.endIndexing();
            console.warn('[DIWA] ThoughtController was missing and has been re-created');
        }
        return this.thoughtController;
    }

    getThoughtProcessor(): ThoughtProcessor {
        if (!this.thoughtProcessor) {
            this.thoughtProcessor = new ThoughtProcessor(this.getThoughtController());
            console.warn('[DIWA] ThoughtProcessor was missing and has been re-created');
        }
        return this.thoughtProcessor;
    }

    isMobile(): boolean {
        return (this.app as { isMobile?: boolean }).isMobile ?? Platform.isMobile;
    }

	async onload() {
		await this.loadSettings();
        this.unloading = false;
        this.captureGlobalDomState();
        this.applyMobileCssVars();
        this.applyDeviceBodyClasses();

        // Initialize Services
        this.vault = new VaultService(this.app, this.settings);
        this.index = new IndexService(this.app, this.settings);
        this.vault.setTaskFolderResolver(() => this.index.getEffectiveTasksFolder());
        this.taskIndex = new TaskIndexCompat(this);
        this.controller = new TaskController(this);
        this.taskController = this.controller;
        this.thoughtController = new ThoughtController(this);
        this.thoughtProcessor = new ThoughtProcessor(this.thoughtController);
        console.log('TaskIndex initialized:', this.taskIndex);
        console.log('[DIWA] Shared TaskController initialized:', this.controller);
        this.taskLink = new TaskLinkService(this.app, this.settings, this.index);
        this.taskReflection = new TaskReflectionService(this.app, this.settings, this.index);
        this.refreshCoordinator = new RefreshCoordinator(this.app, this.settings, this.index);
        this.services = {
            focus: new FocusService({
                getAllTasks: () => this.getAllTasks(),
            }),
        };

        this.app.workspace.onLayoutReady(async () => {
            const startupToken = ++this.startupRunToken;
            this.registerReactiveRuntimeEvents();
            this.scheduleResponsiveHubReconciliation(0);
            await this.runStartupIndexBuild(startupToken);
        });

        this.registerView(VIEW_TYPE_DIWA, (leaf) => new DiwaView(leaf, this));
        this.registerView(VIEW_TYPE_DESKTOP_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_MOBILE_HUB,  (leaf) => new MobileHubView(leaf, this));
        this.registerView(VIEW_TYPE_TABLET_HUB,  (leaf) => new TabletHubView(leaf, this));

		addIcon(KATANA_ICON_ID, KATANA_ICON_SVG);
		addIcon(JOURNAL_ICON_ID, JOURNAL_ICON_SVG);
		addIcon(DAILY_ICON_ID, DAILY_ICON_SVG);
		addIcon(GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG);
		addIcon(PF_ICON_ID, PF_ICON_SVG);
		addIcon(PROJECT_ICON_ID, PROJECT_ICON_SVG);
		addIcon(REVIEW_ICON_ID, REVIEW_ICON_SVG);
		addIcon(SETTINGS_ICON_ID, SETTINGS_ICON_SVG);
        addIcon(DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG);

        this.addRibbonIcon(DESKTOP_HUB_ICON_ID, 'Diwa Workspace', () => {
            void this.activateWorkspace();
        });

        this.addCommand({ id: 'diwa-open-workspace', name: 'Open Workspace', icon: DESKTOP_HUB_ICON_ID, callback: () => { this.activateWorkspace(); } });
        this.addCommand({ id: 'diwa-open-journal-input', name: 'Open Journal', icon: JOURNAL_ICON_ID, callback: () => { void this.activateJournalInput(); } });
        this.addCommand({ id: 'diwa-open-gawa', name: 'Open Gawa', icon: 'check-square-2', callback: () => { void this.activateGawa(); } });
        this.addCommand({ id: 'diwa-open-bulsa', name: 'Open Bulsa', icon: PF_ICON_ID, callback: () => { void this.activateBulsa(); } });

		this.addSettingTab(new DiwaSettingTab(this.app, this));
        this.scheduleLegacyMigration();
	}

    async onunload() {
        this.unloading = true;
        this.startupRunToken++;
        this.clearLegacyMigrationTimer();
        this.clearResponsiveHubReconcileTimer();
        this.clearScheduledThoughtContentRenders();
        this.restoreGlobalDomState();
        this.refreshCoordinator?.onunload();
        this.detachRegisteredLeaves();
    }

    private isStartupRunActive(token: number): boolean {
        return !this.unloading && this.startupRunToken === token;
    }

    private scheduleLegacyMigration(): void {
        if (this.settings.legacyMigrated || this.legacyMigrationTimer !== null) return;
        this.legacyMigrationTimer = window.setTimeout(() => {
            this.legacyMigrationTimer = null;
            if (this.unloading) return;
            void this.migrateLegacyTableData().catch((error) => {
                console.error('[DIWA] legacy table migration failed', error);
            });
        }, 2000);
    }

    private clearLegacyMigrationTimer(): void {
        if (this.legacyMigrationTimer === null) return;
        window.clearTimeout(this.legacyMigrationTimer);
        this.legacyMigrationTimer = null;
    }

    private clearResponsiveHubReconcileTimer(): void {
        if (this.responsiveHubReconcileTimer === null) return;
        window.clearTimeout(this.responsiveHubReconcileTimer);
        this.responsiveHubReconcileTimer = null;
    }

    private captureGlobalDomState(): void {
        if (this.globalDomStateCaptured) return;
        this.globalDomStateCaptured = true;
        const inlineValue = document.documentElement.style.getPropertyValue('--diwa-host-bottombar');
        this.initialHostBottomBarInlineValue = inlineValue.length > 0 ? inlineValue : null;
        this.initialBodyHadTabletClass = document.body.hasClass('is-tablet');
        this.initialBodyHadDesktopClass = document.body.hasClass('is-desktop');
    }

    private restoreGlobalDomState(): void {
        if (!this.globalDomStateCaptured) return;
        if (this.initialHostBottomBarInlineValue === null) {
            document.documentElement.style.removeProperty('--diwa-host-bottombar');
        } else {
            document.documentElement.style.setProperty('--diwa-host-bottombar', this.initialHostBottomBarInlineValue);
        }
        document.body.toggleClass('is-tablet', this.initialBodyHadTabletClass);
        document.body.toggleClass('is-desktop', this.initialBodyHadDesktopClass);
    }

    private clearScheduledThoughtContentRenders(): void {
        for (const timer of this.scheduledThoughtRenderTimers.values()) {
            window.clearTimeout(timer);
        }
        this.scheduledThoughtRenderTimers.clear();
        this.thoughtContentRenderCache.clear();
    }

    private detachRegisteredLeaves(): void {
        const viewTypes = [
            VIEW_TYPE_DIWA,
            VIEW_TYPE_DESKTOP_HUB,
            VIEW_TYPE_MOBILE_HUB,
            VIEW_TYPE_TABLET_HUB,
        ];

        for (const viewType of viewTypes) {
            for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
                try {
                    leaf.detach();
                } catch (error) {
                    console.warn('[DIWA] failed to detach leaf during unload', { viewType, error });
                }
            }
        }
    }

    async migrateLegacyTableData() {
        const { vault } = this.app;
        const thoughtsPath = this.joinVaultPath(this.settings.captureFolder, this.settings.captureFilePath);
        const tasksPath = this.joinVaultPath(this.settings.captureFolder, this.settings.tasksFilePath);
        const migrateFile = async (path: string, isTask: boolean): Promise<number> => {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return 0;
            const content = await vault.read(file);
            const rows = this.extractLegacyTableRows(content, isTask);
            if (rows.length === 0) return 0;

            for (const row of rows) {
                if (isTask) {
                    await this.vault.createTaskFile(row.text, row.contexts, row.due);
                } else {
                    await this.getThoughtController().addThought({ content: row.text, context: row.contexts });
                }
            }
            await vault.rename(file, path + '.bak');
            return rows.length;
        };

        await migrateFile(thoughtsPath, false);
        await migrateFile(tasksPath, true);
        this.settings.legacyMigrated = true;
        await this.saveSettings();
    }

    async activateWorkspace() {
        if (Platform.isMobile && !isTablet()) {
            await this.activateMobileHub();
            return;
        }
        if (isTablet()) {
            await this.activateTabletHub();
            return;
        }
        await this.activateDesktopHub();
    }

    async activateDesktopHub() {
        if (Platform.isMobile) {
            if (isTablet()) {
                await this.activateTabletHub();
                return;
            }
            await this.activateMobileHub();
            return;
        }
        const { workspace } = this.app;
        // Reuse an existing Desktop Hub leaf if already open
        const existing = workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const responsiveLeaf = [
            ...workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB),
            ...workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB),
        ][0];
        if (responsiveLeaf) {
            await this.setLeafViewType(responsiveLeaf, VIEW_TYPE_DESKTOP_HUB, true);
            workspace.revealLeaf(responsiveLeaf);
            return;
        }
        const leaf = Platform.isDesktop ? workspace.getLeaf('window') : workspace.getLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_DESKTOP_HUB, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    async activateMobileHub() {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB);
        if (existing.length > 0) { workspace.revealLeaf(existing[0]); return; }
        if (!Platform.isMobile || isTablet()) {
            return;
        }
        const tabletLeaf = workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB)[0];
        if (tabletLeaf) {
            await this.setLeafViewType(tabletLeaf, VIEW_TYPE_MOBILE_HUB, true);
            workspace.revealLeaf(tabletLeaf);
            return;
        }
        const leaf = workspace.getLeaf(false);
        if (leaf) { await leaf.setViewState({ type: VIEW_TYPE_MOBILE_HUB, active: true }); workspace.revealLeaf(leaf); }
    }

    async activateTabletHub() {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB);
        if (existing.length > 0) { workspace.revealLeaf(existing[0]); return; }
        if (!isTablet()) {
            return;
        }
        const mobileLeaf = workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB)[0];
        if (mobileLeaf) {
            await this.setLeafViewType(mobileLeaf, VIEW_TYPE_TABLET_HUB, true);
            workspace.revealLeaf(mobileLeaf);
            return;
        }
        const leaf = workspace.getLeaf(false);
        if (leaf) { await leaf.setViewState({ type: VIEW_TYPE_TABLET_HUB, active: true }); workspace.revealLeaf(leaf); }
    }

    private async runStartupIndexBuild(startupToken: number): Promise<void> {
        const thoughtController = this.getThoughtController();
        thoughtController.beginIndexing();
        let hydrated = false;
        let buildSucceeded = false;
        try {
            await this.index.buildIndices();
            if (!this.isStartupRunActive(startupToken)) return;
            const normalizedTasks = this.normalizeIndexedTasks(Array.from(this.index.taskIndex.values()));
            this.taskIndex.set(normalizedTasks);
            this.getTaskController().syncFromIndex();
            thoughtController.hydrateFromIndex(Array.from(this.index.thoughtIndex.values()));
            hydrated = true;
            buildSucceeded = true;
            console.log('Tasks loaded:', normalizedTasks.length);
            console.log('TaskIndex:', this.taskIndex);
            this.logTaskControllerPanes();
            this.notifyRefresh();
            this.refreshOpenTaskPanes();
            void this.scanForContexts(startupToken);
        } catch (error) {
            console.error('[DIWA] startup index build failed', error);
            if (!this.isStartupRunActive(startupToken)) return;
            this.resetRuntimeStateAfterStartupFailure();
            thoughtController.hydrateFromIndex([]);
            hydrated = true;
            new Notice('DIWA could not finish indexing on startup. Runtime listeners stayed active so the workspace can recover on the next file change.');
        } finally {
            if (this.isStartupRunActive(startupToken)) {
                if (!hydrated) {
                    this.resetRuntimeStateAfterStartupFailure();
                    thoughtController.hydrateFromIndex([]);
                }
                thoughtController.endIndexing();
            }
        }

        if (!this.isStartupRunActive(startupToken)) return;
        await this.migrateLegacyMobileGawaLeaves(startupToken);
        if (!this.isStartupRunActive(startupToken)) return;
        await this.reconcileResponsiveHubLeaves();
        if (!this.isStartupRunActive(startupToken)) return;
        if (buildSucceeded) return;
        this.notifyRefresh();
    }

    private resetRuntimeStateAfterStartupFailure(): void {
        this.index.resetAllIndices();
        this.taskIndex.set([]);
        this.getTaskController().syncFromIndex();
    }

    private registerReactiveRuntimeEvents(): void {
        if (this.reactiveRuntimeEventsRegistered) return;
        this.reactiveRuntimeEventsRegistered = true;

        this.registerEvent(this.app.vault.on('create', async (f) => {
            const scope = this.getRefreshScopeForPath(f.path);
            if (!scope) {
                if (!(f instanceof TFile)) await this.handleProjectFolderMutation(f.path);
                return;
            }
            if (!(f instanceof TFile)) {
                await this.handleProjectFolderMutation(f.path);
                return;
            }
            if (this.index.isThoughtFile(f.path)) {
                await this.index.indexThoughtFile(f);
                if (!this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                    this.getThoughtController().syncIndexedThought(f.path);
                }
            }
            else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f);
            else if (this.index.isDueFile(f.path)) this.index.indexDueFile(f);
            else if (this.index.isProjectFile(f.path)) await this.index.indexProjectFile(f);
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('modify', async (f) => {
            const scope = this.getRefreshScopeForPath(f.path);
            if (!scope) {
                if (!(f instanceof TFile)) await this.handleProjectFolderMutation(f.path);
                return;
            }
            if (!(f instanceof TFile)) {
                await this.handleProjectFolderMutation(f.path);
                return;
            }
            await this.refreshCoordinator.reindexFile(f);
            if (this.index.isThoughtFile(f.path) && !this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                this.getThoughtController().syncIndexedThought(f.path);
            }
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('delete', async (f) => {
            const scope = this.getRefreshScopeForPath(f.path);
            if (!scope) {
                if (!(f instanceof TFile)) await this.handleProjectFolderMutation(f.path);
                return;
            }
            this.getThoughtController().removeThoughtFromIndex(f.path);
            this.index.taskIndex.delete(f.path);
            if (this.index.isDueFile(f.path)) this.index.removeDueFile(f.path);
            if (this.index.isProjectFile(f.path)) this.index.removeProjectFile(f.path);
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
            const scope = this.mergeRefreshScopes(
                this.getRefreshScopeForPath(oldPath),
                this.getRefreshScopeForPath(f.path),
            );
            if (!scope) {
                if (!(f instanceof TFile)) await this.handleProjectFolderMutation(oldPath, f.path);
                return;
            }
            if (!(f instanceof TFile)) {
                await this.handleProjectFolderMutation(oldPath, f.path);
                return;
            }
            this.getThoughtController().removeThoughtFromIndex(oldPath);
            this.index.taskIndex.delete(oldPath);
            if (this.index.isDueFile(oldPath)) this.index.removeDueFile(oldPath, true);
            if (this.index.isProjectFile(oldPath)) this.index.removeProjectFile(oldPath);
            if (this.index.isThoughtFile(f.path)) {
                await this.index.indexThoughtFile(f);
                if (!this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                    this.getThoughtController().syncIndexedThought(f.path);
                }
            }
            else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f);
            else if (this.index.isDueFile(f.path)) this.index.indexDueFile(f, true);
            else if (this.index.isProjectFile(f.path)) await this.index.indexProjectFile(f);
            if (this.index.isDueFile(oldPath) || this.index.isDueFile(f.path)) this.index.rebuildCalculatedState();
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
            const scope = this.getRefreshScopeForPath(file.path);
            if (!scope) return;
            await this.refreshCoordinator.reindexFile(file);
            if (this.index.isThoughtFile(file.path) && !this.getThoughtController().isUpdatingThoughtPath(file.path)) {
                this.getThoughtController().syncIndexedThought(file.path);
            }
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.scheduleResponsiveHubReconciliation();
        }));
        this.registerDomEvent(window, 'resize', () => {
            this.applyDeviceBodyClasses();
            this.scheduleResponsiveHubReconciliation();
        });
    }

    private scheduleResponsiveHubReconciliation(delay = 100): void {
        if (this.unloading) return;
        this.clearResponsiveHubReconcileTimer();
        this.responsiveHubReconcileTimer = window.setTimeout(() => {
            this.responsiveHubReconcileTimer = null;
            void this.reconcileResponsiveHubLeaves();
        }, delay);
    }

    private async reconcileResponsiveHubLeaves(): Promise<void> {
        if (this.unloading || this.reconcilingResponsiveHubLeaves) return;
        const targetViewType = !Platform.isMobile
            ? VIEW_TYPE_DESKTOP_HUB
            : isTablet()
                ? VIEW_TYPE_TABLET_HUB
                : VIEW_TYPE_MOBILE_HUB;
        const leavesToConvert = targetViewType === VIEW_TYPE_DESKTOP_HUB
            ? [
                ...this.app.workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB),
                ...this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB),
            ]
            : targetViewType === VIEW_TYPE_TABLET_HUB
                ? this.app.workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB)
                : this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB);
        if (leavesToConvert.length === 0) return;

        this.reconcilingResponsiveHubLeaves = true;
        try {
            for (const leaf of leavesToConvert) {
                await this.setLeafViewType(leaf, targetViewType, false);
            }
        } finally {
            this.reconcilingResponsiveHubLeaves = false;
        }
    }

    private async setLeafViewType(leaf: WorkspaceLeaf, type: string, active: boolean): Promise<void> {
        const currentState = leaf.getViewState();
        await leaf.setViewState({
            ...currentState,
            type,
            active,
            state: currentState.state && typeof currentState.state === 'object' ? { ...currentState.state } : currentState.state,
        });
    }

    private async migrateLegacyMobileGawaLeaves(startupToken?: number): Promise<void> {
        if (startupToken !== undefined && !this.isStartupRunActive(startupToken)) return;
        const leaves = this.app.workspace.getLeavesOfType('diwa-mobile-gawa');
        if (leaves.length === 0) return;
        if (startupToken !== undefined && !this.isStartupRunActive(startupToken)) return;
        await Promise.all(leaves.map((leaf) => leaf.setViewState({
            type: VIEW_TYPE_DIWA,
            active: false,
            state: { activeTab: 'review-gawa', isDedicated: false },
        })));
    }

    async activateGawa() {
        await this.activateView('review-gawa');
    }

    async activateBulsa() {
        await this.activateView('dues');
    }

    async activateJournalInput() {
        this.pendingJournalInputFocus = Platform.isMobile && !isTablet();
        await this.activateView('journal');
    }

    consumeJournalInputFocusRequest(): boolean {
        const pending = this.pendingJournalInputFocus;
        this.pendingJournalInputFocus = false;
        return pending;
    }

    private normalizeDiwaTabId(tabId?: string | null): string {
        const requestedTab = tabId ?? 'home';
        const nextTab = REMOVED_DIWA_TAB_FALLBACKS[requestedTab] ?? requestedTab;
        return OPENABLE_DIWA_TAB_IDS.has(nextTab) ? nextTab : DEFAULT_OPENABLE_DIWA_TAB_ID;
    }

    async activateView(tabId?: string, isDedicated: boolean = false) {
        const { workspace } = this.app;
        const targetTab = this.normalizeDiwaTabId(tabId);
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DIWA);
        let targetLeaf: WorkspaceLeaf | null = null;
        for (const leaf of leaves) {
            const view = leaf.view as DiwaView;
            if (view && view.isDedicated === isDedicated && view.activeTab === targetTab) { targetLeaf = leaf; break; }
        }
        if (!targetLeaf && isDedicated && !Platform.isMobile) {
            for (const leaf of leaves) {
                const view = leaf.view as DiwaView;
                if (view && view.isDedicated) {
                    targetLeaf = leaf;
                    break;
                }
            }
        }
        // On mobile, reuse any existing MINA leaf rather than opening a new tab
        if (!targetLeaf && Platform.isMobile && leaves.length > 0) {
            targetLeaf = leaves[0];
        }
        if (!targetLeaf) targetLeaf = Platform.isMobile ? workspace.getLeaf(false) : workspace.getLeaf('window');
        if (targetLeaf) {
            await targetLeaf.setViewState({ type: VIEW_TYPE_DIWA, active: true, state: { activeTab: targetTab, isDedicated } });
            workspace.revealLeaf(targetLeaf);
        }
    }

    async scanForContexts(startupToken?: number) {
        const foundContexts = await this.index.scanForContexts();
        if (startupToken !== undefined && !this.isStartupRunActive(startupToken)) return;
        let newCtx = false;
        foundContexts.forEach(c => { if (c && typeof c === 'string' && !this.settings.contexts.includes(c)) { this.settings.contexts.push(c); newCtx = true; } });
        if (newCtx && (startupToken === undefined || this.isStartupRunActive(startupToken))) await this.saveSettings();
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        if (loadedData) Object.assign(this.settings, loadedData);
        let shouldPersistSanitizedSettings = false;
        const hadLegacyLifeMission = Object.prototype.hasOwnProperty.call(this.settings, 'lifeMission');
        if (hadLegacyLifeMission) {
            delete (this.settings as unknown as { lifeMission?: unknown }).lifeMission;
            shouldPersistSanitizedSettings = true;
        }
        const legacySettings = this.settings as DiwaSettings & {
            voiceMemoFolder?: string;
            transcriptionLanguage?: string;
            geminiApiKey?: string;
            geminiModel?: string;
            maxOutputTokens?: number;
            aiChatFolder?: string;
            enableAutoClassification?: boolean;
            ai?: unknown;
        };
        const removedLegacyKeys = ['voiceMemoFolder', 'transcriptionLanguage', 'geminiApiKey', 'geminiModel', 'maxOutputTokens', 'aiChatFolder', 'enableAutoClassification', 'ai'] as const;
        for (const key of removedLegacyKeys) {
            if (Object.prototype.hasOwnProperty.call(legacySettings, key)) {
                delete legacySettings[key];
                shouldPersistSanitizedSettings = true;
            }
        }
        // Sanitize: remove null/non-string entries that can creep in from malformed YAML frontmatter
        if (this.settings.contexts) {
            const sanitizedContexts = this.settings.contexts.filter((c: any) => c && typeof c === 'string');
            if (sanitizedContexts.length !== this.settings.contexts.length) {
                shouldPersistSanitizedSettings = true;
            }
            this.settings.contexts = sanitizedContexts;
        }
        if (!Array.isArray(this.settings.hiddenContexts)) {
            this.settings.hiddenContexts = [];
            shouldPersistSanitizedSettings = true;
        }
        const mobileBottomBarHeight = Number(this.settings.mobileBottomBarHeight);
        const sanitizedMobileBottomBarHeight = Number.isFinite(mobileBottomBarHeight)
            ? Math.max(0, Math.min(100, mobileBottomBarHeight))
            : 56;
        if (sanitizedMobileBottomBarHeight !== this.settings.mobileBottomBarHeight) {
            shouldPersistSanitizedSettings = true;
        }
        this.settings.mobileBottomBarHeight = sanitizedMobileBottomBarHeight;
        const sanitizedGawaLayoutPreferences = sanitizeGawaLayoutPreferences(this.settings.gawaLayoutPreferences);
        if (JSON.stringify(sanitizedGawaLayoutPreferences) !== JSON.stringify(this.settings.gawaLayoutPreferences)) {
            shouldPersistSanitizedSettings = true;
        }
        this.settings.gawaLayoutPreferences = sanitizedGawaLayoutPreferences;
        this.settingsInitialized = true;
        if (shouldPersistSanitizedSettings) {
            await this.saveData(this.settings);
        }
	}

	async saveSettings() {
	    if (!this.settingsInitialized) return;
        this.settings.gawaLayoutPreferences = sanitizeGawaLayoutPreferences(this.settings.gawaLayoutPreferences);
	    await this.saveData(this.settings);
	    if (this.vault) this.vault.updateSettings(this.settings);
	    if (this.index) this.index.updateSettings(this.settings);
	    if (this.taskLink) this.taskLink.updateSettings(this.settings);
	    if (this.taskReflection) this.taskReflection.updateSettings(this.settings);
	    if (this.refreshCoordinator) this.refreshCoordinator.updateSettings(this.settings);
        this.applyMobileCssVars();
        const shouldRefreshTasks = this.index?.tasksFolderChanged() ?? false;
        const shouldRefreshThoughts = this.index?.thoughtsFolderChanged() ?? false;
        const shouldRefreshDues = this.index?.dueFolderChanged() ?? false;
        const shouldRefreshChecklist = this.index?.captureLocationChanged() ?? false;
        const shouldRefreshProjects = this.index?.projectsFolderChanged() ?? false;
        const shouldRefreshIndexedState = shouldRefreshTasks
            || shouldRefreshThoughts
            || shouldRefreshDues
            || shouldRefreshChecklist
            || shouldRefreshProjects;

        if (!this.index || !shouldRefreshIndexedState) return;

        await Promise.all([
            shouldRefreshTasks ? this.index.buildTaskIndex() : Promise.resolve(),
            shouldRefreshThoughts ? this.index.buildThoughtIndex() : Promise.resolve(),
            shouldRefreshDues ? this.index.buildDueIndex() : Promise.resolve(),
            shouldRefreshChecklist ? this.index.buildChecklistIndex() : Promise.resolve(),
            shouldRefreshProjects ? this.index.buildProjectIndex() : Promise.resolve(),
        ]);

        this.index.rebuildCalculatedState();

        if (shouldRefreshTasks) {
            const normalizedTasks = this.normalizeIndexedTasks(Array.from(this.index.taskIndex.values()));
            this.taskIndex.set(normalizedTasks);
            this.controller?.syncFromIndex();
            this.refreshOpenTaskPanes();
        }

        if (shouldRefreshThoughts) {
            const thoughtController = this.getThoughtController();
            thoughtController.beginIndexing();
            thoughtController.hydrateFromIndex(Array.from(this.index.thoughtIndex.values()), { force: true });
            thoughtController.endIndexing();
        }

        const refreshScope: RefreshScope = shouldRefreshTasks
            && !shouldRefreshThoughts
            && !shouldRefreshDues
            && !shouldRefreshChecklist
            && !shouldRefreshProjects
            ? 'tasks'
            : 'all';
        this.notifyRefresh(refreshScope);
	}

    async updateSetting<K extends keyof DiwaSettings>(
        key: K,
        value: DiwaSettings[K],
        refreshScope?: RefreshScope,
    ): Promise<void> {
        this.settings[key] = value;
        await this.saveSettings();
        if (refreshScope) this.notifyRefresh(refreshScope);
    }

    async saveGawaLayoutPreferences(preferences: GawaLayoutPreferences): Promise<void> {
        this.settings.gawaLayoutPreferences = sanitizeGawaLayoutPreferences(preferences);
        await this.saveSettings();
        this.forceGawaLayoutRefresh();
    }

    forceGawaLayoutRefresh(): void {
        const diwaLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
        for (const leaf of diwaLeaves) {
            const view = leaf.view as any;
            if (typeof view?.forceGawaRerender === 'function') {
                view.forceGawaRerender();
                continue;
            }
            if (typeof view?.renderView === 'function') view.renderView();
        }
    }

    private applyMobileCssVars(): void {
        const value = Number.isFinite(this.settings.mobileBottomBarHeight)
            ? Math.max(0, Math.min(100, this.settings.mobileBottomBarHeight))
            : 56;
        document.documentElement.style.setProperty('--diwa-host-bottombar', `${value}px`);
    }

    /** Apply explicit device-mode body classes for clean CSS targeting.
     *  Architecture: phone → .is-mobile only
     *                tablet → .is-mobile + .is-tablet (Obsidian sets is-mobile for all mobile)
     *                desktop → .is-desktop
     *  body.is-tablet lets .is-tablet CSS rules override .is-mobile rules for tablets. */
    private applyDeviceBodyClasses(): void {
        const tablet = isTablet();
        document.body.toggleClass('is-tablet', tablet);
        document.body.toggleClass('is-desktop', !Platform.isMobile);
    }

	notifyRefresh(scope: RefreshScope = 'all'): void {
	    this.refreshCoordinator.notifyRefresh(scope);
	}

    private normalizeIndexedTasks(tasks: TaskEntry[]): TaskEntry[] {
        return tasks.map((task) => {
            const id = task.id || task.taskId || task.filePath;
            const title = task.title || task.body || 'Untitled task';
            const rawStatus = String(task.status || task.state || 'backlog').toLowerCase();
            const status: TaskEntry['status'] =
                rawStatus === 'done'
                    ? 'done'
                    : rawStatus === 'active' || rawStatus === 'waiting'
                        ? 'waiting'
                        : rawStatus === 'someday'
                            ? 'someday'
                            : 'open';
            const bucketStatus = task.bucketStatus
                ?? (status === 'done' ? 'done' : (status === 'waiting' ? 'active' : 'backlog'));
            const state = task.state
                ?? (bucketStatus === 'done' ? 'done' : (bucketStatus === 'active' ? 'active' : 'backlog'));
            return {
                ...task,
                id,
                title,
                status,
                state,
                bucketStatus,
                focus: !!task.focus,
                links: task.links ?? { thoughts: [] },
            };
        });
    }

    private refreshOpenTaskPanes(): void {
        const diwaLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
        for (const leaf of diwaLeaves) {
            const view = leaf.view as any;
            if (typeof view?.refreshTasks === 'function') view.refreshTasks();
            else if (typeof view?.renderView === 'function') view.renderView();
        }

        const desktopLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
        for (const leaf of desktopLeaves) {
            const view = leaf.view as any;
            if (typeof view?.updateTaskPaneFromIndex === 'function') view.updateTaskPaneFromIndex();
            else if (typeof view?.renderView === 'function') view.renderView();
        }
    }

    private logTaskControllerPanes(): void {
        console.log('Controller panes:', this.controller?.panes ?? []);
    }

    private joinVaultPath(folder: string, fileName: string): string {
        const normalizedFolder = folder.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
        const normalizedFileName = fileName.replace(/\\/g, '/').trim().replace(/^\/+/, '');
        if (!normalizedFolder) return normalizedFileName;
        return normalizedFileName ? `${normalizedFolder}/${normalizedFileName}` : normalizedFolder;
    }

    private isLegacyCaptureDateCell(value: string): boolean {
        const normalized = value.trim().replace(/^\[\[|\]\]$/g, '');
        return /^\d{4}-\d{2}-\d{2}$/.test(normalized) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized);
    }

    private extractLegacyTableRows(content: string, isTask: boolean): Array<{ text: string; contexts: string[]; due?: string }> {
        const rows: Array<{ text: string; contexts: string[]; due?: string }> = [];
        const lines = content.split('\n').filter((line) => line.trim().startsWith('|'));

        for (const line of lines) {
            const cells = line
                .split('|')
                .slice(1, -1)
                .map((part) => part.trim());
            if (cells.length < 8) continue;
            if (cells.every((cell) => !cell || /^:?-{3,}:?$/.test(cell))) continue;
            if (!this.isLegacyCaptureDateCell(cells[0] ?? '')) continue;

            const text = (cells[6] ?? '').replace(/<br>/g, '\n').trim();
            if (!text) continue;

            const contexts = Array.from((cells[7] ?? '').matchAll(/#[^#\s|]+/g)).map((match) => match[0].substring(1));
            const due = (cells[5] ?? '').replace(/^\[\[|\]\]$/g, '').trim();
            rows.push({
                text,
                contexts,
                due: isTask && due ? due : undefined,
            });
        }

        return rows;
    }

    private async rebuildProjectIndexAndRefresh(): Promise<void> {
        await this.index.buildProjectIndex();
        this.notifyRefresh('all');
    }

    private async handleProjectFolderMutation(...paths: string[]): Promise<boolean> {
        if (!paths.some((path) => path && this.index.pathAffectsProjectsFolder(path))) return false;
        await this.rebuildProjectIndexAndRefresh();
        return true;
    }

    private getRefreshScopeForPath(path: string): RefreshScope | null {
        if (this.index.isTaskFile(path)) return 'tasks';
        if (this.index.isThoughtFile(path)) return 'thoughts';
        if (this.index.isProjectFile(path)) return 'all';
        if (this.index.isDueFile(path)) return 'all';

        if (normalizeVaultRelativePath(path, 'path') === getCanonicalCapturePath(this.settings)) return 'all';

        return null;
    }

    private mergeRefreshScopes(a: RefreshScope | null, b: RefreshScope | null): RefreshScope | null {
        if (!a) return b;
        if (!b || a === b) return a;
        return 'all';
    }

    getProjects(): string[] {
        return this.index ? this.index.getProjects() : [];
    }

    openCaptureModal(): void {
        if (Platform.isMobile && !isTablet()) {
            new MobilePostComposerModal(this.app, this).open();
            return;
        }

        new EditEntryModal(
            this.app,
            this,
            '',
            '',
            null,
            false,
            async (text, contexts) => {
                const content = text.trim();
                if (!content) return;
                await this.getThoughtController().addThought({
                    content,
                    context: parseContextString(contexts),
                });
            },
            'Capture',
        ).open();
    }

    getAllTasks(): TaskEntry[] {
        const tasks = this.getTaskController().getAllTasks().slice();
        tasks.sort((left, right) => (right.modified || '').localeCompare(left.modified || ''));
        return tasks;
    }

    getTodayFocusTasks(limit?: number): TaskEntry[] {
        if (!this.services?.focus) {
            this.services = {
                focus: new FocusService({
                    getAllTasks: () => this.getAllTasks(),
                }),
            };
        }
        return this.services.focus.getTodayFocus({
            limit,
        });
    }

    getTopTasks(limit = 3): TaskEntry[] {
        return this.getTodayFocusTasks(limit);
    }

    getAllThoughts(): ThoughtEntry[] {
        const thoughts = this.getThoughtController()
            .getAllThoughts()
            .filter((thought) => !thought.archived);
        thoughts.sort((left, right) => (right.modified || '').localeCompare(left.modified || ''));
        return thoughts;
    }

    getContexts(): string[] {
        const contexts = (this.settings.contexts ?? [])
            .map((ctx) => String(ctx || '').trim())
            .filter(Boolean);
        return Array.from(new Set(contexts)).sort((left, right) => left.localeCompare(right));
    }

    renderTaskRow(
        parent: HTMLElement,
        task: TaskEntry,
        options: { mobile?: boolean; compact?: boolean } = {},
    ): HTMLElement {
        const taskId = task.taskId?.trim() || task.filePath;
        const done = task.status === 'done'
            || task.state === 'done'
            || task.bucketStatus === 'done'
            || task.lifecycleStatus === 'done'
            || !!task.completedAt;
        const row = parent.createDiv('diwa-task-row diwa-task-row--mobile');
        if (done) row.addClass('is-done');
        if (options.compact) row.addClass('is-compact');

        const toggleBtn = row.createEl('button', {
            cls: 'diwa-task-cb',
            attr: {
                type: 'button',
                role: 'checkbox',
                'aria-checked': done ? 'true' : 'false',
                'aria-label': done ? 'Mark task as open' : 'Mark task as done',
            },
        });
        const renderCheckboxState = (isDone: boolean): void => {
            toggleBtn.empty();
            toggleBtn.setAttr('aria-checked', isDone ? 'true' : 'false');
            toggleBtn.toggleClass('is-checked', isDone);
            if (!isDone) return;
            const checkIcon = toggleBtn.createSpan('diwa-task-cb-icon');
            setIcon(checkIcon, 'check');
        };
        renderCheckboxState(done);

        toggleBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextDone = !row.hasClass('is-done');
            row.toggleClass('is-done', nextDone);
            renderCheckboxState(nextDone);
            const ok = await this.getTaskController().toggleTask(taskId);
            if (!ok) {
                row.toggleClass('is-done', done);
                renderCheckboxState(done);
            }
            this.notifyRefresh('tasks');
        });

        const main = row.createDiv('diwa-task-body');
        const title = (task.title || task.body || 'Untitled task').trim();
        main.createDiv({ cls: 'diwa-task-title', text: title });
        if (!options.compact) {
            const meta = main.createDiv('diwa-task-meta');
            if (done) meta.createDiv({ cls: 'diwa-chip is-done', text: 'Done' });
            if (task.due?.trim()) {
                meta.createDiv({ cls: 'diwa-chip', text: `Due ${task.due.trim()}` });
            }
            if (task.context?.length) {
                task.context
                    .map((ctx) => String(ctx || '').trim())
                    .filter(Boolean)
                    .forEach((ctx) => {
                        meta.createDiv({ cls: 'diwa-chip', text: `#${ctx}` });
                    });
            }
        }

        row.addEventListener('click', async () => {
            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            }
        });

        return row;
    }

    renderThoughtCard(
        parent: HTMLElement,
        thought: ThoughtEntry,
        options: { mobile?: boolean } = {},
    ): HTMLElement {
        const card = parent.createDiv('diwa-thought-card');
        const contentEl = card.createDiv('diwa-thought-content');
        const content = (thought.body || thought.content || thought.title || '').trim();
        this.scheduleThoughtContentRender(contentEl, content, thought, this.getThoughtRenderCacheKey(thought, content));
        this.attachThoughtLongPress(card, thought);
        if (options.mobile) card.addClass('is-mobile');
        return card;
    }

    private scheduleThoughtContentRender(el: HTMLElement, content: string, thought: ThoughtEntry, cacheKey: string): void {
        const token = (this.thoughtRenderTokens.get(el) ?? 0) + 1;
        this.thoughtRenderTokens.set(el, token);
        const existingTimer = this.scheduledThoughtRenderTimers.get(el);
        if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
        }
        const timer = window.setTimeout(() => {
            this.scheduledThoughtRenderTimers.delete(el);
            void this.renderThoughtContent(el, content, thought, token, cacheKey);
        }, 0);
        this.scheduledThoughtRenderTimers.set(el, timer);
    }

    private async renderThoughtContent(
        el: HTMLElement,
        content: string,
        thought: ThoughtEntry,
        token: number,
        cacheKey: string,
    ): Promise<void> {
        if (this.unloading || !el.isConnected || this.thoughtRenderTokens.get(el) !== token) return;
        const cached = this.thoughtContentRenderCache.get(cacheKey);
        if (cached) {
            el.replaceChildren(...Array.from(cached.cloneNode(true).childNodes));
            enableImageZoom(this.app, el);
            return;
        }
        const stagedEl = document.createElement('div');
        await MarkdownRenderer.render(this.app, content, stagedEl, thought.filePath || '', this);
        if (this.unloading || !el.isConnected || this.thoughtRenderTokens.get(el) !== token) return;
        this.cacheThoughtContentRender(cacheKey, stagedEl);
        el.replaceChildren(...Array.from(stagedEl.childNodes));
        enableImageZoom(this.app, el);
    }

    private getThoughtRenderCacheKey(thought: ThoughtEntry, content: string): string {
        return [
            thought.id || thought.filePath || thought.title || 'thought',
            thought.filePath || '',
            thought.modified || '',
            thought.updatedAt || '',
            content,
        ].join('::');
    }

    private cacheThoughtContentRender(cacheKey: string, stagedEl: HTMLElement): void {
        this.thoughtContentRenderCache.set(cacheKey, stagedEl.cloneNode(true) as HTMLElement);
        while (this.thoughtContentRenderCache.size > 200) {
            const oldestKey = this.thoughtContentRenderCache.keys().next().value;
            if (!oldestKey) break;
            this.thoughtContentRenderCache.delete(oldestKey);
        }
    }

    private attachThoughtLongPress(cardEl: HTMLElement, thought: ThoughtEntry): void {
        let pressTimer: number | null = null;

        const isLinkTarget = (event: Event): boolean => {
            const target = event.target as HTMLElement | null;
            return !!target?.closest('a');
        };

        const start = (event: TouchEvent) => {
            if (isLinkTarget(event)) return;
            pressTimer = window.setTimeout(() => {
                pressTimer = null;
                this.openThoughtActionMenu(thought);
            }, 450);
        };

        const cancel = () => {
            if (pressTimer !== null) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        cardEl.addEventListener('touchstart', start, { passive: true });
        cardEl.addEventListener('touchend', cancel);
        cardEl.addEventListener('touchmove', cancel, { passive: true });
        cardEl.addEventListener('touchcancel', cancel);
        cardEl.addEventListener('contextmenu', (event) => {
            if (isLinkTarget(event)) return;
            event.preventDefault();
            this.openThoughtActionMenu(thought);
        });
    }

    private openThoughtActionMenu(thought: ThoughtEntry): void {
        const menu = new Menu();
        menu.addItem((item) =>
            item
                .setTitle('Open Note')
                .setIcon('link')
                .onClick(() => { void this.openThoughtNote(thought); }),
        );
        menu.addItem((item) =>
            item
                .setTitle('Edit')
                .setIcon('pencil')
                .onClick(() => this.editThought(thought)),
        );
        menu.addItem((item) =>
            item
                .setTitle('Convert to Task')
                .setIcon('check-square')
                .onClick(() => {
                    void this.handleConvertThought(thought);
                }),
        );
        menu.addItem((item) =>
            item
                .setTitle('Convert & Edit')
                .setIcon('pencil')
                .onClick(() => {
                    void this.handleConvertThought(thought, true);
                }),
        );
        menu.addItem((item) =>
            item
                .setTitle('Archive')
                .setIcon('archive')
                .onClick(() => { void this.archiveThought(thought); }),
        );
        menu.addItem((item) =>
            item
                .setTitle('Delete')
                .setIcon('trash')
                .onClick(() => this.deleteThought(thought)),
        );
        menu.showAtPosition({
            x: Math.round(window.innerWidth / 2),
            y: Math.round(window.innerHeight - 100),
        });
    }

    private async handleConvertThought(thought: ThoughtEntry, openEditor = false): Promise<void> {
        const thoughtId = (thought.id || thought.filePath || '').trim();
        if (!thoughtId) {
            console.error('[DIWA] Cannot convert thought: missing thought id/path', thought);
            return;
        }

        const controller = this.getTaskController();
        console.debug('[DIWA] Converting thought -> task', thoughtId);

        try {
            const ok = await controller.convertThoughtToTask(thoughtId);
            if (!ok) {
                return;
            }
            if (openEditor) {
                this.openConvertedTaskEditor(thoughtId);
            }
            this.notifyRefresh('all');
        } catch (error) {
            console.error(error);
        }
    }

    private openConvertedTaskEditor(thoughtId: string): void {
        const linked = this.getTaskController().getLinkedTasksForThought(thoughtId).slice();
        if (linked.length === 0) return;
        linked.sort((left, right) => (right.modified || '').localeCompare(left.modified || ''));
        const task = linked[0];
        new EditTaskModal(
            this.app,
            task,
            this.vault,
            this.index,
            () => {
                void this.getTaskController().reconcileTask(task.filePath, undefined, task);
            },
        ).open();
    }

    private async openThoughtNote(thought: ThoughtEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(thought.filePath);
        if (!(file instanceof TFile)) return;
        await this.app.workspace.getLeaf(false).openFile(file);
    }

    editThought(thought: ThoughtEntry): void {
        const content = (thought.body || thought.content || '').trim();
        if (Platform.isMobile && !isTablet()) {
            new MobilePostComposerModal(this.app, this, {
                editFilePath: thought.filePath,
                text: content,
                contexts: thought.context ?? [],
                topic: thought.topic,
            }).open();
            return;
        }

        new EditThoughtModal(this.app, this, thought).open();
    }

    private async archiveThought(thought: ThoughtEntry): Promise<void> {
        const thoughtId = thought.id || thought.filePath;
        await this.getThoughtController().setArchived(thoughtId, true);
        this.notifyRefresh('thoughts');
    }

    private deleteThought(thought: ThoughtEntry): void {
        new ConfirmModal(this.app, 'Delete this thought?', async () => {
            await this.vault.deleteFile(thought.filePath, 'thoughts');
            this.getThoughtController().removeThoughtFromIndex(thought.filePath);
            this.notifyRefresh('thoughts');
        }).open();
    }
}

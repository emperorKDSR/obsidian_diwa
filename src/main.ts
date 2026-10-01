import { Plugin, TFile, Notice, WorkspaceLeaf, Platform, moment, addIcon, setIcon, MarkdownRenderer, Menu } from 'obsidian';
import { KATANA_ICON_ID, KATANA_ICON_SVG, DEFAULT_SETTINGS, DAILY_ICON_ID, DAILY_ICON_SVG, GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG, TASK_ICON_ID, TASK_ICON_SVG, PF_ICON_ID, PF_ICON_SVG, SETTINGS_ICON_ID, SETTINGS_ICON_SVG, REVIEW_ICON_ID, REVIEW_ICON_SVG, VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB, DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG } from './constants';
import { DiwaSettings, TaskEntry, ThoughtEntry } from './types';
import { isTablet, parseContextString } from './utils';
import { DesktopHubView } from './views/DesktopHubView';
import { DiwaSettingTab } from './settings';
import { EditEntryModal } from './modals/EditEntryModal';
import { EditThoughtModal } from './modals/EditThoughtModal';
import { EditTaskModal } from './modals/EditTaskModal';
import { MobilePostComposerModal } from './modals/MobilePostComposerModal';
import { ConfirmModal } from './modals/ConfirmModal';

import { VaultService } from './services/VaultService';
import { IndexService } from './services/IndexService';
import { CaptureService } from './services/CaptureService';
import { TaskLinkService } from './services/TaskLinkService';
import { TaskReflectionService } from './services/TaskReflectionService';
import { FocusService } from './services/FocusService';
import { RefreshCoordinator, type RefreshScope } from './application/RefreshCoordinator';
import { TaskController } from './views/TaskController';
import { ThoughtController } from './views/ThoughtController';
import { ThoughtProcessor } from './views/ThoughtProcessor';
import { enableImageZoom } from './utils/imageZoom';
import { getCanonicalCapturePath, getCanonicalLegacyTasksCapturePath } from './utils/settingsPaths';
import { normalizeVaultRelativePath } from './utils/vaultFiles';

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
    private unloading = false;
    private startupRunToken = 0;
    private legacyMigrationTimer: number | null = null;
    private responsiveHubReconcileTimer: number | null = null;
    private reactiveRuntimeEventsRegistered = false;
    private reconcilingResponsiveHubLeaves = false;
    private globalDomStateCaptured = false;
    private initialHostBottomBarInlineValue: string | null = null;
    private initialBodyHadTabletClass = false;
    private initialBodyHadDesktopClass = false;
    
    // Services
    vault: VaultService;
    index: IndexService;
    capture: CaptureService;
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
        this.capture = new CaptureService(this.app, this.settings);
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
            if (this.unloading) return;
            const startupToken = ++this.startupRunToken;
            this.registerReactiveRuntimeEvents();
            await this.runStartupIndexBuild(startupToken);
        });

        this.registerView(VIEW_TYPE_DESKTOP_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_MOBILE_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_TABLET_HUB, (leaf) => new DesktopHubView(leaf, this));

		addIcon(KATANA_ICON_ID, KATANA_ICON_SVG);
		addIcon(DAILY_ICON_ID, DAILY_ICON_SVG);
		addIcon(GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG);
		addIcon(PF_ICON_ID, PF_ICON_SVG);
		addIcon(REVIEW_ICON_ID, REVIEW_ICON_SVG);
		addIcon(SETTINGS_ICON_ID, SETTINGS_ICON_SVG);
        addIcon(DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG);

        this.addRibbonIcon(DESKTOP_HUB_ICON_ID, 'DIWA Workspace', () => {
            void this.activateWorkspace();
        });

        this.addCommand({
            id: 'diwa-open-workspace',
            name: 'Open DIWA Workspace',
            icon: DESKTOP_HUB_ICON_ID,
            callback: () => { void this.activateWorkspace(); }
        });
        this.addCommand({
            id: 'diwa-surface-important-notes',
            name: 'Surface Important Notes',
            icon: 'star',
            callback: () => { void this.activateWorkspaceWithImportantFilter(); }
        });
        this.addCommand({
            id: 'diwa-toggle-important-active-file',
            name: 'Toggle Important on Current Note',
            icon: 'star',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile instanceof TFile) {
                    if (!checking) {
                        void this.capture.toggleNoteImportance(activeFile.path).then(newState => {
                            new Notice(newState ? 'Marked as Important ⭐' : 'Unmarked from Important');
                            this.notifyRefresh('capture');
                        });
                    }
                    return true;
                }
                return false;
            }
        });
        this.addCommand({
            id: 'diwa-open-scratchpad',
            name: 'Open Continuous Workspace (Mobile/Tablet/Desktop)',
            icon: 'edit',
            callback: () => { void this.activateWorkspace(); }
        });
        this.addCommand({
            id: 'diwa-quick-capture',
            name: 'Quick Capture',
            icon: 'plus',
            callback: () => { void this.activateWorkspace(); }
        });

		this.addSettingTab(new DiwaSettingTab(this.app, this));
        this.scheduleLegacyMigration();
	}

    async onunload() {
        this.unloading = true;
        this.startupRunToken++;
        this.clearLegacyMigrationTimer();
        this.clearResponsiveHubReconcileTimer();
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
        document.body.classList.remove('diwa-hide-mobile-navbar');
    }

    private detachRegisteredLeaves(): void {
        const viewTypes = [VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB];
        for (const vt of viewTypes) {
            for (const leaf of this.app.workspace.getLeavesOfType(vt)) {
                try {
                    leaf.detach();
                } catch (error) {
                    console.warn('[DIWA] failed to detach leaf during unload', error);
                }
            }
        }
    }

    async migrateLegacyTableData() {
        const { vault } = this.app;
        const thoughtsPath = getCanonicalCapturePath(this.settings);
        const tasksPath = getCanonicalLegacyTasksCapturePath(this.settings);
        const migrateFile = async (path: string, isTask: boolean): Promise<number> => {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return 0;
            const content = await vault.read(file);
            const rows = this.extractLegacyTableRows(content, isTask);
            if (rows.length === 0) return 0;

            const remainingExistingMatches = this.buildExistingLegacyMigrationCounts(isTask);
            let migratedRows = 0;

            for (const row of rows) {
                const fingerprint = this.buildLegacyMigrationFingerprint(row, isTask);
                const existingMatches = remainingExistingMatches.get(fingerprint) ?? 0;
                if (existingMatches > 0) {
                    remainingExistingMatches.set(fingerprint, existingMatches - 1);
                    continue;
                }

                if (isTask) {
                    await this.vault.createTaskFile(row.text, row.contexts, row.due);
                } else {
                    const migratedThought = await this.getThoughtController().addThought({ content: row.text, context: row.contexts });
                    if (!migratedThought) {
                        throw new Error('Failed to migrate legacy thought row');
                    }
                }

                migratedRows++;
            }

            await vault.rename(file, path + '.bak');
            return migratedRows;
        };

        await migrateFile(thoughtsPath, false);
        await migrateFile(tasksPath, true);
        this.settings.legacyMigrated = true;
        await this.saveSettings();
    }

    async activateWorkspace() {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB)
            .concat(workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB))
            .concat(workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB));
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = Platform.isDesktop ? workspace.getLeaf('tab') : workspace.getLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_DESKTOP_HUB, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    async activateWorkspaceWithImportantFilter() {
        await this.activateWorkspace();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
        if (leaves.length > 0) {
            const view = leaves[0].view as DesktopHubView;
            if (view && typeof view.showImportantFilter === 'function') {
                view.showImportantFilter();
            }
        }
    }

    async activateDesktopHub() {
        await this.activateWorkspace();
    }

    async activateMobileHub() {
        await this.activateWorkspace();
    }

    async activateTabletHub() {
        await this.activateWorkspace();
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
            if (!scope || !(f instanceof TFile)) return;
            if (this.index.isCaptureFile(f.path)) {
                await this.index.indexCaptureFile(f);
            }
            else if (this.index.isThoughtFile(f.path)) {
                await this.index.indexThoughtFile(f);
                if (!this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                    this.getThoughtController().syncIndexedThought(f.path);
                }
            }
            else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f);
            else if (this.index.isDueFile(f.path)) this.index.indexDueFile(f);
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('modify', async (f) => {
            const scope = this.getRefreshScopeForPath(f.path);
            if (!scope || !(f instanceof TFile)) return;
            await this.refreshCoordinator.reindexFile(f);
            if (this.index.isThoughtFile(f.path) && !this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                this.getThoughtController().syncIndexedThought(f.path);
            }
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('delete', async (f) => {
            const scope = this.getRefreshScopeForPath(f.path);
            if (!scope) return;
            if (this.index.isCaptureFile(f.path)) this.index.removeCaptureFile(f.path);
            this.getThoughtController().removeThoughtFromIndex(f.path);
            this.index.removeTaskFile(f.path);
            if (this.index.isDueFile(f.path)) this.index.removeDueFile(f.path);
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
            const scope = this.mergeRefreshScopes(
                this.getRefreshScopeForPath(oldPath),
                this.getRefreshScopeForPath(f.path),
            );
            if (!scope || !(f instanceof TFile)) return;
            if (this.index.isCaptureFile(oldPath)) this.index.removeCaptureFile(oldPath);
            if (this.index.isCaptureFile(f.path)) await this.index.indexCaptureFile(f);
            this.getThoughtController().removeThoughtFromIndex(oldPath);
            const removedTask = this.index.removeTaskFile(oldPath, true);
            if (this.index.isDueFile(oldPath)) this.index.removeDueFile(oldPath, true);
            if (this.index.isThoughtFile(f.path)) {
                await this.index.indexThoughtFile(f);
                if (!this.getThoughtController().isUpdatingThoughtPath(f.path)) {
                    this.getThoughtController().syncIndexedThought(f.path);
                }
            }
            else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f);
            else if (this.index.isDueFile(f.path)) this.index.indexDueFile(f, true);
            if (
                (removedTask && !this.index.isTaskFile(f.path))
                || this.index.isDueFile(oldPath)
                || this.index.isDueFile(f.path)
            ) {
                this.index.rebuildCalculatedState();
            }
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
            const scope = this.getRefreshScopeForPath(file.path);
            if (!scope) return;
            await this.refreshCoordinator.reindexFile(file, true);
            if (this.index.isThoughtFile(file.path) && !this.getThoughtController().isUpdatingThoughtPath(file.path)) {
                this.getThoughtController().syncIndexedThought(file.path);
            }
            this.notifyRefresh(scope);
        }));

        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            const isDiwaView = leaf?.view?.getViewType() === VIEW_TYPE_DESKTOP_HUB;
            if (isDiwaView) {
                if (this.isMobile() && !isTablet(this.app)) {
                    document.body.classList.add('diwa-hide-mobile-navbar');
                }
            } else {
                document.body.classList.remove('diwa-hide-mobile-navbar');
            }
        }));

        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB)) {
                const view = leaf.view as DesktopHubView;
                if (view && typeof view.onActiveFileChange === 'function') {
                    view.onActiveFileChange(file);
                }
            }
        }));

        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.scheduleResponsiveHubReconciliation();
        }));
        this.registerDomEvent(window, 'resize', () => {
            this.applyDeviceBodyClasses();
            this.scheduleResponsiveHubReconciliation();
        });
    }

    private scheduleResponsiveHubReconciliation(_delay = 100): void {
        // Unified DesktopHubView handles all device sizes
    }

    async activateView(_tabId?: string, _isDedicated: boolean = false) {
        await this.activateWorkspace();
    }

    async scanForContexts(startupToken?: number) {
        const foundContexts = await this.index.scanForContexts();
        if (startupToken !== undefined && !this.isStartupRunActive(startupToken)) return;
        
        let changed = false;
        
        // Add any newly discovered contexts without deleting user-configured settings
        foundContexts.forEach(c => { 
            if (c && typeof c === 'string' && !this.settings.contexts.includes(c)) { 
                this.settings.contexts.push(c); 
                changed = true; 
            } 
        });

        if (changed && (startupToken === undefined || this.isStartupRunActive(startupToken))) {
            await this.saveSettings();
        }
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
            projectsFolder?: string;
            gawaLayoutPreferences?: unknown;
        };
        const removedLegacyKeys = ['voiceMemoFolder', 'transcriptionLanguage', 'geminiApiKey', 'geminiModel', 'maxOutputTokens', 'aiChatFolder', 'enableAutoClassification', 'ai', 'projectsFolder', 'gawaLayoutPreferences'] as const;
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
        this.settingsInitialized = true;
        if (shouldPersistSanitizedSettings) {
            await this.saveData(this.settings);
        }
	}

	async saveSettings() {
	    if (!this.settingsInitialized) return;
	    await this.saveData(this.settings);
	    if (this.vault) this.vault.updateSettings(this.settings);
	    if (this.index) this.index.updateSettings(this.settings);
        if (this.capture) this.capture.updateSettings(this.settings);
	    if (this.taskLink) this.taskLink.updateSettings(this.settings);
	    if (this.taskReflection) this.taskReflection.updateSettings(this.settings);
	    if (this.refreshCoordinator) this.refreshCoordinator.updateSettings(this.settings);
        this.applyMobileCssVars();
        const shouldRefreshCaptures = this.index?.captureFolderChanged() ?? false;
        const shouldRefreshTasks = this.index?.tasksFolderChanged() ?? false;
        const shouldRefreshThoughts = this.index?.thoughtsFolderChanged() ?? false;
        const shouldRefreshDues = this.index?.dueFolderChanged() ?? false;
        const shouldRefreshChecklist = this.index?.captureLocationChanged() ?? false;
        const shouldRefreshIndexedState = shouldRefreshCaptures
            || shouldRefreshTasks
            || shouldRefreshThoughts
            || shouldRefreshDues
            || shouldRefreshChecklist;

        if (!this.index || !shouldRefreshIndexedState) return;

        await this.index.rebuildSelectedIndices({
            captures: shouldRefreshCaptures,
            tasks: shouldRefreshTasks,
            thoughts: shouldRefreshThoughts,
            dues: shouldRefreshDues,
            checklist: shouldRefreshChecklist,
        });

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
            && !shouldRefreshCaptures
            ? 'tasks'
            : (shouldRefreshCaptures && !shouldRefreshTasks && !shouldRefreshThoughts && !shouldRefreshDues && !shouldRefreshChecklist ? 'capture' : 'all');
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

    async updateSettingsBatch(
        patch: Partial<DiwaSettings>,
        refreshScope?: RefreshScope,
    ): Promise<void> {
        let changed = false;
        const applySetting = <K extends keyof DiwaSettings>(key: K, value: DiwaSettings[K]): void => {
            this.settings[key] = value;
            changed = true;
        };
        for (const key of Object.keys(patch) as Array<keyof DiwaSettings>) {
            const value = patch[key];
            if (value === undefined || this.settings[key] === value) continue;
            applySetting(key, value);
        }
        if (!changed) {
            if (refreshScope) this.notifyRefresh(refreshScope);
            return;
        }
        await this.saveSettings();
        if (refreshScope) this.notifyRefresh(refreshScope);
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
        const tablet = isTablet(this.app);
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

    private isLegacyCaptureDateCell(value: string): boolean {
        const normalized = value.trim().replace(/^\[\[|\]\]$/g, '');
        return /^\d{4}-\d{2}-\d{2}$/.test(normalized) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized);
    }

    private buildLegacyMigrationFingerprint(
        row: { text: string; contexts: string[]; due?: string },
        isTask: boolean,
    ): string {
        const normalizedContexts = Array.from(new Set(
            (row.contexts ?? [])
                .map((context) => String(context || '').trim())
                .filter(Boolean),
        )).sort((left, right) => left.localeCompare(right));
        return JSON.stringify({
            kind: isTask ? 'task' : 'thought',
            text: row.text.replace(/\r\n?/g, '\n').trim(),
            contexts: normalizedContexts,
            due: isTask ? (row.due?.trim() ?? '') : '',
        });
    }

    private buildExistingLegacyMigrationCounts(isTask: boolean): Map<string, number> {
        const counts = new Map<string, number>();
        const entries = isTask
            ? this.getAllTasks().map((task) => ({
                text: (task.body || task.title || '').trim(),
                contexts: task.context ?? [],
                due: task.due?.trim() || undefined,
            }))
            : this.getAllThoughts().map((thought) => ({
                text: (thought.body || thought.content || thought.title || '').trim(),
                contexts: thought.context ?? [],
            }));

        for (const entry of entries) {
            const fingerprint = this.buildLegacyMigrationFingerprint(entry, isTask);
            counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
        }

        return counts;
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


    private getRefreshScopeForPath(path: string): RefreshScope | null {
        if (this.index.isCaptureFile(path)) return 'capture';
        if (this.index.isTaskFile(path)) return 'tasks';
        if (this.index.isThoughtFile(path)) return 'thoughts';
        if (this.index.isDueFile(path)) return 'all';

        if (normalizeVaultRelativePath(path, 'path') === getCanonicalCapturePath(this.settings)) return 'all';

        return null;
    }

    private mergeRefreshScopes(a: RefreshScope | null, b: RefreshScope | null): RefreshScope | null {
        if (!a) return b;
        if (!b || a === b) return a;
        return 'all';
    }


    openCaptureModal(): void {
        if (Platform.isMobile && !isTablet(this.app)) {
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
}

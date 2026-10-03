import { Plugin, TFile, Notice, Platform, addIcon } from 'obsidian';
import {
    DEFAULT_SETTINGS,
    VIEW_TYPE_DESKTOP_HUB,
    VIEW_TYPE_MOBILE_HUB,
    VIEW_TYPE_TABLET_HUB,
    VIEW_TYPE_GAWA_COCKPIT,
    DESKTOP_HUB_ICON_ID,
    DESKTOP_HUB_ICON_SVG,
    GAWA_COCKPIT_ICON_ID,
    GAWA_COCKPIT_ICON_SVG,
} from './constants';
import { DiwaSettings } from './types';
import { isTablet } from './utils';
import { DesktopHubView } from './views/DesktopHubView';
import { GawaCockpitView } from './views/GawaCockpitView';
import { DiwaSettingTab } from './settings';
import { IndexService } from './services/IndexService';
import { CaptureService } from './services/CaptureService';
import { RefreshCoordinator, type RefreshScope } from './application/RefreshCoordinator';

export default class DiwaPlugin extends Plugin {
    settings: DiwaSettings;
    settingsInitialized: boolean = false;
    private unloading = false;
    private startupRunToken = 0;
    private reactiveRuntimeEventsRegistered = false;
    private globalDomStateCaptured = false;
    private initialHostBottomBarInlineValue: string | null = null;
    private initialBodyHadTabletClass = false;
    private initialBodyHadDesktopClass = false;

    // Services
    index: IndexService;
    capture: CaptureService;
    refreshCoordinator: RefreshCoordinator;

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
        this.index = new IndexService(this.app, this.settings);
        this.capture = new CaptureService(this.app, this.settings);
        this.refreshCoordinator = new RefreshCoordinator(this.app, this.index);

        this.app.workspace.onLayoutReady(async () => {
            if (this.unloading) return;
            const startupToken = ++this.startupRunToken;
            this.registerReactiveRuntimeEvents();
            await this.runStartupIndexBuild(startupToken);
        });

        this.registerView(VIEW_TYPE_DESKTOP_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_MOBILE_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_TABLET_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_GAWA_COCKPIT, (leaf) => new GawaCockpitView(leaf, this));

        addIcon(DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG);
        addIcon(GAWA_COCKPIT_ICON_ID, GAWA_COCKPIT_ICON_SVG);

        this.addRibbonIcon(DESKTOP_HUB_ICON_ID, 'DIWA Workspace', () => {
            void this.activateWorkspace();
        });
        this.addRibbonIcon(GAWA_COCKPIT_ICON_ID, 'Gawa Task Cockpit', () => {
            void this.activateGawaCockpit();
        });

        this.addCommand({
            id: 'diwa-open-workspace',
            name: 'Open DIWA Workspace',
            icon: DESKTOP_HUB_ICON_ID,
            callback: () => { void this.activateWorkspace(); }
        });
        this.addCommand({
            id: 'diwa-open-gawa-cockpit',
            name: 'Open Gawa Task Cockpit',
            icon: GAWA_COCKPIT_ICON_ID,
            callback: () => { void this.activateGawaCockpit(); }
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
    }

    async onunload() {
        this.unloading = true;
        this.startupRunToken++;
        this.restoreGlobalDomState();
        this.refreshCoordinator?.onunload();
        this.detachRegisteredLeaves();
    }

    private isStartupRunActive(token: number): boolean {
        return !this.unloading && this.startupRunToken === token;
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
        const viewTypes = [VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB, VIEW_TYPE_GAWA_COCKPIT];
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

    async activateGawaCockpit(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_GAWA_COCKPIT);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = Platform.isDesktop ? workspace.getLeaf('split', 'vertical') : workspace.getLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_GAWA_COCKPIT, active: true });
            workspace.revealLeaf(leaf);
        }
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

    private async runStartupIndexBuild(startupToken: number): Promise<void> {
        try {
            await this.index.buildIndices();
            if (!this.isStartupRunActive(startupToken)) return;
            this.notifyRefresh('all');
            void this.scanForContexts(startupToken);
        } catch (error) {
            console.error('[DIWA] startup index build failed', error);
            if (!this.isStartupRunActive(startupToken)) return;
            new Notice('DIWA could not finish indexing on startup.');
        }
    }

    private registerReactiveRuntimeEvents(): void {
        if (this.reactiveRuntimeEventsRegistered) return;
        this.reactiveRuntimeEventsRegistered = true;

        this.registerEvent(this.app.vault.on('create', async (f) => {
            if (!(f instanceof TFile)) return;
            if (this.index.isCaptureFile(f.path)) {
                await this.index.indexCaptureFile(f);
                this.notifyRefresh('capture');
            }
        }));

        this.registerEvent(this.app.vault.on('modify', async (f) => {
            if (!(f instanceof TFile)) return;
            await this.refreshCoordinator.reindexFile(f);
        }));

        this.registerEvent(this.app.vault.on('delete', (f) => {
            if (this.index.isCaptureFile(f.path)) {
                this.index.removeCaptureFile(f.path);
                this.notifyRefresh('capture');
            }
        }));

        this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
            if (!(f instanceof TFile)) return;
            let changed = false;
            if (this.index.isCaptureFile(oldPath)) {
                this.index.removeCaptureFile(oldPath);
                changed = true;
            }
            if (this.index.isCaptureFile(f.path)) {
                await this.index.indexCaptureFile(f);
                changed = true;
            }
            if (changed) {
                this.notifyRefresh('capture');
            }
        }));

        this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
            if (this.index.isCaptureFile(file.path)) {
                await this.refreshCoordinator.reindexFile(file, true);
            }
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

        this.registerDomEvent(window, 'resize', () => {
            this.applyDeviceBodyClasses();
        });
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

        // Sanitize legacy keys
        const legacySettings = this.settings as unknown as Record<string, unknown>;
        const removedLegacyKeys = [
            'lifeMission', 'voiceMemoFolder', 'transcriptionLanguage', 'geminiApiKey',
            'geminiModel', 'maxOutputTokens', 'aiChatFolder', 'enableAutoClassification',
            'ai', 'projectsFolder', 'gawaLayoutPreferences', 'thoughtsFolder', 'tasksFolder',
            'pfFolder', 'reviewsFolder', 'legacyMigrated'
        ];
        for (const key of removedLegacyKeys) {
            if (Object.prototype.hasOwnProperty.call(legacySettings, key)) {
                delete legacySettings[key];
                shouldPersistSanitizedSettings = true;
            }
        }

        // Sanitize: remove null/non-string entries from contexts
        if (this.settings.contexts) {
            const sanitizedContexts = this.settings.contexts.filter((c: any) => c && typeof c === 'string');
            if (sanitizedContexts.length !== this.settings.contexts.length) {
                shouldPersistSanitizedSettings = true;
            }
            this.settings.contexts = sanitizedContexts;
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
        if (this.index) this.index.updateSettings(this.settings);
        if (this.capture) this.capture.updateSettings(this.settings);
        this.applyMobileCssVars();

        const shouldRefreshCaptures = this.index?.captureFolderChanged() ?? false;
        if (shouldRefreshCaptures && this.index) {
            await this.index.rebuildSelectedIndices({ captures: true });
            this.notifyRefresh('capture');
        }
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

    private applyMobileCssVars(): void {
        const value = Number.isFinite(this.settings.mobileBottomBarHeight)
            ? Math.max(0, Math.min(100, this.settings.mobileBottomBarHeight))
            : 56;
        document.documentElement.style.setProperty('--diwa-host-bottombar', `${value}px`);
    }

    private applyDeviceBodyClasses(): void {
        const tablet = isTablet(this.app);
        document.body.toggleClass('is-tablet', tablet);
        document.body.toggleClass('is-desktop', !Platform.isMobile);
    }

    notifyRefresh(scope: RefreshScope = 'all'): void {
        this.refreshCoordinator.notifyRefresh(scope);
    }

    getContexts(): string[] {
        const contexts = (this.settings.contexts ?? [])
            .map((ctx) => String(ctx || '').trim())
            .filter(Boolean);
        return Array.from(new Set(contexts)).sort((left, right) => left.localeCompare(right));
    }
}

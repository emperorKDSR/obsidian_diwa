import { Plugin, TFile, Notice, WorkspaceLeaf, Platform, moment, addIcon } from 'obsidian';
import { VIEW_TYPE_DIWA, KATANA_ICON_ID, KATANA_ICON_SVG, DEFAULT_SETTINGS, JOURNAL_ICON_ID, JOURNAL_ICON_SVG, DAILY_ICON_ID, DAILY_ICON_SVG, AI_CHAT_ICON_ID, AI_CHAT_ICON_SVG, TIMELINE_ICON_ID, TIMELINE_ICON_SVG, GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG, TASK_ICON_ID, TASK_ICON_SVG, PF_ICON_ID, PF_ICON_SVG, SETTINGS_ICON_ID, SETTINGS_ICON_SVG, VOICE_ICON_ID, VOICE_ICON_SVG, PROJECT_ICON_ID, PROJECT_ICON_SVG, SYNTHESIS_ICON_ID, SYNTHESIS_ICON_SVG, COMPASS_ICON_ID, COMPASS_ICON_SVG, REVIEW_ICON_ID, REVIEW_ICON_SVG, VIEW_TYPE_DESKTOP_HUB, DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG, VIEW_TYPE_SEARCH, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB } from './constants';
import { DiwaSettings } from './types';
import { isTablet } from './utils';
import { DiwaView } from './view';
import { DesktopHubView } from './views/DesktopHubView';
import { MobileHubView } from './views/MobileHubView';
import { TabletHubView } from './views/TabletHubView';
import { SearchView } from './views/SearchView';
import { DiwaSettingTab } from './settings';

import { AiService } from './services/AiService';
import { VaultService } from './services/VaultService';
import { IndexService } from './services/IndexService';
import { TaskLinkService } from './services/TaskLinkService';
import { TaskReflectionService } from './services/TaskReflectionService';
import { RefreshCoordinator } from './application/RefreshCoordinator';
import { SearchModal } from './modals/SearchModal';

export default class DiwaPlugin extends Plugin {
	settings: DiwaSettings;
    settingsInitialized: boolean = false;
    zenCaptureDraft: string = '';
    
    // Services
    ai: AiService;
    vault: VaultService;
    index: IndexService;
    taskLink: TaskLinkService;
    taskReflection: TaskReflectionService;
    refreshCoordinator: RefreshCoordinator;

	async onload() {
		await this.loadSettings();

        // Initialize Services
        this.ai = new AiService(this.app, this.settings);
        this.vault = new VaultService(this.app, this.settings);
        this.index = new IndexService(this.app, this.settings);
        this.taskLink = new TaskLinkService(this.app, this.settings, this.index);
        this.taskReflection = new TaskReflectionService(this.app, this.settings, this.index);
        this.refreshCoordinator = new RefreshCoordinator(this.app, this.settings, this.index);

        this.app.workspace.onLayoutReady(async () => {
            await this.index.buildIndices();
            this.notifyRefresh(); // ensure view re-renders with freshly-built index
            this.scanForContexts();
            
            // --- REACTIVE NERVE SYSTEM ---
            // vault events: fast path for local writes (create/delete/rename)
            this.registerEvent(this.app.vault.on('create', async (f) => {
                // Only refresh when the created file actually affects indexed state.
                // Attachment/voice/binary files must NOT trigger a re-render — doing so
                // wipes any open capture textarea (vault create fires when paste saves an image).
                let shouldRefresh = false;
                if (this.index.isThoughtFile(f.path)) { await this.index.indexThoughtFile(f as TFile); shouldRefresh = true; }
                else if (this.index.isTaskFile(f.path)) { await this.index.indexTaskFile(f as TFile); shouldRefresh = true; }
                else if (this.index.isDueFile(f.path)) { await this.index.buildDueIndex(); shouldRefresh = true; }
                else if (f.path.startsWith((this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/'))) { await this.index.refreshHabitIndex(); shouldRefresh = true; }
                if (shouldRefresh) this.notifyRefresh();
            }));
            
            this.registerEvent(this.app.vault.on('modify', async (f) => { 
                await this.refreshCoordinator.reindexFile(f as TFile);
                this.notifyRefresh();
            }));

            this.registerEvent(this.app.vault.on('delete', async (f) => { 
                this.index.thoughtIndex.delete(f.path); 
                this.index.taskIndex.delete(f.path);
                if (this.index.isDueFile(f.path)) await this.index.buildDueIndex();
                this.notifyRefresh(); 
            }));
            
            this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
                this.index.thoughtIndex.delete(oldPath);
                this.index.taskIndex.delete(oldPath);
                if (this.index.isThoughtFile(f.path)) await this.index.indexThoughtFile(f as TFile);
                else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f as TFile);
                this.notifyRefresh();
            }));

            // metadataCache.changed: authoritative trigger for cloud-synced files
            // (OneDrive/iCloud sync may not fire vault 'modify'/'create' reliably)
            this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
                await this.refreshCoordinator.reindexFile(file);
                this.notifyRefresh();
            }));
        });

        this.registerView(VIEW_TYPE_DIWA, (leaf) => new DiwaView(leaf, this));
        this.registerView(VIEW_TYPE_DESKTOP_HUB, (leaf) => new DesktopHubView(leaf, this));
        this.registerView(VIEW_TYPE_MOBILE_HUB,  (leaf) => new MobileHubView(leaf, this));
        this.registerView(VIEW_TYPE_TABLET_HUB,  (leaf) => new TabletHubView(leaf, this));
        this.registerView(VIEW_TYPE_SEARCH, (leaf) => new SearchView(leaf, this));

        // Reminders: hourly nudge for habits and due tasks
        this.registerInterval(window.setInterval(() => this._checkReminders(), 60 * 60 * 1000));
        this.registerDomEvent(document, 'visibilitychange', () => {
            if (document.visibilityState === 'visible') this._checkReminders();
        });

		addIcon(KATANA_ICON_ID, KATANA_ICON_SVG);
		addIcon(JOURNAL_ICON_ID, JOURNAL_ICON_SVG);
		addIcon(DAILY_ICON_ID, DAILY_ICON_SVG);
		addIcon(AI_CHAT_ICON_ID, AI_CHAT_ICON_SVG);
		addIcon(TIMELINE_ICON_ID, TIMELINE_ICON_SVG);
		addIcon(GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG);
		addIcon(PF_ICON_ID, PF_ICON_SVG);
		addIcon(VOICE_ICON_ID, VOICE_ICON_SVG);
		addIcon(PROJECT_ICON_ID, PROJECT_ICON_SVG);
		addIcon(SYNTHESIS_ICON_ID, SYNTHESIS_ICON_SVG);
		addIcon(COMPASS_ICON_ID, COMPASS_ICON_SVG);
		addIcon(REVIEW_ICON_ID, REVIEW_ICON_SVG);
		addIcon(SETTINGS_ICON_ID, SETTINGS_ICON_SVG);
        addIcon(DESKTOP_HUB_ICON_ID, DESKTOP_HUB_ICON_SVG);

        this.addRibbonIcon(DESKTOP_HUB_ICON_ID, 'DIWA Hub', () => {
            if (isTablet()) this.activateTabletHub();
            else if (Platform.isMobile) this.activateMobileHub();
            else this.activateDesktopHub();
        });

        this.addCommand({ id: 'open-diwa-desktop-hub', name: 'DIWA: Open Desktop Hub', icon: DESKTOP_HUB_ICON_ID, callback: () => { this.activateDesktopHub(); } });
        this.addCommand({ id: 'open-diwa-mobile-hub',  name: 'DIWA: Open Mobile Hub',  icon: 'smartphone', callback: () => { this.activateMobileHub(); } });
        this.addCommand({ id: 'open-diwa-tablet-hub',  name: 'DIWA: Open Tablet Hub',  icon: 'tablet',     callback: () => { this.activateTabletHub(); } });
        this.addCommand({ id: 'diwa-global-search', name: 'DIWA: Global Search', icon: 'lucide-search', hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'f' }], callback: () => { new SearchModal(this.app, this).open(); } });

		this.addSettingTab(new DiwaSettingTab(this.app, this));
        if (!this.settings.legacyMigrated) {
            setTimeout(() => this.migrateLegacyTableData(), 2000);
        }
	}

    async onunload() {
        this.refreshCoordinator?.onunload();
    }

    async migrateLegacyTableData() {
        const { vault } = this.app;
        const thoughtsPath = this.settings.captureFolder + '/' + this.settings.captureFilePath;
        const tasksPath = this.settings.captureFolder + '/' + this.settings.tasksFilePath;
        const migrateFile = async (path: string, isTask: boolean) => {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return;
            const content = await vault.read(file);
            const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---') && !l.includes('Date'));
            for (const line of lines) {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 8) {
                    const text = parts[7].replace(/<br>/g, '\n');
                    const ctxs = (parts[8].match(/#[^#\s|]+/g) || []).map(c => c.substring(1));
                    if (isTask) {
                        const due = parts[6].replace(/\[\[|\]\]/g, '');
                        await this.vault.createTaskFile(text, ctxs, due);
                    } else await this.vault.createThoughtFile(text, ctxs);
                }
            }
            await vault.rename(file, path + '.bak');
            new Notice(`Migrated legacy ${isTask ? 'tasks' : 'thoughts'}.`);
        };
        await migrateFile(thoughtsPath, false);
        await migrateFile(tasksPath, true);
        this.settings.legacyMigrated = true;
        await this.saveSettings();
    }

    async activateDesktopHub() {
        const { workspace } = this.app;
        // Reuse an existing Desktop Hub leaf if already open
        const existing = workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        // On desktop: open as a new window pane; on mobile: show notice
        if (!Platform.isDesktop) {
            new Notice('DIWA Desktop Hub is available on desktop only.', 2500);
            return;
        }
        const leaf = workspace.getLeaf('window');
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
            new Notice('DIWA Mobile Hub is available on phones only.', 2500);
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
            new Notice('DIWA Tablet Hub is available on tablets only.', 2500);
            return;
        }
        const leaf = workspace.getLeaf(false);
        if (leaf) { await leaf.setViewState({ type: VIEW_TYPE_TABLET_HUB, active: true }); workspace.revealLeaf(leaf); }
    }

    async activateSearchView() {
        const { workspace } = this.app;
        if (!Platform.isDesktop) {
            new Notice('DIWA Search is only available on desktop.', 2500);
            return;
        }
        const existing = workspace.getLeavesOfType(VIEW_TYPE_SEARCH);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getLeaf('window');
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_SEARCH, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    async activateView(tabId?: string, isDedicated: boolean = false) {
        const { workspace } = this.app;
        const targetTab = tabId || 'home';
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

    async scanForContexts() {
        const foundContexts = await this.index.scanForContexts();
        let newCtx = false;
        foundContexts.forEach(c => { if (c && typeof c === 'string' && !this.settings.contexts.includes(c)) { this.settings.contexts.push(c); newCtx = true; } });
        if (newCtx) await this.saveSettings();
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        if (loadedData) Object.assign(this.settings, loadedData);
        // Sanitize: remove null/non-string entries that can creep in from malformed YAML frontmatter
        if (this.settings.contexts) {
            this.settings.contexts = this.settings.contexts.filter((c: any) => c && typeof c === 'string');
        }
        if (!Array.isArray(this.settings.hiddenContexts)) {
            this.settings.hiddenContexts = [];
        }
        this.settingsInitialized = true;
	}

	async saveSettings() {
	    if (!this.settingsInitialized) return;
	    await this.saveData(this.settings);
	    if (this.ai) this.ai.updateSettings(this.settings);
	    if (this.vault) this.vault.updateSettings(this.settings);
	    if (this.index) this.index.updateSettings(this.settings);
	    if (this.taskLink) this.taskLink.updateSettings(this.settings);
	    if (this.taskReflection) this.taskReflection.updateSettings(this.settings);
	    if (this.refreshCoordinator) this.refreshCoordinator.updateSettings(this.settings);
	}

	notifyRefresh(): void {
	    this.refreshCoordinator.notifyRefresh();
	}

    getProjects(): string[] {
        return this.index ? this.index.getProjects() : [];
    }

    private _checkReminders(): void {
        const hour = new Date().getHours();
        if (hour < 8 || hour > 22) return;

        if (this.settings.reminderHabitsEnabled) {
            const allHabits = this.settings.habits?.filter(h => !h.archived) ?? [];
            const completed = this.index.habitStatusIndex ?? [];
            const incomplete = allHabits.filter(h => !completed.includes(h.id));
            if (incomplete.length > 0) {
                new Notice(`🌿 DIWA: ${incomplete.length} habit${incomplete.length > 1 ? 's' : ''} pending today`, 5000);
            }
        }

        if (this.settings.reminderTasksEnabled) {
            const today = new Date().toISOString().split('T')[0];
            let dueCount = 0;
            for (const t of this.index.taskIndex.values()) {
                if (t.status !== 'done' && t.due === today) dueCount++;
            }
            if (dueCount > 0) {
                new Notice(`✅ DIWA: ${dueCount} task${dueCount > 1 ? 's' : ''} due today`, 5000);
            }
        }
    }

    async getHabitStatus(date: string): Promise<string[]> {
        return this.index ? this.index.habitStatusIndex : [];
    }

    async toggleHabit(date: string, habitId: string): Promise<void> {
        if (this.vault) {
            await this.vault.toggleHabit(date, habitId);
            await this.index.refreshHabitIndex();
            this.notifyRefresh();
        }
    }
}


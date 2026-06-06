import { ItemView, WorkspaceLeaf, moment, TFile, Platform, ViewStateResult } from 'obsidian';
import { VIEW_TYPE_DIWA, KATANA_ICON_ID } from './constants';
import type DiwaPlugin from './main';
import { BaseTab } from './tabs/BaseTab';
import type { Task } from './types';

const LEGACY_HOME_TAB_IDS = new Set([
    'daily-workspace',
    'habits',
    'compass',
    'timeline',
    'synthesis',
    'calendar',
    'voice-note',
    'diwa-ai',
    'search',
]);

const REMOVED_TAB_FALLBACKS: Record<string, string> = {
    manual: 'settings',
    projects: 'review-gawa',
};

const RENDERABLE_TAB_IDS = new Set([
    'review-gawa',
    'dues',
    'review',
    'monthly-review',
    'settings',
    'journal',
    'export',
    'finance-analytics',
]);

const DEFAULT_DIWA_TAB_ID = 'settings';

interface DiwaViewState extends Record<string, unknown> {
    activeTab?: string;
    isDedicated?: boolean;
    selectedReviewWeekId?: string | null;
    reviewDraft?: { wins: string; lessons: string; focus: string[] } | null;
    reviewDraftWeekId?: string | null;
    reviewDraftRevision?: number | null;
    reviewDraftDirty?: boolean;
    weekPlanDraft?: Record<string, string> | null;
    weekPlanDraftWeekId?: string | null;
    weekPlanDraftRevision?: number | null;
    weekPlanDraftDirty?: boolean;
    weekPlanTargetMode?: 'next' | 'this';
}

export class DiwaView extends ItemView {
    plugin: DiwaPlugin;
    content: string = '';
    dueDate: string = moment().format('YYYY-MM-DD');
    activeTab: string = 'home';
    isDedicated: boolean = false;
    
    collapsedThreads: Set<string> = new Set();
    activeMasterNote: TFile | null = null;

    searchQuery: string = '';

    // Gawa state — persists across re-renders (viewMode survives vault events)
    tasksViewMode: string = 'open';
    // Focus engine state — persists across GawaTab re-instantiations
    tasksFocusSnapshot: Task[] = [];
    tasksDetailPath: string | null = null;
    tasksSecondaryMode: 'inbox' | 'overdue' | 'done' | null = null;
    _taskTogglePending: number = 0;       // > 0 = suppress vault-event re-renders
    _checklistTogglePending: number = 0;  // > 0 = suppress vault-event re-renders
    _capturePending: number = 0;          // > 0 = capture bar is expanded; suppress re-renders
    checklistOrder: string[] = [];        // persisted drag-reorder keys: "filePath:lineIndex"
    checklistShowDone: boolean = true;    // persisted show/hide completed checklist items
    // key = "filePath:lineIndex", value = YYYY-MM-DD — keeps completed items visible for the day
    checklistCompletedToday: Map<string, { text: string; date: string }> = new Map();
    
    // Week Plan State
    reviewDraft: { wins: string; lessons: string; focus: string[] } | null = null;
    reviewDraftWeekId: string | null = null;
    reviewDraftRevision: number | null = null;
    reviewDraftDirty: boolean = false;
    weekPlanDraft: Record<string, string> | null = null;
    weekPlanDraftWeekId: string | null = null;
    weekPlanDraftRevision: number | null = null;
    weekPlanDraftDirty: boolean = false;
    weekPlanTargetMode: 'next' | 'this' = 'this';
    selectedReviewWeekId: string | null = null;

    // Journal State
    journalSearch: string = '';

    // Managed current tab instance for lifecycle cleanup
    private currentTab: BaseTab | null = null;
    private currentTabId: string | null = null;
    private contentAreaEl: HTMLElement | null = null;
    private tabRenderToken = 0;
    private pendingTabRenderTimer: number | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_DIWA; }
    getDisplayText(): string {
        return this.getModeTitle();
    }
    getIcon() { return KATANA_ICON_ID; }

    private normalizeTabId(tab?: string | null): string {
        const nextTab = tab ?? 'home';
        if (LEGACY_HOME_TAB_IDS.has(nextTab)) return 'home';
        return REMOVED_TAB_FALLBACKS[nextTab] ?? nextTab;
    }

    private resolveActiveTab(tab?: string | null): string {
        const normalizedTab = this.normalizeTabId(tab);
        if (RENDERABLE_TAB_IDS.has(normalizedTab)) return normalizedTab;
        return DEFAULT_DIWA_TAB_ID;
    }

    getModeTitle(): string {
        switch (this.activeTab) {
            case 'review-thoughts': return "Thoughts";
            case 'review-gawa': return "Gawa";
            case 'dues': return "Bulsa";
            case 'review': return "Weekly Review";
            case 'monthly-review': return "Monthly Review";
            case 'settings': return "Settings";
            case 'journal': return "Journal";
            case 'export': return "Export";
            case 'finance-analytics': return "Bulsa Insights";
            default: return "DIWA";
        }
    }

    async onOpen() {
        // Hide Obsidian's view header (title bar inside leaf content)
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = '';
        this.clearPendingTabRender();
        this.disposeCurrentTab();
        this.contentAreaEl = null;
    }

    /** Persist activeTab + isDedicated so Obsidian can restore the window on reload. */
    getState(): DiwaViewState {
        return {
            activeTab: this.activeTab,
            isDedicated: this.isDedicated,
            selectedReviewWeekId: this.selectedReviewWeekId,
            reviewDraft: this.reviewDraft,
            reviewDraftWeekId: this.reviewDraftWeekId,
            reviewDraftRevision: this.reviewDraftRevision,
            reviewDraftDirty: this.reviewDraftDirty,
            weekPlanDraft: this.weekPlanDraft,
            weekPlanDraftWeekId: this.weekPlanDraftWeekId,
            weekPlanDraftRevision: this.weekPlanDraftRevision,
            weekPlanDraftDirty: this.weekPlanDraftDirty,
            weekPlanTargetMode: this.weekPlanTargetMode,
        };
    }

    /** Called by Obsidian after setViewState() — apply activeTab/isDedicated then re-render. */
    async setState(state: DiwaViewState, result: ViewStateResult): Promise<void> {
        if (state?.activeTab) {
            this.activeTab = this.resolveActiveTab(state.activeTab);
        }
        if (state?.isDedicated !== undefined) this.isDedicated = state.isDedicated;
        if (state?.selectedReviewWeekId !== undefined) this.selectedReviewWeekId = state.selectedReviewWeekId;
        if (state?.reviewDraft && typeof state.reviewDraft === 'object') {
            this.reviewDraft = {
                wins: typeof state.reviewDraft.wins === 'string' ? state.reviewDraft.wins : '',
                lessons: typeof state.reviewDraft.lessons === 'string' ? state.reviewDraft.lessons : '',
                focus: Array.isArray(state.reviewDraft.focus) ? state.reviewDraft.focus.map((value) => String(value ?? '')) : [],
            };
        } else if (state?.reviewDraft === null) {
            this.reviewDraft = null;
        }
        if (state?.reviewDraftWeekId !== undefined) this.reviewDraftWeekId = state.reviewDraftWeekId ?? null;
        if (state?.reviewDraftRevision !== undefined) this.reviewDraftRevision = typeof state.reviewDraftRevision === 'number' ? state.reviewDraftRevision : null;
        if (state?.reviewDraftDirty !== undefined) this.reviewDraftDirty = state.reviewDraftDirty === true;
        if (state?.weekPlanDraft && typeof state.weekPlanDraft === 'object') {
            this.weekPlanDraft = Object.fromEntries(
                Object.entries(state.weekPlanDraft).map(([date, value]) => [date, String(value ?? '')]),
            );
        } else if (state?.weekPlanDraft === null) {
            this.weekPlanDraft = null;
        }
        if (state?.weekPlanDraftWeekId !== undefined) this.weekPlanDraftWeekId = state.weekPlanDraftWeekId ?? null;
        if (state?.weekPlanDraftRevision !== undefined) this.weekPlanDraftRevision = typeof state.weekPlanDraftRevision === 'number' ? state.weekPlanDraftRevision : null;
        if (state?.weekPlanDraftDirty !== undefined) this.weekPlanDraftDirty = state.weekPlanDraftDirty === true;
        if (state?.weekPlanTargetMode === 'next' || state?.weekPlanTargetMode === 'this') this.weekPlanTargetMode = state.weekPlanTargetMode;
        await super.setState(state, result);
        this.renderView();
    }

    renderView() {
        this.activeTab = this.resolveActiveTab(this.activeTab);
        const container = this.containerEl.children[1] as HTMLElement;
        container.addClass('diwa-view-root');
        if (!this.contentAreaEl || !container.contains(this.contentAreaEl)) {
            container.empty();
            this.contentAreaEl = container.createEl('div', {
                cls: 'diwa-view-content',
                attr: { style: 'flex-grow: 1; overflow: hidden; display: flex; flex-direction: column;' },
            });
        }

        const tabChanged = this.currentTabId !== this.activeTab;
        if (tabChanged) {
            this.disposeCurrentTab();
            this.contentAreaEl.empty();
            this.scheduleTabRender(this.contentAreaEl);
            return;
        }

        if (this.currentTab) {
            this.currentTab.render(this.contentAreaEl);
            return;
        }

        this.contentAreaEl.empty();
        this.scheduleTabRender(this.contentAreaEl);
    }

    /** Incremental task refresh — uses onTasksRefresh() if current tab supports it, falls back to renderView(). */
    refreshTasks(): void {
        if (this.currentTab && typeof (this.currentTab as any).onTasksRefresh === 'function') {
            (this.currentTab as any).onTasksRefresh();
            return;
        }
        // Tab doesn't support incremental refresh — do full re-render
        this.renderView();
    }

    refreshThoughts(): void {
        if (this.currentTab && typeof (this.currentTab as any).onThoughtsRefresh === 'function') {
            (this.currentTab as any).onThoughtsRefresh();
            return;
        }
        this.renderView();
    }

    forceGawaRerender(): void {
        if (this.activeTab !== 'review-gawa') return;
        if (!this.contentAreaEl) {
            this.renderView();
            return;
        }
        this.disposeCurrentTab();
        this.contentAreaEl.empty();
        this.scheduleTabRender(this.contentAreaEl);
    }

    private scheduleTabRender(container: HTMLElement): void {
        this.clearPendingTabRender();
        this.pendingTabRenderTimer = window.setTimeout(() => {
            this.pendingTabRenderTimer = null;
            if (!container.isConnected) return;
            void this.renderTab(container);
        }, 0);
    }

    private clearPendingTabRender(): void {
        if (this.pendingTabRenderTimer === null) return;
        window.clearTimeout(this.pendingTabRenderTimer);
        this.pendingTabRenderTimer = null;
    }

    private renderTab(container: HTMLElement) {
        // arch-04: Error boundaries on all dynamic imports — silent failures leave blank panels
        const loadErr = (e: any) => container.createEl('p', { text: `Failed to load tab: ${e.message}`, cls: 'diwa-tab-error' });
        const instantiate = (promise: Promise<any>, name: string) => {
            const token = ++this.tabRenderToken;
            const requestedTab = this.activeTab;
            promise.then((mod: any) => {
                if (token !== this.tabRenderToken || requestedTab !== this.activeTab) return;
                try {
                    if (this.currentTab && typeof (this.currentTab as any).onunload === 'function') (this.currentTab as any).onunload();
                } catch (e) { console.warn('[DIWA View] error during previous tab unload', e); }
                const TabClass = mod[name];
                const instance = new TabClass(this);
                this.currentTab = instance;
                this.currentTabId = requestedTab;
                instance.render(container);
            }).catch(loadErr);
        };

        const tab = this.activeTab;
        if (tab === 'review-gawa') instantiate(import('./tabs/GawaTab'), 'GawaTab');
        else if (tab === 'dues') instantiate(import('./tabs/DuesTab'), 'DuesTab');
        else if (tab === 'review') instantiate(import('./tabs/ReviewTab'), 'ReviewTab');
        else if (tab === 'monthly-review') instantiate(import('./tabs/MonthlyReviewTab'), 'MonthlyReviewTab');
        else if (tab === 'settings') instantiate(import('./tabs/SettingsTab'), 'SettingsTab');
        else if (tab === 'journal') instantiate(import('./tabs/JournalTab'), 'JournalTab');
        else if (tab === 'export') instantiate(import('./tabs/ExportTab'), 'ExportTab');
        else if (tab === 'finance-analytics') instantiate(import('./tabs/FinanceAnalyticsTab'), 'FinanceAnalyticsTab');
        else {
            this.activeTab = DEFAULT_DIWA_TAB_ID;
            this.renderTab(container);
        }
    }

    private disposeCurrentTab(): void {
        this.clearPendingTabRender();
        this.tabRenderToken++;
        try {
            if (this.currentTab && typeof (this.currentTab as any).onunload === 'function') {
                (this.currentTab as any).onunload();
            }
        } catch (e) {
            console.warn('[DIWA View] error during tab unload', e);
        } finally {
            this.currentTab = null;
            this.currentTabId = null;
        }
    }

    matchesSearch(query: string, fields: string[]): boolean {
        if (!query) return true;
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const combined = fields.map(f => (f || '').toLowerCase()).join(' ');
        return tokens.every(token => combined.includes(token));
    }
}

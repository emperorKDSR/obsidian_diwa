import { ItemView, WorkspaceLeaf, moment, TFile, Platform, ViewStateResult } from 'obsidian';
import { VIEW_TYPE_DIWA, KATANA_ICON_ID } from './constants';
import type DiwaPlugin from './main';
import { BaseTab } from './tabs/BaseTab';
import type { ChatMessage, Task } from './types';

interface DiwaViewState extends Record<string, unknown> {
    activeTab?: string;
    isDedicated?: boolean;
}

export class DiwaView extends ItemView {
    plugin: DiwaPlugin;
    content: string = '';
    dueDate: string = moment().format('YYYY-MM-DD');
    activeTab: string = 'home';
    isDedicated: boolean = false;
    
    // UI State
    timelineSelectedDate: string = moment().format('YYYY-MM-DD');
    timelineScrollBody: HTMLElement;
    timelineCarousel: HTMLElement;

    collapsedThreads: Set<string> = new Set();
    activeMasterNote: TFile | null = null;
    activeSynthesisContext: string | null = null;
    activeSynthesisContexts: string[] = [];
    synthesisFeedFilter: 'no-context' | 'with-context' | 'processed' = 'no-context';
    synthesisShowHidden: boolean = false;

    searchQuery: string = '';

    // Synthesis Inline Capture State
    synthesisCaptureExpanded: boolean = false;
    synthesisCaptureDraft: string = '';
    _synthesisCaptPending: number = 0;

    // Synthesis select/merge mode
    synthesisSelectMode: boolean = false;
    synthesisSelectedPaths: Set<string> = new Set();
    synthesisCtxStripCollapsed: boolean = false;
    synthesisActiveCtxFilter: string | null = null;
    _mergePending: number = 0;

    // Gawa state — persists across re-renders (viewMode survives vault events)
    tasksViewMode: string = 'open';
    // Focus engine state — persists across GawaTab re-instantiations
    tasksFocusSnapshot: Task[] = [];
    tasksDetailPath: string | null = null;
    tasksSecondaryMode: 'inbox' | 'overdue' | 'done' | null = null;
    _taskTogglePending: number = 0;       // > 0 = suppress vault-event re-renders
    _habitTogglePending: number = 0;      // > 0 = suppress vault-event re-renders (CommandCenter habits)
    _checklistTogglePending: number = 0;  // > 0 = suppress vault-event re-renders
    _capturePending: number = 0;          // > 0 = capture bar is expanded; suppress re-renders
    checklistOrder: string[] = [];        // persisted drag-reorder keys: "filePath:lineIndex"
    checklistShowDone: boolean = true;    // persisted show/hide completed checklist items
    // key = "filePath:lineIndex", value = YYYY-MM-DD — keeps completed items visible for the day
    checklistCompletedToday: Map<string, { text: string; date: string }> = new Map();
    
    // AI State
    chatHistory: ChatMessage[] = [];
    isAiLoading: boolean = false;
    webSearchEnabled: boolean = false;
    groundedFiles: TFile[] = [];
    groundedNotesBar: HTMLElement;
    chatContainer: HTMLElement;
    currentChatFile: string | null = null;
    weeklyAiReport: string | null = null;

    // Calendar State
    calendarViewMonth: string = moment().format('YYYY-MM');
    calendarSelectedDate: string = moment().format('YYYY-MM-DD');
    calendarViewMode: 'month' | 'week' = 'month';

    // Week Plan State
    weekPlanDraft: Record<string, string> | null = null;
    weekPlanTargetMode: 'next' | 'this' = 'next';

    // Journal State
    journalSearch: string = '';

    // Voice State
    isRecording: boolean = false;

    // Managed current tab instance for lifecycle cleanup
    private currentTab: BaseTab | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_DIWA; }
    getDisplayText(): string {
        if (Platform.isMobile) return `M.I.N.A.`;
        return this.getModeTitle();
    }
    getIcon() { return KATANA_ICON_ID; }

    getModeTitle(): string {
        switch (this.activeTab) {
            case 'review-thoughts': return "Thoughts";
            case 'review-gawa': return "Gawa";
            case 'diwa-ai': return "AI Chat";
            case 'dues': return "Dues";
            case 'projects': return "Projects";
            case 'synthesis': return "Synthesis";
            case 'compass': return "Compass";
            case 'review': return "Weekly Review";
            case 'monthly-review': return "Monthly Review";
            case 'voice-note': return "Voice Notes";
            case 'habits': return "Habits";
            case 'settings': return "Settings";
            case 'timeline': return "Timeline";
            case 'journal': return "Journal";
            case 'manual': return "Manual";
            case 'calendar': return "Calendar";
            case 'export': return "Export";
            case 'finance-analytics': return "Finance Analytics";
            case 'milestones': return "Project Milestones";
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
    }

    /** Persist activeTab + isDedicated so Obsidian can restore the window on reload. */
    getState(): DiwaViewState {
        return { activeTab: this.activeTab, isDedicated: this.isDedicated };
    }

    /** Called by Obsidian after setViewState() — apply activeTab/isDedicated then re-render. */
    async setState(state: DiwaViewState, result: ViewStateResult): Promise<void> {
        if (state?.activeTab) {
            // Migrate removed tab to home
            this.activeTab = state.activeTab === 'daily-workspace' ? 'home' : state.activeTab;
        }
        if (state?.isDedicated !== undefined) this.isDedicated = state.isDedicated;
        await super.setState(state, result);
        this.renderView();
    }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('diwa-view-root');
        const contentArea = container.createEl('div', { cls: 'diwa-view-content', attr: { style: 'flex-grow: 1; overflow: hidden; display: flex; flex-direction: column;' } });
        this.renderTab(contentArea);
    }

    private renderTab(container: HTMLElement) {
        // arch-04: Error boundaries on all dynamic imports — silent failures leave blank panels
        const loadErr = (e: any) => container.createEl('p', { text: `Failed to load tab: ${e.message}`, cls: 'diwa-tab-error' });
        const instantiate = (promise: Promise<any>, name: string) => {
            promise.then((mod: any) => {
                try {
                    if (this.currentTab && typeof (this.currentTab as any).onunload === 'function') (this.currentTab as any).onunload();
                } catch (e) { console.warn('[DIWA View] error during previous tab unload', e); }
                const TabClass = mod[name];
                const instance = new TabClass(this);
                this.currentTab = instance;
                instance.render(container);
            }).catch(loadErr);
        };

        const tab = this.activeTab;
        if (tab === 'review-gawa') instantiate(import('./tabs/GawaTab'), 'GawaTab');
        else if (tab === 'diwa-ai') instantiate(import('./tabs/AiTab'), 'AiTab');
        else if (tab === 'dues') instantiate(import('./tabs/DuesTab'), 'DuesTab');
        else if (tab === 'projects') instantiate(import('./tabs/ProjectsTab'), 'ProjectsTab');
        else if (tab === 'synthesis') instantiate(import('./tabs/SynthesisTab'), 'SynthesisTab');
        else if (tab === 'compass') instantiate(import('./tabs/CompassTab'), 'CompassTab');
        else if (tab === 'review') instantiate(import('./tabs/ReviewTab'), 'ReviewTab');
        else if (tab === 'monthly-review') instantiate(import('./tabs/MonthlyReviewTab'), 'MonthlyReviewTab');
        else if (tab === 'voice-note') instantiate(import('./tabs/VoiceTab'), 'VoiceTab');
        else if (tab === 'habits') instantiate(import('./tabs/HabitsTab'), 'HabitsTab');
        else if (tab === 'settings') instantiate(import('./tabs/SettingsTab'), 'SettingsTab');
        else if (tab === 'timeline') instantiate(import('./tabs/TimelineTab'), 'TimelineTab');
        else if (tab === 'journal') instantiate(import('./tabs/JournalTab'), 'JournalTab');
        else if (tab === 'manual') instantiate(import('./tabs/ManualTab'), 'ManualTab');
        else if (tab === 'calendar') instantiate(import('./tabs/CalendarTab'), 'CalendarTab');
        else if (tab === 'export') instantiate(import('./tabs/ExportTab'), 'ExportTab');
        else if (tab === 'finance-analytics') instantiate(import('./tabs/FinanceAnalyticsTab'), 'FinanceAnalyticsTab');
    }

    // Bridge methods to Services
    async callGemini(msg: string, files: TFile[] = [], search: boolean = false, history?: any[]) {
        return await this.plugin.ai.callGemini(msg, files, search, history, this.plugin.index.thoughtIndex);
    }

    async transcribeAudio(file: TFile) {
        return await this.plugin.ai.transcribeAudio(file);
    }

    matchesSearch(query: string, fields: string[]): boolean {
        if (!query) return true;
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const combined = fields.map(f => (f || '').toLowerCase()).join(' ');
        return tokens.every(token => combined.includes(token));
    }
}

import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult, MarkdownRenderer } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DIWA,
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
} from '../constants';
import { attachInlineTriggers } from '../utils';
import type { ThoughtEntry, TaskEntry } from '../types';
import type { DiwaView } from '../view';
import { DesktopTaskPaneView } from './DesktopTaskPane';
import { TaskController } from './TaskController';
import { ThoughtController } from './ThoughtController';
import { ThoughtProcessor } from './ThoughtProcessor';
import { LinkModal } from './LinkModal';
import { ThoughtFocusPanel } from './ThoughtFocusPanel';

export class DesktopHubView extends ItemView {
    private static sharedLinkModal: LinkModal | null = null;
    plugin: DiwaPlugin;
    isFocusMode: boolean = true;

    // Suppress re-renders while user is mid-capture (thought or task)
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Task panel filter: 'upcoming' = next 2 days + undated; 'all' = everything
    _taskFilter: 'upcoming' | 'all' = 'upcoming';

    // Center pane context tab + scope
    _activeContextTab: string = 'all';
    _feedScope: 'today' | 'all' = 'today';

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;
    private _wrapEl: HTMLElement | null = null;
    private _topBarEl: HTMLElement | null = null;
    private _sidebarEl: HTMLElement | null = null;
    private _centerEl: HTMLElement | null = null;
    private _rightEl: HTMLElement | null = null;
    private _taskPaneView: DesktopTaskPaneView | null = null;
    private _taskController: TaskController;
    private _thoughtController: ThoughtController;
    private _thoughtProcessor: ThoughtProcessor;
    private _thoughtSearchQuery: string = '';
    private _captureSectionEl: HTMLElement | null = null;
    private _captureInputEl: HTMLTextAreaElement | null = null;
    private _captureHintEl: HTMLElement | null = null;
    private _centerInnerEl: HTMLElement | null = null;
    private _contextTabsHostEl: HTMLElement | null = null;
    private _thoughtWorkspaceEl: HTMLElement | null = null;
    private _feedRootEl: HTMLElement | null = null;
    private _focusPanelHostEl: HTMLElement | null = null;
    private _focusPanel: ThoughtFocusPanel | null = null;
    private _feedHeaderEl: HTMLElement | null = null;
    private _feedPinnedListEl: HTMLElement | null = null;
    private _feedRecentListEl: HTMLElement | null = null;
    private _feedArchivedListEl: HTMLElement | null = null;
    private _feedClustersListEl: HTMLElement | null = null;
    private _feedEmptyEl: HTMLElement | null = null;
    private _thoughtUnsubscribe: (() => void) | null = null;
    private _thoughtPopoverEl: HTMLElement | null = null;
    private _thoughtPopoverOutsideHandler: ((event: MouseEvent) => void) | null = null;
    private _thoughtPopoverEscapeHandler: ((event: KeyboardEvent) => void) | null = null;
    private _thoughtRowMap = new Map<string, {
        rootEl: HTMLElement;
        contentEl: HTMLElement;
        contextsEl: HTMLElement;
        textEl: HTMLElement;
        timeEl: HTMLElement;
        actionsEl: HTMLElement;
        suggestionTaskEl: HTMLButtonElement;
        suggestionLinksEl: HTMLElement;
        suggestionRecallEl: HTMLElement;
        convertBtnEl: HTMLButtonElement;
        linkedTaskIconEl: HTMLButtonElement;
        linkedThoughtIconEl: HTMLButtonElement;
        pinBtnEl: HTMLButtonElement;
        archiveBtnEl: HTMLButtonElement;
        signature: string;
    }>();
    private _feedRefreshRaf: number | null = null;
    private _contextSelectionGuardUntil = 0;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this._taskController = plugin.getTaskController();
        this._thoughtController = plugin.getThoughtController();
        this._thoughtProcessor = plugin.getThoughtProcessor();
        console.log('[DIWA] DesktopHub controller ref:', this._taskController);
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    getState(): Record<string, unknown> {
        return { isFocusMode: this.isFocusMode, activeContextTab: this._activeContextTab, feedScope: this._feedScope };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        if (state?.activeContextTab !== undefined) this._activeContextTab = String(state.activeContextTab);
        if (state?.feedScope === 'all' || state?.feedScope === 'today') this._feedScope = state.feedScope;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        if (!this._thoughtUnsubscribe) {
            this._thoughtUnsubscribe = this._thoughtController.subscribe((thought) => {
                void this.updateThoughtInUI(thought);
            });
        }
        // Hide Obsidian's leaf header (same pattern as DiwaView src/view.ts:128-132)
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        this._closed = true;
        this._thoughtUnsubscribe?.();
        this._thoughtUnsubscribe = null;
        this.resetLayoutRefs();
    }

    async renderView() {
        if (this._capturePending > 0 || this._taskPending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.addClass('diwa-dh-root');

        if (this.isMobile()) {
            await this.applyMobileLayout(root);
            return;
        }
        await this.applyDesktopLayout(root);
    }

    private isMobile(): boolean {
        return this.plugin.isMobile();
    }

    private async applyDesktopLayout(root: HTMLElement): Promise<void> {
        if (!Platform.isDesktop) {
            this.resetLayoutRefs();
            root.empty();
            root.createEl('div', {
                text: '⊕ DIWA Desktop Hub requires a desktop environment.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }
        this._wrapEl?.removeClass('is-mobile-layout');

        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }

        this._wrapEl?.toggleClass('is-focus-mode', this.isFocusMode);

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }

        if (this._centerEl) {
            await this.renderCenter(this._centerEl);
        }

        this.updateTaskPaneFromIndex();
    }

    private async applyMobileLayout(root: HTMLElement): Promise<void> {
        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }
        this._wrapEl?.addClass('is-mobile-layout');
        this._wrapEl?.removeClass('is-focus-mode');

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }
        if (this._centerEl) {
            await this.renderCenter(this._centerEl);
        }
    }

    updateTaskPaneFromIndex(): void {
        this._taskController.syncFromIndex();
    }

    private buildStableLayout(root: HTMLElement): void {
        this.resetLayoutRefs();
        root.empty();

        this._wrapEl = root.createEl('div', { cls: 'diwa-dh-wrap' });
        this._topBarEl = this._wrapEl.createEl('div', { cls: 'diwa-dh-topbar' });

        const cols = this._wrapEl.createEl('div', { cls: 'diwa-dh-cols' });
        this._sidebarEl = cols.createEl('nav', { cls: 'diwa-dh-sidebar', attr: { 'aria-label': 'DIWA Navigation' } });
        this.renderSidebar(this._sidebarEl);

        this._centerEl = cols.createEl('div', { cls: 'diwa-dh-center' });
        this._rightEl = cols.createEl('div', { cls: 'diwa-dh-right' });
        this.mountTaskPane(this._rightEl);
    }

    private resetLayoutRefs(): void {
        this._taskPaneView?.destroy();
        this._wrapEl = null;
        this._topBarEl = null;
        this._sidebarEl = null;
        this._centerEl = null;
        this._rightEl = null;
        this._taskPaneView = null;
        this._captureSectionEl = null;
        this._captureInputEl = null;
        this._captureHintEl = null;
        this._centerInnerEl = null;
        this._contextTabsHostEl = null;
        this._thoughtWorkspaceEl = null;
        this._feedRootEl = null;
        this._focusPanel?.destroy();
        this._focusPanel = null;
        this._focusPanelHostEl = null;
        this._feedHeaderEl = null;
        this._feedPinnedListEl = null;
        this._feedRecentListEl = null;
        this._feedArchivedListEl = null;
        this._feedClustersListEl = null;
        this._feedEmptyEl = null;
        this._thoughtRowMap.clear();
        this.closeThoughtLinkPopover();
        if (this._feedRefreshRaf !== null) {
            window.cancelAnimationFrame(this._feedRefreshRaf);
            this._feedRefreshRaf = null;
        }
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent;

        const left = bar.createEl('div', { cls: 'diwa-dh-topbar-left' });
        left.createEl('span', { text: 'DIWA', cls: 'diwa-dh-topbar-logo' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        left.createEl('span', { text: `${greeting}, Emperor.`, cls: 'diwa-dh-topbar-greeting' });

        const center = bar.createEl('div', { cls: 'diwa-dh-topbar-center' });
        center.createEl('span', {
            text: moment().format('dddd · MMMM D, YYYY').toUpperCase(),
            cls: 'diwa-dh-topbar-date'
        });
        const northStar = this.plugin.settings.northStarGoals?.[0];
        if (northStar) {
            center.createEl('span', { text: `★ ${northStar}`, cls: 'diwa-dh-topbar-northstar' });
        }

        const right = bar.createEl('div', { cls: 'diwa-dh-topbar-right' });
        const aiModeWrap = right.createEl('label', {
            cls: 'diwa-dh-ai-mode',
            attr: { style: 'display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:12px;' },
        });
        aiModeWrap.createEl('span', { text: 'AI Mode:' });
        const aiModeSelect = aiModeWrap.createEl('select', {
            cls: 'diwa-dh-ai-mode-select',
            attr: { style: 'padding:4px 8px;border-radius:6px;' },
        }) as HTMLSelectElement;
        const modeOptions: Array<{ value: 'off' | 'assist' | 'active'; label: string }> = [
            { value: 'off', label: 'Off' },
            { value: 'assist', label: 'Assist' },
            { value: 'active', label: 'Active' },
        ];
        for (const option of modeOptions) {
            aiModeSelect.createEl('option', { value: option.value, text: option.label });
        }
        aiModeSelect.value = this.plugin.aiMode;
        aiModeSelect.addEventListener('change', () => {
            const nextMode = aiModeSelect.value as 'off' | 'assist' | 'active';
            this.plugin.setAIMode(nextMode);
        });

        const focusBtn = right.createEl('button', {
            cls: `diwa-dh-focus-btn${this.isFocusMode ? ' is-active' : ''}`,
            attr: { title: this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode' }
        });
        const focusIcon = focusBtn.createDiv({ cls: 'diwa-dh-focus-btn-icon' });
        setIcon(focusIcon, 'lucide-target');
        focusBtn.createSpan({ text: this.isFocusMode ? 'EXIT FOCUS' : 'FOCUS MODE' });
        focusBtn.addEventListener('click', () => {
            this.isFocusMode = !this.isFocusMode;
            this.renderView();
        });
    }

    // ── LEFT Sidebar ──────────────────────────────────────────────────────────
    private renderSidebar(parent: HTMLElement) {
        const sidebar = parent;

        const groups: { title: string; items: { label: string; icon: string; tab: string }[] }[] = [
            {
                title: 'ACTION',
                items: [
                    { label: 'Search', icon: 'lucide-search', tab: 'search' },
                    { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
                    { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
                    { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' },
                ],
            },
            {
                title: 'MANAGE',
                items: [
                    { label: 'Gawa', icon: 'lucide-check-square-2', tab: 'review-gawa' },
                    { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' },
                    { label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' },
                    { label: 'Calendar', icon: 'lucide-calendar', tab: 'calendar' },
                    { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
                    { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' },
                ],
            },
            {
                title: 'FEATURES',
                items: [
                    { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'diwa-ai' },
                    { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' },
                    { label: 'Habits', icon: 'lucide-flame', tab: 'habits' },
                ],
            },
            {
                title: 'SYSTEM',
                items: [
                    { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
                    { label: 'Manual', icon: 'lucide-book-open', tab: 'manual' },
                ],
            },
        ];

        for (const group of groups) {
            const groupEl = sidebar.createEl('div', { cls: 'diwa-dh-nav-group' });
            groupEl.createEl('span', { text: group.title, cls: 'diwa-dh-nav-group-label' });
            for (const item of group.items) {
                const btn = groupEl.createEl('button', {
                    cls: 'diwa-dh-nav-item',
                    attr: { title: item.label, 'aria-label': item.label }
                });
                const iconWrap = btn.createEl('span', { cls: 'diwa-dh-nav-icon' });
                setIcon(iconWrap, item.icon);
                btn.createEl('span', { text: item.label, cls: 'diwa-dh-nav-label' });
                btn.addEventListener('click', () => {
                    if (item.tab === 'search') { this.plugin.activateSearchView(); }
                    else { this.plugin.activateView(item.tab, false); }
                });
            }
        }
    }

    // ── CENTER Column ─────────────────────────────────────────────────────────
    private async renderCenter(parent: HTMLElement) {
        if (!this._captureSectionEl || !parent.contains(this._captureSectionEl)) {
            this._captureSectionEl = parent.createEl('div', { cls: 'diwa-dh-capture-section' });
        }
        if (!this._centerInnerEl || !parent.contains(this._centerInnerEl)) {
            this._centerInnerEl = parent.createEl('div', { cls: 'diwa-dh-center-inner' });
            this._contextTabsHostEl = this._centerInnerEl.createEl('div');
            this._thoughtWorkspaceEl = this._centerInnerEl.createEl('div', { cls: 'diwa-dh-thought-workspace' });
            this._feedRootEl = this._thoughtWorkspaceEl.createEl('div', { cls: 'diwa-dh-feed' });
            this._focusPanelHostEl = this._thoughtWorkspaceEl.createEl('div', { cls: 'diwa-dh-focus-panel-host' });
            this.getFocusPanel().attach(this._focusPanelHostEl);
        }
        const activeCtx = this._activeContextTab;
        this.renderCapture(this._captureSectionEl, activeCtx !== 'all' ? [activeCtx] : []);
        if (this._contextTabsHostEl) {
            this._contextTabsHostEl.empty();
            this.renderContextTabs(this._contextTabsHostEl);
        }
        if (this._focusPanelHostEl) this.getFocusPanel().attach(this._focusPanelHostEl);
        await this.renderFeed();
    }

    private renderCapture(parent: HTMLElement, initialContexts: string[] = []) {
        if (!this._captureInputEl) {
            parent.empty();
            const capture = parent.createEl('div', { cls: 'diwa-dh-capture diwa-capture-bar' });
            const textarea = capture.createEl('textarea', {
                cls: 'diwa-dh-capture-textarea',
                attr: { rows: '2', placeholder: 'Think here...' },
            }) as HTMLTextAreaElement;
            const contextHint = capture.createEl('div', { cls: 'diwa-dh-capture-hint' });
            this._captureInputEl = textarea;
            this._captureHintEl = contextHint;

            const autosize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
            };
            textarea.addEventListener('input', autosize);
            requestAnimationFrame(autosize);
            capture.addEventListener('click', (event) => {
                const target = event.target as HTMLElement | null;
                if (!target) return;
                if (
                    target.closest('.diwa-chip')
                    || target.closest('.diwa-dh-chip')
                    || target.closest('.diwa-capture-desktop-chip-area')
                    || target.closest('button')
                    || target.closest('a')
                    || target.closest('[role="button"]')
                ) return;
                textarea.focus();
            });
            attachInlineTriggers(
                this.app,
                textarea,
                () => {},
                undefined,
                undefined,
                this.plugin.settings.peopleFolder,
            );

            textarea.addEventListener('keydown', async (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    textarea.value = '';
                    autosize();
                    return;
                }
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                const raw = textarea.value;
                if (!raw.trim()) return;
                const contexts = this._activeContextTab !== 'all' ? [this._activeContextTab] : [];
                this._capturePending++;
                textarea.disabled = true;
                try {
                    const created = await this._thoughtController.addThought({ content: raw, context: contexts });
                    if (!created) {
                        new Notice('Error saving thought — please try again', 2500);
                        return;
                    }
                    textarea.value = '';
                    autosize();
                    new Notice('✦ Thought saved', 1200);
                    this.requestThoughtFeedRefresh();
                } finally {
                    this._capturePending = Math.max(0, this._capturePending - 1);
                    textarea.disabled = false;
                }
            });
        }

        const activeContexts = initialContexts.length > 0 ? initialContexts.join(', ') : 'all contexts';
        this._captureHintEl?.setText(`Enter -> save • Shift+Enter -> multiline • Scope: ${activeContexts}`);
    }

    private renderContextTabs(parent: HTMLElement) {
        const known = this.plugin.settings.contexts ?? [];
        if (known.length === 0) return;

        // Resolve display order: user-defined order first, new contexts appended
        const order = (this.plugin.settings.contextOrder ?? []).filter(c => known.includes(c));
        const unordered = known.filter(c => !order.includes(c));
        const displayContexts = [...order, ...unordered];

        const bar = parent.createEl('div', { cls: 'diwa-dh-ctx-tabbar' });

        // Mouse drag-to-scroll
        let isMouseDown = false, scrollStartX = 0, scrollLeft = 0;
        bar.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).closest('button')) return; // let pill clicks pass
            isMouseDown = true;
            scrollStartX = e.pageX - bar.offsetLeft;
            scrollLeft = bar.scrollLeft;
            bar.addClass('is-scrolling');
        });
        bar.addEventListener('mouseleave', () => { isMouseDown = false; bar.removeClass('is-scrolling'); });
        bar.addEventListener('mouseup', () => { isMouseDown = false; bar.removeClass('is-scrolling'); });
        bar.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;
            e.preventDefault();
            const x = e.pageX - bar.offsetLeft;
            bar.scrollLeft = scrollLeft - (x - scrollStartX) * 1.5;
        });

        const tabs = [...displayContexts, 'all'];

        tabs.forEach((ctx) => {
            const label = ctx === 'all' ? 'All' : ctx;
            const isActive = this._activeContextTab.toLowerCase() === ctx.toLowerCase();
            const pill = bar.createEl('button', {
                cls: `diwa-dh-ctx-tab${isActive ? ' is-active' : ''}`,
                text: label,
                attr: {
                    title: ctx === 'all' ? 'Show all thoughts from today' : `Filter by #${ctx}`,
                }
            });

            pill.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this._activeContextTab.toLowerCase() === ctx.toLowerCase()) return;
                this._activeContextTab = ctx;
                if (ctx === 'all') this._feedScope = 'today';
                for (const tab of Array.from(bar.querySelectorAll<HTMLElement>('.diwa-dh-ctx-tab'))) {
                    tab.removeClass('is-active');
                }
                pill.addClass('is-active');
                if (this._captureSectionEl) {
                    this.renderCapture(this._captureSectionEl, this._activeContextTab !== 'all' ? [this._activeContextTab] : []);
                }
                this.requestThoughtFeedRefresh();
            });
        });

        // Equalize all pills to the width of the longest one (+ 2ch padding already set via CSS)
        requestAnimationFrame(() => {
            const pills = Array.from(bar.querySelectorAll<HTMLElement>('.diwa-dh-ctx-tab'));
            const maxW = Math.max(...pills.map(p => p.offsetWidth));
            if (maxW > 0) pills.forEach(p => { p.style.width = maxW + 'px'; });
        });
    }

    private requestThoughtFeedRefresh(): void {
        if (this._feedRefreshRaf !== null) return;
        this._feedRefreshRaf = window.requestAnimationFrame(() => {
            this._feedRefreshRaf = null;
            void this.renderFeed();
        });
    }

    private ensureFeedStructure(): void {
        if (!this._feedRootEl) return;
        if (this._feedHeaderEl) return;

        this._feedHeaderEl = this._feedRootEl.createEl('div', { cls: 'diwa-dh-feed-header' });
        this._feedHeaderEl.createEl('div', { cls: 'diwa-dh-feed-label' });
        const search = this._feedHeaderEl.createEl('input', {
            cls: 'diwa-dh-thought-search',
            attr: { type: 'text', placeholder: 'Search thoughts...' },
        }) as HTMLInputElement;
        search.value = this._thoughtSearchQuery;
        search.addEventListener('input', () => {
            this._thoughtSearchQuery = search.value;
            this.requestThoughtFeedRefresh();
        });

        const list = this._feedRootEl.createEl('div', { cls: 'diwa-dh-feed-list' });
        const pinnedSection = list.createEl('section', { cls: 'diwa-dh-thought-section' });
        pinnedSection.createEl('div', { cls: 'diwa-dh-thought-section-title', text: 'Pinned (0)' });
        this._feedPinnedListEl = pinnedSection.createEl('div');

        const recentSection = list.createEl('section', { cls: 'diwa-dh-thought-section' });
        recentSection.createEl('div', { cls: 'diwa-dh-thought-section-title', text: 'Recent (0)' });
        this._feedRecentListEl = recentSection.createEl('div');

        const archivedSection = list.createEl('section', { cls: 'diwa-dh-thought-section diwa-dh-thought-archived-section' });
        archivedSection.createEl('div', { cls: 'diwa-dh-thought-section-title', text: 'Archived (0)' });
        this._feedArchivedListEl = archivedSection.createEl('div');
        archivedSection.style.display = 'none';

        const clustersSection = list.createEl('section', { cls: 'diwa-dh-thought-section diwa-dh-thought-clusters-section' });
        clustersSection.createEl('div', { cls: 'diwa-dh-thought-section-title', text: 'Clusters (0)' });
        this._feedClustersListEl = clustersSection.createEl('div', { cls: 'diwa-dh-clusters-list' });
        clustersSection.style.display = 'none';

        this._feedEmptyEl = this._feedRootEl.createEl('div', { cls: 'diwa-dh-feed-empty' });
        this._feedEmptyEl.style.display = 'none';
    }

    private async renderFeed() {
        this.ensureFeedStructure();
        if (!this._feedRootEl || !this._feedHeaderEl || !this._feedPinnedListEl || !this._feedRecentListEl || !this._feedArchivedListEl || !this._feedClustersListEl || !this._feedEmptyEl) return;

        const ctx = this._activeContextTab;
        const today = moment().format('YYYY-MM-DD');
        const labelText = ctx === 'all' ? 'TODAY' : `#${ctx}`.toUpperCase();
        const labelEl = this._feedHeaderEl.querySelector('.diwa-dh-feed-label') as HTMLElement | null;
        if (labelEl) labelEl.setText(labelText);

        let toggle = this._feedHeaderEl.querySelector('.diwa-dh-scope-toggle') as HTMLElement | null;
        if (ctx !== 'all') {
            if (!toggle) {
                toggle = this._feedHeaderEl.createEl('div', { cls: 'diwa-dh-scope-toggle' });
                const todayPill = toggle.createEl('button', { cls: 'diwa-dh-scope-pill', text: 'Today' });
                todayPill.dataset.scope = 'today';
                const allPill = toggle.createEl('button', { cls: 'diwa-dh-scope-pill', text: 'All Time' });
                allPill.dataset.scope = 'all';
                toggle.addEventListener('click', (event) => {
                    const target = event.target as HTMLElement;
                    const btn = target.closest('.diwa-dh-scope-pill') as HTMLElement | null;
                    const scope = btn?.dataset.scope;
                    if (scope !== 'today' && scope !== 'all') return;
                    if (this._feedScope === scope) return;
                    this._feedScope = scope;
                    this.requestThoughtFeedRefresh();
                });
            }
            for (const pill of Array.from(toggle.querySelectorAll<HTMLElement>('.diwa-dh-scope-pill'))) {
                pill.toggleClass('is-active', pill.dataset.scope === this._feedScope);
            }
        } else if (toggle) {
            toggle.remove();
        }

        const hasQuery = this._thoughtSearchQuery.trim().length > 0;
        let thoughts = hasQuery
            ? this._thoughtController.searchThoughts(this._thoughtSearchQuery)
            : this._thoughtProcessor.getTopThoughts(500);
        if (ctx === 'all') {
            thoughts = thoughts.filter(t => t.day === today);
        } else {
            const ctxLow = ctx.toLowerCase();
            thoughts = thoughts.filter(t => t.context.some(c => c.toLowerCase() === ctxLow));
            if (this._feedScope === 'today') thoughts = thoughts.filter(t => t.day === today);
        }
        const pinned = thoughts.filter((t) => t.pinned === true && !t.archived);
        const recent = thoughts.filter((t) => !t.archived && !t.pinned);
        const archived = thoughts.filter((t) => !!t.archived);

        const setSectionTitle = (container: HTMLElement, title: string, count: number) => {
            const titleEl = container.parentElement?.querySelector('.diwa-dh-thought-section-title') as HTMLElement | null;
            if (titleEl) titleEl.setText(`${title} (${count})`);
        };
        setSectionTitle(this._feedPinnedListEl, 'Pinned', pinned.length);
        setSectionTitle(this._feedRecentListEl, 'Recent', recent.length);
        setSectionTitle(this._feedArchivedListEl, 'Archived', archived.length);

        await this.patchThoughtSection(this._feedPinnedListEl, pinned);
        await this.patchThoughtSection(this._feedRecentListEl, recent);
        await this.patchThoughtSection(this._feedArchivedListEl, archived);

        const visibleIds = new Set<string>([...pinned, ...recent, ...archived].map((thought) => thought.id || thought.filePath));
        const visibleClusters = this._thoughtProcessor.clusterThoughts()
            .map((cluster) => ({
                ...cluster,
                thoughts: cluster.thoughts.filter((thought) => visibleIds.has(thought.id || thought.filePath)),
            }))
            .filter((cluster) => cluster.thoughts.length > 1);
        this.renderClusters(visibleClusters);

        const hasVisible = pinned.length + recent.length > 0;
        this._feedEmptyEl.style.display = hasVisible ? 'none' : '';
        if (!hasVisible) {
            this._feedEmptyEl.setText(ctx === 'all' ? 'Nothing captured yet — your mind is clear.' : `No thoughts tagged #${ctx}${this._feedScope === 'today' ? ' today' : ''}.`);
        }

        for (const [id, row] of this._thoughtRowMap.entries()) {
            if (!visibleIds.has(id)) {
                row.rootEl.remove();
                this._thoughtRowMap.delete(id);
            }
        }
    }

    private renderClusters(clusters: Array<{ label: string; thoughts: ThoughtEntry[] }>): void {
        if (!this._feedClustersListEl) return;
        const sectionEl = this._feedClustersListEl.parentElement as HTMLElement | null;
        const titleEl = sectionEl?.querySelector('.diwa-dh-thought-section-title') as HTMLElement | null;
        if (titleEl) titleEl.setText(`Clusters (${clusters.length})`);
        if (sectionEl) sectionEl.style.display = clusters.length > 0 ? '' : 'none';

        this._feedClustersListEl.empty();
        for (const cluster of clusters) {
            const clusterEl = this._feedClustersListEl.createEl('div', { cls: 'diwa-dh-cluster' });
            clusterEl.createEl('div', { cls: 'diwa-dh-cluster-title', text: `${cluster.label} (${cluster.thoughts.length})` });
            const thoughtsEl = clusterEl.createEl('div', { cls: 'diwa-dh-cluster-thoughts' });
            for (const thought of cluster.thoughts) {
                thoughtsEl.createEl('div', { cls: 'diwa-dh-cluster-thought', text: `• ${this.thoughtSnippet(thought)}` });
            }
        }
    }

    private createThoughtRow(thought: ThoughtEntry) {
        const thoughtId = thought.id || thought.filePath;
        const item = document.createElement('div');
        item.className = 'diwa-dh-feed-item thought-item';
        item.dataset.thoughtId = thoughtId;
        item.addEventListener('click', (event) => {
            if (Date.now() < this._contextSelectionGuardUntil) return;
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (
                target.closest('.diwa-dh-feed-actions')
                || target.closest('.diwa-dh-link-icons')
                || target.closest('.diwa-dh-thought-suggestion-task')
                || target.closest('.diwa-dh-feed-context-btn')
                || target.closest('.diwa-dh-feed-contexts')
                || target.closest('.wikilink')
            ) return;
            const thoughtRef = item.dataset.thoughtId || '';
            if (!thoughtRef) return;
            this.getFocusPanel().open(thoughtRef);
        });
        const dot = item.createEl('span', { cls: 'diwa-dh-feed-dot' });
        dot.addEventListener('click', (event) => {
            if (!this.isMobile()) return;
            event.stopPropagation();
            const wasOpen = item.hasClass('is-actions-open');
            this._thoughtRowMap.forEach((entry) => entry.rootEl.removeClass('is-actions-open'));
            if (!wasOpen) item.addClass('is-actions-open');
        });

        const content = item.createEl('div', { cls: 'diwa-dh-feed-content thought-content' });
        const timeEl = content.createEl('span', { cls: 'diwa-dh-feed-time thought-meta' });
        const contextsEl = content.createEl('div', { cls: 'diwa-dh-feed-contexts' });
        const mdEl = content.createEl('div', { cls: 'diwa-dh-feed-text' });
        const suggestionsEl = content.createEl('div', {
            cls: 'diwa-dh-thought-suggestions',
            attr: { style: 'display:flex;flex-direction:column;gap:4px;margin-top:6px;' },
        });
        const suggestionTaskEl = suggestionsEl.createEl('button', {
            cls: 'diwa-dh-thought-suggestion-task',
            text: 'Convert to task?',
            attr: {
                type: 'button',
                style: 'display:none;background:transparent;border:none;padding:0;color:var(--text-muted);font-size:11px;cursor:pointer;text-align:left;opacity:.82;',
            },
        }) as HTMLButtonElement;
        const suggestionLinksEl = suggestionsEl.createEl('div', {
            cls: 'diwa-dh-thought-suggestion-links',
            attr: {
                style: 'display:none;color:var(--text-muted);font-size:11px;opacity:.82;',
            },
        });
        const suggestionRecallEl = suggestionsEl.createEl('div', {
            cls: 'diwa-dh-thought-suggestion-recall',
            attr: {
                style: 'display:none;color:var(--text-muted);font-size:11px;opacity:.82;',
            },
        });

        const actions = item.createEl('div', { cls: 'diwa-dh-feed-actions thought-actions' });
        const linkIcons = actions.createEl('div', { cls: 'diwa-dh-link-icons task-link-icons' });
        const linkedThoughtIconEl = linkIcons.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn diwa-dh-link-icon thought-link-icon',
            attr: { type: 'button', title: 'Linked thoughts', 'aria-label': 'Linked thoughts' },
            text: '💬 0',
        }) as HTMLButtonElement;
        linkedThoughtIconEl.addEventListener('click', (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            if (!thoughtRef) return;
            this.getLinkModal().open({ thoughtId: thoughtRef }, this.getLinkModalHost());
        });
        const linkedTaskIconEl = linkIcons.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn diwa-dh-link-icon task-link-icon',
            attr: { type: 'button', title: 'Linked tasks', 'aria-label': 'Linked tasks' },
            text: '🔗 0',
        }) as HTMLButtonElement;
        linkedTaskIconEl.addEventListener('click', (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            if (!thoughtRef) return;
            this.getLinkModal().open({ thoughtId: thoughtRef }, this.getLinkModalHost());
        });
        const convertBtn = actions.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn',
            attr: { title: 'Convert to task', 'aria-label': 'Convert to task' },
        }) as HTMLButtonElement;
        setIcon(convertBtn, 'arrow-right');
        convertBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            if (!thoughtRef) return;
            convertBtn.disabled = true;
            try {
                const ok = await this._thoughtController.convertThoughtToTask(thoughtRef, this._taskController);
                if (!ok) {
                    new Notice('Could not convert thought to task.');
                    return;
                }
                new Notice('Thought converted to task', 1100);
                this.requestThoughtFeedRefresh();
            } finally {
                convertBtn.disabled = false;
            }
        });
        suggestionTaskEl.addEventListener('click', (event) => {
            event.stopPropagation();
            if (convertBtn.style.display === 'none') return;
            convertBtn.click();
        });

        const linkBtn = actions.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn',
            attr: { title: 'Link thought', 'aria-label': 'Link thought' },
        }) as HTMLButtonElement;
        setIcon(linkBtn, 'link-2');
        linkBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            if (!thoughtRef) return;
            this.getLinkModal().open({ thoughtId: thoughtRef }, this.getLinkModalHost());
        });

        const pinBtn = actions.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn',
            attr: { title: 'Pin thought', 'aria-label': 'Pin thought' },
        }) as HTMLButtonElement;
        setIcon(pinBtn, 'pin');
        pinBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            const current = this._thoughtController.getThought(thoughtRef);
            if (!current) return;
            await this._thoughtController.setPinned(thoughtRef, !current.pinned);
        });

        const archiveBtn = actions.createEl('button', {
            cls: 'diwa-dh-feed-edit-btn',
            attr: { title: 'Archive thought', 'aria-label': 'Archive thought' },
        }) as HTMLButtonElement;
        setIcon(archiveBtn, 'archive');
        archiveBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            const current = this._thoughtController.getThought(thoughtRef);
            if (!current) return;
            await this._thoughtController.setArchived(thoughtRef, !current.archived);
        });

        const editBtn = actions.createEl('button', { cls: 'diwa-dh-feed-edit-btn', attr: { title: 'Edit thought', 'aria-label': 'Edit thought' } });
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const thoughtRef = item.dataset.thoughtId || '';
            const current = this._thoughtController.getThought(thoughtRef);
            if (!current) return;
            this.makeThoughtEditable(item, content, actions, current);
        });

        return {
            rootEl: item,
            contentEl: content,
            contextsEl,
            textEl: mdEl,
            timeEl,
            actionsEl: actions,
            suggestionTaskEl,
            suggestionLinksEl,
            suggestionRecallEl,
            convertBtnEl: convertBtn,
            linkedTaskIconEl,
            linkedThoughtIconEl,
            pinBtnEl: pinBtn,
            archiveBtnEl: archiveBtn,
            signature: '',
        };
    }

    private thoughtSnippet(thought: ThoughtEntry): string {
        const fallback = thought.filePath.split('/').pop() || thought.filePath;
        const firstLine = (thought.body || thought.content || thought.title || fallback)
            .split('\n')
            .find((line) => line.trim()) || fallback;
        const trimmed = firstLine.trim();
        return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
    }

    private openThoughtLinkPopover(anchor: HTMLElement, sourceId: string): void {
        this.closeThoughtLinkPopover();
        if (!this._centerEl) return;
        const sourceThought = this._thoughtController.getThought(sourceId);
        if (!sourceThought) return;

        const popover = this._centerEl.createEl('div', { cls: 'diwa-dh-inline-popover' });
        this._thoughtPopoverEl = popover;
        const search = popover.createEl('input', {
            cls: 'diwa-dh-inline-popover-search',
            attr: {
                type: 'text',
                placeholder: 'Search thoughts...',
                spellcheck: 'false',
            },
        }) as HTMLInputElement;
        const list = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });
        const sourcePath = sourceThought.filePath;
        const sourceLinks = new Set(sourceThought.links?.thoughts ?? []);

        const renderOptions = (query: string) => {
            const q = query.trim().toLowerCase();
            list.empty();
            const thoughts = this._thoughtController.searchThoughts(q);
            let count = 0;
            for (const thought of thoughts) {
                if (thought.filePath === sourcePath) continue;
                const targetId = thought.id || thought.filePath;
                const linked = sourceLinks.has(thought.filePath) || sourceLinks.has(targetId);
                const option = list.createEl('button', {
                    cls: `diwa-dh-inline-option${linked ? ' is-active' : ''}`,
                    text: this.thoughtSnippet(thought),
                    attr: { type: 'button', title: linked ? 'Already linked' : 'Link thought' },
                }) as HTMLButtonElement;
                option.disabled = linked;
                option.addEventListener('click', async () => {
                    const ok = await this._thoughtController.linkThoughtToThought(sourceId, targetId);
                    if (!ok) {
                        new Notice('Could not link thought', 1600);
                        return;
                    }
                    this.closeThoughtLinkPopover();
                });
                count++;
                if (count >= 30) break;
            }
            if (count === 0) {
                list.createEl('div', { cls: 'diwa-dh-inline-empty', text: 'No thoughts found.' });
            }
        };

        search.addEventListener('input', () => renderOptions(search.value));
        renderOptions('');

        requestAnimationFrame(() => {
            if (!this._thoughtPopoverEl || this._thoughtPopoverEl !== popover || !this._centerEl) return;
            const rootRect = this._centerEl.getBoundingClientRect();
            const anchorRect = anchor.getBoundingClientRect();
            const maxLeft = Math.max(8, rootRect.width - popover.offsetWidth - 8);
            const left = Math.min(Math.max(8, anchorRect.left - rootRect.left), maxLeft);
            const top = anchorRect.bottom - rootRect.top + 6;
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
            search.focus();
        });

        this._thoughtPopoverOutsideHandler = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (popover.contains(target) || anchor.contains(target)) return;
            this.closeThoughtLinkPopover();
        };
        this._thoughtPopoverEscapeHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.closeThoughtLinkPopover();
            anchor.focus();
        };
        window.addEventListener('mousedown', this._thoughtPopoverOutsideHandler, true);
        window.addEventListener('keydown', this._thoughtPopoverEscapeHandler, true);
    }

    private closeThoughtLinkPopover(): void {
        if (this._thoughtPopoverOutsideHandler) {
            window.removeEventListener('mousedown', this._thoughtPopoverOutsideHandler, true);
            this._thoughtPopoverOutsideHandler = null;
        }
        if (this._thoughtPopoverEscapeHandler) {
            window.removeEventListener('keydown', this._thoughtPopoverEscapeHandler, true);
            this._thoughtPopoverEscapeHandler = null;
        }
        if (this._thoughtPopoverEl) {
            this._thoughtPopoverEl.remove();
            this._thoughtPopoverEl = null;
        }
    }

    private passesThoughtFilters(thought: ThoughtEntry): boolean {
        const ctx = this._activeContextTab;
        const today = moment().format('YYYY-MM-DD');
        const query = this._thoughtSearchQuery.trim().toLowerCase();
        if (ctx === 'all') {
            if (thought.day !== today) return false;
        } else {
            const ctxLow = ctx.toLowerCase();
            if (!thought.context.some((c) => c.toLowerCase() === ctxLow)) return false;
            if (this._feedScope === 'today' && thought.day !== today) return false;
        }
        if (query) {
            const haystack = `${thought.title} ${thought.content || thought.body || ''} ${(thought.tags ?? []).join(' ')}`.toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    }

    private async refreshThoughtRow(row: {
        rootEl: HTMLElement;
        contextsEl: HTMLElement;
        textEl: HTMLElement;
        timeEl: HTMLElement;
        suggestionTaskEl: HTMLButtonElement;
        suggestionLinksEl: HTMLElement;
        suggestionRecallEl: HTMLElement;
        convertBtnEl: HTMLButtonElement;
        linkedTaskIconEl: HTMLButtonElement;
        linkedThoughtIconEl: HTMLButtonElement;
        pinBtnEl: HTMLButtonElement;
        archiveBtnEl: HTMLButtonElement;
        signature: string;
    }, thought: ThoughtEntry): Promise<void> {
        const today = moment().format('YYYY-MM-DD');
        const isToday = thought.day === today;
        const ts = thought.created
            ? (isToday
                ? moment(thought.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm')
                : moment(thought.created, 'YYYY-MM-DD HH:mm:ss').format('MMM D · HH:mm'))
            : '';
        row.timeEl.setText(ts);
        row.contextsEl.empty();
        const contexts = (thought.context ?? []).map((ctx) => ctx.trim()).filter(Boolean);
        for (const ctx of contexts) {
            const activeCtx = this._activeContextTab.toLowerCase();
            const button = row.contextsEl.createEl('button', {
                cls: `diwa-dh-feed-context-btn${activeCtx === ctx.toLowerCase() ? ' is-active' : ''}`,
                text: `#${ctx}`,
                attr: { type: 'button', 'aria-label': `Filter by ${ctx}` },
            });
            const selectContext = () => {
                if (this._activeContextTab.toLowerCase() === ctx.toLowerCase()) return;
                this._activeContextTab = ctx;
                if (this._contextTabsHostEl) {
                    this._contextTabsHostEl.empty();
                    this.renderContextTabs(this._contextTabsHostEl);
                }
                this.requestThoughtFeedRefresh();
            };
            button.addEventListener('pointerdown', (event) => {
                this._contextSelectionGuardUntil = Date.now() + 350;
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                this._contextSelectionGuardUntil = Date.now() + 350;
                selectContext();
            });
            button.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                this._contextSelectionGuardUntil = Date.now() + 350;
                selectContext();
            });
        }
        row.pinBtnEl.setAttr('title', thought.pinned ? 'Unpin thought' : 'Pin thought');
        row.pinBtnEl.setAttr('aria-label', thought.pinned ? 'Unpin thought' : 'Pin thought');
        setIcon(row.pinBtnEl, thought.pinned ? 'pin-off' : 'pin');
        row.archiveBtnEl.setAttr('title', thought.archived ? 'Unarchive thought' : 'Archive thought');
        row.archiveBtnEl.setAttr('aria-label', thought.archived ? 'Unarchive thought' : 'Archive thought');
        setIcon(row.archiveBtnEl, thought.archived ? 'archive-restore' : 'archive');

        const signature = `${thought.modified}|${thought.updatedAt}|${thought.body || thought.content || thought.title}`;
        if (row.signature !== signature) {
            row.textEl.empty();
            await MarkdownRenderer.render(this.app, thought.body || thought.title || '', row.textEl, thought.filePath, this);
            this.hydrateWikiLinks(row.textEl);
            row.signature = signature;
        }
        const linkedTasks = this._taskController.getLinkedTasksForThought(thought.filePath);
        row.linkedTaskIconEl.setText(`🔗 ${linkedTasks.length}`);
        row.linkedTaskIconEl.style.display = linkedTasks.length > 0 ? '' : 'none';

        const linkedThoughts = Array.from(new Set((thought.links?.thoughts ?? []).filter(Boolean)));
        row.linkedThoughtIconEl.setText(`💬 ${linkedThoughts.length}`);
        row.linkedThoughtIconEl.style.display = linkedThoughts.length > 0 ? '' : 'none';

        const shouldSuggestTask = this._thoughtProcessor.suggestTask(thought);
        row.suggestionTaskEl.style.display = shouldSuggestTask ? '' : 'none';

        const suggestedLinks = await this._thoughtProcessor.suggestLinks(thought);
        if (suggestedLinks.length > 0) {
            const labels = suggestedLinks
                .map((entry) => this.thoughtSnippet(entry))
                .filter(Boolean)
                .slice(0, 3);
            row.suggestionLinksEl.empty();
            row.suggestionLinksEl.createEl('div', { text: 'Suggested Links' });
            for (const label of labels) {
                row.suggestionLinksEl.createEl('div', { text: `• ${label}` });
            }
            row.suggestionLinksEl.style.display = '';
        } else {
            row.suggestionLinksEl.empty();
            row.suggestionLinksEl.style.display = 'none';
        }

        const recallHints = this._thoughtProcessor.recall(thought)
            .map((entry) => this.thoughtSnippet(entry))
            .filter(Boolean)
            .slice(0, 3);
        if (recallHints.length > 0) {
            row.suggestionRecallEl.empty();
            row.suggestionRecallEl.createEl('div', { text: 'Related Past Thoughts' });
            for (const label of recallHints) {
                row.suggestionRecallEl.createEl('div', { text: `• ${label}` });
            }
            row.suggestionRecallEl.style.display = '';
        } else {
            row.suggestionRecallEl.empty();
            row.suggestionRecallEl.style.display = 'none';
        }
    }

    private moveThoughtToCorrectSection(thought: ThoughtEntry): void {
        const thoughtId = thought.id || thought.filePath;
        const row = this._thoughtRowMap.get(thoughtId);
        if (!row) return;
        if (!this._feedPinnedListEl || !this._feedRecentListEl || !this._feedArchivedListEl) return;
        if (thought.archived) {
            this._feedArchivedListEl.appendChild(row.rootEl);
        } else if (thought.pinned === true) {
            this._feedPinnedListEl.appendChild(row.rootEl);
        } else {
            this._feedRecentListEl.appendChild(row.rootEl);
        }
    }

    private refreshSectionCounters(): void {
        const setTitle = (container: HTMLElement | null, title: string) => {
            if (!container) return;
            const titleEl = container.parentElement?.querySelector('.diwa-dh-thought-section-title') as HTMLElement | null;
            if (titleEl) titleEl.setText(`${title} (${container.childElementCount})`);
        };
        setTitle(this._feedPinnedListEl, 'Pinned');
        setTitle(this._feedRecentListEl, 'Recent');
        setTitle(this._feedArchivedListEl, 'Archived');
        if (this._feedEmptyEl && this._feedPinnedListEl && this._feedRecentListEl) {
            const hasVisible = this._feedPinnedListEl.childElementCount + this._feedRecentListEl.childElementCount > 0;
            this._feedEmptyEl.style.display = hasVisible ? 'none' : '';
        }
    }

    private async updateThoughtInUI(thought: ThoughtEntry): Promise<void> {
        this.ensureFeedStructure();
        if (!this._feedPinnedListEl || !this._feedRecentListEl || !this._feedArchivedListEl) return;
        const thoughtId = thought.id || thought.filePath;
        let row = this._thoughtRowMap.get(thoughtId);
        if (!row) {
            row = this.createThoughtRow(thought);
            this._thoughtRowMap.set(thoughtId, row);
        }
        row.rootEl.dataset.thoughtId = thoughtId;
        await this.refreshThoughtRow(row, thought);

        if (!this.passesThoughtFilters(thought)) {
            row.rootEl.remove();
            this.refreshSectionCounters();
            return;
        }
        this.moveThoughtToCorrectSection(thought);
        this.refreshSectionCounters();
    }

    private async patchThoughtSection(sectionListEl: HTMLElement, thoughts: ThoughtEntry[]): Promise<void> {
        for (const thought of thoughts) {
            const thoughtId = thought.id || thought.filePath;
            let row = this._thoughtRowMap.get(thoughtId);
            if (!row) {
                row = this.createThoughtRow(thought);
                this._thoughtRowMap.set(thoughtId, row);
            }
            row.rootEl.dataset.thoughtId = thoughtId;
            await this.refreshThoughtRow(row, thought);
            sectionListEl.appendChild(row.rootEl);
        }

        const sectionIds = new Set(thoughts.map((thought) => thought.id || thought.filePath));
        for (const child of Array.from(sectionListEl.children)) {
            const id = (child as HTMLElement).dataset.thoughtId;
            if (id && !sectionIds.has(id)) {
                (child as HTMLElement).remove();
            }
        }
    }

    private getLinkModal(): LinkModal {
        if (!DesktopHubView.sharedLinkModal) {
            DesktopHubView.sharedLinkModal = LinkModal.getShared(
                this.app,
                this.plugin,
                this._thoughtController,
                this._taskController,
                this._thoughtProcessor,
            );
        }
        return DesktopHubView.sharedLinkModal;
    }

    private getFocusPanel(): ThoughtFocusPanel {
        if (!this._focusPanel) {
            this._focusPanel = new ThoughtFocusPanel(
                this.app,
                this.plugin,
                this._thoughtController,
                this._taskController,
                this._thoughtProcessor,
                this,
            );
        }
        return this._focusPanel;
    }

    private hydrateWikiLinks(container: HTMLElement): void {
        const links = Array.from(container.querySelectorAll<HTMLElement>('a.internal-link, .internal-link'));
        for (const linkEl of links) {
            const linkText = linkEl.dataset.href
                || linkEl.getAttribute('data-href')
                || linkEl.getAttribute('href')
                || linkEl.textContent
                || '';
            const clean = linkText.replace(/^#/, '').trim();
            if (!clean) continue;
            const span = document.createElement('span');
            span.className = 'wikilink';
            span.textContent = linkEl.textContent || clean;
            span.tabIndex = 0;
            span.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.app.workspace.openLinkText(clean, '', false);
            });
            span.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                void this.app.workspace.openLinkText(clean, '', false);
            });
            linkEl.replaceWith(span);
        }
    }

    private getLinkModalHost(): HTMLElement {
        return this._wrapEl
            || this._centerEl
            || (this.containerEl.children[1] as HTMLElement | undefined)
            || document.body;
    }

    private makeThoughtEditable(item: HTMLElement, content: HTMLElement, actionsEl: HTMLElement, t: ThoughtEntry) {
        if (item.hasClass('is-editing')) return;
        item.addClass('is-editing');
        this._capturePending++;
        content.style.display = 'none';
        actionsEl.style.display = 'none';

        let editContexts = [...(t.context || [])];
        const form = item.createEl('div', { cls: 'diwa-edit-form' });

        const chipRow = form.createEl('div', { cls: 'diwa-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${ctx}` });
                chip.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    editContexts = editContexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', { cls: 'diwa-edit-textarea', attr: { rows: '2' } }) as HTMLTextAreaElement;
        textarea.value = t.body || t.title || '';
        const syncH = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        requestAnimationFrame(() => { syncH(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); });
        textarea.addEventListener('input', syncH);

        attachInlineTriggers(
            this.app, textarea, () => {},
            (tag) => { if (!editContexts.includes(tag)) { editContexts.push(tag); renderChips(); } },
            () => (this.plugin.settings.contexts ?? []).filter(c => !editContexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );

        const actions = form.createEl('div', { cls: 'diwa-edit-actions' });
        const saveBtn = actions.createEl('button', { cls: 'diwa-edit-save-btn', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'diwa-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            item.removeClass('is-editing');
            form.remove();
            this._capturePending = Math.max(0, this._capturePending - 1);
            if (restore) { content.style.display = ''; actionsEl.style.display = ''; }
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            exit(false);
            try {
                await this._thoughtController.updateThought({
                    ...t,
                    content: newText,
                    body: newText,
                    context: [...editContexts],
                });
                new Notice('✦ Thought updated', 1200);
                this.requestThoughtFeedRefresh();
            } catch {
                new Notice('Error updating thought', 2500);
                content.style.display = '';
                actionsEl.style.display = '';
            }
        };

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => exit(true));
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { exit(true); }
        });
    }

    private async openSynthesisFromHub(thought: ThoughtEntry): Promise<void> {
        await this.plugin.activateView('synthesis', false);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA).find((l) => {
            const view = l.view as DiwaView;
            return !!view && view.activeTab === 'synthesis' && !view.isDedicated;
        });
        const view = leaf?.view as DiwaView | undefined;
        if (!view) return;

        const ctx = this._activeContextTab !== 'all' ? this._activeContextTab : (thought.context?.[0] ?? null);
        if (ctx) {
            view.synthesisContextMode = 'filter';
            view.synthesisActiveCtxFilter = ctx;
            view.activeSynthesisContexts = [ctx];
        }
        view.synthesisInspectorPath = thought.filePath;
        view.synthesisLastSelectedPath = thought.filePath;
        view.renderView();
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private mountTaskPane(parent: HTMLElement) {
        this._taskPaneView = new DesktopTaskPaneView(this, parent, this._taskController);
        this._taskPaneView.mount();
    }
}

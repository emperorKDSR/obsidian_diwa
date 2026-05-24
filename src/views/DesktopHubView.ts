import { ItemView, WorkspaceLeaf, setIcon, Notice, ViewStateResult, MarkdownRenderer } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DIWA,
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
} from '../constants';
import { attachInlineTriggers, isTablet } from '../utils';
import type { TaskEntry, ThoughtEntry } from '../types';
import { DesktopTaskPaneView } from './DesktopTaskPane';
import { TaskController } from './TaskController';
import { ThoughtController } from './ThoughtController';

interface FeedRowRef {
    rootEl: HTMLElement;
    textEl: HTMLElement;
    timeEl: HTMLElement;
    ctxEl: HTMLElement;
    actionsEl: HTMLElement;
    editBtn: HTMLButtonElement;
    pinBtn: HTMLButtonElement;
    convertBtn: HTMLButtonElement;
    linkTaskBtn: HTMLButtonElement;
    linkThoughtBtn: HTMLButtonElement;
    archiveBtn: HTMLButtonElement;
    sig: string;
    renderToken: number;
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

export class DesktopHubView extends ItemView {
    plugin: DiwaPlugin;
    isFocusMode: boolean = true;

    // Suppress re-renders while user is mid-capture (thought or task)
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Task panel filter: 'upcoming' = next 2 days + undated; 'all' = everything
    _taskFilter: 'upcoming' | 'all' = 'upcoming';

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
    private _captureSectionEl: HTMLElement | null = null;
    private _captureInputEl: HTMLTextAreaElement | null = null;
    private _captureHintEl: HTMLElement | null = null;
    private _feedSearchSectionEl: HTMLElement | null = null;
    private _feedSearchInputEl: HTMLInputElement | null = null;
    private _feedSearchQuery: string = '';

    // Feed state
    private _feedEl: HTMLElement | null = null;
    private _feedEmptyEl: HTMLElement | null = null;
    private _feedLoadingEl: HTMLElement | null = null;
    private _feedWrapEl: HTMLElement | null = null;
    private _scrollSentinelEl: HTMLElement | null = null;
    private _scrollObserver: IntersectionObserver | null = null;
    private _feedRowMap = new Map<string, FeedRowRef>();
    private _sortedThoughts: ThoughtEntry[] = [];
    private _visibleCount: number = 50;
    private _thoughtUnsubscribe: (() => void) | null = null;
    private _feedDebounceTimer: number | null = null;
    private _renderVersion: number = 0;
    private _isFeedRendering: boolean = false;
    private _pendingFeedRender: boolean = false;
    private _feedPopoverEl: HTMLElement | null = null;
    private _feedPopoverAnchorEl: HTMLElement | null = null;
    private _feedPopoverOutsideHandler: ((event: MouseEvent) => void) | null = null;
    private _feedPopoverEscapeHandler: ((event: KeyboardEvent) => void) | null = null;
    private _feedPopoverWin: Window | null = null;

    // Topbar guard: only rebuild when focus mode changes or topbar is new
    private _topBarFocusMode: boolean | null = null;
    private _focusBtnEl: HTMLButtonElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this._taskController = plugin.getTaskController();
        this._thoughtController = plugin.getThoughtController();
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    getState(): Record<string, unknown> {
        return { isFocusMode: this.isFocusMode };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this._thoughtUnsubscribe = this._thoughtController.subscribe(() => {
            this.scheduleFeedRefresh();
        });
        this.renderView();
        // Wait for the index to be fully ready before the first real feed render.
        // This eliminates the race condition where the view renders before buildIndices() completes.
        this._thoughtController.readyPromise.then(() => {
            if (!this._closed) this.scheduleFeedRefresh();
        });
    }

    async onClose() {
        this._closed = true;
        this._thoughtUnsubscribe?.();
        this._thoughtUnsubscribe = null;
        if (this._feedDebounceTimer !== null) { clearTimeout(this._feedDebounceTimer); this._feedDebounceTimer = null; }
        this._pendingFeedRender = false;
        this._isFeedRendering = false;
        this._scrollObserver?.disconnect();
        this._scrollObserver = null;
        this.closeFeedPopover();
        this.resetLayoutRefs();
    }

    renderView() {
        if (this._capturePending > 0 || this._taskPending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.addClass('diwa-dh-root');
        root.addClass('diwa-workspace-root');
        root.removeClass('diwa-skin--desktop');
        root.removeClass('diwa-skin--tablet');
        root.removeClass('diwa-skin--mobile');
        root.addClass(this.getWorkspaceSkinClass());
        root.toggleClass('is-tablet', isTablet());

        if (this.isMobile()) {
            this.applyMobileLayout(root);
            return;
        }
        this.applyDesktopLayout(root);
    }

    protected getWorkspaceSkinClass(): string {
        return 'diwa-skin--desktop';
    }

    private isMobile(): boolean {
        return this.plugin.isMobile() && !isTablet();
    }

    private applyDesktopLayout(root: HTMLElement): void {
        this._wrapEl?.removeClass('is-mobile-layout');

        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }

        this._wrapEl?.toggleClass('is-focus-mode', this.isFocusMode);

        // Only rebuild topbar when focus mode changes or topbar is new.
        // Rebuilding on every vault event causes DOM thrash and perceived sluggishness.
        if (this._topBarEl) {
            if (this._topBarFocusMode !== this.isFocusMode) {
                this._topBarEl.empty();
                this._focusBtnEl = null;
                this.renderTopBar(this._topBarEl);
                this._topBarFocusMode = this.isFocusMode;
            } else if (this._focusBtnEl) {
                // Just sync button state without full rebuild
                this._focusBtnEl.toggleClass('is-active', this.isFocusMode);
                this._focusBtnEl.title = this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode';
            }
        }

        if (this._centerEl) {
            this.renderCenter(this._centerEl);
        }

        this.updateTaskPaneFromIndex();
    }

    private applyMobileLayout(root: HTMLElement): void {
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
            this.renderCenter(this._centerEl);
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
        this.closeFeedPopover();
        this._wrapEl = null;
        this._topBarEl = null;
        this._sidebarEl = null;
        this._centerEl = null;
        this._rightEl = null;
        this._taskPaneView = null;
        this._captureSectionEl = null;
        this._captureInputEl = null;
        this._captureHintEl = null;
        this._feedSearchSectionEl = null;
        this._feedSearchInputEl = null;
        this._feedEl = null;
        this._feedEmptyEl = null;
        this._feedLoadingEl = null;
        this._feedWrapEl = null;
        this._scrollSentinelEl = null;
        this._feedRowMap.clear();
        this._sortedThoughts = [];
        this._visibleCount = 50;
        this._renderVersion = 0;
        this._pendingFeedRender = false;
        this._isFeedRendering = false;
        this._topBarFocusMode = null;
        this._focusBtnEl = null;
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
            text: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(),
            cls: 'diwa-dh-topbar-date'
        });
        const northStar = this.plugin.settings.northStarGoals?.[0];
        if (northStar) {
            center.createEl('span', { text: `★ ${northStar}`, cls: 'diwa-dh-topbar-northstar' });
        }

        const right = bar.createEl('div', { cls: 'diwa-dh-topbar-right' });

        const focusBtn = right.createEl('button', {
            cls: `diwa-dh-focus-btn${this.isFocusMode ? ' is-active' : ''}`,
            attr: { title: this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode' }
        }) as HTMLButtonElement;
        const focusIcon = focusBtn.createDiv({ cls: 'diwa-dh-focus-btn-icon' });
        setIcon(focusIcon, 'lucide-target');
        focusBtn.createSpan({ text: this.isFocusMode ? 'EXIT FOCUS' : 'FOCUS MODE' });
        focusBtn.addEventListener('click', () => {
            this.isFocusMode = !this.isFocusMode;
            this.renderView();
        });
        this._focusBtnEl = focusBtn;
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
    private renderCenter(parent: HTMLElement) {
        if (parent.querySelector('.diwa-dh-wip')) {
            parent.empty();
        }

        if (!this._captureSectionEl || !parent.contains(this._captureSectionEl)) {
            parent.empty();
            this._captureSectionEl = parent.createEl('div', { cls: 'diwa-dh-capture-section' });
            this.renderCapture(this._captureSectionEl);
        }

        if (!this._feedSearchSectionEl || !parent.contains(this._feedSearchSectionEl)) {
            this._feedSearchSectionEl = parent.createEl('div', { cls: 'diwa-dh-feed-search-section' });
            if (this._feedWrapEl && parent.contains(this._feedWrapEl)) {
                parent.insertBefore(this._feedSearchSectionEl, this._feedWrapEl);
            }
            this.renderFeedSearch(this._feedSearchSectionEl);
        }

        if (!this._feedEl || !parent.contains(this._feedEl)) {
            this._scrollObserver?.disconnect();
            this._scrollObserver = null;
            this._feedEl = null;
            this._feedEmptyEl = null;
            this._feedLoadingEl = null;
            this._feedWrapEl = null;
            this._scrollSentinelEl = null;
            this._feedRowMap.clear();
            this._sortedThoughts = [];

            const feedWrap = parent.createEl('div', { cls: 'diwa-dh-feed-wrap' });
            this._feedWrapEl = feedWrap;
            this._feedLoadingEl = feedWrap.createEl('div', { cls: 'diwa-dh-feed-loading', text: 'Loading thoughts…' });
            this._feedEl = feedWrap.createEl('div', { cls: 'diwa-dh-feed-list' });
            this._feedEmptyEl = feedWrap.createEl('div', { cls: 'diwa-dh-feed-empty' });
            this._scrollSentinelEl = feedWrap.createEl('div', { cls: 'diwa-dh-scroll-sentinel' });
            this.mountScrollObserver();
            this.scheduleFeedRefresh();
        }
    }

    private mountScrollObserver(): void {
        if (!this._scrollSentinelEl || !this._feedWrapEl) return;
        this._scrollObserver?.disconnect();
        this._scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && !this._closed && this._visibleCount < this._sortedThoughts.length) {
                this._visibleCount += 30;
                this.scheduleFeedRefresh();
            }
        }, { root: this._feedWrapEl, rootMargin: '120px' });
        this._scrollObserver.observe(this._scrollSentinelEl);
    }

    // ── Feed ──────────────────────────────────────────────────────────────────
    private scheduleFeedRefresh(): void {
        const version = ++this._renderVersion;
        if (this._feedDebounceTimer !== null) clearTimeout(this._feedDebounceTimer);
        this._feedDebounceTimer = window.setTimeout(() => {
            this._feedDebounceTimer = null;
            this.executeFeedRender(version);
        }, 75);
    }

    private executeFeedRender(version: number): void {
        if (this._closed || version !== this._renderVersion) return;
        if (this._isFeedRendering) {
            this._pendingFeedRender = true;
            return;
        }

        this._isFeedRendering = true;
        try {
            this.patchFeed(version);
        } finally {
            this._isFeedRendering = false;
            if (this._pendingFeedRender) {
                this._pendingFeedRender = false;
                const latestVersion = this._renderVersion;
                if (!this._closed && latestVersion !== version) {
                    this.executeFeedRender(latestVersion);
                }
            }
        }
    }

    private patchFeed(version: number): void {
        if (!this._feedEl || this._closed) return;
        if (version !== this._renderVersion) return;
        if (this._feedPopoverAnchorEl && !this._feedPopoverAnchorEl.isConnected) {
            this.closeFeedPopover();
        }

        // Show loading state until the index is fully hydrated
        if (!this._thoughtController.isReady()) {
            if (this._feedLoadingEl) this._feedLoadingEl.style.display = '';
            if (this._feedEmptyEl) this._feedEmptyEl.style.display = 'none';
            return;
        }
        if (this._feedLoadingEl) this._feedLoadingEl.style.display = 'none';

        const allThoughts = this._thoughtController.getAllThoughts().map((thought) => ({
            ...thought,
            context: [...(thought.context ?? [])],
            allDates: [...(thought.allDates ?? [])],
            tags: [...(thought.tags ?? [])],
            wikilinks: [...(thought.wikilinks ?? [])],
            links: {
                tasks: [...(thought.links?.tasks ?? [])],
                thoughts: [...(thought.links?.thoughts ?? [])],
            },
        }));
        let thoughts = allThoughts.filter(t => !t.archived);

        // Stable sort: newest first using numeric timestamp (avoids Date-object/string ambiguity)
        thoughts = [...thoughts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

        const searchQuery = this._feedSearchQuery.trim().toLowerCase();
        if (searchQuery) {
            thoughts = thoughts.filter((thought) => this.matchesThoughtSearch(thought, searchQuery));
        }

        console.log('[FEED] total:', allThoughts.length, 'filtered:', thoughts.length);

        this._sortedThoughts = thoughts;
        const visibleThoughts = thoughts.slice(0, this._visibleCount);
        if (version !== this._renderVersion || this._closed) return;

        // Diff render: add/update visible rows, remove rows no longer visible
        const seen = new Set<string>();
        for (const thought of visibleThoughts) {
            const id = thought.id ?? thought.filePath; // normalizeThought always sets id, fallback for safety
            if (!id) continue;
            seen.add(id);
            const sig = [
                thought.createdAt ?? '',
                thought.updatedAt ?? '',
                thought.modified ?? '',
                thought.pinned ? '1' : '0',
                thought.archived ? '1' : '0',
                thought.body || thought.content || thought.title || '',
                (thought.links?.tasks ?? []).join('|'),
                (thought.links?.thoughts ?? []).join('|'),
            ].join('¦');

            let row = this._feedRowMap.get(id);
            if (!row) {
                const rootEl = this._feedEl.createEl('div', { cls: 'diwa-dh-thought-row' });
                rootEl.dataset.id = id;
                const leftEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-left' });
                const timeEl = leftEl.createEl('span', { cls: 'diwa-dh-thought-row-time' });
                const bodyEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-body' });
                const textEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-text' });
                const ctxEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-ctx' });
                const actionsEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-actions' });
                const editBtn = this.createThoughtActionButton(actionsEl, 'pencil', 'Edit thought', 'diwa-dh-thought-row-action--edit');
                const pinBtn = this.createThoughtActionButton(actionsEl, 'pin', 'Pin thought', 'diwa-dh-thought-row-action--pin');
                const convertBtn = this.createThoughtActionButton(actionsEl, 'list-todo', 'Convert to task', 'diwa-dh-thought-row-action--convert');
                const linkTaskBtn = this.createThoughtActionButton(actionsEl, 'link', 'Link to task', 'diwa-dh-thought-row-action--link-task');
                const linkThoughtBtn = this.createThoughtActionButton(actionsEl, 'git-merge', 'Link to thought', 'diwa-dh-thought-row-action--link-thought');
                const archiveBtn = rootEl.createEl('button', {
                    cls: 'diwa-dh-thought-row-archive diwa-dh-thought-row-action diwa-dh-thought-row-action--archive',
                    attr: { type: 'button', title: 'Archive', 'aria-label': 'Archive' },
                }) as HTMLButtonElement;
                setIcon(archiveBtn, 'archive');
                editBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const currentThought = this._thoughtController.getThought(id);
                    if (!currentThought) return;
                    this.plugin.editThought(currentThought);
                });
                pinBtn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const currentThought = this._thoughtController.getThought(id);
                    if (!currentThought) return;
                    await this._thoughtController.setPinned(id, !currentThought.pinned);
                });
                convertBtn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (convertBtn.disabled) return;
                    await this._taskController.convertThoughtToTask(id);
                });
                linkTaskBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.openTaskLinkPicker(linkTaskBtn, id);
                });
                linkThoughtBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.openThoughtLinkPicker(linkThoughtBtn, id);
                });
                archiveBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const t = this._thoughtController.getThought(id);
                    if (t) await this._thoughtController.setArchived(id, true);
                });
                row = {
                    rootEl,
                    textEl,
                    timeEl,
                    ctxEl,
                    actionsEl,
                    editBtn,
                    pinBtn,
                    convertBtn,
                    linkTaskBtn,
                    linkThoughtBtn,
                    archiveBtn,
                    sig: '',
                    renderToken: 0,
                };
                row.ctxEl.style.display = 'none';
                this._feedRowMap.set(id, row);
            }

            this.syncThoughtRowActions(thought, row);
            if (row.sig !== sig) {
                row.timeEl.setText(this.formatThoughtTime(thought));
                this.renderThoughtRowMarkdown(id, thought, row, sig, version);
                row.ctxEl.empty();
                row.ctxEl.style.display = 'none';
                row.sig = sig;
            }
        }
        if (version !== this._renderVersion || this._closed) return;

        // Remove rows that are no longer in the visible window
        for (const [id, row] of this._feedRowMap) {
            if (!seen.has(id)) {
                if (row.rootEl.contains(this._feedPopoverAnchorEl)) {
                    this.closeFeedPopover();
                }
                row.rootEl.remove();
                this._feedRowMap.delete(id);
            }
        }
        if (version !== this._renderVersion || this._closed) return;

        // Enforce display order (newest first)
        visibleThoughts.forEach((t, i) => {
            const id = t.id ?? t.filePath;
            if (!id) return;
            const row = this._feedRowMap.get(id);
            if (!row) return;
            if (this._feedEl!.children[i] !== row.rootEl) {
                this._feedEl!.insertBefore(row.rootEl, this._feedEl!.children[i] ?? null);
            }
        });
        if (version !== this._renderVersion || this._closed) return;

        // Empty state differentiation
        if (this._feedEmptyEl) {
            const hasVisible = seen.size > 0;
            this._feedEmptyEl.style.display = hasVisible ? 'none' : '';
            if (!hasVisible) {
                this._feedEmptyEl.setText(searchQuery ? 'No thoughts match your search.' : 'No thoughts yet. Capture your first one above.');
            }
        }
    }

    private matchesThoughtSearch(thought: ThoughtEntry, query: string): boolean {
        const searchText = [thought.title, thought.body, thought.content]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join('\n')
            .toLowerCase();
        return searchText.includes(query);
    }

    private formatThoughtTime(t: ThoughtEntry): string {
        if (!t.created) return '';
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = (t.created ?? '').slice(11, 16); // "HH:mm"
        if (t.day === today) return timeStr;
        const dateStr = (t.created ?? '').slice(5, 10).replace('-', '/'); // "MM/DD"
        return `${dateStr} ${timeStr}`;
    }

    private renderThoughtRowMarkdown(
        id: string,
        thought: ThoughtEntry,
        row: FeedRowRef,
        sig: string,
        version: number,
    ): void {
        const markdown = thought.body || thought.content || thought.title || '';
        const renderToken = row.renderToken + 1;
        row.renderToken = renderToken;
        row.textEl.setText(markdown);

        if (!markdown.trim()) return;

        const stagedEl = document.createElement('div');
        void MarkdownRenderer.render(this.app, markdown, stagedEl, thought.filePath || '', this)
            .then(() => {
                if (this._closed || version !== this._renderVersion) return;
                const currentRow = this._feedRowMap.get(id);
                if (!currentRow || currentRow !== row) return;
                if (currentRow.sig !== sig || currentRow.renderToken !== renderToken) return;
                currentRow.textEl.empty();
                while (stagedEl.firstChild) {
                    currentRow.textEl.appendChild(stagedEl.firstChild);
                }
            })
            .catch((error) => {
                if (!this._closed) {
                    console.error('[DesktopHubView] Failed to render thought markdown.', error);
                }
            });
    }

    private createThoughtActionButton(parent: HTMLElement, icon: string, title: string, modifierClass: string): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: `diwa-dh-thought-row-action ${modifierClass}`,
            attr: {
                type: 'button',
                title,
                'aria-label': title,
            },
        }) as HTMLButtonElement;
        setIcon(button, icon);
        return button;
    }

    private syncThoughtRowActions(thought: ThoughtEntry, row: FeedRowRef): void {
        const linkedTaskCount = this._taskController.getLinkedTasksForThought(thought.filePath).length
            || (thought.links?.tasks ?? []).filter((value) => value.trim().length > 0).length;
        const linkedThoughtCount = this.getLinkedThoughtRefs(thought).size;
        const hasLinkedTasks = linkedTaskCount > 0;
        const hasLinkedThoughts = linkedThoughtCount > 0;

        row.pinBtn.title = thought.pinned ? 'Unpin thought' : 'Pin thought';
        row.pinBtn.setAttr('aria-label', row.pinBtn.title);
        row.pinBtn.setAttr('aria-pressed', thought.pinned ? 'true' : 'false');
        row.pinBtn.toggleClass('is-active', !!thought.pinned);
        row.pinBtn.toggleClass('is-pinned', !!thought.pinned);

        row.convertBtn.disabled = hasLinkedTasks;
        row.convertBtn.title = hasLinkedTasks ? 'Already linked to a task' : 'Convert to task';
        row.convertBtn.setAttr('aria-label', row.convertBtn.title);
        row.convertBtn.toggleClass('is-active', hasLinkedTasks);
        row.convertBtn.toggleClass('is-disabled', hasLinkedTasks);

        row.linkTaskBtn.title = hasLinkedTasks ? `Link to task (${linkedTaskCount} linked)` : 'Link to task';
        row.linkTaskBtn.setAttr('aria-label', row.linkTaskBtn.title);
        row.linkTaskBtn.toggleClass('is-active', hasLinkedTasks);
        row.linkTaskBtn.toggleClass('is-linked', hasLinkedTasks);

        row.linkThoughtBtn.title = hasLinkedThoughts ? `Link to thought (${linkedThoughtCount} linked)` : 'Link to thought';
        row.linkThoughtBtn.setAttr('aria-label', row.linkThoughtBtn.title);
        row.linkThoughtBtn.toggleClass('is-active', hasLinkedThoughts);
        row.linkThoughtBtn.toggleClass('is-linked', hasLinkedThoughts);
    }

    private getLinkedTaskRefs(thought: ThoughtEntry): Set<string> {
        const refs = new Set<string>((thought.links?.tasks ?? []).map((value) => value.trim()).filter(Boolean));
        for (const task of this._taskController.getLinkedTasksForThought(thought.filePath)) {
            refs.add(task.filePath);
            refs.add(getTaskKey(task));
        }
        return refs;
    }

    private getLinkedThoughtRefs(thought: ThoughtEntry): Set<string> {
        const refs = new Set<string>((thought.links?.thoughts ?? []).map((value) => value.trim()).filter(Boolean));
        refs.delete(thought.filePath);
        refs.delete((thought.id || '').trim());
        return refs;
    }

    private openTaskLinkPicker(anchor: HTMLElement, thoughtId: string): void {
        if (this._feedPopoverEl && this._feedPopoverAnchorEl === anchor) {
            this.closeFeedPopover();
            return;
        }
        const currentThought = this._thoughtController.getThought(thoughtId);
        if (!currentThought) return;
        const linkedTaskRefs = this.getLinkedTaskRefs(currentThought);
        const tasks = this._taskController.getAllTasks()
            .slice()
            .sort((left, right) => (right.lastUpdate ?? 0) - (left.lastUpdate ?? 0));

        this.openFeedPopover(anchor, (popover) => {
            const search = popover.createEl('input', {
                cls: 'diwa-dh-inline-popover-search',
                attr: {
                    type: 'text',
                    placeholder: 'Link task...',
                    spellcheck: 'false',
                },
            }) as HTMLInputElement;
            const list = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });

            const renderOptions = (query: string) => {
                const q = query.trim().toLowerCase();
                list.empty();
                let visibleCount = 0;

                for (const task of tasks) {
                    if (linkedTaskRefs.has(task.filePath) || linkedTaskRefs.has(getTaskKey(task))) continue;
                    const haystack = `${task.title} ${task.body}`.toLowerCase();
                    if (q && !haystack.includes(q)) continue;
                    const option = list.createEl('button', {
                        cls: 'diwa-dh-inline-option',
                        text: this.taskSnippet(task),
                        attr: { type: 'button' },
                    });
                    option.addEventListener('click', () => {
                        void this.linkThoughtToTask(thoughtId, getTaskKey(task));
                    });
                    visibleCount++;
                }

                if (visibleCount === 0) {
                    list.createEl('div', {
                        cls: 'diwa-dh-inline-empty',
                        text: q ? 'No matching tasks' : 'No available tasks',
                    });
                }
            };

            renderOptions('');
            search.addEventListener('input', () => renderOptions(search.value));
            window.setTimeout(() => search.focus(), 30);
        });
    }

    private openThoughtLinkPicker(anchor: HTMLElement, thoughtId: string): void {
        if (this._feedPopoverEl && this._feedPopoverAnchorEl === anchor) {
            this.closeFeedPopover();
            return;
        }
        const currentThought = this._thoughtController.getThought(thoughtId);
        if (!currentThought) return;
        const linkedThoughtRefs = this.getLinkedThoughtRefs(currentThought);
        const thoughts = this._thoughtController.getAllThoughts()
            .filter((thought) => !thought.archived)
            .slice()
            .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0));

        this.openFeedPopover(anchor, (popover) => {
            const search = popover.createEl('input', {
                cls: 'diwa-dh-inline-popover-search',
                attr: {
                    type: 'text',
                    placeholder: 'Link thought...',
                    spellcheck: 'false',
                },
            }) as HTMLInputElement;
            const list = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });

            const renderOptions = (query: string) => {
                const q = query.trim().toLowerCase();
                list.empty();
                let visibleCount = 0;

                for (const candidate of thoughts) {
                    const candidateId = candidate.filePath;
                    if (candidateId === currentThought.filePath) continue;
                    if (linkedThoughtRefs.has(candidateId) || linkedThoughtRefs.has((candidate.id || '').trim())) continue;
                    const haystack = `${candidate.title} ${candidate.body}`.toLowerCase();
                    if (q && !haystack.includes(q)) continue;
                    const option = list.createEl('button', {
                        cls: 'diwa-dh-inline-option',
                        text: this.thoughtSnippet(candidate),
                        attr: { type: 'button' },
                    });
                    option.addEventListener('click', () => {
                        void this.linkThoughtToThought(currentThought.filePath, candidateId);
                    });
                    visibleCount++;
                }

                if (visibleCount === 0) {
                    list.createEl('div', {
                        cls: 'diwa-dh-inline-empty',
                        text: q ? 'No matching thoughts' : 'No available thoughts',
                    });
                }
            };

            renderOptions('');
            search.addEventListener('input', () => renderOptions(search.value));
            window.setTimeout(() => search.focus(), 30);
        });
    }

    private openFeedPopover(anchor: HTMLElement, render: (popover: HTMLElement) => void): void {
        this.closeFeedPopover();
        const doc = anchor.ownerDocument;
        const win = doc.defaultView;
        if (!win) return;

        const popover = doc.body.createEl('div', { cls: 'diwa-dh-inline-popover' });
        this._feedPopoverEl = popover;
        this._feedPopoverAnchorEl = anchor;
        this._feedPopoverWin = win;
        render(popover);

        win.requestAnimationFrame(() => {
            if (!this._feedPopoverEl || this._feedPopoverEl !== popover || !anchor.isConnected) return;
            const anchorRect = anchor.getBoundingClientRect();
            const popoverW = popover.offsetWidth;
            const popoverH = popover.offsetHeight;
            const vw = win.innerWidth;
            const vh = win.innerHeight;
            const gap = 6;
            const margin = 8;
            let top = anchorRect.bottom + gap;
            if (top + popoverH > vh - margin) {
                const aboveTop = anchorRect.top - popoverH - gap;
                top = aboveTop >= margin ? aboveTop : vh - popoverH - margin;
            }
            let left = anchorRect.left;
            if (left + popoverW > vw - margin) left = vw - popoverW - margin;
            if (left < margin) left = margin;
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
        });

        this._feedPopoverOutsideHandler = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (popover.contains(target) || anchor.contains(target)) return;
            this.closeFeedPopover();
        };
        this._feedPopoverEscapeHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.closeFeedPopover();
            anchor.focus();
        };
        win.addEventListener('mousedown', this._feedPopoverOutsideHandler, true);
        win.addEventListener('keydown', this._feedPopoverEscapeHandler, true);
    }

    private closeFeedPopover(): void {
        if (this._feedPopoverOutsideHandler) {
            this._feedPopoverWin?.removeEventListener('mousedown', this._feedPopoverOutsideHandler, true);
            this._feedPopoverOutsideHandler = null;
        }
        if (this._feedPopoverEscapeHandler) {
            this._feedPopoverWin?.removeEventListener('keydown', this._feedPopoverEscapeHandler, true);
            this._feedPopoverEscapeHandler = null;
        }
        this._feedPopoverEl?.remove();
        this._feedPopoverEl = null;
        this._feedPopoverAnchorEl = null;
        this._feedPopoverWin = null;
    }

    private async linkThoughtToTask(thoughtId: string, taskId: string): Promise<void> {
        const ok = await this._taskController.linkThoughtToTask(thoughtId, taskId);
        if (!ok) return;
        this.closeFeedPopover();
    }

    private async linkThoughtToThought(sourceId: string, targetId: string): Promise<void> {
        const ok = await this._thoughtController.linkThoughtToThought(sourceId, targetId);
        if (!ok) return;
        this.closeFeedPopover();
    }

    private thoughtSnippet(thought: ThoughtEntry): string {
        const fallback = thought.filePath.split('/').pop() || thought.filePath;
        const raw = (thought.body || thought.title || fallback).split('\n').find((line) => line.trim()) || fallback;
        const cleaned = raw.trim();
        return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
    }

    private taskSnippet(task: TaskEntry): string {
        const fallback = task.filePath.split('/').pop() || task.filePath;
        const raw = (task.title || task.body || fallback).split('\n').find((line) => line.trim()) || fallback;
        const cleaned = raw.trim();
        return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
    }

    private renderCapture(parent: HTMLElement) {
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
            this._captureHintEl.setText('Enter → save  •  Shift+Enter → multiline');

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
                this._capturePending++;
                textarea.disabled = true;
                try {
                    const created = await this._thoughtController.addThought({ content: raw, context: [] });
                    if (!created) {
                        return;
                    }
                    textarea.value = '';
                    autosize();
                } finally {
                    this._capturePending = Math.max(0, this._capturePending - 1);
                    textarea.disabled = false;
                }
            });
        }
    }

    private renderFeedSearch(parent: HTMLElement): void {
        if (!this._feedSearchInputEl) {
            parent.empty();
            const searchWrap = parent.createEl('div', { cls: 'diwa-dh-feed-search-wrap' });
            const searchIcon = searchWrap.createEl('span', { cls: 'diwa-dh-feed-search-icon' });
            setIcon(searchIcon, 'search');
            const input = searchWrap.createEl('input', {
                cls: 'diwa-dh-feed-search-input',
                attr: {
                    type: 'search',
                    placeholder: 'Search thoughts...',
                    'aria-label': 'Search thoughts',
                },
            }) as HTMLInputElement;

            input.value = this._feedSearchQuery;
            input.addEventListener('input', () => {
                const nextQuery = input.value;
                if (nextQuery === this._feedSearchQuery) return;
                this._feedSearchQuery = nextQuery;
                this._visibleCount = 50;
                this.scheduleFeedRefresh();
            });

            this._feedSearchInputEl = input;
        }

        if (this._feedSearchInputEl.value !== this._feedSearchQuery) {
            this._feedSearchInputEl.value = this._feedSearchQuery;
        }
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private mountTaskPane(parent: HTMLElement) {
        this._taskPaneView = new DesktopTaskPaneView(this, parent, this._taskController);
        this._taskPaneView.mount();
    }
}

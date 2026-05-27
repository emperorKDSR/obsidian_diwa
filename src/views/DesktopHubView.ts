import { ItemView, WorkspaceLeaf, setIcon, Notice, ViewStateResult, MarkdownRenderer } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID,
} from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler, isTablet } from '../utils';
import type { TaskEntry, ThoughtEntry } from '../types';
import { DesktopTaskPaneView } from './DesktopTaskPane';
import { TaskController } from './TaskController';
import { ThoughtController } from './ThoughtController';
import { enableImageZoom } from '../utils/imageZoom';

interface FeedRowRef {
    rootEl: HTMLElement;
    textEl: HTMLElement;
    timeEl: HTMLElement;
    ctxEl: HTMLElement;
    actionsEl: HTMLElement;
    editBtn: HTMLButtonElement;
    pinBtn: HTMLButtonElement;
    convertBtn: HTMLButtonElement;
    graphBtn: HTMLButtonElement;
    linkTaskBtn: HTMLButtonElement;
    linkThoughtBtn: HTMLButtonElement;
    archiveBtn: HTMLButtonElement;
    sig: string;
    renderToken: number;
}

type ThoughtGraphPayload = {
    thought: ThoughtEntry;
    seed: ThoughtEntry;
    kind: 'thought';
    type: 'thought';
};

type ThoughtGraphPlugin = Partial<{
    openThoughtGraph: (thought: ThoughtEntry) => unknown;
    openGraphExplorer: (payload: ThoughtGraphPayload) => unknown;
    openGraph: (payload: ThoughtGraphPayload) => unknown;
}>;

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

const DESKTOP_RIGHT_PANE_DEFAULT_WIDTH = 272;
const DESKTOP_RIGHT_PANE_MIN_WIDTH = 240;
const DESKTOP_RIGHT_PANE_MAX_WIDTH = 420;
const DESKTOP_RIGHT_PANE_KEYBOARD_STEP = 16;

function clampDesktopRightPaneWidth(width: number): number {
    return Math.min(
        DESKTOP_RIGHT_PANE_MAX_WIDTH,
        Math.max(DESKTOP_RIGHT_PANE_MIN_WIDTH, Math.round(width)),
    );
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
    private _rightResizeHandleEl: HTMLElement | null = null;
    private _rightEl: HTMLElement | null = null;
    private _taskPaneView: DesktopTaskPaneView | null = null;
    private _taskController: TaskController;
    private _thoughtController: ThoughtController;
    private _captureSectionEl: HTMLElement | null = null;
    private _captureInputEl: HTMLTextAreaElement | null = null;
    private _captureHintEl: HTMLElement | null = null;
    private _feedSectionEl: HTMLElement | null = null;
    private _contextFilterSectionEl: HTMLElement | null = null;
    private _feedSearchSectionEl: HTMLElement | null = null;
    private _feedSearchInputEl: HTMLInputElement | null = null;
    private _feedSearchQuery: string = '';
    private _activeContext: string = 'all';
    private _lastSidebarTarget: string = 'hub';

    // Feed state
    private _feedEl: HTMLElement | null = null;
    private _feedEmptyEl: HTMLElement | null = null;
    private _feedEmptyTitleEl: HTMLElement | null = null;
    private _feedEmptyBodyEl: HTMLElement | null = null;
    private _feedLoadingEl: HTMLElement | null = null;
    private _feedLoadingTitleEl: HTMLElement | null = null;
    private _feedLoadingBodyEl: HTMLElement | null = null;
    private _feedWrapEl: HTMLElement | null = null;
    private _feedHeaderCountEl: HTMLElement | null = null;
    private _feedHeaderSubtitleEl: HTMLElement | null = null;
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
    private _rightPaneWidth: number = DESKTOP_RIGHT_PANE_DEFAULT_WIDTH;
    private _rightResizeMoveHandler: ((event: PointerEvent) => void) | null = null;
    private _rightResizeStopHandler: ((event: PointerEvent) => void) | null = null;
    private _rightResizeWindow: Window | null = null;

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
        return {
            isFocusMode: this.isFocusMode,
            activeContext: this._activeContext,
            rightPaneWidth: this._rightPaneWidth,
        };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        if (typeof state?.activeContext === 'string' && state.activeContext.trim()) {
            this._activeContext = state.activeContext.trim();
        } else {
            this._activeContext = 'all';
        }
        const parsedRightPaneWidth = Number(state?.rightPaneWidth);
        this._rightPaneWidth = Number.isFinite(parsedRightPaneWidth)
            ? clampDesktopRightPaneWidth(parsedRightPaneWidth)
            : DESKTOP_RIGHT_PANE_DEFAULT_WIDTH;
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
        this.teardownRightPaneResize();
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
        if (this.isFocusMode) {
            this.closeFeedPopover();
        }
        this.applyRightPaneWidth();

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
            this.syncCaptureTextareaHeight();
        }

        this.updateTaskPaneFromIndex();
    }

    private applyMobileLayout(root: HTMLElement): void {
        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }
        this.teardownRightPaneResize();
        this._wrapEl?.addClass('is-mobile-layout');
        this._wrapEl?.removeClass('is-focus-mode');

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }
        if (this._centerEl) {
            this.renderCenter(this._centerEl);
            this.syncCaptureTextareaHeight();
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
        this._rightResizeHandleEl = cols.createEl('div', {
            cls: 'diwa-dh-right-resize',
            attr: {
                role: 'separator',
                tabindex: '0',
                'aria-label': 'Resize right task pane',
                'aria-orientation': 'vertical',
            },
        });
        this.bindRightPaneResize(this._rightResizeHandleEl);
        this._rightEl = cols.createEl('aside', {
            cls: 'diwa-dh-right',
            attr: { 'aria-label': 'Task side pane' },
        });
        this.applyRightPaneWidth();
        this.mountTaskPane(this._rightEl);
    }

    private resetLayoutRefs(): void {
        this.teardownRightPaneResize();
        this._taskPaneView?.destroy();
        this.closeFeedPopover();
        this._wrapEl = null;
        this._topBarEl = null;
        this._sidebarEl = null;
        this._centerEl = null;
        this._rightResizeHandleEl = null;
        this._rightEl = null;
        this._taskPaneView = null;
        this._captureSectionEl = null;
        this._captureInputEl = null;
        this._captureHintEl = null;
        this._feedSectionEl = null;
        this._contextFilterSectionEl = null;
        this._feedSearchSectionEl = null;
        this._feedSearchInputEl = null;
        this._feedEl = null;
        this._feedEmptyEl = null;
        this._feedEmptyTitleEl = null;
        this._feedEmptyBodyEl = null;
        this._feedLoadingEl = null;
        this._feedLoadingTitleEl = null;
        this._feedLoadingBodyEl = null;
        this._feedWrapEl = null;
        this._feedHeaderCountEl = null;
        this._feedHeaderSubtitleEl = null;
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
        sidebar.empty();

        const shell = sidebar.createEl('div', { cls: 'diwa-dh-sidebar-shell' });
        const top = shell.createEl('div', { cls: 'diwa-dh-sidebar-top' });
        this.renderSidebarButton(top, {
            label: 'Workspace',
            icon: 'layout-dashboard',
            tab: 'hub',
            variant: 'brand',
            onClick: () => this.plugin.activateDesktopHub(),
        });

        const groups: { title: string; variant?: 'primary' | 'utility'; items: { label: string; icon: string; tab: string; onClick?: () => Promise<void> | void }[] }[] = [
            {
                title: 'Core',
                variant: 'primary',
                items: [
                    { label: 'Search', icon: 'lucide-search', tab: 'search', onClick: () => this.plugin.activateSearchView() },
                    { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
                    { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
                    { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' },
                    { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'diwa-ai' },
                ],
            },
            {
                title: 'Manage',
                items: [
                    { label: 'Gawa', icon: 'lucide-check-square-2', tab: 'review-gawa' },
                    { label: 'Bulsa', icon: PF_ICON_ID, tab: 'dues' },
                    { label: 'Projects', icon: 'folder-kanban', tab: 'projects' },
                    { label: 'Calendar', icon: 'lucide-calendar', tab: 'calendar' },
                    { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
                    { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' },
                ],
            },
            {
                title: 'System',
                variant: 'utility',
                items: [
                    { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
                    { label: 'Manual', icon: 'lucide-book-open', tab: 'manual' },
                ],
            },
        ];

        const main = shell.createEl('div', { cls: 'diwa-dh-sidebar-main' });
        const footer = shell.createEl('div', { cls: 'diwa-dh-sidebar-footer' });

        for (const group of groups) {
            const groupHost = group.variant === 'utility' ? footer : main;
            const groupEl = groupHost.createEl('div', { cls: `diwa-dh-nav-group${group.variant === 'primary' ? ' is-primary' : ''}${group.variant === 'utility' ? ' is-utility' : ''}` });
            groupEl.createEl('span', { text: group.title, cls: 'diwa-dh-nav-group-label' });
            for (const item of group.items) {
                this.renderSidebarButton(groupEl, {
                    ...item,
                    onClick: item.onClick ?? (() => this.plugin.activateView(item.tab, false)),
                });
            }
        }

        this.syncSidebarSelection();
    }

    private renderSidebarButton(
        parent: HTMLElement,
        item: { label: string; icon: string; tab: string; variant?: 'brand'; onClick: () => Promise<void> | void; },
    ): void {
        const btn = parent.createEl('button', {
            cls: `diwa-dh-nav-item${item.variant === 'brand' ? ' is-brand' : ''}`,
            attr: {
                type: 'button',
                title: item.label,
                'aria-label': item.label,
                'data-nav-target': item.tab,
            }
        });
        const iconWrap = btn.createEl('span', { cls: 'diwa-dh-nav-icon' });
        setIcon(iconWrap, item.icon);
        btn.createEl('span', { text: item.label, cls: 'diwa-dh-nav-label' });
        btn.addEventListener('click', () => {
            this._lastSidebarTarget = item.tab;
            this.syncSidebarSelection();
            void item.onClick();
        });
    }

    private syncSidebarSelection(): void {
        if (!this._sidebarEl) {
            return;
        }

        this._sidebarEl.querySelectorAll<HTMLElement>('.diwa-dh-nav-item[data-nav-target]').forEach((btn) => {
            const target = btn.getAttribute('data-nav-target');
            const isCurrent = target === this._lastSidebarTarget;
            btn.toggleClass('is-current', isCurrent);
            if (isCurrent) {
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.removeAttribute('aria-current');
            }
        });
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

        this.ensureFeedSection(parent);

        for (const section of [this._captureSectionEl, this._feedSectionEl]) {
            if (!section || !parent.contains(section) || parent.lastElementChild === section) continue;
            parent.appendChild(section);
        }
    }

    private ensureFeedSection(parent: HTMLElement): void {
        if (!this._feedSectionEl || !parent.contains(this._feedSectionEl) || !this._feedEl) {
            this._scrollObserver?.disconnect();
            this._scrollObserver = null;
            this._feedSectionEl = null;
            this._contextFilterSectionEl = null;
            this._feedSearchSectionEl = null;
            this._feedSearchInputEl = null;
            this._feedEl = null;
            this._feedEmptyEl = null;
            this._feedEmptyTitleEl = null;
            this._feedEmptyBodyEl = null;
            this._feedLoadingEl = null;
            this._feedLoadingTitleEl = null;
            this._feedLoadingBodyEl = null;
            this._feedWrapEl = null;
            this._feedHeaderCountEl = null;
            this._feedHeaderSubtitleEl = null;
            this._scrollSentinelEl = null;
            this._feedRowMap.clear();
            this._sortedThoughts = [];

            this._feedSectionEl = parent.createEl('section', {
                cls: 'diwa-dh-feed-section',
                attr: { 'aria-label': 'Thought feed' },
            });

            const header = this._feedSectionEl.createEl('div', { cls: 'diwa-dh-feed-section-header' });
            const heading = header.createEl('div', { cls: 'diwa-dh-feed-section-heading' });
            heading.createEl('span', { cls: 'diwa-dh-feed-section-eyebrow', text: 'Workspace feed' });
            const titleRow = heading.createEl('div', { cls: 'diwa-dh-feed-section-title-row' });
            titleRow.createEl('h2', { cls: 'diwa-dh-feed-section-title', text: 'Recent thoughts' });
            this._feedHeaderCountEl = titleRow.createEl('span', {
                cls: 'diwa-dh-feed-section-count',
                text: '(Syncing…)',
            });
            this._feedHeaderSubtitleEl = titleRow.createEl('span', {
                cls: 'diwa-dh-feed-section-subtitle',
                text: 'All contexts · Search titles + markdown · Syncing',
            });
            this._feedSearchSectionEl = header.createEl('div', {
                cls: 'diwa-dh-feed-search-section diwa-dh-feed-control diwa-dh-feed-control--search',
            });

            const controls = this._feedSectionEl.createEl('div', { cls: 'diwa-dh-feed-controls' });
            this._contextFilterSectionEl = controls.createEl('div', {
                cls: 'diwa-dh-feed-context-section diwa-dh-feed-control diwa-dh-feed-control--contexts',
            });

            const feedWrap = this._feedSectionEl.createEl('div', { cls: 'diwa-dh-feed-wrap' });
            this._feedWrapEl = feedWrap;

            this._feedLoadingEl = feedWrap.createEl('div', {
                cls: 'diwa-dh-feed-loading',
                attr: { 'aria-live': 'polite' },
            });
            const loadingSurface = this._feedLoadingEl.createEl('div', {
                cls: 'diwa-dh-feed-state-surface diwa-dh-feed-state-surface--loading',
            });
            loadingSurface.createEl('span', { cls: 'diwa-dh-feed-state-eyebrow', text: 'Syncing' });
            this._feedLoadingTitleEl = loadingSurface.createEl('div', {
                cls: 'diwa-dh-feed-state-title',
                text: 'Loading thoughts…',
            });
            this._feedLoadingBodyEl = loadingSurface.createEl('div', {
                cls: 'diwa-dh-feed-state-body',
                text: 'Pulling your workspace stream into view.',
            });

            this._feedEl = feedWrap.createEl('div', {
                cls: 'diwa-dh-feed-list',
                attr: {
                    'aria-live': 'polite',
                    role: 'list',
                },
            });

            this._feedEmptyEl = feedWrap.createEl('div', {
                cls: 'diwa-dh-feed-empty',
                attr: { 'aria-live': 'polite' },
            });
            const emptySurface = this._feedEmptyEl.createEl('div', {
                cls: 'diwa-dh-feed-state-surface diwa-dh-feed-state-surface--empty',
            });
            emptySurface.createEl('span', { cls: 'diwa-dh-feed-state-eyebrow', text: 'Feed' });
            this._feedEmptyTitleEl = emptySurface.createEl('div', { cls: 'diwa-dh-feed-state-title' });
            this._feedEmptyBodyEl = emptySurface.createEl('div', { cls: 'diwa-dh-feed-state-body' });

            this._scrollSentinelEl = feedWrap.createEl('div', { cls: 'diwa-dh-scroll-sentinel' });
            this.mountScrollObserver();
            this.scheduleFeedRefresh();
        }

        if (this._contextFilterSectionEl) this.renderContextFilter(this._contextFilterSectionEl);
        if (this._feedSearchSectionEl) this.renderFeedSearch(this._feedSearchSectionEl);
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
        if (this._contextFilterSectionEl) {
            this.renderContextFilter(this._contextFilterSectionEl);
        }

        // Show loading state until the index is fully hydrated
        if (!this._thoughtController.isReady()) {
            this.updateFeedHeader(0, 0, 0, '', this._activeContext, true);
            if (this._feedLoadingEl) this._feedLoadingEl.style.display = '';
            if (this._feedEmptyEl) this._feedEmptyEl.style.display = 'none';
            this._feedWrapEl?.toggleClass('is-loading', true);
            this._feedWrapEl?.toggleClass('is-empty', false);
            return;
        }
        if (this._feedLoadingEl) this._feedLoadingEl.style.display = 'none';
        this._feedWrapEl?.toggleClass('is-loading', false);

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
        const nonArchivedThoughts = allThoughts.filter((thought) => !thought.archived);
        let thoughts = nonArchivedThoughts;
        const activeContext = this._activeContext.trim().toLowerCase();
        if (activeContext && activeContext !== 'all') {
            thoughts = thoughts.filter((thought) => (thought.context ?? []).some((ctx) => ctx.toLowerCase() === activeContext));
        }

        // Stable sort: newest first using numeric timestamp (avoids Date-object/string ambiguity)
        thoughts = [...thoughts].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

        const searchQuery = this._feedSearchQuery.trim().toLowerCase();
        if (searchQuery) {
            thoughts = thoughts.filter((thought) => this.matchesThoughtSearch(thought, searchQuery));
        }

        console.log('[FEED] total:', allThoughts.length, 'filtered:', thoughts.length);

        this._sortedThoughts = thoughts;
        const visibleThoughts = thoughts.slice(0, this._visibleCount);
        this.updateFeedHeader(thoughts.length, nonArchivedThoughts.length, visibleThoughts.length, searchQuery, activeContext, false);
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
                (thought.context ?? []).join('|'),
                (thought.links?.tasks ?? []).join('|'),
                (thought.links?.thoughts ?? []).join('|'),
            ].join('¦');

            let row = this._feedRowMap.get(id);
            if (!row) {
                const rootEl = this._feedEl.createEl('div', { cls: 'diwa-dh-thought-row' });
                rootEl.dataset.id = id;
                rootEl.setAttr('role', 'listitem');
                const leftEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-left' });
                const metaEl = leftEl.createEl('div', { cls: 'diwa-dh-thought-row-meta' });
                const timeEl = metaEl.createEl('span', { cls: 'diwa-dh-thought-row-time' });
                const bodyEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-body' });
                const contentEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-content' });
                const textEl = contentEl.createEl('div', { cls: 'diwa-dh-thought-row-text' });
                const metaRailEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-meta-rail' });
                const ctxEl = metaRailEl.createEl('div', { cls: 'diwa-dh-thought-row-ctx' });
                const actionsEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-actions' });
                const editBtn = this.createThoughtActionButton(actionsEl, 'pencil', 'Edit thought', 'diwa-dh-thought-row-action--edit');
                const pinBtn = this.createThoughtActionButton(actionsEl, 'pin', 'Pin thought', 'diwa-dh-thought-row-action--pin');
                const convertBtn = this.createThoughtActionButton(actionsEl, 'list-todo', 'Convert to task', 'diwa-dh-thought-row-action--convert');
                const graphBtn = this.createThoughtActionButton(actionsEl, 'share-2', 'Open Graph Explorer', 'diwa-dh-thought-row-action--graph');
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
                graphBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const currentThought = this._thoughtController.getThought(id);
                    if (!currentThought) return;
                    this.openThoughtGraph(currentThought);
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
                    graphBtn,
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
                this.renderThoughtRowMeta(thought, row);
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
            this._feedWrapEl?.toggleClass('is-empty', !hasVisible);
            if (!hasVisible) {
                const hasNonArchivedThoughts = nonArchivedThoughts.length > 0;
                if (!hasNonArchivedThoughts) {
                    this.setFeedEmptyState(
                        'Nothing captured yet',
                        'Your first thought will land here as soon as you save it above.',
                    );
                } else if (searchQuery && activeContext !== 'all') {
                    this.setFeedEmptyState(
                        'No matches in this lane',
                        'Try another context or broaden the search to bring thoughts back into view.',
                    );
                } else if (searchQuery) {
                    this.setFeedEmptyState(
                        'No search matches',
                        'Adjust the query to surface thoughts from the current stream.',
                    );
                } else if (activeContext !== 'all') {
                    this.setFeedEmptyState(
                        'This context is quiet',
                        'Switch filters or capture a new thought to seed this context.',
                    );
                } else {
                    this.setFeedEmptyState(
                        'Nothing captured yet',
                        'Your first thought will land here as soon as you save it above.',
                    );
                }
            }
        }
    }

    private updateFeedHeader(
        filteredCount: number,
        totalNonArchived: number,
        visibleCount: number,
        searchQuery: string,
        activeContext: string,
        isLoading: boolean,
    ): void {
        if (this._feedHeaderCountEl) {
            const countLabel = isLoading
                ? '(Syncing…)'
                : `(${filteredCount} ${filteredCount === 1 ? 'thought' : 'thoughts'})`;
            this._feedHeaderCountEl.setText(countLabel);
        }

        if (!this._feedHeaderSubtitleEl) return;
        if (isLoading) {
            this._feedHeaderSubtitleEl.setText('All contexts · Search titles + markdown · Syncing');
            return;
        }

        const segments: string[] = [];
        if (activeContext !== 'all') {
            segments.push(`#${activeContext}`);
        } else {
            segments.push('All contexts');
        }
        if (searchQuery) {
            const compactQuery = searchQuery.length > 32 ? `${searchQuery.slice(0, 29)}...` : searchQuery;
            segments.push(`Search: "${compactQuery}"`);
        } else {
            segments.push('Search titles + markdown');
        }
        if (filteredCount === 0) {
            segments.push('0 shown');
        } else if (visibleCount < filteredCount) {
            segments.push(`${visibleCount}/${filteredCount} shown`);
        } else if (filteredCount > 0 && totalNonArchived > filteredCount) {
            segments.push(`${filteredCount}/${totalNonArchived} shown`);
        } else {
            segments.push('Newest first');
        }
        this._feedHeaderSubtitleEl.setText(segments.join(' · '));
    }

    private setFeedEmptyState(title: string, body: string): void {
        this._feedEmptyTitleEl?.setText(title);
        this._feedEmptyBodyEl?.setText(body);
    }

    private renderThoughtRowMeta(thought: ThoughtEntry, row: FeedRowRef): void {
        row.ctxEl.empty();

        const metaItems: { text: string; cls: string }[] = [];
        if (thought.pinned) {
            metaItems.push({
                text: 'Pinned',
                cls: 'diwa-dh-thought-row-meta-pill diwa-dh-thought-row-meta-pill--pinned',
            });
        }

        const contexts = [...new Set((thought.context ?? []).map((context) => context.trim()).filter(Boolean))];
        for (const context of contexts.slice(0, 4)) {
            metaItems.push({
                text: `#${context}`,
                cls: 'diwa-dh-thought-row-meta-pill diwa-dh-thought-row-meta-pill--context',
            });
        }
        if (contexts.length > 4) {
            metaItems.push({
                text: `+${contexts.length - 4}`,
                cls: 'diwa-dh-thought-row-meta-pill diwa-dh-thought-row-meta-pill--overflow',
            });
        }

        row.ctxEl.style.display = metaItems.length > 0 ? '' : 'none';
        metaItems.forEach((item) => {
            row.ctxEl.createEl('span', {
                cls: item.cls,
                text: item.text,
            });
        });
    }

    private renderContextFilter(parent: HTMLElement): void {
        parent.empty();
        const contexts = this.plugin.getContexts();
        if (this._activeContext !== 'all' && !contexts.some((ctx) => ctx.toLowerCase() === this._activeContext.toLowerCase())) {
            this._activeContext = 'all';
        }
        this.updateCaptureHint();

        const chipRow = parent.createEl('div', {
            cls: 'diwa-dh-feed-contexts',
            attr: { 'aria-label': 'Thought context filters' },
        });

        for (const context of ['all', ...contexts]) {
            const isActive = this._activeContext.toLowerCase() === context.toLowerCase();
            const chip = chipRow.createEl('button', {
                cls: `diwa-dh-feed-context-btn${isActive ? ' is-active' : ''}`,
                text: context === 'all' ? 'All' : `#${context}`,
                attr: {
                    type: 'button',
                    'aria-pressed': isActive ? 'true' : 'false',
                },
            }) as HTMLButtonElement;

            chip.addEventListener('click', () => {
                if (this._activeContext.toLowerCase() === context.toLowerCase()) return;
                this._activeContext = context;
                this._visibleCount = 50;
                this.renderContextFilter(parent);
                this.scheduleFeedRefresh();
            });
        }
    }

    private getSelectedCaptureContexts(): string[] {
        const activeContext = this._activeContext.trim();
        if (!activeContext || activeContext.toLowerCase() === 'all') {
            return [];
        }
        const matchedContext = this.plugin.getContexts().find((context) => context.toLowerCase() === activeContext.toLowerCase());
        return matchedContext ? [matchedContext] : [];
    }

    private updateCaptureHint(): void {
        if (!this._captureHintEl) return;
        const selectedContext = this.getSelectedCaptureContexts()[0];
        this._captureHintEl.setText(
            selectedContext
                ? `Saving to #${selectedContext}  •  Enter → save  •  Shift+Enter → multiline`
                : 'Enter → save  •  Shift+Enter → multiline',
        );
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
                enableImageZoom(this.app, currentRow.textEl);
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

    private openThoughtGraph(thought: ThoughtEntry): void {
        const graphPlugin = this.plugin as DiwaPlugin & ThoughtGraphPlugin;
        const payload: ThoughtGraphPayload = {
            thought,
            seed: thought,
            kind: 'thought',
            type: 'thought',
        };
        const openGraph = typeof graphPlugin.openThoughtGraph === 'function'
            ? () => graphPlugin.openThoughtGraph!(thought)
            : typeof graphPlugin.openGraphExplorer === 'function'
                ? () => graphPlugin.openGraphExplorer!(payload)
                : typeof graphPlugin.openGraph === 'function'
                    ? () => graphPlugin.openGraph!(payload)
                    : null;

        if (!openGraph) {
            new Notice('Graph Explorer is not available yet.');
            return;
        }

        try {
            const result = openGraph();
            void Promise.resolve(result).catch((error) => {
                console.error('[DesktopHubView] Failed to open thought graph.', error);
                new Notice('Unable to open Graph Explorer right now.');
            });
        } catch (error) {
            console.error('[DesktopHubView] Failed to open thought graph.', error);
            new Notice('Unable to open Graph Explorer right now.');
        }
    }

    private syncThoughtRowActions(thought: ThoughtEntry, row: FeedRowRef): void {
        const linkedTaskCount = this._taskController.getLinkedTasksForThought(thought.filePath).length
            || (thought.links?.tasks ?? []).filter((value) => value.trim().length > 0).length;
        const linkedThoughtCount = this.getLinkedThoughtRefs(thought).size;
        const hasLinkedTasks = linkedTaskCount > 0;
        const hasLinkedThoughts = linkedThoughtCount > 0;

        row.rootEl.toggleClass('is-pinned', !!thought.pinned);
        row.rootEl.toggleClass('has-linked-task', hasLinkedTasks);
        row.rootEl.toggleClass('has-linked-thought', hasLinkedThoughts);
        row.rootEl.setAttr('data-context-count', String((thought.context ?? []).filter((value) => value.trim().length > 0).length));

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
            const panel = parent.createEl('section', {
                cls: 'diwa-dh-capture-panel',
                attr: { 'aria-label': 'Capture a thought' },
            });
            const panelHeader = panel.createEl('div', { cls: 'diwa-dh-capture-panel-header' });
            panelHeader.createEl('span', { cls: 'diwa-dh-capture-eyebrow', text: 'Capture' });
            const panelCopy = panelHeader.createEl('div', { cls: 'diwa-dh-capture-heading' });
            panelCopy.createEl('div', { cls: 'diwa-dh-capture-title', text: 'Drop the next thought' });
            panelCopy.createEl('div', {
                cls: 'diwa-dh-capture-subtitle',
                text: 'Quick capture feeds the stream below without leaving the workspace.',
            });

            const panelBody = panel.createEl('div', { cls: 'diwa-dh-capture-panel-body' });
            const capture = panelBody.createEl('div', { cls: 'diwa-dh-capture' });
            const hintId = `diwa-dh-capture-hint-${Date.now().toString(36)}`;
            const textarea = capture.createEl('textarea', {
                cls: 'diwa-dh-capture-textarea',
                attr: {
                    rows: '2',
                    placeholder: 'Think here...',
                    'aria-describedby': hintId,
                },
            }) as HTMLTextAreaElement;
            const contextHint = capture.createEl('div', {
                cls: 'diwa-dh-capture-hint',
                attr: { id: hintId },
            });
            this._captureInputEl = textarea;
            this._captureHintEl = contextHint;

            const autosize = () => this.syncCaptureTextareaHeight();
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
            attachMediaPasteHandler(
                this.app,
                textarea,
                () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
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
                    const created = await this._thoughtController.addThought({
                        content: raw,
                        context: this.getSelectedCaptureContexts(),
                    });
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
        this.updateCaptureHint();
    }

    private syncCaptureTextareaHeight(): void {
        const textarea = this._captureInputEl;
        if (!textarea) return;
        if (this.isFocusMode && !this.isMobile()) {
            textarea.style.removeProperty('height');
            return;
        }
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
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
            input.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'Escape' || !input.value) return;
                event.preventDefault();
                input.value = '';
                if (!this._feedSearchQuery) return;
                this._feedSearchQuery = '';
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

    private getWorkspaceRoot(): HTMLElement | null {
        const root = this.containerEl.children[1];
        return root instanceof HTMLElement ? root : null;
    }

    private applyRightPaneWidth(): void {
        const root = this.getWorkspaceRoot();
        if (!root) return;
        root.style.setProperty('--diwa-dh-right-w', `${clampDesktopRightPaneWidth(this._rightPaneWidth)}px`);
        this.syncRightPaneResizeAccessibility();
    }

    private syncRightPaneResizeAccessibility(): void {
        if (!this._rightResizeHandleEl) return;
        const width = clampDesktopRightPaneWidth(this._rightPaneWidth);
        this._rightResizeHandleEl.setAttribute('aria-valuemin', String(DESKTOP_RIGHT_PANE_MIN_WIDTH));
        this._rightResizeHandleEl.setAttribute('aria-valuemax', String(DESKTOP_RIGHT_PANE_MAX_WIDTH));
        this._rightResizeHandleEl.setAttribute('aria-valuenow', String(width));
        this._rightResizeHandleEl.setAttribute('aria-valuetext', `${width}px`);
        this._rightResizeHandleEl.setAttribute('title', `Right pane width: ${width}px`);
    }

    private setRightPaneWidth(width: number, options: { persist?: boolean } = {}): void {
        const nextWidth = clampDesktopRightPaneWidth(width);
        if (nextWidth === this._rightPaneWidth) {
            if (options.persist) this.requestWorkspaceLayoutSave();
            return;
        }
        this._rightPaneWidth = nextWidth;
        this.applyRightPaneWidth();
        if (options.persist) this.requestWorkspaceLayoutSave();
    }

    private bindRightPaneResize(handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0 || !this._rightEl) return;
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = this._rightEl.getBoundingClientRect().width || this._rightPaneWidth;
            const win = handle.ownerDocument.defaultView ?? window;
            this.teardownRightPaneResize();
            this._wrapEl?.addClass('is-right-resizing');
            handle.addClass('is-active');
            handle.focus();

            this._rightResizeWindow = win;
            this._rightResizeMoveHandler = (moveEvent: PointerEvent) => {
                const deltaX = moveEvent.clientX - startX;
                this.setRightPaneWidth(startWidth - deltaX);
            };
            this._rightResizeStopHandler = () => {
                this.teardownRightPaneResize();
                this.requestWorkspaceLayoutSave();
            };
            win.addEventListener('pointermove', this._rightResizeMoveHandler);
            win.addEventListener('pointerup', this._rightResizeStopHandler);
            win.addEventListener('pointercancel', this._rightResizeStopHandler);
        });

        handle.addEventListener('keydown', (event: KeyboardEvent) => {
            let nextWidth: number | null = null;
            switch (event.key) {
                case 'ArrowLeft':
                    nextWidth = this._rightPaneWidth + DESKTOP_RIGHT_PANE_KEYBOARD_STEP;
                    break;
                case 'ArrowRight':
                    nextWidth = this._rightPaneWidth - DESKTOP_RIGHT_PANE_KEYBOARD_STEP;
                    break;
                case 'Home':
                    nextWidth = DESKTOP_RIGHT_PANE_MIN_WIDTH;
                    break;
                case 'End':
                    nextWidth = DESKTOP_RIGHT_PANE_MAX_WIDTH;
                    break;
                default:
                    return;
            }
            event.preventDefault();
            this.setRightPaneWidth(nextWidth, { persist: true });
        });
    }

    private teardownRightPaneResize(): void {
        if (this._rightResizeWindow && this._rightResizeMoveHandler) {
            this._rightResizeWindow.removeEventListener('pointermove', this._rightResizeMoveHandler);
        }
        if (this._rightResizeWindow && this._rightResizeStopHandler) {
            this._rightResizeWindow.removeEventListener('pointerup', this._rightResizeStopHandler);
            this._rightResizeWindow.removeEventListener('pointercancel', this._rightResizeStopHandler);
        }
        this._rightResizeMoveHandler = null;
        this._rightResizeStopHandler = null;
        this._rightResizeWindow = null;
        this._wrapEl?.removeClass('is-right-resizing');
        this._rightResizeHandleEl?.removeClass('is-active');
    }

    private requestWorkspaceLayoutSave(): void {
        const workspaceWithSave = this.app.workspace as typeof this.app.workspace & {
            requestSaveLayout?: () => void;
        };
        workspaceWithSave.requestSaveLayout?.();
    }
}

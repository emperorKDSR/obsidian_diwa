import { ItemView, WorkspaceLeaf, setIcon, Notice, ViewStateResult, MarkdownRenderer, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, JOURNAL_ICON_ID,
} from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler, isTablet } from '../utils';
import type { TaskEntry, ThoughtEntry } from '../types';
import { DesktopTaskPaneView } from './DesktopTaskPane';
import { TaskController } from './TaskController';
import { ThoughtController } from './ThoughtController';
import { enableImageZoom } from '../utils/imageZoom';
import { VIEW_TYPE_DIWA_MINDMAP } from '../constants';
import { FastTaskCaptureModal, type FastTaskCapturePayload } from '../modals/FastTaskCaptureModal';
import { MobilePostComposerModal } from '../modals/MobilePostComposerModal';

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
    canvasBtn: HTMLButtonElement;
    sig: string;
    renderToken: number;
}

interface ThoughtLinkState {
    linkedTaskRefs: Set<string>;
    linkedTaskCount: number;
    linkedThoughtCount: number;
}

interface FeedProjection {
    key: string;
    activeContext: string;
    searchQuery: string;
    totalNonArchived: number;
    thoughts: ThoughtEntry[];
}

interface TaskLinkIndexEntry {
    taskIds: Set<string>;
    linkedTaskRefs: Set<string>;
}

interface TaskLinkIndex {
    tasksByThoughtRef: Map<string, TaskLinkIndexEntry>;
    sortedTasks: TaskEntry[];
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

const DESKTOP_RIGHT_PANE_DEFAULT_WIDTH = 272;
const DESKTOP_RIGHT_PANE_MIN_WIDTH = 240;
const DESKTOP_RIGHT_PANE_MAX_WIDTH = 420;
const DESKTOP_RIGHT_PANE_KEYBOARD_STEP = 16;
type RightPaneMode = 'tasks' | 'pinned';

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
    _taskTogglePending: number = 0;

    // Task panel filter: 'upcoming' = next 2 days + undated; 'all' = everything
    _taskFilter: 'today' | 'upcoming' | 'all' = 'today';

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;
    private _wrapEl: HTMLElement | null = null;
    private _topBarEl: HTMLElement | null = null;
    private _sidebarEl: HTMLElement | null = null;
    private _centerEl: HTMLElement | null = null;
    private _rightResizeHandleEl: HTMLElement | null = null;
    private _rightEl: HTMLElement | null = null;
    private _taskPaneView: DesktopTaskPaneView | null = null;
    private _rightPaneMode: RightPaneMode = 'tasks';
    private _rightPaneShellEl: HTMLElement | null = null;
    private _rightPaneTasksHostEl: HTMLElement | null = null;
    private _rightPanePinnedHostEl: HTMLElement | null = null;
    private _rightPaneTasksBtnEl: HTMLButtonElement | null = null;
    private _rightPanePinnedBtnEl: HTMLButtonElement | null = null;
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
    private _feedProjectionVersion: number = 0;
    private _feedProjectionCache: FeedProjection | null = null;
    private _taskLinkIndex: TaskLinkIndex | null = null;
    private _contextFilterKey: string = '';
    private _rightPaneWidth: number = DESKTOP_RIGHT_PANE_DEFAULT_WIDTH;
    private _rightResizeMoveHandler: ((event: PointerEvent) => void) | null = null;
    private _rightResizeStopHandler: ((event: PointerEvent) => void) | null = null;
    private _rightResizeWindow: Window | null = null;

    private _mobileViewMode: 'hub' | 'feed' = 'hub';
    
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
            rightPaneMode: this._rightPaneMode,
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
        this._rightPaneMode = this.normalizeRightPaneMode(state?.rightPaneMode);
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';

        // Immersive mobile mode: programmatically hide Obsidian chrome
        this.setMobileImmersive(true);

        this._thoughtUnsubscribe = this._thoughtController.subscribe(() => {
            this.invalidateFeedProjection();
            this.scheduleFeedRefresh();
            this.renderPinnedNotesPane();
        });
        this.renderView();
        // Wait for the index to be fully ready before the first real feed render.
        // This eliminates the race condition where the view renders before buildIndices() completes.
        this._thoughtController.readyPromise.then(() => {
            if (!this._closed) {
                this.invalidateFeedProjection();
                this.scheduleFeedRefresh();
            }
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

        // Restore Obsidian mobile chrome
        this.setMobileImmersive(false);
    }

    /**
     * Toggle Obsidian's mobile chrome (navbar, header, tab strip) on/off.
     * Uses direct DOM manipulation as a bulletproof fallback for all WebViews.
     */
    private setMobileImmersive(immersive: boolean): void {
        // Always toggle the body class for CSS-based hiding
        document.body.classList.toggle('is-diwa-v2-active', immersive);

        // Only manipulate DOM on actual mobile
        if (!(this.app as any).isMobile) return;

        const selectors = [
            '.mobile-navbar',
            '.mobile-toolbar',
            '.view-header',
            '.workspace-tab-header-container',
            '.titlebar',
        ];

        for (const sel of selectors) {
            const els = document.querySelectorAll<HTMLElement>(sel);
            els.forEach(el => {
                el.style.display = immersive ? 'none' : '';
            });
        }

        // Zero out app-container padding (safe-area-inset-top)
        const appContainer = document.querySelector<HTMLElement>('.app-container');
        if (appContainer) {
            appContainer.style.paddingTop = immersive ? '0px' : '';
        }

        // Zero out body padding
        document.body.style.paddingTop = immersive ? '0px' : '';
    }

    renderView() {
        if (this._capturePending > 0 || this._taskPending > 0 || this._taskTogglePending > 0) return;

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

    refreshTasks(): void {
        if (this._taskTogglePending > 0) return;
        this.invalidateTaskLinkIndex();
        this.updateTaskPaneFromIndex();
        this.scheduleFeedRefresh();
    }

    refreshAll(): void {
        this.invalidateTaskLinkIndex();
        this.renderView();
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
        this.renderPinnedNotesPane();
        this.syncRightPaneModeUI();
    }

    private applyMobileLayout(root: HTMLElement): void {
        this.resetLayoutRefs();
        root.empty();
        
        if (this._mobileViewMode === 'feed') {
            const feedPage = root.createEl('div', { cls: 'diwa-mobile-feed-page' });
            
            // ── Sticky Header ──
            const header = feedPage.createEl('header', { cls: 'diwa-mobile-feed-header' });
            
            const headerLeft = header.createEl('div', { cls: 'diwa-mobile-feed-header-left' });
            const backBtn = headerLeft.createEl('button', { cls: 'diwa-mobile-feed-back', attr: { 'aria-label': 'Back to Hub' } });
            setIcon(backBtn, 'chevron-left');
            backBtn.addEventListener('click', () => {
                this._mobileViewMode = 'hub';
                this.renderView();
            });
            
            headerLeft.createEl('h2', { text: 'Thoughts', cls: 'diwa-mobile-feed-title' });
            
            const allThoughts = Array.from(this.plugin.index.thoughtIndex.values())
                .filter(t => !t.journalType);
            const headerCount = header.createEl('span', { cls: 'diwa-mobile-feed-count', text: `${allThoughts.length}` });
            
            // ── Search Bar ──
            const searchWrap = feedPage.createEl('div', { cls: 'diwa-mobile-feed-search-wrap' });
            const searchInput = searchWrap.createEl('input', {
                cls: 'diwa-mobile-feed-search',
                attr: { type: 'text', placeholder: 'Search thoughts…' },
            }) as HTMLInputElement;
            
            // ── Feed List ──
            const feedList = feedPage.createEl('div', { cls: 'diwa-mobile-feed-list' });
            
            const renderList = (query: string) => {
                feedList.empty();
                let filtered = allThoughts
                    .sort((a, b) => {
                        const ta = a.modified || a.created || '';
                        const tb = b.modified || b.created || '';
                        return tb.localeCompare(ta);
                    });
                
                if (query) {
                    const q = query.toLowerCase();
                    filtered = filtered.filter(t =>
                        (t.title || '').toLowerCase().includes(q) ||
                        (t.body || '').toLowerCase().includes(q) ||
                        (t.context || []).some(c => c.toLowerCase().includes(q))
                    );
                }
                
                headerCount.textContent = `${filtered.length}`;
                
                if (filtered.length === 0) {
                    const emptyEl = feedList.createEl('div', { cls: 'diwa-mobile-feed-empty' });
                    const emptyIcon = emptyEl.createEl('span', { cls: 'diwa-mobile-feed-empty-icon' });
                    setIcon(emptyIcon, query ? 'search-x' : 'lightbulb');
                    emptyEl.createEl('p', { text: query ? 'No thoughts match your search.' : 'No thoughts yet. Capture your first one!' });
                    return;
                }
                
                for (const thought of filtered.slice(0, this._visibleCount)) {
                    const card = feedList.createEl('div', { cls: 'diwa-mobile-feed-card' });
                    
                    // Title row
                    const titleRow = card.createEl('div', { cls: 'diwa-mobile-feed-card-title-row' });
                    const title = thought.title || 'Untitled thought';
                    titleRow.createEl('span', { cls: 'diwa-mobile-feed-card-title', text: title });
                    
                    // Timestamp
                    const ts = thought.modified || thought.created || '';
                    if (ts) {
                        const m = (window as any).moment?.(ts, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss']);
                        const timeText = m?.isValid() ? m.fromNow() : ts;
                        titleRow.createEl('span', { cls: 'diwa-mobile-feed-card-time', text: timeText });
                    }
                    
                    // Body preview (rendered markdown)
                    const bodyText = (thought.body || '').trim();
                    if (bodyText) {
                        const bodyEl = card.createEl('div', { cls: 'diwa-mobile-feed-card-body' });
                        void MarkdownRenderer.render(
                            this.app,
                            bodyText,
                            bodyEl,
                            thought.filePath || '',
                            this,
                        );
                    }
                    
                    // Context tags
                    const contexts = (thought.context || []).filter(Boolean);
                    if (contexts.length > 0) {
                        const tagsRow = card.createEl('div', { cls: 'diwa-mobile-feed-card-tags' });
                        for (const ctx of contexts.slice(0, 4)) {
                            tagsRow.createEl('span', { cls: 'diwa-mobile-feed-card-tag', text: `#${ctx}` });
                        }
                    }
                    
                    card.addEventListener('click', () => {
                        this.openThoughtSheet(thought);
                    });
                }
            };
            
            renderList('');
            
            searchInput.addEventListener('input', () => {
                renderList(searchInput.value.trim());
            });
            
            return;
        }
        
        const hub = root.createEl('div', { cls: 'diwa-mobile-hub-premium' });

        // Ambient Background Glows
        hub.createEl('div', { cls: 'diwa-bg-glow glow-1' });
        hub.createEl('div', { cls: 'diwa-bg-glow glow-2' });

        // Header
        const header = hub.createEl('header', { cls: 'diwa-header' });
        const greetingWrap = header.createEl('div', { cls: 'diwa-greeting-container' });
        
        const now = new Date();
        const hour = now.getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';
        
        greetingWrap.createEl('h1', { cls: 'diwa-greeting', text: greeting });
        
        const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
        const dateString = now.toLocaleDateString('en-US', dateOptions);
        greetingWrap.createEl('span', { cls: 'diwa-date-meta', text: dateString });
        
        const progressRing = header.createEl('div', { cls: 'diwa-progress-ring-container' });
        progressRing.innerHTML = `
            <svg class="progress-svg" viewBox="0 0 36 36">
                <circle class="ring-bg" cx="18" cy="18" r="16" />
                <circle class="ring-progress" cx="18" cy="18" r="16" stroke-dasharray="100" stroke-dashoffset="40" />
            </svg>
        `;

        // Bento Grid
        const nav = hub.createEl('nav', { cls: 'diwa-bento-grid' });
        
        // Stats Calculation for Today
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        const notesCreatedToday = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day === todayStr).length;
            
        const tasks = Array.from(this.plugin.index.taskIndex.values());
        const openTasksCount = tasks.filter(t => t.status !== 'done').length;
        const tasksDueToday = tasks.filter(t => t.due === todayStr && t.status !== 'done').length;

        // Today Card
        const todayCard = nav.createEl('button', { cls: 'diwa-bento-card card-primary glass-panel' });
        
        // Top section: Icon on left, Tasks on right
        const todayTopSection = todayCard.createEl('div');
        todayTopSection.setAttribute('style', 'display: flex; flex-direction: row; gap: 16px; width: 100%; align-items: stretch;');
        
        const todayIconWrap = todayTopSection.createEl('div', { cls: 'card-icon-wrapper' });
        todayIconWrap.style.flexDirection = 'column';
        todayIconWrap.style.gap = '4px';
        todayIconWrap.style.margin = '0'; // Override margin-bottom: auto so it doesn't break row layout
        
        const todayIcon = todayIconWrap.createEl('div', { cls: 'card-icon' });
        setIcon(todayIcon, 'loader');
        
        const todayTitle = todayIconWrap.createEl('span', { cls: 'card-title', text: 'Today' });
        todayTitle.style.fontSize = '13px';
        todayTitle.style.fontWeight = '600';
        todayTitle.style.marginTop = '4px';
        
        // Top 3 tasks list beside the icon
        const todayTasksList = todayTopSection.createEl('div');
        todayTasksList.setAttribute('style', 'display: flex; flex-direction: column; gap: 6px; flex: 1; text-align: left; justify-content: center; overflow: hidden; padding-top: 4px;');
        
        const openTasksList = tasks.filter(t => t.status !== 'done');
        // Sort by due date (closest first)
        const topTasks = openTasksList.sort((a, b) => {
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return 0;
        }).slice(0, 3);
        
        for (const task of topTasks) {
            const taskRow = todayTasksList.createEl('div');
            taskRow.setAttribute('style', 'display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-normal); overflow: hidden;');
            taskRow.innerHTML = `<span style="display: inline-block; min-width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--interactive-accent);"></span><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${task.title}</span>`;
        }
        
        if (topTasks.length === 0) {
            const emptyMsg = todayTasksList.createEl('span', { text: 'All caught up!' });
            emptyMsg.setAttribute('style', 'font-size: 13px; color: var(--text-muted); font-style: italic;');
        }
        
        const todayContent = todayCard.createEl('div', { cls: 'card-content' });
        todayContent.setAttribute('style', 'margin-top: auto;');
        todayContent.createEl('span', { cls: 'card-subtitle', text: `${notesCreatedToday} notes • ${tasksDueToday} due • ${openTasksCount} open` });
        todayCard.addEventListener('click', () => {
            new Notice('Today view coming soon!');
        });

        // Dynamic Weather Icon
        const fetchWeather = async () => {
            if (!navigator.onLine) {
                setIcon(todayIcon, 'wifi-off');
                return;
            }
            try {
                const ipRes = await fetch('https://ipapi.co/json/');
                if (!ipRes.ok) throw new Error();
                const ipData = await ipRes.json();
                
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ipData.latitude}&longitude=${ipData.longitude}&current_weather=true`);
                if (!weatherRes.ok) throw new Error();
                const weatherData = await weatherRes.json();
                
                const code = weatherData.current_weather.weathercode;
                const isDay = weatherData.current_weather.is_day;
                
                let iconName = 'sun';
                if (code === 0) iconName = isDay ? 'sun' : 'moon';
                else if (code >= 1 && code <= 3) iconName = isDay ? 'cloud-sun' : 'cloud-moon';
                else if (code >= 45 && code <= 48) iconName = 'cloud-fog';
                else if (code >= 51 && code <= 67) iconName = 'cloud-rain';
                else if (code >= 71 && code <= 77) iconName = 'snowflake';
                else if (code >= 80 && code <= 82) iconName = 'cloud-rain';
                else if (code >= 95) iconName = 'cloud-lightning';
                else iconName = 'cloud';
                
                setIcon(todayIcon, iconName);
            } catch (e) {
                setIcon(todayIcon, 'cloud-off');
            }
        };
        fetchWeather();
        
        // Diwa Card
        const diwaCard = nav.createEl('button', { cls: 'diwa-bento-card glass-panel' });
        const diwaTopRow = diwaCard.createEl('div');
        diwaTopRow.setAttribute('style', 'display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%;');
        
        const diwaIconWrap = diwaTopRow.createEl('div', { cls: 'card-icon-wrapper' });
        diwaIconWrap.setAttribute('style', 'margin-bottom: 0;');
        const diwaIcon = diwaIconWrap.createEl('div', { cls: 'card-icon' });
        setIcon(diwaIcon, 'inbox');
        
        const allThoughts = Array.from(this.plugin.index.thoughtIndex.values());
        const diwaCount = allThoughts.filter(t => !t.journalType).length; 
        const diwaStat = diwaTopRow.createEl('span', { text: `${diwaCount}` });
        diwaStat.setAttribute('style', 'font-size: 24px; font-weight: 700; line-height: 1;');
        
        const diwaTitle = diwaCard.createEl('span', { cls: 'card-title', text: 'Diwa' });
        diwaTitle.setAttribute('style', 'margin-top: auto;');
        
        diwaCard.addEventListener('click', () => {
            new MobilePostComposerModal(this.app, this.plugin).open();
        });
        
        // Gawa Card
        const gawaCard = nav.createEl('button', { cls: 'diwa-bento-card glass-panel' });
        const gawaTopRow = gawaCard.createEl('div');
        gawaTopRow.setAttribute('style', 'display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%;');
        
        const gawaIconWrap = gawaTopRow.createEl('div', { cls: 'card-icon-wrapper' });
        gawaIconWrap.setAttribute('style', 'margin-bottom: 0;');
        const gawaIcon = gawaIconWrap.createEl('div', { cls: 'card-icon' });
        setIcon(gawaIcon, 'list-todo');
        
        const gawaStat = gawaTopRow.createEl('span', { text: `${openTasksCount}` });
        gawaStat.setAttribute('style', 'font-size: 24px; font-weight: 700; line-height: 1;');
        
        const gawaTitle = gawaCard.createEl('span', { cls: 'card-title', text: 'Gawa' });
        gawaTitle.setAttribute('style', 'margin-top: auto;');
        
        gawaCard.addEventListener('click', () => {
            void this.plugin.activateView('review-gawa');
        });

        // Journal Card
        const journalCard = nav.createEl('button', { cls: 'diwa-bento-card glass-panel' });
        const journalTopRow = journalCard.createEl('div');
        journalTopRow.setAttribute('style', 'display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%;');
        
        const journalIconWrap = journalTopRow.createEl('div', { cls: 'card-icon-wrapper' });
        journalIconWrap.setAttribute('style', 'margin-bottom: 0;');
        const journalIcon = journalIconWrap.createEl('div', { cls: 'card-icon' });
        setIcon(journalIcon, 'book-open');
        
        const journalCount = allThoughts.filter(t => !!t.journalType).length;
        const journalStat = journalTopRow.createEl('span', { text: `${journalCount}` });
        journalStat.setAttribute('style', 'font-size: 24px; font-weight: 700; line-height: 1;');
        
        const journalTitle = journalCard.createEl('span', { cls: 'card-title', text: 'Journal' });
        journalTitle.setAttribute('style', 'margin-top: auto;');
        
        journalCard.addEventListener('click', () => {
            void this.plugin.activateView('journal');
        });

        // Thoughts Feed Card
        const feedCard = nav.createEl('button', { cls: 'diwa-bento-card glass-panel' });
        const feedTopRow = feedCard.createEl('div');
        feedTopRow.setAttribute('style', 'display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 100%;');
        
        const feedIconWrap = feedTopRow.createEl('div', { cls: 'card-icon-wrapper' });
        feedIconWrap.setAttribute('style', 'margin-bottom: 0;');
        const feedIcon = feedIconWrap.createEl('div', { cls: 'card-icon' });
        setIcon(feedIcon, 'rss');
        
        const feedStat = feedTopRow.createEl('span', { text: `${allThoughts.length}` });
        feedStat.setAttribute('style', 'font-size: 24px; font-weight: 700; line-height: 1;');
        
        const feedTitle = feedCard.createEl('span', { cls: 'card-title', text: 'Thoughts' });
        feedTitle.setAttribute('style', 'margin-top: auto;');
        
        feedCard.addEventListener('click', () => {
            this._mobileViewMode = 'feed';
            this.renderView();
        });
    }

    updateTaskPaneFromIndex(): void {
        if (this._taskTogglePending > 0) return;
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
            attr: { 'aria-label': 'Workspace side pane' },
        });
        this.applyRightPaneWidth();
        this.mountRightPane(this._rightEl);
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
        this._rightPaneShellEl = null;
        this._rightPaneTasksHostEl = null;
        this._rightPanePinnedHostEl = null;
        this._rightPaneTasksBtnEl = null;
        this._rightPanePinnedBtnEl = null;
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
        this._feedProjectionCache = null;
        this._taskLinkIndex = null;
        this._contextFilterKey = '';
        this._visibleCount = 50;
        this._renderVersion = 0;
        this._pendingFeedRender = false;
        this._isFeedRendering = false;
        this._feedProjectionVersion = 0;
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
                title: 'Modules',
                variant: 'primary',
                items: [
                    { label: 'Gawa', icon: 'lucide-check-square-2', tab: 'review-gawa' },
                    { label: 'Bulsa', icon: PF_ICON_ID, tab: 'dues' },
                    { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
                    { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
                ],
            },
            {
                title: 'System',
                variant: 'utility',
                items: [
                    { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
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

        const projection = this.getFeedProjection();
        const { activeContext, searchQuery } = projection;
        const thoughts = projection.thoughts;
        this._sortedThoughts = thoughts;
        const visibleThoughts = thoughts.slice(0, this._visibleCount);
        const visibleThoughtLinkState = this.buildThoughtLinkState(visibleThoughts);
        this.updateFeedHeader(thoughts.length, projection.totalNonArchived, visibleThoughts.length, searchQuery, activeContext, false);
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
                const textEl = contentEl.createEl('div', { cls: 'diwa-dh-thought-row-text markdown-rendered' });
                const metaRailEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-meta-rail' });
                const ctxEl = metaRailEl.createEl('div', { cls: 'diwa-dh-thought-row-ctx' });
                const actionsEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-actions' });
                const editBtn = this.createThoughtActionButton(actionsEl, 'pencil', 'Edit thought', 'diwa-dh-thought-row-action--edit');
                const pinBtn = this.createThoughtActionButton(actionsEl, 'pin', 'Pin thought', 'diwa-dh-thought-row-action--pin');
                const convertBtn = this.createThoughtActionButton(actionsEl, 'list-todo', 'Convert to task', 'diwa-dh-thought-row-action--convert');
                const linkTaskBtn = this.createThoughtActionButton(actionsEl, 'link', 'Link to task', 'diwa-dh-thought-row-action--link-task');
                const linkThoughtBtn = this.createThoughtActionButton(actionsEl, 'git-merge', 'Link to thought', 'diwa-dh-thought-row-action--link-thought');
                const canvasBtn = this.createThoughtActionButton(actionsEl, 'map', 'Canvas Mind Map', 'diwa-dh-thought-row-action--canvas');
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
                    const converted = await this._taskController.convertThoughtToTask(id);
                    if (!converted) return;
                    this.invalidateTaskLinkIndex();
                    this.scheduleFeedRefresh();
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
                canvasBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const t = this._thoughtController.getThought(id);
                    if (t) {
                        const leaf = this.app.workspace.getLeaf(true);
                        await leaf.setViewState({
                            type: VIEW_TYPE_DIWA_MINDMAP,
                            active: true,
                            state: { file: t.filePath }
                        });
                        this.app.workspace.revealLeaf(leaf);
                    }
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
                    canvasBtn,
                    sig: '',
                    renderToken: 0,
                };
                row.ctxEl.style.display = 'none';
                this._feedRowMap.set(id, row);
            }

            this.syncThoughtRowActions(thought, row, visibleThoughtLinkState.get(thought.filePath));
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
                const hasNonArchivedThoughts = projection.totalNonArchived > 0;
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

    private invalidateFeedProjection(): void {
        this._feedProjectionVersion++;
        this._feedProjectionCache = null;
    }

    private invalidateTaskLinkIndex(): void {
        this._taskLinkIndex = null;
    }

    private getFeedProjection(): FeedProjection {
        const activeContext = this._activeContext.trim().toLowerCase() || 'all';
        const searchQuery = this._feedSearchQuery.trim().toLowerCase();
        const key = `${this._feedProjectionVersion}¦${activeContext}¦${searchQuery}`;
        if (this._feedProjectionCache?.key === key) {
            return this._feedProjectionCache;
        }

        const thoughts: ThoughtEntry[] = [];
        let totalNonArchived = 0;
        for (const thought of this._thoughtController.getAllThoughts()) {
            if (thought.archived) continue;
            totalNonArchived++;

            if (
                activeContext !== 'all'
                && !(thought.context ?? []).some((context) => context.toLowerCase() === activeContext)
            ) {
                continue;
            }
            if (searchQuery && !this.matchesThoughtSearch(thought, searchQuery)) {
                continue;
            }
            thoughts.push(thought);
        }

        thoughts.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
        const projection: FeedProjection = {
            key,
            activeContext,
            searchQuery,
            totalNonArchived,
            thoughts,
        };
        this._feedProjectionCache = projection;
        return projection;
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
        const contexts = this.plugin.getContexts();
        if (this._activeContext !== 'all' && !contexts.some((ctx) => ctx.toLowerCase() === this._activeContext.toLowerCase())) {
            this._activeContext = 'all';
            this.invalidateFeedProjection();
        }
        this.updateCaptureHint();

        const activeContext = this._activeContext.toLowerCase();
        const nextKey = `${activeContext}¦${contexts.join('¦')}`;
        if (this._contextFilterKey === nextKey && parent.childElementCount > 0) {
            return;
        }

        this._contextFilterKey = nextKey;
        parent.empty();

        const chipRow = parent.createEl('div', {
            cls: 'diwa-dh-feed-contexts',
            attr: { 'aria-label': 'Thought context filters' },
        });

        for (const context of ['all', ...contexts]) {
            const isActive = activeContext === context.toLowerCase();
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
                this._contextFilterKey = '';
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
                ? `Saving to #${selectedContext}  •  Shift+Enter → save  •  Enter → multiline`
                : 'Shift+Enter → save  •  Enter → multiline',
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
        if (!button.innerHTML) {
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>';
        }
        return button;
    }

    private syncThoughtRowActions(thought: ThoughtEntry, row: FeedRowRef, linkState?: ThoughtLinkState): void {
        const linkedTaskCount = linkState?.linkedTaskCount
            ?? (thought.links?.tasks ?? []).filter((value) => value.trim().length > 0).length;
        const linkedThoughtCount = linkState?.linkedThoughtCount ?? this.getLinkedThoughtRefs(thought).size;
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
        return this.buildThoughtLinkState([thought]).get(thought.filePath)?.linkedTaskRefs ?? new Set<string>();
    }

    private getLinkedThoughtRefs(thought: ThoughtEntry): Set<string> {
        const refs = new Set<string>((thought.links?.thoughts ?? []).map((value) => value.trim()).filter(Boolean));
        refs.delete(thought.filePath);
        refs.delete((thought.id || '').trim());
        return refs;
    }

    private buildThoughtLinkState(thoughts: ThoughtEntry[]): Map<string, ThoughtLinkState> {
        const linkState = new Map<string, ThoughtLinkState>();
        if (thoughts.length === 0) return linkState;
        for (const thought of thoughts) {
            const thoughtPath = thought.filePath?.trim();
            if (!thoughtPath) continue;
            linkState.set(thoughtPath, {
                linkedTaskRefs: new Set<string>((thought.links?.tasks ?? []).map((value) => value.trim()).filter(Boolean)),
                linkedTaskCount: new Set((thought.links?.tasks ?? []).map((value) => value.trim()).filter(Boolean)).size,
                linkedThoughtCount: this.getLinkedThoughtRefs(thought).size,
            });
        }

        if (linkState.size === 0) return linkState;

        const taskLinkIndex = this.getTaskLinkIndex();
        for (const thought of thoughts) {
            const thoughtPath = thought.filePath?.trim();
            if (!thoughtPath) continue;
            const state = linkState.get(thoughtPath);
            if (!state) continue;

            const linkedTaskIds = new Set<string>(state.linkedTaskRefs);
            new Set([thoughtPath, (thought.id || '').trim()].filter(Boolean)).forEach((ref) => {
                const entry = taskLinkIndex.tasksByThoughtRef.get(ref);
                if (!entry) return;
                entry.taskIds.forEach((taskId) => linkedTaskIds.add(taskId));
                entry.linkedTaskRefs.forEach((taskRef) => state.linkedTaskRefs.add(taskRef));
            });
            state.linkedTaskCount = linkedTaskIds.size;
        }

        return linkState;
    }

    private getTaskLinkIndex(): TaskLinkIndex {
        if (this._taskLinkIndex) return this._taskLinkIndex;

        const tasks = this._taskController.getAllTasks();
        const tasksByThoughtRef = new Map<string, TaskLinkIndexEntry>();
        for (const task of tasks) {
            const taskId = getTaskKey(task);
            if (!taskId) continue;

            const linkedTaskRefs = new Set<string>();
            const taskFilePath = task.filePath?.trim();
            if (taskFilePath) linkedTaskRefs.add(taskFilePath);
            linkedTaskRefs.add(taskId);

            new Set<string>([
                ...(task.sourceThoughtIds ?? []),
                ...(task.links?.thoughts ?? []),
            ].map((value) => value.trim()).filter(Boolean)).forEach((thoughtRef) => {
                const entry = tasksByThoughtRef.get(thoughtRef) ?? {
                    taskIds: new Set<string>(),
                    linkedTaskRefs: new Set<string>(),
                };
                entry.taskIds.add(taskId);
                linkedTaskRefs.forEach((taskRef) => entry.linkedTaskRefs.add(taskRef));
                tasksByThoughtRef.set(thoughtRef, entry);
            });
        }

        this._taskLinkIndex = {
            tasksByThoughtRef,
            sortedTasks: tasks.slice().sort((left, right) => (right.lastUpdate ?? 0) - (left.lastUpdate ?? 0)),
        };
        return this._taskLinkIndex;
    }

    private openTaskLinkPicker(anchor: HTMLElement, thoughtId: string): void {
        if (this._feedPopoverEl && this._feedPopoverAnchorEl === anchor) {
            this.closeFeedPopover();
            return;
        }
        const currentThought = this._thoughtController.getThought(thoughtId);
        if (!currentThought) return;
        const linkedTaskRefs = this.getLinkedTaskRefs(currentThought);
        const tasks = this.getTaskLinkIndex().sortedTasks;

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
        this.invalidateTaskLinkIndex();
        this.scheduleFeedRefresh();
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

            const previewEl = capture.createEl('div', { cls: 'diwa-dh-capture-preview markdown-rendered' });
            previewEl.style.display = 'none';
            previewEl.style.cursor = 'text';
            previewEl.style.minHeight = '42px';

            const autosize = () => {
                this.syncCaptureTextareaHeight();
            };

            const showPreview = () => {
                const raw = textarea.value.trim();
                if (raw) {
                    textarea.style.display = 'none';
                    previewEl.empty();
                    void MarkdownRenderer.render(this.app, raw, previewEl, this.plugin.settings.peopleFolder || '', this);
                    previewEl.style.display = 'block';
                } else {
                    textarea.style.display = 'block';
                    previewEl.style.display = 'none';
                }
            };

            const showEditor = () => {
                previewEl.style.display = 'none';
                textarea.style.display = 'block';
                autosize();
            };

            textarea.addEventListener('blur', () => {
                setTimeout(() => {
                    if (document.activeElement !== textarea) {
                        showPreview();
                    }
                }, 100);
            });

            textarea.addEventListener('focus', showEditor);

            previewEl.addEventListener('click', (e) => {
                e.stopPropagation();
                showEditor();
                textarea.focus();
            });

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
                showEditor();
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
                if (event.key !== 'Enter' || !event.shiftKey) return;
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
                        textarea.focus();
                        return;
                    }
                    textarea.value = '';
                    autosize();
                } finally {
                    this._capturePending = Math.max(0, this._capturePending - 1);
                    textarea.disabled = false;
                    textarea.focus();
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
    private normalizeRightPaneMode(mode: unknown): RightPaneMode {
        return mode === 'pinned' ? 'pinned' : 'tasks';
    }

    private mountRightPane(parent: HTMLElement): void {
        parent.empty();
        const shell = parent.createEl('div', { cls: 'diwa-dh-right-pane-shell' });
        this._rightPaneShellEl = shell;
        const toggle = shell.createEl('div', {
            cls: 'diwa-dh-right-pane-toggle',
            attr: { role: 'tablist', 'aria-label': 'Right pane content' },
        });
        this._rightPaneTasksBtnEl = toggle.createEl('button', {
            cls: 'diwa-dh-right-pane-toggle-btn diwa-dh-right-pane-toggle-btn--tasks',
            text: 'Tasks',
            attr: { type: 'button', role: 'tab', 'aria-controls': 'diwa-dh-right-pane-tasks' },
        }) as HTMLButtonElement;
        this._rightPanePinnedBtnEl = toggle.createEl('button', {
            cls: 'diwa-dh-right-pane-toggle-btn diwa-dh-right-pane-toggle-btn--pinned',
            text: 'Pinned Notes',
            attr: { type: 'button', role: 'tab', 'aria-controls': 'diwa-dh-right-pane-pinned' },
        }) as HTMLButtonElement;

        this._rightPaneTasksBtnEl.addEventListener('click', () => this.setRightPaneMode('tasks', { persist: true }));
        this._rightPanePinnedBtnEl.addEventListener('click', () => this.setRightPaneMode('pinned', { persist: true }));

        this._rightPaneTasksHostEl = shell.createEl('div', {
            cls: 'diwa-dh-right-pane-panel diwa-dh-right-pane-panel--tasks',
            attr: { id: 'diwa-dh-right-pane-tasks', role: 'tabpanel' },
        });
        this._rightPanePinnedHostEl = shell.createEl('div', {
            cls: 'diwa-dh-right-pane-panel diwa-dh-right-pane-panel--pinned',
            attr: { id: 'diwa-dh-right-pane-pinned', role: 'tabpanel' },
        });

        this.mountTaskPane(this._rightPaneTasksHostEl);
        this.renderPinnedNotesPane();
        this.syncRightPaneModeUI();
    }

    private mountTaskPane(parent: HTMLElement) {
        this._taskPaneView = new DesktopTaskPaneView(this, parent, this._taskController);
        this._taskPaneView.mount();
    }

    private setRightPaneMode(mode: RightPaneMode, options: { persist?: boolean } = {}): void {
        const nextMode = this.normalizeRightPaneMode(mode);
        if (this._rightPaneMode !== nextMode) {
            this._rightPaneMode = nextMode;
        }
        this.syncRightPaneModeUI();
        if (options.persist) this.requestWorkspaceLayoutSave();
    }

    private syncRightPaneModeUI(): void {
        const isTasks = this._rightPaneMode === 'tasks';
        this._rightPaneShellEl?.toggleClass('is-mode-tasks', isTasks);
        this._rightPaneShellEl?.toggleClass('is-mode-pinned', !isTasks);
        this._rightPaneTasksHostEl?.toggleClass('is-active', isTasks);
        this._rightPanePinnedHostEl?.toggleClass('is-active', !isTasks);
        this._rightPaneTasksBtnEl?.toggleClass('is-active', isTasks);
        this._rightPanePinnedBtnEl?.toggleClass('is-active', !isTasks);
        if (this._rightPaneTasksBtnEl) {
            this._rightPaneTasksBtnEl.setAttribute('aria-selected', isTasks ? 'true' : 'false');
            this._rightPaneTasksBtnEl.tabIndex = isTasks ? 0 : -1;
        }
        if (this._rightPanePinnedBtnEl) {
            this._rightPanePinnedBtnEl.setAttribute('aria-selected', isTasks ? 'false' : 'true');
            this._rightPanePinnedBtnEl.tabIndex = isTasks ? -1 : 0;
        }
        if (this._rightEl) {
            this._rightEl.toggleClass('is-mode-tasks', isTasks);
            this._rightEl.toggleClass('is-mode-pinned', !isTasks);
            this._rightEl.setAttribute('data-right-pane-mode', isTasks ? 'tasks' : 'pinned');
            this._rightEl.setAttribute('aria-label', isTasks ? 'Task side pane' : 'Pinned notes side pane');
        }
    }

    private getPinnedThoughts(): ThoughtEntry[] {
        return this._thoughtController.getAllThoughts()
            .filter((thought) => !thought.archived && !!thought.pinned)
            .sort((left, right) =>
                (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0)
            );
    }

    private renderPinnedNotesPane(): void {
        if (!this._rightPanePinnedHostEl) return;
        this._rightPanePinnedHostEl.empty();
        const list = this._rightPanePinnedHostEl.createEl('div', {
            cls: 'diwa-dh-pinned-notes-list',
            attr: { role: 'list', 'aria-label': 'Pinned thoughts' },
        });
        const pinnedThoughts = this.getPinnedThoughts();
        if (pinnedThoughts.length === 0) {
            list.createEl('div', {
                cls: 'diwa-dh-pinned-notes-empty',
                text: 'No pinned notes yet.',
            });
            return;
        }

        for (const thought of pinnedThoughts) {
            const title = (thought.title || thought.body || thought.content || 'Untitled thought').trim();
            const markdown = thought.body || thought.content || thought.title || '';
            const row = list.createEl('div', {
                cls: 'diwa-dh-pinned-note-row',
                attr: {
                    role: 'listitem',
                    tabindex: '0',
                    title,
                    'aria-label': `Open pinned note: ${title}`,
                },
            });
            const header = row.createEl('div', { cls: 'diwa-dh-pinned-note-header' });
            header.createEl('span', { cls: 'diwa-dh-pinned-note-title', text: title });
            const headerMeta = header.createEl('div', { cls: 'diwa-dh-pinned-note-header-meta' });
            headerMeta.createEl('span', {
                cls: 'diwa-dh-pinned-note-time',
                text: this.formatThoughtTime(thought),
            });
            const editBtn = headerMeta.createEl('button', {
                cls: 'diwa-dh-pinned-note-action diwa-dh-pinned-note-edit',
                attr: {
                    type: 'button',
                    title: 'Edit note',
                    'aria-label': `Edit pinned note: ${title}`,
                },
            }) as HTMLButtonElement;
            setIcon(editBtn, 'pencil');
            editBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.openPinnedThought(thought, { edit: true });
            });
            const unpinBtn = headerMeta.createEl('button', {
                cls: 'diwa-dh-pinned-note-action diwa-dh-pinned-note-unpin',
                attr: {
                    type: 'button',
                    title: 'Unpin note',
                    'aria-label': `Unpin pinned note: ${title}`,
                },
            }) as HTMLButtonElement;
            setIcon(unpinBtn, 'pin-off');
            unpinBtn.createEl('span', {
                cls: 'diwa-dh-pinned-note-action-label',
                text: 'Unpin',
            });
            unpinBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const thoughtRef = thought.id ?? thought.filePath;
                if (!thoughtRef) return;
                const currentThought = this._thoughtController.getThought(thoughtRef);
                if (!currentThought) return;
                await this._thoughtController.setPinned(thoughtRef, false);
            });

            const isInteractiveTarget = (target: EventTarget | null): boolean => {
                const element = target instanceof HTMLElement ? target : null;
                if (!element) return false;
                return Boolean(
                    element.closest('a')
                    || element.closest('button')
                    || element.closest('input')
                    || element.closest('textarea')
                    || element.closest('select')
                    || element.closest('[role="button"]')
                );
            };

            if (markdown.trim()) {
                const contentEl = row.createEl('div', {
                    cls: 'diwa-dh-pinned-note-content diwa-dh-thought-row-text markdown-rendered',
                    text: markdown,
                });
                const stagedEl = document.createElement('div');
                void MarkdownRenderer.render(this.app, markdown, stagedEl, thought.filePath || '', this)
                    .then(() => {
                        if (this._closed || !contentEl.isConnected) return;
                        contentEl.empty();
                        while (stagedEl.firstChild) {
                            contentEl.appendChild(stagedEl.firstChild);
                        }
                        enableImageZoom(this.app, contentEl);
                    })
                    .catch((error) => {
                        if (!this._closed) {
                            console.error('[DesktopHubView] Failed to render pinned note markdown.', error);
                        }
                    });
            }

            const contexts = [...new Set((thought.context ?? []).map((context) => context.trim()).filter(Boolean))];
            if (contexts.length > 0) {
                row.createEl('div', {
                    cls: 'diwa-dh-pinned-note-context',
                    text: contexts.slice(0, 2).map((context) => `#${context}`).join(' | '),
                });
            }
            row.addEventListener('click', (event) => {
                if (isInteractiveTarget(event.target)) return;
                void this.openPinnedThought(thought);
            });
            row.addEventListener('keydown', (event: KeyboardEvent) => {
                if (isInteractiveTarget(event.target)) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                void this.openPinnedThought(thought);
            });
        }
    }

    private async openPinnedThought(thought: ThoughtEntry, options: { edit?: boolean } = {}): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(thought.filePath);
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file, options.edit ? {
                active: true,
                state: { mode: 'source' },
                eState: { mode: 'source' },
            } : undefined);
            if (options.edit) {
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
            return;
        }
        new Notice('Pinned note file could not be opened.');
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

    // ── Thought Detail Sheet ──────────────────────────────────────────────
    private openThoughtSheet(thought: ThoughtEntry): void {
        // Overlay backdrop
        const overlay = document.body.createEl('div', { cls: 'diwa-thought-sheet-overlay' });
        
        const sheet = overlay.createEl('div', { cls: 'diwa-thought-sheet' });
        
        // Header
        const header = sheet.createEl('header', { cls: 'diwa-thought-sheet-header' });
        
        const closeBtn = header.createEl('button', { cls: 'diwa-thought-sheet-close', attr: { 'aria-label': 'Close' } });
        setIcon(closeBtn, 'chevron-left');
        
        const headerCopy = header.createEl('div', { cls: 'diwa-thought-sheet-header-copy' });
        headerCopy.createEl('h2', { cls: 'diwa-thought-sheet-title', text: thought.title || 'Untitled thought' });
        
        // Meta row
        const ts = thought.modified || thought.created || '';
        const m = (window as any).moment?.(ts, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss']);
        const timeText = m?.isValid() ? m.format('ddd, MMM D · h:mm A') : ts;
        headerCopy.createEl('span', { cls: 'diwa-thought-sheet-meta', text: timeText });
        
        const openFileBtn = header.createEl('button', { cls: 'diwa-thought-sheet-open', attr: { 'aria-label': 'Open file' } });
        setIcon(openFileBtn, 'external-link');
        openFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const file = this.app.vault.getAbstractFileByPath(thought.filePath);
            if (file instanceof TFile) {
                void this.app.workspace.getLeaf(false).openFile(file);
            }
            overlay.remove();
        });
        
        // Scrollable body
        const body = sheet.createEl('div', { cls: 'diwa-thought-sheet-body' });
        
        // Context tags at top
        const contexts = (thought.context || []).filter(Boolean);
        if (contexts.length > 0) {
            const tagsRow = body.createEl('div', { cls: 'diwa-thought-sheet-tags' });
            for (const ctx of contexts) {
                tagsRow.createEl('span', { cls: 'diwa-mobile-feed-card-tag', text: `#${ctx}` });
            }
        }
        
        // Full markdown content
        const contentEl = body.createEl('div', { cls: 'diwa-thought-sheet-content markdown-rendered' });
        const fullContent = thought.content || thought.body || '';
        void MarkdownRenderer.render(
            this.app,
            fullContent,
            contentEl,
            thought.filePath || '',
            this,
        ).then(() => {
            enableImageZoom(this.app, contentEl);
        });
        
        // Close handlers
        const close = () => {
            overlay.addClass('is-closing');
            setTimeout(() => overlay.remove(), 220);
        };
        
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        
        // Animate in
        requestAnimationFrame(() => overlay.addClass('is-open'));
    }
}

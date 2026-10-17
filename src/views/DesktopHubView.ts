import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, moment, Notice, Platform, Menu, Component, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_DESKTOP_HUB, DESKTOP_HUB_ICON_ID } from '../constants';
import { CaptureEntry, ScratchpadFilterMode, PermanentNoteRecord, HorizonNoteBlock, HorizonBillItem } from '../types';
import { MergeNotesModal } from '../modals/MergeNotesModal';
import { DatePickerModal } from '../modals/DatePickerModal';
import { WikilinkPeekModal, openWikilinkInPeekWindow } from '../modals/WikilinkPeekModal';
import { MobileFilterSheetModal } from '../modals/MobileFilterSheetModal';
import { RecentPermanentNotesModal } from '../modals/RecentPermanentNotesModal';
import { MobileAgendaSheetModal } from '../modals/MobileAgendaSheetModal';
import { MobileTaskEditModal } from '../modals/MobileTaskEditModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
import { PreFlightDigestModal } from '../modals/PreFlightDigestModal';
import { isTablet, isTabletPortrait, attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { attachMobileSheetViewportBehavior } from '../utils/mobileSheetViewport';

const BATCH_SIZE = 25;

export class DesktopHubView extends ItemView {
    plugin: DiwaPlugin;
    private _containerEl: HTMLElement | null = null;
    private _streamContainerEl: HTMLElement | null = null;
    private _filterBarEl: HTMLElement | null = null;
    private _selectionBarEl: HTMLElement | null = null;
    private _mobileAgendaModal: MobileAgendaSheetModal | null = null;

    private _activeFilter: ScratchpadFilterMode = 'all';
    private _filterTasksOnly: boolean = false;
    private _searchQuery: string = '';
    private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _selectedAreaForNewNote: string = '';
    private _selectedImportantForNewNote: boolean = false;
    private _selectedEntryIds: Set<string> = new Set();
    private _selectionMode: boolean = false;
    private _editingEntryId: string | null = null;
    private _headerBarEl: HTMLElement | null = null;
    private _composerEl: HTMLElement | null = null;
    private _mobileSearchOpen: boolean = false;
    private _desktopSearchOpen: boolean = false;
    private _mobileFiltersOpen: boolean = false;
    private _mobileComposerOpen: boolean = false;
    private _viewportCleanup: (() => void) | null = null;

    // Progressive rendering, component lifecycle & LRU caching
    private _renderedCount: number = BATCH_SIZE;
    private _scrollSentinelEl: HTMLElement | null = null;
    private _intersectionObserver: IntersectionObserver | null = null;
    private _isLoadingMore: boolean = false;
    private _renderedMarkdownCache: Map<string, HTMLElement> = new Map();
    private _streamComponent: Component | null = null;

    // Concurrency / refresh guards
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Cockpit dual-pane state & layout elements (Desktop & Tablet)
    private _cockpitRailOpen: boolean = true;
    private _cockpitRailTab: 'karon' | 'notes' = 'karon';
    private _horizonUndatedExpanded: boolean = false;
    private _cockpitRailWidth: number = 340;
    private _cockpitSplitRatio: number = 0.62;
    private _desktopComposerExpanded: boolean = false;
    private _isResizingCockpit: boolean = false;
    private _railNotesSearchQuery: string = '';
    private _railNotesSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _collapsedRailSubtasks: Set<string> = new Set();
    private _collapsedRailComments: Set<string> = new Set();
    private _pinnedRailSubtasks: Set<string> = new Set();
    private _pinnedRailComments: Set<string> = new Set();
    private _expandedRailSubtaskInputs: Set<string> = new Set();
    private _expandedRailCommentInputs: Set<string> = new Set();
    private _cockpitLayoutEl: HTMLElement | null = null;
    private _cockpitBackdropEl: HTMLElement | null = null;
    private _mainStageEl: HTMLElement | null = null;
    private _sideRailEl: HTMLElement | null = null;
    private _resizerEl: HTMLElement | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _desktopComposerWrapperEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DESKTOP_HUB;
    }

    getDisplayText(): string {
        return 'DIWA Workspace';
    }

    getIcon(): string {
        return DESKTOP_HUB_ICON_ID;
    }

    private getCachedRenderedBody(cacheKey: string): HTMLElement | undefined {
        const cached = this._renderedMarkdownCache.get(cacheKey);
        if (cached) {
            // Move to most recent for LRU policy
            this._renderedMarkdownCache.delete(cacheKey);
            this._renderedMarkdownCache.set(cacheKey, cached);
            return cached;
        }
        return undefined;
    }

    private setCachedRenderedBody(cacheKey: string, el: HTMLElement): void {
        if (this._renderedMarkdownCache.size >= 100) {
            const oldestKey = this._renderedMarkdownCache.keys().next().value;
            if (oldestKey) this._renderedMarkdownCache.delete(oldestKey);
        }
        this._renderedMarkdownCache.set(cacheKey, el);
    }

    public invalidateRenderCacheForFile(filePath: string): void {
        const prefix = `${filePath}_`;
        for (const key of Array.from(this._renderedMarkdownCache.keys())) {
            if (key.startsWith(prefix) || key === filePath) {
                this._renderedMarkdownCache.delete(key);
            }
        }
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('diwa-workspace-root');
        this.contentEl.addClass('pos-scratchpad-view');

        if (Platform.isMobile) {
            this._viewportCleanup = attachMobileSheetViewportBehavior({
                sheetEl: this.contentEl,
                scrollEl: this.contentEl,
            });
            if (!isTablet(this.app)) {
                document.body.addClass('diwa-hide-mobile-navbar');
            }
        }

        if (!Platform.isMobile || isTablet(this.app)) {
            this.loadCockpitState();
            this.setupViewKeyHandler();
            this.setupResizeObserver();
        }

        // On iPad and mobile runtimes, guard window and container scroll so WebKit keyboard avoidance never shifts the view off-screen
        if (Platform.isMobile) {
            const win = this.contentEl.ownerDocument.defaultView ?? window;
            const doc = this.contentEl.ownerDocument;
            const scrollLock = () => {
                if (win.scrollY !== 0 || win.scrollX !== 0) {
                    win.scrollTo(0, 0);
                }
                if (doc.documentElement.scrollLeft !== 0) {
                    doc.documentElement.scrollLeft = 0;
                }
                if (doc.body.scrollLeft !== 0) {
                    doc.body.scrollLeft = 0;
                }
                if (this.contentEl.scrollLeft !== 0) {
                    this.contentEl.scrollLeft = 0;
                }
                if (this._cockpitLayoutEl && this._cockpitLayoutEl.scrollLeft !== 0) {
                    this._cockpitLayoutEl.scrollLeft = 0;
                }
                if (this._mainStageEl && this._mainStageEl.scrollLeft !== 0) {
                    this._mainStageEl.scrollLeft = 0;
                }
            };

            const docScrollCapture = (e: Event) => {
                const el = e.target;
                if (el instanceof HTMLElement && el.scrollLeft !== 0) {
                    if (!el.classList.contains('pos-filter-carousel') && !el.classList.contains('pos-rail-tabs')) {
                        el.scrollLeft = 0;
                    }
                }
            };

            const onFocusIn = () => {
                scrollLock();
                requestAnimationFrame(scrollLock);
                setTimeout(scrollLock, 50);
                setTimeout(scrollLock, 150);
            };

            win.addEventListener('scroll', scrollLock, { passive: true });
            doc.addEventListener('scroll', docScrollCapture, true);
            this.contentEl.addEventListener('scroll', scrollLock, { passive: true });
            this.contentEl.addEventListener('focusin', onFocusIn, true);

            this.register(() => {
                win.removeEventListener('scroll', scrollLock);
                doc.removeEventListener('scroll', docScrollCapture, true);
                this.contentEl.removeEventListener('scroll', scrollLock);
                this.contentEl.removeEventListener('focusin', onFocusIn, true);
            });
        }

        this._containerEl = this.contentEl.createDiv({ cls: 'pos-scratchpad-container' });
        this.renderView();

        // Click / tap outside listener to dismiss expanded mobile composer or inline editor
        this.contentEl.addEventListener('pointerdown', (e: PointerEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // 1. If mobile composer is open and tapped outside
            if (this._mobileComposerOpen && this._composerEl) {
                if (!this._composerEl.contains(target) && !target.closest('.modal, .pos-modal, .suggestion-container, .menu, .suggestion-item')) {
                    this._mobileComposerOpen = false;
                    if (this._containerEl) {
                        this.renderComposer(this._containerEl, true);
                    }
                }
            }

            // 2. If inline editing a note and tapped outside
            if (this._editingEntryId) {
                const editorEl = this.contentEl.querySelector('.pos-inline-editor');
                if (editorEl && !editorEl.contains(target) && !target.closest('.modal, .pos-modal, .suggestion-container, .menu, .suggestion-item, .pos-note-card')) {
                    this._editingEntryId = null;
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                }
            }
        });
    }

    async onClose(): Promise<void> {
        if (this._viewportCleanup) {
            this._viewportCleanup();
            this._viewportCleanup = null;
        }

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        if (this._keyHandler) {
            this.contentEl.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        document.body.removeClass('diwa-hide-mobile-navbar');

        if (this._streamComponent) {
            this._streamComponent.unload();
            this.removeChild(this._streamComponent);
            this._streamComponent = null;
        }

        if (this._intersectionObserver) {
            this._intersectionObserver.disconnect();
            this._intersectionObserver = null;
        }
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = null;
        }
        if (this._railNotesSearchDebounceTimer) {
            clearTimeout(this._railNotesSearchDebounceTimer);
            this._railNotesSearchDebounceTimer = null;
        }
        this._renderedMarkdownCache.clear();
        this._containerEl = null;
        this._headerBarEl = null;
        this._composerEl = null;
        this._streamContainerEl = null;
        this._cockpitLayoutEl = null;
        this._mainStageEl = null;
        this._sideRailEl = null;
        this._resizerEl = null;
        this._desktopComposerWrapperEl = null;
    }

    onActiveFileChange(_file?: TFile | null): void {
        // Continuous scratchpad is independent of active file tab
    }

    public setMobileAgendaModal(modal: MobileAgendaSheetModal | null): void {
        this._mobileAgendaModal = modal;
    }

    refreshAll(): void {
        this.renderView(false);
        void this.updateHorizonOverdueState();
        if (this._mobileAgendaModal) {
            this._mobileAgendaModal.refreshAgenda();
        }
    }

    refreshCapture(): void {
        this.updateStreamOnly();
        this.updateFilterCounts();
        void this.updateHorizonOverdueState();
        if (this._cockpitRailOpen && this._sideRailEl) {
            this.renderRightRailContent();
        }
        if (this._mobileAgendaModal) {
            this._mobileAgendaModal.refreshAgenda();
        }
    }

    public async updateHorizonOverdueState(): Promise<void> {
        try {
            const overdueInfo = await this.plugin.index.getOverdueCount();
            const hasOverdue = overdueInfo.total > 0;

            // 1. Mobile Floating Action Bar Agenda Button
            const mobileAgendaBtn = this.contentEl.querySelector('.pos-mobile-action-btn.pos-mobile-action-agenda') as HTMLElement | null;
            if (mobileAgendaBtn) {
                mobileAgendaBtn.toggleClass('has-overdue', hasOverdue);
                if (hasOverdue) {
                    const desc = overdueInfo.tasks > 0 && overdueInfo.bills > 0
                        ? `${overdueInfo.tasks} task${overdueInfo.tasks === 1 ? '' : 's'}, ${overdueInfo.bills} bill${overdueInfo.bills === 1 ? '' : 's'} overdue`
                        : (overdueInfo.bills > 0
                            ? `${overdueInfo.bills} bill${overdueInfo.bills === 1 ? '' : 's'} overdue`
                            : `${overdueInfo.tasks} task${overdueInfo.tasks === 1 ? '' : 's'} overdue`);
                    mobileAgendaBtn.setAttribute('title', `Agenda & Horizon (${desc})`);
                    mobileAgendaBtn.setAttribute('aria-label', `Agenda & Horizon (${desc})`);
                } else {
                    mobileAgendaBtn.setAttribute('title', 'Agenda & Horizon');
                    mobileAgendaBtn.setAttribute('aria-label', 'Agenda & Horizon');
                }
            }

            // 2. Desktop Rail Horizon Tab Button
            const railHorizonBtn = this.contentEl.querySelector('.pos-rail-tabs .pos-rail-tab-btn:first-child') as HTMLElement | null;
            if (railHorizonBtn) {
                railHorizonBtn.toggleClass('has-overdue', hasOverdue);
                if (hasOverdue) {
                    railHorizonBtn.setAttribute('title', `Horizon (${overdueInfo.total} overdue item${overdueInfo.total === 1 ? '' : 's'})`);
                } else {
                    railHorizonBtn.removeAttribute('title');
                }
            }
        } catch (err) {
            console.error('[DIWA] Error updating horizon overdue state', err);
        }
    }

    public get activeFilter(): ScratchpadFilterMode {
        return this._activeFilter;
    }

    public get filterTasksOnly(): boolean {
        return this._filterTasksOnly;
    }

    public applyFilterFromSheet(filter: ScratchpadFilterMode, tasksOnly: boolean): void {
        this._activeFilter = filter;
        this._filterTasksOnly = tasksOnly;
        this._renderedCount = BATCH_SIZE;
        this.updateStreamOnly();
        this.updateFilterActiveStates();
        this.updateFilterCounts();
    }

    public showImportantFilter(): void {
        this._activeFilter = 'important';
        this._searchQuery = '';
        this._renderedCount = BATCH_SIZE;
        this.updateFilterActiveStates();
        this.updateStreamOnly();
        this.updateComposerVisibility();
    }

    renderView(resetPagination = true): void {
        if (resetPagination) {
            this._renderedCount = BATCH_SIZE;
        }

        const isMobile = Platform.isMobile && !isTablet(this.app);

        if (isMobile) {
            this.contentEl.empty();
            this._containerEl = this.contentEl.createDiv({ cls: 'pos-scratchpad-container' });

            // Header bar
            this._headerBarEl = this._containerEl.createDiv({ cls: 'pos-header-bar' });
            this.renderHeaderBar(this._headerBarEl);

            this._filterBarEl = null;

            // Multi-select bulk action bar (if in selection mode)
            this._selectionBarEl = this._containerEl.createDiv({ cls: 'pos-selection-bar-wrapper' });
            this.updateSelectionBar();

            // Continuous Document Stream
            this._streamContainerEl = this._containerEl.createDiv({ cls: 'pos-document-stream' });
            this.renderStream(this._streamContainerEl);

            // Mobile Sticky Composer at bottom
            this.renderComposer(this._containerEl, true);

            this.updateComposerVisibility();
            return;
        }

        // === DESKTOP & TABLET DUAL-PANE COCKPIT ===
        this.contentEl.empty();
        this.contentEl.scrollTop = 0;
        const layoutEl = this.contentEl.createDiv({ cls: 'pos-desktop-cockpit-layout' });
        if (isTablet(this.app)) {
            layoutEl.addClass('is-tablet');
            if (isTabletPortrait(this.app, this.contentEl)) {
                layoutEl.addClass('is-tablet-portrait');
            }
        }
        this._cockpitLayoutEl = layoutEl;

        // Top Full-Width Header
        const headerWrapper = layoutEl.createDiv({ cls: 'pos-cockpit-header-wrapper' });
        this._headerBarEl = headerWrapper.createDiv({ cls: 'pos-header-bar' });
        this.renderHeaderBar(this._headerBarEl);

        // Body with Split Panes
        const cockpitBody = layoutEl.createDiv({ cls: 'pos-cockpit-body' });

        // Drawer backdrop for tablet portrait overlay (dormant in pure stream portrait mode)
        this._cockpitBackdropEl = cockpitBody.createDiv({ cls: 'pos-cockpit-drawer-backdrop' });
        this._cockpitBackdropEl.addEventListener('click', () => {
            if (this._cockpitRailOpen) {
                this.toggleCockpitRail();
            }
        });

        // Left Main Stage (Stream, Filters & Composer)
        this._mainStageEl = cockpitBody.createDiv({ cls: 'pos-cockpit-main-stage' });
        this._containerEl = this._mainStageEl;

        this._mainStageEl.style.flex = '1';

        // Filter / Life Area carousel bar removed (consolidated into header)
        this._filterBarEl = null;

        // Multi-select bulk action bar (if in selection mode)
        this._selectionBarEl = this._mainStageEl.createDiv({ cls: 'pos-selection-bar-wrapper' });
        this.updateSelectionBar();

        // Top Hero Quick Capture (Executive Notebook Model)
        this._desktopComposerWrapperEl = this._mainStageEl.createDiv({ cls: 'pos-cockpit-composer-wrapper' });
        this.renderComposer(this._desktopComposerWrapperEl, false);

        // Continuous Document Stream
        this._streamContainerEl = this._mainStageEl.createDiv({ cls: 'pos-document-stream' });
        this.renderStream(this._streamContainerEl);

        const isPortrait = Boolean(layoutEl.hasClass('is-tablet-portrait'));

        // Center Resizer Divider (between stream and fixed right rail)
        this._resizerEl = cockpitBody.createDiv({ cls: 'pos-cockpit-resizer' });
        this.setupCockpitResizer(this._resizerEl, cockpitBody);
        if (!this._cockpitRailOpen || isPortrait) {
            this._resizerEl.style.display = 'none';
        } else {
            this._resizerEl.style.display = 'block';
        }

        // Right Side Rail (Inspector & Agenda) — Fixed Width Anchored to Right Edge
        this._sideRailEl = cockpitBody.createDiv({
            cls: `pos-cockpit-side-rail ${(!this._cockpitRailOpen || isPortrait) ? 'is-collapsed' : ''}`
        });
        this._sideRailEl.style.width = `${this._cockpitRailWidth}px`;
        this._sideRailEl.style.marginLeft = 'auto';

        if (isPortrait) {
            this._sideRailEl.style.display = 'none';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
        } else if (this._cockpitRailOpen) {
            this._sideRailEl.style.display = '';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
            this.renderRightRail(this._sideRailEl);
        } else {
            this._sideRailEl.style.display = '';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
        }

        this.updateComposerVisibility();
    }

    private updateComposerVisibility(): void {
        const isMobile = Platform.isMobile && !isTablet(this.app);
        if (!isMobile) return;
        const isSearching = this._mobileSearchOpen || Boolean(this._searchQuery.trim());
        const isEditing = Boolean(this._editingEntryId);
        const shouldHide = isEditing;
        if (this._composerEl) {
            this._composerEl.toggleClass('is-hidden', shouldHide);
        }
        if (this._filterBarEl) {
            this._filterBarEl.toggleClass('is-hidden', !this._mobileFiltersOpen || isEditing);
        }
        if (this._containerEl) {
            this._containerEl.toggleClass('is-searching', isSearching);
        }
    }

    private loadCockpitState(): void {
        try {
            const raw = localStorage.getItem('diwa-cockpit-state-v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (typeof parsed.railOpen === 'boolean') this._cockpitRailOpen = parsed.railOpen;
                if (parsed.railTab === 'karon' || parsed.railTab === 'notes') {
                    this._cockpitRailTab = parsed.railTab;
                } else {
                    this._cockpitRailTab = 'karon';
                }
                if (typeof parsed.undatedExpanded === 'boolean') {
                    this._horizonUndatedExpanded = parsed.undatedExpanded;
                }
                if (typeof parsed.railWidth === 'number' && parsed.railWidth >= 260 && parsed.railWidth <= 600) {
                    this._cockpitRailWidth = parsed.railWidth;
                } else if (typeof parsed.splitRatio === 'number' && parsed.splitRatio >= 0.35 && parsed.splitRatio <= 0.85) {
                    this._cockpitSplitRatio = parsed.splitRatio;
                }
            } else {
                this._cockpitRailOpen = true;
                this._cockpitRailWidth = 340;
            }
        } catch {
            this._cockpitRailOpen = true;
            this._cockpitRailWidth = 340;
        }
    }

    private saveCockpitState(): void {
        try {
            localStorage.setItem('diwa-cockpit-state-v2', JSON.stringify({
                railOpen: this._cockpitRailOpen,
                railTab: this._cockpitRailTab,
                undatedExpanded: this._horizonUndatedExpanded,
                railWidth: this._cockpitRailWidth,
                splitRatio: this._cockpitSplitRatio
            }));
        } catch {
            // ignore
        }
    }

    private setupResizeObserver(): void {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        const checkOrientation = () => {
            if (isTablet(this.app) && this._cockpitLayoutEl) {
                const isPortrait = isTabletPortrait(this.app, this.contentEl);
                const wasPortrait = this._cockpitLayoutEl.hasClass('is-tablet-portrait');
                if (isPortrait !== wasPortrait) {
                    this._cockpitLayoutEl.toggleClass('is-tablet-portrait', isPortrait);
                    this.updateCockpitRailState();
                    if (this._headerBarEl) {
                        this.renderHeaderBar(this._headerBarEl);
                    }
                }
            }
        };

        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                // Ignore zero-width backgrounded, detached, or transitioning tabs
                if (width <= 0) return;
                checkOrientation();
            }
        });
        this._resizeObserver.observe(this.contentEl);

        const win = this.contentEl.ownerDocument?.defaultView ?? window;
        win.addEventListener('orientationchange', () => {
            setTimeout(checkOrientation, 100);
        });
    }

    private setupViewKeyHandler(): void {
        if (this._keyHandler) {
            this.contentEl.removeEventListener('keydown', this._keyHandler);
        }
        this._keyHandler = (e: KeyboardEvent) => {
            const activeEl = document.activeElement as HTMLElement | null;
            const isInsideInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

            // Escape handling
            if (e.key === 'Escape') {
                if (this._selectionMode) {
                    this._selectionMode = false;
                    this._selectedEntryIds.clear();
                    this.updateSelectionBar();
                    this.updateStreamOnly();
                    return;
                }
                if (this._editingEntryId) {
                    this._editingEntryId = null;
                    this.updateStreamOnly();
                    return;
                }
                if (this._searchQuery) {
                    this._searchQuery = '';
                    this.updateStreamOnly();
                    const searchInput = this.contentEl.querySelector('.pos-search-input') as HTMLInputElement | null;
                    if (searchInput) {
                        searchInput.value = '';
                        searchInput.blur();
                    }
                    return;
                }
                if (this._desktopComposerExpanded) {
                    const textarea = this._composerEl?.querySelector('textarea');
                    if (!textarea || !textarea.value.trim()) {
                        this._desktopComposerExpanded = false;
                        const targetParent = this._desktopComposerWrapperEl || this._mainStageEl;
                        if (targetParent) {
                            this.renderComposer(targetParent, false);
                        }
                        if (textarea) textarea.blur();
                        return;
                    }
                }
            }

            if (isInsideInput) return;

            // Hotkey: '/' or 'Cmd+F' -> Focus / open search
            if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f')) {
                e.preventDefault();
                this._desktopSearchOpen = true;
                if (this._headerBarEl) {
                    this.renderHeaderBar(this._headerBarEl);
                }
                const searchInput = this.contentEl.querySelector('.pos-search-inline-input, .pos-search-input') as HTMLInputElement | null;
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                return;
            }

            // Hotkey: 'c' or 'n' -> Focus / expand composer
            if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'n') {
                e.preventDefault();
                this._desktopComposerExpanded = true;
                const targetParent = this._desktopComposerWrapperEl || this._mainStageEl;
                if (targetParent) {
                    this.renderComposer(targetParent, false);
                }
                const textarea = this._composerEl?.querySelector('textarea');
                if (textarea) {
                    textarea.focus({ preventScroll: true });
                }
                return;
            }

            // Hotkey: '\' -> Toggle right rail
            if (e.key === '\\') {
                e.preventDefault();
                this.toggleCockpitRail();
                return;
            }
        };
        this.contentEl.addEventListener('keydown', this._keyHandler);
    }

    public toggleCockpitRail(): void {
        const isTabletPortrait = Boolean(this._cockpitLayoutEl?.hasClass('is-tablet-portrait'));
        if (isTabletPortrait) return;
        this._cockpitRailOpen = !this._cockpitRailOpen;
        this.updateCockpitRailState();
    }

    private updateCockpitRailState(): void {
        if (!this._sideRailEl || !this._mainStageEl) return;
        const isTabletPortrait = Boolean(this._cockpitLayoutEl?.hasClass('is-tablet-portrait'));

        if (isTabletPortrait) {
            this._sideRailEl.addClass('is-collapsed');
            this._sideRailEl.style.display = 'none';
            if (this._resizerEl) this._resizerEl.style.display = 'none';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
            this._mainStageEl.style.flex = '1 1 100%';
            this._mainStageEl.style.width = '100%';
            if (this._headerBarEl) {
                const toggleBtn = this._headerBarEl.querySelector('.pos-rail-toggle-btn') as HTMLElement | null;
                if (toggleBtn) {
                    toggleBtn.style.display = 'none';
                }
            }
            return;
        }

        if (this._headerBarEl) {
            const toggleBtn = this._headerBarEl.querySelector('.pos-rail-toggle-btn') as HTMLElement | null;
            if (toggleBtn) {
                toggleBtn.style.display = '';
            }
        }

        if (this._cockpitRailOpen) {
            this._sideRailEl.removeClass('is-collapsed');
            this._sideRailEl.style.display = '';
            this._sideRailEl.style.width = `${this._cockpitRailWidth}px`;
            this._sideRailEl.style.marginLeft = 'auto';
            if (this._resizerEl) this._resizerEl.style.display = 'block';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
            this.renderRightRail(this._sideRailEl);
        } else {
            this._sideRailEl.addClass('is-collapsed');
            this._sideRailEl.style.display = '';
            if (this._resizerEl) this._resizerEl.style.display = 'none';
            if (this._cockpitBackdropEl) this._cockpitBackdropEl.removeClass('is-active');
        }
        this._mainStageEl.style.flex = '1 1 auto';
        this._mainStageEl.style.width = '';
        this.saveCockpitState();
        if (this._headerBarEl) {
            const toggleBtn = this._headerBarEl.querySelector('.pos-rail-toggle-btn') as HTMLElement | null;
            if (toggleBtn) {
                toggleBtn.toggleClass('is-active', this._cockpitRailOpen);
            }
        }
    }

    private setupCockpitResizer(resizer: HTMLElement, cockpitBody: HTMLElement): void {
        let startX = 0;
        let startWidth = this._cockpitRailWidth;

        const onPointerMove = (e: PointerEvent) => {
            if (!this._isResizingCockpit) return;
            if (this._cockpitLayoutEl?.hasClass('is-tablet-portrait')) return;
            // Dragging left (negative deltaX) increases right rail width; dragging right decreases it
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(260, Math.min(600, Math.round(startWidth + deltaX)));
            this._cockpitRailWidth = newWidth;
            if (this._sideRailEl) {
                this._sideRailEl.style.width = `${newWidth}px`;
            }
        };

        const onPointerUp = () => {
            if (!this._isResizingCockpit) return;
            this._isResizingCockpit = false;
            resizer.removeClass('is-active');
            document.body.removeClass('is-resizing-cockpit');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            this.saveCockpitState();
        };

        resizer.addEventListener('pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            this._isResizingCockpit = true;
            startX = e.clientX;
            startWidth = this._cockpitRailWidth;
            resizer.addClass('is-active');
            document.body.addClass('is-resizing-cockpit');
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        });
    }

    private renderRightRail(rail: HTMLElement): void {
        rail.empty();

        // 1. Rail Header & Tabs
        const header = rail.createDiv({ cls: 'pos-rail-header' });

        const tabsContainer = header.createDiv({ cls: 'pos-rail-tabs' });
        const karonTabBtn = tabsContainer.createEl('button', {
            cls: `pos-rail-tab-btn ${this._cockpitRailTab === 'karon' ? 'is-active' : ''}`
        });
        const karonIcon = karonTabBtn.createSpan({ cls: 'pos-btn-icon' });
        setIcon(karonIcon, 'sun');
        karonTabBtn.createSpan({ text: 'Horizon' });

        const railTodayStr = moment().format('YYYY-MM-DD');
        const railOverdueTasks = this.plugin.index.getOverdueTasks(railTodayStr).filter(t => !t.completed && !t.filePath?.toLowerCase().includes('handumanan'));
        if (railOverdueTasks.length > 0) {
            karonTabBtn.addClass('has-overdue');
        }
        void this.updateHorizonOverdueState();

        karonTabBtn.onclick = () => {
            this._cockpitRailTab = 'karon';
            this.saveCockpitState();
            this.renderRightRail(rail);
        };

        const notesTabBtn = tabsContainer.createEl('button', {
            cls: `pos-rail-tab-btn ${this._cockpitRailTab === 'notes' ? 'is-active' : ''}`
        });
        const notesIcon = notesTabBtn.createSpan({ cls: 'pos-btn-icon' });
        setIcon(notesIcon, 'book-open');
        notesTabBtn.createSpan({ text: 'Notes' });
        notesTabBtn.onclick = () => {
            this._cockpitRailTab = 'notes';
            this.saveCockpitState();
            this.renderRightRail(rail);
        };

        const actions = header.createDiv({ cls: 'pos-rail-actions' });
        const collapseBtn = actions.createEl('button', {
            cls: 'pos-icon-btn pos-rail-collapse-btn',
            attr: { 'aria-label': 'Collapse Agenda panel (\\)' }
        });
        setIcon(collapseBtn, 'panel-right-close');
        collapseBtn.onclick = () => {
            this._cockpitRailOpen = false;
            this.updateCockpitRailState();
        };

        // 2. Rail Content
        const content = rail.createDiv({ cls: 'pos-rail-content' });
        this.renderRightRailContent(content);
    }

    public renderRightRailContent(container?: HTMLElement): void {
        const contentEl = container ?? (this._sideRailEl?.querySelector('.pos-rail-content') as HTMLElement | null);
        if (!contentEl) return;

        if (this._cockpitRailTab === 'karon') {
            contentEl.empty();
            void this.renderHorizonRail(contentEl);
        } else if (this._cockpitRailTab === 'notes') {
            this.renderRecentNotesRail(contentEl);
        }
    }

    public async renderHorizonRail(container: HTMLElement): Promise<void> {
        container.empty();
        const today = moment();
        const todayStr = today.format('YYYY-MM-DD');

        // Date row
        const dateHeader = container.createDiv({ cls: 'pos-rail-horizon-date-header' });
        const todayHeaderWrap = dateHeader.createSpan({ cls: 'pos-rail-horizon-today' });
        const sunIcon = todayHeaderWrap.createSpan({ cls: 'pos-btn-icon' });
        setIcon(sunIcon, 'sun');
        todayHeaderWrap.createSpan({ text: ` ${today.format('dddd, MMM D')}` });
        dateHeader.createSpan({ cls: 'pos-rail-horizon-subtitle', text: 'Rolling Horizon (5 Days)' });

        // Overdue section (strictly open overdue tasks + overdue bill/pending notes, excluding Handumanan)
        const overdueTasks = this.plugin.index.getOverdueTasks(todayStr).filter(t => !t.completed && !t.filePath?.toLowerCase().includes('handumanan'));
        const overdueBills = await this.plugin.index.getOverdueBills(todayStr);
        const overdueTotal = overdueTasks.length + overdueBills.length;

        if (overdueTotal > 0) {
            const overdueBox = container.createDiv({ cls: 'pos-rail-overdue-box' });
            const titleRow = overdueBox.createDiv({ cls: 'pos-rail-overdue-title' });
            const alertIcon = titleRow.createSpan();
            setIcon(alertIcon, 'alert-circle');

            let overdueTitleText = '';
            if (overdueTasks.length > 0 && overdueBills.length === 0) {
                overdueTitleText = `${overdueTasks.length} Overdue Task${overdueTasks.length === 1 ? '' : 's'}`;
            } else if (overdueBills.length > 0 && overdueTasks.length === 0) {
                overdueTitleText = `${overdueBills.length} Overdue Bill${overdueBills.length === 1 ? '' : 's'}`;
            } else {
                overdueTitleText = `${overdueTotal} Overdue Items`;
            }
            titleRow.createSpan({ text: overdueTitleText });

            for (const task of overdueTasks.slice(0, 5)) {
                this.renderRailTaskRow(overdueBox, task, true);
            }
            if (overdueTasks.length > 5) {
                overdueBox.createDiv({ cls: 'pos-rail-empty-msg', text: `+ ${overdueTasks.length - 5} more overdue tasks` });
            }
            for (const bill of overdueBills) {
                this.renderRailBillRow(overdueBox, bill, true);
            }
        }

        let totalHorizonItems = overdueTotal;

        // Rolling 5-day window: Today (0), Tomorrow (1), Next 3 Days (2, 3, 4)
        for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
            const targetMoment = moment(todayStr).add(dayOffset, 'days');
            const targetDateStr = targetMoment.format('YYYY-MM-DD');

            // Strictly open tasks only, excluding Handumanan
            const dayTasks = this.plugin.index.getTasksForDueDate(targetDateStr).filter(t => !t.completed && !t.filePath?.toLowerCase().includes('handumanan'));
            // Pending bills due on targetDateStr
            const dayBills = await this.plugin.index.getBillsForDueDate(targetDateStr);
            // Scan note blocks (stream notes + vault notes, excluding Handumanan & bill/pending)
            const dayNotes = await this.plugin.index.getVaultNoteBlocksForDate(targetDateStr);

            const dayTotal = dayTasks.length + dayBills.length + dayNotes.length;
            if (dayTotal === 0) continue; // Suppress empty days

            totalHorizonItems += dayTotal;

            let sectionTitle = '';
            if (dayOffset === 0) {
                sectionTitle = "Today's Agenda";
            } else if (dayOffset === 1) {
                sectionTitle = "Tomorrow";
            } else {
                sectionTitle = targetMoment.format('dddd, MMM D');
            }

            const daySection = container.createDiv({ cls: 'pos-rail-section' });
            const daySecHeader = daySection.createDiv({ cls: 'pos-rail-section-header' });
            daySecHeader.createSpan({ text: sectionTitle });
            daySecHeader.createSpan({ cls: 'pos-rail-section-badge', text: `${dayTotal}` });

            // 1. Render open tasks
            for (const task of dayTasks) {
                this.renderRailTaskRow(daySection, task, false);
            }

            // 2. Render pending bills (informational)
            for (const bill of dayBills) {
                this.renderRailBillRow(daySection, bill, false);
            }

            // 3. Render note blocks
            for (const note of dayNotes) {
                this.renderRailNoteRow(daySection, note);
            }
        }

        // Collapsible Undated section (strictly open undated tasks, excluding Handumanan)
        const undatedTasks = this.plugin.index
            .getGawaTasks()
            .filter(t => !t.completed && !t.dueDate && !t.filePath?.toLowerCase().includes('handumanan'));

        if (undatedTasks.length > 0) {
            totalHorizonItems += undatedTasks.length;
            const undatedSection = container.createDiv({
                cls: `pos-rail-section pos-rail-undated-section ${this._horizonUndatedExpanded ? 'is-expanded' : 'is-collapsed'}`
            });
            const undatedHeader = undatedSection.createDiv({
                cls: 'pos-rail-section-header is-collapsible',
                attr: {
                    role: 'button',
                    tabindex: '0',
                    'aria-expanded': String(this._horizonUndatedExpanded)
                }
            });
            const headerLeft = undatedHeader.createSpan({ cls: 'pos-rail-section-header-left' });
            const chevronEl = headerLeft.createSpan({ cls: 'pos-rail-section-chevron' });
            setIcon(chevronEl, this._horizonUndatedExpanded ? 'chevron-down' : 'chevron-right');
            headerLeft.createSpan({ text: 'Undated' });
            undatedHeader.createSpan({ cls: 'pos-rail-section-badge', text: `${undatedTasks.length}` });

            const toggleUndated = () => {
                this._horizonUndatedExpanded = !this._horizonUndatedExpanded;
                this.saveCockpitState();
                void this.renderHorizonRail(container);
            };
            undatedHeader.onclick = toggleUndated;
            undatedHeader.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleUndated();
                }
            };

            if (this._horizonUndatedExpanded) {
                for (const task of undatedTasks) {
                    this.renderRailTaskRow(undatedSection, task, false);
                }
            }
        }

        // All-clear message if no overdue items, today items, upcoming items, or undated tasks
        if (totalHorizonItems === 0) {
            container.createDiv({ cls: 'pos-rail-empty-msg', text: 'All caught up — no tasks or notes scheduled.' });
        }
    }

    private renderRailBillRow(parent: HTMLElement, bill: HorizonBillItem, isOverdue: boolean): void {
        const row = parent.createDiv({
            cls: `pos-rail-bill-item ${isOverdue ? 'is-overdue' : ''}`
        });

        const iconEl = row.createDiv({ cls: 'pos-rail-bill-icon' });
        setIcon(iconEl, 'receipt');

        const content = row.createDiv({ cls: 'pos-rail-bill-content' });
        content.createDiv({
            cls: 'pos-rail-bill-title',
            text: bill.noteTitle
        });

        const metaRow = content.createDiv({ cls: 'pos-rail-bill-meta' });
        const todayStr = moment().format('YYYY-MM-DD');
        const pillCls = isOverdue ? 'is-overdue' : (bill.dueDate === todayStr ? 'is-today' : '');

        const datePill = metaRow.createSpan({
            cls: `pos-rail-meta-pill ${pillCls}`
        });
        const calIcon = datePill.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');
        datePill.createSpan({ text: ` Due: ${bill.dueDate}` });

        metaRow.createSpan({
            cls: 'pos-rail-meta-pill pos-rail-bill-tag-pill',
            text: 'bill/pending'
        });

        if (bill.amount) {
            metaRow.createSpan({
                cls: 'pos-rail-meta-pill pos-rail-bill-amount-pill',
                text: bill.amount
            });
        }
    }

    private renderRailNoteRow(parent: HTMLElement, note: HorizonNoteBlock): void {
        const row = parent.createDiv({
            cls: 'pos-rail-note-item',
            attr: { 'aria-label': `Open ${note.noteTitle}` }
        });

        const iconEl = row.createDiv({ cls: 'pos-rail-note-icon' });
        setIcon(iconEl, 'file-text');

        const content = row.createDiv({ cls: 'pos-rail-note-content' });
        const snippetText = (note.snippet || note.noteTitle || '').trim();

        if (snippetText) {
            const snippetEl = content.createDiv({ cls: 'pos-rail-note-snippet markdown-rendered' });
            void MarkdownRenderer.render(
                this.app,
                snippetText,
                snippetEl,
                note.filePath,
                this._streamComponent ?? this
            ).then(() => {
                const links = snippetEl.querySelectorAll<HTMLAnchorElement>('a.internal-link');
                links.forEach(link => {
                    const href = link.getAttribute('data-href') || link.textContent || '';
                    link.onclick = async (e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.metaKey || e.ctrlKey) {
                            await this.app.workspace.openLinkText(href, note.filePath, 'tab');
                            return;
                        }
                        if (e.altKey) {
                            await openWikilinkInPeekWindow(this.app, href, note.filePath);
                            return;
                        }
                        new WikilinkPeekModal(
                            this.app,
                            this.plugin,
                            href,
                            note.filePath,
                            (target) => this.filterStreamByWikilink(target)
                        ).open();
                    };
                });
            });
        }

        row.onclick = () => {
            new WikilinkPeekModal(this.app, this.plugin, note.noteTitle, note.filePath, (target) => this.filterStreamByWikilink(target)).open();
        };
    }

    private renderRailTaskRow(parent: HTMLElement, task: any, isOverdue: boolean): void {
        const taskKey = `${task.filePath}::${task.lineIndex}`;
        const row = parent.createDiv({ cls: `pos-rail-task-item ${isOverdue ? 'is-overdue' : ''}` });

        const checkbox = row.createEl('input', {
            type: 'checkbox',
            cls: 'pos-rail-task-checkbox'
        });
        checkbox.checked = task.completed;
        checkbox.onclick = async (e) => {
            e.stopPropagation();
            const newChecked = checkbox.checked;
            try {
                await this.plugin.capture.toggleTaskInFile(task.filePath, task.lineIndex, newChecked);
                this.plugin.refreshCoordinator.notifyRefresh('tasks');
            } catch (err) {
                console.error('[DIWA] Rail task toggle error', err);
                checkbox.checked = !newChecked;
                new Notice('Failed to toggle task');
            }
        };

        const content = row.createDiv({ cls: 'pos-rail-task-content' });
        const titleEl = content.createDiv({
            cls: `pos-rail-task-title ${task.completed ? 'is-completed' : ''}`,
        });
        const taskText = (task.cleanTitle || task.rawTitle || '').trim();
        void MarkdownRenderer.render(
            this.app,
            taskText,
            titleEl,
            task.filePath || '',
            this._streamComponent ?? this
        ).then(() => {
            const links = titleEl.querySelectorAll<HTMLAnchorElement>('a.internal-link');
            links.forEach(link => {
                const href = link.getAttribute('data-href') || link.textContent || '';
                link.onclick = async (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.metaKey || e.ctrlKey) {
                        await this.app.workspace.openLinkText(href, task.filePath || '', 'tab');
                        return;
                    }
                    if (e.altKey) {
                        await openWikilinkInPeekWindow(this.app, href, task.filePath || '');
                        return;
                    }
                    new WikilinkPeekModal(
                        this.app,
                        this.plugin,
                        href,
                        task.filePath || '',
                        (target) => this.filterStreamByWikilink(target)
                    ).open();
                };
            });
        });

        // Due date picker helper
        const openDueDatePicker = (e: MouseEvent) => {
            e.stopPropagation();
            const menu = new Menu();

            const todayStr = moment().format('YYYY-MM-DD');
            const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
            const in3DaysStr = moment().add(3, 'days').format('YYYY-MM-DD');
            const nextWeekStr = moment().add(7, 'days').format('YYYY-MM-DD');

            const applyDueDate = async (newDate: string | null) => {
                try {
                    await this.plugin.capture.updateTaskDetailsInFile({
                        filePath: task.filePath,
                        lineIndex: task.lineIndex,
                        taskTitleFallback: task.rawTitle,
                        newDueDate: newDate
                    });
                    const file = this.app.vault.getAbstractFileByPath(task.filePath);
                    if (file instanceof TFile) {
                        await this.plugin.index.indexCaptureFile(file);
                    }
                    this.plugin.refreshCoordinator.notifyRefresh('tasks');
                    new Notice(newDate ? `Due date set to ${newDate}` : 'Due date cleared');
                } catch (err) {
                    console.error('[DIWA] Error updating task due date', err);
                    new Notice('Failed to update due date');
                }
            };

            menu.addItem(item => {
                item.setTitle('Today')
                    .setIcon('sun')
                    .setChecked(task.dueDate === todayStr)
                    .onClick(() => applyDueDate(todayStr));
            });

            menu.addItem(item => {
                item.setTitle('Tomorrow')
                    .setIcon('sunrise')
                    .setChecked(task.dueDate === tomorrowStr)
                    .onClick(() => applyDueDate(tomorrowStr));
            });

            menu.addItem(item => {
                item.setTitle('In 3 Days')
                    .setIcon('calendar')
                    .setChecked(task.dueDate === in3DaysStr)
                    .onClick(() => applyDueDate(in3DaysStr));
            });

            menu.addItem(item => {
                item.setTitle('Next Week')
                    .setIcon('calendar-days')
                    .setChecked(task.dueDate === nextWeekStr)
                    .onClick(() => applyDueDate(nextWeekStr));
            });

            menu.addSeparator();

            menu.addItem(item => {
                item.setTitle('Pick Specific Date...')
                    .setIcon('calendar-clock')
                    .onClick(() => {
                        new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    });
            });

            if (task.dueDate) {
                menu.addSeparator();
                menu.addItem(item => {
                    item.setTitle('Clear Due Date')
                        .setIcon('x')
                        .onClick(() => applyDueDate(null));
                });
            }

            menu.showAtMouseEvent(e);
        };

        const isMobile = Platform.isMobile && !isTablet(this.app);

        if (isMobile) {
            titleEl.onclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('a.internal-link')) return;
                e.stopPropagation();
                new MobileTaskEditModal(this.app, this.plugin, task, this).open();
            };
        }

        const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
        const isSubtasksInputOpen = this._expandedRailSubtaskInputs.has(taskKey);
        const isSubtasksCollapsed = this._collapsedRailSubtasks.has(taskKey);
        const isSubtasksPinned = this._pinnedRailSubtasks.has(taskKey);

        const hasComments = Array.isArray(task.remarks) && task.remarks.length > 0;
        const isCommentInputOpen = this._expandedRailCommentInputs.has(taskKey);
        const isCommentsCollapsed = this._collapsedRailComments.has(taskKey);
        const isCommentsPinned = this._pinnedRailComments.has(taskKey);

        // Metadata Pills Row
        const metaRow = content.createDiv({ cls: 'pos-rail-task-meta' });

        // 1. Due date pill
        const todayStr = moment().format('YYYY-MM-DD');
        const pillCls = isOverdue ? 'is-overdue' : (task.dueDate === todayStr ? 'is-today' : '');
        const datePill = metaRow.createSpan({
            cls: `pos-rail-meta-pill pos-rail-meta-date-btn ${pillCls}`,
            attr: { 'aria-label': 'Click to change due date' }
        });
        const calIcon = datePill.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');
        datePill.createSpan({ text: task.dueDate ? ` Due: ${task.dueDate} ▾` : ' Set Due ▾' });
        datePill.onclick = (e) => {
            if (isMobile) {
                e.stopPropagation();
                new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                return;
            }
            openDueDatePicker(e);
        };

        // 2. Subtasks Badge / Add Button
        if (hasSubtasks) {
            const doneCount = task.subtasks.filter((s: any) => s.completed).length;
            const subtaskPill = metaRow.createSpan({
                cls: `pos-rail-meta-pill ${isSubtasksPinned ? 'is-active-filter' : ''} ${isSubtasksCollapsed ? 'is-collapsed-pill' : ''}`,
                attr: {
                    'aria-label': isSubtasksCollapsed
                        ? 'Subtasks hidden (Click to show)'
                        : (isSubtasksPinned ? 'Subtasks pinned (Click to hide)' : 'Subtasks (Hover to view, Click to pin)')
                }
            });
            const stIcon = subtaskPill.createSpan({ cls: 'pos-btn-icon' });
            setIcon(stIcon, 'check-square');
            subtaskPill.createSpan({ text: ` ${doneCount}/${task.subtasks.length}` });
            subtaskPill.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    return;
                }
                if (this._pinnedRailSubtasks.has(taskKey)) {
                    // Was pinned open -> hide/collapse it
                    this._pinnedRailSubtasks.delete(taskKey);
                    this._collapsedRailSubtasks.add(taskKey);
                } else if (this._collapsedRailSubtasks.has(taskKey)) {
                    // Was collapsed -> uncollapse and pin open
                    this._collapsedRailSubtasks.delete(taskKey);
                    this._pinnedRailSubtasks.add(taskKey);
                } else {
                    // Was in default hover mode -> pin it open
                    this._pinnedRailSubtasks.add(taskKey);
                }
                this.renderRightRailContent();
            };
        } else {
            const addSubtaskBtn = metaRow.createSpan({
                cls: 'pos-rail-meta-pill pos-rail-meta-action-pill',
                attr: { 'aria-label': 'Add subtask' }
            });
            const stIcon = addSubtaskBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(stIcon, 'plus');
            addSubtaskBtn.createSpan({ text: ' Subtask' });
            addSubtaskBtn.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    return;
                }
                this._expandedRailSubtaskInputs.add(taskKey);
                this._pinnedRailSubtasks.add(taskKey);
                this._collapsedRailSubtasks.delete(taskKey);
                this.renderRightRailContent();
            };
        }

        // 3. Comments Badge / Add Button
        if (hasComments) {
            const commentPill = metaRow.createSpan({
                cls: `pos-rail-meta-pill ${isCommentsPinned ? 'is-active-filter' : ''} ${isCommentsCollapsed ? 'is-collapsed-pill' : ''}`,
                attr: {
                    'aria-label': isCommentsCollapsed
                        ? 'Notes hidden (Click to show)'
                        : (isCommentsPinned ? 'Notes pinned (Click to hide)' : 'Notes (Hover to view, Click to pin)')
                }
            });
            const cIcon = commentPill.createSpan({ cls: 'pos-btn-icon' });
            setIcon(cIcon, 'message-square');
            commentPill.createSpan({ text: ` ${task.remarks.length}` });
            commentPill.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    return;
                }
                if (this._pinnedRailComments.has(taskKey)) {
                    // Was pinned open -> hide/collapse it
                    this._pinnedRailComments.delete(taskKey);
                    this._collapsedRailComments.add(taskKey);
                } else if (this._collapsedRailComments.has(taskKey)) {
                    // Was collapsed -> uncollapse and pin open
                    this._collapsedRailComments.delete(taskKey);
                    this._pinnedRailComments.add(taskKey);
                } else {
                    // Was in default hover mode -> pin it open
                    this._pinnedRailComments.add(taskKey);
                }
                this.renderRightRailContent();
            };
        } else {
            const addCommentBtn = metaRow.createSpan({
                cls: 'pos-rail-meta-pill pos-rail-meta-action-pill',
                attr: { 'aria-label': 'Add note or comment' }
            });
            const cIcon = addCommentBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(cIcon, 'plus');
            addCommentBtn.createSpan({ text: ' Note' });
            addCommentBtn.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    return;
                }
                this._expandedRailCommentInputs.add(taskKey);
                this._pinnedRailComments.add(taskKey);
                this._collapsedRailComments.delete(taskKey);
                this.renderRightRailContent();
            };
        }

        // Subtasks Section (Hover-reveal by default, or pinned open / collapsed)
        const isSubtasksOpen = (hasSubtasks && !isSubtasksCollapsed) || isSubtasksPinned || isSubtasksInputOpen;
        if (isSubtasksOpen) {
            let subtaskWrapCls = 'pos-rail-subtasks-wrap';
            if (isSubtasksCollapsed) {
                subtaskWrapCls += ' is-collapsed';
            } else if (isSubtasksPinned || isSubtasksInputOpen) {
                subtaskWrapCls += ' is-pinned-open';
            } else {
                subtaskWrapCls += ' is-hover-reveal';
            }

            const subtasksContainer = content.createDiv({ cls: subtaskWrapCls });

            // Subtasks header with count and "✕ Hide" button
            const boxHeader = subtasksContainer.createDiv({ cls: 'pos-rail-box-header' });
            const doneCount = (task.subtasks || []).filter((s: any) => s.completed).length;
            boxHeader.createSpan({
                cls: 'pos-rail-box-title',
                text: hasSubtasks ? `Subtasks (${doneCount}/${task.subtasks.length})` : 'New Subtask'
            });
            const closeBtn = boxHeader.createSpan({
                cls: 'pos-rail-box-close-btn',
                attr: { 'aria-label': 'Hide subtasks', title: 'Hide subtasks' }
            });
            setIcon(closeBtn, 'x');
            closeBtn.createSpan({ text: ' Hide' });
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this._collapsedRailSubtasks.add(taskKey);
                this._pinnedRailSubtasks.delete(taskKey);
                this._expandedRailSubtaskInputs.delete(taskKey);
                this.renderRightRailContent();
            };

            if (hasSubtasks) {
                task.subtasks.forEach((st: any, idx: number) => {
                    const stItem = subtasksContainer.createDiv({ cls: `pos-rail-subtask-item ${st.completed ? 'is-completed' : ''}` });
                    
                    const stCheck = stItem.createEl('input', {
                        type: 'checkbox',
                        cls: 'pos-rail-subtask-checkbox'
                    });
                    stCheck.checked = Boolean(st.completed);
                    stCheck.onclick = async (e) => {
                        e.stopPropagation();
                        const updated = [...task.subtasks];
                        updated[idx] = { ...updated[idx], completed: stCheck.checked };
                        try {
                            await this.plugin.capture.updateTaskDetailsInFile({
                                filePath: task.filePath,
                                lineIndex: task.lineIndex,
                                taskTitleFallback: task.rawTitle,
                                newSubtasks: updated
                            });
                            const file = this.app.vault.getAbstractFileByPath(task.filePath);
                            if (file instanceof TFile) await this.plugin.index.indexCaptureFile(file);
                            this.plugin.refreshCoordinator.notifyRefresh('tasks');
                        } catch (err) {
                            console.error('[DIWA] Error updating subtask', err);
                            stCheck.checked = !stCheck.checked;
                            new Notice('Failed to update subtask');
                        }
                    };

                    stItem.createSpan({ cls: 'pos-rail-subtask-title', text: st.title });

                    const stDelete = stItem.createSpan({
                        cls: 'pos-rail-subtask-del-btn',
                        attr: { 'aria-label': 'Delete subtask' }
                    });
                    setIcon(stDelete, 'x');
                    stDelete.onclick = async (e) => {
                        e.stopPropagation();
                        const updated = [...task.subtasks];
                        updated.splice(idx, 1);
                        try {
                            await this.plugin.capture.updateTaskDetailsInFile({
                                filePath: task.filePath,
                                lineIndex: task.lineIndex,
                                taskTitleFallback: task.rawTitle,
                                newSubtasks: updated
                            });
                            const file = this.app.vault.getAbstractFileByPath(task.filePath);
                            if (file instanceof TFile) await this.plugin.index.indexCaptureFile(file);
                            this.plugin.refreshCoordinator.notifyRefresh('tasks');
                            new Notice('Subtask removed');
                        } catch (err) {
                            console.error('[DIWA] Error deleting subtask', err);
                            new Notice('Failed to remove subtask');
                        }
                    };
                });
            }

            // Inline quick-add subtask input row
            const stAddRow = subtasksContainer.createDiv({ cls: 'pos-rail-quick-input-row' });
            const stInput = stAddRow.createEl('input', {
                type: 'text',
                cls: 'pos-rail-quick-input',
                placeholder: '+ Add subtask... (Enter, Esc to close)'
            });
            const stCancelBtn = stAddRow.createSpan({
                cls: 'pos-rail-quick-input-cancel',
                attr: { 'aria-label': 'Close input (Esc)', title: 'Close input (Esc)' }
            });
            setIcon(stCancelBtn, 'x');
            stCancelBtn.onclick = (e) => {
                e.stopPropagation();
                this._expandedRailSubtaskInputs.delete(taskKey);
                if (!hasSubtasks) {
                    this._pinnedRailSubtasks.delete(taskKey);
                }
                this.renderRightRailContent();
            };

            if (isSubtasksInputOpen && !hasSubtasks) {
                setTimeout(() => stInput.focus(), 50);
            }

            stInput.onblur = () => {
                // If input opened via + Subtask on item with no subtasks and user clicks away empty, auto-dismiss
                if (!stInput.value.trim() && !hasSubtasks) {
                    this._expandedRailSubtaskInputs.delete(taskKey);
                    this._pinnedRailSubtasks.delete(taskKey);
                    this.renderRightRailContent();
                }
            };

            stInput.onkeydown = async (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._expandedRailSubtaskInputs.delete(taskKey);
                    if (!hasSubtasks) {
                        this._pinnedRailSubtasks.delete(taskKey);
                    }
                    this.renderRightRailContent();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = stInput.value.trim();
                    if (!val) return;
                    const updated = [...(task.subtasks || []), { title: val, completed: false }];
                    try {
                        await this.plugin.capture.updateTaskDetailsInFile({
                            filePath: task.filePath,
                            lineIndex: task.lineIndex,
                            taskTitleFallback: task.rawTitle,
                            newSubtasks: updated
                        });
                        const file = this.app.vault.getAbstractFileByPath(task.filePath);
                        if (file instanceof TFile) await this.plugin.index.indexCaptureFile(file);
                        this._pinnedRailSubtasks.add(taskKey);
                        this._collapsedRailSubtasks.delete(taskKey);
                        this.plugin.refreshCoordinator.notifyRefresh('tasks');
                        new Notice('Subtask added ✓');
                    } catch (err) {
                        console.error('[DIWA] Error adding subtask', err);
                        new Notice('Failed to add subtask');
                    }
                }
            };
        }

        // Comments Section (Hover-reveal by default, or pinned open / collapsed)
        const isCommentsOpen = (hasComments && !isCommentsCollapsed) || isCommentsPinned || isCommentInputOpen;
        if (isCommentsOpen) {
            let commentWrapCls = 'pos-rail-comments-wrap';
            if (isCommentsCollapsed) {
                commentWrapCls += ' is-collapsed';
            } else if (isCommentsPinned || isCommentInputOpen) {
                commentWrapCls += ' is-pinned-open';
            } else {
                commentWrapCls += ' is-hover-reveal';
            }

            const commentsContainer = content.createDiv({ cls: commentWrapCls });

            // Notes header with count and "✕ Hide" button
            const remBoxHeader = commentsContainer.createDiv({ cls: 'pos-rail-box-header' });
            remBoxHeader.createSpan({
                cls: 'pos-rail-box-title',
                text: hasComments ? `Notes (${task.remarks.length})` : 'New Note'
            });
            const remCloseBtn = remBoxHeader.createSpan({
                cls: 'pos-rail-box-close-btn',
                attr: { 'aria-label': 'Hide notes', title: 'Hide notes' }
            });
            setIcon(remCloseBtn, 'x');
            remCloseBtn.createSpan({ text: ' Hide' });
            remCloseBtn.onclick = (e) => {
                e.stopPropagation();
                this._collapsedRailComments.add(taskKey);
                this._pinnedRailComments.delete(taskKey);
                this._expandedRailCommentInputs.delete(taskKey);
                this.renderRightRailContent();
            };

            if (hasComments) {
                task.remarks.forEach((rem: string, idx: number) => {
                    const remItem = commentsContainer.createDiv({ cls: 'pos-rail-comment-item' });
                    
                    const remIcon = remItem.createSpan({ cls: 'pos-rail-comment-icon' });
                    setIcon(remIcon, 'message-square');

                    const remText = remItem.createSpan({ cls: 'pos-rail-comment-text markdown-rendered' });
                    void MarkdownRenderer.render(
                        this.app,
                        rem,
                        remText,
                        task.filePath || '',
                        this._streamComponent ?? this
                    ).then(() => {
                        const links = remText.querySelectorAll<HTMLAnchorElement>('a.internal-link');
                        links.forEach(link => {
                            const href = link.getAttribute('data-href') || link.textContent || '';
                            link.onclick = async (e: MouseEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.metaKey || e.ctrlKey) {
                                    await this.app.workspace.openLinkText(href, task.filePath || '', 'tab');
                                    return;
                                }
                                if (e.altKey) {
                                    await openWikilinkInPeekWindow(this.app, href, task.filePath || '');
                                    return;
                                }
                                new WikilinkPeekModal(
                                    this.app,
                                    this.plugin,
                                    href,
                                    task.filePath || '',
                                    (target) => this.filterStreamByWikilink(target)
                                ).open();
                            };
                        });
                    });

                    const remDelete = remItem.createSpan({
                        cls: 'pos-rail-subtask-del-btn',
                        attr: { 'aria-label': 'Delete note' }
                    });
                    setIcon(remDelete, 'x');
                    remDelete.onclick = async (e) => {
                        e.stopPropagation();
                        const updated = [...task.remarks];
                        updated.splice(idx, 1);
                        try {
                            await this.plugin.capture.updateTaskDetailsInFile({
                                filePath: task.filePath,
                                lineIndex: task.lineIndex,
                                taskTitleFallback: task.rawTitle,
                                newRemarks: updated
                            });
                            const file = this.app.vault.getAbstractFileByPath(task.filePath);
                            if (file instanceof TFile) await this.plugin.index.indexCaptureFile(file);
                            this.plugin.refreshCoordinator.notifyRefresh('tasks');
                            new Notice('Note removed');
                        } catch (err) {
                            console.error('[DIWA] Error deleting comment', err);
                            new Notice('Failed to remove note');
                        }
                    };
                });
            }

            // Inline quick-add comment input row
            const remAddRow = commentsContainer.createDiv({ cls: 'pos-rail-quick-input-row' });
            const remInput = remAddRow.createEl('input', {
                type: 'text',
                cls: 'pos-rail-quick-input',
                placeholder: '+ Add comment... (Enter, Esc to close)'
            });
            const remCancelBtn = remAddRow.createSpan({
                cls: 'pos-rail-quick-input-cancel',
                attr: { 'aria-label': 'Close input (Esc)', title: 'Close input (Esc)' }
            });
            setIcon(remCancelBtn, 'x');
            remCancelBtn.onclick = (e) => {
                e.stopPropagation();
                this._expandedRailCommentInputs.delete(taskKey);
                if (!hasComments) {
                    this._pinnedRailComments.delete(taskKey);
                }
                this.renderRightRailContent();
            };

            if (isCommentInputOpen && !hasComments) {
                setTimeout(() => remInput.focus(), 50);
            }

            remInput.onblur = () => {
                // If input opened via + Note on item with no comments and user clicks away empty, auto-dismiss
                if (!remInput.value.trim() && !hasComments) {
                    this._expandedRailCommentInputs.delete(taskKey);
                    this._pinnedRailComments.delete(taskKey);
                    this.renderRightRailContent();
                }
            };

            remInput.onkeydown = async (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._expandedRailCommentInputs.delete(taskKey);
                    if (!hasComments) {
                        this._pinnedRailComments.delete(taskKey);
                    }
                    this.renderRightRailContent();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = remInput.value.trim();
                    if (!val) return;
                    const updated = [...(task.remarks || []), val];
                    try {
                        await this.plugin.capture.updateTaskDetailsInFile({
                            filePath: task.filePath,
                            lineIndex: task.lineIndex,
                            taskTitleFallback: task.rawTitle,
                            newRemarks: updated
                        });
                        const file = this.app.vault.getAbstractFileByPath(task.filePath);
                        if (file instanceof TFile) await this.plugin.index.indexCaptureFile(file);
                        this._pinnedRailComments.add(taskKey);
                        this._collapsedRailComments.delete(taskKey);
                        this.plugin.refreshCoordinator.notifyRefresh('tasks');
                        new Notice('Comment added ✓');
                    } catch (err) {
                        console.error('[DIWA] Error adding comment', err);
                        new Notice('Failed to add comment');
                    }
                }
            };
        }
    }

    private renderRecentNotesRail(container: HTMLElement): void {
        let searchWrap = container.querySelector('.pos-rail-notes-search-wrap') as HTMLElement | null;
        let searchInput = container.querySelector('.pos-rail-notes-search-input') as HTMLInputElement | null;
        let listContainer = container.querySelector('.pos-rail-notes-list') as HTMLElement | null;

        if (!searchWrap || !searchInput || !listContainer) {
            container.empty();
            searchWrap = container.createDiv({ cls: 'pos-rail-notes-search-wrap' });
            searchInput = searchWrap.createEl('input', {
                type: 'search',
                placeholder: 'Filter recent notes...',
                cls: 'pos-rail-notes-search-input',
                attr: {
                    autocomplete: 'off',
                    spellcheck: 'false',
                    autocorrect: 'off',
                    autocapitalize: 'off',
                }
            });
            searchInput.value = this._railNotesSearchQuery;
            listContainer = container.createDiv({ cls: 'pos-rail-notes-list' });

            searchInput.addEventListener('input', () => {
                this._railNotesSearchQuery = searchInput?.value || '';
                if (this._railNotesSearchDebounceTimer) {
                    clearTimeout(this._railNotesSearchDebounceTimer);
                }
                this._railNotesSearchDebounceTimer = setTimeout(() => {
                    this._railNotesSearchDebounceTimer = null;
                    if (listContainer) this.updateRailNotesList(listContainer);
                }, 150);
            });
        }

        this.updateRailNotesList(listContainer);
    }

    private updateRailNotesList(listContainer: HTMLElement): void {
        listContainer.empty();
        const records = this.plugin.index?.getRecentlyUpdatedPermanentNotes(40, this._railNotesSearchQuery) || [];

        if (records.length === 0) {
            const emptyEl = listContainer.createDiv({ cls: 'pos-rail-notes-empty' });
            const emptyIcon = emptyEl.createSpan({ cls: 'pos-rail-notes-empty-icon' });
            setIcon(emptyIcon, 'file-text');
            emptyEl.createEl('p', {
                text: this._railNotesSearchQuery.trim()
                    ? 'No matching notes found.'
                    : 'No permanent notes updated recently.'
            });
            return;
        }

        const todayStart = moment().startOf('day');
        const yesterdayStart = moment().subtract(1, 'day').startOf('day');
        const weekStart = moment().subtract(7, 'days').startOf('day');

        const buckets: { label: string; items: PermanentNoteRecord[] }[] = [
            { label: 'Today', items: [] },
            { label: 'Yesterday', items: [] },
            { label: 'This Week', items: [] },
            { label: 'Earlier', items: [] }
        ];

        for (const record of records) {
            const modMoment = moment(record.mtime);
            if (modMoment.isSameOrAfter(todayStart)) {
                buckets[0].items.push(record);
            } else if (modMoment.isSameOrAfter(yesterdayStart)) {
                buckets[1].items.push(record);
            } else if (modMoment.isSameOrAfter(weekStart)) {
                buckets[2].items.push(record);
            } else {
                buckets[3].items.push(record);
            }
        }

        for (const bucket of buckets) {
            if (bucket.items.length === 0) continue;

            const sectionEl = listContainer.createDiv({ cls: 'pos-rail-section pos-rail-notes-section' });
            const headerEl = sectionEl.createDiv({ cls: 'pos-rail-section-header' });
            headerEl.createSpan({ text: bucket.label });
            headerEl.createSpan({ cls: 'pos-rail-section-badge', text: `${bucket.items.length}` });

            const itemsWrap = sectionEl.createDiv({ cls: 'pos-rail-notes-group-list' });
            for (const record of bucket.items) {
                this.renderRailNoteItem(itemsWrap, record);
            }
        }
    }

    private renderRailNoteItem(parent: HTMLElement, record: PermanentNoteRecord): void {
        const itemEl = parent.createDiv({ cls: 'pos-rail-permanent-note-row' });

        // Line 1: Icon + Wrapping Note Title
        const topRow = itemEl.createDiv({ cls: 'pos-rail-note-top' });
        const iconEl = topRow.createSpan({ cls: 'pos-rail-note-row-icon' });
        setIcon(iconEl, 'file-text');
        const titleEl = topRow.createSpan({ cls: 'pos-rail-note-title', text: record.title });
        titleEl.title = record.title;

        // Line 2: Folder / Tags Context + Relative Timestamp
        const metaRow = itemEl.createDiv({ cls: 'pos-rail-note-meta' });
        const contextWrap = metaRow.createDiv({ cls: 'pos-rail-note-context' });

        if (record.folder) {
            const folderShort = record.folder.split('/').filter(Boolean).pop() || record.folder;
            const folderPill = contextWrap.createSpan({
                cls: 'pos-rail-note-pill is-folder',
                attr: { title: record.folder }
            });
            const folderIcon = folderPill.createSpan({ cls: 'pos-rail-note-pill-icon' });
            setIcon(folderIcon, 'folder');
            folderPill.createSpan({ text: folderShort });
        }

        if (Array.isArray(record.tags) && record.tags.length > 0) {
            const visibleTags = record.tags.slice(0, 2);
            for (const tag of visibleTags) {
                const cleanTag = String(tag).replace(/^#+/, '').trim();
                if (!cleanTag) continue;
                contextWrap.createSpan({
                    cls: 'pos-rail-note-pill is-tag',
                    text: `#${cleanTag}`,
                    attr: { title: `#${cleanTag}` }
                });
            }
            if (record.tags.length > 2) {
                contextWrap.createSpan({
                    cls: 'pos-rail-note-pill is-tag-more',
                    text: `+${record.tags.length - 2}`,
                    attr: { title: record.tags.slice(2).map(t => `#${String(t).replace(/^#+/, '')}`).join(', ') }
                });
            }
        }

        metaRow.createSpan({ cls: 'pos-rail-note-time', text: record.modifiedRelative });

        itemEl.onclick = async (e: MouseEvent) => {
            if (e.metaKey || e.ctrlKey) {
                await this.app.workspace.openLinkText(record.filePath, '', 'tab');
                return;
            }
            if (e.altKey) {
                await openWikilinkInPeekWindow(this.app, record.filePath, record.filePath);
                return;
            }
            new WikilinkPeekModal(
                this.app,
                this.plugin,
                record.filePath,
                record.filePath,
                (target) => this.filterStreamByWikilink(target)
            ).open();
        };
    }

    private createMutedMenuItemTitle(label: string, iconName: string, count?: number): DocumentFragment {
        const frag = document.createDocumentFragment();
        const iconWrap = frag.createSpan({ cls: 'pos-menu-icon' });
        setIcon(iconWrap, iconName);
        const textSuffix = typeof count === 'number' ? ` ${label} (${count})` : ` ${label}`;
        frag.createSpan({ text: textSuffix });
        return frag;
    }

    private createMutedAreaTitle(label: string, icon?: string, count?: number): DocumentFragment {
        const frag = document.createDocumentFragment();
        const iconWrap = frag.createSpan({ cls: 'pos-menu-icon' });
        if (icon) {
            iconWrap.createSpan({ cls: 'pos-emoji-muted', text: icon });
        } else {
            setIcon(iconWrap, 'folder');
        }
        const textSuffix = typeof count === 'number' ? ` ${label} (${count})` : ` ${label}`;
        frag.createSpan({ text: textSuffix });
        return frag;
    }

    private renderHeaderBar(header: HTMLElement): void {
        header.empty();

        const isMobile = Platform.isMobile && !isTablet(this.app);

        const titleSection = header.createDiv({ cls: 'pos-header-title-section' });
        titleSection.createSpan({ cls: 'pos-header-logo', text: 'DIWA' });
        const horizonLabel = this.plugin.index?.getScratchpadHorizonLabel?.();
        const subtitleText = horizonLabel && horizonLabel !== 'All Notes' ? `Personal OS · ${horizonLabel}` : 'Personal OS';
        titleSection.createSpan({ cls: 'pos-header-subtitle', text: subtitleText });

        // Actions - Desktop/Tablet vs Mobile (Mobile header stays clean & minimalist without extra buttons)
        if (isMobile) {
            return;
        }

        const actions = header.createDiv({ cls: 'pos-header-actions' });

            // 1. Modern Minimalist Search Pill / Inline Capsule
            if (this._desktopSearchOpen || Boolean(this._searchQuery)) {
                const searchCapsule = actions.createDiv({ cls: 'pos-search-inline-capsule' });
                const searchCapsuleIcon = searchCapsule.createSpan({ cls: 'pos-search-inline-icon' });
                setIcon(searchCapsuleIcon, 'search');
                const searchInput = searchCapsule.createEl('input', {
                    type: 'search',
                    placeholder: 'Search notes, #tags, tasks...',
                    cls: 'pos-search-inline-input',
                    value: this._searchQuery,
                    attr: {
                        enterkeyhint: 'search',
                        autocomplete: 'off',
                        autocorrect: 'off',
                        autocapitalize: 'off',
                        spellcheck: 'false',
                    }
                });
                setTimeout(() => searchInput.focus(), 20);

                const triggerSearch = (query: string, dismissKeyboard = false) => {
                    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
                    this._searchQuery = query;
                    this._renderedCount = BATCH_SIZE;
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                    if (dismissKeyboard) {
                        searchInput.blur();
                    }
                };

                searchInput.oninput = (e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
                    this._searchDebounceTimer = setTimeout(() => {
                        triggerSearch(val, false);
                    }, 120);
                };

                searchInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        triggerSearch(searchInput.value, false);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this._searchQuery = '';
                        this._desktopSearchOpen = false;
                        this.renderHeaderBar(header);
                        triggerSearch('', true);
                    }
                };

                const closeBtn = searchCapsule.createSpan({
                    cls: 'pos-search-inline-close',
                    attr: { 'aria-label': 'Close search' }
                });
                setIcon(closeBtn, 'x');
                closeBtn.onclick = () => {
                    this._searchQuery = '';
                    this._desktopSearchOpen = false;
                    this._renderedCount = BATCH_SIZE;
                    this.renderHeaderBar(header);
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                };
            } else {
                const searchBtn = actions.createEl('button', {
                    cls: 'pos-header-text-btn pos-search-trigger-btn',
                    attr: { 'aria-label': 'Search notes (/)' }
                });
                const searchIcon = searchBtn.createSpan({ cls: 'pos-btn-icon' });
                setIcon(searchIcon, 'search');
                searchBtn.createSpan({ text: ' Search' });
                searchBtn.createSpan({ cls: 'pos-header-kbd-hint', text: '/' });
                searchBtn.onclick = () => {
                    this._desktopSearchOpen = true;
                    this.renderHeaderBar(header);
                };
            }

            // 2. Unified Filter Dropdown Pill (All Notes + Tasks + Life Areas + Today/Upcoming/Important/Untagged)
            let filterLabel = 'All Notes';
            if (this._activeFilter === 'tasks_only') {
                filterLabel = 'Tasks';
            } else if (this._activeFilter === 'important') {
                filterLabel = 'Important';
            } else if (this._activeFilter === 'today') {
                filterLabel = 'Today';
            } else if (this._activeFilter === 'upcoming') {
                filterLabel = 'Upcoming';
            } else if (this._activeFilter === 'untagged') {
                filterLabel = 'Untagged';
            } else if (this._activeFilter !== 'all') {
                const areas = this.plugin.settings.lifeAreas || [];
                const matchedArea = areas.find(a => a.id.toLowerCase() === this._activeFilter.toLowerCase());
                if (matchedArea) {
                    filterLabel = matchedArea.label;
                } else {
                    filterLabel = this._activeFilter;
                }
            }

            const filterBtn = actions.createEl('button', {
                cls: `pos-header-text-btn pos-filter-dropdown-btn ${this._activeFilter !== 'all' ? 'is-active' : ''}`,
                attr: { 'aria-label': 'Filter by view or life area' }
            });
            const filterIconWrap = filterBtn.createSpan({ cls: 'pos-btn-icon' });
            if (this._activeFilter === 'tasks_only') {
                setIcon(filterIconWrap, 'check-square');
            } else if (this._activeFilter === 'important') {
                setIcon(filterIconWrap, 'star');
            } else if (this._activeFilter === 'today' || this._activeFilter === 'upcoming') {
                setIcon(filterIconWrap, 'calendar');
            } else if (this._activeFilter === 'untagged') {
                setIcon(filterIconWrap, 'file-text');
            } else if (this._activeFilter !== 'all') {
                const areas = this.plugin.settings.lifeAreas || [];
                const matchedArea = areas.find(a => a.id.toLowerCase() === this._activeFilter.toLowerCase());
                if (matchedArea?.icon) {
                    filterIconWrap.createSpan({ cls: 'pos-emoji-muted', text: matchedArea.icon });
                } else {
                    setIcon(filterIconWrap, 'folder');
                }
            } else {
                setIcon(filterIconWrap, 'sliders-horizontal');
            }
            filterBtn.createSpan({ text: ` ${filterLabel} ▾` });
            filterBtn.onclick = (e) => {
                e.stopPropagation();
                const menu = new Menu();

                const allCount = this.plugin.index?.getAllCaptures()?.length || 0;
                menu.addItem(item => {
                    item.setTitle(this.createMutedMenuItemTitle('All Notes', 'sliders-horizontal', allCount))
                        .setChecked(this._activeFilter === 'all')
                        .onClick(() => {
                            this._activeFilter = 'all';
                            this._filterTasksOnly = false;
                            this._renderedCount = BATCH_SIZE;
                            this.renderHeaderBar(header);
                            this.updateStreamOnly();
                        });
                });

                const openTaskCount = this.plugin.index?.getOpenTaskCount() || 0;
                menu.addItem(item => {
                    item.setTitle(this.createMutedMenuItemTitle('Tasks', 'check-square', openTaskCount))
                        .setChecked(this._activeFilter === 'tasks_only')
                        .onClick(() => {
                            this._activeFilter = 'tasks_only';
                            this._filterTasksOnly = true;
                            this._renderedCount = BATCH_SIZE;
                            this.renderHeaderBar(header);
                            this.updateStreamOnly();
                        });
                });

                menu.addSeparator();

                const importantCount = this.plugin.index?.getImportantCount() || 0;
                menu.addItem(item => {
                    item.setTitle(this.createMutedMenuItemTitle('Important', 'star', importantCount))
                        .setChecked(this._activeFilter === 'important')
                        .onClick(() => {
                            this._activeFilter = 'important';
                            this._filterTasksOnly = false;
                            this._renderedCount = BATCH_SIZE;
                            this.renderHeaderBar(header);
                            this.updateStreamOnly();
                        });
                });

                const todayCount = this.plugin.index?.getTodayCapturesCount?.() || 0;
                menu.addItem(item => {
                    item.setTitle(this.createMutedMenuItemTitle('Today', 'calendar', todayCount))
                        .setChecked(this._activeFilter === 'today')
                        .onClick(() => {
                            this._activeFilter = 'today';
                            this._filterTasksOnly = false;
                            this._renderedCount = BATCH_SIZE;
                            this.renderHeaderBar(header);
                            this.updateStreamOnly();
                        });
                });

                const upcomingCount = this.plugin.index?.getUpcomingCapturesCount?.() || 0;
                menu.addItem(item => {
                    item.setTitle(this.createMutedMenuItemTitle('Upcoming', 'calendar-days', upcomingCount))
                        .setChecked(this._activeFilter === 'upcoming')
                        .onClick(() => {
                            this._activeFilter = 'upcoming';
                            this._filterTasksOnly = false;
                            this._renderedCount = BATCH_SIZE;
                            this.renderHeaderBar(header);
                            this.updateStreamOnly();
                        });
                });

                const untaggedCount = this.plugin.index?.getUntaggedCount() || 0;
                if (untaggedCount > 0) {
                    menu.addItem(item => {
                        item.setTitle(this.createMutedMenuItemTitle('Untagged', 'file-text', untaggedCount))
                            .setChecked(this._activeFilter === 'untagged')
                            .onClick(() => {
                                this._activeFilter = 'untagged';
                                this._filterTasksOnly = false;
                                this._renderedCount = BATCH_SIZE;
                                this.renderHeaderBar(header);
                                this.updateStreamOnly();
                            });
                    });
                }

                const areas = this.plugin.settings.lifeAreas || [];
                if (areas.length > 0) {
                    menu.addSeparator();
                    const areaCounts = this.plugin.index?.getAreaCounts?.() || {};
                    for (const area of areas) {
                        const count = areaCounts[area.id] || 0;
                        menu.addItem(item => {
                            item.setTitle(this.createMutedAreaTitle(area.label, area.icon, count))
                                .setChecked(this._activeFilter.toLowerCase() === area.id.toLowerCase())
                                .onClick(() => {
                                    this._activeFilter = area.id;
                                    this._filterTasksOnly = false;
                                    this._renderedCount = BATCH_SIZE;
                                    this.renderHeaderBar(header);
                                    this.updateStreamOnly();
                                });
                        });
                    }
                }

                menu.showAtMouseEvent(e);
            };

            // 3. More Menu [ ⋯ ] consolidating Agenda toggle + Daily Digest + utility actions
            const moreBtn = actions.createEl('button', {
                cls: 'pos-icon-btn pos-header-more-btn',
                attr: { 'aria-label': 'More workspace actions' }
            });
            setIcon(moreBtn, 'more-horizontal');
            moreBtn.onclick = (e) => {
                e.stopPropagation();
                this.openMoreMenu(e, false);
            };
    }

    private openMoreMenu(e: MouseEvent, isMobile = false): void {
        const menu = new Menu();

        // 0. Agenda Panel Toggle (desktop/tablet landscape only)
        const isTabletPortrait = Boolean(this._cockpitLayoutEl?.hasClass('is-tablet-portrait'));
        if (!isMobile && !isTabletPortrait) {
            menu.addItem((item) => {
                item.setTitle(this._cockpitRailOpen ? 'Hide Agenda Panel (\\)' : 'Show Agenda Panel (\\)')
                    .setIcon('panel-right')
                    .setChecked(this._cockpitRailOpen)
                    .onClick(() => {
                        this.toggleCockpitRail();
                    });
            });
            menu.addSeparator();
        }

        // 1. Daily Digest & Review (moved from top header to more menu)
        const todayDigestSummary = this.plugin.index.getDayDigestSummary(moment().format('YYYY-MM-DD'));
        const isDigested = todayDigestSummary.status === 'digested';
        menu.addItem((item) => {
            item.setTitle(isDigested ? 'Daily Digest & Review (✓ Done)' : 'Daily Digest & Review')
                .setIcon('calendar-check')
                .onClick(() => {
                    void this.plugin.activateCalendarDigest();
                });
        });

        menu.addSeparator();

        // 2. Select mode toggle
        menu.addItem((item) => {
            item.setTitle(this._selectionMode ? 'Exit Selection Mode' : 'Select Notes to Merge')
                .setIcon('check-square')
                .setChecked(this._selectionMode)
                .onClick(() => {
                    this._selectionMode = !this._selectionMode;
                    if (!this._selectionMode) {
                        this._selectedEntryIds.clear();
                    }
                    this.updateSelectionBar();
                    this.updateStreamOnly();
                });
        });

        // 3. Open Gawa Task Cockpit in Split / View
        const gawaTaskCount = this.plugin.index?.getOpenTaskCount() || 0;
        menu.addItem((item) => {
            item.setTitle(`Open Gawa Task Cockpit (${gawaTaskCount})`)
                .setIcon('list-todo')
                .onClick(() => {
                    void this.plugin.activateGawaCockpit();
                });
        });

        // 4. Open Karon Horizon in Tab / View
        menu.addItem((item) => {
            item.setTitle('Open Karon Today & Horizon')
                .setIcon('sun')
                .onClick(() => {
                    void this.plugin.activateKaron();
                });
        });

        // 5. Show Recently Updated Permanent Notes
        menu.addItem((item) => {
            item.setTitle('Recent Permanent Notes')
                .setIcon('book-open')
                .onClick(() => {
                    new RecentPermanentNotesModal(this.app, this.plugin).open();
                });
        });

        if (isMobile) {
            menu.addSeparator();
            const isNavHidden = document.body.hasClass('diwa-hide-mobile-navbar');
            menu.addItem((item) => {
                item.setTitle(isNavHidden ? 'Show Obsidian Navigation Bar' : 'Hide Obsidian Navigation Bar')
                    .setIcon('panel-bottom')
                    .setChecked(!isNavHidden)
                    .onClick(() => {
                        const nowHidden = !document.body.hasClass('diwa-hide-mobile-navbar');
                        document.body.toggleClass('diwa-hide-mobile-navbar', nowHidden);
                        new Notice(nowHidden ? 'Obsidian navigation hidden' : 'Obsidian navigation shown');
                    });
            });
        }

        menu.addSeparator();

        // 6. Settings
        menu.addItem((item) => {
            item.setTitle('DIWA Settings')
                .setIcon('settings')
                .onClick(() => {
                    (this.app as any).setting?.open();
                    (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
                });
        });

        menu.showAtMouseEvent(e);
    }

    private renderFilterBar(parent: HTMLElement): void {
        try {
            parent.empty();
            const scrollable = parent.createDiv({ cls: 'pos-filter-carousel' });

            if (this._activeFilter === 'tasks_only') {
                this._filterTasksOnly = true;
                this._activeFilter = 'all';
            }

            const isTasksOnly = this._filterTasksOnly;
            const openTaskCount = this.plugin.index?.getOpenTaskCount?.() || 0;
            const openTaskNoteCount = this.plugin.index?.getOpenTaskNoteCount?.() || 0;
            const allCaptures = this.plugin.index?.getAllCaptures?.() || [];
            const totalCount = isTasksOnly ? openTaskNoteCount : allCaptures.length;
            const importantCount = this.plugin.index?.getImportantCount?.(isTasksOnly) || 0;
            const todayCount = this.plugin.index?.getTodayCapturesCount?.(isTasksOnly) || 0;
            const upcomingCount = this.plugin.index?.getUpcomingCapturesCount?.(isTasksOnly) || 0;
            const areaCounts = this.plugin.index?.getAreaCounts?.(isTasksOnly) || {};

            // 1. Pinned Open Tasks modifier chip
            const tasksChip = scrollable.createDiv({
                cls: `pos-filter-chip pos-chip-tasks ${isTasksOnly ? 'is-active' : ''}`,
            });
            tasksChip.dataset.filter = 'tasks_only';
            tasksChip.createSpan({ cls: 'pos-chip-icon', text: '☑️' });
            tasksChip.createSpan({ cls: 'pos-chip-label', text: 'Open Tasks' });
            tasksChip.createSpan({ cls: 'pos-chip-badge', text: `${openTaskCount}` });
            tasksChip.onclick = () => {
                this._filterTasksOnly = !this._filterTasksOnly;
                this._renderedCount = BATCH_SIZE;
                this.renderFilterBar(parent);
                this.updateStreamOnly();
            };

            // Divider separating modifier from facet carousel
            scrollable.createDiv({ cls: 'pos-filter-divider' });

            // 2. All chip
            const allChip = scrollable.createDiv({
                cls: `pos-filter-chip ${this._activeFilter === 'all' ? 'is-active' : ''}`,
            });
            allChip.dataset.filter = 'all';
            allChip.createSpan({ cls: 'pos-chip-label', text: isTasksOnly ? 'All Tasks' : 'All Notes' });
            allChip.createSpan({ cls: 'pos-chip-badge', text: `${totalCount}` });
            allChip.onclick = () => {
                this._activeFilter = 'all';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 3. Important / Starred chip
            const importantChip = scrollable.createDiv({
                cls: `pos-filter-chip pos-chip-important ${this._activeFilter === 'important' ? 'is-active' : ''} ${importantCount > 0 ? 'has-items' : ''}`,
            });
            importantChip.dataset.filter = 'important';
            importantChip.createSpan({ cls: 'pos-chip-icon', text: '⭐' });
            importantChip.createSpan({ cls: 'pos-chip-label', text: 'Important' });
            importantChip.createSpan({ cls: 'pos-chip-badge', text: `${importantCount}` });
            importantChip.onclick = () => {
                this._activeFilter = this._activeFilter === 'important' ? 'all' : 'important';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 4. Today / Resurface chip
            const todayChip = scrollable.createDiv({
                cls: `pos-filter-chip pos-chip-today ${this._activeFilter === 'today' ? 'is-active' : ''} ${todayCount > 0 ? 'has-items' : ''}`,
            });
            todayChip.dataset.filter = 'today';
            todayChip.createSpan({ cls: 'pos-chip-icon', text: '📅' });
            todayChip.createSpan({ cls: 'pos-chip-label', text: 'Today' });
            todayChip.createSpan({ cls: 'pos-chip-badge', text: `${todayCount}` });
            todayChip.onclick = () => {
                this._activeFilter = this._activeFilter === 'today' ? 'all' : 'today';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 4. Upcoming chip
            const upcomingChip = scrollable.createDiv({
                cls: `pos-filter-chip pos-chip-upcoming ${this._activeFilter === 'upcoming' ? 'is-active' : ''} ${upcomingCount > 0 ? 'has-items' : ''}`,
            });
            upcomingChip.dataset.filter = 'upcoming';
            upcomingChip.createSpan({ cls: 'pos-chip-icon', text: '📆' });
            upcomingChip.createSpan({ cls: 'pos-chip-label', text: 'Upcoming' });
            upcomingChip.createSpan({ cls: 'pos-chip-badge', text: `${upcomingCount}` });
            upcomingChip.onclick = () => {
                this._activeFilter = this._activeFilter === 'upcoming' ? 'all' : 'upcoming';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 5. Life Area chips
            const rawAreas = this.plugin.settings?.lifeAreas || [];
            const areas = Array.isArray(rawAreas) ? rawAreas : [];
            for (const area of areas) {
                if (!area || typeof area !== 'object') continue;
                const areaId = String(area.id || '').toLowerCase().trim();
                if (!areaId) continue;
                const count = areaCounts[areaId] || 0;
                const isSelected = this._activeFilter === areaId;
                const chip = scrollable.createDiv({
                    cls: `pos-filter-chip ${isSelected ? 'is-active' : ''}`,
                });
                chip.dataset.filter = areaId;
                if (area.icon) {
                    chip.createSpan({ cls: 'pos-chip-icon', text: area.icon });
                }
                chip.createSpan({ cls: 'pos-chip-label', text: area.label || areaId });
                chip.createSpan({ cls: 'pos-chip-badge', text: `${count}` });
                chip.onclick = () => {
                    this._activeFilter = isSelected ? 'all' : areaId;
                    this._renderedCount = BATCH_SIZE;
                    this.updateFilterActiveStates();
                    this.updateStreamOnly();
                };
            }
        } catch (err) {
            console.error('[DIWA DesktopHubView] Error rendering filter bar:', err);
        }
    }

    private updateFilterActiveStates(): void {
        if (this._headerBarEl && this._headerBarEl.isConnected) {
            this.renderHeaderBar(this._headerBarEl);
        }
        if (this._filterBarEl) {
            const chips = this._filterBarEl.querySelectorAll<HTMLElement>('.pos-filter-chip');
            chips.forEach(chip => {
                const filter = chip.dataset.filter;
                if (filter === 'tasks_only') {
                    chip.toggleClass('is-active', this._filterTasksOnly);
                } else {
                    chip.toggleClass('is-active', filter === this._activeFilter);
                }
            });
        }
        const filterBtn = this._composerEl?.querySelector<HTMLElement>('.pos-mobile-action-filter');
        if (filterBtn) {
            const hasActiveFilter = this._activeFilter !== 'all' || this._filterTasksOnly;
            filterBtn.toggleClass('is-active', hasActiveFilter);
        }
        const searchBtn = this._composerEl?.querySelector<HTMLElement>('.pos-mobile-action-search');
        if (searchBtn) {
            searchBtn.toggleClass('is-active', this._mobileSearchOpen || Boolean(this._searchQuery));
        }
    }

    public updateFilterCounts(): void {
        if (this._headerBarEl && this._headerBarEl.isConnected) {
            this.renderHeaderBar(this._headerBarEl);
        }
        if (this._filterBarEl && this._filterBarEl.isConnected) {
            this.renderFilterBar(this._filterBarEl);
        }
    }

    private updateSelectionBar(): void {
        if (!this._selectionBarEl) return;
        this._selectionBarEl.empty();

        if (!this._selectionMode) {
            this._selectionBarEl.style.display = 'none';
            return;
        }

        this._selectionBarEl.style.display = 'block';
        const bar = this._selectionBarEl.createDiv({ cls: 'pos-selection-bar' });
        const count = this._selectedEntryIds.size;

        bar.createSpan({
            cls: 'pos-selection-text',
            text: count > 0 ? `${count} note${count > 1 ? 's' : ''} selected` : 'Tap notes to select for merging'
        });

        const actions = bar.createDiv({ cls: 'pos-selection-actions' });
        
        if (count > 0) {
            const mergeBtn = actions.createEl('button', {
                cls: 'pos-selection-btn mod-cta',
                text: '🔀 Merge Selected'
            });
            mergeBtn.onclick = () => {
                const selectedEntries = this.plugin.index.getAllCaptures().filter(e => this._selectedEntryIds.has(e.id));
                new MergeNotesModal(this.app, this.plugin, selectedEntries, () => {
                    this._selectedEntryIds.clear();
                    this._selectionMode = false;
                    if (this._headerBarEl) this.renderHeaderBar(this._headerBarEl);
                    this.updateSelectionBar();
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                }).open();
            };
        }

        const cancelBtn = actions.createEl('button', {
            cls: 'pos-selection-btn',
            text: '✕ Done'
        });
        cancelBtn.onclick = () => {
            this._selectedEntryIds.clear();
            this._selectionMode = false;
            if (this._headerBarEl) this.renderHeaderBar(this._headerBarEl);
            this.updateSelectionBar();
            this.updateStreamOnly();
        };
    }

    private renderComposer(parent: HTMLElement, isStickyMobile: boolean): void {
        if (isStickyMobile) {
            if (this._composerEl && this._composerEl.parentElement === parent) {
                this._composerEl.remove();
            }

            // === 1. ACTIVE SEARCH STATE: FLOATING BOTTOM SEARCH CAPSULE ===
            if (this._mobileSearchOpen || Boolean(this._searchQuery)) {
                const searchWrapper = parent.createDiv({
                    cls: 'pos-mobile-floating-search'
                });
                this._composerEl = searchWrapper;

                const iconEl = searchWrapper.createDiv({ cls: 'pos-mobile-search-icon' });
                setIcon(iconEl, 'search');

                const searchInput = searchWrapper.createEl('input', {
                    type: 'search',
                    placeholder: 'Search notes, #tags, or tasks...',
                    cls: 'pos-mobile-search-input',
                    value: this._searchQuery,
                    attr: {
                        enterkeyhint: 'search',
                        autocomplete: 'off',
                        autocorrect: 'off',
                        autocapitalize: 'off',
                        spellcheck: 'false',
                    }
                });

                const triggerSearch = (query: string, dismissKeyboard = false) => {
                    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
                    this._searchQuery = query;
                    this._renderedCount = BATCH_SIZE;
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                    if (dismissKeyboard) {
                        searchInput.blur();
                    }
                };

                searchInput.oninput = (e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
                    this._searchDebounceTimer = setTimeout(() => {
                        triggerSearch(val, false);
                    }, 120);
                };

                searchInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        triggerSearch(searchInput.value, true);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this._searchQuery = '';
                        this._mobileSearchOpen = false;
                        triggerSearch('', true);
                        this.renderComposer(parent, true);
                    }
                };

                const clearBtn = searchWrapper.createEl('button', {
                    cls: 'pos-mobile-search-clear',
                    attr: { 'aria-label': 'Close search', title: 'Close' }
                });
                setIcon(clearBtn, 'x');
                clearBtn.onclick = () => {
                    this._searchQuery = '';
                    this._mobileSearchOpen = false;
                    triggerSearch('', true);
                    this.renderComposer(parent, true);
                };

                setTimeout(() => {
                    if (searchInput.isConnected) {
                        searchInput.focus();
                    }
                }, 60);

                return;
            }

            if (!this._mobileComposerOpen) {
                // === MOBILE IDLE STATE: 1-ROW FLOATING ACTION BAR ===
                const actionBar = parent.createDiv({
                    cls: 'pos-mobile-action-bar'
                });
                this._composerEl = actionBar;

                // 1. New Note Action (Expands floating composer)
                const newBtn = actionBar.createEl('button', {
                    cls: 'pos-mobile-action-btn pos-mobile-action-new',
                    attr: { 'aria-label': 'Capture thought or task', title: 'Capture' }
                });
                setIcon(newBtn, 'edit-3');
                newBtn.onclick = () => {
                    this._mobileComposerOpen = true;
                    this._mobileSearchOpen = false;
                    this.renderComposer(parent, true);
                };

                // 2. Search Toggle Action (Expands bottom search capsule)
                const searchBtn = actionBar.createEl('button', {
                    cls: `pos-mobile-action-btn pos-mobile-action-search ${this._mobileSearchOpen || Boolean(this._searchQuery) ? 'is-active' : ''}`,
                    attr: { 'aria-label': 'Toggle search', title: 'Search' }
                });
                setIcon(searchBtn, 'search');
                searchBtn.onclick = () => {
                    this._mobileSearchOpen = true;
                    this._mobileComposerOpen = false;
                    this._activeFilter = 'all';
                    this._filterTasksOnly = false;
                    this._renderedCount = BATCH_SIZE;
                    this.updateComposerVisibility();
                    this.updateStreamOnly();
                    this.updateFilterActiveStates();
                    this.renderComposer(parent, true);
                };

                // 3. Recent Permanent Notes Action (Icon only)
                const recentBtn = actionBar.createEl('button', {
                    cls: 'pos-mobile-action-btn pos-mobile-action-recent',
                    attr: { 'aria-label': 'Recently updated notes', title: 'Recent notes' }
                });
                setIcon(recentBtn, 'book-open');
                recentBtn.onclick = () => {
                    new RecentPermanentNotesModal(this.app, this.plugin).open();
                };

                // 4. Filter Sheet Action (Icon only)
                const hasActiveFilter = this._activeFilter !== 'all' || this._filterTasksOnly;
                const filterBtn = actionBar.createEl('button', {
                    cls: `pos-mobile-action-btn pos-mobile-action-filter ${hasActiveFilter ? 'is-active' : ''}`,
                    attr: { 'aria-label': 'Filter stream & lenses', title: 'Filter' }
                });
                setIcon(filterBtn, 'sliders-horizontal');
                filterBtn.onclick = () => {
                    new MobileFilterSheetModal(this.app, this.plugin, this).open();
                };

                // 5. Agenda & Horizon Action (Slides up 5-day rolling Horizon bottom sheet)
                const agendaBtn = actionBar.createEl('button', {
                    cls: 'pos-mobile-action-btn pos-mobile-action-agenda',
                    attr: { 'aria-label': 'Agenda & Horizon', title: 'Agenda' }
                });
                setIcon(agendaBtn, 'sun');

                const mobileTodayStr = moment().format('YYYY-MM-DD');
                const mobileOverdueTasks = this.plugin.index.getOverdueTasks(mobileTodayStr).filter(t => !t.completed && !t.filePath?.toLowerCase().includes('handumanan'));
                if (mobileOverdueTasks.length > 0) {
                    agendaBtn.addClass('has-overdue');
                    agendaBtn.setAttribute('title', `Agenda & Horizon (${mobileOverdueTasks.length} overdue task${mobileOverdueTasks.length === 1 ? '' : 's'})`);
                }
                void this.updateHorizonOverdueState();

                agendaBtn.onclick = () => {
                    new MobileAgendaSheetModal(this.app, this.plugin, this).open();
                };

                return;
            }

            // === MOBILE ACTIVE STATE: 2-ROW FLOATING COMPOSER CAPSULE ===
            const composerWrapper = parent.createDiv({
                cls: 'pos-composer pos-mobile-sticky-composer'
            });
            this._composerEl = composerWrapper;

            const mainRow = composerWrapper.createDiv({ cls: 'pos-mobile-composer-main-row' });

            // 1. Full-Width Input pill container + textarea
            const inputPill = mainRow.createDiv({ cls: 'pos-composer-input-pill' });
            const textarea = inputPill.createEl('textarea', {
                cls: 'pos-composer-textarea',
                placeholder: 'Capture thought or task...',
                attr: { rows: '1' }
            });

            // 2. Send / Submit circular button
            const sendBtn = mainRow.createEl('button', {
                cls: 'pos-composer-send-btn-circle',
                attr: { 'aria-label': 'Capture note' }
            });
            setIcon(sendBtn, 'arrow-up');

            // 3. Horizontal swipeable pills row: Task button + Life Areas + Close
            const pillsRow = composerWrapper.createDiv({ cls: 'pos-mobile-composer-pills-row' });

            // Task toggle pill
            const taskBtn = pillsRow.createEl('button', {
                cls: 'pos-composer-area-pill pos-composer-task-pill',
                attr: { 'aria-label': 'Insert task checkbox' }
            });
            const mobileTaskIcon = taskBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(mobileTaskIcon, 'check-square');
            taskBtn.createSpan({ text: 'Task' });

            // Star toggle pill
            const starPill = pillsRow.createEl('button', {
                cls: `pos-composer-area-pill pos-composer-star-pill ${this._selectedImportantForNewNote ? 'is-selected' : ''}`,
                attr: { 'aria-label': 'Toggle important flag' }
            });
            const updateMobileStarBtn = () => {
                starPill.empty();
                const starIcon = starPill.createSpan({ cls: 'pos-btn-icon' });
                setIcon(starIcon, 'star');
                starPill.createSpan({ text: 'Important' });
                starPill.toggleClass('is-selected', this._selectedImportantForNewNote);
            };
            updateMobileStarBtn();
            starPill.onclick = () => {
                this._selectedImportantForNewNote = !this._selectedImportantForNewNote;
                updateMobileStarBtn();
            };

            // Life Area Single Dropdown Capsule
            const areaDropdownBtn = pillsRow.createEl('button', {
                cls: `pos-composer-area-pill pos-composer-area-dropdown ${this._selectedAreaForNewNote ? 'is-selected' : ''}`,
                attr: { 'aria-label': 'Select Life Area' }
            });

            const updateMobileAreaDropdownText = () => {
                areaDropdownBtn.empty();
                const areas = this.plugin.settings.lifeAreas || [];
                const activeArea = areas.find(a => a.id === this._selectedAreaForNewNote);
                const areaIcon = areaDropdownBtn.createSpan({ cls: 'pos-btn-icon' });
                if (activeArea) {
                    areaDropdownBtn.addClass('is-selected');
                    if (activeArea.icon) {
                        areaIcon.createSpan({ cls: 'pos-emoji-muted', text: activeArea.icon });
                    } else {
                        setIcon(areaIcon, 'folder');
                    }
                    areaDropdownBtn.createSpan({ text: activeArea.label });
                    const clearSpan = areaDropdownBtn.createSpan({ cls: 'pos-area-clear-btn', attr: { 'aria-label': 'Clear area' } });
                    setIcon(clearSpan, 'x');
                    clearSpan.onclick = (e) => {
                        e.stopPropagation();
                        this._selectedAreaForNewNote = '';
                        updateMobileAreaDropdownText();
                    };
                } else {
                    areaDropdownBtn.removeClass('is-selected');
                    setIcon(areaIcon, 'tag');
                    areaDropdownBtn.createSpan({ text: 'Area ▾' });
                }
            };
            updateMobileAreaDropdownText();

            areaDropdownBtn.onclick = (e) => {
                const menu = new Menu();
                const areas = this.plugin.settings.lifeAreas || [];

                menu.addItem((item) => {
                    item.setTitle('No Area (General)')
                        .setIcon('minus-circle')
                        .setChecked(!this._selectedAreaForNewNote)
                        .onClick(() => {
                            this._selectedAreaForNewNote = '';
                            updateMobileAreaDropdownText();
                        });
                });

                menu.addSeparator();

                for (const area of areas) {
                    menu.addItem((item) => {
                        item.setTitle(this.createMutedAreaTitle(area.label, area.icon))
                            .setChecked(this._selectedAreaForNewNote === area.id)
                            .onClick(() => {
                                this._selectedAreaForNewNote = area.id;
                                updateMobileAreaDropdownText();
                            });
                    });
                }

                menu.showAtMouseEvent(e);
            };

            // Dismiss/Close button
            const closeBtn = pillsRow.createEl('button', {
                cls: 'pos-composer-area-pill pos-composer-close-pill',
                attr: { 'aria-label': 'Close composer' }
            });
            const closeIcon = closeBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(closeIcon, 'x');
            closeBtn.createSpan({ text: 'Close' });
            closeBtn.onclick = () => {
                this._mobileComposerOpen = false;
                this.renderComposer(parent, true);
            };

            // Restore draft
            const draft = this.plugin.capture.getDraft();
            if (draft) {
                textarea.value = draft;
            }

            // Auto-expand textarea without forced reflow
            let resizePending = false;
            const autoResize = () => {
                if (resizePending) return;
                resizePending = true;
                requestAnimationFrame(() => {
                    textarea.style.height = 'auto';
                    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
                    resizePending = false;
                });
            };
            textarea.oninput = () => {
                autoResize();
                this.plugin.capture.saveDraft(textarea.value);
            };
            setTimeout(autoResize, 0);

            // Smart triggers ([[ for links, # for tags/areas, @ for NLP dates, / for people, ++ for tasks)
            attachInlineTriggers(
                this.app,
                textarea,
                (_d) => {},
                (tag) => {
                    const area = (this.plugin.settings.lifeAreas || []).find(a => a.id.toLowerCase() === tag.toLowerCase());
                    if (area) {
                        this._selectedAreaForNewNote = area.id;
                        this.renderComposerPillSelection(composerWrapper);
                    }
                },
                () => {
                    const areasList = (this.plugin.settings.lifeAreas || []).map(a => a.id);
                    const contexts = this.plugin.settings.contexts || [];
                    return Array.from(new Set([...areasList, ...contexts]));
                },
                this.plugin.settings.peopleFolder
            );

            attachMediaPasteHandler(
                this.app,
                textarea,
                () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
            );

            // Task insertion
            taskBtn.onclick = () => {
                const cursor = textarea.selectionStart || 0;
                const text = textarea.value;
                const prefix = (cursor > 0 && text[cursor - 1] !== '\n') ? '\n- [ ] ' : '- [ ] ';
                textarea.value = text.slice(0, cursor) + prefix + text.slice(cursor);
                textarea.focus();
                textarea.setSelectionRange(cursor + prefix.length, cursor + prefix.length);
                autoResize();
                this.plugin.capture.saveDraft(textarea.value);
            };

            // Save logic
            const doSave = async (keepActive = false) => {
                const text = textarea.value.trim();
                if (!text) return;
                sendBtn.disabled = true;
                this._capturePending++;
                try {
                    await this.plugin.capture.createCaptureNote(
                        text,
                        this._selectedAreaForNewNote,
                        [],
                        this._selectedImportantForNewNote
                    );
                    this.plugin.capture.clearDraft();
                    textarea.value = '';
                    autoResize();
                    if (keepActive) {
                        new Notice('Block captured! Ready for next ↵', 1500);
                        textarea.focus();
                    } else {
                        this._selectedAreaForNewNote = '';
                        this._selectedImportantForNewNote = false;
                        this._mobileComposerOpen = false;
                        this.renderComposer(parent, true);
                        new Notice('Note captured!');
                    }
                    this.updateFilterCounts();
                    this.updateStreamOnly();
                } catch (err) {
                    console.error('[DIWA DesktopHubView] Save capture note error', err);
                    new Notice('Failed to save note');
                } finally {
                    this._capturePending--;
                    sendBtn.disabled = false;
                }
            };

            sendBtn.onclick = () => { void doSave(false); };

            textarea.onkeydown = (e) => {
                if (e.shiftKey && e.key === 'Enter') {
                    e.preventDefault();
                    void doSave(true);
                } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void doSave(false);
                }
            };

            setTimeout(() => {
                if (textarea.isConnected) {
                    textarea.focus();
                    autoResize();
                }
            }, 60);

            return;
        }

        // === DESKTOP / TABLET HERO COMPOSER ===
        const targetParent = this._desktopComposerWrapperEl || parent;
        if (this._composerEl && this._composerEl.parentElement === targetParent) {
            this._composerEl.remove();
        } else if (targetParent === this._desktopComposerWrapperEl) {
            targetParent.empty();
        }

        const draft = this.plugin.capture.getDraft();
        const hasDraft = Boolean(draft && draft.trim().length > 0);
        const isExpanded = this._desktopComposerExpanded || hasDraft;
        this._cockpitLayoutEl?.toggleClass('is-composer-active', isExpanded);

        if (!isExpanded) {
            // Sleek Reflect-style fluid capture line
            const compactWrapper = targetParent.createDiv({
                cls: 'pos-composer-compact pos-reflect-composer-compact',
                attr: {
                    tabindex: '0',
                    role: 'button',
                    'aria-label': 'Click to capture note or task'
                }
            });
            this._composerEl = compactWrapper;

            const triggerArea = compactWrapper.createDiv({ cls: 'pos-compact-trigger-area' });
            const editIcon = triggerArea.createSpan({ cls: 'pos-compact-icon' });
            setIcon(editIcon, 'edit-3');
            triggerArea.createSpan({ cls: 'pos-compact-placeholder', text: "Capture your thought..." });

            const activateComposer = () => {
                this._desktopComposerExpanded = true;
                this.renderComposer(targetParent, false);
                const ta = this._composerEl?.querySelector('textarea');
                if (ta) {
                    ta.focus({ preventScroll: true });
                }
            };

            compactWrapper.onclick = () => {
                activateComposer();
            };

            compactWrapper.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateComposer();
                }
            };
            return;
        }

        // Full-Height Desktop Composer
        const composerWrapper = targetParent.createDiv({
            cls: 'pos-composer pos-desktop-composer'
        });
        this._composerEl = composerWrapper;

        const textarea = composerWrapper.createEl('textarea', {
            cls: 'pos-composer-textarea pos-desktop-composer-textarea',
            placeholder: 'What’s on your mind? Capture a thought, task (- [ ]), or note...',
            attr: { rows: '2' }
        });

        // Restore draft if any
        if (draft) {
            textarea.value = draft;
        }

        // Auto-expand textarea without forced reflow
        let resizePending = false;
        const autoResize = () => {
            if (resizePending) return;
            resizePending = true;
            requestAnimationFrame(() => {
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`;
                resizePending = false;
            });
        };
        textarea.oninput = () => {
            autoResize();
            this.plugin.capture.saveDraft(textarea.value);
        };
        setTimeout(autoResize, 0);

        // Smart triggers ([[ for links, # for tags/areas, @ for NLP dates, / for people, ++ for tasks)
        attachInlineTriggers(
            this.app,
            textarea,
            (_d) => {},
            (tag) => {
                const area = (this.plugin.settings.lifeAreas || []).find(a => a.id.toLowerCase() === tag.toLowerCase());
                if (area) {
                    this._selectedAreaForNewNote = area.id;
                    this.renderComposerPillSelection(composerWrapper);
                }
            },
            () => {
                const areasList = (this.plugin.settings.lifeAreas || []).map(a => a.id);
                const contexts = this.plugin.settings.contexts || [];
                return Array.from(new Set([...areasList, ...contexts]));
            },
            this.plugin.settings.peopleFolder
        );

        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
        );

        // Composer Toolbar
        const toolbar = composerWrapper.createDiv({ cls: 'pos-composer-toolbar' });

        // Left controls: Area Selector & Task Shortcut
        const leftControls = toolbar.createDiv({ cls: 'pos-composer-left' });

        // Task toggle button
        const taskBtn = leftControls.createEl('button', {
            cls: 'pos-composer-pill-btn pos-composer-task-btn',
            attr: { 'aria-label': 'Insert task checkbox' }
        });
        const taskIcon = taskBtn.createSpan({ cls: 'pos-btn-icon' });
        setIcon(taskIcon, 'check-square');
        taskBtn.createSpan({ text: 'Task' });
        taskBtn.onclick = () => {
            const cursor = textarea.selectionStart || 0;
            const text = textarea.value;
            const prefix = (cursor > 0 && text[cursor - 1] !== '\n') ? '\n- [ ] ' : '- [ ] ';
            textarea.value = text.slice(0, cursor) + prefix + text.slice(cursor);
            textarea.focus({ preventScroll: true });
            textarea.setSelectionRange(cursor + prefix.length, cursor + prefix.length);
            autoResize();
            this.plugin.capture.saveDraft(textarea.value);
        };

        // Star toggle button
        const starBtn = leftControls.createEl('button', {
            cls: `pos-composer-pill-btn pos-composer-star-btn ${this._selectedImportantForNewNote ? 'is-selected' : ''}`,
            attr: { 'aria-label': 'Toggle important flag' }
        });
        const updateDesktopStarBtn = () => {
            starBtn.empty();
            const starIcon = starBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(starIcon, 'star');
            starBtn.createSpan({ text: 'Important' });
            starBtn.toggleClass('is-selected', this._selectedImportantForNewNote);
        };
        updateDesktopStarBtn();
        starBtn.onclick = () => {
            this._selectedImportantForNewNote = !this._selectedImportantForNewNote;
            updateDesktopStarBtn();
        };

        // Life Area Single Dropdown Capsule
        const areaDropdownBtn = leftControls.createEl('button', {
            cls: `pos-composer-pill-btn pos-composer-area-dropdown ${this._selectedAreaForNewNote ? 'is-selected' : ''}`,
            attr: { 'aria-label': 'Select Life Area' }
        });

        const updateDesktopAreaDropdownText = () => {
            areaDropdownBtn.empty();
            const areas = this.plugin.settings.lifeAreas || [];
            const activeArea = areas.find(a => a.id === this._selectedAreaForNewNote);
            const areaIcon = areaDropdownBtn.createSpan({ cls: 'pos-btn-icon' });
            if (activeArea) {
                areaDropdownBtn.addClass('is-selected');
                if (activeArea.icon) {
                    areaIcon.createSpan({ cls: 'pos-emoji-muted', text: activeArea.icon });
                } else {
                    setIcon(areaIcon, 'folder');
                }
                areaDropdownBtn.createSpan({ text: activeArea.label });
                const clearSpan = areaDropdownBtn.createSpan({ cls: 'pos-area-clear-btn', attr: { 'aria-label': 'Clear area' } });
                setIcon(clearSpan, 'x');
                clearSpan.onclick = (e) => {
                    e.stopPropagation();
                    this._selectedAreaForNewNote = '';
                    updateDesktopAreaDropdownText();
                };
            } else {
                areaDropdownBtn.removeClass('is-selected');
                setIcon(areaIcon, 'tag');
                areaDropdownBtn.createSpan({ text: 'Area ▾' });
            }
        };
        updateDesktopAreaDropdownText();

        areaDropdownBtn.onclick = (e) => {
            const menu = new Menu();
            const areas = this.plugin.settings.lifeAreas || [];

            menu.addItem((item) => {
                item.setTitle('No Area (General)')
                    .setIcon('minus-circle')
                    .setChecked(!this._selectedAreaForNewNote)
                    .onClick(() => {
                        this._selectedAreaForNewNote = '';
                        updateDesktopAreaDropdownText();
                    });
            });

            menu.addSeparator();

            for (const area of areas) {
                menu.addItem((item) => {
                    item.setTitle(this.createMutedAreaTitle(area.label, area.icon))
                        .setChecked(this._selectedAreaForNewNote === area.id)
                        .onClick(() => {
                            this._selectedAreaForNewNote = area.id;
                            updateDesktopAreaDropdownText();
                        });
                });
            }

            menu.showAtMouseEvent(e);
        };

        // Right controls: Save button & Shortcut hint
        const rightControls = toolbar.createDiv({ cls: 'pos-composer-right' });

        // Collapse button
        const collapseBtn = rightControls.createEl('button', {
            cls: 'pos-composer-pill-btn pos-composer-close-btn',
            attr: { 'aria-label': 'Collapse composer' }
        });
        const collapseIcon = collapseBtn.createSpan({ cls: 'pos-btn-icon' });
        setIcon(collapseIcon, 'x');
        collapseBtn.onclick = () => {
            this._desktopComposerExpanded = false;
            this.renderComposer(targetParent, false);
        };

        const saveBtn = rightControls.createEl('button', {
            cls: 'pos-composer-save-btn pos-reflect-save-btn',
            text: 'Capture'
        });

        const doSave = async (keepActive = false) => {
            const text = textarea.value.trim();
            if (!text) return;
            saveBtn.disabled = true;
            this._capturePending++;
            try {
                await this.plugin.capture.createCaptureNote(
                    text,
                    this._selectedAreaForNewNote,
                    [],
                    this._selectedImportantForNewNote
                );
                this.plugin.capture.clearDraft();
                textarea.value = '';
                autoResize();

                if (keepActive) {
                    this._desktopComposerExpanded = true;
                    new Notice('Block captured! Ready for next ↵', 1500);
                    textarea.focus({ preventScroll: true });
                } else {
                    this._selectedAreaForNewNote = '';
                    this._selectedImportantForNewNote = false;
                    this._desktopComposerExpanded = false;
                    this.renderComposer(targetParent, false);
                    new Notice('Note captured!');
                }

                this.updateFilterCounts();
                this.updateStreamOnly();
                if (this._streamContainerEl) {
                    this._streamContainerEl.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } catch (err) {
                console.error('[DIWA DesktopHubView] Save capture note error', err);
                new Notice('Failed to save note');
            } finally {
                this._capturePending--;
                saveBtn.disabled = false;
            }
        };

        saveBtn.onclick = () => { void doSave(false); };

        // Keyboard shortcuts:
        // Shift+Enter: save & keep active for next block
        // Cmd/Ctrl+Enter: save & finish/collapse
        // Escape: collapse if empty
        textarea.onkeydown = (e) => {
            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                void doSave(true);
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void doSave(false);
            } else if (e.key === 'Escape') {
                if (!textarea.value.trim()) {
                    e.preventDefault();
                    this._desktopComposerExpanded = false;
                    this.renderComposer(targetParent, false);
                }
            }
        };

        setTimeout(() => {
            if (textarea.isConnected) {
                textarea.focus();
                autoResize();
            }
        }, 50);
    }

    private renderComposerPillSelection(container: HTMLElement): void {
        const dropdownBtn = container.querySelector<HTMLButtonElement>('.pos-composer-area-dropdown');
        if (dropdownBtn) {
            dropdownBtn.empty();
            const areas = this.plugin.settings.lifeAreas || [];
            const activeArea = areas.find(a => a.id === this._selectedAreaForNewNote);
            const areaIcon = dropdownBtn.createSpan({ cls: 'pos-btn-icon' });
            if (activeArea) {
                dropdownBtn.addClass('is-selected');
                if (activeArea.icon) {
                    areaIcon.createSpan({ cls: 'pos-emoji-muted', text: activeArea.icon });
                } else {
                    setIcon(areaIcon, 'folder');
                }
                dropdownBtn.createSpan({ text: activeArea.label });
                const clearSpan = dropdownBtn.createSpan({ cls: 'pos-area-clear-btn', attr: { 'aria-label': 'Clear area' } });
                setIcon(clearSpan, 'x');
                clearSpan.onclick = (e) => {
                    e.stopPropagation();
                    this._selectedAreaForNewNote = '';
                    this.renderComposerPillSelection(container);
                };
            } else {
                dropdownBtn.removeClass('is-selected');
                setIcon(areaIcon, 'tag');
                dropdownBtn.createSpan({ text: 'Area ▾' });
            }
        }
    }

    private getFilteredCaptures(): CaptureEntry[] {
        const isSearching = Boolean(this._searchQuery.trim());
        let entries = this.plugin.index?.getAllCaptures?.(isSearching) || [];

        // Exclude digested and archived notes from continuous scratchpad feed and search (Inbox Zero)
        if (this._activeFilter === 'digested') {
            entries = entries.filter(e => Boolean(e.digested || e.archived));
        } else {
            entries = entries.filter(e => !e.digested && !e.archived);
        }

        // 1. Search query filter (searches across active workspace notes)
        if (isSearching) {
            const query = this._searchQuery.toLowerCase().trim();
            if (query === 'is:important' || query === '!important' || query === '⭐') {
                return entries.filter(e => this.plugin.index?.isImportant(e));
            }
            return entries.filter(e => {
                if (!e) return false;
                if (String(e.body || '').toLowerCase().includes(query)) return true;
                if (String(e.area || '').toLowerCase().includes(query)) return true;
                const tags = Array.isArray(e.tags) ? e.tags : [];
                if (tags.some(t => String(t || '').toLowerCase().includes(query))) return true;
                return false;
            });
        }

        // 2. Task modifier filter (active when tasksOnly toggle is ON)
        if (this._filterTasksOnly || this._activeFilter === 'tasks_only') {
            entries = entries.filter(e => e && e.hasTasks && Array.isArray(e.tasks) && e.tasks.some(t => t && !t.completed));
        }

        // 3. Mode / Life Area facet filter (active when not searching)
        if (this._activeFilter === 'important') {
            entries = entries.filter(e => e && this.plugin.index?.isImportant(e));
        } else if (this._activeFilter === 'today') {
            const todayStr = this.plugin.index?.getTodayDateStr?.() || moment().format('YYYY-MM-DD');
            entries = entries.filter(e => e && Array.isArray(e.allDates) && e.allDates.includes(todayStr));
        } else if (this._activeFilter === 'upcoming') {
            entries = entries.filter(e => e && Array.isArray(e.allDates) && e.allDates.some(d => this.plugin.index?.isDateFuture(d)));
            // Sort forward-chronologically by earliest future date
            entries.sort((a, b) => {
                const dateA = this.plugin.index?.getEarliestFutureDate(a) || '9999-99-99';
                const dateB = this.plugin.index?.getEarliestFutureDate(b) || '9999-99-99';
                return dateA.localeCompare(dateB);
            });
        } else if (this._activeFilter === 'untagged') {
            entries = entries.filter(e => e && !e.area && (!Array.isArray(e.tags) || e.tags.length === 0));
        } else if (this._activeFilter !== 'all' && this._activeFilter !== 'tasks_only') {
            const areaId = this._activeFilter.toLowerCase().trim();
            entries = entries.filter(e => {
                if (!e) return false;
                const noteArea = String(e.area || '').toLowerCase().trim();
                const tags = Array.isArray(e.tags) ? e.tags.map(t => String(t || '').toLowerCase().trim()) : [];
                return noteArea === areaId || tags.includes(areaId);
            });
        }

        // Omit entries where visible body is completely empty and there are no tasks
        entries = entries.filter(e => e && (Boolean(e.body && e.body.trim()) || (Array.isArray(e.tasks) && e.tasks.length > 0)));

        return entries;
    }

    public updateStreamOnly(): void {
        if (!this._streamContainerEl) return;
        this.renderStream(this._streamContainerEl);
    }

    private renderStream(container: HTMLElement): void {
        if (this._intersectionObserver) {
            this._intersectionObserver.disconnect();
        }

        if (this._streamComponent) {
            this._streamComponent.unload();
            this.removeChild(this._streamComponent);
            this._streamComponent = null;
        }
        this._streamComponent = this.addChild(new Component());

        container.empty();

        const filtered = this.getFilteredCaptures();
        const trimmedQuery = this._searchQuery.trim();

        if (filtered.length === 0) {
            const emptyEl = container.createDiv({
                cls: `pos-empty-state ${trimmedQuery ? 'pos-search-empty-state' : ''}`
            });
            const emptyIconEl = emptyEl.createDiv({ cls: 'pos-empty-icon' });
            setIcon(emptyIconEl, trimmedQuery ? 'search' : (this._filterTasksOnly ? 'check-square' : 'file-text'));

            const horizonLabel = this.plugin.index?.getScratchpadHorizonLabel?.();
            let emptyTitle = 'Your workspace is clean and ready';
            let emptySubtitle = (horizonLabel && horizonLabel !== 'All Notes')
                ? `No notes captured in ${horizonLabel.toLowerCase()}. Type above to capture thoughts or to-dos.`
                : 'Type above to capture thoughts, ideas, or to-dos instantly.';

            if (trimmedQuery) {
                emptyTitle = `No notes matching "${trimmedQuery}"`;
                emptySubtitle = 'Check spelling or try a different keyword.';
            } else if (this._filterTasksOnly) {
                if (this._activeFilter === 'today') {
                    emptyTitle = 'No open tasks scheduled for today';
                    emptySubtitle = 'Add a task or schedule one for today using @today.';
                } else if (this._activeFilter === 'upcoming') {
                    emptyTitle = 'No upcoming open tasks scheduled';
                    emptySubtitle = 'Use @tomorrow or [[YYYY-MM-DD]] to schedule tasks.';
                } else if (this._activeFilter !== 'all') {
                    emptyTitle = 'No open tasks in this context';
                    emptySubtitle = 'Assign tasks to this area or tag to see them here.';
                } else {
                    emptyTitle = 'No open tasks in workspace';
                    emptySubtitle = 'Create a task above using ++ or the task button.';
                }
            } else if (this._activeFilter === 'upcoming') {
                emptyTitle = 'No upcoming notes scheduled';
                emptySubtitle = 'Use @tomorrow or [[YYYY-MM-DD]] to schedule thoughts or tasks.';
            }

            emptyEl.createDiv({ cls: 'pos-empty-title', text: emptyTitle });
            emptyEl.createDiv({ cls: 'pos-empty-subtitle', text: emptySubtitle });
            return;
        }

        // Search feedback header when query is active
        if (trimmedQuery) {
            const searchSummary = container.createDiv({ cls: 'pos-search-results-summary' });
            const searchIconSpan = searchSummary.createSpan({ cls: 'pos-btn-icon' });
            setIcon(searchIconSpan, 'search');
            searchSummary.createSpan({
                cls: 'pos-search-results-text',
                text: ` Found ${filtered.length} note${filtered.length === 1 ? '' : 's'} matching "${trimmedQuery}"`
            });
        }

        const visibleEntries = filtered.slice(0, this._renderedCount);

        // Precompute note counts per date cluster
        const dateCounts = new Map<string, number>();
        for (const entry of filtered) {
            const key = this.getDateHeadingForEntry(entry);
            dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
        }

        // Group entries by date
        let lastDateKey = '';
        const isMobileStream = Platform.isMobile && !isTablet(this.app);

        for (const entry of visibleEntries) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                if (isMobileStream) {
                    const divider = container.createDiv({ cls: 'pos-rail-section-header pos-mobile-stream-date-header' });
                    divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                    const count = dateCounts.get(dateKey) || 1;
                    divider.createSpan({ cls: 'pos-rail-section-badge pos-date-count', text: `${count}` });
                } else {
                    const divider = container.createDiv({ cls: 'pos-date-divider' });
                    const headingEl = divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                    const count = dateCounts.get(dateKey) || 1;
                    const countEl = divider.createSpan({ cls: 'pos-date-count', text: `${count}` });
                    headingEl.style.textTransform = 'none';
                    headingEl.style.letterSpacing = '-0.01em';
                    headingEl.style.fontWeight = '500';
                    headingEl.style.fontSize = '0.76rem';
                    headingEl.style.color = 'var(--text-faint)';
                    headingEl.style.opacity = '0.82';
                    countEl.style.fontSize = '0.70rem';
                    countEl.style.fontWeight = '500';
                    countEl.style.color = 'var(--text-faint)';
                    divider.createDiv({ cls: 'pos-date-line' });
                }
            }

            this.renderNoteItem(container, entry);
        }

        // Setup progressive lazy-load sentinel
        if (this._renderedCount < filtered.length) {
            if (!this._scrollSentinelEl) {
                this._scrollSentinelEl = document.createElement('div');
                this._scrollSentinelEl.className = 'pos-scroll-sentinel';
            }
            container.appendChild(this._scrollSentinelEl);
            this.setupIntersectionObserver(filtered.length);
        } else if (this._scrollSentinelEl) {
            this._scrollSentinelEl.remove();
            this._scrollSentinelEl = null;
        }
    }

    private appendNextBatch(container: HTMLElement, totalFiltered: number): void {
        if (this._isLoadingMore) return;
        this._isLoadingMore = true;

        const filtered = this.getFilteredCaptures();
        const startIdx = this._renderedCount;
        const nextCount = Math.min(startIdx + BATCH_SIZE, filtered.length);
        const newBatch = filtered.slice(startIdx, nextCount);
        this._renderedCount = nextCount;

        if (this._scrollSentinelEl) {
            this._scrollSentinelEl.remove();
        }

        // Precompute note counts per date cluster
        const dateCounts = new Map<string, number>();
        for (const entry of filtered) {
            const key = this.getDateHeadingForEntry(entry);
            dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
        }

        // Find last date heading currently rendered
        const dateDividers = container.querySelectorAll<HTMLElement>('.pos-date-heading');
        let lastDateKey = dateDividers.length > 0 ? dateDividers[dateDividers.length - 1].textContent || '' : '';
        const isMobileStream = Platform.isMobile && !isTablet(this.app);

        for (const entry of newBatch) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                if (isMobileStream) {
                    const divider = container.createDiv({ cls: 'pos-rail-section-header pos-mobile-stream-date-header' });
                    divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                    const count = dateCounts.get(dateKey) || 1;
                    divider.createSpan({ cls: 'pos-rail-section-badge pos-date-count', text: `${count}` });
                } else {
                    const divider = container.createDiv({ cls: 'pos-date-divider' });
                    const headingEl = divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                    const count = dateCounts.get(dateKey) || 1;
                    const countEl = divider.createSpan({ cls: 'pos-date-count', text: `${count}` });
                    headingEl.style.textTransform = 'none';
                    headingEl.style.letterSpacing = '-0.01em';
                    headingEl.style.fontWeight = '500';
                    headingEl.style.fontSize = '0.76rem';
                    headingEl.style.color = 'var(--text-faint)';
                    headingEl.style.opacity = '0.82';
                    countEl.style.fontSize = '0.70rem';
                    countEl.style.fontWeight = '500';
                    countEl.style.color = 'var(--text-faint)';
                    divider.createDiv({ cls: 'pos-date-line' });
                }
            }

            this.renderNoteItem(container, entry);
        }

        if (this._renderedCount < totalFiltered && this._scrollSentinelEl) {
            container.appendChild(this._scrollSentinelEl);
            if (this._intersectionObserver) {
                this._intersectionObserver.observe(this._scrollSentinelEl);
            }
        }

        this._isLoadingMore = false;
    }

    private setupIntersectionObserver(totalFiltered: number): void {
        if (this._intersectionObserver) {
            this._intersectionObserver.disconnect();
        }

        if (!this._scrollSentinelEl) return;

        this._intersectionObserver = new IntersectionObserver((entries) => {
            if (entries[0] && entries[0].isIntersecting && !this._isLoadingMore) {
                if (this._renderedCount < totalFiltered && this._streamContainerEl) {
                    this.appendNextBatch(this._streamContainerEl, totalFiltered);
                }
            }
        }, {
            root: this.contentEl,
            rootMargin: '150px',
            threshold: 0.05,
        });

        this._intersectionObserver.observe(this._scrollSentinelEl);
    }

    private renderNoteItem(parent: HTMLElement, entry: CaptureEntry): void {
        const isSelected = this._selectedEntryIds.has(entry.id);
        const isImportant = this.plugin.index.isImportant(entry);
        const isEditing = this._editingEntryId === entry.id;
        const hasTasks = Array.isArray(entry.tasks) && entry.tasks.length > 0;
        const item = parent.createDiv({
            cls: `pos-note-stream-item ${isSelected ? 'is-selected' : ''} ${this._selectionMode ? 'is-selection-mode' : ''} ${isImportant ? 'is-important' : ''} ${hasTasks ? 'has-tasks' : ''} ${isEditing ? 'is-editing' : ''}`
        });

        // If in selection mode, tapping the note row toggles its selection
        if (this._selectionMode) {
            item.onclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.pos-interactive-checkbox') || target.closest('.pos-rail-task-checkbox') || target.closest('.pos-rail-meta-pill') || target.closest('.pos-note-actions') || target.closest('.pos-mobile-card-meta-right') || target.closest('a') || target.closest('img') || target.closest('.image-embed')) {
                    return;
                }
                if (this._selectedEntryIds.has(entry.id)) {
                    this._selectedEntryIds.delete(entry.id);
                } else {
                    this._selectedEntryIds.add(entry.id);
                }
                this.updateSelectionBar();
                this.updateStreamOnly();
            };
        } else {
            // Double-click to edit note inline
            item.ondblclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.pos-interactive-checkbox') || target.closest('.pos-rail-task-checkbox') || target.closest('.pos-rail-meta-pill') || target.closest('.pos-note-actions') || target.closest('.pos-mobile-card-meta-right') || target.closest('a') || target.closest('img') || target.closest('.image-embed') || target.closest('.pos-area-badge') || target.closest('.pos-date-badge')) {
                    return;
                }
                this._editingEntryId = entry.id;
                this.updateStreamOnly();
                this.updateComposerVisibility();
            };
        }

        const isMobile = Platform.isMobile && !isTablet(this.app);
        const timeStr = moment(entry.createdAtMs).format('h:mm A');

        // Mobile Compact Horizon UI/UX Row Layout (.pos-rail-task-item / .pos-rail-note-item)
        if (isMobile) {
            if (this._editingEntryId === entry.id) {
                item.addClass('is-editing', 'pos-mobile-stream-row');
                const editorWrapper = item.createDiv({ cls: 'pos-note-content-wrap pos-inline-editor-wrap' });
                this.renderInlineEditor(editorWrapper, entry);
                return;
            }

            if (this._selectionMode) {
                const selectCheckbox = item.createEl('input', {
                    type: 'checkbox',
                    cls: 'pos-select-checkbox pos-mobile-select-cb',
                });
                selectCheckbox.checked = isSelected;
                selectCheckbox.onclick = (e) => {
                    e.stopPropagation();
                    if (selectCheckbox.checked) {
                        this._selectedEntryIds.add(entry.id);
                    } else {
                        this._selectedEntryIds.delete(entry.id);
                    }
                    item.toggleClass('is-selected', selectCheckbox.checked);
                    this.updateSelectionBar();
                };
            }

            const indexedTasks = (Array.isArray(entry.gawaTasks) && entry.gawaTasks.length > 0)
                ? entry.gawaTasks
                : this.plugin.index.getGawaTasks(false).filter(t => t.filePath === entry.filePath);
            const effectiveTasks = indexedTasks.length > 0
                ? indexedTasks
                : (hasTasks ? entry.tasks.map(t => ({
                    filePath: entry.filePath,
                    noteTitle: entry.filePath.split('/').pop()?.replace(/\.md$/i, '') || '',
                    lineIndex: t.lineIndex,
                    rawTitle: t.title,
                    cleanTitle: t.title,
                    completed: t.completed,
                    dueDate: null,
                    subtasks: [],
                    remarks: []
                })) : []);

            if (effectiveTasks.length > 0) {
                const primaryTask = effectiveTasks[0];
                const todayStr = moment().format('YYYY-MM-DD');
                const isOverdue = Boolean(primaryTask.dueDate && !primaryTask.completed && primaryTask.dueDate < todayStr);

                item.addClass('pos-rail-task-item', 'pos-mobile-stream-row');
                if (isOverdue) {
                    item.addClass('is-overdue');
                }

                const checkbox = item.createEl('input', {
                    type: 'checkbox',
                    cls: 'pos-rail-task-checkbox'
                });
                checkbox.checked = Boolean(primaryTask.completed);
                checkbox.onclick = async (e) => {
                    e.stopPropagation();
                    const newChecked = checkbox.checked;
                    try {
                        this.invalidateRenderCacheForFile(primaryTask.filePath);
                        await this.plugin.capture.toggleTaskInFile(primaryTask.filePath, primaryTask.lineIndex, newChecked);
                        const file = this.app.vault.getAbstractFileByPath(primaryTask.filePath);
                        if (file instanceof TFile) {
                            await this.plugin.index.indexCaptureFile(file);
                        }
                        this.plugin.refreshCoordinator.notifyRefresh('tasks');
                        this.plugin.refreshCoordinator.notifyRefresh('capture');
                    } catch (err) {
                        console.error('[DIWA] Mobile stream task toggle error', err);
                        checkbox.checked = !newChecked;
                        new Notice('Failed to toggle task');
                    }
                };

                const content = item.createDiv({ cls: 'pos-rail-task-content' });

                const renderTaskContentBlock = (task: any, parentEl: HTMLElement) => {
                    const taskIsOverdue = Boolean(task.dueDate && !task.completed && task.dueDate < todayStr);
                    const titleEl = parentEl.createDiv({
                        cls: `pos-rail-task-title ${task.completed ? 'is-completed' : ''}`,
                    });
                    const taskText = (task.cleanTitle || task.rawTitle || '').trim();
                    void MarkdownRenderer.render(
                        this.app,
                        taskText,
                        titleEl,
                        task.filePath || entry.filePath,
                        this._streamComponent ?? this
                    ).then(() => {
                        const links = titleEl.querySelectorAll<HTMLAnchorElement>('a.internal-link');
                        links.forEach(link => {
                            const href = link.getAttribute('data-href') || link.textContent || '';
                            link.onclick = (e: MouseEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                new WikilinkPeekModal(
                                    this.app,
                                    this.plugin,
                                    href,
                                    task.filePath || entry.filePath,
                                    (target) => this.filterStreamByWikilink(target)
                                ).open();
                            };
                        });
                    });

                    titleEl.onclick = (e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('a.internal-link')) return;
                        e.stopPropagation();
                        new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    };

                    // Horizon Metadata Pills Row
                    const metaRow = parentEl.createDiv({ cls: 'pos-rail-task-meta' });

                    // 1. Due date pill
                    const pillCls = taskIsOverdue ? 'is-overdue' : (task.dueDate === todayStr ? 'is-today' : '');
                    const datePill = metaRow.createSpan({
                        cls: `pos-rail-meta-pill pos-rail-meta-date-btn ${pillCls}`,
                        attr: { 'aria-label': 'Tap to change due date' }
                    });
                    const calIcon = datePill.createSpan({ cls: 'pos-btn-icon' });
                    setIcon(calIcon, 'calendar');
                    datePill.createSpan({ text: task.dueDate ? ` Due: ${task.dueDate} ▾` : ' Set Due ▾' });
                    datePill.onclick = (e) => {
                        e.stopPropagation();
                        new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                    };

                    // 2. Subtasks Pill
                    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
                    if (hasSubtasks) {
                        const doneCount = task.subtasks.filter((s: any) => s.completed).length;
                        const subtaskPill = metaRow.createSpan({
                            cls: 'pos-rail-meta-pill',
                            attr: { 'aria-label': 'Tap to manage subtasks' }
                        });
                        const stIcon = subtaskPill.createSpan({ cls: 'pos-btn-icon' });
                        setIcon(stIcon, 'check-square');
                        subtaskPill.createSpan({ text: ` ${doneCount}/${task.subtasks.length}` });
                        subtaskPill.onclick = (e) => {
                            e.stopPropagation();
                            new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                        };
                    } else {
                        const addSubtaskBtn = metaRow.createSpan({
                            cls: 'pos-rail-meta-pill pos-rail-meta-action-pill',
                            attr: { 'aria-label': 'Add subtask' }
                        });
                        const stIcon = addSubtaskBtn.createSpan({ cls: 'pos-btn-icon' });
                        setIcon(stIcon, 'plus');
                        addSubtaskBtn.createSpan({ text: ' Subtask' });
                        addSubtaskBtn.onclick = (e) => {
                            e.stopPropagation();
                            new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                        };
                    }

                    // 3. Notes / Remarks Pill
                    const hasComments = Array.isArray(task.remarks) && task.remarks.length > 0;
                    if (hasComments) {
                        const commentPill = metaRow.createSpan({
                            cls: 'pos-rail-meta-pill',
                            attr: { 'aria-label': 'Tap to manage notes' }
                        });
                        const cIcon = commentPill.createSpan({ cls: 'pos-btn-icon' });
                        setIcon(cIcon, 'message-square');
                        commentPill.createSpan({ text: ` ${task.remarks.length}` });
                        commentPill.onclick = (e) => {
                            e.stopPropagation();
                            new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                        };
                    } else {
                        const addCommentBtn = metaRow.createSpan({
                            cls: 'pos-rail-meta-pill pos-rail-meta-action-pill',
                            attr: { 'aria-label': 'Add note' }
                        });
                        const cIcon = addCommentBtn.createSpan({ cls: 'pos-btn-icon' });
                        setIcon(cIcon, 'plus');
                        addCommentBtn.createSpan({ text: ' Note' });
                        addCommentBtn.onclick = (e) => {
                            e.stopPropagation();
                            new MobileTaskEditModal(this.app, this.plugin, task, this).open();
                        };
                    }
                };

                renderTaskContentBlock(primaryTask, content);

                // If the note contains additional top-level tasks, render them below inside content
                for (let idx = 1; idx < effectiveTasks.length; idx++) {
                    const extraTask = effectiveTasks[idx];
                    const extraRow = content.createDiv({ cls: 'pos-mobile-extra-task-row' });
                    const extraCb = extraRow.createEl('input', {
                        type: 'checkbox',
                        cls: 'pos-rail-task-checkbox'
                    });
                    extraCb.checked = Boolean(extraTask.completed);
                    extraCb.onclick = async (e) => {
                        e.stopPropagation();
                        const newChecked = extraCb.checked;
                        try {
                            this.invalidateRenderCacheForFile(extraTask.filePath);
                            await this.plugin.capture.toggleTaskInFile(extraTask.filePath, extraTask.lineIndex, newChecked);
                            const file = this.app.vault.getAbstractFileByPath(extraTask.filePath);
                            if (file instanceof TFile) {
                                await this.plugin.index.indexCaptureFile(file);
                            }
                            this.plugin.refreshCoordinator.notifyRefresh('tasks');
                            this.plugin.refreshCoordinator.notifyRefresh('capture');
                        } catch (err) {
                            console.error('[DIWA] Mobile stream extra task toggle error', err);
                            extraCb.checked = !newChecked;
                            new Notice('Failed to toggle task');
                        }
                    };
                    const extraBody = extraRow.createDiv({ cls: 'pos-rail-task-content' });
                    renderTaskContentBlock(extraTask, extraBody);
                }
            } else {
                // Regular Note Row (.pos-rail-note-item)
                item.addClass('pos-rail-note-item', 'pos-mobile-stream-row');

                const iconEl = item.createDiv({ cls: 'pos-rail-note-icon' });
                setIcon(iconEl, 'file-text');

                const contentWrap = item.createDiv({ cls: 'pos-rail-note-content pos-note-content-wrap' });
                const bodyEl = contentWrap.createDiv({ cls: 'pos-rail-note-snippet pos-note-body markdown-rendered' });

                const cacheKey = `${entry.filePath}_${entry.modified}`;
                const cached = this.getCachedRenderedBody(cacheKey);

                if (cached) {
                    bodyEl.innerHTML = cached.innerHTML;
                    this.attachInteractiveElements(bodyEl, entry);
                } else {
                    void MarkdownRenderer.render(
                        this.app,
                        entry.body,
                        bodyEl,
                        entry.filePath,
                        this._streamComponent ?? this
                    ).then(() => {
                        const clone = bodyEl.cloneNode(true) as HTMLElement;
                        this.setCachedRenderedBody(cacheKey, clone);
                        this.attachInteractiveElements(bodyEl, entry);
                    });
                }
            }

            // Right Trailing Cluster: Star indicator (when important) + Compact Timestamp + Minimal More Menu
            const metaRight = item.createDiv({ cls: 'pos-mobile-card-meta-right' });

            if (isImportant) {
                const starBtn = metaRight.createSpan({
                    cls: 'pos-action-icon pos-star-btn is-starred',
                    attr: { 'aria-label': 'Unmark important' }
                });
                setIcon(starBtn, 'star');
                starBtn.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        this.invalidateRenderCacheForFile(entry.filePath);
                        const newState = await this.plugin.capture.toggleNoteImportance(entry.filePath);
                        entry.important = newState;
                        entry.pinned = newState;
                        this.plugin.index?.setCaptureImportance?.(entry.filePath, newState);
                        new Notice(newState ? 'Marked as Important' : 'Unmarked from Important');
                        this.updateFilterCounts();
                        this.updateStreamOnly();
                    } catch (err) {
                        console.error('[DIWA] Toggle note importance error', err);
                        new Notice('Failed to update importance');
                    }
                };
            }

            metaRight.createSpan({ cls: 'pos-note-time', text: timeStr });

            const moreBtn = metaRight.createSpan({
                cls: 'pos-action-icon pos-action-more',
                attr: { 'aria-label': 'More note options' }
            });
            setIcon(moreBtn, 'more-horizontal');
            moreBtn.onclick = (e) => {
                e.stopPropagation();
                this.openNoteActionMenu(e, entry);
            };

            return;
        }

        // If in inline editing mode (Desktop & Tablet)
        if (this._editingEntryId === entry.id) {
            item.addClass('is-editing');
            item.style.display = 'flex';
            item.style.flexDirection = 'row';
            item.style.alignItems = 'flex-start';
            item.style.gap = '12px';
            item.style.width = '100%';
            item.style.maxWidth = '100%';

            // Preserve Col 1: Left Gutter (Time) so stream outliner alignment never jumps
            const gutterEl = item.createDiv({ cls: 'pos-note-gutter' });
            gutterEl.style.width = '68px';
            gutterEl.style.minWidth = '68px';
            gutterEl.style.maxWidth = '68px';
            gutterEl.style.flexShrink = '0';
            gutterEl.style.display = 'flex';
            gutterEl.style.alignItems = 'baseline';
            gutterEl.style.paddingTop = '6px';
            gutterEl.createSpan({ cls: 'pos-note-time', text: timeStr });

            // Col 2: Content Column containing the Inline Editor
            const editorWrapper = item.createDiv({ cls: 'pos-note-content-wrap pos-inline-editor-wrap' });
            editorWrapper.style.flex = '1';
            editorWrapper.style.minWidth = '0';
            editorWrapper.style.width = '100%';

            this.renderInlineEditor(editorWrapper, entry);
            return;
        }

        // Enforce strict horizontal outliner layout directly on DOM nodes
        item.style.display = 'flex';
        item.style.flexDirection = 'row';
        item.style.alignItems = 'flex-start';
        item.style.gap = '12px';

        // Col 1: Left Gutter (Time + Multi-Select Checkbox)
        const gutterEl = item.createDiv({ cls: 'pos-note-gutter' });
        gutterEl.style.width = this._selectionMode ? '86px' : '68px';
        gutterEl.style.minWidth = this._selectionMode ? '86px' : '68px';
        gutterEl.style.maxWidth = this._selectionMode ? '86px' : '68px';
        gutterEl.style.flexShrink = '0';
        gutterEl.style.display = 'flex';
        gutterEl.style.alignItems = 'baseline';
        gutterEl.style.gap = '6px';

        if (this._selectionMode) {
            const selectCheckbox = gutterEl.createEl('input', {
                type: 'checkbox',
                cls: 'pos-select-checkbox',
            });
            selectCheckbox.checked = isSelected;
            selectCheckbox.onclick = (e) => {
                e.stopPropagation();
                if (selectCheckbox.checked) {
                    this._selectedEntryIds.add(entry.id);
                } else {
                    this._selectedEntryIds.delete(entry.id);
                }
                item.toggleClass('is-selected', selectCheckbox.checked);
                this.updateSelectionBar();
            };
        }

        gutterEl.createSpan({ cls: 'pos-note-time', text: timeStr });

        // Col 2: Content Column (Body + Badges)
        const contentWrap = item.createDiv({ cls: 'pos-note-content-wrap' });
        contentWrap.style.flex = '1';
        contentWrap.style.minWidth = '0';
        contentWrap.style.display = 'flex';
        contentWrap.style.flexDirection = 'row';
        contentWrap.style.alignItems = 'baseline';
        contentWrap.style.flexWrap = 'wrap';
        contentWrap.style.gap = '8px';

        // Note Body rendered via Obsidian MarkdownRenderer with cache
        const bodyEl = contentWrap.createDiv({ cls: 'pos-note-body markdown-rendered' });
        bodyEl.style.display = 'inline';
        bodyEl.style.wordBreak = 'break-word';

        // Badges container (Area, Tags, Reminders)
        const badgesEl = contentWrap.createDiv({ cls: 'pos-note-badges' });
        badgesEl.style.display = 'inline-flex';
        badgesEl.style.alignItems = 'baseline';
        badgesEl.style.gap = '6px';

        const areas = this.plugin.settings.lifeAreas || [];
        const areaObj = entry.area ? areas.find(a => a.id.toLowerCase() === entry.area.toLowerCase()) : null;

        // Metadata badges (Desktop & Tablet only; mobile keeps ultra-clean single timestamp)
        if (!isMobile) {
            // Other tags (Life Area is hidden from stream view)
            for (const tag of entry.tags) {
                if (tag.toLowerCase() !== (entry.area || '').toLowerCase()) {
                    const tagBadge = badgesEl.createSpan({ cls: 'pos-tag-badge', text: `#${tag}` });
                    tagBadge.onclick = (e) => {
                        e.stopPropagation();
                        this._searchQuery = `#${tag}`;
                        this._renderedCount = BATCH_SIZE;
                        this.updateStreamOnly();
                    };
                }
            }
        }

        // Col 3: Action buttons (Hover)
        const actionsEl = item.createDiv({ cls: 'pos-note-actions' });

        const starBtn = actionsEl.createSpan({
            cls: `pos-action-icon pos-star-btn ${isImportant ? 'is-starred' : ''}`,
            attr: { 'aria-label': isImportant ? 'Unmark important' : 'Mark as important' }
        });
        setIcon(starBtn, 'star');
        starBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                this.invalidateRenderCacheForFile(entry.filePath);
                const newState = await this.plugin.capture.toggleNoteImportance(entry.filePath);
                entry.important = newState;
                entry.pinned = newState;
                this.plugin.index?.setCaptureImportance?.(entry.filePath, newState);
                new Notice(newState ? 'Marked as Important' : 'Unmarked from Important');
                this.updateFilterCounts();
                this.updateStreamOnly();
            } catch (err) {
                console.error('[DIWA] Toggle note importance error', err);
                new Notice('Failed to update importance');
            }
        };

        if (!isMobile) {
            const editBtn = actionsEl.createSpan({
                cls: 'pos-action-icon pos-edit-btn',
                attr: { 'aria-label': 'Edit note' }
            });
            setIcon(editBtn, 'edit-3');
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this._editingEntryId = entry.id;
                this.updateStreamOnly();
                this.updateComposerVisibility();
            };
        }

        const moreBtn = actionsEl.createSpan({
            cls: 'pos-action-icon pos-action-more',
            attr: { 'aria-label': 'More note options' }
        });
        setIcon(moreBtn, 'more-horizontal');
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            this.openNoteActionMenu(e, entry);
        };

        const isTabletDevice = isTablet(this.app);
        if (!isMobile && !isTabletDevice) {
            const trashBtn = actionsEl.createSpan({
                cls: 'pos-action-icon pos-trash-btn',
                attr: { 'aria-label': 'Delete note' }
            });
            setIcon(trashBtn, 'trash-2');
            trashBtn.onclick = (e) => {
                e.stopPropagation();
                this.promptDeleteNote(entry);
            };
        }
        const cacheKey = `${entry.filePath}_${entry.modified}`;
        const cached = this.getCachedRenderedBody(cacheKey);

        if (cached) {
            // Restore cached innerHTML and attach listeners
            bodyEl.innerHTML = cached.innerHTML;
            this.attachInteractiveElements(bodyEl, entry);
        } else {
            void MarkdownRenderer.render(
                this.app,
                entry.body,
                bodyEl,
                entry.filePath,
                this._streamComponent ?? this
            ).then(() => {
                // Cache rendered DOM content
                const clone = bodyEl.cloneNode(true) as HTMLElement;
                this.setCachedRenderedBody(cacheKey, clone);
                this.attachInteractiveElements(bodyEl, entry);
            });
        }
    }

    private openDateActionMenu(e: MouseEvent, entry: CaptureEntry, dateStr: string): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle('Snooze to Tomorrow')
                .setIcon('clock')
                .onClick(async () => {
                    const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
                    await this.plugin.capture.snoozeDateLink(entry.filePath, dateStr, tomorrow);
                    this.invalidateRenderCacheForFile(entry.filePath);
                    new Notice(`Snoozed to tomorrow (${tomorrow})`);
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Snooze +3 Days')
                .setIcon('calendar')
                .onClick(async () => {
                    const in3Days = moment().add(3, 'days').format('YYYY-MM-DD');
                    await this.plugin.capture.snoozeDateLink(entry.filePath, dateStr, in3Days);
                    this.invalidateRenderCacheForFile(entry.filePath);
                    new Notice(`Snoozed to ${in3Days}`);
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Snooze +1 Week')
                .setIcon('calendar-with-checkmark')
                .onClick(async () => {
                    const in1Week = moment().add(7, 'days').format('YYYY-MM-DD');
                    await this.plugin.capture.snoozeDateLink(entry.filePath, dateStr, in1Week);
                    this.invalidateRenderCacheForFile(entry.filePath);
                    new Notice(`Snoozed to next week (${in1Week})`);
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Pick Custom Date...')
                .setIcon('calendar')
                .onClick(() => {
                    new DatePickerModal(this.app, dateStr, async (chosenDate) => {
                        await this.plugin.capture.snoozeDateLink(entry.filePath, dateStr, chosenDate);
                        this.invalidateRenderCacheForFile(entry.filePath);
                        new Notice(`Rescheduled to ${chosenDate}`);
                        this.updateStreamOnly();
                        this.updateFilterCounts();
                    }).open();
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Clear Reminder Date')
                .setIcon('cross')
                .onClick(async () => {
                    await this.plugin.capture.removeDateLink(entry.filePath, dateStr);
                    this.invalidateRenderCacheForFile(entry.filePath);
                    new Notice('Reminder date removed');
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Open Daily Note')
                .setIcon('document')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(dateStr, entry.filePath, false);
                });
        });

        menu.showAtMouseEvent(e);
    }

    private openMobileTaskModalForEntry(entry: CaptureEntry, lineIndex?: number, taskTitle?: string): void {
        const allTasks = (Array.isArray(entry.gawaTasks) && entry.gawaTasks.length > 0)
            ? entry.gawaTasks
            : this.plugin.index.getGawaTasks(false).filter(t => t.filePath === entry.filePath);
        let matched = allTasks.find(t => lineIndex !== undefined && lineIndex >= 0 && t.lineIndex === lineIndex);
        if (!matched && taskTitle) {
            matched = allTasks.find(t => t.cleanTitle?.includes(taskTitle) || t.rawTitle?.includes(taskTitle));
        }
        if (!matched && allTasks.length > 0) {
            matched = allTasks[0];
        }
        if (!matched && entry.tasks && entry.tasks.length > 0) {
            const fallback = entry.tasks[0];
            matched = {
                filePath: entry.filePath,
                lineIndex: fallback.lineIndex,
                rawTitle: fallback.title,
                cleanTitle: fallback.title,
                completed: fallback.completed,
                dueDate: null,
                subtasks: [],
                remarks: []
            } as any;
        }
        if (matched) {
            new MobileTaskEditModal(this.app, this.plugin, matched, this).open();
        }
    }

    private openNoteActionMenu(e: MouseEvent, entry: CaptureEntry): void {
        const menu = new Menu();
        const isImportant = this.plugin.index.isImportant(entry);
        const hasTasks = Array.isArray(entry.tasks) && entry.tasks.length > 0;

        if (hasTasks && Platform.isMobile) {
            menu.addItem((item) => {
                item.setTitle('Schedule & Task Details...')
                    .setIcon('calendar-check')
                    .onClick(() => {
                        this.openMobileTaskModalForEntry(entry);
                    });
            });
            menu.addSeparator();
        }

        menu.addItem((item) => {
            item.setTitle(isImportant ? 'Remove from Important' : 'Mark as Important')
                .setIcon(isImportant ? 'star-off' : 'star')
                .onClick(async () => {
                    try {
                        this.invalidateRenderCacheForFile(entry.filePath);
                        const newState = await this.plugin.capture.toggleNoteImportance(entry.filePath);
                        entry.important = newState;
                        entry.pinned = newState;
                        this.plugin.index?.setCaptureImportance?.(entry.filePath, newState);
                        new Notice(newState ? 'Marked as Important' : 'Unmarked from Important');
                        this.updateFilterCounts();
                        this.updateStreamOnly();
                    } catch (err) {
                        console.error('[DIWA] Toggle note importance error', err);
                        new Notice('Failed to update importance');
                    }
                });
        });

        menu.addItem((item) => {
            item.setTitle('Edit Note (Inline)')
                .setIcon('edit')
                .onClick(() => {
                    this._editingEntryId = entry.id;
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Open in Obsidian Editor')
                .setIcon('document')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(entry.filePath, '', false);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Set Life Area...')
                .setIcon('tag')
                .onClick(() => {
                    const areaMenu = new Menu();
                    const areas = this.plugin.settings.lifeAreas || [];
                    for (const area of areas) {
                        areaMenu.addItem((subItem) => {
                            subItem.setTitle(this.createMutedAreaTitle(area.label, area.icon))
                                .setChecked(entry.area.toLowerCase() === area.id.toLowerCase())
                                .onClick(async () => {
                                    try {
                                        this._renderedMarkdownCache.delete(`${entry.filePath}_${entry.modified}`);
                                        await this.plugin.capture.updateNoteContent(entry.filePath, entry.body, area.id);
                                        new Notice(`Moved to ${area.label}`);
                                        this.updateStreamOnly();
                                        this.updateFilterCounts();
                                    } catch (err) {
                                        console.error('[DIWA] Update note area error', err);
                                        new Notice('Failed to update area');
                                    }
                                });
                        });
                    }
                    if (entry.area) {
                        areaMenu.addSeparator();
                        areaMenu.addItem((subItem) => {
                            subItem.setTitle('Remove Area (Untagged)')
                                .setIcon('cross')
                                .onClick(async () => {
                                    try {
                                        this._renderedMarkdownCache.delete(`${entry.filePath}_${entry.modified}`);
                                        await this.plugin.capture.updateNoteContent(entry.filePath, entry.body, '');
                                        new Notice('Removed area');
                                        this.updateStreamOnly();
                                        this.updateFilterCounts();
                                    } catch (err) {
                                        console.error('[DIWA] Remove note area error', err);
                                        new Notice('Failed to remove area');
                                    }
                                });
                        });
                    }
                    areaMenu.showAtMouseEvent(e);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Copy Note Content')
                .setIcon('copy')
                .onClick(async () => {
                    await navigator.clipboard.writeText(entry.body);
                    new Notice('Note content copied to clipboard');
                });
        });

        menu.addItem((item) => {
            item.setTitle('Digest Note...')
                .setIcon('sparkles')
                .onClick(() => {
                    this.openSingleNoteDigest(entry);
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Delete Note')
                .setIcon('trash')
                .onClick(() => {
                    this.promptDeleteNote(entry);
                });
        });

        menu.showAtMouseEvent(e);
    }

    private openSingleNoteDigest(entry: CaptureEntry): void {
        const contentToParse = entry.rawBody || entry.body;
        const blocks = this.plugin.capture.parseDigestibleBlocks(
            contentToParse,
            entry.filePath,
            entry.createdAtMs,
            entry.area || null,
            entry.archived
        );

        if (blocks.length === 0) {
            new Notice('No digestible blocks identified in this note.');
            return;
        }

        const dateStr = moment(entry.createdAtMs).format('YYYY-MM-DD');
        const rawLine = (entry.body.split('\n')[0].replace(/^#+\s*/, '').trim());
        const noteTitle = rawLine
            .replace(/^[ \t]*-[ \t]+\[[ xX]\]\s*/, '')
            .replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1')
            .replace(/#([a-zA-Z0-9_\-]+)/g, '')
            .replace(/\s+/g, ' ')
            .slice(0, 42)
            .trim() || 'Quick Note';

        new PreFlightDigestModal(
            this.app,
            this.plugin,
            dateStr,
            blocks,
            async (confirmedBlocks) => {
                await this.plugin.capture.executeBatchDigest(dateStr, confirmedBlocks);
                const file = this.app.vault.getAbstractFileByPath(entry.filePath);
                if (file instanceof TFile) {
                    await this.plugin.index.indexCaptureFile(file);
                }
                this.invalidateRenderCacheForFile(entry.filePath);
                this.updateStreamOnly();
                this.updateFilterCounts();
                this.plugin.refreshCoordinator.notifyRefresh('capture');
            },
            noteTitle
        ).open();
    }

    private promptDeleteNote(entry: CaptureEntry): void {
        const title = entry.body.slice(0, 80) || 'Note';
        new ConfirmDeleteModal(this.app, title, async () => {
            await this.plugin.capture.deleteNote(entry.filePath);
            this._selectedEntryIds.delete(entry.id);
            if (this._editingEntryId === entry.id) {
                this._editingEntryId = null;
            }
            this.invalidateRenderCacheForFile(entry.filePath);
            this.updateStreamOnly();
            this.updateFilterCounts();
            this.updateComposerVisibility();
            const targetParent = this._desktopComposerWrapperEl || this._mainStageEl;
            if (targetParent) {
                this.renderComposer(targetParent, false);
            }
            new Notice('Note moved to trash');
        }).open();
    }

    public filterStreamByWikilink(linkName: string): void {
        this._searchQuery = linkName;
        this._renderedCount = BATCH_SIZE;
        if (Platform.isMobile) {
            this._mobileSearchOpen = true;
        }
        if (this._headerBarEl) {
            this.renderHeaderBar(this._headerBarEl);
        }
        this.updateStreamOnly();
        this.updateFilterCounts();
        this.updateComposerVisibility();
        new Notice(`Filtered stream by "${linkName}"`);
    }

    private openWikilinkActionMenu(e: MouseEvent, linkText: string, sourcePath: string): void {
        const menu = new Menu();
        const cleanName = linkText.split('#')[0];

        menu.addItem((item) => {
            item.setTitle('Quick Preview')
                .setIcon('eye')
                .onClick(() => {
                    new WikilinkPeekModal(
                        this.app,
                        this.plugin,
                        linkText,
                        sourcePath,
                        (target) => this.filterStreamByWikilink(target)
                    ).open();
                });
        });

        menu.addItem((item) => {
            item.setTitle(`Filter Stream for [[${cleanName}]]`)
                .setIcon('search')
                .onClick(() => {
                    this.filterStreamByWikilink(cleanName);
                });
        });

        menu.addSeparator();

        if (!Platform.isMobile) {
            menu.addItem((item) => {
                item.setTitle('Open in New Window')
                    .setIcon('app-window')
                    .onClick(async () => {
                        await openWikilinkInPeekWindow(this.app, linkText, sourcePath);
                    });
            });
        }

        menu.addItem((item) => {
            item.setTitle('Open in Adjacent Split')
                .setIcon('split')
                .onClick(async () => {
                    const splitLeaf = this.app.workspace.getLeaf('split', 'vertical');
                    const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanName, sourcePath);
                    if (destFile) {
                        await splitLeaf.openFile(destFile);
                    } else {
                        await this.app.workspace.openLinkText(linkText, sourcePath, 'split');
                    }
                });
        });

        menu.addItem((item) => {
            item.setTitle('Open in New Tab')
                .setIcon('tab')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(linkText, sourcePath, 'tab');
                });
        });

        menu.addItem((item) => {
            item.setTitle('Copy Wikilink')
                .setIcon('copy')
                .onClick(async () => {
                    await navigator.clipboard.writeText(`[[${linkText}]]`);
                    new Notice(`Copied [[${linkText}]]`);
                });
        });

        menu.showAtMouseEvent(e);
    }

    private attachInteractiveElements(container: HTMLElement, entry: CaptureEntry): void {
        // 1. Task Checkboxes
        const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        checkboxes.forEach((cb, idx) => {
            cb.disabled = false;
            cb.addClass('pos-interactive-checkbox');

            const listItem = cb.closest('li');
            if (listItem) {
                listItem.toggleClass('is-checked', cb.checked);
                listItem.setAttribute('data-task', cb.checked ? 'x' : ' ');
            }
            const cleanLiText = listItem ? (listItem.textContent || '').replace(/^\[[ xX]\]\s*/, '').trim() : '';
            const matchedTask = entry.tasks.find(t => t.title && cleanLiText && (cleanLiText.includes(t.title) || t.title.includes(cleanLiText))) || entry.tasks[idx];

            cb.onclick = async (e) => {
                e.stopPropagation();
                const isChecked = cb.checked;
                
                // Optimistic visual strike-through update with theme data-task support
                if (listItem) {
                    listItem.toggleClass('is-checked', isChecked);
                    listItem.setAttribute('data-task', isChecked ? 'x' : ' ');
                }

                if (matchedTask) {
                    matchedTask.completed = isChecked;
                }

                // Invalidate render cache for this entry
                this.invalidateRenderCacheForFile(entry.filePath);

                // Update file directly in background
                this._taskPending++;
                try {
                    const lineIdx = matchedTask ? matchedTask.lineIndex : -1;
                    const taskTitle = matchedTask ? matchedTask.title : (cleanLiText || undefined);
                    await this.plugin.capture.toggleTaskInFile(
                        entry.filePath,
                        lineIdx,
                        isChecked,
                        taskTitle
                    );
                } catch (err) {
                    console.error('[DIWA DesktopHubView] Failed to toggle task checkbox', err);
                    cb.checked = !isChecked; // revert on failure
                    if (listItem) {
                        listItem.toggleClass('is-checked', !isChecked);
                        listItem.setAttribute('data-task', !isChecked ? 'x' : ' ');
                    }
                    if (matchedTask) {
                        matchedTask.completed = !isChecked;
                    }
                    new Notice('Failed to update task state in note');
                } finally {
                    this._taskPending--;
                }
            };
        });

        // 2. Rendered internal date links and note wikilinks
        const internalLinks = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
        const todayStr = moment().format('YYYY-MM-DD');
        const yesterdayStr = moment().subtract(1, 'day').format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');

        internalLinks.forEach(link => {
            const href = link.getAttribute('data-href') || link.textContent || '';
            const match = href.match(/^(\d{4}-\d{2}-\d{2})$/);
            if (match) {
                const dateStr = match[1];
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;

                link.addClass('pos-rendered-date-link');
                link.addClass('pos-stream-wikilink');
                if (isToday) link.addClass('pos-date-link-today');
                else if (isPast) link.addClass('pos-date-link-past');
                else link.addClass('pos-date-link-future');

                // If inside a task list item, prepend "Due: " and substitute relative date (Today, Yesterday, Tomorrow)
                const taskLi = link.closest('li.task-list-item, li:has(input[type="checkbox"])');
                if (taskLi) {
                    let relativeLabel = dateStr;
                    if (dateStr === todayStr) {
                        relativeLabel = 'Today';
                    } else if (dateStr === yesterdayStr) {
                        relativeLabel = 'Yesterday';
                    } else if (dateStr === tomorrowStr) {
                        relativeLabel = 'Tomorrow';
                    }

                    // Check if previous text already contains "Due:" or "due:" to avoid double prefix
                    const prevText = link.previousSibling?.textContent?.trim() || '';
                    const alreadyHasDue = /(?:due|Due):\s*$/.test(prevText);
                    link.textContent = alreadyHasDue ? relativeLabel : `Due: ${relativeLabel}`;
                }

                link.onclick = (e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (taskLi && Platform.isMobile && !isTablet(this.app)) {
                        this.openMobileTaskModalForEntry(entry);
                        return;
                    }
                    this.openDateActionMenu(e, entry, dateStr);
                };
            } else {
                link.addClass('pos-stream-wikilink');

                // Native hover preview via Obsidian Page Preview
                link.addEventListener('mouseover', (e: MouseEvent) => {
                    this.app.workspace.trigger('hover-link', {
                        event: e,
                        source: VIEW_TYPE_DESKTOP_HUB,
                        hoverParent: this,
                        targetEl: link,
                        linktext: href,
                        sourcePath: entry.filePath
                    });
                });

                // Context menu (Right-click on desktop, long-press on mobile)
                link.oncontextmenu = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openWikilinkActionMenu(e, href, entry.filePath);
                };

                // Click / Tap handler: Open WikilinkPeekModal by default (with Desktop modifier support)
                link.onclick = async (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (!Platform.isMobile) {
                        if (e.metaKey || e.ctrlKey) {
                            await this.app.workspace.openLinkText(href, entry.filePath, 'tab');
                            return;
                        }
                        if (e.altKey) {
                            await openWikilinkInPeekWindow(this.app, href, entry.filePath);
                            return;
                        }
                    }

                    new WikilinkPeekModal(
                        this.app,
                        this.plugin,
                        href,
                        entry.filePath,
                        (target) => this.filterStreamByWikilink(target)
                    ).open();
                };
            }
        });

        // 3. Embedded & Inline Images (Click to Zoom Lightbox)
        const imageEmbeds = container.querySelectorAll<HTMLElement>('.internal-embed');
        imageEmbeds.forEach(embed => {
            const rawSrc = (embed.getAttribute('src') || '').trim();
            if (!rawSrc) return;
            const cleanTarget = rawSrc.split('|')[0].split('#')[0].trim();
            if (!/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(cleanTarget)) return;

            embed.addClass('image-embed');
            if (!embed.querySelector('img')) {
                const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanTarget, entry.filePath);
                if (destFile instanceof TFile) {
                    embed.empty();
                    const imgEl = embed.createEl('img', {
                        cls: 'pos-stream-zoomable-img',
                        attr: {
                            src: this.app.vault.getResourcePath(destFile),
                            alt: embed.getAttribute('alt') || destFile.basename
                        }
                    });
                    const widthSpec = rawSrc.includes('|') ? rawSrc.split('|')[1]?.trim() : '';
                    if (widthSpec && /^\d+$/.test(widthSpec)) {
                        imgEl.width = Number(widthSpec);
                    }
                }
            }
        });

        container.querySelectorAll<HTMLImageElement>('img').forEach(img => {
            img.addClass('pos-stream-zoomable-img');
        });

        container.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const img = target.closest('img');
            if (!img || !container.contains(img)) return;
            const src = img.getAttribute('src') || img.src;
            if (!src) return;
            e.preventDefault();
            e.stopPropagation();
            this.openImageLightbox(src, img.getAttribute('alt') || '');
        });
    }

    private openImageLightbox(src: string, alt: string = ''): void {
        document.querySelectorAll('.pos-image-lightbox').forEach(el => el.remove());

        const overlay = document.body.createDiv({
            cls: 'pos-image-lightbox',
            attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': alt || 'Image Zoom Preview' }
        });

        const stage = overlay.createDiv({ cls: 'pos-image-lightbox-stage' });
        const img = stage.createEl('img', {
            cls: 'pos-image-lightbox-img',
            attr: { src, alt: alt || 'Zoomed image', draggable: 'false' }
        });

        const controls = overlay.createDiv({ cls: 'pos-image-lightbox-controls' });
        const zoomOutBtn = controls.createEl('button', {
            cls: 'pos-image-lightbox-btn',
            attr: { 'aria-label': 'Zoom out', title: 'Zoom out (−)' }
        });
        setIcon(zoomOutBtn, 'minus');

        const zoomLabel = controls.createSpan({
            cls: 'pos-image-lightbox-scale',
            text: '100%',
            attr: { title: 'Click to reset zoom (100%)' }
        });

        const zoomInBtn = controls.createEl('button', {
            cls: 'pos-image-lightbox-btn',
            attr: { 'aria-label': 'Zoom in', title: 'Zoom in (+)' }
        });
        setIcon(zoomInBtn, 'plus');

        const closeBtn = controls.createEl('button', {
            cls: 'pos-image-lightbox-btn pos-image-lightbox-close',
            attr: { 'aria-label': 'Close preview (Esc)', title: 'Close (Esc)' }
        });
        setIcon(closeBtn, 'x');

        let scale = 1;
        let panX = 0;
        let panY = 0;
        let isDragging = false;
        let didDrag = false;
        let dragStartX = 0;
        let dragStartY = 0;

        const applyTransform = () => {
            if (scale <= 1) {
                scale = 1;
                panX = 0;
                panY = 0;
            }
            img.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
            img.toggleClass('is-zoomed', scale > 1);
            img.toggleClass('is-dragging', isDragging);
            zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        };

        const setZoom = (nextScale: number) => {
            scale = Math.min(Math.max(nextScale, 1), 4);
            applyTransform();
        };

        const closeLightbox = () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            overlay.remove();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeLightbox();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                setZoom(scale + 0.5);
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                setZoom(scale - 0.5);
            } else if (e.key === '0') {
                e.preventDefault();
                setZoom(1);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                didDrag = true;
            }
            panX += dx;
            panY += dy;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            applyTransform();
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            img.removeClass('is-dragging');
        };

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        img.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            didDrag = false;
            if (scale > 1) {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                img.addClass('is-dragging');
            }
        });

        img.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            if (didDrag) {
                didDrag = false;
                return;
            }
            setZoom(scale > 1 ? 1 : 2);
        });

        overlay.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY < 0 ? 0.25 : -0.25;
            setZoom(scale + delta);
        }, { passive: false });

        controls.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
        });

        zoomInBtn.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            setZoom(scale + 0.5);
        };

        zoomOutBtn.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            setZoom(scale - 0.5);
        };

        zoomLabel.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            setZoom(1);
        };

        closeBtn.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            closeLightbox();
        };

        overlay.onclick = (e: MouseEvent) => {
            if (e.target === overlay || e.target === stage) {
                closeLightbox();
            }
        };
    }

    private renderInlineEditor(parent: HTMLElement, entry: CaptureEntry): void {
        const editorContainer = parent.createDiv({ cls: 'pos-inline-editor' });

        // Area selector pills inside inline editor
        const areaContainer = editorContainer.createDiv({ cls: 'pos-inline-area-selector' });
        let editingArea = entry.area || '';

        const areas = this.plugin.settings.lifeAreas || [];
        for (const area of areas) {
            const isSelected = editingArea.toLowerCase() === area.id.toLowerCase();
            const areaBtn = areaContainer.createEl('button', {
                cls: `pos-composer-area-pill ${isSelected ? 'is-selected' : ''}`,
                text: `${area.icon || ''} ${area.label}`.trim()
            });
            areaBtn.onclick = () => {
                editingArea = editingArea.toLowerCase() === area.id.toLowerCase() ? '' : area.id;
                areaContainer.querySelectorAll<HTMLButtonElement>('.pos-composer-area-pill').forEach(btn => {
                    const btnArea = areas.find(a => btn.textContent?.includes(a.label));
                    if (btnArea) {
                        btn.toggleClass('is-selected', editingArea.toLowerCase() === btnArea.id.toLowerCase());
                    }
                });
            };
        }

        const textarea = editorContainer.createEl('textarea', {
            cls: 'pos-inline-textarea',
        });
        textarea.value = entry.body;

        // Auto-expand textarea without forced reflow
        let resizePending = false;
        const autoResize = () => {
            if (resizePending) return;
            resizePending = true;
            requestAnimationFrame(() => {
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 80), 400)}px`;
                resizePending = false;
            });
        };
        textarea.oninput = autoResize;
        setTimeout(() => {
            autoResize();
            textarea.focus();
            try {
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch {}
        }, 60);

        // Smart triggers in inline editor ([[ for links, # for tags/areas, @ for NLP dates, / for people, ++ for tasks)
        attachInlineTriggers(
            this.app,
            textarea,
            (_d) => {},
            (tag) => {
                const area = areas.find(a => a.id.toLowerCase() === tag.toLowerCase());
                if (area) {
                    editingArea = area.id;
                    areaContainer.querySelectorAll<HTMLButtonElement>('.pos-composer-area-pill').forEach(btn => {
                        const btnArea = areas.find(a => btn.textContent?.includes(a.label));
                        if (btnArea) {
                            btn.toggleClass('is-selected', editingArea.toLowerCase() === btnArea.id.toLowerCase());
                        }
                    });
                }
            },
            () => {
                const areasList = (this.plugin.settings.lifeAreas || []).map(a => a.id);
                const contexts = this.plugin.settings.contexts || [];
                return Array.from(new Set([...areasList, ...contexts]));
            },
            this.plugin.settings.peopleFolder
        );

        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
        );

        // Action buttons
        const actions = editorContainer.createDiv({ cls: 'pos-inline-actions' });
        
        const cancelBtn = actions.createEl('button', { text: 'Cancel (Esc)', cls: 'pos-inline-btn' });
        cancelBtn.onclick = () => {
            this._editingEntryId = null;
            this.updateStreamOnly();
            this.updateComposerVisibility();
        };

        const saveBtn = actions.createEl('button', {
            text: 'Save (⌘↵)',
            cls: 'pos-inline-save-btn'
        });
        saveBtn.onclick = async () => {
            const newBody = textarea.value.trim();
            saveBtn.disabled = true;
            try {
                this.invalidateRenderCacheForFile(entry.filePath);
                await this.plugin.capture.updateNoteContent(entry.filePath, newBody, editingArea);
                this._editingEntryId = null;
                new Notice('Note updated');
                this.updateStreamOnly();
                this.updateFilterCounts();
                this.updateComposerVisibility();
            } catch (err) {
                console.error('[DIWA DesktopHubView] inline edit save error', err);
                new Notice('Failed to save edits');
                saveBtn.disabled = false;
            }
        };

        textarea.onkeydown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void saveBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._editingEntryId = null;
                this.updateStreamOnly();
                this.updateComposerVisibility();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                // Smart markdown list & task continuation
                const val = textarea.value;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                if (start === end) {
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                    const lineText = val.substring(lineStart, start);
                    const taskMatch = lineText.match(/^(\s*-\s*\[[ xX]?\]\s+)(.*)$/);
                    const bulletMatch = lineText.match(/^(\s*[-*]\s+)(.*)$/);
                    const numMatch = lineText.match(/^(\s*(\d+)\.\s+)(.*)$/);

                    if (taskMatch) {
                        e.preventDefault();
                        if (taskMatch[2].trim() === '') {
                            const before = val.substring(0, lineStart);
                            const after = val.substring(start);
                            textarea.value = before + after;
                            textarea.setSelectionRange(lineStart, lineStart);
                        } else {
                            const indent = taskMatch[1].replace(/\[[ xX]?\]\s+/, '[ ] ');
                            const before = val.substring(0, start);
                            const after = val.substring(end);
                            textarea.value = before + '\n' + indent + after;
                            const newPos = start + 1 + indent.length;
                            textarea.setSelectionRange(newPos, newPos);
                        }
                        autoResize();
                    } else if (bulletMatch) {
                        e.preventDefault();
                        if (bulletMatch[2].trim() === '') {
                            const before = val.substring(0, lineStart);
                            const after = val.substring(start);
                            textarea.value = before + after;
                            textarea.setSelectionRange(lineStart, lineStart);
                        } else {
                            const prefix = bulletMatch[1];
                            const before = val.substring(0, start);
                            const after = val.substring(end);
                            textarea.value = before + '\n' + prefix + after;
                            const newPos = start + 1 + prefix.length;
                            textarea.setSelectionRange(newPos, newPos);
                        }
                        autoResize();
                    } else if (numMatch) {
                        e.preventDefault();
                        if (numMatch[3].trim() === '') {
                            const before = val.substring(0, lineStart);
                            const after = val.substring(start);
                            textarea.value = before + after;
                            textarea.setSelectionRange(lineStart, lineStart);
                        } else {
                            const nextNum = parseInt(numMatch[2], 10) + 1;
                            const indent = numMatch[1].replace(/\d+\./, `${nextNum}.`);
                            const before = val.substring(0, start);
                            const after = val.substring(end);
                            textarea.value = before + '\n' + indent + after;
                            const newPos = start + 1 + indent.length;
                            textarea.setSelectionRange(newPos, newPos);
                        }
                        autoResize();
                    }
                }
            }
        };
    }

    private getDateHeadingForEntry(entry: CaptureEntry): string {
        if (this._activeFilter === 'upcoming') {
            const futureDate = this.plugin.index.getEarliestFutureDate(entry);
            if (futureDate) {
                return this.formatFutureDateHeading(futureDate);
            }
        }
        return this.formatDateHeading(entry.createdAtMs);
    }

    private formatFutureDateHeading(dateStr: string): string {
        const target = moment(dateStr, 'YYYY-MM-DD');
        const today = moment().startOf('day');
        const tomorrow = moment().add(1, 'day').startOf('day');
        const endOfWeek = moment().endOf('week');

        if (target.isSame(tomorrow, 'day')) {
            return `Tomorrow · ${target.format('dddd, MMMM D')}`;
        } else if (target.isSameOrBefore(endOfWeek, 'day')) {
            return `This Week · ${target.format('dddd, MMMM D')}`;
        } else if (target.isSame(moment().add(1, 'week'), 'week')) {
            return `Next Week · ${target.format('dddd, MMMM D')}`;
        } else if (target.isSame(today, 'year')) {
            return target.format('MMMM D, dddd');
        } else {
            return target.format('MMMM D, YYYY (dddd)');
        }
    }

    private formatDateHeading(timestampMs: number): string {
        const m = moment(timestampMs);
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'day').startOf('day');

        if (m.isSame(today, 'day')) {
            return 'Today';
        } else if (m.isSame(yesterday, 'day')) {
            return 'Yesterday';
        } else if (m.isSame(today, 'year')) {
            return m.format('dddd, MMMM D');
        } else {
            return m.format('dddd, MMMM D, YYYY');
        }
    }
}

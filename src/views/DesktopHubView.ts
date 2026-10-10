import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, moment, Notice, Platform, Menu, Component, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_DESKTOP_HUB, DESKTOP_HUB_ICON_ID } from '../constants';
import { CaptureEntry, ScratchpadFilterMode } from '../types';
import { MergeNotesModal } from '../modals/MergeNotesModal';
import { DatePickerModal } from '../modals/DatePickerModal';
import { WikilinkPeekModal } from '../modals/WikilinkPeekModal';
import { MobileFilterSheetModal } from '../modals/MobileFilterSheetModal';
import { RecentPermanentNotesModal } from '../modals/RecentPermanentNotesModal';
import { isTablet, attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { attachMobileSheetViewportBehavior } from '../utils/mobileSheetViewport';

const BATCH_SIZE = 25;

export class DesktopHubView extends ItemView {
    plugin: DiwaPlugin;
    private _containerEl: HTMLElement | null = null;
    private _streamContainerEl: HTMLElement | null = null;
    private _filterBarEl: HTMLElement | null = null;
    private _selectionBarEl: HTMLElement | null = null;

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
    private _cockpitRailTab: 'karon' | 'tasks' = 'karon';
    private _cockpitSplitRatio: number = 0.62;
    private _desktopComposerExpanded: boolean = false;
    private _isResizingCockpit: boolean = false;
    private _cockpitLayoutEl: HTMLElement | null = null;
    private _mainStageEl: HTMLElement | null = null;
    private _sideRailEl: HTMLElement | null = null;
    private _resizerEl: HTMLElement | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _tasksRailFilter: 'all' | 'overdue' | 'today' | 'upcoming' = 'all';
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

    private invalidateRenderCacheForFile(filePath: string): void {
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

        if (Platform.isMobile && !isTablet(this.app)) {
            document.body.addClass('diwa-hide-mobile-navbar');
            this._viewportCleanup = attachMobileSheetViewportBehavior({
                sheetEl: this.contentEl,
                scrollEl: this.contentEl,
            });
        } else {
            this.loadCockpitState();
            this.setupViewKeyHandler();
            this.setupResizeObserver();
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

    refreshAll(): void {
        this.renderView(false);
    }

    refreshCapture(): void {
        this.updateStreamOnly();
        this.updateFilterCounts();
        if (this._cockpitRailOpen && this._sideRailEl) {
            this.renderRightRailContent();
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
        const layoutEl = this.contentEl.createDiv({ cls: 'pos-desktop-cockpit-layout' });
        this._cockpitLayoutEl = layoutEl;

        // Top Full-Width Header
        const headerWrapper = layoutEl.createDiv({ cls: 'pos-cockpit-header-wrapper' });
        this._headerBarEl = headerWrapper.createDiv({ cls: 'pos-header-bar' });
        this.renderHeaderBar(this._headerBarEl);

        // Body with Split Panes
        const cockpitBody = layoutEl.createDiv({ cls: 'pos-cockpit-body' });

        // Left Main Stage (Stream, Filters & Composer)
        this._mainStageEl = cockpitBody.createDiv({ cls: 'pos-cockpit-main-stage' });
        this._containerEl = this._mainStageEl;

        if (this._cockpitRailOpen) {
            this._mainStageEl.style.flex = `${this._cockpitSplitRatio}`;
        } else {
            this._mainStageEl.style.flex = '1';
        }

        // Filter / Life Area carousel bar
        this._filterBarEl = this._mainStageEl.createDiv({ cls: 'pos-filter-bar' });
        this.renderFilterBar(this._filterBarEl);

        // Multi-select bulk action bar (if in selection mode)
        this._selectionBarEl = this._mainStageEl.createDiv({ cls: 'pos-selection-bar-wrapper' });
        this.updateSelectionBar();

        // Top Hero Quick Capture (Executive Notebook Model)
        this._desktopComposerWrapperEl = this._mainStageEl.createDiv({ cls: 'pos-cockpit-composer-wrapper' });
        this.renderComposer(this._desktopComposerWrapperEl, false);

        // Continuous Document Stream
        this._streamContainerEl = this._mainStageEl.createDiv({ cls: 'pos-document-stream' });
        this.renderStream(this._streamContainerEl);

        // Center Resizer Divider
        this._resizerEl = cockpitBody.createDiv({ cls: 'pos-cockpit-resizer' });
        this.setupCockpitResizer(this._resizerEl, cockpitBody);
        if (!this._cockpitRailOpen) {
            this._resizerEl.style.display = 'none';
        }

        // Right Side Rail (Inspector & Agenda)
        this._sideRailEl = cockpitBody.createDiv({
            cls: `pos-cockpit-side-rail ${!this._cockpitRailOpen ? 'is-collapsed' : ''}`
        });
        if (this._cockpitRailOpen) {
            this._sideRailEl.style.flex = `${1 - this._cockpitSplitRatio}`;
            this.renderRightRail(this._sideRailEl);
        } else {
            this._sideRailEl.style.flex = '0';
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
                if (parsed.railTab === 'karon' || parsed.railTab === 'tasks') this._cockpitRailTab = parsed.railTab;
                if (typeof parsed.splitRatio === 'number' && parsed.splitRatio >= 0.35 && parsed.splitRatio <= 0.85) {
                    this._cockpitSplitRatio = parsed.splitRatio;
                }
            } else {
                this._cockpitRailOpen = true;
            }
        } catch {
            this._cockpitRailOpen = true;
        }
    }

    private saveCockpitState(): void {
        try {
            localStorage.setItem('diwa-cockpit-state-v2', JSON.stringify({
                railOpen: this._cockpitRailOpen,
                railTab: this._cockpitRailTab,
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
        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                // Only auto-collapse on small mobile screens (< 768px)
                if (width < 768 && this._cockpitRailOpen) {
                    this._cockpitRailOpen = false;
                    this.updateCockpitRailState();
                }
            }
        });
        this._resizeObserver.observe(this.contentEl);
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

            // Hotkey: '/' or 'Cmd+F' -> Focus search
            if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f')) {
                e.preventDefault();
                const searchInput = this.contentEl.querySelector('.pos-search-input') as HTMLInputElement | null;
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
                    textarea.focus();
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
        this._cockpitRailOpen = !this._cockpitRailOpen;
        this.updateCockpitRailState();
    }

    private updateCockpitRailState(): void {
        if (!this._sideRailEl || !this._mainStageEl || !this._resizerEl) return;
        if (this._cockpitRailOpen) {
            this._sideRailEl.removeClass('is-collapsed');
            this._resizerEl.style.display = 'block';
            this._mainStageEl.style.flex = `${this._cockpitSplitRatio}`;
            this._sideRailEl.style.flex = `${1 - this._cockpitSplitRatio}`;
            this.renderRightRail(this._sideRailEl);
        } else {
            this._sideRailEl.addClass('is-collapsed');
            this._resizerEl.style.display = 'none';
            this._mainStageEl.style.flex = '1';
        }
        this.saveCockpitState();
        if (this._headerBarEl) {
            const toggleBtn = this._headerBarEl.querySelector('.pos-rail-toggle-btn') as HTMLElement | null;
            if (toggleBtn) {
                toggleBtn.toggleClass('is-active', this._cockpitRailOpen);
                toggleBtn.setText(this._cockpitRailOpen ? '◧ Agenda' : '◨ Agenda');
            }
        }
    }

    private setupCockpitResizer(resizer: HTMLElement, cockpitBody: HTMLElement): void {
        let startX = 0;
        let startRatio = this._cockpitSplitRatio;
        let bodyWidth = 0;

        const onPointerMove = (e: PointerEvent) => {
            if (!this._isResizingCockpit) return;
            const deltaX = e.clientX - startX;
            const newRatio = Math.max(0.40, Math.min(0.80, startRatio + (deltaX / bodyWidth)));
            this._cockpitSplitRatio = newRatio;
            if (this._mainStageEl) this._mainStageEl.style.flex = `${newRatio}`;
            if (this._sideRailEl) this._sideRailEl.style.flex = `${1 - newRatio}`;
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
            startRatio = this._cockpitSplitRatio;
            bodyWidth = cockpitBody.getBoundingClientRect().width || 1000;
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
            cls: `pos-rail-tab-btn ${this._cockpitRailTab === 'karon' ? 'is-active' : ''}`,
            text: '☀️ Horizon'
        });
        karonTabBtn.onclick = () => {
            this._cockpitRailTab = 'karon';
            this.saveCockpitState();
            this.renderRightRail(rail);
        };

        const tasksTabBtn = tabsContainer.createEl('button', {
            cls: `pos-rail-tab-btn ${this._cockpitRailTab === 'tasks' ? 'is-active' : ''}`,
            text: '📋 Tasks'
        });
        tasksTabBtn.onclick = () => {
            this._cockpitRailTab = 'tasks';
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
        contentEl.empty();

        if (this._cockpitRailTab === 'karon') {
            this.renderHorizonRail(contentEl);
        } else {
            this.renderTasksRail(contentEl);
        }
    }

    private renderHorizonRail(container: HTMLElement): void {
        const today = moment();
        const todayStr = today.format('YYYY-MM-DD');

        // Date row
        const dateHeader = container.createDiv({ cls: 'pos-rail-horizon-date-header' });
        dateHeader.createSpan({ cls: 'pos-rail-horizon-today', text: `☀️ ${today.format('dddd, MMM D')}` });
        dateHeader.createSpan({ cls: 'pos-rail-horizon-subtitle', text: 'Rolling Horizon' });

        // Overdue section
        const overdueTasks = this.plugin.index.getOverdueTasks(todayStr);
        if (overdueTasks.length > 0) {
            const overdueBox = container.createDiv({ cls: 'pos-rail-overdue-box' });
            const titleRow = overdueBox.createDiv({ cls: 'pos-rail-overdue-title' });
            const alertIcon = titleRow.createSpan();
            setIcon(alertIcon, 'alert-circle');
            titleRow.createSpan({ text: `${overdueTasks.length} Overdue Task${overdueTasks.length === 1 ? '' : 's'}` });

            for (const task of overdueTasks.slice(0, 5)) {
                this.renderRailTaskRow(overdueBox, task, true);
            }
            if (overdueTasks.length > 5) {
                overdueBox.createDiv({ cls: 'pos-rail-empty-msg', text: `+ ${overdueTasks.length - 5} more overdue tasks` });
            }
        }

        // Today Due Tasks Section
        const todayTasks = this.plugin.index.getTasksForDueDate(todayStr);
        const todaySection = container.createDiv({ cls: 'pos-rail-section' });
        const todaySecHeader = todaySection.createDiv({ cls: 'pos-rail-section-header' });
        todaySecHeader.createSpan({ text: "Today's Tasks" });
        todaySecHeader.createSpan({ cls: 'pos-rail-section-badge', text: `${todayTasks.length}` });

        if (todayTasks.length === 0) {
            todaySection.createDiv({ cls: 'pos-rail-empty-msg', text: 'No tasks scheduled for today.' });
        } else {
            for (const task of todayTasks) {
                this.renderRailTaskRow(todaySection, task, false);
            }
        }

        // Notes Intended for Today
        const todayCaptures = this.plugin.index.getCapturesForTargetDate(todayStr);
        if (todayCaptures.length > 0) {
            const notesSection = container.createDiv({ cls: 'pos-rail-section' });
            const notesSecHeader = notesSection.createDiv({ cls: 'pos-rail-section-header' });
            notesSecHeader.createSpan({ text: 'Referenced Notes' });
            notesSecHeader.createSpan({ cls: 'pos-rail-section-badge', text: `${todayCaptures.length}` });

            for (const capture of todayCaptures.slice(0, 6)) {
                const noteRow = notesSection.createDiv({ cls: 'pos-rail-note-item' });
                const baseTitle = capture.filePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled Note';
                noteRow.createSpan({ text: `📄 ${baseTitle}` });
                noteRow.onclick = () => {
                    new WikilinkPeekModal(this.app, this.plugin, capture.filePath, capture.filePath, (target) => this.filterStreamByWikilink(target)).open();
                };
            }
        }

        // Tomorrow Glance
        const tomorrowStr = moment(todayStr).add(1, 'days').format('YYYY-MM-DD');
        const tomorrowTasks = this.plugin.index.getTasksForDueDate(tomorrowStr);
        const tomorrowSection = container.createDiv({ cls: 'pos-rail-section' });
        const tomorrowSecHeader = tomorrowSection.createDiv({ cls: 'pos-rail-section-header' });
        tomorrowSecHeader.createSpan({ text: 'Tomorrow' });
        tomorrowSecHeader.createSpan({ cls: 'pos-rail-section-badge', text: `${tomorrowTasks.length}` });

        if (tomorrowTasks.length > 0) {
            for (const task of tomorrowTasks.slice(0, 4)) {
                this.renderRailTaskRow(tomorrowSection, task, false);
            }
        } else {
            tomorrowSection.createDiv({ cls: 'pos-rail-empty-msg', text: 'Nothing due tomorrow.' });
        }
    }

    private renderTasksRail(container: HTMLElement): void {
        const allTasks = this.plugin.index.getGawaTasks();
        const openTasks = allTasks.filter(t => !t.completed);
        const todayStr = moment().format('YYYY-MM-DD');

        const overdueCount = openTasks.filter(t => t.dueDate && t.dueDate < todayStr).length;
        const todayCount = openTasks.filter(t => t.dueDate === todayStr).length;
        const upcomingCount = openTasks.filter(t => t.dueDate && t.dueDate > todayStr).length;

        // Filter chips row
        const chipsRow = container.createDiv({ cls: 'pos-rail-tasks-chips' });
        const chips: { id: 'all' | 'overdue' | 'today' | 'upcoming'; label: string }[] = [
            { id: 'all', label: `All (${openTasks.length})` },
            { id: 'overdue', label: `🔴 Overdue (${overdueCount})` },
            { id: 'today', label: `🟡 Today (${todayCount})` },
            { id: 'upcoming', label: `🟢 Upcoming (${upcomingCount})` },
        ];

        for (const chip of chips) {
            const btn = chipsRow.createEl('button', {
                cls: `pos-rail-chip ${this._tasksRailFilter === chip.id ? 'is-active' : ''}`,
                text: chip.label
            });
            btn.onclick = () => {
                this._tasksRailFilter = chip.id;
                this.renderTasksRail(container);
            };
        }

        // Filter tasks
        let filtered = openTasks;
        if (this._tasksRailFilter === 'overdue') {
            filtered = openTasks.filter(t => t.dueDate && t.dueDate < todayStr);
        } else if (this._tasksRailFilter === 'today') {
            filtered = openTasks.filter(t => t.dueDate === todayStr);
        } else if (this._tasksRailFilter === 'upcoming') {
            filtered = openTasks.filter(t => t.dueDate && t.dueDate > todayStr);
        }

        // Sort ascending by due date
        filtered.sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });

        const listEl = container.createDiv({ cls: 'pos-rail-section' });
        if (filtered.length === 0) {
            listEl.createDiv({ cls: 'pos-rail-empty-msg', text: 'No tasks matching this filter.' });
            return;
        }

        for (const task of filtered.slice(0, 30)) {
            this.renderRailTaskRow(listEl, task, Boolean(task.dueDate && task.dueDate < todayStr));
        }

        if (filtered.length > 30) {
            listEl.createDiv({ cls: 'pos-rail-empty-msg', text: `+ ${filtered.length - 30} more tasks (open Gawa Cockpit for full list)` });
        }
    }

    private renderRailTaskRow(parent: HTMLElement, task: any, isOverdue: boolean): void {
        const row = parent.createDiv({ cls: 'pos-rail-task-item' });

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
        content.createSpan({
            cls: `pos-rail-task-title ${task.completed ? 'is-completed' : ''}`,
            text: task.cleanTitle || task.rawTitle
        });

        const metaRow = content.createDiv({ cls: 'pos-rail-task-meta' });
        if (task.dueDate) {
            const todayStr = moment().format('YYYY-MM-DD');
            const pillCls = isOverdue ? 'is-overdue' : (task.dueDate === todayStr ? 'is-today' : '');
            metaRow.createSpan({ cls: `pos-rail-meta-pill ${pillCls}`, text: `📅 ${task.dueDate}` });
        }
        if (task.areaLabel) {
            metaRow.createSpan({ cls: 'pos-rail-meta-pill', text: `${task.areaIcon || ''} ${task.areaLabel}`.trim() });
        }

        // Jump to source button
        const jumpBtn = row.createEl('button', {
            cls: 'pos-rail-source-btn',
            text: '↗',
            attr: { 'aria-label': `Open ${task.noteTitle || 'note'}` }
        });
        jumpBtn.onclick = (e) => {
            e.stopPropagation();
            new WikilinkPeekModal(this.app, this.plugin, task.filePath, task.filePath, (target) => this.filterStreamByWikilink(target)).open();
        };
    }

    private renderHeaderBar(header: HTMLElement): void {
        header.empty();

        const isMobile = Platform.isMobile && !isTablet(this.app);

        const titleSection = header.createDiv({ cls: 'pos-header-title-section' });
        titleSection.createSpan({ cls: 'pos-header-logo', text: 'DIWA' });
        const horizonLabel = this.plugin.index?.getScratchpadHorizonLabel?.();
        const subtitleText = horizonLabel && horizonLabel !== 'All Notes' ? `Personal OS · ${horizonLabel}` : 'Personal OS';
        titleSection.createSpan({ cls: 'pos-header-subtitle', text: subtitleText });

        // Search bar (Desktop & Tablet: prominent search with [ / ] hotkey hint)
        if (!isMobile) {
            const searchContainer = header.createDiv({ cls: 'pos-search-container' });
            const searchInput = searchContainer.createEl('input', {
                type: 'search',
                placeholder: 'Search notes, #tags, or tasks...',
                cls: 'pos-search-input',
                value: this._searchQuery,
                attr: {
                    enterkeyhint: 'search',
                    autocomplete: 'off',
                    autocorrect: 'off',
                    autocapitalize: 'off',
                    spellcheck: 'false',
                }
            });

            // Hotkey badge [ / ]
            searchContainer.createSpan({ cls: 'pos-search-kbd-badge', text: '/' });

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
                    this.renderHeaderBar(header);
                    triggerSearch('', true);
                }
            };

            if (this._searchQuery) {
                const clearBtn = searchContainer.createSpan({
                    cls: 'pos-search-clear',
                    text: '✕',
                    attr: { 'aria-label': 'Clear search' }
                });
                clearBtn.onclick = () => {
                    this._searchQuery = '';
                    this._renderedCount = BATCH_SIZE;
                    this.renderHeaderBar(header);
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                };
            }
        }

        // Actions - Desktop/Tablet
        if (!isMobile) {
            const actions = header.createDiv({ cls: 'pos-header-actions' });

            // 1. Right Rail Toggle Button [ ◨ ]
            const railToggleBtn = actions.createEl('button', {
                cls: `pos-header-text-btn pos-rail-toggle-btn ${this._cockpitRailOpen ? 'is-active' : ''}`,
                text: this._cockpitRailOpen ? '◧ Agenda' : '◨ Agenda',
                attr: { 'aria-label': 'Toggle Agenda panel (\\)' }
            });
            railToggleBtn.onclick = () => {
                this.toggleCockpitRail();
            };

            // 2. Daily Digest quick-launcher button
            const todayDigestSummary = this.plugin.index.getDayDigestSummary(moment().format('YYYY-MM-DD'));
            const digestBtn = actions.createEl('button', {
                cls: 'pos-header-text-btn pos-digest-header-trigger',
                text: todayDigestSummary.status === 'digested' ? '📅 Digest ✓' : '📅 Digest',
                attr: { 'aria-label': 'Open Daily Digest & Review' }
            });
            digestBtn.onclick = () => {
                void this.plugin.activateCalendarDigest();
            };

            // 3. More Menu [ ⋯ ] consolidating utility actions
            const moreBtn = actions.createEl('button', {
                cls: 'pos-icon-btn pos-header-more-btn',
                attr: { 'aria-label': 'More workspace actions' }
            });
            setIcon(moreBtn, 'more-horizontal');
            moreBtn.onclick = (e) => {
                e.stopPropagation();
                const menu = new Menu();

                // Select mode toggle
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

                // Sweeper button (if untagged notes exist)
                const untaggedCount = this.plugin.index.getUntaggedCount();
                if (untaggedCount > 0) {
                    menu.addItem((item) => {
                        item.setTitle(`🧹 Sweep Untagged (${untaggedCount})`)
                            .setChecked(this._activeFilter === 'untagged')
                            .onClick(() => {
                                this._activeFilter = this._activeFilter === 'untagged' ? 'all' : 'untagged';
                                this._renderedCount = BATCH_SIZE;
                                this.updateFilterActiveStates();
                                this.updateStreamOnly();
                            });
                    });
                }

                menu.addSeparator();

                // Open Gawa Task Cockpit in Split
                const openTaskCount = this.plugin.index.getOpenTaskCount();
                menu.addItem((item) => {
                    item.setTitle(`Open Gawa Task Cockpit (${openTaskCount})`)
                        .setIcon('list-todo')
                        .onClick(() => {
                            void this.plugin.activateGawaCockpit();
                        });
                });

                // Open Karon Horizon in Tab
                menu.addItem((item) => {
                    item.setTitle('Open Karon Today & Horizon')
                        .setIcon('sun')
                        .onClick(() => {
                            void this.plugin.activateKaron();
                        });
                });

                // Show Recently Updated Permanent Notes
                menu.addItem((item) => {
                    item.setTitle('Recent Permanent Notes')
                        .setIcon('book-open')
                        .onClick(() => {
                            new RecentPermanentNotesModal(this.app, this.plugin).open();
                        });
                });

                menu.addSeparator();

                // Settings
                menu.addItem((item) => {
                    item.setTitle('DIWA Settings')
                        .setIcon('settings')
                        .onClick(() => {
                            (this.app as any).setting?.open();
                            (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
                        });
                });

                menu.showAtMouseEvent(e);
            };
        }
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
        if (this._filterBarEl && this._filterBarEl.isConnected) {
            this.renderFilterBar(this._filterBarEl);
        } else if (this._containerEl) {
            const existingBar = this._containerEl.querySelector<HTMLElement>('.pos-filter-bar');
            if (existingBar) {
                this._filterBarEl = existingBar;
                this.renderFilterBar(this._filterBarEl);
            }
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
                    cls: 'pos-mobile-action-btn pos-mobile-action-new is-primary',
                    attr: { 'aria-label': 'Create new note', title: 'New note' }
                });
                setIcon(newBtn, 'plus');
                newBtn.onclick = () => {
                    this._mobileComposerOpen = true;
                    this._mobileSearchOpen = false;
                    this.renderComposer(parent, true);
                };

                // 2. Search Toggle Action (Expands bottom search capsule)
                const searchBtn = actionBar.createEl('button', {
                    cls: 'pos-mobile-action-btn pos-mobile-action-search',
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
                    attr: { 'aria-label': 'Filter stream', title: 'Filter' }
                });
                setIcon(filterBtn, 'sliders-horizontal');
                filterBtn.onclick = () => {
                    new MobileFilterSheetModal(this.app, this.plugin, this).open();
                };

                // 4. Nav Bar Toggle Action (Icon only)
                const isNavHidden = document.body.hasClass('diwa-hide-mobile-navbar');
                const navBtn = actionBar.createEl('button', {
                    cls: `pos-mobile-action-btn pos-mobile-action-nav ${!isNavHidden ? 'is-active' : ''}`,
                    attr: { 'aria-label': isNavHidden ? 'Show Obsidian bottom navigation bar' : 'Hide Obsidian bottom navigation bar', title: 'Navigation' }
                });
                setIcon(navBtn, 'panel-bottom');
                navBtn.onclick = () => {
                    const nowHidden = !document.body.hasClass('diwa-hide-mobile-navbar');
                    document.body.toggleClass('diwa-hide-mobile-navbar', nowHidden);
                    navBtn.toggleClass('is-active', !nowHidden);
                    navBtn.setAttribute('aria-label', nowHidden ? 'Show Obsidian bottom navigation bar' : 'Hide Obsidian bottom navigation bar');
                    new Notice(nowHidden ? 'Obsidian navigation hidden' : 'Obsidian navigation shown');
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
                cls: 'pos-composer-send-btn-circle mod-cta',
                attr: { 'aria-label': 'Capture note' }
            });
            sendBtn.setText('↑');

            // 3. Horizontal swipeable pills row: Task button + Life Areas + Close
            const pillsRow = composerWrapper.createDiv({ cls: 'pos-mobile-composer-pills-row' });

            // Task toggle pill
            const taskBtn = pillsRow.createEl('button', {
                cls: 'pos-composer-area-pill pos-composer-task-pill',
                attr: { 'aria-label': 'Insert task checkbox' }
            });
            taskBtn.setText('☑️ Task');

            // Star toggle pill
            const starPill = pillsRow.createEl('button', {
                cls: `pos-composer-area-pill pos-composer-star-pill ${this._selectedImportantForNewNote ? 'is-selected' : ''}`,
                attr: { 'aria-label': 'Toggle important flag' }
            });
            starPill.setText(this._selectedImportantForNewNote ? '⭐ Important' : '☆ Important');
            starPill.onclick = () => {
                this._selectedImportantForNewNote = !this._selectedImportantForNewNote;
                starPill.toggleClass('is-selected', this._selectedImportantForNewNote);
                starPill.setText(this._selectedImportantForNewNote ? '⭐ Important' : '☆ Important');
            };

            const areas = this.plugin.settings.lifeAreas || [];
            for (const area of areas) {
                const isSelected = this._selectedAreaForNewNote === area.id;
                const areaBtn = pillsRow.createEl('button', {
                    cls: `pos-composer-area-pill ${isSelected ? 'is-selected' : ''}`,
                });
                areaBtn.setText(`${area.icon || ''} ${area.label}`.trim());
                areaBtn.onclick = () => {
                    this._selectedAreaForNewNote = this._selectedAreaForNewNote === area.id ? '' : area.id;
                    this.renderComposerPillSelection(composerWrapper);
                };
            }

            // Dismiss/Close button
            const closeBtn = pillsRow.createEl('button', {
                cls: 'pos-composer-area-pill pos-composer-close-pill',
                attr: { 'aria-label': 'Close composer' }
            });
            closeBtn.setText('✕ Close');
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

        if (!isExpanded) {
            // Sleek Reflect-style fluid capture line
            const compactWrapper = targetParent.createDiv({ cls: 'pos-composer-compact pos-reflect-composer-compact' });
            this._composerEl = compactWrapper;

            const triggerArea = compactWrapper.createDiv({ cls: 'pos-compact-trigger-area' });
            triggerArea.createSpan({ cls: 'pos-compact-icon', text: '✏️' });
            triggerArea.createSpan({ cls: 'pos-compact-placeholder', text: "What's on your mind? Capture a thought, task (- [ ]), or note..." });

            const actions = compactWrapper.createDiv({ cls: 'pos-compact-actions' });
            const taskChip = actions.createEl('button', {
                cls: 'pos-composer-pill-btn',
                text: '☑️ Task',
                attr: { 'aria-label': 'Start new task' }
            });
            taskChip.onclick = (e) => {
                e.stopPropagation();
                this._desktopComposerExpanded = true;
                this.renderComposer(targetParent, false);
                const ta = this._composerEl?.querySelector('textarea');
                if (ta) {
                    ta.value = '- [ ] ';
                    ta.focus();
                    ta.setSelectionRange(6, 6);
                }
            };

            const cmdSymbol = Platform.isMacOS ? '⌘↵' : 'Ctrl↵';
            actions.createSpan({ cls: 'pos-compact-kbd', text: 'C' });
            actions.createSpan({ cls: 'pos-compact-kbd', text: cmdSymbol });

            compactWrapper.onclick = () => {
                this._desktopComposerExpanded = true;
                this.renderComposer(targetParent, false);
                const ta = this._composerEl?.querySelector('textarea');
                if (ta) {
                    ta.focus();
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
            cls: 'pos-composer-pill-btn',
            attr: { 'aria-label': 'Insert task checkbox' }
        });
        taskBtn.setText('☑️ Task');
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

        // Star toggle button
        const starBtn = leftControls.createEl('button', {
            cls: `pos-composer-pill-btn pos-composer-star-btn ${this._selectedImportantForNewNote ? 'is-selected' : ''}`,
            attr: { 'aria-label': 'Toggle important flag' }
        });
        starBtn.setText(this._selectedImportantForNewNote ? '⭐ Important' : '☆ Important');
        starBtn.onclick = () => {
            this._selectedImportantForNewNote = !this._selectedImportantForNewNote;
            starBtn.toggleClass('is-selected', this._selectedImportantForNewNote);
            starBtn.setText(this._selectedImportantForNewNote ? '⭐ Important' : '☆ Important');
        };

        // Life area selection chips
        const areas = this.plugin.settings.lifeAreas || [];
        for (const area of areas) {
            const isSelected = this._selectedAreaForNewNote === area.id;
            const areaBtn = leftControls.createEl('button', {
                cls: `pos-composer-pill-btn ${isSelected ? 'is-selected' : ''}`,
            });
            areaBtn.setText(`${area.icon || ''} ${area.label}`.trim());
            areaBtn.onclick = () => {
                this._selectedAreaForNewNote = this._selectedAreaForNewNote === area.id ? '' : area.id;
                this.renderComposerPillSelection(composerWrapper);
            };
        }

        // Right controls: Save button & Shortcut hint
        const rightControls = toolbar.createDiv({ cls: 'pos-composer-right' });

        // Collapse pill button
        const collapseBtn = rightControls.createEl('button', {
            cls: 'pos-composer-pill-btn',
            text: '✕',
            attr: { 'aria-label': 'Collapse composer' }
        });
        collapseBtn.onclick = () => {
            this._desktopComposerExpanded = false;
            this.renderComposer(targetParent, false);
        };

        const cmdKey = Platform.isMacOS ? '⌘' : 'Ctrl';

        rightControls.createSpan({
            cls: 'pos-composer-hint',
            text: `Shift+↵ Next  •  ${cmdKey}↵ Done`
        });

        const saveBtn = rightControls.createEl('button', {
            cls: 'pos-composer-save-btn pos-reflect-save-btn',
            text: `Capture ${cmdKey}↵`
        });

        const doSave = async (keepActive = false) => {
            const text = textarea.value.trim();
            if (!text) return;
            saveBtn.disabled = true;
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
                    textarea.focus();
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
        const buttons = container.querySelectorAll<HTMLButtonElement>('.pos-composer-pill-btn, .pos-composer-area-pill');
        const areas = this.plugin.settings.lifeAreas || [];
        buttons.forEach(btn => {
            const area = areas.find(a => btn.textContent?.includes(a.label));
            if (area) {
                btn.toggleClass('is-selected', this._selectedAreaForNewNote === area.id);
            }
        });
    }

    private getFilteredCaptures(): CaptureEntry[] {
        const isSearching = Boolean(this._searchQuery.trim());
        let entries = this.plugin.index?.getAllCaptures?.(isSearching) || [];

        // 1. Search query filter (searches across all notes in workspace archive)
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

        // Exclude digested notes from continuous scratchpad feed by default (Inbox Zero)
        if (this._activeFilter === 'digested') {
            entries = entries.filter(e => Boolean(e.digested));
        } else {
            entries = entries.filter(e => !e.digested);
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
            emptyEl.createDiv({ cls: 'pos-empty-icon', text: trimmedQuery ? '🔍' : (this._filterTasksOnly ? '☑️' : '📝') });

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
            searchSummary.createSpan({
                cls: 'pos-search-results-text',
                text: `🔍 Found ${filtered.length} note${filtered.length === 1 ? '' : 's'} matching "${trimmedQuery}"`
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

        for (const entry of visibleEntries) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                const divider = container.createDiv({ cls: 'pos-date-divider' });
                divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                const count = dateCounts.get(dateKey) || 1;
                divider.createSpan({ cls: 'pos-date-count', text: `${count} note${count === 1 ? '' : 's'}` });
                const dateLine = divider.createDiv({ cls: 'pos-date-line' });
                dateLine.style.flex = '1';
                dateLine.style.height = '1px';
                dateLine.style.background = 'var(--background-modifier-border, rgba(255, 255, 255, 0.15))';
                dateLine.style.display = 'block';
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

        for (const entry of newBatch) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                const divider = container.createDiv({ cls: 'pos-date-divider' });
                divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                const count = dateCounts.get(dateKey) || 1;
                divider.createSpan({ cls: 'pos-date-count', text: `${count} note${count === 1 ? '' : 's'}` });
                const dateLine = divider.createDiv({ cls: 'pos-date-line' });
                dateLine.style.flex = '1';
                dateLine.style.height = '1px';
                dateLine.style.background = 'var(--background-modifier-border, rgba(255, 255, 255, 0.15))';
                dateLine.style.display = 'block';
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

        // If in selection mode, tapping the note card toggles its selection
        if (this._selectionMode) {
            item.onclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.pos-interactive-checkbox') || target.closest('.pos-note-actions') || target.closest('a')) {
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
                if (target.closest('.pos-interactive-checkbox') || target.closest('.pos-note-actions') || target.closest('a') || target.closest('.pos-area-badge') || target.closest('.pos-date-badge')) {
                    return;
                }
                this._editingEntryId = entry.id;
                this.updateStreamOnly();
                this.updateComposerVisibility();
            };
        }

        // If in inline editing mode
        if (this._editingEntryId === entry.id) {
            this.renderInlineEditor(item, entry);
            return;
        }

        const isMobile = Platform.isMobile && !isTablet(this.app);
        const timeStr = moment(entry.createdAtMs).format('h:mm A');

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
            // Render Area badge on desktop if present
            if (entry.area) {
                const badge = badgesEl.createSpan({
                    cls: `pos-area-badge pos-area-${entry.area.toLowerCase()}`,
                    text: areaObj ? `${areaObj.icon || ''} ${areaObj.label}`.trim() : entry.area,
                    attr: { 'aria-label': 'Click to change life area' }
                });

                badge.onclick = (e) => {
                    e.stopPropagation();
                    const menu = new Menu();
                    for (const area of areas) {
                        menu.addItem((mItem) => {
                            mItem.setTitle(`${area.icon || ''} ${area.label}`.trim())
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
                    menu.addSeparator();
                    menu.addItem((mItem) => {
                        mItem.setTitle('✕ Remove Area (Untagged)')
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
                    menu.showAtMouseEvent(e);
                };
            }

            // Other tags
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

            // Date reminder badges
            if (entry.allDates && entry.allDates.length > 0) {
                for (const dateStr of entry.allDates) {
                    const isToday = this.plugin.index.isDateToday(dateStr);
                    const isPast = this.plugin.index.isDatePast(dateStr);

                    const badgeCls = isToday
                        ? 'pos-date-badge-today'
                        : isPast
                        ? 'pos-date-badge-past'
                        : 'pos-date-badge-future';

                    const icon = isToday ? '📅' : isPast ? '⏳' : '📆';
                    const label = isToday ? 'Today' : dateStr;

                    const dateBadge = badgesEl.createSpan({
                        cls: `pos-date-badge ${badgeCls}`,
                        text: `${icon} ${label}`,
                        attr: { 'aria-label': `Reminder date: ${dateStr}. Click to snooze or reschedule.` }
                    });

                    dateBadge.onclick = (e) => {
                        e.stopPropagation();
                        this.openDateActionMenu(e, entry, dateStr);
                    };
                }
            }
        }

        // Col 3: Action buttons (Hover)
        const actionsEl = item.createDiv({ cls: 'pos-note-actions' });

        const starBtn = actionsEl.createSpan({
            cls: `pos-action-icon pos-star-btn ${isImportant ? 'is-starred' : ''}`,
            text: isImportant ? '⭐' : '☆',
            attr: { 'aria-label': isImportant ? 'Unmark important' : 'Mark as important' }
        });
        starBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                this.invalidateRenderCacheForFile(entry.filePath);
                const newState = await this.plugin.capture.toggleNoteImportance(entry.filePath);
                entry.important = newState;
                entry.pinned = newState;
                this.plugin.index?.setCaptureImportance?.(entry.filePath, newState);
                new Notice(newState ? 'Marked as Important ⭐' : 'Unmarked from Important');
                this.updateFilterCounts();
                this.updateStreamOnly();
            } catch (err) {
                console.error('[DIWA] Toggle note importance error', err);
                new Notice('Failed to update importance');
            }
        };

        if (!isMobile) {
            const editBtn = actionsEl.createSpan({
                cls: 'pos-action-icon',
                text: '✏️',
                attr: { 'aria-label': 'Edit note' }
            });
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this._editingEntryId = entry.id;
                this.updateStreamOnly();
                this.updateComposerVisibility();
            };
        }

        const moreBtn = actionsEl.createSpan({
            cls: 'pos-action-icon pos-action-more',
            text: '⋯',
            attr: { 'aria-label': 'More note options' }
        });
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            this.openNoteActionMenu(e, entry);
        };

        if (!isMobile) {
            const trashBtn = actionsEl.createSpan({
                cls: 'pos-action-icon',
                text: '🗑️',
                attr: { 'aria-label': 'Delete note' }
            });
            trashBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Move this note to trash?')) {
                    await this.plugin.capture.deleteNote(entry.filePath);
                    this._selectedEntryIds.delete(entry.id);
                    this.invalidateRenderCacheForFile(entry.filePath);
                    this.updateStreamOnly();
                    this.updateFilterCounts();
                }
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
            item.setTitle('⏰ Snooze to Tomorrow')
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
            item.setTitle('📅 Snooze +3 Days')
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
            item.setTitle('🗓️ Snooze +1 Week')
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
            item.setTitle('📌 Pick Custom Date...')
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
            item.setTitle('✕ Clear Reminder Date')
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
            item.setTitle('📖 Open Daily Note')
                .setIcon('document')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(dateStr, entry.filePath, false);
                });
        });

        menu.showAtMouseEvent(e);
    }

    private openNoteActionMenu(e: MouseEvent, entry: CaptureEntry): void {
        const menu = new Menu();
        const isImportant = this.plugin.index.isImportant(entry);

        menu.addItem((item) => {
            item.setTitle(isImportant ? '☆ Remove from Important' : '⭐ Mark as Important')
                .setIcon(isImportant ? 'star-off' : 'star')
                .onClick(async () => {
                    try {
                        this.invalidateRenderCacheForFile(entry.filePath);
                        const newState = await this.plugin.capture.toggleNoteImportance(entry.filePath);
                        entry.important = newState;
                        entry.pinned = newState;
                        this.plugin.index?.setCaptureImportance?.(entry.filePath, newState);
                        new Notice(newState ? 'Marked as Important ⭐' : 'Unmarked from Important');
                        this.updateFilterCounts();
                        this.updateStreamOnly();
                    } catch (err) {
                        console.error('[DIWA] Toggle note importance error', err);
                        new Notice('Failed to update importance');
                    }
                });
        });

        menu.addItem((item) => {
            item.setTitle('✏️ Edit Note (Inline)')
                .setIcon('edit')
                .onClick(() => {
                    this._editingEntryId = entry.id;
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                });
        });

        menu.addItem((item) => {
            item.setTitle('📖 Open in Obsidian Editor')
                .setIcon('document')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(entry.filePath, '', false);
                });
        });

        menu.addItem((item) => {
            item.setTitle('🏷️ Set Life Area...')
                .setIcon('tag')
                .onClick(() => {
                    const areaMenu = new Menu();
                    const areas = this.plugin.settings.lifeAreas || [];
                    for (const area of areas) {
                        areaMenu.addItem((subItem) => {
                            subItem.setTitle(`${area.icon || ''} ${area.label}`.trim())
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
                            subItem.setTitle('✕ Remove Area (Untagged)')
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
            item.setTitle('📋 Copy Note Content')
                .setIcon('copy')
                .onClick(async () => {
                    await navigator.clipboard.writeText(entry.body);
                    new Notice('Note content copied to clipboard');
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('🗑️ Delete Note')
                .setIcon('trash')
                .onClick(async () => {
                    if (confirm('Move this note to trash?')) {
                        await this.plugin.capture.deleteNote(entry.filePath);
                        this._selectedEntryIds.delete(entry.id);
                        this.invalidateRenderCacheForFile(entry.filePath);
                        this.updateStreamOnly();
                        this.updateFilterCounts();
                    }
                });
        });

        menu.showAtMouseEvent(e);
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
            item.setTitle('👁️ Quick Preview')
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
            item.setTitle(`🔍 Filter Stream for [[${cleanName}]]`)
                .setIcon('search')
                .onClick(() => {
                    this.filterStreamByWikilink(cleanName);
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('📖 Open in Adjacent Split')
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
            item.setTitle('🗂️ Open in New Tab')
                .setIcon('tab')
                .onClick(async () => {
                    await this.app.workspace.openLinkText(linkText, sourcePath, 'tab');
                });
        });

        menu.addItem((item) => {
            item.setTitle('📋 Copy Wikilink')
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

            const taskItem = entry.tasks[idx];

            cb.onclick = async (e) => {
                e.stopPropagation();
                const isChecked = cb.checked;
                
                // Optimistic visual strike-through update with theme data-task support
                const listItem = cb.closest('li');
                if (listItem) {
                    listItem.toggleClass('is-checked', isChecked);
                    listItem.setAttribute('data-task', isChecked ? 'x' : ' ');
                }

                if (taskItem) {
                    taskItem.completed = isChecked;
                }

                // Invalidate render cache for this entry
                this.invalidateRenderCacheForFile(entry.filePath);

                // Update file directly in background
                try {
                    const lineIdx = taskItem ? taskItem.lineIndex : -1;
                    const taskTitle = taskItem ? taskItem.title : undefined;
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
                    if (taskItem) {
                        taskItem.completed = !isChecked;
                    }
                    new Notice('Failed to update task state in note');
                }
            };
        });

        // 2. Rendered internal date links and note wikilinks
        const internalLinks = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
        internalLinks.forEach(link => {
            const href = link.getAttribute('data-href') || link.textContent || '';
            const match = href.match(/^(\d{4}-\d{2}-\d{2})$/);
            if (match) {
                const dateStr = match[1];
                const isToday = this.plugin.index.isDateToday(dateStr);
                const isPast = this.plugin.index.isDatePast(dateStr);

                link.addClass('pos-rendered-date-link');
                if (isToday) link.addClass('pos-date-link-today');
                else if (isPast) link.addClass('pos-date-link-past');
                else link.addClass('pos-date-link-future');

                link.onclick = (e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    e.stopPropagation();
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

                // Click / Tap handler
                link.onclick = async (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Mobile: Slide-Up Bottom Sheet (Peek Sheet)
                    if (Platform.isMobile) {
                        new WikilinkPeekModal(
                            this.app,
                            this.plugin,
                            href,
                            entry.filePath,
                            (target) => this.filterStreamByWikilink(target)
                        ).open();
                        return;
                    }

                    // Desktop Modifier Clicks
                    if (e.metaKey || e.ctrlKey) {
                        await this.app.workspace.openLinkText(href, entry.filePath, 'tab');
                        return;
                    }
                    if (e.altKey) {
                        await this.app.workspace.openLinkText(href, entry.filePath, 'window');
                        return;
                    }

                    // Desktop Standard Left-Click: Protected Split Navigation
                    const cleanName = href.split('#')[0];
                    const leaves = this.app.workspace.getLeavesOfType('markdown');
                    const targetLeaf = leaves.find(l => l !== this.leaf);

                    if (targetLeaf) {
                        this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                        const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanName, entry.filePath);
                        if (destFile) {
                            await targetLeaf.openFile(destFile);
                        } else {
                            await this.app.workspace.openLinkText(href, entry.filePath, false);
                        }
                    } else {
                        const splitLeaf = this.app.workspace.getLeaf('split', 'vertical');
                        const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanName, entry.filePath);
                        if (destFile) {
                            await splitLeaf.openFile(destFile);
                        } else {
                            await this.app.workspace.openLinkText(href, entry.filePath, 'split');
                        }
                    }
                };
            }
        });
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
        
        const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'pos-inline-btn' });
        cancelBtn.onclick = () => {
            this._editingEntryId = null;
            this.updateStreamOnly();
            this.updateComposerVisibility();
        };

        const saveBtn = actions.createEl('button', {
            text: 'Save',
            cls: 'mod-cta'
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

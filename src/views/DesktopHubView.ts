import { ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, moment, Notice, Platform, Menu, Component } from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_DESKTOP_HUB, DESKTOP_HUB_ICON_ID } from '../constants';
import { CaptureEntry, ScratchpadFilterMode } from '../types';
import { MergeNotesModal } from '../modals/MergeNotesModal';
import { DatePickerModal } from '../modals/DatePickerModal';
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
    private _searchQuery: string = '';
    private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _selectedAreaForNewNote: string = '';
    private _selectedEntryIds: Set<string> = new Set();
    private _selectionMode: boolean = false;
    private _editingEntryId: string | null = null;
    private _headerBarEl: HTMLElement | null = null;
    private _composerEl: HTMLElement | null = null;
    private _mobileSearchOpen: boolean = false;
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
            this._viewportCleanup = attachMobileSheetViewportBehavior({
                sheetEl: this.contentEl,
                scrollEl: this.contentEl,
            });
        }

        this._containerEl = this.contentEl.createDiv({ cls: 'pos-scratchpad-container' });
        this.renderView();
    }

    async onClose(): Promise<void> {
        if (this._viewportCleanup) {
            this._viewportCleanup();
            this._viewportCleanup = null;
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
    }

    onActiveFileChange(_file?: TFile | null): void {
        // Continuous scratchpad is independent of active file tab
    }

    refreshAll(): void {
        this.renderView(false);
    }

    refreshTasks(): void {
        this.updateStreamOnly();
        this.updateFilterCounts();
    }

    updateTaskPaneFromIndex(): void {
        this.updateStreamOnly();
        this.updateFilterCounts();
    }

    renderView(resetPagination = true): void {
        if (!this._containerEl) return;
        if (resetPagination) {
            this._renderedCount = BATCH_SIZE;
        }

        this._containerEl.empty();

        const isMobile = Platform.isMobile && !isTablet(this.app);

        // Header bar
        this._headerBarEl = this._containerEl.createDiv({ cls: 'pos-header-bar' });
        this.renderHeaderBar(this._headerBarEl);

        // Filter / Life Area carousel bar
        this._filterBarEl = this._containerEl.createDiv({ cls: 'pos-filter-bar' });
        this.renderFilterBar(this._filterBarEl);

        // Multi-select bulk action bar (if in selection mode)
        this._selectionBarEl = this._containerEl.createDiv({ cls: 'pos-selection-bar-wrapper' });
        this.updateSelectionBar();

        // Desktop / Tablet Hero Composer at top
        if (!isMobile) {
            this.renderComposer(this._containerEl, false);
        }

        // Continuous Document Stream
        this._streamContainerEl = this._containerEl.createDiv({ cls: 'pos-document-stream' });
        this.renderStream(this._streamContainerEl);

        // Mobile Sticky Composer at bottom
        if (isMobile) {
            this.renderComposer(this._containerEl, true);
        }

        this.updateComposerVisibility();
    }

    private updateComposerVisibility(): void {
        const isMobile = Platform.isMobile && !isTablet(this.app);
        if (!isMobile) return;
        const isSearching = this._mobileSearchOpen || Boolean(this._searchQuery.trim());
        if (this._composerEl) {
            this._composerEl.toggleClass('is-hidden', isSearching);
        }
        if (this._filterBarEl) {
            this._filterBarEl.toggleClass('is-hidden', isSearching);
        }
        if (this._containerEl) {
            this._containerEl.toggleClass('is-searching', isSearching);
        }
    }

    private renderHeaderBar(header: HTMLElement): void {
        header.empty();

        const isMobile = Platform.isMobile && !isTablet(this.app);

        const titleSection = header.createDiv({ cls: 'pos-header-title-section' });
        titleSection.createSpan({ cls: 'pos-header-logo', text: 'DIWA' });
        titleSection.createSpan({ cls: 'pos-header-subtitle', text: 'Personal OS' });

        // Actions
        const actions = header.createDiv({ cls: 'pos-header-actions' });

        // Mobile Search Toggle button
        if (isMobile) {
            const searchToggleBtn = actions.createEl('button', {
                cls: `pos-icon-btn pos-mobile-search-toggle ${this._mobileSearchOpen || this._searchQuery ? 'is-active' : ''}`,
                attr: { 'aria-label': 'Search notes' }
            });
            searchToggleBtn.setText('🔍');
            searchToggleBtn.onclick = () => {
                this._mobileSearchOpen = !this._mobileSearchOpen;
                if (this._mobileSearchOpen) {
                    this._activeFilter = 'all';
                } else {
                    this._searchQuery = '';
                }
                this._renderedCount = BATCH_SIZE;
                this.renderHeaderBar(header);
                this.updateComposerVisibility();
                this.updateStreamOnly();
                if (this._mobileSearchOpen) {
                    setTimeout(() => {
                        const input = header.querySelector<HTMLInputElement>('.pos-search-input');
                        input?.focus();
                    }, 60);
                }
            };

            // Obsidian Mobile Nav Bar Toggle button
            const isNavHidden = document.body.hasClass('diwa-hide-mobile-navbar');
            const navToggleBtn = actions.createEl('button', {
                cls: `pos-icon-btn pos-mobile-nav-toggle ${!isNavHidden ? 'is-active' : ''}`,
                attr: { 'aria-label': isNavHidden ? 'Show Obsidian navigation bar' : 'Hide Obsidian navigation bar' }
            });
            navToggleBtn.setText('📱');
            navToggleBtn.onclick = () => {
                document.body.toggleClass('diwa-hide-mobile-navbar', !isNavHidden);
                new Notice(isNavHidden ? 'Obsidian navigation bar shown' : 'Obsidian navigation bar hidden');
                this.renderHeaderBar(header);
            };
        }

        // Select mode toggle button
        const selectBtn = actions.createEl('button', {
            cls: `pos-header-text-btn ${this._selectionMode ? 'is-active' : ''}`,
            text: this._selectionMode ? 'Done' : 'Select',
            attr: { 'aria-label': this._selectionMode ? 'Exit selection mode' : 'Select notes to merge' }
        });
        selectBtn.onclick = () => {
            this._selectionMode = !this._selectionMode;
            if (!this._selectionMode) {
                this._selectedEntryIds.clear();
            }
            if (this._headerBarEl) this.renderHeaderBar(this._headerBarEl);
            this.updateSelectionBar();
            this.updateStreamOnly();
        };

        // Inbox Sweeper button
        const untaggedCount = this.plugin.index.getUntaggedCount();
        if (untaggedCount > 0) {
            const sweeperBtn = actions.createEl('button', {
                cls: `pos-sweeper-btn ${this._activeFilter === 'untagged' ? 'is-active' : ''}`,
                text: `🧹 ${untaggedCount}`
            });
            sweeperBtn.onclick = () => {
                this._activeFilter = this._activeFilter === 'untagged' ? 'all' : 'untagged';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };
        }

        // Settings trigger
        const settingsBtn = actions.createEl('button', {
            cls: 'pos-icon-btn pos-settings-trigger',
            attr: { 'aria-label': 'Settings' }
        });
        settingsBtn.setText('⚙️');
        settingsBtn.onclick = () => {
            (this.app as any).setting?.open();
            (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
        };

        // Search bar (always on desktop; expandable on mobile)
        if (!isMobile || this._mobileSearchOpen || this._searchQuery) {
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

            searchInput.onfocus = () => {
                if (isMobile) {
                    this._mobileSearchOpen = true;
                    this.updateComposerVisibility();
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
                    triggerSearch(searchInput.value, isMobile);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._searchQuery = '';
                    if (isMobile) {
                        this._mobileSearchOpen = false;
                    }
                    this.renderHeaderBar(header);
                    triggerSearch('', true);
                }
            };

            if (this._searchQuery || isMobile) {
                const clearBtn = searchContainer.createSpan({
                    cls: 'pos-search-clear',
                    text: '✕',
                    attr: { 'aria-label': 'Clear or close search' }
                });
                clearBtn.onclick = () => {
                    this._searchQuery = '';
                    if (isMobile) {
                        this._mobileSearchOpen = false;
                    }
                    this._renderedCount = BATCH_SIZE;
                    this.renderHeaderBar(header);
                    this.updateStreamOnly();
                    this.updateComposerVisibility();
                };
            }
        }
    }

    private renderFilterBar(parent: HTMLElement): void {
        try {
            parent.empty();
            const scrollable = parent.createDiv({ cls: 'pos-filter-carousel' });

            const allCaptures = this.plugin.index?.getAllCaptures?.() || [];
            const totalCount = allCaptures.length;
            const openTaskCount = this.plugin.index?.getOpenTaskCount?.() || 0;
            const areaCounts = this.plugin.index?.getAreaCounts?.() || {};

            // 1. All chip
            const allChip = scrollable.createDiv({
                cls: `pos-filter-chip ${this._activeFilter === 'all' ? 'is-active' : ''}`,
            });
            allChip.dataset.filter = 'all';
            allChip.createSpan({ cls: 'pos-chip-label', text: 'All Notes' });
            allChip.createSpan({ cls: 'pos-chip-badge', text: `${totalCount}` });
            allChip.onclick = () => {
                this._activeFilter = 'all';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 2. Open Tasks chip
            const tasksChip = scrollable.createDiv({
                cls: `pos-filter-chip pos-chip-tasks ${this._activeFilter === 'tasks_only' ? 'is-active' : ''}`,
            });
            tasksChip.dataset.filter = 'tasks_only';
            tasksChip.createSpan({ cls: 'pos-chip-icon', text: '☑️' });
            tasksChip.createSpan({ cls: 'pos-chip-label', text: 'Open Tasks' });
            tasksChip.createSpan({ cls: 'pos-chip-badge', text: `${openTaskCount}` });
            tasksChip.onclick = () => {
                this._activeFilter = 'tasks_only';
                this._renderedCount = BATCH_SIZE;
                this.updateFilterActiveStates();
                this.updateStreamOnly();
            };

            // 3. Today / Resurface chip
            const todayCount = this.plugin.index?.getTodayCapturesCount?.() || 0;
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
            const upcomingCount = this.plugin.index?.getUpcomingCapturesCount?.() || 0;
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
        if (!this._filterBarEl) return;
        const chips = this._filterBarEl.querySelectorAll<HTMLElement>('.pos-filter-chip');
        chips.forEach(chip => {
            const filter = chip.dataset.filter;
            chip.toggleClass('is-active', filter === this._activeFilter);
        });
    }

    private updateFilterCounts(): void {
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
        const composerWrapper = parent.createDiv({
            cls: `pos-composer ${isStickyMobile ? 'pos-mobile-sticky-composer' : 'pos-desktop-composer'}`
        });
        this._composerEl = composerWrapper;

        if (isStickyMobile) {
            // === MOBILE 2-ROW COMPACT FLOATING COMPOSER ===
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

            // 3. Horizontal swipeable pills row: Task button + Life Areas
            const pillsRow = composerWrapper.createDiv({ cls: 'pos-mobile-composer-pills-row' });

            // Task toggle pill in Row 2
            const taskBtn = pillsRow.createEl('button', {
                cls: 'pos-composer-area-pill pos-composer-task-pill',
                attr: { 'aria-label': 'Insert task checkbox' }
            });
            taskBtn.setText('☑️ Task');

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
            const doSave = async () => {
                const text = textarea.value.trim();
                if (!text) return;
                sendBtn.disabled = true;
                try {
                    await this.plugin.capture.createCaptureNote(
                        text,
                        this._selectedAreaForNewNote,
                        []
                    );
                    this.plugin.capture.clearDraft();
                    textarea.value = '';
                    this._selectedAreaForNewNote = '';
                    this.renderComposerPillSelection(composerWrapper);
                    autoResize();
                    new Notice('Note captured!');
                    this.updateFilterCounts();
                    this.updateStreamOnly();
                } catch (err) {
                    console.error('[DIWA DesktopHubView] Save capture note error', err);
                    new Notice('Failed to save note');
                } finally {
                    sendBtn.disabled = false;
                }
            };

            sendBtn.onclick = () => { void doSave(); };

            textarea.onkeydown = (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void doSave();
                }
            };

        } else {
            // === DESKTOP HERO COMPOSER ===
            const textarea = composerWrapper.createEl('textarea', {
                cls: 'pos-composer-textarea pos-desktop-composer-textarea',
                placeholder: 'What’s on your mind? Capture a thought, task (- [ ]), or note...',
                attr: { rows: '2' }
            });

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
            
            const hint = rightControls.createSpan({
                cls: 'pos-composer-hint',
                text: '⌘ Enter'
            });

            const saveBtn = rightControls.createEl('button', {
                cls: 'pos-composer-save-btn mod-cta',
                text: 'Capture Note'
            });

            const doSave = async () => {
                const text = textarea.value.trim();
                if (!text) return;
                saveBtn.disabled = true;
                try {
                    await this.plugin.capture.createCaptureNote(
                        text,
                        this._selectedAreaForNewNote,
                        []
                    );
                    this.plugin.capture.clearDraft();
                    textarea.value = '';
                    this._selectedAreaForNewNote = '';
                    this.renderComposerPillSelection(composerWrapper);
                    autoResize();
                    new Notice('Note captured!');
                    this.updateFilterCounts();
                    this.updateStreamOnly();
                } catch (err) {
                    console.error('[DIWA DesktopHubView] Save capture note error', err);
                    new Notice('Failed to save note');
                } finally {
                    saveBtn.disabled = false;
                }
            };

            saveBtn.onclick = () => { void doSave(); };

            // Cmd/Ctrl+Enter keyboard shortcut
            textarea.onkeydown = (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void doSave();
                }
            };
        }
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
        let entries = this.plugin.index?.getAllCaptures?.() || [];

        // 1. Search query filter (searches across all notes in workspace)
        if (this._searchQuery.trim()) {
            const query = this._searchQuery.toLowerCase().trim();
            return entries.filter(e => {
                if (!e) return false;
                if (String(e.body || '').toLowerCase().includes(query)) return true;
                if (String(e.area || '').toLowerCase().includes(query)) return true;
                const tags = Array.isArray(e.tags) ? e.tags : [];
                if (tags.some(t => String(t || '').toLowerCase().includes(query))) return true;
                return false;
            });
        }

        // 2. Mode / Life Area filter (active when not searching)
        if (this._activeFilter === 'tasks_only') {
            entries = entries.filter(e => e && e.hasTasks && Array.isArray(e.tasks) && e.tasks.some(t => t && !t.completed));
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
        } else if (this._activeFilter !== 'all') {
            const areaId = this._activeFilter.toLowerCase().trim();
            entries = entries.filter(e => {
                if (!e) return false;
                const noteArea = String(e.area || '').toLowerCase().trim();
                const tags = Array.isArray(e.tags) ? e.tags.map(t => String(t || '').toLowerCase().trim()) : [];
                return noteArea === areaId || tags.includes(areaId);
            });
        }

        return entries;
    }

    private updateStreamOnly(): void {
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
            emptyEl.createDiv({ cls: 'pos-empty-icon', text: trimmedQuery ? '🔍' : '📝' });
            emptyEl.createDiv({
                cls: 'pos-empty-title',
                text: trimmedQuery
                    ? `No notes matching "${trimmedQuery}"`
                    : (this._activeFilter === 'upcoming' ? 'No upcoming notes scheduled' : 'Your workspace is clean and ready')
            });
            emptyEl.createDiv({
                cls: 'pos-empty-subtitle',
                text: trimmedQuery
                    ? 'Check spelling or try a different keyword.'
                    : (this._activeFilter === 'upcoming' ? 'Use @tomorrow or [[YYYY-MM-DD]] to schedule thoughts or tasks.' : 'Type above to capture thoughts, ideas, or to-dos instantly.')
            });
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

        // Group entries by date
        let lastDateKey = '';

        for (const entry of visibleEntries) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                const divider = container.createDiv({ cls: 'pos-date-divider' });
                divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                divider.createDiv({ cls: 'pos-date-line' });
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

        // Find last date heading currently rendered
        const dateDividers = container.querySelectorAll<HTMLElement>('.pos-date-heading');
        let lastDateKey = dateDividers.length > 0 ? dateDividers[dateDividers.length - 1].textContent || '' : '';

        for (const entry of newBatch) {
            const dateKey = this.getDateHeadingForEntry(entry);
            if (dateKey !== lastDateKey) {
                lastDateKey = dateKey;
                const divider = container.createDiv({ cls: 'pos-date-divider' });
                divider.createSpan({ cls: 'pos-date-heading', text: dateKey });
                divider.createDiv({ cls: 'pos-date-line' });
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
        const item = parent.createDiv({
            cls: `pos-note-stream-item ${isSelected ? 'is-selected' : ''} ${this._selectionMode ? 'is-selection-mode' : ''}`
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
        }

        // If in inline editing mode
        if (this._editingEntryId === entry.id) {
            this.renderInlineEditor(item, entry);
            return;
        }

        // Note Metadata line
        const metaEl = item.createDiv({ cls: 'pos-note-meta' });

        // Left meta: multi-select checkbox (only in selection mode) + time + area badge
        const metaLeft = metaEl.createDiv({ cls: 'pos-note-meta-left' });

        if (this._selectionMode) {
            const selectCheckbox = metaLeft.createEl('input', {
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

        const timeStr = moment(entry.createdAtMs).format('h:mm A');
        metaLeft.createSpan({ cls: 'pos-note-time', text: timeStr });

        const areas = this.plugin.settings.lifeAreas || [];
        const areaObj = entry.area ? areas.find(a => a.id.toLowerCase() === entry.area.toLowerCase()) : null;

        const badge = metaLeft.createSpan({
            cls: `pos-area-badge ${entry.area ? `pos-area-${entry.area.toLowerCase()}` : 'pos-area-add'}`,
            text: areaObj ? `${areaObj.icon || ''} ${areaObj.label}`.trim() : (entry.area ? entry.area : '+ Area'),
            attr: { 'aria-label': 'Click to change life area' }
        });

        badge.onclick = (e) => {
            e.stopPropagation();
            const menu = new Menu();
            for (const area of areas) {
                menu.addItem((item) => {
                    item.setTitle(`${area.icon || ''} ${area.label}`.trim())
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
                menu.addSeparator();
                menu.addItem((item) => {
                    item.setTitle('✕ Remove Area (Untagged)')
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
            menu.showAtMouseEvent(e);
        };

        // Other tags
        for (const tag of entry.tags) {
            if (tag.toLowerCase() !== entry.area.toLowerCase()) {
                const tagBadge = metaLeft.createSpan({ cls: 'pos-tag-badge', text: `#${tag}` });
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

                const dateBadge = metaLeft.createSpan({
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

        // Right meta: Action hover menu
        const metaRight = metaEl.createDiv({ cls: 'pos-note-actions' });

        const editBtn = metaRight.createSpan({
            cls: 'pos-action-icon',
            text: '✏️',
            attr: { 'aria-label': 'Edit note' }
        });
        editBtn.onclick = (e) => {
            e.stopPropagation();
            this._editingEntryId = entry.id;
            this.updateStreamOnly();
        };

        const trashBtn = metaRight.createSpan({
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

        // Note Body rendered via Obsidian MarkdownRenderer with cache
        const bodyEl = item.createDiv({ cls: 'pos-note-body markdown-rendered' });
        const cacheKey = `${entry.filePath}_${entry.modified}`;
        const cached = this.getCachedRenderedBody(cacheKey);

        if (cached) {
            // Clone cached node and attach listeners
            bodyEl.appendChild(cached.cloneNode(true));
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

        // 2. Rendered internal date links
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
        }, 0);

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

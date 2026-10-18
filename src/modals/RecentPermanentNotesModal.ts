import { App, Modal, Platform, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import type { PermanentNoteRecord } from '../types';
import { WikilinkPeekModal } from './WikilinkPeekModal';

export class RecentPermanentNotesModal extends Modal {
    private plugin: DiwaPlugin;
    private searchQuery: string = '';
    private listContainerEl: HTMLElement | null = null;
    private searchInputEl: HTMLInputElement | null = null;
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _cleanupKeyboard: (() => void) | null = null;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { modalEl, containerEl } = this;
        modalEl.empty();

        modalEl.addClass('pos-recent-notes-modal');

        if (Platform.isMobile) {
            modalEl.addClass('pos-mobile-bottom-sheet');
            modalEl.addClass('pos-recent-notes-sheet');
            containerEl.addClass('pos-bottom-sheet-backdrop');
            this.setupMobileGestures(modalEl);
            this.setupKeyboardHandling(modalEl);
        }

        this.renderModal();
    }

    private renderModal(): void {
        const { modalEl } = this;
        modalEl.empty();

        // 1. Mobile Drag Handle
        if (Platform.isMobile) {
            const dragWrap = modalEl.createDiv({ cls: 'pos-sheet-drag-handle-wrap' });
            dragWrap.createDiv({ cls: 'pos-sheet-drag-handle' });
        }

        // 2. Header
        const headerEl = modalEl.createDiv({ cls: 'pos-recent-notes-header' });
        const titleWrap = headerEl.createDiv({ cls: 'pos-recent-notes-title-wrap' });
        const titleIcon = titleWrap.createSpan({ cls: 'pos-recent-notes-title-icon' });
        setIcon(titleIcon, 'book-open');
        titleWrap.createEl('h3', { cls: 'pos-recent-notes-title', text: 'Recent Notes' });

        const headerActions = headerEl.createDiv({ cls: 'pos-recent-notes-header-actions' });
        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-recent-notes-close-btn clickable-icon',
            attr: { 'aria-label': 'Close modal' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => this.close();

        // 3. Search Bar
        const searchWrap = modalEl.createDiv({ cls: 'pos-recent-notes-search-wrap' });
        const searchInput = searchWrap.createEl('input', {
            type: 'search',
            placeholder: 'Filter recent notes by title or folder...',
            cls: 'pos-recent-notes-search-input',
            attr: {
                autocomplete: 'off',
                spellcheck: 'false',
                autocorrect: 'off',
                autocapitalize: 'off',
            }
        });
        this.searchInputEl = searchInput;

        searchInput.value = this.searchQuery;
        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }
            this.searchDebounceTimer = setTimeout(() => {
                this.searchDebounceTimer = null;
                this.renderList();
            }, 150);
        });
        searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.openFirstMatch();
            }
        });

        // 4. Scrollable List Container
        this.listContainerEl = modalEl.createDiv({ cls: 'pos-recent-notes-list' });
        this.renderList();

        // Focus search input after mount
        setTimeout(() => {
            if (this.searchInputEl && !Platform.isMobile) {
                this.searchInputEl.focus();
            }
        }, 50);
    }

    private renderList(): void {
        if (!this.listContainerEl) return;
        this.listContainerEl.empty();

        const records = this.plugin.index?.getRecentlyUpdatedPermanentNotes(35, this.searchQuery) || [];

        if (records.length === 0) {
            const emptyEl = this.listContainerEl.createDiv({ cls: 'pos-recent-notes-empty' });
            emptyEl.createSpan({ cls: 'pos-recent-notes-empty-icon', text: '📝' });
            emptyEl.createEl('p', {
                text: this.searchQuery.trim()
                    ? 'No matching permanent notes found.'
                    : 'No permanent notes updated recently.'
            });
            return;
        }

        for (const record of records) {
            this.renderNoteItem(this.listContainerEl, record);
        }
    }

    private renderNoteItem(parent: HTMLElement, record: PermanentNoteRecord): void {
        const itemEl = parent.createDiv({ cls: 'pos-recent-note-item' });

        // Left / Main column: Title, Folder badge, Tags
        const mainCol = itemEl.createDiv({ cls: 'pos-recent-note-main' });
        const titleEl = mainCol.createDiv({ cls: 'pos-recent-note-title', text: record.title });

        const metaRow = mainCol.createDiv({ cls: 'pos-recent-note-meta' });
        if (record.folder) {
            const folderBadge = metaRow.createSpan({ cls: 'pos-recent-note-folder' });
            const folderIcon = folderBadge.createSpan({ cls: 'pos-recent-note-folder-icon' });
            setIcon(folderIcon, 'folder');
            folderBadge.createSpan({ text: record.folder });
        }

        if (record.tags && record.tags.length > 0) {
            for (const tag of record.tags.slice(0, 3)) {
                metaRow.createSpan({ cls: 'pos-recent-note-tag', text: `#${tag}` });
            }
        }

        // Right column: Relative timestamp
        const timeCol = itemEl.createDiv({ cls: 'pos-recent-note-time-wrap' });
        timeCol.createSpan({ cls: 'pos-recent-note-time', text: record.modifiedRelative });

        // Click to open peek modal
        itemEl.onclick = () => {
            this.close();
            new WikilinkPeekModal(this.app, this.plugin, record.filePath, record.filePath).open();
        };
    }

    private openFirstMatch(): void {
        const records = this.plugin.index?.getRecentlyUpdatedPermanentNotes(1, this.searchQuery) || [];
        if (records.length > 0) {
            this.close();
            new WikilinkPeekModal(this.app, this.plugin, records[0].filePath, records[0].filePath).open();
        }
    }

    private setupMobileGestures(modalEl: HTMLElement): void {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                startY = e.touches[0].clientY;
                isDragging = true;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
                modalEl.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            if (deltaY > 80) {
                this.close();
            } else {
                modalEl.style.transform = '';
            }
        };

        const dragHandle = modalEl.querySelector('.pos-sheet-drag-handle-wrap');
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
            dragHandle.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
            dragHandle.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
        }
    }

    private setupKeyboardHandling(modalEl: HTMLElement): void {
        const win = window;
        const vv = win.visualViewport;

        const syncViewportMetrics = () => {
            let kbHeight = 0;
            if (vv) {
                const offset = win.innerHeight - (vv.height + vv.offsetTop);
                if (offset > 60) {
                    kbHeight = Math.round(offset);
                }
            }

            const docKb = parseFloat(win.getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
            const bodyKb = parseFloat(win.getComputedStyle(document.body).getPropertyValue('--keyboard-height')) || 0;
            const finalKb = Math.max(kbHeight, docKb, bodyKb);

            if (finalKb > 60) {
                modalEl.style.setProperty('--diwa-kb-h', `${finalKb}px`);
            } else {
                modalEl.style.removeProperty('--diwa-kb-h');
            }
        };

        const onFocus = () => {
            modalEl.addClass('has-keyboard');
            syncViewportMetrics();
        };

        const onBlur = () => {
            setTimeout(() => {
                const active = document.activeElement;
                if (!active || !modalEl.contains(active) || active.tagName !== 'INPUT') {
                    modalEl.removeClass('has-keyboard');
                    modalEl.style.removeProperty('--diwa-kb-h');
                }
            }, 120);
        };

        modalEl.addEventListener('focusin', onFocus, true);
        modalEl.addEventListener('focusout', onBlur, true);
        vv?.addEventListener('resize', syncViewportMetrics);
        vv?.addEventListener('scroll', syncViewportMetrics);
        win.addEventListener('resize', syncViewportMetrics);

        const obsEvents = ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide'];
        obsEvents.forEach(evt => win.addEventListener(evt, syncViewportMetrics));

        this._cleanupKeyboard = () => {
            modalEl.removeEventListener('focusin', onFocus, true);
            modalEl.removeEventListener('focusout', onBlur, true);
            vv?.removeEventListener('resize', syncViewportMetrics);
            vv?.removeEventListener('scroll', syncViewportMetrics);
            win.removeEventListener('resize', syncViewportMetrics);
            obsEvents.forEach(evt => win.removeEventListener(evt, syncViewportMetrics));
            modalEl.removeClass('has-keyboard');
            modalEl.style.removeProperty('--diwa-kb-h');
        };
    }

    onClose(): void {
        if (this._cleanupKeyboard) {
            this._cleanupKeyboard();
            this._cleanupKeyboard = null;
        }
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
        const { modalEl } = this;
        modalEl.empty();
    }
}

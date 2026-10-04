import { App, Modal, Platform, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import type { PermanentNoteRecord } from '../types';

export class RecentPermanentNotesModal extends Modal {
    private plugin: DiwaPlugin;
    private searchQuery: string = '';
    private listContainerEl: HTMLElement | null = null;
    private searchInputEl: HTMLInputElement | null = null;

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
            this.renderList();
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

        // Click to open
        itemEl.onclick = () => {
            this.close();
            this.app.workspace.openLinkText(record.filePath, '', false);
        };
    }

    private openFirstMatch(): void {
        const records = this.plugin.index?.getRecentlyUpdatedPermanentNotes(1, this.searchQuery) || [];
        if (records.length > 0) {
            this.close();
            this.app.workspace.openLinkText(records[0].filePath, '', false);
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

    onClose(): void {
        const { modalEl } = this;
        modalEl.empty();
    }
}

import { App, Modal, Platform, Notice, moment, setIcon } from 'obsidian';
import DiwaPlugin from '../main';
import { isTablet, attachMediaPasteHandler, attachInlineTriggers } from '../utils';

const JOURNAL_TYPES = [
    { id: 'reflection',  tag: 'reflection',  icon: '🪞', label: 'Reflection',  placeholder: 'Look back… what happened, how did it feel?' },
    { id: 'realization', tag: 'realization', icon: '⚡', label: 'Realization', placeholder: 'The insight was…' },
    { id: 'gratitude',   tag: 'gratitude',   icon: '🙏', label: 'Gratitude',   placeholder: 'I\'m grateful for…' },
    { id: 'idea',        tag: 'idea',        icon: '💡', label: 'Idea',        placeholder: 'What if… capture the spark.' },
    { id: 'note',        tag: 'note',        icon: '📝', label: 'Note',        placeholder: 'Note to self…' },
    { id: 'free',        tag: '',            icon: '✍️', label: 'Free Write',  placeholder: 'Start writing…' },
] as const;
const TYPE_TAGS: Set<string> = new Set(JOURNAL_TYPES.filter(t => t.tag).map(t => t.tag));

export class JournalEntryModal extends Modal {
    private plugin: DiwaPlugin;
    private mode: 'new' | 'edit';
    private initialText: string;
    private filePath: string | null;
    private onSave: (text: string, contexts: string[]) => Promise<void>;
    private contexts: string[] = [];
    private _isMobileSheet = false;

    constructor(
        app: App,
        plugin: DiwaPlugin,
        mode: 'new' | 'edit',
        initialText: string,
        filePath: string | null,
        onSave: (text: string, contexts: string[]) => Promise<void>,
        initialContexts?: string[]
    ) {
        super(app);
        this.plugin = plugin;
        this.mode = mode;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.filePath = filePath;
        this.onSave = onSave;
        this.contexts = initialContexts ? [...initialContexts] : [];
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this._isMobileSheet = Platform.isMobile && !isTablet();

        if (this._isMobileSheet) {
            this._renderMobileSheet(contentEl, modalEl);
        } else if (Platform.isMobile && isTablet()) {
            this._renderCard(contentEl, modalEl, 'tablet');
        } else {
            this._renderCard(contentEl, modalEl, 'desktop');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this._isMobileSheet) {
            document.body.removeClass('diwa-journal-sheet-active');
        }
    }

    // ── MOBILE — M365-STYLE TOP SHEET ─────────────────────────────────────
    private _renderMobileSheet(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('diwa-journal-modal');
        modalEl.addClass('diwa-jm-sheet');
        document.body.addClass('diwa-journal-sheet-active');

        modalEl.style.setProperty('border-radius', '0 0 20px 20px', 'important');
        modalEl.style.setProperty('overflow', 'hidden', 'important');
        contentEl.style.setProperty('padding', '0', 'important');

        const now = moment();

        // ── M365 nav header: [Cancel]  title/date  [Done] ─────────────────
        const navHeader = contentEl.createDiv({ cls: 'diwa-jm-m365-header' });
        const cancelBtn = navHeader.createEl('button', {
            cls: 'diwa-jm-m365-cancel',
            text: 'Cancel',
            attr: { type: 'button', 'aria-label': 'Cancel journal entry' }
        });
        cancelBtn.addEventListener('click', () => this.close());

        const headerCenter = navHeader.createDiv({ cls: 'diwa-jm-m365-center' });
        headerCenter.createSpan({ cls: 'diwa-jm-m365-title', text: '✍️ Journal' });
        headerCenter.createSpan({ cls: 'diwa-jm-m365-date', text: now.format('ddd, MMM D · HH:mm') });

        const saveBtn = navHeader.createEl('button', {
            cls: 'diwa-jm-m365-done',
            text: this.mode === 'new' ? 'Done' : 'Update',
            attr: { type: 'button', 'aria-label': this.mode === 'new' ? 'Save journal entry' : 'Update journal entry' }
        }) as HTMLButtonElement;

        // ── Document textarea ──────────────────────────────────────────────
        const textArea = contentEl.createEl('textarea', {
            cls: 'diwa-jm-textarea diwa-jm-textarea--mobile',
            attr: { placeholder: 'Start writing…' }
        }) as HTMLTextAreaElement;
        textArea.value = this.initialText;

        // ── Type picker bar ───────────────────────────────────────────────
        this._renderTypeBar(contentEl, textArea, true);

        // ── Hidden file input ──────────────────────────────────────────────
        const fileInput = contentEl.createEl('input', {
            attr: { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }
        }) as HTMLInputElement;
        fileInput.addEventListener('change', () => this._handleFileInput(fileInput, textArea, null));

        // ── Bottom action bar: [📎] [divider] [chips…] ────────────────────
        const actionBar = contentEl.createDiv({ cls: 'diwa-jm-m365-bar' });
        const barLeft = actionBar.createDiv({ cls: 'diwa-jm-m365-bar-left' });

        const attachIcon = barLeft.createEl('button', {
            cls: 'diwa-jm-m365-icon-btn',
            attr: { type: 'button', title: 'Attach image', 'aria-label': 'Attach image to journal entry' }
        });
        setIcon(attachIcon, 'lucide-image');
        attachIcon.addEventListener('click', () => fileInput.click());

        barLeft.createSpan({ cls: 'diwa-jm-m365-bar-divider' });

        const chipScroll = actionBar.createDiv({ cls: 'diwa-jm-m365-chips' });
        const renderChips = () => {
            chipScroll.empty();
            const visible = this.contexts.filter(c => c !== 'journal' && !TYPE_TAGS.has(c));
            for (const ctx of visible) {
                const chip = chipScroll.createEl('span', { cls: 'diwa-jm-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createEl('button', {
                    text: '×',
                    cls: 'diwa-jm-chip-x',
                    attr: { type: 'button', 'aria-label': `Remove #${ctx}` }
                });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.contexts = this.contexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
            if (visible.length === 0) {
                chipScroll.createSpan({ text: 'Use # to tag', cls: 'diwa-jm-chip-hint' });
            }
        };
        renderChips();

        // ── Save logic ────────────────────────────────────────────────────
        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.disabled = empty;
            saveBtn.toggleClass('is-disabled', empty);
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = async () => {
            const text = textArea.value.trim();
            if (!text) return;
            const ctxs = [...this.contexts];
            if (!ctxs.includes('journal')) ctxs.push('journal');
            await this.onSave(text, ctxs);
            this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        attachMediaPasteHandler(this.app, textArea, () =>
            this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );
        attachInlineTriggers(
            this.app, textArea,
            () => {},
            (tag: string) => { if (!this.contexts.includes(tag)) { this.contexts.push(tag); renderChips(); } },
            () => this.plugin.settings.contexts ?? [],
            this.plugin.settings.peopleFolder
        );

        setTimeout(() => {
            textArea.focus();
            textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        }, 80);
    }

    // ── TABLET / DESKTOP CARD ─────────────────────────────────────────────
    private _renderCard(contentEl: HTMLElement, modalEl: HTMLElement, variant: 'tablet' | 'desktop') {
        modalEl.addClass('diwa-journal-modal');
        modalEl.addClass('diwa-jm-card');
        modalEl.addClass(variant === 'tablet' ? 'diwa-jm-card--tablet' : 'diwa-jm-card--desktop');

        modalEl.style.setProperty('padding', '0', 'important');
        contentEl.style.setProperty('padding', '0', 'important');

        // ── Header
        const header = contentEl.createDiv({ cls: 'diwa-jm-card-header' });
        const headerLeft = header.createDiv({ cls: 'diwa-jm-header-left' });
        headerLeft.createSpan({
            cls: 'diwa-jm-header-title',
            text: this.mode === 'new' ? '✍️ New Entry' : '✍️ Edit Entry'
        });
        headerLeft.createSpan({
            cls: 'diwa-jm-header-date',
            text: moment().format(variant === 'desktop' ? 'dddd, MMMM D' : 'ddd, MMM D')
        });
        const closeBtn = header.createEl('button', {
            cls: 'diwa-jm-close-btn',
            attr: { type: 'button', 'aria-label': 'Close journal entry editor' }
        });
        setIcon(closeBtn, 'lucide-x');
        closeBtn.addEventListener('click', () => this.close());
        // ── Body
        const body = contentEl.createDiv({
            cls: 'diwa-jm-card-body' + (variant === 'desktop' ? ' diwa-jm-card-body--desktop' : '')
        });

        // Main writing zone
        const writeZone = body.createDiv({ cls: 'diwa-jm-write-zone' });
        const textArea = writeZone.createEl('textarea', {
            cls: `diwa-jm-textarea diwa-jm-textarea--${variant}`,
            attr: { placeholder: 'Write your entry…' }
        }) as HTMLTextAreaElement;
        textArea.value = this.initialText;

        // ── Type picker bar ───────────────────────────────────────────────
        // Insert between header and body via DOM ordering (contentEl is flex column)
        this._renderTypeBar(contentEl, textArea, false);
        // Move body after the type bar
        contentEl.appendChild(body);

        // Desktop: image preview strip (right column, hidden until image added)
        let previewStrip: HTMLElement | null = null;
        if (variant === 'desktop') {
            previewStrip = body.createDiv({ cls: 'diwa-jm-preview-strip' });
            previewStrip.style.display = 'none';
        }

        // ── Chip row (below textarea, above toolbar)
        const chipRow = contentEl.createDiv({ cls: 'diwa-jm-chip-row diwa-jm-chip-row--card' });
        const renderChips = () => {
            chipRow.empty();
            const visible = this.contexts.filter(c => c !== 'journal' && !TYPE_TAGS.has(c));
            for (const ctx of visible) {
                const chip = chipRow.createEl('span', { cls: 'diwa-jm-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createEl('button', {
                    text: '×',
                    cls: 'diwa-jm-chip-x',
                    attr: { type: 'button', 'aria-label': `Remove #${ctx}` }
                });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.contexts = this.contexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
            if (visible.length === 0) {
                chipRow.createSpan({ text: '# inline to add tags', cls: 'diwa-jm-chip-hint' });
            }
        };
        renderChips();

        // ── Hidden file input
        const fileInput = contentEl.createEl('input', {
            attr: { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }
        }) as HTMLInputElement;
        fileInput.addEventListener('change', () => this._handleFileInput(fileInput, textArea, previewStrip));

        // ── Footer toolbar
        const toolbar = contentEl.createDiv({ cls: 'diwa-jm-toolbar diwa-jm-toolbar--card' });
        const toolbarLeft = toolbar.createDiv({ cls: 'diwa-jm-toolbar-left' });
        const attachBtn = toolbarLeft.createEl('button', {
            cls: 'diwa-jm-attach-btn',
            attr: { type: 'button', 'aria-label': 'Attach image to journal entry' }
        });
        setIcon(attachBtn, 'lucide-paperclip');
        if (variant === 'desktop') {
            toolbarLeft.createSpan({ cls: 'diwa-jm-attach-hint', text: 'Paste or drag images' });
        }
        attachBtn.addEventListener('click', () => fileInput.click());

        const toolbarRight = toolbar.createDiv({ cls: 'diwa-jm-toolbar-right' });
        const cancelBtn = toolbarRight.createEl('button', {
            cls: 'diwa-jm-cancel-btn',
            text: 'Cancel',
            attr: { type: 'button', 'aria-label': 'Cancel journal entry' }
        });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = toolbarRight.createEl('button', {
            cls: 'diwa-jm-save-btn',
            text: this.mode === 'new' ? 'Save Entry' : 'Update Entry',
            attr: { type: 'button', 'aria-label': this.mode === 'new' ? 'Save journal entry' : 'Update journal entry' }
        }) as HTMLButtonElement;
        if (variant === 'desktop') {
            saveBtn.setAttribute('title', '⌘↵ / Ctrl+↵');
        }

        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.disabled = empty;
            saveBtn.toggleClass('is-disabled', empty);
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = async () => {
            const text = textArea.value.trim();
            if (!text) return;
            const ctxs = [...this.contexts];
            if (!ctxs.includes('journal')) ctxs.push('journal');
            await this.onSave(text, ctxs);
            this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        // Drag-drop visual indicator
        modalEl.addEventListener('dragover', (e) => { e.preventDefault(); modalEl.addClass('is-dragover'); });
        modalEl.addEventListener('dragleave', () => modalEl.removeClass('is-dragover'));
        modalEl.addEventListener('drop', () => modalEl.removeClass('is-dragover'));

        attachMediaPasteHandler(this.app, textArea, () =>
            this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );
        attachInlineTriggers(
            this.app, textArea,
            () => {},
            (tag: string) => { if (!this.contexts.includes(tag)) { this.contexts.push(tag); renderChips(); } },
            () => this.plugin.settings.contexts ?? [],
            this.plugin.settings.peopleFolder
        );

        setTimeout(() => {
            textArea.focus();
            textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        }, 80);
    }

    // ── TYPE PICKER BAR ──────────────────────────────────────────────────
    private _renderTypeBar(parent: HTMLElement, textArea: HTMLTextAreaElement, isMobile: boolean) {
        const bar = parent.createDiv({
            cls: `diwa-jm-type-bar${isMobile ? ' diwa-jm-type-bar--mobile' : ' diwa-jm-type-bar--card'}`
        });

        // Determine initial active type from existing contexts
        let activeId = 'free';
        for (const type of JOURNAL_TYPES) {
            if (type.tag && this.contexts.includes(type.tag)) {
                activeId = type.id;
                break;
            }
        }

        const initialType = JOURNAL_TYPES.find(t => t.id === activeId)!;
        textArea.placeholder = initialType.placeholder;

        const pillEls = new Map<string, HTMLElement>();

        for (const type of JOURNAL_TYPES) {
            const pill = bar.createEl('button', {
                cls: `diwa-jm-type-pill${type.id === activeId ? ' is-active' : ''}`,
                attr: {
                    type: 'button',
                    'aria-pressed': type.id === activeId ? 'true' : 'false',
                    'aria-label': `${type.label} journal type`
                }
            });
            pill.createSpan({ cls: 'diwa-jm-type-pill__icon', text: type.icon });
            pill.createSpan({ cls: 'diwa-jm-type-pill__label', text: type.label });
            pillEls.set(type.id, pill);

            pill.addEventListener('click', () => {
                for (const el of pillEls.values()) {
                    el.removeClass('is-active');
                    el.setAttribute('aria-pressed', 'false');
                }
                pill.addClass('is-active');
                pill.setAttribute('aria-pressed', 'true');
                this.contexts = this.contexts.filter(c => !TYPE_TAGS.has(c));
                if (type.tag) this.contexts.push(type.tag);
                textArea.placeholder = type.placeholder;
                textArea.focus();
            });
        }
    }

    // ── FILE INPUT HANDLER ────────────────────────────────────────────────
    private async _handleFileInput(
        fileInput: HTMLInputElement,
        textArea: HTMLTextAreaElement,
        previewStrip: HTMLElement | null
    ) {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await this._saveAndInsert(files[i], textArea, previewStrip);
        }
        fileInput.value = '';
    }

    private async _saveAndInsert(
        file: File,
        textArea: HTMLTextAreaElement,
        previewStrip: HTMLElement | null
    ) {
        try {
            const folder = (this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments').trim();
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const mimeToExt: Record<string, string> = {
                'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
            };
            const ext = mimeToExt[file.type] || (file.name.includes('.') ? file.name.split('.').pop()! : 'bin');
            const ts = moment().format('YYYYMMDD_HHmmss');
            const rand = Math.random().toString(36).substring(2, 6);
            const filename = `journal_${ts}_${rand}.${ext}`;
            const buffer = await file.arrayBuffer();
            await this.app.vault.createBinary(`${folder}/${filename}`, buffer);
            const link = `![[${filename}]]`;

            // Insert at cursor
            const start = textArea.selectionStart ?? textArea.value.length;
            const end = textArea.selectionEnd ?? start;
            textArea.value = textArea.value.substring(0, start) + link + textArea.value.substring(end);
            textArea.setSelectionRange(start + link.length, start + link.length);
            textArea.dispatchEvent(new Event('input'));

            // Desktop image preview
            if (previewStrip && file.type.startsWith('image/')) {
                previewStrip.style.display = 'flex';
                const img = previewStrip.createEl('img', { cls: 'diwa-jm-preview-img' });
                const objUrl = URL.createObjectURL(file);
                img.src = objUrl;
                img.onload = () => URL.revokeObjectURL(objUrl);
            }

        } catch (e) {
            console.error('[DIWA] Journal attachment save failed:', e);
        }
    }

    // ── SWIPE TO DISMISS (mobile, handle only) ────────────────────────────
    private _initSwipeToDismiss(modalEl: HTMLElement, handleWrap: HTMLElement) {
        const DISMISS_THRESHOLD = 120, VELOCITY_THRESHOLD = 800, RESISTANCE = 280;
        let startY = 0, currentY = 0, isDragging = false, lastY = 0, lastTime = 0, velocity = 0;

        const onTouchStart = (e: TouchEvent) => {
            if (!handleWrap.contains(e.target as Node)) return;
            startY = e.touches[0].clientY;
            lastY = startY; lastTime = Date.now();
            isDragging = true;
            modalEl.style.transition = 'none';
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.style.transition = 'transform 0.25s ease';
                modalEl.style.transform = 'translateY(100%)';
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                modalEl.style.transform = 'translateY(0)';
            }
            currentY = 0;
        };

        modalEl.addEventListener('touchstart', onTouchStart, { passive: true });
        modalEl.addEventListener('touchmove', onTouchMove, { passive: true });
        modalEl.addEventListener('touchend', onTouchEnd, { passive: true });
    }
}

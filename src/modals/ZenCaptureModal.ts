import { App, Modal, Platform, Notice, setIcon } from 'obsidian';
import DiwaPlugin from '../main';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { ContextSuggestModal } from './ContextSuggestModal';
import { ConfirmModal } from './ConfirmModal';

export class ZenCaptureModal extends Modal {
    private plugin: DiwaPlugin;
    private textarea: HTMLTextAreaElement;
    private contexts: string[] = [];
    private chipRow: HTMLElement;
    private wordCountEl: HTMLElement;
    private saveBtn: HTMLButtonElement;
    private draftInterval: ReturnType<typeof setInterval> | null = null;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.modalEl.addClass('diwa-zen-capture');
        if (Platform.isMobile) document.body.addClass('is-mobile');

        const { contentEl } = this;
        contentEl.empty();

        // ── Header ──
        const header = contentEl.createEl('div', { cls: 'diwa-zen-header' });
        header.createEl('span', { text: '✦ ZEN CAPTURE', cls: 'diwa-zen-header-title' });
        const closeBtn = header.createEl('button', { cls: 'diwa-zen-close-btn' });
        setIcon(closeBtn, 'lucide-x');
        closeBtn.addEventListener('click', () => this.tryClose());

        // ── Context chip row ──
        this.chipRow = contentEl.createEl('div', { cls: 'diwa-zen-chip-row' });
        this.renderAddContextBtn();

        // ── Textarea ──
        this.textarea = contentEl.createEl('textarea', {
            cls: 'diwa-zen-textarea',
            attr: { placeholder: 'Let your thoughts flow\u2026' }
        });

        // ── Footer ──
        const footer = contentEl.createEl('div', { cls: 'diwa-zen-footer' });
        this.wordCountEl = footer.createEl('span', { cls: 'diwa-zen-word-count', text: '0 words' });
        footer.createEl('span', { cls: 'diwa-zen-hint', text: 'Shift+Enter new line \u00B7 Esc to close' });
        this.saveBtn = footer.createEl('button', { cls: 'diwa-zen-save-btn', text: 'SAVE' }) as HTMLButtonElement;
        this.saveBtn.disabled = true;
        this.saveBtn.addEventListener('click', () => this.save());

        // ── Event handlers ──
        this.textarea.addEventListener('input', () => this.onInput());

        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (this.textarea.value.trim()) this.save();
            }
        });

        // Attach inline triggers & media paste
        attachInlineTriggers(
            this.app,
            this.textarea,
            () => {},
            (tag: string) => this.addChip(tag),
            () => this.contexts,
            this.plugin.settings.peopleFolder
        );
        attachMediaPasteHandler(
            this.app,
            this.textarea,
            () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
        );

        // Restore draft
        if (this.plugin.zenCaptureDraft) {
            this.textarea.value = this.plugin.zenCaptureDraft;
            this.onInput();
        }

        // Auto-save draft every 30s
        this.draftInterval = setInterval(() => {
            this.plugin.zenCaptureDraft = this.textarea.value;
        }, 30000);

        // Auto-focus
        setTimeout(() => this.textarea.focus(), 50);

        // Override Esc default behavior
        this.scope.register([], 'Escape', (e) => {
            e.preventDefault();
            this.tryClose();
            return false;
        });
    }

    onClose() {
        if (this.draftInterval) {
            clearInterval(this.draftInterval);
            this.draftInterval = null;
        }
        this.contentEl.empty();
    }

    private onInput() {
        const text = this.textarea.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        this.wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        this.saveBtn.disabled = !text;
    }

    private addChip(tag: string) {
        if (this.contexts.includes(tag)) return;
        this.contexts.push(tag);
        const chip = this.chipRow.createEl('span', { cls: 'diwa-zen-chip', text: `#${tag}` });
        chip.addEventListener('click', () => {
            this.contexts = this.contexts.filter(c => c !== tag);
            chip.remove();
        });
        // Keep add-button at end
        const addBtn = this.chipRow.querySelector('.diwa-zen-add-ctx-btn');
        if (addBtn) this.chipRow.appendChild(addBtn);
    }

    private renderAddContextBtn() {
        const btn = this.chipRow.createEl('button', { cls: 'diwa-zen-add-ctx-btn', text: '+' });
        btn.addEventListener('click', () => {
            new ContextSuggestModal(this.app, this.contexts, (tag: string) => {
                this.addChip(tag);
            }).open();
        });
    }

    private async save() {
        const text = this.textarea.value.trim();
        if (!text) return;
        try {
            await this.plugin.getThoughtController().addThought({ content: text, context: this.contexts });
            this.plugin.zenCaptureDraft = '';
            this.close();
        } catch (e) {
            console.error('[DIWA] Zen Capture save failed:', e);
        }
    }

    private tryClose() {
        if (this.textarea.value.trim()) {
            new ConfirmModal(this.app, 'Discard unsaved thoughts?', () => {
                this.plugin.zenCaptureDraft = '';
                this.close();
            }).open();
        } else {
            this.plugin.zenCaptureDraft = '';
            this.close();
        }
    }
}



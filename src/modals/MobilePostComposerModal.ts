import { App, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { ConfirmModal } from './ConfirmModal';

export class MobilePostComposerModal extends Modal {
    private plugin: DiwaPlugin;
    private textarea!: HTMLTextAreaElement;
    private chipRow!: HTMLElement;
    private postBtn!: HTMLButtonElement;
    private contexts: string[] = [];
    private dirty = false;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.modalEl.addClass('diwa-mobile-post');

        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createEl('div', { cls: 'diwa-mobile-post-header' });
        const cancelBtn = header.createEl('button', { cls: 'diwa-mobile-post-cancel', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.tryClose());

        header.createEl('div', { cls: 'diwa-mobile-post-title', text: 'Create post' });

        this.postBtn = header.createEl('button', { cls: 'diwa-mobile-post-post', text: 'Post' }) as HTMLButtonElement;
        this.postBtn.disabled = true;
        this.postBtn.addEventListener('click', () => this.save());

        const body = contentEl.createEl('div', { cls: 'diwa-mobile-post-body' });
        const row = body.createEl('div', { cls: 'diwa-mobile-post-row' });
        const avatar = row.createEl('div', { cls: 'diwa-mobile-post-avatar' });
        setIcon(avatar, 'message-circle');
        row.createEl('div', {
            cls: 'diwa-mobile-post-prompt',
            text: "What's on your mind?"
        });

        this.chipRow = body.createEl('div', { cls: 'diwa-mobile-post-chip-row' });
        const composer = body.createEl('div', { cls: 'diwa-mobile-post-capture' });
        this.textarea = composer.createEl('textarea', {
            cls: 'diwa-mobile-post-textarea',
            attr: { placeholder: "What's on your mind?", rows: '1' }
        }) as HTMLTextAreaElement;

        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keyup', () => this.syncHeight());
        this.textarea.addEventListener('focus', () => this.onInput());
        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.save();
            }
        });

        attachInlineTriggers(
            this.app,
            this.textarea,
            () => {},
            (tag: string) => this.addChip(tag),
            () => (this.plugin.settings.contexts ?? []).filter(c => !this.contexts.includes(c)),
            this.plugin.settings.peopleFolder
        );
        attachMediaPasteHandler(
            this.app,
            this.textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );

        this.scope.register([], 'Escape', (e) => {
            e.preventDefault();
            this.tryClose();
            return false;
        });

        this.syncHeight();
        this.onInput();
        setTimeout(() => this.textarea.focus(), 50);
    }

    onClose() {
        this.contentEl.empty();
    }

    private syncHeight() {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = `${Math.max(this.textarea.scrollHeight, 180)}px`;
    }

    private onInput() {
        this.syncHeight();
        const hasText = this.textarea.value.trim().length > 0;
        this.dirty = hasText || this.contexts.length > 0;
        this.postBtn.disabled = !hasText;
    }

    private addChip(tag: string) {
        if (this.contexts.includes(tag)) return;
        this.contexts.push(tag);
        const chip = this.chipRow.createEl('span', { cls: 'diwa-mobile-post-chip', text: `#${tag}` });
        chip.addEventListener('click', () => {
            this.contexts = this.contexts.filter(c => c !== tag);
            chip.remove();
            this.onInput();
        });
        this.dirty = true;
    }

    private async save() {
        const text = this.textarea.value.trim();
        if (!text) return;
        try {
            await this.plugin.vault.createThoughtFile(text, this.contexts);
            new Notice('✦ Thought saved', 1200);
            this.close();
        } catch {
            new Notice('Error saving thought — please try again', 2500);
        }
    }

    private tryClose() {
        if (this.dirty) {
            new ConfirmModal(this.app, 'Discard this post?', () => this.close()).open();
            return;
        }
        this.close();
    }
}

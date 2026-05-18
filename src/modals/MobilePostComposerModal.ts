import { App, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { ConfirmModal } from './ConfirmModal';

export class MobilePostComposerModal extends Modal {
    private plugin: DiwaPlugin;
    private textarea!: HTMLTextAreaElement;
    private postBtn!: HTMLButtonElement;
    private chipsEl!: HTMLElement;
    private contextButton!: HTMLButtonElement;
    private topicButton!: HTMLButtonElement;
    private contextPickerEl!: HTMLElement;
    private topicPickerEl!: HTMLElement;
    private contextSearch!: HTMLInputElement;
    private topicSearch!: HTMLInputElement;
    private topicInput!: HTMLInputElement;
    private contexts: string[] = [];
    private topic: string = '';
    private dirty = false;
    private contextPickerOpen = false;
    private topicPickerOpen = false;

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

        header.createEl('div', { cls: 'diwa-mobile-post-title', text: 'Create DIWA' });

        this.postBtn = header.createEl('button', { cls: 'diwa-mobile-post-post', text: 'Save' }) as HTMLButtonElement;
        this.postBtn.disabled = true;
        this.postBtn.addEventListener('click', () => this.save());

        const body = contentEl.createEl('div', { cls: 'diwa-mobile-post-body' });

        const selectors = body.createEl('div', { cls: 'diwa-mobile-post-selectors' });
        this.contextButton = selectors.createEl('button', {
            cls: 'diwa-mobile-post-selector',
            type: 'button',
            attr: { 'aria-label': 'Select context' }
        });
        const contextMain = this.contextButton.createEl('div', { cls: 'diwa-mobile-post-selector-main' });
        contextMain.createEl('div', { cls: 'diwa-mobile-post-selector-label', text: 'Context' });
        contextMain.createEl('div', { cls: 'diwa-mobile-post-selector-summary' });
        const contextChevron = this.contextButton.createEl('div', { cls: 'diwa-mobile-post-selector-chevron' });
        setIcon(contextChevron, 'chevron-down');
        this.contextButton.addEventListener('click', () => this.toggleContextPicker());

        this.topicButton = selectors.createEl('button', {
            cls: 'diwa-mobile-post-selector',
            type: 'button',
            attr: { 'aria-label': 'Select topic' }
        });
        const topicMain = this.topicButton.createEl('div', { cls: 'diwa-mobile-post-selector-main' });
        topicMain.createEl('div', { cls: 'diwa-mobile-post-selector-label', text: 'Topic' });
        topicMain.createEl('div', { cls: 'diwa-mobile-post-selector-summary' });
        const topicChevron = this.topicButton.createEl('div', { cls: 'diwa-mobile-post-selector-chevron' });
        setIcon(topicChevron, 'chevron-down');
        this.topicButton.addEventListener('click', () => this.toggleTopicPicker());

        this.chipsEl = body.createEl('div', { cls: 'diwa-mobile-post-chip-row' });
        this.contextPickerEl = body.createEl('div', { cls: 'diwa-mobile-post-picker is-hidden' });
        this.topicPickerEl = body.createEl('div', { cls: 'diwa-mobile-post-picker is-hidden' });

        const composer = body.createEl('div', { cls: 'diwa-mobile-post-capture' });
        this.textarea = composer.createEl('textarea', {
            cls: 'diwa-mobile-post-textarea',
            attr: { placeholder: "What's on your mind?", rows: '1' }
        }) as HTMLTextAreaElement;

        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keyup', () => this.syncHeight());
        this.textarea.addEventListener('focus', () => this.onInput());

        attachInlineTriggers(
            this.app,
            this.textarea,
            () => {},
            (tag: string) => this.addContext(tag),
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
            if (this.contextPickerOpen || this.topicPickerOpen) {
                this.closePickers();
                return false;
            }
            this.tryClose();
            return false;
        });

        this.renderSelection();
        this.renderContextPicker();
        this.renderTopicPicker();
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

    private renderSelection() {
        const parts: string[] = [];
        if (this.contexts.length > 0) parts.push(this.contexts.map(c => `#${c}`).join(', '));
        if (this.topic.trim()) parts.push(this.topic.trim());
        this.contextButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.contexts.length > 0 ? this.contexts.map(c => `#${c}`).join(', ') : 'Choose context'
        );
        this.topicButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.topic.trim() || 'Add topic'
        );
        this.refreshChips();
        this.markDirty();
    }

    private refreshChips() {
        this.chipsEl.empty();
        for (const ctx of this.contexts) {
            const chip = this.chipsEl.createEl('span', { cls: 'diwa-mobile-post-chip', text: `#${ctx}` });
            chip.addEventListener('click', () => {
                this.contexts = this.contexts.filter(c => c !== ctx);
                this.renderSelection();
                this.renderContextPicker();
                this.renderTopicPicker();
            });
        }
        if (this.topic.trim()) {
            const chip = this.chipsEl.createEl('span', { cls: 'diwa-mobile-post-chip is-topic', text: this.topic.trim() });
            chip.addEventListener('click', () => {
                this.topic = '';
                this.renderSelection();
                this.renderTopicPicker();
            });
        }
    }

    private renderContextPicker() {
        this.contextPickerEl.empty();
        this.contextPickerEl.toggleClass('is-hidden', !this.contextPickerOpen);
        if (!this.contextPickerOpen) return;

        const contextsSection = this.contextPickerEl.createEl('div', { cls: 'diwa-mobile-post-picker-section' });
        contextsSection.createEl('div', { cls: 'diwa-mobile-post-picker-label', text: 'Context' });
        this.contextSearch = contextsSection.createEl('input', {
            cls: 'diwa-mobile-post-picker-search',
            type: 'text',
            attr: { placeholder: 'Search or create context', spellcheck: 'false' }
        }) as HTMLInputElement;
        const contextList = contextsSection.createEl('div', { cls: 'diwa-mobile-post-picker-list' });
        const query = this.contextSearch.value.toLowerCase().trim();
        const redrawContexts = () => {
            contextList.empty();
            const q = this.contextSearch.value.toLowerCase().trim();
            const filtered = (this.plugin.settings.contexts ?? [])
                .filter(c => !q || c.toLowerCase().includes(q))
                .sort((a, b) => a.localeCompare(b));
            for (const ctx of filtered) {
                const pill = contextList.createEl('button', {
                    cls: `diwa-mobile-post-picker-pill${this.contexts.includes(ctx) ? ' is-active' : ''}`,
                    text: `#${ctx}`,
                    type: 'button'
                });
                pill.addEventListener('click', () => {
                    if (this.contexts.includes(ctx)) {
                        this.contexts = this.contexts.filter(c => c !== ctx);
                    } else {
                        this.contexts.push(ctx);
                    }
                    this.renderSelection();
                    redrawContexts();
                });
            }
            const createCtx = this.contextSearch.value.trim();
            if (createCtx && !(this.plugin.settings.contexts ?? []).some(c => c.toLowerCase() === createCtx.toLowerCase())) {
                const createBtn = contextList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-create',
                    type: 'button',
                    text: `+ Add "${createCtx}"`
                });
                createBtn.addEventListener('click', () => {
                    this.contexts.push(createCtx);
                    this.renderSelection();
                    redrawContexts();
                });
            }
        };

        this.contextSearch.addEventListener('input', () => redrawContexts());
        redrawContexts();
        setTimeout(() => this.contextSearch.focus(), 50);
    }

    private renderTopicPicker() {
        this.topicPickerEl.empty();
        this.topicPickerEl.toggleClass('is-hidden', !this.topicPickerOpen);
        if (!this.topicPickerOpen) return;

        const topicSection = this.topicPickerEl.createEl('div', { cls: 'diwa-mobile-post-picker-section' });
        topicSection.createEl('div', { cls: 'diwa-mobile-post-picker-label', text: 'Topic' });
        this.topicInput = topicSection.createEl('input', {
            cls: 'diwa-mobile-post-picker-topic',
            type: 'text',
            attr: { placeholder: 'Add topic (optional)', spellcheck: 'false' }
        }) as HTMLInputElement;
        this.topicInput.value = this.topic;
        this.topicInput.addEventListener('input', () => {
            this.topic = this.topicInput.value.trim();
            this.renderSelection();
        });

        const topicSuggestions = topicSection.createEl('div', { cls: 'diwa-mobile-post-picker-suggestions' });
        const existingTopics = this.plugin.index.getExistingTopics()
            .filter(t => !this.topicInput.value.trim() || t.toLowerCase().includes(this.topicInput.value.trim().toLowerCase()))
            .slice(0, 8);
        for (const topic of existingTopics) {
            const pill = topicSuggestions.createEl('button', {
                cls: 'diwa-mobile-post-picker-pill',
                text: topic,
                type: 'button'
            });
            pill.addEventListener('click', () => {
                this.topic = topic;
                this.topicInput.value = topic;
                this.renderSelection();
            });
        }

        const actions = this.topicPickerEl.createEl('div', { cls: 'diwa-mobile-post-picker-actions' });
        const doneBtn = actions.createEl('button', { cls: 'diwa-mobile-post-picker-done', text: 'Done', type: 'button' });
        doneBtn.addEventListener('click', () => this.closePickers());
        setTimeout(() => this.topicInput.focus(), 50);
    }

    private toggleContextPicker() {
        this.contextPickerOpen = !this.contextPickerOpen;
        this.topicPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        if (this.contextPickerOpen) this.textarea.blur();
    }

    private toggleTopicPicker() {
        this.topicPickerOpen = !this.topicPickerOpen;
        this.contextPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        if (this.topicPickerOpen) this.textarea.blur();
    }

    private closePickers() {
        this.contextPickerOpen = false;
        this.topicPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        this.textarea.focus();
    }

    private onInput() {
        this.syncHeight();
        this.markDirty();
    }

    private markDirty() {
        const hasText = this.textarea.value.trim().length > 0;
        this.dirty = hasText || this.contexts.length > 0 || !!this.topic.trim();
        this.postBtn.disabled = !hasText;
    }

    private addContext(tag: string) {
        if (this.contexts.includes(tag)) return;
        this.contexts.push(tag);
        this.renderSelection();
        this.renderContextPicker();
        this.renderTopicPicker();
    }

    private async save() {
        const text = this.textarea.value.trim();
        if (!text) return;
        try {
            await this.plugin.vault.createThoughtFile(text, this.contexts, undefined, this.topic.trim() || undefined);
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

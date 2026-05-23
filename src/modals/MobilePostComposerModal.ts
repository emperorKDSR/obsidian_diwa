import { App, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { ConfirmModal } from './ConfirmModal';

interface MobilePostComposerOptions {
    editFilePath?: string;
    text?: string;
    contexts?: string[];
    topic?: string;
}

export class MobilePostComposerModal extends Modal {
    private plugin: DiwaPlugin;
    private options: MobilePostComposerOptions;
    private textarea!: HTMLTextAreaElement;
    private postBtn!: HTMLButtonElement;
    private chipsEl!: HTMLElement;
    private contextButton!: HTMLButtonElement;
    private topicButton!: HTMLButtonElement;
    private contextPickerEl!: HTMLElement;
    private topicPickerEl!: HTMLElement;
    private contextSearch!: HTMLInputElement;
    private topicSearch!: HTMLInputElement;
    private contexts: string[] = [];
    private topic: string = '';
    private dirty = false;
    private contextPickerOpen = false;
    private topicPickerOpen = false;

    constructor(app: App, plugin: DiwaPlugin, options: MobilePostComposerOptions = {}) {
        super(app);
        this.plugin = plugin;
        this.options = options;
        this.contexts = [...(options.contexts ?? [])];
        this.topic = options.topic?.trim() ?? '';
    }

    onOpen() {
        this.modalEl.addClass('diwa-mobile-post');

        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createEl('div', { cls: 'diwa-mobile-post-header' });
        const cancelBtn = header.createEl('button', { cls: 'diwa-mobile-post-cancel', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.tryClose());

        const isEditMode = !!this.options.editFilePath;
        header.createEl('div', { cls: 'diwa-mobile-post-title', text: isEditMode ? 'Edit DIWA' : 'Create DIWA' });

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
        if (this.options.text) this.textarea.value = this.options.text;

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
        this.contextButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.contexts[0] ? this.contexts[0].toUpperCase() : 'CONTEXT'
        );
        this.topicButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.topic ? this.topic.toUpperCase() : 'TOPIC'
        );
        this.refreshChips();
        this.markDirty();
    }

    private refreshChips() {
        this.chipsEl.empty();
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
                    text: ctx.toUpperCase(),
                    type: 'button'
                });
                pill.addEventListener('click', () => {
                    this.contexts = [ctx];
                    this.renderSelection();
                    this.closePickers();
                });
            }
            const createCtx = this.contextSearch.value.trim();
            if (createCtx && !(this.plugin.settings.contexts ?? []).some(c => c.toLowerCase() === createCtx.toLowerCase())) {
                const createBtn = contextList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-create',
                    type: 'button',
                    text: `    + Add "${createCtx.toUpperCase()}"`
                });
                createBtn.addEventListener('click', () => {
                    this.contexts = [createCtx];
                    this.renderSelection();
                    this.closePickers();
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
        this.topicSearch = topicSection.createEl('input', {
            cls: 'diwa-mobile-post-picker-search',
            type: 'text',
            attr: { placeholder: 'Search or create topic', spellcheck: 'false' }
        }) as HTMLInputElement;
        this.topicSearch.value = this.topic;

        const topicList = topicSection.createEl('div', { cls: 'diwa-mobile-post-picker-list' });
        const redrawTopics = () => {
            topicList.empty();
            const q = this.topicSearch.value.toLowerCase().trim();
            const filtered = this.plugin.index.getExistingTopics()
                .filter(t => !q || t.toLowerCase().includes(q))
                .sort((a, b) => a.localeCompare(b));
            for (const topic of filtered) {
                const pill = topicList.createEl('button', {
                    cls: `diwa-mobile-post-picker-pill${this.topic === topic ? ' is-active' : ''}`,
                    text: topic.toUpperCase(),
                    type: 'button'
                });
                pill.addEventListener('click', () => {
                    this.topic = topic;
                    this.renderSelection();
                    this.closePickers();
                });
            }
            const createTopic = this.topicSearch.value.trim();
            if (createTopic && !this.plugin.index.getExistingTopics().some(t => t.toLowerCase() === createTopic.toLowerCase())) {
                const createBtn = topicList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-create',
                    type: 'button',
                    text: `+ Add "${createTopic.toUpperCase()}"`
                });
                createBtn.addEventListener('click', () => {
                    this.topic = createTopic;
                    this.renderSelection();
                    this.closePickers();
                });
            }
        };

        this.topicSearch.addEventListener('input', () => {
            this.topic = this.topicSearch.value.trim();
            this.renderSelection();
            redrawTopics();
        });
        redrawTopics();
        setTimeout(() => this.topicSearch.focus(), 50);
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
        this.contexts = [tag];
        this.renderSelection();
        this.closePickers();
    }

    private async save() {
        const text = this.textarea.value.trim();
        if (!text) return;
        try {
            if (this.options.editFilePath) {
                await this.plugin.vault.editThought(this.options.editFilePath, text, this.contexts, this.topic.trim() || undefined);
                new Notice('✦ Thought updated', 1200);
            } else {
                await this.plugin.vault.createThoughtFile(text, this.contexts, undefined, this.topic.trim() || undefined);
                new Notice('✦ Thought saved', 1200);
            }
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

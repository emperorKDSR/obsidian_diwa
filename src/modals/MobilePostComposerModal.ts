import { App, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { attachMobileSheetViewportBehavior } from '../utils/mobileSheetViewport';
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
    private errorEl!: HTMLElement;
    private contextButton!: HTMLButtonElement;
    private topicButton!: HTMLButtonElement;
    private contextPickerEl!: HTMLElement;
    private topicPickerEl!: HTMLElement;
    private contextSearch!: HTMLInputElement;
    private topicSearch!: HTMLInputElement;
    private contexts: string[] = [];
    private topic: string = '';
    private topicDraft = '';
    private dirty = false;
    private saving = false;
    private focusTimer: number | null = null;
    private initialSnapshot = '';
    private contextPickerOpen = false;
    private topicPickerOpen = false;
    private viewportCleanup: (() => void) | null = null;

    constructor(app: App, plugin: DiwaPlugin, options: MobilePostComposerOptions = {}) {
        super(app);
        this.plugin = plugin;
        this.options = options;
        this.contexts = this.normalizeContexts(options.contexts ?? []);
        this.topic = options.topic?.trim() ?? '';
        this.topicDraft = this.topic;
        this.initialSnapshot = this.buildSnapshot(options.text ?? '', this.contexts, this.topic);
    }

    onOpen() {
        this.modalEl.addClass('diwa-mobile-post');

        const { contentEl } = this;
        contentEl.empty();

        const sheet = contentEl.createEl('div', { cls: 'diwa-mobile-post-sheet' });
        sheet.createEl('div', { cls: 'diwa-mobile-post-handle' });

        const header = sheet.createEl('div', { cls: 'diwa-mobile-post-header' });
        const cancelBtn = header.createEl('button', { cls: 'diwa-mobile-post-cancel', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.tryClose());

        const isEditMode = !!this.options.editFilePath;
        const headerCopy = header.createEl('div', { cls: 'diwa-mobile-post-header-copy' });
        headerCopy.createEl('div', {
            cls: 'diwa-mobile-post-kicker',
            text: isEditMode ? 'Edit capture' : 'Quick capture',
        });
        headerCopy.createEl('div', { cls: 'diwa-mobile-post-title', text: 'DIWA' });

        const body = sheet.createEl('div', { cls: 'diwa-mobile-post-body' });

        const composer = body.createEl('section', { cls: 'diwa-mobile-post-capture' });
        composer.createEl('div', {
            cls: 'diwa-mobile-post-capture-label',
            text: 'Write first',
        });
        this.textarea = composer.createEl('textarea', {
            cls: 'diwa-mobile-post-textarea',
            attr: { placeholder: "What's on your mind?", rows: '1' }
        }) as HTMLTextAreaElement;
        if (this.options.text) this.textarea.value = this.options.text;

        const meta = body.createEl('section', { cls: 'diwa-mobile-post-meta' });
        meta.createEl('div', {
            cls: 'diwa-mobile-post-meta-label',
            text: 'Context & topic',
        });

        const selectors = meta.createEl('div', { cls: 'diwa-mobile-post-selectors' });
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

        this.chipsEl = meta.createEl('div', { cls: 'diwa-mobile-post-chip-row' });
        this.errorEl = meta.createEl('div', { cls: 'diwa-mobile-post-error is-hidden' });
        this.contextPickerEl = meta.createEl('div', { cls: 'diwa-mobile-post-picker is-hidden' });
        this.topicPickerEl = meta.createEl('div', { cls: 'diwa-mobile-post-picker is-hidden' });

        const footer = sheet.createEl('div', { cls: 'diwa-mobile-post-footer' });
        const footerCopy = footer.createEl('div', { cls: 'diwa-mobile-post-footer-copy' });
        footerCopy.createEl('div', {
            cls: 'diwa-mobile-post-footer-label',
            text: 'Paste media or type # to tag as you write.',
        });
        footerCopy.createEl('div', {
            cls: 'diwa-mobile-post-footer-hint',
            text: 'The save button stays here for one-thumb capture.',
        });
        this.postBtn = footer.createEl('button', {
            cls: 'diwa-mobile-post-post',
            text: isEditMode ? 'Save changes' : 'Save to DIWA',
        }) as HTMLButtonElement;
        this.postBtn.addEventListener('click', () => this.save());

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
        this.refreshComposerState();
        this.viewportCleanup = attachMobileSheetViewportBehavior({
            sheetEl: sheet,
            scrollEl: body,
        });
        this.scheduleFocus(() => this.textarea);
    }

    onClose() {
        this.clearFocusTimer();
        this.viewportCleanup?.();
        this.viewportCleanup = null;
        this.contentEl.empty();
    }

    private syncHeight() {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = `${Math.max(this.textarea.scrollHeight, 180)}px`;
    }

    private renderSelection() {
        this.contextButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.contexts.length === 0
                ? 'Choose a context'
                : this.contexts.length === 1
                    ? `#${this.contexts[0]}`
                    : `${this.contexts.length} contexts`
        );
        this.topicButton.querySelector<HTMLElement>('.diwa-mobile-post-selector-summary')!.setText(
            this.topic ? this.topic : 'Choose a topic'
        );
        this.contextButton.toggleClass('is-selected', this.contexts.length > 0);
        this.contextButton.toggleClass('is-open', this.contextPickerOpen);
        this.topicButton.toggleClass('is-selected', !!this.topic);
        this.topicButton.toggleClass('is-open', this.topicPickerOpen);
        this.refreshChips();
        this.refreshComposerState();
    }

    private refreshChips() {
        this.chipsEl.empty();
        if (this.contexts.length === 0 && !this.topic) {
            this.chipsEl.createEl('span', {
                cls: 'diwa-mobile-post-chip-hint',
                text: 'No context or topic yet.',
            });
            return;
        }

        this.contexts.forEach((ctx) => {
            const chip = this.chipsEl.createEl('button', {
                cls: 'diwa-mobile-post-chip',
                type: 'button',
                attr: { 'aria-label': `Remove context ${ctx}` },
            });
            chip.createEl('span', { text: `#${ctx}` });
            const remove = chip.createEl('span', { cls: 'diwa-mobile-post-chip-remove', text: '×' });
            remove.setAttribute('aria-hidden', 'true');
            chip.addEventListener('click', () => {
                this.contexts = this.contexts.filter((value) => value !== ctx);
                this.renderSelection();
            });
        });

        if (this.topic) {
            const topicChip = this.chipsEl.createEl('button', {
                cls: 'diwa-mobile-post-chip is-topic',
                type: 'button',
                attr: { 'aria-label': `Remove topic ${this.topic}` },
            });
            topicChip.createEl('span', { text: this.topic });
            const remove = topicChip.createEl('span', { cls: 'diwa-mobile-post-chip-remove', text: '×' });
            remove.setAttribute('aria-hidden', 'true');
            topicChip.addEventListener('click', () => {
                this.topic = '';
                this.topicDraft = '';
                this.renderSelection();
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
            if (this.contexts.length) {
                const clearBtn = contextList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-clear',
                    type: 'button',
                    text: 'Clear context',
                });
                clearBtn.addEventListener('click', () => {
                    this.contexts = [];
                    this.renderSelection();
                    this.closePickers();
                });
            }
            for (const ctx of filtered) {
                const pill = contextList.createEl('button', {
                    cls: `diwa-mobile-post-picker-pill${this.contexts.includes(ctx) ? ' is-active' : ''}`,
                    text: `#${ctx}`,
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
                    text: `Add #${createCtx}`
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
        this.scheduleFocus(() => this.contextSearch);
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
        this.topicSearch.value = this.topicDraft;

        const topicList = topicSection.createEl('div', { cls: 'diwa-mobile-post-picker-list' });
        const redrawTopics = () => {
            topicList.empty();
            const q = this.topicSearch.value.toLowerCase().trim();
            if (this.topic) {
                const clearBtn = topicList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-clear',
                    type: 'button',
                    text: 'Clear topic',
                });
                clearBtn.addEventListener('click', () => {
                    this.topic = '';
                    this.topicDraft = '';
                    this.renderSelection();
                    this.closePickers();
                });
            }
            const filtered = this.plugin.index.getExistingTopics()
                .filter(t => !q || t.toLowerCase().includes(q))
                .sort((a, b) => a.localeCompare(b));
            for (const topic of filtered) {
                const pill = topicList.createEl('button', {
                    cls: `diwa-mobile-post-picker-pill${this.topic === topic ? ' is-active' : ''}`,
                    text: topic,
                    type: 'button'
                });
                pill.addEventListener('click', () => {
                    this.topic = topic;
                    this.topicDraft = topic;
                    this.renderSelection();
                    this.closePickers();
                });
            }
            const createTopic = this.topicSearch.value.trim();
            if (createTopic && !this.plugin.index.getExistingTopics().some(t => t.toLowerCase() === createTopic.toLowerCase())) {
                const createBtn = topicList.createEl('button', {
                    cls: 'diwa-mobile-post-picker-create',
                    type: 'button',
                    text: `Add "${createTopic}"`
                });
                createBtn.addEventListener('click', () => {
                    this.topic = createTopic;
                    this.topicDraft = createTopic;
                    this.renderSelection();
                    this.closePickers();
                });
            }
        };

        this.topicSearch.addEventListener('input', () => {
            this.topicDraft = this.topicSearch.value.trim();
            redrawTopics();
        });
        redrawTopics();
        this.scheduleFocus(() => this.topicSearch);
    }

    private toggleContextPicker() {
        if (this.saving) return;
        if (this.topicPickerOpen) this.topicDraft = this.topic;
        this.contextPickerOpen = !this.contextPickerOpen;
        this.topicPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        this.renderSelection();
        if (this.contextPickerOpen) this.textarea.blur();
    }

    private toggleTopicPicker() {
        if (this.saving) return;
        this.topicDraft = this.topic;
        this.topicPickerOpen = !this.topicPickerOpen;
        this.contextPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        this.renderSelection();
        if (this.topicPickerOpen) this.textarea.blur();
    }

    private closePickers() {
        if (this.topicPickerOpen) this.topicDraft = this.topic;
        this.contextPickerOpen = false;
        this.topicPickerOpen = false;
        this.renderContextPicker();
        this.renderTopicPicker();
        this.renderSelection();
        this.scheduleFocus(() => this.textarea);
    }

    private onInput() {
        this.syncHeight();
        this.setError();
        this.refreshComposerState();
    }

    private addContext(tag: string) {
        this.contexts = this.normalizeContexts([tag]);
        this.setError();
        this.renderSelection();
        this.closePickers();
    }

    private async save() {
        const text = this.textarea.value.trim();
        if (!text || this.saving) return;
        this.saving = true;
        this.setError();
        this.refreshComposerState();
        try {
            if (this.options.editFilePath) {
                const updated = await this.plugin.getThoughtController().updateThought({
                    filePath: this.options.editFilePath,
                    content: text,
                    context: this.contexts,
                    topic: this.topic.trim() || undefined,
                });
                if (!updated) throw new Error('Thought update failed');
            } else {
                const created = await this.plugin.getThoughtController().addThought({
                    content: text,
                    context: this.contexts,
                    topic: this.topic.trim() || undefined,
                });
                if (!created) throw new Error('Thought creation failed');
            }
            this.close();
        } catch (error) {
            console.error('[DIWA MobilePostComposerModal] save failed', error);
            const message = this.options.editFilePath
                ? 'Failed to save DIWA changes.'
                : 'Failed to save DIWA capture.';
            this.setError(message);
            new Notice(message);
        } finally {
            this.saving = false;
            this.refreshComposerState();
        }
    }

    private tryClose() {
        if (this.saving) return;
        if (this.dirty) {
            new ConfirmModal(this.app, 'Discard this post?', () => this.close()).open();
            return;
        }
        this.close();
    }

    private refreshComposerState() {
        const hasText = this.textarea.value.trim().length > 0;
        this.dirty = this.buildSnapshot(this.textarea.value, this.contexts, this.topic) !== this.initialSnapshot;
        this.postBtn.disabled = !hasText || this.saving;
        this.postBtn.setText(this.saving
            ? 'Saving...'
            : (this.options.editFilePath ? 'Save changes' : 'Save to DIWA'));
    }

    private setError(message = ''): void {
        if (!this.errorEl) return;
        this.errorEl.setText(message);
        this.errorEl.toggleClass('is-hidden', !message);
    }

    private buildSnapshot(text: string, contexts: string[], topic: string): string {
        return JSON.stringify({
            text: text.trim(),
            contexts: this.normalizeContexts(contexts).sort(),
            topic: topic.trim(),
        });
    }

    private normalizeContexts(values: string[]): string[] {
        return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    }

    private scheduleFocus(getElement: () => HTMLInputElement | HTMLTextAreaElement | null): void {
        this.clearFocusTimer();
        this.focusTimer = window.setTimeout(() => {
            const element = getElement();
            if (!this.modalEl.isConnected || !element?.isConnected) return;
            element.focus();
        }, 50);
    }

    private clearFocusTimer(): void {
        if (this.focusTimer === null) return;
        window.clearTimeout(this.focusTimer);
        this.focusTimer = null;
    }
}

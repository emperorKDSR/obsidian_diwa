import { App, FuzzySuggestModal, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskEntry, ThoughtEntry } from '../types';
import { attachInlineTriggers, attachMediaPasteHandler, isTablet } from '../utils';
import { ConfirmModal } from './ConfirmModal';
import { ContextSuggestModal } from './ContextSuggestModal';
import { ThoughtPickerModal } from './ThoughtPickerModal';

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

function uniqueValues(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sameSets(left: Set<string>, right: Set<string>): boolean {
    if (left.size !== right.size) return false;
    for (const value of left) {
        if (!right.has(value)) return false;
    }
    return true;
}

class TaskPickerModal extends FuzzySuggestModal<TaskEntry> {
    private readonly tasks: TaskEntry[];
    private readonly onChoose: (task: TaskEntry) => void;

    constructor(app: App, tasks: TaskEntry[], onChoose: (task: TaskEntry) => void) {
        super(app);
        this.tasks = tasks
            .slice()
            .sort((left, right) => (right.lastUpdate ?? 0) - (left.lastUpdate ?? 0));
        this.onChoose = onChoose;
        this.setPlaceholder('Search tasks to link...');
    }

    getItems(): TaskEntry[] {
        return this.tasks;
    }

    getItemText(item: TaskEntry): string {
        return `${item.title} ${item.body}`.trim();
    }

    renderSuggestion(item: { item: TaskEntry; match: unknown }, el: HTMLElement): void {
        const title = (item.item.title || item.item.body || item.item.filePath).replace(/\s+/g, ' ').trim();
        const preview = title.length > 120 ? `${title.slice(0, 117)}...` : title;
        const metaParts = [
            item.item.status?.toUpperCase(),
            item.item.due || '',
            ...(item.item.context ?? []).slice(0, 2).map((context) => `#${context}`),
        ].filter(Boolean);

        el.createEl('div', { text: preview || item.item.filePath, cls: 'diwa-thought-picker-body' });
        if (metaParts.length > 0) {
            el.createEl('div', { text: metaParts.join(' · '), cls: 'diwa-thought-picker-date' });
        }
    }

    onChooseItem(item: TaskEntry, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

export class EditThoughtModal extends Modal {
    private readonly plugin: DiwaPlugin;
    private thought: ThoughtEntry;
    private body: string;
    private contexts: string[];
    private topic: string;

    private initialBody: string;
    private initialContexts: string[];
    private initialTopic: string;
    private initialLinkedThoughtRefs: Set<string>;
    private linkedThoughtRefs: Set<string>;
    private initialLinkedTaskRefs: Set<string>;
    private linkedTaskRefs: Set<string>;

    private textarea!: HTMLTextAreaElement;
    private topicInput!: HTMLInputElement;
    private saveBtn!: HTMLButtonElement;
    private wordCountEl!: HTMLElement;
    private contextsEl!: HTMLElement;
    private linkedThoughtsEl!: HTMLElement;
    private linkedTasksEl!: HTMLElement;
    private saving = false;

    constructor(app: App, plugin: DiwaPlugin, thought: ThoughtEntry) {
        super(app);
        this.plugin = plugin;
        this.thought = thought;
        this.body = (thought.body || thought.content || '').trim();
        this.contexts = uniqueValues(thought.context ?? []);
        this.topic = thought.topic?.trim() ?? '';

        this.initialBody = this.body;
        this.initialContexts = [...this.contexts];
        this.initialTopic = this.topic;

        const linkedThoughtRefs = this.resolveLinkedThoughtRefs(thought);
        const linkedTaskRefs = this.resolveLinkedTaskRefs(thought.filePath);
        this.initialLinkedThoughtRefs = new Set(linkedThoughtRefs);
        this.linkedThoughtRefs = new Set(linkedThoughtRefs);
        this.initialLinkedTaskRefs = new Set(linkedTaskRefs);
        this.linkedTaskRefs = new Set(linkedTaskRefs);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('diwa-thought-edit-modal');
        if (isTablet()) modalEl.addClass('is-tablet');
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');

        const titleId = `diwa-thought-edit-title-${Date.now()}`;
        modalEl.setAttribute('aria-labelledby', titleId);

        this.scope.register([], 'Escape', (event) => {
            event.preventDefault();
            this.tryClose();
            return false;
        });
        this.scope.register(['Mod'], 'Enter', (event) => {
            event.preventDefault();
            void this.save();
            return false;
        });

        const header = contentEl.createDiv({ cls: 'diwa-thought-edit-header' });
        const headerIdentity = header.createDiv({ cls: 'diwa-thought-edit-header-copy' });
        headerIdentity.createDiv({ cls: 'diwa-thought-edit-eyebrow', text: 'Workspace' });
        headerIdentity.createEl('h2', { cls: 'diwa-thought-edit-title', text: 'Edit Thought' }).id = titleId;
        headerIdentity.createDiv({
            cls: 'diwa-thought-edit-subtitle',
            text: 'Update content, context, topic, and linked items.',
        });

        const headerMeta = header.createDiv({ cls: 'diwa-thought-edit-header-meta' });
        this.wordCountEl = headerMeta.createDiv({
            cls: 'diwa-thought-edit-word-count',
            attr: { 'aria-live': 'polite' },
        });
        headerMeta.createDiv({ cls: 'diwa-thought-edit-kbd-hint', text: '⌘↵ Save' });

        const closeBtn = headerMeta.createEl('button', {
            cls: 'diwa-thought-edit-close',
            attr: { type: 'button', 'aria-label': 'Close' },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.tryClose());

        const body = contentEl.createDiv({ cls: 'diwa-thought-edit-body' });

        const editorPanel = this.createPanel(body, 'Thought', 'Edit the workspace thought body.');
        this.textarea = editorPanel.createEl('textarea', {
            cls: 'diwa-thought-edit-textarea',
            attr: {
                placeholder: "What's on your mind?",
                rows: '8',
                'aria-label': 'Thought body',
            },
        }) as HTMLTextAreaElement;
        this.textarea.value = this.body;
        this.textarea.addEventListener('input', () => {
            this.body = this.textarea.value;
            this.syncTextareaHeight();
            this.updateWordCount();
            this.refreshSaveState();
        });
        attachInlineTriggers(
            this.app,
            this.textarea,
            () => {},
            (tag: string) => this.addContext(tag),
            () => (this.plugin.settings.contexts ?? []).filter((ctx) => !this.hasContext(ctx)),
            this.plugin.settings.peopleFolder
        );
        attachMediaPasteHandler(
            this.app,
            this.textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );

        const metadataPanel = this.createPanel(body, 'Metadata', 'Keep the thought aligned with the current workspace.');
        const metadataGrid = metadataPanel.createDiv({ cls: 'diwa-thought-edit-meta-grid' });

        const contextBlock = metadataGrid.createDiv({ cls: 'diwa-thought-edit-meta-block' });
        const contextHeader = contextBlock.createDiv({ cls: 'diwa-thought-edit-section-head' });
        contextHeader.createDiv({ cls: 'diwa-thought-edit-section-label', text: 'Context' });
        const addContextBtn = this.createActionButton(contextHeader, 'plus', 'Add context');
        addContextBtn.addEventListener('click', () => this.openContextPicker());
        this.contextsEl = contextBlock.createDiv({ cls: 'diwa-thought-edit-chip-row' });
        contextBlock.createDiv({
            cls: 'diwa-thought-edit-supporting-text',
            text: 'Type # in the editor or add a context chip here.',
        });

        const topicBlock = metadataGrid.createDiv({ cls: 'diwa-thought-edit-meta-block' });
        const topicHeader = topicBlock.createDiv({ cls: 'diwa-thought-edit-section-head' });
        topicHeader.createDiv({ cls: 'diwa-thought-edit-section-label', text: 'Topic' });
        const clearTopicBtn = this.createActionButton(topicHeader, 'x', 'Clear topic');
        clearTopicBtn.addEventListener('click', () => {
            this.topic = '';
            this.topicInput.value = '';
            this.refreshSaveState();
        });

        const topicField = topicBlock.createDiv({ cls: 'diwa-thought-edit-topic-field' });
        this.topicInput = topicField.createEl('input', {
            cls: 'diwa-thought-edit-topic-input',
            attr: {
                type: 'text',
                placeholder: 'Add or refine topic',
                spellcheck: 'false',
            },
        }) as HTMLInputElement;
        this.topicInput.value = this.topic;
        const topicListId = `diwa-thought-edit-topic-list-${Math.abs(this.hash(this.thought.filePath))}`;
        this.topicInput.setAttribute('list', topicListId);
        this.topicInput.addEventListener('input', () => {
            this.topic = this.topicInput.value;
            this.refreshSaveState();
        });
        const topicList = topicField.createEl('datalist');
        topicList.id = topicListId;
        for (const topic of this.getAvailableTopics()) {
            topicList.createEl('option', { value: topic });
        }
        topicBlock.createDiv({
            cls: 'diwa-thought-edit-supporting-text',
            text: 'Topic stays single-value and updates with the thought.',
        });

        const linksGrid = body.createDiv({ cls: 'diwa-thought-edit-links-grid' });

        const thoughtsPanel = this.createPanel(linksGrid, 'Linked Thoughts', 'Connect adjacent thinking without leaving the workspace.');
        const thoughtsHeader = thoughtsPanel.createDiv({ cls: 'diwa-thought-edit-section-head' });
        thoughtsHeader.createDiv({ cls: 'diwa-thought-edit-section-label', text: 'Thought links' });
        const addThoughtBtn = this.createActionButton(thoughtsHeader, 'plus', 'Link thought');
        addThoughtBtn.addEventListener('click', () => this.openThoughtPicker());
        this.linkedThoughtsEl = thoughtsPanel.createDiv({ cls: 'diwa-thought-edit-link-list' });

        const tasksPanel = this.createPanel(linksGrid, 'Linked Tasks', 'Keep related execution attached to the thought.');
        const tasksHeader = tasksPanel.createDiv({ cls: 'diwa-thought-edit-section-head' });
        tasksHeader.createDiv({ cls: 'diwa-thought-edit-section-label', text: 'Task links' });
        const addTaskBtn = this.createActionButton(tasksHeader, 'plus', 'Link task');
        addTaskBtn.addEventListener('click', () => this.openTaskPicker());
        this.linkedTasksEl = tasksPanel.createDiv({ cls: 'diwa-thought-edit-link-list' });

        const footer = contentEl.createDiv({ cls: 'diwa-thought-edit-footer' });
        const footerHint = footer.createDiv({
            cls: 'diwa-thought-edit-footer-hint',
            text: 'Thought-only editor · linked tasks/thoughts save with the entry.',
        });
        footerHint.setAttribute('aria-hidden', 'true');

        const footerActions = footer.createDiv({ cls: 'diwa-thought-edit-footer-actions' });
        const cancelBtn = footerActions.createEl('button', {
            cls: 'diwa-thought-edit-btn diwa-thought-edit-btn--secondary',
            text: 'Cancel',
            attr: { type: 'button' },
        });
        cancelBtn.addEventListener('click', () => this.tryClose());

        this.saveBtn = footerActions.createEl('button', {
            cls: 'diwa-thought-edit-btn diwa-thought-edit-btn--primary',
            text: 'Save',
            attr: {
                type: 'button',
                'aria-keyshortcuts': 'Meta+Enter',
            },
        }) as HTMLButtonElement;
        this.saveBtn.addEventListener('click', () => void this.save());

        this.renderContexts();
        this.renderLinkedThoughts();
        this.renderLinkedTasks();
        this.syncTextareaHeight();
        this.updateWordCount();
        this.refreshSaveState();

        window.setTimeout(() => {
            this.textarea.focus();
            this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
        }, 40);
    }

    onClose(): void {
        this.modalEl.removeClass('diwa-thought-edit-modal', 'is-tablet');
        this.contentEl.empty();
    }

    private createPanel(parent: HTMLElement, eyebrow: string, subtitle: string): HTMLElement {
        const panel = parent.createDiv({ cls: 'diwa-thought-edit-panel' });
        const panelHeader = panel.createDiv({ cls: 'diwa-thought-edit-panel-header' });
        panelHeader.createDiv({ cls: 'diwa-thought-edit-eyebrow', text: eyebrow });
        panelHeader.createDiv({ cls: 'diwa-thought-edit-panel-subtitle', text: subtitle });
        return panel.createDiv({ cls: 'diwa-thought-edit-panel-body' });
    }

    private createActionButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'diwa-thought-edit-action',
            attr: {
                type: 'button',
                'aria-label': label,
                title: label,
            },
        }) as HTMLButtonElement;
        setIcon(button, icon);
        return button;
    }

    private openContextPicker(): void {
        new ContextSuggestModal(
            this.app,
            (this.plugin.settings.contexts ?? []).filter((ctx) => !this.hasContext(ctx)),
            (chosen: string) => this.addContext(chosen)
        ).open();
    }

    private addContext(context: string): void {
        const next = context.trim();
        if (!next || this.hasContext(next)) return;
        this.contexts = [...this.contexts, next];
        this.renderContexts();
        this.refreshSaveState();
    }

    private hasContext(context: string): boolean {
        return this.contexts.some((value) => value.toLowerCase() === context.trim().toLowerCase());
    }

    private renderContexts(): void {
        this.contextsEl.empty();
        if (this.contexts.length === 0) {
            this.contextsEl.createDiv({
                cls: 'diwa-thought-edit-empty',
                text: 'No context selected yet.',
            });
            return;
        }

        for (const context of this.contexts) {
            const chip = this.contextsEl.createDiv({ cls: 'diwa-thought-edit-chip' });
            chip.createSpan({ cls: 'diwa-thought-edit-chip-label', text: `#${context}` });
            const removeBtn = chip.createEl('button', {
                cls: 'diwa-thought-edit-chip-remove',
                attr: {
                    type: 'button',
                    'aria-label': `Remove ${context}`,
                },
            });
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', () => {
                this.contexts = this.contexts.filter((value) => value !== context);
                this.renderContexts();
                this.refreshSaveState();
            });
        }
    }

    private renderLinkedThoughts(): void {
        this.linkedThoughtsEl.empty();
        const thoughts = this.getLinkedThoughtEntries();
        if (thoughts.length === 0) {
            this.linkedThoughtsEl.createDiv({
                cls: 'diwa-thought-edit-empty',
                text: 'No linked thoughts yet.',
            });
            return;
        }

        for (const linkedThought of thoughts) {
            const card = this.linkedThoughtsEl.createDiv({ cls: 'diwa-thought-edit-link-card' });
            const body = card.createDiv({ cls: 'diwa-thought-edit-link-copy' });
            body.createDiv({
                cls: 'diwa-thought-edit-link-title',
                text: this.thoughtSnippet(linkedThought),
            });

            const meta = [
                linkedThought.topic?.trim(),
                ...(linkedThought.context ?? []).slice(0, 2).map((context) => `#${context}`),
            ].filter(Boolean) as string[];
            if (meta.length > 0) {
                const metaRow = body.createDiv({ cls: 'diwa-thought-edit-meta-row' });
                for (const value of meta) {
                    metaRow.createSpan({ cls: 'diwa-thought-edit-meta-pill', text: value });
                }
            }

            const removeBtn = card.createEl('button', {
                cls: 'diwa-thought-edit-remove',
                attr: {
                    type: 'button',
                    'aria-label': `Remove linked thought ${this.thoughtSnippet(linkedThought)}`,
                },
            });
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', () => {
                const next = new Set(this.linkedThoughtRefs);
                next.delete(linkedThought.filePath);
                this.linkedThoughtRefs = next;
                this.renderLinkedThoughts();
                this.refreshSaveState();
            });
        }
    }

    private renderLinkedTasks(): void {
        this.linkedTasksEl.empty();
        const tasks = this.getLinkedTaskEntries();
        if (tasks.length === 0) {
            this.linkedTasksEl.createDiv({
                cls: 'diwa-thought-edit-empty',
                text: 'No linked tasks yet.',
            });
            return;
        }

        for (const task of tasks) {
            const card = this.linkedTasksEl.createDiv({ cls: 'diwa-thought-edit-link-card' });
            const body = card.createDiv({ cls: 'diwa-thought-edit-link-copy' });
            body.createDiv({
                cls: 'diwa-thought-edit-link-title',
                text: this.taskSnippet(task),
            });

            const meta = [
                task.status?.toUpperCase(),
                task.due || '',
                ...(task.context ?? []).slice(0, 2).map((context) => `#${context}`),
            ].filter(Boolean) as string[];
            if (meta.length > 0) {
                const metaRow = body.createDiv({ cls: 'diwa-thought-edit-meta-row' });
                for (const value of meta) {
                    metaRow.createSpan({ cls: 'diwa-thought-edit-meta-pill', text: value });
                }
            }

            const removeBtn = card.createEl('button', {
                cls: 'diwa-thought-edit-remove',
                attr: {
                    type: 'button',
                    'aria-label': `Remove linked task ${this.taskSnippet(task)}`,
                },
            });
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', () => {
                const next = new Set(this.linkedTaskRefs);
                next.delete(getTaskKey(task));
                this.linkedTaskRefs = next;
                this.renderLinkedTasks();
                this.refreshSaveState();
            });
        }
    }

    private openThoughtPicker(): void {
        const availableThoughts = new Map(
            Array.from(this.plugin.index.thoughtIndex.entries()).filter(([, entry]) => {
                if (entry.archived) return false;
                if (entry.filePath === this.thought.filePath) return false;
                return !this.linkedThoughtRefs.has(entry.filePath);
            })
        );

        if (availableThoughts.size === 0) {
            new Notice('No more thoughts available to link.');
            return;
        }

        new ThoughtPickerModal(
            this.app,
            availableThoughts,
            this.plugin.settings.thoughtsFolder,
            (entry: ThoughtEntry) => {
                if (entry.filePath === this.thought.filePath || this.linkedThoughtRefs.has(entry.filePath)) return;
                const next = new Set(this.linkedThoughtRefs);
                next.add(entry.filePath);
                this.linkedThoughtRefs = next;
                this.renderLinkedThoughts();
                this.refreshSaveState();
            }
        ).open();
    }

    private openTaskPicker(): void {
        const availableTasks = this.plugin.getTaskController()
            .getAllTasks()
            .filter((task) => !this.linkedTaskRefs.has(getTaskKey(task)));

        if (availableTasks.length === 0) {
            new Notice('No more tasks available to link.');
            return;
        }

        new TaskPickerModal(this.app, availableTasks, (task: TaskEntry) => {
            const next = new Set(this.linkedTaskRefs);
            next.add(getTaskKey(task));
            this.linkedTaskRefs = next;
            this.renderLinkedTasks();
            this.refreshSaveState();
        }).open();
    }

    private async save(): Promise<void> {
        const nextBody = this.body.trim();
        if (!nextBody || this.saving) return;

        this.saving = true;
        this.refreshSaveState();

        try {
            const thoughtController = this.plugin.getThoughtController();
            const taskController = this.plugin.getTaskController();

            const updatedThought = await thoughtController.updateThought({
                filePath: this.thought.filePath,
                content: nextBody,
                context: uniqueValues(this.contexts),
                topic: this.topic.trim() || undefined,
            });
            if (!updatedThought) throw new Error('Thought update failed');
            const sourceThoughtRef = updatedThought.filePath;

            const thoughtRemovals = Array.from(this.initialLinkedThoughtRefs).filter((ref) => !this.linkedThoughtRefs.has(ref));
            const thoughtAdds = Array.from(this.linkedThoughtRefs).filter((ref) => !this.initialLinkedThoughtRefs.has(ref));
            const taskRemovals = Array.from(this.initialLinkedTaskRefs).filter((ref) => !this.linkedTaskRefs.has(ref));
            const taskAdds = Array.from(this.linkedTaskRefs).filter((ref) => !this.initialLinkedTaskRefs.has(ref));

            for (const linkedThoughtRef of thoughtRemovals) {
                const ok = await thoughtController.unlinkThoughtFromThought(sourceThoughtRef, linkedThoughtRef);
                if (!ok) throw new Error(`Failed to unlink thought: ${linkedThoughtRef}`);
            }
            for (const linkedThoughtRef of thoughtAdds) {
                const ok = await thoughtController.linkThoughtToThought(sourceThoughtRef, linkedThoughtRef);
                if (!ok) throw new Error(`Failed to link thought: ${linkedThoughtRef}`);
            }
            for (const taskRef of taskRemovals) {
                const ok = await taskController.unlinkThoughtFromTask(sourceThoughtRef, taskRef);
                if (!ok) throw new Error(`Failed to unlink task: ${taskRef}`);
            }
            for (const taskRef of taskAdds) {
                const ok = await taskController.linkThoughtToTask(sourceThoughtRef, taskRef);
                if (!ok) throw new Error(`Failed to link task: ${taskRef}`);
            }

            this.thought = updatedThought;
            this.body = nextBody;
            this.contexts = uniqueValues(this.contexts);
            this.topic = this.topic.trim();
            this.initialBody = this.body;
            this.initialContexts = [...this.contexts];
            this.initialTopic = this.topic;
            this.initialLinkedThoughtRefs = new Set(this.linkedThoughtRefs);
            this.initialLinkedTaskRefs = new Set(this.linkedTaskRefs);
            this.plugin.notifyRefresh('all');
            this.close();
        } catch (error) {
            console.error('[DIWA] Failed to save thought changes', error);
            new Notice('Failed to save thought changes.');
        } finally {
            this.saving = false;
            this.refreshSaveState();
        }
    }

    private tryClose(): void {
        if (!this.hasUnsavedChanges()) {
            this.close();
            return;
        }

        new ConfirmModal(this.app, 'Discard thought changes?', () => this.close()).open();
    }

    private hasUnsavedChanges(): boolean {
        if (this.body.trim() !== this.initialBody.trim()) return true;
        if (this.topic.trim() !== this.initialTopic.trim()) return true;
        if (uniqueValues(this.contexts).join('|') !== uniqueValues(this.initialContexts).join('|')) return true;
        if (!sameSets(this.linkedThoughtRefs, this.initialLinkedThoughtRefs)) return true;
        if (!sameSets(this.linkedTaskRefs, this.initialLinkedTaskRefs)) return true;
        return false;
    }

    private refreshSaveState(): void {
        if (!this.saveBtn) return;
        const canSave = !!this.body.trim() && !this.saving && this.hasUnsavedChanges();
        this.saveBtn.disabled = !canSave;
        this.saveBtn.setText(this.saving ? 'Saving...' : 'Save');
    }

    private updateWordCount(): void {
        if (!this.wordCountEl) return;
        const count = this.body.trim() ? this.body.trim().split(/\s+/).filter(Boolean).length : 0;
        this.wordCountEl.setText(`${count}w`);
        this.wordCountEl.toggleClass('is-populated', count > 0);
    }

    private syncTextareaHeight(): void {
        if (!this.textarea) return;
        this.textarea.style.height = 'auto';
        this.textarea.style.height = `${Math.min(Math.max(this.textarea.scrollHeight, 220), 520)}px`;
    }

    private resolveLinkedThoughtRefs(thought: ThoughtEntry): string[] {
        const thoughtController = this.plugin.getThoughtController();
        const refs = new Set<string>();
        for (const ref of thought.links?.thoughts ?? []) {
            const linkedThought = thoughtController.getThought(ref);
            if (!linkedThought || linkedThought.filePath === thought.filePath) continue;
            refs.add(linkedThought.filePath);
        }
        return Array.from(refs);
    }

    private resolveLinkedTaskRefs(thoughtId: string): string[] {
        return this.plugin.getTaskController()
            .getLinkedTasksForThought(thoughtId)
            .map((task) => getTaskKey(task));
    }

    private getLinkedThoughtEntries(): ThoughtEntry[] {
        const thoughtController = this.plugin.getThoughtController();
        return Array.from(this.linkedThoughtRefs)
            .map((ref) => thoughtController.getThought(ref))
            .filter((entry): entry is ThoughtEntry => !!entry)
            .sort((left, right) => (right.updatedAt ?? right.createdAt ?? 0) - (left.updatedAt ?? left.createdAt ?? 0));
    }

    private getLinkedTaskEntries(): TaskEntry[] {
        const taskController = this.plugin.getTaskController();
        return Array.from(this.linkedTaskRefs)
            .map((ref) => taskController.getTask(ref))
            .filter((entry): entry is TaskEntry => !!entry)
            .sort((left, right) => (right.lastUpdate ?? 0) - (left.lastUpdate ?? 0));
    }

    private getAvailableTopics(): string[] {
        return uniqueValues(this.plugin.index.getExistingTopics() ?? []).sort((left, right) => left.localeCompare(right));
    }

    private thoughtSnippet(thought: ThoughtEntry): string {
        const fallback = thought.filePath.split('/').pop() || thought.filePath;
        const raw = (thought.body || thought.title || fallback)
            .split('\n')
            .find((line) => line.trim()) || fallback;
        const cleaned = raw.trim();
        return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned;
    }

    private taskSnippet(task: TaskEntry): string {
        const fallback = task.filePath.split('/').pop() || task.filePath;
        const raw = (task.title || task.body || fallback)
            .split('\n')
            .find((line) => line.trim()) || fallback;
        const cleaned = raw.trim();
        return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned;
    }

    private hash(value: string): number {
        let hash = 0;
        for (let index = 0; index < value.length; index++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(index);
            hash |= 0;
        }
        return hash;
    }
}

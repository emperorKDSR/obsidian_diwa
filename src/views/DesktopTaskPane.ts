import { Notice, TFile, moment, setIcon } from 'obsidian';
import type { TaskEntry } from '../types';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { DesktopHubView } from './DesktopHubView';

type TaskPaneMutationType = 'ADD_TASK' | 'UPDATE_TASK' | 'DELETE_TASK';

interface TaskPaneMutation {
    type: TaskPaneMutationType;
    taskId: string;
    task?: TaskEntry;
}

interface TaskPaneStateUpdate {
    mutations: TaskPaneMutation[];
    orderedIds: string[];
    tasksById: Map<string, TaskEntry>;
    orderChanged: boolean;
}

type TaskPaneListener = (update: TaskPaneStateUpdate) => void;

const DEBUG_TASK_PANE_RENDER = false;

function debugTaskPane(message: string, data?: unknown): void {
    if (!DEBUG_TASK_PANE_RENDER) return;
    console.debug(`[DIWA TaskPane] ${message}`, data ?? '');
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

function getTaskSignature(task: TaskEntry): string {
    return JSON.stringify({
        filePath: task.filePath,
        title: task.title,
        status: task.status,
        due: task.due,
        context: task.context,
        priority: task.priority,
        energy: task.energy,
        recurrence: task.recurrence,
        project: task.project,
        lastUpdate: task.lastUpdate,
    });
}

class TaskPaneStateStore {
    private tasksById = new Map<string, TaskEntry>();
    private signaturesById = new Map<string, string>();
    private orderedIds: string[] = [];
    private listeners = new Set<TaskPaneListener>();

    subscribe(listener: TaskPaneListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    setTasks(tasks: TaskEntry[]): void {
        const nextTasksById = new Map<string, TaskEntry>();
        const nextSignaturesById = new Map<string, string>();
        const nextOrderedIds: string[] = [];
        const seenTaskIds = new Set<string>();
        const mutations: TaskPaneMutation[] = [];

        for (const task of tasks) {
            const taskId = getTaskKey(task);
            if (seenTaskIds.has(taskId)) {
                debugTaskPane('duplicate task key ignored in ordering', { taskId, filePath: task.filePath });
                nextTasksById.set(taskId, task);
                nextSignaturesById.set(taskId, getTaskSignature(task));
                continue;
            }
            seenTaskIds.add(taskId);
            nextTasksById.set(taskId, task);
            nextSignaturesById.set(taskId, getTaskSignature(task));
            nextOrderedIds.push(taskId);
        }

        for (const taskId of this.tasksById.keys()) {
            if (!nextTasksById.has(taskId)) {
                mutations.push({ type: 'DELETE_TASK', taskId });
            }
        }

        for (const task of tasks) {
            const taskId = getTaskKey(task);
            const nextSignature = nextSignaturesById.get(taskId);
            if (!this.tasksById.has(taskId)) {
                mutations.push({ type: 'ADD_TASK', taskId, task });
            } else if (this.signaturesById.get(taskId) !== nextSignature) {
                mutations.push({ type: 'UPDATE_TASK', taskId, task });
            }
        }

        const orderChanged = this.orderedIds.length !== nextOrderedIds.length
            || this.orderedIds.some((taskId, index) => taskId !== nextOrderedIds[index]);

        this.tasksById = nextTasksById;
        this.signaturesById = nextSignaturesById;
        this.orderedIds = nextOrderedIds;

        if (mutations.length === 0 && !orderChanged) return;
        this.emit({ mutations, orderedIds: [...this.orderedIds], tasksById: new Map(this.tasksById), orderChanged });
    }

    private emit(update: TaskPaneStateUpdate): void {
        for (const listener of this.listeners) listener(update);
    }
}

export class DesktopTaskPaneView {
    private listView: TaskPane | null = null;
    private mounted = false;

    constructor(
        private view: DesktopHubView,
        private rootEl: HTMLElement,
    ) {}

    render(): void {
        if (this.mounted) {
            this.updateFromIndex();
            return;
        }

        this.renderTaskQuickInput(this.rootEl);
        this.listView = new TaskPane(this.view, this.rootEl);
        this.mounted = true;
        this.updateFromIndex();
    }

    updateFromIndex(): void {
        this.listView?.updateFromIndex();
    }

    addTask(task: TaskEntry): void {
        this.listView?.addTask(task);
    }

    updateTask(task: TaskEntry): void {
        this.listView?.updateTask(task);
    }

    removeTask(taskId: string, filePath?: string): void {
        this.listView?.removeTask(taskId, filePath);
    }

    destroy(): void {
        this.listView?.destroy();
        this.listView = null;
        this.mounted = false;
    }

    private renderTaskQuickInput(parent: HTMLElement): void {
        const section = parent.createEl('div', { cls: 'diwa-dh-task-input-section' });
        section.addEventListener('click', (e) => {
            if (e.target !== textarea) textarea.focus();
        });

        const chipRow = section.createEl('div', { cls: 'diwa-dh-task-chip-row' });
        let contexts: string[] = [];
        let dueDate: string | null = null;

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

        const textarea = section.createEl('textarea', {
            cls: 'diwa-dh-task-textarea',
            attr: { placeholder: 'Add a task… (@due, #ctx, /person, [[link)', rows: '1' }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };

        const syncTaskPendingState = () => {
            this.view._taskPending = textarea.value.trim().length > 0 ? 1 : 0;
        };

        textarea.addEventListener('focus', () => {
            syncTaskPendingState();
            syncHeight();
        });
        textarea.addEventListener('input', () => {
            syncHeight();
            syncTaskPendingState();
        });
        textarea.addEventListener('blur', () => syncTaskPendingState());
        textarea.addEventListener('keyup', () => syncHeight());

        attachInlineTriggers(
            this.view.app,
            textarea,
            (d) => { dueDate = d; },
            (tag) => addChip(tag),
            () => (this.view.plugin.settings.contexts ?? []).filter(c => !contexts.includes(c)),
            this.view.plugin.settings.peopleFolder,
        );
        attachMediaPasteHandler(
            this.view.app,
            textarea,
            () => this.view.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );

        const saveTask = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            const ctxSnapshot = [...contexts];
            const due = dueDate;
            this.view._taskPending = 0;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            contexts = [];
            dueDate = null;
            chipRow.empty();
            try {
                this.view.plugin.refreshCoordinator.suppressNotifyRefresh(800);
                const created = await this.view.plugin.vault.createTaskFile(raw, ctxSnapshot, due || undefined);
                const optimisticTask = await this.buildOptimisticTask(created, raw, ctxSnapshot, due);
                this.view.addTaskInPane(optimisticTask);
                await this.view.plugin.refreshCoordinator.reindexFile(created);
                void this.syncCreatedTask(created.path, optimisticTask);
                new Notice('✓ Task added', 1000);
            } catch (e) {
                console.error('[DIWA TaskPane] Error saving task', e);
                new Notice('Error saving task', 2000);
            }
        };

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTask(); }
            if (e.key === 'Escape') {
                textarea.value = '';
                contexts = [];
                dueDate = null;
                chipRow.empty();
                this.view._taskPending = 0;
                textarea.blur();
            }
        });
    }

    private async buildOptimisticTask(
        file: TFile,
        raw: string,
        contexts: string[],
        dueDate: string | null,
    ): Promise<TaskEntry> {
        let taskId: string | undefined;
        try {
            const content = await this.view.app.vault.read(file);
            const match = content.match(/^\s*taskId:\s*("?)([^\r\n"]+)\1\s*$/m);
            taskId = match?.[2]?.trim() || undefined;
        } catch {
            // File exists but read may race briefly on sync backends; fallback to path-keyed optimistic row.
        }

        const now = new Date();
        const firstLine = raw.split('\n').find(line => line.trim()) || raw;
        return {
            filePath: file.path,
            title: firstLine.replace(/[#*_`\[\]]/g, '').trim() || raw,
            created: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            day: moment(now).format('YYYY-MM-DD'),
            status: 'open',
            due: dueDate || '',
            context: [...contexts],
            body: raw,
            lastUpdate: now.getTime(),
            children: [],
            taskId,
        };
    }

    private async syncCreatedTask(filePath: string, fallbackTask: TaskEntry): Promise<void> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const indexed = this.view.plugin.index.taskIndex.get(filePath);
            if (indexed) {
                this.view.updateTaskInPane(indexed);
                return;
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        }
        this.view.updateTaskInPane(fallbackTask);
    }
}

class TaskPane {
    rootEl: HTMLElement;
    private pillUpcomingEl: HTMLElement;
    private pillAllEl: HTMLElement;
    private countEl: HTMLElement;
    private emptyEl: HTMLElement;
    listEl: HTMLElement;
    taskMap = new Map<string, HTMLElement>();
    private store = new TaskPaneStateStore();
    private itemViewsById = new Map<string, TaskItemView>();
    private taskIdByFilePath = new Map<string, string>();
    private unsubscribe: (() => void) | null = null;
    private pendingMutations: TaskPaneMutation[] = [];
    private pendingTasksById = new Map<string, TaskEntry>();
    private pendingOrderedIds: string[] = [];
    private pendingOrderChanged = false;
    private pendingFrame: number | null = null;

    constructor(
        private view: DesktopHubView,
        parent: HTMLElement,
    ) {
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-list-section' });

        const header = this.rootEl.createEl('div', { cls: 'diwa-dh-task-list-header' });
        header.createEl('span', { text: 'TASKS', cls: 'diwa-dh-task-list-title' });
        this.countEl = header.createEl('span', { cls: 'diwa-dh-task-count' });

        const filterGroup = header.createEl('div', { cls: 'diwa-dh-task-filter' });
        this.pillUpcomingEl = filterGroup.createEl('button', {
            text: '2 DAYS',
            cls: 'diwa-dh-task-filter-pill',
        });
        this.pillAllEl = filterGroup.createEl('button', {
            text: 'ALL',
            cls: 'diwa-dh-task-filter-pill',
        });

        this.pillUpcomingEl.addEventListener('click', () => this.setFilter('upcoming'));
        this.pillAllEl.addEventListener('click', () => this.setFilter('all'));

        this.emptyEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-empty' });
        this.listEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-list' });

        this.unsubscribe = this.store.subscribe((update) => this.enqueueStateUpdate(update));
        this.updateFilterButtons();
        this.updateEmptyState(0);
    }

    updateFromIndex(): void {
        this.store.setTasks(this.getVisibleTasks());
    }

    addTask(task: TaskEntry): void {
        const taskId = getTaskKey(task);
        const previousTaskId = this.taskIdByFilePath.get(task.filePath);
        if (previousTaskId && previousTaskId !== taskId) {
            this.removeTaskById(previousTaskId);
        }
        if (!this.isTaskVisible(task)) {
            this.removeTaskById(taskId);
            this.taskIdByFilePath.delete(task.filePath);
            this.updateEmptyState(this.taskMap.size);
            return;
        }

        const existing = this.itemViewsById.get(taskId);
        if (existing) existing.update(task);
        else {
            const itemView = new TaskItemView(this.view, this.listEl, task);
            this.itemViewsById.set(taskId, itemView);
            this.taskMap.set(taskId, itemView.rootEl);
        }
        this.taskIdByFilePath.set(task.filePath, taskId);

        this.listEl.appendChild(this.taskMap.get(taskId)!);
        this.updateEmptyState(this.taskMap.size);
    }

    updateTask(task: TaskEntry): void {
        this.addTask(task);
    }

    removeTask(taskId: string, filePath?: string): void {
        let resolvedTaskId = taskId;
        if (!this.itemViewsById.has(resolvedTaskId) && filePath) {
            resolvedTaskId = this.taskIdByFilePath.get(filePath) || resolvedTaskId;
        }
        this.removeTaskById(resolvedTaskId);
        this.updateEmptyState(this.taskMap.size);
    }

    destroy(): void {
        if (this.pendingFrame !== null) {
            cancelAnimationFrame(this.pendingFrame);
            this.pendingFrame = null;
        }
        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const itemView of this.itemViewsById.values()) itemView.dispose();
        this.itemViewsById.clear();
        this.taskMap.clear();
        this.taskIdByFilePath.clear();
    }

    private setFilter(filter: 'upcoming' | 'all'): void {
        if (this.view._taskFilter === filter) return;
        this.view._taskFilter = filter;
        this.updateFilterButtons();
        this.updateFromIndex();
    }

    private updateFilterButtons(): void {
        this.pillUpcomingEl.toggleClass('is-active', this.view._taskFilter === 'upcoming');
        this.pillAllEl.toggleClass('is-active', this.view._taskFilter === 'all');
    }

    private getVisibleTasks(): TaskEntry[] {
        const todayM = moment().startOf('day');
        const cutoff = moment().startOf('day').add(2, 'days').endOf('day');

        const allOpen = Array.from(this.view.plugin.index.taskIndex.values())
            .filter(t => t.status === 'open' || t.status === 'waiting')
            .sort((a, b) => {
                const aOver = a.due && moment(a.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
                const bOver = b.due && moment(b.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
                if (aOver && !bOver) return -1;
                if (!aOver && bOver) return 1;
                if (a.due && b.due) return a.due.localeCompare(b.due);
                if (a.due && !b.due) return -1;
                if (!a.due && b.due) return 1;
                return (b.lastUpdate || 0) - (a.lastUpdate || 0);
            });

        return this.view._taskFilter === 'upcoming'
            ? allOpen.filter(t => !t.due || moment(t.due, 'YYYY-MM-DD').isSameOrBefore(cutoff, 'day'))
            : allOpen;
    }

    private isTaskVisible(task: TaskEntry): boolean {
        if (task.status !== 'open' && task.status !== 'waiting') return false;
        if (this.view._taskFilter !== 'upcoming') return true;
        if (!task.due) return true;
        const cutoff = moment().startOf('day').add(2, 'days').endOf('day');
        return moment(task.due, 'YYYY-MM-DD').isSameOrBefore(cutoff, 'day');
    }

    private enqueueStateUpdate(update: TaskPaneStateUpdate): void {
        this.pendingMutations.push(...update.mutations);
        this.pendingTasksById = update.tasksById;
        this.pendingOrderedIds = update.orderedIds;
        this.pendingOrderChanged = this.pendingOrderChanged || update.orderChanged;

        if (this.pendingFrame !== null) return;
        this.pendingFrame = requestAnimationFrame(() => this.flushStateUpdate());
    }

    private flushStateUpdate(): void {
        this.pendingFrame = null;
        const mutations = this.pendingMutations;
        const tasksById = this.pendingTasksById;
        const orderedIds = this.pendingOrderedIds;
        const orderChanged = this.pendingOrderChanged;
        this.pendingMutations = [];
        this.pendingTasksById = new Map();
        this.pendingOrderedIds = [];
        this.pendingOrderChanged = false;

        const latestMutationById = new Map<string, TaskPaneMutation>();
        for (const mutation of mutations) latestMutationById.set(mutation.taskId, mutation);

        for (const mutation of latestMutationById.values()) {
            if (mutation.type !== 'DELETE_TASK') continue;
            this.removeTaskById(mutation.taskId);
        }

        for (const mutation of latestMutationById.values()) {
            if (mutation.type === 'DELETE_TASK' || !mutation.task) continue;
            this.addTask(mutation.task);
        }

        for (const taskId of orderedIds) {
            if (this.taskMap.has(taskId)) continue;
            const task = tasksById.get(taskId);
            if (task) this.addTask(task);
        }

        if (orderChanged) {
            for (const taskId of orderedIds) {
                const rowEl = this.taskMap.get(taskId);
                if (rowEl) this.listEl.appendChild(rowEl);
            }
        }

        this.updateEmptyState(orderedIds.length);
        debugTaskPane('partial update', { mutations, orderedIds });
    }

    private removeTaskById(taskId: string): void {
        this.itemViewsById.get(taskId)?.dispose();
        this.itemViewsById.delete(taskId);
        this.taskMap.delete(taskId);
        for (const [filePath, mappedTaskId] of this.taskIdByFilePath.entries()) {
            if (mappedTaskId === taskId) this.taskIdByFilePath.delete(filePath);
        }
    }

    private updateEmptyState(count: number): void {
        this.countEl.setText(String(count));
        if (count > 0) {
            this.emptyEl.style.display = 'none';
            this.listEl.style.display = '';
            return;
        }

        this.emptyEl.setText(this.view._taskFilter === 'upcoming'
            ? 'No tasks in the next 2 days.'
            : 'All clear — no open gawa.');
        this.emptyEl.style.display = '';
        this.listEl.style.display = 'none';
    }
}

class TaskItemView {
    rootEl: HTMLElement;
    private checkboxEl: HTMLElement;
    private contentEl: HTMLElement;
    private titleEl: HTMLElement;
    private dueEl: HTMLElement | null = null;
    private editBtnEl: HTMLElement;
    private entry: TaskEntry;

    constructor(
        private view: DesktopHubView,
        parent: HTMLElement,
        task: TaskEntry,
    ) {
        this.entry = task;
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-item' });
        this.rootEl.setAttr('data-task-id', getTaskKey(task));

        this.checkboxEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-checkbox' });
        this.checkboxEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.markDone();
        });

        this.contentEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-content' });
        this.titleEl = this.contentEl.createEl('span', { cls: 'diwa-dh-task-title' });

        this.editBtnEl = this.rootEl.createEl('button', {
            cls: 'diwa-dh-task-edit-btn',
            attr: { title: 'Edit task', 'aria-label': 'Edit task' }
        });
        setIcon(this.editBtnEl, 'lucide-pencil');
        this.editBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.makeEditable();
        });

        this.update(task);
    }

    update(task: TaskEntry): void {
        this.entry = task;
        this.rootEl.setAttr('data-task-id', getTaskKey(task));
        if (this.rootEl.hasClass('is-editing')) return;

        this.checkboxEl.style.display = '';
        this.contentEl.style.display = '';
        this.editBtnEl.style.display = '';
        this.rootEl.removeClass('is-completing');

        const isOverdue = !!(task.due && moment(task.due, 'YYYY-MM-DD').isBefore(moment().startOf('day'), 'day'));
        this.rootEl.toggleClass('is-overdue', isOverdue);
        this.titleEl.setText(task.title);

        if (task.due) {
            const dueM = moment(task.due, 'YYYY-MM-DD');
            if (!this.dueEl) this.dueEl = this.contentEl.createEl('span', { cls: 'diwa-dh-task-due' });
            this.dueEl.setText(isOverdue ? dueM.format('MMM D') : dueM.fromNow());
            this.dueEl.toggleClass('is-overdue', isOverdue);
        } else if (this.dueEl) {
            this.dueEl.remove();
            this.dueEl = null;
        }
    }

    dispose(): void {
        this.rootEl.remove();
    }

    private async markDone(): Promise<void> {
        if (this.rootEl.hasClass('is-completing')) return;
        const task = this.view.plugin.index.taskIndex.get(this.entry.filePath) ?? this.entry;
        this.rootEl.addClass('is-completing');
        try {
            this.view.plugin.refreshCoordinator.suppressNotifyRefresh(800);
            const ok = await this.view.plugin.vault.updateTaskEntry(task.filePath, {
                title: task.title,
                dueDate: task.due || null,
                recurrence: task.recurrence || null,
                priority: task.priority || null,
                energy: task.energy || null,
                status: 'done',
                contexts: task.context || [],
                project: task.project || null,
            });
            if (!ok) {
                new Notice('Error updating task', 2000);
                this.rootEl.removeClass('is-completing');
                return;
            }
            const now = Date.now();
            const doneTask: TaskEntry = {
                ...task,
                status: 'done',
                modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
                lastUpdate: now,
            };
            this.view.updateTaskInPane(doneTask);
            void this.syncTaskStatus(task.filePath, 'done');
        } catch (e) {
            console.error('[DIWA TaskPane] Error updating task', e);
            new Notice('Error updating task', 2000);
            this.rootEl.removeClass('is-completing');
        }
    }

    private makeEditable(): void {
        if (this.rootEl.hasClass('is-editing')) return;
        const task = this.entry;
        this.rootEl.addClass('is-editing');
        this.view._taskPending++;
        this.checkboxEl.style.display = 'none';
        this.contentEl.style.display = 'none';
        this.editBtnEl.style.display = 'none';

        let editContexts = [...(task.context || [])];
        let editDueDate: string | null = task.due || null;
        const form = this.rootEl.createEl('div', { cls: 'diwa-edit-form' });

        const chipRow = form.createEl('div', { cls: 'diwa-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${ctx}` });
                chip.addEventListener('click', () => { editContexts = editContexts.filter(c => c !== ctx); renderChips(); });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', { cls: 'diwa-edit-textarea', attr: { rows: '2' } }) as HTMLTextAreaElement;
        textarea.value = task.title || task.body || '';
        const syncH = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        requestAnimationFrame(() => { syncH(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); });
        textarea.addEventListener('input', syncH);

        attachInlineTriggers(
            this.view.app,
            textarea,
            (d) => { editDueDate = d; },
            (tag) => { if (!editContexts.includes(tag)) { editContexts.push(tag); renderChips(); } },
            () => (this.view.plugin.settings.contexts ?? []).filter(c => !editContexts.includes(c)),
            this.view.plugin.settings.peopleFolder,
        );

        const actions = form.createEl('div', { cls: 'diwa-edit-actions' });
        const saveBtn = actions.createEl('button', { cls: 'diwa-edit-save-btn', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'diwa-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            this.rootEl.removeClass('is-editing');
            form.remove();
            this.view._taskPending = Math.max(0, this.view._taskPending - 1);
            if (restore) {
                this.checkboxEl.style.display = '';
                this.contentEl.style.display = '';
                this.editBtnEl.style.display = '';
            }
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            exit(false);
            try {
                const latestTask = this.view.plugin.index.taskIndex.get(task.filePath) ?? task;
                this.view.plugin.refreshCoordinator.suppressNotifyRefresh(800);
                await this.view.plugin.vault.editTask(
                    task.filePath, newText, [...editContexts],
                    editDueDate || undefined,
                    { priority: latestTask.priority, energy: latestTask.energy, status: latestTask.status }
                );
                const now = Date.now();
                const updatedTask: TaskEntry = {
                    ...latestTask,
                    title: newText,
                    body: newText,
                    context: [...editContexts],
                    due: editDueDate || '',
                    modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
                    lastUpdate: now,
                };
                this.view.updateTaskInPane(updatedTask);
                await this.reindexTask(task.filePath);
                void this.syncTaskStatus(task.filePath, updatedTask.status);
                new Notice('✓ Task updated', 1000);
            } catch (e) {
                console.error('[DIWA TaskPane] Error updating task', e);
                new Notice('Error updating task', 2000);
                this.checkboxEl.style.display = '';
                this.contentEl.style.display = '';
                this.editBtnEl.style.display = '';
            }
        };

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => exit(true));
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { exit(true); }
        });
    }

    private async reindexTask(filePath: string): Promise<void> {
        const file = this.view.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.view.plugin.refreshCoordinator.reindexFile(file);
    }

    private async syncTaskStatus(filePath: string, expectedStatus: TaskEntry['status']): Promise<void> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const indexed = this.view.plugin.index.taskIndex.get(filePath);
            if (indexed?.status === expectedStatus) {
                this.view.updateTaskInPane(indexed);
                return;
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
            await this.reindexTask(filePath);
        }
        const latest = this.view.plugin.index.taskIndex.get(filePath);
        if (latest) this.view.updateTaskInPane(latest);
        else this.view.removeTaskFromPane(filePath);
    }
}

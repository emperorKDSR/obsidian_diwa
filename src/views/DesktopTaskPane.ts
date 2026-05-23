import { Notice, TFile, moment, setIcon } from 'obsidian';
import type { TaskEntry } from '../types';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { DesktopHubView } from './DesktopHubView';
import type { TaskController } from './TaskController';

export type TaskFilterFn = (task: TaskEntry) => boolean;
export type TaskSortFn = (a: TaskEntry, b: TaskEntry) => number;
export type TaskGroupFn = (task: TaskEntry) => string | null | undefined;

export interface TaskItemHooks {
    onClick?: (task: TaskEntry) => void;
    onToggle?: (task: TaskEntry) => boolean | void | Promise<boolean | void>;
    onEdit?: (task: TaskEntry) => void;
    onDelete?: (taskId: string) => void;
}

export interface TaskPanePlugin {
    id: string;
    filter?: TaskFilterFn;
    sort?: TaskSortFn;
    groupBy?: TaskGroupFn;
}

export interface TaskPaneOptions {
    paneId?: string;
    hooks?: TaskItemHooks;
    plugins?: TaskPanePlugin[];
}

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

const DEBUG = false;
const DEBUG_TASK_PANE_RENDER = DEBUG;

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
                console.warn('[DIWA TaskPane] duplicate taskId detected in state snapshot', {
                    taskId,
                    filePath: task.filePath,
                });
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
        private controller: TaskController,
        private options: TaskPaneOptions = {},
    ) {}

    mount(): void {
        if (this.mounted) {
            this.syncFromIndex();
            return;
        }

        this.renderTaskQuickInput(this.rootEl);
        this.listView = new TaskPane(this.view, this.rootEl, this.controller, this.options);
        this.mounted = true;
        this.syncFromIndex();
    }

    syncFromIndex(): void {
        this.listView?.syncFromIndex();
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

    setFilter(filter: TaskFilterFn | null): void {
        this.listView?.setFilter(filter);
    }

    setSort(sort: TaskSortFn | null): void {
        this.listView?.setSort(sort);
    }

    registerPlugin(plugin: TaskPanePlugin): void {
        this.listView?.registerPlugin(plugin);
    }

    unregisterPlugin(pluginId: string): void {
        this.listView?.unregisterPlugin(pluginId);
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
                this.controller.addTask(optimisticTask);
                await this.view.plugin.refreshCoordinator.reindexFile(created);
                void this.controller.reconcileTask(created.path, 'open', optimisticTask);
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

}

class TaskPane {
    rootEl: HTMLElement;
    private pillUpcomingEl: HTMLElement;
    private pillAllEl: HTMLElement;
    private countEl: HTMLElement;
    private emptyEl: HTMLElement;
    listEl: HTMLElement;
    taskMap = new Map<string, TaskItemView>();
    private store = new TaskPaneStateStore();
    private taskIdByFilePath = new Map<string, string>();
    private pluginMap = new Map<string, TaskPanePlugin>();
    private customFilter: TaskFilterFn | null = null;
    private sortComparator: TaskSortFn | null = null;
    private readonly hooks: TaskItemHooks;
    private readonly paneId: string;
    private unsubscribe: (() => void) | null = null;
    private pendingMutations: TaskPaneMutation[] = [];
    private pendingTasksById = new Map<string, TaskEntry>();
    private pendingOrderedIds: string[] = [];
    private pendingOrderChanged = false;
    private pendingFrame: number | null = null;

    constructor(
        private view: DesktopHubView,
        parent: HTMLElement,
        private controller: TaskController,
        options: TaskPaneOptions = {},
    ) {
        this.hooks = options.hooks ?? {};
        this.paneId = options.paneId ?? 'default';
        for (const plugin of options.plugins ?? []) this.pluginMap.set(plugin.id, plugin);
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-list-section' });
        this.rootEl.setAttr('data-task-pane-id', this.paneId);

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

        this.pillUpcomingEl.addEventListener('click', () => this.setPresetFilter('upcoming'));
        this.pillAllEl.addEventListener('click', () => this.setPresetFilter('all'));

        this.emptyEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-empty' });
        this.listEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-list' });
        this.guardContainerAgainstFullClear(this.rootEl, 'task-pane-root');
        this.guardContainerAgainstFullClear(this.listEl, 'task-pane-list');

        this.unsubscribe = this.store.subscribe((update) => this.enqueueStateUpdate(update));
        this.updateFilterButtons();
        this.updateEmptyState(0);
    }

    syncFromIndex(): void {
        this.store.setTasks(this.getIndexedTasks());
    }

    setFilter(filter: TaskFilterFn | null): void {
        this.customFilter = filter;
        this.applyPresentationForAll();
        debugTaskPane('FILTER', { paneId: this.paneId, customFilter: !!filter });
    }

    setSort(sort: TaskSortFn | null): void {
        this.sortComparator = sort;
        this.syncFromIndex();
    }

    registerPlugin(plugin: TaskPanePlugin): void {
        this.pluginMap.set(plugin.id, plugin);
        this.syncFromIndex();
        this.applyPresentationForAll();
    }

    unregisterPlugin(pluginId: string): void {
        this.pluginMap.delete(pluginId);
        this.syncFromIndex();
        this.applyPresentationForAll();
    }

    addTask(task: TaskEntry): void {
        const taskId = getTaskKey(task);
        debugTaskPane('ADD', { taskId, filePath: task.filePath });
        const previousTaskId = this.taskIdByFilePath.get(task.filePath);
        if (previousTaskId && previousTaskId !== taskId) {
            this.removeTaskById(previousTaskId);
        }
        const existing = this.taskMap.get(taskId);
        if (existing) {
            console.warn('[DIWA TaskPane] duplicate addTask call for existing task', {
                taskId,
                filePath: task.filePath,
            });
            existing.update(task);
        } else {
            const strayRow = this.findRenderedRowByTaskId(taskId);
            if (strayRow) {
                console.warn('[DIWA TaskPane] prevented accidental task row re-creation; removing stray row', {
                    taskId,
                    filePath: task.filePath,
                });
                strayRow.remove();
            }
            const itemView = new TaskItemView(this.view, this.controller, this.hooks, this.listEl, task);
            this.taskMap.set(taskId, itemView);
            this.warnIfDuplicateDomNode(taskId);
        }
        this.taskIdByFilePath.set(task.filePath, taskId);

        const row = this.taskMap.get(taskId);
        if (row) {
            this.applyPresentationForTask(row);
            if (!row.rootEl.isConnected) {
                console.warn('[DIWA TaskPane] task row was detached; reattaching', {
                    taskId,
                    filePath: task.filePath,
                });
            }
            this.listEl.appendChild(row.rootEl);
        }
        this.updateEmptyState(this.getVisibleCount());
        this.verifyDomIntegrity('ADD', taskId);
    }

    updateTask(task: TaskEntry): void {
        const taskId = getTaskKey(task);
        debugTaskPane('UPDATE', { taskId, filePath: task.filePath });
        const previousTaskId = this.taskIdByFilePath.get(task.filePath);
        if (previousTaskId && previousTaskId !== taskId) {
            this.removeTaskById(previousTaskId);
        }
        const existing = this.taskMap.get(taskId);
        if (!existing) {
            console.warn('[DIWA TaskPane] updateTask called for missing element', {
                taskId,
                filePath: task.filePath,
            });
            this.addTask(task);
            return;
        }
        existing.update(task);
        this.taskIdByFilePath.set(task.filePath, taskId);
        this.applyPresentationForTask(existing);
        this.updateEmptyState(this.getVisibleCount());
        this.verifyDomIntegrity('UPDATE', taskId);
    }

    removeTask(taskId: string, filePath?: string): void {
        debugTaskPane('REMOVE', { taskId, filePath });
        let resolvedTaskId = taskId;
        if (!this.taskMap.has(resolvedTaskId) && filePath) {
            resolvedTaskId = this.taskIdByFilePath.get(filePath) || resolvedTaskId;
        }
        if (!this.taskMap.has(resolvedTaskId)) {
            console.warn('[DIWA TaskPane] removeTask called for missing task', { taskId, resolvedTaskId, filePath });
            return;
        }
        this.removeTaskById(resolvedTaskId);
        this.updateEmptyState(this.getVisibleCount());
        this.verifyDomIntegrity('REMOVE', resolvedTaskId);
    }

    destroy(): void {
        if (this.pendingFrame !== null) {
            cancelAnimationFrame(this.pendingFrame);
            this.pendingFrame = null;
        }
        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const itemView of this.taskMap.values()) itemView.destroy();
        this.taskMap.clear();
        this.taskIdByFilePath.clear();
    }

    private setPresetFilter(filter: 'upcoming' | 'all'): void {
        if (this.view._taskFilter === filter) return;
        this.view._taskFilter = filter;
        this.updateFilterButtons();
        this.applyPresentationForAll();
    }

    private updateFilterButtons(): void {
        this.pillUpcomingEl.toggleClass('is-active', this.view._taskFilter === 'upcoming');
        this.pillAllEl.toggleClass('is-active', this.view._taskFilter === 'all');
    }

    private getIndexedTasks(): TaskEntry[] {
        const allOpen = Array.from(this.view.plugin.index.taskIndex.values())
            .filter(t => t.status === 'open' || t.status === 'waiting')
            .sort((a, b) => this.compareTasks(a, b));

        return allOpen;
    }

    private compareTasks(a: TaskEntry, b: TaskEntry): number {
        if (this.sortComparator) {
            const customResult = this.sortComparator(a, b);
            if (customResult !== 0) return customResult;
        }
        for (const plugin of this.pluginMap.values()) {
            if (!plugin.sort) continue;
            const pluginResult = plugin.sort(a, b);
            if (pluginResult !== 0) return pluginResult;
        }
        return this.defaultSort(a, b);
    }

    private defaultSort(a: TaskEntry, b: TaskEntry): number {
        const todayM = moment().startOf('day');
        const aOver = a.due && moment(a.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
        const bOver = b.due && moment(b.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
        if (aOver && !bOver) return -1;
        if (!aOver && bOver) return 1;
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return (b.lastUpdate || 0) - (a.lastUpdate || 0);
    }

    private applyPresentationForAll(): void {
        for (const itemView of this.taskMap.values()) this.applyPresentationForTask(itemView);
        this.updateEmptyState(this.getVisibleCount());
        this.verifyDomIntegrity('FILTER');
    }

    private applyPresentationForTask(itemView: TaskItemView): void {
        const task = itemView.getTask();
        const visible = this.matchesFilter(task);
        itemView.setHidden(!visible);
        itemView.setGroupKey(this.resolveGroup(task));
    }

    private matchesFilter(task: TaskEntry): boolean {
        if (!(task.status === 'open' || task.status === 'waiting')) return false;

        if (this.view._taskFilter === 'upcoming') {
            if (task.due) {
                const cutoff = moment().startOf('day').add(2, 'days').endOf('day');
                if (!moment(task.due, 'YYYY-MM-DD').isSameOrBefore(cutoff, 'day')) return false;
            }
        }

        if (this.customFilter && !this.customFilter(task)) return false;
        for (const plugin of this.pluginMap.values()) {
            if (plugin.filter && !plugin.filter(task)) return false;
        }
        return true;
    }

    private resolveGroup(task: TaskEntry): string | null {
        for (const plugin of this.pluginMap.values()) {
            const groupBy = plugin.groupBy;
            if (!groupBy) continue;
            const key = groupBy(task);
            if (key) return key;
        }
        return null;
    }

    private getVisibleCount(): number {
        let count = 0;
        for (const itemView of this.taskMap.values()) {
            if (!itemView.isHidden()) count++;
        }
        return count;
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
            if (mutation.type === 'ADD_TASK') this.addTask(mutation.task);
            else this.updateTask(mutation.task);
        }

        for (const taskId of orderedIds) {
            if (this.taskMap.has(taskId)) continue;
            const task = tasksById.get(taskId);
            if (task) this.addTask(task);
        }

        if (orderChanged) this.reorderRows(orderedIds);

        this.updateEmptyState(this.getVisibleCount());
        debugTaskPane('partial update', { mutations, orderedIds });
        this.verifyDomIntegrity('BATCH');
    }

    private removeTaskById(taskId: string): void {
        const itemView = this.taskMap.get(taskId);
        itemView?.destroy();
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

    private reorderRows(orderedIds: string[]): void {
        for (let i = 0; i < orderedIds.length; i++) {
            const taskId = orderedIds[i];
            const row = this.taskMap.get(taskId);
            if (!row) continue;
            const rowEl = row.rootEl;
            const nextAnchor = this.findNextRenderedRow(orderedIds, i + 1);
            if (nextAnchor) {
                if (rowEl.nextElementSibling !== nextAnchor) this.listEl.insertBefore(rowEl, nextAnchor);
                continue;
            }
            if (rowEl !== this.listEl.lastElementChild) this.listEl.appendChild(rowEl);
        }
    }

    private findNextRenderedRow(orderedIds: string[], start: number): HTMLElement | null {
        for (let i = start; i < orderedIds.length; i++) {
            const row = this.taskMap.get(orderedIds[i]);
            if (row) return row.rootEl;
        }
        return null;
    }

    private findRenderedRowByTaskId(taskId: string): HTMLElement | null {
        for (const child of Array.from(this.listEl.children)) {
            const row = child as HTMLElement;
            if (row.getAttribute('data-task-id') === taskId) return row;
        }
        return null;
    }

    private warnIfDuplicateDomNode(taskId: string): void {
        let rowCount = 0;
        for (const child of Array.from(this.listEl.children)) {
            if ((child as HTMLElement).getAttribute('data-task-id') === taskId) rowCount++;
        }
        if (rowCount > 1) {
            console.warn('[DIWA TaskPane] duplicate DOM node detected for task', { taskId, rowCount });
        }
    }

    private verifyDomIntegrity(source: string, taskId?: string): void {
        const domRows = Array.from(this.listEl.querySelectorAll<HTMLElement>(':scope > .diwa-dh-task-item'));
        const domCountByTaskId = new Map<string, number>();
        for (const row of domRows) {
            const id = row.getAttribute('data-task-id') || '';
            domCountByTaskId.set(id, (domCountByTaskId.get(id) ?? 0) + 1);
        }

        for (const [id, count] of domCountByTaskId.entries()) {
            if (count > 1) {
                console.warn('[DIWA TaskPane] DOM integrity mismatch: duplicate rendered rows', { source, taskId, id, count });
            }
        }

        for (const [id, view] of this.taskMap.entries()) {
            const count = domCountByTaskId.get(id) ?? 0;
            if (count !== 1) {
                console.warn('[DIWA TaskPane] DOM integrity mismatch: map-to-dom cardinality', { source, taskId, id, count });
            }
            if (!view.rootEl.isConnected) {
                console.warn('[DIWA TaskPane] DOM integrity mismatch: mapped row detached', { source, taskId, id });
            }
        }

        if (DEBUG_TASK_PANE_RENDER) {
            debugTaskPane('DOM integrity check', {
                source,
                taskId,
                mapSize: this.taskMap.size,
                domRows: domRows.length,
            });
        }
    }

    private guardContainerAgainstFullClear(container: HTMLElement, label: string): void {
        const blockedMessage = `[DIWA TaskPane] Full container clear blocked: ${label}`;
        const target = container as HTMLElement & { empty?: () => void };
        if (typeof target.empty === 'function') {
            target.empty = () => {
                throw new Error(blockedMessage);
            };
        }
        const descriptor =
            Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
            ?? Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
        if (!descriptor?.get || !descriptor?.set) return;
        try {
            Object.defineProperty(container, 'innerHTML', {
                configurable: true,
                enumerable: descriptor.enumerable ?? false,
                get: () => descriptor.get!.call(container),
                set: () => {
                    throw new Error(blockedMessage);
                },
            });
        } catch (error) {
            console.warn('[DIWA TaskPane] unable to install innerHTML guard', { label, error });
        }
    }
}

class TaskItemView {
    rootEl: HTMLElement;
    private checkboxEl: HTMLElement;
    private contentEl: HTMLElement;
    private titleEl: HTMLElement;
    private dueEl: HTMLElement | null = null;
    private editBtnEl: HTMLElement;
    private currentTask: TaskEntry;
    private destroyed = false;
    private hidden = false;
    private groupKey: string | null = null;

    constructor(
        private view: DesktopHubView,
        private controller: TaskController,
        private hooks: TaskItemHooks,
        parent: HTMLElement,
        task: TaskEntry,
    ) {
        this.currentTask = task;
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-item' });
        this.rootEl.setAttr('data-task-id', getTaskKey(task));
        this.rootEl.tabIndex = 0;

        this.checkboxEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-checkbox' });
        this.checkboxEl.addEventListener('click', (e) => {
            e.stopPropagation();
            void this.handleToggle();
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
            this.hooks.onEdit?.(this.currentTask);
            this.makeEditable();
        });
        this.rootEl.addEventListener('click', (e) => this.handleClick(e));
        this.rootEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Delete') return;
            this.hooks.onDelete?.(getTaskKey(this.currentTask));
        });

        this.applyTask(task, true);
    }

    update(task: TaskEntry): void {
        if (this.destroyed) {
            console.warn('[DIWA TaskPane] update called on destroyed TaskItemView', {
                taskId: getTaskKey(this.currentTask),
                filePath: this.currentTask.filePath,
            });
            return;
        }
        if (!this.rootEl.isConnected) {
            console.warn('[DIWA TaskPane] update called with detached task row', {
                taskId: getTaskKey(this.currentTask),
                filePath: this.currentTask.filePath,
            });
        }
        this.applyTask(task, false);
    }

    getTask(): TaskEntry {
        return this.currentTask;
    }

    setHidden(hidden: boolean): void {
        if (this.hidden === hidden) return;
        this.hidden = hidden;
        this.rootEl.toggleClass('is-filter-hidden', hidden);
        this.rootEl.style.display = hidden ? 'none' : '';
    }

    isHidden(): boolean {
        return this.hidden;
    }

    setGroupKey(groupKey: string | null): void {
        if (this.groupKey === groupKey) return;
        this.groupKey = groupKey;
        if (groupKey) {
            this.rootEl.setAttr('data-group-key', groupKey);
        } else {
            this.rootEl.removeAttribute('data-group-key');
        }
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        if (!this.rootEl.isConnected) {
            console.warn('[DIWA TaskPane] destroy called for already-detached task row', {
                taskId: getTaskKey(this.currentTask),
                filePath: this.currentTask.filePath,
            });
            return;
        }
        this.rootEl.remove();
    }

    private async handleToggle(): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;
        this.hooks.onToggle?.(this.currentTask);
        this.rootEl.addClass('is-completing');
        try {
            const ok = await this.controller.toggleTask(getTaskKey(this.currentTask));
            if (!ok) {
                new Notice('Error updating task', 2000);
                this.rootEl.removeClass('is-completing');
            }
        } catch (e) {
            console.error('[DIWA TaskPane] Error updating task', e);
            new Notice('Error updating task', 2000);
            this.rootEl.removeClass('is-completing');
        }
    }

    private handleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.closest('.diwa-dh-task-checkbox') || target.closest('.diwa-dh-task-edit-btn')) return;
        this.hooks.onClick?.(this.currentTask);
    }

    private makeEditable(): void {
        if (this.rootEl.hasClass('is-editing')) return;
        const task = this.currentTask;
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
                this.controller.updateTask(updatedTask);
                await this.reindexTask(task.filePath);
                void this.controller.reconcileTask(task.filePath, updatedTask.status, updatedTask);
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

    private applyTask(task: TaskEntry, force: boolean): void {
        const prev = this.currentTask;
        this.currentTask = task;

        const prevKey = getTaskKey(prev);
        const nextKey = getTaskKey(task);
        if (force || prevKey !== nextKey) {
            this.rootEl.setAttr('data-task-id', nextKey);
        }

        if (this.rootEl.hasClass('is-editing')) return;

        if (force || this.checkboxEl.style.display === 'none') this.checkboxEl.style.display = '';
        if (force || this.contentEl.style.display === 'none') this.contentEl.style.display = '';
        if (force || this.editBtnEl.style.display === 'none') this.editBtnEl.style.display = '';
        if (this.rootEl.hasClass('is-completing')) this.rootEl.removeClass('is-completing');

        const wasOverdue = this.isOverdue(prev.due);
        const isOverdue = this.isOverdue(task.due);
        if (force || wasOverdue !== isOverdue) this.rootEl.toggleClass('is-overdue', isOverdue);
        if (force || prev.title !== task.title) this.titleEl.setText(task.title);
        if (force || prev.due !== task.due || wasOverdue !== isOverdue) this.renderDue(task.due, isOverdue);
    }

    private renderDue(due: string, isOverdue: boolean): void {
        if (!due) {
            if (this.dueEl) {
                this.dueEl.remove();
                this.dueEl = null;
            }
            return;
        }
        const dueM = moment(due, 'YYYY-MM-DD');
        if (!this.dueEl) this.dueEl = this.contentEl.createEl('span', { cls: 'diwa-dh-task-due' });
        this.dueEl.setText(isOverdue ? dueM.format('MMM D') : dueM.fromNow());
        this.dueEl.toggleClass('is-overdue', isOverdue);
    }

    private isOverdue(due: string): boolean {
        return !!(due && moment(due, 'YYYY-MM-DD').isBefore(moment().startOf('day'), 'day'));
    }
}

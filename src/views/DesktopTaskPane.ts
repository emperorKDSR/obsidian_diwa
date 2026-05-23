import { Notice, TFile, moment, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { TaskBucketStatus, TaskEntry } from '../types';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { TaskController, TaskPanePort } from './TaskController';

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
    filterFn?: TaskFilterFn | null;
    baseFilterFn?: TaskFilterFn;
    sortFn?: TaskSortFn | null;
    presetFilter?: 'upcoming' | 'all';
    title?: string;
    showFilterPills?: boolean;
    emptyMessage?: string;
    showQuickInput?: boolean;
    showBucketActions?: boolean;
    bucketOnDrop?: TaskBucketStatus;
    focusOnDrop?: boolean;
    allowDragDrop?: boolean;
}

export interface TaskPaneHost {
    app: App;
    plugin: any;
    _taskPending: number;
    _taskFilter: 'upcoming' | 'all';
}

const DEBUG = false;
const DEBUG_TASK_PANE_RENDER = DEBUG;

function debugTaskPane(message: string, data?: unknown): void {
    if (!DEBUG_TASK_PANE_RENDER) return;
    console.debug(`[DIWA TaskPane] ${message}`, data ?? '');
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

export class DesktopTaskPaneView implements TaskPanePort {
    readonly paneId: string;
    private listView: TaskPane | null = null;
    private mounted = false;

    constructor(
        private view: TaskPaneHost,
        private rootEl: HTMLElement,
        private controller: TaskController,
        private options: TaskPaneOptions = {},
    ) {
        this.paneId = options.paneId ?? 'desktop-main';
    }

    mount(): void {
        if (this.mounted) {
            this.controller.syncPane(this.paneId);
            return;
        }

        if (this.options.showQuickInput !== false) {
            this.renderTaskQuickInput(this.rootEl);
        }
        this.listView = new TaskPane(this.view, this.rootEl, this.controller, {
            ...this.options,
            paneId: this.paneId,
        });
        this.mounted = true;
        this.controller.registerPane(this);
    }

    syncTasks(tasks: TaskEntry[]): void {
        this.listView?.syncTasks(tasks);
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
        this.controller.unregisterPane(this.paneId, this);
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
            () => (this.view.plugin.settings.contexts ?? []).filter((c: string) => !contexts.includes(c)),
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

export class TaskPane implements TaskPanePort {
    rootEl: HTMLElement;
    private pillUpcomingEl: HTMLElement | null = null;
    private pillAllEl: HTMLElement | null = null;
    private countEl: HTMLElement;
    private emptyEl: HTMLElement;
    listEl: HTMLElement;
    taskMap = new Map<string, TaskItemView>();
    private taskIdByFilePath = new Map<string, string>();
    private pluginMap = new Map<string, TaskPanePlugin>();
    private customFilter: TaskFilterFn | null;
    private baseFilter: TaskFilterFn;
    private sortComparator: TaskSortFn | null;
    private presetFilter: 'upcoming' | 'all';
    private readonly title: string;
    private readonly emptyMessage?: string;
    private readonly showFilterPills: boolean;
    private readonly showBucketActions: boolean;
    private readonly bucketOnDrop?: TaskBucketStatus;
    private readonly focusOnDrop?: boolean;
    private readonly allowDragDrop: boolean;
    private readonly hooks: TaskItemHooks;
    readonly paneId: string;
    private pendingSnapshot: TaskEntry[] | null = null;
    private pendingFrame: number | null = null;
    private inBatchSync = false;

    constructor(
        private view: TaskPaneHost,
        parent: HTMLElement,
        private controller: TaskController,
        options: TaskPaneOptions = {},
    ) {
        this.hooks = options.hooks ?? {};
        this.paneId = options.paneId ?? 'default';
        this.title = options.title ?? 'TASKS';
        this.emptyMessage = options.emptyMessage;
        this.showFilterPills = options.showFilterPills ?? true;
        this.showBucketActions = options.showBucketActions ?? false;
        this.bucketOnDrop = options.bucketOnDrop;
        this.focusOnDrop = options.focusOnDrop;
        this.allowDragDrop = options.allowDragDrop ?? false;
        this.customFilter = options.filterFn ?? null;
        this.baseFilter = options.baseFilterFn ?? ((task) => task.status === 'open' || task.status === 'waiting');
        this.sortComparator = options.sortFn ?? null;
        this.presetFilter = options.presetFilter ?? this.view._taskFilter ?? 'upcoming';
        for (const plugin of options.plugins ?? []) this.pluginMap.set(plugin.id, plugin);
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-list-section' });
        this.rootEl.setAttr('data-task-pane-id', this.paneId);

        const header = this.rootEl.createEl('div', { cls: 'diwa-dh-task-list-header' });
        header.createEl('span', { text: this.title, cls: 'diwa-dh-task-list-title' });
        this.countEl = header.createEl('span', { cls: 'diwa-dh-task-count' });

        if (this.showFilterPills) {
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
        }

        this.emptyEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-empty' });
        this.listEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-list' });
        if (this.allowDragDrop && this.bucketOnDrop) {
            this.rootEl.setAttr('data-drop-bucket', this.bucketOnDrop);
            this.rootEl.addEventListener('dragenter', (event) => this.handleDragEnter(event));
            this.rootEl.addEventListener('dragover', (event) => this.handleDragOver(event));
            this.rootEl.addEventListener('dragleave', (event) => this.handleDragLeave(event));
            this.rootEl.addEventListener('drop', (event) => this.handleDrop(event));
        }
        this.guardContainerAgainstFullClear(this.rootEl, 'task-pane-root');
        this.guardContainerAgainstFullClear(this.listEl, 'task-pane-list');

        this.updateFilterButtons();
        this.updateEmptyState(0);
    }

    syncTasks(tasks: TaskEntry[]): void {
        this.pendingSnapshot = [...tasks];
        if (this.pendingFrame !== null) return;
        this.pendingFrame = requestAnimationFrame(() => this.flushSnapshotSync());
    }

    setFilter(filter: TaskFilterFn | null): void {
        this.customFilter = filter;
        this.controller.syncPane(this.paneId);
        debugTaskPane('FILTER', { paneId: this.paneId, customFilter: !!filter });
    }

    setSort(sort: TaskSortFn | null): void {
        this.sortComparator = sort;
        this.controller.syncPane(this.paneId);
    }

    registerPlugin(plugin: TaskPanePlugin): void {
        this.pluginMap.set(plugin.id, plugin);
        this.controller.syncPane(this.paneId);
    }

    unregisterPlugin(pluginId: string): void {
        this.pluginMap.delete(pluginId);
        this.controller.syncPane(this.paneId);
    }

    addTask(task: TaskEntry): void {
        const taskId = getTaskKey(task);
        debugTaskPane('ADD', { taskId, filePath: task.filePath });
        if (!this.shouldRenderTask(task)) {
            const existingTaskId = this.taskIdByFilePath.get(task.filePath);
            if (existingTaskId) this.removeTaskById(existingTaskId);
            if (!this.inBatchSync) this.updateEmptyState(this.taskMap.size);
            return;
        }
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
            const itemView = new TaskItemView(
                this.view,
                this.controller,
                this.hooks,
                this.listEl,
                task,
                this.showBucketActions
            );
            this.taskMap.set(taskId, itemView);
            this.warnIfDuplicateDomNode(taskId);
        }
        this.taskIdByFilePath.set(task.filePath, taskId);

        const row = this.taskMap.get(taskId);
        if (row) {
            if (!row.rootEl.isConnected) {
                console.warn('[DIWA TaskPane] task row was detached; reattaching', {
                    taskId,
                    filePath: task.filePath,
                });
            }
            this.listEl.appendChild(row.rootEl);
        }
        this.finalizeMutation('ADD', taskId);
    }

    updateTask(task: TaskEntry): void {
        const taskId = getTaskKey(task);
        debugTaskPane('UPDATE', { taskId, filePath: task.filePath });
        const previousTaskId = this.taskIdByFilePath.get(task.filePath);
        if (previousTaskId && previousTaskId !== taskId) {
            this.removeTaskById(previousTaskId);
        }
        if (!this.shouldRenderTask(task)) {
            const removableTaskId = this.taskMap.has(taskId) ? taskId : previousTaskId;
            if (removableTaskId) this.removeTaskById(removableTaskId);
            this.finalizeMutation('UPDATE_REMOVE', taskId);
            return;
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
        this.finalizeMutation('UPDATE', taskId);
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
        this.finalizeMutation('REMOVE', resolvedTaskId);
    }

    destroy(): void {
        if (this.pendingFrame !== null) {
            cancelAnimationFrame(this.pendingFrame);
            this.pendingFrame = null;
        }
        for (const itemView of this.taskMap.values()) itemView.destroy();
        this.taskMap.clear();
        this.taskIdByFilePath.clear();
    }

    private setPresetFilter(filter: 'upcoming' | 'all'): void {
        if (!this.showFilterPills) return;
        if (this.presetFilter === filter) return;
        this.presetFilter = filter;
        this.view._taskFilter = filter;
        this.updateFilterButtons();
        this.controller.syncPane(this.paneId);
    }

    private updateFilterButtons(): void {
        this.pillUpcomingEl?.toggleClass('is-active', this.presetFilter === 'upcoming');
        this.pillAllEl?.toggleClass('is-active', this.presetFilter === 'all');
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

    private shouldRenderTask(task: TaskEntry): boolean {
        if (!this.baseFilter(task)) return false;

        if (this.presetFilter === 'upcoming') {
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

    private flushSnapshotSync(): void {
        this.pendingFrame = null;
        const snapshot = this.pendingSnapshot ?? [];
        this.pendingSnapshot = null;
        const orderedTasks = [...snapshot]
            .filter((task) => this.shouldRenderTask(task))
            .sort((a, b) => this.compareTasks(a, b));
        const nextTaskIds = orderedTasks.map((task) => getTaskKey(task));
        const nextTaskSet = new Set(nextTaskIds);

        this.inBatchSync = true;
        try {
            for (const existingTaskId of Array.from(this.taskMap.keys())) {
                if (!nextTaskSet.has(existingTaskId)) this.removeTaskById(existingTaskId);
            }

            for (const task of orderedTasks) {
                const taskId = getTaskKey(task);
                if (this.taskMap.has(taskId)) {
                    this.updateTask(task);
                } else {
                    this.addTask(task);
                }
                const row = this.taskMap.get(taskId);
                row?.setGroupKey(this.resolveGroup(task));
            }
        } finally {
            this.inBatchSync = false;
        }

        this.reorderRows(nextTaskIds);
        this.updateEmptyState(this.taskMap.size);
        debugTaskPane('snapshot sync', { paneId: this.paneId, taskCount: orderedTasks.length });
        this.verifyDomIntegrity('SYNC');
    }

    private finalizeMutation(source: string, taskId?: string): void {
        if (this.inBatchSync) return;
        this.updateEmptyState(this.taskMap.size);
        this.verifyDomIntegrity(source, taskId);
    }

    private handleDragEnter(event: DragEvent): void {
        if (!this.getDraggedTaskId(event)) return;
        event.preventDefault();
        this.rootEl.addClass('is-drop-target');
    }

    private handleDragOver(event: DragEvent): void {
        if (!this.getDraggedTaskId(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        this.rootEl.addClass('is-drop-target');
    }

    private handleDragLeave(event: DragEvent): void {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && this.rootEl.contains(nextTarget)) return;
        this.rootEl.removeClass('is-drop-target');
    }

    private handleDrop(event: DragEvent): void {
        this.rootEl.removeClass('is-drop-target');
        const draggedTaskId = this.getDraggedTaskId(event);
        if (!draggedTaskId || !this.bucketOnDrop) return;
        event.preventDefault();
        void this.controller.moveTaskToBucket(draggedTaskId, this.bucketOnDrop, {
            focus: this.focusOnDrop,
        });
    }

    private getDraggedTaskId(event: DragEvent): string | null {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return null;
        return dataTransfer.getData('application/x-diwa-task-id')
            || dataTransfer.getData('text/plain')
            || null;
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

        if (this.emptyMessage) {
            this.emptyEl.setText(this.emptyMessage);
        } else {
            this.emptyEl.setText(this.presetFilter === 'upcoming'
                ? 'No tasks in the next 2 days.'
                : 'All clear — no open gawa.');
        }
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

export class TaskItemView {
    rootEl: HTMLElement;
    private checkboxEl: HTMLElement;
    private contentEl: HTMLElement;
    private titleEl: HTMLElement;
    private dueEl: HTMLElement | null = null;
    private quickActionsEl: HTMLElement | null = null;
    private activateBtnEl: HTMLElement | null = null;
    private focusBtnEl: HTMLElement | null = null;
    private doneBtnEl: HTMLElement | null = null;
    private editBtnEl: HTMLElement;
    private currentTask: TaskEntry;
    private destroyed = false;
    private groupKey: string | null = null;
    private flashTimer: number | null = null;

    constructor(
        private view: TaskPaneHost,
        private controller: TaskController,
        private hooks: TaskItemHooks,
        parent: HTMLElement,
        task: TaskEntry,
        private showBucketActions: boolean,
    ) {
        this.currentTask = task;
        this.rootEl = parent.createEl('div', { cls: 'diwa-dh-task-item' });
        this.rootEl.setAttr('data-task-id', getTaskKey(task));
        this.rootEl.tabIndex = 0;
        this.rootEl.draggable = true;
        this.rootEl.addEventListener('dragstart', (event) => this.handleDragStart(event));
        this.rootEl.addEventListener('dragend', () => this.rootEl.removeClass('is-dragging'));

        this.checkboxEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-checkbox' });
        this.checkboxEl.addEventListener('click', (e) => {
            e.stopPropagation();
            void this.handleToggle();
        });

        this.contentEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-content' });
        this.titleEl = this.contentEl.createEl('span', { cls: 'diwa-dh-task-title' });
        if (this.showBucketActions) {
            this.quickActionsEl = this.contentEl.createEl('div', { cls: 'diwa-dh-task-quick-actions' });
            this.activateBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Move to Active', 'aria-label': 'Move to Active' }
            });
            setIcon(this.activateBtnEl, 'lucide-play');
            this.activateBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.moveToBucket('active', false);
            });

            this.focusBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Set Focus', 'aria-label': 'Set Focus' }
            });
            setIcon(this.focusBtnEl, 'lucide-target');
            this.focusBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.moveToBucket('active', true);
            });

            this.doneBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Mark Done', 'aria-label': 'Mark Done' }
            });
            setIcon(this.doneBtnEl, 'lucide-check');
            this.doneBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.moveToBucket('done', false);
            });
        }

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
            if (this.rootEl.hasClass('is-editing')) return;
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                void this.handleToggle();
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void this.moveToBucket('active', true);
                return;
            }
            if (e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                void this.moveToBucket('active', false);
                return;
            }
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
        if (this.flashTimer !== null) {
            window.clearTimeout(this.flashTimer);
            this.flashTimer = null;
        }
        if (!this.rootEl.isConnected) {
            console.warn('[DIWA TaskPane] destroy called for already-detached task row', {
                taskId: getTaskKey(this.currentTask),
                filePath: this.currentTask.filePath,
            });
            return;
        }
        this.rootEl.remove();
    }

    private handleDragStart(event: DragEvent): void {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return;
        const taskId = getTaskKey(this.currentTask);
        dataTransfer.setData('application/x-diwa-task-id', taskId);
        dataTransfer.setData('text/plain', taskId);
        dataTransfer.effectAllowed = 'move';
        this.rootEl.addClass('is-dragging');
    }

    private async moveToBucket(bucket: TaskBucketStatus, focus?: boolean): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;
        this.rootEl.addClass('is-completing');
        try {
            const ok = await this.controller.moveTaskToBucket(getTaskKey(this.currentTask), bucket, { focus });
            if (!ok) {
                new Notice('Error updating task', 2000);
            }
        } catch (error) {
            console.error('[DIWA TaskPane] Error moving task', error);
            new Notice('Error updating task', 2000);
        } finally {
            this.rootEl.removeClass('is-completing');
        }
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
            () => (this.view.plugin.settings.contexts ?? []).filter((c: string) => !editContexts.includes(c)),
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
        const wasDone = this.isDoneTask(prev);
        const isDone = this.isDoneTask(task);
        const wasFocused = !!prev.focus;
        const isFocused = !!task.focus;
        if (force || wasOverdue !== isOverdue) this.rootEl.toggleClass('is-overdue', isOverdue);
        if (force || wasDone !== isDone) this.rootEl.toggleClass('is-done', isDone);
        if (force || wasFocused !== isFocused) this.rootEl.toggleClass('is-focused', isFocused);
        if (force || prev.title !== task.title) this.titleEl.setText(task.title);
        if (force || prev.due !== task.due || wasOverdue !== isOverdue) this.renderDue(task.due, isOverdue);
        if (this.showBucketActions) this.syncQuickActionState(task);
        if (!force && (wasDone !== isDone || wasFocused !== isFocused || prev.bucketStatus !== task.bucketStatus)) {
            this.flashUpdate();
        }
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

    private isDoneTask(task: TaskEntry): boolean {
        return task.status === 'done' || task.bucketStatus === 'done' || task.lifecycleStatus === 'done';
    }

    private syncQuickActionState(task: TaskEntry): void {
        if (!this.showBucketActions) return;
        const isDone = this.isDoneTask(task);
        this.doneBtnEl?.toggleClass('is-active', isDone);
        this.focusBtnEl?.toggleClass('is-active', !!task.focus && !isDone);
        const isActive = task.bucketStatus === 'active' || task.status === 'waiting' || task.lifecycleStatus === 'active';
        this.activateBtnEl?.toggleClass('is-active', isActive && !isDone);
    }

    private flashUpdate(): void {
        this.rootEl.addClass('is-updated');
        if (this.flashTimer !== null) window.clearTimeout(this.flashTimer);
        this.flashTimer = window.setTimeout(() => {
            this.rootEl.removeClass('is-updated');
            this.flashTimer = null;
        }, 420);
    }
}

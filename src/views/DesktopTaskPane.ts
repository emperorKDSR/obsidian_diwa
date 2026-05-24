import { Notice, TFile, moment, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { TaskBucketStatus, TaskEntry, ThoughtEntry } from '../types';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { TaskController, TaskPanePort } from './TaskController';
import type { ThoughtController } from './ThoughtController';
import { LinkModal } from './LinkModal';
import { EditTaskModal } from '../modals/EditTaskModal';
import { FastTaskCaptureModal, type FastTaskCapturePayload } from '../modals/FastTaskCaptureModal';

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
    inlineContentRenderer?: (parent: HTMLElement) => void;
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

function safeSetIcon(target: HTMLElement, iconName: string, fallbackIcon = 'circle'): void {
    const candidates = [iconName, iconName.replace(/^lucide-/, ''), fallbackIcon]
        .map((value) => value.trim())
        .filter(Boolean);
    const attempted = new Set<string>();
    for (const candidate of candidates) {
        if (attempted.has(candidate)) continue;
        attempted.add(candidate);
        try {
            setIcon(target, candidate);
            return;
        } catch {
            // Keep trying fallbacks — avoid task-row construction failures on icon registry mismatches.
        }
    }
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

function getLinkedThoughtIds(task: TaskEntry): string[] {
    const linked = [
        ...(task.sourceThoughtIds ?? []),
        ...(task.links?.thoughts ?? []),
    ].map((id) => id.trim()).filter(Boolean);
    return Array.from(new Set(linked));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false;
    }
    return true;
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
            attr: { placeholder: 'Add a task… (Enter save, Ctrl/Cmd+Enter refine)', rows: '1' }
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

        const resetQuickInput = () => {
            this.view._taskPending = 0;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            contexts = [];
            dueDate = null;
            chipRow.empty();
        };

        const saveTask = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            const ctxSnapshot = [...contexts];
            const due = dueDate;
            resetQuickInput();
            try {
                this.view.plugin.refreshCoordinator.suppressNotifyRefresh(800);
                const created = await this.view.plugin.vault.createTaskFile(raw, ctxSnapshot, due || undefined);
                const optimisticTask = await this.buildOptimisticTask(created, raw, ctxSnapshot, due);
                this.controller.addTask(optimisticTask);
                await this.view.plugin.refreshCoordinator.reindexFile(created);
                void this.controller.reconcileTask(created.path, 'open', optimisticTask);
            } catch (e) {
                console.error('[DIWA TaskPane] Error saving task', e);
            }
        };

        const openStructuredCapture = () => {
            const draftText = textarea.value.trim();
            const draftContexts = [...contexts];
            const draftDueDate = dueDate;
            const seededParts = [draftText];
            for (const ctx of draftContexts) seededParts.push(`#${ctx}`);
            if (draftDueDate) seededParts.push(`@${draftDueDate}`);
            const seededText = seededParts.filter(Boolean).join(' ').trim();

            new FastTaskCaptureModal(
                this.view.app,
                this.view.plugin,
                async (payload: FastTaskCapturePayload) => {
                    try {
                        this.view.plugin.refreshCoordinator.suppressNotifyRefresh(800);
                        const created = await this.view.plugin.vault.createTaskFile(
                            payload.text,
                            payload.contexts,
                            payload.dueDate || undefined,
                            payload.project || undefined,
                            {
                                priority: payload.priority ?? undefined,
                                status: payload.status,
                            }
                        );
                        if (created instanceof TFile) {
                            await this.view.plugin.refreshCoordinator.reindexFile(created);
                            const indexedTask = this.view.plugin.index.taskIndex.get(created.path);
                            if (indexedTask) {
                                this.controller.addTask(indexedTask);
                                if (payload.focus) {
                                    await this.controller.moveTaskToBucket(
                                        this.resolveTaskKey(indexedTask),
                                        'active',
                                        { focus: true }
                                    );
                                }
                            } else {
                                this.controller.syncFromIndex();
                            }
                        } else {
                            this.controller.syncFromIndex();
                        }
                        resetQuickInput();
                    } catch (error) {
                        console.error('[DIWA TaskPane] Error saving structured task', error);
                    }
                },
                seededText
            ).open();
        };

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                openStructuredCapture();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTask(); }
            if (e.key === 'Escape') {
                resetQuickInput();
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

    private resolveTaskKey(task: TaskEntry): string {
        return task.taskId?.trim() || task.filePath;
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
        this.baseFilter = options.baseFilterFn ?? ((task) =>
            task.status === 'open'
            || task.status === 'waiting'
            || task.state === 'backlog'
            || task.state === 'active'
        );
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

        if (options.inlineContentRenderer) {
            const inlineContent = this.rootEl.createEl('div', { cls: 'diwa-dh-task-inline-content' });
            options.inlineContentRenderer(inlineContent);
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
        const existing = this.taskMap.get(taskId);
        const hasMissingWorkflowState = !task.status && !task.state && !task.bucketStatus && !task.lifecycleStatus;
        if (existing && hasMissingWorkflowState) {
            const stableTask = existing.getTask();
            existing.update({
                ...stableTask,
                ...task,
                status: stableTask.status,
                state: task.state ?? stableTask.state,
                bucketStatus: task.bucketStatus ?? stableTask.bucketStatus,
                lifecycleStatus: task.lifecycleStatus ?? stableTask.lifecycleStatus,
            });
            this.taskIdByFilePath.set(task.filePath, taskId);
            this.finalizeMutation('UPDATE_PARTIAL', taskId);
            return;
        }
        if (!this.shouldRenderTask(task)) {
            const removableTaskId = this.taskMap.has(taskId) ? taskId : previousTaskId;
            if (removableTaskId) this.removeTaskById(removableTaskId);
            this.finalizeMutation('UPDATE_REMOVE', taskId);
            return;
        }
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
        // Keep tasks visible when update payload is partial and does not carry workflow state yet.
        if (!task.status && !task.state && !task.bucketStatus && !task.lifecycleStatus) return true;
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
                try {
                    if (this.taskMap.has(taskId)) {
                        this.updateTask(task);
                    } else {
                        this.addTask(task);
                    }
                    const row = this.taskMap.get(taskId);
                    row?.setGroupKey(this.resolveGroup(task));
                } catch (error) {
                    console.error('[DIWA TaskPane] failed to render task during snapshot sync', {
                        paneId: this.paneId,
                        taskId,
                        filePath: task.filePath,
                        error,
                    });
                }
            }
        } finally {
            this.inBatchSync = false;
        }

        this.reorderRows(nextTaskIds);
        this.updateEmptyState(this.taskMap.size);
        console.log(`[DIWA TaskPane] ${this.paneId} synced`, { rendered: orderedTasks.length, total: snapshot.length });
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

class ThoughtOverlay {
    private backdropEl: HTMLElement | null = null;
    private headerEl: HTMLElement | null = null;
    private listEl: HTMLElement | null = null;
    private inputEl: HTMLInputElement | null = null;
    private activeTaskId: string | null = null;
    private hostEl: HTMLElement | null = null;
    private hostPositionTouched = false;
    private hostPositionOriginal = '';
    private onEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        this.close();
    };

    constructor(
        private app: App,
        private thoughtController: ThoughtController,
        private taskController: TaskController,
        private setTaskOverlayActive: (taskId: string, active: boolean) => void,
    ) {}

    open(taskId: string, hostEl: HTMLElement): void {
        const resolvedTask = this.taskController.getTask(taskId);
        if (!resolvedTask) return;
        const taskRef = resolvedTask.filePath || taskId;
        this.ensureDom();
        if (!this.backdropEl || !this.headerEl || !this.listEl || !this.inputEl) return;
        this.attachToHost(hostEl);

        if (this.activeTaskId && this.activeTaskId !== taskRef) this.setTaskOverlayActive(this.activeTaskId, false);
        this.activeTaskId = taskRef;
        this.setTaskOverlayActive(taskRef, true);
        this.render();

        this.backdropEl.style.display = 'flex';
        this.inputEl.value = '';
        this.inputEl.disabled = false;
        window.addEventListener('keydown', this.onEscape, true);
        window.setTimeout(() => this.inputEl?.focus(), 10);
    }

    close(): void {
        if (this.activeTaskId) this.setTaskOverlayActive(this.activeTaskId, false);
        this.activeTaskId = null;
        if (this.backdropEl) this.backdropEl.style.display = 'none';
        window.removeEventListener('keydown', this.onEscape, true);
    }

    refreshTask(taskId: string): void {
        if (!this.activeTaskId || this.activeTaskId !== taskId) return;
        this.render();
    }

    closeIfActive(taskId: string): void {
        if (this.activeTaskId !== taskId) return;
        this.close();
    }

    private ensureDom(): void {
        if (this.backdropEl) return;
        this.backdropEl = document.createElement('div');
        this.backdropEl.className = 'thought-overlay-backdrop';
        this.backdropEl.style.display = 'none';
        this.backdropEl.addEventListener('mousedown', (event) => {
            if (event.target !== this.backdropEl) return;
            this.close();
        });

        const panelEl = document.createElement('div');
        panelEl.className = 'thought-overlay';
        panelEl.addEventListener('mousedown', (event) => event.stopPropagation());

        this.headerEl = document.createElement('div');
        this.headerEl.className = 'thought-header';

        this.listEl = document.createElement('div');
        this.listEl.className = 'thought-list';

        this.inputEl = document.createElement('input');
        this.inputEl.className = 'thought-input';
        this.inputEl.placeholder = 'Write new thought...';
        this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            const content = this.inputEl?.value.trim() || '';
            if (!content || !this.activeTaskId || !this.inputEl) return;
            this.inputEl.disabled = true;
            void (async () => {
                const ok = await this.taskController.createThoughtFromTask(this.activeTaskId!, content);
                this.inputEl!.disabled = false;
                if (!ok) return;
                this.inputEl!.value = '';
                this.render();
            })();
        });

        panelEl.appendChild(this.headerEl);
        panelEl.appendChild(this.listEl);
        panelEl.appendChild(this.inputEl);
        this.backdropEl.appendChild(panelEl);
    }

    private attachToHost(hostEl: HTMLElement): void {
        if (!this.backdropEl) return;
        if (this.hostEl === hostEl && this.backdropEl.parentElement === hostEl) return;

        if (this.hostEl && this.hostPositionTouched) {
            this.hostEl.style.position = this.hostPositionOriginal;
            this.hostPositionTouched = false;
        }

        this.hostEl = hostEl;
        const isBodyHost = hostEl === document.body;
        this.backdropEl.toggleClass('is-global', isBodyHost);

        if (!isBodyHost) {
            const computed = window.getComputedStyle(hostEl).position;
            if (computed === 'static') {
                this.hostPositionOriginal = hostEl.style.position;
                hostEl.style.position = 'relative';
                this.hostPositionTouched = true;
            }
        }

        hostEl.appendChild(this.backdropEl);
    }

    private render(): void {
        if (!this.activeTaskId || !this.headerEl || !this.listEl) return;
        const task = this.taskController.getTask(this.activeTaskId);
        if (!task) {
            this.close();
            return;
        }
        const taskRef = task.filePath || this.activeTaskId;
        const linkedThoughts = this.thoughtController.getThoughtsForTask(taskRef);
        this.headerEl.setText(`Linked Thoughts (${linkedThoughts.length})`);
        this.listEl.empty();
        if (linkedThoughts.length === 0) {
            this.listEl.createEl('div', { cls: 'diwa-dh-task-thought-empty', text: 'No linked thoughts' });
            return;
        }
        for (const thought of linkedThoughts) {
            const row = this.listEl.createEl('div', { cls: 'diwa-dh-task-thought-row' });
            row.createEl('div', {
                cls: 'diwa-dh-task-thought-content',
                text: (thought.body || thought.content || thought.title || '').trim() || 'Untitled thought',
            });
            const openBtn = row.createEl('button', {
                cls: 'thought-open-icon',
                attr: { type: 'button', 'aria-label': 'Open thought note', title: 'Open thought note' },
            }) as HTMLButtonElement;
            safeSetIcon(openBtn, 'lucide-external-link', 'external-link');
            openBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(thought.filePath);
                if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
            });
            const unlinkBtn = row.createEl('button', {
                cls: 'diwa-dh-task-thought-unlink',
                text: 'Unlink',
                attr: { type: 'button', 'aria-label': 'Unlink thought from task' },
            }) as HTMLButtonElement;
            unlinkBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                void (async () => {
                    const currentTaskId = this.activeTaskId;
                    if (!currentTaskId) return;
                    const ok = await this.taskController.unlinkThoughtFromTask(thought.filePath, currentTaskId);
                    if (!ok) {
                        return;
                    }
                    this.render();
                })();
            });
        }
    }
}

export class TaskItemView {
    private static sharedThoughtOverlay: ThoughtOverlay | null = null;
    private static sharedLinkModal: LinkModal | null = null;
    rootEl: HTMLElement;
    private headerEl: HTMLElement;
    private metaEl: HTMLElement;
    private thoughtIconEl: HTMLButtonElement;
    private taskLinkIconEl: HTMLButtonElement;
    private checkboxEl: HTMLElement;
    private titleEl: HTMLElement;
    private projectChipEl: HTMLButtonElement | null = null;
    private dueChipEl: HTMLButtonElement | null = null;
    private quickActionsEl: HTMLElement | null = null;
    private linkIconsEl: HTMLElement | null = null;
    private backlogBtnEl: HTMLElement | null = null;
    private activateBtnEl: HTMLElement | null = null;
    private focusBtnEl: HTMLElement | null = null;
    private doneBtnEl: HTMLElement | null = null;
    private editBtnEl: HTMLElement;
    private currentTask: TaskEntry;
    private destroyed = false;
    private groupKey: string | null = null;
    private flashTimer: number | null = null;
    private popoverEl: HTMLElement | null = null;
    private popoverOutsideHandler: ((event: MouseEvent) => void) | null = null;
    private popoverEscapeHandler: ((event: KeyboardEvent) => void) | null = null;
    private popoverWin: Window | null = null;
    private linkedThoughtIds: string[] = [];

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
        this.rootEl.setAttr('aria-keyshortcuts', 'Space Ctrl+Enter Meta+Enter Ctrl+ArrowUp Meta+ArrowUp Ctrl+ArrowDown Meta+ArrowDown');
        this.rootEl.tabIndex = 0;
        this.rootEl.draggable = true;
        this.rootEl.addEventListener('dragstart', (event) => this.handleDragStart(event));
        this.rootEl.addEventListener('dragend', () => this.rootEl.removeClass('is-dragging'));

        this.headerEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-header' });
        const mainEl = this.headerEl.createEl('div', { cls: 'diwa-dh-task-main' });
        const actionsEl = this.headerEl.createEl('div', { cls: 'diwa-dh-task-actions' });

        this.checkboxEl = mainEl.createEl('div', { cls: 'diwa-dh-task-checkbox' });
        this.checkboxEl.addEventListener('click', (e) => {
            e.stopPropagation();
            void this.handleToggle();
        });

        this.titleEl = mainEl.createEl('div', { cls: 'diwa-dh-task-title' });
        if (this.showBucketActions) {
            this.quickActionsEl = actionsEl.createEl('div', { cls: 'diwa-dh-task-quick-actions' });
            this.backlogBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Demote task', 'aria-label': 'Demote task' }
            });
            safeSetIcon(this.backlogBtnEl, 'lucide-inbox', 'inbox');
            this.backlogBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.runTaskAction(() => this.controller.demoteTask(getTaskKey(this.currentTask)));
            });

            this.activateBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Promote to Active', 'aria-label': 'Promote to Active' }
            });
            safeSetIcon(this.activateBtnEl, 'lucide-play', 'play');
            this.activateBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.runTaskAction(() => this.controller.promoteTask(getTaskKey(this.currentTask)));
            });

            this.focusBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Focus task', 'aria-label': 'Focus task' }
            });
            safeSetIcon(this.focusBtnEl, 'lucide-target', 'target');
            this.focusBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.handleFocusAction();
            });

            this.doneBtnEl = this.quickActionsEl.createEl('button', {
                cls: 'diwa-dh-task-quick-btn',
                attr: { title: 'Complete task', 'aria-label': 'Complete task' }
            });
            safeSetIcon(this.doneBtnEl, 'lucide-check', 'check');
            this.doneBtnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.handleToggle();
            });
        }

        this.editBtnEl = actionsEl.createEl('button', {
            cls: 'diwa-dh-task-edit-btn',
            attr: { title: 'More actions', 'aria-label': 'More actions' }
        });
        safeSetIcon(this.editBtnEl, 'lucide-more-horizontal', 'more-horizontal');
        this.editBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openMoreMenu(this.editBtnEl);
        });
        this.linkIconsEl = actionsEl.createEl('div', { cls: 'task-link-icons' });
        this.thoughtIconEl = this.linkIconsEl.createEl('button', {
            cls: 'diwa-dh-task-edit-btn task-thought-icon thought-link-icon',
            attr: {
                title: 'Linked thoughts',
                'aria-label': 'Linked thoughts',
                'aria-expanded': 'false',
                type: 'button',
            },
        }) as HTMLButtonElement;
        this.thoughtIconEl.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleThoughtList();
        });
        this.taskLinkIconEl = this.linkIconsEl.createEl('button', {
            cls: 'diwa-dh-task-edit-btn task-link-icon',
            attr: {
                title: 'Linked items',
                'aria-label': 'Linked items',
                type: 'button',
            },
            text: '🔗 0',
        }) as HTMLButtonElement;
        this.taskLinkIconEl.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openLinkModal();
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
                void this.runTaskAction(() => this.controller.focusTask(getTaskKey(this.currentTask)));
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
                e.preventDefault();
                void this.runTaskAction(() => this.controller.promoteTask(getTaskKey(this.currentTask)));
                return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
                e.preventDefault();
                void this.runTaskAction(() => this.controller.demoteTask(getTaskKey(this.currentTask)));
                return;
            }
            if (e.key !== 'Delete') return;
            this.hooks.onDelete?.(getTaskKey(this.currentTask));
        });
        this.metaEl = this.rootEl.createEl('div', { cls: 'diwa-dh-task-meta' });
        this.metaEl.style.display = 'none';
        this.metaEl.style.width = '100%';
        this.metaEl.style.position = 'static';

        this.updateThoughtToggleLabel();

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
        this.closeInlinePopover();
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

    private async runTaskAction(action: () => Promise<boolean>): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;
        this.rootEl.addClass('is-completing');
        try {
            const ok = await action();
            if (!ok) {
            }
        } catch (error) {
            console.error('[DIWA TaskPane] Error updating task state', error);
        } finally {
            this.rootEl.removeClass('is-completing');
        }
    }

    private async handleFocusAction(): Promise<void> {
        if (this.getWorkflowState(this.currentTask) === 'focus') {
            await this.runTaskAction(() => this.controller.demoteTask(getTaskKey(this.currentTask)));
            return;
        }
        await this.runTaskAction(() => this.controller.focusTask(getTaskKey(this.currentTask)));
    }

    private async handleToggle(): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;
        this.hooks.onToggle?.(this.currentTask);
        await this.runTaskAction(() => this.controller.toggleTask(getTaskKey(this.currentTask)));
    }

    private handleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (
            target.closest('.diwa-dh-task-checkbox')
            || target.closest('.diwa-dh-task-edit-btn')
            || target.closest('.diwa-dh-task-actions')
            || target.closest('.diwa-dh-task-meta')
            || target.closest('.task-thought-icon')
            || target.closest('.thought-overlay')
            || target.closest('.diwa-dh-inline-popover')
        ) return;
        this.triggerRecall();
        this.hooks.onClick?.(this.currentTask);
    }

    private triggerRecall(): void {
        const sourceTaskId = getTaskKey(this.currentTask);
        const linkedThoughts = this.controller.getLinkedThoughtsForTask(sourceTaskId);
        const processor = this.view.plugin.getThoughtProcessor();
        for (const thought of linkedThoughts) {
            processor.recall(thought);
        }
    }

    private openStructuredEditor(): void {
        if (this.destroyed) return;
        this.hooks.onEdit?.(this.currentTask);
        new EditTaskModal(
            this.view.app,
            this.currentTask,
            this.view.plugin.vault,
            this.view.plugin.index,
            () => {
                void this.controller.reconcileTask(this.currentTask.filePath, undefined, this.currentTask);
            }
        ).open();
    }

    private openMoreMenu(anchor: HTMLElement): void {
        if (this.destroyed) return;
        this.openInlinePopover(anchor, (popover) => {
            const actions = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });
            const createOption = (label: string, run: () => void | Promise<void>) => {
                const option = actions.createEl('button', {
                    cls: 'diwa-dh-inline-option',
                    text: label,
                    attr: { type: 'button' },
                });
                option.addEventListener('click', () => {
                    this.closeInlinePopover();
                    void run();
                });
            };

            createOption('Change project', () => this.openProjectPicker(anchor));
            createOption('Change date', () => this.openDuePicker(anchor));
            createOption('Link thought', () => this.openLinkModal());
            createOption('Duplicate', async () => this.duplicateCurrentTask());
            createOption('Delete', () => this.hooks.onDelete?.(getTaskKey(this.currentTask)));
        });
    }

    private makeEditable(): void {
        if (this.rootEl.hasClass('is-editing')) return;
        this.hooks.onEdit?.(this.currentTask);
        const task = this.currentTask;
        this.rootEl.addClass('is-editing');
        this.view._taskPending++;
        this.headerEl.style.display = 'none';
        this.metaEl.style.display = 'none';

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
                this.headerEl.style.display = '';
                this.syncMetaVisibility(this.hasVisibleMetadata(this.currentTask));
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
            } catch (e) {
                console.error('[DIWA TaskPane] Error updating task', e);
                this.headerEl.style.display = '';
                this.syncMetaVisibility(this.hasVisibleMetadata(this.currentTask));
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

        if (force || this.headerEl.style.display === 'none') this.headerEl.style.display = '';
        if (this.rootEl.hasClass('is-completing')) this.rootEl.removeClass('is-completing');

        const wasOverdue = this.isOverdue(prev.due);
        const isOverdue = this.isOverdue(task.due);
        const wasDone = this.isDoneTask(prev);
        const isDone = this.isDoneTask(task);
        const wasFocused = !!prev.focus;
        const isFocused = !!task.focus;
        const prevThoughtIds = getLinkedThoughtIds(prev);
        const nextThoughtIds = getLinkedThoughtIds(task);
        if (force || wasOverdue !== isOverdue) this.rootEl.toggleClass('is-overdue', isOverdue);
        if (force || wasDone !== isDone) this.rootEl.toggleClass('is-done', isDone);
        if (force || wasFocused !== isFocused) this.rootEl.toggleClass('is-focused', isFocused);
        if (force || prev.title !== task.title) this.titleEl.setText(task.title);
        if (force || prev.due !== task.due || prev.project !== task.project || wasOverdue !== isOverdue) {
            this.renderMetaChips(task, isOverdue);
        }
        if (force || !areStringArraysEqual(prevThoughtIds, nextThoughtIds)) {
            this.syncLinkedThoughts(nextThoughtIds);
        }
        if (this.showBucketActions) this.syncQuickActionState(task);
        if (!force && (wasDone !== isDone || wasFocused !== isFocused || prev.bucketStatus !== task.bucketStatus)) {
            this.flashUpdate();
        }
    }

    private renderMetaChips(task: TaskEntry, isOverdue: boolean): void {
        if (!this.projectChipEl) {
            this.projectChipEl = this.metaEl.createEl('button', {
                cls: 'diwa-dh-task-chip diwa-dh-task-chip--project',
                attr: { type: 'button', 'aria-label': 'Edit project' },
            }) as HTMLButtonElement;
            this.projectChipEl.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openProjectPicker(this.projectChipEl!);
            });
        }

        if (!this.dueChipEl) {
            this.dueChipEl = this.metaEl.createEl('button', {
                cls: 'diwa-dh-task-chip diwa-dh-task-chip--due',
                attr: { type: 'button', 'aria-label': 'Edit due date' },
            }) as HTMLButtonElement;
            this.dueChipEl.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openDuePicker(this.dueChipEl!);
            });
        }

        const projectName = task.project?.trim() || '';
        const hasProject = projectName.length > 0;
        if (hasProject) {
            this.projectChipEl.setText(`#${projectName}`);
            this.projectChipEl.style.display = '';
        } else {
            this.projectChipEl.style.display = 'none';
        }

        const hasDue = !!task.due;
        if (hasDue) {
            const dueMoment = moment(task.due, 'YYYY-MM-DD', true);
            const dueLabel = dueMoment.isValid() ? `@${dueMoment.format('MMM D')}` : `@${task.due}`;
            this.dueChipEl.setText(dueLabel);
            this.dueChipEl.style.display = '';
            this.dueChipEl.toggleClass('is-overdue', isOverdue);
        } else {
            this.dueChipEl.style.display = 'none';
            this.dueChipEl.removeClass('is-overdue');
        }

        this.syncMetaVisibility(hasProject || hasDue);
    }

    private syncMetaVisibility(visible: boolean): void {
        if (visible) {
            this.metaEl.style.display = 'block';
            this.metaEl.style.width = '100%';
            this.metaEl.style.position = 'static';
            return;
        }
        this.metaEl.style.display = 'none';
    }

    private hasVisibleMetadata(task: TaskEntry): boolean {
        return !!(task.project?.trim() || task.due);
    }

    private isOverdue(due: string): boolean {
        return !!(due && moment(due, 'YYYY-MM-DD').isBefore(moment().startOf('day'), 'day'));
    }

    private isDoneTask(task: TaskEntry): boolean {
        return task.status === 'done' || task.state === 'done' || task.bucketStatus === 'done' || task.lifecycleStatus === 'done';
    }

    private getWorkflowState(task: TaskEntry): 'backlog' | 'active' | 'focus' | 'done' {
        if (this.isDoneTask(task)) return 'done';
        const isActive =
            task.bucketStatus === 'active'
            || task.status === 'waiting'
            || task.state === 'active'
            || task.lifecycleStatus === 'active';
        if (isActive && !!task.focus) return 'focus';
        if (isActive) return 'active';
        return 'backlog';
    }

    private syncQuickActionState(task: TaskEntry): void {
        if (!this.showBucketActions) return;
        const state = this.getWorkflowState(task);

        const showActivate = state === 'backlog';
        const showBacklog = state === 'active';
        const showFocusToggle = state === 'active' || state === 'focus';
        const showDone = true;

        this.activateBtnEl?.toggleClass('is-hidden', !showActivate);
        this.backlogBtnEl?.toggleClass('is-hidden', !showBacklog);
        this.focusBtnEl?.toggleClass('is-hidden', !showFocusToggle);
        this.doneBtnEl?.toggleClass('is-hidden', !showDone);

        if (this.focusBtnEl) {
            const isFocusState = state === 'focus';
            this.focusBtnEl.toggleClass('is-active', isFocusState);
            this.focusBtnEl.setAttr('title', isFocusState ? 'Unfocus task' : 'Focus task');
            this.focusBtnEl.setAttr('aria-label', isFocusState ? 'Unfocus task' : 'Focus task');
            safeSetIcon(this.focusBtnEl, isFocusState ? 'lucide-target' : 'lucide-target', 'target');
        }

        if (this.doneBtnEl) {
            const isDone = state === 'done';
            this.doneBtnEl.toggleClass('is-active', isDone);
            this.doneBtnEl.setAttr('title', isDone ? 'Reopen task' : 'Complete task');
            this.doneBtnEl.setAttr('aria-label', isDone ? 'Reopen task' : 'Complete task');
        }

        this.activateBtnEl?.toggleClass('is-active', state === 'active');
        this.backlogBtnEl?.toggleClass('is-active', state === 'backlog');
    }

    private flashUpdate(): void {
        this.rootEl.addClass('is-updated');
        if (this.flashTimer !== null) window.clearTimeout(this.flashTimer);
        this.flashTimer = window.setTimeout(() => {
            this.rootEl.removeClass('is-updated');
            this.flashTimer = null;
        }, 420);
    }

    private toggleThoughtList(): void {
        this.openLinkModal();
    }

    private updateThoughtToggleLabel(): void {
        const count = this.linkedThoughtIds.length;
        const label = `${count} ${count === 1 ? 'thought' : 'thoughts'}`;
        this.thoughtIconEl.setText(`💬 ${count}`);
        this.thoughtIconEl.setAttr('title', `Linked thoughts (${label})`);
        this.thoughtIconEl.setAttr('aria-label', `Linked thoughts (${label})`);
        const taskCount = this.getRelatedTaskCount();
        this.taskLinkIconEl.setText(`🔗 ${taskCount}`);
        this.taskLinkIconEl.setAttr('title', `Linked tasks (${taskCount})`);
        this.taskLinkIconEl.setAttr('aria-label', `Linked tasks (${taskCount})`);
        const visible = count > 0 || taskCount > 0;
        this.thoughtIconEl.style.display = visible ? '' : 'none';
        this.taskLinkIconEl.style.display = visible ? '' : 'none';
        if (this.linkIconsEl) this.linkIconsEl.style.display = visible ? '' : 'none';
    }

    private syncLinkedThoughts(thoughtIds: string[]): void {
        this.linkedThoughtIds = [...thoughtIds];
        this.updateThoughtToggleLabel();
    }

    private getRelatedTaskCount(): number {
        const sourceTaskId = getTaskKey(this.currentTask);
        const related = new Set<string>();
        for (const thought of this.controller.getLinkedThoughtsForTask(sourceTaskId)) {
            for (const task of this.controller.getLinkedTasksForThought(thought.filePath)) {
                const key = getTaskKey(task);
                if (key === sourceTaskId) continue;
                related.add(key);
            }
        }
        return related.size;
    }

    private openLinkModal(): void {
        this.getLinkModal().open({ taskId: getTaskKey(this.currentTask) }, this.getThoughtOverlayHostElement());
    }

    private resolveThought(thoughtId: string): ThoughtEntry | null {
        return this.view.plugin.getThoughtController().getThought(thoughtId);
    }

    private thoughtSnippet(thoughtId: string): string {
        const thought = this.resolveThought(thoughtId);
        const fallback = thoughtId.split('/').pop() || thoughtId;
        const raw = (thought?.body || thought?.title || fallback).split('\n').find((line) => line.trim()) || fallback;
        const cleaned = raw.trim();
        return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
    }

    getLinkedThoughtIdsForOverlay(): string[] {
        return [...this.linkedThoughtIds];
    }

    getThoughtSnippetForOverlay(thoughtId: string): string {
        return this.thoughtSnippet(thoughtId);
    }

    getThoughtContentForOverlay(thoughtId: string): string {
        const thought = this.resolveThought(thoughtId);
        const fallback = thoughtId.split('/').pop() || thoughtId;
        const full = (thought?.body || thought?.title || fallback).trim();
        return full || fallback;
    }

    getThoughtOverlayHostElement(): HTMLElement {
        return this.rootEl.closest('.diwa-dh-root') as HTMLElement
            || this.rootEl.closest('.diwa-gawa-desktop') as HTMLElement
            || this.rootEl.closest('.diwa-view-content') as HTMLElement
            || document.body;
    }

    setThoughtOverlayActive(active: boolean): void {
        this.thoughtIconEl.toggleClass('is-active', active);
        this.thoughtIconEl.setAttr('aria-expanded', active ? 'true' : 'false');
    }

    openLinkedThoughtForOverlay(thoughtId: string): void {
        const thought = this.resolveThought(thoughtId);
        if (!thought) return;
        const file = this.view.app.vault.getAbstractFileByPath(thought.filePath);
        if (file instanceof TFile) void this.view.app.workspace.getLeaf(false).openFile(file);
    }

    async createThoughtFromOverlay(content: string): Promise<boolean> {
        const thoughtText = content.trim();
        if (!thoughtText) return false;
        try {
            const ok = await this.controller.createThoughtFromTask(getTaskKey(this.currentTask), thoughtText);
            if (!ok) {
                return false;
            }
            const latestTask = this.controller.getTask(getTaskKey(this.currentTask));
            if (latestTask) this.applyTask(latestTask, false);
            this.flashUpdate();
            return true;
        } catch (error) {
            console.error('[DIWA TaskPane] Error creating thought from task', error);
            return false;
        }
    }

    async unlinkThoughtFromOverlay(thoughtId: string): Promise<boolean> {
        return this.unlinkThought(thoughtId);
    }

    private getThoughtOverlay(): ThoughtOverlay {
        if (!TaskItemView.sharedThoughtOverlay) {
            TaskItemView.sharedThoughtOverlay = new ThoughtOverlay(
                this.view.app,
                this.view.plugin.getThoughtController(),
                this.controller,
                (taskId, active) => {
                    const currentTaskKey = getTaskKey(this.currentTask);
                    if (taskId !== this.currentTask.filePath && taskId !== currentTaskKey) return;
                    this.setThoughtOverlayActive(active);
                },
            );
        }
        return TaskItemView.sharedThoughtOverlay;
    }

    private getLinkModal(): LinkModal {
        if (!TaskItemView.sharedLinkModal) {
            TaskItemView.sharedLinkModal = LinkModal.getShared(
                this.view.app,
                this.view.plugin,
                this.view.plugin.getThoughtController(),
                this.controller,
                this.view.plugin.getThoughtProcessor(),
            );
        }
        return TaskItemView.sharedLinkModal;
    }

    private async linkExistingThought(thoughtId: string): Promise<void> {
        const ok = await this.controller.linkThoughtToTask(thoughtId, getTaskKey(this.currentTask));
        if (!ok) {
            return;
        }
        this.closeInlinePopover();
        const latestTask = this.controller.getTask(getTaskKey(this.currentTask));
        if (latestTask) this.applyTask(latestTask, false);
        this.flashUpdate();
    }

    private async unlinkThought(thoughtId: string): Promise<boolean> {
        const ok = await this.controller.unlinkThoughtFromTask(thoughtId, getTaskKey(this.currentTask));
        if (!ok) {
            return false;
        }
        const latestTask = this.controller.getTask(getTaskKey(this.currentTask));
        if (latestTask) this.applyTask(latestTask, false);
        this.flashUpdate();
        return true;
    }

    private openThoughtLinkPicker(anchor: HTMLElement): void {
        const linked = new Set(this.linkedThoughtIds);
        const thoughts = this.view.plugin.getThoughtProcessor()
            .getTopThoughts(500)
            .sort((a: ThoughtEntry, b: ThoughtEntry) => (b.modified || '').localeCompare(a.modified || ''));

        this.openInlinePopover(anchor, (popover) => {
            const search = popover.createEl('input', {
                cls: 'diwa-dh-inline-popover-search',
                attr: {
                    type: 'text',
                    placeholder: 'Link thought...',
                    spellcheck: 'false',
                },
            }) as HTMLInputElement;
            const list = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });

            const renderOptions = (query: string) => {
                const q = query.trim().toLowerCase();
                list.empty();
                let visibleCount = 0;

                for (const thought of thoughts) {
                    if (linked.has(thought.filePath)) continue;
                    const haystack = `${thought.title} ${thought.body}`.toLowerCase();
                    if (q && !haystack.includes(q)) continue;
                    const option = list.createEl('button', {
                        cls: 'diwa-dh-inline-option',
                        text: this.thoughtSnippet(thought.filePath),
                        attr: { type: 'button' },
                    });
                    option.addEventListener('click', () => {
                        void this.linkExistingThought(thought.filePath);
                    });
                    visibleCount++;
                }

                if (visibleCount === 0) {
                    list.createEl('div', {
                        cls: 'diwa-dh-inline-empty',
                        text: q ? 'No matching thoughts' : 'No available thoughts',
                    });
                }
            };

            renderOptions('');
            search.addEventListener('input', () => renderOptions(search.value));
            setTimeout(() => search.focus(), 30);
        });
    }

    private openProjectPicker(anchor: HTMLElement): void {
        const projects = (Array.from(this.view.plugin.index.projectIndex.values()) as Array<{ name: string; status: string }>)
            .filter((project) => project.status !== 'archived')
            .sort((a, b) => a.name.localeCompare(b.name));

        this.openInlinePopover(anchor, (popover) => {
            const search = popover.createEl('input', {
                cls: 'diwa-dh-inline-popover-search',
                attr: {
                    type: 'text',
                    placeholder: 'Find project…',
                    spellcheck: 'false',
                },
            }) as HTMLInputElement;
            const list = popover.createEl('div', { cls: 'diwa-dh-inline-popover-list' });

            const renderOptions = (query: string) => {
                const q = query.trim().toLowerCase();
                list.empty();

                const clearBtn = list.createEl('button', {
                    cls: 'diwa-dh-inline-option',
                    text: '#none',
                    attr: { type: 'button' },
                });
                clearBtn.toggleClass('is-active', !this.currentTask.project);
                clearBtn.addEventListener('click', () => {
                    void this.applyInlineMetadata({ project: null });
                });

                let visibleCount = 0;
                for (const project of projects) {
                    if (q && !project.name.toLowerCase().includes(q)) continue;
                    const option = list.createEl('button', {
                        cls: 'diwa-dh-inline-option',
                        text: `#${project.name}`,
                        attr: { type: 'button' },
                    });
                    option.toggleClass('is-active', this.currentTask.project === project.name);
                    option.addEventListener('click', () => {
                        void this.applyInlineMetadata({ project: project.name });
                    });
                    visibleCount++;
                }

                if (visibleCount === 0 && q) {
                    list.createEl('div', {
                        cls: 'diwa-dh-inline-empty',
                        text: 'No matching projects',
                    });
                }
            };

            renderOptions('');
            search.addEventListener('input', () => renderOptions(search.value));
            setTimeout(() => search.focus(), 30);
        });
    }

    private openDuePicker(anchor: HTMLElement): void {
        this.openInlinePopover(anchor, (popover) => {
            const quickActions = popover.createEl('div', { cls: 'diwa-dh-inline-quick-actions' });
            const createQuickBtn = (label: string, onClick: () => void) => {
                const btn = quickActions.createEl('button', {
                    cls: 'diwa-dh-inline-quick-btn',
                    text: label,
                    attr: { type: 'button' },
                });
                btn.addEventListener('click', onClick);
            };

            const baseDate = this.currentTask.due && moment(this.currentTask.due, 'YYYY-MM-DD', true).isValid()
                ? moment(this.currentTask.due, 'YYYY-MM-DD', true)
                : moment().startOf('day');

            createQuickBtn('+1d', () => {
                void this.applyInlineMetadata({ dueDate: baseDate.clone().add(1, 'day').format('YYYY-MM-DD') });
            });
            createQuickBtn('Tomorrow', () => {
                void this.applyInlineMetadata({ dueDate: moment().startOf('day').add(1, 'day').format('YYYY-MM-DD') });
            });
            createQuickBtn('Next Week', () => {
                void this.applyInlineMetadata({ dueDate: moment().startOf('day').add(7, 'day').format('YYYY-MM-DD') });
            });
            createQuickBtn('Clear', () => {
                void this.applyInlineMetadata({ dueDate: null });
            });

            const picker = popover.createEl('input', {
                cls: 'diwa-dh-inline-date-input',
                attr: { type: 'date', 'aria-label': 'Set due date' },
            }) as HTMLInputElement;
            if (this.currentTask.due && moment(this.currentTask.due, 'YYYY-MM-DD', true).isValid()) {
                picker.value = this.currentTask.due;
            }
            picker.addEventListener('change', () => {
                const nextDue = picker.value.trim() || null;
                void this.applyInlineMetadata({ dueDate: nextDue });
            });
            setTimeout(() => {
                picker.focus();
                if (typeof picker.showPicker === 'function') {
                    try {
                        picker.showPicker();
                    } catch {
                        // ignore — some platforms require a direct user gesture
                    }
                }
            }, 30);
        });
    }

    private openInlinePopover(anchor: HTMLElement, render: (popover: HTMLElement) => void): void {
        this.closeInlinePopover();
        // Use the element's own document/window so popovers open in the correct
        // Obsidian window (e.g. when Gawa is in a pop-out window).
        const win = this.rootEl.win;
        const doc = this.rootEl.doc;
        this.popoverWin = win;
        const popover = doc.body.createEl('div', { cls: 'diwa-dh-inline-popover' });
        this.popoverEl = popover;
        render(popover);

        win.requestAnimationFrame(() => {
            if (!this.popoverEl || this.popoverEl !== popover || this.destroyed) return;
            const anchorRect = anchor.getBoundingClientRect();
            const popoverW = popover.offsetWidth;
            const popoverH = popover.offsetHeight;
            const vw = win.innerWidth;
            const vh = win.innerHeight;
            const gap = 6;
            const margin = 8;
            // Prefer below anchor; fall back to above if it would overflow the viewport bottom.
            let top = anchorRect.bottom + gap;
            if (top + popoverH > vh - margin) {
                const aboveTop = anchorRect.top - popoverH - gap;
                top = aboveTop >= margin ? aboveTop : vh - popoverH - margin;
            }
            // Left-align with anchor; clamp to viewport edges.
            let left = anchorRect.left;
            if (left + popoverW > vw - margin) left = vw - popoverW - margin;
            if (left < margin) left = margin;
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
        });

        this.popoverOutsideHandler = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (popover.contains(target) || anchor.contains(target)) return;
            this.closeInlinePopover();
        };
        this.popoverEscapeHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            this.closeInlinePopover();
            this.rootEl.focus();
        };
        win.addEventListener('mousedown', this.popoverOutsideHandler, true);
        win.addEventListener('keydown', this.popoverEscapeHandler, true);
    }

    private closeInlinePopover(): void {
        const win = this.popoverWin;
        if (this.popoverOutsideHandler) {
            win?.removeEventListener('mousedown', this.popoverOutsideHandler, true);
            this.popoverOutsideHandler = null;
        }
        if (this.popoverEscapeHandler) {
            win?.removeEventListener('keydown', this.popoverEscapeHandler, true);
            this.popoverEscapeHandler = null;
        }
        if (this.popoverEl) {
            this.popoverEl.remove();
            this.popoverEl = null;
        }
        this.popoverWin = null;
    }

    private async duplicateCurrentTask(): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;

        const source = this.currentTask;
        const bodyText = (source.body || source.title || '').trim();
        if (!bodyText) {
            return;
        }

        this.rootEl.addClass('is-completing');
        try {
            this.view.plugin.refreshCoordinator.suppressNotifyRefresh(700);
            const created = await this.view.plugin.vault.createTaskFile(
                bodyText,
                [...(source.context || [])],
                source.due || undefined,
                source.project || undefined,
                {
                    priority: source.priority ?? undefined,
                    energy: source.energy ?? undefined,
                    recurrence: source.recurrence ?? undefined,
                    status: 'open',
                },
            );

            await this.view.plugin.refreshCoordinator.reindexFile(created);
            const indexedTask = this.view.plugin.index.taskIndex.get(created.path);
            if (indexedTask) {
                this.controller.addTask(indexedTask);
            } else {
                this.controller.syncFromIndex();
            }
        } catch (error) {
            console.error('[DIWA TaskPane] Error duplicating task', error);
        } finally {
            this.rootEl.removeClass('is-completing');
        }
    }

    private async applyInlineMetadata(updates: { project?: string | null; dueDate?: string | null }): Promise<void> {
        if (this.destroyed) return;
        if (this.rootEl.hasClass('is-completing')) return;
        this.closeInlinePopover();
        this.rootEl.addClass('is-completing');
        try {
            const ok = await this.controller.updateTaskMetadata(getTaskKey(this.currentTask), updates);
            if (!ok) {
                return;
            }
            this.flashUpdate();
        } catch (error) {
            console.error('[DIWA TaskPane] Error updating task metadata', error);
        } finally {
            this.rootEl.removeClass('is-completing');
        }
    }
}

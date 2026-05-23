import { Notice, moment, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskBucketStatus, TaskEntry } from '../types';

export interface TaskPanePort {
    paneId: string;
    addTask(task: TaskEntry): void;
    updateTask(task: TaskEntry): void;
    removeTask(taskId: string, filePath?: string): void;
    syncTasks(tasks: TaskEntry[]): void;
    destroy(): void;
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

function resolveTaskBucket(task: TaskEntry): TaskBucketStatus {
    if (task.bucketStatus) return task.bucketStatus;
    if (task.status === 'done' || task.lifecycleStatus === 'done') return 'done';
    if (task.status === 'waiting' || task.lifecycleStatus === 'active') return 'active';
    return 'backlog';
}

function mapBucketToStatus(bucket: TaskBucketStatus): TaskEntry['status'] {
    if (bucket === 'done') return 'done';
    if (bucket === 'active') return 'waiting';
    return 'open';
}

function mapBucketToLifecycle(bucket: TaskBucketStatus): TaskEntry['lifecycleStatus'] {
    if (bucket === 'done') return 'done';
    if (bucket === 'active') return 'active';
    return 'planned';
}

type WorkflowState = 'backlog' | 'active' | 'focus' | 'done';
type WorkflowAction = 'promote' | 'focus' | 'demote' | 'complete';

const MAX_FOCUS_TASKS = 3;

function resolveWorkflowState(task: TaskEntry): WorkflowState {
    const bucket = resolveTaskBucket(task);
    if (bucket === 'done') return 'done';
    if (bucket === 'active' && !!task.focus) return 'focus';
    if (bucket === 'active') return 'active';
    return 'backlog';
}

function resolveNextWorkflowState(current: WorkflowState, action: WorkflowAction): WorkflowState {
    if (action === 'complete') return 'done';
    if (action === 'focus') return 'focus';
    if (action === 'promote') {
        if (current === 'backlog' || current === 'focus' || current === 'done') return 'active';
        return 'active';
    }
    if (action === 'demote') {
        if (current === 'focus') return 'active';
        if (current === 'active' || current === 'done') return 'backlog';
        return 'backlog';
    }
    return current;
}

export class TaskController {
    private paneRegistry = new Map<string, TaskPanePort>();

    constructor(private plugin: DiwaPlugin) {}

    registerPane(pane: TaskPanePort): void {
        const existing = this.paneRegistry.get(pane.paneId);
        if (existing) {
            if (existing === pane) {
                pane.syncTasks(this.getIndexSnapshot());
                return;
            }
            console.warn('[DIWA TaskController] replacing existing pane registration', { paneId: pane.paneId });
            try {
                existing.destroy();
            } catch (error) {
                console.warn('[DIWA TaskController] failed to destroy replaced pane', { paneId: pane.paneId, error });
            }
        }
        this.paneRegistry.set(pane.paneId, pane);
        pane.syncTasks(this.getIndexSnapshot());
    }

    unregisterPane(paneId: string, pane?: TaskPanePort): void {
        if (pane) {
            const current = this.paneRegistry.get(paneId);
            if (current && current !== pane) return;
        }
        this.paneRegistry.delete(paneId);
    }

    syncFromIndex(): void {
        const snapshot = this.getIndexSnapshot();
        for (const pane of this.paneRegistry.values()) pane.syncTasks(snapshot);
    }

    syncPane(paneId: string): void {
        const pane = this.paneRegistry.get(paneId);
        if (!pane) {
            console.warn('[DIWA TaskController] syncPane called for unregistered pane', { paneId });
            return;
        }
        pane.syncTasks(this.getIndexSnapshot());
    }

    addTask(task: TaskEntry): void {
        this.plugin.index.taskIndex.set(task.filePath, task);
        for (const pane of this.paneRegistry.values()) pane.addTask(task);
    }

    updateTask(task: TaskEntry): void {
        this.plugin.index.taskIndex.set(task.filePath, task);
        for (const pane of this.paneRegistry.values()) pane.updateTask(task);
    }

    removeTask(taskId: string): void {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] removeTask called for unknown task', { taskId });
            for (const pane of this.paneRegistry.values()) pane.removeTask(taskId, taskId);
            return;
        }
        this.plugin.index.taskIndex.delete(resolved.filePath);
        for (const pane of this.paneRegistry.values()) pane.removeTask(resolved.taskKey, resolved.filePath);
    }

    getTask(taskId: string): TaskEntry | null {
        return this.resolveTaskRecord(taskId)?.task ?? null;
    }

    async moveTaskToBucket(
        taskId: string,
        bucket: TaskBucketStatus,
        options?: { focus?: boolean }
    ): Promise<boolean> {
        if (bucket === 'done') return this.completeTask(taskId);
        if (bucket === 'active' && options?.focus) return this.focusTask(taskId);
        if (bucket === 'active') return this.promoteTask(taskId);
        if (bucket === 'backlog') return this.demoteTask(taskId);
        return false;
    }

    async promoteTask(taskId: string): Promise<boolean> {
        return this.applyWorkflowAction(taskId, 'promote');
    }

    async focusTask(taskId: string): Promise<boolean> {
        return this.applyWorkflowAction(taskId, 'focus');
    }

    async demoteTask(taskId: string): Promise<boolean> {
        return this.applyWorkflowAction(taskId, 'demote');
    }

    async completeTask(taskId: string): Promise<boolean> {
        return this.applyWorkflowAction(taskId, 'complete');
    }

    async setTaskFocus(taskId: string, focus: boolean): Promise<boolean> {
        if (focus) return this.focusTask(taskId);
        const task = this.getTask(taskId);
        if (!task) {
            console.warn('[DIWA TaskController] setTaskFocus called for unknown task', { taskId, focus });
            return false;
        }
        const currentState = resolveWorkflowState(task);
        if (currentState === 'focus') return this.demoteTask(taskId);
        return true;
    }

    async toggleTask(taskId: string): Promise<boolean> {
        const task = this.getTask(taskId);
        if (!task) {
            console.warn('[DIWA TaskController] toggleTask called for unknown task', { taskId });
            return false;
        }
        const currentState = resolveWorkflowState(task);
        return currentState === 'done' ? this.demoteTask(taskId) : this.completeTask(taskId);
    }

    async updateTaskMetadata(
        taskId: string,
        updates: { project?: string | null; dueDate?: string | null },
    ): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] updateTaskMetadata called for unknown task', { taskId, updates });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const now = Date.now();
        const due = updates.dueDate !== undefined ? (updates.dueDate || '') : task.due;
        const project = updates.project !== undefined ? (updates.project || undefined) : task.project;
        const updatedTask: TaskEntry = {
            ...task,
            due,
            project,
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            updatedAt: new Date(now).toISOString(),
            lastUpdate: now,
        };
        return this.persistTask(updatedTask);
    }

    async reconcileTask(
        filePath: string,
        expectedStatus?: TaskEntry['status'],
        fallbackTask?: TaskEntry,
    ): Promise<void> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const indexed = this.plugin.index.taskIndex.get(filePath);
            if (indexed && (!expectedStatus || indexed.status === expectedStatus)) {
                this.updateTask(indexed);
                return;
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
            await this.reindexTask(filePath);
        }

        const latest = this.plugin.index.taskIndex.get(filePath);
        if (latest) {
            this.updateTask(latest);
            return;
        }
        if (fallbackTask && (!expectedStatus || fallbackTask.status === expectedStatus)) {
            this.updateTask(fallbackTask);
            return;
        }
        this.removeTask(filePath);
    }

    private resolveTaskRecord(taskId: string): { filePath: string; task: TaskEntry; taskKey: string } | null {
        const byPath = this.plugin.index.taskIndex.get(taskId);
        if (byPath) return { filePath: byPath.filePath, task: byPath, taskKey: getTaskKey(byPath) };

        for (const task of this.plugin.index.taskIndex.values()) {
            if (getTaskKey(task) === taskId) {
                return { filePath: task.filePath, task, taskKey: getTaskKey(task) };
            }
        }
        return null;
    }

    private async reindexTask(filePath: string): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.plugin.refreshCoordinator.reindexFile(file);
    }

    private async persistTask(task: TaskEntry): Promise<boolean> {
        this.plugin.refreshCoordinator.suppressNotifyRefresh(800);
        const ok = await this.plugin.vault.updateTaskEntry(task.filePath, {
            title: task.title,
            bodyText: task.body || task.title,
            dueDate: task.due || null,
            recurrence: task.recurrence || null,
            priority: task.priority || null,
            energy: task.energy || null,
            status: task.status,
            contexts: task.context || [],
            project: task.project || null,
            bucketStatus: task.bucketStatus ?? null,
            focus: task.focus ?? null,
        });
        if (!ok) return false;
        this.updateTask(task);
        await this.reindexTask(task.filePath);
        await this.reconcileTask(task.filePath, task.status, task);
        return true;
    }

    private async applyWorkflowAction(taskId: string, action: WorkflowAction): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] workflow action called for unknown task', { taskId, action });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const currentState = resolveWorkflowState(task);
        const nextState = resolveNextWorkflowState(currentState, action);

        if (action === 'focus' && nextState === 'focus' && currentState !== 'focus') {
            const focusedCount = this.getFocusedTaskCount(getTaskKey(task));
            if (focusedCount >= MAX_FOCUS_TASKS) {
                new Notice(`Focus is limited to ${MAX_FOCUS_TASKS} tasks.`, 1800);
                return false;
            }
        }

        if (nextState === currentState) return true;
        const updatedTask = this.buildTaskForState(task, nextState);
        return this.persistTask(updatedTask);
    }

    private buildTaskForState(task: TaskEntry, state: WorkflowState): TaskEntry {
        const now = Date.now();
        const isoNow = new Date(now).toISOString();
        const nextBucket: TaskBucketStatus = state === 'done' ? 'done' : (state === 'backlog' ? 'backlog' : 'active');
        const nextFocus = state === 'focus';
        return {
            ...task,
            bucketStatus: nextBucket,
            focus: nextFocus,
            status: mapBucketToStatus(nextBucket),
            lifecycleStatus: mapBucketToLifecycle(nextBucket),
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            updatedAt: isoNow,
            completedAt: state === 'done' ? isoNow : undefined,
            lastUpdate: now,
        };
    }

    private getFocusedTaskCount(excludingTaskKey?: string): number {
        let count = 0;
        for (const task of this.plugin.index.taskIndex.values()) {
            const taskKey = getTaskKey(task);
            if (excludingTaskKey && taskKey === excludingTaskKey) continue;
            if (resolveWorkflowState(task) === 'focus') count++;
        }
        return count;
    }

    private getIndexSnapshot(): TaskEntry[] {
        return Array.from(this.plugin.index.taskIndex.values());
    }
}

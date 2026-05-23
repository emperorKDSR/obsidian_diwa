import { moment, TFile } from 'obsidian';
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
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] moveTaskToBucket called for unknown task', { taskId, bucket });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const nextBucket = bucket;
        const nextFocus = nextBucket === 'done'
            ? false
            : (options?.focus ?? task.focus ?? false);
        const now = Date.now();
        const isoNow = new Date(now).toISOString();
        const updatedTask: TaskEntry = {
            ...task,
            bucketStatus: nextBucket,
            focus: nextFocus,
            status: mapBucketToStatus(nextBucket),
            lifecycleStatus: mapBucketToLifecycle(nextBucket),
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            updatedAt: isoNow,
            completedAt: nextBucket === 'done' ? isoNow : undefined,
            lastUpdate: now,
        };
        return this.persistTask(updatedTask);
    }

    async setTaskFocus(taskId: string, focus: boolean): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] setTaskFocus called for unknown task', { taskId, focus });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const bucket = resolveTaskBucket(task) === 'done' ? 'active' : resolveTaskBucket(task);
        return this.moveTaskToBucket(getTaskKey(task), bucket, { focus });
    }

    async toggleTask(taskId: string): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] toggleTask called for unknown task', { taskId });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const currentBucket = resolveTaskBucket(task);
        const nextBucket: TaskBucketStatus = currentBucket === 'done' ? 'backlog' : 'done';
        return this.moveTaskToBucket(taskId, nextBucket, { focus: false });
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

    private getIndexSnapshot(): TaskEntry[] {
        return Array.from(this.plugin.index.taskIndex.values());
    }
}

import { moment, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskEntry } from '../types';

export interface TaskPanePort {
    paneId: string;
    addTask(task: TaskEntry): void;
    updateTask(task: TaskEntry): void;
    removeTask(taskId: string, filePath?: string): void;
    syncTasks(tasks: TaskEntry[]): void;
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

export class TaskController {
    private paneRegistry = new Map<string, TaskPanePort>();

    constructor(private plugin: DiwaPlugin) {}

    registerPane(pane: TaskPanePort): void {
        if (this.paneRegistry.has(pane.paneId)) {
            console.warn('[DIWA TaskController] replacing existing pane registration', { paneId: pane.paneId });
        }
        this.paneRegistry.set(pane.paneId, pane);
        pane.syncTasks(this.getIndexSnapshot());
    }

    unregisterPane(paneId: string): void {
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

    async toggleTask(taskId: string): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] toggleTask called for unknown task', { taskId });
            return false;
        }

        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const nextStatus: TaskEntry['status'] = task.status === 'done' ? 'open' : 'done';
        this.plugin.refreshCoordinator.suppressNotifyRefresh(800);
        const ok = await this.plugin.vault.updateTaskEntry(task.filePath, {
            title: task.title,
            dueDate: task.due || null,
            recurrence: task.recurrence || null,
            priority: task.priority || null,
            energy: task.energy || null,
            status: nextStatus,
            contexts: task.context || [],
            project: task.project || null,
        });
        if (!ok) return false;

        const now = Date.now();
        const updatedTask: TaskEntry = {
            ...task,
            status: nextStatus,
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            lastUpdate: now,
        };
        this.updateTask(updatedTask);
        await this.reindexTask(task.filePath);
        await this.reconcileTask(task.filePath, nextStatus, updatedTask);
        return true;
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

    private getIndexSnapshot(): TaskEntry[] {
        return Array.from(this.plugin.index.taskIndex.values());
    }
}

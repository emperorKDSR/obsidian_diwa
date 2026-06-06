import { Notice, moment, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskBucketStatus, TaskEntry, ThoughtEntry } from '../types';

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
    const legacyState = String(task.state || '').toLowerCase();
    if (task.bucketStatus) return task.bucketStatus;
    if (task.status === 'done' || legacyState === 'done' || task.lifecycleStatus === 'done') return 'done';
    if (task.status === 'waiting' || legacyState === 'active' || task.lifecycleStatus === 'active') return 'active';
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

function uniqueIds(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getTaskThoughtIds(task: TaskEntry): string[] {
    return uniqueIds([
        ...(task.sourceThoughtIds ?? []),
        ...(task.links?.thoughts ?? []),
    ]);
}

function getThoughtTaskIds(thought: ThoughtEntry): string[] {
    return uniqueIds(thought.links?.tasks ?? []);
}

export class TaskController {
    private paneRegistry = new Map<string, TaskPanePort>();
    // Backward-compatible pane list expected by some runtime/debug paths.
    panes: TaskPanePort[] = [];

    constructor(private plugin: DiwaPlugin) {
        this.syncPaneList();
    }

    private syncPaneList(): void {
        this.panes = Array.from(this.paneRegistry.values());
    }

    registerPane(pane: TaskPanePort): void {
        const existing = this.paneRegistry.get(pane.paneId);
        if (existing) {
            if (existing === pane) {
                this.syncPaneList();
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
        this.syncPaneList();
        console.log('Panes:', this.panes);
        pane.syncTasks(this.getIndexSnapshot());
    }

    unregisterPane(paneId: string, pane?: TaskPanePort): void {
        if (pane) {
            const current = this.paneRegistry.get(paneId);
            if (current && current !== pane) return;
        }
        this.paneRegistry.delete(paneId);
        this.syncPaneList();
    }

    syncFromIndex(): void {
        const snapshot = this.getIndexSnapshot();
        console.log('[DIWA TaskController] syncFromIndex', { snapshotSize: snapshot.length, paneCount: this.panes.length });
        for (const pane of this.panes) pane.syncTasks(snapshot);
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
        const normalizedTask = this.normalizeTask(task, 'addTask');
        if (!normalizedTask) return;
        this.plugin.index.taskIndex.set(normalizedTask.filePath, normalizedTask);
        for (const pane of this.panes) pane.addTask(normalizedTask);
    }

    updateTask(task: TaskEntry): void {
        const normalizedTask = this.normalizeTask(task, 'updateTask');
        if (!normalizedTask) return;
        this.plugin.index.taskIndex.set(normalizedTask.filePath, normalizedTask);
        for (const pane of this.panes) pane.updateTask(normalizedTask);
    }

    removeTask(taskId: string): void {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] removeTask called for unknown task', { taskId });
            for (const pane of this.panes) pane.removeTask(taskId, taskId);
            return;
        }
        this.plugin.index.removeTaskFile(resolved.filePath);
        for (const pane of this.panes) pane.removeTask(resolved.taskKey, resolved.filePath);
    }

    getTask(taskId: string): TaskEntry | null {
        return this.resolveTaskRecord(taskId)?.task ?? null;
    }

    getAllTasks(): TaskEntry[] {
        return this.getIndexSnapshot();
    }

    getThought(thoughtId: string): ThoughtEntry | null {
        return this.resolveThoughtRecord(thoughtId)?.thought ?? null;
    }

    getLinkedThoughtsForTask(taskId: string): ThoughtEntry[] {
        const task = this.getTask(taskId);
        if (!task) return [];
        const linkedThoughtIds = getTaskThoughtIds(task);
        const linkedThoughts: ThoughtEntry[] = [];
        const thoughtController = this.plugin.getThoughtController();
        for (const thoughtId of linkedThoughtIds) {
            const thought = thoughtController.getThought(thoughtId);
            if (thought) linkedThoughts.push(thought);
        }
        return linkedThoughts;
    }

    getLinkedTasksForThought(thoughtId: string): TaskEntry[] {
        const thought = this.getThought(thoughtId);
        if (!thought) return [];
        const linkedTaskPathIds = uniqueIds([
            ...getThoughtTaskIds(thought),
            ...Array.from(this.plugin.index.taskIndex.values())
                .filter((task) => getTaskThoughtIds(task).includes(thought.filePath))
                .map((task) => task.filePath),
        ]);
        const linkedTasks: TaskEntry[] = [];
        for (const taskPath of linkedTaskPathIds) {
            const task = this.plugin.index.taskIndex.get(taskPath);
            if (task) linkedTasks.push(task);
        }
        return linkedTasks;
    }

    async convertThoughtToTask(thoughtId: string): Promise<boolean> {
        const resolvedThought = this.resolveThoughtRecord(thoughtId);
        if (!resolvedThought) {
            console.warn('[DIWA TaskController] convertThoughtToTask called for unknown thought', { thoughtId });
            return false;
        }

        const existingLinkedTasks = this.getLinkedTasksForThought(resolvedThought.filePath);
        if (existingLinkedTasks.length > 0) {
            return true;
        }

        const sourceText = (resolvedThought.thought.body || resolvedThought.thought.title || '').trim();
        if (!sourceText) {
            return false;
        }

        try {
            this.plugin.refreshCoordinator.suppressNotifyRefresh(800);
            const created = await this.plugin.vault.createTaskFile(
                sourceText,
                [...(resolvedThought.thought.context || [])],
                undefined,
                { status: 'open' },
            );
            await this.reindexTask(created.path);
            const indexedTask = this.plugin.index.taskIndex.get(created.path);
            if (!indexedTask) {
                console.warn('[DIWA TaskController] converted task missing from index after create', {
                    thoughtId: resolvedThought.filePath,
                    taskPath: created.path,
                });
                return false;
            }

            this.addTask(indexedTask);
            const linked = await this.linkThoughtToTask(resolvedThought.filePath, getTaskKey(indexedTask));
            if (!linked) return false;
            return true;
        } catch (error) {
            console.error('[DIWA TaskController] Error converting thought to task', error);
            return false;
        }
    }

    async linkThoughtToTask(thoughtId: string, taskId: string): Promise<boolean> {
        const resolvedTask = this.resolveTaskRecord(taskId);
        const resolvedThought = this.resolveThoughtRecord(thoughtId);
        if (!resolvedTask || !resolvedThought) {
            console.warn('[DIWA TaskController] linkThoughtToTask called for unknown entity', {
                thoughtId,
                taskId,
                hasTask: !!resolvedTask,
                hasThought: !!resolvedThought,
            });
            return false;
        }
        this.plugin.refreshCoordinator.suppressNotifyRefresh(700);

        const nextThoughtIds = uniqueIds([
            ...getTaskThoughtIds(resolvedTask.task),
            resolvedThought.filePath,
        ]);
        const nextTaskIds = uniqueIds([
            ...getThoughtTaskIds(resolvedThought.thought),
            resolvedTask.filePath,
        ]);

        const taskUpdated = await this.persistTaskThoughtLinks(resolvedTask.filePath, nextThoughtIds);
        const thoughtUpdated = await this.persistThoughtTaskLinks(resolvedThought.filePath, nextTaskIds);
        if (!taskUpdated || !thoughtUpdated) return false;

        const now = Date.now();
        const updatedTask: TaskEntry = {
            ...resolvedTask.task,
            sourceThoughtIds: nextThoughtIds,
            links: { thoughts: nextThoughtIds },
            origin: resolvedTask.task.origin ?? 'thought',
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            updatedAt: new Date(now).toISOString(),
            lastUpdate: now,
        };
        this.updateTask(updatedTask);

        const updatedThought: ThoughtEntry = {
            ...resolvedThought.thought,
            links: {
                tasks: nextTaskIds,
                thoughts: resolvedThought.thought.links?.thoughts ?? [],
            },
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            lastThreadUpdate: now,
        };
        this.plugin.getThoughtController().upsertThought(updatedThought);

        await this.reindexTask(resolvedTask.filePath);
        await this.reindexThought(resolvedThought.filePath);
        await this.reconcileTask(resolvedTask.filePath, updatedTask.status, updatedTask);
        return true;
    }

    async createThoughtFromTask(taskId: string, content: string): Promise<boolean> {
        const resolvedTask = this.resolveTaskRecord(taskId);
        if (!resolvedTask) {
            console.warn('[DIWA TaskController] createThoughtFromTask called for unknown task', { taskId });
            return false;
        }
        const thoughtText = content.trim();
        if (!thoughtText) return false;

        try {
            this.plugin.refreshCoordinator.suppressNotifyRefresh(800);
            const created = await this.plugin.getThoughtController().addThought({
                content: thoughtText,
                context: [...(resolvedTask.task.context || [])],
            });
            if (!created) return false;
            return this.linkThoughtToTask(created.filePath, getTaskKey(resolvedTask.task));
        } catch (error) {
            console.error('[DIWA TaskController] Error creating thought from task', error);
            return false;
        }
    }

    async unlinkThoughtFromTask(thoughtId: string, taskId: string): Promise<boolean> {
        const resolvedTask = this.resolveTaskRecord(taskId);
        const resolvedThought = this.resolveThoughtRecord(thoughtId);
        if (!resolvedTask || !resolvedThought) {
            console.warn('[DIWA TaskController] unlinkThoughtFromTask called for unknown entity', {
                thoughtId,
                taskId,
                hasTask: !!resolvedTask,
                hasThought: !!resolvedThought,
            });
            return false;
        }
        this.plugin.refreshCoordinator.suppressNotifyRefresh(700);

        const nextThoughtIds = getTaskThoughtIds(resolvedTask.task).filter((id) => id !== resolvedThought.filePath);
        const nextTaskIds = getThoughtTaskIds(resolvedThought.thought).filter((id) => id !== resolvedTask.filePath);

        const taskUpdated = await this.persistTaskThoughtLinks(resolvedTask.filePath, nextThoughtIds);
        const thoughtUpdated = await this.persistThoughtTaskLinks(resolvedThought.filePath, nextTaskIds);
        if (!taskUpdated || !thoughtUpdated) return false;

        const now = Date.now();
        const updatedTask: TaskEntry = {
            ...resolvedTask.task,
            sourceThoughtIds: nextThoughtIds,
            links: { thoughts: nextThoughtIds },
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            updatedAt: new Date(now).toISOString(),
            lastUpdate: now,
        };
        this.updateTask(updatedTask);

        const updatedThought: ThoughtEntry = {
            ...resolvedThought.thought,
            links: {
                tasks: nextTaskIds,
                thoughts: resolvedThought.thought.links?.thoughts ?? [],
            },
            modified: moment(now).format('YYYY-MM-DD HH:mm:ss'),
            lastThreadUpdate: now,
        };
        this.plugin.getThoughtController().upsertThought(updatedThought);

        await this.reindexTask(resolvedTask.filePath);
        await this.reindexThought(resolvedThought.filePath);
        await this.reconcileTask(resolvedTask.filePath, updatedTask.status, updatedTask);
        return true;
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
        updates: { dueDate?: string | null },
    ): Promise<boolean> {
        const resolved = this.resolveTaskRecord(taskId);
        if (!resolved) {
            console.warn('[DIWA TaskController] updateTaskMetadata called for unknown task', { taskId, updates });
            return false;
        }
        const task = this.plugin.index.taskIndex.get(resolved.filePath) ?? resolved.task;
        const now = Date.now();
        const due = updates.dueDate !== undefined ? (updates.dueDate || '') : task.due;
        const updatedTask: TaskEntry = {
            ...task,
            due,
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

    private resolveThoughtRecord(thoughtId: string): { filePath: string; thought: ThoughtEntry } | null {
        const thought = this.plugin.getThoughtController().getThought(thoughtId);
        if (thought) return { filePath: thought.filePath, thought };
        return null;
    }

    private async reindexTask(filePath: string): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.plugin.refreshCoordinator.reindexFile(file);
    }

    private async reindexThought(filePath: string): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.plugin.refreshCoordinator.reindexFile(file);
    }

    private async persistTaskThoughtLinks(filePath: string, thoughtIds: string[]): Promise<boolean> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        const normalizedThoughtIds = uniqueIds(thoughtIds);
        try {
            await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                fm['sourceThoughtIds'] = normalizedThoughtIds;
                const existingLinks = (fm['links'] && typeof fm['links'] === 'object')
                    ? { ...(fm['links'] as Record<string, unknown>) }
                    : {};
                existingLinks.thoughts = normalizedThoughtIds;
                fm['links'] = existingLinks;
                fm['modified'] = moment().format('YYYY-MM-DD HH:mm:ss');
            });
            return true;
        } catch (error) {
            console.error('[DIWA TaskController] Error persisting task thought links', { filePath, error });
            return false;
        }
    }

    private async persistThoughtTaskLinks(filePath: string, taskIds: string[]): Promise<boolean> {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        const normalizedTaskIds = uniqueIds(taskIds);
        try {
            await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                fm['linkedTasks'] = normalizedTaskIds;
                const existingLinks = (fm['links'] && typeof fm['links'] === 'object')
                    ? { ...(fm['links'] as Record<string, unknown>) }
                    : {};
                existingLinks.tasks = normalizedTaskIds;
                fm['links'] = existingLinks;
                fm['modified'] = moment().format('YYYY-MM-DD HH:mm:ss');
            });
            return true;
        } catch (error) {
            console.error('[DIWA TaskController] Error persisting thought task links', { filePath, error });
            return false;
        }
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
        const snapshot: TaskEntry[] = [];
        for (const task of this.plugin.index.taskIndex.values()) {
            const normalizedTask = this.normalizeTask(task, 'syncSnapshot');
            if (!normalizedTask) continue;
            this.plugin.index.taskIndex.set(normalizedTask.filePath, normalizedTask);
            snapshot.push(normalizedTask);
        }
        return snapshot;
    }

    private normalizeTask(task: TaskEntry, source: string): TaskEntry | null {
        return this.normalizeIncomingTask(task, source);
    }

    private normalizeIncomingTask(task: TaskEntry, source: string): TaskEntry | null {
        const filePath = task.filePath?.trim();
        if (!filePath) {
            console.warn('[DIWA TaskController] task missing filePath', { source, task });
            return null;
        }

        const body = (task.body || '').trim();
        const derivedTitle = body.split('\n').find((line) => line.trim())?.trim() || 'Untitled task';
        const title = (task.title || '').trim() || derivedTitle;
        const normalizedThoughtIds = uniqueIds([
            ...(task.sourceThoughtIds ?? []),
            ...(task.links?.thoughts ?? []),
        ]);

        const rawStatus = String(task.status || task.state || 'backlog').toLowerCase();
        let status: TaskEntry['status'];
        let bucketStatus: TaskBucketStatus | undefined = task.bucketStatus;

        if (rawStatus === 'backlog') {
            status = 'open';
            bucketStatus = 'backlog';
        } else if (rawStatus === 'active') {
            status = 'waiting';
            bucketStatus = 'active';
        } else if (rawStatus === 'done') {
            status = 'done';
            bucketStatus = 'done';
        } else if (rawStatus === 'open' || rawStatus === 'waiting' || rawStatus === 'someday' || rawStatus === 'done') {
            status = rawStatus as TaskEntry['status'];
        } else if (task.lifecycleStatus === 'done') {
            status = 'done';
        } else if (task.lifecycleStatus === 'active') {
            status = 'waiting';
        } else {
            status = 'open';
        }

        if (!bucketStatus) {
            if (status === 'done' || task.lifecycleStatus === 'done') bucketStatus = 'done';
            else if (status === 'waiting' || task.lifecycleStatus === 'active') bucketStatus = 'active';
            else bucketStatus = 'backlog';
        }

        const taskId = task.taskId?.trim() || (task.id && task.id !== filePath ? task.id : undefined);
        const now = Date.now();

        return {
            ...task,
            id: task.id ?? taskId ?? filePath,
            filePath,
            taskId,
            title,
            body: body || title,
            status,
            state: bucketStatus,
            bucketStatus,
            lifecycleStatus: task.lifecycleStatus ?? mapBucketToLifecycle(bucketStatus),
            sourceThoughtIds: normalizedThoughtIds,
            links: { thoughts: normalizedThoughtIds },
            lastUpdate: task.lastUpdate || now,
        };
    }
}

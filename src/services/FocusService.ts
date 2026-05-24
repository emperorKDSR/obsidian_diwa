import { moment } from 'obsidian';
import type { TaskEntry } from '../types';

export type FocusQuery = {
    limit?: number;
    includeOverdue?: boolean;
    includeDueToday?: boolean;
    includePinned?: boolean;
    contexts?: string[];
    includeDone?: boolean;
};

type FocusTaskRepository = {
    getAllTasks(): TaskEntry[];
};

export class FocusService {
    constructor(
        private readonly taskRepo: FocusTaskRepository,
    ) {}

    getTodayFocus(query: FocusQuery = {}): TaskEntry[] {
        const {
            limit,
            includeOverdue = true,
            includeDueToday = true,
            includePinned = true,
            contexts,
            includeDone = false,
        } = query;

        let tasks = this.taskRepo.getAllTasks().slice();

        if (!includeDone) {
            tasks = tasks.filter((task) => !this.isDoneTask(task));
        }

        if (contexts?.length) {
            const wanted = new Set(contexts.map((ctx) => ctx.trim()).filter(Boolean));
            tasks = tasks.filter((task) => (task.context || []).some((ctx) => wanted.has(ctx)));
        }

        const today = moment().startOf('day');
        const deduped = tasks
            .filter((task) => {
                const isPinned = includePinned && !!task.focus;
                const dueState = this.getDueState(task, today);
                const isUrgent = (includeOverdue && dueState === 'overdue')
                    || (includeDueToday && dueState === 'today');
                const isPriority = this.getPriorityScore(task.priority) >= 3;
                return isPinned || isUrgent || isPriority;
            })
            .sort((left, right) => {
                const leftPriority = this.getPriorityScore(left.priority);
                const rightPriority = this.getPriorityScore(right.priority);
                if (leftPriority !== rightPriority) return rightPriority - leftPriority;

                const leftDue = left.due?.trim() || '';
                const rightDue = right.due?.trim() || '';
                if (leftDue && rightDue) return leftDue.localeCompare(rightDue);
                if (leftDue) return -1;
                if (rightDue) return 1;

                const leftUpdate = left.lastUpdate || 0;
                const rightUpdate = right.lastUpdate || 0;
                if (leftUpdate !== rightUpdate) return rightUpdate - leftUpdate;
                return (right.modified || '').localeCompare(left.modified || '');
            });

        if (typeof limit === 'number') {
            return deduped.slice(0, Math.max(0, limit));
        }
        return deduped;
    }

    private isDoneTask(task: TaskEntry): boolean {
        return task.status === 'done'
            || task.state === 'done'
            || task.bucketStatus === 'done'
            || task.lifecycleStatus === 'done'
            || !!task.completedAt;
    }

    private getDueState(task: TaskEntry, today: ReturnType<typeof moment>): 'none' | 'today' | 'overdue' | 'future' {
        const dueRaw = task.due?.trim();
        if (!dueRaw) return 'none';
        const due = moment(dueRaw, 'YYYY-MM-DD', true);
        if (!due.isValid()) return 'none';
        if (due.isBefore(today, 'day')) return 'overdue';
        if (due.isSame(today, 'day')) return 'today';
        return 'future';
    }

    private getPriorityScore(priority: TaskEntry['priority']): number {
        if (priority === 'high') return 3;
        if (priority === 'medium') return 2;
        if (priority === 'low') return 1;
        return 0;
    }
}

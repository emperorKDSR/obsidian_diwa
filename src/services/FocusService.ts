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
            tasks = tasks.filter((task) => task.status !== 'done' && task.lifecycleStatus !== 'done' && task.bucketStatus !== 'done');
        }

        if (contexts?.length) {
            const wanted = new Set(contexts.map((ctx) => ctx.trim()).filter(Boolean));
            tasks = tasks.filter((task) => (task.context || []).some((ctx) => wanted.has(ctx)));
        }

        const today = moment().startOf('day');
        const isOverdue = (task: TaskEntry): boolean => {
            if (!task.due?.trim()) return false;
            const due = moment(task.due, 'YYYY-MM-DD', true);
            return due.isValid() && due.isBefore(today, 'day');
        };
        const isDueToday = (task: TaskEntry): boolean => {
            if (!task.due?.trim()) return false;
            const due = moment(task.due, 'YYYY-MM-DD', true);
            return due.isValid() && due.isSame(today, 'day');
        };
        const isPinned = (task: TaskEntry): boolean => !!task.focus;

        const overdue = includeOverdue ? tasks.filter(isOverdue) : [];
        const dueToday = includeDueToday ? tasks.filter((task) => isDueToday(task) && !isOverdue(task)) : [];
        const pinned = includePinned ? tasks.filter((task) => isPinned(task) && !isOverdue(task) && !isDueToday(task)) : [];

        const rest = tasks
            .filter((task) => !overdue.includes(task) && !dueToday.includes(task) && !pinned.includes(task))
            .sort((left, right) => {
                const leftPriority = this.getPriorityScore(left.priority);
                const rightPriority = this.getPriorityScore(right.priority);
                if (leftPriority !== rightPriority) return rightPriority - leftPriority;

                const leftDue = left.due?.trim() || '';
                const rightDue = right.due?.trim() || '';
                if (leftDue && rightDue) return leftDue.localeCompare(rightDue);
                if (leftDue) return -1;
                if (rightDue) return 1;

                return (right.modified || '').localeCompare(left.modified || '');
            });

        const deduped = Array.from(new Map([...overdue, ...dueToday, ...pinned, ...rest]
            .map((task) => [task.taskId?.trim() || task.id || task.filePath, task])).values());

        if (typeof limit === 'number') {
            return deduped.slice(0, Math.max(0, limit));
        }
        return deduped;
    }

    private getPriorityScore(priority: TaskEntry['priority']): number {
        if (priority === 'high') return 3;
        if (priority === 'medium') return 2;
        if (priority === 'low') return 1;
        return 0;
    }
}

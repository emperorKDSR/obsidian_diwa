import type { Task } from '../types';
import { scoreTask, getRankedTasks, isTaskOverdue } from './taskEngine';
import { optimizeTaskSchedule } from './taskScheduler';

// ── Types ──────────────────────────────────────────────────────────────────

export type UrgencyTier = 'critical' | 'high' | 'normal' | 'low';

export interface FocusGroup {
    'Do Now': Task[];
    'Up Next': Task[];
    'Later':   Task[];
}

// ── Configuration ──────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Days ahead within which a task is considered "due soon" for high tier. */
const HIGH_TIER_DAYS  = 3;
/** Days ahead within which a task is considered "due soon" for normal tier. */
const NORMAL_TIER_DAYS = 7;
/** Days without update after which a task is treated as neglected (for explain). */
const NEGLECT_THRESHOLD_MS = 14 * MS_PER_DAY;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the N most important tasks for the user to focus on right now.
 *
 * Pipeline (single pass after initial sort):
 *   1. Run smart scheduling to correct overdue/overloaded dates
 *   2. Exclude done tasks, rank by score
 *   3. Partition into "must-include" (active + overdue) and "candidates"
 *   4. Fill the result: must-includes first (score-ordered), then candidates
 *
 * This ordering guarantees active and overdue tasks always surface at the
 * top while still honouring the score-based ranking within each group.
 *
 * @param tasks  Full task list; done tasks are automatically excluded.
 * @param limit  Maximum tasks to return (default 5).
 */
export function getFocusTasks(tasks: Task[], limit = 5): Task[] {
    const optimized = optimizeTaskSchedule(tasks);
    // getRankedTasks already filters done and sorts by descending score
    const ranked = getRankedTasks(optimized);

    const mustInclude: Task[] = [];
    const candidates:  Task[] = [];

    for (const task of ranked) {
        if (task.status === 'active' || isTaskOverdue(task)) {
            mustInclude.push(task);
        } else {
            candidates.push(task);
        }
    }

    // Merge buckets — both are already score-ordered
    return [...mustInclude, ...candidates].slice(0, limit);
}

/**
 * Produces a stable focus list by merging a previous focus snapshot with a
 * freshly computed one.
 *
 * Rules:
 *   - Tasks from previousFocus that still appear in newFocus are retained
 *     and placed first (preserving the user's mental model).
 *   - Completed tasks are always dropped.
 *   - Genuinely new high-priority tasks are appended after retained ones.
 *   - The result never exceeds newFocus.length items.
 *
 * This prevents the full list from reshuffling on every recalculation while
 * still letting urgent newcomers enter when there is capacity.
 */
export function maintainFocusStability(
    previousFocus: Task[],
    newFocus: Task[]
): Task[] {
    const limit      = newFocus.length;
    const newFocusById = new Map(newFocus.map(t => [t.id, t]));

    // Keep tasks the user was already working on (updated objects from new focus)
    const retained = previousFocus
        .filter(t => t.status !== 'done' && newFocusById.has(t.id))
        .map(t => newFocusById.get(t.id)!); // use freshest version

    const retainedIds = new Set(retained.map(t => t.id));

    // New entries: tasks in newFocus not already retained (in new-focus order)
    const introduced = newFocus.filter(t => !retainedIds.has(t.id));

    return [...retained, ...introduced].slice(0, limit);
}

/**
 * Classifies a task into an urgency tier.
 *
 * Evaluation is exclusive: the first matching rule wins.
 *
 *   critical  overdue  OR  (active AND due ≤ tomorrow)
 *   high      active   OR  due within HIGH_TIER_DAYS
 *   normal    planned  with due date within NORMAL_TIER_DAYS
 *   low       everything else
 */
export function getTaskUrgencyTier(task: Task): UrgencyTier {
    if (task.status === 'done') return 'low';

    if (isTaskOverdue(task)) return 'critical';

    if (task.status === 'active') {
        if (task.due && _daysUntilDue(task.due) <= 1) return 'critical';
        return 'high';
    }

    if (task.due) {
        const days = _daysUntilDue(task.due);
        if (days <= 0)                    return 'high';   // due today (not overdue)
        if (days <= HIGH_TIER_DAYS)       return 'high';
        if (days <= NORMAL_TIER_DAYS)     return 'normal';
    }

    return 'low';
}

/**
 * Returns a concise human-readable explanation of why a task is ranked the
 * way it is. Useful for tooltips, focus summaries, and AI prompts.
 *
 * Checks conditions in descending severity order so the most important
 * reason is always surfaced.
 */
export function explainTaskPriority(task: Task): string {
    if (task.status === 'done') return 'This task is already completed.';

    if (isTaskOverdue(task)) return 'This task is overdue.';

    if (task.status === 'active') {
        if (task.due) {
            const days = _daysUntilDue(task.due);
            if (days === 0) return 'This task is active and due today.';
            if (days === 1) return 'This task is active and due tomorrow.';
            if (days <= HIGH_TIER_DAYS) return `This task is active and due in ${days} days.`;
        }
        if (_isRecentlyUpdated(task)) return 'This task is active and recently updated.';
        return 'This task is currently active.';
    }

    if (task.due) {
        const days = _daysUntilDue(task.due);
        if (days === 0) return 'This task is due today.';
        if (days === 1) return 'This task is due tomorrow.';
        if (days <= HIGH_TIER_DAYS)   return `This task is due in ${days} days.`;
        if (days <= NORMAL_TIER_DAYS) return `This task is coming up in ${days} days.`;
    }

    if (_isNeglected(task)) return 'This task has been neglected.';

    if (task.origin === 'thought' && task.sourceThoughtIds.length > 0) {
        return 'This task was created from a thought.';
    }

    return 'This task is planned.';
}

/**
 * Groups tasks into "Do Now", "Up Next", and "Later" buckets based on their
 * urgency tier. Tasks within each group retain their score order.
 *
 * Designed to be called on the output of getFocusTasks or getRankedTasks.
 */
export function groupFocusTasks(tasks: Task[]): FocusGroup {
    const groups: FocusGroup = { 'Do Now': [], 'Up Next': [], 'Later': [] };

    for (const task of tasks) {
        const tier = getTaskUrgencyTier(task);
        if (tier === 'critical' || tier === 'high') {
            groups['Do Now'].push(task);
        } else if (tier === 'normal') {
            groups['Up Next'].push(task);
        } else {
            groups['Later'].push(task);
        }
    }

    return groups;
}

// ── Private helpers ────────────────────────────────────────────────────────

/** UTC midnight of today as a ms timestamp. */
function _todayStart(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/**
 * Parses a YYYY-MM-DD string to a UTC midnight timestamp.
 * Returns null on invalid input.
 */
function _parseDateOnly(s: string): number | null {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(ts) ? null : ts;
}

/**
 * Returns the number of whole calendar days between today (UTC) and the
 * task's due date. Negative = past, 0 = today, positive = future.
 * Returns Infinity when the due date is absent or unparseable.
 */
function _daysUntilDue(due: string): number {
    const dueTs = _parseDateOnly(due);
    if (dueTs === null) return Infinity;
    return (dueTs - _todayStart()) / MS_PER_DAY;
}

function _isRecentlyUpdated(task: Task): boolean {
    if (!task.updatedAt) return false;
    const ts = Date.parse(task.updatedAt);
    return !isNaN(ts) && Date.now() - ts <= MS_PER_DAY;
}

function _isNeglected(task: Task): boolean {
    if (!task.updatedAt) return false;
    const ts = Date.parse(task.updatedAt);
    return !isNaN(ts) && Date.now() - ts >= NEGLECT_THRESHOLD_MS;
}

// ── Convenience re-exports for consumers who only import from focusEngine ──

export { scoreTask, getRankedTasks, isTaskOverdue };

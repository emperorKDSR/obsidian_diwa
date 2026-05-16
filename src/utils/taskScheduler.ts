import type { Task } from '../types';
import { isoNow } from './taskModel';
import { isTaskOverdue } from './taskEngine';

// ── Configuration ──────────────────────────────────────────────────────────

/** Maximum tasks per day before a date is considered overloaded. */
export const MAX_DAILY_LOAD = 5;

/** Hard ceiling on how far forward a task may be pushed. */
const MAX_PUSH_DAYS = 14;

/**
 * Minimum time between auto-reschedule operations on the same task.
 * Prevents a task from bouncing between dates within a single session.
 */
const RESCHEDULE_COOLDOWN_MS = 60 * 60_000; // 1 hour

/** Age without any update after which a task is treated as neglected. */
const NEGLECT_THRESHOLD_MS = 14 * 86_400_000; // 14 days

const MS_PER_DAY = 86_400_000;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns a map of { "YYYY-MM-DD": taskCount } for all non-done tasks that
 * carry a due date. Used for overload detection and workload visualisation.
 */
export function getTaskLoadByDate(tasks: Task[]): Record<string, number> {
    const load: Record<string, number> = {};
    for (const t of tasks) {
        if (t.status === 'done' || !t.due) continue;
        load[t.due] = (load[t.due] ?? 0) + 1;
    }
    return load;
}

/**
 * Starting from startDate (inclusive), returns the first calendar day where
 * the number of scheduled tasks is below MAX_DAILY_LOAD.
 *
 * Caps the search at MAX_PUSH_DAYS to prevent unbounded loops. If every day
 * in the window is overloaded the last candidate is returned anyway so the
 * task always gets a concrete date.
 */
export function findNextAvailableDate(tasks: Task[], startDate: string): string {
    const load = getTaskLoadByDate(tasks);
    const startTs = _parseDateOnly(startDate) ?? _todayStart();

    for (let i = 0; i < MAX_PUSH_DAYS; i++) {
        const candidate = _formatDate(startTs + i * MS_PER_DAY);
        if ((load[candidate] ?? 0) < MAX_DAILY_LOAD) return candidate;
    }

    return _formatDate(startTs + (MAX_PUSH_DAYS - 1) * MS_PER_DAY);
}

/**
 * Determines a new due date for an overdue task.
 *
 * Prefers moving to today when capacity allows; otherwise delegates to
 * findNextAvailableDate so it doesn't pile onto an already busy day.
 */
export function handleOverdueTask(task: Task, allTasks: Task[]): string {
    const todayStr = _formatDate(_todayStart());
    const load = getTaskLoadByDate(allTasks);
    if ((load[todayStr] ?? 0) < MAX_DAILY_LOAD) return todayStr;
    return findNextAvailableDate(allTasks, todayStr);
}

/**
 * Decides whether a single task should be rescheduled given the current
 * state of all tasks. Returns the new due date or null (no change).
 *
 * Evaluated in priority order:
 *
 *   1. Done                  → skip always
 *   2. Cooldown active        → skip (oscillation guard)
 *   3. Overdue                → push to nearest available date (today preferred)
 *   4. Overloaded due date    → push to next available date
 *   5. Active + no due date   → nudge to tomorrow
 *   6. Neglected + far future → bring forward to nearest available date
 *   7. Otherwise              → no change
 */
export function autoRescheduleTask(task: Task, allTasks: Task[]): string | null {
    if (task.status === 'done') return null;
    if (_wasRecentlyRescheduled(task)) return null;

    const today = _todayStart();
    const load = getTaskLoadByDate(allTasks);

    // Case 3 — Overdue
    if (isTaskOverdue(task)) {
        return handleOverdueTask(task, allTasks);
    }

    // Case 4 — Current due date is overloaded
    if (task.due) {
        if ((load[task.due] ?? 0) >= MAX_DAILY_LOAD) {
            return findNextAvailableDate(allTasks, task.due);
        }
    }

    // Case 5 — Active task with no due date: gentle nudge to tomorrow
    if (task.status === 'active' && !task.due) {
        return _formatDate(today + MS_PER_DAY);
    }

    // Case 6 — Neglected: stale task sitting on a distant future date or undated
    if (_isNeglected(task)) {
        if (!task.due) {
            return findNextAvailableDate(allTasks, _formatDate(today));
        }
        const dueTs = _parseDateOnly(task.due);
        if (dueTs !== null && dueTs > today + 7 * MS_PER_DAY) {
            return findNextAvailableDate(allTasks, _formatDate(today));
        }
    }

    return null;
}

/**
 * Evaluates whether a task's schedule should change and returns a
 * Partial<Task> describing the fields to update. Returns {} when no change
 * is needed.
 *
 * Does NOT mutate the original task object.
 */
export function evaluateTaskSchedule(task: Task, allTasks: Task[]): Partial<Task> {
    const newDue = autoRescheduleTask(task, allTasks);
    if (!newDue) return {};

    return {
        due: newDue,
        updatedAt: isoNow(),
        rescheduleCount: (task.rescheduleCount ?? 0) + 1,
    };
}

/**
 * Runs evaluateTaskSchedule over every task in the list and returns a new
 * array with all updates applied.
 *
 * The working list is updated progressively — each task is evaluated against
 * the already-rescheduled state of its predecessors. This prevents multiple
 * tasks from being piled onto the same newly-chosen date.
 *
 * Done tasks are returned as-is. Originals are never mutated.
 */
export function optimizeTaskSchedule(tasks: Task[]): Task[] {
    const working = tasks.map(t => ({ ...t }));

    for (let i = 0; i < working.length; i++) {
        const updates = evaluateTaskSchedule(working[i], working);
        if (Object.keys(updates).length > 0) {
            working[i] = { ...working[i], ...updates };
        }
    }

    return working;
}

// ── Private helpers ────────────────────────────────────────────────────────

function _wasRecentlyRescheduled(task: Task): boolean {
    if (!task.updatedAt) return false;
    const ts = Date.parse(task.updatedAt);
    return !isNaN(ts) && Date.now() - ts < RESCHEDULE_COOLDOWN_MS;
}

function _isNeglected(task: Task): boolean {
    if (!task.updatedAt) return false;
    const ts = Date.parse(task.updatedAt);
    return !isNaN(ts) && Date.now() - ts >= NEGLECT_THRESHOLD_MS;
}

// ── Date utilities (UTC-safe, no external dependencies) ────────────────────

/**
 * Parses a YYYY-MM-DD string into a UTC midnight timestamp (ms).
 * Returns null for any unparseable input — callers handle gracefully.
 */
function _parseDateOnly(s: string): number | null {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(ts) ? null : ts;
}

/** UTC midnight of today as a ms timestamp. */
function _todayStart(): number {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/** Formats a UTC-midnight ms timestamp back to YYYY-MM-DD. */
function _formatDate(ts: number): string {
    const d = new Date(ts);
    const y  = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${dy}`;
}

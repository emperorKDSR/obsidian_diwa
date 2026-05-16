import type { Task } from '../types';

// ── Scoring constants ──────────────────────────────────────────────────────

const SCORE_BASE: Record<Task['status'], number> = {
    active:  100,
    planned:  50,
    done:      0,
};

const SCORE_OVERDUE     = 100;
const SCORE_DUE_TODAY   =  50;
const SCORE_DUE_SOON    =  10;  // within the next 7 days
const SCORE_DUE_FUTURE  =   5;  // beyond 7 days

const SCORE_RECENCY_FRESH =  20; // updated within the last 24 h
const SCORE_RECENCY_STALE =  10; // not touched for more than 7 days (neglect prevention)

const MS_PER_DAY = 86_400_000;

// ── Public helpers ─────────────────────────────────────────────────────────

/**
 * Returns true when the task has a due date that has already passed AND the
 * task is not done. Tasks without a due date are never considered overdue.
 */
export function isTaskOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.due) return false;
    const dueTs = _parseDateOnly(task.due);
    if (dueTs === null) return false;
    return dueTs < _todayStart();
}

/**
 * Computes a numeric priority score for a task.
 *
 * Higher score = should surface sooner.
 *
 * Breakdown:
 *   base score   — derived from lifecycle status (active wins)
 *   due score    — overdue/today/soon/future/none
 *   recency score — recently updated gets a freshness boost;
 *                   stale tasks get a small bump to avoid neglect
 *
 * Done tasks always score 0 (they are excluded by getRankedTasks anyway).
 */
export function scoreTask(task: Task): number {
    if (task.status === 'done') return 0;

    let score = SCORE_BASE[task.status];

    // ── Due date component ────────────────────────────────────────────────
    score += _dueScore(task);

    // ── Recency component ─────────────────────────────────────────────────
    score += _recencyScore(task);

    return score;
}

/**
 * Filters out done tasks, scores the remainder, and returns them sorted by
 * descending score (highest priority first).
 */
export function getRankedTasks(tasks: Task[]): Task[] {
    return tasks
        .filter(t => t.status !== 'done')
        .map(t => ({ task: t, score: scoreTask(t) }))
        .sort((a, b) => b.score - a.score)
        .map(({ task }) => task);
}

/**
 * Returns the top-N tasks the user should focus on right now.
 *
 * Selection strategy:
 *   1. All active tasks (in score order) — always included first
 *   2. Urgent planned tasks (overdue or due today) — fill remaining slots
 *   3. Remaining planned tasks by score — fill any leftover slots
 *
 * The three-bucket approach ensures active work is never pushed out by a
 * flood of overdue planned tasks, while still surfacing urgent items.
 *
 * @param tasks  Full task list (may include done tasks — they are ignored).
 * @param limit  Maximum number of tasks to return (default 5).
 */
export function getNextActions(tasks: Task[], limit = 5): Task[] {
    const ranked = getRankedTasks(tasks);

    const active  = ranked.filter(t => t.status === 'active');
    const urgent  = ranked.filter(t => t.status === 'planned' && (isTaskOverdue(t) || _isDueToday(t)));
    const planned = ranked.filter(t => t.status === 'planned' && !isTaskOverdue(t) && !_isDueToday(t));

    const result: Task[] = [];

    for (const bucket of [active, urgent, planned]) {
        for (const task of bucket) {
            if (result.length >= limit) break;
            result.push(task);
        }
        if (result.length >= limit) break;
    }

    return result;
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Parses a YYYY-MM-DD string into a UTC midnight timestamp (ms).
 * Returns null for any unparseable value so callers can skip gracefully.
 */
function _parseDateOnly(dateStr: string): number | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(ts) ? null : ts;
}

/** Returns today's UTC midnight as a ms timestamp. */
function _todayStart(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function _isDueToday(task: Task): boolean {
    if (!task.due) return false;
    const dueTs = _parseDateOnly(task.due);
    if (dueTs === null) return false;
    return dueTs === _todayStart();
}

/** Score contribution from due date. */
function _dueScore(task: Task): number {
    if (!task.due) return 0;

    const dueTs = _parseDateOnly(task.due);
    if (dueTs === null) return 0;

    const today = _todayStart();
    const diffDays = (dueTs - today) / MS_PER_DAY; // negative = past

    if (diffDays < 0)  return SCORE_OVERDUE;    // overdue
    if (diffDays === 0) return SCORE_DUE_TODAY;  // due today
    if (diffDays <= 7) return SCORE_DUE_SOON;   // coming up within a week
    return SCORE_DUE_FUTURE;                    // further out
}

/** Score contribution from recency of last update. */
function _recencyScore(task: Task): number {
    if (!task.updatedAt) return 0;

    const updatedTs = Date.parse(task.updatedAt);
    if (isNaN(updatedTs)) return 0;

    const ageMs = Date.now() - updatedTs;
    if (ageMs <= MS_PER_DAY)       return SCORE_RECENCY_FRESH; // updated in last 24 h
    if (ageMs >= 7 * MS_PER_DAY)   return SCORE_RECENCY_STALE; // not touched in 7+ days
    return 0;
}

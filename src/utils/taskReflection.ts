import type { Task, ThoughtEntry } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY  = 86_400_000;

/** Minimum number of completed tasks before pattern detection is meaningful. */
const PATTERN_MIN_SAMPLE = 3;
/** Context bucket minimum size before context-level patterns are reported. */
const CONTEXT_MIN_SAMPLE = 3;
/** Late-completion rate threshold above which a pattern is reported. */
const LATE_RATE_THRESHOLD = 0.4;
/** Maximum score adjustment this module may apply (prevents overriding core scoring). */
const MAX_ADJUSTMENT = 30;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates a concise, human-readable prompt that guides the user's reflection
 * entry after completing a task. The prompt is selected based on the task's
 * actual metadata — it is never generic filler.
 *
 * Priority of prompt selection (first match wins):
 *   1. Task was completed after its due date    → ask about the delay
 *   2. Task was resolved in under half a day    → ask what made it easy
 *   3. Task took over a week                    → ask about lessons
 *   4. Task was rescheduled multiple times      → ask about avoidance
 *   5. Task originates from a thought           → ask about expectations
 *   6. Default: open-ended outcome question
 *
 * Never throws; always returns a non-empty string.
 */
export function generateReflectionPrompt(task: Task): string {
    // Late completion relative to due date
    if (task.due && task.completedAt) {
        const dueTs       = _parseDateOnly(task.due);
        const completedTs = Date.parse(task.completedAt);
        if (dueTs !== null && !isNaN(completedTs) && completedTs > dueTs + MS_PER_DAY) {
            return 'This task ran past its due date. What caused the delay?';
        }
    }

    // Duration-based prompts
    const durationDays = _taskDurationDays(task);
    if (durationDays !== null) {
        if (durationDays <= 0.5) return 'This task was resolved quickly. What made it easy?';
        if (durationDays >= 7)   return 'This task took over a week. What would you do differently next time?';
    }

    // Rescheduling avoidance
    if ((task.rescheduleCount ?? 0) >= 2) {
        return 'This task was rescheduled several times. What kept pushing it back?';
    }

    // Thought-origin: expectation alignment
    if (task.origin === 'thought' && (task.sourceThoughtIds ?? []).length > 0) {
        return 'Was the outcome what you expected when you first had this idea?';
    }

    return 'What was the outcome of this task? Any lessons for next time?';
}

/**
 * Produces a short, factual insight about how a completed task was handled.
 * Purely heuristic — no AI, no mutations.
 *
 * The insight reflects the most notable characteristic in this priority order:
 *   1. Late vs early completion relative to due date
 *   2. Duration (quick resolution or long tail)
 *   3. Multiple thought connections
 *   4. Rescheduling pressure
 *   5. Origin-based completion note
 *   6. Plain "Task completed" fallback
 *
 * Returns a suggestion-only string; the caller decides whether to persist it.
 */
export function extractTaskInsight(task: Task, thoughts: ThoughtEntry[]): string {
    if (task.status !== 'done') {
        return 'Task is not yet completed — no insight available.';
    }

    const linkedThoughts = thoughts.filter(th =>
        (task.sourceThoughtIds ?? []).includes(th.filePath)
    );

    // Late / early completion
    if (task.due && task.completedAt) {
        const dueTs       = _parseDateOnly(task.due);
        const completedTs = Date.parse(task.completedAt);
        if (dueTs !== null && !isNaN(completedTs)) {
            const daysLate = (completedTs - dueTs) / MS_PER_DAY;
            if (daysLate > 1)  return `This task was completed ${Math.round(daysLate)} day(s) after its due date.`;
            if (daysLate < -1) return `This task was completed ${Math.round(-daysLate)} day(s) ahead of schedule.`;
        }
    }

    // Duration
    const durationDays = _taskDurationDays(task);
    if (durationDays !== null) {
        if (durationDays <= 0.5) return 'This task was resolved quickly once started.';
        if (durationDays >= 14)  return `This task took ${Math.round(durationDays)} days from creation to completion.`;
    }

    // Thought connections
    if (linkedThoughts.length >= 3) {
        return 'This task required multiple thought connections before completion.';
    }
    if (linkedThoughts.length === 1) {
        return 'This task was traced back to a single thought and resolved.';
    }

    // Rescheduling pressure
    if ((task.rescheduleCount ?? 0) >= 3) {
        return 'This task was rescheduled multiple times before being completed.';
    }

    // Origin-based
    if (task.origin === 'direct') {
        return 'This task was created directly and completed as planned.';
    }

    return 'Task completed.';
}

/**
 * Analyses a list of tasks (focused on completed ones) and returns plain-
 * language pattern observations. Operates entirely on existing Task metadata
 * — no ML, no file I/O.
 *
 * Patterns detected:
 *   - Tasks without due dates take significantly longer on average
 *   - High rate of late completions overall
 *   - Context-specific late-completion clusters
 *   - Velocity difference between thought-origin vs direct tasks
 *   - Heavy rescheduling across the batch
 *   - Most tasks resolved quickly (fast-cycle pattern)
 *
 * Returns an empty array when there is insufficient data (< PATTERN_MIN_SAMPLE
 * completed tasks). Never throws.
 */
export function detectTaskPatterns(tasks: Task[]): string[] {
    const done = tasks.filter(t => t.status === 'done');
    if (done.length < PATTERN_MIN_SAMPLE) return [];

    const patterns: string[] = [];

    // Pattern 1: tasks without due dates take longer
    const noDue   = done.filter(t => !t.due);
    const withDue = done.filter(t =>  !!t.due);
    if (noDue.length >= 2 && withDue.length >= 2) {
        const noDueAvg   = _avgDurationDays(noDue);
        const withDueAvg = _avgDurationDays(withDue);
        if (noDueAvg !== null && withDueAvg !== null && noDueAvg > withDueAvg * 1.5) {
            patterns.push('Tasks without due dates tend to take significantly longer to complete.');
        }
    }

    // Pattern 2: overall late-completion rate
    const lateCount = done.filter(_wasCompletedLate).length;
    const lateRate  = lateCount / done.length;
    if (lateRate >= LATE_RATE_THRESHOLD) {
        patterns.push(`${Math.round(lateRate * 100)}% of completed tasks were finished after their due date.`);
    }

    // Pattern 3: context-level delay clusters
    const contextDelays = _detectContextDelays(done);
    patterns.push(...contextDelays);

    // Pattern 4: origin-based velocity
    const fromThought = done.filter(t => t.origin === 'thought');
    const direct      = done.filter(t => t.origin === 'direct');
    if (fromThought.length >= 2 && direct.length >= 2) {
        const thoughtAvg = _avgDurationDays(fromThought);
        const directAvg  = _avgDurationDays(direct);
        if (thoughtAvg !== null && directAvg !== null) {
            if (directAvg  < thoughtAvg * 0.6) {
                patterns.push('Directly created tasks tend to be completed faster than thought-originated tasks.');
            } else if (thoughtAvg < directAvg  * 0.6) {
                patterns.push('Tasks originating from thoughts tend to be completed faster than directly created ones.');
            }
        }
    }

    // Pattern 5: rescheduling frequency
    const heavilyRescheduled = done.filter(t => (t.rescheduleCount ?? 0) >= 2);
    if (heavilyRescheduled.length >= 2) {
        patterns.push(
            `${heavilyRescheduled.length} completed tasks required multiple reschedules before being done.`
        );
    }

    // Pattern 6: fast-cycle pattern
    const shortTasks = done.filter(t => {
        const d = _taskDurationDays(t);
        return d !== null && d <= 2;
    });
    if (shortTasks.length >= 2 && shortTasks.length / done.length >= 0.5) {
        patterns.push('Most completed tasks were resolved within two days of being created.');
    }

    return patterns;
}

/**
 * Adjusts a task's pre-computed base score using lightweight history signals.
 * Adjustments are bounded to ±MAX_ADJUSTMENT so this module never overrides
 * the core scoring logic.
 *
 * Signals applied (additive):
 *   - rescheduleCount ≥ 3: +15 (persistent avoidance pattern)
 *   - rescheduleCount ≥ 1: +7  (has been bumped at least once)
 *   - thought-origin, created within last 3 days: +10 (fresh idea energy)
 *
 * Done tasks always return 0.
 * Never throws; returns baseScore unchanged when no signals match.
 */
export function adjustTaskScoreWithHistory(task: Task, baseScore: number): number {
    if (task.status === 'done') return 0;

    let adjustment = 0;

    // Rescheduling pressure
    const reschedules = task.rescheduleCount ?? 0;
    if (reschedules >= 3)      adjustment += 15;
    else if (reschedules >= 1) adjustment += 7;

    // Freshly created thought-linked task
    if (task.origin === 'thought' && (task.sourceThoughtIds ?? []).length > 0 && task.createdAt) {
        const createdTs = Date.parse(task.createdAt);
        if (!isNaN(createdTs) && Date.now() - createdTs <= 3 * MS_PER_DAY) {
            adjustment += 10;
        }
    }

    adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustment));
    return baseScore + adjustment;
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Parses a YYYY-MM-DD string into a UTC midnight timestamp (ms).
 * Returns null for any unparseable value so callers skip gracefully.
 */
function _parseDateOnly(dateStr: string): number | null {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(ts) ? null : ts;
}

/** Duration in fractional days from createdAt to completedAt. Returns null if data missing. */
function _taskDurationDays(task: Task): number | null {
    if (!task.createdAt || !task.completedAt) return null;
    const start = Date.parse(task.createdAt);
    const end   = Date.parse(task.completedAt);
    if (isNaN(start) || isNaN(end) || end < start) return null;
    return (end - start) / MS_PER_DAY;
}

/** Average duration (days) across a list of tasks; null when no durations are available. */
function _avgDurationDays(tasks: Task[]): number | null {
    const durations = tasks.map(_taskDurationDays).filter((d): d is number => d !== null);
    if (durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
}

/** True when the task had a due date and was completed more than one day past it. */
function _wasCompletedLate(task: Task): boolean {
    if (!task.due || !task.completedAt) return false;
    const dueTs       = _parseDateOnly(task.due);
    const completedTs = Date.parse(task.completedAt);
    if (dueTs === null || isNaN(completedTs)) return false;
    return completedTs > dueTs + MS_PER_DAY;
}

/**
 * Detects per-context late-completion clusters.
 * Returns a pattern string for any context where ≥ LATE_RATE_THRESHOLD of
 * tasks were completed after their due date (min CONTEXT_MIN_SAMPLE tasks).
 */
function _detectContextDelays(done: Task[]): string[] {
    const buckets = new Map<string, { total: number; late: number }>();

    for (const task of done) {
        const ctx   = task.context ?? 'untagged';
        const entry = buckets.get(ctx) ?? { total: 0, late: 0 };
        entry.total++;
        if (_wasCompletedLate(task)) entry.late++;
        buckets.set(ctx, entry);
    }

    const patterns: string[] = [];
    for (const [ctx, { total, late }] of buckets) {
        if (total < CONTEXT_MIN_SAMPLE) continue;
        const rate = late / total;
        if (rate >= LATE_RATE_THRESHOLD) {
            patterns.push(
                `Tasks tagged "${ctx}" are frequently completed after their due date (${Math.round(rate * 100)}%).`
            );
        }
    }

    return patterns;
}

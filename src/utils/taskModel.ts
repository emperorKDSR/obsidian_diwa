import type { Task } from '../types';

const TASK_ID_PREFIX = 'tsk_';

/** Returns the current instant as an ISO-8601 UTC string (e.g. "2026-05-16T10:15:00.000Z"). */
export function isoNow(): string {
    return new Date().toISOString();
}

/**
 * Returns a unique task ID in the form `tsk_<base36-timestamp><random>`.
 * Collision probability is negligible for human-scale usage.
 */
export function generateTaskId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `${TASK_ID_PREFIX}${ts}${rand}`;
}

/**
 * Parses a markdown task entry block into a Task object.
 *
 * Accepts both simple (backward-compatible) and extended formats:
 *
 *   Simple:
 *     - [ ] Buy milk
 *     - [x] Done task
 *
 *   Extended (metadata on indented lines below):
 *     - [ ] Call supplier
 *       id: tsk_abc123
 *       origin: direct
 *       status: planned
 *       due: 2026-05-20
 *       context: work
 *       sourceThoughtIds: th_abc, th_def
 *
 * Lines that are not valid checkbox entries are treated as direct tasks
 * with title set to the trimmed first line.
 *
 * Old tasks with no ID or metadata are given defaults:
 *   origin = "direct", sourceThoughtIds = [], status = "planned"
 */
export function parseTaskEntry(markdownLine: string): Task {
    const lines = markdownLine.split('\n');
    const firstLine = lines[0];

    const isDone = /^[\s>]*- \[x\]/i.test(firstLine);
    const isOpen = /^[\s>]*- \[ \]/.test(firstLine);

    if (!isDone && !isOpen) {
        return {
            id: generateTaskId(),
            title: firstLine.trim(),
            origin: 'direct',
            sourceThoughtIds: [],
            status: 'planned',
        };
    }

    const title = firstLine
        .replace(/^[\s>]*- \[[x ]\]\s*/i, '')
        .trim();

    // Collect indented key: value metadata lines.
    // The value may be empty (e.g. "  sourceThoughtIds:" with nothing after),
    // so we use (.*) instead of (.+) and record the empty string too.
    const meta: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/^\s+([\w]+):\s*(.*)\s*$/);
        if (m) meta[m[1].trim()] = m[2].trim();
    }

    // status: checkbox drives the fallback; inline metadata takes precedence
    let status: Task['status'] = isDone ? 'done' : 'planned';
    const rawStatus = meta['status'];
    if (rawStatus === 'planned' || rawStatus === 'active' || rawStatus === 'done') {
        status = rawStatus;
    }

    const rawOrigin = meta['origin'];
    const origin: Task['origin'] = rawOrigin === 'thought' ? 'thought' : 'direct';

    const rawSourceIds = meta['sourceThoughtIds'];
    const sourceThoughtIds = rawSourceIds
        ? rawSourceIds.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    return {
        id: meta['id'] || generateTaskId(),
        title,
        origin,
        sourceThoughtIds,
        status,
        due: meta['due'] || undefined,
        context: meta['context'] || undefined,
        // Lifecycle timestamps — absent on legacy tasks; callers should treat as undefined
        createdAt:   meta['createdAt']   || undefined,
        updatedAt:   meta['updatedAt']   || undefined,
        completedAt: meta['completedAt'] || undefined,
    };
}

/**
 * Converts a Task object back into a readable markdown block.
 *
 * The checkbox reflects the status field:
 *   - "done"    → - [x]
 *   - any other → - [ ]
 *
 * All metadata is written as indented key: value lines beneath the
 * checkbox line so the result stays readable in plain Obsidian markdown.
 */
export function stringifyTask(task: Task): string {
    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    const firstLine = `- ${checkbox} ${task.title}`;

    const metaLines: string[] = [
        `  id: ${task.id}`,
        `  origin: ${task.origin}`,
        // sourceThoughtIds always present so the field is discoverable even when empty
        task.sourceThoughtIds.length > 0
            ? `  sourceThoughtIds: ${task.sourceThoughtIds.join(', ')}`
            : `  sourceThoughtIds:`,
        `  status: ${task.status}`,
    ];

    if (task.due) {
        metaLines.push(`  due: ${task.due}`);
    }
    if (task.context) {
        metaLines.push(`  context: ${task.context}`);
    }
    if (task.createdAt) {
        metaLines.push(`  createdAt: ${task.createdAt}`);
    }
    if (task.updatedAt) {
        metaLines.push(`  updatedAt: ${task.updatedAt}`);
    }
    // completedAt always present — empty when task is not yet done
    metaLines.push(
        task.completedAt ? `  completedAt: ${task.completedAt}` : `  completedAt:`
    );

    return [firstLine, ...metaLines].join('\n');
}

/**
 * Validates and normalises the mutable fields of a Task object in-place.
 * Safe to call on any Task before persisting; never throws.
 *
 * Rules applied:
 *   - origin:           must be 'thought' | 'direct'; defaults to 'direct'
 *   - sourceThoughtIds: deduped, empty strings removed
 *   - status:           must be 'planned' | 'active' | 'done'; defaults to 'planned'
 */
export function normalizeTaskFields(task: Task): Task {
    const validOrigins: Task['origin'][] = ['thought', 'direct'];
    if (!validOrigins.includes(task.origin)) task.origin = 'direct';

    task.sourceThoughtIds = Array.from(
        new Set(task.sourceThoughtIds.map(s => s.trim()).filter(Boolean))
    );

    const validStatuses: Task['status'][] = ['planned', 'active', 'done'];
    if (!validStatuses.includes(task.status)) task.status = 'planned';

    // completedAt must only be set when status is done; clear it otherwise
    if (task.status !== 'done') task.completedAt = undefined;

    return task;
}

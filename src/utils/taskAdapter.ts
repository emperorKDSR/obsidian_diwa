import type { Task, TaskEntry } from '../types';

/**
 * Adapts a TaskEntry (file-per-task model from IndexService) into the
 * lightweight Task model used by the scoring, scheduling, and focus engines.
 *
 * Migration rules:
 *   - lifecycleStatus present → use it directly
 *   - status = 'done'        → 'done'
 *   - everything else        → 'planned' (open / waiting / someday)
 *   - taskId absent          → fall back to filePath as the stable ID
 *   - due field              → already normalised by IndexService (no [[...]])
 *   - context[]              → first element used as Task.context (single string)
 */
export function taskEntryToTask(entry: TaskEntry): Task {
    let status: Task['status'];

    if (
        entry.lifecycleStatus === 'active' ||
        entry.lifecycleStatus === 'planned' ||
        entry.lifecycleStatus === 'done'
    ) {
        status = entry.lifecycleStatus;
    } else if (entry.status === 'done') {
        status = 'done';
    } else {
        // 'open', 'waiting', 'someday' → planned (backward compat)
        status = 'planned';
    }

    return {
        id:               entry.taskId ?? entry.filePath,
        title:            entry.title,
        origin:           entry.origin   ?? 'direct',
        sourceThoughtIds: entry.sourceThoughtIds ?? [],
        status,
        due:              entry.due?.trim() || undefined,
        context:          entry.context?.[0],
        createdAt:        entry.createdAt,
        updatedAt:        entry.updatedAt,
        completedAt:      entry.completedAt,
    };
}

/**
 * Returns the vault file path for a TaskEntry.
 * Convenience helper so callers don't need to reference `.filePath` directly.
 */
export function taskEntryPath(entry: TaskEntry): string {
    return entry.filePath;
}

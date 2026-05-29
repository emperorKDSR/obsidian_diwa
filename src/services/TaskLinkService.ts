import { App, TFile, moment } from 'obsidian';
import type { DiwaSettings, Task, TaskEntry } from '../types';
import type { IndexService } from './IndexService';
import { generateTaskId, normalizeTaskFields, isoNow } from '../utils/taskModel';
import { createVaultFile } from './VaultService';
import { buildYamlFrontmatter } from '../utils/vaultFiles';

/**
 * TaskLinkService — manages the bidirectional relationship between tasks and
 * thoughts. All four public methods are idempotent and safe to call multiple
 * times; file mutations go through processFrontMatter (atomic, cache-safe).
 *
 * IDs used throughout this service are vault file paths, consistent with how
 * IndexService keys both taskIndex and thoughtIndex.
 */
export class TaskLinkService {
    private app: App;
    private settings: DiwaSettings;
    private index: IndexService;

    constructor(app: App, settings: DiwaSettings, index: IndexService) {
        this.app = app;
        this.settings = settings;
        this.index = index;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Creates a new task file typed as originating directly from the user.
     * The task carries origin="direct" and an empty sourceThoughtIds list.
     * It can later receive thought links via addThoughtToExistingTask.
     *
     * @param title  Task title text.
     * @returns      A Task object describing the newly created task.
     */
    async createTaskDirectly(title: string): Promise<Task> {
        const id = generateTaskId();
        const task = normalizeTaskFields({
            id,
            title,
            origin: 'direct',
            sourceThoughtIds: [],
            status: 'planned',
        });
        task.filePath = await this._writeTaskFile(task);
        return task;
    }

    /**
     * Creates a new task file that explicitly originates from a thought.
     * The task carries origin="thought" and sourceThoughtIds=[thoughtId].
     *
     * @param thoughtId  Vault file path of the source thought.
     * @param title      Task title text.
     * @returns          A Task object describing the newly created task.
     */
    async createTaskFromThought(thoughtId: string, title: string): Promise<Task> {
        const id = generateTaskId();
        const task = normalizeTaskFields({
            id,
            title,
            origin: 'thought',
            sourceThoughtIds: [thoughtId],
            status: 'planned',
        });
        task.filePath = await this._writeTaskFile(task);
        return task;
    }

    /**
     * Appends thoughtId to an existing task's sourceThoughtIds list.
     * No-op if the thought is already linked (idempotent).
     *
     * @param taskId    Vault file path of the task to update.
     * @param thoughtId Vault file path of the thought to link.
     */
    async addThoughtToExistingTask(taskId: string, thoughtId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(taskId);
        if (!(file instanceof TFile)) {
            return;
        }

        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                const existing = _normalizeStringArray(fm['sourceThoughtIds']);

                if (existing.includes(thoughtId)) return; // idempotent

                existing.push(thoughtId);
                fm['sourceThoughtIds'] = existing;

                // Promote origin to "thought" if this is the first thought link
                if (!fm['origin']) fm['origin'] = 'thought';

                // Ensure a stable taskId exists
                if (!fm['taskId']) fm['taskId'] = generateTaskId();

                fm['modified'] = this._formatDateTime(new Date());
            });
        } catch (e) {
            console.error('[DIWA TaskLinkService] addThoughtToExistingTask:', e);
        }
    }

    /**
     * Adds taskId to the thought's linkedTasks frontmatter list.
     * No-op if already present (idempotent).
     *
     * @param taskId    Vault file path of the task.
     * @param thoughtId Vault file path of the thought to annotate.
     */
    async linkTaskToThought(taskId: string, thoughtId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(thoughtId);
        if (!(file instanceof TFile)) {
            return;
        }

        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                const existing = _normalizeStringArray(fm['linkedTasks']);

                if (existing.includes(taskId)) return; // idempotent

                existing.push(taskId);
                fm['linkedTasks'] = existing;
                fm['modified'] = this._formatDateTime(new Date());
            });
        } catch (e) {
            console.error('[DIWA TaskLinkService] linkTaskToThought:', e);
        }
    }

    /**
     * Returns all indexed TaskEntry objects that list thoughtId in their
     * sourceThoughtIds. Reads from the in-memory taskIndex (no file I/O).
     * Legacy tasks with no sourceThoughtIds are treated as [] and skipped.
     *
     * @param thoughtId Vault file path of the thought.
     */
    getTasksForThought(thoughtId: string): TaskEntry[] {
        const result: TaskEntry[] = [];
        for (const entry of this.index.taskIndex.values()) {
            const ids = entry.sourceThoughtIds ?? [];
            if (ids.includes(thoughtId)) result.push(entry);
        }
        return result;
    }

    // ── Lifecycle API ──────────────────────────────────────────────────────

    /**
     * Transitions a task to a new lifecycle state and persists all related
     * timestamps. Accepts either a structured task ID (tsk_xxx) or a vault
     * file path — whichever the caller has at hand.
     *
     * State rules:
     *   planned  → updatedAt refreshed; completedAt cleared
     *   active   → updatedAt refreshed; completedAt cleared
     *   done     → updatedAt + completedAt set to now
     *
     * Idempotent: if the task is already in newState, only updatedAt is
     * refreshed (no duplicate history, no data corruption).
     *
     * Also syncs the DIWA-native status field so existing rendering code
     * continues to work:
     *   planned | active  → status: open
     *   done              → status: done
     */
    async updateTaskState(
        taskIdOrPath: string,
        newState: 'planned' | 'active' | 'done'
    ): Promise<void> {
        const file = await this._resolveTaskFile(taskIdOrPath);
        if (!file) {
            return;
        }

        const now = isoNow();

        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['lifecycleStatus'] = newState;
                fm['updatedAt'] = now;
                fm['modified']  = this._formatDateTime(new Date());

                if (newState === 'done') {
                    if (!fm['completedAt']) fm['completedAt'] = now; // idempotent
                    fm['status'] = 'done';
                } else {
                    fm['completedAt'] = '';   // clear on re-open / replan
                    fm['status'] = 'open';    // keep DIWA status in sync
                }

                // Ensure stable taskId exists on legacy files
                if (!fm['taskId']) fm['taskId'] = generateTaskId();
            });
        } catch (e) {
            console.error('[DIWA TaskLinkService] updateTaskState:', e);
        }
    }

    /** Moves task to "active". Shorthand for updateTaskState(id, "active"). */
    async markTaskActive(taskIdOrPath: string): Promise<void> {
        return this.updateTaskState(taskIdOrPath, 'active');
    }

    /** Moves task to "done". Shorthand for updateTaskState(id, "done"). */
    async markTaskDone(taskIdOrPath: string): Promise<void> {
        return this.updateTaskState(taskIdOrPath, 'done');
    }

    /**
     * Re-opens a completed task by moving it back to "active".
     * Clears completedAt so timestamps stay accurate.
     */
    async reopenTask(taskIdOrPath: string): Promise<void> {
        return this.updateTaskState(taskIdOrPath, 'active');
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /**
     * Builds the YAML frontmatter block for a new task file.
     * sourceThoughtIds is emitted as a YAML list when non-empty, or omitted.
     * Lifecycle timestamps are always written on creation.
     */
    private _buildTaskFrontmatter(task: Task, created: string, dayStr: string): string {
        const safeTitle = this._sanitizeYaml(task.title);
        const ts = task.createdAt ?? isoNow();

        return `${buildYamlFrontmatter({
            title: safeTitle,
            created,
            modified: created,
            day: `[[${dayStr}]]`,
            area: 'DIWA_TASKS',
            status: 'open',
            due: '',
            context: [],
            tags: [],
            taskId: task.id,
            origin: task.origin,
            sourceThoughtIds: task.sourceThoughtIds,
            lifecycleStatus: task.status,
            createdAt: ts,
            updatedAt: ts,
            completedAt: null,
        })}\n`;
    }

    /** Creates the physical task file from a normalised Task object. */
    private async _writeTaskFile(task: Task): Promise<string> {
        const folder = (this.settings.tasksFolder || '000 Bin/DIWA Gawa').trim();
        const now = new Date();
        // Stamp timestamps on creation if not already set
        const ts = isoNow();
        if (!task.createdAt) task.createdAt = ts;
        if (!task.updatedAt) task.updatedAt = ts;

        const frontmatter = this._buildTaskFrontmatter(
            task,
            this._formatDateTime(now),
            this._formatDate(now)
        );

        try {
            const file = await createVaultFile(this.app, folder, this._generateFilename('task_'), frontmatter + task.title + '\n');
            return file.path;
        } catch (e) {
            console.error('[DIWA TaskLinkService] _writeTaskFile:', e);
            throw e;
        }
    }

    /**
     * Resolves a task file from either a structured task ID (tsk_xxx) or a
     * vault file path. Returns null if the task cannot be found.
     *
     * Resolution order:
     *   1. Try as vault file path (O(1) lookup)
     *   2. Search taskIndex for matching taskId field (O(n) scan)
     */
    private _resolveTaskFile(taskIdOrPath: string): TFile | null {
        const byPath = this.app.vault.getAbstractFileByPath(taskIdOrPath);
        if (byPath instanceof TFile) return byPath;

        for (const entry of this.index.taskIndex.values()) {
            if (entry.taskId === taskIdOrPath) {
                const f = this.app.vault.getAbstractFileByPath(entry.filePath);
                return f instanceof TFile ? f : null;
            }
        }
        return null;
    }

    private _formatDateTime(d: Date): string {
        return moment(d).format('YYYY-MM-DD HH:mm:ss');
    }

    private _formatDate(d: Date): string {
        return moment(d).format('YYYY-MM-DD');
    }

    private _sanitizeYaml(value: string): string {
        return value.replace(/[\n\r]/g, ' ').replace(/"/g, "'").trim();
    }

    private _generateFilename(prefix = ''): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${prefix}${date}_${time}_${rand}.md`;
    }

}

// ── Module-level helper (no Obsidian dependency) ──────────────────────────

/**
 * Normalises a raw YAML value into a deduplicated string[].
 * Handles YAML lists, comma-separated scalars, and missing values.
 */
function _normalizeStringArray(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
    return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

import { App, TFile, Notice, moment } from 'obsidian';
import type { DiwaSettings, Task } from '../types';
import type { IndexService } from './IndexService';
import { generateReflectionPrompt } from '../utils/taskReflection';
import { isoNow } from '../utils/taskModel';

/**
 * TaskReflectionService — handles creation of structured reflection notes
 * after task completion and maintenance of the bidirectional task ↔ reflection link.
 *
 * All file mutations go through processFrontMatter (atomic, cache-safe).
 * Nothing is applied without explicit caller invocation — this service is
 * fully opt-in from the task completion flow.
 */
export class TaskReflectionService {
    private app: App;
    private settings: DiwaSettings;
    private index: IndexService;

    constructor(app: App, settings: DiwaSettings, index: IndexService) {
        this.app      = app;
        this.settings = settings;
        this.index    = index;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Creates a structured reflection thought file for a completed task and
     * establishes a bidirectional link between the task and the reflection.
     *
     * Reflection thought contents:
     *   - Frontmatter: area=DIWA, linkedTasks=[taskFilePath], reflectionFor=task.id
     *   - Body: pre-filled template with completion timestamp + reflection prompt
     *   - Outcome / Notes lines are left empty for the user to fill in
     *
     * Bidirectional link:
     *   - Task frontmatter receives `reflectionThoughtId` pointing to the new file
     *   - Reflection frontmatter receives `linkedTasks` pointing back to the task
     *
     * @param task          The completed Task object (must have status="done").
     * @param taskFilePath  Optional vault path of the task file (used for the
     *                      two-way link and the [[wikilink]] in the body).
     *                      When absent, only the task ID is recorded.
     * @returns             The created TFile, or null if creation failed.
     */
    async generateTaskReflection(task: Task, taskFilePath?: string): Promise<TFile | null> {
        const folder = (this.settings.thoughtsFolder || '000 Bin/DIWA').trim();
        const now    = new Date();
        const created = moment(now).format('YYYY-MM-DD HH:mm:ss');
        const dayStr  = moment(now).format('YYYY-MM-DD');

        const prompt    = generateReflectionPrompt(task);
        const safeTitle = _sanitizeYaml(`Reflection: ${task.title}`);

        const completedLabel = task.completedAt
            ? moment(task.completedAt).format('YYYY-MM-DD HH:mm')
            : dayStr;

        // The wikilink body reference — prefer file path so Obsidian resolves it
        const taskRef = taskFilePath
            ? `[[${taskFilePath}]]`
            : task.id;

        const linkedTasksYaml = taskFilePath
            ? `linkedTasks:\n  - "${taskFilePath.replace(/"/g, "'")}"`
            : 'linkedTasks: []';

        const frontmatter = [
            '---',
            `title: "${safeTitle}"`,
            `created: ${created}`,
            `modified: ${created}`,
            `day: "[[${dayStr}]]"`,
            `area: DIWA`,
            `reflectionFor: "${task.id}"`,
            linkedTasksYaml,
            `context:`,
            `  []`,
            `tags:`,
            `  []`,
            `pinned: false`,
            '---',
            '',
        ].join('\n');

        const body = [
            `## Reflection: ${task.title}`,
            '',
            `**Completed:** ${completedLabel}`,
            `**Task:** ${taskRef}`,
            '',
            '---',
            '',
            `**${prompt}**`,
            '',
            '> Outcome: ',
            '> Notes: ',
            '',
        ].join('\n');

        let file: TFile | null = null;

        try {
            await this._ensureFolder(folder);
            const path = `${folder}/${this._generateFilename('reflection_')}`;
            file = await this.app.vault.create(path, frontmatter + body);
        } catch (e) {
            console.error('[DIWA TaskReflectionService] generateTaskReflection:', e);
            return null;
        }

        // Store reflectionThoughtId on the task file (idempotent)
        if (taskFilePath) {
            await this._linkReflectionToTask(taskFilePath, file.path);
        }

        return file;
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /**
     * Updates the task's frontmatter to record the path of its reflection note.
     * Idempotent — does nothing if `reflectionThoughtId` is already present.
     */
    private async _linkReflectionToTask(
        taskFilePath: string,
        reflectionFilePath: string
    ): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(taskFilePath);
        if (!(file instanceof TFile)) return;

        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                if (fm['reflectionThoughtId']) return; // idempotent
                fm['reflectionThoughtId'] = reflectionFilePath;
                fm['updatedAt'] = isoNow();
                fm['modified']  = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
            });
        } catch (e) {
            console.error('[DIWA TaskReflectionService] _linkReflectionToTask:', e);
        }
    }

    private _generateFilename(prefix = ''): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${prefix}${date}_${time}_${rand}.md`;
    }

    private async _ensureFolder(folder: string): Promise<void> {
        if (folder.includes('..') || folder.startsWith('/') || folder.startsWith('\\')) {
            throw new Error(`Invalid folder path: "${folder}"`);
        }
        if (!folder || folder === '/' || folder === '.') return;

        const parts = folder.split('/');
        let pathSoFar = '';
        for (const part of parts) {
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(pathSoFar)) {
                try {
                    await this.app.vault.createFolder(pathSoFar);
                } catch (e) {
                    if (!(e as Error).message?.includes('already exists')) throw e;
                }
            }
        }
    }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function _sanitizeYaml(value: string): string {
    return value.replace(/[\n\r]/g, ' ').replace(/"/g, "'").trim();
}

import { App, TFile, Notice, moment } from 'obsidian';
import type { DiwaSettings, ThoughtEntry, TaskEntry, ReplyEntry } from '../types';
import { generateTaskId } from '../utils/taskModel';
import { buildJournalContexts, normalizeJournalType } from '../journal/shared';
import { normalizeThoughtTopics, toStoredThoughtTopic } from '../utils/topics';
import { buildAttachmentWikiLink } from '../utils';
import { buildTaskCommentBlock, parseTaskCommentBlocks, splitTaskBodyAndCommentSuffix } from '../utils/taskComments';
import { getCanonicalMonthlyGoalsPath, getCanonicalWeeklyReviewPath, getCanonicalWeeklyReviewsFolder } from '../utils/settingsPaths';
import {
    buildWeeklyReviewContent,
    getLegacyWeeklyReviewWeekId,
    getWeeklyReviewWeekMeta,
    parseLegacyWeeklyReviewBody,
    parseStructuredWeeklyReview,
    shiftWeeklyReviewWeek,
} from '../utils/weeklyReview';
import { buildYamlFrontmatter, createVaultBinaryFile, createVaultFile, ensureVaultFolder, normalizeVaultRelativePath } from '../utils/vaultFiles';

interface ThoughtWriteOptions {
    title?: string;
    journalType?: string | null;
    day?: string;
    created?: string;
    modified?: string;
}

export { createVaultBinaryFile, createVaultFile };

export class VaultService {
    app: App;
    settings: DiwaSettings;
    private taskFolderResolver?: () => string;
    private static readonly WEEKLY_OBJECTIVE_WIKILINK = '[[weeklyObjective]]';
    private static readonly WEEKLY_OBJECTIVE_MARKER_PREFIX = '<!-- DIWA-WEEKLY-OBJECTIVE ';
    private static readonly WEEKLY_OBJECTIVE_MARKER_SUFFIX = ' -->';

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    setTaskFolderResolver(resolver?: () => string) {
        this.taskFolderResolver = resolver;
    }

    /** sec-015: Map errors to user-friendly messages; never surface raw e.message */
    private static toUserMessage(e: unknown): string {
        const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('access')) return 'Permission denied — check your vault folder permissions.';
        if (msg.includes('not found') || msg.includes('does not exist')) return 'File not found — it may have been moved or deleted.';
        if (msg.includes('already exists')) return 'A file with that name already exists.';
        if (msg.includes('disk') || msg.includes('space') || msg.includes('enospc')) return 'Not enough disk space — free up storage and try again.';
        return 'Something went wrong. Open the developer console (Ctrl+Shift+I) for details.';
    }

    private extractTitle(text: string): string {
        const firstLine = text.split('\n').find(l => l.trim()) || text;
        return firstLine.replace(/[#*_`\[\]]/g, '').trim();
    }

    private formatDateTime(d: Date): string { return moment(d).format('YYYY-MM-DD HH:mm:ss'); }
    private formatDate(d: Date): string     { return moment(d).format('YYYY-MM-DD'); }
    private formatTime(d: Date): string     { return moment(d).format('HH:mm:ss'); }

    private resolveConfiguredFolder(path: string | undefined, fallback: string): string {
        return normalizeVaultRelativePath((path || '').trim() || fallback, 'folder');
    }

    private normalizeTopics(topic?: string | string[] | null): string[] {
        return normalizeThoughtTopics(topic)
            .map((value) => value.replace(/[^a-zA-Z0-9 _-]/g, '').trim())
            .filter(Boolean);
    }

    private buildFrontmatter(title: string, created: string, modified: string, dayStr: string, contexts: string[], pinned: boolean = false, topic?: string | string[] | null, journalType?: string | null): string {
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const safeTopics = this.normalizeTopics(topic);
        const safeTags = safeTopics.length > 0
            ? safeContexts.flatMap((context) => safeTopics.map((value) => `${context}/${value}`))
            : safeContexts;
        return buildYamlFrontmatter({
            title,
            created,
            modified,
            day: `[[${dayStr}]]`,
            area: 'DIWA',
            context: safeContexts,
            tags: safeTags,
            pinned,
            journalType: journalType || undefined,
            topic: safeTopics.length === 0
                ? undefined
                : (safeTopics.length === 1 ? safeTopics[0] : safeTopics),
        });
    }

    private buildTaskFrontmatter(
        title: string,
        created: string,
        modified: string,
        dayStr: string,
        status: string,
        due: string,
        contexts: string[],
        recurrence?: string,
        recurrenceParentId?: string,
        priority?: string,
        energy?: string,
    ): string {
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const safeStatus = this.normalizeTaskStatus(status);
        const safeDue = this.normalizeTaskDue(due);
        const safeRecurrence = this.normalizeTaskRecurrence(recurrence);
        const safePriority = this.normalizeTaskLevel(priority);
        const safeEnergy = this.normalizeTaskLevel(energy);
        const safeParentId = this.normalizeTaskRecurrenceParentId(recurrenceParentId);
        const taskId = generateTaskId();
        const bucket = safeStatus === 'done' ? 'done' : (safeStatus === 'waiting' ? 'active' : 'backlog');
        return buildYamlFrontmatter({
            title,
            taskId,
            created,
            modified,
            day: `[[${dayStr}]]`,
            area: 'DIWA_TASKS',
            status: safeStatus,
            bucket,
            focus: false,
            due: safeDue ? `[[${safeDue}]]` : '',
            context: safeContexts,
            tags: safeContexts,
            recurrence: safeRecurrence || undefined,
            recurrenceParentId: safeParentId || undefined,
            priority: safePriority || undefined,
            energy: safeEnergy || undefined,
        });
    }

    // sec-006: Strip characters that break YAML string values
    private sanitizeYamlString(value: string): string {
        return value.replace(/[\n\r]/g, ' ').replace(/"/g, "'").trim();
    }

    // sec-006: Strip characters that break YAML list items
    private sanitizeContext(ctx: string): string {
        return ctx.replace(/[\n\r:#"]/g, '').trim();
    }

    private normalizeLineBreaks(value: string): string {
        return value.replace(/\r\n?/g, '\n');
    }

    private normalizeDueDateValue(value?: string): string {
        const normalized = (value || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
    }

    private normalizeAmountValue(value?: string): string {
        const normalized = (value || '').trim().replace(/[^\d.,-]/g, '');
        return normalized || '0.00';
    }

    private splitBodyAndReplySuffix(body: string): { body: string; replySuffix: string } {
        const split = splitTaskBodyAndCommentSuffix(body);
        return { body: split.body, replySuffix: split.commentSuffix };
    }

    private composeBodyWithReplySuffix(body: string, replySuffix: string): string {
        const normalizedBody = this.normalizeLineBreaks(body).trimEnd();
        if (!replySuffix) {
            return `${normalizedBody}\n`;
        }
        return normalizedBody
            ? `${normalizedBody}\n${replySuffix}`
            : replySuffix;
    }

    private buildAttachmentFilename(prefix: string, file: Pick<File, 'name'>): string {
        const originalName = String(file.name || '').trim();
        const extIdx = originalName.lastIndexOf('.');
        const stem = (extIdx > 0 ? originalName.substring(0, extIdx) : originalName)
            .replace(/[^\w\s-]/g, ' ')
            .replace(/\s+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'file';
        const extension = extIdx > 0
            ? originalName.substring(extIdx).replace(/[^.\w-]/g, '').toLowerCase()
            : '.bin';
        const ts = moment().format('YYYYMMDD_HHmmss');
        const rand = Math.random().toString(36).substring(2, 6);
        return `${prefix}_${ts}_${rand}_${stem}${extension || '.bin'}`;
    }

    private getWeeklyObjectiveMarker(weekId: string): string {
        return `${VaultService.WEEKLY_OBJECTIVE_MARKER_PREFIX}${weekId}${VaultService.WEEKLY_OBJECTIVE_MARKER_SUFFIX}`;
    }

    private getWeeklyObjectiveTitle(weekId: string): string {
        return `Weekly Focus · ${weekId}`;
    }

    private getThoughtsFolder(): string {
        return this.resolveConfiguredFolder(this.settings.thoughtsFolder, '000 Bin/DIWA');
    }

    private normalizeWeeklyObjectiveLines(focus: string[]): string[] {
        return focus
            .flatMap((value) => this.normalizeLineBreaks(String(value ?? '')).split('\n'))
            .map((value) => value.replace(/\[\[weeklyObjective\]\]/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
    }

    private buildWeeklyObjectiveBody(weekId: string, focus: string[]): string {
        const lines = this.normalizeWeeklyObjectiveLines(focus);
        const marker = this.getWeeklyObjectiveMarker(weekId);
        if (lines.length === 0) return `${marker}\n`;
        return `${marker}\n\n${lines.map((line) => `- ${VaultService.WEEKLY_OBJECTIVE_WIKILINK} ${line}`).join('\n')}\n`;
    }

    private async findWeeklyObjectiveThought(weekId: string, day: string): Promise<TFile | null> {
        const thoughtsFolder = this.getThoughtsFolder();
        const dayCandidates = this.app.vault.getMarkdownFiles().filter((file) => {
            if (file.path !== thoughtsFolder && !file.path.startsWith(`${thoughtsFolder}/`)) return false;
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            const cachedDay = typeof frontmatter?.day === 'string'
                ? frontmatter.day.replace(/^\[\[|\]\]$/g, '').trim()
                : '';
            return cachedDay === day;
        });
        const marker = this.getWeeklyObjectiveMarker(weekId);
        for (const file of dayCandidates) {
            const raw = await this.app.vault.read(file);
            if (raw.includes(marker)) return file;
        }
        return null;
    }

    private async writeThoughtFile(
        file: TFile | null,
        text: string,
        contexts: string[],
        topic?: string | string[] | null,
        options?: ThoughtWriteOptions,
    ): Promise<TFile> {
        if (file) {
            await this.editThought(file.path, text, contexts, {
                topic,
                title: options?.title,
                journalType: options?.journalType,
                day: options?.day,
                modified: options?.modified,
            });
            return file;
        }
        return this.createThoughtFile(text, contexts, topic, options);
    }

    private async upsertWeeklyObjectiveThought(reviewWeekId: string, focus: string[]): Promise<void> {
        const targetWeekId = shiftWeeklyReviewWeek(reviewWeekId, 1);
        const targetWeekMeta = getWeeklyReviewWeekMeta(targetWeekId);
        const targetDay = targetWeekMeta.startDate;
        const title = this.getWeeklyObjectiveTitle(targetWeekId);
        const existing = await this.findWeeklyObjectiveThought(targetWeekId, targetDay);
        const body = this.buildWeeklyObjectiveBody(targetWeekId, focus);
        const created = existing ? undefined : `${targetDay} 09:00:00`;
        const modified = this.formatDateTime(new Date());

        await this.writeThoughtFile(
            existing,
            body,
            [],
            null,
            {
                title,
                day: targetDay,
                created,
                modified,
            },
        );
    }

    private normalizeTaskStatus(value?: string): TaskEntry['status'] {
        switch (value?.trim()) {
            case 'done':
                return 'done';
            case 'waiting':
                return 'waiting';
            case 'someday':
                return 'someday';
            case 'open':
            default:
                return 'open';
        }
    }

    private normalizeTaskDue(value?: string): string | undefined {
        const normalized = value?.trim().replace(/\[\[|\]\]/g, '');
        return normalized ? this.sanitizeYamlString(normalized) : undefined;
    }

    private normalizeTaskRecurrence(value?: string): TaskEntry['recurrence'] {
        switch (value?.trim()) {
            case 'daily':
                return 'daily';
            case 'weekly':
                return 'weekly';
            case 'biweekly':
                return 'biweekly';
            case 'monthly':
                return 'monthly';
            default:
                return undefined;
        }
    }

    private normalizeTaskRecurrenceParentId(value?: string): string | undefined {
        const normalized = value?.trim();
        return normalized ? this.sanitizeYamlString(normalized) : undefined;
    }

    private normalizeTaskLevel(value?: string): TaskEntry['priority'] {
        switch (value?.trim()) {
            case 'high':
                return 'high';
            case 'medium':
                return 'medium';
            case 'low':
                return 'low';
            default:
                return undefined;
        }
    }

    private generateFilename(prefix: string = ''): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${prefix}${date}_${time}_${rand}.md`;
    }

    async ensureFolder(folder: string) {
        await ensureVaultFolder(this.app, folder);
    }

    async createFile(folder: string, filename: string, content: string): Promise<TFile> {
        try {
            return await createVaultFile(this.app, folder, filename, content);
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            throw e;
        }
    }

    async createRecurringPaymentFile(input: {
        folder: string;
        name: string;
        nextDueDate: string;
        lastPaymentDate?: string;
        amount?: string;
        notes?: string;
    }): Promise<TFile> {
        const nextDueDate = this.normalizeDueDateValue(input.nextDueDate);
        if (!nextDueDate) {
            throw new Error('Next due date is required.');
        }

        const lastPaymentDate = this.normalizeDueDateValue(input.lastPaymentDate);
        const amount = this.normalizeAmountValue(input.amount);
        const body = this.normalizeLineBreaks(input.notes || '').trim();
        const content = `${buildYamlFrontmatter({
            category: 'recurring payment',
            active_status: true,
            next_duedate: nextDueDate,
            last_payment_date: lastPaymentDate,
            amount,
        })}\n${body}`.trimEnd() + '\n';

        return createVaultFile(
            this.app,
            input.folder,
            `${input.name}.md`,
            content,
            { onCollision: 'error' },
        );
    }

    async createThoughtFile(text: string, contexts: string[], topic?: string | string[] | null, options?: ThoughtWriteOptions): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.getThoughtsFolder();
        const now = new Date();
        const created = options?.created?.trim() || this.formatDateTime(now);
        const modified = options?.modified?.trim() || created;
        const dayStr = options?.day?.trim() || this.formatDate(now);
        const journalType = normalizeJournalType(options?.journalType);
        const normalizedContexts = journalType ? buildJournalContexts(contexts, journalType) : contexts;
        const title = options?.title?.trim() || this.extractTitle(text) || 'Untitled thought';
        const fm = this.buildFrontmatter(title, created, modified, dayStr, normalizedContexts, false, topic, journalType);
        const filename = this.generateFilename();
        return await this.createFile(folder, filename, fm + text);
    }

    async createTaskFile(
        text: string,
        contexts: string[],
        dueDate?: string,
        opts?: { priority?: string; energy?: string; status?: string; recurrence?: string; recurrenceParentId?: string },
    ): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.resolveConfiguredFolder(
            this.taskFolderResolver?.()
                || this.settings.tasksFolder,
            '000 Bin/DIWA Gawa',
        );
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const due = dueDate || '';
        const fm = this.buildTaskFrontmatter(
            title,
            created,
            created,
            dayStr,
            opts?.status ?? 'open',
            due,
            contexts,
            opts?.recurrence,
            opts?.recurrenceParentId,
            opts?.priority,
            opts?.energy,
        );
        const filename = this.generateFilename('task_');
        return await this.createFile(folder, filename, fm + text);
    }

    async editThought(filePath: string, newText: string, contexts: string[], options?: { topic?: string | string[] | null; title?: string; journalType?: string | null; day?: string; modified?: string }): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const now = new Date();
            const nowStr = options?.modified?.trim() || this.formatDateTime(now);
            const dayStr = options?.day?.trim() || this.formatDate(now);
            const journalType = normalizeJournalType(options?.journalType);
            const title = options?.title?.trim() || this.extractTitle(newText) || 'Untitled thought';
            const normalizedContexts = journalType ? buildJournalContexts(contexts, journalType) : contexts;
            const safeContexts = normalizedContexts.map(c => this.sanitizeContext(c));
            const safeTopics = this.normalizeTopics(options?.topic);
            const tags = safeTopics.length > 0
                ? safeContexts.flatMap((context) => safeTopics.map((topic) => `${context}/${topic}`))
                : safeContexts;

            // Step 1: update all FM fields safely via Obsidian API
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(title);
                fm['modified'] = nowStr;
                fm['day'] = `[[${dayStr}]]`;
                fm['context'] = safeContexts;
                fm['topic'] = toStoredThoughtTopic(safeTopics);
                if (journalType) fm['journalType'] = journalType;
                else delete fm['journalType'];
                fm['tags'] = tags;
                // preserve existing created and pinned
            });

            // Step 2: update body text, preserving comment/reply section
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            const afterFm = content.slice(fmEnd + 5);
            const { replySuffix } = this.splitBodyAndReplySuffix(afterFm);
            const newContent = content.slice(0, fmEnd + 5) + this.composeBodyWithReplySuffix(newText, replySuffix);
            await this.app.vault.modify(file, newContent);
        } catch (e) {
            console.error('[DIWA VaultService]', e);
        }
    }

    /** Assign context + optional topic to an existing thought without modifying body text.
     *  `context` FM field = base context labels (e.g. ['Grundfos'])
     *  `tags` FM field    = context/topic format (e.g. ['Grundfos/Meeting']) for Obsidian tag search */
    async assignContextToThought(filePath: string, contexts: string[], topic?: string | string[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const safeContexts = contexts.map(c => this.sanitizeContext(c));
            const safeTopics = this.normalizeTopics(topic);
            const tags = safeTopics.length > 0
                ? safeContexts.flatMap(c => safeTopics.map(t => `${c}/${t}`))
                : safeContexts;
            const nowStr = this.formatDateTime(new Date());
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['context'] = safeContexts;
                fm['topic'] = toStoredThoughtTopic(safeTopics);
                fm['tags'] = tags;
                fm['modified'] = nowStr;
                // preserve: created, title, day, body, pinned
            });
        } catch (e) {
            console.error('[DIWA VaultService]', e);
        }
    }

    async editTask(filePath: string, newText: string, contexts: string[], dueDate?: string, opts?: { priority?: string | null; energy?: string | null; status?: string }): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const now = new Date();
            const nowStr = this.formatDateTime(now);
            const dayStr = this.formatDate(now);
            const title = this.extractTitle(newText);
            const safeContexts = contexts.map(c => this.sanitizeContext(c));            // Step 1: update FM fields safely via Obsidian API — preserves status and created
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(title);
                fm['modified'] = nowStr;
                fm['day'] = `[[${dayStr}]]`;
                fm['context'] = safeContexts;
                fm['tags'] = safeContexts;
                if (dueDate !== undefined) fm['due'] = dueDate ? `[[${dueDate}]]` : '';
                if (opts?.priority !== undefined) fm['priority'] = opts.priority ?? null;
                if (opts?.energy  !== undefined) fm['energy']   = opts.energy  ?? null;
                if (opts?.status  !== undefined) fm['status']   = opts.status;
            });

            // Step 2: update body text while preserving replies
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            const afterFm = content.slice(fmEnd + 5);
            const { replySuffix } = this.splitBodyAndReplySuffix(afterFm);
            await this.app.vault.modify(file, content.slice(0, fmEnd + 5) + this.composeBodyWithReplySuffix(newText, replySuffix));
        } catch (e) {
            console.error('[DIWA VaultService]', e);
        }
    }

    async toggleTask(filePath: string, done: boolean): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['status'] = done ? 'done' : 'open';
                fm['bucket'] = done ? 'done' : 'backlog';
                if (done) fm['focus'] = false;
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) {
            console.error('[DIWA VaultService]', e);
        }
    }

    async setTaskDue(filePath: string, dueDate: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['due'] = dueDate ? `[[${dueDate}]]` : '';
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) { console.error('[DIWA VaultService]', e); }
    }

    async updateTaskTitle(filePath: string, newTitle: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(newTitle);
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) { console.error('[DIWA VaultService]', e); }
    }

    async updateTaskEntry(filePath: string, updates: {
        title:      string;
        dueDate:    string | null;
        recurrence: string | null;
        priority:   string | null;
        energy:     string | null;
        status:     string;
        contexts:   string[];
        bucketStatus?: 'backlog' | 'active' | 'done' | null;
        focus?: boolean | null;
        bodyText?: string;
    }): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) { return false; }
        try {
            const now    = new Date();
            const nowStr = this.formatDateTime(now);
            const dayStr = this.formatDate(now);
            const safeContexts = updates.contexts.map(c => this.sanitizeContext(c));

            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title']    = this.sanitizeYamlString(updates.title);
                fm['modified'] = nowStr;
                fm['day']      = `[[${dayStr}]]`;
                fm['context']  = safeContexts;
                fm['tags']     = safeContexts;
                fm['due']      = updates.dueDate ? `[[${updates.dueDate}]]` : '';
                fm['status']   = updates.status;
                if (updates.bucketStatus !== undefined) {
                    if (updates.bucketStatus !== null) fm['bucket'] = updates.bucketStatus;
                    else delete fm['bucket'];
                }
                if (updates.focus !== undefined) {
                    if (updates.focus !== null) fm['focus'] = updates.focus;
                    else delete fm['focus'];
                }
                if (updates.priority !== null) { fm['priority'] = updates.priority; }
                else { delete fm['priority']; }
                if (updates.energy !== null) { fm['energy'] = updates.energy; }
                else { delete fm['energy']; }
                if (updates.recurrence !== null) { fm['recurrence'] = updates.recurrence; }
                else { delete fm['recurrence']; }
            });

            // Update body text — preserve any reply sections
            const content = await this.app.vault.read(file);
            const fmEnd   = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return true;
            const bodyStart    = fmEnd + 5;
            const existing     = content.slice(bodyStart);
            const { replySuffix } = this.splitBodyAndReplySuffix(existing);
            const bodyText = (updates.bodyText ?? updates.title).trim();
            await this.app.vault.modify(file, content.slice(0, bodyStart) + this.composeBodyWithReplySuffix(bodyText, replySuffix));
            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
    }

    async deleteFile(filePath: string, type: 'thoughts' | 'tasks'): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        const folder = type === 'thoughts'
            ? this.resolveConfiguredFolder(this.settings.thoughtsFolder, '000 Bin/DIWA')
            : this.resolveConfiguredFolder(this.settings.tasksFolder, '000 Bin/DIWA Gawa');
        const trashFolder = `${folder}/trash`;
        await this.ensureFolder(trashFolder);
        
        try {
            const trashPath = `${trashFolder}/${file.basename}_${Date.now()}.md`;
            await this.app.vault.rename(file, trashPath);
        } catch (e) {
            console.error('[DIWA VaultService]', e);
        }
    }

    private async _trashFile(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        const folder = this.resolveConfiguredFolder(this.settings.thoughtsFolder, '000 Bin/DIWA');
        const trashFolder = `${folder}/trash`;
        await this.ensureFolder(trashFolder);
        const trashPath = `${trashFolder}/${file.basename}_${Date.now()}.md`;
        await this.app.vault.rename(file, trashPath);
    }

    async mergeThoughts(filePaths: string[], mergedText: string, contexts: string[]): Promise<TFile> {
        for (const fp of filePaths) {
            const f = this.app.vault.getAbstractFileByPath(fp);
            if (!(f instanceof TFile)) throw new Error(`Source note no longer exists: ${fp}`);
        }
        const newFile = await this.createThoughtFile(mergedText, contexts);
        const failed: string[] = [];
        for (const fp of filePaths) {
            try { await this._trashFile(fp); }
            catch { failed.push(fp); }
        }
        if (failed.length > 0) {
        }
        return newFile;
    }

    async appendComment(filePath: string, text: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        
        try {
            const now = new Date();
            const anchor = `reply-${Date.now()}`;
            const dateStr = this.formatDate(now);
            const timeStr = this.formatTime(now);
            const content = await this.app.vault.read(file);
            const commentBlock = buildTaskCommentBlock({ anchor, date: dateStr, time: timeStr }, text);
            await this.app.vault.modify(file, `${content.trimEnd()}\n\n${commentBlock}\n`);
            await this.touchModified(file, now);

            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
    }

    async updateComment(filePath: string, anchor: string, newText: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        try {
            const content = await this.app.vault.read(file);
            const updated = this.rewriteCommentSection(content, anchor, (lines, range) => {
                const parsed = parseTaskCommentBlocks(content).find((comment) => comment.anchor === anchor);
                if (!parsed) return;
                const replacement = buildTaskCommentBlock(
                    { anchor: parsed.anchor, date: parsed.date, time: parsed.time },
                    newText.replace(/<br>/g, '\n'),
                ).split('\n');
                if (range.end < lines.length) replacement.push('');
                lines.splice(range.header + 1, range.end - (range.header + 1), ...replacement);
            });
            if (!updated) return false;
            await this.app.vault.modify(file, updated);
            await this.touchModified(file);
            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
    }

    async deleteComment(filePath: string, anchor: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        try {
            const content = await this.app.vault.read(file);
            const updated = this.rewriteCommentSection(content, anchor, (_lines, range) => {
                const replacement = range.start > 0 && range.end < _lines.length ? [''] : [];
                _lines.splice(range.start, range.end - range.start, ...replacement);
            });
            if (!updated) return false;
            await this.app.vault.modify(file, updated);
            await this.touchModified(file);
            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
    }

    private async touchModified(file: TFile, at: Date = new Date()): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['modified'] = this.formatDateTime(at);
        });
    }

    private rewriteCommentSection(
        content: string,
        anchor: string,
        mutate: (lines: string[], range: { start: number; header: number; end: number }) => void | string[]
    ): string | null {
        const lines = content.split('\n');
        const parsed = parseTaskCommentBlocks(content).find((comment) => comment.anchor === anchor);
        if (!parsed) return null;

        let start = parsed.startLine;
        while (start > 0 && lines[start - 1].trim() === '') start -= 1;
        mutate(lines, { start, header: start - 1, end: parsed.endLineExclusive });
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    async markAsSynthesized(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['synthesized'] = true;
        });
    }

    async unmarkSynthesized(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['synthesized'] = false;
        });
    }

    async persistThoughtMetadata(thought: Pick<ThoughtEntry, 'filePath' | 'pinned' | 'archived' | 'state' | 'links' | 'createdAt' | 'updatedAt' | 'modified' | 'tags'>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(thought.filePath);
        if (!(file instanceof TFile)) return;
        const linkedTasks = Array.from(new Set((thought.links?.tasks ?? []).map((id) => String(id).trim()).filter(Boolean)));
        const linkedThoughts = Array.from(new Set((thought.links?.thoughts ?? []).map((id) => String(id).trim()).filter(Boolean)));
        const now = Date.now();
        const modified = thought.modified || this.formatDateTime(new Date(now));
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['pinned'] = Boolean(thought.pinned);
            fm['archived'] = Boolean(thought.archived);
            fm['state'] = thought.state || (thought.pinned ? 'important' : 'raw');
            fm['links'] = {
                tasks: linkedTasks,
                thoughts: linkedThoughts,
            };
            fm['updatedAt'] = Number(thought.updatedAt ?? now);
            if (thought.createdAt) fm['createdAt'] = Number(thought.createdAt);
            fm['modified'] = modified;
            if (thought.tags) fm['tags'] = thought.tags;
        });
    }
    /** Merge new context tags into a thought file. Pass replace=true to overwrite entirely. */
    async assignContext(filePath: string, contexts: string[], replace = false): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const safeNew = contexts.map(c => this.sanitizeContext(c)).filter(Boolean);
            const existing: string[] = replace ? [] : (Array.isArray(fm['context']) ? fm['context'].map(String) : []);
            const merged = Array.from(new Set([...existing, ...safeNew]));
            fm['context'] = merged;
            fm['tags'] = merged;
        });
    }

    /** Remove a single context tag from a thought file. */
    async removeContext(filePath: string, ctx: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const existing: string[] = Array.isArray(fm['context']) ? fm['context'].map(String) : [];
            const updated = existing.filter(c => c !== ctx);
            fm['context'] = updated;
            fm['tags'] = updated;
        });
    }


    // sec-010: savePayment — was previously a missing method called via unsafe (app as any) lookup
    async savePayment(file: TFile, paymentDate: string, nextDueDate: string, notes: string, attachedFiles: File[]): Promise<void> {
        const safePaymentDate = this.normalizeDueDateValue(paymentDate);
        const safeNextDueDate = this.normalizeDueDateValue(nextDueDate);
        if (!safePaymentDate || !safeNextDueDate) {
            throw new Error('Payment and next due dates are required.');
        }

        const savedAttachments: string[] = [];
        for (const attachedFile of attachedFiles) {
            const savedFile = await createVaultBinaryFile(
                this.app,
                this.settings.attachmentsFolder || '000 Bin/DIWA Attachments',
                this.buildAttachmentFilename('payment', attachedFile),
                await attachedFile.arrayBuffer(),
            );
            savedAttachments.push(buildAttachmentWikiLink(savedFile.path, attachedFile));
        }

        // Update next due date in frontmatter
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['next_duedate'] = safeNextDueDate;
            fm['last_payment_date'] = safePaymentDate;
            fm['modified'] = this.formatDateTime(new Date());
        });
        // Append payment record as a log entry in the file body
        const current = await this.app.vault.read(file);
        const normalizedNotes = this.normalizeLineBreaks(notes).trim();
        const recordLines = [
            '',
            '',
            `## Payment: ${safePaymentDate}`,
            `- **Paid On:** ${safePaymentDate}`,
            `- **Next Due:** ${safeNextDueDate}`,
        ];

        if (normalizedNotes) {
            recordLines.push('- **Notes:**');
            recordLines.push(...normalizedNotes.split('\n').map((line) => `  ${line}`));
        }

        if (savedAttachments.length > 0) {
            recordLines.push('- **Attachments:**');
            recordLines.push(...savedAttachments.map((link) => `  - ${link}`));
        }

        await this.app.vault.modify(file, current.trimEnd() + recordLines.join('\n') + '\n');
    }

    /** Save a weekly review to {reviewsFolder}/Weekly/YYYY-Www.md */
    async saveWeeklyReview(
        weekId: string,
        dateRange: string,
        wins: string,
        lessons: string,
        focus: string[],
        dayPlans?: Record<string, string>,
        options?: { expectedMtime?: number | null },
    ): Promise<number> {
        const folder = getCanonicalWeeklyReviewsFolder(this.settings);
        const now = this.formatDateTime(new Date());
        const content = buildWeeklyReviewContent({ weekId, dateRange, wins, lessons, focus, saved: now, dayPlans });
        try {
            await this.ensureFolder(folder);
            const { existing, path } = this.resolveWeeklyReviewFile(weekId);
            const currentMtime = existing instanceof TFile ? existing.stat.mtime : null;
            if (Object.prototype.hasOwnProperty.call(options ?? {}, 'expectedMtime') && currentMtime !== (options?.expectedMtime ?? null)) {
                const error = new Error('Weekly review changed on disk');
                error.name = 'DIWA_WEEKLY_REVIEW_CONFLICT';
                throw error;
            }
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(path, content);
            }
            try {
                await this.upsertWeeklyObjectiveThought(weekId, focus);
            } catch (objectiveError) {
                console.error('[DIWA VaultService] upsertWeeklyObjectiveThought', objectiveError);
                new Notice('Weekly review saved, but Next Week’s Focus note could not be updated.');
            }
            const savedFile = this.app.vault.getAbstractFileByPath(path);
            return savedFile instanceof TFile ? savedFile.stat.mtime : Date.now();
        } catch (e) {
            console.error('[DIWA VaultService] saveWeeklyReview', e);
            throw e;
        }
    }


    /** Save monthly goals to {reviewsFolder}/Monthly/YYYY-MM.md */
    async saveMonthlyGoals(monthId: string, goals: string[]): Promise<void> {
        const path = getCanonicalMonthlyGoalsPath(this.settings, monthId);
        const folder = path.slice(0, path.lastIndexOf('/'));
        const now = this.formatDateTime(new Date());
        const goalLines = goals.map((g, i) => `${i + 1}. ${(g || '').trim()}`).join('\n');
        const content = `${buildYamlFrontmatter({ month: monthId, saved: now })}\n# 📅 ${monthId} — Monthly Focus\n\n## Next Month's Goals\n${goalLines}\n`;
        try {
            await this.ensureFolder(folder);
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(path, content);
            }
        } catch (e) {
            console.error('[DIWA VaultService] saveMonthlyGoals', e);
            throw e;
        }
    }

    /** Load monthly goals from {reviewsFolder}/Monthly/YYYY-MM.md */
    async loadMonthlyGoals(monthId: string): Promise<string[] | null> {
        const path = getCanonicalMonthlyGoalsPath(this.settings, monthId);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        try {
            const raw = await this.app.vault.read(file);
            const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
            const goalsMatch = body.match(/## Next Month's Goals\n([\s\S]*?)(?:\n##|$)/);
            if (!goalsMatch) return null;
            return goalsMatch[1].trim().split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter((_, i) => i < 3);
        } catch (e) {
            console.error('[DIWA VaultService] loadMonthlyGoals', e);
            return null;
        }
    }

    async loadWeeklyReviewPreview(weekId: string): Promise<{ file: TFile; body: string } | null> {
        const { existing: file } = this.resolveWeeklyReviewFile(weekId);
        if (!(file instanceof TFile)) return null;
        try {
            const raw = await this.app.vault.read(file);
            return {
                file,
                body: raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim(),
            };
        } catch (e) {
            console.error('[DIWA VaultService] loadWeeklyReviewPreview', e);
            return null;
        }
    }

    /** Load a weekly review file and parse wins/lessons/focus sections */
    async loadWeeklyReview(weekId: string): Promise<{ wins: string; lessons: string; focus: string[]; saved: string; dayPlans?: Record<string, string>; mtime: number } | null> {
        const { existing: file } = this.resolveWeeklyReviewFile(weekId);
        if (!(file instanceof TFile)) return null;
        try {
            const raw = await this.app.vault.read(file);
            const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
            const structured = parseStructuredWeeklyReview(raw);
            const cache = this.app.metadataCache.getFileCache(file);
            const saved = cache?.frontmatter?.['saved'] || '';
            if (structured) {
                return {
                    wins: structured.wins,
                    lessons: structured.lessons,
                    focus: structured.focus,
                    saved: String(saved || structured.saved || ''),
                    dayPlans: structured.dayPlans,
                    mtime: file.stat.mtime,
                };
            }

            const legacy = parseLegacyWeeklyReviewBody(body);

            return {
                wins: legacy.wins,
                lessons: legacy.lessons,
                focus: legacy.focus,
                saved: String(saved || ''),
                dayPlans: legacy.dayPlans,
                mtime: file.stat.mtime,
            };
        } catch (e) {
            console.error('[DIWA VaultService] loadWeeklyReview', e);
            return null;
        }
    }

    private getWeeklyReviewCandidatePaths(weekId: string): string[] {
        const canonicalPath = getCanonicalWeeklyReviewPath(this.settings, weekId);
        const legacyPath = getCanonicalWeeklyReviewPath(this.settings, getLegacyWeeklyReviewWeekId(weekId));
        return canonicalPath === legacyPath ? [canonicalPath] : [canonicalPath, legacyPath];
    }

    private resolveWeeklyReviewFile(weekId: string): { path: string; existing: TFile | null } {
        const [canonicalPath, ...fallbackPaths] = this.getWeeklyReviewCandidatePaths(weekId);
        const canonicalFile = this.app.vault.getAbstractFileByPath(canonicalPath);
        if (canonicalFile instanceof TFile) {
            return { path: canonicalPath, existing: canonicalFile };
        }

        for (const fallbackPath of fallbackPaths) {
            const fallbackFile = this.app.vault.getAbstractFileByPath(fallbackPath);
            if (fallbackFile instanceof TFile) {
                return { path: fallbackPath, existing: fallbackFile };
            }
        }

        return { path: canonicalPath, existing: null };
    }
}

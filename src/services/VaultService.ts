import { App, TFile, Notice, moment } from 'obsidian';
import type { DiwaSettings, ThoughtEntry, TaskEntry, ReplyEntry, ProjectEntry, Milestone } from '../types';
import { generateTaskId } from '../utils/taskModel';
import { buildJournalContexts, normalizeJournalType } from '../journal/shared';
import { ensureVaultFolder } from '../utils';

interface ThoughtWriteOptions {
    title?: string;
    journalType?: string | null;
}

export class VaultService {
    app: App;
    settings: DiwaSettings;

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
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

    private buildFrontmatter(title: string, created: string, modified: string, dayStr: string, contexts: string[], pinned: boolean = false, project?: string, topic?: string, journalType?: string | null): string {
        // sec-006: Sanitize title and contexts before YAML embedding to prevent injection
        const safeTitle = this.sanitizeYamlString(title);
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const contextYaml = safeContexts.length > 0 ? safeContexts.map(c => `  - ${c}`).join('\n') : '  []';
        const projectLine = project ? `project: "${this.sanitizeYamlString(project)}"\n` : '';
        const topicLine = topic ? `topic: "${this.sanitizeYamlString(topic)}"\n` : '';
        const journalTypeLine = journalType ? `journalType: "${this.sanitizeYamlString(journalType)}"\n` : '';
        return `---\ntitle: "${safeTitle}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: DIWA\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\npinned: ${pinned}\n${journalTypeLine}${topicLine}${projectLine}---\n`;
    }

    private buildTaskFrontmatter(title: string, created: string, modified: string, dayStr: string, status: string, due: string, contexts: string[], project?: string, recurrence?: string, recurrenceParentId?: string, priority?: string, energy?: string): string {
        // sec-006: Sanitize title and contexts before YAML embedding to prevent injection
        const safeTitle = this.sanitizeYamlString(title);
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const contextYaml = safeContexts.length > 0 ? safeContexts.map(c => `  - ${c}`).join('\n') : '  []';
        const dueYaml = due ? `"[[${due}]]"` : '""';
        const taskId = generateTaskId();
        const projectLine = project ? `project: "${this.sanitizeYamlString(project)}"\n` : '';
        const recurrenceLine = recurrence ? `recurrence: ${recurrence}\n` : '';
        const parentLine = recurrenceParentId ? `recurrenceParentId: "${recurrenceParentId}"\n` : '';
        const priorityLine = priority ? `priority: ${priority}\n` : '';
        const energyLine = energy ? `energy: ${energy}\n` : '';
        const bucketLine = status === 'done' ? 'bucket: done\n' : (status === 'waiting' ? 'bucket: active\n' : 'bucket: backlog\n');
        return `---\ntitle: "${safeTitle}"\ntaskId: ${taskId}\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: DIWA_TASKS\nstatus: ${status}\n${bucketLine}focus: false\ndue: ${dueYaml}\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\n${projectLine}${recurrenceLine}${parentLine}${priorityLine}${energyLine}---\n`;
    }

    // sec-006: Strip characters that break YAML string values
    private sanitizeYamlString(value: string): string {
        return value.replace(/[\n\r]/g, ' ').replace(/"/g, "'").trim();
    }

    // sec-006: Strip characters that break YAML list items
    private sanitizeContext(ctx: string): string {
        return ctx.replace(/[\n\r:#"]/g, '').trim();
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
        await this.ensureFolder(folder);
        const path = folder && folder !== '/' ? `${folder}/${filename}` : filename;
        
        // Handle potential duplicates
        let finalPath = path;
        if (this.app.vault.getAbstractFileByPath(finalPath)) {
            const extIdx = path.lastIndexOf('.');
            const base = extIdx !== -1 ? path.substring(0, extIdx) : path;
            const ext = extIdx !== -1 ? path.substring(extIdx) : '';
            finalPath = `${base} (${Date.now()})${ext}`;
        }

        try {
            const file = await this.app.vault.create(finalPath, content);
            return file;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            throw e;
        }
    }

    async createThoughtFile(text: string, contexts: string[], project?: string, topic?: string, options?: ThoughtWriteOptions): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.settings.thoughtsFolder.trim() || '000 Bin/DIWA';
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const journalType = normalizeJournalType(options?.journalType);
        const normalizedContexts = journalType ? buildJournalContexts(contexts, journalType) : contexts;
        const title = options?.title?.trim() || this.extractTitle(text) || 'Untitled thought';
        const fm = this.buildFrontmatter(title, created, created, dayStr, normalizedContexts, false, project, topic, journalType);
        const filename = this.generateFilename();
        return await this.createFile(folder, filename, fm + text);
    }

    async createTaskFile(text: string, contexts: string[], dueDate?: string, project?: string, opts?: { priority?: string; energy?: string; status?: string; recurrence?: string; recurrenceParentId?: string }): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.settings.tasksFolder.trim() || '000 Bin/DIWA Gawa';
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const due = dueDate || '';
        const fm = this.buildTaskFrontmatter(title, created, created, dayStr, opts?.status ?? 'open', due, contexts, project, opts?.recurrence, opts?.recurrenceParentId, opts?.priority, opts?.energy);
        const filename = this.generateFilename('task_');
        return await this.createFile(folder, filename, fm + text);
    }

    async editThought(filePath: string, newText: string, contexts: string[], options?: { topic?: string; title?: string; journalType?: string | null }): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const now = new Date();
            const nowStr = this.formatDateTime(now);
            const dayStr = this.formatDate(now);
            const journalType = normalizeJournalType(options?.journalType);
            const title = options?.title?.trim() || this.extractTitle(newText) || 'Untitled thought';
            const normalizedContexts = journalType ? buildJournalContexts(contexts, journalType) : contexts;
            const safeContexts = normalizedContexts.map(c => this.sanitizeContext(c));
            const safeTopic = options?.topic ? options.topic.replace(/[^a-zA-Z0-9 _-]/g, '').trim() : '';
            const tags = safeContexts.map(c => safeTopic ? `${c}/${safeTopic}` : c);

            // Step 1: update all FM fields safely via Obsidian API
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(title);
                fm['modified'] = nowStr;
                fm['day'] = `[[${dayStr}]]`;
                fm['context'] = safeContexts;
                fm['topic'] = safeTopic || null;
                if (journalType) fm['journalType'] = journalType;
                else delete fm['journalType'];
                fm['tags'] = tags;
                // preserve existing created, pinned, project
            });

            // Step 2: update body text, preserving comment/reply section
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            const afterFm = content.slice(fmEnd + 5);
            const replyIdx = afterFm.indexOf('\n## [[');
            const bodyToSave = replyIdx !== -1 ? newText + afterFm.slice(replyIdx) : newText;
            const newContent = content.slice(0, fmEnd + 5) + bodyToSave;
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
            const safeTopics = Array.isArray(topic)
                ? topic.map(t => String(t).replace(/[^a-zA-Z0-9 _-]/g, '').trim()).filter(Boolean)
                : (topic ? [topic.replace(/[^a-zA-Z0-9 _-]/g, '').trim()].filter(Boolean) : []);
            const tags = safeTopics.length > 0
                ? safeContexts.flatMap(c => safeTopics.map(t => `${c}/${t}`))
                : safeContexts;
            const nowStr = this.formatDateTime(new Date());
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['context'] = safeContexts;
                fm['topic'] = safeTopics.length <= 1 ? (safeTopics[0] || null) : safeTopics;
                fm['tags'] = tags;
                fm['modified'] = nowStr;
                // preserve: created, title, day, body, pinned, project
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
            const safeContexts = contexts.map(c => this.sanitizeContext(c));            // Step 1: update FM fields safely via Obsidian API — preserves status, created, project
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

            // Step 2: update body text
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            await this.app.vault.modify(file, content.slice(0, fmEnd + 5) + newText + '\n');
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
        project:    string | null;
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
                if (updates.project !== null) { fm['project'] = updates.project; }
                else { delete fm['project']; }
            });

            // Update body text — preserve any reply sections
            const content = await this.app.vault.read(file);
            const fmEnd   = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return true;
            const bodyStart    = fmEnd + 5;
            const existing     = content.slice(bodyStart);
            const replyIdx     = existing.indexOf('\n## [[');
            const replySuffix  = replyIdx !== -1 ? existing.slice(replyIdx) : '';
            const bodyText = (updates.bodyText ?? updates.title).trim();
            await this.app.vault.modify(file, content.slice(0, bodyStart) + bodyText + '\n' + replySuffix);
            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
    }

    async deleteFile(filePath: string, type: 'thoughts' | 'tasks'): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        const folder = type === 'thoughts' ? this.settings.thoughtsFolder : this.settings.tasksFolder;
        const trashFolder = (folder.trim() || '000 Bin/DIWA') + '/trash';
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
        const folder = this.settings.thoughtsFolder;
        const trashFolder = (folder.trim() || '000 Bin/DIWA') + '/trash';
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
            const header = `## [[${dateStr}]] ${timeStr} ^${anchor}`;

            // Step 1: update modified timestamp safely via processFrontMatter
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['modified'] = this.formatDateTime(now);
            });
            // Step 2: append comment body to the (now-updated) file
            const content = await this.app.vault.read(file);
            await this.app.vault.modify(file, content.trimEnd() + `\n\n${header}\n${text}\n`);

            return true;
        } catch (e) {
            console.error('[DIWA VaultService]', e);
            return false;
        }
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

    async createVoiceSidecar(audioFilename: string, audioFolder: string, durationMs: number, transcript: string): Promise<void> {
        const baseName = audioFilename.replace(/\.[^.]+$/, '');
        const sidecarName = `${baseName}.md`;
        const sidecarPath = `${audioFolder}/${sidecarName}`;
        const now = this.formatDateTime(new Date());
        const safeTrans = transcript.replace(/"/g, "'").replace(/\n/g, ' ');
        const content = `---\nsource: "${audioFilename}"\nduration_ms: ${durationMs}\ntranscript: "${safeTrans}"\ncreated: ${now}\n---\n\n${transcript}\n`;
        try {
            await this.ensureFolder(audioFolder);
            const existing = this.app.vault.getAbstractFileByPath(sidecarPath);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(sidecarPath, content);
            }
        } catch (e) {
            console.error('[DIWA VaultService] createVoiceSidecar', e);
        }
    }

    // sec-010: savePayment — was previously a missing method called via unsafe (app as any) lookup
    async savePayment(file: TFile, paymentDate: string, nextDueDate: string, notes: string, attachedFiles: File[]): Promise<void> {
        // Update next due date in frontmatter
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['next_duedate'] = nextDueDate;
            fm['last_payment_date'] = paymentDate;
            fm['modified'] = this.formatDateTime(new Date());
        });
        // Append payment record as a log entry in the file body
        const current = await this.app.vault.read(file);
        const notesLine = notes.trim() ? `\n- **Notes:** ${notes.trim()}` : '';
        const record = `\n\n## Payment: ${paymentDate}\n- **Paid On:** ${paymentDate}\n- **Next Due:** ${nextDueDate}${notesLine}\n`;
        await this.app.vault.modify(file, current + record);
    }

    /** Save a weekly review to {reviewsFolder}/Weekly/YYYY-Www.md */
    async saveWeeklyReview(weekId: string, dateRange: string, wins: string, lessons: string, focus: string[], aiReport?: string, dayPlans?: Record<string, string>): Promise<void> {
        const root = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
        const folder = `${root}/Weekly`;
        const path = `${folder}/${weekId}.md`;
        const now = this.formatDateTime(new Date());
        const focusLines = focus.map((f, i) => `${i + 1}. ${f.trim()}`).join('\n');
        const aiSection = aiReport ? `\n\n# 🤖 AI Weekly Brief\n${aiReport.trim()}` : '';
        let dayPlanSection = '';
        if (dayPlans && Object.values(dayPlans).some(v => v.trim())) {
            const lines = Object.entries(dayPlans)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, intention]) => `- ${date}: ${intention.trim()}`)
                .join('\n');
            dayPlanSection = `\n\n# 📅 Next Week Plan\n${lines}`;
        }
        const content = `---\nweek: "${weekId}"\ndate_range: "${dateRange}"\nsaved: "${now}"\n---\n\n# 🏆 Wins\n${wins.trim()}\n\n# 📚 Lessons\n${lessons.trim()}\n\n# 🎯 Focus\n${focusLines}${dayPlanSection}${aiSection}\n`;
        try {
            await this.ensureFolder(folder);
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(path, content);
            }
        } catch (e) {
            console.error('[DIWA VaultService] saveWeeklyReview', e);
            throw e;
        }
    }

    async createProject(entry: ProjectEntry): Promise<TFile> {
        const folder = (this.settings.projectsFolder || 'Projects').replace(/\\/g, '/');
        await this.ensureFolder(folder);
        const safeName = entry.id.replace(/[/\\?%*:|"<>]/g, '-');
        const path = `${folder}/${safeName}.md`;
        const lines = [
            '---',
            `id: "${entry.id}"`,
            `name: "${entry.name.replace(/"/g, '\\"')}"`,
            `status: ${entry.status}`,
            `goal: "${entry.goal.replace(/"/g, '\\"')}"`,
        ];
        if (entry.due) lines.push(`due: "${entry.due}"`);
        lines.push(`created: "${entry.created}"`);
        if (entry.color) lines.push(`color: "${entry.color}"`);
        lines.push('---', '', '## Notes', '');
        return await this.app.vault.create(path, lines.join('\n'));
    }

    async updateProject(file: TFile, updates: Partial<ProjectEntry>): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (updates.name !== undefined) fm['name'] = updates.name;
            if (updates.status !== undefined) fm['status'] = updates.status;
            if (updates.goal !== undefined) fm['goal'] = updates.goal;
            if (updates.due !== undefined) fm['due'] = updates.due;
            if (updates.color !== undefined) fm['color'] = updates.color;
        });
    }

    async readMilestones(filePath: string): Promise<Milestone[]> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return [];
        try {
            const content = await this.app.vault.read(file);
            const match = content.match(/## Milestones\n([\s\S]*?)(?=\n##|$)/);
            if (!match) return [];
            const lines = match[1].split('\n').filter(l => l.trim().match(/^- \[[ x]\]/));
            return lines.map((line, i) => {
                const done = line.includes('- [x]');
                const rest = line.replace(/^- \[[ x]\] /, '').trim();
                const parts = rest.split(' | ');
                return {
                    id: `m-${i}`,
                    title: parts[0].trim(),
                    done,
                    dueDate: parts[1]?.trim() || undefined,
                };
            });
        } catch { return []; }
    }

    async writeMilestones(filePath: string, milestones: Milestone[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        const content = await this.app.vault.read(file);
        const milestoneMd = milestones.map(m =>
            `- [${m.done ? 'x' : ' '}] ${m.title}${m.dueDate ? ' | ' + m.dueDate : ''}`
        ).join('\n');
        const section = `## Milestones\n${milestoneMd}`;
        const sectionRegex = /## Milestones\n[\s\S]*?(?=\n##|$)/;
        const newContent = sectionRegex.test(content)
            ? content.replace(sectionRegex, section)
            : content + '\n\n' + section;
        await this.app.vault.modify(file, newContent);
    }

    async archiveProject(file: TFile): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['status'] = 'archived';
        });
    }

    async loadProjectNotes(file: TFile): Promise<string> {
        const content = await this.app.vault.read(file);
        const yamlEnd = content.indexOf('\n---', 3);
        if (yamlEnd === -1) return content;
        return content.slice(yamlEnd + 4).trim();
    }

    /** Save monthly goals to {reviewsFolder}/Monthly/YYYY-MM.md */
    async saveMonthlyGoals(monthId: string, goals: string[]): Promise<void> {
        const root = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
        const folder = `${root}/Monthly`;
        const path = `${folder}/${monthId}.md`;
        const now = this.formatDateTime(new Date());
        const goalLines = goals.map((g, i) => `${i + 1}. ${(g || '').trim()}`).join('\n');
        const content = `---\nmonth: "${monthId}"\nsaved: "${now}"\n---\n\n# 📅 ${monthId} — Monthly Focus\n\n## Next Month's Goals\n${goalLines}\n`;
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
        const root = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
        const path = `${root}/Monthly/${monthId}.md`;
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

    /** Load a weekly review file and parse wins/lessons/focus/aiReport sections */
    async loadWeeklyReview(weekId: string): Promise<{ wins: string; lessons: string; focus: string[]; saved: string; aiReport?: string; dayPlans?: Record<string, string> } | null> {
        const root = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
        const path = `${root}/Weekly/${weekId}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        try {
            const raw = await this.app.vault.read(file);
            const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
            const sections: Record<string, string> = {};
            const parts = body.split(/^# /m);
            for (const part of parts) {
                const firstNewline = part.indexOf('\n');
                if (firstNewline === -1) continue;
                const heading = part.substring(0, firstNewline).replace(/[🏆📚🎯💡🤖📅\s]+/g, ' ').trim().toLowerCase();
                sections[heading] = part.substring(firstNewline + 1).trim();
            }
            const focusRaw = sections['focus'] || '';
            const focus = focusRaw.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
            const cache = this.app.metadataCache.getFileCache(file);
            const saved = cache?.frontmatter?.['saved'] || '';

            // Parse day plans: lines like "- 2026-04-28: Deep work sprint"
            let dayPlans: Record<string, string> | undefined;
            const dayPlanRaw = sections['next week plan'];
            if (dayPlanRaw) {
                dayPlans = {};
                for (const line of dayPlanRaw.split('\n')) {
                    const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*(.+)/);
                    if (match) dayPlans[match[1]] = match[2].trim();
                }
            }

            return {
                wins: sections['wins'] || '',
                lessons: sections['lessons'] || '',
                focus,
                saved,
                aiReport: sections['ai weekly brief'] || undefined,
                dayPlans
            };
        } catch (e) {
            console.error('[DIWA VaultService] loadWeeklyReview', e);
            return null;
        }
    }
}

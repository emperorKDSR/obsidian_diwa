import { App, TFile, moment, normalizePath } from 'obsidian';
import { DiwaSettings } from '../types';

export class CaptureService {
    private app: App;
    private settings: DiwaSettings;
    private static DRAFT_KEY = 'diwa-scratchpad-draft';

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: DiwaSettings): void {
        this.settings = settings;
    }

    /**
     * Creates an atomic capture note partitioned in <captureFolder>/YYYY/MM/YYYY-MM-DD HH.mm.ss.md
     */
    async createCaptureNote(
        rawContent: string,
        area: string = '',
        tags: string[] = [],
        important: boolean = false
    ): Promise<TFile> {
        const now = moment();
        const year = now.format('YYYY');
        const month = now.format('MM');
        const timestampStr = now.format('YYYY-MM-DD HH.mm.ss');
        const isoTimestamp = now.format('YYYY-MM-DDTHH:mm:ss');

        const baseFolder = this.settings.captureFolder?.trim() || '000 Bin/Diwa';
        const targetDir = normalizePath(`${baseFolder}/${year}/${month}`);
        await this.ensureFolder(targetDir);

        // Detect tasks
        const hasTasks = /(^|\n)\s*-\s*\[[ xX]\]\s+/.test(rawContent);

        // Extract inline tags if any (e.g. #work, #health)
        const inlineTags = this.extractInlineTags(rawContent);
        const combinedTags = Array.from(new Set([
            ...(area ? [area.toLowerCase()] : []),
            ...tags.map(t => t.toLowerCase().replace(/^#/, '')),
            ...inlineTags.map(t => t.toLowerCase().replace(/^#/, ''))
        ]));

        // Format frontmatter safely
        const frontmatterLines: string[] = [
            '---',
            `created: ${isoTimestamp}`,
            `modified: ${isoTimestamp}`,
        ];

        if (area) {
            frontmatterLines.push(`area: ${JSON.stringify(area.toLowerCase())}`);
        }

        if (combinedTags.length > 0) {
            frontmatterLines.push('tags:');
            for (const tag of combinedTags) {
                frontmatterLines.push(`  - ${JSON.stringify(tag)}`);
            }
        }

        if (important) {
            frontmatterLines.push('important: true');
        }

        frontmatterLines.push(`hasTasks: ${hasTasks}`);
        frontmatterLines.push('---');
        frontmatterLines.push('');

        const fileContent = `${frontmatterLines.join('\n')}${rawContent.trim()}\n`;

        // Generate unique file path
        let filePath = normalizePath(`${targetDir}/${timestampStr}.md`);
        let counter = 1;
        while (await this.app.vault.adapter.exists(filePath)) {
            filePath = normalizePath(`${targetDir}/${timestampStr}_${counter}.md`);
            counter++;
        }

        const newFile = await this.app.vault.create(filePath, fileContent);
        return newFile;
    }

    /**
     * Toggles importance (starred status) on a note atomically via frontmatter.
     * Returns the new boolean importance state.
     */
    async toggleNoteImportance(filePath: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`[CaptureService] File not found for path: ${filePath}`);
        }

        let newImportanceState = false;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const rawTags: unknown[] = Array.isArray(fm.tags)
                ? fm.tags
                : (typeof fm.tags === 'string' ? fm.tags.split(',') : (Array.isArray(fm.tag) ? fm.tag : (typeof fm.tag === 'string' ? fm.tag.split(',') : [])));
            const normalizedTags = rawTags.map((t: unknown) => String(t || '').trim().replace(/^#/, '').toLowerCase());
            const hasImportantTag = normalizedTags.some((t: string) => ['important', 'star', 'starred'].includes(t));
            const current = Boolean(
                fm.important === true ||
                String(fm.important).toLowerCase() === 'true' ||
                fm.pinned === true ||
                String(fm.pinned).toLowerCase() === 'true' ||
                hasImportantTag
            );
            newImportanceState = !current;
            if (newImportanceState) {
                fm.important = true;
                if (fm.pinned !== undefined) delete fm.pinned;
            } else {
                delete fm.important;
                delete fm.pinned;
                if (Array.isArray(fm.tags)) {
                    fm.tags = fm.tags.filter((t: unknown) => !['important', 'star', 'starred'].includes(String(t || '').trim().replace(/^#/, '').toLowerCase()));
                    if (fm.tags.length === 0) delete fm.tags;
                }
                if (Array.isArray(fm.tag)) {
                    fm.tag = fm.tag.filter((t: unknown) => !['important', 'star', 'starred'].includes(String(t || '').trim().replace(/^#/, '').toLowerCase()));
                    if (fm.tag.length === 0) delete fm.tag;
                }
            }
            fm.modified = moment().format('YYYY-MM-DDTHH:mm:ss');
        });

        return newImportanceState;
    }

    /**
     * Toggles an inline checkbox inside a capture file atomically without full page reloads.
     */
    async toggleTaskInFile(filePath: string, lineIndex: number, completed: boolean, taskTitleFallback?: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`[CaptureService] File not found for path: ${filePath}`);
        }

        let toggleSucceeded = false;
        await this.app.vault.process(file, (content) => {
            const isCrlf = content.includes('\r\n');
            const newline = isCrlf ? '\r\n' : '\n';
            const lines = content.split(/\r?\n/);

            let targetLineIdx = -1;
            const parentTaskRegex = /^[ \t]{0,1}-\s*\[([ xX])\]\s+(.*)$/;
            const anyTaskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;

            if (lineIndex >= 0 && lineIndex < lines.length && anyTaskRegex.test(lines[lineIndex])) {
                const candidateLine = lines[lineIndex];
                if (!taskTitleFallback || candidateLine.includes(taskTitleFallback)) {
                    targetLineIdx = lineIndex;
                }
            }

            if (targetLineIdx === -1 && taskTitleFallback) {
                const cleanFallback = taskTitleFallback.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '').trim();
                for (let i = 0; i < lines.length; i++) {
                    if (parentTaskRegex.test(lines[i]) && (lines[i].includes(taskTitleFallback) || (cleanFallback && lines[i].includes(cleanFallback)))) {
                        targetLineIdx = i;
                        break;
                    }
                }
                if (targetLineIdx === -1) {
                    for (let i = 0; i < lines.length; i++) {
                        if (anyTaskRegex.test(lines[i]) && (lines[i].includes(taskTitleFallback) || (cleanFallback && lines[i].includes(cleanFallback)))) {
                            targetLineIdx = i;
                            break;
                        }
                    }
                }
            }

            if (targetLineIdx === -1) {
                return content;
            }

            const currentLine = lines[targetLineIdx];
            const newCheck = completed ? 'x' : ' ';
            lines[targetLineIdx] = currentLine.replace(/^(\s*-\s*\[)[ xX](\]\s+.*)$/, `$1${newCheck}$2`);

            if (completed) {
                // If parent task is completed, also check off its child subtasks
                let childIdx = targetLineIdx + 1;
                while (childIdx < lines.length && /^\s+/.test(lines[childIdx])) {
                    if (/^\s*-\s*\[[ ]\]/.test(lines[childIdx])) {
                        lines[childIdx] = lines[childIdx].replace(/^(\s*-\s*\[)[ ](\]\s+.*)$/, `$1x$2`);
                    }
                    childIdx++;
                }
            }

            // Update modified timestamp in frontmatter (first 30 lines)
            const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
            for (let i = 0; i < Math.min(lines.length, 30); i++) {
                if (/^modified\s*:/i.test(lines[i])) {
                    lines[i] = `modified: ${nowIso}`;
                    break;
                }
            }

            toggleSucceeded = true;
            return lines.join(newline);
        });

        if (!toggleSucceeded) {
            throw new Error(`[CaptureService] Could not locate task line in ${filePath}`);
        }
    }

    /**
     * Updates a task's title, due date, life area, subtasks, or indented remarks atomically in the file.
     */
    async updateTaskDetailsInFile(options: {
        filePath: string;
        lineIndex: number;
        taskTitleFallback?: string;
        newTitle?: string;
        newDueDate?: string | null;
        newAreaId?: string;
        newSubtasks?: { title: string; completed: boolean }[];
        newRemarks?: string[];
    }): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(options.filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`[CaptureService] File not found for path: ${options.filePath}`);
        }

        let updateSucceeded = false;
        await this.app.vault.process(file, (content) => {
            const isCrlf = content.includes('\r\n');
            const newline = isCrlf ? '\r\n' : '\n';
            const lines = content.split(/\r?\n/);

            let targetLineIdx = -1;
            const parentTaskRegex = /^[ \t]{0,1}-\s*\[([ xX])\]\s+(.*)$/;
            const anyTaskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;

            if (options.lineIndex >= 0 && options.lineIndex < lines.length && anyTaskRegex.test(lines[options.lineIndex])) {
                const candidateLine = lines[options.lineIndex];
                if (!options.taskTitleFallback || candidateLine.includes(options.taskTitleFallback)) {
                    targetLineIdx = options.lineIndex;
                }
            }

            if (targetLineIdx === -1 && options.taskTitleFallback) {
                const cleanFallback = options.taskTitleFallback.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '').trim();
                for (let i = 0; i < lines.length; i++) {
                    if (parentTaskRegex.test(lines[i]) && (lines[i].includes(options.taskTitleFallback) || (cleanFallback && lines[i].includes(cleanFallback)))) {
                        targetLineIdx = i;
                        break;
                    }
                }
                if (targetLineIdx === -1) {
                    for (let i = 0; i < lines.length; i++) {
                        if (anyTaskRegex.test(lines[i]) && (lines[i].includes(options.taskTitleFallback) || (cleanFallback && lines[i].includes(cleanFallback)))) {
                            targetLineIdx = i;
                            break;
                        }
                    }
                }
            }

            if (targetLineIdx === -1) {
                return content;
            }

            const currentLine = lines[targetLineIdx];
            const checkMatch = currentLine.match(/^(\s*-\s*\[)([ xX])(\]\s+)(.*)$/);
            if (!checkMatch) return content;

            const prefix = `${checkMatch[1]}${checkMatch[2]}${checkMatch[3]}`;
            let titleText = options.newTitle !== undefined ? options.newTitle.trim() : checkMatch[4].trim();

            // Handle due date update if provided
            if (options.newDueDate !== undefined) {
                titleText = titleText
                    .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
                    .replace(/\[\[\d{4}-\d{2}-\d{2}\]\]/g, '')
                    .replace(/\[due::\s*\d{4}-\d{2}-\d{2}\]/g, '')
                    .replace(/@\d{4}-\d{2}-\d{2}/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (options.newDueDate) {
                    titleText += ` 📅 ${options.newDueDate}`;
                }
            }

            // Handle life area update if provided (never add tag to task title; update frontmatter 'area' instead)
            if (options.newAreaId !== undefined) {
                const targetArea = (options.newAreaId && options.newAreaId !== '—')
                    ? options.newAreaId.toLowerCase().trim()
                    : '';

                // Strip any existing life area hashtags matching configured life areas from the task title
                const knownAreas = this.settings.lifeAreas.map(a => a.id.toLowerCase());
                for (const fallback of ['work', 'health', 'wealth', 'growth', 'personal', 'adventure', 'hustle', 'grundfos']) {
                    if (!knownAreas.includes(fallback)) knownAreas.push(fallback);
                }

                titleText = titleText.replace(/#([a-zA-Z0-9_\-]+)/g, (match, tag) => {
                    return knownAreas.includes(tag.toLowerCase()) ? '' : match;
                }).replace(/\s+/g, ' ').trim();

                // Update area in frontmatter
                let foundAreaLine = false;
                let inFrontmatter = false;
                for (let i = 0; i < Math.min(lines.length, 30); i++) {
                    if (lines[i].trim() === '---') {
                        if (!inFrontmatter) {
                            inFrontmatter = true;
                            continue;
                        } else {
                            // End of frontmatter reached
                            if (!foundAreaLine && targetArea) {
                                lines.splice(i, 0, `area: ${JSON.stringify(targetArea)}`);
                            }
                            break;
                        }
                    }
                    if (inFrontmatter && /^area\s*:/i.test(lines[i])) {
                        foundAreaLine = true;
                        if (targetArea) {
                            lines[i] = `area: ${JSON.stringify(targetArea)}`;
                        } else {
                            lines.splice(i, 1);
                            i--;
                        }
                    }
                }
            }

            lines[targetLineIdx] = `${prefix}${titleText}`;

            // Handle subtasks and remarks (indented child lines)
            if (options.newSubtasks !== undefined || options.newRemarks !== undefined) {
                const existingSubtasks: { title: string; completed: boolean }[] = [];
                const existingRemarks: string[] = [];

                let childCount = 0;
                let nextIdx = targetLineIdx + 1;
                while (nextIdx < lines.length) {
                    const nextLine = lines[nextIdx];
                    if (/^\s+/.test(nextLine)) {
                        const subMatch = nextLine.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
                        if (subMatch) {
                            existingSubtasks.push({
                                completed: /[xX]/.test(subMatch[1]),
                                title: subMatch[2].trim(),
                            });
                        } else {
                            const cleaned = nextLine.replace(/^\s+[-*]?\s*/, '').trim();
                            if (cleaned) existingRemarks.push(cleaned);
                        }
                        childCount++;
                        nextIdx++;
                    } else {
                        break;
                    }
                }

                const finalSubtasks = options.newSubtasks !== undefined ? options.newSubtasks : existingSubtasks;
                const finalRemarks = options.newRemarks !== undefined ? options.newRemarks : existingRemarks;

                // Remove existing child lines
                lines.splice(targetLineIdx + 1, childCount);

                // Build replacement lines: subtasks first, then remarks
                const replacementLines: string[] = [];
                for (const sub of finalSubtasks) {
                    if (sub.title && sub.title.trim()) {
                        replacementLines.push(`    - [${sub.completed ? 'x' : ' '}] ${sub.title.trim()}`);
                    }
                }
                for (const rem of finalRemarks) {
                    const cleanRem = rem.trim().replace(/^[-*]\s*/, '').trim();
                    if (cleanRem) {
                        replacementLines.push(`    - ${cleanRem}`);
                    }
                }

                lines.splice(targetLineIdx + 1, 0, ...replacementLines);
            }

            // Update modified timestamp in frontmatter
            const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
            for (let i = 0; i < Math.min(lines.length, 30); i++) {
                if (/^modified\s*:/i.test(lines[i])) {
                    lines[i] = `modified: ${nowIso}`;
                    break;
                }
            }

            updateSucceeded = true;
            return lines.join(newline);
        });

        if (!updateSucceeded) {
            throw new Error(`[CaptureService] Could not locate task line in ${options.filePath}`);
        }
    }

    async updateNoteContent(filePath: string, newBody: string, area?: string, tags?: string[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
        const hasTasks = /(^|\n)\s*-\s*\[[ xX]\]\s+/.test(newBody);

        await this.app.vault.process(file, (existingContent) => {
            const isCrlf = existingContent.includes('\r\n');
            const newline = isCrlf ? '\r\n' : '\n';
            const match = existingContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

            if (match) {
                let fmBlock = match[1];
                if (/^modified\s*:/m.test(fmBlock)) {
                    fmBlock = fmBlock.replace(/^modified\s*:.*$/m, `modified: ${nowIso}`);
                } else {
                    fmBlock += `\nmodified: ${nowIso}`;
                }

                if (/^hasTasks\s*:/m.test(fmBlock)) {
                    fmBlock = fmBlock.replace(/^hasTasks\s*:.*$/m, `hasTasks: ${hasTasks}`);
                } else {
                    fmBlock += `\nhasTasks: ${hasTasks}`;
                }

                if (area !== undefined) {
                    if (/^area\s*:/m.test(fmBlock)) {
                        if (area.trim()) {
                            fmBlock = fmBlock.replace(/^area\s*:.*$/m, `area: ${JSON.stringify(area.toLowerCase().trim())}`);
                        } else {
                            fmBlock = fmBlock.split(/\r?\n/).filter(line => !/^area\s*:/m.test(line)).join('\n');
                        }
                    } else if (area.trim()) {
                        fmBlock += `\narea: ${JSON.stringify(area.toLowerCase().trim())}`;
                    }
                }

                return `---${newline}${fmBlock.trim()}${newline}---${newline}${newline}${newBody.trim()}${newline}`;
            } else {
                const frontmatterLines: string[] = [
                    '---',
                    `created: ${nowIso}`,
                    `modified: ${nowIso}`,
                    `hasTasks: ${hasTasks}`,
                ];
                if (area) frontmatterLines.push(`area: ${JSON.stringify(area.toLowerCase())}`);
                if (tags && tags.length > 0) {
                    frontmatterLines.push('tags:');
                    for (const t of tags) frontmatterLines.push(`  - ${JSON.stringify(t.toLowerCase().replace(/^#/, ''))}`);
                }
                frontmatterLines.push('---');
                frontmatterLines.push('');
                frontmatterLines.push(newBody.trim());
                frontmatterLines.push('');

                return frontmatterLines.join(newline);
            }
        });
    }

    /**
     * Sends a note to trash.
     */
    async deleteNote(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.app.vault.trash(file, true);
        }
    }

    /**
     * Merges multiple capture notes into a target note or a brand new note.
     */
    async mergeNotes(
        sourceFilePaths: string[],
        targetFilePath?: string,
        newTitle?: string,
        trashSourceFiles: boolean = true
    ): Promise<TFile> {
        const contents: string[] = [];
        const sourceFiles: TFile[] = [];

        for (const path of sourceFilePaths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                sourceFiles.push(file);
                const raw = await this.app.vault.read(file);
                // Strip frontmatter safely handling both CRLF and LF
                const body = raw.replace(/^---[\s\S]*?---\r?\n*/, '').trim();
                if (body) {
                    contents.push(body);
                }
            }
        }

        const mergedBody = contents.join('\n\n---\n\n');
        let destinationFile: TFile;

        if (targetFilePath) {
            const targetFile = this.app.vault.getAbstractFileByPath(targetFilePath);
            if (targetFile instanceof TFile) {
                await this.app.vault.process(targetFile, (existing) => {
                    const isCrlf = existing.includes('\r\n');
                    const newline = isCrlf ? '\r\n' : '\n';
                    return `${existing.trim()}${newline}${newline}---${newline}${newline}${mergedBody}${newline}`;
                });
                destinationFile = targetFile;
            } else {
                throw new Error(`Target file not found: ${targetFilePath}`);
            }
        } else {
            const title = newTitle?.trim() || `Merged Notes ${moment().format('YYYY-MM-DD HH.mm')}`;
            const targetFolder = this.settings.newNoteFolder || this.settings.captureFolder || '';
            await this.ensureFolder(targetFolder);
            const path = normalizePath(`${targetFolder}/${title}.md`);
            destinationFile = await this.app.vault.create(path, `# ${title}\n\n${mergedBody}\n`);
        }

        if (trashSourceFiles) {
            const failedTrashes: string[] = [];
            for (const file of sourceFiles) {
                if (file.path !== destinationFile.path) {
                    try {
                        await this.app.vault.trash(file, true);
                    } catch (e) {
                        failedTrashes.push(file.path);
                    }
                }
            }
            if (failedTrashes.length > 0) {
                console.warn('[CaptureService] Some source files could not be trashed after merge:', failedTrashes);
            }
        }

        return destinationFile;
    }

    /**
     * Replaces a date link [[oldDateStr]] with [[newDateStr]] strictly inside the note body.
     */
    async snoozeDateLink(filePath: string, oldDateStr: string, newDateStr: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        await this.app.vault.process(file, (raw) => {
            const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
            const frontmatterFull = match ? match[0] : '';
            const body = match ? raw.slice(frontmatterFull.length) : raw;

            let newBody: string;
            if (oldDateStr && body.includes(`[[${oldDateStr}]]`)) {
                newBody = body.replace(`[[${oldDateStr}]]`, `[[${newDateStr}]]`);
            } else {
                newBody = body.replace(/\[\[\d{4}-\d{2}-\d{2}\]\]/, `[[${newDateStr}]]`);
            }

            if (newBody === body) {
                return raw;
            }

            const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
            let newFrontmatter = frontmatterFull;
            if (newFrontmatter && /^modified\s*:/m.test(newFrontmatter)) {
                newFrontmatter = newFrontmatter.replace(/^modified\s*:.*$/m, `modified: ${nowIso}`);
            }

            return `${newFrontmatter}${newBody}`;
        });
    }

    /**
     * Removes a date link [[dateStr]] strictly from the note body.
     */
    async removeDateLink(filePath: string, dateStr: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        await this.app.vault.process(file, (raw) => {
            const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
            const frontmatterFull = match ? match[0] : '';
            const body = match ? raw.slice(frontmatterFull.length) : raw;

            let newBody: string;
            if (dateStr && body.includes(`[[${dateStr}]]`)) {
                newBody = body.replace(new RegExp(`\\s*\\[\\[${dateStr}\\]\\]`, 'g'), '');
            } else {
                newBody = body.replace(/\s*\[\[\d{4}-\d{2}-\d{2}\]\]/g, '');
            }

            if (newBody === body) {
                return raw;
            }

            const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
            let newFrontmatter = frontmatterFull;
            if (newFrontmatter && /^modified\s*:/m.test(newFrontmatter)) {
                newFrontmatter = newFrontmatter.replace(/^modified\s*:.*$/m, `modified: ${nowIso}`);
            }

            return `${newFrontmatter}${newBody}`;
        });
    }

    private getDraftKey(): string {
        const appId = (this.app as any).appId ?? 'default';
        return `diwa-scratchpad-draft-${appId}`;
    }

    /**
     * Draft auto-save and recovery
     */
    saveDraft(text: string): void {
        try {
            const key = this.getDraftKey();
            if (!text || !text.trim()) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, text);
            }
        } catch (e) {
            console.warn('[CaptureService] Could not save draft to localStorage', e);
        }
    }

    getDraft(): string {
        try {
            const key = this.getDraftKey();
            return localStorage.getItem(key) || localStorage.getItem(CaptureService.DRAFT_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    clearDraft(): void {
        try {
            localStorage.removeItem(this.getDraftKey());
            localStorage.removeItem(CaptureService.DRAFT_KEY);
        } catch (e) {}
    }

    private extractInlineTags(text: string): string[] {
        const matches = text.match(/#[a-zA-Z0-9_\-\/]+/g);
        if (!matches) return [];
        return matches.map(t => t.substring(1));
    }

    private async ensureFolder(folderPath: string): Promise<void> {
        const normalized = normalizePath(folderPath);
        if (normalized === '' || normalized === '/') return;
        const exists = await this.app.vault.adapter.exists(normalized);
        if (!exists) {
            await this.app.vault.createFolder(normalized);
        }
    }
}

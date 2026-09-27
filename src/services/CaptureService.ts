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
        tags: string[] = []
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

        // Format frontmatter
        const frontmatterLines: string[] = [
            '---',
            `created: ${isoTimestamp}`,
            `modified: ${isoTimestamp}`,
        ];

        if (area) {
            frontmatterLines.push(`area: ${area.toLowerCase()}`);
        }

        if (combinedTags.length > 0) {
            frontmatterLines.push('tags:');
            for (const tag of combinedTags) {
                frontmatterLines.push(`  - ${tag}`);
            }
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
     * Toggles an inline checkbox inside a capture file without full page reloads.
     */
    async toggleTaskInFile(filePath: string, lineIndex: number, completed: boolean, taskTitleFallback?: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            console.error(`[CaptureService] File not found for path: ${filePath}`);
            return;
        }

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        let targetLineIdx = -1;

        // Check if specified lineIndex is indeed a task checkbox
        const taskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;
        if (lineIndex >= 0 && lineIndex < lines.length && taskRegex.test(lines[lineIndex])) {
            targetLineIdx = lineIndex;
        } else if (taskTitleFallback) {
            // Fallback search by title
            for (let i = 0; i < lines.length; i++) {
                if (taskRegex.test(lines[i]) && lines[i].includes(taskTitleFallback)) {
                    targetLineIdx = i;
                    break;
                }
            }
        }

        if (targetLineIdx === -1) {
            console.warn(`[CaptureService] Could not locate task line in ${filePath}`);
            return;
        }

        const currentLine = lines[targetLineIdx];
        const newCheck = completed ? 'x' : ' ';
        lines[targetLineIdx] = currentLine.replace(/^(\s*-\s*\[)[ xX](\]\s+.*)$/, `$1${newCheck}$2`);

        // Update modified timestamp in frontmatter
        const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            if (lines[i].startsWith('modified:')) {
                lines[i] = `modified: ${nowIso}`;
                break;
            }
        }

        await this.app.vault.modify(file, lines.join('\n'));
    }

    async updateNoteContent(filePath: string, newBody: string, area?: string, tags?: string[]): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const existingContent = await this.app.vault.read(file);
        const nowIso = moment().format('YYYY-MM-DDTHH:mm:ss');
        const hasTasks = /(^|\n)\s*-\s*\[[ xX]\]\s+/.test(newBody);

        // Check for YAML frontmatter block
        const match = existingContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
        if (match) {
            let fmBlock = match[1];
            // Update modified timestamp in frontmatter text
            if (/^modified\s*:/m.test(fmBlock)) {
                fmBlock = fmBlock.replace(/^modified\s*:.*$/m, `modified: ${nowIso}`);
            } else {
                fmBlock += `\nmodified: ${nowIso}`;
            }

            // Update hasTasks in frontmatter text
            if (/^hasTasks\s*:/m.test(fmBlock)) {
                fmBlock = fmBlock.replace(/^hasTasks\s*:.*$/m, `hasTasks: ${hasTasks}`);
            } else {
                fmBlock += `\nhasTasks: ${hasTasks}`;
            }

            if (area !== undefined) {
                if (/^area\s*:/m.test(fmBlock)) {
                    if (area.trim()) {
                        fmBlock = fmBlock.replace(/^area\s*:.*$/m, `area: ${area.toLowerCase().trim()}`);
                    } else {
                        fmBlock = fmBlock.split('\n').filter(line => !/^area\s*:/m.test(line)).join('\n');
                    }
                } else if (area.trim()) {
                    fmBlock += `\narea: ${area.toLowerCase().trim()}`;
                }
            }

            const updatedContent = `---\n${fmBlock.trim()}\n---\n\n${newBody.trim()}\n`;
            await this.app.vault.modify(file, updatedContent);
        } else {
            const frontmatterLines: string[] = [
                '---',
                `created: ${nowIso}`,
                `modified: ${nowIso}`,
                `hasTasks: ${hasTasks}`,
            ];
            if (area) frontmatterLines.push(`area: ${area.toLowerCase()}`);
            if (tags && tags.length > 0) {
                frontmatterLines.push('tags:');
                for (const t of tags) frontmatterLines.push(`  - ${t.toLowerCase().replace(/^#/, '')}`);
            }
            frontmatterLines.push('---');
            frontmatterLines.push('');
            frontmatterLines.push(newBody.trim());
            frontmatterLines.push('');

            await this.app.vault.modify(file, frontmatterLines.join('\n'));
        }
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
                // Strip frontmatter
                const body = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
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
                const existing = await this.app.vault.read(targetFile);
                await this.app.vault.modify(targetFile, `${existing.trim()}\n\n---\n\n${mergedBody}\n`);
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
            for (const file of sourceFiles) {
                if (file.path !== destinationFile.path) {
                    await this.app.vault.trash(file, true);
                }
            }
        }

        return destinationFile;
    }

    /**
     * Replaces a date link [[oldDateStr]] with [[newDateStr]] in a capture note.
     */
    async snoozeDateLink(filePath: string, oldDateStr: string, newDateStr: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const raw = await this.app.vault.read(file);
        let newContent: string;

        if (oldDateStr && raw.includes(`[[${oldDateStr}]]`)) {
            newContent = raw.replace(`[[${oldDateStr}]]`, `[[${newDateStr}]]`);
        } else {
            // Replace first date wikilink found
            newContent = raw.replace(/\[\[\d{4}-\d{2}-\d{2}\]\]/, `[[${newDateStr}]]`);
        }

        if (newContent !== raw) {
            // Strip frontmatter to pass body to updateNoteContent
            const body = newContent.replace(/^---[\s\S]*?---\r?\n*/, '').trim();
            await this.updateNoteContent(filePath, body);
        }
    }

    /**
     * Removes a date link [[dateStr]] from a capture note.
     */
    async removeDateLink(filePath: string, dateStr: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const raw = await this.app.vault.read(file);
        let newContent: string;

        if (dateStr && raw.includes(`[[${dateStr}]]`)) {
            newContent = raw.replace(new RegExp(`\\s*\\[\\[${dateStr}\\]\\]`, 'g'), '');
        } else {
            newContent = raw.replace(/\s*\[\[\d{4}-\d{2}-\d{2}\]\]/g, '');
        }

        if (newContent !== raw) {
            const body = newContent.replace(/^---[\s\S]*?---\r?\n*/, '').trim();
            await this.updateNoteContent(filePath, body);
        }
    }

    /**
     * Converts a note line into a task checkbox (- [ ] ...).
     */
    async convertLineToTask(filePath: string, lineIndex: number): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');

        if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex];
            if (!/^\s*-\s*\[[ xX]\]/.test(line)) {
                lines[lineIndex] = `- [ ] ${line.trim()}`;
                const body = lines.join('\n').replace(/^---[\s\S]*?---\r?\n*/, '').trim();
                await this.updateNoteContent(filePath, body);
            }
        }
    }

    /**
     * Draft auto-save and recovery
     */
    saveDraft(text: string): void {
        try {
            if (!text || !text.trim()) {
                localStorage.removeItem(CaptureService.DRAFT_KEY);
            } else {
                localStorage.setItem(CaptureService.DRAFT_KEY, text);
            }
        } catch (e) {
            console.warn('[CaptureService] Could not save draft to localStorage', e);
        }
    }

    getDraft(): string {
        try {
            return localStorage.getItem(CaptureService.DRAFT_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    clearDraft(): void {
        try {
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

import { App, TFile, moment } from 'obsidian';
import { DiwaSettings, CaptureEntry, CaptureTaskItem } from '../types';
import { extractWikiLinks } from '../utils/wikilinks';
import { getCanonicalCapturePath, normalizeConfiguredSettingPath } from '../utils/settingsPaths';
import { normalizeVaultRelativePath } from '../utils/vaultFiles';

export class IndexService {
    app: App;
    settings: DiwaSettings;

    captureIndex: Map<string, CaptureEntry> = new Map();
    private _lastIndexedCaptureFolderSetting: string = '';
    private _lastIndexedCapturePath: string = '';

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    /** Normalize a raw frontmatter context value to a clean string[].
     *  Handles: string scalar, string[], missing/null, and '#'-prefixed values. */
    static normalizeContext(raw: unknown): string[] {
        if (!raw) return [];
        let arr: any[];
        if (Array.isArray(raw)) {
            arr = raw;
        } else if (typeof raw === 'string') {
            arr = raw.split(',');
        } else {
            arr = [raw];
        }
        return arr.map(v => String(v).replace(/^#+/, '').trim()).filter(Boolean);
    }

    /** Extract and loosely parse frontmatter when metadataCache is unavailable. */
    static parseFrontmatterFallback(content: string): Record<string, unknown> | null {
        const blockMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!blockMatch) return null;

        const result: Record<string, unknown> = {};
        const lines = blockMatch[1].split(/\r?\n/);
        let currentListKey: string | null = null;

        for (const line of lines) {
            const keyMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
            if (keyMatch) {
                const key = keyMatch[1];
                const rawValue = keyMatch[2];
                currentListKey = null;

                if (!rawValue) {
                    result[key] = '';
                    currentListKey = key;
                    continue;
                }

                // Do NOT parse Obsidian wikilinks [[...]] as YAML lists — they start with [[
                const bracketList = !rawValue.startsWith('[[') && rawValue.match(/^\[(.*)\]$/);
                if (bracketList) {
                    result[key] = bracketList[1]
                        .split(',')
                        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
                        .filter(Boolean);
                    continue;
                }
                // Strip wikilink wrapper [[...]] from scalar values (e.g. due: [[2026-04-05]])
                if (rawValue.startsWith('[[') && rawValue.endsWith(']]')) {
                    result[key] = rawValue.slice(2, -2).trim();
                    continue;
                }

                const lower = rawValue.toLowerCase();
                if (lower === 'true') {
                    result[key] = true;
                    continue;
                }
                if (lower === 'false') {
                    result[key] = false;
                    continue;
                }

                result[key] = rawValue.replace(/^['"]|['"]$/g, '');
                continue;
            }

            if (!currentListKey) continue;
            const listItem = line.match(/^\s*-\s*(.*)\s*$/);
            if (!listItem) {
                if (line.trim()) currentListKey = null;
                continue;
            }
            const normalized = listItem[1].trim().replace(/^['"]|['"]$/g, '');
            const existing = result[currentListKey];
            if (Array.isArray(existing)) existing.push(normalized);
            else result[currentListKey] = normalized ? [normalized] : [];
        }

        return result;
    }

    private normalizeVaultPath(path: string): string {
        return normalizeVaultRelativePath(path, 'path');
    }

    private normalizeConfiguredPath(path: string | undefined, fallback: string): string {
        return normalizeConfiguredSettingPath(path, fallback, 'folder');
    }

    private pathIsInFolder(path: string, folder: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path);
        const normalizedFolder = this.normalizeVaultPath(folder);
        if (!normalizedFolder) return true;
        return normalizedPath.toLowerCase().startsWith(`${normalizedFolder.toLowerCase()}/`);
    }

    getConfiguredCapturePath(): string {
        return getCanonicalCapturePath(this.settings);
    }

    getConfiguredCaptureFolder(): string {
        return this.normalizeConfiguredPath(this.settings.captureFolder, '000 Bin/Diwa');
    }

    async buildIndices(): Promise<void> {
        await this.buildCaptureIndexInPlace();
    }

    async rebuildSelectedIndices(selection: { captures?: boolean } = { captures: true }): Promise<void> {
        if (selection.captures) {
            await this.buildCaptureIndexInPlace();
        }
    }

    async buildCaptureIndex(): Promise<void> {
        await this.buildCaptureIndexInPlace();
    }

    private async buildCaptureIndexInPlace(): Promise<void> {
        this._lastIndexedCaptureFolderSetting = this.getConfiguredCaptureFolder();
        this._lastIndexedCapturePath = this.getConfiguredCapturePath();
        this.captureIndex.clear();
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isCaptureFile(f.path));
        // Parallel indexing in chunks of 50 for max speed
        const CHUNK_SIZE = 50;
        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(f => this.indexCaptureFile(f).catch(err => {
                console.warn('[DIWA IndexService] skipped capture file due to indexing error', { path: f.path, err });
                return null;
            })));
        }
    }

    async indexCaptureFile(file: TFile): Promise<CaptureEntry | null> {
        if (!this.isCaptureFile(file.path)) {
            this.removeCaptureFile(file.path);
            return null;
        }

        const existing = this.captureIndex.get(file.path);
        if (existing && (existing as any)._mtime && file.stat.mtime <= (existing as any)._mtime) {
            return existing;
        }

        const content = await this.app.vault.read(file);
        const fallbackFm = IndexService.parseFrontmatterFallback(content);
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = fallbackFm ?? (cache?.frontmatter as Record<string, unknown> | undefined) ?? {};

        const createdStr = String(fm.created || '');
        const modifiedStr = String(fm.modified || '');
        let createdAtMs = createdStr ? moment(createdStr).valueOf() : file.stat.ctime;
        if (isNaN(createdAtMs) || createdAtMs === 0) {
            createdAtMs = file.stat.ctime || file.stat.mtime;
        }

        const area = String(fm.area || '').toLowerCase();
        const tags = IndexService.normalizeContext(fm.tags ?? fm.tag);

        // Parse body (strip frontmatter)
        const body = content.replace(/^---[\s\S]*?---\r?\n*/, '').trim();

        // Parse tasks
        const tasks: CaptureTaskItem[] = [];
        const lines = content.split('\n');
        const taskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(taskRegex);
            if (match) {
                const isDone = match[2].toLowerCase() === 'x';
                const taskTitle = match[3].replace(/^\]\s+/, '').trim();
                tasks.push({
                    lineIndex: i,
                    rawLine: lines[i],
                    title: taskTitle,
                    completed: isDone,
                });
            }
        }

        const hasTasks = tasks.length > 0 || String(fm.hasTasks).toLowerCase() === 'true';
        const wikilinks = extractWikiLinks(body);
        const dateMatches = body.match(/\[\[\d{4}-\d{2}-\d{2}\]\]/g) || [];
        const allDates = dateMatches.map(d => d.replace(/\[\[|\]\]/g, ''));

        const important = Boolean(
            fm.important === true ||
            String(fm.important).toLowerCase() === 'true' ||
            fm.pinned === true ||
            String(fm.pinned).toLowerCase() === 'true' ||
            tags.includes('important') ||
            tags.includes('star') ||
            tags.includes('starred')
        );

        const entry: CaptureEntry = {
            id: file.path,
            filePath: file.path,
            created: createdStr || moment(createdAtMs).format('YYYY-MM-DDTHH:mm:ss'),
            modified: modifiedStr || moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss'),
            createdAtMs,
            area,
            tags,
            body,
            hasTasks,
            tasks,
            allDates,
            wikilinks,
            important,
            pinned: important,
        };
        (entry as any)._mtime = file.stat.mtime;

        this.captureIndex.set(file.path, entry);
        return entry;
    }

    removeCaptureFile(path: string): boolean {
        return this.captureIndex.delete(path);
    }

    isCaptureFile(path: string): boolean {
        const folder = this.getConfiguredCaptureFolder();
        const normalizedPath = this.normalizeVaultPath(path);
        return this.pathIsInFolder(normalizedPath, folder)
            && normalizedPath.toLowerCase().endsWith('.md')
            && !normalizedPath.toLowerCase().includes('/trash/');
    }

    captureFolderChanged(): boolean {
        return this.getConfiguredCaptureFolder().toLowerCase() !== this._lastIndexedCaptureFolderSetting.toLowerCase();
    }

    captureLocationChanged(): boolean {
        return this.getConfiguredCapturePath().toLowerCase() !== this._lastIndexedCapturePath.toLowerCase();
    }

    getAllCaptures(): CaptureEntry[] {
        return Array.from(this.captureIndex.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    }

    hasOpenTasks(entry: CaptureEntry | null | undefined): boolean {
        if (!entry || !entry.hasTasks || !Array.isArray(entry.tasks)) return false;
        return entry.tasks.some(t => t && !t.completed);
    }

    getOpenTaskCount(): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            const tasks = Array.isArray(entry?.tasks) ? entry.tasks : [];
            for (const t of tasks) {
                if (t && !t.completed) count++;
            }
        }
        return count;
    }

    getOpenTaskNoteCount(): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (this.hasOpenTasks(entry)) count++;
        }
        return count;
    }

    setCaptureImportance(filePath: string, important: boolean): void {
        const entry = this.captureIndex.get(filePath);
        if (entry) {
            entry.important = important;
            entry.pinned = important;
            if (!important && Array.isArray(entry.tags)) {
                entry.tags = entry.tags.filter(t => !['important', 'star', 'starred'].includes(String(t || '').trim().replace(/^#/, '').toLowerCase()));
            }
        }
    }

    isImportant(entry: CaptureEntry | null | undefined): boolean {
        if (!entry) return false;
        if (entry.important !== undefined) {
            return Boolean(entry.important);
        }
        return Boolean(
            entry.pinned ||
            (Array.isArray(entry.tags) && entry.tags.some(t => ['important', 'star', 'starred'].includes(String(t || '').trim().replace(/^#/, '').toLowerCase())))
        );
    }

    getImportantCount(tasksOnly: boolean = false): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (!entry) continue;
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            if (this.isImportant(entry)) count++;
        }
        return count;
    }

    getUntaggedCount(tasksOnly: boolean = false): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (!entry) continue;
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            const area = String(entry.area || '').trim();
            const tags = Array.isArray(entry.tags) ? entry.tags : [];
            if (!area && tags.length === 0) {
                count++;
            }
        }
        return count;
    }

    getAreaCounts(tasksOnly: boolean = false): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const entry of this.captureIndex.values()) {
            if (!entry) continue;
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            const area = String(entry.area || '').toLowerCase().trim();
            if (area) {
                counts[area] = (counts[area] || 0) + 1;
            }
            const tags = Array.isArray(entry.tags) ? entry.tags : [];
            for (const tag of tags) {
                const normTag = String(tag || '').toLowerCase().trim();
                if (normTag && normTag !== area) {
                    counts[normTag] = (counts[normTag] || 0) + 1;
                }
            }
        }
        return counts;
    }

    getTodayDateStr(): string {
        return moment().format('YYYY-MM-DD');
    }

    isDateToday(dateStr: string): boolean {
        if (!dateStr || typeof dateStr !== 'string') return false;
        return dateStr.trim() === this.getTodayDateStr();
    }

    isDatePast(dateStr: string): boolean {
        if (!dateStr || typeof dateStr !== 'string') return false;
        const target = moment(dateStr.trim(), 'YYYY-MM-DD', true);
        if (!target.isValid()) return false;
        return target.isBefore(moment().startOf('day'));
    }

    isDateFuture(dateStr: string): boolean {
        if (!dateStr || typeof dateStr !== 'string') return false;
        const target = moment(dateStr.trim(), 'YYYY-MM-DD', true);
        if (!target.isValid()) return false;
        return target.isAfter(moment().endOf('day'));
    }

    getTodayCapturesCount(tasksOnly: boolean = false): number {
        const todayStr = this.getTodayDateStr();
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            const dates = Array.isArray(entry?.allDates) ? entry.allDates : [];
            if (dates.includes(todayStr)) {
                count++;
            }
        }
        return count;
    }

    getUpcomingCapturesCount(tasksOnly: boolean = false): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            const dates = Array.isArray(entry?.allDates) ? entry.allDates : [];
            if (dates.some(d => this.isDateFuture(d))) {
                count++;
            }
        }
        return count;
    }

    getEarliestFutureDate(entry: CaptureEntry): string | null {
        const dates = Array.isArray(entry?.allDates) ? entry.allDates : [];
        if (dates.length === 0) return null;
        const futureDates = dates.filter(d => this.isDateFuture(d)).sort();
        return futureDates.length > 0 ? futureDates[0] : null;
    }

    async scanForContexts(): Promise<string[]> {
        const c = new Set<string>();
        for (const entry of this.captureIndex.values()) {
            if (entry.area) c.add(entry.area);
            if (Array.isArray(entry.tags)) {
                entry.tags.forEach(t => {
                    const norm = String(t || '').trim().replace(/^#+/, '');
                    if (norm) c.add(norm);
                });
            }
        }
        return Array.from(c);
    }
}

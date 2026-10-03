import { App, TFile, moment } from 'obsidian';
import { DiwaSettings, CaptureEntry, CaptureTaskItem, GawaTaskRecord, GawaSubtaskItem, DayDigestSummary } from '../types';
import { extractWikiLinks } from '../utils/wikilinks';
import { normalizeConfiguredSettingPath } from '../utils/settingsPaths';
import { normalizeVaultRelativePath } from '../utils/vaultFiles';
import { parseDateToIso, formatDateForDisplay } from '../utils/dateParsing';

export class IndexService {
    app: App;
    settings: DiwaSettings;

    captureIndex: Map<string, CaptureEntry> = new Map();
    dateIndex: Map<string, Set<string>> = new Map();
    targetDateIndex: Map<string, Set<string>> = new Map();
    projectTaskIndex: Map<string, GawaTaskRecord[]> = new Map();
    private _lastIndexedCaptureFolderSetting: string = '';
    private _lastIndexedAdditionalTaskFolders: string = '';
    private _taskFileMtime: Map<string, number> = new Map();

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

    getConfiguredCaptureFolder(): string {
        return this.normalizeConfiguredPath(this.settings.captureFolder, '000 Bin/Diwa');
    }

    async buildIndices(): Promise<void> {
        await this.buildCaptureIndexInPlace();
        await this.indexTrackedProjectTaskFiles();
    }

    async rebuildSelectedIndices(selection: { captures?: boolean; tasks?: boolean } = { captures: true }): Promise<void> {
        if (selection.captures) {
            await this.buildCaptureIndexInPlace();
            await this.indexTrackedProjectTaskFiles();
        } else if (selection.tasks) {
            await this.indexTrackedProjectTaskFiles();
        }
    }

    private async buildCaptureIndexInPlace(): Promise<void> {
        this._lastIndexedCaptureFolderSetting = this.getConfiguredCaptureFolder();
        this.captureIndex.clear();
        this.dateIndex.clear();
        this.targetDateIndex.clear();
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

        let createdStr = String(fm.created || '').trim();
        if (!createdStr && fm.createdAt && Number.isFinite(Number(fm.createdAt))) {
            createdStr = moment(Number(fm.createdAt)).format('YYYY-MM-DDTHH:mm:ss');
        }
        if (!createdStr && fm.day) {
            const rawDay = String(fm.day).replace(/\[\[|\]\]/g, '').trim();
            if (moment(rawDay, 'YYYY-MM-DD', true).isValid()) {
                createdStr = `${rawDay}T00:00:00`;
            }
        }
        if (!createdStr) {
            const dateIsoMatch = file.basename.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateIsoMatch && moment(dateIsoMatch[1], 'YYYY-MM-DD', true).isValid()) {
                createdStr = `${dateIsoMatch[1]}T00:00:00`;
            } else {
                const compactMatch = file.basename.match(/^(\d{4})(\d{2})(\d{2})/);
                if (compactMatch) {
                    const formatted = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
                    if (moment(formatted, 'YYYY-MM-DD', true).isValid()) {
                        createdStr = `${formatted}T00:00:00`;
                    }
                }
            }
        }

        const modifiedStr = String(fm.modified || '');
        let createdAtMs = createdStr ? moment(createdStr).valueOf() : file.stat.ctime;
        if (isNaN(createdAtMs) || createdAtMs === 0) {
            createdAtMs = file.stat.ctime || file.stat.mtime;
        }

        const area = String(fm.area || '').toLowerCase();
        const tags = IndexService.normalizeContext(fm.tags ?? fm.tag);

        // Parse visible body (strip frontmatter and %% ... %% comments)
        const rawBody = content.replace(/^---[\s\S]*?---\r?\n*/, '').trim();
        const visibleBody = rawBody.replace(/%%[\s\S]*?%%/g, '').trim();

        // Parse tasks & Gawa records
        const tasks: CaptureTaskItem[] = [];
        const gawaTasks: GawaTaskRecord[] = [];
        const lines = content.split('\n');
        const taskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');

        let inComment = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Track %% comment blocks
            if (line.includes('%%')) {
                const count = (line.match(/%%/g) || []).length;
                if (count % 2 === 1) {
                    inComment = !inComment;
                    continue;
                }
            }
            if (inComment) {
                continue;
            }

            // Ignore indented lines (2+ spaces or tabs) as top-level tasks
            if (/^\s{2,}|\t/.test(line)) {
                continue;
            }

            const match = line.match(taskRegex);
            if (match) {
                const isDone = match[2].toLowerCase() === 'x';
                const taskTitle = match[3].replace(/^\]\s+/, '').trim();
                tasks.push({
                    lineIndex: i,
                    title: taskTitle,
                    completed: isDone,
                });

                // --- 1. Earliest Due Date Extraction ---
                const dateTokens: string[] = [];
                // Wikilink dates: [[YYYY-MM-DD]]
                const wikiDateMatches = taskTitle.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/g) || [];
                for (const m of wikiDateMatches) {
                    const d = m.replace(/\[\[|\]\]/g, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                // Tasks emoji dates: 📅 YYYY-MM-DD
                const emojiDateMatches = taskTitle.match(/📅\s*(\d{4}-\d{2}-\d{2})/g) || [];
                for (const m of emojiDateMatches) {
                    const d = m.replace(/📅\s*/, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                // Dataview inline dates: [due:: YYYY-MM-DD]
                const dvDateMatches = taskTitle.match(/\[due::\s*(\d{4}-\d{2}-\d{2})\]/g) || [];
                for (const m of dvDateMatches) {
                    const d = m.replace(/\[due::\s*|\]/g, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                // At-dates: @YYYY-MM-DD
                const atDateMatches = taskTitle.match(/@(\d{4}-\d{2}-\d{2})/g) || [];
                for (const m of atDateMatches) {
                    const d = m.replace(/^@/, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                // Standalone ISO dates on the task line: YYYY-MM-DD
                const isoMatches = taskTitle.match(/\b(\d{4}-\d{2}-\d{2})\b/g) || [];
                for (const d of isoMatches) {
                    if (moment(d, 'YYYY-MM-DD', true).isValid() && !dateTokens.includes(d)) dateTokens.push(d);
                }

                // Deduplicate and sort ascending (earliest date wins!)
                const uniqueDates = Array.from(new Set(dateTokens)).sort();
                const earliestDueDate = uniqueDates.length > 0 ? uniqueDates[0] : null;

                // Relative due date computation
                let dueDateRelative = '—';
                if (earliestDueDate) {
                    if (earliestDueDate < todayStr) {
                        const daysDiff = moment(todayStr).diff(moment(earliestDueDate), 'days');
                        dueDateRelative = daysDiff === 1 ? '1d overdue' : `${daysDiff}d overdue`;
                    } else if (earliestDueDate === todayStr) {
                        dueDateRelative = 'Today';
                    } else if (earliestDueDate === tomorrowStr) {
                        dueDateRelative = 'Tomorrow';
                    } else {
                        const daysDiff = moment(earliestDueDate).diff(moment(todayStr), 'days');
                        dueDateRelative = daysDiff <= 7 ? `In ${daysDiff}d` : moment(earliestDueDate).format('MMM D');
                    }
                }

                // --- 2. Life Area Resolution ---
                let resolvedAreaId = area; // parent note frontmatter fallback
                const areaTags = taskTitle.match(/#([a-zA-Z0-9_\-]+)/g) || [];
                for (const tagWithHash of areaTags) {
                    const tagName = tagWithHash.replace(/^#/, '').toLowerCase();
                    if (this.settings.lifeAreas.some(a => a.id.toLowerCase() === tagName)) {
                        resolvedAreaId = tagName;
                        break;
                    }
                }
                const matchedArea = this.settings.lifeAreas.find(a => a.id.toLowerCase() === resolvedAreaId.toLowerCase());
                const areaLabel = matchedArea ? matchedArea.label : (resolvedAreaId ? resolvedAreaId.charAt(0).toUpperCase() + resolvedAreaId.slice(1) : '—');
                const areaIcon = matchedArea ? matchedArea.icon : '—';

                // --- 3. Indented Child Subtasks & Remarks ---
                const parentLineIdx = i;
                const subtasks: GawaSubtaskItem[] = [];
                const remarks: string[] = [];
                let nextIdx = i + 1;
                while (nextIdx < lines.length) {
                    const nextLine = lines[nextIdx];
                    if (/^\s+/.test(nextLine)) {
                        const subtaskMatch = nextLine.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
                        if (subtaskMatch) {
                            subtasks.push({
                                completed: /[xX]/.test(subtaskMatch[1]),
                                title: subtaskMatch[2].trim(),
                            });
                        } else {
                            const cleaned = nextLine.replace(/^\s+[-*]?\s*/, '').trim();
                            if (cleaned) remarks.push(cleaned);
                        }
                        nextIdx++;
                    } else {
                        break;
                    }
                }

                const taskWikilinks = extractWikiLinks(taskTitle);
                const taskTags = areaTags.map(t => t.replace(/^#/, ''));

                // Strip redundant parsed date emojis/tokens from display title while preserving all wikilinks
                let cleanTitle = taskTitle;
                if (earliestDueDate) {
                    cleanTitle = cleanTitle
                        .replace(new RegExp(`📅\\s*${earliestDueDate}`, 'g'), '')
                        .replace(new RegExp(`\\[due::\\s*${earliestDueDate}\\]`, 'g'), '')
                        .replace(new RegExp(`@${earliestDueDate}`, 'g'), '')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                // Strip known life area tags from cleanTitle so they do not clutter the title column or inspector input
                const knownAreas = this.settings.lifeAreas.map(a => a.id.toLowerCase());
                for (const fallback of ['work', 'health', 'wealth', 'growth', 'personal', 'adventure', 'hustle', 'grundfos']) {
                    if (!knownAreas.includes(fallback)) knownAreas.push(fallback);
                }
                cleanTitle = cleanTitle.replace(/#([a-zA-Z0-9_\-]+)/g, (match, tag) => {
                    return knownAreas.includes(tag.toLowerCase()) ? '' : match;
                }).replace(/\s+/g, ' ').trim();

                gawaTasks.push({
                    filePath: file.path,
                    noteTitle: file.basename,
                    lineIndex: parentLineIdx,
                    rawTitle: taskTitle,
                    cleanTitle,
                    completed: isDone,
                    dueDate: earliestDueDate,
                    dueDateRelative,
                    areaId: resolvedAreaId,
                    areaLabel,
                    areaIcon,
                    tags: taskTags,
                    wikilinks: taskWikilinks,
                    subtasks,
                    remarks,
                });

                // Advance outer loop index past consumed child lines so they are not indexed as standalone tasks
                i = nextIdx - 1;
            }
        }

        const hasTasks = tasks.length > 0 || String(fm.hasTasks).toLowerCase() === 'true';
        const wikilinks = extractWikiLinks(visibleBody);
        const dateMatches = visibleBody.match(/\[\[\d{4}-\d{2}-\d{2}\]\]/g) || [];
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

        const digested = Boolean(
            fm.digested === true ||
            String(fm.digested).toLowerCase() === 'true' ||
            (!visibleBody && rawBody.includes('diwa-digested:'))
        );
        const digestedAt = fm.digestedAt ? String(fm.digestedAt) : undefined;

        const entry: CaptureEntry = {
            id: file.path,
            filePath: file.path,
            created: createdStr || moment(createdAtMs).format('YYYY-MM-DDTHH:mm:ss'),
            modified: modifiedStr || moment(file.stat.mtime).format('YYYY-MM-DDTHH:mm:ss'),
            createdAtMs,
            area,
            tags,
            body: visibleBody,
            rawBody,
            hasTasks,
            tasks,
            gawaTasks,
            allDates,
            wikilinks,
            important,
            pinned: important,
            digested,
            digestedAt,
        };
        (entry as any)._mtime = file.stat.mtime;

        this.captureIndex.set(file.path, entry);

        // Update dateIndex
        const dateKey = (createdStr || moment(createdAtMs).format('YYYY-MM-DDTHH:mm:ss')).slice(0, 10);
        let dateSet = this.dateIndex.get(dateKey);
        if (!dateSet) {
            dateSet = new Set();
            this.dateIndex.set(dateKey, dateSet);
        }
        dateSet.add(file.path);

        // Update targetDateIndex (Intended dates: wikilinks, frontmatter, task due dates)
        for (const set of this.targetDateIndex.values()) {
            set.delete(file.path);
        }
        const targetDates = new Set<string>();
        for (const d of allDates) {
            if (moment(d, 'YYYY-MM-DD', true).isValid()) {
                targetDates.add(d);
            }
        }
        const candidateFmDates = [fm.due, fm.scheduled, fm.day, fm.targetDate];
        for (const candidate of candidateFmDates) {
            if (candidate) {
                const cleaned = String(candidate).replace(/\[\[|\]\]/g, '').trim();
                if (moment(cleaned, 'YYYY-MM-DD', true).isValid()) {
                    targetDates.add(cleaned);
                }
            }
        }
        for (const gt of gawaTasks) {
            if (gt.dueDate && moment(gt.dueDate, 'YYYY-MM-DD', true).isValid()) {
                targetDates.add(gt.dueDate);
            }
        }
        for (const tDate of targetDates) {
            let tSet = this.targetDateIndex.get(tDate);
            if (!tSet) {
                tSet = new Set();
                this.targetDateIndex.set(tDate, tSet);
            }
            tSet.add(file.path);
        }

        return entry;
    }

    removeCaptureFile(path: string): boolean {
        for (const set of this.dateIndex.values()) {
            set.delete(path);
        }
        for (const set of this.targetDateIndex.values()) {
            set.delete(path);
        }
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

    getConfiguredAdditionalTaskFolders(): string[] {
        const folders = this.settings.additionalTaskFolders || [];
        const result: string[] = [];
        for (const f of folders) {
            const raw = String(f || '').trim();
            if (!raw || raw === '/' || raw === '.') continue;
            try {
                const norm = this.normalizeConfiguredPath(raw, '');
                if (norm && !result.includes(norm)) {
                    result.push(norm);
                }
            } catch {
                // ignore invalid folder path
            }
        }
        return result;
    }

    isAdditionalTaskFile(path: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path);
        if (!normalizedPath.toLowerCase().endsWith('.md')) return false;
        if (normalizedPath.toLowerCase().includes('/trash/')) return false;
        if (this.isCaptureFile(normalizedPath)) return false;

        const folders = this.getConfiguredAdditionalTaskFolders();
        for (const folder of folders) {
            if (this.pathIsInFolder(normalizedPath, folder)) {
                return true;
            }
        }
        return false;
    }

    isTrackedProjectFile(path: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path).toLowerCase();
        const tracked = this.settings.trackedTaskFiles || [];
        return tracked.some(t => this.normalizeVaultPath(t).toLowerCase() === normalizedPath);
    }

    additionalTaskFoldersChanged(): boolean {
        const current = this.getConfiguredAdditionalTaskFolders().slice().sort().join('|');
        return current.toLowerCase() !== this._lastIndexedAdditionalTaskFolders.toLowerCase();
    }

    getScratchpadCutoffTimestamp(): number | null {
        const horizon = this.settings.scratchpadHorizon || '7d';
        if (horizon === 'all') return null;

        if (horizon === 'custom') {
            const customIso = parseDateToIso(this.settings.scratchpadCustomDate);
            if (!customIso) return null;
            return moment(customIso, 'YYYY-MM-DD').startOf('day').valueOf();
        }

        const now = moment().startOf('day');
        switch (horizon) {
            case 'today':
                return now.valueOf();
            case '3d':
                return now.subtract(3, 'days').valueOf();
            case '7d':
                return now.subtract(7, 'days').valueOf();
            case '14d':
                return now.subtract(14, 'days').valueOf();
            case '30d':
                return now.subtract(30, 'days').valueOf();
            default:
                return now.subtract(7, 'days').valueOf();
        }
    }

    getScratchpadHorizonLabel(): string {
        const horizon = this.settings.scratchpadHorizon || '7d';
        switch (horizon) {
            case 'today': return 'Today';
            case '3d': return 'Last 3 Days';
            case '7d': return 'Last 7 Days';
            case '14d': return 'Last 14 Days';
            case '30d': return 'Last 30 Days';
            case 'all': return 'All Notes';
            case 'custom': {
                const customIso = parseDateToIso(this.settings.scratchpadCustomDate);
                return customIso ? `From ${formatDateForDisplay(customIso)}` : 'Custom Date';
            }
            default: return 'Last 7 Days';
        }
    }

    isEntryInScratchpad(entry: CaptureEntry | null | undefined): boolean {
        if (!entry) return false;

        // Digested notes leave the continuous scratchpad inbox (Inbox Zero)
        if (entry.digested) {
            return false;
        }

        // Important / Starred notes always stay in scratchpad if keepImportantInScratchpad is enabled
        if (this.settings.keepImportantInScratchpad !== false && this.isImportant(entry)) {
            return true;
        }

        const cutoffMs = this.getScratchpadCutoffTimestamp();
        if (cutoffMs === null) return true;

        if (entry.createdAtMs && entry.createdAtMs >= cutoffMs) {
            return true;
        }

        if (entry.created) {
            const entryMs = moment(entry.created).valueOf();
            if (!isNaN(entryMs) && entryMs >= cutoffMs) {
                return true;
            }
            const cutoffDateStr = moment(cutoffMs).format('YYYY-MM-DD');
            if (entry.created.slice(0, 10) >= cutoffDateStr) {
                return true;
            }
        }

        return false;
    }

    getAllCaptures(ignoreHorizon: boolean = false): CaptureEntry[] {
        const all = Array.from(this.captureIndex.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
        if (ignoreHorizon) return all;
        return all.filter(e => this.isEntryInScratchpad(e));
    }

    hasOpenTasks(entry: CaptureEntry | null | undefined): boolean {
        if (!entry || !entry.hasTasks || !Array.isArray(entry.tasks)) return false;
        return entry.tasks.some(t => t && !t.completed);
    }

    getGawaTasks(openOnly: boolean = true): GawaTaskRecord[] {
        const results: GawaTaskRecord[] = [];
        for (const entry of this.captureIndex.values()) {
            const gTasks = Array.isArray(entry?.gawaTasks) ? entry.gawaTasks : [];
            for (const t of gTasks) {
                if (!openOnly || !t.completed) {
                    results.push(t);
                }
            }
        }
        for (const tasks of this.projectTaskIndex.values()) {
            for (const t of tasks) {
                if (!openOnly || !t.completed) {
                    results.push(t);
                }
            }
        }
        return results;
    }

    parseGawaTasksFromContent(
        content: string,
        filePath: string,
        noteTitle: string,
        fallbackArea: string = ''
    ): { tasks: CaptureTaskItem[]; gawaTasks: GawaTaskRecord[] } {
        const tasks: CaptureTaskItem[] = [];
        const gawaTasks: GawaTaskRecord[] = [];
        const lines = content.split('\n');
        const taskRegex = /^(\s*-\s*\[)([ xX])(\]\s+.*)$/;
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (/^\s{2,}|\t/.test(line)) {
                continue;
            }

            const match = line.match(taskRegex);
            if (match) {
                const isDone = match[2].toLowerCase() === 'x';
                const taskTitle = match[3].replace(/^\]\s+/, '').trim();
                const parentLineIdx = i;
                tasks.push({
                    lineIndex: parentLineIdx,
                    title: taskTitle,
                    completed: isDone,
                });

                const dateTokens: string[] = [];
                const wikiDateMatches = taskTitle.match(/\[\[(\d{4}-\d{2}-\d{2})\]\]/g) || [];
                for (const m of wikiDateMatches) {
                    const d = m.replace(/\[\[|\]\]/g, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                const emojiDateMatches = taskTitle.match(/📅\s*(\d{4}-\d{2}-\d{2})/g) || [];
                for (const m of emojiDateMatches) {
                    const d = m.replace(/📅\s*/, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                const dvDateMatches = taskTitle.match(/\[due::\s*(\d{4}-\d{2}-\d{2})\]/g) || [];
                for (const m of dvDateMatches) {
                    const d = m.replace(/\[due::\s*|\]/g, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                const atDateMatches = taskTitle.match(/@(\d{4}-\d{2}-\d{2})/g) || [];
                for (const m of atDateMatches) {
                    const d = m.replace(/^@/, '');
                    if (moment(d, 'YYYY-MM-DD', true).isValid()) dateTokens.push(d);
                }
                const isoMatches = taskTitle.match(/\b(\d{4}-\d{2}-\d{2})\b/g) || [];
                for (const d of isoMatches) {
                    if (moment(d, 'YYYY-MM-DD', true).isValid() && !dateTokens.includes(d)) dateTokens.push(d);
                }

                const uniqueDates = Array.from(new Set(dateTokens)).sort();
                const earliestDueDate = uniqueDates.length > 0 ? uniqueDates[0] : null;

                let dueDateRelative = '—';
                if (earliestDueDate) {
                    if (earliestDueDate < todayStr) {
                        const daysDiff = moment(todayStr).diff(moment(earliestDueDate), 'days');
                        dueDateRelative = daysDiff === 1 ? '1d overdue' : `${daysDiff}d overdue`;
                    } else if (earliestDueDate === todayStr) {
                        dueDateRelative = 'Today';
                    } else if (earliestDueDate === tomorrowStr) {
                        dueDateRelative = 'Tomorrow';
                    } else {
                        const daysDiff = moment(earliestDueDate).diff(moment(todayStr), 'days');
                        dueDateRelative = daysDiff === 1 ? 'Tomorrow' : `In ${daysDiff}d`;
                    }
                }

                let cleanTitle = taskTitle
                    .replace(/\[\[\d{4}-\d{2}-\d{2}\]\]/g, '')
                    .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
                    .replace(/\[due::\s*\d{4}-\d{2}-\d{2}\]/g, '')
                    .replace(/@\d{4}-\d{2}-\d{2}/g, '')
                    .trim();

                let resolvedAreaId = fallbackArea;
                const matchedArea = this.settings.lifeAreas.find(a => {
                    const tagRegex = new RegExp(`#${a.id}\\b`, 'i');
                    return tagRegex.test(taskTitle);
                });
                if (matchedArea) {
                    resolvedAreaId = matchedArea.id;
                }
                if (!resolvedAreaId) {
                    const fallbacks = ['work', 'health', 'wealth', 'growth', 'personal', 'adventure', 'hustle', 'grundfos'];
                    for (const fb of fallbacks) {
                        if (new RegExp(`#${fb}\\b`, 'i').test(taskTitle)) {
                            resolvedAreaId = fb;
                            break;
                        }
                    }
                }

                const areaObj = this.settings.lifeAreas.find(a => a.id.toLowerCase() === (resolvedAreaId || '').toLowerCase());
                const areaLabel = areaObj ? areaObj.label : (resolvedAreaId ? resolvedAreaId.charAt(0).toUpperCase() + resolvedAreaId.slice(1) : '—');
                const areaIcon = areaObj ? areaObj.icon : '—';

                const subtasks: GawaSubtaskItem[] = [];
                const remarks: string[] = [];
                let nextIdx = i + 1;
                while (nextIdx < lines.length) {
                    const nextLine = lines[nextIdx];
                    if (/^\s+/.test(nextLine)) {
                        const subtaskMatch = nextLine.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
                        if (subtaskMatch) {
                            subtasks.push({
                                completed: /[xX]/.test(subtaskMatch[1]),
                                title: subtaskMatch[2].trim(),
                            });
                        } else {
                            const trimmed = nextLine.trim();
                            if (trimmed) remarks.push(trimmed);
                        }
                        nextIdx++;
                    } else {
                        break;
                    }
                }

                const taskTags = (taskTitle.match(/#([a-zA-Z0-9_\-]+)/g) || []).map(t => t.replace(/^#/, ''));
                const taskWikilinks = extractWikiLinks(taskTitle);

                const knownAreas = this.settings.lifeAreas.map(a => a.id.toLowerCase());
                for (const fallback of ['work', 'health', 'wealth', 'growth', 'personal', 'adventure', 'hustle', 'grundfos']) {
                    if (!knownAreas.includes(fallback)) knownAreas.push(fallback);
                }
                cleanTitle = cleanTitle.replace(/#([a-zA-Z0-9_\-]+)/g, (match, tag) => {
                    return knownAreas.includes(tag.toLowerCase()) ? '' : match;
                }).replace(/\s+/g, ' ').trim();

                gawaTasks.push({
                    filePath,
                    noteTitle,
                    lineIndex: parentLineIdx,
                    rawTitle: taskTitle,
                    cleanTitle,
                    completed: isDone,
                    dueDate: earliestDueDate,
                    dueDateRelative,
                    areaId: resolvedAreaId,
                    areaLabel,
                    areaIcon,
                    tags: taskTags,
                    wikilinks: taskWikilinks,
                    subtasks,
                    remarks,
                });

                i = nextIdx - 1;
            }
        }

        return { tasks, gawaTasks };
    }

    async indexTrackedProjectTaskFiles(): Promise<void> {
        this._lastIndexedAdditionalTaskFolders = this.getConfiguredAdditionalTaskFolders().slice().sort().join('|');
        this.projectTaskIndex.clear();
        this._taskFileMtime.clear();

        const candidatePaths = new Set<string>();

        // 1. Explicitly tracked files
        const tracked = this.settings.trackedTaskFiles || [];
        for (const p of tracked) {
            const norm = this.normalizeVaultPath(p);
            if (norm) candidatePaths.add(norm);
        }

        // 2. Files in additionalTaskFolders
        const additionalFolders = this.getConfiguredAdditionalTaskFolders();
        if (additionalFolders.length > 0) {
            const allMdFiles = this.app.vault.getMarkdownFiles();
            for (const file of allMdFiles) {
                if (this.isAdditionalTaskFile(file.path)) {
                    candidatePaths.add(this.normalizeVaultPath(file.path));
                }
            }
        }

        // 3. Parallel indexing in chunks of 50
        const filesToIndex: TFile[] = [];
        for (const path of candidatePaths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile && file.path.toLowerCase().endsWith('.md')) {
                filesToIndex.push(file);
            }
        }

        const CHUNK_SIZE = 50;
        for (let i = 0; i < filesToIndex.length; i += CHUNK_SIZE) {
            const chunk = filesToIndex.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(f => this.indexProjectTaskFile(f).catch(err => {
                console.warn('[DIWA IndexService] error indexing project task file', { path: f.path, err });
                return null;
            })));
        }
    }

    async indexProjectTaskFile(file: TFile): Promise<void> {
        if (!file.path.toLowerCase().endsWith('.md')) return;
        const normPath = this.normalizeVaultPath(file.path);
        const mtime = file.stat.mtime;
        const cachedMtime = this._taskFileMtime.get(normPath);
        if (cachedMtime && mtime <= cachedMtime && this.projectTaskIndex.has(normPath)) {
            return;
        }

        const content = await this.app.vault.read(file);
        const { gawaTasks } = this.parseGawaTasksFromContent(content, normPath, file.basename);
        this.projectTaskIndex.set(normPath, gawaTasks);
        this._taskFileMtime.set(normPath, mtime);
    }

    removeProjectTaskFile(path: string): boolean {
        const normPath = this.normalizeVaultPath(path);
        this._taskFileMtime.delete(normPath);
        return this.projectTaskIndex.delete(normPath);
    }

    getCapturesForDate(dateStr: string): CaptureEntry[] {
        const paths = this.dateIndex.get(dateStr);
        if (!paths || paths.size === 0) return [];
        const entries: CaptureEntry[] = [];
        for (const p of paths) {
            const entry = this.captureIndex.get(p);
            if (entry) entries.push(entry);
        }
        return entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
    }

    getCapturesForTargetDate(dateStr: string): CaptureEntry[] {
        const paths = this.targetDateIndex.get(dateStr);
        if (!paths || paths.size === 0) return [];
        const entries: CaptureEntry[] = [];
        for (const p of paths) {
            const entry = this.captureIndex.get(p);
            if (entry) entries.push(entry);
        }
        return entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
    }

    getTasksForDueDate(dateStr: string): GawaTaskRecord[] {
        const allTasks = this.getGawaTasks(true);
        return allTasks.filter(t => t.dueDate === dateStr);
    }

    getOverdueTasks(todayStr?: string): GawaTaskRecord[] {
        const today = todayStr || moment().format('YYYY-MM-DD');
        const allTasks = this.getGawaTasks(true);
        return allTasks.filter(t => t.dueDate && t.dueDate < today).sort((a, b) => {
            if (a.dueDate! < b.dueDate!) return -1;
            if (a.dueDate! > b.dueDate!) return 1;
            return 0;
        });
    }

    extractTargetDateSnippets(entry: CaptureEntry, targetDate: string): string[] {
        if (!entry.body) return [];
        if (entry.body.length < 250) {
            return [entry.body];
        }

        const paragraphs = entry.body.split(/\n\s*\n/);
        const matchingSnippets: string[] = [];
        const targetWikilink = `[[${targetDate}]]`;

        for (const p of paragraphs) {
            const trimmed = p.trim();
            if (!trimmed) continue;
            if (trimmed.includes(targetWikilink) || trimmed.includes(targetDate)) {
                matchingSnippets.push(trimmed);
            }
        }

        if (matchingSnippets.length === 0) {
            return [paragraphs[0] || entry.body];
        }

        return matchingSnippets;
    }

    getDayDigestSummary(dateStr: string): DayDigestSummary {
        const entries = this.getCapturesForDate(dateStr);
        if (entries.length === 0) {
            return {
                dateStr,
                totalCount: 0,
                digestedCount: 0,
                hasOpenTasks: false,
                status: 'empty',
            };
        }

        const totalCount = entries.length;
        let digestedCount = 0;
        let hasOpenTasks = false;

        for (const e of entries) {
            if (e.digested) digestedCount++;
            if (e.tasks && e.tasks.some(t => !t.completed)) {
                hasOpenTasks = true;
            }
        }

        let status: DayDigestSummary['status'] = 'raw';
        if (digestedCount === totalCount) {
            status = 'digested';
        } else if (digestedCount > 0) {
            status = 'partial';
        }

        return {
            dateStr,
            totalCount,
            digestedCount,
            hasOpenTasks,
            status,
        };
    }

    getMonthDigestSummary(yearMonth: string): Map<string, DayDigestSummary> {
        const result = new Map<string, DayDigestSummary>();
        const daysInMonth = moment(yearMonth, 'YYYY-MM').daysInMonth();
        for (let d = 1; d <= daysInMonth; d++) {
            const dayStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
            result.set(dayStr, this.getDayDigestSummary(dayStr));
        }
        return result;
    }

    getOpenTaskCount(): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (!this.isEntryInScratchpad(entry)) continue;
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
            if (!this.isEntryInScratchpad(entry)) continue;
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
            if (!entry || !this.isEntryInScratchpad(entry)) continue;
            if (tasksOnly && !this.hasOpenTasks(entry)) continue;
            if (this.isImportant(entry)) count++;
        }
        return count;
    }

    getUntaggedCount(tasksOnly: boolean = false): number {
        let count = 0;
        for (const entry of this.captureIndex.values()) {
            if (!entry || !this.isEntryInScratchpad(entry)) continue;
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
            if (!entry || !this.isEntryInScratchpad(entry)) continue;
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
            if (!entry || !this.isEntryInScratchpad(entry)) continue;
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
            if (!entry || !this.isEntryInScratchpad(entry)) continue;
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

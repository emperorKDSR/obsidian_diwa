import { App, TFile, moment } from 'obsidian';
import { DiwaSettings, ThoughtEntry, TaskEntry, DueEntry, ProjectEntry, TaskBucketStatus } from '../types';
import { extractWikiLinks } from '../utils/wikilinks';
import { getThoughtDisplayTitle, inferJournalType } from '../journal/shared';
import { normalizeThoughtTopics, toStoredThoughtTopic } from '../utils/topics';
import { splitTaskBodyAndCommentSuffix } from '../utils/taskComments';
import { getCanonicalCapturePath, normalizeConfiguredSettingPath } from '../utils/settingsPaths';
import { normalizeVaultRelativePath } from '../utils/vaultFiles';

export interface ChecklistItem {
    text: string;
    done: boolean;
    line: string;
}

export interface ThoughtChecklistItem {
    filePath: string;
    text: string;
    line: string;
    lineIndex: number;
}

type IndexRebuildSelection = {
    thoughts?: boolean;
    tasks?: boolean;
    dues?: boolean;
    checklist?: boolean;
    projects?: boolean;
};

export class IndexService {
    app: App;
    settings: DiwaSettings;

    /** Normalize a raw frontmatter context value to a clean string[].
     *  Handles: string scalar, string[], missing/null, and '#'-prefixed values. */
    static normalizeContext(raw: unknown): string[] {
        if (!raw) return [];
        const arr = Array.isArray(raw) ? raw : [raw];
        return arr.map(v => String(v).replace(/^#+/, '').trim()).filter(Boolean);
    }

    /** Normalize a raw frontmatter string-array field (e.g. sourceThoughtIds).
     *  Handles: YAML list, comma-separated string scalar, missing/null. */
    static normalizeStringArray(raw: unknown): string[] {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
        // single string — may be comma-separated
        return String(raw).split(',').map(s => s.trim()).filter(Boolean);
    }

    /** Normalize links object arrays (e.g. links.tasks / links.thoughts). */
    static normalizeLinksArray(rawLinks: unknown, key: 'tasks' | 'thoughts'): string[] {
        if (!rawLinks || typeof rawLinks !== 'object') return [];
        const record = rawLinks as Record<string, unknown>;
        return IndexService.normalizeStringArray(record[key]);
    }

    /** Read a frontmatter field by trying multiple key aliases. */
    static getFrontmatterValue(frontmatter: Record<string, unknown>, keys: string[]): unknown {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(frontmatter, key)) return frontmatter[key];
        }
        return undefined;
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

    /** Returns all unique non-empty topic strings across the thought index. */
    getExistingTopics(): string[] {
        const seen = new Set<string>();
        for (const entry of this.thoughtIndex.values()) {
            for (const topic of normalizeThoughtTopics(entry.topic)) {
                seen.add(topic);
            }
        }
        return Array.from(seen).sort();
    }
    
    // Memory Indices
    thoughtIndex: Map<string, ThoughtEntry> = new Map();
    taskIndex: Map<string, TaskEntry> = new Map();
    // ob-perf-03: Full DueEntry index — DuesTab reads from here instead of scanning vault on every render
    dueIndex: Map<string, DueEntry> = new Map();
    checklistIndex: ChecklistItem[] = [];
    private _thoughtChecklistMap: Map<string, ThoughtChecklistItem[]> = new Map();
    private _thoughtDoneChecklistMap: Map<string, ThoughtChecklistItem[]> = new Map();

    get thoughtChecklistIndex(): ThoughtChecklistItem[] {
        const result: ThoughtChecklistItem[] = [];
        this._thoughtChecklistMap.forEach(items => result.push(...items));
        return result;
    }

    get thoughtDoneChecklistIndex(): ThoughtChecklistItem[] {
        const result: ThoughtChecklistItem[] = [];
        this._thoughtDoneChecklistMap.forEach(items => result.push(...items));
        return result;
    }
    projectIndex: Map<string, ProjectEntry> = new Map();
    
    // Performance Cache (Synchronous Access)
    radarQueue: TaskEntry[] = [];
    totalDues: number = 0;
    private _activeTasksFolder: string;
    private _lastIndexedTasksFolderSetting: string;
    private _lastIndexedThoughtsFolderSetting: string;
    private _lastIndexedPfFolderSetting: string;
    private _lastIndexedCapturePath: string;
    private _lastIndexedProjectsFolderSetting: string;

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
        const initialTasksFolder = this.getConfiguredTasksFolder();
        const initialThoughtsFolder = this.getConfiguredThoughtsFolder();
        const initialPfFolder = this.getConfiguredPfFolder();
        const initialCapturePath = this.getConfiguredCapturePath();
        const initialProjectsFolder = this.getConfiguredProjectsFolder();
        this._activeTasksFolder = initialTasksFolder;
        this._lastIndexedTasksFolderSetting = initialTasksFolder;
        this._lastIndexedThoughtsFolderSetting = initialThoughtsFolder;
        this._lastIndexedPfFolderSetting = initialPfFolder;
        this._lastIndexedCapturePath = initialCapturePath;
        this._lastIndexedProjectsFolderSetting = initialProjectsFolder;
    }

    private normalizeVaultPath(path: string): string {
        return normalizeVaultRelativePath(path, 'path');
    }

    private normalizeConfiguredPath(path: string | undefined, fallback: string, label: string): string {
        return normalizeConfiguredSettingPath(path, fallback, label);
    }

    private pathIsInFolder(path: string, folder: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path).toLowerCase();
        const normalizedFolder = this.normalizeVaultPath(folder).toLowerCase();
        if (!normalizedFolder) return false;
        return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
    }

    private getConfiguredTasksFolder(): string {
        return this.normalizeConfiguredPath(this.settings.tasksFolder, '000 Bin/DIWA Gawa', 'tasksFolder');
    }

    private getConfiguredThoughtsFolder(): string {
        return this.normalizeConfiguredPath(this.settings.thoughtsFolder, '000 Bin/DIWA', 'thoughtsFolder');
    }

    private getConfiguredPfFolder(): string {
        return this.normalizeConfiguredPath(this.settings.pfFolder, '000 Bin/DIWA PF', 'pfFolder');
    }

    private getConfiguredCapturePath(): string {
        return getCanonicalCapturePath(this.settings);
    }

    private getConfiguredProjectsFolder(): string {
        return this.normalizeConfiguredPath(this.settings.projectsFolder, 'Projects', 'projectsFolder');
    }

    private getTaskMarkdownFilesForFolder(folder: string): TFile[] {
        return this.app.vault.getMarkdownFiles().filter((file) =>
            this.pathIsInFolder(file.path, folder)
            && file.path.toLowerCase().endsWith('.md')
            && !file.path.toLowerCase().includes('/trash/'),
        );
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    async buildIndices() {
        await this.rebuildSelectedIndices({
            thoughts: true,
            tasks: true,
            dues: true,
            checklist: true,
            projects: true,
        });
    }

    async rebuildSelectedIndices(selection: IndexRebuildSelection): Promise<void> {
        const worker = new IndexService(this.app, this.settings);
        const normalizedSelection = this.normalizeRebuildSelection(selection);
        await worker.buildSelectedIndicesInPlace(normalizedSelection);
        this.applyRebuiltState(worker, normalizedSelection);
        if (normalizedSelection.tasks || normalizedSelection.dues) {
            this.rebuildCalculatedState();
        }
    }

    private normalizeRebuildSelection(selection: IndexRebuildSelection): Required<IndexRebuildSelection> {
        return {
            thoughts: selection.thoughts === true,
            tasks: selection.tasks === true,
            dues: selection.dues === true,
            checklist: selection.checklist === true,
            projects: selection.projects === true,
        };
    }

    private async buildSelectedIndicesInPlace(selection: Required<IndexRebuildSelection>): Promise<void> {
        await Promise.all([
            selection.thoughts ? this.buildThoughtIndexInPlace() : Promise.resolve(),
            selection.tasks ? this.buildTaskIndexInPlace() : Promise.resolve(),
            selection.dues ? this.buildDueIndexInPlace() : Promise.resolve(),
            selection.checklist ? this.buildChecklistIndexInPlace() : Promise.resolve(),
            selection.projects ? this.buildProjectIndexInPlace() : Promise.resolve(),
        ]);
    }

    private applyRebuiltState(source: IndexService, selection: Required<IndexRebuildSelection>): void {
        if (selection.thoughts) {
            this.thoughtIndex = new Map(source.thoughtIndex);
            this._thoughtChecklistMap = new Map(
                Array.from(source._thoughtChecklistMap.entries()).map(([path, items]) => [path, [...items]]),
            );
            this._thoughtDoneChecklistMap = new Map(
                Array.from(source._thoughtDoneChecklistMap.entries()).map(([path, items]) => [path, [...items]]),
            );
            this._lastIndexedThoughtsFolderSetting = source._lastIndexedThoughtsFolderSetting;
        }
        if (selection.tasks) {
            this.taskIndex = new Map(source.taskIndex);
            this._activeTasksFolder = source._activeTasksFolder;
            this._lastIndexedTasksFolderSetting = source._lastIndexedTasksFolderSetting;
        }
        if (selection.dues) {
            this.dueIndex = new Map(source.dueIndex);
            this._lastIndexedPfFolderSetting = source._lastIndexedPfFolderSetting;
        }
        if (selection.checklist) {
            this.checklistIndex = [...source.checklistIndex];
            this._lastIndexedCapturePath = source._lastIndexedCapturePath;
        }
        if (selection.projects) {
            this.projectIndex = new Map(source.projectIndex);
            this._lastIndexedProjectsFolderSetting = source._lastIndexedProjectsFolderSetting;
        }
    }

    resetAllIndices(): void {
        this.thoughtIndex.clear();
        this.taskIndex.clear();
        this.dueIndex.clear();
        this.projectIndex.clear();
        this.checklistIndex = [];
        this._thoughtChecklistMap.clear();
        this._thoughtDoneChecklistMap.clear();
        this.radarQueue = [];
        this.totalDues = 0;
    }

    rebuildCalculatedState() {
        // 1. Radar Queue: Urgent Open + Completed Today
        const today = moment().startOf('day');
        this.radarQueue = Array.from(this.taskIndex.values()).filter(t => {
            const isUrgent = t.status === 'open' && t.due && moment(t.due).isSameOrBefore(today, 'day');
            const completedToday = t.status === 'done' && moment(t.modified).isSame(today, 'day');
            return isUrgent || completedToday;
        }).sort((a, b) => {
            if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
            return moment(a.due).valueOf() - moment(b.due).valueOf();
        }).slice(0, 10);

        // 2. Total Dues
        let sum = 0;
        this.dueIndex.forEach(entry => sum += entry.amount || 0);
        this.totalDues = sum;
    }

    async buildChecklistIndex(): Promise<void> {
        await this.rebuildSelectedIndices({ checklist: true });
    }

    private async buildChecklistIndexInPlace(): Promise<void> {
        const path = this.getConfiguredCapturePath();
        this._lastIndexedCapturePath = path;
        const file = this.app.vault.getAbstractFileByPath(path);
        
        this.checklistIndex = [];
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            content.split('\n').forEach(line => {
                if (line.includes('- [ ]') || line.includes('- [x]')) {
                    this.checklistIndex.push({
                        text: line.replace(/- \[[ x]\] /, '').trim(),
                        done: line.includes('- [x]'),
                        line: line
                    });
                }
            });
        }
    }

    async buildProjectIndex(): Promise<void> {
        await this.rebuildSelectedIndices({ projects: true });
    }

    private async buildProjectIndexInPlace(): Promise<void> {
        const folder = this.getConfiguredProjectsFolder();
        this.projectIndex.clear();
        this._lastIndexedProjectsFolderSetting = folder;
        const files = this.app.vault.getMarkdownFiles().filter((file) => this.isProjectFile(file.path));
        for (const file of files) {
            await this.indexProjectFile(file);
        }
    }

    async buildDueIndex(): Promise<void> {
        await this.rebuildSelectedIndices({ dues: true });
    }

    private async buildDueIndexInPlace(): Promise<void> {
        const pfFolder = this.getConfiguredPfFolder();
        this.dueIndex.clear();
        this._lastIndexedPfFolderSetting = pfFolder;
        const files = this.app.vault.getMarkdownFiles().filter((file) => this.isDueFile(file.path));
        for (const file of files) {
            this.indexDueFile(file, true);
        }
    }

    indexDueFile(file: TFile, skipRebuild = false): void {
        if (!this.isDueFile(file.path)) {
            this.removeDueFile(file.path, skipRebuild);
            return;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        const active = fm?.['active_status'];
        const isActive = active === true || active === 'true' || active === 'True';
        const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
        const lastPayment = (fm?.['last_payment_date'] ?? '').toString().trim();
        const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
        const fmAmount = parseFloat((fm?.['amount'] ?? '').toString().replace(/[^\d.]/g, ''));
        const legacyAmount = parseFloat(file.basename.match(/[\d.]+/)?.[0] || '0');
        const amount = !isNaN(fmAmount) && fmAmount > 0 ? fmAmount : (isNaN(legacyAmount) ? 0 : legacyAmount);

        this.dueIndex.set(file.path, {
            title: file.basename,
            path: file.path,
            dueDate,
            lastPayment,
            dueMoment,
            hasRecurring: !!dueDate,
            isActive,
            amount: isNaN(amount) ? 0 : amount,
        });

        if (!skipRebuild) this.rebuildCalculatedState();
    }

    removeDueFile(path: string, skipRebuild = false): void {
        const removed = this.dueIndex.delete(path);
        if (removed && !skipRebuild) this.rebuildCalculatedState();
    }

    async indexProjectFile(file: TFile): Promise<void> {
        this.removeProjectFile(file.path);
        if (!this.isProjectFile(file.path)) return;

        const cache = this.app.metadataCache.getFileCache(file);
        const content = await this.app.vault.read(file);
        const fallbackFrontmatter = IndexService.parseFrontmatterFallback(content);
        const cacheFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        const fm = {
            ...(fallbackFrontmatter ?? {}),
            ...(cacheFrontmatter ?? {}),
        } as Record<string, unknown>;
        const id = String(fm['id'] ?? '').trim();
        const name = String(fm['name'] ?? '').trim();
        if (!id || !name) return;

        const rawStatus = String(fm['status'] ?? 'active').trim();
        const allowedStatuses: ProjectEntry['status'][] = ['active', 'on-hold', 'completed', 'archived'];
        const status = allowedStatuses.includes(rawStatus as ProjectEntry['status'])
            ? rawStatus as ProjectEntry['status']
            : 'active';

        this.projectIndex.set(id, {
            id,
            name,
            status,
            goal: String(fm['goal'] ?? ''),
            due: fm['due'] ? String(fm['due']) : undefined,
            created: String(fm['created'] ?? ''),
            color: fm['color'] ? String(fm['color']) : undefined,
            filePath: file.path,
        });
    }

    removeProjectFile(path: string): boolean {
        let removed = false;
        for (const [projectId, entry] of this.projectIndex.entries()) {
            if (entry.filePath !== path) continue;
            this.projectIndex.delete(projectId);
            removed = true;
        }
        return removed;
    }

    async buildThoughtIndex(): Promise<void> {
        await this.rebuildSelectedIndices({ thoughts: true });
    }

    private async buildThoughtIndexInPlace(): Promise<void> {
        this._lastIndexedThoughtsFolderSetting = this.getConfiguredThoughtsFolder();
        this.thoughtIndex.clear();
        this._thoughtChecklistMap.clear();
        this._thoughtDoneChecklistMap.clear();
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isThoughtFile(f.path));
        for (const f of files) {
            try {
                await this.indexThoughtFile(f);
            } catch (error) {
                console.warn('[DIWA IndexService] skipped thought file due indexing error', { path: f.path, error });
            }
        }
    }

    async buildTaskIndex(): Promise<void> {
        await this.rebuildSelectedIndices({ tasks: true });
    }

    private async buildTaskIndexInPlace(): Promise<void> {
        const configuredFolder = this.getConfiguredTasksFolder();
        const fallbackFolders = ['000 Bin/GAWA', '000 Bin/DIWA Gawa']
            .map((folder) => this.normalizeVaultPath(folder))
            .filter(Boolean)
            .filter((folder, index, folders) => folders.findIndex((candidate) => candidate.toLowerCase() === folder.toLowerCase()) === index)
            .filter((folder) => folder.toLowerCase() !== configuredFolder.toLowerCase());
        const candidateFolders = [configuredFolder, ...fallbackFolders];

        this.taskIndex.clear();
        this._activeTasksFolder = configuredFolder;

        for (const folder of candidateFolders) {
            const files = this.getTaskMarkdownFilesForFolder(folder);
            if (files.length === 0) continue;
            this.taskIndex.clear();

            // arch-02: Pass skipRebuild=true — rebuildCalculatedState() called once in buildIndices()
            for (const f of files) {
                try {
                    await this.indexTaskFile(f, true);
                } catch (error) {
                    console.warn('[DIWA IndexService] skipped task file due indexing error', { path: f.path, error });
                }
            }

            if (this.taskIndex.size > 0) {
                if (folder.toLowerCase() !== configuredFolder.toLowerCase()) {
                    console.warn('[DIWA IndexService] task folder fallback engaged', {
                        configuredFolder: this.settings.tasksFolder,
                        fallbackFolder: folder,
                        fileCount: files.length,
                        indexedTaskCount: this.taskIndex.size,
                    });
                }
                this._activeTasksFolder = folder;
                this._lastIndexedTasksFolderSetting = configuredFolder;
                return;
            }

            if (folder.toLowerCase() === configuredFolder.toLowerCase()) {
                console.warn('[DIWA IndexService] configured task folder contained no indexable task files', {
                    configuredFolder: this.settings.tasksFolder,
                    fileCount: files.length,
                });
            }
        }

        this.taskIndex.clear();
        this._activeTasksFolder = configuredFolder;
        this._lastIndexedTasksFolderSetting = configuredFolder;
    }

    async indexThoughtFile(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        // arch-01: Read actual file content for body — was incorrectly set to file.basename
        const content = await this.app.vault.read(file);
        const fallbackFrontmatter = IndexService.parseFrontmatterFallback(content);
        const cacheFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        const fm = {
            ...(fallbackFrontmatter ?? {}),
            ...(cacheFrontmatter ?? {}),
        } as Record<string, any>;
        if (Object.keys(fm).length === 0) return;
        const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
        const context = IndexService.normalizeContext(fm.context ?? fm.contexts);
        const tags = IndexService.normalizeStringArray(fm.tags);
        const journalType = inferJournalType({
            journalType: fm.journalType,
            context,
            tags,
        });
        const linkedTaskIds = Array.from(new Set([
            ...IndexService.normalizeStringArray(fm.linkedTasks),
            ...IndexService.normalizeLinksArray(fm.links, 'tasks'),
        ]));
        const topics = normalizeThoughtTopics(fm.topic);
        this.thoughtIndex.set(file.path, {
            id: file.path,
            filePath: file.path,
            title: getThoughtDisplayTitle({ title: String(fm.title || '').trim(), body }, file.basename),
            body: body,
            content: body,
            wikilinks: extractWikiLinks(body),
            day: String(fm.day || '').replace(/^\[\[|\]\]$/g, ''),
            created: fm.created || '',
            modified: fm.modified || '',
            createdAt: Number(fm.createdAt || file.stat.ctime || Date.now()),
            updatedAt: Number(fm.updatedAt || file.stat.mtime || Date.now()),
            context,
            topic: toStoredThoughtTopic(topics),
            journalType,
            synthesized: fm.synthesized || false,
            state: fm.state || 'raw',
            pinned: Boolean(fm.pinned),
            archived: Boolean(fm.archived),
            tags,
            project: fm.project || null,
            allDates: fm.allDates || [],
            lastThreadUpdate: file.stat.mtime,
            links: {
                tasks: linkedTaskIds,
                thoughts: IndexService.normalizeLinksArray(fm.links, 'thoughts'),
            },
        });

        // Collect open checklist items from this thought file (replace stale entries via Map)
        const newCheckItems: ThoughtChecklistItem[] = [];
        const newDoneItems: ThoughtChecklistItem[] = [];
        const lines = body.split('\n');
        const fileModifiedToday = moment(file.stat.mtime).isSame(moment(), 'day');
        lines.forEach((line, lineIndex) => {
            if (line.includes('- [ ]')) {
                newCheckItems.push({
                    filePath: file.path,
                    text: line.replace(/^[\s>]*- \[ \] /, '').trim(),
                    line,
                    lineIndex
                });
            } else if (fileModifiedToday && line.includes('- [x]')) {
                newDoneItems.push({
                    filePath: file.path,
                    text: line.replace(/^[\s>]*- \[x\] /i, '').trim(),
                    line,
                    lineIndex
                });
            }
        });
        this._thoughtChecklistMap.set(file.path, newCheckItems);
        this._thoughtDoneChecklistMap.set(file.path, newDoneItems);
    }

    // arch-02: skipRebuild param prevents O(n²) calls during bulk index build
    async indexTaskFile(file: TFile, skipRebuild = false) {
        const cache = this.app.metadataCache.getFileCache(file);
        const content = await this.app.vault.read(file);
        const fallbackFrontmatter = IndexService.parseFrontmatterFallback(content);
        const cacheFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        const fallbackFm = (fallbackFrontmatter ?? {}) as Record<string, unknown>;
        const cacheFm = (cacheFrontmatter ?? {}) as Record<string, unknown>;
        const pickFrontmatter = (keys: string[]): unknown =>
            IndexService.getFrontmatterValue(fallbackFm, keys)
            ?? IndexService.getFrontmatterValue(cacheFm, keys);
        const fm = {
            ...(fallbackFrontmatter ?? {}),
            ...(cacheFrontmatter ?? {}),
        } as Record<string, any>;
        if (Object.keys(fm).length === 0) {
            console.warn('[DIWA IndexService] indexTaskFile: no parseable frontmatter, skipping', { path: file.path });
            return;
        }
        const rawTaskBody = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
        const { body, comments } = splitTaskBodyAndCommentSuffix(rawTaskBody);
        const rawWorkflowStatus = String(pickFrontmatter(['status', 'state']) ?? 'backlog').toLowerCase().trim();
        const normalizedTaskIdValue = pickFrontmatter(['taskId', 'taskID']);
        const normalizedTaskId = normalizedTaskIdValue ? String(normalizedTaskIdValue) : undefined;
        const rawBucketValue = String(pickFrontmatter(['bucket']) ?? fm.bucket ?? '').toLowerCase().trim();
        const dueValue = pickFrontmatter(['due']) ?? fm.due;
        const titleValue = pickFrontmatter(['title']) ?? fm.title;
        const dayValue = pickFrontmatter(['day']) ?? fm.day;
        const createdValue = pickFrontmatter(['created']) ?? fm.created;
        const modifiedValue = pickFrontmatter(['modified']) ?? fm.modified;
        const projectValue = pickFrontmatter(['project']) ?? fm.project;
        const priorityValue = pickFrontmatter(['priority']) ?? fm.priority;
        const energyValue = pickFrontmatter(['energy']) ?? fm.energy;
        const recurrenceValue = pickFrontmatter(['recurrence']) ?? fm.recurrence;
        const recurrenceParentIdValue = pickFrontmatter(['recurrenceParentId']) ?? fm.recurrenceParentId;
        const milestoneValue = pickFrontmatter(['milestone']) ?? fm.milestone;
        const focusValue = pickFrontmatter(['focus']) ?? fm.focus;

        let normalizedStatus: TaskEntry['status'] = 'open';
        let normalizedLegacyState: TaskEntry['state'] = 'backlog';
        let normalizedBucketStatus: TaskBucketStatus | undefined = (['backlog', 'active', 'done'].includes(rawBucketValue))
            ? rawBucketValue as TaskBucketStatus
            : undefined;

        if (rawWorkflowStatus === 'done') {
            normalizedStatus = 'done';
            normalizedLegacyState = 'done';
            normalizedBucketStatus = normalizedBucketStatus ?? 'done';
        } else if (rawWorkflowStatus === 'waiting' || rawWorkflowStatus === 'active') {
            normalizedStatus = 'waiting';
            normalizedLegacyState = 'active';
            normalizedBucketStatus = normalizedBucketStatus ?? 'active';
        } else if (rawWorkflowStatus === 'someday') {
            normalizedStatus = 'someday';
            normalizedLegacyState = 'someday';
            normalizedBucketStatus = normalizedBucketStatus ?? 'backlog';
        } else if (rawWorkflowStatus === 'open') {
            normalizedStatus = 'open';
            normalizedLegacyState = 'open';
            normalizedBucketStatus = normalizedBucketStatus ?? 'backlog';
        } else {
            normalizedStatus = 'open';
            normalizedLegacyState = 'backlog';
            normalizedBucketStatus = normalizedBucketStatus ?? 'backlog';
        }

        const normalizedLifecycleStatus: TaskEntry['lifecycleStatus'] = (['planned', 'active', 'done'].includes(String(fm.lifecycleStatus)))
            ? fm.lifecycleStatus as 'planned' | 'active' | 'done'
            : (normalizedBucketStatus === 'done'
                ? 'done'
                : (normalizedBucketStatus === 'active' ? 'active' : 'planned'));

        const linkedThoughtIds = Array.from(new Set([
            ...IndexService.normalizeStringArray(fm.sourceThoughtIds),
            ...IndexService.normalizeLinksArray(fm.links, 'thoughts'),
        ]));

        // Guard against a stale disk read clobbering a newer optimistic in-memory update.
        const existingEntry = this.taskIndex.get(file.path);
        if (existingEntry && existingEntry.lastUpdate > file.stat.mtime) {
            if (!skipRebuild) this.rebuildCalculatedState();
            return;
        }

        this.taskIndex.set(file.path, {
            id: normalizedTaskId ?? file.path,
            filePath: file.path,
            title: titleValue || file.basename,
            body: body,
            status: normalizedStatus,
            state: normalizedLegacyState,
            // Normalize due: strip [[...]] wikilink wrapper, handle Date objects from YAML
            due: dueValue
                ? (typeof dueValue === 'object'
                    ? moment(dueValue).format('YYYY-MM-DD')
                    : String(dueValue).trim().replace(/^\[\[|\]\]$/g, ''))
                : '',
            created: createdValue ? String(createdValue) : '',
            modified: modifiedValue ? String(modifiedValue) : '',
            lastUpdate: file.stat.mtime,
            day: String(dayValue || '').replace(/^\[\[|\]\]$/g, ''),
            context: IndexService.normalizeContext(fm.context ?? fm.contexts),
            children: comments,
            project: projectValue ? String(projectValue) : undefined,
            milestone: milestoneValue ? String(milestoneValue) : undefined,
            priority: priorityValue as TaskEntry['priority'] | undefined,
            energy: energyValue as TaskEntry['energy'] | undefined,
            recurrence: recurrenceValue as TaskEntry['recurrence'] | undefined,
            recurrenceParentId: recurrenceParentIdValue ? String(recurrenceParentIdValue) : undefined,
            bucketStatus: normalizedBucketStatus,
            focus: typeof focusValue === 'boolean'
                ? focusValue
                : (String(focusValue).toLowerCase() === 'true' ? true : undefined),
            // Unified task model fields — gracefully absent on legacy tasks
            taskId: normalizedTaskId,
            origin: fm.origin === 'thought' ? 'thought' : (fm.origin === 'direct' ? 'direct' : undefined),
            sourceThoughtIds: linkedThoughtIds,
            links: { thoughts: linkedThoughtIds },
            // Lifecycle fields — gracefully absent on legacy tasks
            lifecycleStatus: normalizedLifecycleStatus,
            createdAt:   fm.createdAt   ? String(fm.createdAt)   : undefined,
            updatedAt:   fm.updatedAt   ? String(fm.updatedAt)   : undefined,
            completedAt: fm.completedAt ? String(fm.completedAt) : undefined,
            reflectionThoughtId: fm.reflectionThoughtId ? String(fm.reflectionThoughtId) : undefined,
        });
        if (!skipRebuild) this.rebuildCalculatedState();
    }

    removeTaskFile(path: string, skipRebuild = false): boolean {
        const removed = this.taskIndex.delete(path);
        if (removed && !skipRebuild) this.rebuildCalculatedState();
        return removed;
    }

    isThoughtFile(path: string): boolean {
        const folder = this.getConfiguredThoughtsFolder();
        const normalizedPath = this.normalizeVaultPath(path);
        return this.pathIsInFolder(normalizedPath, folder)
            && normalizedPath.toLowerCase().endsWith('.md')
            && !normalizedPath.toLowerCase().includes('/trash/');
    }

    getEffectiveTasksFolder(): string {
        return this._activeTasksFolder || this.getConfiguredTasksFolder();
    }

    isTaskFile(path: string): boolean {
        const folder = this.getEffectiveTasksFolder();
        const normalizedPath = this.normalizeVaultPath(path);
        return this.pathIsInFolder(normalizedPath, folder)
            && normalizedPath.toLowerCase().endsWith('.md')
            && !normalizedPath.toLowerCase().includes('/trash/');
    }

    tasksFolderChanged(): boolean {
        return this.getConfiguredTasksFolder().toLowerCase() !== this._lastIndexedTasksFolderSetting.toLowerCase();
    }

    thoughtsFolderChanged(): boolean {
        return this.getConfiguredThoughtsFolder().toLowerCase() !== this._lastIndexedThoughtsFolderSetting.toLowerCase();
    }

    isDueFile(path: string): boolean {
        const folder = this.getConfiguredPfFolder();
        const normalizedPath = this.normalizeVaultPath(path);
        return this.pathIsInFolder(normalizedPath, folder)
            && normalizedPath.toLowerCase().endsWith('.md');
    }

    dueFolderChanged(): boolean {
        return this.getConfiguredPfFolder().toLowerCase() !== this._lastIndexedPfFolderSetting.toLowerCase();
    }

    captureLocationChanged(): boolean {
        return this.getConfiguredCapturePath().toLowerCase() !== this._lastIndexedCapturePath.toLowerCase();
    }

    isProjectFile(path: string): boolean {
        const folder = this.getConfiguredProjectsFolder();
        const normalizedPath = this.normalizeVaultPath(path);
        return this.pathIsInFolder(normalizedPath, folder)
            && normalizedPath.toLowerCase().endsWith('.md')
            && !normalizedPath.toLowerCase().includes('/trash/');
    }

    projectsFolderChanged(): boolean {
        return this.getConfiguredProjectsFolder().toLowerCase() !== this._lastIndexedProjectsFolderSetting.toLowerCase();
    }

    pathAffectsProjectsFolder(path: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path);
        const folder = this.getConfiguredProjectsFolder();
        return this.pathIsInFolder(normalizedPath, folder) || this.pathIsInFolder(folder, normalizedPath);
    }

    pathTouchesProjectsFolderBoundary(path: string): boolean {
        const normalizedPath = this.normalizeVaultPath(path);
        const folder = this.getConfiguredProjectsFolder();
        return normalizedPath === folder || this.pathIsInFolder(folder, normalizedPath);
    }

    getProjects(): string[] {
        const p = new Set<string>();
        this.thoughtIndex.forEach(t => { if (t.project) p.add(t.project); });
        return Array.from(p);
    }

    async scanForContexts(): Promise<string[]> {
        const c = new Set<string>();
        this.thoughtIndex.forEach(t => t.context.forEach((x: string) => c.add(x)));
        this.taskIndex.forEach(t => t.context.forEach((x: string) => c.add(x)));
        return Array.from(c);
    }
}

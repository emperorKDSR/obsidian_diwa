import { Notice, TFile, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import type { ThoughtEntry } from '../types';
import type { TaskController } from './TaskController';
import { ThoughtIndex } from './ThoughtIndex';
import { extractWikiLinks } from '../utils/wikilinks';

interface ThoughtLinks {
    tasks: string[];
    thoughts: string[];
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export class ThoughtController {
    readonly thoughtIndex: ThoughtIndex;
    private listeners = new Set<(thought: ThoughtEntry) => void>();
    private initialized = false;
    private updatingThoughtPaths = new Set<string>();

    // Index-ready gate: views must await readyPromise before first render
    private _ready = false;
    private _isIndexing = false;
    private _resolveReady!: () => void;
    readonly readyPromise: Promise<void>;

    constructor(private plugin: DiwaPlugin) {
        this.thoughtIndex = new ThoughtIndex();
        this.readyPromise = new Promise<void>(resolve => { this._resolveReady = resolve; });
    }

    isReady(): boolean { return this._ready; }

    /** Call before bulk index load. Suppresses all listener notifications. */
    beginIndexing(): void {
        this._isIndexing = true;
    }

    /** Call after bulk index load completes. Releases the ready gate. */
    endIndexing(): void {
        this._isIndexing = false;
        this.markReady();
    }

    markReady(): void {
        if (!this._ready) {
            this._ready = true;
            this._resolveReady();
        }
    }

    subscribe(listener: (thought: ThoughtEntry) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyUpdate(thought: ThoughtEntry): void {
        if (this._isIndexing) return; // suppress during bulk index load
        for (const listener of this.listeners) {
            try {
                listener(thought);
            } catch (error) {
                console.warn('[DIWA ThoughtController] listener failed', error);
            }
        }
    }

    get isUpdatingThought(): boolean {
        return this.updatingThoughtPaths.size > 0;
    }

    isUpdatingThoughtPath(filePath: string): boolean {
        return this.updatingThoughtPaths.has(filePath);
    }

    setThoughts(thoughts: ThoughtEntry[]): void {
        // Allow re-hydration if the incoming set is non-empty — the controller may have
        // been created (and initialized with an empty index) before buildIndices() ran.
        if (this.initialized && thoughts.length === 0) return;
        const normalized = thoughts.map((thought) => this.normalizeThought(thought));
        this.thoughtIndex.set(normalized);
        this.initialized = true;
    }

    hydrateFromIndex(entries: ThoughtEntry[]): void {
        this.setThoughts(entries);
    }

    normalizeThought(thought: Partial<ThoughtEntry> & { filePath?: string }): ThoughtEntry {
        const nowTs = Date.now();
        const createdAt = thought.createdAt ?? nowTs;
        const updatedAt = thought.updatedAt ?? createdAt;
        const sourceLinks = thought.links || { tasks: [], thoughts: [] };
        const links: ThoughtLinks = {
            tasks: unique(sourceLinks.tasks ?? []),
            thoughts: unique(sourceLinks.thoughts ?? []),
        };
        const filePath = thought.filePath?.trim() || thought.id?.trim() || `thought-${nowTs}`;
        const id = thought.id?.trim() || filePath;
        const content = (thought.content ?? thought.body ?? thought.title ?? '').trim();
        const wikilinks = extractWikiLinks(content);
        const createdText = thought.created || moment(createdAt).format('YYYY-MM-DD HH:mm:ss');
        const modifiedText = thought.modified || moment(updatedAt).format('YYYY-MM-DD HH:mm:ss');
        return {
            ...thought,
            id,
            filePath,
            content,
            title: thought.title || content.split('\n').find((line) => line.trim()) || 'Untitled thought',
            body: thought.body || content,
            wikilinks,
            created: createdText,
            modified: modifiedText,
            createdAt,
            updatedAt,
            day: thought.day || moment(createdAt).format('YYYY-MM-DD'),
            context: thought.context ?? [],
            allDates: thought.allDates ?? [],
            lastThreadUpdate: thought.lastThreadUpdate ?? updatedAt,
            state: thought.state ?? (thought.pinned ? 'important' : 'raw'),
            pinned: !!thought.pinned,
            archived: !!thought.archived,
            tags: thought.tags ?? [],
            links,
        };
    }

    resolveWikiLink(name: string): TFile | null {
        const linkpath = name.trim();
        if (!linkpath) return null;
        return this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, '');
    }

    upsertThought(thought: ThoughtEntry, emit = true): ThoughtEntry {
        const normalized = this.normalizeThought(thought);
        this.thoughtIndex.update(normalized);
        this.plugin.index.thoughtIndex.set(normalized.filePath, normalized);
        if (emit) this.notifyUpdate(normalized);
        return normalized;
    }

    removeThoughtFromIndex(thoughtIdOrPath: string): void {
        const thought = this.getThought(thoughtIdOrPath);
        if (!thought) return;
        this.thoughtIndex.remove(thought.id || thought.filePath);
        this.plugin.index.thoughtIndex.delete(thought.filePath);
    }

    async persistThoughts(thoughts?: ThoughtEntry[]): Promise<void> {
        const entries = (thoughts ?? this.thoughtIndex.getAll()).map((thought) => this.normalizeThought(thought));
        for (const thought of entries) {
            await this.plugin.vault.persistThoughtMetadata({
                filePath: thought.filePath,
                pinned: thought.pinned,
                archived: thought.archived,
                state: thought.state,
                links: thought.links,
                createdAt: thought.createdAt,
                updatedAt: thought.updatedAt,
                modified: thought.modified,
                tags: thought.tags,
            });
        }
    }

    syncIndexedThought(filePath: string): ThoughtEntry | null {
        if (this.isUpdatingThoughtPath(filePath)) {
            return this.getThought(filePath);
        }
        const indexed = this.plugin.index.thoughtIndex.get(filePath);
        if (!indexed) return null;
        return this.upsertThought(indexed, true);
    }

    async addThought(thought: Partial<ThoughtEntry> & { content?: string; context?: string[]; topic?: string | null; project?: string | null }): Promise<ThoughtEntry | null> {
        const content = (thought.content ?? thought.body ?? thought.title ?? '').trim();
        if (!content) return null;
        try {
            // Suppress vault-event re-renders while we write and persist the file
            this.plugin.refreshCoordinator.suppressNotifyRefresh(1200);
            const created = await this.plugin.vault.createThoughtFile(
                content,
                thought.context ?? [],
                thought.project ?? undefined,
                thought.topic ?? undefined,
            );
            await this.plugin.refreshCoordinator.reindexFile(created);
            const synced = this.syncIndexedThought(created.path);
            if (!synced) return null;
            this.updatingThoughtPaths.add(synced.filePath);
            try {
                await this.persistThoughts([synced]);
                await this.plugin.refreshCoordinator.reindexFile(created);
                return this.syncIndexedThought(created.path);
            } finally {
                this.updatingThoughtPaths.delete(synced.filePath);
            }
        } catch (error) {
            console.error('[DIWA ThoughtController] addThought failed', error);
            return null;
        }
    }

    async updateThought(thought: Partial<ThoughtEntry> & { id?: string; filePath?: string; content?: string; topic?: string | null }): Promise<ThoughtEntry | null> {
        const ref = (thought.filePath || thought.id || '').trim();
        if (!ref) return null;
        const existing = this.getThought(ref);
        if (!existing) return null;
        const merged = this.normalizeThought({
            ...existing,
            ...thought,
            filePath: existing.filePath,
            id: existing.id,
            updatedAt: Date.now(),
            modified: moment().format('YYYY-MM-DD HH:mm:ss'),
        });

        try {
            this.updatingThoughtPaths.add(existing.filePath);
            if (thought.content !== undefined || thought.body !== undefined || thought.context !== undefined || thought.topic !== undefined) {
                const body = (merged.content || merged.body || merged.title || '').trim();
                await this.plugin.vault.editThought(
                    existing.filePath,
                    body,
                    merged.context ?? [],
                    merged.topic ?? undefined,
                );
            }
            await this.persistThoughts([merged]);
            const file = this.plugin.app.vault.getAbstractFileByPath(existing.filePath);
            if (file instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(file);
                const synced = this.plugin.index.thoughtIndex.get(existing.filePath) ?? null;
                const resolved = this.normalizeThought({ ...(synced ?? existing), ...merged });
                return this.upsertThought(resolved, true);
            }
            return this.upsertThought(merged);
        } catch (error) {
            console.error('[DIWA ThoughtController] updateThought failed', error);
            return null;
        } finally {
            this.updatingThoughtPaths.delete(existing.filePath);
        }
    }

    async assignThoughtContext(thoughtIdOrPath: string, contexts: string[], topic?: string | string[]): Promise<ThoughtEntry | null> {
        const thought = this.getThought(thoughtIdOrPath);
        if (!thought) return null;
        try {
            await this.plugin.vault.assignContextToThought(thought.filePath, contexts, topic);
            const file = this.plugin.app.vault.getAbstractFileByPath(thought.filePath);
            if (file instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(file);
            }
            return this.syncIndexedThought(thought.filePath);
        } catch (error) {
            console.error('[DIWA ThoughtController] assignThoughtContext failed', error);
            return null;
        }
    }

    async setSynthesized(thoughtIdOrPath: string, synthesized: boolean): Promise<ThoughtEntry | null> {
        const thought = this.getThought(thoughtIdOrPath);
        if (!thought) return null;
        try {
            if (synthesized) await this.plugin.vault.markAsSynthesized(thought.filePath);
            else await this.plugin.vault.unmarkSynthesized(thought.filePath);
            const file = this.plugin.app.vault.getAbstractFileByPath(thought.filePath);
            if (file instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(file);
            }
            return this.syncIndexedThought(thought.filePath);
        } catch (error) {
            console.error('[DIWA ThoughtController] setSynthesized failed', error);
            return null;
        }
    }

    removeThought(thoughtIdOrPath: string): void {
        const thought = this.getThought(thoughtIdOrPath);
        if (!thought) return;
        void this.updateThought({
            ...thought,
            archived: true,
            state: 'raw',
            pinned: false,
        });
    }

    getThought(thoughtIdOrPath: string): ThoughtEntry | null {
        const byId = this.thoughtIndex.get(thoughtIdOrPath);
        if (byId) return this.normalizeThought(byId);
        const byPath = this.plugin.index.thoughtIndex.get(thoughtIdOrPath);
        if (byPath) return this.normalizeThought(byPath);
        for (const thought of this.thoughtIndex.getAll()) {
            if (thought.id === thoughtIdOrPath || thought.filePath === thoughtIdOrPath) return this.normalizeThought(thought);
        }
        for (const thought of this.plugin.index.thoughtIndex.values()) {
            if (thought.id === thoughtIdOrPath || thought.filePath === thoughtIdOrPath) return this.normalizeThought(thought);
        }
        return null;
    }

    getAllThoughts(): ThoughtEntry[] {
        // Thoughts are normalized at write time (upsertThought/setThoughts) — return directly
        return this.thoughtIndex.getAll();
    }

    getThoughtsForTask(taskIdOrPath: string): ThoughtEntry[] {
        const taskRef = taskIdOrPath.trim();
        if (!taskRef) return [];
        const matched: ThoughtEntry[] = [];
        for (const thought of this.getAllThoughts()) {
            const linkedTasks = thought.links?.tasks ?? [];
            if (!linkedTasks.includes(taskRef)) continue;
            matched.push(thought);
        }
        return matched.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }

    searchThoughts(query: string): ThoughtEntry[] {
        const q = query.trim().toLowerCase();
        if (!q) return this.getAllThoughts().filter((thought) => !thought.archived);
        return this.getAllThoughts().filter((thought) => {
            if (thought.archived) return false;
            const haystack = `${thought.title} ${thought.content || thought.body || ''} ${(thought.tags ?? []).join(' ')}`.toLowerCase();
            return haystack.includes(q);
        });
    }

    async setPinned(thoughtId: string, pinned: boolean): Promise<ThoughtEntry | null> {
        const thought = this.getThought(thoughtId);
        if (!thought) return null;
        return this.updateThought({
            ...thought,
            pinned,
            state: pinned ? 'important' : 'raw',
        });
    }

    async setArchived(thoughtId: string, archived: boolean): Promise<ThoughtEntry | null> {
        const thought = this.getThought(thoughtId);
        if (!thought) return null;
        return this.updateThought({
            ...thought,
            archived,
            pinned: archived ? false : thought.pinned,
            state: archived ? 'raw' : thought.state,
        });
    }

    async linkThoughtToTask(thoughtId: string, taskId: string): Promise<boolean> {
        const thought = this.getThought(thoughtId);
        if (!thought) return false;
        const nextLinks: ThoughtLinks = {
            tasks: unique([...(thought.links?.tasks ?? []), taskId]),
            thoughts: unique(thought.links?.thoughts ?? []),
        };
        const updated = await this.updateThought({ ...thought, links: nextLinks });
        return !!updated;
    }

    async unlinkThoughtFromTask(thoughtId: string, taskId: string): Promise<boolean> {
        const thought = this.getThought(thoughtId);
        if (!thought) return false;
        const nextLinks: ThoughtLinks = {
            tasks: unique((thought.links?.tasks ?? []).filter((id) => id !== taskId)),
            thoughts: unique(thought.links?.thoughts ?? []),
        };
        const updated = await this.updateThought({ ...thought, links: nextLinks });
        return !!updated;
    }

    async linkThoughtToThought(sourceId: string, targetId: string): Promise<boolean> {
        const source = this.getThought(sourceId);
        const target = this.getThought(targetId);
        if (!source || !target) return false;
        if (source.filePath === target.filePath) return true;

        const sourceLinks: ThoughtLinks = {
            tasks: unique(source.links?.tasks ?? []),
            thoughts: unique([...(source.links?.thoughts ?? []), target.filePath]),
        };
        const targetLinks: ThoughtLinks = {
            tasks: unique(target.links?.tasks ?? []),
            thoughts: unique([...(target.links?.thoughts ?? []), source.filePath]),
        };

        const updatedSource = await this.updateThought({ ...source, links: sourceLinks });
        const updatedTarget = await this.updateThought({ ...target, links: targetLinks });
        return !!updatedSource && !!updatedTarget;
    }

    async convertThoughtToTask(thoughtId: string, taskController: TaskController): Promise<boolean> {
        const thought = this.getThought(thoughtId);
        if (!thought) return false;
        const content = (thought.content || thought.body || thought.title || '').trim();
        if (!content) return false;
        const created = await this.plugin.vault.createTaskFile(content, [...(thought.context || [])], undefined, thought.project || undefined, { status: 'open' });
        await this.plugin.refreshCoordinator.reindexFile(created);
        const indexedTask = this.plugin.index.taskIndex.get(created.path);
        if (!indexedTask) return false;
        taskController.addTask(indexedTask);
        const taskKey = indexedTask.taskId?.trim() || indexedTask.filePath;
        await this.linkThoughtToTask(thought.filePath, taskKey);
        await taskController.linkThoughtToTask(thought.filePath, taskKey);
        return true;
    }
}

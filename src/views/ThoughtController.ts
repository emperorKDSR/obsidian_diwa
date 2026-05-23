import { Notice, TFile, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskEntry, ThoughtEntry } from '../types';
import type { TaskController } from './TaskController';

interface ThoughtLinks {
    tasks: string[];
    thoughts: string[];
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export class ThoughtController {
    private thoughtIndex = new Map<string, ThoughtEntry>();

    constructor(private plugin: DiwaPlugin) {}

    hydrateFromIndex(entries: ThoughtEntry[]): void {
        this.thoughtIndex.clear();
        for (const thought of entries) {
            const normalized = this.normalizeThought(thought);
            this.thoughtIndex.set(normalized.filePath, normalized);
            this.plugin.index.thoughtIndex.set(normalized.filePath, normalized);
        }
    }

    normalizeThought(thought: Partial<ThoughtEntry> & { filePath?: string }): ThoughtEntry {
        const nowTs = Date.now();
        const createdAt = thought.createdAt ?? nowTs;
        const updatedAt = thought.updatedAt ?? createdAt;
        const links: ThoughtLinks = {
            tasks: unique(thought.links?.tasks ?? []),
            thoughts: unique(thought.links?.thoughts ?? []),
        };
        const id = thought.id?.trim() || thought.filePath?.trim() || `thought-${nowTs}`;
        const filePath = thought.filePath?.trim() || id;
        const content = (thought.content ?? thought.body ?? thought.title ?? '').trim();
        const createdText = thought.created || moment(createdAt).format('YYYY-MM-DD HH:mm:ss');
        const modifiedText = thought.modified || moment(updatedAt).format('YYYY-MM-DD HH:mm:ss');
        const day = thought.day || moment(createdAt).format('YYYY-MM-DD');
        return {
            ...thought,
            id,
            filePath,
            content,
            title: thought.title || content.split('\n').find((line) => line.trim()) || 'Untitled thought',
            body: thought.body || content,
            created: createdText,
            modified: modifiedText,
            createdAt,
            updatedAt,
            day,
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

    async addThought(thought: Partial<ThoughtEntry> & { content?: string; context?: string[] }): Promise<ThoughtEntry | null> {
        const content = (thought.content ?? thought.body ?? thought.title ?? '').trim();
        if (!content) return null;
        try {
            const created = await this.plugin.vault.createThoughtFile(content, thought.context ?? []);
            await this.plugin.refreshCoordinator.reindexFile(created);
            const indexed = this.plugin.index.thoughtIndex.get(created.path);
            if (!indexed) return null;
            const normalized = this.normalizeThought(indexed);
            this.thoughtIndex.set(normalized.filePath, normalized);
            this.plugin.index.thoughtIndex.set(normalized.filePath, normalized);
            return normalized;
        } catch (error) {
            console.error('[DIWA ThoughtController] addThought failed', error);
            new Notice('Error saving thought', 2000);
            return null;
        }
    }

    async updateThought(thought: Partial<ThoughtEntry> & { id?: string; filePath?: string; content?: string }): Promise<ThoughtEntry | null> {
        const id = (thought.filePath || thought.id || '').trim();
        if (!id) return null;
        const existing = this.getThought(id);
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
            if (thought.content !== undefined || thought.body !== undefined || thought.context !== undefined) {
                const body = (merged.content || merged.body || merged.title || '').trim();
                await this.plugin.vault.editThought(existing.filePath, body, merged.context ?? []);
            }
            const file = this.plugin.app.vault.getAbstractFileByPath(existing.filePath);
            if (file instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(file);
            }
            this.thoughtIndex.set(existing.filePath, merged);
            this.plugin.index.thoughtIndex.set(existing.filePath, merged);
            return merged;
        } catch (error) {
            console.error('[DIWA ThoughtController] updateThought failed', error);
            new Notice('Error updating thought', 2000);
            return null;
        }
    }

    removeThought(thoughtId: string): void {
        const thought = this.getThought(thoughtId);
        if (!thought) return;
        const archived = this.normalizeThought({
            ...thought,
            archived: true,
            state: 'raw',
            pinned: false,
            updatedAt: Date.now(),
            modified: moment().format('YYYY-MM-DD HH:mm:ss'),
        });
        this.thoughtIndex.set(archived.filePath, archived);
        this.plugin.index.thoughtIndex.set(archived.filePath, archived);
    }

    getThought(thoughtId: string): ThoughtEntry | null {
        const byPath = this.plugin.index.thoughtIndex.get(thoughtId) ?? this.thoughtIndex.get(thoughtId);
        if (byPath) return this.normalizeThought(byPath);
        for (const thought of this.thoughtIndex.values()) {
            if (thought.id === thoughtId || thought.filePath === thoughtId) return this.normalizeThought(thought);
        }
        for (const thought of this.plugin.index.thoughtIndex.values()) {
            if (thought.id === thoughtId || thought.filePath === thoughtId) return this.normalizeThought(thought);
        }
        return null;
    }

    getAllThoughts(): ThoughtEntry[] {
        for (const thought of this.plugin.index.thoughtIndex.values()) {
            const normalized = this.normalizeThought(thought);
            this.thoughtIndex.set(normalized.filePath, normalized);
        }
        return Array.from(this.thoughtIndex.values()).map((thought) => this.normalizeThought(thought));
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

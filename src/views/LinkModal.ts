import { App, Notice, Platform, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import type { TaskEntry, ThoughtEntry } from '../types';
import type { TaskController } from './TaskController';
import type { ThoughtController } from './ThoughtController';
import type { ThoughtProcessor } from './ThoughtProcessor';

export interface LinkModalContext {
    taskId?: string;
    thoughtId?: string;
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

export class LinkModal {
    private static shared: LinkModal | null = null;

    static getShared(
        app: App,
        plugin: DiwaPlugin,
        thoughtController: ThoughtController,
        taskController: TaskController,
        thoughtProcessor: ThoughtProcessor,
    ): LinkModal {
        if (!LinkModal.shared) {
            LinkModal.shared = new LinkModal(app, plugin, thoughtController, taskController, thoughtProcessor);
        }
        return LinkModal.shared;
    }

    private backdropEl: HTMLElement | null = null;
    private modalEl: HTMLElement | null = null;
    private thoughtsListEl: HTMLElement | null = null;
    private recallThoughtsListEl: HTMLElement | null = null;
    private tasksListEl: HTMLElement | null = null;
    private notesListEl: HTMLElement | null = null;
    private addThoughtInputEl: HTMLInputElement | null = null;
    private addTaskInputEl: HTMLInputElement | null = null;
    private activeContext: LinkModalContext | null = null;
    private hostEl: HTMLElement | null = null;
    private hostPositionTouched = false;
    private hostPositionOriginal = '';
    private onEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        this.close();
    };

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        private thoughtController: ThoughtController,
        private taskController: TaskController,
        private thoughtProcessor: ThoughtProcessor,
    ) {}

    open(context: LinkModalContext, hostEl?: HTMLElement): void {
        const normalized: LinkModalContext = {
            taskId: context.taskId?.trim() || undefined,
            thoughtId: context.thoughtId?.trim() || undefined,
        };
        if (!normalized.taskId && !normalized.thoughtId) return;
        this.activeContext = normalized;
        this.ensureDom();
        this.attachToHost(hostEl ?? document.body);
        this.render();
        if (!this.backdropEl || !this.addThoughtInputEl) return;
        this.modalEl?.toggleClass('is-mobile', this.isMobile());
        this.modalEl?.addClass('open');
        this.backdropEl?.addClass('open');
        this.backdropEl.style.display = 'block';
        window.addEventListener('keydown', this.onEscape, true);
        window.setTimeout(() => this.addThoughtInputEl?.focus(), 10);
    }

    close(): void {
        this.activeContext = null;
        window.removeEventListener('keydown', this.onEscape, true);
        this.modalEl?.removeClass('open');
        this.backdropEl?.removeClass('open');
        if (this.hostEl && this.hostPositionTouched) {
            this.hostEl.style.position = this.hostPositionOriginal;
            this.hostPositionTouched = false;
        }
        this.hostEl = null;
        this.backdropEl?.remove();
        this.modalEl?.remove();
        this.backdropEl = null;
        this.modalEl = null;
        this.thoughtsListEl = null;
        this.recallThoughtsListEl = null;
        this.tasksListEl = null;
        this.notesListEl = null;
        this.addThoughtInputEl = null;
        this.addTaskInputEl = null;
    }

    private ensureDom(): void {
        if (this.backdropEl && this.modalEl) return;
        this.backdropEl = document.createElement('div');
        this.backdropEl.className = 'link-modal-backdrop';
        this.backdropEl.addEventListener('mousedown', (event) => {
            if (event.target !== this.backdropEl) return;
            this.close();
        });

        this.modalEl = document.createElement('div');
        this.modalEl.className = 'link-modal';
        this.modalEl.addEventListener('mousedown', (event) => event.stopPropagation());
        let touchStartY = 0;
        this.modalEl.addEventListener('touchstart', (event) => {
            if (!this.isMobile()) return;
            touchStartY = event.touches[0]?.clientY ?? 0;
        }, { passive: true });
        this.modalEl.addEventListener('touchend', (event) => {
            if (!this.isMobile()) return;
            const endY = event.changedTouches[0]?.clientY ?? touchStartY;
            if (endY - touchStartY > 80) this.close();
        }, { passive: true });

        const header = this.modalEl.createEl('div', { cls: 'link-modal-header', text: 'Linked Items' });
        header.setAttr('role', 'heading');
        header.setAttr('aria-level', '2');

        const thoughtsSection = this.modalEl.createEl('div', { cls: 'link-modal-section' });
        thoughtsSection.createEl('div', { cls: 'section-title', text: 'Thoughts' });
        this.thoughtsListEl = thoughtsSection.createEl('div', { cls: 'thought-list' });

        const relatedSection = this.modalEl.createEl('div', { cls: 'link-modal-section recall-section' });
        relatedSection.createEl('div', { cls: 'section-title', text: 'Related Past Thoughts' });
        this.recallThoughtsListEl = relatedSection.createEl('div', { cls: 'recall-thought-list' });

        const tasksSection = this.modalEl.createEl('div', { cls: 'link-modal-section' });
        tasksSection.createEl('div', { cls: 'section-title', text: 'Tasks' });
        this.tasksListEl = tasksSection.createEl('div', { cls: 'task-list' });

        const notesSection = this.modalEl.createEl('div', { cls: 'link-modal-section' });
        notesSection.createEl('div', { cls: 'section-title', text: 'Notes' });
        this.notesListEl = notesSection.createEl('div', { cls: 'note-list' });

        const inputs = this.modalEl.createEl('div', { cls: 'link-modal-inputs' });
        this.addThoughtInputEl = inputs.createEl('input', {
            cls: 'add-thought-input',
            attr: { type: 'text', placeholder: 'Add thought...' },
        }) as HTMLInputElement;
        this.addTaskInputEl = inputs.createEl('input', {
            cls: 'add-task-input',
            attr: { type: 'text', placeholder: 'Add task...' },
        }) as HTMLInputElement;

        this.addThoughtInputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            const value = this.addThoughtInputEl?.value.trim() || '';
            if (!value) return;
            this.addThoughtInputEl!.disabled = true;
            void (async () => {
                const ok = await this.addThought(value);
                this.addThoughtInputEl!.disabled = false;
                if (!ok) return;
                this.addThoughtInputEl!.value = '';
                this.render();
            })();
        });

        this.addTaskInputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            const value = this.addTaskInputEl?.value.trim() || '';
            if (!value) return;
            this.addTaskInputEl!.disabled = true;
            void (async () => {
                const ok = await this.addTask(value);
                this.addTaskInputEl!.disabled = false;
                if (!ok) return;
                this.addTaskInputEl!.value = '';
                this.render();
            })();
        });
    }

    private attachToHost(hostEl: HTMLElement): void {
        if (!this.backdropEl || !this.modalEl) return;
        const host = hostEl ?? document.body;
        if (this.hostEl === host && this.backdropEl.parentElement === host && this.modalEl.parentElement === host) return;

        if (this.hostEl && this.hostPositionTouched) {
            this.hostEl.style.position = this.hostPositionOriginal;
            this.hostPositionTouched = false;
        }

        this.hostEl = host;
        const isGlobal = host === document.body;
        this.backdropEl.toggleClass('is-global', isGlobal);
        this.modalEl.toggleClass('is-global', isGlobal);
        if (!isGlobal) {
            const computed = window.getComputedStyle(host).position;
            if (computed === 'static') {
                this.hostPositionOriginal = host.style.position;
                host.style.position = 'relative';
                this.hostPositionTouched = true;
            }
        }
        host.appendChild(this.backdropEl);
        host.appendChild(this.modalEl);
    }

    private isMobile(): boolean {
        return this.plugin.isMobile() || Platform.isMobile;
    }

    private resolveContext(context: LinkModalContext): { thoughts: ThoughtEntry[]; recallThoughts: ThoughtEntry[]; tasks: TaskEntry[]; notes: string[] } {
        if (context.taskId) {
            const task = this.taskController.getTask(context.taskId);
            if (!task) return { thoughts: [], recallThoughts: [], tasks: [], notes: [] };
            const thoughts = this.taskController.getLinkedThoughtsForTask(context.taskId);
            const tasksById = new Map<string, TaskEntry>();
            tasksById.set(getTaskKey(task), task);
            for (const thought of thoughts) {
                for (const linkedTask of this.taskController.getLinkedTasksForThought(thought.filePath)) {
                    tasksById.set(getTaskKey(linkedTask), linkedTask);
                }
            }
            const notes = new Set<string>();
            for (const thought of thoughts) {
                for (const wikilink of thought.wikilinks ?? []) notes.add(wikilink);
            }
            const related = new Map<string, ThoughtEntry>();
            for (const linkedThought of thoughts) {
                for (const candidate of this.thoughtProcessor.recall(linkedThought)) {
                    const key = candidate.id || candidate.filePath;
                    related.set(key, candidate);
                }
            }
            for (const linkedThought of thoughts) {
                related.delete(linkedThought.id || linkedThought.filePath);
            }
            return {
                thoughts,
                recallThoughts: Array.from(related.values()).slice(0, 5),
                tasks: Array.from(tasksById.values()),
                notes: Array.from(notes.values()),
            };
        }

        if (context.thoughtId) {
            const thought = this.thoughtController.getThought(context.thoughtId);
            if (!thought) return { thoughts: [], recallThoughts: [], tasks: [], notes: [] };
            const thoughtMap = new Map<string, ThoughtEntry>();
            thoughtMap.set(thought.filePath, thought);
            for (const linkedThoughtId of thought.links?.thoughts ?? []) {
                const linkedThought = this.thoughtController.getThought(linkedThoughtId);
                if (linkedThought) thoughtMap.set(linkedThought.filePath, linkedThought);
            }
            const notes = new Set<string>();
            for (const entry of thoughtMap.values()) {
                for (const wikilink of entry.wikilinks ?? []) notes.add(wikilink);
            }
            return {
                thoughts: Array.from(thoughtMap.values()),
                recallThoughts: this.thoughtProcessor.recall(thought),
                tasks: this.taskController.getLinkedTasksForThought(thought.filePath),
                notes: Array.from(notes.values()),
            };
        }

        return { thoughts: [], recallThoughts: [], tasks: [], notes: [] };
    }

    private render(): void {
        if (!this.activeContext || !this.thoughtsListEl || !this.recallThoughtsListEl || !this.tasksListEl || !this.notesListEl) return;
        const { thoughts, recallThoughts, tasks, notes } = this.resolveContext(this.activeContext);
        this.renderThoughts(thoughts);
        this.renderRecallThoughts(recallThoughts);
        this.renderTasks(tasks);
        this.renderNotes(notes);
    }

    private renderThoughts(thoughts: ThoughtEntry[]): void {
        if (!this.thoughtsListEl) return;
        this.thoughtsListEl.empty();
        if (thoughts.length === 0) {
            this.thoughtsListEl.createEl('div', { cls: 'link-modal-empty', text: 'No linked thoughts' });
            return;
        }
        for (const thought of thoughts) {
            const row = this.thoughtsListEl.createEl('div', { cls: 'thought-item link-modal-item' });
            row.createEl('span', {
                cls: 'text',
                text: (thought.body || thought.content || thought.title || thought.filePath).split('\n').find((line) => line.trim())?.trim() || 'Untitled thought',
            });
            const open = row.createEl('span', { cls: 'open-link', text: '↗' });
            open.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(thought.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    private renderTasks(tasks: TaskEntry[]): void {
        if (!this.tasksListEl) return;
        this.tasksListEl.empty();
        if (tasks.length === 0) {
            this.tasksListEl.createEl('div', { cls: 'link-modal-empty', text: 'No linked tasks' });
            return;
        }
        for (const task of tasks) {
            const row = this.tasksListEl.createEl('div', { cls: 'task-item link-modal-item' });
            row.createEl('span', { cls: 'text', text: task.title || task.filePath });
            const open = row.createEl('span', { cls: 'open-link', text: '↗' });
            open.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(task.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    private renderRecallThoughts(thoughts: ThoughtEntry[]): void {
        if (!this.recallThoughtsListEl) return;
        this.recallThoughtsListEl.empty();
        if (thoughts.length === 0) {
            this.recallThoughtsListEl.createEl('div', { cls: 'link-modal-empty', text: 'No related past thoughts' });
            return;
        }
        for (const thought of thoughts) {
            const row = this.recallThoughtsListEl.createEl('div', { cls: 'thought-item link-modal-item' });
            row.createEl('span', {
                cls: 'text',
                text: (thought.body || thought.content || thought.title || thought.filePath).split('\n').find((line) => line.trim())?.trim() || 'Untitled thought',
            });
            const open = row.createEl('span', { cls: 'open-link', text: '↗' });
            open.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(thought.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    private renderNotes(notes: string[]): void {
        if (!this.notesListEl) return;
        this.notesListEl.empty();
        if (notes.length === 0) {
            this.notesListEl.createEl('div', { cls: 'link-modal-empty', text: 'No linked notes' });
            return;
        }
        for (const noteName of notes) {
            const row = this.notesListEl.createEl('div', { cls: 'note-item link-modal-item' });
            row.createEl('span', { cls: 'text', text: noteName });
            const open = row.createEl('span', { cls: 'open-link', text: '↗' });
            open.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.thoughtController.resolveWikiLink(noteName);
                if (file instanceof TFile) {
                    await this.app.workspace.getLeaf(false).openFile(file);
                    return;
                }
                await this.app.workspace.openLinkText(noteName, '', false);
            });
        }
    }

    private async addThought(content: string): Promise<boolean> {
        if (!this.activeContext) return false;
        if (this.activeContext.taskId) {
            const ok = await this.taskController.createThoughtFromTask(this.activeContext.taskId, content);
            if (!ok)
            return ok;
        }
        if (this.activeContext.thoughtId) {
            const source = this.thoughtController.getThought(this.activeContext.thoughtId);
            const created = await this.thoughtController.addThought({
                content,
                context: source?.context ?? [],
                project: source?.project,
            });
            if (!created) {
                return false;
            }
            const ok = await this.thoughtController.linkThoughtToThought(this.activeContext.thoughtId, created.filePath);
            if (!ok)
            return ok;
        }
        return false;
    }

    private async addTask(content: string): Promise<boolean> {
        if (!this.activeContext) return false;
        const seedTask = this.activeContext.taskId ? this.taskController.getTask(this.activeContext.taskId) : null;
        const seedThought = this.activeContext.thoughtId ? this.thoughtController.getThought(this.activeContext.thoughtId) : null;
        const contexts = seedTask?.context ?? seedThought?.context ?? [];
        const project = seedTask?.project ?? seedThought?.project ?? undefined;

        const created = await this.plugin.vault.createTaskFile(content, contexts, undefined, project, { status: 'open' });
        await this.plugin.refreshCoordinator.reindexFile(created);
        const indexedTask = this.plugin.index.taskIndex.get(created.path);
        if (!indexedTask) {
            return false;
        }
        this.taskController.addTask(indexedTask);
        const newTaskId = getTaskKey(indexedTask);

        if (this.activeContext.thoughtId) {
            const ok = await this.taskController.linkThoughtToTask(this.activeContext.thoughtId, newTaskId);
            if (!ok)
            return ok;
        }

        if (this.activeContext.taskId) {
            const thoughts = this.taskController.getLinkedThoughtsForTask(this.activeContext.taskId);
            let linkedAny = false;
            for (const thought of thoughts) {
                const linked = await this.taskController.linkThoughtToTask(thought.filePath, newTaskId);
                linkedAny = linkedAny || linked;
            }
            if (thoughts.length > 0 && !linkedAny) {
                return false;
            }
            return true;
        }

        return true;
    }
}

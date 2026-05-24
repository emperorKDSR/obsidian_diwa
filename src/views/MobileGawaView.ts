import { ItemView, Notice, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_GAWA } from '../constants';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';
import type { TaskEntry } from '../types';

export class MobileGawaView extends ItemView {
    plugin: DiwaPlugin;
    private _taskFilter: 'open' | 'waiting' | 'done' | 'all' = 'open';
    private _togglingTaskIds = new Set<string>();

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_GAWA; }
    getDisplayText(): string { return 'DIWA Mobile Gawa'; }
    getIcon(): string { return 'check-square-2'; }

    async onOpen() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        await this.renderView();
    }

    async onClose() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = '';
    }

    async renderView() {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('diwa-mh-root');

        if (!Platform.isMobile || isTablet()) {
            root.createEl('div', {
                text: '⊕ DIWA Mobile Gawa requires a mobile device.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' },
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'diwa-mh-wrap diwa-mh-gawa-wrap' });
        const tasksPane = wrap.createEl('div', { cls: 'diwa-mh-tasks' });
        const head = tasksPane.createEl('div', { cls: 'diwa-mh-tasks-head' });
        head.createEl('div', { cls: 'diwa-mh-feed-title', text: 'GAWA' });

        const statusSelect = head.createEl('select', {
            cls: 'diwa-mh-filter-pill diwa-mh-task-filter',
            attr: { 'aria-label': 'Filter tasks by status' },
        }) as HTMLSelectElement;
        const options: Array<{ value: 'open' | 'waiting' | 'done' | 'all'; label: string }> = [
            { value: 'open', label: 'OPEN' },
            { value: 'waiting', label: 'WAITING' },
            { value: 'done', label: 'DONE' },
            { value: 'all', label: 'ALL' },
        ];
        for (const option of options) {
            const el = statusSelect.createEl('option', { text: option.label });
            el.value = option.value;
        }
        statusSelect.value = this._taskFilter;
        statusSelect.addEventListener('change', () => {
            this._taskFilter = statusSelect.value as 'open' | 'waiting' | 'done' | 'all';
            void this.renderView();
        });

        const allTasks = this.plugin.getTaskController().getAllTasks();
        const tasks = allTasks
            .filter((task) => this.matchTaskFilter(task))
            .sort((left, right) => (right.modified || '').localeCompare(left.modified || ''))
            .slice(0, 80);

        if (tasks.length === 0) {
            tasksPane.createEl('div', {
                cls: 'diwa-mh-feed-empty',
                text: this._taskFilter === 'all' ? 'No tasks yet.' : `No ${this._taskFilter} tasks.`,
            });
            return;
        }

        const list = tasksPane.createEl('div', { cls: 'diwa-mh-tasks-list' });
        for (const task of tasks) {
            this.renderTaskItem(list, task);
        }
    }

    private renderTaskItem(parent: HTMLElement, task: TaskEntry): void {
        const item = parent.createEl('div', { cls: 'diwa-mh-task-item' });
        const taskId = task.taskId?.trim() || task.filePath;
        const isDone = task.status === 'done';

        const line = item.createEl('div', { cls: 'diwa-mh-task-line' });
        const check = line.createEl('input', {
            cls: 'diwa-mh-task-check',
            attr: {
                type: 'checkbox',
                'aria-label': `Toggle completion for ${task.title || 'task'}`,
            },
        }) as HTMLInputElement;
        check.checked = isDone;
        check.disabled = this._togglingTaskIds.has(taskId);
        check.addEventListener('change', async (event) => {
            event.stopPropagation();
            this._togglingTaskIds.add(taskId);
            const ok = await this.plugin.getTaskController().toggleTask(taskId);
            this._togglingTaskIds.delete(taskId);
            if (!ok) {
                new Notice('Could not update task status', 1600);
            }
            await this.renderView();
        });

        const title = (task.title || task.body || 'Untitled task').trim();
        const titleEl = line.createEl('span', {
            cls: `diwa-mh-task-text${isDone ? ' is-done' : ''}`,
            text: title,
            attr: {
                role: 'button',
                tabindex: '0',
                'aria-label': `Open task ${task.title || ''}`,
            },
        });
        const openTask = async () => {
            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            }
        };
        titleEl.addEventListener('click', async (event) => {
            event.stopPropagation();
            await openTask();
        });
        titleEl.addEventListener('keydown', async (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            await openTask();
        });

        const meta = item.createEl('div', { cls: 'diwa-mh-task-meta-text' });
        const statusText = (task.status || 'open').toUpperCase();
        const dueText = task.due?.trim() ? ` • Due ${task.due}` : '';
        meta.setText(`Status: ${statusText}${dueText}`);
    }

    private matchTaskFilter(task: TaskEntry): boolean {
        if (this._taskFilter === 'all') return true;
        const status = String(task.status || '').toLowerCase();
        const isDone = this.isTaskDone(task);
        if (this._taskFilter === 'open') return !isDone && (status === 'open' || status === 'someday' || status === 'waiting');
        if (this._taskFilter === 'waiting') return !isDone && status === 'waiting';
        if (this._taskFilter === 'done') return isDone;
        return false;
    }

    private isTaskDone(task: TaskEntry): boolean {
        const status = String(task.status || '').toLowerCase();
        const state = String(task.state || '').toLowerCase();
        const bucket = String(task.bucketStatus || '').toLowerCase();
        const lifecycle = String(task.lifecycleStatus || '').toLowerCase();
        return status === 'done'
            || state === 'done'
            || bucket === 'done'
            || lifecycle === 'done'
            || !!task.completedAt;
    }
}

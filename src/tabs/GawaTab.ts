import { moment, setIcon, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { EditEntryModal } from '../modals/EditEntryModal';
import { EditTaskModal } from '../modals/EditTaskModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { NotePickerModal } from '../modals/NotePickerModal';
import type { TaskEntry } from '../types';
import { taskEntryToTask } from '../utils/taskAdapter';
import {
    getFocusTasks,
    getTaskUrgencyTier,
    explainTaskPriority,
    maintainFocusStability,
} from '../utils/focusEngine';
import type { Task } from '../types';
import { parseContextString } from '../utils';

type SecondaryMode = 'inbox' | 'overdue' | 'done';

// ── GawaTab ───────────────────────────────────────────────────────────────

/**
 * Redesigned task experience: focus-first, minimal cognitive load.
 *
 * Primary:   Focus View  — top 3–5 tasks from getFocusTasks(), each as an
 *                          expandable card with urgency indicator + explanation.
 * Secondary: Inbox/Overdue/Done — compact list, opt-in via toggle.
 *
 * All state (focus snapshot, detail path, secondary mode) lives on DiwaView
 * so it survives the tab being re-instantiated on vault events.
 */
export class GawaTab extends BaseTab {
    private _container: HTMLElement | null = null;

    // ── Accessors — state stored on view for persistence across re-renders ──

    private get _focusSnapshot(): Task[] { return this.view.tasksFocusSnapshot; }
    private set _focusSnapshot(v: Task[]) { this.view.tasksFocusSnapshot = v; }

    private get _detailPath(): string | null { return this.view.tasksDetailPath; }
    private set _detailPath(v: string | null) { this.view.tasksDetailPath = v; }

    private get _secondaryMode(): SecondaryMode | null {
        return this.view.tasksSecondaryMode as SecondaryMode | null;
    }
    private set _secondaryMode(v: SecondaryMode | null) {
        this.view.tasksSecondaryMode = v;
    }

    constructor(view: DiwaView) {
        super(view);
    }

    // ── Render entry point ─────────────────────────────────────────────────

    render(container: HTMLElement) {
        this._container = container;
        container.empty();

        const wrap = container.createEl('div', { cls: 'diwa-tab-wrap' });
        this._renderHeader(wrap);
        this._renderFocusSection(wrap);

        if (this._secondaryMode !== null) {
            this._renderSecondarySection(wrap);
        }
    }

    // ── Header ─────────────────────────────────────────────────────────────

    private _renderHeader(parent: HTMLElement) {
        const header = parent.createEl('div', { cls: 'diwa-tasks-header' });

        const titleRow = header.createEl('div', { cls: 'diwa-tasks-title-row' });
        titleRow.createEl('h2', { text: 'Focus', cls: 'diwa-tab-title' });

        const btnGroup = header.createEl('div', { cls: 'diwa-tasks-header-actions' });

        // Add task button
        const addBtn = btnGroup.createEl('button', { cls: 'diwa-tasks-add-btn' });
        setIcon(addBtn.createEl('span'), 'plus');
        addBtn.createSpan({ text: 'New' });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(
                this.app, this.plugin, '', '',
                moment().format('YYYY-MM-DD'), true,
                async (text, ctxs, due, _proj, recur, priority, energy, status) => {
                    if (!text.trim()) return;
                    await this.vault.createTaskFile(
                        text, parseContextString(ctxs), due || undefined, undefined,
                        { recurrence: recur ?? undefined, priority: priority ?? undefined, energy: energy ?? undefined, status: status !== 'open' ? status : undefined }
                    );
                    this._focusSnapshot = []; // reset stability so new task surfaces
                    this._rerender();
                }, 'New Task'
            ).open();
        });

        // Secondary toggle
        const secBtn = btnGroup.createEl('button', {
            cls: `diwa-tasks-sec-btn${this._secondaryMode !== null ? ' is-active' : ''}`,
            attr: { title: 'All tasks' }
        });
        setIcon(secBtn, 'layout-list');
        secBtn.addEventListener('click', () => {
            this._secondaryMode = this._secondaryMode !== null ? null : 'inbox';
            this._rerender();
        });
    }

    // ── Focus section ──────────────────────────────────────────────────────

    private _renderFocusSection(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-focus-section' });

        const allEntries = Array.from(this.index.taskIndex.values());
        const adapted    = allEntries.map(taskEntryToTask);
        const newFocus   = getFocusTasks(adapted, 5);

        // Apply stability: preserve user's mental model across re-renders
        const stable = this._focusSnapshot.length > 0
            ? maintainFocusStability(this._focusSnapshot, newFocus)
            : newFocus;
        this._focusSnapshot = stable;

        if (stable.length === 0) {
            const empty = section.createEl('div', { cls: 'diwa-focus-empty' });
            setIcon(empty.createEl('span', { cls: 'diwa-focus-empty-icon' }), 'check-circle');
            empty.createEl('p', {
                text: 'All clear — nothing needs focus right now.',
                cls: 'diwa-focus-empty-text'
            });
            return;
        }

        section.createEl('p', {
            text: 'What needs your attention right now',
            cls: 'diwa-focus-label'
        });

        // Build lookup: adapted task ID → original TaskEntry
        const entryById = new Map<string, TaskEntry>();
        for (const entry of allEntries) {
            entryById.set(taskEntryToTask(entry).id, entry);
        }

        for (const task of stable) {
            const entry = entryById.get(task.id);
            if (!entry) continue;
            this._renderFocusCard(section, task, entry);
        }
    }

    private _renderFocusCard(parent: HTMLElement, task: Task, entry: TaskEntry) {
        const tier   = getTaskUrgencyTier(task);
        const isOpen = this._detailPath === entry.filePath;

        const card = parent.createEl('div', {
            cls: `diwa-focus-card diwa-focus-card--${tier}${isOpen ? ' is-open' : ''}`
        });

        // ── Urgency dot ────────────────────────────────────────────────────
        card.createEl('div', { cls: `diwa-urgency-dot diwa-urgency-dot--${tier}` });

        // ── Body ───────────────────────────────────────────────────────────
        const body = card.createEl('div', { cls: 'diwa-focus-card-body' });
        body.createEl('div', { text: task.title, cls: 'diwa-focus-card-title' });
        body.createEl('div', {
            text: `→ ${explainTaskPriority(task)}`,
            cls: 'diwa-focus-explanation'
        });

        // Meta chips
        const meta = body.createEl('div', { cls: 'diwa-focus-meta' });
        if (task.due) {
            const m = moment(task.due, 'YYYY-MM-DD', true);
            if (m.isValid()) {
                const overdue = task.status !== 'done' && m.isBefore(moment(), 'day');
                const today   = m.isSame(moment(), 'day');
                meta.createEl('span', {
                    text: today ? 'Today' : overdue ? `Overdue · ${m.format('MMM D')}` : m.format('MMM D'),
                    cls: `diwa-chip diwa-chip--date${overdue ? ' is-overdue' : today ? ' is-today' : ''}`
                });
            }
        }
        if (task.status === 'active') {
            meta.createEl('span', { text: 'Active', cls: 'diwa-chip diwa-chip--active' });
        }
        const thoughtCount = (task.sourceThoughtIds ?? []).length;
        if (thoughtCount > 0) {
            meta.createEl('span', {
                text: `${thoughtCount} thought${thoughtCount > 1 ? 's' : ''}`,
                cls: 'diwa-chip diwa-chip--thoughts'
            });
        }

        // ── Quick actions ──────────────────────────────────────────────────
        const actions = card.createEl('div', { cls: 'diwa-focus-card-actions' });

        if (task.status === 'planned') {
            const startBtn = actions.createEl('button', { cls: 'diwa-focus-action-btn', attr: { title: 'Start task' } });
            setIcon(startBtn, 'arrow-right');
            startBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._doLifecycle(() => this.plugin.taskLink?.markTaskActive(entry.filePath));
            });
        }

        if (task.status === 'active') {
            const doneBtn = actions.createEl('button', {
                cls: 'diwa-focus-action-btn diwa-focus-action-btn--done',
                attr: { title: 'Mark done' }
            });
            setIcon(doneBtn, 'check');
            doneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._doLifecycle(
                    () => this.plugin.taskLink?.markTaskDone(entry.filePath),
                    () => this._offerReflection(task, entry.filePath)
                );
            });
        }

        // Expand / collapse
        const chevron = actions.createEl('button', {
            cls: 'diwa-focus-chevron',
            attr: { title: 'Task details' }
        });
        setIcon(chevron, isOpen ? 'chevron-up' : 'chevron-down');

        const toggle = () => {
            this._detailPath = isOpen ? null : entry.filePath;
            this._rerender();
        };
        body.addEventListener('click', toggle);
        chevron.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

        // ── Inline detail panel ────────────────────────────────────────────
        if (isOpen) {
            this._renderDetailPanel(parent, task, entry);
        }
    }

    // ── Detail panel ───────────────────────────────────────────────────────

    private _renderDetailPanel(parent: HTMLElement, task: Task, entry: TaskEntry) {
        const panel = parent.createEl('div', { cls: 'diwa-focus-detail' });

        // Status + lifecycle buttons
        const topRow = panel.createEl('div', { cls: 'diwa-detail-action-row' });
        topRow.createEl('span', {
            text: task.status.charAt(0).toUpperCase() + task.status.slice(1),
            cls: `diwa-status-badge diwa-status-badge--${task.status}`
        });

        const btnRow = topRow.createEl('div', { cls: 'diwa-detail-btns' });

        if (task.status !== 'active') {
            const b = btnRow.createEl('button', { cls: 'diwa-detail-btn', attr: { title: 'Set active' } });
            setIcon(b.createEl('span', { cls: 'diwa-btn-icon' }), 'arrow-right');
            b.createSpan({ text: 'Start' });
            b.addEventListener('click', () =>
                this._doLifecycle(() => this.plugin.taskLink?.markTaskActive(entry.filePath))
            );
        }

        if (task.status !== 'done') {
            const b = btnRow.createEl('button', { cls: 'diwa-detail-btn diwa-detail-btn--primary', attr: { title: 'Mark done' } });
            setIcon(b.createEl('span', { cls: 'diwa-btn-icon' }), 'check');
            b.createSpan({ text: 'Done' });
            b.addEventListener('click', () =>
                this._doLifecycle(
                    () => this.plugin.taskLink?.markTaskDone(entry.filePath),
                    () => this._offerReflection(task, entry.filePath)
                )
            );
        }

        if (task.status === 'done') {
            const b = btnRow.createEl('button', { cls: 'diwa-detail-btn', attr: { title: 'Reopen' } });
            setIcon(b.createEl('span', { cls: 'diwa-btn-icon' }), 'rotate-ccw');
            b.createSpan({ text: 'Reopen' });
            b.addEventListener('click', () =>
                this._doLifecycle(() => this.plugin.taskLink?.reopenTask(entry.filePath))
            );
        }

        // Timestamps
        if (task.createdAt || task.updatedAt || task.completedAt) {
            const times = panel.createEl('div', { cls: 'diwa-detail-times' });
            if (task.createdAt)  this._timeRow(times, 'Created',   task.createdAt);
            if (task.updatedAt)  this._timeRow(times, 'Updated',   task.updatedAt);
            if (task.completedAt) this._timeRow(times, 'Completed', task.completedAt);
        }

        // Linked thoughts
        const thoughtIds = task.sourceThoughtIds ?? [];
        if (thoughtIds.length > 0) {
            const sec = panel.createEl('div', { cls: 'diwa-detail-thoughts' });
            sec.createEl('div', { text: 'Linked thoughts', cls: 'diwa-detail-section-label' });
            for (const tPath of thoughtIds) {
                const tEntry = this.index.thoughtIndex.get(tPath);
                const label  = tEntry?.title ?? tPath.split('/').pop()?.replace('.md', '') ?? tPath;
                const link   = sec.createEl('div', { cls: 'diwa-detail-thought-link' });
                setIcon(link.createEl('span', { cls: 'diwa-detail-thought-icon' }), 'message-circle');
                link.createEl('span', { text: label, cls: 'diwa-detail-thought-title' });
                link.addEventListener('click', () => {
                    this.app.workspace.openLinkText(tPath, tPath);
                });
            }
        }

        // ── Utility actions ────────────────────────────────────────────────
        const utils = panel.createEl('div', { cls: 'diwa-detail-utils' });

        this._utilBtn(utils, 'pencil', 'Edit', () => {
            new EditTaskModal(this.app, entry, this.vault, this.index, () => this._rerender()).open();
        });

        this._utilBtn(utils, 'link', 'Link thought', () => {
            new NotePickerModal(this.app, async (file) => {
                await this.plugin.taskLink?.addThoughtToExistingTask(entry.filePath, file.path);
                await this.plugin.taskLink?.linkTaskToThought(entry.filePath, file.path);
                this._rerender();
            }).open();
        });

        if (this.plugin.ai) {
            this._utilBtn(utils, 'sparkles', 'Improve', async () => {
                const { TaskAiAdvisor } = await import('../services/TaskAiAdvisor');
                const advisor  = new TaskAiAdvisor(this.plugin.ai);
                const improved = await advisor.improveTaskTitle(entry.title);
                if (improved !== entry.title) {
                    new ConfirmModal(
                        this.app,
                        `Suggested: "${improved}"\n\nApply this title?`,
                        async () => {
                            await this.vault.editTask(entry.filePath, improved, entry.context, entry.due || undefined);
                            this._rerender();
                        }
                    ).open();
                } else {
                    new Notice('Title already looks specific.');
                }
            });
        }

        this._utilBtn(utils, 'trash-2', 'Delete', () => {
            new ConfirmModal(this.app, 'Move this task to trash?', async () => {
                this._detailPath = null;
                await this.vault.deleteFile(entry.filePath, 'tasks');
            }).open();
        }, true);
    }

    private _timeRow(parent: HTMLElement, label: string, iso: string) {
        const row = parent.createEl('div', { cls: 'diwa-detail-time-row' });
        row.createEl('span', { text: label, cls: 'diwa-detail-time-label' });
        const fmt = moment(iso).isValid() ? moment(iso).format('MMM D, YYYY · HH:mm') : iso;
        row.createEl('span', { text: fmt, cls: 'diwa-detail-time-value' });
    }

    private _utilBtn(
        parent: HTMLElement,
        icon: string,
        label: string,
        fn: () => void,
        danger = false
    ) {
        const btn = parent.createEl('button', {
            cls: `diwa-detail-util-btn${danger ? ' diwa-detail-util-btn--danger' : ''}`
        });
        setIcon(btn, icon);
        btn.createSpan({ text: label });
        btn.addEventListener('click', fn);
    }

    // ── Secondary section ──────────────────────────────────────────────────

    private _renderSecondarySection(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-secondary-section' });

        // Tab bar
        const tabBar = section.createEl('div', { cls: 'diwa-secondary-tabs' });
        const TABS: { mode: SecondaryMode; label: string }[] = [
            { mode: 'inbox',   label: 'Inbox'   },
            { mode: 'overdue', label: 'Overdue' },
            { mode: 'done',    label: 'Done'    },
        ];
        for (const { mode, label } of TABS) {
            const btn = tabBar.createEl('button', {
                text: label,
                cls: `diwa-secondary-tab${this._secondaryMode === mode ? ' is-active' : ''}`
            });
            btn.addEventListener('click', () => { this._secondaryMode = mode; this._rerender(); });
        }

        // List
        const list = section.createEl('div', { cls: 'diwa-secondary-list' });
        const today = moment().startOf('day');
        let rows = Array.from(this.index.taskIndex.values());

        if (this._secondaryMode === 'done') {
            rows = rows.filter(t => t.status === 'done').sort((a, b) => b.lastUpdate - a.lastUpdate);
        } else if (this._secondaryMode === 'overdue') {
            rows = rows.filter(t => {
                if (t.status === 'done') return false;
                const m = moment(t.due, 'YYYY-MM-DD', true);
                return m.isValid() && m.isBefore(today, 'day');
            }).sort((a, b) => moment(a.due).valueOf() - moment(b.due).valueOf());
        } else {
            // inbox — all non-done
            rows = rows
                .filter(t => t.status !== 'done')
                .sort((a, b) => {
                    const ad = !!(a.due?.trim()), bd = !!(b.due?.trim());
                    if (ad && !bd) return -1;
                    if (!ad && bd) return 1;
                    if (ad && bd) return moment(a.due).valueOf() - moment(b.due).valueOf();
                    return b.lastUpdate - a.lastUpdate;
                });
        }

        if (rows.length === 0) {
            const msgs: Record<SecondaryMode, string> = {
                done:    'No completed tasks.',
                overdue: 'Nothing overdue ✓',
                inbox:   'Inbox is empty.',
            };
            this.renderEmptyState(list, msgs[this._secondaryMode ?? 'inbox']);
            return;
        }

        for (const entry of rows) this._renderSecondaryRow(list, entry);
    }

    private _renderSecondaryRow(parent: HTMLElement, entry: TaskEntry) {
        const task    = taskEntryToTask(entry);
        const tier    = getTaskUrgencyTier(task);
        const isDone  = entry.status === 'done';
        const dueM    = entry.due ? moment(entry.due, 'YYYY-MM-DD', true) : null;
        const overdue = !isDone && dueM?.isValid() && dueM.isBefore(moment(), 'day');
        const today   = !isDone && dueM?.isValid() && dueM.isSame(moment(), 'day');

        const row = parent.createEl('div', {
            cls: `diwa-secondary-row diwa-secondary-row--${tier}${isDone ? ' is-done' : ''}`
        });

        row.createEl('div', { cls: `diwa-urgency-dot diwa-urgency-dot--${tier}` });

        const content = row.createEl('div', { cls: 'diwa-secondary-content' });
        content.createEl('span', { text: entry.title, cls: `diwa-secondary-title${isDone ? ' is-done' : ''}` });
        if (dueM?.isValid()) {
            content.createEl('span', {
                text: today ? 'Today' : overdue ? dueM.format('MMM D') : dueM.format('MMM D'),
                cls: `diwa-chip diwa-chip--date${overdue ? ' is-overdue' : today ? ' is-today' : ''}`
            });
        }

        const actions = row.createEl('div', { cls: 'diwa-secondary-actions' });

        // Checkbox toggle
        const cb = actions.createEl('div', { cls: `diwa-task-cb${isDone ? ' is-done' : ''}` });
        if (isDone) setIcon(cb.createEl('span'), 'check');
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            this.view._taskTogglePending++;
            await this.vault.toggleTask(entry.filePath, !isDone);
            this.view._taskTogglePending = Math.max(0, this.view._taskTogglePending - 1);
        });

        // Edit
        const editBtn = actions.createEl('button', { cls: 'diwa-secondary-action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new EditTaskModal(this.app, entry, this.vault, this.index, () => this._rerender()).open();
        });

        // Delete
        const delBtn = actions.createEl('button', { cls: 'diwa-secondary-action-btn is-danger' });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmModal(this.app, 'Move this task to trash?', async () => {
                await this.vault.deleteFile(entry.filePath, 'tasks');
            }).open();
        });
    }

    // ── Lifecycle helpers ──────────────────────────────────────────────────

    /**
     * Runs a lifecycle action, increments the pending counter so vault events
     * don't race with the re-render, then re-renders after completion.
     * An optional `afterFn` is called after successful completion (e.g. to
     * offer a reflection prompt after marking done).
     */
    private async _doLifecycle(
        fn: () => Promise<void> | undefined,
        afterFn?: () => void
    ) {
        if (!this.plugin.taskLink) {
            new Notice('Task lifecycle service not available — check plugin setup.');
            return;
        }
        this.view._taskTogglePending++;
        try {
            const result = fn();
            if (result) await result;
            afterFn?.();
        } finally {
            this.view._taskTogglePending = Math.max(0, this.view._taskTogglePending - 1);
        }
        this._rerender();
    }

    /**
     * After a task is marked done, optionally offer to create a reflection note.
     * Strictly opt-in — the user must confirm before anything is written.
     */
    private _offerReflection(task: Task, filePath: string) {
        if (!this.plugin.taskReflection) return;
        new ConfirmModal(
            this.app,
            `"${task.title}" marked as done.\n\nCreate a reflection note?`,
            async () => {
                const file = await this.plugin.taskReflection.generateTaskReflection(task, filePath);
                if (file) {
                    this.app.workspace.openLinkText(file.path, file.path);
                }
            }
        ).open();
    }

    /** Re-renders the tab into the stored container. */
    private _rerender() {
        if (this._container) this.render(this._container);
    }
}

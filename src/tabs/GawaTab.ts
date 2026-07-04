import { Notice, Platform, TFile, moment, setIcon } from 'obsidian';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { GawaDesktopBucketId, GawaLayoutBucketPreference, GawaPaneId, GawaTabletBucketId, TaskBucketStatus, TaskEntry } from '../types';
import { isTablet, parseNaturalDate } from '../utils';
import { TaskController } from '../views/TaskController';
import {
    TaskPane,
    type TaskPaneGroupController,
    type TaskPaneHost,
    type TaskFilterFn,
    type TaskPanePlugin,
    type TaskSortFn,
} from '../views/DesktopTaskPane';
import { FastTaskCaptureModal, type FastTaskCapturePayload } from '../modals/FastTaskCaptureModal';
import { GawaLayoutCustomizeModal } from '../modals/GawaLayoutCustomizeModal';
import { EditTaskModal } from '../modals/EditTaskModal';
interface PaneConfig {
    paneId: string;
    title: string;
    eyebrow: string;
    emptyMessage: string;
    baseFilterFn: TaskFilterFn;
    filterFn: TaskFilterFn;
    sortFn?: TaskSortFn;
    plugins?: TaskPanePlugin[];
    canDropTask?: TaskFilterFn;
    groupController?: TaskPaneGroupController;
    bucketOnDrop: TaskBucketStatus;
    focusOnDrop?: boolean;
}

type MobileTabId = 'inbox' | 'today' | 'focus';
const MOBILE_TAB_ORDER: MobileTabId[] = ['inbox', 'today', 'focus'];
const MOBILE_TAB_META: Record<MobileTabId, { label: string; icon: string }> = {
    inbox: { label: 'Inbox', icon: 'inbox' },
    today: { label: 'Today', icon: 'sun-medium' },
    focus: { label: 'Focus', icon: 'target' },
};
type GawaLayoutMode = 'desktop' | 'tablet' | 'phone';
type InboxCaptureTarget = 'backlog' | 'active' | 'focus';

interface ParsedInboxCapture {
    text: string;
    contexts: string[];
    dueDate: string | null;
    priority: 'high' | 'medium' | 'low' | null;
}

export class GawaTab extends BaseTab {
    private _container: HTMLElement | null = null;
    private _rootEl: HTMLElement | null = null;
    private _layoutMode: GawaLayoutMode | null = null;
    private _layoutSignature: string | null = null;
    private readonly _taskController: TaskController;

    private _doneTodayStatEl: HTMLElement | null = null;
    private _focusStatEl: HTMLElement | null = null;
    private _overdueStatEl: HTMLElement | null = null;
    private _showDoneInTable = false;
    private _sortField: 'task' | 'priority' | 'due' | null = null;
    private _sortDirection: 'asc' | 'desc' = 'asc';
    private _captureEditors: EditorView[] = [];
    private _taskPending = 0;
    private _taskFilter: 'today' | 'upcoming' | 'all' = 'today';
    private _taskIndexRecoveryInFlight = false;

    constructor(view: DiwaView) {
        super(view);
        this._taskController = this.plugin.getTaskController();
        console.log('[DIWA] GAWA controller ref:', this._taskController);
    }

    render(container: HTMLElement): void {
        const layoutMode = this.resolveLayoutMode();
        const layoutSignature = this.getLayoutSignature(layoutMode);
        const canReuseLayout =
            this._container === container
            && this._rootEl !== null
            && this._layoutMode === layoutMode
            && this._layoutSignature === layoutSignature
            && container.contains(this._rootEl);

        const indexSize = this.plugin.index.taskIndex.size;
        console.log('[DIWA GAWA] render', { indexSize, layoutMode, canReuseLayout });

        this._container = container;
        if (canReuseLayout) {
            this._taskController.syncFromIndex();
            this.updateWorkspaceStats();
            return;
        }

        if (this._rootEl && container.contains(this._rootEl)) {
            this._rootEl.remove();
        } else {
            for (const child of Array.from(container.children)) {
                child.remove();
            }
        }
        this._layoutMode = layoutMode;
        this._layoutSignature = layoutSignature;

        const root = container.createEl('div', { cls: 'diwa-gawa-desktop' });
        this._rootEl = root;
        
        root.tabIndex = -1; // make it focusable to catch keydown
        root.addEventListener('keydown', (event: KeyboardEvent) => {
            // Only capture if user is not typing in an input
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
            
            if (['j', 'k', 'h', 'l'].includes(event.key)) {
                // Focus handling placeholder for Kanban navigation
                console.log('[DIWA GAWA] Keyboard Kanban nav triggered:', event.key);
                // Here we would typically querySelector the tasks and adjust focus.
            }
        });
        const isPhone = layoutMode === 'phone';
        if (isPhone) root.addClass('is-mobile');
        this.renderHeader(root);
        this.renderTableView(root);

        this._taskController.syncFromIndex();
        this.updateWorkspaceStats();
        void this.ensureTaskIndexRecovered();
    }

    /** Incremental refresh — called when only task data changes (avoids full DOM rebuild). */
    onTasksRefresh(): void {
        this.updateWorkspaceStats();
        if (this._rootEl) {
            const oldTable = this._rootEl.querySelector('.diwa-gawa-table-view');
            if (oldTable) {
                oldTable.remove();
            }
            this.renderTableView(this._rootEl);
        }
    }

    onunload(): void {
        this._rootEl = null;
        this._layoutMode = null;
        this._layoutSignature = null;
        this._container = null;
        this._taskIndexRecoveryInFlight = false;
    }

    private async ensureTaskIndexRecovered(): Promise<void> {
        if (this._taskIndexRecoveryInFlight) return;
        if (this.plugin.index.taskIndex.size > 0) return;
        this._taskIndexRecoveryInFlight = true;
        try {
            await this.plugin.index.buildTaskIndex();
            this.plugin.index.rebuildCalculatedState();
            if (this.plugin.index.taskIndex.size > 0) {
                console.warn('[DIWA GAWA] task index recovered after initial empty snapshot', {
                    taskCount: this.plugin.index.taskIndex.size,
                });
                this._taskController.syncFromIndex();
                this.updateWorkspaceStats();
            }
        } catch (error) {
            console.error('[DIWA GAWA] task index recovery failed', error);
        } finally {
            this._taskIndexRecoveryInFlight = false;
        }
    }

    private renderHeader(parent: HTMLElement): void {
        const header = parent.createEl('div', { cls: 'diwa-gawa-header diwa-gawa-workspace-bar' });
        if (this.isPhoneLayout()) header.addClass('is-phone-header');
        const identity = header.createEl('div', { cls: 'diwa-gawa-workspace-bar-left' });
        identity.createEl('span', { text: 'Task workspace', cls: 'diwa-gawa-workspace-eyebrow' });
        const titleGroup = identity.createEl('div', { cls: 'diwa-gawa-header-title-group diwa-gawa-workspace-identity' });
        titleGroup.createEl('h2', { text: 'Gawa', cls: 'diwa-gawa-header-title' });
        const subtitle = this.isPhoneLayout()
            ? 'Task flow'
            : 'Desktop task cockpit';
        titleGroup.createEl('span', { text: subtitle, cls: 'diwa-gawa-header-subtitle' });

        const progressStrip = header.createEl('div', {
            cls: 'diwa-gawa-progress-strip',
            attr: { 'aria-label': 'Workspace progress' },
        });
        this._doneTodayStatEl = this.createWorkspaceStat(progressStrip, 'done', 'Done today');
        this._focusStatEl = this.createWorkspaceStat(progressStrip, 'focus', 'Focus');
        this._overdueStatEl = this.createWorkspaceStat(progressStrip, 'overdue', 'Overdue');

        const doneToggleBtn = progressStrip.createEl('button', { cls: 'diwa-gawa-header-btn' });
        doneToggleBtn.style.minHeight = '32px';
        doneToggleBtn.style.padding = '0 12px';
        doneToggleBtn.style.color = '#39ff14';
        setIcon(doneToggleBtn, 'check-circle');
        doneToggleBtn.createEl('span', { text: this._showDoneInTable ? 'Hide Done' : 'Show Done' });
        doneToggleBtn.addEventListener('click', () => {
            this._showDoneInTable = !this._showDoneInTable;
            if (this._container) {
                this.render(this._container);
            }
        });

        const actions = header.createEl('div', { cls: 'diwa-gawa-header-actions diwa-gawa-workspace-bar-right' });
        if (this.isPhoneLayout()) {
            this.renderCaptureTrigger(actions);
        } else {
            this.renderFastCapture(actions);
        }

        this.updateWorkspaceStats();
    }

    private openLayoutCustomizeModal(): void {
        new GawaLayoutCustomizeModal(this.app, this.plugin, async (preferences) => {
            await this.plugin.saveGawaLayoutPreferences(preferences);
        }).open();
    }

    private renderCaptureTrigger(parent: HTMLElement): void {
        const captureBtn = parent.createEl('button', {
            cls: 'diwa-gawa-header-btn diwa-gawa-header-btn--primary diwa-gawa-capture-trigger',
            attr: { type: 'button' },
        });
        setIcon(captureBtn, 'sparkles');
        captureBtn.createEl('span', { text: 'Capture' });
        captureBtn.addEventListener('click', () => this.openCreateTaskModal());
    }

    private createWorkspaceStat(parent: HTMLElement, modifier: string, label: string): HTMLElement {
        const chip = parent.createEl('div', { cls: `diwa-gawa-stat-chip diwa-gawa-stat-chip--${modifier}` });
        chip.createEl('span', { cls: 'diwa-gawa-stat-chip-label', text: label });
        return chip.createEl('span', { cls: 'diwa-gawa-stat-chip-value', text: '0' });
    }

    private updateWorkspaceStats(): void {
        const tasks = Array.from(this.plugin.index.taskIndex.values());
        const today = moment().startOf('day');
        const doneToday = tasks.filter((task) =>
            task.status === 'done'
            && task.modified
            && moment(task.modified, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true).isSame(today, 'day')
        ).length;
        const focusCount = tasks.filter((task) =>
            this.getBucketStatus(task) !== 'done'
            && !!task.focus
        ).length;
        const overdueCount = tasks.filter((task) => {
            if (this.getBucketStatus(task) === 'done' || !task.due) return false;
            const due = moment(task.due, 'YYYY-MM-DD', true);
            return due.isValid() && due.isBefore(today, 'day');
        }).length;

        this._doneTodayStatEl?.setText(String(doneToday));
        this._focusStatEl?.setText(String(focusCount));
        this._overdueStatEl?.setText(String(overdueCount));
    }

    private createEditorCapture(
        container: HTMLElement,
        placeholderText: string,
        onSubmit: (text: string, editor: EditorView, container: HTMLElement) => Promise<void>,
        onModEnter: (text: string) => void,
        onShiftEnter?: (text: string, editor: EditorView, container: HTMLElement) => Promise<void>
    ): EditorView {
        const editorContainer = container.createEl('div', { cls: 'diwa-gawa-capture-editor' });
        
        editorContainer.style.width = '100%';
        editorContainer.style.flex = '1';
        editorContainer.style.display = 'flex';
        editorContainer.style.alignItems = 'center';

        let editorView: EditorView;

        const customKeymap = keymap.of([
            {
                key: 'Enter',
                run: (view) => {
                    const text = view.state.doc.toString().trim();
                    if (!text) return false;
                    void onSubmit(text, view, editorContainer);
                    return true;
                },
                shift: (view) => {
                    if (!onShiftEnter) return false;
                    const text = view.state.doc.toString().trim();
                    if (!text) return false;
                    void onShiftEnter(text, view, editorContainer);
                    return true;
                }
            },
            {
                key: 'Mod-Enter',
                run: (view) => {
                    const text = view.state.doc.toString().trim();
                    onModEnter(text);
                    return true;
                }
            }
        ]);

        const startState = EditorState.create({
            doc: '',
            extensions: [
                markdown(),
                cmPlaceholder(placeholderText),
                customKeymap,
                keymap.of(defaultKeymap),
                EditorView.lineWrapping,
                EditorView.theme({
                    "&": { backgroundColor: "transparent", color: "var(--text-normal)", fontSize: "13px", fontWeight: "500" },
                    ".cm-content": { 
                        fontFamily: "var(--font-interface)",
                        padding: "8px 0"
                    },
                    "&.cm-focused": { outline: "none" },
                    ".cm-scroller": { overflow: "hidden" }
                })
            ]
        });

        editorView = new EditorView({
            state: startState,
            parent: editorContainer
        });

        this._captureEditors.push(editorView);
        return editorView;
    }

    private renderFastCapture(parent: HTMLElement): void {
        const capture = parent.createEl('div', { cls: 'diwa-gawa-capture' });
        const icon = capture.createEl('span', { cls: 'diwa-gawa-capture-icon' });
        setIcon(icon, 'plus');

        const quickCreate = async (title: string, editorView: EditorView, container: HTMLElement) => {
            container.style.opacity = '0.5';
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                const created = await this.vault.createTaskFile(title, []);
                if (created instanceof TFile) {
                    await this.plugin.refreshCoordinator.reindexFile(created);
                    const indexedTask = this.plugin.index.taskIndex.get(created.path);
                    if (indexedTask) {
                        this._taskController.addTask(indexedTask);
                    } else {
                        this._taskController.syncFromIndex();
                    }
                } else {
                    this._taskController.syncFromIndex();
                }
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: '' }
                });
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed fast capture task', error);
            } finally {
                container.style.opacity = '1';
                editorView.focus();
            }
        };

        this.createEditorCapture(capture, 'Quick add to inbox…', quickCreate, (title) => {
            this.openCreateTaskModal(title);
        });
    }


    private isPhoneLayout(): boolean {
        return Platform.isMobile && !isTablet();
    }

    private resolveLayoutMode(): GawaLayoutMode {
        if (this.isPhoneLayout()) return 'phone';
        return 'desktop';
    }

    private getLayoutSignature(layoutMode: GawaLayoutMode): string {
        const viewState = `showDone:${this._showDoneInTable}`;
        if (layoutMode === 'phone') return `phone-${viewState}`;
        return `${layoutMode}-${viewState}:${JSON.stringify(this.plugin.settings.gawaLayoutPreferences.desktop)}`;
    }



    private openCreateTaskModal(initialText: string = ''): void {
        new FastTaskCaptureModal(
            this.app,
            this.plugin,
            async (payload: FastTaskCapturePayload) => {
                await this.createTaskFromCapture(payload);
            },
            initialText,
        ).open();
    }

    private async createTaskFromCapture(payload: FastTaskCapturePayload): Promise<void> {
        try {
            this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
            const created = await this.vault.createTaskFile(
                payload.text,
                payload.contexts,
                payload.dueDate || undefined,
                {
                    priority: payload.priority ?? undefined,
                    status: payload.status,
                }
            );
            if (created instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(created);
                const indexedTask = this.plugin.index.taskIndex.get(created.path);
                if (indexedTask) {
                    this._taskController.addTask(indexedTask);
                    if (payload.focus) {
                        await this._taskController.moveTaskToBucket(
                            this.resolveTaskKey(indexedTask),
                            'active',
                            { focus: true }
                        );
                    }
                } else {
                    this._taskController.syncFromIndex();
                }
            } else {
                this._taskController.syncFromIndex();
            }
            this.updateWorkspaceStats();
        } catch (error) {
            console.error('[DIWA GAWA] Failed to create task', error);
            throw error instanceof Error
                ? error
                : new Error('Failed to add task to Gawa.');
        }
    }

    private parseInboxCaptureInput(value: string): ParsedInboxCapture {
        const tags = Array.from(value.matchAll(/(^|\s)#([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);
        const dueTokens = Array.from(value.matchAll(/(^|\s)@([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);
        const priorityTokens = Array.from(value.matchAll(/(^|\s)!([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);

        const contexts: string[] = [];
        for (const tag of tags) {
            if (!contexts.includes(tag)) contexts.push(tag);
        }

        let dueDate: string | null = null;
        for (const token of dueTokens) {
            const parsed = this.tryParseCaptureDate(token);
            if (parsed) {
                dueDate = parsed;
                break;
            }
        }

        let priority: ParsedInboxCapture['priority'] = null;
        for (const token of priorityTokens) {
            const parsed = this.parseCapturePriority(token);
            if (parsed) {
                priority = parsed;
                break;
            }
        }

        const text = value
            .replace(/(^|\s)(#[^\s#@!.,;:!?()[\]{}]+|@[^\s#@!.,;:!?()[\]{}]+|![^\s#@!.,;:!?()[\]{}]+)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return { text, contexts, dueDate, priority };
    }


    private normalizeCaptureToken(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    private tryParseCaptureDate(token: string): string | null {
        const normalized = token.replace(/[_-]/g, ' ').trim();
        const naturalDate = parseNaturalDate(normalized);
        if (naturalDate) return naturalDate;
        const strictDate = moment(token, 'YYYY-MM-DD', true);
        return strictDate.isValid() ? strictDate.format('YYYY-MM-DD') : null;
    }

    private parseCapturePriority(token: string): ParsedInboxCapture['priority'] {
        const normalized = token.toLowerCase();
        if (['h', 'high', 'p1', '1'].includes(normalized)) return 'high';
        if (['m', 'med', 'medium', 'p2', '2'].includes(normalized)) return 'medium';
        if (['l', 'low', 'p3', '3'].includes(normalized)) return 'low';
        return null;
    }

    private async buildOptimisticTask(
        file: TFile,
        parsed: ParsedInboxCapture,
        status: TaskEntry['status'],
        focus: boolean,
    ): Promise<TaskEntry> {
        let taskId: string | undefined;
        try {
            const content = await this.app.vault.read(file);
            const match = content.match(/^\s*taskId:\s*("?)([^\r\n"]+)\1\s*$/m);
            taskId = match?.[2]?.trim() || undefined;
        } catch {
            // File exists but read may race briefly on sync backends.
        }

        const now = Date.now();
        const created = moment(now).format('YYYY-MM-DD HH:mm:ss');
        const day = moment(now).format('YYYY-MM-DD');
        const firstLine = parsed.text.split('\n').find((line) => line.trim()) || parsed.text;
        const bucketStatus: TaskBucketStatus = status === 'waiting' ? 'active' : 'backlog';
        const lifecycleStatus: TaskEntry['lifecycleStatus'] = bucketStatus === 'active' ? 'active' : 'planned';

        return {
            filePath: file.path,
            title: firstLine.replace(/[#*_`\[\]]/g, '').trim() || parsed.text,
            created,
            modified: created,
            day,
            status,
            due: parsed.dueDate || '',
            context: [...parsed.contexts],
            body: parsed.text,
            lastUpdate: now,
            children: [],
            priority: parsed.priority ?? undefined,
            bucketStatus,
            focus,
            lifecycleStatus,
            taskId,
        };
    }

    private resolveTaskKey(task: TaskEntry): string {
        return task.taskId?.trim() || task.filePath;
    }



    private isTodayOrOverdue(task: TaskEntry): boolean {
        if (!task.due) return false;
        const due = moment(task.due, 'YYYY-MM-DD', true);
        if (!due.isValid()) return false;
        return due.isSameOrBefore(moment().startOf('day'), 'day');
    }

    private getBucketStatus(task: TaskEntry): TaskBucketStatus {
        const legacyState = String(task.state || '').toLowerCase();
        if (task.bucketStatus) return task.bucketStatus;
        if (task.status === 'done' || legacyState === 'done' || task.lifecycleStatus === 'done') return 'done';
        if (task.status === 'waiting' || legacyState === 'active' || task.lifecycleStatus === 'active') return 'active';
        return 'backlog';
    }

    private getTaskIdentity(task: TaskEntry): string {
        return task.taskId?.trim() || task.id || task.filePath;
    }

    private formatRelativeDate(dateStr: string): string {
        const d = moment(dateStr, 'YYYY-MM-DD', true);
        if (!d.isValid()) return dateStr;
        const today = moment().startOf('day');
        if (d.isSame(today, 'day')) return 'Today';
        if (d.isSame(moment(today).add(1, 'day'), 'day')) return 'Tomorrow';
        if (d.isSame(moment(today).subtract(1, 'day'), 'day')) return 'Yesterday';
        return d.format('MMM D');
    }

    private getDateSeverityClass(dateStr: string): string {
        const d = moment(dateStr, 'YYYY-MM-DD', true);
        if (!d.isValid()) return '';
        const today = moment().startOf('day');
        if (d.isBefore(today)) return 'is-overdue';
        if (d.isSame(today, 'day')) return 'is-today';
        return '';
    }

    private getPriorityIcon(priority: string): string {
        const p = priority.toLowerCase();
        if (p === 'high') return 'signal-high';
        if (p === 'medium') return 'signal-medium';
        if (p === 'low') return 'signal-low';
        return 'signal-low';
    }

    private renderTableView(parent: HTMLElement): void {
        const container = parent.createEl('div', { cls: 'diwa-gawa-table-view diwa-gawa-list-container' });
        
        const header = container.createEl('div', { cls: 'diwa-gawa-list-header' });

        const renderSortHeader = (field: 'task' | 'priority' | 'due', label: string, cls: string) => {
            const span = header.createEl('span', { cls: `${cls} is-sortable` });
            span.setText(label);
            span.style.cursor = 'pointer';
            if (this._sortField === field) {
                span.createEl('span', { text: this._sortDirection === 'asc' ? ' ↑' : ' ↓', cls: 'diwa-gawa-sort-icon' });
            }
            span.addEventListener('click', () => {
                if (this._sortField === field) {
                    this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this._sortField = field;
                    this._sortDirection = 'asc';
                }
                if (this._rootEl) {
                    const oldTable = this._rootEl.querySelector('.diwa-gawa-table-view');
                    if (oldTable) oldTable.remove();
                    this.renderTableView(this._rootEl);
                }
            });
        };

        renderSortHeader('task', 'Task', 'col-main');
        renderSortHeader('priority', 'Priority', 'col-priority');
        renderSortHeader('due', 'Due', 'col-due');
        header.createEl('span', { text: '', cls: 'col-actions' });

        const listBody = container.createEl('div', { cls: 'diwa-gawa-list-body' });

        let tasks = Array.from(this.plugin.index.taskIndex.values());
        if (!this._showDoneInTable) {
            tasks = tasks.filter(t => t.status !== 'done');
        }
        
        tasks.sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            
            if (this._sortField === 'task') {
                const cmp = a.title.localeCompare(b.title);
                return this._sortDirection === 'asc' ? cmp : -cmp;
            }
            if (this._sortField === 'due') {
                const da = a.due || '';
                const db = b.due || '';
                const cmp = da.localeCompare(db);
                return this._sortDirection === 'asc' ? cmp : -cmp;
            }
            if (this._sortField === 'priority') {
                const weights: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
                const wa = a.priority ? weights[a.priority] || 0 : 0;
                const wb = b.priority ? weights[b.priority] || 0 : 0;
                const cmp = wb - wa; // asc -> High before Low
                return this._sortDirection === 'asc' ? cmp : -cmp;
            }

            return (b.modified || '').localeCompare(a.modified || '');
        });

        if (tasks.length === 0) {
            const emptyRow = listBody.createEl('div', { cls: 'diwa-gawa-table-empty' });
            emptyRow.setText('No tasks found. Create one to get started.');
            return;
        }

        for (const task of tasks) {
            const row = listBody.createEl('div', { cls: 'diwa-gawa-list-row' });
            if (task.status === 'done') row.addClass('is-done');
            
            const mainCol = row.createEl('div', { cls: 'col-main' });
            
            const statusIcon = mainCol.createEl('span', { cls: `diwa-status-icon is-${task.status}` });
            setIcon(statusIcon, task.status === 'done' ? 'check-circle' : 'circle');
            
            statusIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                void this._taskController.toggleTask(this.getTaskIdentity(task));
            });

            mainCol.createEl('span', { text: task.title, cls: 'diwa-title-text' });
            
            if (task.context && task.context.length > 0) {
                const tagsContainer = mainCol.createEl('div', { cls: 'diwa-tags-container' });
                task.context.forEach(tag => {
                    tagsContainer.createEl('span', { cls: 'diwa-tag', text: `#${tag}` });
                });
            }

            const priorityCol = row.createEl('div', { cls: 'col-priority' });
            if (task.priority) {
                const pBadge = priorityCol.createEl('div', { cls: `diwa-priority-badge is-${task.priority.toLowerCase()}` });
                setIcon(pBadge, this.getPriorityIcon(task.priority));
            }

            const dueCol = row.createEl('div', { cls: 'col-due' });
            if (task.due) {
                dueCol.setText(this.formatRelativeDate(task.due));
                const severity = this.getDateSeverityClass(task.due);
                if (severity) dueCol.addClass(severity);
            }

            const actionsCol = row.createEl('div', { cls: 'col-actions' });
            const editBtn = actionsCol.createEl('span', { cls: 'diwa-action-btn diwa-action-btn-ghost' });
            setIcon(editBtn, 'pencil');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                new EditTaskModal(
                    this.app,
                    task,
                    this.vault,
                    this.plugin.index,
                    () => {
                        this._taskController.syncFromIndex();
                        this.updateWorkspaceStats();
                    }
                ).open();
            });

            row.addEventListener('click', () => {
                new EditTaskModal(
                    this.app,
                    task,
                    this.vault,
                    this.plugin.index,
                    () => {
                        this._taskController.syncFromIndex();
                        this.updateWorkspaceStats();
                    }
                ).open();
            });
        }
    }
}

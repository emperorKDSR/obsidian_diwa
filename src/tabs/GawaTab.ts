import { Notice, Platform, TFile, moment, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { TaskBucketStatus, TaskEntry } from '../types';
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

type MobileTabId = 'inbox' | 'today' | 'focus' | 'projects';
const MOBILE_TAB_ORDER: MobileTabId[] = ['inbox', 'today', 'focus', 'projects'];
const MOBILE_TAB_META: Record<MobileTabId, { label: string; icon: string }> = {
    inbox: { label: 'Inbox', icon: 'inbox' },
    today: { label: 'Today', icon: 'sun-medium' },
    focus: { label: 'Focus', icon: 'target' },
    projects: { label: 'Projects', icon: 'folder-kanban' },
};
type GawaLayoutMode = 'desktop' | 'tablet' | 'phone';
type InboxCaptureTarget = 'backlog' | 'active' | 'focus';

interface ParsedInboxCapture {
    text: string;
    contexts: string[];
    dueDate: string | null;
    project: string | null;
    priority: 'high' | 'medium' | 'low' | null;
}

export class GawaTab extends BaseTab {
    private _container: HTMLElement | null = null;
    private _rootEl: HTMLElement | null = null;
    private _layoutMode: GawaLayoutMode | null = null;
    private readonly _taskController: TaskController;
    private readonly _paneHost: TaskPaneHost;
    private readonly _paneMap = new Map<string, TaskPane>();
    private readonly _mobilePaneShells = new Map<MobileTabId, HTMLElement>();
    private readonly _mobileTabButtons = new Map<MobileTabId, HTMLElement>();
    private _doneTodayStatEl: HTMLElement | null = null;
    private _focusStatEl: HTMLElement | null = null;
    private _overdueStatEl: HTMLElement | null = null;
    private _taskPending = 0;
    private _taskFilter: 'upcoming' | 'all' = 'all';
    private _taskIndexRecoveryInFlight = false;
    private readonly _collapsedProjectGroups = new Set<string>();

    constructor(view: DiwaView) {
        super(view);
        this._taskController = this.plugin.getTaskController();
        console.log('[DIWA] GAWA controller ref:', this._taskController);
        const self = this;
        this._paneHost = {
            app: this.app,
            plugin: this.plugin,
            get _taskPending(): number { return self._taskPending; },
            set _taskPending(value: number) { self._taskPending = value; },
            get _taskFilter(): 'upcoming' | 'all' { return self._taskFilter; },
            set _taskFilter(value: 'upcoming' | 'all') { self._taskFilter = value; },
        };
    }

    render(container: HTMLElement): void {
        const layoutMode = this.resolveLayoutMode();
        const canReuseLayout =
            this._container === container
            && this._rootEl !== null
            && this._layoutMode === layoutMode
            && container.contains(this._rootEl);

        const indexSize = this.plugin.index.taskIndex.size;
        console.log('[DIWA GAWA] render', { indexSize, layoutMode, canReuseLayout });

        this._container = container;
        if (canReuseLayout) {
            this._taskController.syncFromIndex();
            this.updateWorkspaceStats();
            return;
        }

        this.destroyPanes();
        if (this._rootEl && container.contains(this._rootEl)) {
            this._rootEl.remove();
        } else {
            for (const child of Array.from(container.children)) {
                child.remove();
            }
        }
        this._mobilePaneShells.clear();
        this._mobileTabButtons.clear();
        this._layoutMode = layoutMode;

        const root = container.createEl('div', { cls: 'diwa-gawa-desktop' });
        this._rootEl = root;
        const isPhone = layoutMode === 'phone';
        const isTabletLayout = layoutMode === 'tablet';
        if (isPhone) root.addClass('is-mobile');
        if (isTabletLayout) root.addClass('is-tablet');
        this.renderHeader(root);
        if (isPhone) {
            this.renderMobileLayout(root);
        } else if (isTabletLayout) {
            this.renderTabletLayout(root);
        } else {
            const grid = root.createEl('div', { cls: 'diwa-gawa-desktop-grid' });
            this.renderColumn(grid, 'left', [
                this.createInboxPaneConfig(),
                this.createProjectsPaneConfig(),
            ]);
            this.renderColumn(grid, 'center', [
                this.createTodayPaneConfig(),
                this.createFocusPaneConfig(),
            ]);
            this.renderColumn(grid, 'right', [
                this.createActivePaneConfig(),
                this.createBacklogPaneConfig(),
            ]);
        }

        this._taskController.syncFromIndex();
        this.updateWorkspaceStats();
        void this.ensureTaskIndexRecovered();
    }

    /** Incremental refresh — called when only task data changes (avoids full DOM rebuild). */
    onTasksRefresh(): void {
        if (this._paneMap.size === 0) {
            // Panes not yet mounted — fall back to full render is handled by caller
            console.log('[DIWA GAWA] onTasksRefresh skipped: no panes mounted');
            return;
        }
        const indexSize = this.plugin.index.taskIndex.size;
        console.log('[DIWA GAWA] onTasksRefresh', { indexSize, paneCount: this._paneMap.size });
        this._taskController.syncFromIndex();
        this.updateWorkspaceStats();
    }

    onunload(): void {
        this.destroyPanes();
        this._rootEl = null;
        this._layoutMode = null;
        this._container = null;
        this._mobilePaneShells.clear();
        this._mobileTabButtons.clear();
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
        if (this.isTabletLayout()) header.addClass('is-tablet-header');
        const identity = header.createEl('div', { cls: 'diwa-gawa-workspace-bar-left' });
        identity.createEl('span', { text: 'Task workspace', cls: 'diwa-gawa-workspace-eyebrow' });
        const titleGroup = identity.createEl('div', { cls: 'diwa-gawa-header-title-group diwa-gawa-workspace-identity' });
        titleGroup.createEl('h2', { text: 'Gawa', cls: 'diwa-gawa-header-title' });
        const subtitle = this.isPhoneLayout()
            ? 'Task flow'
            : this.isTabletLayout()
                ? 'Calm task cockpit'
                : 'Desktop task cockpit';
        titleGroup.createEl('span', { text: subtitle, cls: 'diwa-gawa-header-subtitle' });

        const progressStrip = header.createEl('div', {
            cls: 'diwa-gawa-progress-strip',
            attr: { 'aria-label': 'Workspace progress' },
        });
        this._doneTodayStatEl = this.createWorkspaceStat(progressStrip, 'done', 'Done today');
        this._focusStatEl = this.createWorkspaceStat(progressStrip, 'focus', 'Focus');
        this._overdueStatEl = this.createWorkspaceStat(progressStrip, 'overdue', 'Overdue');

        const actions = header.createEl('div', { cls: 'diwa-gawa-header-actions diwa-gawa-workspace-bar-right' });
        if (this.isPhoneLayout() || this.isTabletLayout()) {
            this.renderCaptureTrigger(actions);
        } else {
            this.renderFastCapture(actions);
        }

        if (!this.isPhoneLayout()) {
            const addBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn' });
            setIcon(addBtn, 'plus');
            addBtn.createEl('span', { text: 'Refine' });
            addBtn.addEventListener('click', () => this.openCreateTaskModal());
        }

        const refreshBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn' });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.createEl('span', { text: 'Sync' });
        refreshBtn.addEventListener('click', () => {
            this._taskController.syncFromIndex();
            this.updateWorkspaceStats();
        });

        this.updateWorkspaceStats();
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

    private renderFastCapture(parent: HTMLElement): void {
        const capture = parent.createEl('div', { cls: 'diwa-gawa-capture' });
        const icon = capture.createEl('span', { cls: 'diwa-gawa-capture-icon' });
        setIcon(icon, 'plus');
        const input = capture.createEl('input', {
            cls: 'diwa-gawa-capture-input',
            attr: {
                type: 'text',
                placeholder: 'Quick add to inbox…',
                'aria-label': 'Fast capture task',
            },
        }) as HTMLInputElement;

        const quickCreate = async () => {
            const title = input.value.trim();
            if (!title) return;
            input.disabled = true;
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
                input.value = '';
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed fast capture task', error);
            } finally {
                input.disabled = false;
                input.focus();
            }
        };

        input.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
                this.openCreateTaskModal(input.value.trim());
                return;
            }
            void quickCreate();
        });
    }

    private renderColumn(
        parent: HTMLElement,
        columnKind: 'left' | 'center' | 'right',
        configs: PaneConfig[],
    ): void {
        const column = parent.createEl('div', { cls: `diwa-gawa-column diwa-gawa-column--${columnKind}` });
        column.setAttr('data-gawa-column', columnKind);
        for (const config of configs) {
            this.createPaneShell(column, config);
        }
    }

    private renderMobileLayout(parent: HTMLElement): void {
        const mobile = parent.createEl('div', { cls: 'diwa-gawa-mobile' });
        const stage = mobile.createEl('div', { cls: 'diwa-gawa-mobile-stage' });
        const paneStack = stage.createEl('div', { cls: 'diwa-gawa-mobile-pane-stack' });
        const dock = mobile.createEl('div', { cls: 'diwa-gawa-mobile-dock' });
        const captureFab = dock.createEl('button', {
            cls: 'diwa-gawa-mobile-fab',
            attr: { type: 'button', 'aria-label': 'Capture a new task' },
        });
        const captureFabIcon = captureFab.createEl('span', { cls: 'diwa-gawa-mobile-fab-icon' });
        setIcon(captureFabIcon, 'plus');
        captureFab.createEl('span', { cls: 'diwa-gawa-mobile-fab-label', text: 'Capture' });
        captureFab.addEventListener('click', () => this.openCreateTaskModal());

        const tabBar = dock.createEl('div', {
            cls: 'diwa-gawa-mobile-tabbar',
            attr: { role: 'tablist', 'aria-label': 'GAWA sections' },
        });

        const paneByTab: Record<MobileTabId, PaneConfig> = {
            inbox: this.createInboxPaneConfig(),
            today: this.createTodayPaneConfig(),
            focus: this.createFocusPaneConfig(),
            projects: this.createProjectsPaneConfig(),
        };

        for (const tabId of MOBILE_TAB_ORDER) {
            const meta = MOBILE_TAB_META[tabId];
            const button = tabBar.createEl('button', {
                cls: 'diwa-gawa-mobile-tab-btn',
                attr: { role: 'tab', type: 'button', 'data-mobile-tab': tabId },
            });
            const icon = button.createEl('span', { cls: 'diwa-gawa-mobile-tab-icon' });
            setIcon(icon, meta.icon);
            button.createEl('span', { cls: 'diwa-gawa-mobile-tab-label', text: meta.label });
            button.addEventListener('click', () => this.setMobileTab(tabId));
            this._mobileTabButtons.set(tabId, button);

            const panelId = `diwa-gawa-mobile-panel-${tabId}`;
            button.setAttr('aria-controls', panelId);
            const shell = paneStack.createEl('section', {
                cls: 'diwa-gawa-mobile-pane-shell',
                attr: {
                    'data-mobile-tab': tabId,
                    id: panelId,
                    role: 'tabpanel',
                },
            });
            this._mobilePaneShells.set(tabId, shell);
            this.mountPane(shell, paneByTab[tabId]);
        }

        this.applyMobileTabVisibility();
    }

    private renderTabletLayout(parent: HTMLElement): void {
        const grid = parent.createEl('div', { cls: 'diwa-gawa-tablet-grid' });
        const planning = grid.createEl('div', { cls: 'diwa-gawa-column diwa-gawa-column--left diwa-gawa-tablet-planning' });
        this.createPaneShell(planning, this.createInboxPaneConfig());
        this.createPaneShell(planning, this.createProjectsPaneConfig());

        const execution = grid.createEl('div', { cls: 'diwa-gawa-column diwa-gawa-column--right diwa-gawa-tablet-execution' });
        this.createPaneShell(execution, this.createTodayPaneConfig());
        this.createPaneShell(execution, this.createFocusPaneConfig());

        const supportRow = execution.createEl('div', { cls: 'diwa-gawa-tablet-support-row' });
        this.createPaneShell(supportRow, this.createActivePaneConfig(), ['is-compact-pane']);
        this.createPaneShell(supportRow, this.createBacklogPaneConfig(), ['is-compact-pane']);
    }

    private createPaneShell(parent: HTMLElement, config: PaneConfig, extraClasses: string[] = []): HTMLElement {
        const shell = parent.createEl('section', {
            cls: `diwa-gawa-pane-shell diwa-gawa-pane-shell--${config.paneId}`,
        });
        shell.setAttr('data-gawa-pane', config.paneId);
        if (config.paneId === 'gawa-focus') shell.addClass('is-focus-pane');
        if (config.paneId === 'gawa-today' || config.paneId === 'gawa-focus') shell.addClass('is-primary-pane');
        extraClasses.forEach((className) => shell.addClass(className));
        this.mountPane(shell, config);
        return shell;
    }

    private mountPane(parent: HTMLElement, config: PaneConfig): void {
        const pane = new TaskPane(this._paneHost, parent, this._taskController, {
            paneId: config.paneId,
            title: config.title,
            eyebrow: config.eyebrow,
            emptyMessage: config.emptyMessage,
            showFilterPills: false,
            presetFilter: 'all',
            baseFilterFn: config.baseFilterFn,
            filterFn: config.filterFn,
            sortFn: config.sortFn,
            plugins: config.plugins,
            allowDragDrop: !this.isPhoneLayout(),
            canDropTask: config.canDropTask,
            groupController: config.groupController,
            bucketOnDrop: config.bucketOnDrop,
            focusOnDrop: config.focusOnDrop,
            showBucketActions: true,
            inlineContentRenderer: config.paneId === 'gawa-inbox'
                ? (container) => this.renderInboxInlineCapture(container)
                : undefined,
        });
        this._paneMap.set(config.paneId, pane);
        this._taskController.registerPane(pane);
    }

    private renderInboxInlineCapture(parent: HTMLElement): void {
        const capture = parent.createEl('div', { cls: 'diwa-gawa-inbox-capture' });
        const captureMain = capture.createEl('div', { cls: 'diwa-gawa-inbox-capture-main' });
        const input = captureMain.createEl('input', {
            cls: 'diwa-gawa-inbox-capture-input',
            attr: {
                type: 'text',
                placeholder: '+ Add task...',
                'aria-label': 'Add task to inbox',
            },
        }) as HTMLInputElement;

        const submit = async (target: InboxCaptureTarget): Promise<void> => {
            if (input.disabled) return;
            const parsed = this.parseInboxCaptureInput(input.value);
            if (!parsed.text) return;

            const status: TaskEntry['status'] = target === 'backlog' ? 'open' : 'waiting';
            const shouldFocus = target === 'focus';
            input.disabled = true;
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(700);
                const created = await this.vault.createTaskFile(
                    parsed.text,
                    parsed.contexts,
                    parsed.dueDate || undefined,
                    parsed.project || undefined,
                    {
                        priority: parsed.priority ?? undefined,
                        status,
                    }
                );
                const optimisticTask = await this.buildOptimisticTask(created, parsed, status, shouldFocus);
                this._taskController.addTask(optimisticTask);
                input.value = '';
                await this.plugin.refreshCoordinator.reindexFile(created);
                await this._taskController.reconcileTask(created.path, status, optimisticTask);
                if (shouldFocus) {
                    await this._taskController.moveTaskToBucket(created.path, 'active', { focus: true });
                }
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed inbox inline capture', error);
            } finally {
                input.disabled = false;
                input.focus();
            }
        };

        input.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                input.value = '';
                return;
            }
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
                void submit('focus');
                return;
            }
            if (event.shiftKey) {
                void submit('active');
                return;
            }
            void submit('backlog');
        });

        if (!this.isTabletLayout()) return;

        const actions = capture.createEl('div', { cls: 'diwa-gawa-inbox-capture-actions' });
        const targets: Array<{ id: InboxCaptureTarget; label: string }> = [
            { id: 'backlog', label: 'Backlog' },
            { id: 'active', label: 'Active' },
            { id: 'focus', label: 'Focus' },
        ];
        for (const target of targets) {
            const button = actions.createEl('button', {
                cls: 'diwa-gawa-inbox-capture-target',
                text: target.label,
                attr: { type: 'button' },
            });
            button.addEventListener('click', () => {
                void submit(target.id);
            });
        }
    }

    private destroyPanes(): void {
        for (const [paneId, pane] of this._paneMap.entries()) {
            this._taskController.unregisterPane(paneId, pane);
            pane.destroy();
        }
        this._paneMap.clear();
    }

    private getMobileTab(): MobileTabId {
        const current = this.view.tasksViewMode;
        if (MOBILE_TAB_ORDER.includes(current as MobileTabId)) return current as MobileTabId;
        return 'today';
    }

    private setMobileTab(tabId: MobileTabId): void {
        if (this.getMobileTab() === tabId) return;
        this.view.tasksViewMode = tabId;
        this.applyMobileTabVisibility();
    }

    private applyMobileTabVisibility(): void {
        const active = this.getMobileTab();
        for (const [tabId, shell] of this._mobilePaneShells.entries()) {
            const isActive = tabId === active;
            shell.toggleClass('is-active', isActive);
            shell.toggleClass('is-inactive', !isActive);
            shell.setAttr('aria-hidden', isActive ? 'false' : 'true');
            (shell as HTMLElement & { inert?: boolean }).inert = !isActive;
        }
        for (const [tabId, button] of this._mobileTabButtons.entries()) {
            const isActive = tabId === active;
            button.toggleClass('is-active', isActive);
            button.setAttr('aria-selected', isActive ? 'true' : 'false');
            button.setAttr('tabindex', isActive ? '0' : '-1');
        }
    }

    private isPhoneLayout(): boolean {
        return Platform.isMobile && !isTablet();
    }

    private isTabletLayout(): boolean {
        return isTablet();
    }

    private resolveLayoutMode(): GawaLayoutMode {
        if (this.isPhoneLayout()) return 'phone';
        if (this.isTabletLayout()) return 'tablet';
        return 'desktop';
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
                payload.project || undefined,
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

        const projectLookup = this.buildProjectLookup();
        const contexts: string[] = [];
        let project: string | null = null;
        for (const tag of tags) {
            const resolvedProject = projectLookup.get(this.normalizeCaptureToken(tag));
            if (!project && resolvedProject) {
                project = resolvedProject;
                continue;
            }
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

        return { text, contexts, dueDate, project, priority };
    }

    private buildProjectLookup(): Map<string, string> {
        const projectLookup = new Map<string, string>();
        for (const project of this.plugin.index.projectIndex.values()) {
            if (project.status === 'archived') continue;
            projectLookup.set(this.normalizeCaptureToken(project.name), project.name);
            projectLookup.set(this.normalizeCaptureToken(project.id), project.name);
        }
        return projectLookup;
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
            project: parsed.project || undefined,
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

    private normalizeProjectGroupKey(value: string | null | undefined): string | null {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private isProjectGroupCollapsed(groupKey: string): boolean {
        return this._collapsedProjectGroups.has(groupKey);
    }

    private setProjectGroupCollapsed(groupKey: string, collapsed: boolean): void {
        if (!groupKey) return;
        if (collapsed) {
            this._collapsedProjectGroups.add(groupKey);
            return;
        }
        this._collapsedProjectGroups.delete(groupKey);
    }

    private getProjectsGroupController(): TaskPaneGroupController {
        return {
            getLabel: (groupKey) => groupKey,
            isCollapsed: (groupKey) => this.isProjectGroupCollapsed(groupKey),
            setCollapsed: (groupKey, collapsed) => this.setProjectGroupCollapsed(groupKey, collapsed),
        };
    }

    private compareProjectTasks(a: TaskEntry, b: TaskEntry): number {
        const aProject = this.normalizeProjectGroupKey(a.project) || '';
        const bProject = this.normalizeProjectGroupKey(b.project) || '';
        const projectCompare = aProject.localeCompare(bProject, undefined, { sensitivity: 'base' });
        if (projectCompare !== 0) return projectCompare;
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return (b.lastUpdate || 0) - (a.lastUpdate || 0);
    }

    private createInboxPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-inbox',
            title: 'Inbox',
            eyebrow: 'Capture lane',
            emptyMessage: 'Inbox is clear. New quick captures land here first.',
            bucketOnDrop: 'backlog',
            focusOnDrop: false,
            canDropTask: (task) => !task.project && !task.due,
            baseFilterFn: (task) => this.getBucketStatus(task) === 'backlog',
            filterFn: (task) => !task.project && !task.due,
        };
    }

    private createProjectsPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-projects',
            title: 'Projects',
            eyebrow: 'Planning lane',
            emptyMessage: 'No project-linked work yet.',
            bucketOnDrop: 'backlog',
            focusOnDrop: false,
            sortFn: (a, b) => this.compareProjectTasks(a, b),
            plugins: [{
                id: 'gawa-project-grouping',
                groupBy: (task) => this.normalizeProjectGroupKey(task.project),
            }],
            canDropTask: (task) => !!this.normalizeProjectGroupKey(task.project),
            groupController: this.getProjectsGroupController(),
            baseFilterFn: (task) => this.getBucketStatus(task) === 'backlog',
            filterFn: (task) => !!task.project,
        };
    }

    private createTodayPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-today',
            title: 'Today',
            eyebrow: 'Execution lane',
            emptyMessage: 'Nothing is demanding attention today.',
            bucketOnDrop: 'active',
            focusOnDrop: false,
            canDropTask: (task) => this.isTodayOrOverdue(task),
            baseFilterFn: (task) => this.getBucketStatus(task) !== 'done',
            filterFn: (task) => this.isTodayOrOverdue(task),
            sortFn: (a, b) => {
                if (a.due && b.due) return a.due.localeCompare(b.due);
                if (a.due && !b.due) return -1;
                if (!a.due && b.due) return 1;
                return (b.lastUpdate || 0) - (a.lastUpdate || 0);
            },
        };
    }

    private createBacklogPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-backlog',
            title: 'Backlog',
            eyebrow: 'Queue',
            emptyMessage: 'Backlog is empty. Future work will queue here.',
            bucketOnDrop: 'backlog',
            focusOnDrop: false,
            canDropTask: (task) => !this.isTodayOrOverdue(task),
            baseFilterFn: (task) => this.getBucketStatus(task) === 'backlog',
            filterFn: (task) => !this.isTodayOrOverdue(task),
        };
    }

    private createFocusPaneConfig(): PaneConfig {
        let focusIndex = new Map<string, number>();
        let focusSignature = '';
        const resolveFocusIndex = (): Map<string, number> => {
            const focusTasks = this.plugin.getTodayFocusTasks();
            const signature = focusTasks
                .map((task) => this.getTaskIdentity(task))
                .join('|');
            if (signature === focusSignature) return focusIndex;

            focusSignature = signature;
            focusIndex = new Map<string, number>();
            focusTasks.forEach((task, idx) => {
                focusIndex.set(this.getTaskIdentity(task), idx);
            });
            return focusIndex;
        };

        return {
            paneId: 'gawa-focus',
            title: 'Focus',
            eyebrow: 'Spotlight',
            emptyMessage: 'No focus candidates right now.',
            bucketOnDrop: 'active',
            focusOnDrop: true,
            canDropTask: (task) => this.getBucketStatus(task) !== 'done',
            baseFilterFn: (task) => this.getBucketStatus(task) !== 'done',
            filterFn: (task) => resolveFocusIndex().has(this.getTaskIdentity(task)),
            sortFn: (a, b) => {
                const index = resolveFocusIndex();
                return (index.get(this.getTaskIdentity(a)) ?? Number.MAX_SAFE_INTEGER)
                    - (index.get(this.getTaskIdentity(b)) ?? Number.MAX_SAFE_INTEGER);
            },
        };
    }

    private createActivePaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-active',
            title: 'Active',
            eyebrow: 'Momentum',
            emptyMessage: 'No active tasks in motion.',
            bucketOnDrop: 'active',
            focusOnDrop: false,
            canDropTask: (task) => this.getBucketStatus(task) !== 'done',
            baseFilterFn: (task) => this.getBucketStatus(task) === 'active',
            filterFn: () => true,
            sortFn: (a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0),
        };
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
}

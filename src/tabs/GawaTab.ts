import { Notice, Platform, TFile, moment, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { EditEntryModal } from '../modals/EditEntryModal';
import type { TaskEntry } from '../types';
import { isTablet, parseContextString } from '../utils';
import { TaskController } from '../views/TaskController';
import { TaskPane, type TaskPaneHost, type TaskFilterFn, type TaskSortFn } from '../views/DesktopTaskPane';

interface PaneConfig {
    paneId: string;
    title: string;
    emptyMessage: string;
    baseFilterFn: TaskFilterFn;
    filterFn: TaskFilterFn;
    sortFn?: TaskSortFn;
}

type MobileTabId = 'inbox' | 'today' | 'focus' | 'projects';
const MOBILE_TAB_ORDER: MobileTabId[] = ['inbox', 'today', 'focus', 'projects'];
type GawaLayoutMode = 'desktop' | 'tablet' | 'phone';

export class GawaTab extends BaseTab {
    private _container: HTMLElement | null = null;
    private _rootEl: HTMLElement | null = null;
    private _layoutMode: GawaLayoutMode | null = null;
    private readonly _taskController: TaskController;
    private readonly _paneHost: TaskPaneHost;
    private readonly _paneMap = new Map<string, TaskPane>();
    private readonly _mobilePaneShells = new Map<MobileTabId, HTMLElement>();
    private readonly _mobileTabButtons = new Map<MobileTabId, HTMLElement>();
    private _taskPending = 0;
    private _taskFilter: 'upcoming' | 'all' = 'all';

    constructor(view: DiwaView) {
        super(view);
        this._taskController = new TaskController(this.plugin);
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

        this._container = container;
        if (canReuseLayout) {
            this._taskController.syncFromIndex();
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
                this.createBacklogPaneConfig(),
            ]);
            this.renderColumn(grid, 'right', [
                this.createFocusPaneConfig(),
                this.createActivePaneConfig(),
            ]);
        }

        this._taskController.syncFromIndex();
    }

    onunload(): void {
        this.destroyPanes();
        this._rootEl = null;
        this._layoutMode = null;
        this._container = null;
        this._mobilePaneShells.clear();
        this._mobileTabButtons.clear();
    }

    private renderHeader(parent: HTMLElement): void {
        const header = parent.createEl('div', { cls: 'diwa-gawa-header' });
        const titleGroup = header.createEl('div', { cls: 'diwa-gawa-header-title-group' });
        titleGroup.createEl('h2', { text: 'GAWA', cls: 'diwa-gawa-header-title' });
        const subtitle = this.isPhoneLayout()
            ? 'Mobile Task Workspace'
            : this.isTabletLayout()
                ? 'Tablet Task Workspace'
                : 'Desktop Task Workspace';
        titleGroup.createEl('span', { text: subtitle, cls: 'diwa-gawa-header-subtitle' });

        const actions = header.createEl('div', { cls: 'diwa-gawa-header-actions' });

        const addBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn diwa-gawa-header-btn--primary' });
        setIcon(addBtn, 'plus');
        addBtn.createEl('span', { text: 'New Task' });
        addBtn.addEventListener('click', () => this.openCreateTaskModal());

        const refreshBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn' });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.createEl('span', { text: 'Sync' });
        refreshBtn.addEventListener('click', () => this._taskController.syncFromIndex());
    }

    private renderColumn(
        parent: HTMLElement,
        columnKind: 'left' | 'center' | 'right',
        configs: PaneConfig[],
    ): void {
        const column = parent.createEl('div', { cls: `diwa-gawa-column diwa-gawa-column--${columnKind}` });
        for (const config of configs) {
            const shell = column.createEl('section', { cls: 'diwa-gawa-pane-shell' });
            this.mountPane(shell, config);
        }
    }

    private renderMobileLayout(parent: HTMLElement): void {
        const mobile = parent.createEl('div', { cls: 'diwa-gawa-mobile' });

        const tabBar = mobile.createEl('div', {
            cls: 'diwa-gawa-mobile-tabbar',
            attr: { role: 'tablist', 'aria-label': 'GAWA sections' },
        });
        const paneStack = mobile.createEl('div', { cls: 'diwa-gawa-mobile-pane-stack' });

        const paneByTab: Record<MobileTabId, PaneConfig> = {
            inbox: this.createInboxPaneConfig(),
            today: this.createTodayPaneConfig(),
            focus: this.createFocusPaneConfig(),
            projects: this.createProjectsPaneConfig(),
        };

        for (const tabId of MOBILE_TAB_ORDER) {
            const label = tabId.toUpperCase();
            const button = tabBar.createEl('button', {
                cls: 'diwa-gawa-mobile-tab-btn',
                text: label,
                attr: { role: 'tab', type: 'button' },
            });
            button.addEventListener('click', () => this.setMobileTab(tabId));
            this._mobileTabButtons.set(tabId, button);

            const shell = paneStack.createEl('section', {
                cls: 'diwa-gawa-mobile-pane-shell',
                attr: { 'data-mobile-tab': tabId },
            });
            this._mobilePaneShells.set(tabId, shell);
            this.mountPane(shell, paneByTab[tabId]);
        }

        this.applyMobileTabVisibility();
    }

    private renderTabletLayout(parent: HTMLElement): void {
        const grid = parent.createEl('div', { cls: 'diwa-gawa-tablet-grid' });
        this.renderColumn(grid, 'left', [
            this.createInboxPaneConfig(),
            this.createProjectsPaneConfig(),
        ]);
        this.renderColumn(grid, 'right', [
            this.createTodayPaneConfig(),
            this.createFocusPaneConfig(),
        ]);
    }

    private mountPane(parent: HTMLElement, config: PaneConfig): void {
        const pane = new TaskPane(this._paneHost, parent, this._taskController, {
            paneId: config.paneId,
            title: config.title,
            emptyMessage: config.emptyMessage,
            showFilterPills: false,
            presetFilter: 'all',
            baseFilterFn: config.baseFilterFn,
            filterFn: config.filterFn,
            sortFn: config.sortFn,
        });
        this._paneMap.set(config.paneId, pane);
        this._taskController.registerPane(pane);
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
            shell.style.display = isActive ? '' : 'none';
        }
        for (const [tabId, button] of this._mobileTabButtons.entries()) {
            const isActive = tabId === active;
            button.toggleClass('is-active', isActive);
            button.setAttr('aria-selected', isActive ? 'true' : 'false');
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

    private openCreateTaskModal(): void {
        new EditEntryModal(
            this.app,
            this.plugin,
            '',
            '',
            moment().format('YYYY-MM-DD'),
            true,
            async (text, contexts, dueDate, _project, recurrence, priority, energy, status) => {
                const title = text.trim();
                if (!title) return;
                try {
                    this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                    const created = await this.vault.createTaskFile(
                        title,
                        parseContextString(contexts),
                        dueDate || undefined,
                        undefined,
                        {
                            recurrence: recurrence ?? undefined,
                            priority: priority ?? undefined,
                            energy: energy ?? undefined,
                            status: status !== 'open' ? status : undefined,
                        }
                    );
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
                    new Notice('Task added', 1000);
                } catch (error) {
                    console.error('[DIWA GAWA] Failed to create task', error);
                    new Notice('Error creating task', 2000);
                }
            },
            'New Task'
        ).open();
    }

    private createInboxPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-inbox',
            title: 'INBOX',
            emptyMessage: 'Inbox is clear.',
            baseFilterFn: (task) => task.status !== 'done',
            filterFn: (task) => !task.project && !task.due,
        };
    }

    private createProjectsPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-projects',
            title: 'PROJECTS',
            emptyMessage: 'No project tasks.',
            baseFilterFn: (task) => task.status !== 'done',
            filterFn: (task) => !!task.project,
        };
    }

    private createTodayPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-today',
            title: 'TODAY',
            emptyMessage: 'Nothing due today.',
            baseFilterFn: (task) => task.status !== 'done',
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
            title: 'BACKLOG',
            emptyMessage: 'Backlog is empty.',
            baseFilterFn: (task) => task.status === 'open' || task.status === 'waiting' || task.status === 'someday',
            filterFn: (task) => !this.isTodayOrOverdue(task),
        };
    }

    private createFocusPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-focus',
            title: 'FOCUS',
            emptyMessage: 'No focus candidates.',
            baseFilterFn: (task) => task.status !== 'done',
            filterFn: (task) => {
                const priority = this.getPriorityScore(task.priority);
                return task.status === 'waiting' || this.isTodayOrOverdue(task) || priority >= 3;
            },
            sortFn: (a, b) => {
                const aPriority = this.getPriorityScore(a.priority);
                const bPriority = this.getPriorityScore(b.priority);
                if (aPriority !== bPriority) return bPriority - aPriority;
                if (a.due && b.due) return a.due.localeCompare(b.due);
                if (a.due && !b.due) return -1;
                if (!a.due && b.due) return 1;
                return (b.lastUpdate || 0) - (a.lastUpdate || 0);
            },
        };
    }

    private createActivePaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-active',
            title: 'ACTIVE',
            emptyMessage: 'No active tasks.',
            baseFilterFn: (task) => task.status === 'waiting',
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

    private getPriorityScore(priority: TaskEntry['priority']): number {
        if (priority === 'high') return 3;
        if (priority === 'medium') return 2;
        if (priority === 'low') return 1;
        return 0;
    }
}

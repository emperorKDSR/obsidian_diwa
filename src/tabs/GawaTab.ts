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
    private readonly _paneHost: TaskPaneHost;
    private readonly _paneMap = new Map<string, TaskPane>();
    private readonly _mobilePaneShells = new Map<MobileTabId, HTMLElement>();
    private readonly _mobileTabButtons = new Map<MobileTabId, HTMLElement>();
    private _doneTodayStatEl: HTMLElement | null = null;
    private _focusStatEl: HTMLElement | null = null;
    private _overdueStatEl: HTMLElement | null = null;
    private _viewMode: 'grid' | 'table' = 'table';
    private _showDoneInTable = false;
    private _captureEditors: EditorView[] = [];
    private _taskPending = 0;
    private _taskFilter: 'upcoming' | 'all' = 'all';
    private _taskIndexRecoveryInFlight = false;

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
            get _taskTogglePending(): number { return self.view._taskTogglePending; },
            set _taskTogglePending(value: number) { self.view._taskTogglePending = value; },
            get _taskFilter(): 'upcoming' | 'all' { return self._taskFilter; },
            set _taskFilter(value: 'upcoming' | 'all') { self._taskFilter = value; },
        };
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
        this._layoutSignature = layoutSignature;
        const paneConfigs = this.buildPaneConfigMap();

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
            this.renderTabletLayout(root, paneConfigs);
        } else {
            this.renderDesktopLayout(root, paneConfigs);
        }

        this._taskController.syncFromIndex();
        this.updateWorkspaceStats();
        void this.ensureTaskIndexRecovered();
    }

    /** Incremental refresh — called when only task data changes (avoids full DOM rebuild). */
    onTasksRefresh(): void {
        if (this._viewMode === 'table') {
            this.updateWorkspaceStats();
            if (this._rootEl) {
                const oldTable = this._rootEl.querySelector('.diwa-gawa-table-view');
                if (oldTable) {
                    oldTable.remove();
                    this.renderTableView(this._rootEl);
                }
            }
            return;
        }

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
        this._layoutSignature = null;
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
            const customizeBtn = actions.createEl('button', {
                cls: 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost diwa-gawa-customize-btn',
                attr: { type: 'button' },
            });
            setIcon(customizeBtn, 'sliders-horizontal');
            customizeBtn.createEl('span', { text: 'Customize' });
            customizeBtn.addEventListener('click', () => this.openLayoutCustomizeModal());

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
        const doneToggleBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn' });
        setIcon(doneToggleBtn, this._showDoneInTable ? 'check-square' : 'square');
        doneToggleBtn.createEl('span', { text: this._showDoneInTable ? 'Hide Done' : 'Show Done' });
        doneToggleBtn.addEventListener('click', () => {
            this._showDoneInTable = !this._showDoneInTable;
            if (this._container) {
                this.render(this._container);
            }
        });

        const viewToggleBtn = actions.createEl('button', { cls: 'diwa-gawa-header-btn diwa-gawa-view-toggle-btn' });
        setIcon(viewToggleBtn, this._viewMode === 'grid' ? 'table' : 'layout-grid');
        viewToggleBtn.createEl('span', { text: this._viewMode === 'grid' ? 'Table View' : 'Grid View' });
        viewToggleBtn.addEventListener('click', () => {
            this._viewMode = this._viewMode === 'grid' ? 'table' : 'grid';
            if (this._container) {
                this.render(this._container);
            }
        });

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

    private renderDesktopLayout(parent: HTMLElement, paneConfigs: Record<GawaPaneId, PaneConfig>): void {
        const grid = parent.createEl('div', { cls: 'diwa-gawa-desktop-grid' });
        const desktopLayout = this.plugin.settings.gawaLayoutPreferences.desktop;
        const columns: Array<{ kind: GawaDesktopBucketId; configs: PaneConfig[] }> = [
            { kind: 'left', configs: this.resolveVisiblePaneConfigs(paneConfigs, desktopLayout.left) },
            { kind: 'center', configs: this.resolveVisiblePaneConfigs(paneConfigs, desktopLayout.center) },
            { kind: 'right', configs: this.resolveVisiblePaneConfigs(paneConfigs, desktopLayout.right) },
        ];
        const visibleColumns = columns.filter((column) => column.configs.length > 0);
        if (visibleColumns.length === 0) {
            this.renderHiddenLayoutEmptyState(grid);
            return;
        }
        for (const column of visibleColumns) {
            this.renderColumn(grid, column.kind, column.configs);
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

    private renderTabletLayout(parent: HTMLElement, paneConfigs: Record<GawaPaneId, PaneConfig>): void {
        const grid = parent.createEl('div', { cls: 'diwa-gawa-tablet-grid' });
        const tabletLayout = this.plugin.settings.gawaLayoutPreferences.tablet;
        const planningConfigs = this.resolveVisiblePaneConfigs(paneConfigs, tabletLayout.planning);
        const executionConfigs = this.resolveVisiblePaneConfigs(paneConfigs, tabletLayout.execution);
        const supportConfigs = this.resolveVisiblePaneConfigs(paneConfigs, tabletLayout.support);

        if (planningConfigs.length === 0 && executionConfigs.length === 0 && supportConfigs.length === 0) {
            this.renderHiddenLayoutEmptyState(grid);
            return;
        }

        if (planningConfigs.length > 0) {
            const planning = grid.createEl('div', { cls: 'diwa-gawa-column diwa-gawa-column--left diwa-gawa-tablet-planning' });
            for (const config of planningConfigs) {
                this.createPaneShell(planning, config);
            }
        }

        if (executionConfigs.length > 0 || supportConfigs.length > 0) {
            const execution = grid.createEl('div', { cls: 'diwa-gawa-column diwa-gawa-column--right diwa-gawa-tablet-execution' });
            for (const config of executionConfigs) {
                this.createPaneShell(execution, config);
            }
            if (supportConfigs.length > 0) {
                const supportRow = execution.createEl('div', { cls: 'diwa-gawa-tablet-support-row' });
                for (const config of supportConfigs) {
                    this.createPaneShell(supportRow, config, ['is-compact-pane']);
                }
            }
        }
    }

    private renderHiddenLayoutEmptyState(parent: HTMLElement): void {
        const emptyState = parent.createEl('div', { cls: 'diwa-gawa-layout-empty' });
        emptyState.createEl('span', { cls: 'diwa-gawa-layout-empty-eyebrow', text: 'All panes hidden' });
        emptyState.createEl('h3', { cls: 'diwa-gawa-layout-empty-title', text: 'Nothing is mounted in Gawa right now.' });
        emptyState.createEl('p', {
            cls: 'diwa-gawa-layout-empty-copy',
            text: 'Open Customize and turn at least one pane back on for this layout.',
        });
        const manageBtn = emptyState.createEl('button', {
            cls: 'diwa-gawa-header-btn diwa-gawa-header-btn--primary',
            text: 'Customize panes',
            attr: { type: 'button' },
        });
        manageBtn.addEventListener('click', () => this.openLayoutCustomizeModal());
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
        
        let currentTarget: InboxCaptureTarget = 'backlog';
        let editorView: EditorView | null = null;

        const submit = async (text: string, view: EditorView, container: HTMLElement): Promise<void> => {
            const parsed = this.parseInboxCaptureInput(text);
            if (!parsed.text) return;

            const target = currentTarget;
            const status: TaskEntry['status'] = target === 'backlog' ? 'open' : 'waiting';
            const shouldFocus = target === 'focus';
            container.style.opacity = '0.5';
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(700);
                const created = await this.vault.createTaskFile(
                    parsed.text,
                    parsed.contexts,
                    parsed.dueDate || undefined,
                    {
                        priority: parsed.priority ?? undefined,
                        status,
                    }
                );
                const optimisticTask = await this.buildOptimisticTask(created, parsed, status, shouldFocus);
                this._taskController.addTask(optimisticTask);
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
                await this.plugin.refreshCoordinator.reindexFile(created);
                await this._taskController.reconcileTask(created.path, status, optimisticTask);
                if (shouldFocus) {
                    await this._taskController.moveTaskToBucket(created.path, 'active', { focus: true });
                }
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed inbox inline capture', error);
            } finally {
                container.style.opacity = '1';
                view.focus();
                currentTarget = 'backlog'; // reset
            }
        };

        editorView = this.createEditorCapture(captureMain, '+ Add task...', submit, (text) => {
            currentTarget = 'focus';
            if (editorView) void submit(text, editorView, captureMain);
        }, async (text, view, container) => {
            currentTarget = 'active';
            void submit(text, view, container);
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
                currentTarget = target.id;
                if (editorView) {
                    const text = editorView.state.doc.toString().trim();
                    if (text) void submit(text, editorView, captureMain);
                }
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

    private getLayoutSignature(layoutMode: GawaLayoutMode): string {
        if (layoutMode === 'phone') return 'phone';
        return `${layoutMode}:${JSON.stringify(
            layoutMode === 'tablet'
                ? this.plugin.settings.gawaLayoutPreferences.tablet
                : this.plugin.settings.gawaLayoutPreferences.desktop,
        )}`;
    }

    private buildPaneConfigMap(): Record<GawaPaneId, PaneConfig> {
        return {
            'gawa-inbox': this.createInboxPaneConfig(),
            'gawa-today': this.createTodayPaneConfig(),
            'gawa-focus': this.createFocusPaneConfig(),
            'gawa-active': this.createActivePaneConfig(),
            'gawa-backlog': this.createBacklogPaneConfig(),
        };
    }

    private resolveVisiblePaneConfigs(
        paneConfigs: Record<GawaPaneId, PaneConfig>,
        preference: GawaLayoutBucketPreference,
    ): PaneConfig[] {
        const hidden = new Set(preference.hidden);
        return preference.order
            .filter((paneId) => !hidden.has(paneId))
            .map((paneId) => paneConfigs[paneId]);
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

    private createInboxPaneConfig(): PaneConfig {
        return {
            paneId: 'gawa-inbox',
            title: 'Inbox',
            eyebrow: 'Capture lane',
            emptyMessage: 'Inbox is clear. New quick captures land here first.',
            bucketOnDrop: 'backlog',
            focusOnDrop: false,
            canDropTask: (task) => !task.due,
            baseFilterFn: (task) => this.getBucketStatus(task) === 'backlog',
            filterFn: (task) => !task.due,
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

    private renderTableView(parent: HTMLElement): void {
        const tableContainer = parent.createEl('div', { cls: 'diwa-gawa-table-view' });
        
        const table = tableContainer.createEl('table', { cls: 'diwa-gawa-modern-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Status' });
        headerRow.createEl('th', { text: 'Title' });
        headerRow.createEl('th', { text: 'Priority' });
        headerRow.createEl('th', { text: 'Due Date' });

        const tbody = table.createEl('tbody');
        
        let tasks = Array.from(this.plugin.index.taskIndex.values());
        if (!this._showDoneInTable) {
            tasks = tasks.filter(t => t.status !== 'done');
        }
        
        tasks.sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return (b.modified || '').localeCompare(a.modified || '');
        });

        if (tasks.length === 0) {
            const emptyRow = tbody.createEl('tr');
            emptyRow.createEl('td', {
                attr: { colspan: '4' },
                cls: 'diwa-gawa-table-empty',
                text: 'No tasks found. Create one to get started.'
            });
            return;
        }

        for (const task of tasks) {
            const tr = tbody.createEl('tr');
            
            const statusCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-status' });
            const statusIcon = statusCell.createEl('span', { cls: `diwa-task-status-icon is-${task.status}` });
            setIcon(statusIcon, task.status === 'done' ? 'check-circle' : 'circle');
            
            statusCell.addEventListener('click', (e) => {
                e.stopPropagation();
                void this._taskController.toggleTask(this.getTaskIdentity(task));
            });

            const titleCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-title' });
            titleCell.createEl('span', { text: task.title, cls: 'diwa-gawa-table-title-text' });
            if (task.context && task.context.length > 0) {
                const tagsSpan = titleCell.createEl('span', { cls: 'diwa-gawa-table-tags' });
                task.context.forEach((tag: string) => {
                    tagsSpan.createEl('span', { cls: 'diwa-gawa-table-tag', text: `#${tag}` });
                });
            }

            const priorityCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-priority' });
            if (task.priority) {
                const pSpan = priorityCell.createEl('span', { cls: `diwa-priority-badge is-${task.priority}` });
                pSpan.setText(task.priority.toUpperCase());
            } else {
                priorityCell.setText('-');
                priorityCell.addClass('is-empty');
            }

            const dueCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-due' });
            if (task.due) {
                dueCell.setText(task.due);
            } else {
                dueCell.setText('-');
                dueCell.addClass('is-empty');
            }
            
            tr.addEventListener('click', () => {
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

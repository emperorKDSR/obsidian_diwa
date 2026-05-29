import { App, Modal, Notice, TFile, moment, setIcon } from 'obsidian';
import type {
    BulsaLeafState,
    Milestone,
    ProjectEntry,
    ResponsiveProjectFilter,
    ResponsiveShellState,
    ResponsiveWorkspaceView,
    TaskEntry,
    ThoughtEntry,
} from '../types';
import type DiwaPlugin from '../main';
import { getWorkspaceViewportSize, isTaskDone, isTablet } from '../utils';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';
import { EditTaskModal } from '../modals/EditTaskModal';
import { NewDueModal } from '../modals/NewDueModal';
import { PaymentModal } from '../modals/PaymentModal';
import { renderResponsiveBulsa } from './BulsaResponsiveRenderer';

export type ShellPlatform = 'mobile' | 'tablet' | 'desktop';

interface ShellNavItem {
    id: ResponsiveWorkspaceView;
    label: string;
    icon: string;
    shortLabel?: string;
    ariaLabel?: string;
}

const SHELL_ITEMS: ShellNavItem[] = [
    { id: 'home', label: 'Home', icon: 'house' },
    { id: 'projects', label: 'Projects', shortLabel: 'Proj', ariaLabel: 'Projects', icon: 'folder-kanban' },
    { id: 'bulsa', label: 'Bulsa', icon: 'wallet' },
    { id: 'tasks', label: 'Gawa', icon: 'check-square-2' },
    { id: 'thoughts', label: 'Diwa', icon: 'pen-square' },
];

const PROJECT_FILTERS: { id: ResponsiveProjectFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'on-hold', label: 'On Hold' },
    { id: 'completed', label: 'Completed' },
];
const DEFAULT_BULSA_STATE: Required<BulsaLeafState> = {
    mode: 'ledger',
    showAllDues: false,
};

const PROJECT_STATUS_LABELS: Record<ProjectEntry['status'], string> = {
    active: 'Active',
    'on-hold': 'On Hold',
    completed: 'Completed',
    archived: 'Archived',
};

interface ProjectMetrics {
    tasks: TaskEntry[];
    openTasks: TaskEntry[];
    openCount: number;
    doneCount: number;
    nextTask?: TaskEntry;
}

interface TaskCache {
    all: TaskEntry[];
    open: TaskEntry[];
    focus: TaskEntry[];
    byProjectKey: Map<string, TaskEntry[]>;
}

interface ThoughtCache {
    all: ThoughtEntry[];
    recentTwo: ThoughtEntry[];
    recentThree: ThoughtEntry[];
    filtered: Map<string, ThoughtEntry[]>;
}

interface ProjectSummary {
    activeCount: number;
    completedCount: number;
    openTaskCount: number;
    dueSoonCount: number;
}

interface MilestoneTaskStats {
    total: number;
    open: number;
}

interface ProjectCache {
    collection: ProjectEntry[];
    byId: Map<string, ProjectEntry>;
    filtered: Map<ResponsiveProjectFilter, ProjectEntry[]>;
    metrics: Map<string, ProjectMetrics>;
    tasks: Map<string, TaskEntry[]>;
    summary?: ProjectSummary;
}

type ShellRefreshScope = 'all' | 'tasks' | 'thoughts' | 'projects';
export interface DiwaMobileShellState extends ResponsiveShellState {}

const PROJECT_STATUS_ORDER: ProjectEntry['status'][] = ['active', 'on-hold', 'completed', 'archived'];
const PROJECT_STATUS_FILTERS = PROJECT_FILTERS.filter((filter) => filter.id !== 'all');

function isResponsiveWorkspaceView(value: string | null | undefined): value is ResponsiveWorkspaceView {
    return SHELL_ITEMS.some((item) => item.id === value);
}

interface DiwaMobileShellOptions {
    platform?: Exclude<ShellPlatform, 'desktop'>;
    incrementTaskTogglePending?: () => void;
    decrementTaskTogglePending?: () => void;
}

export function getPlatform(app: App): ShellPlatform {
    const isMobile = (app as { isMobile?: boolean }).isMobile ?? false;
    if (!isMobile) return 'desktop';
    return isTablet(app) ? 'tablet' : 'mobile';
}

export class DiwaMobileShell {
    private activeView: ResponsiveWorkspaceView = 'home';
    private activeContexts: Set<string> = new Set();
    private projectFilter: ResponsiveProjectFilter = 'all';
    private expandedProjectIds: Set<string> = new Set();
    private selectedProjectId: string | null = null;
    private selectedThought: ThoughtEntry | null = null;
    private bulsa: Required<BulsaLeafState> = { ...DEFAULT_BULSA_STATE };
    private selectedBulsaDuePath: string | null = null;
    private hostEl: HTMLElement | null = null;
    private shellEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    private navEl: HTMLElement | null = null;
    private tabsEl: HTMLElement | null = null;
    private platform: Exclude<ShellPlatform, 'desktop'>;
    private taskCache: TaskCache | null = null;
    private thoughtCache: ThoughtCache | null = null;
    private projectCache: ProjectCache | null = null;
    private lastChromeKey: string | null = null;
    private readonly projectMilestones: Map<string, Milestone[]> = new Map();
    private readonly loadingProjectMilestones: Map<string, Promise<Milestone[]>> = new Map();
    private readonly selectedMilestoneIds: Map<string, string | null> = new Map();
    private renderCycleToken = 0;

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        private options: DiwaMobileShellOptions = {},
    ) {
        this.platform = options.platform ?? 'mobile';
    }

    public setPlatform(platform: Exclude<ShellPlatform, 'desktop'>): void {
        this.platform = platform;
    }

    public getState(): DiwaMobileShellState {
        return {
            activeView: this.activeView,
            activeContexts: Array.from(this.activeContexts),
            projectFilter: this.projectFilter,
            expandedProjectIds: Array.from(this.expandedProjectIds),
            selectedProjectId: this.selectedProjectId,
            selectedMilestoneIds: Object.fromEntries(this.selectedMilestoneIds.entries()),
            selectedThoughtId: this.selectedThought?.id || this.selectedThought?.filePath || null,
            selectedBulsaDuePath: this.selectedBulsaDuePath,
            bulsa: { ...this.bulsa },
        };
    }

    public setState(state: DiwaMobileShellState | null | undefined): void {
        if (!state) return;
        if (state.activeView && isResponsiveWorkspaceView(state.activeView)) {
            this.activeView = state.activeView;
        }
        if (Array.isArray(state.activeContexts)) {
            this.activeContexts = new Set(state.activeContexts.filter((value): value is string => typeof value === 'string' && value.length > 0));
        }
        if (state.projectFilter && PROJECT_FILTERS.some((filter) => filter.id === state.projectFilter)) {
            this.projectFilter = state.projectFilter;
        }
        if (Array.isArray(state.expandedProjectIds)) {
            this.expandedProjectIds = new Set(state.expandedProjectIds.filter((value): value is string => typeof value === 'string' && value.length > 0));
        }
        this.selectedProjectId = typeof state.selectedProjectId === 'string' && state.selectedProjectId.length > 0
            ? state.selectedProjectId
            : null;
        this.selectedMilestoneIds.clear();
        if (state.selectedMilestoneIds && typeof state.selectedMilestoneIds === 'object') {
            Object.entries(state.selectedMilestoneIds).forEach(([projectId, milestoneId]) => {
                if (!projectId) return;
                if (typeof milestoneId === 'string' && milestoneId.length > 0) {
                    this.selectedMilestoneIds.set(projectId, milestoneId);
                    return;
                }
                if (milestoneId === null) {
                    this.selectedMilestoneIds.set(projectId, null);
                }
            });
        }
        this.selectedThought = this.findThoughtById(state.selectedThoughtId ?? null);
        if (Object.prototype.hasOwnProperty.call(state, 'selectedBulsaDuePath')) {
            this.selectedBulsaDuePath = typeof state.selectedBulsaDuePath === 'string' && state.selectedBulsaDuePath.length > 0
                ? state.selectedBulsaDuePath
                : null;
        }
        if (state.bulsa !== undefined) {
            this.bulsa = {
                mode: state.bulsa?.mode === 'insights' ? 'insights' : DEFAULT_BULSA_STATE.mode,
                showAllDues: state.bulsa?.showAllDues === true,
            };
        }
    }

    public refreshTasks(): void {
        this.invalidateCaches('tasks');
        if (this.activeView === 'thoughts' || this.activeView === 'bulsa') return;
        this.refreshView();
    }

    public refreshThoughts(): void {
        this.invalidateCaches('thoughts');
        this.selectedThought = this.findThoughtById(this.selectedThought?.id || this.selectedThought?.filePath || null);
        if (this.activeView !== 'home' && this.activeView !== 'thoughts') return;
        this.refreshView();
    }

    public invalidateAllCaches(): void {
        this.invalidateCaches('all');
    }

    public render(container: HTMLElement): void {
        this.hostEl = container;
        this.ensureShell(container);
        this.syncShellStructure();
        this.refreshView();
    }

    private ensureShell(container: HTMLElement): void {
        const mounted = this.shellEl && container.contains(this.shellEl);
        if (this.hostEl === container && mounted && this.contentEl) return;

        container.empty();
        this.shellEl = container.createDiv('diwa-mobile-shell');
        this.contentEl = this.shellEl.createDiv('diwa-mobile-content');
        this.navEl = null;
        this.tabsEl = null;
        this.lastChromeKey = null;
    }

    private syncShellStructure(): void {
        if (!this.shellEl || !this.contentEl) return;

        this.shellEl.className = this.platform === 'tablet'
            ? 'diwa-mobile-shell diwa-tablet-shell'
            : 'diwa-mobile-shell';
        this.shellEl.setAttribute('data-shell-platform', this.platform);
        this.contentEl.className = this.platform === 'tablet'
            ? 'diwa-content-tablet'
            : 'diwa-mobile-content';

        if (this.platform === 'tablet') {
            if (!this.tabsEl || this.tabsEl.parentElement !== this.shellEl) {
                this.tabsEl?.remove();
                this.tabsEl = document.createElement('div');
                this.tabsEl.className = 'diwa-tablet-tabs';
                this.shellEl.insertBefore(this.tabsEl, this.contentEl);
                this.lastChromeKey = null;
            }
            this.navEl?.remove();
            this.navEl = null;
            return;
        }

        this.tabsEl?.remove();
        this.tabsEl = null;
        if (!this.navEl || this.navEl.parentElement !== this.shellEl) {
            this.navEl?.remove();
            this.navEl = this.shellEl.createDiv('diwa-mobile-nav');
            this.lastChromeKey = null;
        }
    }

    private refreshView(options: { forceChrome?: boolean } = {}): void {
        if (!this.contentEl) {
            if (this.hostEl) this.render(this.hostEl);
            return;
        }

        this.renderActiveView(this.contentEl);
        this.refreshChrome(options.forceChrome ?? false);
    }

    private refreshChrome(force = false): void {
        const chromeKey = this.getChromeKey();
        if (!force && chromeKey === this.lastChromeKey) return;

        if (this.tabsEl) this.renderTopTabs(this.tabsEl);
        if (this.navEl) this.renderBottomNav(this.navEl);
        this.lastChromeKey = chromeKey;
    }

    private renderActiveView(container: HTMLElement): void {
        container.empty();

        switch (this.activeView) {
            case 'home':
                this.renderHome(container);
                break;
            case 'bulsa':
                this.renderBulsa(container);
                break;
            case 'tasks':
                this.renderTasks(container);
                break;
            case 'projects':
                this.renderProjects(container);
                break;
            case 'thoughts':
                this.renderThoughts(container);
                break;
        }
    }

    private switchView(view: ResponsiveWorkspaceView): void {
        if (this.activeView === view) return;
        this.activeView = view;
        this.refreshView();
    }

    private renderBulsa(container: HTMLElement): void {
        this.syncBulsaSelection();
        renderResponsiveBulsa({
            container,
            platform: this.platform,
            dues: this.plugin.index.dueIndex.values(),
            monthlyIncome: this.plugin.settings.monthlyIncome,
            state: this.bulsa,
            selectedDuePath: this.selectedBulsaDuePath,
            onModeChange: (mode) => {
                if (this.bulsa.mode === mode) return;
                this.bulsa = { ...this.bulsa, mode };
                this.refreshView();
            },
            onShowAllChange: (showAllDues) => {
                if (this.bulsa.showAllDues === showAllDues) return;
                this.bulsa = { ...this.bulsa, showAllDues };
                this.refreshView();
            },
            onSelectDue: (path) => {
                if (this.selectedBulsaDuePath === path) return;
                this.selectedBulsaDuePath = path;
                this.refreshView();
            },
            onAddDue: () => this.openBulsaDueModal(),
            onOpenDue: (entry) => void this.openBulsaDueNote(entry.path),
            onRecordPayment: (entry) => this.openBulsaPaymentModal(entry.path, entry.dueDate),
        });
    }

    private openBulsaDueModal(): void {
        new NewDueModal(
            this.app,
            this.plugin.vault,
            this.plugin.settings.pfFolder,
            () => void this.refreshBulsaWorkspace()
        ).open();
    }

    private openBulsaPaymentModal(path: string, currentDueDate: string): void {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('Could not find the due note for payment logging.');
            return;
        }

        new PaymentModal(
            this.app,
            this.plugin,
            file,
            currentDueDate,
            () => void this.refreshBulsaWorkspace()
        ).open();
    }

    private async openBulsaDueNote(path: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('Could not find the Bulsa note to open.');
            return;
        }

        await this.app.workspace.getLeaf(false).openFile(file);
    }

    private async refreshBulsaWorkspace(): Promise<void> {
        await this.plugin.index.buildDueIndex();
        this.syncBulsaSelection();
        this.refreshView();
    }

    private syncBulsaSelection(): void {
        if (this.selectedBulsaDuePath && !this.plugin.index.dueIndex.has(this.selectedBulsaDuePath)) {
            this.selectedBulsaDuePath = null;
        }
    }

    private renderHome(container: HTMLElement): void {
        if (this.platform === 'tablet') {
            this.renderTabletHome(container);
            return;
        }
        this.renderMobileHome(container);
    }

    private renderMobileHome(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-home');
        const focusTasks = this.getFocusTasks();
        const recentThoughts = this.getRecentThoughts(2);
        const openTasks = this.getOpenTaskCount();

        const hero = wrap.createDiv('diwa-mobile-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Capture first' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'Keep your next move clear.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Drop a thought or task, then move straight into focus without friction.',
        });

        const capture = this.createActionButton(
            hero,
            'Capture a thought or task',
            'plus',
            () => this.plugin.openCaptureModal(),
            'diwa-mobile-capture-entry'
        );
        capture.addClass('is-primary');
        const captureText = capture.createDiv('diwa-mobile-capture-copy');
        captureText.createDiv({ cls: 'diwa-mobile-capture-title', text: 'Capture a thought or task' });
        captureText.createDiv({
            cls: 'diwa-mobile-capture-subtitle',
            text: 'Start with one line and let DIWA shape the flow.',
        });

        const metrics = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(metrics, 'Focus', focusTasks.length);
        this.renderMetricChip(metrics, 'Open', openTasks);
        this.renderMetricChip(metrics, 'Thoughts', this.getThoughts().length);

        const focus = wrap.createDiv('diwa-mobile-focus diwa-mobile-surface');
        this.renderSectionHeader(
            focus,
            'Today focus',
            focusTasks.length === 0 ? 'Nothing urgent yet' : 'Your priority queue for today',
            `${focusTasks.length}`
        );
        const focusList = focus.createDiv('diwa-mobile-focus-list');
        if (focusTasks.length === 0) {
            this.renderEmptyState(
                focusList,
                'sparkles',
                'A calm runway',
                'Capture a task or promote one in Gawa when you are ready to move.'
            );
        } else {
            focusTasks.slice(0, 4).forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true, compact: true });
            });
        }

        const thoughts = wrap.createDiv('diwa-mobile-home-section diwa-mobile-surface');
        this.renderSectionHeader(
            thoughts,
            'Recent thoughts',
            recentThoughts.length === 0 ? 'Capture your first note' : 'Fresh context from Diwa',
            `${recentThoughts.length}`
        );
        const thoughtList = thoughts.createDiv('diwa-thought-list');
        if (recentThoughts.length === 0) {
            this.renderEmptyState(
                thoughtList,
                'pen-square',
                'Nothing captured yet',
                'When a thought lands, it will show up here for a quick return.'
            );
        } else {
            recentThoughts.forEach((thought) => {
                this.plugin.renderThoughtCard(thoughtList, thought, { mobile: true });
            });
        }
    }

    private renderTabletHome(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-tablet-home');
        const focusTasks = this.getFocusTasks();
        const recentThoughts = this.getRecentThoughts(3);
        const openTasks = this.getOpenTaskCount();

        const hero = wrap.createDiv('diwa-tablet-home-hero diwa-mobile-surface');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Diwa workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'A calm control center for capture and follow-through.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Capture fast, check today’s focus, and jump into Gawa, Projects, or thoughts without losing context.',
        });

        const heroActions = hero.createDiv('diwa-tablet-home-actions');
        const capture = this.createActionButton(
            heroActions,
            'Capture',
            'plus',
            () => this.plugin.openCaptureModal(),
            'diwa-mobile-quick-action'
        );
        capture.addClass('is-primary');
        this.createActionButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'), 'diwa-mobile-quick-action');
        this.createActionButton(heroActions, 'Open Projects', 'folder-kanban', () => this.switchView('projects'), 'diwa-mobile-quick-action');
        this.createActionButton(heroActions, 'Review Diwa', 'pen-square', () => this.switchView('thoughts'), 'diwa-mobile-quick-action');

        const metrics = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(metrics, 'Focus', focusTasks.length);
        this.renderMetricChip(metrics, 'Open tasks', openTasks);
        this.renderMetricChip(metrics, 'Thoughts', this.getThoughts().length);

        const focus = wrap.createDiv('diwa-tablet-home-focus-card diwa-mobile-surface');
        this.renderSectionHeader(
            focus,
            'Today focus',
            focusTasks.length === 0 ? 'Nothing urgent yet' : 'Priority tasks that deserve attention now',
            `${focusTasks.length}`
        );
        const focusList = focus.createDiv('diwa-mobile-focus-list');
        if (focusTasks.length === 0) {
            this.renderEmptyState(
                focusList,
                'sparkles',
                'Focus is clear',
                'When you elevate a task, it will land here with space to breathe.'
            );
        } else {
            focusTasks.slice(0, 5).forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true });
            });
        }

        const thoughts = wrap.createDiv('diwa-tablet-home-thoughts-card diwa-mobile-surface');
        this.renderSectionHeader(
            thoughts,
            'Recent thoughts',
            recentThoughts.length === 0 ? 'Start a trail of ideas' : 'Recent notes ready to reopen',
            `${recentThoughts.length}`
        );
        const list = thoughts.createDiv('diwa-thought-list');
        if (recentThoughts.length === 0) {
            this.renderEmptyState(
                list,
                'pen-square',
                'No thought cards yet',
                'Capture a note and it will appear here for quick review.'
            );
        } else {
            recentThoughts.forEach((thought) => {
                this.plugin.renderThoughtCard(list, thought, { mobile: true });
            });
        }
    }

    private renderTasks(container: HTMLElement): void {
        const tasks = this.getOpenTasks();
        const wrap = container.createDiv('diwa-mobile-list-wrap');
        this.renderSectionHeader(
            wrap,
            'Gawa',
            tasks.length === 0 ? 'All open loops are clear' : 'Open tasks across your workspace',
            `${tasks.length}`
        );
        const list = wrap.createDiv('diwa-mobile-list diwa-gawa-list');
        if (tasks.length === 0) {
            this.renderEmptyState(
                list,
                'check-square-2',
                'Nothing open right now',
                'Your next captured task will appear here when it is ready for action.'
            );
            return;
        }
        tasks.forEach((task: TaskEntry) => {
            this.plugin.renderTaskRow(list, task, { mobile: true });
        });
    }

    private renderProjects(container: HTMLElement): void {
        const projects = this.getFilteredProjects();
        this.syncSelectedProject(projects, this.platform === 'tablet');
        const renderToken = this.beginRenderCycle();

        if (this.platform === 'tablet') {
            this.renderTabletProjects(container, projects, renderToken);
            return;
        }

        const selectedProject = this.selectedProjectId ? this.getProjectById(this.selectedProjectId) : null;
        if (selectedProject) {
            this.renderMobileProjectFocus(container, selectedProject, renderToken);
            return;
        }

        this.renderMobileProjects(container, projects);
    }

    private renderMobileProjects(container: HTMLElement, projects: ProjectEntry[]): void {
        const wrap = container.createDiv('diwa-mobile-projects');
        const summary = this.getProjectSummary();

        const hero = wrap.createDiv('diwa-mobile-hero diwa-mobile-project-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Project workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'Keep initiatives moving without losing the thread.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Open a compact focus workspace for milestones, next actions, and quick planning on the go.',
        });

        const heroActions = hero.createDiv('diwa-mobile-project-actions');
        this.createProjectButton(heroActions, 'New project', 'plus', () => this.openNewProjectModal(), true);
        this.createProjectButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'));

        const metrics = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(metrics, 'Active', summary.activeCount);
        this.renderMetricChip(metrics, 'Open tasks', summary.openTaskCount);
        this.renderMetricChip(metrics, 'Due soon', summary.dueSoonCount);

        this.renderProjectFilterBar(wrap);

        const surface = wrap.createDiv('diwa-mobile-surface diwa-mobile-project-list-surface');
        this.renderSectionHeader(
            surface,
            'Projects',
            projects.length === 0
                ? (this.projectFilter === 'all' ? 'No projects yet' : `No ${PROJECT_FILTERS.find((filter) => filter.id === this.projectFilter)?.label.toLowerCase()} projects`)
                : 'Touch-safe cards for every initiative in flight',
            `${projects.length}`,
        );

        const list = surface.createDiv('diwa-mobile-list diwa-mobile-project-list');
        if (projects.length === 0) {
            this.renderEmptyState(
                list,
                'folder-kanban',
                'No project cards yet',
                this.projectFilter === 'all'
                    ? 'Create a project to start shaping outcomes, dates, and linked work.'
                    : 'Try another filter or create a project for this lane.'
            );
            return;
        }

        projects.forEach((project) => this.renderMobileProjectCard(list, project));
    }

    private renderMobileProjectFocus(container: HTMLElement, project: ProjectEntry, renderToken: number): void {
        const wrap = container.createDiv('diwa-mobile-projects diwa-mobile-project-focus');
        this.renderProjectFocusWorkspace(wrap, project, renderToken, { showBackButton: true });
    }

    private renderTabletProjects(container: HTMLElement, projects: ProjectEntry[], renderToken: number): void {
        const wrap = container.createDiv('diwa-tablet-projects');
        const summary = this.getProjectSummary();
        const hero = wrap.createDiv('diwa-mobile-surface diwa-tablet-projects-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Project workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'A calmer planning surface for active initiatives.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Browse your projects on the left and keep the compact focus workspace anchored on the right.',
        });
        const heroActions = hero.createDiv('diwa-tablet-home-actions');
        this.createProjectButton(heroActions, 'New project', 'plus', () => this.openNewProjectModal(), true);
        this.createProjectButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'));
        this.createProjectButton(heroActions, 'Review Diwa', 'pen-square', () => this.switchView('thoughts'));

        const heroStats = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(heroStats, 'Active', summary.activeCount);
        this.renderMetricChip(heroStats, 'Open tasks', summary.openTaskCount);
        this.renderMetricChip(heroStats, 'Completed', summary.completedCount);

        this.renderProjectFilterBar(wrap, true);

        const split = wrap.createDiv('diwa-tablet-projects-split');
        const listPane = split.createDiv('diwa-mobile-surface diwa-tablet-projects-list-pane');
        this.renderSectionHeader(
            listPane,
            'Project list',
            projects.length === 0 ? 'Nothing in this lane yet' : 'Select a project for a wider detail view',
            `${projects.length}`,
        );
        const list = listPane.createDiv('diwa-tablet-projects-list');
        if (projects.length === 0) {
            this.renderEmptyState(
                list,
                'folder-kanban',
                'No matching projects',
                'Change the filter or create a project to populate this planning view.'
            );
        } else {
            projects.forEach((project) => this.renderTabletProjectListCard(list, project));
        }

        const detailPane = split.createDiv('diwa-mobile-surface diwa-tablet-projects-detail-pane');
        const selectedProject = this.selectedProjectId
            ? (this.getProjectById(this.selectedProjectId) ?? projects[0] ?? null)
            : (projects[0] ?? null);
        if (!selectedProject) {
            this.renderEmptyState(
                detailPane,
                'folder-kanban',
                'Nothing selected',
                'Choose a project on the left to open its compact focus workspace.'
            );
            return;
        }
        this.renderProjectFocusWorkspace(detailPane, selectedProject, renderToken);
    }

    private renderProjectFilterBar(parent: HTMLElement, compact = false): void {
        const row = parent.createDiv(`diwa-mobile-project-filter-row${compact ? ' is-compact' : ''}`);
        PROJECT_FILTERS.forEach((filter) => {
            const btn = row.createEl('button', {
                cls: `diwa-chip diwa-mobile-project-filter-chip${this.projectFilter === filter.id ? ' is-active' : ''}`,
                text: filter.label,
                attr: { type: 'button' },
            });
            btn.addEventListener('click', () => {
                this.projectFilter = filter.id;
                this.refreshView();
            });
        });
    }

    private renderMobileProjectCard(parent: HTMLElement, project: ProjectEntry): void {
        const metrics = this.getProjectMetrics(project);
        const card = parent.createDiv('diwa-mobile-project-card');
        card.style.setProperty('--project-color', project.color || 'var(--interactive-accent)');
        card.addEventListener('click', () => {
            this.selectedProjectId = project.id;
            this.refreshView();
        });

        const head = card.createDiv('diwa-mobile-project-card__head');
        const identity = head.createDiv('diwa-mobile-project-card__identity');
        identity.createDiv('diwa-mobile-project-card__swatch');
        const copy = identity.createDiv('diwa-mobile-project-card__copy');
        copy.createDiv({
            cls: 'diwa-mobile-project-card__eyebrow',
            text: project.status === 'completed'
                ? 'Completed project'
                : project.due
                    ? `Due ${this.formatDate(project.due)}`
                    : 'Project lane',
        });
        copy.createDiv({ cls: 'diwa-mobile-project-card__title', text: project.name });

        const status = head.createDiv(`diwa-mobile-project-status diwa-mobile-project-status--${project.status}`);
        status.setText(PROJECT_STATUS_LABELS[project.status]);

        if (project.goal) {
            card.createDiv({ cls: 'diwa-mobile-project-card__goal', text: project.goal });
        }

        const meta = card.createDiv('diwa-mobile-project-card__meta');
        this.renderProjectMetricChip(meta, `${metrics.openCount} open`);
        this.renderProjectMetricChip(meta, `${metrics.doneCount} done`);
        if (project.due) this.renderProjectMetricChip(meta, this.formatDate(project.due), this.isDateOverdue(project.due));

        if (metrics.nextTask) {
            const next = card.createDiv('diwa-mobile-project-card__next');
            next.createDiv({ cls: 'diwa-mobile-project-card__next-label', text: 'Next' });
            next.createDiv({ cls: 'diwa-mobile-project-card__next-title', text: metrics.nextTask.title || metrics.nextTask.body || 'Untitled task' });
        }

        const actions = card.createDiv('diwa-mobile-project-card__actions');
        this.createProjectButton(actions, 'Focus', 'crosshair', () => {
            this.selectedProjectId = project.id;
            this.refreshView();
        }, true);
        this.createProjectButton(actions, 'Open', 'file-text', () => { void this.openProjectFile(project); });
        this.createProjectButton(actions, 'Edit', 'pencil', () => this.openEditProjectModal(project));
    }

    private renderTabletProjectListCard(parent: HTMLElement, project: ProjectEntry): void {
        const metrics = this.getProjectMetrics(project);
        const card = parent.createDiv(`diwa-tablet-project-list-card${this.selectedProjectId === project.id ? ' is-selected' : ''}`);
        card.style.setProperty('--project-color', project.color || 'var(--interactive-accent)');
        card.addEventListener('click', () => {
            this.selectedProjectId = project.id;
            this.refreshView();
        });

        const titleRow = card.createDiv('diwa-tablet-project-list-card__title-row');
        titleRow.createDiv({ cls: 'diwa-tablet-project-list-card__name', text: project.name });
        titleRow.createDiv({ cls: `diwa-mobile-project-status diwa-mobile-project-status--${project.status}`, text: PROJECT_STATUS_LABELS[project.status] });

        card.createDiv({
            cls: 'diwa-tablet-project-list-card__subtitle',
            text: project.goal || 'No outcome captured yet.',
        });

        const meta = card.createDiv('diwa-mobile-project-card__meta');
        this.renderProjectMetricChip(meta, `${metrics.openCount} open`);
        this.renderProjectMetricChip(meta, `${metrics.doneCount} done`);
        if (project.due) this.renderProjectMetricChip(meta, this.formatDate(project.due), this.isDateOverdue(project.due));
    }

    private renderProjectFocusWorkspace(
        parent: HTMLElement,
        project: ProjectEntry,
        renderToken: number,
        options: { showBackButton?: boolean } = {},
    ): void {
        const metrics = this.getProjectMetrics(project);
        const focusShell = parent.createDiv('diwa-project-focus__shell');
        const milestones = this.projectMilestones.get(project.id) ?? null;

        if (!milestones && !this.loadingProjectMilestones.has(project.id)) {
            void this.ensureProjectMilestones(project).then(() => {
                if (this.isRenderCycleActive(renderToken, this.contentEl)) {
                    this.refreshView();
                }
            });
        }

        const topBar = focusShell.createDiv('diwa-project-focus__topbar diwa-gawa-workspace-bar');
        const titleWrap = topBar.createDiv('diwa-project-focus__topbar-title');
        if (options.showBackButton) {
            this.createWorkspaceButton(titleWrap, 'Projects', 'arrow-left', () => {
                this.selectedProjectId = null;
                this.refreshView();
            }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        }
        const identity = titleWrap.createDiv('diwa-project-focus__topbar-identity');
        identity.createDiv({ cls: 'diwa-project-focus__eyebrow', text: 'Project focus' });
        identity.createDiv({ cls: 'diwa-project-focus__title', text: project.name });

        const topBarActions = topBar.createDiv('diwa-project-focus__topbar-actions');
        const primaryActions = topBarActions.createDiv('diwa-project-focus__topbar-primary');
        this.createWorkspaceButton(primaryActions, 'Refresh', 'refresh-cw', () => {
            void this.refreshProjectFocus();
        }, 'diwa-gawa-header-btn');
        this.createWorkspaceButton(primaryActions, 'Open note', 'file-text', () => {
            void this.openProjectFile(project);
        }, 'diwa-gawa-header-btn');
        this.createWorkspaceButton(primaryActions, 'Edit project', 'pencil', () => {
            this.openEditProjectModal(project);
        }, 'diwa-gawa-header-btn');

        const statusRow = topBarActions.createDiv('diwa-project-focus__topbar-status diwa-project-focus__status-row');
        PROJECT_STATUS_FILTERS.forEach((statusOption) => {
            const statusId = statusOption.id as ProjectEntry['status'];
            const btn = statusRow.createEl('button', {
                cls: `diwa-mobile-project-status-btn${project.status === statusId ? ' is-active' : ''}`,
                text: statusOption.label,
                attr: { type: 'button' },
            });
            btn.addEventListener('click', () => {
                void this.updateProjectStatus(project, statusId);
            });
        });

        const overview = focusShell.createDiv('diwa-project-focus__overview diwa-project-focus__overview--compact');
        if (project.goal) {
            overview.createDiv({ cls: 'diwa-project-focus__description', text: project.goal });
        } else {
            overview.createDiv({
                cls: 'diwa-project-focus__description is-muted',
                text: 'No outcome captured yet. Edit the project to add a goal and anchor this focus space.',
            });
        }

        const overviewMeta = overview.createDiv('diwa-project-focus__overview-meta');
        this.renderProjectMetricChip(overviewMeta, `${metrics.openCount} open`);
        this.renderProjectMetricChip(overviewMeta, `${metrics.doneCount} done`);
        if (project.due) {
            this.renderProjectMetricChip(overviewMeta, `Due ${this.formatDate(project.due)}`, this.isDateOverdue(project.due));
        } else {
            this.renderProjectMetricChip(overviewMeta, 'No due date');
        }
        overviewMeta.createDiv({
            cls: `diwa-mobile-project-status diwa-mobile-project-status--${project.status}`,
            text: PROJECT_STATUS_LABELS[project.status],
        });

        const statRow = focusShell.createDiv('diwa-project-focus__stats');
        this.renderFocusStat(statRow, 'Open tasks', String(metrics.openCount), 'check-square-2');
        this.renderFocusStat(statRow, 'Completed', String(metrics.doneCount), 'check-check');
        this.renderFocusStat(statRow, 'Next', metrics.nextTask?.title || metrics.nextTask?.body || 'Nothing queued', 'sparkles');

        const planningPanel = focusShell.createDiv('diwa-project-focus__panel diwa-project-focus__panel--planning');
        const planningHeader = planningPanel.createDiv('diwa-project-focus__panel-header');
        const planningCopy = planningHeader.createDiv('diwa-project-focus__panel-copy');
        planningCopy.createDiv({ cls: 'diwa-project-focus__panel-eyebrow', text: 'Milestones' });
        planningCopy.createDiv({
            cls: 'diwa-project-focus__panel-title',
            text: milestones ? 'Plan the next milestone and keep work aligned.' : 'Loading milestones...',
        });

        const milestoneBody = planningPanel.createDiv('diwa-project-focus__milestones-body');
        if (milestones) {
            this.renderProjectMilestonesBody(milestoneBody, milestones, project);
        } else {
            this.renderEmptyState(
                milestoneBody,
                'refresh-cw',
                'Loading milestones',
                'Pulling project planning markers into the compact focus view.'
            );
        }

        const selectedMilestone = milestones
            ? milestones.find((milestone) => milestone.id === this.getSelectedMilestoneId(project.id, milestones)) ?? null
            : null;
        this.renderProjectFocusQuickAdd(focusShell, project, selectedMilestone);

        const tasksPanel = focusShell.createDiv('diwa-project-focus__panel diwa-project-focus__panel--tasks');
        const tasksHeader = tasksPanel.createDiv('diwa-project-focus__panel-header');
        const tasksCopy = tasksHeader.createDiv('diwa-project-focus__panel-copy');
        tasksCopy.createDiv({ cls: 'diwa-project-focus__panel-eyebrow', text: 'Task view' });
        tasksCopy.createDiv({ cls: 'diwa-project-focus__panel-title', text: 'Keep the next actions compact and editable.' });

        const taskSections = tasksPanel.createDiv('diwa-project-focus__task-sections');
        if (!milestones) {
            this.renderEmptyState(
                taskSections,
                'refresh-cw',
                'Loading task buckets',
                'Task sections will appear once milestone planning finishes loading.'
            );
            return;
        }

        const tasks = metrics.tasks;
        const selectedMilestoneId = this.getSelectedMilestoneId(project.id, milestones);
        const taskStats = this.buildMilestoneTaskStats(tasks, milestones);
        const selectedMilestoneTasks = selectedMilestone
            ? tasks.filter((task) => this.resolveMilestoneId(task, milestones) === selectedMilestone.id)
            : [];
        const unassignedTasks = tasks.filter((task) => this.resolveMilestoneId(task, milestones) === null);

        this.renderProjectFocusTaskSection(
            taskSections,
            selectedMilestone?.title ?? 'Selected milestone',
            selectedMilestone
                ? `${taskStats.get(selectedMilestone.id)?.open ?? 0} open of ${taskStats.get(selectedMilestone.id)?.total ?? 0}`
                : 'Pick a milestone to focus the task list.',
            selectedMilestoneTasks,
            project,
            milestones
        );

        this.renderProjectFocusTaskSection(
            taskSections,
            'Unassigned tasks',
            `${unassignedTasks.filter((task) => !isTaskDone(task)).length} open without a milestone`,
            unassignedTasks,
            project,
            milestones
        );
    }

    private renderProjectMilestonesBody(
        container: HTMLElement,
        milestones: Milestone[],
        project: ProjectEntry,
        editingMilestoneId: string | null = null,
    ): void {
        container.empty();

        const tasks = this.getProjectMetrics(project).tasks;
        const selectedMilestoneId = this.getSelectedMilestoneId(project.id, milestones);
        const taskStats = this.buildMilestoneTaskStats(tasks, milestones);
        const unassignedCount = tasks.filter((task) => this.resolveMilestoneId(task, milestones) === null && !isTaskDone(task)).length;

        const unassignedRow = container.createDiv(`diwa-milestone-row diwa-milestone-row--focus${selectedMilestoneId === null ? ' is-selected' : ''}`);
        const unassignedBucket = unassignedRow.createDiv('diwa-project-focus__milestone-bucket');
        unassignedBucket.createDiv({ cls: 'diwa-project-focus__milestone-label', text: 'Unassigned' });
        unassignedBucket.createDiv({ cls: 'diwa-project-focus__milestone-count', text: `${unassignedCount} open` });
        unassignedRow.addEventListener('click', () => {
            this.selectedMilestoneIds.set(project.id, null);
            this.refreshView();
        });

        const list = container.createDiv('diwa-project-focus__milestone-list');
        milestones.forEach((milestone) => {
            const stats = taskStats.get(milestone.id) ?? { total: 0, open: 0 };
            const row = list.createDiv(`diwa-milestone-row diwa-milestone-row--focus${selectedMilestoneId === milestone.id ? ' is-selected' : ''}`);
            const isEditing = editingMilestoneId === milestone.id;

            if (isEditing) {
                const editor = row.createDiv('diwa-project-focus__milestone-editor');
                const input = editor.createEl('input', {
                    cls: 'diwa-project-focus__milestone-input',
                    attr: { type: 'text', value: milestone.title, placeholder: 'Milestone title' },
                });
                input.select();

                const actions = editor.createDiv('diwa-project-focus__milestone-actions');
                this.createWorkspaceButton(actions, 'Save', 'check', () => {
                    const nextName = input.value.trim();
                    if (!nextName) {
                        new Notice('Milestone name cannot be empty.');
                        return;
                    }
                    const nextMilestones = milestones.map((entry) => entry.id === milestone.id ? { ...entry, title: nextName } : entry);
                    void this.persistProjectMilestones(project, nextMilestones);
                }, 'diwa-project-action-btn');
                this.createWorkspaceButton(actions, 'Cancel', 'x', () => {
                    this.renderProjectMilestonesBody(container, milestones, project, null);
                }, 'diwa-project-action-btn diwa-project-action-btn--ghost');
                return;
            }

            const bucket = row.createDiv('diwa-project-focus__milestone-bucket');
            bucket.createDiv({ cls: 'diwa-project-focus__milestone-label', text: milestone.title });
            bucket.createDiv({ cls: 'diwa-project-focus__milestone-count', text: `${stats.open} open / ${stats.total} total` });

            const actions = row.createDiv('diwa-project-focus__milestone-actions');
            this.createWorkspaceButton(actions, 'Edit', 'pencil', () => {
                this.renderProjectMilestonesBody(container, milestones, project, milestone.id);
            }, 'diwa-project-action-btn diwa-project-action-btn--ghost');
            this.createWorkspaceButton(actions, 'Delete', 'trash-2', () => {
                const nextMilestones = milestones.filter((entry) => entry.id !== milestone.id);
                void this.clearMilestoneAssignments(project, milestone.id)
                    .then(() => this.persistProjectMilestones(project, nextMilestones));
            }, 'diwa-project-action-btn diwa-project-action-btn--ghost');

            row.addEventListener('click', (event) => {
                if ((event.target as HTMLElement)?.closest('.diwa-project-action-btn')) return;
                this.selectedMilestoneIds.set(project.id, milestone.id);
                this.refreshView();
            });
        });

        const addRow = container.createDiv('diwa-project-focus__milestone-add');
        const addInput = addRow.createEl('input', {
            cls: 'diwa-project-focus__milestone-input',
            attr: { type: 'text', placeholder: 'Add a milestone' },
        });
        this.createWorkspaceButton(addRow, 'Add', 'plus', () => {
            const name = addInput.value.trim();
            if (!name) {
                new Notice('Milestone name cannot be empty.');
                return;
            }
            const nextMilestones = [...milestones, { id: crypto.randomUUID(), title: name, done: false }];
            void this.persistProjectMilestones(project, nextMilestones);
        }, 'diwa-project-action-btn');
    }

    private renderProjectFocusQuickAdd(projectShell: HTMLElement, project: ProjectEntry, selectedMilestone: Milestone | null): void {
        const quickAdd = projectShell.createDiv('diwa-project-focus__quick-add');
        quickAdd.createDiv({ cls: 'diwa-project-focus__quick-add-label', text: 'Quick add' });
        const inputRow = quickAdd.createDiv('diwa-project-focus__quick-add-row');
        const input = inputRow.createEl('input', {
            cls: 'diwa-project-focus__quick-add-input',
            attr: { type: 'text', placeholder: selectedMilestone ? `Add a task for ${selectedMilestone.title}` : `Add a task for ${project.name}` },
        });

        const commit = async (): Promise<void> => {
            const title = input.value.trim();
            if (!title) return;
            input.disabled = true;
            try {
                const created = await this.plugin.vault.createTaskFile(
                    title,
                    [],
                    undefined,
                    project.id,
                    {
                        status: 'open',
                        milestone: selectedMilestone?.id,
                    },
                );
                await this.syncTaskFromPath(created.path, 'add');
                this.invalidateCaches('tasks');
                this.refreshView();
                input.value = '';
            } catch (error) {
                console.error('[DIWA Mobile] Failed to create project focus task', error);
                new Notice('Failed to add task to the project.');
            } finally {
                input.disabled = false;
            }
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void commit();
            }
        });

        this.createWorkspaceButton(inputRow, 'Add task', 'plus', () => {
            void commit();
        }, 'diwa-project-action-btn');
    }

    private renderProjectFocusTaskSection(
        parent: HTMLElement,
        title: string,
        subtitle: string,
        tasks: TaskEntry[],
        project: ProjectEntry,
        milestones: Milestone[],
    ): void {
        const section = parent.createDiv('diwa-project-focus__task-section');
        const header = section.createDiv('diwa-project-focus__task-section-header');
        header.createDiv({ cls: 'diwa-project-focus__task-section-title', text: title });
        header.createDiv({ cls: 'diwa-project-focus__task-section-subtitle', text: subtitle });

        if (tasks.length === 0) {
            this.renderEmptyState(
                section,
                'sparkles',
                'Nothing queued',
                'This lane is clear for now.'
            );
            return;
        }

        const list = section.createDiv('diwa-project-focus__task-list');
        tasks.forEach((task) => this.renderProjectFocusTaskCard(list, task, project, milestones));
    }

    private renderProjectFocusTaskCard(
        parent: HTMLElement,
        task: TaskEntry,
        project: ProjectEntry,
        milestones: Milestone[],
    ): void {
        const isDone = isTaskDone(task);
        const card = parent.createDiv(`diwa-project-focus__task-card${isDone ? ' is-done' : ''}`);

        const row = card.createDiv('diwa-project-focus__task-row');
        const toggle = row.createEl('input', {
            cls: 'diwa-project-focus__task-toggle',
            attr: { type: 'checkbox' },
        }) as HTMLInputElement;
        toggle.checked = isDone;
        toggle.addEventListener('change', async () => {
            toggle.disabled = true;
            try {
                await this.toggleFocusTask(task, toggle);
            } finally {
                toggle.disabled = false;
            }
        });

        const body = row.createDiv('diwa-project-focus__task-body');
        body.createDiv({
            cls: 'diwa-project-focus__task-title',
            text: task.title || task.body || 'Untitled task',
        });

        const meta = body.createDiv('diwa-project-focus__task-meta');
        meta.createDiv({
            cls: 'diwa-project-focus__task-chip',
            text: isDone ? 'Done' : 'Open',
        });
        if (task.due) {
            meta.createDiv({
                cls: `diwa-project-focus__task-chip${this.isDateOverdue(task.due) && !isDone ? ' is-overdue' : ''}`,
                text: `Due ${this.formatDate(task.due)}`,
            });
        }
        if (project.name) {
            meta.createDiv({ cls: 'diwa-project-focus__task-chip', text: project.name });
        }

        const actions = row.createDiv('diwa-project-focus__task-actions');
        this.createWorkspaceButton(actions, 'Edit', 'pencil', () => {
            new EditTaskModal(this.app, task, this.plugin.vault, this.plugin.index, () => {
                this.invalidateCaches('tasks');
                this.refreshView();
            }).open();
        }, 'diwa-project-action-btn diwa-project-action-btn--ghost');
        this.createWorkspaceButton(actions, 'Open', 'file-text', () => {
            void this.openTaskNote(task);
        }, 'diwa-project-action-btn diwa-project-action-btn--ghost');

        const selectWrap = card.createDiv('diwa-project-focus__task-select-wrap');
        const select = selectWrap.createEl('select', { cls: 'diwa-project-focus__select' }) as HTMLSelectElement;
        const noneOption = select.createEl('option', { text: 'No milestone' });
        noneOption.value = '';
        milestones.forEach((milestone) => {
            const option = select.createEl('option', { text: milestone.title });
            option.value = milestone.id;
        });
        select.value = this.resolveMilestoneId(task, milestones) ?? '';
        select.addEventListener('change', async () => {
            const previousValue = this.resolveMilestoneId(task, milestones) ?? '';
            select.disabled = true;
            try {
                await this.assignTaskMilestone(task, project, select.value || null);
            } catch (error) {
                console.error('Failed to reassign task milestone from mobile project focus.', error);
                new Notice('Could not update the task milestone. Please try again.');
                select.value = previousValue;
            } finally {
                select.disabled = false;
            }
        });
    }

    private createWorkspaceButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void,
        className: string,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: className,
            attr: { type: 'button', 'aria-label': label },
        }) as HTMLButtonElement;
        const icon = button.createSpan('diwa-action-btn__icon');
        this.applyIcon(icon, iconName);
        button.createSpan({ cls: 'diwa-action-btn__label', text: label });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private renderFocusStat(parent: HTMLElement, label: string, value: string, iconName: string): void {
        const card = parent.createDiv('diwa-project-focus__stat');
        const iconWrap = card.createDiv('diwa-project-focus__stat-icon');
        this.applyIcon(iconWrap, iconName);
        const copy = card.createDiv('diwa-project-focus__stat-copy');
        copy.createDiv({ cls: 'diwa-project-focus__stat-label', text: label });
        copy.createDiv({ cls: 'diwa-project-focus__stat-value', text: value });
    }

    private async refreshProjectFocus(): Promise<void> {
        await this.plugin.index.buildProjectIndex();
        this.invalidateCaches('all');
        this.refreshView();
    }

    private async ensureProjectMilestones(project: ProjectEntry): Promise<Milestone[]> {
        const cached = this.projectMilestones.get(project.id);
        if (cached) return cached;
        const pending = this.loadingProjectMilestones.get(project.id);
        if (pending) return pending;

        const loadPromise = this.plugin.vault.readMilestones(project.filePath)
            .then((milestones) => {
                this.projectMilestones.set(project.id, milestones);
                return milestones;
            })
            .finally(() => {
                this.loadingProjectMilestones.delete(project.id);
            });
        this.loadingProjectMilestones.set(project.id, loadPromise);
        return loadPromise;
    }

    private async persistProjectMilestones(project: ProjectEntry, milestones: Milestone[]): Promise<void> {
        await this.plugin.vault.writeMilestones(project.filePath, milestones);
        this.invalidateCaches('projects');
        this.projectMilestones.set(project.id, milestones);
        this.refreshView();
    }

    private async clearMilestoneAssignments(project: ProjectEntry, milestoneId: string): Promise<void> {
        const tasks = this.getProjectMetrics(project).tasks.filter((task) => task.milestone === milestoneId && task.filePath);
        for (const task of tasks) {
            await this.plugin.vault.setTaskProjectMilestone(task.filePath, project.id, null);
            await this.syncTaskFromPath(task.filePath, 'update');
        }
        this.invalidateCaches('tasks');
    }

    private getSelectedMilestoneId(projectId: string, milestones: Milestone[]): string | null {
        const current = this.selectedMilestoneIds.get(projectId);
        const validMilestoneIds = new Set(milestones.map((milestone) => milestone.id));
        if (current === null) return null;
        if (current && validMilestoneIds.has(current)) return current;
        const fallback = milestones.find((milestone) => !milestone.done)?.id ?? milestones[0]?.id ?? null;
        this.selectedMilestoneIds.set(projectId, fallback);
        return fallback;
    }

    private resolveMilestoneId(task: TaskEntry, milestones: Milestone[]): string | null {
        if (!task.milestone) return null;
        return milestones.some((milestone) => milestone.id === task.milestone) ? task.milestone : null;
    }

    private buildMilestoneTaskStats(tasks: TaskEntry[], milestones: Milestone[]): Map<string, MilestoneTaskStats> {
        const stats = new Map<string, MilestoneTaskStats>();
        milestones.forEach((milestone) => {
            stats.set(milestone.id, { total: 0, open: 0 });
        });
        tasks.forEach((task) => {
            const milestoneId = this.resolveMilestoneId(task, milestones);
            if (!milestoneId) return;
            const entry = stats.get(milestoneId);
            if (!entry) return;
            entry.total += 1;
            if (!isTaskDone(task)) entry.open += 1;
        });
        return stats;
    }

    private async toggleFocusTask(task: TaskEntry, input: HTMLInputElement): Promise<void> {
        if (!task.filePath) {
            input.checked = isTaskDone(task);
            return;
        }
        const nextState = input.checked;
        await this.runWithTaskTogglePending(async () => {
            try {
                await this.plugin.vault.toggleTask(task.filePath, nextState);
                await this.syncTaskFromPath(task.filePath, 'update');
                this.invalidateCaches('tasks');
                this.refreshView();
            } catch (error) {
                console.error('Failed to toggle task from mobile project focus.', error);
                new Notice('Could not update the task. Please try again.');
                input.checked = !nextState;
            }
        });
    }

    private async assignTaskMilestone(task: TaskEntry, project: ProjectEntry, milestoneId: string | null): Promise<void> {
        if (!task.filePath) return;
        await this.runWithTaskTogglePending(async () => {
            await this.plugin.vault.setTaskProjectMilestone(task.filePath, project.id, milestoneId);
            await this.syncTaskFromPath(task.filePath, 'update');
            this.invalidateCaches('tasks');
            this.refreshView();
        });
    }

    private async openTaskNote(task: TaskEntry): Promise<void> {
        if (!task.filePath) return;
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    private async syncTaskFromPath(filePath: string, mode: 'add' | 'update'): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.plugin.refreshCoordinator.reindexFile(file);
        }
        const indexedTask = this.plugin.index.taskIndex.get(filePath);
        if (indexedTask) {
            if (mode === 'add') this.plugin.getTaskController().addTask(indexedTask);
            else this.plugin.getTaskController().updateTask(indexedTask);
            return;
        }
        this.plugin.getTaskController().syncFromIndex();
    }

    private async runWithTaskTogglePending(action: () => Promise<void>): Promise<void> {
        this.options.incrementTaskTogglePending?.();
        try {
            await action();
        } finally {
            this.options.decrementTaskTogglePending?.();
        }
    }

    private beginRenderCycle(): number {
        this.renderCycleToken += 1;
        return this.renderCycleToken;
    }

    private isRenderCycleActive(token: number, container: HTMLElement | null): boolean {
        return this.renderCycleToken === token && !!container?.isConnected;
    }

    private renderProjectMetricChip(parent: HTMLElement, label: string, urgent = false): void {
        parent.createDiv({
            cls: `diwa-mobile-project-chip${urgent ? ' is-urgent' : ''}`,
            text: label,
        });
    }

    private createProjectButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void,
        primary = false,
        danger = false,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: `diwa-mobile-project-btn${primary ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`,
            attr: { type: 'button', 'aria-label': label },
        }) as HTMLButtonElement;
        const icon = button.createSpan('diwa-mobile-project-btn-icon');
        this.applyIcon(icon, iconName);
        button.createSpan({ cls: 'diwa-mobile-project-btn-label', text: label });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    private openNewProjectModal(): void {
        new NewProjectModal(this.app, this.plugin.vault, (entry) => {
            this.plugin.index.projectIndex.set(entry.id, entry);
            this.projectFilter = 'all';
            this.selectedProjectId = entry.id;
            this.invalidateCaches('projects');
            this.refreshView();
        }).open();
    }

    private openEditProjectModal(project: ProjectEntry): void {
        new EditProjectModal(this.app, this.plugin.vault, project, (updated) => {
            this.plugin.index.projectIndex.set(updated.id, updated);
            this.selectedProjectId = updated.id;
            this.invalidateCaches('projects');
            this.refreshView();
        }).open();
    }

    private async openProjectFile(project: ProjectEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(project.filePath);
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    private async updateProjectStatus(project: ProjectEntry, status: ProjectEntry['status']): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(project.filePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.vault.updateProject(file, { status });
        project.status = status;
        this.plugin.index.projectIndex.set(project.id, project);
        this.invalidateCaches('projects');
        this.refreshView();
    }

    private async archiveProject(project: ProjectEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(project.filePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.vault.archiveProject(file);
        this.plugin.index.projectIndex.delete(project.id);
        this.expandedProjectIds.delete(project.id);
        if (this.selectedProjectId === project.id) this.selectedProjectId = null;
        this.invalidateCaches('projects');
        this.refreshView();
    }

    private syncSelectedProject(projects: ProjectEntry[], required: boolean): void {
        if (projects.length === 0) {
            this.selectedProjectId = null;
            return;
        }
        if (this.selectedProjectId && projects.some((project) => project.id === this.selectedProjectId)) {
            return;
        }
        this.selectedProjectId = required ? projects[0].id : null;
    }

    private getFilteredProjects(): ProjectEntry[] {
        const cache = this.getProjectCache();
        const cached = cache.filtered.get(this.projectFilter);
        if (cached) return cached;

        const projects = this.projectFilter === 'all'
            ? cache.collection
            : cache.collection.filter((project) => project.status === this.projectFilter);
        cache.filtered.set(this.projectFilter, projects);
        return projects;
    }

    private getProjectMetrics(project: ProjectEntry): ProjectMetrics {
        const cache = this.getProjectCache();
        const cached = cache.metrics.get(project.id);
        if (cached) return cached;

        const tasks = [...(cache.tasks.get(project.id) ?? [])].sort((left, right) => {
            const leftDone = isTaskDone(left);
            const rightDone = isTaskDone(right);
            if (leftDone !== rightDone) return leftDone ? 1 : -1;
            if (left.due && right.due) return left.due.localeCompare(right.due);
            if (left.due) return -1;
            if (right.due) return 1;
            return (right.lastUpdate || 0) - (left.lastUpdate || 0);
        });
        const openTasks: TaskEntry[] = [];
        let nextTask: TaskEntry | undefined;

        tasks.forEach((task) => {
            if (isTaskDone(task)) return;
            openTasks.push(task);
            if (!nextTask || this.compareNextProjectTask(task, nextTask) < 0) {
                nextTask = task;
            }
        });

        const metrics = {
            tasks,
            openTasks,
            openCount: openTasks.length,
            doneCount: tasks.length - openTasks.length,
            nextTask,
        };
        cache.metrics.set(project.id, metrics);
        return metrics;
    }

    private formatDate(date: string): string {
        const parsed = moment(date, ['YYYY-MM-DD', moment.ISO_8601], true);
        return parsed.isValid() ? parsed.format('MMM D') : date;
    }

    private isDateOverdue(date: string): boolean {
        const parsed = moment(date, ['YYYY-MM-DD', moment.ISO_8601], true);
        return parsed.isValid() && parsed.isBefore(moment(), 'day');
    }

    private renderThoughts(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-thoughts-wrap');
        const thoughts = this.filterThoughts(this.getThoughts(), this.activeContexts);
        this.renderSectionHeader(
            wrap,
            'Diwa',
            thoughts.length === 0 ? 'No thoughts in view' : 'Thoughts filtered by context',
            `${thoughts.length}`
        );
        const contexts = this.plugin.getContexts();
        this.renderContextBar(wrap, contexts);

        if (this.platform === 'tablet') {
            this.renderTabletThoughtsLayout(wrap, thoughts);
            return;
        }

        const list = wrap.createDiv('diwa-thought-list');
        this.renderThoughtList(list, thoughts, false);
    }

    private filterThoughts(thoughts: ThoughtEntry[], activeContexts: Set<string>): ThoughtEntry[] {
        if (activeContexts.size === 0) return thoughts;

        const cache = this.getThoughtCache();
        const cacheKey = Array.from(activeContexts).sort((left, right) => left.localeCompare(right)).join('\u0000');
        const cached = cache.filtered.get(cacheKey);
        if (cached) return cached;

        const filtered = thoughts.filter((thought) => (thought.context ?? []).some((ctx) => activeContexts.has(ctx)));
        cache.filtered.set(cacheKey, filtered);
        return filtered;
    }

    private renderContextBar(container: HTMLElement, contexts: string[]): void {
        const bar = container.createDiv('diwa-context-bar');

        const allChip = bar.createEl('button', {
            cls: 'diwa-chip',
            text: 'All',
            attr: { type: 'button' },
        });
        if (this.activeContexts.size === 0) {
            allChip.addClass('is-active');
        }
        allChip.addEventListener('click', () => {
            this.activeContexts.clear();
            this.refreshView();
        });

        contexts.forEach((ctx) => {
            const chip = bar.createEl('button', {
                cls: 'diwa-chip',
                text: ctx,
                attr: { type: 'button' },
            });
            if (this.activeContexts.has(ctx)) {
                chip.addClass('is-active');
            }
            chip.addEventListener('click', () => {
                if (this.activeContexts.has(ctx)) this.activeContexts.delete(ctx);
                else this.activeContexts.add(ctx);
                this.refreshView();
            });
        });

        const more = bar.createEl('button', {
            cls: 'diwa-chip diwa-chip-add',
            text: '+',
            attr: { type: 'button', 'aria-label': 'More contexts' },
        });
        more.addEventListener('click', () => this.openContextPicker(contexts));
    }

    private openContextPicker(contexts: string[]): void {
        new MobileContextPickerModal(this.app, contexts, this.activeContexts, () => this.refreshView()).open();
    }

    private findThoughtById(thoughtId: string | null): ThoughtEntry | null {
        if (!thoughtId) return null;
        const thoughts = this.getThoughtCache().all;
        return thoughts.find((thought) => (thought.id || thought.filePath) === thoughtId) ?? null;
    }

    private renderThoughtList(container: HTMLElement, thoughts: ThoughtEntry[], selectable: boolean): void {
        if (thoughts.length === 0) {
            this.renderEmptyState(
                container,
                'pen-square',
                'No thoughts here',
                this.activeContexts.size === 0
                    ? 'Capture a thought to start your stream.'
                    : 'Try clearing or changing your active contexts.'
            );
            return;
        }

        thoughts.forEach((thought: ThoughtEntry) => {
            const card = this.plugin.renderThoughtCard(container, thought, { mobile: true });
            if (!selectable) return;
            const thoughtId = thought.id || thought.filePath;
            const selectedId = this.selectedThought?.id || this.selectedThought?.filePath;
            if (selectedId === thoughtId) {
                card.addClass('is-selected');
            }
            card.addEventListener('click', (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest('a')) return;
                this.selectedThought = thought;
                this.refreshView();
            });
        });
    }

    private renderTabletThoughtsLayout(container: HTMLElement, thoughts: ThoughtEntry[]): void {
        const layout = container.createDiv('diwa-tablet-split');
        const left = layout.createDiv('diwa-tablet-left diwa-mobile-surface');
        const right = layout.createDiv('diwa-tablet-right diwa-mobile-surface');

        this.renderSectionHeader(
            left,
            'Thought list',
            thoughts.length === 0 ? 'No thoughts to preview' : 'Select a card to open the detail view',
            `${thoughts.length}`
        );
        const list = left.createDiv('diwa-thought-list');
        this.renderThoughtList(list, thoughts, true);

        const detail = right.createDiv('diwa-tablet-thought-detail');
        const detailHeader = detail.createDiv('diwa-tablet-thought-detail-header');
        detailHeader.createDiv({ cls: 'diwa-mobile-section-title', text: 'Preview' });

        if (thoughts.length === 0) {
            this.renderEmptyState(
                detail,
                'sparkles',
                'Nothing selected',
                'Pick a thought on the left to preview it here with room to read.'
            );
            return;
        }

        const selectedId = this.selectedThought?.id || this.selectedThought?.filePath || '';
        const resolved = thoughts.find((thought) => (thought.id || thought.filePath) === selectedId) ?? thoughts[0];
        this.selectedThought = resolved;
        detailHeader.createDiv({
            cls: 'diwa-tablet-thought-detail-caption',
            text: 'Open links directly or long-press for actions.',
        });
        const body = detail.createDiv('diwa-tablet-thought-detail-body');
        this.plugin.renderThoughtCard(body, resolved, { mobile: true });
    }

    private renderTopTabs(container: HTMLElement): void {
        container.empty();
        container.setAttribute('role', 'tablist');
        container.setAttribute('aria-label', 'DIWA workspace sections');

        this.getShellItems().forEach((item) => {
            const isActive = this.activeView === item.id;
            const tab = container.createEl('button', {
                cls: 'diwa-tab',
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                },
            });
            if (isActive) tab.addClass('is-active');

            const icon = tab.createSpan('diwa-tab-icon');
            this.applyIcon(icon, item.icon);
            tab.createSpan({ cls: 'diwa-tab-label', text: item.label });
            tab.addEventListener('click', () => this.switchView(item.id));
        });
    }

    private renderBottomNav(container: HTMLElement): void {
        container.empty();
        container.setAttribute('role', 'tablist');
        container.setAttribute('aria-label', 'DIWA mobile navigation');

        this.getShellItems().forEach((item) => {
            const isActive = this.activeView === item.id;
            const btn = container.createEl('button', {
                cls: 'diwa-mobile-nav-btn',
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                    'aria-label': item.ariaLabel ?? item.label,
                },
            });

            if (isActive) {
                btn.addClass('is-active');
            }

            const icon = btn.createSpan('diwa-mobile-nav-icon');
            this.applyIcon(icon, item.icon);
            btn.createSpan({ cls: 'diwa-mobile-nav-label', text: item.label });
            btn.addEventListener('click', () => this.switchView(item.id));
        });
    }

    private getShellItems(): ShellNavItem[] {
        const useShortProjectLabel = this.platform === 'mobile' && this.getViewportWidth() <= 390;
        return SHELL_ITEMS.map((item) => ({
            ...item,
            label: item.id === 'projects' && useShortProjectLabel ? (item.shortLabel ?? item.label) : item.label,
        }));
    }

    private getChromeKey(): string {
        const useShortProjectLabel = this.platform === 'mobile' && this.getViewportWidth() <= 390;
        return `${this.platform}:${this.activeView}:${useShortProjectLabel ? 'short' : 'full'}`;
    }

    private getViewportWidth(): number {
        const hostWidth = this.hostEl?.getBoundingClientRect().width ?? 0;
        if (hostWidth > 0) return Math.round(hostWidth);
        return getWorkspaceViewportSize(this.app).width;
    }

    private invalidateCaches(scope: ShellRefreshScope): void {
        if (scope === 'all' || scope === 'tasks') {
            this.taskCache = null;
            this.projectCache = null;
        }
        if (scope === 'all' || scope === 'thoughts') {
            this.thoughtCache = null;
        }
        if (scope === 'projects') {
            this.projectCache = null;
        }
        if (scope === 'all' || scope === 'projects') {
            this.projectMilestones.clear();
            this.loadingProjectMilestones.clear();
        }
    }

    private getTaskCache(): TaskCache {
        if (this.taskCache) return this.taskCache;

        const all = this.plugin.getAllTasks();
        const open: TaskEntry[] = [];
        const byProjectKey = new Map<string, TaskEntry[]>();

        all.forEach((task) => {
            if (!isTaskDone(task)) open.push(task);
            const projectKey = task.project?.trim();
            if (!projectKey) return;
            const bucket = byProjectKey.get(projectKey);
            if (bucket) bucket.push(task);
            else byProjectKey.set(projectKey, [task]);
        });

        this.taskCache = {
            all,
            open,
            focus: this.plugin.getTodayFocusTasks(),
            byProjectKey,
        };
        return this.taskCache;
    }

    private getTaskBucketsByProject(): Map<string, TaskEntry[]> {
        return this.getTaskCache().byProjectKey;
    }

    private getOpenTasks(): TaskEntry[] {
        return this.getTaskCache().open;
    }

    private getOpenTaskCount(): number {
        return this.getOpenTasks().length;
    }

    private getFocusTasks(): TaskEntry[] {
        return this.getTaskCache().focus;
    }

    private getThoughtCache(): ThoughtCache {
        if (this.thoughtCache) return this.thoughtCache;

        const all = this.plugin.getAllThoughts();
        this.thoughtCache = {
            all,
            recentTwo: all.slice(0, 2),
            recentThree: all.slice(0, 3),
            filtered: new Map(),
        };
        return this.thoughtCache;
    }

    private getThoughts(): ThoughtEntry[] {
        return this.getThoughtCache().all;
    }

    private getRecentThoughts(limit: 2 | 3): ThoughtEntry[] {
        const cache = this.getThoughtCache();
        return limit === 2 ? cache.recentTwo : cache.recentThree;
    }

    private getProjectCache(): ProjectCache {
        if (this.projectCache) return this.projectCache;

        const collection = Array.from(this.plugin.index.projectIndex.values())
            .filter((project) => project.status !== 'archived')
            .sort((left, right) => {
                const leftOrder = PROJECT_STATUS_ORDER.indexOf(left.status);
                const rightOrder = PROJECT_STATUS_ORDER.indexOf(right.status);
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                return left.name.localeCompare(right.name);
            });

        this.projectCache = {
            collection,
            byId: new Map(collection.map((project) => [project.id, project])),
            filtered: new Map(),
            metrics: new Map(),
            tasks: this.buildProjectTaskMap(collection),
        };
        return this.projectCache;
    }

    private buildProjectTaskMap(projects: ProjectEntry[]): Map<string, TaskEntry[]> {
        const buckets = this.getTaskBucketsByProject();
        const tasksByProject = new Map<string, TaskEntry[]>();

        projects.forEach((project) => {
            const taskMap = new Map<string, TaskEntry>();
            [project.id, project.name]
                .map((value) => value?.trim())
                .filter((value): value is string => !!value)
                .forEach((key) => {
                    buckets.get(key)?.forEach((task) => {
                        taskMap.set(this.getTaskCacheKey(task), task);
                    });
                });
            tasksByProject.set(project.id, Array.from(taskMap.values()));
        });

        return tasksByProject;
    }

    private getProjectSummary(): ProjectSummary {
        const cache = this.getProjectCache();
        if (cache.summary) return cache.summary;

        const today = moment().startOf('day');
        let activeCount = 0;
        let completedCount = 0;
        let openTaskCount = 0;
        let dueSoonCount = 0;

        cache.collection.forEach((project) => {
            if (project.status === 'active') activeCount++;
            if (project.status === 'completed') completedCount++;
            openTaskCount += this.getProjectMetrics(project).openCount;

            if (!project.due || project.status === 'completed') return;
            const due = moment(project.due, ['YYYY-MM-DD', moment.ISO_8601], true);
            if (!due.isValid()) return;
            if (due.isSameOrAfter(today, 'day') && due.diff(today, 'days') <= 7) dueSoonCount++;
        });

        cache.summary = {
            activeCount,
            completedCount,
            openTaskCount,
            dueSoonCount,
        };
        return cache.summary;
    }

    private getProjectById(projectId: string): ProjectEntry | null {
        return this.getProjectCache().byId.get(projectId) ?? null;
    }

    private compareNextProjectTask(left: TaskEntry, right: TaskEntry): number {
        if (left.due && right.due) return left.due.localeCompare(right.due);
        if (left.due) return -1;
        if (right.due) return 1;
        return (right.lastUpdate || 0) - (left.lastUpdate || 0);
    }

    private getTaskCacheKey(task: TaskEntry): string {
        return task.id || task.taskId || task.filePath || `${task.title || task.body || 'task'}:${task.modified || task.created || ''}`;
    }

    private renderSectionHeader(
        container: HTMLElement,
        title: string,
        subtitle?: string,
        count?: string
    ): HTMLElement {
        const head = container.createDiv('diwa-mobile-section-head');
        const copy = head.createDiv('diwa-mobile-section-copy');
        copy.createDiv({ cls: 'diwa-mobile-section-title', text: title });
        if (subtitle) {
            copy.createDiv({ cls: 'diwa-mobile-section-subtitle', text: subtitle });
        }
        if (count) {
            head.createDiv({ cls: 'diwa-mobile-section-count', text: count });
        }
        return head;
    }

    private renderMetricChip(parent: HTMLElement, label: string, value: number | string): void {
        const chip = parent.createDiv('diwa-mobile-hero-stat');
        chip.createDiv({ cls: 'diwa-mobile-hero-stat-value', text: String(value) });
        chip.createDiv({ cls: 'diwa-mobile-hero-stat-label', text: label });
    }

    private renderEmptyState(parent: HTMLElement, iconName: string, title: string, subtitle: string): void {
        const empty = parent.createDiv('diwa-mobile-empty-state');
        const icon = empty.createDiv('diwa-mobile-empty-icon');
        this.applyIcon(icon, iconName);
        empty.createDiv({ cls: 'diwa-mobile-empty-title', text: title });
        empty.createDiv({ cls: 'diwa-mobile-empty-sub', text: subtitle });
    }

    private createActionButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void,
        className: string
    ): HTMLElement {
        const button = parent.createEl('button', {
            cls: className,
            attr: { type: 'button', 'aria-label': label },
        });
        const icon = button.createSpan(`${className}-icon`);
        this.applyIcon(icon, iconName);
        button.addEventListener('click', onClick);
        return button;
    }

    private applyIcon(target: HTMLElement, iconName: string): void {
        try {
            setIcon(target, iconName);
        } catch {
            setIcon(target, 'circle');
        }
    }
}

class MobileContextPickerModal extends Modal {
    constructor(
        app: App,
        private contexts: string[],
        private activeContexts: Set<string>,
        private onApply: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('diwa-context-modal');
        contentEl.empty();

        const wrap = contentEl.createDiv('diwa-context-picker');
        wrap.createDiv({ cls: 'diwa-context-picker-title', text: 'Filter contexts' });
        const list = wrap.createDiv('diwa-context-picker-list');

        this.contexts.forEach((ctx) => {
            const row = list.createDiv('diwa-context-row');
            const checkbox = row.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
            checkbox.checked = this.activeContexts.has(ctx);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) this.activeContexts.add(ctx);
                else this.activeContexts.delete(ctx);
            });
            row.createDiv({ cls: 'diwa-context-row-label', text: ctx });
        });

        const apply = wrap.createEl('button', {
            cls: 'diwa-btn-primary',
            text: 'Apply',
            attr: { type: 'button' },
        });
        apply.addEventListener('click', () => {
            this.onApply();
            this.close();
        });
    }
}

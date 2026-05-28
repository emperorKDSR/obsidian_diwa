import { App, Modal, TFile, moment, setIcon } from 'obsidian';
import type { TaskEntry, ThoughtEntry, ProjectEntry } from '../types';
import type DiwaPlugin from '../main';
import { isTaskDone } from '../utils';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';

type MobileView = 'home' | 'tasks' | 'projects' | 'thoughts' | 'ai';
export type ShellPlatform = 'mobile' | 'tablet' | 'desktop';
type ProjectFilter = 'all' | 'active' | 'on-hold' | 'completed';

interface ShellNavItem {
    id: MobileView;
    label: string;
    icon: string;
    shortLabel?: string;
    ariaLabel?: string;
}

const SHELL_ITEMS: ShellNavItem[] = [
    { id: 'home', label: 'Home', icon: 'house' },
    { id: 'tasks', label: 'Gawa', icon: 'check-square-2' },
    { id: 'projects', label: 'Projects', shortLabel: 'Proj', ariaLabel: 'Projects', icon: 'folder-kanban' },
    { id: 'thoughts', label: 'Diwa', icon: 'pen-square' },
    { id: 'ai', label: 'AI', icon: 'sparkles' },
];

const PROJECT_FILTERS: { id: ProjectFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'on-hold', label: 'On Hold' },
    { id: 'completed', label: 'Completed' },
];

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

export function getPlatform(app: App): ShellPlatform {
    const isMobile = (app as { isMobile?: boolean }).isMobile ?? false;
    if (!isMobile) return 'desktop';
    const shortEdge = Math.min(screen.width, screen.height);
    return shortEdge >= 768 ? 'tablet' : 'mobile';
}

export class DiwaMobileShell {
    private activeView: MobileView = 'home';
    private activeContexts: Set<string> = new Set();
    private projectFilter: ProjectFilter = 'all';
    private expandedProjectIds: Set<string> = new Set();
    private selectedProjectId: string | null = null;
    private selectedThought: ThoughtEntry | null = null;
    private hostEl: HTMLElement | null = null;
    private shellEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    private navEl: HTMLElement | null = null;
    private tabsEl: HTMLElement | null = null;
    private platform: Exclude<ShellPlatform, 'desktop'>;

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        options: { platform?: Exclude<ShellPlatform, 'desktop'> } = {},
    ) {
        this.platform = options.platform ?? 'mobile';
    }

    public setPlatform(platform: Exclude<ShellPlatform, 'desktop'>): void {
        this.platform = platform;
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
        }
    }

    private refreshView(): void {
        if (!this.contentEl) {
            if (this.hostEl) this.render(this.hostEl);
            return;
        }

        this.renderActiveView(this.contentEl);
        if (this.tabsEl) this.renderTopTabs(this.tabsEl);
        if (this.navEl) this.renderBottomNav(this.navEl);
    }

    private renderActiveView(container: HTMLElement): void {
        container.empty();

        switch (this.activeView) {
            case 'home':
                this.renderHome(container);
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
            case 'ai':
                this.renderAI(container);
                break;
        }
    }

    private switchView(view: MobileView): void {
        if (this.activeView === view) return;
        this.activeView = view;
        this.refreshView();
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
        const focusTasks = this.plugin.getTodayFocusTasks();
        const recentThoughts = this.plugin.getAllThoughts().slice(0, 2);
        const openTasks = this.plugin.getAllTasks().filter((task) => !isTaskDone(task)).length;

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
        this.renderMetricChip(metrics, 'Thoughts', this.plugin.getAllThoughts().length);

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
        const focusTasks = this.plugin.getTodayFocusTasks();
        const recentThoughts = this.plugin.getAllThoughts().slice(0, 3);
        const openTasks = this.plugin.getAllTasks().filter((task) => !isTaskDone(task)).length;

        const hero = wrap.createDiv('diwa-tablet-home-hero diwa-mobile-surface');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Diwa workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'A calm control center for capture and follow-through.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Capture fast, check today’s focus, and jump into thoughts or AI without losing context.',
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
        this.createActionButton(heroActions, 'Review Diwa', 'pen-square', () => this.switchView('thoughts'), 'diwa-mobile-quick-action');
        this.createActionButton(heroActions, 'Open AI', 'sparkles', () => this.switchView('ai'), 'diwa-mobile-quick-action');

        const metrics = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(metrics, 'Focus', focusTasks.length);
        this.renderMetricChip(metrics, 'Open tasks', openTasks);
        this.renderMetricChip(metrics, 'Thoughts', this.plugin.getAllThoughts().length);

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
        const tasks = this.plugin.getAllTasks().filter((task) => !isTaskDone(task));
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
        this.syncSelectedProject(projects);

        if (this.platform === 'tablet') {
            this.renderTabletProjects(container, projects);
            return;
        }

        this.renderMobileProjects(container, projects);
    }

    private renderMobileProjects(container: HTMLElement, projects: ProjectEntry[]): void {
        const wrap = container.createDiv('diwa-mobile-projects');
        const allProjects = this.getProjectCollection();
        const activeCount = allProjects.filter((project) => project.status === 'active').length;
        const openTaskCount = allProjects.reduce((count, project) => count + this.getProjectMetrics(project).openCount, 0);
        const dueSoonCount = allProjects.filter((project) => {
            if (!project.due || project.status === 'completed') return false;
            const due = moment(project.due, ['YYYY-MM-DD', moment.ISO_8601], true);
            return due.isValid() && due.isSameOrAfter(moment().startOf('day'), 'day') && due.diff(moment().startOf('day'), 'days') <= 7;
        }).length;

        const hero = wrap.createDiv('diwa-mobile-hero diwa-mobile-project-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Project workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'Keep initiatives moving without losing the thread.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Shape outcomes, track the next task, and keep every project touch-safe on the go.',
        });

        const heroActions = hero.createDiv('diwa-mobile-project-actions');
        this.createProjectButton(heroActions, 'New project', 'plus', () => this.openNewProjectModal(), true);
        this.createProjectButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'));

        const metrics = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(metrics, 'Active', activeCount);
        this.renderMetricChip(metrics, 'Open tasks', openTaskCount);
        this.renderMetricChip(metrics, 'Due soon', dueSoonCount);

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

    private renderTabletProjects(container: HTMLElement, projects: ProjectEntry[]): void {
        const wrap = container.createDiv('diwa-tablet-projects');
        const allProjects = this.getProjectCollection();
        const hero = wrap.createDiv('diwa-mobile-surface diwa-tablet-projects-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Project workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: 'A calmer planning surface for active initiatives.' });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Browse your projects on the left and keep the next actions, status, and note access anchored on the right.',
        });
        const heroActions = hero.createDiv('diwa-tablet-home-actions');
        this.createProjectButton(heroActions, 'New project', 'plus', () => this.openNewProjectModal(), true);
        this.createProjectButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'));
        this.createProjectButton(heroActions, 'Review Diwa', 'pen-square', () => this.switchView('thoughts'));

        const heroStats = hero.createDiv('diwa-mobile-hero-stats');
        this.renderMetricChip(heroStats, 'Active', allProjects.filter((project) => project.status === 'active').length);
        this.renderMetricChip(heroStats, 'Open tasks', allProjects.reduce((count, project) => count + this.getProjectMetrics(project).openCount, 0));
        this.renderMetricChip(heroStats, 'Completed', allProjects.filter((project) => project.status === 'completed').length);

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
        const selectedProject = projects.find((project) => project.id === this.selectedProjectId) ?? projects[0] ?? null;
        this.renderTabletProjectDetail(detailPane, selectedProject);
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
        const isExpanded = this.expandedProjectIds.has(project.id);
        const card = parent.createDiv(`diwa-mobile-project-card${isExpanded ? ' is-expanded' : ''}`);
        card.style.setProperty('--project-color', project.color || 'var(--interactive-accent)');

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
        this.createProjectButton(actions, 'Open', 'file-text', () => { void this.openProjectFile(project); });
        this.createProjectButton(actions, 'Edit', 'pencil', () => this.openEditProjectModal(project));
        this.createProjectButton(actions, isExpanded ? 'Hide' : 'Details', isExpanded ? 'chevron-up' : 'chevron-down', () => {
            this.toggleProjectExpanded(project.id);
        }, true, false);

        if (!isExpanded) return;

        const detail = card.createDiv('diwa-mobile-project-card__detail');
        const statusRow = detail.createDiv('diwa-mobile-project-card__status-row');
        PROJECT_FILTERS.filter((filter) => filter.id !== 'all').forEach((statusOption) => {
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

        const taskSection = detail.createDiv('diwa-mobile-project-card__task-list');
        if (metrics.openTasks.length === 0) {
            this.renderEmptyState(
                taskSection,
                'sparkles',
                'Nothing open',
                'Linked tasks will land here as the project grows.'
            );
        } else {
            metrics.openTasks.slice(0, 3).forEach((task) => {
                this.plugin.renderTaskRow(taskSection, task, { mobile: true, compact: true });
            });
        }

        const detailActions = detail.createDiv('diwa-mobile-project-card__actions');
        this.createProjectButton(detailActions, 'Note', 'link', () => { void this.openProjectFile(project); });
        this.createProjectButton(detailActions, 'Archive', 'archive', () => { void this.archiveProject(project); }, false, true);
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

    private renderTabletProjectDetail(parent: HTMLElement, project: ProjectEntry | null): void {
        this.renderSectionHeader(
            parent,
            'Project detail',
            project ? 'A wider planning surface for the selected initiative' : 'Select a project to inspect details',
        );

        if (!project) {
            this.renderEmptyState(
                parent,
                'folder-kanban',
                'Nothing selected',
                'Choose a project on the left to review its status, next tasks, and quick actions.'
            );
            return;
        }

        const metrics = this.getProjectMetrics(project);
        const detail = parent.createDiv('diwa-tablet-project-detail');
        detail.style.setProperty('--project-color', project.color || 'var(--interactive-accent)');

        const detailHeader = detail.createDiv('diwa-tablet-project-detail__header');
        const titleCopy = detailHeader.createDiv('diwa-tablet-project-detail__copy');
        titleCopy.createDiv({ cls: 'diwa-tablet-project-detail__eyebrow', text: PROJECT_STATUS_LABELS[project.status] });
        titleCopy.createDiv({ cls: 'diwa-tablet-project-detail__title', text: project.name });
        detailHeader.createDiv({ cls: `diwa-mobile-project-status diwa-mobile-project-status--${project.status}`, text: PROJECT_STATUS_LABELS[project.status] });

        detail.createDiv({
            cls: 'diwa-tablet-project-detail__body',
            text: project.goal || 'No project outcome has been captured yet.',
        });

        const metricRow = detail.createDiv('diwa-tablet-project-detail__metrics');
        this.renderDetailMetric(metricRow, 'Open tasks', String(metrics.openCount));
        this.renderDetailMetric(metricRow, 'Done', String(metrics.doneCount));
        this.renderDetailMetric(metricRow, 'Due', project.due ? this.formatDate(project.due) : 'Not set', project.due ? this.isDateOverdue(project.due) : false);

        const statusRow = detail.createDiv('diwa-mobile-project-card__status-row');
        PROJECT_FILTERS.filter((filter) => filter.id !== 'all').forEach((statusOption) => {
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

        const taskList = detail.createDiv('diwa-tablet-project-detail__tasks');
        this.renderSectionHeader(
            taskList,
            'Next work',
            metrics.openTasks.length === 0 ? 'No linked tasks are currently open' : 'Task previews stay touch-safe and actionable',
            `${metrics.openTasks.length}`,
        );
        if (metrics.openTasks.length === 0) {
            this.renderEmptyState(
                taskList,
                'sparkles',
                'All clear',
                'Link or create project tasks in Gawa and they will appear here automatically.'
            );
        } else {
            const taskFeed = taskList.createDiv('diwa-mobile-project-card__task-list');
            metrics.openTasks.slice(0, 4).forEach((task) => {
                this.plugin.renderTaskRow(taskFeed, task, { mobile: true, compact: true });
            });
        }

        const actions = detail.createDiv('diwa-tablet-project-detail__actions');
        this.createProjectButton(actions, 'Open note', 'file-text', () => { void this.openProjectFile(project); }, true);
        this.createProjectButton(actions, 'Edit project', 'pencil', () => this.openEditProjectModal(project));
        this.createProjectButton(actions, 'Archive', 'archive', () => { void this.archiveProject(project); }, false, true);
    }

    private renderProjectMetricChip(parent: HTMLElement, label: string, urgent = false): void {
        parent.createDiv({
            cls: `diwa-mobile-project-chip${urgent ? ' is-urgent' : ''}`,
            text: label,
        });
    }

    private renderDetailMetric(parent: HTMLElement, label: string, value: string, urgent = false): void {
        const metric = parent.createDiv(`diwa-tablet-project-detail__metric${urgent ? ' is-urgent' : ''}`);
        metric.createDiv({ cls: 'diwa-tablet-project-detail__metric-label', text: label });
        metric.createDiv({ cls: 'diwa-tablet-project-detail__metric-value', text: value });
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
            this.expandedProjectIds.add(entry.id);
            this.refreshView();
        }).open();
    }

    private openEditProjectModal(project: ProjectEntry): void {
        new EditProjectModal(this.app, this.plugin.vault, project, (updated) => {
            this.plugin.index.projectIndex.set(updated.id, updated);
            this.selectedProjectId = updated.id;
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
        this.refreshView();
    }

    private async archiveProject(project: ProjectEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(project.filePath);
        if (!(file instanceof TFile)) return;
        await this.plugin.vault.archiveProject(file);
        this.plugin.index.projectIndex.delete(project.id);
        this.expandedProjectIds.delete(project.id);
        if (this.selectedProjectId === project.id) this.selectedProjectId = null;
        this.refreshView();
    }

    private toggleProjectExpanded(projectId: string): void {
        if (this.expandedProjectIds.has(projectId)) this.expandedProjectIds.delete(projectId);
        else this.expandedProjectIds.add(projectId);
        this.refreshView();
    }

    private syncSelectedProject(projects: ProjectEntry[]): void {
        if (projects.length === 0) {
            this.selectedProjectId = null;
            return;
        }
        if (!this.selectedProjectId || !projects.some((project) => project.id === this.selectedProjectId)) {
            this.selectedProjectId = projects[0].id;
        }
    }

    private getFilteredProjects(): ProjectEntry[] {
        const projects = this.getProjectCollection();
        if (this.projectFilter === 'all') return projects;
        return projects.filter((project) => project.status === this.projectFilter);
    }

    private getProjectCollection(): ProjectEntry[] {
        return Array.from(this.plugin.index.projectIndex.values())
            .filter((project) => project.status !== 'archived')
            .sort((left, right) => {
                const statusOrder: ProjectEntry['status'][] = ['active', 'on-hold', 'completed', 'archived'];
                const leftOrder = statusOrder.indexOf(left.status);
                const rightOrder = statusOrder.indexOf(right.status);
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                return left.name.localeCompare(right.name);
            });
    }

    private getProjectMetrics(project: ProjectEntry): ProjectMetrics {
        const tasks = this.plugin.getAllTasks().filter((task) => task.project === project.id || task.project === project.name);
        const openTasks = tasks.filter((task) => !isTaskDone(task));
        const nextTask = openTasks.slice().sort((left, right) => {
            if (left.due && right.due) return left.due.localeCompare(right.due);
            if (left.due) return -1;
            if (right.due) return 1;
            return (right.lastUpdate || 0) - (left.lastUpdate || 0);
        })[0];
        return {
            tasks,
            openTasks,
            openCount: openTasks.length,
            doneCount: tasks.length - openTasks.length,
            nextTask,
        };
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
        const thoughts = this.filterThoughts(this.plugin.getAllThoughts(), this.activeContexts);
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
        return thoughts.filter((thought) => (thought.context ?? []).some((ctx) => activeContexts.has(ctx)));
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

    private renderAI(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-ai');
        const shell = wrap.createDiv('diwa-mobile-ai-shell');
        this.renderSectionHeader(shell, 'AI companion', 'Insight, planning, and recall from your vault');
        const content = shell.createDiv('diwa-mobile-ai-body');
        this.plugin.renderAIView(content);
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
        const useShortProjectLabel = this.platform === 'mobile' && window.innerWidth <= 390;
        return SHELL_ITEMS.map((item) => ({
            ...item,
            label: item.id === 'projects' && useShortProjectLabel ? (item.shortLabel ?? item.label) : item.label,
        }));
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

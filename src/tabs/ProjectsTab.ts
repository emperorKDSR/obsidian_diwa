import { moment, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';
import type { ProjectEntry, Milestone, TaskEntry } from '../types';
import { isTaskDone } from '../utils';

type ProjectFilter = 'all' | 'active' | 'on-hold' | 'completed';

type ProjectMetrics = {
    tasks: TaskEntry[];
    openTasks: TaskEntry[];
    openCount: number;
    doneCount: number;
    totalCount: number;
    nextTask?: TaskEntry;
};

const FILTER_LABELS: { val: ProjectFilter; label: string }[] = [
    { val: 'all', label: 'All' },
    { val: 'active', label: 'Active' },
    { val: 'on-hold', label: 'On Hold' },
    { val: 'completed', label: 'Completed' },
];

const STATUS_ORDER: ProjectEntry['status'][] = ['active', 'on-hold', 'completed', 'archived'];

const STATUS_LABELS: Record<ProjectEntry['status'], string> = {
    active: 'Active',
    'on-hold': 'On Hold',
    completed: 'Completed',
    archived: 'Archived',
};

export class ProjectsTab extends BaseTab {
    private filter: ProjectFilter = 'all';
    private expandedIds: Set<string> = new Set();

    constructor(view: DiwaView) {
        super(view);
    }

    render(container: HTMLElement): void {
        container.empty();
        const shell = container.createDiv('diwa-projects-shell');
        const allProjects = this.getProjects();
        const visibleProjects = this.getVisibleProjects(allProjects);

        this.renderHeader(shell, allProjects, visibleProjects, container);
        this.renderToolbar(shell, visibleProjects.length, allProjects.length, container);

        if (visibleProjects.length === 0) {
            this.renderProjectsEmptyState(shell, container);
            return;
        }

        const board = shell.createDiv('diwa-projects-board');
        visibleProjects.forEach((project) => this.renderCard(board, project, container));
    }

    private renderHeader(
        parent: HTMLElement,
        allProjects: ProjectEntry[],
        visibleProjects: ProjectEntry[],
        rootContainer: HTMLElement,
    ): void {
        const activeCount = allProjects.filter((project) => project.status === 'active').length;
        const openTaskCount = allProjects.reduce((count, project) => count + this.getProjectMetrics(project).openCount, 0);
        const dueSoonCount = allProjects.filter((project) => {
            if (!project.due || project.status === 'completed') return false;
            const due = moment(project.due, ['YYYY-MM-DD', moment.ISO_8601], true);
            return due.isValid() && due.isSameOrAfter(moment().startOf('day'), 'day') && due.diff(moment().startOf('day'), 'days') <= 7;
        }).length;

        const header = parent.createDiv('diwa-projects-header diwa-gawa-workspace-bar');
        const identity = header.createDiv('diwa-projects-header__identity diwa-gawa-workspace-bar-left');
        identity.createEl('span', { text: 'Project workspace', cls: 'diwa-gawa-workspace-eyebrow' });
        const titleGroup = identity.createDiv('diwa-gawa-header-title-group diwa-gawa-workspace-identity');
        titleGroup.createEl('h2', { text: 'Projects', cls: 'diwa-gawa-header-title' });
        titleGroup.createEl('span', {
            text: visibleProjects.length === allProjects.length
                ? `${activeCount} active initiatives with ${openTaskCount} open tasks`
                : `${visibleProjects.length} projects in view`,
            cls: 'diwa-gawa-header-subtitle',
        });

        const statStrip = header.createDiv('diwa-projects-header__stats diwa-gawa-progress-strip');
        this.renderHeaderStat(statStrip, 'Active', activeCount, 'focus');
        this.renderHeaderStat(statStrip, 'Open tasks', openTaskCount, 'done');
        this.renderHeaderStat(statStrip, 'Due soon', dueSoonCount, 'overdue');

        const actions = header.createDiv('diwa-projects-actions diwa-gawa-header-actions diwa-gawa-workspace-bar-right');
        this.buildHeaderButton(actions, 'Refresh', 'refresh-cw', async () => {
            await this.index.buildProjectIndex();
            this.render(rootContainer);
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        this.buildHeaderButton(actions, 'New project', 'plus', () => {
            new NewProjectModal(this.app, this.vault, (entry) => {
                this.index.projectIndex.set(entry.id, entry);
                this.filter = 'all';
                this.expandedIds.add(entry.id);
                this.render(rootContainer);
            }).open();
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--primary');
    }

    private renderHeaderStat(parent: HTMLElement, label: string, value: number, modifier: 'done' | 'focus' | 'overdue'): void {
        const chip = parent.createDiv(`diwa-gawa-stat-chip diwa-gawa-stat-chip--${modifier}`);
        chip.createEl('span', { cls: 'diwa-gawa-stat-chip-label', text: label });
        chip.createEl('span', { cls: 'diwa-gawa-stat-chip-value', text: String(value) });
    }

    private renderToolbar(parent: HTMLElement, visibleCount: number, totalCount: number, rootContainer: HTMLElement): void {
        const toolbar = parent.createDiv('diwa-projects-toolbar');
        const filters = toolbar.createDiv('diwa-projects-filter-row');
        FILTER_LABELS.forEach((filter) => {
            const count = filter.val === 'all'
                ? totalCount
                : this.getProjects().filter((project) => project.status === filter.val).length;
            const pill = filters.createEl('button', {
                cls: `diwa-projects-filter-pill${filter.val === this.filter ? ' is-active' : ''}`,
                attr: { type: 'button' },
            });
            pill.createSpan({ cls: 'diwa-projects-filter-pill__label', text: filter.label });
            pill.createSpan({ cls: 'diwa-projects-filter-pill__count', text: String(count) });
            pill.addEventListener('click', () => {
                this.filter = filter.val;
                this.render(rootContainer);
            });
        });

        toolbar.createDiv({
            cls: 'diwa-projects-summary',
            text: visibleCount === totalCount
                ? 'All active-facing projects are ready in one view.'
                : `Showing ${visibleCount} of ${totalCount} projects.`,
        });
    }

    private renderProjectsEmptyState(parent: HTMLElement, rootContainer: HTMLElement): void {
        const empty = parent.createDiv('diwa-projects-empty-surface diwa-project-empty-state');
        const icon = empty.createDiv('diwa-project-empty-icon');
        setIcon(icon, 'folder-kanban');
        empty.createEl('h3', { text: 'No projects in this lane yet', cls: 'diwa-project-empty-title' });
        empty.createEl('p', {
            text: this.filter === 'all'
                ? 'Create a project to start shaping multi-step work into a calmer workspace.'
                : `No ${FILTER_LABELS.find((filter) => filter.val === this.filter)?.label.toLowerCase()} projects yet. Create one or switch filters.`,
            cls: 'diwa-project-empty-body',
        });
        this.buildActionButton(empty, 'Create project', 'plus', () => {
            new NewProjectModal(this.app, this.vault, (entry) => {
                this.index.projectIndex.set(entry.id, entry);
                this.filter = 'all';
                this.expandedIds.add(entry.id);
                this.render(rootContainer);
            }).open();
        }, 'diwa-project-action-btn diwa-project-action-btn--primary');
    }

    private renderCard(list: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        const metrics = this.getProjectMetrics(project);
        const card = list.createDiv({ cls: `diwa-project-card diwa-project-card--${project.status}` });
        card.style.setProperty('--project-color', project.color || 'var(--interactive-accent)');

        const header = card.createDiv('diwa-project-card__head');
        const identity = header.createDiv('diwa-project-card__identity');
        identity.createDiv('diwa-project-card__swatch');
        const copy = identity.createDiv('diwa-project-card__copy');
        copy.createEl('span', {
            text: project.status === 'completed'
                ? 'Completed initiative'
                : project.due
                    ? `Due ${moment(project.due, ['YYYY-MM-DD', moment.ISO_8601], true).isValid() ? moment(project.due).format('MMM D') : project.due}`
                    : 'Active project lane',
            cls: 'diwa-project-card__eyebrow',
        });
        copy.createEl('h3', { text: project.name, cls: 'diwa-project-card__name' });

        const headerActions = header.createDiv('diwa-project-card__header-actions');
        const statusBtn = headerActions.createEl('button', {
            cls: `diwa-project-status-btn diwa-project-status-btn--${project.status}`,
            text: STATUS_LABELS[project.status],
            attr: { type: 'button', 'aria-label': `Change status for ${project.name}` },
        });
        statusBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openStatusPicker(statusBtn, project, rootContainer);
        });
        this.buildIconButton(headerActions, 'Edit project', 'pencil', () => {
            new EditProjectModal(this.app, this.vault, project, (updated) => {
                this.index.projectIndex.set(updated.id, updated);
                this.render(rootContainer);
            }).open();
        });

        if (project.goal) {
            card.createEl('p', { text: project.goal, cls: 'diwa-project-card__goal' });
        }

        const stats = card.createDiv('diwa-project-card__stats');
        this.renderCardStat(stats, 'Open', metrics.openCount);
        this.renderCardStat(stats, 'Done', metrics.doneCount);
        this.renderCardStat(stats, 'Tasks', metrics.totalCount);
        if (project.due) {
            const due = moment(project.due, ['YYYY-MM-DD', moment.ISO_8601], true);
            this.renderCardStat(stats, 'Due', due.isValid() ? due.format('MMM D') : project.due, due.isValid() && due.isBefore(moment(), 'day'));
        }

        if (metrics.totalCount > 0) {
            const progress = Math.round((metrics.doneCount / metrics.totalCount) * 100);
            const progressRow = card.createDiv('diwa-project-card__progress');
            progressRow.createDiv({ cls: 'diwa-project-card__progress-label', text: `Task completion · ${progress}%` });
            const track = progressRow.createDiv('diwa-project-card__progress-track');
            const bar = track.createDiv('diwa-project-card__progress-bar');
            bar.style.width = `${progress}%`;
        }

        if (metrics.nextTask) {
            const nextRow = card.createDiv('diwa-project-card__next');
            nextRow.createDiv({ cls: 'diwa-project-card__next-label', text: 'Next up' });
            nextRow.createDiv({ cls: 'diwa-project-card__next-title', text: metrics.nextTask.title || metrics.nextTask.body || 'Untitled task' });
        }

        const footer = card.createDiv('diwa-project-card__footer');
        this.buildActionButton(footer, 'Open note', 'file-text', () => {
            void this.openProjectNote(project);
        }, 'diwa-project-action-btn');
        const toggleLabel = this.expandedIds.has(project.id) ? 'Hide details' : 'Show details';
        this.buildActionButton(footer, toggleLabel, this.expandedIds.has(project.id) ? 'chevron-up' : 'chevron-down', () => {
            if (this.expandedIds.has(project.id)) this.expandedIds.delete(project.id);
            else this.expandedIds.add(project.id);
            this.render(rootContainer);
        }, 'diwa-project-action-btn diwa-project-action-btn--primary');

        const isExpanded = this.expandedIds.has(project.id);
        const expandPanel = card.createDiv({ cls: `diwa-project-card__expand${isExpanded ? ' is-open' : ''}` });
        if (isExpanded) {
            this.renderExpandPanel(expandPanel, project, metrics, rootContainer);
        }
    }

    private renderCardStat(parent: HTMLElement, label: string, value: string | number, isUrgent = false): void {
        const stat = parent.createDiv(`diwa-project-card__stat${isUrgent ? ' is-urgent' : ''}`);
        stat.createDiv({ cls: 'diwa-project-card__stat-label', text: label });
        stat.createDiv({ cls: 'diwa-project-card__stat-value', text: String(value) });
    }

    private renderExpandPanel(
        panel: HTMLElement,
        project: ProjectEntry,
        metrics: ProjectMetrics,
        rootContainer: HTMLElement,
    ): void {
        panel.empty();

        const tasksSection = panel.createDiv('diwa-project-card__section');
        const tasksHeader = tasksSection.createDiv('diwa-project-card__section-header');
        tasksHeader.createDiv({ cls: 'diwa-project-card__section-title', text: 'Open tasks' });
        tasksHeader.createDiv({
            cls: 'diwa-project-card__section-caption',
            text: metrics.openCount === 0 ? 'Nothing open right now' : `${metrics.openCount} task${metrics.openCount === 1 ? '' : 's'} still moving`,
        });

        if (metrics.openTasks.length === 0) {
            tasksSection.createDiv({
                cls: 'diwa-project-task-empty',
                text: 'This project is clear for now. New linked tasks will appear here automatically.',
            });
        } else {
            const taskList = tasksSection.createDiv('diwa-project-expand__tasks');
            metrics.openTasks.slice(0, 5).forEach((task) => {
                const row = taskList.createDiv('diwa-project-expand__task-row');
                const dot = row.createDiv('diwa-project-expand__dot');
                setIcon(dot, 'arrow-right');
                row.createDiv({ cls: 'diwa-project-expand__task-title', text: task.title || task.body || 'Untitled task' });
                if (task.due) {
                    row.createDiv({
                        cls: 'diwa-chip diwa-chip--date diwa-chip--sm',
                        text: moment(task.due, ['YYYY-MM-DD', moment.ISO_8601], true).isValid() ? moment(task.due).format('MMM D') : task.due,
                    });
                }
            });
        }

        const actions = panel.createDiv('diwa-project-expand__actions');
        this.buildActionButton(actions, 'Open note', 'file-text', () => {
            void this.openProjectNote(project);
        }, 'diwa-project-action-btn');
        this.buildActionButton(actions, 'Edit project', 'pencil', () => {
            new EditProjectModal(this.app, this.vault, project, (updated) => {
                this.index.projectIndex.set(updated.id, updated);
                this.render(rootContainer);
            }).open();
        }, 'diwa-project-action-btn');
        this.buildActionButton(actions, 'Archive', 'archive', async () => {
            const file = this.app.vault.getAbstractFileByPath(project.filePath);
            if (!(file instanceof TFile)) return;
            await this.vault.archiveProject(file);
            this.index.projectIndex.delete(project.id);
            this.expandedIds.delete(project.id);
            this.render(rootContainer);
        }, 'diwa-project-action-btn diwa-project-action-btn--danger');

        this.renderMilestonesSection(panel, project, rootContainer);
    }

    private renderMilestonesSection(panel: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        const wrap = panel.createDiv('diwa-milestones-wrap');
        const toggle = wrap.createEl('button', {
            cls: 'diwa-milestones-toggle',
            attr: { type: 'button' },
        });
        const toggleIcon = toggle.createSpan('diwa-milestones-toggle__icon');
        setIcon(toggleIcon, 'chevron-right');
        toggle.createSpan({ text: 'Milestones' });

        const body = wrap.createDiv('diwa-milestones-body');
        body.style.display = 'none';

        let isOpen = false;
        const updateToggle = () => {
            toggleIcon.empty();
            setIcon(toggleIcon, isOpen ? 'chevron-down' : 'chevron-right');
        };
        updateToggle();

        toggle.addEventListener('click', () => {
            isOpen = !isOpen;
            updateToggle();
            body.style.display = isOpen ? '' : 'none';
            if (isOpen) this.loadAndRenderMilestones(body, project, rootContainer);
        });
    }

    private loadAndRenderMilestones(container: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        container.empty();
        const loading = container.createEl('span', { text: 'Loading milestones…', cls: 'diwa-milestones-loading' });
        this.vault.readMilestones(project.filePath).then((milestones) => {
            loading.remove();
            this.renderMilestonesBody(container, milestones, project, rootContainer);
        }).catch(() => {
            loading.textContent = 'Failed to load milestones.';
        });
    }

    private renderMilestonesBody(container: HTMLElement, milestones: Milestone[], project: ProjectEntry, rootContainer: HTMLElement): void {
        container.empty();
        const done = milestones.filter((milestone) => milestone.done).length;
        const total = milestones.length;

        if (total > 0) {
            const progressWrap = container.createDiv('diwa-milestone-progress-wrap');
            progressWrap.createEl('span', { text: `${done}/${total} complete`, cls: 'diwa-milestone-progress-label' });
            const track = progressWrap.createDiv('diwa-milestone-progress-track');
            const bar = track.createDiv('diwa-milestone-progress');
            bar.style.width = `${Math.round((done / total) * 100)}%`;
        }

        if (milestones.length === 0) {
            container.createDiv({
                cls: 'diwa-project-task-empty',
                text: 'No milestones yet. Add one below to make the project feel tangible.',
            });
        } else {
            milestones.forEach((milestone, idx) => {
                const row = container.createDiv('diwa-milestone-row');
                const checkbox = row.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
                checkbox.checked = milestone.done;
                checkbox.addEventListener('change', async () => {
                    milestones[idx].done = checkbox.checked;
                    await this.vault.writeMilestones(project.filePath, milestones);
                    this.renderMilestonesBody(container, milestones, project, rootContainer);
                });
                row.createEl('span', {
                    text: milestone.title,
                    cls: `diwa-milestone-title${milestone.done ? ' is-done' : ''}`,
                });
                if (milestone.dueDate) {
                    row.createEl('span', {
                        text: moment(milestone.dueDate, ['YYYY-MM-DD', moment.ISO_8601], true).isValid()
                            ? moment(milestone.dueDate).format('MMM D')
                            : milestone.dueDate,
                        cls: 'diwa-chip diwa-chip--date diwa-chip--sm',
                    });
                }
            });
        }

        const addRow = container.createDiv('diwa-milestone-add-row');
        const titleInput = addRow.createEl('input', {
            cls: 'diwa-milestone-add-input',
            attr: { type: 'text', placeholder: 'New milestone…' },
        }) as HTMLInputElement;
        const dateInput = addRow.createEl('input', {
            cls: 'diwa-milestone-add-date',
            attr: { type: 'date' },
        }) as HTMLInputElement;
        const addBtn = addRow.createEl('button', {
            text: 'Add',
            cls: 'diwa-project-action-btn',
            attr: { type: 'button' },
        });
        addBtn.addEventListener('click', async () => {
            const title = titleInput.value.trim();
            if (!title) return;
            const newMilestone: Milestone = {
                id: `m-${Date.now()}`,
                title,
                done: false,
                dueDate: dateInput.value || undefined,
            };
            milestones.push(newMilestone);
            await this.vault.writeMilestones(project.filePath, milestones);
            titleInput.value = '';
            dateInput.value = '';
            this.renderMilestonesBody(container, milestones, project, rootContainer);
        });
        titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter') addBtn.click();
        });
    }

    private openStatusPicker(anchor: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        const existing = document.querySelector('.diwa-status-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'diwa-status-picker';

        const statuses: ProjectEntry['status'][] = ['active', 'on-hold', 'completed'];
        statuses.forEach((status) => {
            const option = picker.createEl('button', {
                cls: `diwa-status-picker__opt${status === project.status ? ' is-current' : ''}`,
                attr: { type: 'button' },
            });
            option.createSpan({ cls: 'diwa-status-picker__dot' });
            option.createSpan({ text: STATUS_LABELS[status] });
            option.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(project.filePath);
                if (file instanceof TFile) {
                    await this.vault.updateProject(file, { status });
                    project.status = status;
                    this.index.projectIndex.set(project.id, project);
                }
                picker.remove();
                this.render(rootContainer);
            });
        });

        document.body.appendChild(picker);

        const rect = anchor.getBoundingClientRect();
        const pickerWidth = 200;
        let left = Math.min(rect.left, window.innerWidth - pickerWidth - 12);
        left = Math.max(12, left);
        let top = rect.bottom + 8;
        const pickerHeight = picker.offsetHeight || 160;
        if (top + pickerHeight > window.innerHeight - 12) {
            top = Math.max(12, rect.top - pickerHeight - 8);
        }
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        const close = (event: MouseEvent) => {
            if (!picker.contains(event.target as Node)) {
                picker.remove();
                document.removeEventListener('click', close, true);
            }
        };
        setTimeout(() => document.addEventListener('click', close, true), 10);
    }

    private buildHeaderButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void | Promise<void>,
        className: string,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: className,
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        setIcon(button, iconName);
        button.createEl('span', { text: label });
        button.addEventListener('click', () => { void onClick(); });
        return button;
    }

    private buildActionButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void | Promise<void>,
        className: string,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: className,
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        const icon = button.createSpan('diwa-project-action-btn__icon');
        setIcon(icon, iconName);
        button.createSpan({ text: label });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void onClick();
        });
        return button;
    }

    private buildIconButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void | Promise<void>,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'diwa-project-icon-btn',
            attr: { type: 'button', 'aria-label': label, title: label },
        }) as HTMLButtonElement;
        setIcon(button, iconName);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void onClick();
        });
        return button;
    }

    private async openProjectNote(project: ProjectEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(project.filePath);
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    private getProjects(): ProjectEntry[] {
        return Array.from(this.index.projectIndex.values())
            .filter((project) => project.status !== 'archived')
            .sort((left, right) => {
                const leftOrder = STATUS_ORDER.indexOf(left.status);
                const rightOrder = STATUS_ORDER.indexOf(right.status);
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
                return left.name.localeCompare(right.name);
            });
    }

    private getVisibleProjects(projects: ProjectEntry[]): ProjectEntry[] {
        if (this.filter === 'all') return projects;
        return projects.filter((project) => project.status === this.filter);
    }

    private getProjectMetrics(project: ProjectEntry): ProjectMetrics {
        const tasks = Array.from(this.index.taskIndex.values())
            .filter((task) => task.project === project.id || task.project === project.name);
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
            doneCount: tasks.filter((task) => isTaskDone(task)).length,
            totalCount: tasks.length,
            nextTask,
        };
    }
}

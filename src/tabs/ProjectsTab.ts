import { Notice, moment, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';
import { EditTaskModal } from '../modals/EditTaskModal';
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

type MilestoneTaskStats = {
    total: number;
    open: number;
};

type MilestoneRenderOptions = {
    variant?: 'board' | 'focus';
    selectedMilestoneId?: string | null;
    onSelectMilestone?: (milestoneId: string | null) => void;
    taskStats?: Map<string, MilestoneTaskStats>;
    unassignedCount?: number;
    onPersist?: () => void;
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
    private openMilestoneIds: Set<string> = new Set();
    private readonly focusMilestones: Map<string, Milestone[]> = new Map();
    private readonly loadingMilestones: Map<string, Promise<Milestone[]>> = new Map();
    private readonly selectedMilestoneIds: Map<string, string | null> = new Map();
    private readonly projectTaskCache: Map<string, TaskEntry[]> = new Map();
    private readonly projectMetricsCache: Map<string, ProjectMetrics> = new Map();
    private readonly projectTaskBuckets: Map<string, TaskEntry[]> = new Map();
    private statusPickerEl: HTMLElement | null = null;
    private statusPickerCloseHandler: ((event: MouseEvent) => void) | null = null;
    private statusPickerDocument: Document | null = null;

    constructor(view: DiwaView) {
        super(view);
    }

    onunload(): void {
        this.closeStatusPicker();
        super.onunload();
    }

    render(container: HTMLElement): void {
        this.resetProjectRenderCaches();
        container.empty();
        const shell = container.createDiv('diwa-projects-shell');
        const allProjects = this.getProjects();
        const focusedProject = this.view.focusedProjectId
            ? allProjects.find((project) => project.id === this.view.focusedProjectId) ?? null
            : null;

        if (this.view.focusedProjectId && !focusedProject) {
            this.view.focusedProjectId = null;
        }

        if (focusedProject) {
            shell.addClass('diwa-projects-shell--focus');
            this.renderFocusWorkspace(shell, focusedProject, container);
            return;
        }

        const visibleProjects = this.getVisibleProjects(allProjects);
        this.renderHeader(shell, allProjects, visibleProjects, container);
        this.renderToolbar(shell, allProjects, visibleProjects.length, container);

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
            await this.refreshProjects(rootContainer);
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        this.buildHeaderButton(actions, 'New project', 'plus', () => {
            new NewProjectModal(this.app, this.vault, (entry) => {
                this.index.projectIndex.set(entry.id, entry);
                this.filter = 'all';
                this.expandedIds.add(entry.id);
                this.focusMilestones.delete(entry.id);
                this.render(rootContainer);
            }).open();
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--primary');
    }

    private renderHeaderStat(parent: HTMLElement, label: string, value: number, modifier: 'done' | 'focus' | 'overdue'): void {
        const chip = parent.createDiv(`diwa-gawa-stat-chip diwa-gawa-stat-chip--${modifier}`);
        chip.createEl('span', { cls: 'diwa-gawa-stat-chip-label', text: label });
        chip.createEl('span', { cls: 'diwa-gawa-stat-chip-value', text: String(value) });
    }

    private renderToolbar(
        parent: HTMLElement,
        allProjects: ProjectEntry[],
        visibleCount: number,
        rootContainer: HTMLElement,
    ): void {
        const totalCount = allProjects.length;
        const counts = allProjects.reduce<Record<ProjectFilter, number>>((acc, project) => {
            if (project.status === 'active' || project.status === 'on-hold' || project.status === 'completed') {
                acc[project.status] += 1;
            }
            return acc;
        }, {
            all: totalCount,
            active: 0,
            'on-hold': 0,
            completed: 0,
        });
        const toolbar = parent.createDiv('diwa-projects-toolbar');
        const filters = toolbar.createDiv('diwa-projects-filter-row');
        FILTER_LABELS.forEach((filter) => {
            const count = counts[filter.val];
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
                this.focusMilestones.delete(entry.id);
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
                    ? `Due ${this.formatDisplayDate(project.due)}`
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
        this.buildActionButton(footer, 'Focus', 'focus', async () => {
            this.view.focusedProjectId = project.id;
            await this.ensureProjectMilestones(project);
            this.render(rootContainer);
        }, 'diwa-project-action-btn diwa-project-action-btn--primary');
        this.buildActionButton(footer, 'Open note', 'file-text', () => {
            void this.openProjectNote(project);
        }, 'diwa-project-action-btn');
        const toggleLabel = this.expandedIds.has(project.id) ? 'Hide details' : 'Show details';
        this.buildActionButton(footer, toggleLabel, this.expandedIds.has(project.id) ? 'chevron-up' : 'chevron-down', () => {
            if (this.expandedIds.has(project.id)) this.expandedIds.delete(project.id);
            else this.expandedIds.add(project.id);
            this.render(rootContainer);
        }, 'diwa-project-action-btn');

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
                        text: this.formatDisplayDate(task.due),
                    });
                }
            });
        }

        const actions = panel.createDiv('diwa-project-expand__actions');
        this.buildActionButton(actions, 'Focus workspace', 'focus', async () => {
            this.view.focusedProjectId = project.id;
            await this.ensureProjectMilestones(project);
            this.render(rootContainer);
        }, 'diwa-project-action-btn diwa-project-action-btn--primary');
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

        this.renderMilestonesSection(panel, project);
    }

    private renderMilestonesSection(panel: HTMLElement, project: ProjectEntry): void {
        const wrap = panel.createDiv('diwa-milestones-wrap');
        const toggle = wrap.createEl('button', {
            cls: 'diwa-milestones-toggle',
            attr: { type: 'button' },
        });
        const toggleIcon = toggle.createSpan('diwa-milestones-toggle__icon');
        setIcon(toggleIcon, 'chevron-right');
        toggle.createSpan({ text: 'Milestones' });

        const body = wrap.createDiv('diwa-milestones-body');
        let isOpen = this.openMilestoneIds.has(project.id);
        const updateToggle = () => {
            toggleIcon.empty();
            setIcon(toggleIcon, isOpen ? 'chevron-down' : 'chevron-right');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            body.style.display = isOpen ? '' : 'none';
        };
        updateToggle();

        if (isOpen) {
            this.loadAndRenderMilestones(body, project, false);
        }

        toggle.addEventListener('click', () => {
            isOpen = !isOpen;
            if (isOpen) this.openMilestoneIds.add(project.id);
            else this.openMilestoneIds.delete(project.id);
            updateToggle();
            if (isOpen) {
                this.loadAndRenderMilestones(body, project, true);
            }
        });
    }

    private loadAndRenderMilestones(container: HTMLElement, project: ProjectEntry, scrollIntoView = false): void {
        container.empty();
        const loading = container.createEl('span', { text: 'Loading milestones…', cls: 'diwa-milestones-loading' });
        this.loadProjectMilestones(project).then((milestones) => {
            loading.remove();
            this.renderMilestonesBody(container, milestones, project);
            if (scrollIntoView) {
                requestAnimationFrame(() => {
                    container.closest('.diwa-milestones-wrap')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                    });
                });
            }
        }).catch(() => {
            loading.textContent = 'Failed to load milestones.';
        });
    }

    private renderMilestonesBody(
        container: HTMLElement,
        milestones: Milestone[],
        project: ProjectEntry,
        editingMilestoneId: string | null = null,
        options: MilestoneRenderOptions = {},
    ): void {
        container.empty();
        const done = milestones.filter((milestone) => milestone.done).length;
        const total = milestones.length;
        const isFocusVariant = options.variant === 'focus';
        const rerender = (nextEditingMilestoneId: string | null = editingMilestoneId) => {
            this.renderMilestonesBody(container, milestones, project, nextEditingMilestoneId, options);
        };
        const persistMilestones = async () => {
            await this.persistProjectMilestones(project, milestones);
            if (options.onPersist) {
                options.onPersist();
                return;
            }
            rerender(null);
        };
        const removeMilestone = async (index: number) => {
            const [removed] = milestones.splice(index, 1);
            if (removed?.id) {
                await this.clearMilestoneAssignments(project, removed.id);
            }
            await persistMilestones();
        };

        if (isFocusVariant) {
            const bucket = container.createEl('button', {
                cls: `diwa-project-focus__bucket${options.selectedMilestoneId === null ? ' is-selected' : ''}`,
                attr: { type: 'button' },
            });
            const bucketIcon = bucket.createDiv('diwa-project-focus__bucket-icon');
            setIcon(bucketIcon, 'list-todo');
            const bucketCopy = bucket.createDiv('diwa-project-focus__bucket-copy');
            bucketCopy.createDiv({ cls: 'diwa-project-focus__bucket-title', text: 'Unassigned' });
            bucketCopy.createDiv({
                cls: 'diwa-project-focus__bucket-meta',
                text: `${options.unassignedCount ?? 0} task${(options.unassignedCount ?? 0) === 1 ? '' : 's'} without a milestone`,
            });
            bucket.addEventListener('click', () => options.onSelectMilestone?.(null));
        }

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
                text: isFocusVariant
                    ? 'No milestones yet. Add the first milestone below to shape the project roadmap.'
                    : 'No milestones yet. Add one below to make the project feel tangible.',
            });
        } else {
            milestones.forEach((milestone, idx) => {
                const isEditing = editingMilestoneId === milestone.id;
                const isSelected = options.selectedMilestoneId === milestone.id;
                const row = container.createDiv(`diwa-milestone-row${isEditing ? ' is-editing' : ''}${isSelected ? ' is-selected' : ''}${isFocusVariant ? ' diwa-milestone-row--focus' : ''}`);
                const checkbox = row.createEl('input', {
                    attr: {
                        type: 'checkbox',
                        'aria-label': `Mark milestone ${milestone.title} complete`,
                    },
                }) as HTMLInputElement;
                checkbox.checked = milestone.done;
                checkbox.addEventListener('click', (event) => event.stopPropagation());
                checkbox.addEventListener('change', async () => {
                    milestones[idx].done = checkbox.checked;
                    await persistMilestones();
                });

                const content = row.createDiv('diwa-milestone-row__content');
                if (isEditing) {
                    const fieldGrid = content.createDiv('diwa-milestone-edit-grid');
                    const titleInput = fieldGrid.createEl('input', {
                        cls: 'diwa-milestone-add-input',
                        attr: { type: 'text', value: milestone.title, placeholder: 'Milestone title' },
                    }) as HTMLInputElement;
                    const dateInput = fieldGrid.createEl('input', {
                        cls: 'diwa-milestone-add-date',
                        attr: { type: 'date', value: milestone.dueDate ?? '' },
                    }) as HTMLInputElement;
                    const actions = content.createDiv('diwa-milestone-edit-actions');
                    const saveBtn = actions.createEl('button', {
                        text: 'Save',
                        cls: 'diwa-milestone-btn diwa-milestone-btn--primary',
                        attr: { type: 'button' },
                    });
                    const cancelBtn = actions.createEl('button', {
                        text: 'Cancel',
                        cls: 'diwa-milestone-btn',
                        attr: { type: 'button' },
                    });
                    const deleteBtn = actions.createEl('button', {
                        text: 'Delete',
                        cls: 'diwa-milestone-btn diwa-milestone-btn--danger',
                        attr: { type: 'button' },
                    });

                    const save = async () => {
                        const title = titleInput.value.trim();
                        if (!title) {
                            new Notice('Milestone title is required.');
                            titleInput.focus();
                            return;
                        }
                        milestones[idx] = {
                            ...milestone,
                            title,
                            dueDate: dateInput.value || undefined,
                        };
                        await persistMilestones();
                    };

                    saveBtn.addEventListener('click', () => { void save(); });
                    cancelBtn.addEventListener('click', () => rerender(null));
                    deleteBtn.addEventListener('click', () => { void removeMilestone(idx); });
                    titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void save();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            rerender(null);
                        }
                    });
                    dateInput.addEventListener('keydown', (event: KeyboardEvent) => {
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            rerender(null);
                        }
                    });
                    titleInput.focus();
                    titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
                } else {
                    if (isFocusVariant) {
                        content.addClass('diwa-milestone-row__content--selectable');
                        content.setAttribute('role', 'button');
                        content.setAttribute('tabindex', '0');
                        const selectMilestone = () => options.onSelectMilestone?.(milestone.id);
                        content.addEventListener('click', selectMilestone);
                        content.addEventListener('keydown', (event: KeyboardEvent) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            selectMilestone();
                        });
                    }

                    content.createEl('span', {
                        text: milestone.title,
                        cls: `diwa-milestone-title${milestone.done ? ' is-done' : ''}`,
                    });
                    const meta = content.createDiv('diwa-milestone-row__meta');
                    if (milestone.dueDate) {
                        meta.createEl('span', {
                            text: this.formatDisplayDate(milestone.dueDate),
                            cls: 'diwa-chip diwa-chip--date diwa-chip--sm',
                        });
                    }
                    if (options.taskStats?.has(milestone.id)) {
                        const stats = options.taskStats.get(milestone.id)!;
                        meta.createEl('span', {
                            text: `${stats.open} open · ${stats.total} total`,
                            cls: 'diwa-chip diwa-chip--sm diwa-project-focus__stat-chip',
                        });
                    }
                    if (isSelected) {
                        meta.createEl('span', {
                            text: 'Selected',
                            cls: 'diwa-chip diwa-chip--sm diwa-project-focus__selected-chip',
                        });
                    }

                    const actions = row.createDiv('diwa-milestone-row__actions');
                    this.buildIconButton(actions, 'Edit milestone', 'pencil', () => {
                        rerender(milestone.id);
                    }).addClass('diwa-milestone-row__icon-btn');
                    this.buildIconButton(actions, 'Delete milestone', 'trash-2', () => {
                        void removeMilestone(idx);
                    }).addClass('diwa-milestone-row__icon-btn');
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
        const addMilestone = async () => {
            const title = titleInput.value.trim();
            if (!title) {
                new Notice('Milestone title is required.');
                titleInput.focus();
                return;
            }
            milestones.push({
                id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                title,
                done: false,
                dueDate: dateInput.value || undefined,
            });
            await persistMilestones();
            titleInput.value = '';
            dateInput.value = '';
            titleInput.focus();
        };
        addBtn.addEventListener('click', () => { void addMilestone(); });
        titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void addMilestone();
            }
        });
    }

    private renderFocusWorkspace(parent: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        const tasks = this.getSortedProjectTasks(project);
        const metrics = this.getProjectMetrics(project);
        const cachedMilestones = this.focusMilestones.get(project.id);
        if (!cachedMilestones && !this.loadingMilestones.has(project.id)) {
            void this.ensureProjectMilestones(project).then(() => this.render(rootContainer));
        }
        const milestones = cachedMilestones ?? [];
        const selectedMilestoneId = this.getSelectedMilestoneId(project.id, milestones);
        const selectedMilestone = milestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null;
        const taskStats = this.buildMilestoneTaskStats(tasks, milestones);
        const selectedTasks = selectedMilestone
            ? tasks.filter((task) => this.resolveMilestoneId(task, milestones) === selectedMilestone.id)
            : [];
        const unassignedTasks = tasks.filter((task) => this.resolveMilestoneId(task, milestones) === null);
        const completeMilestones = milestones.filter((milestone) => milestone.done).length;

        const topBar = parent.createDiv('diwa-project-focus__topbar diwa-gawa-workspace-bar');
        const left = topBar.createDiv('diwa-gawa-workspace-bar-left diwa-project-focus__topbar-left');
        this.buildHeaderButton(left, 'Back to projects', 'arrow-left', () => {
            this.view.focusedProjectId = null;
            this.render(rootContainer);
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        const identity = left.createDiv('diwa-gawa-header-title-group diwa-project-focus__identity');
        identity.createEl('span', { text: 'Projects focus mode', cls: 'diwa-gawa-workspace-eyebrow' });
        identity.createEl('h2', { text: project.name, cls: 'diwa-gawa-header-title' });
        identity.createEl('span', {
            text: project.goal?.trim() || 'Single-project planning workspace for milestones and task breakdown.',
            cls: 'diwa-gawa-header-subtitle',
        });

        const actions = topBar.createDiv('diwa-gawa-workspace-bar-right diwa-project-focus__topbar-actions');
        const statusBtn = actions.createEl('button', {
            cls: `diwa-project-status-btn diwa-project-status-btn--${project.status}`,
            text: STATUS_LABELS[project.status],
            attr: { type: 'button', 'aria-label': `Change status for ${project.name}` },
        });
        statusBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openStatusPicker(statusBtn, project, rootContainer);
        });
        this.buildHeaderButton(actions, 'Refresh', 'refresh-cw', async () => {
            await this.refreshProjects(rootContainer);
            this.view.focusedProjectId = project.id;
            await this.ensureProjectMilestones(project);
            this.render(rootContainer);
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        this.buildHeaderButton(actions, 'Open note', 'file-text', () => {
            void this.openProjectNote(project);
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--ghost');
        this.buildHeaderButton(actions, 'Edit project', 'pencil', () => {
            new EditProjectModal(this.app, this.vault, project, (updated) => {
                this.index.projectIndex.set(updated.id, updated);
                this.render(rootContainer);
            }).open();
        }, 'diwa-gawa-header-btn diwa-gawa-header-btn--primary');

        const overview = parent.createDiv('diwa-project-focus__overview');
        const overviewHero = overview.createDiv('diwa-project-focus__hero');
        overviewHero.createEl('p', {
            text: project.goal?.trim() || 'Add a project goal to keep the focus workspace grounded in one outcome.',
            cls: 'diwa-project-focus__hero-copy',
        });
        const heroMeta = overviewHero.createDiv('diwa-project-focus__hero-meta');
        heroMeta.createEl('span', { text: STATUS_LABELS[project.status], cls: `diwa-project-status-btn diwa-project-status-btn--${project.status}` });
        heroMeta.createEl('span', {
            text: project.due ? `Due ${this.formatDisplayDate(project.due)}` : 'No due date',
            cls: 'diwa-chip diwa-chip--date',
        });
        heroMeta.createEl('span', {
            text: milestones.length > 0 ? `${completeMilestones}/${milestones.length} milestones complete` : 'No milestones yet',
            cls: 'diwa-chip diwa-project-focus__overview-chip',
        });

        const statGrid = overview.createDiv('diwa-project-focus__overview-stats');
        this.renderFocusStat(statGrid, 'Open tasks', metrics.openCount, 'Task load still in motion');
        this.renderFocusStat(statGrid, 'Done tasks', metrics.doneCount, 'Already closed out');
        this.renderFocusStat(statGrid, 'Milestones', milestones.length, milestones.length > 0 ? `${completeMilestones} complete` : 'Plan the roadmap');
        this.renderFocusStat(statGrid, 'Unassigned', unassignedTasks.length, unassignedTasks.length > 0 ? 'Needs milestone placement' : 'All tasks mapped');

        const grid = parent.createDiv('diwa-project-focus__grid');
        const planningPanel = grid.createDiv('diwa-project-focus__panel diwa-project-focus__panel--planning');
        const planningHeader = planningPanel.createDiv('diwa-project-focus__panel-head');
        planningHeader.createDiv({ cls: 'diwa-project-focus__panel-title', text: 'Milestone planning' });
        planningHeader.createDiv({
            cls: 'diwa-project-focus__panel-caption',
            text: milestones.length === 0
                ? 'Create milestones, edit them inline, and keep IDs stable for task mapping.'
                : 'Select a milestone to focus the task breakdown column.',
        });

        const milestoneBody = planningPanel.createDiv('diwa-project-focus__milestones');
        if (!cachedMilestones) {
            milestoneBody.createDiv({ cls: 'diwa-project-task-empty', text: 'Loading milestones…' });
        } else {
            this.renderMilestonesBody(milestoneBody, milestones, project, null, {
                variant: 'focus',
                selectedMilestoneId,
                onSelectMilestone: (milestoneId) => {
                    this.selectedMilestoneIds.set(project.id, milestoneId);
                    this.render(rootContainer);
                },
                taskStats,
                unassignedCount: unassignedTasks.length,
                onPersist: () => this.render(rootContainer),
            });
        }

        const tasksPanel = grid.createDiv('diwa-project-focus__panel diwa-project-focus__panel--tasks');
        const tasksHeader = tasksPanel.createDiv('diwa-project-focus__panel-head');
        tasksHeader.createDiv({ cls: 'diwa-project-focus__panel-title', text: 'Task breakdown' });
        tasksHeader.createDiv({
            cls: 'diwa-project-focus__panel-caption',
            text: selectedMilestone
                ? `Quick-add targets “${selectedMilestone.title}” until you switch selection.`
                : 'Quick-add creates unassigned project tasks until you select a milestone.',
        });

        this.renderFocusQuickAdd(tasksPanel, project, selectedMilestone, rootContainer);

        if (selectedMilestone) {
            this.renderFocusTaskSection(
                tasksPanel,
                project,
                milestones,
                selectedMilestone.title,
                selectedMilestone.dueDate ? `Due ${this.formatDisplayDate(selectedMilestone.dueDate)}` : 'Selected milestone',
                selectedTasks,
                'No tasks mapped to this milestone yet. Use the quick-add row above or reassign tasks below.',
                rootContainer,
            );
        } else if (milestones.length > 0) {
            tasksPanel.createDiv({
                cls: 'diwa-project-focus__selection-empty',
                text: 'Select a milestone on the left to isolate its task breakdown. Unassigned work stays visible below.',
            });
        } else {
            tasksPanel.createDiv({
                cls: 'diwa-project-focus__selection-empty',
                text: 'Start by adding milestones on the left. You can still capture unassigned project tasks below.',
            });
        }

        this.renderFocusTaskSection(
            tasksPanel,
            project,
            milestones,
            'Unassigned',
            'Project tasks without a milestone assignment',
            unassignedTasks,
            'Everything is assigned to a milestone right now.',
            rootContainer,
        );
    }

    private renderFocusQuickAdd(
        parent: HTMLElement,
        project: ProjectEntry,
        selectedMilestone: Milestone | null,
        rootContainer: HTMLElement,
    ): void {
        const addRow = parent.createDiv('diwa-project-focus__quick-add');
        const titleInput = addRow.createEl('input', {
            cls: 'diwa-project-focus__quick-input',
            attr: {
                type: 'text',
                placeholder: selectedMilestone
                    ? `Add a task to ${selectedMilestone.title}…`
                    : 'Add an unassigned project task…',
                'aria-label': 'Add project task',
            },
        }) as HTMLInputElement;
        const dueInput = addRow.createEl('input', {
            cls: 'diwa-project-focus__quick-date',
            attr: { type: 'date', 'aria-label': 'Task due date' },
        }) as HTMLInputElement;
        const addBtn = addRow.createEl('button', {
            text: 'Add task',
            cls: 'diwa-project-action-btn diwa-project-action-btn--primary',
            attr: { type: 'button' },
        }) as HTMLButtonElement;

        const addTask = async () => {
            const title = titleInput.value.trim();
            if (!title) {
                titleInput.focus();
                return;
            }
            titleInput.disabled = true;
            dueInput.disabled = true;
            addBtn.disabled = true;
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                const created = await this.vault.createTaskFile(
                    title,
                    [],
                    dueInput.value || undefined,
                    project.id,
                    {
                        status: 'open',
                        milestone: selectedMilestone?.id,
                    },
                );
                if (created instanceof TFile) {
                    await this.syncTaskFromPath(created.path, 'add');
                } else {
                    this.plugin.getTaskController().syncFromIndex();
                }
                titleInput.value = '';
                dueInput.value = '';
                this.render(rootContainer);
                titleInput.focus();
            } catch (error) {
                console.error('[DIWA Projects] Failed to create focused task', error);
                new Notice('Failed to add task to the project.');
            } finally {
                titleInput.disabled = false;
                dueInput.disabled = false;
                addBtn.disabled = false;
            }
        };

        addBtn.addEventListener('click', () => { void addTask(); });
        titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void addTask();
        });
    }

    private renderFocusTaskSection(
        parent: HTMLElement,
        project: ProjectEntry,
        milestones: Milestone[],
        title: string,
        caption: string,
        tasks: TaskEntry[],
        emptyText: string,
        rootContainer: HTMLElement,
    ): void {
        const section = parent.createDiv('diwa-project-focus__task-section');
        const header = section.createDiv('diwa-project-focus__task-section-head');
        header.createDiv({ cls: 'diwa-project-focus__task-section-title', text: title });
        const doneCount = tasks.filter((task) => isTaskDone(task)).length;
        header.createDiv({
            cls: 'diwa-project-focus__task-section-caption',
            text: `${caption} · ${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${doneCount} done`,
        });

        if (tasks.length === 0) {
            section.createDiv({ cls: 'diwa-project-task-empty', text: emptyText });
            return;
        }

        const list = section.createDiv('diwa-project-focus__task-list');
        tasks.forEach((task) => this.renderFocusTaskCard(list, task, project, milestones, rootContainer));
    }

    private renderFocusTaskCard(
        parent: HTMLElement,
        task: TaskEntry,
        project: ProjectEntry,
        milestones: Milestone[],
        rootContainer: HTMLElement,
    ): void {
        const resolvedMilestoneId = this.resolveMilestoneId(task, milestones);
        const done = isTaskDone(task);
        const card = parent.createDiv(`diwa-project-focus__task-card${done ? ' is-done' : ''}`);

        const main = card.createDiv('diwa-project-focus__task-main');
        const checkbox = main.createEl('input', {
            attr: {
                type: 'checkbox',
                'aria-label': `Mark task ${task.title || task.body || 'Untitled task'} complete`,
            },
        }) as HTMLInputElement;
        checkbox.checked = done;
        checkbox.addEventListener('change', async () => {
            checkbox.disabled = true;
            try {
                await this.vault.toggleTask(task.filePath, checkbox.checked);
                await this.syncTaskFromPath(task.filePath, 'update');
                this.render(rootContainer);
            } catch (error) {
                console.error('[DIWA Projects] Failed to toggle task', error);
                new Notice('Failed to update the task status.');
                checkbox.checked = done;
            } finally {
                checkbox.disabled = false;
            }
        });

        const copy = main.createDiv('diwa-project-focus__task-copy');
        copy.createDiv({
            cls: `diwa-project-focus__task-title${done ? ' is-done' : ''}`,
            text: task.title || task.body || 'Untitled task',
        });
        if (task.body && task.body !== task.title) {
            copy.createDiv({ cls: 'diwa-project-focus__task-body', text: task.body });
        }

        const meta = card.createDiv('diwa-project-focus__task-meta');
        if (task.due) {
            meta.createEl('span', { cls: 'diwa-chip diwa-chip--date diwa-chip--sm', text: this.formatDisplayDate(task.due) });
        }
        meta.createEl('span', {
            cls: 'diwa-chip diwa-chip--sm diwa-project-focus__task-status',
            text: done ? 'Done' : (task.status === 'waiting' ? 'Waiting' : task.status === 'someday' ? 'Someday' : 'Open'),
        });
        if (task.priority) {
            meta.createEl('span', {
                cls: 'diwa-chip diwa-chip--sm diwa-project-focus__task-priority',
                text: `${task.priority} priority`,
            });
        }

        const controls = card.createDiv('diwa-project-focus__task-controls');
        if (milestones.length > 0) {
            const selectWrap = controls.createDiv('diwa-project-focus__task-select-wrap');
            selectWrap.createEl('span', { cls: 'diwa-project-focus__task-select-label', text: 'Milestone' });
            const milestoneSelect = selectWrap.createEl('select', {
                cls: 'diwa-project-focus__task-select',
                attr: { 'aria-label': `Assign milestone for ${task.title || task.body || 'task'}` },
            }) as HTMLSelectElement;
            milestoneSelect.createEl('option', { value: '', text: 'Unassigned' });
            milestones.forEach((milestone) => {
                milestoneSelect.createEl('option', { value: milestone.id, text: milestone.title });
            });
            milestoneSelect.value = resolvedMilestoneId ?? '';
            milestoneSelect.addEventListener('change', async () => {
                milestoneSelect.disabled = true;
                try {
                    await this.vault.setTaskProjectMilestone(task.filePath, project.id, milestoneSelect.value || null);
                    await this.syncTaskFromPath(task.filePath, 'update');
                    this.render(rootContainer);
                } catch (error) {
                    console.error('[DIWA Projects] Failed to reassign task milestone', error);
                    new Notice('Failed to update the task milestone.');
                    milestoneSelect.value = resolvedMilestoneId ?? '';
                } finally {
                    milestoneSelect.disabled = false;
                }
            });
        }

        this.buildActionButton(controls, 'Edit', 'pencil', () => {
            new EditTaskModal(this.app, task, this.vault, this.index, () => {
                this.render(rootContainer);
            }).open();
        }, 'diwa-project-focus__task-btn');
        this.buildActionButton(controls, 'Open', 'file-text', () => {
            void this.openTaskNote(task);
        }, 'diwa-project-focus__task-btn');
    }

    private renderFocusStat(parent: HTMLElement, label: string, value: number, detail: string): void {
        const stat = parent.createDiv('diwa-project-focus__stat');
        stat.createDiv({ cls: 'diwa-project-focus__stat-label', text: label });
        stat.createDiv({ cls: 'diwa-project-focus__stat-value', text: String(value) });
        stat.createDiv({ cls: 'diwa-project-focus__stat-detail', text: detail });
    }

    private async refreshProjects(rootContainer: HTMLElement): Promise<void> {
        this.focusMilestones.clear();
        this.loadingMilestones.clear();
        await this.index.buildProjectIndex();
        this.render(rootContainer);
    }

    private async ensureProjectMilestones(project: ProjectEntry): Promise<Milestone[]> {
        const cached = this.focusMilestones.get(project.id);
        if (cached) return cached;
        const pending = this.loadingMilestones.get(project.id);
        if (pending) return pending;
        const loadPromise = this.loadProjectMilestones(project)
            .finally(() => this.loadingMilestones.delete(project.id));
        this.loadingMilestones.set(project.id, loadPromise);
        return loadPromise;
    }

    private async loadProjectMilestones(project: ProjectEntry): Promise<Milestone[]> {
        const milestones = await this.vault.readMilestones(project.filePath);
        this.focusMilestones.set(project.id, milestones);
        return milestones;
    }

    private async persistProjectMilestones(project: ProjectEntry, milestones: Milestone[]): Promise<void> {
        this.focusMilestones.set(project.id, milestones.map((milestone) => ({ ...milestone })));
        await this.vault.writeMilestones(project.filePath, milestones);
    }

    private async clearMilestoneAssignments(project: ProjectEntry, milestoneId: string): Promise<void> {
        const tasks = this.getProjectTasks(project).filter((task) => task.milestone === milestoneId);
        for (const task of tasks) {
            await this.vault.setTaskProjectMilestone(task.filePath, project.id, null);
            await this.syncTaskFromPath(task.filePath, 'update');
        }
    }

    private async syncTaskFromPath(filePath: string, mode: 'add' | 'update'): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.plugin.refreshCoordinator.reindexFile(file);
        }
        const indexedTask = this.index.taskIndex.get(filePath);
        if (indexedTask) {
            if (mode === 'add') this.plugin.getTaskController().addTask(indexedTask);
            else this.plugin.getTaskController().updateTask(indexedTask);
            return;
        }
        this.plugin.getTaskController().syncFromIndex();
    }

    private resolveMilestoneId(task: TaskEntry, milestones: Milestone[]): string | null {
        if (!task.milestone) return null;
        return milestones.some((milestone) => milestone.id === task.milestone) ? task.milestone : null;
    }

    private buildMilestoneTaskStats(tasks: TaskEntry[], milestones: Milestone[]): Map<string, MilestoneTaskStats> {
        const stats = new Map<string, MilestoneTaskStats>();
        const validMilestoneIds = new Set(milestones.map((milestone) => milestone.id));
        milestones.forEach((milestone) => {
            stats.set(milestone.id, { total: 0, open: 0 });
        });
        tasks.forEach((task) => {
            if (!task.milestone || !validMilestoneIds.has(task.milestone)) return;
            const current = stats.get(task.milestone) ?? { total: 0, open: 0 };
            current.total += 1;
            if (!isTaskDone(task)) current.open += 1;
            stats.set(task.milestone, current);
        });
        return stats;
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

    private openStatusPicker(anchor: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement): void {
        this.closeStatusPicker();
        const doc = anchor.ownerDocument;
        const win = doc.defaultView;
        if (!anchor.isConnected || !doc.body || !win) return;

        const picker = doc.createElement('div');
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
                if (status === project.status) {
                    this.closeStatusPicker();
                    return;
                }
                const file = this.app.vault.getAbstractFileByPath(project.filePath);
                if (file instanceof TFile) {
                    await this.vault.updateProject(file, { status });
                    project.status = status;
                    this.index.projectIndex.set(project.id, project);
                }
                this.closeStatusPicker();
                this.render(rootContainer);
            });
        });

        doc.body.appendChild(picker);
        this.statusPickerEl = picker;
        this.statusPickerDocument = doc;

        const rect = anchor.getBoundingClientRect();
        const pickerWidth = 200;
        let left = Math.min(rect.left, win.innerWidth - pickerWidth - 12);
        left = Math.max(12, left);
        let top = rect.bottom + 8;
        const pickerHeight = picker.offsetHeight || 160;
        if (top + pickerHeight > win.innerHeight - 12) {
            top = Math.max(12, rect.top - pickerHeight - 8);
        }
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;

        const close = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (!picker.contains(target) && !anchor.contains(target)) {
                this.closeStatusPicker();
            }
        };
        this.statusPickerCloseHandler = close;
        doc.addEventListener('click', close, true);
    }

    private closeStatusPicker(): void {
        if (this.statusPickerCloseHandler && this.statusPickerDocument) {
            this.statusPickerDocument.removeEventListener('click', this.statusPickerCloseHandler, true);
            this.statusPickerCloseHandler = null;
        }
        if (this.statusPickerEl) {
            this.statusPickerEl.remove();
            this.statusPickerEl = null;
        }
        this.statusPickerDocument = null;
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

    private async openTaskNote(task: TaskEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(task.filePath);
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

    private getProjectTasks(project: ProjectEntry): TaskEntry[] {
        return this.getSortedProjectTasks(project);
    }

    private resetProjectRenderCaches(): void {
        this.projectTaskCache.clear();
        this.projectMetricsCache.clear();
        this.projectTaskBuckets.clear();
    }

    private getProjectTaskBuckets(): Map<string, TaskEntry[]> {
        if (this.projectTaskBuckets.size > 0) return this.projectTaskBuckets;
        this.index.taskIndex.forEach((task) => {
            const projectKey = task.project?.trim();
            if (!projectKey) return;
            const bucket = this.projectTaskBuckets.get(projectKey);
            if (bucket) {
                bucket.push(task);
                return;
            }
            this.projectTaskBuckets.set(projectKey, [task]);
        });
        return this.projectTaskBuckets;
    }

    private getProjectTaskKey(task: TaskEntry): string {
        return task.filePath || task.taskId || task.title || task.body;
    }

    private getSortedProjectTasks(project: ProjectEntry): TaskEntry[] {
        const cached = this.projectTaskCache.get(project.id);
        if (cached) return cached;
        const taskBuckets = this.getProjectTaskBuckets();
        const taskMap = new Map<string, TaskEntry>();
        [project.id, project.name]
            .map((value) => value?.trim())
            .filter((value): value is string => !!value)
            .forEach((key) => {
                taskBuckets.get(key)?.forEach((task) => {
                    taskMap.set(this.getProjectTaskKey(task), task);
                });
            });

        const tasks = Array.from(taskMap.values())
            .sort((left, right) => {
                const leftDone = isTaskDone(left);
                const rightDone = isTaskDone(right);
                if (leftDone !== rightDone) return leftDone ? 1 : -1;
                if (left.due && right.due) return left.due.localeCompare(right.due);
                if (left.due) return -1;
                if (right.due) return 1;
                return (right.lastUpdate || 0) - (left.lastUpdate || 0);
            });
        this.projectTaskCache.set(project.id, tasks);
        return tasks;
    }

    private getProjectMetrics(project: ProjectEntry): ProjectMetrics {
        const cached = this.projectMetricsCache.get(project.id);
        if (cached) return cached;
        const tasks = this.getSortedProjectTasks(project);
        const openTasks: TaskEntry[] = [];
        let doneCount = 0;
        tasks.forEach((task) => {
            if (isTaskDone(task)) {
                doneCount += 1;
                return;
            }
            openTasks.push(task);
        });
        const metrics = {
            tasks,
            openTasks,
            openCount: openTasks.length,
            doneCount,
            totalCount: tasks.length,
            nextTask: openTasks[0],
        };
        this.projectMetricsCache.set(project.id, metrics);
        return metrics;
    }

    private formatDisplayDate(date: string): string {
        const parsed = moment(date, ['YYYY-MM-DD', moment.ISO_8601], true);
        return parsed.isValid() ? parsed.format('MMM D') : date;
    }
}

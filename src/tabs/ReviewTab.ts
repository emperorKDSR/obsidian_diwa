import { moment, setIcon, MarkdownRenderer, Platform, TFile, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditTaskModal } from '../modals/EditTaskModal';
import type { ProjectEntry, TaskEntry, DueEntry } from '../types';

interface GlanceData {
    tasks: { completed: TaskEntry[]; overdue: TaskEntry[] };
    projects: ProjectEntry[];
    finance: { paid: DueEntry[]; overdue: DueEntry[] };
}

interface WeekPlanTaskSnapshot {
    openTasksByDue: Map<string, TaskEntry[]>;
    unscheduledOpenTasks: TaskEntry[];
}

const WEEK_PLAN_PRIORITY_ORDER: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

export class ReviewTab extends BaseTab {
    private glanceCollapsed = false;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewMode(container);
    }

    private getWeekId(): string {
        return moment().format('YYYY-[W]WW');
    }

    private getWeekDateRange(): string {
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`;
    }

    private getWeekLabel(): string {
        const weekNum = moment().isoWeek();
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private getPrevWeekId(): string {
        return moment().subtract(1, 'week').format('YYYY-[W]WW');
    }

    private getPrevWeekLabel(): string {
        const weekNum = moment().subtract(1, 'week').isoWeek();
        const start = moment().subtract(1, 'week').startOf('isoWeek');
        const end = moment().subtract(1, 'week').endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private createSection(parent: HTMLElement, id: string, emoji: string, label: string): { section: HTMLElement; body: HTMLElement; toggle: HTMLElement } {
        const section = parent.createEl('div', { cls: 'diwa-review-section' });
        const header = section.createEl('div', { cls: 'diwa-review-section-header' });
        header.setAttribute('data-section-id', id);

        const left = header.createEl('div', { cls: 'diwa-review-section-header-left' });
        left.createEl('span', { cls: 'diwa-review-section-icon', text: emoji });
        left.createEl('span', { cls: 'diwa-review-section-title', text: label });

        const toggleEl = header.createEl('span', { cls: 'diwa-review-section-toggle' });
        setIcon(toggleEl, 'chevron-down');

        const body = section.createEl('div', { cls: 'diwa-review-section-body' });

        const storageKey = `diwa-review-collapse-${id}`;
        const isCollapsed = sessionStorage.getItem(storageKey) === 'true';
        if (isCollapsed) {
            body.style.display = 'none';
            toggleEl.style.transform = 'rotate(-90deg)';
        }

        header.addEventListener('click', () => {
            const collapsed = body.style.display === 'none';
            if (collapsed) {
                body.style.opacity = '0';
                body.style.display = 'flex';
                requestAnimationFrame(() => { body.style.opacity = '1'; });
                toggleEl.style.transform = 'rotate(0deg)';
                sessionStorage.removeItem(storageKey);
            } else {
                body.style.opacity = '0';
                setTimeout(() => { body.style.display = 'none'; }, 120);
                toggleEl.style.transform = 'rotate(-90deg)';
                sessionStorage.setItem(storageKey, 'true');
            }
        });

        return { section, body, toggle: toggleEl };
    }

    private createAutoResizeTextarea(parent: HTMLElement, cls: string, placeholder: string, value: string, onChange: (v: string) => void): HTMLTextAreaElement {
        const ta = parent.createEl('textarea', { cls, attr: { placeholder } }) as HTMLTextAreaElement;
        ta.value = value;
        ta.style.height = 'auto';
        ta.style.height = (ta.scrollHeight || 88) + 'px';
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            onChange(ta.value);
        });
        ta.addEventListener('focus', () => {
            ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return ta;
    }

    async renderReviewMode(container: HTMLElement) {
        container.empty();

        const weekId = this.getWeekId();
        const prevWeekId = this.getPrevWeekId();
        const weekLabel = this.getWeekLabel();
        const prevWeekLabel = this.getPrevWeekLabel();
        const dateRange = this.getWeekDateRange();

        // Load existing data
        const existing = await this.vault.loadWeeklyReview(weekId);
        let wins = existing?.wins ?? '';
        let lessons = existing?.lessons ?? '';
        let focus = existing?.focus ?? ['', '', ''];
        while (focus.length < 3) focus.push('');
        let isDirty = false;

        // Initialize week plan draft from saved data or empty
        if (!this.view.weekPlanDraft) {
            this.view.weekPlanDraft = existing?.dayPlans ?? {};
        }
        const dayPlans = this.view.weekPlanDraft;

        const wrap = container.createEl('div', { cls: 'diwa-review-wrap' });
        wrap.setAttribute('container-type', 'inline-size');

        // ── Header ──────────────────────────────────────────────
        const header = wrap.createEl('div', { cls: 'diwa-review-header' });
        const navRow = header.createEl('div', { cls: 'diwa-review-nav-row' });
        const dirtyDot = navRow.createEl('span', { cls: 'diwa-review-dirty-dot' });
        dirtyDot.style.display = 'none';

        header.createEl('h2', { text: 'Weekly Review', cls: 'diwa-tab-title' });
        const subtitleRow = header.createEl('div', { cls: 'diwa-review-subtitle-row' });
        subtitleRow.createEl('span', { cls: 'diwa-review-week-label', text: weekLabel });
        if (existing?.saved) {
            const rel = moment(existing.saved, 'YYYY-MM-DD HH:mm:ss').fromNow();
            subtitleRow.createEl('span', { cls: 'diwa-review-saved-badge', text: `Saved ${rel}` });
        }

        const markDirty = () => {
            if (!isDirty) { isDirty = true; dirtyDot.style.display = 'inline-block'; }
        };

        // ── Week at a Glance ─────────────────────────────────────
        this.renderGlancePanel(wrap, weekId);

        // ── Body: two-column on desktop ──────────────────────────
        const body = wrap.createEl('div', { cls: 'diwa-review-body' });
        const leftCol = body.createEl('div', { cls: 'diwa-review-col--left' });
        const rightCol = body.createEl('div', { cls: 'diwa-review-col--right' });

        // Wins section
        const { body: winsBody } = this.createSection(leftCol, 'wins', '🏆', 'THIS WEEK\'S WINS');
        this.createAutoResizeTextarea(winsBody, 'diwa-review-textarea', 'What went well this week…', wins, v => { wins = v; markDirty(); });

        // Lessons section
        const { body: lessonsBody } = this.createSection(leftCol, 'lessons', '📚', 'LESSONS LEARNED');
        this.createAutoResizeTextarea(lessonsBody, 'diwa-review-textarea', 'What would you do differently…', lessons, v => { lessons = v; markDirty(); });

        // Focus section
        const { body: focusBody } = this.createSection(rightCol, 'focus', '🎯', 'NEXT WEEK\'S FOCUS');
        const focusList = focusBody.createEl('div', { cls: 'diwa-review-focus-list' });
        const placeholders = ['Primary focus for next week…', 'Secondary focus…', 'Third priority…'];
        const focusInputs: HTMLInputElement[] = [];
        for (let i = 0; i < 3; i++) {
            const item = focusList.createEl('div', { cls: 'diwa-review-focus-item' });
            item.createEl('span', { cls: 'diwa-review-focus-num', text: String(i + 1) });
            const inp = item.createEl('input', { cls: 'diwa-review-input', attr: { type: 'text', placeholder: placeholders[i], value: focus[i] || '' } }) as HTMLInputElement;
            inp.addEventListener('input', () => { focus[i] = inp.value; markDirty(); });
            focusInputs.push(inp);
        }

        // ── Next Week Plan Section ──────────────────────────────────
        this._renderWeekPlanSection(wrap, dayPlans, markDirty, () => ({ wins, lessons, focus }));

        // ── Save Row ─────────────────────────────────────────────
        const saveRow = wrap.createEl('div', { cls: 'diwa-review-save-row' });
        const kbdHint = saveRow.createEl('span', { cls: 'diwa-review-kbd-hint' });
        kbdHint.textContent = Platform.isMacOS ? '⌘↵ to save' : 'Ctrl+↵ to save';
        const saveBtn = saveRow.createEl('button', { cls: 'diwa-review-save-btn', text: '💾  Save Review' });

        const doSave = async () => {
            if (saveBtn.disabled) return;
            saveBtn.textContent = 'Saving…';
            saveBtn.disabled = true;
            try {
                await this.vault.saveWeeklyReview(weekId, dateRange, wins, lessons, focus, dayPlans);
                isDirty = false;
                dirtyDot.style.display = 'none';
                saveBtn.textContent = '✓  Saved';
                saveBtn.classList.add('is-saved');
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-saved');
                    saveBtn.disabled = false;
                }, 1800);
            } catch {
                saveBtn.textContent = '⚠ Save Failed — Retry';
                saveBtn.classList.add('is-error');
                saveBtn.disabled = false;
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-error');
                }, 3000);
            }
        };

        saveBtn.addEventListener('click', doSave);
        wrap.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
        });

        // ── Previous Week Card ────────────────────────────────────
        const prevCard = wrap.createEl('div', { cls: 'diwa-review-prev-card is-collapsed' });
        const prevTrigger = prevCard.createEl('div', { cls: 'diwa-review-prev-card__trigger' });
        const prevLeft = prevTrigger.createEl('div', { cls: 'diwa-review-prev-card__left' });
        prevLeft.createEl('span', { cls: 'diwa-section-label', text: '📅 PREVIOUS WEEK' });
        prevLeft.createEl('span', { cls: 'diwa-review-prev-week-chip', text: prevWeekLabel });
        const prevChevron = prevTrigger.createEl('span', { cls: 'diwa-review-prev-card__chevron' });
        setIcon(prevChevron, 'chevron-down');

        const prevBody = prevCard.createEl('div', { cls: 'diwa-review-prev-card__body' });
        let prevLoaded = false;

        prevTrigger.addEventListener('click', async () => {
            const isCollapsed = prevCard.classList.contains('is-collapsed');
            prevCard.classList.toggle('is-collapsed');
            if (isCollapsed && !prevLoaded) {
                prevLoaded = true;
                const reviewsRoot = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
                const prevFile = this.app.vault.getAbstractFileByPath(`${reviewsRoot}/Weekly/${prevWeekId}.md`);
                if (prevFile instanceof TFile) {
                    prevBody.createEl('span', { cls: 'diwa-review-readonly-badge', text: 'READ-ONLY' });
                    const rendered = prevBody.createEl('div', { cls: 'diwa-review-prev-content' });
                    const content = await this.app.vault.read(prevFile);
                    const bodyOnly = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                    await MarkdownRenderer.render(this.app, bodyOnly, rendered, prevFile.path, this.view);
                    const openBtn = prevBody.createEl('button', { cls: 'diwa-btn-secondary diwa-review-prev-open-btn', text: 'Open in Vault →' });
                    openBtn.addEventListener('click', () => {
                        this.app.workspace.openLinkText(prevFile.path, '', Platform.isMobile ? 'tab' : 'window');
                    });
                } else {
                    prevBody.createEl('div', { text: 'No review found for last week.', cls: 'diwa-review-prev-empty' });
                }
            }
        });
    }

    // ── Next Week Plan ────────────────────────────────────────────────
    private _renderWeekPlanSection(parent: HTMLElement, dayPlans: Record<string, string>, markDirty: () => void, getFormData: () => { wins: string; lessons: string; focus: string[] }): void {
        const { body: planBody } = this.createSection(parent, 'week-plan', '📅', 'NEXT WEEK PLAN');
        let taskSnapshotCache: WeekPlanTaskSnapshot | null = null;
        const invalidateTaskSnapshot = () => {
            taskSnapshotCache = null;
        };
        const getTaskSnapshot = (): WeekPlanTaskSnapshot => {
            if (taskSnapshotCache) return taskSnapshotCache;

            const openTasksByDue = new Map<string, TaskEntry[]>();
            const unscheduledOpenTasks: TaskEntry[] = [];

            for (const task of this.index.taskIndex.values()) {
                if (task.status !== 'open') continue;
                const due = (task.due || '').trim();
                if (!due) {
                    unscheduledOpenTasks.push(task);
                    continue;
                }
                const dayTasks = openTasksByDue.get(due);
                if (dayTasks) {
                    dayTasks.push(task);
                } else {
                    openTasksByDue.set(due, [task]);
                }
            }

            unscheduledOpenTasks.sort((a, b) => {
                const aPri = WEEK_PLAN_PRIORITY_ORDER[a.priority || 'low'] ?? 2;
                const bPri = WEEK_PLAN_PRIORITY_ORDER[b.priority || 'low'] ?? 2;
                if (aPri !== bPri) return aPri - bPri;
                return b.lastUpdate - a.lastUpdate;
            });

            taskSnapshotCache = { openTasksByDue, unscheduledOpenTasks };
            return taskSnapshotCache;
        };

        // Week target toggle
        const targetRow = planBody.createEl('div', { cls: 'diwa-weekplan-target-row' });
        const targetModes: Array<{ key: 'next' | 'this'; label: string }> = [
            { key: 'next', label: 'Next Week' },
            { key: 'this', label: 'This Week' },
        ];

        const renderPlan = () => {
            // Clear everything below target row
            const children = Array.from(planBody.children);
            children.forEach(c => { if (c !== targetRow) c.remove(); });

            const baseWeek = this.view.weekPlanTargetMode === 'this'
                ? moment().startOf('isoWeek')
                : moment().add(1, 'week').startOf('isoWeek');
            const weekStart = baseWeek.format('YYYY-MM-DD');
            const weekEnd = baseWeek.clone().add(6, 'days').format('YYYY-MM-DD');
            const taskSnapshot = getTaskSnapshot();

            const grid = planBody.createEl('div', { cls: 'diwa-weekplan-grid' });

            const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let d = 0; d < 7; d++) {
                const dayMoment = baseWeek.clone().add(d, 'days');
                const dateStr = dayMoment.format('YYYY-MM-DD');
                const dayLabel = `${dayKeys[d]} · ${dayMoment.format('MMM D')}`;

                const dayTasks = taskSnapshot.openTasksByDue.get(dateStr) ?? [];

                const card = grid.createEl('div', { cls: 'diwa-weekplan-day' });

                // Header
                const header = card.createEl('div', { cls: 'diwa-weekplan-day__header' });
                header.createEl('span', { cls: 'diwa-weekplan-day__label', text: dayLabel });
                if (dayTasks.length > 0) {
                    const countCls = dayTasks.length >= 6
                        ? 'diwa-weekplan-day__count diwa-weekplan-day__count--danger'
                        : dayTasks.length >= 4
                            ? 'diwa-weekplan-day__count diwa-weekplan-day__count--warn'
                            : 'diwa-weekplan-day__count';
                    header.createEl('span', { cls: countCls, text: String(dayTasks.length) });
                }

                // Collapsible body
                const cardBody = card.createEl('div', { cls: 'diwa-weekplan-day__body' });
                const storageKey = `diwa-weekplan-collapse-${dateStr}`;
                const isCollapsed = sessionStorage.getItem(storageKey) === 'true';
                if (isCollapsed) cardBody.style.display = 'none';

                header.addEventListener('click', () => {
                    const collapsed = cardBody.style.display === 'none';
                    if (collapsed) {
                        cardBody.style.display = 'flex';
                        sessionStorage.removeItem(storageKey);
                    } else {
                        cardBody.style.display = 'none';
                        sessionStorage.setItem(storageKey, 'true');
                    }
                });

                // Intention input
                const intentionInput = cardBody.createEl('input', {
                    cls: 'diwa-weekplan-day__intention',
                    attr: {
                        type: 'text',
                        placeholder: 'Theme for this day…',
                        value: dayPlans[dateStr] || '',
                    }
                }) as HTMLInputElement;
                intentionInput.addEventListener('input', () => {
                    dayPlans[dateStr] = intentionInput.value;
                    markDirty();
                });
                // Prevent header toggle when focusing input
                intentionInput.addEventListener('click', (e) => e.stopPropagation());

                // Task list
                if (dayTasks.length > 0) {
                    const taskList = cardBody.createEl('div', { cls: 'diwa-weekplan-day__tasks' });
                    const now = Date.now();
                    dayTasks.forEach(t => {
                        const taskRow = taskList.createEl('div', { cls: 'diwa-weekplan-task' });
                        const checkbox = taskRow.createEl('input', {
                            cls: 'diwa-weekplan-task__check',
                            attr: { type: 'checkbox' }
                        }) as HTMLInputElement;
                        taskRow.createEl('span', { cls: 'diwa-weekplan-task__title', text: t.title });
                        if (t.priority) {
                            const priBadge = t.priority === 'high' ? '↑H' : t.priority === 'medium' ? '~M' : '↓L';
                            taskRow.createEl('span', { cls: `diwa-weekplan-task__priority diwa-weekplan-task__priority--${t.priority}`, text: priBadge });
                        }
                        // Show edit icon for recently created tasks (< 120s)
                        const createdMs = moment(t.created, 'YYYY-MM-DD HH:mm:ss').valueOf();
                        if (now - createdMs < 120_000) {
                            const editIcon = taskRow.createEl('span', { cls: 'diwa-weekplan-task__edit', text: '⚙', attr: { title: 'Edit details' } });
                            editIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                new EditTaskModal(this.view.app, t, this.vault, this.index, () => renderPlan()).open();
                            });
                        }
                        checkbox.addEventListener('change', async () => {
                            await this.vault.editTask(t.filePath, t.body, t.context, t.due, { status: 'done' });
                            invalidateTaskSnapshot();
                            renderPlan();
                        });
                    });
                }

                // Action buttons row
                const actionsRow = cardBody.createEl('div', { cls: 'diwa-weekplan-actions' });

                // Assign existing task button
                const assignBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-assign-btn', text: '+ Assign Task' });
                assignBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._openTaskPicker(
                        cardBody,
                        assignBtn,
                        dateStr,
                        () => {
                            invalidateTaskSnapshot();
                            renderPlan();
                        },
                        taskSnapshot.unscheduledOpenTasks,
                    );
                });

                // New task button (Day-Scoped Quick Add)
                const newTaskBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-new-btn', text: '+ New Task' });
                newTaskBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Toggle off if already open
                    const existing = cardBody.querySelector('.diwa-weekplan-quickadd');
                    if (existing) { existing.remove(); return; }

                    const quickAdd = cardBody.createEl('div', { cls: 'diwa-weekplan-quickadd' });
                    const quickInput = quickAdd.createEl('input', {
                        cls: 'diwa-weekplan-quickadd__input',
                        attr: { type: 'text', placeholder: 'What needs to happen this day?' }
                    }) as HTMLInputElement;
                    const submitBtn = quickAdd.createEl('button', { cls: 'diwa-weekplan-quickadd__submit', text: '↵' });

                    const doCreate = async () => {
                        const title = quickInput.value.trim();
                        if (!title) return;
                        quickInput.disabled = true;
                        submitBtn.disabled = true;
                        try {
                            await this.vault.createTaskFile(title, [], dateStr);
                            quickAdd.remove();
                            // Brief delay for index to catch up via file watcher
                            setTimeout(() => {
                                invalidateTaskSnapshot();
                                renderPlan();
                            }, 300);
                        } catch (err: any) {
                            quickInput.disabled = false;
                            submitBtn.disabled = false;
                        }
                    };

                    quickInput.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') { ev.preventDefault(); doCreate(); }
                        if (ev.key === 'Escape') { ev.preventDefault(); quickAdd.remove(); }
                    });
                    quickInput.addEventListener('click', (ev) => ev.stopPropagation());
                    submitBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doCreate(); });
                    requestAnimationFrame(() => quickInput.focus());
                });
            }

            // Empty state
            const totalIntentions = Object.values(dayPlans).filter(v => v.trim()).length;
            let totalAssigned = 0;
            for (const [dueDate, tasks] of taskSnapshot.openTasksByDue) {
                if (dueDate >= weekStart && dueDate <= weekEnd) {
                    totalAssigned += tasks.length;
                }
            }
            if (totalIntentions === 0 && totalAssigned === 0) {
                grid.createEl('div', { cls: 'diwa-weekplan-empty', text: 'Start with a theme, then assign or create the 1–3 things that make each day a success.' });
            }

        };

        // Render toggle buttons
        targetModes.forEach(({ key, label }) => {
            const btn = targetRow.createEl('button', {
                cls: `diwa-weekplan-target-btn${this.view.weekPlanTargetMode === key ? ' is-active' : ''}`,
                text: label,
            });
            btn.addEventListener('click', () => {
                this.view.weekPlanTargetMode = key;
                // Re-render toggle active states
                targetRow.querySelectorAll('.diwa-weekplan-target-btn').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                renderPlan();
            });
        });

        renderPlan();
    }

    private _openTaskPicker(container: HTMLElement, anchorBtn: HTMLElement, targetDate: string, onAssigned: () => void, unscheduled: TaskEntry[]): void {
        // If picker already exists, toggle off
        const existingPicker = container.querySelector('.diwa-weekplan-picker');
        if (existingPicker) { existingPicker.remove(); return; }

        const picker = container.createEl('div', { cls: 'diwa-weekplan-picker' });

        // Search input
        const searchInput = picker.createEl('input', {
            cls: 'diwa-weekplan-picker__search',
            attr: { type: 'text', placeholder: 'Search tasks…' }
        }) as HTMLInputElement;

        const list = picker.createEl('div', { cls: 'diwa-weekplan-picker__list' });

        const renderList = (query: string) => {
            list.empty();
            const q = query.toLowerCase().trim();
            const filtered = q
                ? unscheduled.filter(t => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q))
                : unscheduled;

            if (filtered.length === 0) {
                list.createEl('div', { cls: 'diwa-weekplan-picker__empty', text: q ? 'No matching tasks' : 'No unscheduled tasks' });
                return;
            }

            filtered.slice(0, 12).forEach(t => {
                const item = list.createEl('div', { cls: 'diwa-weekplan-picker__item' });
                item.createEl('span', { cls: 'diwa-weekplan-picker__title', text: t.title });
                if (t.priority) {
                    const priBadge = t.priority === 'high' ? '↑H' : t.priority === 'medium' ? '~M' : '↓L';
                    item.createEl('span', { cls: `diwa-weekplan-picker__priority diwa-weekplan-picker__priority--${t.priority}`, text: priBadge });
                }
                item.addEventListener('click', async () => {
                    picker.remove();
                    await this.vault.editTask(t.filePath, t.body, t.context, targetDate);
                    onAssigned();
                });
            });
        };

        searchInput.addEventListener('input', () => renderList(searchInput.value));
        renderList('');

        // Auto-focus search
        requestAnimationFrame(() => searchInput.focus());
    }

    private renderGlancePanel(parent: HTMLElement, weekId: string): void {
        const glance = parent.createEl('div', { cls: 'diwa-review-glance' });
        if (this.glanceCollapsed) glance.classList.add('is-collapsed');

        const glanceHeader = glance.createEl('div', { cls: 'diwa-review-glance__header' });
        glanceHeader.createEl('span', { cls: 'diwa-review-glance__title', text: '⚡ WEEK AT A GLANCE' });

        const glanceActions = glanceHeader.createEl('div', { cls: 'diwa-review-glance__actions' });
        const refreshBtn = glanceActions.createEl('button', { cls: 'diwa-review-glance__refresh', attr: { title: 'Refresh' } });
        setIcon(refreshBtn, 'refresh-cw');
        const toggleBtn = glanceActions.createEl('button', { cls: 'diwa-review-glance__toggle', attr: { title: 'Collapse' } });
        setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');

        const glanceBody = glance.createEl('div', { cls: 'diwa-review-glance__body' });
        const render = () => {
            glanceBody.empty();
            const data = this.computeGlanceData(weekId);
            this.renderGlanceTasks(glanceBody, data.tasks);
            this.renderGlanceProjects(glanceBody, data.projects);
            this.renderGlanceFinance(glanceBody, data.finance);
        };
        render();

        toggleBtn.addEventListener('click', () => {
            this.glanceCollapsed = !this.glanceCollapsed;
            glance.classList.toggle('is-collapsed', this.glanceCollapsed);
            setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');
        });
        refreshBtn.addEventListener('click', render);
    }

    private computeGlanceData(weekId: string): GlanceData {
        const today = moment();
        const weekStart = moment().startOf('isoWeek');
        const weekEnd = moment().endOf('isoWeek');

        const completed: TaskEntry[] = [];
        const overdue: TaskEntry[] = [];
        for (const task of this.index.taskIndex.values()) {
            if (task.status === 'done') {
                const mod = moment(task.modified, 'YYYY-MM-DD HH:mm:ss');
                if (mod.isSameOrAfter(weekStart) && mod.isSameOrBefore(weekEnd)) {
                    completed.push(task);
                }
                continue;
            }
            if (task.status === 'open' && task.due && moment(task.due, 'YYYY-MM-DD').isBefore(today, 'day')) {
                overdue.push(task);
            }
        }

        // Projects active this week
        const projects = Array.from(this.index.projectIndex.values()).filter(p => {
            if (p.status === 'archived') return false;
            const file = this.app.vault.getAbstractFileByPath(p.filePath);
            if (!(file instanceof TFile)) return false;
            return moment(file.stat.mtime).isSameOrAfter(weekStart);
        });

        const finPaid: DueEntry[] = [];
        for (const due of this.index.dueIndex.values()) {
            if (!due.lastPayment) continue;
            const lastPayment = moment(due.lastPayment, 'YYYY-MM-DD');
            if (lastPayment.isSameOrAfter(weekStart) && lastPayment.isSameOrBefore(weekEnd)) {
                finPaid.push(due);
            }
        }
        const paidPaths = new Set(finPaid.map(d => d.path));
        const finOverdue: DueEntry[] = [];
        for (const due of this.index.dueIndex.values()) {
            if (paidPaths.has(due.path) || !due.dueMoment) continue;
            if (moment(due.dueMoment).isBefore(today, 'day')) {
                finOverdue.push(due);
            }
        }

        return { tasks: { completed, overdue }, projects, finance: { paid: finPaid, overdue: finOverdue } };
    }

    private renderGlanceTasks(parent: HTMLElement, tasks: { completed: TaskEntry[]; overdue: TaskEntry[] }): void {
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '✅' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'TASKS' });

        const statRow = card.createEl('div', { cls: 'diwa-glance-stat-row' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--done', text: `${tasks.completed.length} done` });
        statRow.createEl('span', { cls: 'diwa-glance-stat-sep', text: '·' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--overdue', text: `${tasks.overdue.length} overdue` });

        const list = card.createEl('ul', { cls: 'diwa-glance-list' });
        tasks.completed.slice(0, 6).forEach(t => {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--done', text: t.title });
        });
        if (tasks.completed.length === 0 && tasks.overdue.length === 0) {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--empty', text: 'No task activity this week' });
        }
    }

    private renderGlanceProjects(parent: HTMLElement, projects: ProjectEntry[]): void {
        if (projects.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '🗂' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'ACTIVE PROJECTS' });

        projects.forEach(p => {
            const row = card.createEl('div', { cls: 'diwa-glance-project-row' });
            const dot = row.createEl('span', { cls: 'diwa-glance-project-dot' });
            if (p.color) dot.style.background = p.color;
            row.createEl('span', { cls: 'diwa-glance-project-name', text: p.name });
            row.createEl('span', { cls: `diwa-glance-project-status diwa-glance-project-status--${p.status}`, text: p.status });
        });
    }

    private renderGlanceFinance(parent: HTMLElement, finance: { paid: DueEntry[]; overdue: DueEntry[] }): void {
        if (finance.paid.length === 0 && finance.overdue.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '💳' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'FINANCE' });

        finance.paid.forEach(d => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--paid' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '✓' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: d.title });
        });
        finance.overdue.forEach(d => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--overdue' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '⚠' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: d.title });
        });
    }
}

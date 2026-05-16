import { moment, setIcon, TFile, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { TaskEntry } from '../types';

export class CalendarTab extends BaseTab {
    constructor(view: DiwaView) {
        super(view);
        if (!this.view.calendarViewMonth) this.view.calendarViewMonth = moment().format('YYYY-MM');
        if (!this.view.calendarSelectedDate) this.view.calendarSelectedDate = moment().format('YYYY-MM-DD');
        if (!this.view.calendarViewMode) this.view.calendarViewMode = 'month';
    }

    render(container: HTMLElement) {
        container.empty();
        const habitMap = this._buildHabitMap();
        const wrap = container.createEl('div', { cls: 'diwa-cal-wrap' });
        this._renderHeader(wrap, () => this.render(container));
        this._renderGrid(wrap, habitMap, () => this.render(container));
        this._renderDetail(wrap, habitMap, container);

        // Pre-load day plans for week view intention chips (async, one-shot)
        if (this.view.calendarViewMode === 'week') {
            this._loadCalendarDayPlans(container);
        }
    }

    private _getDisplayRange(): { start: moment.Moment; end: moment.Moment } {
        const vm = moment(this.view.calendarViewMonth + '-01');
        if (this.view.calendarViewMode === 'week') {
            return {
                start: moment(this.view.calendarSelectedDate).startOf('isoWeek'),
                end: moment(this.view.calendarSelectedDate).endOf('isoWeek'),
            };
        }
        return {
            start: vm.clone().startOf('month').startOf('isoWeek'),
            end: vm.clone().endOf('month').endOf('isoWeek'),
        };
    }

    private _buildHabitMap(): Map<string, Set<string>> {
        const map = new Map<string, Set<string>>();
        const folder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        const { start, end } = this._getDisplayRange();
        const cur = start.clone();
        while (cur.isSameOrBefore(end, 'day')) {
            const d = cur.format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${folder}/${d}.md`);
            if (file instanceof TFile) {
                const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
                const completed: string[] = Array.isArray(fm?.['completed']) ? fm!['completed'].map(String) : [];
                if (completed.length) map.set(d, new Set(completed));
            }
            cur.add(1, 'day');
        }
        return map;
    }

    private _renderHeader(parent: HTMLElement, onRefresh: () => void) {
        const header = parent.createEl('div', { cls: 'diwa-cal-header' });
        const titleRow = header.createEl('div', { cls: 'diwa-cal-title-row' });
        this.renderHomeIcon(titleRow);
        titleRow.createEl('h2', { cls: 'diwa-cal-title', text: 'Calendar' });

        const toggle = titleRow.createEl('div', { cls: 'diwa-cal-view-toggle' });
        (['month', 'week'] as const).forEach(mode => {
            const btn = toggle.createEl('button', {
                cls: `diwa-cal-toggle-btn${this.view.calendarViewMode === mode ? ' is-active' : ''}`,
                text: mode.charAt(0).toUpperCase() + mode.slice(1),
            });
            btn.addEventListener('click', () => { this.view.calendarViewMode = mode; onRefresh(); });
        });

        const navRow = header.createEl('div', { cls: 'diwa-cal-nav-row' });
        const prevBtn = navRow.createEl('button', { cls: 'diwa-cal-nav-btn' });
        setIcon(prevBtn, 'chevron-left');

        const vm = moment(this.view.calendarViewMonth + '-01');
        const isWeek = this.view.calendarViewMode === 'week';
        let labelText: string;
        if (isWeek) {
            const ws = moment(this.view.calendarSelectedDate).startOf('isoWeek');
            const we = moment(this.view.calendarSelectedDate).endOf('isoWeek');
            labelText = `${ws.format('MMM D')} – ${we.format('MMM D, YYYY')}`;
        } else {
            labelText = vm.format('MMMM YYYY');
        }
        navRow.createEl('span', { cls: 'diwa-cal-nav-label', text: labelText });

        const nextBtn = navRow.createEl('button', { cls: 'diwa-cal-nav-btn' });
        setIcon(nextBtn, 'chevron-right');

        const todayBtn = navRow.createEl('button', { cls: 'diwa-cal-today-btn', text: 'Today' });

        prevBtn.addEventListener('click', () => {
            if (isWeek) {
                this.view.calendarSelectedDate = moment(this.view.calendarSelectedDate).subtract(1, 'week').format('YYYY-MM-DD');
                this.view.calendarViewMonth = moment(this.view.calendarSelectedDate).format('YYYY-MM');
            } else {
                this.view.calendarViewMonth = vm.clone().subtract(1, 'month').format('YYYY-MM');
            }
            onRefresh();
        });
        nextBtn.addEventListener('click', () => {
            if (isWeek) {
                this.view.calendarSelectedDate = moment(this.view.calendarSelectedDate).add(1, 'week').format('YYYY-MM-DD');
                this.view.calendarViewMonth = moment(this.view.calendarSelectedDate).format('YYYY-MM');
            } else {
                this.view.calendarViewMonth = vm.clone().add(1, 'month').format('YYYY-MM');
            }
            onRefresh();
        });
        todayBtn.addEventListener('click', () => {
            this.view.calendarSelectedDate = moment().format('YYYY-MM-DD');
            this.view.calendarViewMonth = moment().format('YYYY-MM');
            onRefresh();
        });
    }

    private _renderGrid(parent: HTMLElement, habitMap: Map<string, Set<string>>, onRefresh: () => void) {
        const gridWrap = parent.createEl('div', { cls: 'diwa-cal-grid-wrap' });

        const dayLabels = gridWrap.createEl('div', { cls: 'diwa-cal-weekdays' });
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d =>
            dayLabels.createEl('div', { cls: 'diwa-cal-weekday-label', text: d })
        );

        // Pre-index tasks and dues for O(1) cell lookup
        const tasksByDate = new Map<string, TaskEntry[]>();
        this.index.taskIndex.forEach(t => {
            if (!t.due) return;
            if (!tasksByDate.has(t.due)) tasksByDate.set(t.due, []);
            tasksByDate.get(t.due)!.push(t);
        });
        const dueCountByDate = new Map<string, number>();
        this.index.dueIndex.forEach(d => {
            if (d.dueDate && d.isActive)
                dueCountByDate.set(d.dueDate, (dueCountByDate.get(d.dueDate) || 0) + 1);
        });

        const isWeek = this.view.calendarViewMode === 'week';

        // Use cached day plan intentions for week view
        const calDayPlans: Record<string, string> = (isWeek && (this.view as any).calendarDayPlans) || {};

        const grid = gridWrap.createEl('div', { cls: `diwa-cal-grid${isWeek ? ' diwa-cal-grid--week' : ''}` });

        const today = moment().format('YYYY-MM-DD');
        const { start, end } = this._getDisplayRange();
        const viewMonth = this.view.calendarViewMonth;
        const habits = (this.settings.habits || []).filter(h => !h.archived);

        const cur = start.clone();
        while (cur.isSameOrBefore(end, 'day')) {
            const dateStr = cur.format('YYYY-MM-DD');
            const isToday = dateStr === today;
            const isSelected = dateStr === this.view.calendarSelectedDate;
            const isOutside = !isWeek && cur.format('YYYY-MM') !== viewMonth;

            const cellCls = ['diwa-cal-cell',
                isWeek ? 'diwa-cal-cell--week' : '',
                isToday ? 'is-today' : '',
                isSelected ? 'is-selected' : '',
                isOutside ? 'is-outside' : '',
            ].filter(Boolean).join(' ');
            const cell = grid.createEl('div', { cls: cellCls });

            cell.createEl('span', { cls: 'diwa-cal-cell-num', text: cur.format('D') });

            const dots = cell.createEl('div', { cls: 'diwa-cal-cell-dots' });
            const dayTasks = tasksByDate.get(dateStr) || [];
            const openTasks = dayTasks.filter(t => t.status !== 'done');
            const dueCount = dueCountByDate.get(dateStr) || 0;
            const habitCount = habitMap.get(dateStr)?.size || 0;

            if (openTasks.length > 0) {
                const dot = dots.createEl('span', { cls: 'diwa-cal-dot diwa-cal-dot--task' });
                if (openTasks.length > 1) dot.createEl('sup', { text: String(openTasks.length) });
            }
            if (dueCount > 0) {
                const dot = dots.createEl('span', { cls: 'diwa-cal-dot diwa-cal-dot--due' });
                if (dueCount > 1) dot.createEl('sup', { text: String(dueCount) });
            }
            if (habitCount > 0 && habits.length > 0) {
                const pct = Math.round((habitCount / habits.length) * 100);
                const dot = dots.createEl('span', {
                    cls: `diwa-cal-dot diwa-cal-dot--habit${pct === 100 ? ' is-full' : ''}`,
                    attr: { title: `${habitCount}/${habits.length} habits` }
                });
                if (pct < 100) dot.createEl('sup', { text: `${habitCount}` });
            }

            // Intention chip from week planner (week view only)
            if (isWeek && calDayPlans[dateStr]) {
                cell.createEl('div', { cls: 'diwa-cal-intention-chip', text: `✦ ${calDayPlans[dateStr]}` });
            }

            if (isWeek && openTasks.length > 0) {
                const miniList = cell.createEl('div', { cls: 'diwa-cal-cell-mini-list' });
                openTasks.slice(0, 4).forEach(t =>
                    miniList.createEl('div', { cls: 'diwa-cal-mini-task', text: t.title })
                );
                if (openTasks.length > 4)
                    miniList.createEl('div', { cls: 'diwa-cal-mini-more', text: `+${openTasks.length - 4} more` });
            }

            cell.addEventListener('click', () => {
                if (isOutside) return;
                this.view.calendarSelectedDate = dateStr;
                onRefresh();
            });

            cur.add(1, 'day');
        }
    }

    private _renderDetail(parent: HTMLElement, habitMap: Map<string, Set<string>>, renderContainer: HTMLElement) {
        const dateStr = this.view.calendarSelectedDate;
        const detail = parent.createEl('div', { cls: 'diwa-cal-detail' });

        detail.createEl('div', { cls: 'diwa-cal-detail-date', text: moment(dateStr).format('dddd, MMMM D, YYYY') });

        const tasks: TaskEntry[] = [];
        this.index.taskIndex.forEach(t => { if (t.due === dateStr) tasks.push(t); });

        // Gawa section — always render (with + button)
        const taskHeader = detail.createEl('div', { cls: 'diwa-cal-detail-section-title diwa-cal-detail-section-title--action' });
        taskHeader.createEl('span', { text: `Gawa · ${tasks.length}` });
        const addBtn = taskHeader.createEl('button', { cls: 'diwa-cal-detail-add-btn', attr: { title: 'Add task for this day' } });
        setIcon(addBtn, 'plus');

        const taskSection = detail.createEl('div', { cls: 'diwa-cal-detail-task-section' });

        if (tasks.length > 0) {
            const list = taskSection.createEl('div', { cls: 'diwa-cal-detail-list' });
            tasks.sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0))
                .forEach(t => {
                    const item = list.createEl('div', { cls: `diwa-cal-detail-item diwa-cal-detail-item--task${t.status === 'done' ? ' is-done' : ''}` });
                    const icon = item.createEl('span', { cls: 'diwa-cal-detail-item-icon diwa-cal-detail-item-icon--toggle' });
                    setIcon(icon, t.status === 'done' ? 'check-circle-2' : 'circle');
                    icon.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const newStatus = t.status === 'done' ? 'open' : 'done';
                        await this.vault.editTask(t.filePath, t.body, t.context, t.due, { status: newStatus });
                        setTimeout(() => this.render(renderContainer), 300);
                    });
                    item.createEl('span', { cls: 'diwa-cal-detail-item-title', text: t.title });
                    if (t.priority) item.createEl('span', { cls: `diwa-cal-detail-badge diwa-cal-badge--${t.priority}`, text: t.priority });
                });
        }

        // Quick-add toggle
        const isPast = dateStr < moment().format('YYYY-MM-DD');
        addBtn.addEventListener('click', () => {
            const existing = taskSection.querySelector('.diwa-cal-quickadd');
            if (existing) { existing.remove(); return; }

            const quickAdd = taskSection.createEl('div', { cls: 'diwa-cal-quickadd' });
            const quickInput = quickAdd.createEl('input', {
                cls: `diwa-cal-quickadd__input${isPast ? ' diwa-cal-quickadd__input--past' : ''}`,
                attr: { type: 'text', placeholder: isPast ? 'Add task (past date)…' : 'Task for this day…' }
            }) as HTMLInputElement;
            const submitBtn = quickAdd.createEl('button', { cls: 'diwa-cal-quickadd__submit', text: '↵' });

            const doCreate = async () => {
                const title = quickInput.value.trim();
                if (!title) return;
                quickInput.disabled = true;
                submitBtn.disabled = true;
                try {
                    await this.vault.createTaskFile(title, [], dateStr);
                    quickAdd.remove();
                    setTimeout(() => this.render(renderContainer), 300);
                } catch (err: any) {
                    new Notice('Failed to create task: ' + (err?.message || 'Unknown error'));
                    quickInput.disabled = false;
                    submitBtn.disabled = false;
                }
            };

            quickInput.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); doCreate(); }
                if (ev.key === 'Escape') { ev.preventDefault(); quickAdd.remove(); }
            });
            submitBtn.addEventListener('click', () => doCreate());
            requestAnimationFrame(() => quickInput.focus());
        });

        const dues: any[] = [];
        this.index.dueIndex.forEach(d => { if (d.dueDate === dateStr) dues.push(d); });

        if (dues.length > 0) {
            detail.createEl('div', { cls: 'diwa-cal-detail-section-title', text: `Financial · ${dues.length}` });
            const list = detail.createEl('div', { cls: 'diwa-cal-detail-list' });
            dues.forEach(d => {
                const item = list.createEl('div', { cls: 'diwa-cal-detail-item diwa-cal-detail-item--due' });
                const icon = item.createEl('span', { cls: 'diwa-cal-detail-item-icon' });
                setIcon(icon, 'credit-card');
                item.createEl('span', { cls: 'diwa-cal-detail-item-title', text: d.title });
                if (d.amount) item.createEl('span', { cls: 'diwa-cal-detail-badge', text: `€${Number(d.amount).toFixed(2)}` });
            });
        }

        const habits = (this.settings.habits || []).filter(h => !h.archived);
        if (habits.length > 0) {
            const completed = habitMap.get(dateStr) || new Set<string>();
            detail.createEl('div', { cls: 'diwa-cal-detail-section-title', text: `Habits · ${completed.size}/${habits.length}` });
            const list = detail.createEl('div', { cls: 'diwa-cal-detail-list diwa-cal-detail-list--habits' });
            habits.forEach(h => {
                const done = completed.has(h.id);
                const item = list.createEl('div', { cls: `diwa-cal-detail-item diwa-cal-detail-item--habit${done ? ' is-done' : ''}` });
                item.createEl('span', { cls: 'diwa-cal-detail-habit-icon', text: h.icon });
                item.createEl('span', { cls: 'diwa-cal-detail-item-title', text: h.name });
                const icon = item.createEl('span', { cls: 'diwa-cal-detail-item-icon diwa-cal-detail-item-icon--right' });
                setIcon(icon, done ? 'check-circle-2' : 'circle');
            });
        }

        if (tasks.length === 0 && dues.length === 0 && habits.length === 0) {
            this.renderEmptyState(detail, 'No dues or habits — tap + above to plan a task.');
        }
    }

    private async _loadCalendarDayPlans(container: HTMLElement): Promise<void> {
        const { start: wkStart } = this._getDisplayRange();
        const isoWeek = wkStart.isoWeek();
        const isoYear = wkStart.isoWeekYear();
        const weekId = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
        const cacheKey = `cal-dayplans-${weekId}`;

        // Avoid re-fetching if already loaded for this week
        if ((this.view as any)._calDayPlansKey === cacheKey) return;

        try {
            const reviewData = await this.vault.loadWeeklyReview(weekId);
            const plans = reviewData?.dayPlans || {};
            (this.view as any).calendarDayPlans = plans;
            (this.view as any)._calDayPlansKey = cacheKey;

            // Only re-render if container is still attached to DOM and we have data
            if (Object.keys(plans).length > 0 && container.isConnected) {
                this.render(container);
            }
        } catch { /* no review for this week */ }
    }
}



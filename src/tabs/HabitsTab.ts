import { Platform, TFile, moment, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import type { Habit } from '../types';
import { BaseTab } from './BaseTab';
import { HabitConfigModal } from '../modals/HabitConfigModal';
import { ConfirmModal } from '../modals/ConfirmModal';

interface StreakData {
    habitId: string;
    current: number;
    best: number;
    thisWeek: number; // 0-7 days completed this week
    thisMonth: number; // days completed this month
}

export class HabitsTab extends BaseTab {
    private currentHeatmapMonth: moment.Moment;
    private selectedHabitId: string = 'all';
    private habitHistoryCache: Map<string, Set<string>> = new Map(); // habitId -> Set<YYYY-MM-DD>

    constructor(view: DiwaView) {
        super(view);
        this.currentHeatmapMonth = moment().startOf('month');
    }

    render(container: HTMLElement) {
        this.loadAndRender(container);
    }

    private async loadAndRender(container: HTMLElement) {
        container.empty();
        await this.loadHabitHistory();
        this.renderHabitsTab(container);
    }

    /** Scan vault habit files for the past 90 days and build in-memory history */
    private async loadHabitHistory(): Promise<void> {
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        this.habitHistoryCache.clear();
        habits.forEach(h => this.habitHistoryCache.set(h.id, new Set()));

        const today = moment();
        for (let d = 0; d < 90; d++) {
            const dateStr = moment(today).subtract(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const completed: string[] = Array.isArray(cache?.frontmatter?.['completed'])
                ? cache!.frontmatter!['completed'].map(String) : [];
            completed.forEach(id => {
                const set = this.habitHistoryCache.get(id);
                if (set) set.add(dateStr);
            });
        }
    }

    private computeStreaks(habitId: string): StreakData {
        const history = this.habitHistoryCache.get(habitId) || new Set();
        const today = moment();
        const weekStart = moment().startOf('isoWeek');
        const monthStart = moment().startOf('month');

        // Current streak: consecutive days from today backwards
        let current = 0;
        let d = moment(today);
        while (history.has(d.format('YYYY-MM-DD'))) {
            current++;
            d.subtract(1, 'day');
        }
        // If today not done, check yesterday
        if (current === 0) {
            d = moment(today).subtract(1, 'day');
            while (history.has(d.format('YYYY-MM-DD'))) {
                current++;
                d.subtract(1, 'day');
            }
        }

        // Best streak: scan all 90 days
        let best = 0;
        let run = 0;
        for (let i = 89; i >= 0; i--) {
            const dateStr = moment(today).subtract(i, 'days').format('YYYY-MM-DD');
            if (history.has(dateStr)) { run++; best = Math.max(best, run); }
            else run = 0;
        }

        // This week
        let thisWeek = 0;
        for (let i = 0; i < 7; i++) {
            if (history.has(moment(weekStart).add(i, 'days').format('YYYY-MM-DD'))) thisWeek++;
        }

        // This month
        const daysInMonth = monthStart.daysInMonth();
        let thisMonth = 0;
        for (let i = 0; i < daysInMonth; i++) {
            if (history.has(moment(monthStart).add(i, 'days').format('YYYY-MM-DD'))) thisMonth++;
        }

        return { habitId, current, best, thisWeek, thisMonth };
    }

    private renderHabitsTab(container: HTMLElement) {
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');

        const wrap = container.createEl('div', { cls: 'diwa-habits-wrap' });

        // ── Header ────────────────────────────────────────────────
        const doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const header = wrap.createEl('div', { cls: 'diwa-habits-header' });
        const navRow = header.createEl('div', { cls: 'diwa-review-nav-row', attr: { style: 'display: flex; align-items: center; gap: 12px; min-height: 44px;' } });
        const gearNavBtn = navRow.createEl('button', { cls: 'diwa-habit-config-btn', attr: { 'aria-label': 'Configure habits', style: 'margin-left: auto;' } });
        gearNavBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        gearNavBtn.addEventListener('click', () => new HabitConfigModal(this.app, this.plugin).open());

        header.createEl('h2', { text: 'Habits', cls: 'diwa-tab-title' });
        const subtitleText = habits.length > 0
            ? `${moment().format('dddd, MMM D')}  ·  ${doneCount}/${habits.length} done today`
            : moment().format('dddd, MMM D');
        header.createEl('span', { cls: 'diwa-tab-subtitle', text: subtitleText });

        if (habits.length === 0) {
            this.renderEmptyHabits(wrap);
            return;
        }

        // ── Section 1: Today Quick-Bar ────────────────────────────
        this.renderTodaySection(wrap, habits, completedToday, today);

        // ── Section 2: Streak Leaderboard ─────────────────────────
        this.renderStreakLeaderboard(wrap, habits);

        // ── Section 3: Monthly Heat-Map ────────────────────────────
        this.renderHeatmap(wrap, habits);

        // ── Section 4: Management Buttons ─────────────────────────
        this.renderManagement(wrap);
    }

    private renderEmptyHabits(parent: HTMLElement) {
        const empty = parent.createEl('div', { cls: 'diwa-habits-empty' });
        empty.createEl('span', { text: '🌿', cls: 'diwa-habits-empty-icon' });
        empty.createEl('div', { text: 'Build Your Habit System', cls: 'diwa-habits-empty-title' });
        empty.createEl('div', {
            text: 'Track daily rituals, build streaks, and see your consistency mapped over time.',
            cls: 'diwa-habits-empty-body'
        });
        const btn = empty.createEl('button', { text: '+ Add First Habit', cls: 'diwa-btn-primary diwa-habits-empty-btn' });
        btn.addEventListener('click', () => new HabitConfigModal(this.app, this.plugin).open());
    }

    private renderTodaySection(parent: HTMLElement, habits: Habit[], completedToday: Set<string>, today: string) {
        const section = parent.createEl('div', { cls: 'diwa-habits-section diwa-habits-today-section' });
        const labelRow = section.createEl('div', { cls: 'diwa-section-label-row' });
        labelRow.createEl('span', { text: 'TODAY', cls: 'diwa-section-label' });
        const doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const countEl = labelRow.createEl('span', { cls: 'diwa-section-label-count', text: `${doneCount}/${habits.length}` });

        const progressWrap = section.createEl('div', { cls: 'diwa-habit-progress-bar' });
        const progressFill = progressWrap.createEl('div', { cls: 'diwa-habit-progress-fill' });
        let currentCount = doneCount;
        const updateProgress = (n: number) => {
            progressFill.style.width = `${habits.length > 0 ? (n / habits.length) * 100 : 0}%`;
            if (n === habits.length && habits.length > 0) progressFill.classList.add('all-complete');
            else progressFill.classList.remove('all-complete');
        };
        updateProgress(currentCount);

        const bar = section.createEl('div', { cls: 'diwa-habits-today-grid' });

        for (const habit of habits) {
            const done = completedToday.has(habit.id);
            const btn = bar.createEl('button', { cls: `diwa-habit-quick-btn diwa-habits-today-btn${done ? ' is-done' : ''}`, attr: { title: habit.name } });
            btn.insertAdjacentHTML('afterbegin', '<svg class="diwa-habit-ring" viewBox="0 0 36 36" aria-hidden="true"><rect class="diwa-habit-ring-track" x="2" y="2" width="32" height="32" rx="8" ry="8" pathLength="100"/><rect class="diwa-habit-ring-fill" x="2" y="2" width="32" height="32" rx="8" ry="8" pathLength="100"/></svg>');
            btn.createEl('span', { text: habit.icon || '●', cls: 'diwa-habit-quick-icon' });
            btn.createEl('span', { text: habit.name, cls: 'diwa-habit-quick-label diwa-habits-today-label' });

            btn.addEventListener('click', async () => {
                const nowDone = btn.classList.contains('is-done');
                btn.classList.toggle('is-done', !nowDone);
                if (!nowDone) { btn.classList.add('just-done'); setTimeout(() => btn.classList.remove('just-done'), 420); }
                currentCount = nowDone ? currentCount - 1 : currentCount + 1;
                const clamped = Math.max(0, Math.min(habits.length, currentCount));
                countEl.textContent = `${clamped}/${habits.length}`;
                updateProgress(clamped);
                this.view._habitTogglePending++;
                await this.plugin.toggleHabit(today, habit.id);
                setTimeout(() => { this.view._habitTogglePending = Math.max(0, this.view._habitTogglePending - 1); }, 350);
            });
        }
    }

    private renderStreakLeaderboard(parent: HTMLElement, habits: Habit[]) {
        const section = parent.createEl('div', { cls: 'diwa-habits-leaderboard' });
        const labelRow = section.createEl('div', { cls: 'diwa-section-label-row', attr: { style: 'padding: 12px 14px 0 14px;' } });
        const labelLeft = labelRow.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px;' } });
        labelLeft.createEl('span', { text: '🔥', attr: { style: 'font-size: 1em;' } });
        labelLeft.createEl('span', { text: 'STREAK LEADERBOARD', cls: 'diwa-section-label' });

        const streaks = habits.map(h => ({ habit: h, data: this.computeStreaks(h.id) }));
        streaks.sort((a, b) => b.data.current - a.data.current);

        const table = section.createEl('table', { cls: 'diwa-streak-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr', { cls: 'diwa-streak-table__head-row' });
        ['', 'Habit', '🔥', 'Best', 'Month'].forEach((text, i) => {
            const th = headRow.createEl('th', { text });
            if (i >= 2) th.style.textAlign = 'center';
        });

        const tbody = table.createEl('tbody');
        for (const { habit, data } of streaks) {
            const row = tbody.createEl('tr', { cls: 'diwa-streak-table__row' });
            row.createEl('td', { text: habit.icon, cls: 'diwa-streak-cell--icon' });
            const nameCell = row.createEl('td', { cls: 'diwa-streak-cell--name' });
            nameCell.createEl('span', { text: habit.name, cls: 'diwa-streak-name' });

            const currentCell = row.createEl('td', { cls: 'diwa-streak-cell--current' });
            const streakLabel = data.current > 0
                ? (data.current >= 7 ? `🔥 ${data.current}` : String(data.current))
                : '—';
            const streakEl = currentCell.createEl('span', { text: streakLabel, cls: 'diwa-streak-value' });
            if (data.current === 0) streakEl.style.color = 'var(--text-faint)';
            else if (data.current >= 30) { streakEl.style.color = '#ef4444'; streakEl.style.fontWeight = '900'; }
            else if (data.current >= 14) { streakEl.style.color = '#f59e0b'; }
            else if (data.current >= 7) { streakEl.style.color = 'var(--interactive-accent)'; }
            else streakEl.style.color = 'var(--text-muted)';

            const bestCell = row.createEl('td', { cls: 'diwa-streak-cell--longest' });
            bestCell.createEl('span', { text: data.best > 0 ? String(data.best) : '—', cls: 'diwa-streak-value' });

            const monthPct = data.thisMonth > 0
                ? Math.round((data.thisMonth / moment().date()) * 100)
                : 0;
            const pctCell = row.createEl('td', { cls: 'diwa-streak-cell--month-pct' });
            const pctEl = pctCell.createEl('span', { text: `${monthPct}%`, cls: 'diwa-streak-pct' });
            if (monthPct < 40) pctEl.style.color = 'var(--text-error)';
            else if (monthPct < 75) pctEl.style.color = '#f59e0b';
            else pctEl.style.color = 'var(--color-green, #4caf50)';
        }
    }

    private renderHeatmap(parent: HTMLElement, habits: Habit[]) {
        const section = parent.createEl('div', { cls: 'diwa-habits-heatmap-section' });

        // Habit filter pills
        const filterRow = section.createEl('div', { cls: 'diwa-habits-heatmap-filter' });
        const filterPills = [{ id: 'all', label: 'All Habits' }, ...habits.map(h => ({ id: h.id, label: `${h.icon} ${h.name}` }))];
        const pillBtns: HTMLButtonElement[] = [];
        for (const fp of filterPills) {
            const pill = filterRow.createEl('button', {
                text: fp.label,
                cls: `diwa-habits-filter-pill${fp.id === this.selectedHabitId ? ' is-active' : ''}`
            }) as HTMLButtonElement;
            pill.addEventListener('click', () => {
                this.selectedHabitId = fp.id;
                pillBtns.forEach((b, i) => b.classList.toggle('is-active', filterPills[i].id === fp.id));
                this.renderHeatmapGrid(gridWrap, habits);
            });
            pillBtns.push(pill);
        }

        // Month navigation
        const navRow = section.createEl('div', { cls: 'diwa-habits-heatmap-header' });
        const prevBtn = navRow.createEl('button', { cls: 'diwa-habits-heatmap-nav' });
        setIcon(prevBtn, 'chevron-left');
        const monthLabel = navRow.createEl('span', { cls: 'diwa-habits-heatmap-month' });
        const nextBtn = navRow.createEl('button', { cls: 'diwa-habits-heatmap-nav' });
        setIcon(nextBtn, 'chevron-right');

        const isCurrentMonth = () => this.currentHeatmapMonth.isSame(moment(), 'month');
        const updateMonthLabel = () => {
            monthLabel.textContent = this.currentHeatmapMonth.format('MMMM YYYY');
            nextBtn.disabled = isCurrentMonth();
            if (isCurrentMonth()) nextBtn.style.opacity = '0.3';
            else nextBtn.style.opacity = '1';
        };
        updateMonthLabel();

        prevBtn.addEventListener('click', () => {
            this.currentHeatmapMonth.subtract(1, 'month');
            updateMonthLabel();
            this.renderHeatmapGrid(gridWrap, habits);
        });
        nextBtn.addEventListener('click', () => {
            if (isCurrentMonth()) return;
            this.currentHeatmapMonth.add(1, 'month');
            updateMonthLabel();
            this.renderHeatmapGrid(gridWrap, habits);
        });

        // Day-of-week headers
        const dowRow = section.createEl('div', { cls: 'diwa-habits-heatmap-dow' });
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(d => {
            dowRow.createEl('div', { text: d, cls: 'diwa-habits-heatmap-dow-label' });
        });

        const gridWrap = section.createEl('div');
        this.renderHeatmapGrid(gridWrap, habits);
    }

    private renderHeatmapGrid(container: HTMLElement, habits: Habit[]) {
        container.empty();
        const grid = container.createEl('div', { cls: 'diwa-habits-heatmap-grid' });
        const month = this.currentHeatmapMonth;
        const today = moment();
        const daysInMonth = month.daysInMonth();
        const firstDayOfWeek = moment(month).startOf('month').isoWeekday(); // 1=Mon, 7=Sun

        // Spacer cells for days before month starts
        for (let i = 1; i < firstDayOfWeek; i++) {
            grid.createEl('div', { cls: 'diwa-habits-heatmap-cell is-spacer' });
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateMoment = moment(month).date(day);
            const dateStr = dateMoment.format('YYYY-MM-DD');
            const isFuture = dateMoment.isAfter(today, 'day');
            const isToday = dateMoment.isSame(today, 'day');

            let isDone = false;
            let isMissed = false;
            let isPartial = false;

            if (!isFuture) {
                if (this.selectedHabitId === 'all') {
                    const activeHabits = habits;
                    const doneCount = activeHabits.filter(h => (this.habitHistoryCache.get(h.id) || new Set()).has(dateStr)).length;
                    if (doneCount === activeHabits.length && activeHabits.length > 0) isDone = true;
                    else if (doneCount > 0) isPartial = true;
                    else if (!isToday) isMissed = true;
                } else {
                    const history = this.habitHistoryCache.get(this.selectedHabitId) || new Set();
                    if (history.has(dateStr)) isDone = true;
                    else if (!isToday) isMissed = true;
                }
            }

            const cls = ['diwa-habits-heatmap-cell',
                isToday ? 'is-today' : '',
                isDone ? 'is-done' : '',
                isMissed ? 'is-missed' : '',
                isPartial ? 'is-partial' : '',
                isFuture ? 'is-future' : ''
            ].filter(Boolean).join(' ');

            const cell = grid.createEl('div', { cls, text: String(day) });
            if (isToday) cell.setAttribute('aria-current', 'date');
        }
    }

    private renderManagement(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-habits-mgmt-section' });
        const row = section.createEl('div', { cls: 'diwa-habits-mgmt-row' });

        const manageBtn = row.createEl('button', { cls: 'diwa-habits-mgmt-btn diwa-btn-secondary' });
        const manageIcon = manageBtn.createEl('span');
        setIcon(manageIcon, 'settings');
        manageBtn.createEl('span', { text: 'Manage Habits' });
        manageBtn.addEventListener('click', () => new HabitConfigModal(this.app, this.plugin).open());

        const resetBtn = row.createEl('button', { cls: 'diwa-habits-reset-btn diwa-btn-secondary' });
        const resetIcon = resetBtn.createEl('span');
        setIcon(resetIcon, 'rotate-ccw');
        resetBtn.createEl('span', { text: 'Reset Today' });
        resetBtn.addEventListener('click', () => {
            new ConfirmModal(this.app, 'Clear all habit completions for today?', async () => {
                const today = moment().format('YYYY-MM-DD');
                const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
                const path = `${habitsFolder}/${today}.md`;
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    await this.app.fileManager.processFrontMatter(file, (fm) => { fm['completed'] = []; });
                    this.view.renderView();
                }
            }).open();
        });
    }
}



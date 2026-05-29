import { moment } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';

export class MonthlyReviewTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        void this.renderMonthlyReview(container, this.beginRenderCycle());
    }

    async renderMonthlyReview(container: HTMLElement, renderToken: number) {
        container.empty();

        const wrap = container.createEl('div', { cls: 'diwa-tab-wrap diwa-monthly-wrap' });

        // Header
        const now = moment();
        this.renderPageHeader(wrap, 'Monthly Review', now.format('MMMM YYYY'));

        // Stats Row
        const statsRow = wrap.createEl('div', { cls: 'diwa-monthly-stats' });

        const monthStart = now.clone().startOf('month').format('YYYY-MM-DD');
        const monthEnd = now.clone().endOf('month').format('YYYY-MM-DD');

        const allTasks = Array.from(this.index.taskIndex.values());
        const doneTasks = allTasks.filter(t => t.status === 'done' && t.modified >= monthStart && t.modified <= monthEnd);
        // Denominator = tasks created or due this month (not entire vault history)
        const monthTasks = allTasks.filter(t => (t.created >= monthStart && t.created <= monthEnd) || (t.due && t.due >= monthStart && t.due <= monthEnd));
        const completionRate = monthTasks.length > 0 ? Math.round((doneTasks.length / monthTasks.length) * 100) : 0;
        const allOpen = allTasks.filter(t => t.status === 'open');

        const allThoughts = Array.from(this.index.thoughtIndex.values());
        const monthThoughts = allThoughts.filter(t => t.created >= monthStart);
        const processedThoughts = monthThoughts.filter(t => t.synthesized);

        const statCard = (label: string, value: string | number, sub?: string, subColor?: string) => {
            const card = statsRow.createEl('div', { cls: 'diwa-monthly-stat-card' });
            card.createEl('div', { text: String(value), cls: 'diwa-monthly-stat-value' });
            card.createEl('div', { text: label, cls: 'diwa-monthly-stat-label' });
            if (sub) card.createEl('div', { text: sub, cls: 'diwa-monthly-stat-sub', attr: { style: subColor ? `color: ${subColor}` : '' } });
        };

        statCard('Gawa Done', doneTasks.length, `${completionRate}% this month`);
        statCard('Thoughts', monthThoughts.length, `${processedThoughts.length} processed`);
        statCard('Open Gawa', allOpen.length, 'remaining');

        // 3. Project Progress
        const projectsSection = wrap.createEl('div', { cls: 'diwa-monthly-section' });
        projectsSection.createEl('h3', { text: 'Project Progress', cls: 'diwa-section-label' });

        const projectMap = new Map<string, { open: number; done: number }>();
        allTasks.forEach(t => {
            if (!t.project) return;
            const entry = projectMap.get(t.project) || { open: 0, done: 0 };
            if (t.status === 'done') entry.done++;
            else entry.open++;
            projectMap.set(t.project, entry);
        });

        if (projectMap.size === 0) {
            this.renderEmptyState(projectsSection, 'No project tasks found.');
        } else {
            Array.from(projectMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, counts]) => {
                const total = counts.open + counts.done;
                const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
                const row = projectsSection.createEl('div', { cls: 'diwa-monthly-project-row' });
                const labelRow = row.createEl('div', { cls: 'diwa-monthly-project-header' });
                labelRow.createEl('span', { text: name, cls: 'diwa-monthly-project-name' });
                labelRow.createEl('span', { text: `${counts.done}/${total} · ${pct}%`, cls: 'diwa-monthly-project-stat' });
                const bar = row.createEl('div', { cls: 'diwa-monthly-progress-track' });
                bar.createEl('div', { cls: 'diwa-monthly-progress-fill', attr: { style: `width: ${pct}%` } });
            });
        }

        // 4. Next Month Focus
        const focusSection = wrap.createEl('div', { cls: 'diwa-monthly-focus' });
        focusSection.createEl('h3', { text: 'Next Month\'s Focus', cls: 'diwa-monthly-focus-title' });

        const monthId = now.format('YYYY-MM');
        // Load from MD file first (source of truth), fallback to settings
        const savedGoals = await this.vault.loadMonthlyGoals(monthId);
        if (!this.isRenderCycleActive(renderToken, container)) return;
        const goals = savedGoals ?? (this.settings.monthlyGoals || []);
        // Sync settings if MD had fresher data
        if (savedGoals) { this.settings.monthlyGoals = savedGoals; }

        for (let i = 0; i < 3; i++) {
            const val = goals[i] || '';
            const inp = focusSection.createEl('input', {
                type: 'text',
                cls: 'diwa-monthly-goal-input',
                attr: { placeholder: `Monthly goal ${i + 1}...`, value: val }
            });
            inp.addEventListener('change', async () => {
                const newGoals = [...(this.settings.monthlyGoals || [])];
                newGoals[i] = inp.value;
                this.settings.monthlyGoals = newGoals;
                await this.plugin.saveSettings();
                await this.vault.saveMonthlyGoals(monthId, newGoals);
            });
        }
    }
}

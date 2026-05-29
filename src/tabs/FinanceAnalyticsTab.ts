import { moment, TFile } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { DueEntry } from '../types';

interface FinanceAnalyticsSnapshot {
    activeDueCount: number;
    totalObligations: number;
    overdueCount: number;
    dueThisWeekCount: number;
    paidThisMonthCount: number;
    categories: Array<[string, number]>;
}

export class FinanceAnalyticsTab extends BaseTab {
    private _dueCategoryCache = new Map<string, { mtime: number; category: string }>();

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('section', {
            cls: 'diwa-fanalytics-wrap',
            attr: { 'aria-label': 'Bulsa insights' },
        });

        const today = moment().startOf('day');
        const weekEnd = moment().endOf('isoWeek');
        const monthStart = moment().startOf('month');
        const analytics = this._buildAnalyticsSnapshot(today, weekEnd, monthStart);
        const monthlyIncome = this.settings.monthlyIncome || 0;
        const cashflow = monthlyIncome - analytics.totalObligations;

        const header = wrap.createEl('header', { cls: 'diwa-fanalytics-header' });
        const headerCopy = header.createEl('div', { cls: 'diwa-fanalytics-header-copy' });
        headerCopy.createEl('span', { text: 'Finance analytics', cls: 'diwa-fanalytics-eyebrow' });
        headerCopy.createEl('h2', { text: 'Bulsa Insights', cls: 'diwa-fanalytics-title' });
        headerCopy.createEl('p', {
            text: 'Cashflow, category mix, and payment rhythm across your current dues.',
            cls: 'diwa-fanalytics-subtitle',
        });

        const headerActions = header.createEl('div', { cls: 'diwa-fanalytics-header-actions' });
        headerActions.createEl('span', {
            text: moment().format('MMMM YYYY'),
            cls: 'diwa-fanalytics-period-chip',
        });
        const backBtn = headerActions.createEl('button', {
            text: '← Back to Bulsa',
            cls: 'diwa-fanalytics-back-btn',
            attr: { type: 'button' },
        });
        backBtn.addEventListener('click', () => {
            this.view.activeTab = 'dues';
            this.view.renderView();
        });

        const grid = wrap.createEl('div', { cls: 'diwa-fanalytics-grid' });

        const cashCard = grid.createEl('section', { cls: 'diwa-fanalytics-card diwa-fanalytics-card--cashflow' });
        cashCard.createEl('div', { text: 'Cashflow Snapshot', cls: 'diwa-fanalytics-card-title' });
        const cashRow = cashCard.createEl('div', { cls: 'diwa-fanalytics-cashflow-row' });
        this._cfStat(cashRow, monthlyIncome > 0 ? `€${monthlyIncome.toLocaleString()}` : '—', 'Monthly Income', '');
        this._cfStat(cashRow, analytics.totalObligations > 0 ? `€${analytics.totalObligations.toFixed(0)}` : '€0', 'Obligations', '');
        this._cfStat(
            cashRow,
            cashflow >= 0 ? `+€${cashflow.toFixed(0)}` : `-€${Math.abs(cashflow).toFixed(0)}`,
            'Cashflow',
            cashflow >= 0 ? 'is-positive' : 'is-negative',
        );

        if (monthlyIncome > 0) {
            const pct = Math.min(100, Math.round((analytics.totalObligations / monthlyIncome) * 100));
            const barWrap = cashCard.createEl('div', { cls: 'diwa-fanalytics-obligations-bar' });
            const fill = barWrap.createEl('div', {
                cls: `diwa-fanalytics-obligations-fill ${this._obligationTone(pct)}`,
            });
            fill.style.setProperty('--diwa-fanalytics-fill-width', `${pct}%`);
            cashCard.createEl('div', {
                text: `Obligations use ${pct}% of income`,
                cls: 'diwa-finance-footnote diwa-fanalytics-footnote',
            });
        } else {
            cashCard.createEl('div', {
                text: 'Add monthly income in settings to compare Bulsa obligations against take-home cashflow.',
                cls: 'diwa-fanalytics-empty',
            });
        }

        const categoryCard = grid.createEl('section', { cls: 'diwa-fanalytics-card diwa-fanalytics-card--categories' });
        categoryCard.createEl('div', { text: 'Obligations by Category', cls: 'diwa-fanalytics-card-title' });

        if (analytics.categories.length === 0) {
            categoryCard.createEl('div', {
                text: 'Bulsa is waiting for category data.',
                cls: 'diwa-fanalytics-empty',
            });
        } else {
            const maxAmount = analytics.categories[0]?.[1] || 1;
            for (const [category, amount] of analytics.categories) {
                const row = categoryCard.createEl('div', { cls: 'diwa-fanalytics-bar-row' });
                row.createEl('div', {
                    text: category,
                    cls: 'diwa-fanalytics-bar-label',
                    attr: { title: category },
                });
                const track = row.createEl('div', { cls: 'diwa-fanalytics-bar-track' });
                const fill = track.createEl('div', { cls: 'diwa-fanalytics-bar-fill' });
                fill.style.setProperty('--diwa-fanalytics-fill-width', `${Math.round((amount / maxAmount) * 100)}%`);
                row.createEl('div', { text: `€${amount.toFixed(0)}`, cls: 'diwa-fanalytics-bar-amount' });
            }
        }

        const statsCard = grid.createEl('section', { cls: 'diwa-fanalytics-card diwa-fanalytics-card--stats' });
        statsCard.createEl('div', { text: 'Bulsa Pulse', cls: 'diwa-fanalytics-card-title' });
        const statsGrid = statsCard.createEl('div', { cls: 'diwa-fanalytics-quick-grid' });
        this._quickStat(statsGrid, analytics.overdueCount.toString(), 'Overdue', analytics.overdueCount > 0 ? 'is-negative' : '');
        this._quickStat(statsGrid, analytics.dueThisWeekCount.toString(), 'Due This Week', '');
        this._quickStat(statsGrid, analytics.activeDueCount.toString(), 'Total Active', '');
        this._quickStat(statsGrid, analytics.paidThisMonthCount.toString(), 'Paid This Month', analytics.paidThisMonthCount > 0 ? 'is-positive' : '');
    }

    private _cfStat(parent: HTMLElement, value: string, label: string, valueCls: string) {
        const stat = parent.createEl('div', { cls: 'diwa-fanalytics-cf-stat' });
        stat.createEl('div', { text: value, cls: `diwa-fanalytics-cf-value${valueCls ? ` ${valueCls}` : ''}` });
        stat.createEl('div', { text: label, cls: 'diwa-fanalytics-cf-label' });
    }

    private _quickStat(parent: HTMLElement, value: string, label: string, valueCls: string) {
        const stat = parent.createEl('div', { cls: 'diwa-fanalytics-quick-stat' });
        stat.createEl('div', { text: value, cls: `diwa-fanalytics-cf-value${valueCls ? ` ${valueCls}` : ''}` });
        stat.createEl('div', { text: label, cls: 'diwa-fanalytics-cf-label' });
    }

    private _obligationTone(percent: number): string {
        if (percent > 80) return 'is-negative';
        if (percent > 60) return 'is-warning';
        return 'is-positive';
    }

    private _buildAnalyticsSnapshot(today: any, weekEnd: any, monthStart: any): FinanceAnalyticsSnapshot {
        const map = new Map<string, number>();
        let activeDueCount = 0;
        let totalObligations = 0;
        let overdueCount = 0;
        let dueThisWeekCount = 0;
        let paidThisMonthCount = 0;

        for (const due of this.index.dueIndex.values()) {
            if (due.isActive) {
                activeDueCount++;
                totalObligations += due.amount || 0;
                if (due.dueMoment?.isValid()) {
                    if (due.dueMoment.isBefore(today)) {
                        overdueCount++;
                    } else if (due.dueMoment.isSameOrAfter(today) && due.dueMoment.isSameOrBefore(weekEnd)) {
                        dueThisWeekCount++;
                    }
                }
                const category = this._getDueCategory(due);
                map.set(category, (map.get(category) || 0) + (due.amount || 0));
                continue;
            }

            if (!due.lastPayment) continue;
            const paidAt = moment(due.lastPayment, 'YYYY-MM-DD', true);
            if (paidAt.isValid() && paidAt.isSameOrAfter(monthStart)) {
                paidThisMonthCount++;
            }
        }

        return {
            activeDueCount,
            totalObligations,
            overdueCount,
            dueThisWeekCount,
            paidThisMonthCount,
            categories: Array.from(map.entries()).sort((a, b) => b[1] - a[1]),
        };
    }

    private _getDueCategory(due: DueEntry): string {
        const file = this.app.vault.getAbstractFileByPath(due.path);
        if (!(file instanceof TFile)) return 'Uncategorized';

        const cached = this._dueCategoryCache.get(due.path);
        if (cached && cached.mtime === file.stat.mtime) {
            return cached.category;
        }

        let category = 'Uncategorized';
        const cache = this.app.metadataCache.getFileCache(file);
        const context = cache?.frontmatter?.context || cache?.frontmatter?.contexts;
        if (context) {
            const first = Array.isArray(context) ? context[0] : String(context).split(/[,\s]/)[0];
            if (first && String(first).trim()) {
                category = String(first).trim().replace(/^#/, '');
            }
        }

        this._dueCategoryCache.set(due.path, { mtime: file.stat.mtime, category });
        return category;
    }
}

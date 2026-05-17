import { moment } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { DueEntry } from '../types';

export class FinanceAnalyticsTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'diwa-fanalytics-wrap' });

        // ── Header (full-width on desktop grid) ───────────────────────────
        const headerRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
        headerRow.createEl('h2', { text: 'Finance Analytics', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800;' } });

        // ── Gather data ───────────────────────────────────────────────────
        const today = moment().startOf('day');
        const weekEnd = moment().endOf('isoWeek');
        const monthStart = moment().startOf('month');

        const allDues = Array.from(this.index.dueIndex.values());
        const activeDues = allDues.filter(d => d.isActive);
        const totalObligations = activeDues.reduce((sum, d) => sum + (d.amount || 0), 0);
        const monthlyIncome = this.settings.monthlyIncome || 0;
        const cashflow = monthlyIncome - totalObligations;

        // ── Cashflow Overview card ────────────────────────────────────────
        const cashCard = wrap.createEl('div', { cls: 'diwa-fanalytics-card' });
        cashCard.createEl('div', { text: 'Cashflow Overview', cls: 'diwa-fanalytics-card-title' });

        const cfRow = cashCard.createEl('div', { cls: 'diwa-fanalytics-cashflow-row' });
        this._cfStat(cfRow, monthlyIncome > 0 ? `€${monthlyIncome.toLocaleString()}` : '—', 'Monthly Income', '');
        this._cfStat(cfRow, totalObligations > 0 ? `€${totalObligations.toFixed(0)}` : '€0', 'Obligations', '');
        this._cfStat(cfRow,
            cashflow >= 0 ? `+€${cashflow.toFixed(0)}` : `-€${Math.abs(cashflow).toFixed(0)}`,
            'Cashflow',
            cashflow >= 0 ? 'is-positive' : 'is-negative'
        );

        if (monthlyIncome > 0) {
            const pct = Math.min(100, Math.round((totalObligations / monthlyIncome) * 100));
            const barWrap = cashCard.createEl('div', { cls: 'diwa-fanalytics-obligations-bar' });
            const fill = barWrap.createEl('div', { cls: 'diwa-fanalytics-obligations-fill' });
            fill.style.width = `${pct}%`;
            fill.style.background = pct > 80 ? 'var(--color-red, #ef4444)' : pct > 60 ? 'var(--color-orange, #f97316)' : 'var(--interactive-accent)';
            cashCard.createEl('div', { text: `Obligations = ${pct}% of income`, cls: 'diwa-finance-footnote' });
        }

        // ── Obligations by Category card ──────────────────────────────────
        const catCard = wrap.createEl('div', { cls: 'diwa-fanalytics-card' });
        catCard.createEl('div', { text: 'Obligations by Category', cls: 'diwa-fanalytics-card-title' });

        const categoryMap = this._buildCategoryMap(activeDues);

        if (categoryMap.size === 0) {
            catCard.createEl('div', { text: 'No category data', attr: { style: 'color: var(--text-muted); font-size: 0.85em;' } });
        } else {
            const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
            const maxAmt = sorted[0]?.[1] || 1;
            for (const [cat, amt] of sorted) {
                const row = catCard.createEl('div', { cls: 'diwa-fanalytics-bar-row' });
                row.createEl('div', { text: cat, cls: 'diwa-fanalytics-bar-label', attr: { title: cat } });
                const track = row.createEl('div', { cls: 'diwa-fanalytics-bar-track' });
                const fill = track.createEl('div', { cls: 'diwa-fanalytics-bar-fill' });
                fill.style.width = `${Math.round((amt / maxAmt) * 100)}%`;
                row.createEl('div', { text: `€${amt.toFixed(0)}`, cls: 'diwa-fanalytics-bar-amount' });
            }
        }

        // ── Quick Stats card ──────────────────────────────────────────────
        const statsCard = wrap.createEl('div', { cls: 'diwa-fanalytics-card' });
        statsCard.createEl('div', { text: 'Quick Stats', cls: 'diwa-fanalytics-card-title' });

        const overdueCount = activeDues.filter(d => d.dueMoment?.isValid() && d.dueMoment.isBefore(today)).length;
        const dueThisWeekCount = activeDues.filter(d => d.dueMoment?.isValid() && d.dueMoment.isSameOrAfter(today) && d.dueMoment.isSameOrBefore(weekEnd)).length;
        const paidThisMonthCount = allDues.filter(d => {
            if (d.isActive) return false;
            if (!d.lastPayment) return false;
            const lp = moment(d.lastPayment, 'YYYY-MM-DD', true);
            return lp.isValid() && lp.isSameOrAfter(monthStart);
        }).length;

        const statsGrid = statsCard.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;' } });
        this._quickStat(statsGrid, overdueCount.toString(), 'Overdue', overdueCount > 0 ? 'is-negative' : '');
        this._quickStat(statsGrid, dueThisWeekCount.toString(), 'Due This Week', '');
        this._quickStat(statsGrid, activeDues.length.toString(), 'Total Active', '');
        this._quickStat(statsGrid, paidThisMonthCount.toString(), 'Paid This Month', paidThisMonthCount > 0 ? 'is-positive' : '');

        // ── Back to Finance button ─────────────────────────────────────────
        const backBtn = wrap.createEl('button', {
            text: '← Back to Finance',
            attr: { style: 'align-self: flex-start; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 8px 16px; cursor: pointer; font-size: 0.85em; color: var(--text-muted);' }
        });
        backBtn.addEventListener('click', () => { this.view.activeTab = 'dues'; this.view.renderView(); });
    }

    private _cfStat(parent: HTMLElement, value: string, label: string, valueCls: string) {
        const s = parent.createEl('div', { cls: 'diwa-fanalytics-cf-stat' });
        s.createEl('div', { text: value, cls: `diwa-fanalytics-cf-value${valueCls ? ' ' + valueCls : ''}` });
        s.createEl('div', { text: label, cls: 'diwa-fanalytics-cf-label' });
    }

    private _quickStat(parent: HTMLElement, value: string, label: string, valueCls: string) {
        const s = parent.createEl('div', { attr: { style: 'background: var(--background-primary); border-radius: 10px; padding: 10px; text-align: center;' } });
        s.createEl('div', { text: value, cls: `diwa-fanalytics-cf-value${valueCls ? ' ' + valueCls : ''}` });
        s.createEl('div', { text: label, cls: 'diwa-fanalytics-cf-label' });
    }

    private _buildCategoryMap(dues: DueEntry[]): Map<string, number> {
        const map = new Map<string, number>();
        for (const d of dues) {
            // Try to get context from metadata cache
            const file = this.app.vault.getAbstractFileByPath(d.path);
            let category = 'Uncategorized';
            if (file) {
                const cache = this.app.metadataCache.getFileCache(file as any);
                const ctx = cache?.frontmatter?.['context'] || cache?.frontmatter?.['contexts'];
                if (ctx) {
                    const first = Array.isArray(ctx) ? ctx[0] : String(ctx).split(/[,\s]/)[0];
                    if (first && String(first).trim()) category = String(first).trim().replace(/^#/, '');
                }
            }
            map.set(category, (map.get(category) || 0) + (d.amount || 0));
        }
        return map;
    }
}


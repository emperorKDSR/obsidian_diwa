import { moment, Platform, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";

export class DuesTab extends BaseTab {
    showAll: boolean = false;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDuesMode(container);
    }

    async renderDuesMode(container: HTMLElement) {
        container.empty();

        // ── Outer scroll wrapper ──────────────────────────────────────────
        const wrap = container.createEl('div', { cls: 'diwa-bills-wrap' });

        // ── 1. Header ────────────────────────────────────────────────────
        const header = wrap.createEl('div', { cls: 'diwa-bills-header' });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
        const titleRow = header.createEl('div', { cls: 'diwa-bills-title-row' });
        const titleStack = titleRow.createEl('div', { cls: 'diwa-bills-title-stack' });
        titleStack.createEl('h2', { text: 'Bill Overview', cls: 'diwa-bills-title' });
        titleStack.createEl('span', { text: moment().format('MMMM YYYY'), cls: 'diwa-bills-subtitle' });

        // Inline "+" — visible on desktop; FAB replaces it on mobile
        const addBtnInline = titleRow.createEl('button', {
            text: '+ New Bill',
            cls: 'diwa-bills-inline-add-btn'
        });
        addBtnInline.addEventListener('click', () => {
            new NewDueModal(this.app, this.settings.pfFolder, async () => { await this.index.buildDueIndex(); this.renderDuesMode(container); }).open();
        });

        const analyticsBtn = titleRow.createEl('button', {
            text: 'Analytics →',
            cls: 'diwa-bills-inline-add-btn'
        });
        analyticsBtn.addEventListener('click', () => { this.view.activeTab = 'finance-analytics'; this.view.renderView(); });

        // ── 2. Summary Strip ─────────────────────────────────────────────
        const allEntries = this.buildEntries();
        const today      = moment().startOf('day');

        const activeEntries   = allEntries.filter(e => e.isActive);
        const overdueEntries  = activeEntries.filter(e => e.dueMoment?.isValid() && e.dueMoment.isBefore(today));
        const todayEntries    = activeEntries.filter(e => e.dueMoment?.isValid() && e.dueMoment.isSame(today, 'day'));
        const upcomingEntries = activeEntries.filter(e => e.dueMoment?.isValid() && e.dueMoment.isAfter(today));
        const totalMonthly    = activeEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);

        const summary = wrap.createEl('div', { cls: 'diwa-bills-summary' });

        const renderMetric = (value: string, label: string, mod = '') => {
            const chip = summary.createEl('div', { cls: `diwa-bills-metric-chip${mod ? ' ' + mod : ''}` });
            chip.createEl('div', { text: value, cls: 'diwa-bills-metric-value' });
            chip.createEl('div', { text: label, cls: 'diwa-bills-metric-label' });
        };
        renderMetric(
            overdueEntries.length.toString(), 'Overdue',
            overdueEntries.length > 0 ? 'is-danger' : ''
        );
        renderMetric(
            todayEntries.length.toString(), 'Due Today',
            todayEntries.length > 0 ? 'is-accent' : ''
        );
        renderMetric(upcomingEntries.length.toString(), 'Upcoming');
        renderMetric(
            totalMonthly > 0
                ? totalMonthly.toLocaleString()
                : activeEntries.length.toString(),
            totalMonthly > 0 ? 'Total / Mo' : 'Active Bills'
        );

        // ── 3. Full-Width Filter Toggle ──────────────────────────────────
        const toggleBar = wrap.createEl('div', { cls: 'diwa-bills-toggle' });

        const mkToggleBtn = (label: string, isActive: boolean, onClick: () => void) => {
            const btn = toggleBar.createEl('button', {
                text: label,
                cls: `diwa-bills-toggle-btn${isActive ? ' is-active' : ''}`
            });
            btn.addEventListener('click', onClick);
        };
        mkToggleBtn('Active', !this.showAll, () => { this.showAll = false; this.renderDuesMode(container); });
        mkToggleBtn('All History', this.showAll, () => { this.showAll = true; this.renderDuesMode(container); });

        // ── 4. Bill Cards ────────────────────────────────────────────────
        const entries       = allEntries.filter(e => this.showAll || e.isActive);
        const listContainer = wrap.createEl('div', { cls: 'diwa-bills-list' });

        if (entries.length === 0) {
            this.renderBillsEmptyState(listContainer, () => this.renderDuesMode(container));
        } else {
            entries.forEach(entry => {
                const isOverdue = entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today);
                const isToday   = entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day');
                const isPaid    = !entry.isActive;
                const daysUntil = (entry.dueMoment?.isValid() && !isOverdue && !isToday)
                    ? entry.dueMoment.diff(today, 'days') : null;
                const isSoon    = daysUntil !== null && daysUntil <= 7;

                const statusClass = isOverdue ? 'is-overdue'
                    : isToday   ? 'is-today'
                    : isPaid    ? 'is-paid'
                    : isSoon    ? 'is-soon'
                    : 'is-upcoming';

                // ── Card shell ───────────────────────────────────────────
                const card = listContainer.createEl('div', {
                    cls: `diwa-bills-card ${statusClass}${isPaid ? ' is-inactive' : ''}`
                });

                // Left accent stripe
                card.createEl('div', { cls: 'diwa-bills-card-stripe' });

                // Body — tap area → open vault file
                const body = card.createEl('div', { cls: 'diwa-bills-card-body' });
                body.addEventListener('click', () => {
                    this.plugin.app.workspace.openLinkText(
                        entry.title, entry.path,
                        Platform.isMobile ? 'tab' : 'window'
                    );
                });

                // Top row: name + amount
                const topRow = body.createEl('div', { cls: 'diwa-bills-card-top' });
                topRow.createEl('span', { text: entry.title, cls: 'diwa-bills-card-name' });

                // Amount: prefer explicit field, fall back to regex extraction from title
                const displayAmount = entry.amount != null
                    ? entry.amount.toLocaleString()
                    : (entry.title.match(/[\d,.]+/) ?? [])[0];
                if (displayAmount) {
                    topRow.createEl('span', { text: displayAmount, cls: 'diwa-bills-card-amount' });
                }

                // Meta row: status badge + recurring tag + last payment
                const meta = body.createEl('div', { cls: 'diwa-bills-card-meta' });

                if (isOverdue) {
                    meta.createEl('span', { text: 'Overdue', cls: 'diwa-bills-badge diwa-bills-badge--overdue' });
                } else if (isToday) {
                    meta.createEl('span', { text: 'Due Today', cls: 'diwa-bills-badge diwa-bills-badge--today' });
                } else if (isPaid) {
                    meta.createEl('span', { text: 'Paid', cls: 'diwa-bills-badge diwa-bills-badge--paid' });
                } else if (entry.dueMoment?.isValid()) {
                    const label = daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil}d`;
                    meta.createEl('span', { text: label, cls: 'diwa-bills-badge diwa-bills-badge--upcoming' });
                }

                if (entry.hasRecurring) {
                    meta.createEl('span', { text: '↻ Recurring', cls: 'diwa-bills-badge diwa-bills-badge--recurring' });
                }

                if (entry.lastPayment) {
                    meta.createEl('span', {
                        text: `Paid ${moment(entry.lastPayment).fromNow()}`,
                        cls: 'diwa-bills-last-payment'
                    });
                }

                // Pay button — active recurring bills only
                if (entry.hasRecurring && entry.isActive) {
                    const actions = card.createEl('div', { cls: 'diwa-bills-card-actions' });
                    const payBtn  = actions.createEl('button', {
                        cls: 'diwa-bills-pay-btn',
                        attr: { 'aria-label': `Pay ${entry.title}`, title: 'Record payment' }
                    });
                    setIcon(payBtn, 'lucide-credit-card');
                    // Prevent card's tap-to-open from firing when the pay button is tapped
                    payBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const file = this.app.vault.getAbstractFileByPath(entry.path);
                        if (file instanceof TFile) {
                            new PaymentModal(
                                this.app, this.plugin, file,
                                entry.dueDate,
                                async () => { await this.index.buildDueIndex(); this.renderDuesMode(container); }
                            ).open();
                        }
                    });
                }
            });
        }

        // ── 5. FAB — mobile sticky bottom-right ─────────────────────────
        // Rendered after the list so it stacks correctly in the flex column
        const fab = wrap.createEl('button', {
            cls: 'diwa-bills-fab',
            attr: { 'aria-label': 'Add new bill', title: 'New Bill' }
        });
        setIcon(fab, 'lucide-plus');
        fab.addEventListener('click', () => {
            new NewDueModal(this.app, this.settings.pfFolder, async () => { await this.index.buildDueIndex(); this.renderDuesMode(container); }).open();
        });
    }

    // ── Mobile Empty State ───────────────────────────────────────────────
    private renderBillsEmptyState(parent: HTMLElement, onCta: () => void) {
        const empty = parent.createEl('div', { cls: 'diwa-bills-empty' });
        empty.createEl('div', { cls: 'diwa-bills-empty-icon', text: '📄' });
        empty.createEl('p', {
            text: this.showAll ? 'No bill history yet.' : 'No active bills.',
            cls: 'diwa-bills-empty-title'
        });
        empty.createEl('p', {
            text: 'Track recurring payments, subscriptions, and dues — all in one place.',
            cls: 'diwa-bills-empty-body'
        });
        const cta = empty.createEl('button', { text: '+ Add your first bill', cls: 'diwa-bills-empty-cta' });
        cta.addEventListener('click', onCta);
    }

    private buildEntries(): DueEntry[] {
        // ob-perf-03: Read from pre-built index (O(1)) instead of scanning vault on every render
        return Array.from(this.index.dueIndex.values())
            .sort((a, b) => (a.dueMoment?.valueOf() || 0) - (b.dueMoment?.valueOf() || 0));
    }
}


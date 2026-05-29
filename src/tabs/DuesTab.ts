import { moment, Platform, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import type { DueEntry } from '../types';
import { PaymentModal } from '../modals/PaymentModal';
import { NewDueModal } from '../modals/NewDueModal';

export class DuesTab extends BaseTab {
    showAll: boolean = false;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        void this.renderDuesMode(container);
    }

    async renderDuesMode(container: HTMLElement) {
        container.empty();

        const allEntries = this.buildEntries();
        const today = moment().startOf('day');
        const activeEntries = allEntries.filter((entry) => entry.isActive);
        const overdueEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today));
        const todayEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day'));
        const upcomingEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isAfter(today));
        const totalMonthly = activeEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);

        const refreshDues = async () => {
            await this.index.buildDueIndex();
            await this.renderDuesMode(container);
        };
        const openNewDueModal = () => {
            new NewDueModal(this.app, this.vault, this.settings.pfFolder, refreshDues).open();
        };
        const openInsights = () => {
            this.view.activeTab = 'finance-analytics';
            this.view.renderView();
        };

        const wrap = container.createEl('section', {
            cls: 'diwa-bills-wrap',
            attr: { 'aria-label': 'Bulsa dues workspace' },
        });

        const header = wrap.createEl('header', { cls: 'diwa-bills-header' });
        const headerMain = header.createEl('div', { cls: 'diwa-bills-header-main' });
        const titleRow = headerMain.createEl('div', { cls: 'diwa-bills-title-row' });
        const titleStack = titleRow.createEl('div', { cls: 'diwa-bills-title-stack' });
        titleStack.createEl('span', { text: 'Finance workspace', cls: 'diwa-bills-eyebrow' });
        titleStack.createEl('h2', { text: 'Bulsa', cls: 'diwa-bills-title' });
        titleStack.createEl('span', {
            text: `${moment().format('MMMM YYYY')} ledger`,
            cls: 'diwa-bills-subtitle',
        });

        const actions = headerMain.createEl('div', { cls: 'diwa-bills-header-actions' });
        const addBtnInline = actions.createEl('button', {
            text: 'Add Due',
            cls: 'diwa-bills-inline-add-btn diwa-bills-inline-add-btn--primary',
            attr: { type: 'button' },
        });
        addBtnInline.addEventListener('click', openNewDueModal);

        const analyticsBtn = actions.createEl('button', {
            text: 'Bulsa Insights',
            cls: 'diwa-bills-inline-add-btn diwa-bills-inline-add-btn--secondary',
            attr: { type: 'button' },
        });
        analyticsBtn.addEventListener('click', openInsights);

        header.createEl('p', {
            text: 'Recurring dues, subscriptions, and household commitments in one calm ledger.',
            cls: 'diwa-bills-header-copy',
        });

        const headerChips = header.createEl('div', { cls: 'diwa-bills-header-chips' });
        headerChips.createEl('span', {
            text: `${activeEntries.length} active due${activeEntries.length === 1 ? '' : 's'}`,
            cls: 'diwa-bills-header-chip',
        });
        headerChips.createEl('span', {
            text: overdueEntries.length > 0 ? `${overdueEntries.length} overdue` : 'All caught up',
            cls: 'diwa-bills-header-chip diwa-bills-header-chip--accent',
        });

        const summary = wrap.createEl('section', {
            cls: 'diwa-bills-summary',
            attr: { 'aria-label': 'Bulsa summary' },
        });

        const renderMetric = (value: string, label: string, mod = '') => {
            const chip = summary.createEl('article', { cls: `diwa-bills-metric-chip${mod ? ` ${mod}` : ''}` });
            chip.createEl('div', { text: value, cls: 'diwa-bills-metric-value' });
            chip.createEl('div', { text: label, cls: 'diwa-bills-metric-label' });
        };
        renderMetric(overdueEntries.length.toString(), 'Overdue', overdueEntries.length > 0 ? 'is-danger' : '');
        renderMetric(todayEntries.length.toString(), 'Due Today', todayEntries.length > 0 ? 'is-accent' : '');
        renderMetric(upcomingEntries.length.toString(), 'Upcoming');
        renderMetric(
            totalMonthly > 0 ? totalMonthly.toLocaleString() : activeEntries.length.toString(),
            totalMonthly > 0 ? 'Total / Mo' : 'Active Dues',
        );

        const toggleBar = wrap.createEl('nav', {
            cls: 'diwa-bills-toggle',
            attr: { 'aria-label': 'Bulsa due filters' },
        });

        const mkToggleBtn = (label: string, isActive: boolean, onClick: () => void) => {
            const btn = toggleBar.createEl('button', {
                text: label,
                cls: `diwa-bills-toggle-btn${isActive ? ' is-active' : ''}`,
                attr: { type: 'button', 'aria-pressed': isActive ? 'true' : 'false' },
            });
            btn.addEventListener('click', onClick);
        };
        mkToggleBtn('Active', !this.showAll, () => {
            this.showAll = false;
            void this.renderDuesMode(container);
        });
        mkToggleBtn('All History', this.showAll, () => {
            this.showAll = true;
            void this.renderDuesMode(container);
        });

        const entries = allEntries.filter((entry) => this.showAll || entry.isActive);
        const listContainer = wrap.createEl('section', {
            cls: 'diwa-bills-list',
            attr: { 'aria-label': this.showAll ? 'All Bulsa dues' : 'Active Bulsa dues' },
        });

        if (entries.length === 0) {
            this.renderBillsEmptyState(listContainer, openNewDueModal);
        } else {
            entries.forEach((entry) => {
                const isOverdue = entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today);
                const isToday = entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day');
                const isPaid = !entry.isActive;
                const daysUntil = entry.dueMoment?.isValid() && !isOverdue && !isToday
                    ? entry.dueMoment.diff(today, 'days')
                    : null;
                const isSoon = daysUntil !== null && daysUntil <= 7;

                const statusClass = isOverdue
                    ? 'is-overdue'
                    : isToday
                        ? 'is-today'
                        : isPaid
                            ? 'is-paid'
                            : isSoon
                                ? 'is-soon'
                                : 'is-upcoming';

                const card = listContainer.createEl('article', {
                    cls: `diwa-bills-card ${statusClass}${isPaid ? ' is-inactive' : ''}`,
                });
                card.createEl('div', { cls: 'diwa-bills-card-stripe' });

                const body = card.createEl('div', {
                    cls: 'diwa-bills-card-body',
                    attr: {
                        role: 'button',
                        tabindex: '0',
                        'aria-label': `Open ${entry.title}`,
                    },
                });
                const openEntry = () => {
                    this.plugin.app.workspace.openLinkText(
                        entry.title,
                        entry.path,
                        Platform.isMobile ? 'tab' : 'window',
                    );
                };
                body.addEventListener('click', openEntry);
                body.addEventListener('keydown', (evt: KeyboardEvent) => {
                    if (evt.key === 'Enter' || evt.key === ' ') {
                        evt.preventDefault();
                        openEntry();
                    }
                });

                const topRow = body.createEl('div', { cls: 'diwa-bills-card-top' });
                topRow.createEl('span', { text: entry.title, cls: 'diwa-bills-card-name' });

                const displayAmount = entry.amount != null
                    ? entry.amount.toLocaleString()
                    : (entry.title.match(/[\d,.]+/) ?? [])[0];
                if (displayAmount) {
                    topRow.createEl('span', { text: displayAmount, cls: 'diwa-bills-card-amount' });
                }

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
                        cls: 'diwa-bills-last-payment',
                    });
                }

                if (entry.hasRecurring && entry.isActive) {
                    const actionsRow = card.createEl('div', { cls: 'diwa-bills-card-actions' });
                    const payBtn = actionsRow.createEl('button', {
                        cls: 'diwa-bills-pay-btn',
                        attr: {
                            type: 'button',
                            'aria-label': `Pay ${entry.title}`,
                            title: 'Record payment',
                        },
                    });
                    setIcon(payBtn, 'lucide-credit-card');
                    payBtn.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        const file = this.app.vault.getAbstractFileByPath(entry.path);
                        if (file instanceof TFile) {
                            new PaymentModal(
                                this.app,
                                this.plugin,
                                file,
                                entry.dueDate,
                                refreshDues,
                            ).open();
                        }
                    });
                }
            });
        }

        const fab = wrap.createEl('button', {
            cls: 'diwa-bills-fab',
            attr: {
                type: 'button',
                'aria-label': 'Add Due',
                title: 'Add Due',
            },
        });
        setIcon(fab, 'lucide-plus');
        fab.addEventListener('click', openNewDueModal);
    }

    private renderBillsEmptyState(parent: HTMLElement, onCta: () => void) {
        const empty = parent.createEl('div', { cls: 'diwa-bills-empty' });
        empty.createEl('div', { cls: 'diwa-bills-empty-icon', text: '₱' });
        empty.createEl('p', {
            text: this.showAll ? 'No Bulsa history yet.' : 'No active dues in Bulsa.',
            cls: 'diwa-bills-empty-title',
        });
        empty.createEl('p', {
            text: 'Bulsa keeps recurring payments, subscriptions, and shared dues in one calm place.',
            cls: 'diwa-bills-empty-body',
        });
        const cta = empty.createEl('button', {
            text: 'Add your first due',
            cls: 'diwa-bills-empty-cta',
            attr: { type: 'button' },
        });
        cta.addEventListener('click', onCta);
    }

    private buildEntries(): DueEntry[] {
        return Array.from(this.index.dueIndex.values())
            .sort((a, b) => (a.dueMoment?.valueOf() || 0) - (b.dueMoment?.valueOf() || 0));
    }
}

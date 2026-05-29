import { moment, setIcon } from 'obsidian';
import {
    deriveBulsaInsightsSnapshot,
    deriveBulsaLedgerSnapshot,
    type BulsaInsightsSnapshot,
    type BulsaLedgerEntry,
    type BulsaLedgerSnapshot,
} from '../bulsa/selectors';
import type { BulsaLeafState, BulsaMode, DueEntry } from '../types';

type ResponsiveBulsaPlatform = 'mobile' | 'tablet';

type ShellBulsaState = Required<BulsaLeafState>;

interface ResponsiveBulsaRenderContext {
    platform: ResponsiveBulsaPlatform;
    ledger: BulsaLedgerSnapshot;
    insights: BulsaInsightsSnapshot;
    monthlyIncome: number;
    state: ShellBulsaState;
    selectedEntry: BulsaLedgerEntry | null;
    featuredEntry: BulsaLedgerEntry | null;
    payableEntry: BulsaLedgerEntry | null;
}

export interface ResponsiveBulsaRenderOptions {
    container: HTMLElement;
    platform: ResponsiveBulsaPlatform;
    dues: Iterable<DueEntry>;
    monthlyIncome: number;
    state: ShellBulsaState;
    selectedDuePath: string | null;
    onModeChange: (mode: BulsaMode) => void;
    onShowAllChange: (showAll: boolean) => void;
    onSelectDue: (path: string) => void;
    onAddDue: () => void;
    onOpenDue: (entry: DueEntry) => void;
    onRecordPayment: (entry: DueEntry) => void;
}

export function renderResponsiveBulsa(options: ResponsiveBulsaRenderOptions): void {
    const today = moment().startOf('day');
    const ledger = deriveBulsaLedgerSnapshot(options.dues, {
        showAll: options.state.showAllDues,
        today,
    });
    const insights = deriveBulsaInsightsSnapshot(ledger.allEntries, {
        today,
        weekEnd: today.clone().endOf('isoWeek'),
        monthStart: today.clone().startOf('month'),
    });
    const featuredEntry = ledger.visibleEntries.find((entry) => entry.isActive) ?? ledger.visibleEntries[0] ?? null;
    const payableEntry = ledger.visibleEntries.find((entry) => entry.isActive && entry.hasRecurring) ?? featuredEntry;
    const selectedEntry = ledger.visibleEntries.find((entry) => entry.path === options.selectedDuePath) ?? featuredEntry;
    const context: ResponsiveBulsaRenderContext = {
        platform: options.platform,
        ledger,
        insights,
        monthlyIncome: options.monthlyIncome,
        state: options.state,
        selectedEntry,
        featuredEntry,
        payableEntry,
    };

    const root = options.container.createDiv(options.platform === 'tablet' ? 'diwa-th-bulsa' : 'diwa-mh-bulsa');
    root.setAttribute('aria-label', 'Bulsa responsive workspace');

    if (options.platform === 'tablet') {
        renderTabletBulsa(root, context, options);
        return;
    }

    renderMobileBulsa(root, context, options);
}

function renderMobileBulsa(
    root: HTMLElement,
    context: ResponsiveBulsaRenderContext,
    options: ResponsiveBulsaRenderOptions,
): void {
    const hero = root.createDiv('diwa-mobile-hero diwa-bulsa-hero');
    hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Finance workspace' });
    hero.createDiv({ cls: 'diwa-mobile-hero-title diwa-bulsa-hero-title', text: 'Bulsa' });
    hero.createDiv({
        cls: 'diwa-mobile-hero-subtitle diwa-bulsa-hero-subtitle',
        text: 'Recurring dues, payments, and cashflow signals in one touch-first ledger.',
    });

    const heroChips = hero.createDiv('diwa-bills-header-chips diwa-bulsa-hero-chips');
    heroChips.createEl('span', {
        cls: 'diwa-bills-header-chip',
        text: `${context.ledger.activeEntries.length} active due${context.ledger.activeEntries.length === 1 ? '' : 's'}`,
    });
    heroChips.createEl('span', {
        cls: 'diwa-bills-header-chip diwa-bills-header-chip--accent',
        text: context.ledger.overdueEntries.length > 0 ? `${context.ledger.overdueEntries.length} overdue` : 'All caught up',
    });

    const actionRow = hero.createDiv('diwa-bulsa-primary-actions');
    createActionButton(actionRow, 'Add Due', 'plus', () => options.onAddDue(), true);
    createActionButton(
        actionRow,
        'Record Payment',
        'credit-card',
        () => context.payableEntry && options.onRecordPayment(context.payableEntry),
        false,
        !context.payableEntry,
    );
    createActionButton(
        actionRow,
        'Open note',
        'file-text',
        () => context.featuredEntry && options.onOpenDue(context.featuredEntry),
        false,
        !context.featuredEntry,
    );

    const statsPanel = root.createDiv('diwa-bulsa-panel diwa-bulsa-panel--stats');
    renderPanelHeader(statsPanel, 'Snapshot', 'This month at a glance');
    const summary = statsPanel.createEl('section', {
        cls: 'diwa-bills-summary diwa-bulsa-summary',
        attr: { 'aria-label': 'Bulsa summary stats' },
    });
    renderMetric(summary, context.ledger.overdueEntries.length.toString(), 'Overdue', context.ledger.overdueEntries.length > 0 ? 'is-danger' : '');
    renderMetric(summary, context.ledger.todayEntries.length.toString(), 'Due Today', context.ledger.todayEntries.length > 0 ? 'is-accent' : '');
    renderMetric(summary, context.insights.dueThisWeekCount.toString(), 'Due This Week');
    renderMetric(
        summary,
        context.ledger.totalMonthly > 0 ? formatAmount(context.ledger.totalMonthly) : context.ledger.activeEntries.length.toString(),
        context.ledger.totalMonthly > 0 ? 'Total / Mo' : 'Active Dues',
    );

    renderModeSwitch(root, context.state.mode, options.onModeChange);

    if (context.state.mode === 'ledger') {
        renderVisibilitySwitch(root, context.state.showAllDues, options.onShowAllChange);
        const panel = root.createDiv('diwa-bulsa-panel diwa-bulsa-panel--ledger');
        renderPanelHeader(
            panel,
            'Due list',
            context.ledger.visibleEntries.length === 0
                ? 'Nothing in this view yet'
                : `${context.ledger.visibleEntries.length} due${context.ledger.visibleEntries.length === 1 ? '' : 's'} ready for review`,
        );
        renderLedgerList(panel, context, options);
    } else {
        renderInsightsContent(root, context);
    }

    const fab = root.createEl('button', {
        cls: 'diwa-bills-fab',
        attr: {
            type: 'button',
            'aria-label': 'Add Due',
            title: 'Add Due',
        },
    });
    setIcon(fab, 'plus');
    fab.addEventListener('click', () => options.onAddDue());
}

function renderTabletBulsa(
    root: HTMLElement,
    context: ResponsiveBulsaRenderContext,
    options: ResponsiveBulsaRenderOptions,
): void {
    const topbar = root.createDiv('diwa-mobile-surface diwa-bulsa-topbar');
    const topbarCopy = topbar.createDiv('diwa-bulsa-topbar-copy');
    topbarCopy.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Finance workspace' });
    topbarCopy.createDiv({ cls: 'diwa-bulsa-topbar-title', text: 'Bulsa' });
    topbarCopy.createDiv({
        cls: 'diwa-bulsa-topbar-subtitle',
        text: 'Keep dues visible, switch between ledger and insights, and review payment context without leaving the workspace.',
    });

    const topbarActions = topbar.createDiv('diwa-bulsa-topbar-actions');
    createActionButton(topbarActions, 'Add Due', 'plus', () => options.onAddDue(), true);
    createActionButton(
        topbarActions,
        'Record Payment',
        'credit-card',
        () => context.payableEntry && options.onRecordPayment(context.payableEntry),
        false,
        !context.payableEntry,
    );
    createActionButton(
        topbarActions,
        'Open note',
        'file-text',
        () => context.selectedEntry && options.onOpenDue(context.selectedEntry),
        false,
        !context.selectedEntry,
    );

    const controls = root.createDiv('diwa-bulsa-toolbar');
    renderModeSwitch(controls, context.state.mode, options.onModeChange, true);
    if (context.state.mode === 'ledger') {
        renderVisibilitySwitch(controls, context.state.showAllDues, options.onShowAllChange, true);
    }

    const summary = root.createEl('section', {
        cls: 'diwa-bills-summary diwa-bulsa-summary',
        attr: { 'aria-label': 'Bulsa summary stats' },
    });
    renderMetric(summary, context.ledger.overdueEntries.length.toString(), 'Overdue', context.ledger.overdueEntries.length > 0 ? 'is-danger' : '');
    renderMetric(summary, context.ledger.todayEntries.length.toString(), 'Due Today', context.ledger.todayEntries.length > 0 ? 'is-accent' : '');
    renderMetric(summary, context.insights.dueThisWeekCount.toString(), 'Due This Week');
    renderMetric(summary, context.insights.paidThisMonthCount.toString(), 'Paid This Month');

    if (context.state.mode === 'insights') {
        renderInsightsContent(root, context, true);
        return;
    }

    const split = root.createDiv('diwa-bulsa-split');
    const ledgerPane = split.createDiv('diwa-bulsa-panel diwa-bulsa-ledger-pane');
    renderPanelHeader(
        ledgerPane,
        'Ledger',
        context.ledger.visibleEntries.length === 0
            ? 'Nothing in this view yet'
            : 'Select a due to inspect detail and payment context',
    );
    renderLedgerList(ledgerPane, context, options);

    const detailPane = split.createDiv('diwa-bulsa-panel diwa-bulsa-detail-pane');
    renderDueDetail(detailPane, context, options);
}

function renderModeSwitch(
    parent: HTMLElement,
    mode: BulsaMode,
    onModeChange: (mode: BulsaMode) => void,
    compact = false,
): void {
    const toggle = parent.createEl('nav', {
        cls: `diwa-bills-toggle diwa-bulsa-toggle${compact ? ' is-compact' : ''}`,
        attr: { 'aria-label': 'Bulsa mode switch' },
    });
    createToggleButton(toggle, 'Ledger', mode === 'ledger', () => onModeChange('ledger'));
    createToggleButton(toggle, 'Insights', mode === 'insights', () => onModeChange('insights'));
}

function renderVisibilitySwitch(
    parent: HTMLElement,
    showAll: boolean,
    onShowAllChange: (showAll: boolean) => void,
    compact = false,
): void {
    const toggle = parent.createEl('nav', {
        cls: `diwa-bills-toggle diwa-bulsa-toggle diwa-bulsa-toggle--visibility${compact ? ' is-compact' : ''}`,
        attr: { 'aria-label': 'Bulsa ledger visibility filter' },
    });
    createToggleButton(toggle, 'Active', !showAll, () => onShowAllChange(false));
    createToggleButton(toggle, 'All', showAll, () => onShowAllChange(true));
}

function renderLedgerList(
    parent: HTMLElement,
    context: ResponsiveBulsaRenderContext,
    options: ResponsiveBulsaRenderOptions,
): void {
    const list = parent.createEl('section', {
        cls: 'diwa-bills-list diwa-bulsa-card-list',
        attr: { 'aria-label': context.state.showAllDues ? 'All Bulsa dues' : 'Active Bulsa dues' },
    });

    if (context.ledger.visibleEntries.length === 0) {
        renderEmptyState(list, context.state.showAllDues ? 'No Bulsa history yet.' : 'No active dues in Bulsa.');
        return;
    }

    context.ledger.visibleEntries.forEach((entry) => {
        const statusClass = getStatusClass(entry);
        const isSelected = context.platform === 'tablet' && context.selectedEntry?.path === entry.path;
        const card = list.createEl('article', {
            cls: `diwa-bills-card diwa-bulsa-card ${statusClass}${entry.isPaid ? ' is-inactive' : ''}${isSelected ? ' is-selected' : ''}`,
        });
        card.createEl('div', { cls: 'diwa-bills-card-stripe' });

        const body = card.createEl('div', {
            cls: 'diwa-bills-card-body',
            attr: {
                role: 'button',
                tabindex: '0',
                'aria-label': context.platform === 'tablet' ? `Select ${entry.title}` : `Open ${entry.title}`,
            },
        });
        const handlePrimary = () => {
            if (context.platform === 'tablet') {
                options.onSelectDue(entry.path);
                return;
            }
            options.onOpenDue(entry);
        };
        body.addEventListener('click', handlePrimary);
        body.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            handlePrimary();
        });

        const topRow = body.createEl('div', { cls: 'diwa-bills-card-top' });
        topRow.createEl('span', { text: entry.title, cls: 'diwa-bills-card-name' });
        const displayAmount = resolveDisplayAmount(entry);
        if (displayAmount) {
            topRow.createEl('span', { text: displayAmount, cls: 'diwa-bills-card-amount' });
        }

        const meta = body.createEl('div', { cls: 'diwa-bills-card-meta' });
        renderBadges(meta, entry);
        if (entry.lastPayment) {
            meta.createEl('span', {
                text: `Paid ${moment(entry.lastPayment).fromNow()}`,
                cls: 'diwa-bills-last-payment',
            });
        }

        const footer = body.createDiv('diwa-bulsa-card-footer');
        footer.createDiv({
            cls: 'diwa-bulsa-card-caption',
            text: entry.dueDate ? `Next due ${formatFullDate(entry.dueDate)}` : 'No next due date',
        });
        footer.createDiv({
            cls: 'diwa-bulsa-card-caption is-secondary',
            text: entry.category?.trim() ? entry.category.trim() : 'Uncategorized',
        });

        const actions = card.createDiv('diwa-bills-card-actions diwa-bulsa-card-actions');
        createIconButton(actions, 'Open note', 'file-text', () => options.onOpenDue(entry), 'diwa-bills-pay-btn diwa-bulsa-open-btn');
        if (entry.hasRecurring && entry.isActive) {
            createIconButton(actions, 'Record payment', 'credit-card', () => options.onRecordPayment(entry), 'diwa-bills-pay-btn');
        }
    });
}

function renderDueDetail(
    parent: HTMLElement,
    context: ResponsiveBulsaRenderContext,
    options: ResponsiveBulsaRenderOptions,
): void {
    const entry = context.selectedEntry;
    if (!entry) {
        renderEmptyState(parent, 'Select a due to preview its detail and payment actions.');
        return;
    }

    const hero = parent.createDiv(`diwa-bills-card diwa-bulsa-detail-card ${getStatusClass(entry)}${entry.isPaid ? ' is-inactive' : ''}`);
    hero.createDiv('diwa-bills-card-stripe');
    const heroBody = hero.createDiv('diwa-bills-card-body');
    const topRow = heroBody.createDiv('diwa-bills-card-top');
    topRow.createDiv({ cls: 'diwa-bills-card-name', text: entry.title });
    const displayAmount = resolveDisplayAmount(entry);
    if (displayAmount) {
        topRow.createDiv({ cls: 'diwa-bills-card-amount', text: displayAmount });
    }

    const meta = heroBody.createDiv('diwa-bills-card-meta');
    renderBadges(meta, entry);

    const detailGrid = heroBody.createDiv('diwa-bulsa-detail-grid');
    renderDetailItem(detailGrid, 'Next due', entry.dueDate ? formatFullDate(entry.dueDate) : 'Not set');
    renderDetailItem(detailGrid, 'Last payment', entry.lastPayment ? formatFullDate(entry.lastPayment) : 'No payment logged');
    renderDetailItem(detailGrid, 'Category', entry.category?.trim() ? entry.category.trim() : 'Uncategorized');
    renderDetailItem(detailGrid, 'Status', describeStatus(entry));

    const actions = parent.createDiv('diwa-bulsa-detail-actions');
    createActionButton(actions, 'Add Due', 'plus', () => options.onAddDue(), true);
    createActionButton(
        actions,
        'Record Payment',
        'credit-card',
        () => entry.hasRecurring && entry.isActive && options.onRecordPayment(entry),
        false,
        !(entry.hasRecurring && entry.isActive),
    );
    createActionButton(actions, 'Open note', 'file-text', () => options.onOpenDue(entry));

    const pulseCard = parent.createDiv('diwa-fanalytics-card diwa-bulsa-insights-card');
    pulseCard.createDiv({ cls: 'diwa-fanalytics-card-title', text: 'Bulsa Pulse' });
    const quickGrid = pulseCard.createDiv('diwa-fanalytics-quick-grid');
    renderQuickStat(quickGrid, context.insights.overdueCount.toString(), 'Overdue', context.insights.overdueCount > 0 ? 'is-negative' : '');
    renderQuickStat(quickGrid, context.insights.dueThisWeekCount.toString(), 'Due This Week', '');
    renderQuickStat(quickGrid, context.insights.activeDueCount.toString(), 'Total Active', '');
    renderQuickStat(quickGrid, context.insights.paidThisMonthCount.toString(), 'Paid This Month', context.insights.paidThisMonthCount > 0 ? 'is-positive' : '');
}

function renderInsightsContent(parent: HTMLElement, context: ResponsiveBulsaRenderContext, tablet = false): void {
    const grid = parent.createDiv(`diwa-fanalytics-grid diwa-bulsa-insights-grid${tablet ? ' is-tablet' : ''}`);

    const cashCard = grid.createDiv('diwa-fanalytics-card diwa-fanalytics-card--cashflow');
    cashCard.createDiv({ cls: 'diwa-fanalytics-card-title', text: 'Cashflow Snapshot' });
    const cashRow = cashCard.createDiv('diwa-fanalytics-cashflow-row');
    const cashflow = context.monthlyIncome - context.insights.totalObligations;
    renderQuickStat(cashRow, context.monthlyIncome > 0 ? formatAmount(context.monthlyIncome) : '—', 'Monthly Income', '');
    renderQuickStat(cashRow, context.insights.totalObligations > 0 ? formatAmount(context.insights.totalObligations) : '0', 'Obligations', '');
    renderQuickStat(
        cashRow,
        cashflow >= 0 ? `+${formatAmount(cashflow)}` : `-${formatAmount(Math.abs(cashflow))}`,
        'Cashflow',
        cashflow >= 0 ? 'is-positive' : 'is-negative',
    );

    if (context.monthlyIncome > 0) {
        const pct = Math.min(100, Math.round((context.insights.totalObligations / context.monthlyIncome) * 100));
        const barWrap = cashCard.createDiv('diwa-fanalytics-obligations-bar');
        const fill = barWrap.createDiv(`diwa-fanalytics-obligations-fill ${getObligationTone(pct)}`);
        fill.style.setProperty('--diwa-fanalytics-fill-width', `${pct}%`);
        cashCard.createDiv({
            cls: 'diwa-fanalytics-footnote',
            text: `Obligations use ${pct}% of monthly income.`,
        });
    } else {
        cashCard.createDiv({
            cls: 'diwa-fanalytics-empty',
            text: 'Add monthly income in settings to compare Bulsa obligations against take-home cashflow.',
        });
    }

    const categoryCard = grid.createDiv('diwa-fanalytics-card diwa-fanalytics-card--categories');
    categoryCard.createDiv({ cls: 'diwa-fanalytics-card-title', text: 'Obligations by Category' });
    if (context.insights.categories.length === 0) {
        categoryCard.createDiv({
            cls: 'diwa-fanalytics-empty',
            text: 'Bulsa is waiting for category data.',
        });
    } else {
        const maxAmount = context.insights.categories[0]?.[1] || 1;
        context.insights.categories.slice(0, 6).forEach(([category, amount]) => {
            const row = categoryCard.createDiv('diwa-fanalytics-bar-row');
            row.createDiv({
                cls: 'diwa-fanalytics-bar-label',
                text: category,
                attr: { title: category },
            });
            const track = row.createDiv('diwa-fanalytics-bar-track');
            const fill = track.createDiv('diwa-fanalytics-bar-fill');
            fill.style.setProperty('--diwa-fanalytics-fill-width', `${Math.round((amount / maxAmount) * 100)}%`);
            row.createDiv({ cls: 'diwa-fanalytics-bar-amount', text: formatAmount(amount) });
        });
    }

    const pulseCard = grid.createDiv('diwa-fanalytics-card diwa-fanalytics-card--stats');
    pulseCard.createDiv({ cls: 'diwa-fanalytics-card-title', text: 'Bulsa Pulse' });
    const quickGrid = pulseCard.createDiv('diwa-fanalytics-quick-grid');
    renderQuickStat(quickGrid, context.insights.overdueCount.toString(), 'Overdue', context.insights.overdueCount > 0 ? 'is-negative' : '');
    renderQuickStat(quickGrid, context.insights.dueThisWeekCount.toString(), 'Due This Week', '');
    renderQuickStat(quickGrid, context.insights.activeDueCount.toString(), 'Total Active', '');
    renderQuickStat(quickGrid, context.insights.paidThisMonthCount.toString(), 'Paid This Month', context.insights.paidThisMonthCount > 0 ? 'is-positive' : '');
}

function renderPanelHeader(parent: HTMLElement, title: string, subtitle: string): void {
    const header = parent.createDiv('diwa-mobile-section-head');
    const copy = header.createDiv('diwa-mobile-section-copy');
    copy.createDiv({ cls: 'diwa-mobile-section-title', text: title });
    copy.createDiv({ cls: 'diwa-mobile-section-subtitle', text: subtitle });
}

function renderMetric(parent: HTMLElement, value: string, label: string, modifier = ''): void {
    const chip = parent.createEl('article', { cls: `diwa-bills-metric-chip${modifier ? ` ${modifier}` : ''}` });
    chip.createEl('div', { text: value, cls: 'diwa-bills-metric-value' });
    chip.createEl('div', { text: label, cls: 'diwa-bills-metric-label' });
}

function renderQuickStat(parent: HTMLElement, value: string, label: string, valueClass: string): void {
    const stat = parent.createDiv('diwa-fanalytics-quick-stat');
    stat.createDiv({ cls: `diwa-fanalytics-cf-value${valueClass ? ` ${valueClass}` : ''}`, text: value });
    stat.createDiv({ cls: 'diwa-fanalytics-cf-label', text: label });
}

function renderDetailItem(parent: HTMLElement, label: string, value: string): void {
    const item = parent.createDiv('diwa-bulsa-detail-item');
    item.createDiv({ cls: 'diwa-bulsa-detail-label', text: label });
    item.createDiv({ cls: 'diwa-bulsa-detail-value', text: value });
}

function renderBadges(parent: HTMLElement, entry: BulsaLedgerEntry): void {
    if (entry.isOverdue) {
        parent.createEl('span', { text: 'Overdue', cls: 'diwa-bills-badge diwa-bills-badge--overdue' });
    } else if (entry.isToday) {
        parent.createEl('span', { text: 'Due Today', cls: 'diwa-bills-badge diwa-bills-badge--today' });
    } else if (entry.isPaid) {
        parent.createEl('span', { text: 'Paid', cls: 'diwa-bills-badge diwa-bills-badge--paid' });
    } else if (entry.dueMoment?.isValid()) {
        const label = entry.daysUntil === 1 ? 'Tomorrow' : `In ${entry.daysUntil}d`;
        parent.createEl('span', { text: label, cls: 'diwa-bills-badge diwa-bills-badge--upcoming' });
    }

    if (entry.hasRecurring) {
        parent.createEl('span', { text: '↻ Recurring', cls: 'diwa-bills-badge diwa-bills-badge--recurring' });
    }
}

function renderEmptyState(parent: HTMLElement, title: string): void {
    const empty = parent.createDiv('diwa-bills-empty diwa-bulsa-empty');
    empty.createDiv({ cls: 'diwa-bills-empty-icon', text: '₱' });
    empty.createDiv({ cls: 'diwa-bills-empty-title', text: title });
    empty.createDiv({
        cls: 'diwa-bills-empty-body',
        text: 'Bulsa keeps recurring payments, subscriptions, and shared dues in one calm place.',
    });
}

function createToggleButton(parent: HTMLElement, label: string, isActive: boolean, onClick: () => void): void {
    const button = parent.createEl('button', {
        cls: `diwa-bills-toggle-btn${isActive ? ' is-active' : ''}`,
        text: label,
        attr: {
            type: 'button',
            'aria-pressed': isActive ? 'true' : 'false',
        },
    });
    button.addEventListener('click', onClick);
}

function createActionButton(
    parent: HTMLElement,
    label: string,
    iconName: string,
    onClick: () => void,
    primary = false,
    disabled = false,
): void {
    const button = parent.createEl('button', {
        cls: `diwa-bulsa-action-btn${primary ? ' is-primary' : ''}${disabled ? ' is-disabled' : ''}`,
        attr: {
            type: 'button',
            'aria-label': label,
        },
    });
    button.disabled = disabled;
    const icon = button.createSpan('diwa-bulsa-action-btn-icon');
    setIcon(icon, iconName);
    button.createSpan({ cls: 'diwa-bulsa-action-btn-label', text: label });
    button.addEventListener('click', (event) => {
        event.preventDefault();
        if (disabled) return;
        onClick();
    });
}

function createIconButton(parent: HTMLElement, label: string, iconName: string, onClick: () => void, cls: string): void {
    const button = parent.createEl('button', {
        cls,
        attr: {
            type: 'button',
            'aria-label': label,
            title: label,
        },
    });
    setIcon(button, iconName);
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
}

function getStatusClass(entry: BulsaLedgerEntry): string {
    if (entry.status === 'overdue') return 'is-overdue';
    if (entry.status === 'today') return 'is-today';
    if (entry.status === 'paid') return 'is-paid';
    if (entry.status === 'soon') return 'is-soon';
    return 'is-upcoming';
}

function describeStatus(entry: BulsaLedgerEntry): string {
    if (entry.isOverdue) return 'Overdue';
    if (entry.isToday) return 'Due today';
    if (entry.isPaid) return 'Paid';
    if (entry.daysUntil !== null) {
        return entry.daysUntil === 0 ? 'Today' : `${entry.daysUntil} day${entry.daysUntil === 1 ? '' : 's'} away`;
    }
    return 'Upcoming';
}

function resolveDisplayAmount(entry: DueEntry): string {
    if (entry.amount != null && entry.amount > 0) {
        return formatAmount(entry.amount);
    }
    return (entry.title.match(/[\d,.]+/) ?? [])[0] ?? '';
}

function formatAmount(value: number): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

function formatFullDate(value: string): string {
    const parsed = moment(value, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
    return parsed.isValid() ? parsed.format('MMM D, YYYY') : value;
}

function getObligationTone(percent: number): string {
    if (percent > 80) return 'is-negative';
    if (percent > 60) return 'is-warning';
    return 'is-positive';
}

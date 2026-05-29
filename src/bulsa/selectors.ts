import { moment } from 'obsidian';
import type { DueEntry } from '../types';

type MomentValue = import('moment').Moment;

export type BulsaDueStatus = 'overdue' | 'today' | 'paid' | 'soon' | 'upcoming';

export interface BulsaDueStatusSnapshot {
    status: BulsaDueStatus;
    isOverdue: boolean;
    isToday: boolean;
    isPaid: boolean;
    isSoon: boolean;
    daysUntil: number | null;
}

export interface BulsaLedgerEntry extends DueEntry, BulsaDueStatusSnapshot {}

export interface BulsaDuesSummary {
    allEntries: DueEntry[];
    activeEntries: DueEntry[];
    overdueEntries: DueEntry[];
    todayEntries: DueEntry[];
    upcomingEntries: DueEntry[];
    totalMonthly: number;
}

export interface BulsaLedgerSnapshot extends BulsaDuesSummary {
    visibleEntries: BulsaLedgerEntry[];
}

export interface BulsaInsightsSnapshot {
    activeDueCount: number;
    totalObligations: number;
    overdueCount: number;
    dueThisWeekCount: number;
    paidThisMonthCount: number;
    categories: Array<[string, number]>;
}

interface BulsaSummaryOptions {
    today?: MomentValue;
}

interface BulsaVisibleEntriesOptions extends BulsaSummaryOptions {
    showAll?: boolean;
    soonThresholdDays?: number;
}

interface BulsaInsightsOptions extends BulsaSummaryOptions {
    weekEnd?: MomentValue;
    monthStart?: MomentValue;
}

export function sortDuesByDueDate(entries: Iterable<DueEntry>): DueEntry[] {
    return Array.from(entries).sort((a, b) => (a.dueMoment?.valueOf() || 0) - (b.dueMoment?.valueOf() || 0));
}

export function filterDuesByVisibility(entries: readonly DueEntry[], showAll: boolean): DueEntry[] {
    return showAll ? [...entries] : entries.filter((entry) => entry.isActive);
}

export function getBulsaDueStatus(
    entry: DueEntry,
    options: BulsaSummaryOptions & { soonThresholdDays?: number } = {},
): BulsaDueStatusSnapshot {
    const today = options.today ?? moment().startOf('day');
    const soonThresholdDays = options.soonThresholdDays ?? 7;
    const isOverdue = Boolean(entry.isActive && entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today));
    const isToday = Boolean(entry.isActive && entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day'));
    const isPaid = !entry.isActive;
    const daysUntil = entry.isActive && entry.dueMoment?.isValid() && !isOverdue && !isToday
        ? entry.dueMoment.diff(today, 'days')
        : null;
    const isSoon = daysUntil !== null && daysUntil <= soonThresholdDays;

    let status: BulsaDueStatus = 'upcoming';
    if (isOverdue) status = 'overdue';
    else if (isToday) status = 'today';
    else if (isPaid) status = 'paid';
    else if (isSoon) status = 'soon';

    return {
        status,
        isOverdue,
        isToday,
        isPaid,
        isSoon,
        daysUntil,
    };
}

export function deriveBulsaSummary(entries: Iterable<DueEntry>, options: BulsaSummaryOptions = {}): BulsaDuesSummary {
    const today = options.today ?? moment().startOf('day');
    const allEntries = sortDuesByDueDate(entries);
    const activeEntries = allEntries.filter((entry) => entry.isActive);
    const overdueEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today));
    const todayEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day'));
    const upcomingEntries = activeEntries.filter((entry) => entry.dueMoment?.isValid() && entry.dueMoment.isAfter(today));
    const totalMonthly = activeEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);

    return {
        allEntries,
        activeEntries,
        overdueEntries,
        todayEntries,
        upcomingEntries,
        totalMonthly,
    };
}

export function deriveVisibleBulsaEntries(
    entries: Iterable<DueEntry>,
    options: BulsaVisibleEntriesOptions = {},
): BulsaLedgerEntry[] {
    const sortedEntries = sortDuesByDueDate(entries);
    const visibleEntries = filterDuesByVisibility(sortedEntries, Boolean(options.showAll));

    return visibleEntries.map((entry) => ({
        ...entry,
        ...getBulsaDueStatus(entry, options),
    }));
}

export function deriveBulsaLedgerSnapshot(
    entries: Iterable<DueEntry>,
    options: BulsaVisibleEntriesOptions = {},
): BulsaLedgerSnapshot {
    const summary = deriveBulsaSummary(entries, options);

    return {
        ...summary,
        visibleEntries: deriveVisibleBulsaEntries(summary.allEntries, options),
    };
}

export function deriveBulsaInsightsSnapshot(
    entries: Iterable<DueEntry>,
    options: BulsaInsightsOptions = {},
): BulsaInsightsSnapshot {
    const today = options.today ?? moment().startOf('day');
    const weekEnd = options.weekEnd ?? today.clone().endOf('isoWeek');
    const monthStart = options.monthStart ?? today.clone().startOf('month');
    const categories = new Map<string, number>();

    let activeDueCount = 0;
    let totalObligations = 0;
    let overdueCount = 0;
    let dueThisWeekCount = 0;
    let paidThisMonthCount = 0;

    for (const due of entries) {
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
            const category = due.category?.trim() ? due.category.trim() : 'Uncategorized';
            categories.set(category, (categories.get(category) || 0) + (due.amount || 0));
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
        categories: Array.from(categories.entries()).sort((a, b) => b[1] - a[1]),
    };
}

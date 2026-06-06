import { moment } from 'obsidian';
import type { ThoughtEntry } from '../types';
import { decodeUtf8Base64, encodeUtf8Base64 } from './base64';

const WEEKLY_REVIEW_MARKER_PREFIX = '<!-- DIWA-WEEKLY-REVIEW ';
const WEEKLY_REVIEW_MARKER_SUFFIX = ' -->';
const WEEK_ID_FORMAT = 'GGGG-[W]WW';
const LEGACY_WEEK_ID_FORMAT = 'YYYY-[W]WW';

export interface WeeklyReviewRecord {
    weekId: string;
    dateRange: string;
    wins: string;
    lessons: string;
    focus: string[];
    saved: string;
    dayPlans?: Record<string, string>;
}

export interface ParsedWeeklyReview {
    wins: string;
    lessons: string;
    focus: string[];
    saved: string;
    dayPlans?: Record<string, string>;
    dateRange?: string;
    weekId?: string;
}

export interface WeeklyReviewWeekMeta {
    weekId: string;
    inputValue: string;
    weekNumber: number;
    label: string;
    dateRange: string;
    startDate: string;
    endDate: string;
}

export interface WeeklyReviewThoughtGroup {
    day: string;
    label: string;
    thoughts: ThoughtEntry[];
}

export interface WeeklyReviewFocusEntry {
    day: string;
    created: string;
    filePath: string;
    line: string;
}

interface ParsedWeeklyReviewSections {
    wins: string;
    lessons: string;
    focus: string[];
    dayPlans?: Record<string, string>;
    headings: Set<string>;
}

function normalizeLineBreaks(value: string): string {
    return value.replace(/\r\n?/g, '\n');
}

function normalizeText(value: string): string {
    return normalizeLineBreaks(value).trim();
}

function normalizeFocus(values: string[]): string[] {
    return values
        .map((value) => normalizeText(String(value ?? '')))
        .filter(Boolean);
}

function normalizeDayPlans(dayPlans?: Record<string, string>): Record<string, string> | undefined {
    if (!dayPlans) return undefined;
    const normalized = Object.entries(dayPlans)
        .map(([date, intention]) => [date.trim(), normalizeText(String(intention ?? ''))] as const)
        .filter(([date, intention]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && intention);
    if (normalized.length === 0) return undefined;
    return Object.fromEntries(normalized.sort(([a], [b]) => a.localeCompare(b)));
}

function buildStructuredReviewMarker(record: WeeklyReviewRecord): string {
    const payload = encodeUtf8Base64(JSON.stringify(record));
    return `${WEEKLY_REVIEW_MARKER_PREFIX}${payload}${WEEKLY_REVIEW_MARKER_SUFFIX}`;
}

function parseWeekMoment(weekId?: string | null) {
    const parsed = weekId
        ? moment(weekId, [WEEK_ID_FORMAT, LEGACY_WEEK_ID_FORMAT], true)
        : null;
    return parsed && parsed.isValid() ? parsed.startOf('isoWeek') : moment().startOf('isoWeek');
}

export function getCurrentWeeklyReviewWeekId(): string {
    return moment().format(WEEK_ID_FORMAT);
}

export function shiftWeeklyReviewWeek(weekId: string, offset: number): string {
    return parseWeekMoment(weekId).add(offset, 'week').format(WEEK_ID_FORMAT);
}

export function getLegacyWeeklyReviewWeekId(weekId?: string | null): string {
    return parseWeekMoment(weekId).format(LEGACY_WEEK_ID_FORMAT);
}

export function getWeeklyReviewWeekMeta(weekId?: string | null): WeeklyReviewWeekMeta {
    const week = parseWeekMoment(weekId);
    const end = week.clone().endOf('isoWeek');
    return {
        weekId: week.format(WEEK_ID_FORMAT),
        inputValue: week.format(WEEK_ID_FORMAT),
        weekNumber: week.isoWeek(),
        label: `Week ${week.isoWeek()} · ${week.format('MMM D')}–${end.format('MMM D')}`,
        dateRange: `${week.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`,
        startDate: week.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
    };
}

export function getThoughtReviewDay(entry: Pick<ThoughtEntry, 'day' | 'created'>): string | null {
    if (typeof entry.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.day.trim())) {
        return entry.day.trim();
    }
    const createdDay = typeof entry.created === 'string' ? entry.created.slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(createdDay) ? createdDay : null;
}

export function getWeeklyReviewThoughtGroups(thoughts: Iterable<ThoughtEntry>, weekId: string): WeeklyReviewThoughtGroup[] {
    const meta = getWeeklyReviewWeekMeta(weekId);
    const groups = new Map<string, ThoughtEntry[]>();

    for (const thought of thoughts) {
        const thoughtDay = getThoughtReviewDay(thought);
        if (!thoughtDay || thoughtDay < meta.startDate || thoughtDay > meta.endDate) continue;
        const list = groups.get(thoughtDay);
        if (list) list.push(thought);
        else groups.set(thoughtDay, [thought]);
    }

    return Array.from(groups.entries())
        .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
        .map(([day, entries]) => ({
            day,
            label: `${moment(day, 'YYYY-MM-DD', true).format('ddd · MMM D')}`,
            thoughts: entries.sort((left, right) => {
                const leftCreated = moment(left.created, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true);
                const rightCreated = moment(right.created, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true);
                if (leftCreated.isValid() && rightCreated.isValid()) {
                    return leftCreated.valueOf() - rightCreated.valueOf();
                }
                return (right.lastThreadUpdate || 0) - (left.lastThreadUpdate || 0);
            }),
        }));
}

export function getWeeklyReviewFocusEntries(thoughts: Iterable<ThoughtEntry>, weekId: string): WeeklyReviewFocusEntry[] {
    return getWeeklyReviewThoughtGroups(thoughts, weekId).flatMap((group) => (
        group.thoughts.flatMap((thought) => (
            normalizeLineBreaks(thought.body || '')
                .split('\n')
                .filter((line) => line.includes('[[weeklyObjective]]'))
                .map((line) => ({
                    day: group.day,
                    created: thought.created,
                    filePath: thought.filePath,
                    line: line.trim(),
                }))
        ))
    ));
}

export function stripWeeklyObjectiveToken(line: string): string {
    return normalizeLineBreaks(line)
        .replace(/\[\[weeklyObjective\]\]/g, ' ')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildWeeklyReviewContent(record: WeeklyReviewRecord): string {
    const normalized: WeeklyReviewRecord = {
        weekId: record.weekId,
        dateRange: record.dateRange,
        saved: record.saved,
        wins: normalizeText(record.wins),
        lessons: normalizeText(record.lessons),
        focus: normalizeFocus(record.focus),
        dayPlans: normalizeDayPlans(record.dayPlans),
    };
    const focusLines = normalized.focus.map((value, index) => `${index + 1}. ${value}`).join('\n');
    const dayPlanEntries = Object.entries(normalized.dayPlans ?? {});
    const dayPlanSection = dayPlanEntries.length > 0
        ? `\n\n# 📅 Next Week Plan\n${dayPlanEntries.map(([date, intention]) => `- ${date}: ${intention}`).join('\n')}`
        : '';
    return `---\nweek: "${normalized.weekId}"\ndate_range: "${normalized.dateRange}"\nsaved: "${normalized.saved}"\n---\n\n${buildStructuredReviewMarker(normalized)}\n\n# 🏆 Wins\n${normalized.wins}\n\n# 📚 Lessons\n${normalized.lessons}\n\n# 🎯 Focus\n${focusLines}${dayPlanSection}\n`;
}

export function parseStructuredWeeklyReview(raw: string): ParsedWeeklyReview | null {
    const match = raw.match(/<!-- DIWA-WEEKLY-REVIEW ([A-Za-z0-9+/=]+) -->/);
    if (!match) return null;
    const decoded = decodeUtf8Base64(match[1]);
    if (!decoded) return null;
    try {
        const parsed = JSON.parse(decoded) as Partial<WeeklyReviewRecord>;
        const visible = parseWeeklyReviewSections(normalizeLineBreaks(raw).replace(/^---\n[\s\S]*?\n---\n?/, '').trim());
        return {
            weekId: typeof parsed.weekId === 'string' ? parsed.weekId : undefined,
            dateRange: typeof parsed.dateRange === 'string' ? parsed.dateRange : undefined,
            wins: visible.headings.has('🏆 Wins')
                ? visible.wins
                : normalizeText(String(parsed.wins ?? '')),
            lessons: visible.headings.has('📚 Lessons')
                ? visible.lessons
                : normalizeText(String(parsed.lessons ?? '')),
            focus: visible.headings.has('🎯 Focus')
                ? normalizeFocus(visible.focus)
                : normalizeFocus(Array.isArray(parsed.focus) ? parsed.focus.map((value) => String(value ?? '')) : []),
            saved: typeof parsed.saved === 'string' ? parsed.saved : '',
            dayPlans: visible.headings.has('📅 Next Week Plan')
                ? normalizeDayPlans(visible.dayPlans)
                : normalizeDayPlans(parsed.dayPlans),
        };
    } catch {
        return null;
    }
}

function parseWeeklyReviewSections(body: string): ParsedWeeklyReviewSections {
    const normalizedBody = normalizeLineBreaks(body).trim();
    const sectionMatches = Array.from(normalizedBody.matchAll(/^# (🏆 Wins|📚 Lessons|🎯 Focus|📅 Next Week Plan)$/gm));
    const sections = new Map<string, string>();

    for (let index = 0; index < sectionMatches.length; index++) {
        const match = sectionMatches[index];
        const heading = match[1];
        let start = (match.index ?? 0) + match[0].length;
        if (normalizedBody.charAt(start) === '\n') start += 1;
        const end = index + 1 < sectionMatches.length
            ? (sectionMatches[index + 1].index ?? normalizedBody.length)
            : normalizedBody.length;
        sections.set(heading, normalizedBody.slice(start, end).trim());
    }

    const focus = (sections.get('🎯 Focus') || '')
        .split('\n')
        .map((line) => line.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);

    const dayPlanRaw = sections.get('📅 Next Week Plan');
    let dayPlans: Record<string, string> | undefined;
    if (dayPlanRaw) {
        dayPlans = {};
        for (const line of dayPlanRaw.split('\n')) {
            const match = line.match(/^-\s*(\d{4}-\d{2}-\d{2}):\s*(.+)/);
            if (match) dayPlans[match[1]] = match[2].trim();
        }
        if (Object.keys(dayPlans).length === 0) dayPlans = undefined;
    }

    return {
        wins: sections.get('🏆 Wins') || '',
        lessons: sections.get('📚 Lessons') || '',
        focus,
        dayPlans,
        headings: new Set(sectionMatches.map((match) => match[1])),
    };
}

export function parseLegacyWeeklyReviewBody(body: string): Pick<ParsedWeeklyReview, 'wins' | 'lessons' | 'focus' | 'dayPlans'> {
    const parsed = parseWeeklyReviewSections(body);
    return {
        wins: parsed.wins,
        lessons: parsed.lessons,
        focus: parsed.focus,
        dayPlans: parsed.dayPlans,
    };
}

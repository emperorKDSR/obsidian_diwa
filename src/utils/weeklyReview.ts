import { decodeUtf8Base64, encodeUtf8Base64 } from './base64';

const WEEKLY_REVIEW_MARKER_PREFIX = '<!-- DIWA-WEEKLY-REVIEW ';
const WEEKLY_REVIEW_MARKER_SUFFIX = ' -->';

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

function normalizeLineBreaks(value: string): string {
    return value.replace(/\r\n?/g, '\n');
}

function normalizeText(value: string): string {
    return normalizeLineBreaks(value).trim();
}

function normalizeFocus(values: string[]): string[] {
    const normalized = values.slice(0, 3).map((value) => normalizeText(String(value ?? '')));
    while (normalized.length < 3) normalized.push('');
    return normalized;
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
        return {
            weekId: typeof parsed.weekId === 'string' ? parsed.weekId : undefined,
            dateRange: typeof parsed.dateRange === 'string' ? parsed.dateRange : undefined,
            wins: normalizeText(String(parsed.wins ?? '')),
            lessons: normalizeText(String(parsed.lessons ?? '')),
            focus: normalizeFocus(Array.isArray(parsed.focus) ? parsed.focus.map((value) => String(value ?? '')) : []),
            saved: typeof parsed.saved === 'string' ? parsed.saved : '',
            dayPlans: normalizeDayPlans(parsed.dayPlans),
        };
    } catch {
        return null;
    }
}

export function parseLegacyWeeklyReviewBody(body: string): Pick<ParsedWeeklyReview, 'wins' | 'lessons' | 'focus' | 'dayPlans'> {
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
    };
}

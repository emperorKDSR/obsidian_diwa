import { moment } from 'obsidian';
import { GawaTaskRecord } from '../types';

export type KaronQuickAddMode = 'task' | 'note';

export interface StandaloneWikilinkSchedule {
    linkTarget: string;
    explicitDate?: string;
}

const EXPLICIT_DATE_REGEX = /\[\[\d{4}-\d{2}-\d{2}\]\]|📅\s*\d{4}-\d{2}-\d{2}|\[due::\s*\d{4}-\d{2}-\d{2}\]|@\d{4}-\d{2}-\d{2}|(?:^|\s)\d{4}-\d{2}-\d{2}(?:\s|$)/;
const STANDALONE_WIKILINK_REGEX = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\](?:\s+\[\[(\d{4}-\d{2}-\d{2})\]\])?$/;
const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an input consisting solely of a single [[Note]] wikilink (optionally
 * followed by [[YYYY-MM-DD]]). Returns null for date-only links or extra prose.
 */
export function parseStandaloneWikilinkSchedule(rawInput: string): StandaloneWikilinkSchedule | null {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;

    const match = trimmed.match(STANDALONE_WIKILINK_REGEX);
    if (!match) return null;

    const linkTarget = match[1].trim();
    if (!linkTarget || ISO_DATE_ONLY_REGEX.test(linkTarget)) {
        return null;
    }

    return {
        linkTarget,
        ...(match[2] ? { explicitDate: match[2] } : {})
    };
}

/**
 * Derives a clean, consistent tag for a Karon MOC topic label.
 * e.g. "Work Projects" -> "moc/work-projects"
 */
export function slugifyMocTopicTag(label: string): string {
    const stripped = label.trim().replace(/^#+/, '').replace(/^moc[\/_-]+/i, '');
    const slug = stripped
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'topic';
    return `moc/${slug}`;
}

/**
 * Normalizes any tag string (stripping leading '#' and lowercasing) for comparisons.
 */
export function normalizeTagComparison(tag: string): string {
    return (tag || '')
        .toLowerCase()
        .trim()
        .replace(/^#+/, '')
        .trim();
}

/**
 * Checks whether a list of tags matches the target topic tag (exact or hierarchical subtag).
 */
export function hasMocTopicTag(tags: string[], targetTag: string): boolean {
    const targetNorm = normalizeTagComparison(targetTag);
    if (!targetNorm) return false;
    return tags.some(t => {
        const norm = normalizeTagComparison(t);
        return norm === targetNorm || norm.startsWith(`${targetNorm}/`);
    });
}

/**
 * Filters tasks for Karon views: strictly open tasks, excluding Handumanan paths.
 */
export function filterKaronTasks(tasks: GawaTaskRecord[]): GawaTaskRecord[] {
    return tasks.filter(
        t => !t.completed && !t.filePath?.toLowerCase().includes('handumanan')
    );
}

/**
 * Returns the day header label for a given horizon offset and ISO date.
 */
export function getKaronDayTitle(dayOffset: number, dateStr: string): string {
    if (dayOffset === 0) {
        return `Today · ${moment(dateStr).format('dddd, MMM D')}`;
    }
    if (dayOffset === 1) {
        return `Tomorrow · ${moment(dateStr).format('dddd, MMM D')}`;
    }
    return moment(dateStr).format('dddd, MMMM D');
}

/**
 * Returns the Notes subsection title for a given horizon day offset.
 */
export function formatKaronNotesHeading(dayOffset: number, dateStr: string, count: number): string {
    if (dayOffset === 0) {
        return `Notes for Today (${count})`;
    }
    if (dayOffset === 1) {
        return `Notes for Tomorrow (${count})`;
    }
    return `Notes for ${moment(dateStr).format('MMM D')} (${count})`;
}

/**
 * Formats a quick-add task or note input for Karon and appends [[YYYY-MM-DD]]
 * on the final paragraph when no explicit date token is already present.
 */
export function formatKaronQuickCaptureContent(
    rawInput: string,
    mode: KaronQuickAddMode,
    targetDateStr?: string
): string {
    const trimmed = rawInput.trim();
    if (!trimmed) return '';

    const normalized = mode === 'task'
        ? (/^-\s*\[[ xX]\]\s+/.test(trimmed)
            ? trimmed
            : `- [ ] ${trimmed.replace(/^[-*]\s+/, '')}`)
        : trimmed;

    if (targetDateStr && !EXPLICIT_DATE_REGEX.test(normalized)) {
        const separator = normalized.includes('\n') ? '\n' : ' ';
        return `${normalized}${separator}[[${targetDateStr}]]`;
    }
    return normalized;
}

/**
 * Normalizes a quick-add task input into a markdown checklist item and appends
 * [[YYYY-MM-DD]] when no explicit date token is already present.
 */
export function formatKaronQuickTaskContent(rawInput: string, targetDateStr?: string): string {
    return formatKaronQuickCaptureContent(rawInput, 'task', targetDateStr);
}

import { moment } from 'obsidian';
import * as chrono from 'chrono-node';

/**
 * Parses a flexible date string (e.g. "2026-08-01", "August 1, 2026", "Aug 1 2026")
 * into a normalized "YYYY-MM-DD" string. Returns null if invalid or empty.
 */
export function parseDateToIso(input: string | undefined | null): string | null {
    if (!input) return null;
    const str = input.trim();
    if (!str) return null;

    // 1. Direct ISO / YYYY-MM-DD pattern
    const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch && moment(isoMatch[1], 'YYYY-MM-DD', true).isValid()) {
        return isoMatch[1];
    }

    // 2. Standard formatted calendar string matching
    const standardFormats = [
        'YYYY-MM-DD',
        'MMMM D, YYYY',
        'MMMM D YYYY',
        'MMM D, YYYY',
        'MMM D YYYY',
        'YYYY/MM/DD',
        'MM/DD/YYYY',
        'DD/MM/YYYY',
        'D MMMM YYYY',
        'D MMM YYYY',
    ];
    const parsedMoment = moment(str, standardFormats, false);
    if (parsedMoment.isValid()) {
        return parsedMoment.format('YYYY-MM-DD');
    }

    // 3. Chrono natural language parser fallback
    try {
        const chronoDate = chrono.parseDate(str);
        if (chronoDate) {
            return moment(chronoDate).format('YYYY-MM-DD');
        }
    } catch {
        // Fallback safely if chrono encounter parsing issue
    }

    return null;
}

/**
 * Formats a YYYY-MM-DD string into a friendly localized display string (e.g. "August 1, 2026").
 */
export function formatDateForDisplay(dateStr: string | undefined | null): string {
    if (!dateStr) return '';
    const m = moment(dateStr, 'YYYY-MM-DD', true);
    if (m.isValid()) {
        return m.format('MMMM D, YYYY');
    }
    const parsed = parseDateToIso(dateStr);
    if (parsed) {
        return moment(parsed, 'YYYY-MM-DD').format('MMMM D, YYYY');
    }
    return dateStr;
}

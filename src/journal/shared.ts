export const RESERVED_JOURNAL_CONTEXTS = ['Daily Log', 'Weekly Review', 'Monthly Review'] as const;

export function normalizeJournalType(type: unknown): string | null {
    if (typeof type !== 'string') return null;
    const trimmed = type.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function inferJournalType(params: {
    journalType?: unknown;
    context?: string[];
    tags?: string[];
}): string | null {
    if (params.journalType && typeof params.journalType === 'string' && params.journalType.trim()) {
        return params.journalType.trim();
    }
    const contexts = params.context ?? [];
    for (const c of contexts) {
        if (c === 'Daily Log' || c === 'daily') return 'daily';
        if (c === 'Weekly Review' || c === 'weekly') return 'weekly';
        if (c === 'Monthly Review' || c === 'monthly') return 'monthly';
    }
    return null;
}

export function buildJournalContexts(contexts: string[], journalType?: string | null): string[] {
    const list = contexts.filter(c => c && !['Daily Log', 'Weekly Review', 'Monthly Review'].includes(c));
    if (journalType) {
        if (journalType === 'daily') list.push('Daily Log');
        else if (journalType === 'weekly') list.push('Weekly Review');
        else if (journalType === 'monthly') list.push('Monthly Review');
        else list.push(journalType);
    }
    return Array.from(new Set(list));
}

export function stripReservedJournalContexts(contexts: string[]): string[] {
    return contexts.filter(c => !['Daily Log', 'Weekly Review', 'Monthly Review', 'daily', 'weekly', 'monthly'].includes(c));
}

export function getThoughtDisplayTitle(
    thought: { title?: string; body?: string },
    fallback: string = 'Untitled thought',
): string {
    if (thought.title && thought.title.trim() && thought.title !== 'Untitled thought') {
        return thought.title.trim();
    }
    const body = (thought.body || '').trim();
    if (!body) return fallback;
    const firstLine = body.split('\n')[0].replace(/^[#\s\-*]+/, '').trim();
    return firstLine.slice(0, 50) || fallback;
}

import type { ThoughtEntry } from '../types';

export const JOURNAL_CONTEXT = 'journal';

export const JOURNAL_TYPES = [
    { id: 'reflection', tag: 'reflection', icon: '🪞', label: 'Reflection', placeholder: 'Look back. What happened, and what stayed with you?' },
    { id: 'realization', tag: 'realization', icon: '⚡', label: 'Realization', placeholder: 'Capture the shift, connection, or insight that surfaced.' },
    { id: 'gratitude', tag: 'gratitude', icon: '🙏', label: 'Gratitude', placeholder: 'What felt grounding, generous, or unexpectedly good today?' },
    { id: 'idea', tag: 'idea', icon: '💡', label: 'Idea', placeholder: 'What concept, prompt, or possibility deserves a place to grow?' },
    { id: 'note', tag: 'note', icon: '📝', label: 'Note', placeholder: 'Write the details, fragments, or reminders you want to keep.' },
    { id: 'free', tag: '', icon: '✍️', label: 'Free Write', placeholder: 'Start writing and let the page do the organizing.' },
] as const;

export type JournalTypeId = typeof JOURNAL_TYPES[number]['id'];
export const JOURNAL_TYPE_TAGS = new Set<string>(
    JOURNAL_TYPES.map((type) => type.tag).filter((tag) => !!tag),
);

function firstContentLine(text: string): string {
    return text
        .split('\n')
        .map((line) => line.replace(/[#*_`\[\]!>-]/g, ' ').replace(/\s+/g, ' ').trim())
        .find(Boolean)
        || '';
}

export function normalizeJournalType(value: unknown): JournalTypeId | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    const exact = JOURNAL_TYPES.find((type) => type.id === normalized || type.tag === normalized);
    return exact?.id ?? null;
}

export function getJournalTypeOption(journalType: string | null | undefined) {
    const normalized = normalizeJournalType(journalType) ?? 'free';
    return JOURNAL_TYPES.find((type) => type.id === normalized) ?? JOURNAL_TYPES[JOURNAL_TYPES.length - 1];
}

export function inferJournalType(input: {
    journalType?: unknown;
    context?: string[];
    tags?: string[];
}): JournalTypeId | null {
    const explicit = normalizeJournalType(input.journalType);
    if (explicit) return explicit;
    const pool = [...(input.context ?? []), ...(input.tags ?? [])]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
    for (const type of JOURNAL_TYPES) {
        if (!type.tag) continue;
        if (pool.includes(type.tag)) return type.id;
    }
    return null;
}

export function stripReservedJournalContexts(contexts: string[] = []): string[] {
    return Array.from(new Set(
        contexts
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .filter((value) => value !== JOURNAL_CONTEXT && !JOURNAL_TYPE_TAGS.has(value.toLowerCase())),
    ));
}

export function buildJournalContexts(contexts: string[] = [], journalType?: string | null): string[] {
    const generic = stripReservedJournalContexts(contexts);
    const type = normalizeJournalType(journalType);
    const next = [JOURNAL_CONTEXT, ...generic];
    if (type) next.push(type);
    return Array.from(new Set(next));
}

export function getThoughtDisplayTitle(entry: Partial<ThoughtEntry>, fallback = 'Untitled'): string {
    const explicit = String(entry.title || '').trim();
    if (explicit) return explicit;
    const fromBody = firstContentLine(String(entry.body || entry.content || ''));
    return fromBody || fallback;
}

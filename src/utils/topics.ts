export type ThoughtTopicValue = string | string[] | null | undefined;

export function normalizeThoughtTopics(raw: ThoughtTopicValue): string[] {
    const values = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string' ? [raw] : []);
    const seen = new Set<string>();
    const topics: string[] = [];
    for (const value of values) {
        const topic = String(value ?? '').trim();
        if (!topic) continue;
        const key = topic.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        topics.push(topic);
    }
    return topics;
}

export function toStoredThoughtTopic(raw: ThoughtTopicValue): string | string[] | null {
    const topics = normalizeThoughtTopics(raw);
    if (topics.length === 0) return null;
    return topics.length === 1 ? topics[0] : topics;
}

export function formatThoughtTopics(raw: ThoughtTopicValue, separator = ', '): string {
    return normalizeThoughtTopics(raw).join(separator);
}

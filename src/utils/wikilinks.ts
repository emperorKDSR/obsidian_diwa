export function extractWikiLinks(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        const link = match[1]?.trim();
        if (!link) continue;
        matches.push(link);
    }
    return Array.from(new Set(matches));
}


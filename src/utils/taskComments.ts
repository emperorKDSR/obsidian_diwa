import type { ReplyEntry } from '../types';

const COMMENT_MARKER_PREFIX = '<!-- DIWA-COMMENT ';
const COMMENT_MARKER_SUFFIX = ' -->';
const COMMENT_END_MARKER = '<!-- /DIWA-COMMENT -->';
const LEGACY_HEADER_REGEX = /^## \[\[([^\]]+)\]\] (\d{2}:\d{2}:\d{2}) \^(reply-[\w-]+)$/;

export interface ParsedTaskComment extends ReplyEntry {
    startLine: number;
    headerLine: number;
    endLineExclusive: number;
}

function parseMarkerMetadata(line: string): ReplyEntry | null {
    if (!line.startsWith(COMMENT_MARKER_PREFIX) || !line.endsWith(COMMENT_MARKER_SUFFIX)) {
        return null;
    }

    try {
        const payload = line.slice(COMMENT_MARKER_PREFIX.length, -COMMENT_MARKER_SUFFIX.length);
        const parsed = JSON.parse(payload) as Partial<ReplyEntry>;
        if (!parsed.anchor || !parsed.date || !parsed.time) return null;
        return {
            anchor: String(parsed.anchor),
            date: String(parsed.date),
            time: String(parsed.time),
            text: '',
        };
    } catch {
        return null;
    }
}

function parseLegacyHeader(line: string): Omit<ReplyEntry, 'text'> | null {
    const match = line.trim().match(LEGACY_HEADER_REGEX);
    if (!match) return null;
    return {
        date: match[1],
        time: match[2],
        anchor: match[3],
    };
}

export function isTaskCommentHeaderLine(line: string): boolean {
    return !!parseLegacyHeader(line);
}

export function buildTaskCommentBlock(meta: Omit<ReplyEntry, 'text'>, text: string): string {
    const normalizedText = text.replace(/\r\n?/g, '\n').trimEnd();
    const marker = `${COMMENT_MARKER_PREFIX}${JSON.stringify(meta)}${COMMENT_MARKER_SUFFIX}`;
    const header = `## [[${meta.date}]] ${meta.time} ^${meta.anchor}`;
    return `${marker}\n${header}\n${normalizedText}\n${COMMENT_END_MARKER}`;
}

export function parseTaskCommentBlocks(content: string): ParsedTaskComment[] {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    const comments: ParsedTaskComment[] = [];

    for (let index = 0; index < lines.length; index++) {
        const markerMeta = parseMarkerMetadata(lines[index]);
        if (markerMeta) {
            const headerMeta = parseLegacyHeader(lines[index + 1] ?? '');
            const entry = headerMeta && headerMeta.anchor === markerMeta.anchor
                ? headerMeta
                : { anchor: markerMeta.anchor, date: markerMeta.date, time: markerMeta.time };
            let end = index + 1;
            while (end < lines.length && lines[end] !== COMMENT_END_MARKER) end += 1;
            const textStart = headerMeta ? index + 2 : index + 1;
            const textEnd = end < lines.length ? end : lines.length;
            comments.push({
                ...entry,
                text: lines.slice(textStart, textEnd).join('\n').trimEnd(),
                startLine: index,
                headerLine: headerMeta ? index + 1 : index,
                endLineExclusive: end < lines.length ? end + 1 : lines.length,
            });
            index = end < lines.length ? end : lines.length;
            continue;
        }

        const legacyMeta = parseLegacyHeader(lines[index]);
        if (!legacyMeta) continue;

        let end = index + 1;
        while (end < lines.length) {
            if (parseMarkerMetadata(lines[end]) || parseLegacyHeader(lines[end])) break;
            end += 1;
        }

        comments.push({
            ...legacyMeta,
            text: lines.slice(index + 1, end).join('\n').trimEnd(),
            startLine: index,
            headerLine: index,
            endLineExclusive: end,
        });
        index = end - 1;
    }

    return comments;
}

export function splitTaskBodyAndCommentSuffix(content: string): { body: string; commentSuffix: string; comments: ReplyEntry[] } {
    const normalized = content.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const comments = parseTaskCommentBlocks(normalized);
    if (comments.length === 0) {
        return {
            body: normalized.trim(),
            commentSuffix: '',
            comments: [],
        };
    }

    let commentStart = comments[0].startLine;
    while (commentStart > 0 && lines[commentStart - 1].trim() === '') commentStart -= 1;

    return {
        body: lines.slice(0, commentStart).join('\n').trimEnd(),
        commentSuffix: lines.slice(commentStart).join('\n').trim(),
        comments: comments.map(({ anchor, date, time, text }) => ({ anchor, date, time, text })),
    };
}

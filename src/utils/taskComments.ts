import type { ReplyEntry } from '../types';
import { decodeUtf8Base64, encodeUtf8Base64 } from './base64';

const COMMENT_MARKER_PREFIX = '<!-- DIWA-COMMENT ';
const COMMENT_MARKER_SUFFIX = ' -->';
const COMMENT_END_MARKER = '<!-- /DIWA-COMMENT -->';
const LEGACY_HEADER_REGEX = /^## \[\[([^\]]+)\]\] (\d{2}:\d{2}:\d{2}) \^(reply-[\w-]+)$/;

export interface ParsedTaskComment extends ReplyEntry {
    startLine: number;
    headerLine: number;
    endLineExclusive: number;
}

interface ParsedMarkerMetadata extends Omit<ReplyEntry, 'text'> {
    storedText?: string;
}

interface CommentBodyRange {
    textStart: number;
    textEnd: number;
    endLineExclusive: number;
    hasExplicitEndMarker: boolean;
}

function buildCommentEndMarker(anchor: string): string {
    return `<!-- /DIWA-COMMENT ${anchor} -->`;
}

function parseMarkerMetadata(line: string): ParsedMarkerMetadata | null {
    if (!line.startsWith(COMMENT_MARKER_PREFIX) || !line.endsWith(COMMENT_MARKER_SUFFIX)) {
        return null;
    }

    try {
        const payload = line.slice(COMMENT_MARKER_PREFIX.length, -COMMENT_MARKER_SUFFIX.length);
        const decoded = payload.startsWith('{')
            ? payload
            : decodeUtf8Base64(payload);
        if (!decoded) return null;
        const parsed = JSON.parse(decoded) as Partial<ReplyEntry>;
        if (!parsed.anchor || !parsed.date || !parsed.time) return null;
        return {
            anchor: String(parsed.anchor),
            date: String(parsed.date),
            time: String(parsed.time),
            storedText: typeof parsed.text === 'string'
                ? parsed.text.replace(/\r\n?/g, '\n').trimEnd()
                : undefined,
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
    const marker = `${COMMENT_MARKER_PREFIX}${encodeUtf8Base64(JSON.stringify({ ...meta, text: normalizedText, version: 2 }))}${COMMENT_MARKER_SUFFIX}`;
    const header = `## [[${meta.date}]] ${meta.time} ^${meta.anchor}`;
    return `${marker}\n${header}\n${normalizedText}\n${buildCommentEndMarker(meta.anchor)}`;
}

function findCommentBodyRange(
    lines: string[],
    markerIndex: number,
    headerMeta: Omit<ReplyEntry, 'text'> | null,
    anchor: string,
): CommentBodyRange {
    const textStart = headerMeta ? markerIndex + 2 : markerIndex + 1;
    const expectedEndMarker = buildCommentEndMarker(anchor);
    let cursor = textStart;

    while (cursor < lines.length) {
        const line = lines[cursor];
        if (line === expectedEndMarker || line === COMMENT_END_MARKER) {
            return {
                textStart,
                textEnd: cursor,
                endLineExclusive: cursor + 1,
                hasExplicitEndMarker: true,
            };
        }

        if (parseMarkerMetadata(line) || parseLegacyHeader(line)) {
            break;
        }

        cursor += 1;
    }

    return {
        textStart,
        textEnd: cursor,
        endLineExclusive: cursor,
        hasExplicitEndMarker: false,
    };
}

export function parseTaskCommentBlocks(content: string): ParsedTaskComment[] {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    const comments: ParsedTaskComment[] = [];

    for (let index = 0; index < lines.length; index++) {
        const markerMeta = parseMarkerMetadata(lines[index]);
        if (markerMeta) {
            const parsedHeaderMeta = parseLegacyHeader(lines[index + 1] ?? '');
            const headerMeta = parsedHeaderMeta && parsedHeaderMeta.anchor === markerMeta.anchor
                ? parsedHeaderMeta
                : null;
            const entry = headerMeta
                ? headerMeta
                : { anchor: markerMeta.anchor, date: markerMeta.date, time: markerMeta.time };
            const bodyRange = findCommentBodyRange(lines, index, headerMeta, entry.anchor);
            const visibleText = lines.slice(bodyRange.textStart, bodyRange.textEnd).join('\n').trimEnd();
            const shouldUseStoredText = markerMeta.storedText !== undefined
                && !headerMeta
                && !bodyRange.hasExplicitEndMarker
                && bodyRange.textStart >= bodyRange.textEnd;
            const text = shouldUseStoredText ? markerMeta.storedText ?? '' : visibleText;
            comments.push({
                ...entry,
                text,
                startLine: index,
                headerLine: headerMeta ? index + 1 : index,
                endLineExclusive: bodyRange.endLineExclusive,
            });
            index = Math.max(index, bodyRange.endLineExclusive - 1);
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

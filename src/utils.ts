import { App, Platform, moment, Notice } from 'obsidian';
import * as chrono from 'chrono-node';
import { FileSuggestModal } from './modals/FileSuggestModal';
import { ContextSuggestModal } from './modals/ContextSuggestModal';
import { PersonSuggestModal } from './modals/PersonSuggestModal';
import type { RecurrenceRule, TaskEntry } from './types';
import { createVaultBinaryFile, normalizeVaultRelativePath } from './utils/vaultFiles';

export function computeNextDue(currentDue: string, rule: RecurrenceRule): string {
    const m = moment(currentDue, 'YYYY-MM-DD', true);
    if (!m.isValid()) return moment().format('YYYY-MM-DD');
    switch (rule) {
        case 'daily':    return m.add(1, 'day').format('YYYY-MM-DD');
        case 'weekly':   return m.add(1, 'week').format('YYYY-MM-DD');
        case 'biweekly': return m.add(2, 'weeks').format('YYYY-MM-DD');
        case 'monthly':  return m.add(1, 'month').format('YYYY-MM-DD');
    }
}

/** Convert any locale-specific digit characters to ASCII 0-9.
 *  Covers Arabic-Indic (٠-٩), Persian (۰-۹), Devanagari (०-९),
 *  Bengali (০-৯), and Thai (๐-๙) so stored timestamps are always plain numbers
 *  regardless of the device's locale setting. */
export function toAsciiDigits(s: string): string {
    return s
        .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
        .replace(/[\u0966-\u096F]/g, c => String(c.charCodeAt(0) - 0x0966))
        .replace(/[\u09E6-\u09EF]/g, c => String(c.charCodeAt(0) - 0x09E6))
        .replace(/[\u0E50-\u0E59]/g, c => String(c.charCodeAt(0) - 0x0E50));
}

const TABLET_VIEWPORT_SHORT_EDGE_PX = 768;

function getViewportDimension(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : fallback;
}

export function getWorkspaceViewportSize(app?: App): { width: number; height: number } {
    const workspaceEl = app?.workspace?.containerEl;
    const workspaceRect = workspaceEl?.getBoundingClientRect();
    const workspaceWidth = workspaceRect ? Math.round(workspaceRect.width) : 0;
    const workspaceHeight = workspaceRect ? Math.round(workspaceRect.height) : 0;
    if (workspaceWidth > 0 && workspaceHeight > 0) {
        return { width: workspaceWidth, height: workspaceHeight };
    }

    const doc = workspaceEl?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const rootEl = doc.documentElement;
    const bodyEl = doc.body;

    const width = Math.max(
        getViewportDimension(rootEl?.clientWidth, 0),
        getViewportDimension(bodyEl?.clientWidth, 0),
        getViewportDimension(win.innerWidth, 0),
    );
    const height = Math.max(
        getViewportDimension(rootEl?.clientHeight, 0),
        getViewportDimension(bodyEl?.clientHeight, 0),
        getViewportDimension(win.innerHeight, 0),
    );

    return { width, height };
}

/** True when running on an iPad (or large Android tablet).
 *  Obsidian's mobile runtime is used for both phones and tablets, so we
 *  distinguish them by the current Obsidian viewport short edge instead of
 *  the physical device screen size. */
export function isTablet(app?: App): boolean {
    const isMobile = (app as { isMobile?: boolean } | undefined)?.isMobile ?? Platform.isMobile;
    if (!isMobile) return false;
    const { width, height } = getWorkspaceViewportSize(app);
    return Math.min(width, height) >= TABLET_VIEWPORT_SHORT_EDGE_PX;
}

/** Parse a context string like "#work #personal" into ["work", "personal"] */
export function parseContextString(ctxStr: string): string[] {
    return ctxStr.split('#').map(c => c.trim()).filter(c => c.length > 0);
}

export function parseNaturalDate(text: string): string | null {
    const results = chrono.parse(text);
    if (results && results.length > 0) {
        const date = results[0].start.date();
        return moment(date).format('YYYY-MM-DD');
    }
    return null;
}

export function isTaskDone(task: TaskEntry): boolean {
    const status = String(task.status || '').toLowerCase();
    const state = String(task.state || '').toLowerCase();
    const bucket = String(task.bucketStatus || '').toLowerCase();
    const lifecycle = String(task.lifecycleStatus || '').toLowerCase();
    return status === 'done'
        || state === 'done'
        || bucket === 'done'
        || lifecycle === 'done'
        || !!task.completedAt;
}

/**
 * Attach inline smart triggers to a capture textarea:
 *   @word<space>  → NLP date parse → sets due date + inserts [[date]] wiki link
 *   [[            → opens FileSuggestModal → inserts [[Note]] link
 *   #             → opens ContextSuggestModal → adds context chip
 *   + at line start → converts to `- [ ] ` checklist item
 */
export function attachInlineTriggers(
    app: App,
    textArea: HTMLTextAreaElement | HTMLInputElement,
    setDueDate: (d: string) => void,
    onContext?: (tag: string) => void,
    getContexts?: () => string[],
    peopleFolder?: string
): void {
    textArea.addEventListener('input', () => {
        const val = textArea.value;
        const pos = textArea.selectionStart ?? val.length;
        const before = val.substring(0, pos);

        // @word<space> → NLP date first; if not a date, treat as @mention → person wikilink
        const atMatch = before.match(/@(\S+)\s$/);
        if (atMatch) {
            const parsed = parseNaturalDate(atMatch[1]);
            if (parsed) {
                const removeFrom = pos - atMatch[0].length;
                const wikiDate = `[[${parsed}]] `;
                textArea.value = val.substring(0, removeFrom) + wikiDate + val.substring(pos);
                textArea.setSelectionRange(removeFrom + wikiDate.length, removeFrom + wikiDate.length);
                setDueDate(parsed);
                return;
            }
            // Not a date → open person picker with the typed word as initial query
            const word = atMatch[1];
            const removeFrom = pos - atMatch[0].length;
            textArea.value = val.substring(0, removeFrom) + val.substring(pos);
            textArea.setSelectionRange(removeFrom, removeFrom);
            new PersonSuggestModal(app, (file) => {
                const link = `[[${file.basename}]] `;
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? removeFrom;
                textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                textArea.focus();
                textArea.dispatchEvent(new Event('input', { bubbles: true }));
            }, peopleFolder, word).open();
            return;
        }

        // # at start or after whitespace → open ContextSuggestModal
        if (onContext && /(^|\s)#$/.test(before)) {
            const insertAt = pos - 1;
            textArea.value = val.substring(0, insertAt) + val.substring(pos);
            textArea.setSelectionRange(insertAt, insertAt);
            new ContextSuggestModal(app, getContexts ? getContexts() : [], (tag) => {
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? insertAt;
                textArea.value = cur.substring(0, curPos) + cur.substring(curPos);
                onContext(tag);
                textArea.focus();
            }).open();
            return;
        }

        // / at start or after whitespace → open PersonSuggestModal (type: people)
        if (/(^|\s)\/$/.test(before)) {
            const insertAt = pos - 1;
            textArea.value = val.substring(0, insertAt) + val.substring(pos);
            textArea.setSelectionRange(insertAt, insertAt);
            new PersonSuggestModal(app, (file) => {
                const link = `[[${file.basename}]]`;
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? insertAt;
                textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                textArea.focus();
                textArea.dispatchEvent(new Event('input', { bubbles: true }));
            }, peopleFolder).open();
            return;
        }

        // [[ → wiki-link insertion via file picker
        if (before.endsWith('[[')) {
            textArea.value = val.substring(0, pos - 2) + val.substring(pos);
            const insertAt = pos - 2;
            textArea.setSelectionRange(insertAt, insertAt);
            new FileSuggestModal(app, (file) => {
                const link = `[[${file.basename}]]`;
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? insertAt;
                textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                textArea.focus();
                textArea.dispatchEvent(new Event('input', { bubbles: true }));
            }).open();
            return;
        }

        // + at line start → checklist item
        if (before.endsWith('\n+') || before === '+') {
            const insertAt = pos - 1;
            textArea.value = val.substring(0, insertAt) + '- [ ] ' + val.substring(pos);
            textArea.setSelectionRange(insertAt + 6, insertAt + 6);
        }
    });
}

/**
 * Attach clipboard-paste and drag-drop handlers to a textarea.
 * Saves image/file data to the vault and inserts an Obsidian ![[link]] at cursor.
 *
 * @param app             The Obsidian App instance
 * @param textarea        The target textarea element
 * @param getFolder       Callback returning the attachments folder path (e.g. '000 Bin/DIWA Attachments')
 */
export function attachMediaPasteHandler(
    app: App,
    textarea: HTMLTextAreaElement | HTMLInputElement,
    getFolder: () => string,
    options: { prefix?: string } = {},
): void {
    (textarea as HTMLElement).addEventListener('paste', async (e: Event) => {
        const ce = e as ClipboardEvent;
        const items = ce.clipboardData?.items;
        if (!items) return;

        // Pre-scan for file items synchronously so we can preventDefault before any await
        const fileItems: DataTransferItem[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') fileItems.push(items[i]);
        }
        if (fileItems.length === 0) return; // no files — let text paste proceed normally

        ce.preventDefault();
        for (const item of fileItems) {
            const file = item.getAsFile();
            if (!file) continue;
            await insertFilesAtCursor(app, textarea, [file], getFolder, options);
        }
    });

    (textarea as HTMLElement).addEventListener('dragover', (e: Event) => {
        const de = e as DragEvent;
        if (de.dataTransfer?.items && Array.from(de.dataTransfer.items).some(i => i.kind === 'file')) {
            de.preventDefault();
            de.dataTransfer.dropEffect = 'copy';
        }
    });

    (textarea as HTMLElement).addEventListener('drop', async (e: Event) => {
        const de = e as DragEvent;
        const files = de.dataTransfer?.files;
        if (!files || files.length === 0) return;
        de.preventDefault();
        await insertFilesAtCursor(app, textarea, Array.from(files), getFolder, options);
    });
}

export async function ensureVaultFolder(app: App, folder: string): Promise<void> {
    const normalizedFolder = normalizeVaultRelativePath(folder, 'folder');
    if (!normalizedFolder) return;

    const parts = normalizedFolder.split('/').filter(Boolean);
    let pathSoFar = '';
    for (const part of parts) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
        if (app.vault.getAbstractFileByPath(pathSoFar)) continue;
        try {
            await app.vault.createFolder(pathSoFar);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('already exists')) throw error;
        }
    }
}

export function buildAttachmentWikiLink(path: string, file: Pick<File, 'type' | 'name'>): string {
    return `${shouldEmbedAttachment(file) ? '!' : ''}[[${path}]]`;
}

export async function insertFilesAtCursor(
    app: App,
    textarea: HTMLTextAreaElement | HTMLInputElement,
    files: Iterable<File>,
    getFolder: () => string,
    options: { prefix?: string } = {},
): Promise<string[]> {
    const inserted: string[] = [];
    for (const file of files) {
        const savedPath = await saveAttachmentFile(app, file, getFolder(), options.prefix);
        if (!savedPath) continue;
        const link = buildAttachmentWikiLink(savedPath, file);
        insertAtCursor(textarea, link);
        inserted.push(savedPath);
    }
    return inserted;
}

async function saveAttachmentFile(app: App, file: File, folderPath: string, prefix = 'attachment'): Promise<string | null> {
    try {
        const folder = (folderPath || '000 Bin/DIWA Attachments').trim();
        await ensureVaultFolder(app, folder);
        const ext = resolveAttachmentExtension(file);
        const ts = moment().format('YYYYMMDD_HHmmss');
        const rand = Math.random().toString(36).substring(2, 6);
        const filename = `${prefix}_${ts}_${rand}.${ext}`;
        const buffer = await file.arrayBuffer();
        const saved = await createVaultBinaryFile(app, folder, filename, buffer);
        return saved.path;
    } catch (error) {
        console.error('[DIWA] Attachment save failed:', error);
        return null;
    }
}

function resolveAttachmentExtension(file: Pick<File, 'type' | 'name'>): string {
    const mimeToExt: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'application/json': 'json',
    };
    if (file.type && mimeToExt[file.type]) return mimeToExt[file.type];
    const parts = String(file.name || '').split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : 'bin';
}

function shouldEmbedAttachment(file: Pick<File, 'type' | 'name'>): boolean {
    const normalizedType = String(file.type || '').toLowerCase();
    if (normalizedType.startsWith('image/')) return true;
    if (normalizedType === 'application/pdf') return true;
    const extension = resolveAttachmentExtension(file);
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(extension);
}

function insertAtCursor(textarea: HTMLTextAreaElement | HTMLInputElement, link: string): void {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const needsPrefixNewline = start > 0 && !textarea.value.slice(Math.max(0, start - 1), start).match(/\s/);
    const insertText = `${needsPrefixNewline ? '\n' : ''}${link}`;
    textarea.value = textarea.value.substring(0, start) + insertText + textarea.value.substring(end);
    const nextPos = start + insertText.length;
    textarea.setSelectionRange(nextPos, nextPos);
    textarea.dispatchEvent(new Event('input'));
}

export interface ThoughtCaptureOptions {
    app: App;
    containerCls: string;
    textareaCls: string;
    chipCls: string;
    placeholder: string;
    getContexts?: () => string[];
    initialContexts?: string[];
    peopleFolder?: string;
    attachmentsFolder?: () => string;
    onSave: (text: string, contexts: string[]) => Promise<void>;
    setPending: (v: number) => void;
}

export function createThoughtCaptureWidget(parent: HTMLElement, options: ThoughtCaptureOptions): void {
    const {
        app, containerCls, textareaCls, chipCls, placeholder,
        getContexts, initialContexts, peopleFolder, attachmentsFolder, onSave, setPending
    } = options;

    const chipRow = parent.createEl('div', { cls: `${containerCls}-chip-row` });
    let contexts: string[] = initialContexts ? [...initialContexts] : [];

    const addChip = (tag: string) => {
        if (contexts.includes(tag)) return;
        contexts.push(tag);
        const chip = chipRow.createEl('span', { cls: chipCls, text: `#${tag}` });
        chip.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            contexts = contexts.filter(c => c !== tag);
            chip.remove();
        });
    };

    // Pre-render chips for any initial contexts
    if (initialContexts) {
        for (const ctx of initialContexts) addChip(ctx);
    }

    const textarea = parent.createEl('textarea', {
        cls: textareaCls,
        attr: { placeholder, rows: '1' }
    }) as HTMLTextAreaElement;

    const syncHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
        textarea.style.height = `${textarea.scrollHeight}px`;
    };

    textarea.addEventListener('focus', () => { setPending(1); syncHeight(); });
    textarea.addEventListener('input', () => {
        syncHeight();
        setPending(textarea.value.trim().length > 0 ? 1 : 0);
    });
    textarea.addEventListener('keyup', syncHeight);

    attachInlineTriggers(
        app,
        textarea,
        () => {},
        addChip,
        getContexts,
        peopleFolder,
    );
    if (attachmentsFolder) {
        attachMediaPasteHandler(app, textarea, attachmentsFolder);
    }

    const save = async () => {
        const raw = textarea.value.trim();
        if (!raw) return;
        const ctxSnapshot = [...contexts];
        setPending(0);
        textarea.value = '';
        textarea.style.height = '';
        textarea.style.overflowY = '';
        contexts = [];
        chipRow.empty();
        await onSave(raw, ctxSnapshot);
    };

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
        if (e.key === 'Escape') {
            textarea.value = '';
            contexts = [];
            chipRow.empty();
            setPending(0);
            textarea.blur();
        }
    });
}

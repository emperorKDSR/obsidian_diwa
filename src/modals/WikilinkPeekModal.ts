import { App, Modal, ItemView, WorkspaceLeaf, ViewStateResult, TFile, MarkdownRenderer, Platform, setIcon, Notice, Component, moment, getAllTags } from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_WIKILINK_PEEK } from '../constants';
import { sanitizeVaultFilename } from '../utils/vaultFiles';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';

export interface PeekHistoryEntry {
    linkText: string;
    sourcePath: string;
}

interface PeekDocBlock {
    raw: string;
    trailingAnchor: string;
    isHiddenMeta: boolean;
    isCodeBlock: boolean;
}

export async function openWikilinkInPeekWindow(
    app: App,
    linkText: string,
    sourcePath: string,
    history: PeekHistoryEntry[] = []
): Promise<void> {
    const ws = app.workspace as unknown as {
        openPopoutLeaf?: (data?: { size?: { width: number; height: number } }) => WorkspaceLeaf;
    };
    const winLeaf: WorkspaceLeaf = typeof ws.openPopoutLeaf === 'function'
        ? ws.openPopoutLeaf({ size: { width: 680, height: 640 } })
        : app.workspace.getLeaf('window');

    await winLeaf.setViewState({
        type: VIEW_TYPE_WIKILINK_PEEK,
        active: true,
        state: {
            linkText,
            sourcePath,
            history: [...history],
        }
    });
    app.workspace.revealLeaf(winLeaf);
}

export class WikilinkPeekModal extends Modal {
    private _plugin: DiwaPlugin;
    private linkText: string;
    private sourcePath: string;
    private onFilterStream?: (target: string) => void;
    private targetFile: TFile | null = null;
    private cleanLinkName: string = '';
    private _renderComponent: Component = new Component();
    private _history: PeekHistoryEntry[] = [];
    private _isWindowView: boolean = false;
    private _onTitleChange?: () => void;
    private _selfSaveSuppressionUntil: number = 0;

    // Line-Level Live Editor state
    private _preservedPrefix: string = '';
    private _docBlocks: PeekDocBlock[] = [];
    private _activeBlockIdx: number | null = null;
    private _activeTextarea: HTMLTextAreaElement | null = null;
    private _linesContainerEl: HTMLElement | null = null;
    private _saveQueue: Promise<void> = Promise.resolve();

    constructor(
        app: App,
        _plugin: DiwaPlugin,
        linkText: string,
        sourcePath: string,
        onFilterStream?: (target: string) => void,
        isWindowView: boolean = false,
        onTitleChange?: () => void
    ) {
        super(app);
        this._plugin = _plugin;
        this.linkText = linkText;
        this.sourcePath = sourcePath;
        this.onFilterStream = onFilterStream;
        this._isWindowView = isWindowView;
        this._onTitleChange = onTitleChange;
        if (linkText) {
            this.resolveCurrentTarget(linkText, sourcePath);
        }
    }

    public getDisplayTitle(): string {
        if (this.targetFile) return this.targetFile.basename;
        if (this.cleanLinkName) return this.cleanLinkName;
        return 'Note Peek';
    }

    public getTargetFilePath(): string | null {
        return this.targetFile?.path ?? null;
    }

    public isSelfSaveActive(): boolean {
        return Date.now() < this._selfSaveSuppressionUntil || this._activeBlockIdx !== null;
    }

    public getStateData(): { linkText: string; sourcePath: string; history: PeekHistoryEntry[] } {
        return {
            linkText: this.linkText,
            sourcePath: this.sourcePath,
            history: [...this._history],
        };
    }

    public async setStateData(
        linkText: string,
        sourcePath: string,
        history: PeekHistoryEntry[] = []
    ): Promise<void> {
        await this.commitActiveBlock();
        this._history = Array.isArray(history) ? [...history] : [];
        this.resolveCurrentTarget(linkText, sourcePath);
        this._onTitleChange?.();
        await this.renderModalContent();
    }

    public async mountInlineView(hostContentEl: HTMLElement): Promise<void> {
        this.contentEl = hostContentEl;
        this._renderComponent.load();
        if (this.linkText) {
            await this.renderModalContent();
        }
    }

    public unmountInlineView(): void {
        this.onClose();
    }

    public async refreshFromExternalModify(): Promise<void> {
        if (this.isSelfSaveActive()) return;
        if (this.linkText) {
            this.resolveCurrentTarget(this.linkText, this.sourcePath);
            await this.renderModalContent();
        }
    }

    private resolveCurrentTarget(linkText: string, sourcePath: string): void {
        this.linkText = linkText;
        this.sourcePath = sourcePath;

        // Parse link and optional heading/block subpath
        const subIndex = linkText.indexOf('#');
        if (subIndex !== -1) {
            this.cleanLinkName = linkText.substring(0, subIndex);
        } else {
            this.cleanLinkName = linkText;
        }

        this.targetFile = this.app.metadataCache.getFirstLinkpathDest(this.cleanLinkName, this.sourcePath);
        if (!this.targetFile) {
            const direct = this.app.vault.getAbstractFileByPath(this.cleanLinkName);
            if (direct instanceof TFile) {
                this.targetFile = direct;
            }
        }
    }

    private async navigateToLink(newLinkText: string, newSourcePath: string): Promise<void> {
        await this.commitActiveBlock();
        this._history.push({ linkText: this.linkText, sourcePath: this.sourcePath });
        this.resolveCurrentTarget(newLinkText, newSourcePath);
        this._onTitleChange?.();
        await this.renderModalContent();
    }

    private async navigateBack(): Promise<void> {
        const prev = this._history.pop();
        if (!prev) return;
        await this.commitActiveBlock();
        this.resolveCurrentTarget(prev.linkText, prev.sourcePath);
        this._onTitleChange?.();
        await this.renderModalContent();
    }

    async onOpen(): Promise<void> {
        this._renderComponent.load();
        const { modalEl, containerEl } = this;

        modalEl.addClass('pos-wikilink-peek-modal');
        if (Platform.isMobile) {
            modalEl.addClass('pos-mobile-bottom-sheet');
            containerEl.addClass('pos-bottom-sheet-backdrop');
        }

        await this.renderModalContent();
    }

    private async renderModalContent(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this._activeBlockIdx = null;
        this._activeTextarea = null;
        this._linesContainerEl = null;

        // 1. Mobile Drag Handle (Modal mode on mobile only)
        if (Platform.isMobile && !this._isWindowView) {
            const dragWrap = contentEl.createDiv({ cls: 'pos-sheet-drag-handle-wrap' });
            dragWrap.createDiv({ cls: 'pos-sheet-drag-handle' });
            this.setupMobileGestures(modalEl);
        }

        // 2. Architectural Header Bar
        const headerEl = contentEl.createDiv({ cls: 'pos-peek-header' });
        const headerLeft = headerEl.createDiv({ cls: 'pos-peek-header-left' });

        // Back button when drilled into nested links
        if (this._history.length > 0) {
            const backBtn = headerLeft.createEl('button', {
                cls: 'pos-peek-nav-back-btn clickable-icon',
                attr: { 'aria-label': 'Back to previous note', 'title': 'Back' }
            });
            setIcon(backBtn, 'arrow-left');
            backBtn.onclick = () => void this.navigateBack();
        }

        const titleInfo = headerLeft.createDiv({ cls: 'pos-peek-title-info' });
        if (this.targetFile) {
            const titleRow = titleInfo.createDiv({ cls: 'pos-peek-title-row' });
            titleRow.createEl('h3', { cls: 'pos-peek-title', text: this.targetFile.basename });

            // Build quiet editorial subtitle: Folder · #tag1 · #tag2 · Updated 12m ago
            const metaParts: string[] = [];
            const folderPath = this.targetFile.parent?.path || '';
            if (folderPath && folderPath !== '/') {
                metaParts.push(folderPath);
            }

            const cache = this.app.metadataCache.getFileCache(this.targetFile);
            if (cache) {
                const rawTags = (getAllTags(cache) || [])
                    .map(t => t.replace(/^#+/, ''))
                    .filter(t => t && t.toLowerCase() !== 'digested');
                const uniqueTags = Array.from(new Set(rawTags)).slice(0, 3);
                for (const tag of uniqueTags) {
                    metaParts.push(`#${tag}`);
                }
            }

            if (this.targetFile.stat?.mtime) {
                metaParts.push(`Updated ${moment(this.targetFile.stat.mtime).fromNow()}`);
            }

            if (metaParts.length > 0) {
                titleInfo.createDiv({
                    cls: 'pos-peek-subtitle',
                    text: metaParts.join(' · ')
                });
            }
        } else {
            const titleRow = titleInfo.createDiv({ cls: 'pos-peek-title-row' });
            titleRow.createEl('h3', { cls: 'pos-peek-title', text: this.cleanLinkName });
            titleInfo.createDiv({ cls: 'pos-peek-subtitle', text: 'Unresolved Note Link' });
        }

        const actionsEl = headerEl.createDiv({ cls: 'pos-peek-actions' });

        // Filter Stream action pill
        if (this.onFilterStream || this._plugin) {
            const filterBtn = actionsEl.createEl('button', {
                cls: 'pos-peek-action-pill clickable-icon',
                attr: { 'aria-label': 'Filter stream by this note', 'title': 'Filter stream by this note' }
            });
            const filterIcon = filterBtn.createSpan({ cls: 'pos-peek-btn-icon' });
            setIcon(filterIcon, 'search');
            if (!Platform.isMobile) {
                filterBtn.createSpan({ cls: 'pos-peek-btn-label', text: 'Stream' });
            }
            filterBtn.onclick = async () => {
                await this.commitActiveBlock();
                const targetName = this.targetFile ? this.targetFile.basename : this.cleanLinkName;
                if (!this._isWindowView) {
                    this.close();
                }
                if (this.onFilterStream) {
                    this.onFilterStream(targetName);
                } else if (this._plugin) {
                    await this._plugin.filterWorkspaceStreamByWikilink(targetName);
                }
            };
        }

        // Open in New Window action pill (Desktop Modal -> Popout WikilinkPeekView Window)
        if (!Platform.isMobile && !this._isWindowView && (this.targetFile || this.cleanLinkName)) {
            const newWinBtn = actionsEl.createEl('button', {
                cls: 'pos-peek-action-pill clickable-icon',
                attr: { 'aria-label': 'Open in new resizable window', 'title': 'Open in new resizable window' }
            });
            const winIcon = newWinBtn.createSpan({ cls: 'pos-peek-btn-icon' });
            setIcon(winIcon, 'app-window');
            newWinBtn.createSpan({ cls: 'pos-peek-btn-label', text: 'New Window' });
            newWinBtn.onclick = async () => {
                await this.commitActiveBlock();
                const linkToOpen = this.linkText || (this.targetFile ? this.targetFile.path : this.cleanLinkName);
                const sourceToOpen = this.sourcePath;
                const historySnapshot = [...this._history];
                this.close();
                await openWikilinkInPeekWindow(this.app, linkToOpen, sourceToOpen, historySnapshot);
            };
        }

        // 3. Body View (Line-Level Live Editor Canvas)
        const bodyEl = contentEl.createDiv({ cls: 'pos-peek-body' });

        if (this.targetFile) {
            await this.renderFileContent(bodyEl, this.targetFile);
        } else {
            this.renderUnresolvedState(bodyEl);
        }
    }

    private parseDocumentIntoBlocks(rawContent: string, fileBasename: string): void {
        let remaining = rawContent.replace(/\r\n/g, '\n');
        let prefix = '';

        // 1. Extract & preserve YAML frontmatter
        const frontmatterMatch = remaining.match(/^---\n[\s\S]*?\n---\n?/);
        if (frontmatterMatch) {
            prefix += frontmatterMatch[0];
            remaining = remaining.slice(frontmatterMatch[0].length);
        }

        // 2. Extract & preserve leading H1 (# Title) if it matches the note's basename
        const leadingH1Match = remaining.match(/^[ \t]*#[ \t]+([^\n]+)\n*/);
        if (leadingH1Match) {
            const h1Text = leadingH1Match[1].trim();
            if (h1Text.toLowerCase() === fileBasename.trim().toLowerCase()) {
                prefix += leadingH1Match[0];
                remaining = remaining.slice(leadingH1Match[0].length);
            }
        }

        this._preservedPrefix = prefix;
        this._docBlocks = [];

        const rawLines = remaining.split('\n');
        // Trim trailing empty newline at the very end of the file so we don't accumulate extra blank lines
        if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
            rawLines.pop();
        }

        let i = 0;
        while (i < rawLines.length) {
            const line = rawLines[i];

            // Fenced code block: group start fence through closing fence as a single block
            const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
            if (fenceMatch) {
                const fenceChars = fenceMatch[2];
                const codeLines: string[] = [line];
                i++;
                while (i < rawLines.length) {
                    codeLines.push(rawLines[i]);
                    if (rawLines[i].trim().startsWith(fenceChars)) {
                        i++;
                        break;
                    }
                    i++;
                }
                this._docBlocks.push({
                    raw: codeLines.join('\n'),
                    trailingAnchor: '',
                    isHiddenMeta: false,
                    isCodeBlock: true
                });
                continue;
            }

            // Hidden DIWA digest metadata comments or standalone ^dw-... block anchors
            if (
                /^\s*<!--\s*\/?diwa-digest[^>]*-->\s*$/.test(line) ||
                /^\s*\^dw-[a-z0-9-]+\s*$/.test(line)
            ) {
                this._docBlocks.push({
                    raw: line,
                    trailingAnchor: '',
                    isHiddenMeta: true,
                    isCodeBlock: false
                });
                i++;
                continue;
            }

            // Separate any trailing ^dw-... block anchor so the user edits clean text
            let cleanLine = line;
            let trailingAnchor = '';
            const anchorMatch = line.match(/([ \t]+\^dw-[a-z0-9-]+[ \t]*)$/);
            if (anchorMatch) {
                trailingAnchor = anchorMatch[1];
                cleanLine = line.slice(0, line.length - trailingAnchor.length);
            }

            this._docBlocks.push({
                raw: cleanLine,
                trailingAnchor,
                isHiddenMeta: false,
                isCodeBlock: false
            });
            i++;
        }

        // Ensure at least one visible editable line exists
        const visibleCount = this._docBlocks.filter(b => !b.isHiddenMeta).length;
        if (visibleCount === 0) {
            this._docBlocks.push({
                raw: '',
                trailingAnchor: '',
                isHiddenMeta: false,
                isCodeBlock: false
            });
        }
    }

    private serializeDocumentBlocks(): string {
        const lines: string[] = [];
        for (const block of this._docBlocks) {
            lines.push(`${block.raw}${block.trailingAnchor}`);
        }
        // Trim trailing blank lines while keeping a single trailing newline
        while (lines.length > 1 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        const bodyText = lines.join('\n');
        if (!bodyText.trim() && this._preservedPrefix) {
            return this._preservedPrefix.endsWith('\n')
                ? this._preservedPrefix
                : `${this._preservedPrefix}\n`;
        }
        const prefix = this._preservedPrefix
            ? (this._preservedPrefix.endsWith('\n') ? this._preservedPrefix : `${this._preservedPrefix}\n`)
            : '';
        return `${prefix}${bodyText}\n`;
    }

    private queueSaveToDisk(): Promise<void> {
        const file = this.targetFile;
        if (!file) return Promise.resolve();

        this._selfSaveSuppressionUntil = Date.now() + 1200;
        const newContent = this.serializeDocumentBlocks();
        this._saveQueue = this._saveQueue.then(async () => {
            try {
                this._selfSaveSuppressionUntil = Date.now() + 1200;
                await this.app.vault.process(file, () => newContent);
                this._selfSaveSuppressionUntil = Date.now() + 1200;
                if (this._plugin?.index) {
                    if (this._plugin.index.isCaptureFile(file.path)) {
                        await this._plugin.index.indexCaptureFile(file);
                    } else {
                        await this._plugin.index.indexProjectTaskFile(file);
                        this._plugin.index.invalidatePermanentNotesCache();
                    }
                    this._plugin.refreshCoordinator?.notifyRefresh('all');
                }
            } catch (err) {
                console.error('[DIWA WikilinkPeekModal] Failed to save line edit', err);
            }
        });
        return this._saveQueue;
    }

    private async renderFileContent(container: HTMLElement, file: TFile): Promise<void> {
        container.empty();
        const content = await this.app.vault.read(file);
        this.parseDocumentIntoBlocks(content, file.basename);

        const linesWrap = container.createDiv({ cls: 'pos-peek-lines-container pos-peek-markdown markdown-rendered' });
        this._linesContainerEl = linesWrap;

        // Render all visible blocks
        for (let idx = 0; idx < this._docBlocks.length; idx++) {
            const block = this._docBlocks[idx];
            if (block.isHiddenMeta) continue;
            const rowEl = linesWrap.createDiv({
                cls: 'pos-peek-line-row',
                attr: { 'data-block-idx': String(idx) }
            });
            await this.renderBlockRow(rowEl, idx, file);
        }

        // Clickable tail area below the last line to append/edit at the bottom of the canvas
        const tailEl = container.createDiv({
            cls: 'pos-peek-canvas-tail',
            attr: { 'aria-label': 'Click to type at the end of the note' }
        });
        tailEl.onclick = async (e: MouseEvent) => {
            e.stopPropagation();
            const lastVisibleIdx = this.getLastVisibleBlockIndex();
            if (lastVisibleIdx !== -1 && this._docBlocks[lastVisibleIdx].raw.trim() === '') {
                await this.activateBlockEditor(lastVisibleIdx);
            } else {
                const newIdx = this._docBlocks.length;
                this._docBlocks.push({
                    raw: '',
                    trailingAnchor: '',
                    isHiddenMeta: false,
                    isCodeBlock: false
                });
                if (this._linesContainerEl) {
                    const rowEl = this._linesContainerEl.createDiv({
                        cls: 'pos-peek-line-row',
                        attr: { 'data-block-idx': String(newIdx) }
                    });
                    await this.renderBlockRow(rowEl, newIdx, file);
                }
                await this.activateBlockEditor(newIdx);
            }
        };

        // If the entire note has only 1 empty line, automatically activate line 0 so it's immediately input-ready
        const visibleIndices = this.getVisibleBlockIndices();
        if (visibleIndices.length === 1 && this._docBlocks[visibleIndices[0]].raw.trim() === '') {
            await this.activateBlockEditor(visibleIndices[0]);
        }
    }

    private getVisibleBlockIndices(): number[] {
        const result: number[] = [];
        for (let i = 0; i < this._docBlocks.length; i++) {
            if (!this._docBlocks[i].isHiddenMeta) {
                result.push(i);
            }
        }
        return result;
    }

    private getLastVisibleBlockIndex(): number {
        for (let i = this._docBlocks.length - 1; i >= 0; i--) {
            if (!this._docBlocks[i].isHiddenMeta) return i;
        }
        return -1;
    }

    private getRowElForBlock(blockIdx: number): HTMLElement | null {
        if (!this._linesContainerEl) return null;
        return this._linesContainerEl.querySelector<HTMLElement>(`.pos-peek-line-row[data-block-idx="${blockIdx}"]`);
    }

    private reindexDOMAttributes(): void {
        if (!this._linesContainerEl) return;
        const rows = Array.from(this._linesContainerEl.querySelectorAll<HTMLElement>('.pos-peek-line-row'));
        const visibleIndices = this.getVisibleBlockIndices();
        for (let i = 0; i < rows.length && i < visibleIndices.length; i++) {
            rows[i].setAttribute('data-block-idx', String(visibleIndices[i]));
        }
    }

    private async commitActiveBlock(): Promise<void> {
        if (this._activeBlockIdx === null) return;
        const idx = this._activeBlockIdx;
        const block = this._docBlocks[idx];
        const textarea = this._activeTextarea;

        this._activeBlockIdx = null;
        this._activeTextarea = null;

        if (block && textarea) {
            const changed = block.raw !== textarea.value;
            block.raw = textarea.value;
            if (changed) {
                await this.queueSaveToDisk();
            }
        }

        const rowEl = this.getRowElForBlock(idx);
        if (rowEl && this.targetFile) {
            rowEl.removeClass('is-editing');
            await this.renderBlockRow(rowEl, idx, this.targetFile);
        }
    }

    private async activateBlockEditor(blockIdx: number, cursorOffset?: number): Promise<void> {
        if (!this.targetFile) return;
        if (this._activeBlockIdx === blockIdx && this._activeTextarea) {
            this._activeTextarea.focus();
            return;
        }

        if (this._activeBlockIdx !== null) {
            await this.commitActiveBlock();
        }

        const block = this._docBlocks[blockIdx];
        const rowEl = this.getRowElForBlock(blockIdx);
        if (!block || !rowEl) return;

        this._activeBlockIdx = blockIdx;
        rowEl.empty();
        rowEl.addClass('is-editing');

        const textarea = rowEl.createEl('textarea', {
            cls: 'pos-peek-line-editor',
            attr: {
                rows: '1',
                placeholder: this.getVisibleBlockIndices().length <= 1 && block.raw === ''
                    ? 'Write a note, or type ++ for a task, [[ to link, # for tag...'
                    : ''
            }
        });
        textarea.value = block.raw;
        this._activeTextarea = textarea;

        const autoResize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.max(textarea.scrollHeight, 24)}px`;
        };

        textarea.oninput = () => {
            autoResize();
            block.raw = textarea.value;
        };

        // Attach DIWA smart triggers ([[, #, @date, /person, ++) & media paste
        if (this._plugin) {
            attachInlineTriggers(
                this.app,
                textarea,
                (_d) => {},
                (_tag) => {},
                () => {
                    const areasList = (this._plugin.settings?.lifeAreas || []).map(a => a.id);
                    const contexts = this._plugin.settings?.contexts || [];
                    return Array.from(new Set([...areasList, ...contexts]));
                },
                this._plugin.settings?.peopleFolder
            );
            attachMediaPasteHandler(
                this.app,
                textarea,
                () => this._plugin.settings?.attachmentsFolder || '000 Bin/DIWA Attachments'
            );
        }

        textarea.onkeydown = async (e: KeyboardEvent) => {
            // Escape or Cmd/Ctrl + Enter -> Commit line & return to rendered state
            if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
                e.preventDefault();
                e.stopPropagation();
                await this.commitActiveBlock();
                return;
            }

            // Enter (without Shift on single-line blocks) -> Split/Create next line
            if (e.key === 'Enter' && !e.shiftKey && !block.isCodeBlock) {
                // If an autocomplete suggest modal is currently open in the DOM, let it handle Enter
                if (document.querySelector('.suggestion-container, .prompt')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                const currentVal = textarea.value;
                const selStart = textarea.selectionStart ?? currentVal.length;
                const selEnd = textarea.selectionEnd ?? selStart;

                // If pressing Enter on an empty bullet or empty task prefix (e.g. "- " or "- [ ] "), clear the prefix
                if (/^(\s*[-*+]\s+(?:\[[ xX]\]\s+)?)$/.test(currentVal)) {
                    textarea.value = '';
                    block.raw = '';
                    autoResize();
                    void this.queueSaveToDisk();
                    return;
                }

                const beforeCursor = currentVal.slice(0, selStart);
                const afterCursor = currentVal.slice(selEnd);

                // Determine if we should continue a list/task prefix on the new line
                let nextLinePrefix = '';
                const listMatch = beforeCursor.match(/^(\s*[-*+]\s+)(\[[ xX]\]\s+)?/);
                if (listMatch) {
                    nextLinePrefix = listMatch[2] ? `${listMatch[1]}[ ] ` : listMatch[1];
                }

                block.raw = beforeCursor;
                const newBlock: PeekDocBlock = {
                    raw: `${nextLinePrefix}${afterCursor}`,
                    trailingAnchor: '',
                    isHiddenMeta: false,
                    isCodeBlock: false
                };

                const insertAt = blockIdx + 1;
                this._docBlocks.splice(insertAt, 0, newBlock);

                // Render current row back to markdown
                this._activeBlockIdx = null;
                this._activeTextarea = null;
                rowEl.removeClass('is-editing');
                if (this.targetFile) {
                    await this.renderBlockRow(rowEl, blockIdx, this.targetFile);
                }

                // Insert new DOM row right after rowEl and reindex data-block-idx
                if (this._linesContainerEl && this.targetFile) {
                    const newRowEl = createDiv({ cls: 'pos-peek-line-row' });
                    rowEl.insertAdjacentElement('afterend', newRowEl);
                    this.reindexDOMAttributes();
                    await this.renderBlockRow(newRowEl, insertAt, this.targetFile);
                    void this.queueSaveToDisk();
                    await this.activateBlockEditor(insertAt, nextLinePrefix.length);
                }
                return;
            }

            // Backspace at very start of line -> Strip list prefix or merge with previous visible line
            if (e.key === 'Backspace' && (textarea.selectionStart ?? 0) === 0 && (textarea.selectionEnd ?? 0) === 0) {
                const currentVal = textarea.value;
                const prefixMatch = currentVal.match(/^(\s*[-*+]\s+(?:\[[ xX]\]\s+)?)/);
                if (prefixMatch) {
                    e.preventDefault();
                    e.stopPropagation();
                    textarea.value = currentVal.slice(prefixMatch[1].length);
                    block.raw = textarea.value;
                    textarea.setSelectionRange(0, 0);
                    autoResize();
                    void this.queueSaveToDisk();
                    return;
                }

                const visibleIndices = this.getVisibleBlockIndices();
                const posInVisible = visibleIndices.indexOf(blockIdx);
                if (posInVisible > 0) {
                    e.preventDefault();
                    e.stopPropagation();

                    const prevIdx = visibleIndices[posInVisible - 1];
                    const prevBlock = this._docBlocks[prevIdx];
                    const cursorTargetPos = prevBlock.raw.length;
                    prevBlock.raw = `${prevBlock.raw}${currentVal}`;

                    // Remove current block and its DOM row
                    this._activeBlockIdx = null;
                    this._activeTextarea = null;
                    this._docBlocks.splice(blockIdx, 1);
                    rowEl.remove();
                    this.reindexDOMAttributes();

                    void this.queueSaveToDisk();
                    await this.activateBlockEditor(prevIdx, cursorTargetPos);
                    return;
                }
            }

            // ArrowUp at start of line -> Move to previous visible line
            if (e.key === 'ArrowUp' && !block.isCodeBlock) {
                if (document.querySelector('.suggestion-container, .prompt')) return;
                const visibleIndices = this.getVisibleBlockIndices();
                const posInVisible = visibleIndices.indexOf(blockIdx);
                if (posInVisible > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const prevIdx = visibleIndices[posInVisible - 1];
                    const targetOffset = Math.min(textarea.selectionStart ?? 0, this._docBlocks[prevIdx].raw.length);
                    await this.activateBlockEditor(prevIdx, targetOffset);
                    return;
                }
            }

            // ArrowDown at end of line -> Move to next visible line
            if (e.key === 'ArrowDown' && !block.isCodeBlock) {
                if (document.querySelector('.suggestion-container, .prompt')) return;
                const visibleIndices = this.getVisibleBlockIndices();
                const posInVisible = visibleIndices.indexOf(blockIdx);
                if (posInVisible !== -1 && posInVisible < visibleIndices.length - 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextIdx = visibleIndices[posInVisible + 1];
                    const targetOffset = Math.min(textarea.selectionStart ?? 0, this._docBlocks[nextIdx].raw.length);
                    await this.activateBlockEditor(nextIdx, targetOffset);
                    return;
                }
            }
        };

        // Commit on blur (unless focus temporarily moved to an inline trigger suggest modal)
        textarea.onblur = () => {
            setTimeout(() => {
                if (this._activeBlockIdx !== blockIdx || this._activeTextarea !== textarea) return;
                if (document.activeElement === textarea) return;
                // Keep editor alive while FileSuggestModal / ContextSuggestModal / PersonSuggestModal is open
                if (document.querySelector('.prompt, .suggestion-container')) {
                    block.raw = textarea.value;
                    void this.queueSaveToDisk();
                    return;
                }
                void this.commitActiveBlock();
            }, 120);
        };

        requestAnimationFrame(() => {
            autoResize();
            textarea.focus();
            const targetPos = typeof cursorOffset === 'number'
                ? Math.min(Math.max(0, cursorOffset), textarea.value.length)
                : textarea.value.length;
            textarea.setSelectionRange(targetPos, targetPos);
        });
    }

    private async renderBlockRow(rowEl: HTMLElement, blockIdx: number, file: TFile): Promise<void> {
        rowEl.empty();
        const block = this._docBlocks[blockIdx];
        if (!block) return;

        // Clicking anywhere on the row (outside checkboxes & internal links) activates this single line's live editor
        rowEl.onclick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.closest('input[type="checkbox"]') || target.closest('a.internal-link') || target.closest('a.external-link'))) {
                return;
            }
            e.stopPropagation();
            const currentIdx = Number(rowEl.getAttribute('data-block-idx') ?? blockIdx);
            void this.activateBlockEditor(currentIdx);
        };

        if (!block.raw.trim()) {
            rowEl.addClass('is-empty-line');
            rowEl.createDiv({ cls: 'pos-peek-line-blank', text: '\u00A0' });
            return;
        }

        rowEl.removeClass('is-empty-line');
        const renderedLine = rowEl.createDiv({ cls: 'pos-peek-line-rendered' });
        await MarkdownRenderer.render(this.app, block.raw, renderedLine, file.path, this._renderComponent);

        this.wireBlockCheckboxes(renderedLine, rowEl);
        this.wirePreviewInternalLinks(renderedLine, file);
    }

    private wireBlockCheckboxes(container: HTMLElement, rowEl: HTMLElement): void {
        const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        checkboxes.forEach((cb) => {
            cb.disabled = false;
            cb.addClass('pos-interactive-checkbox');

            const listItem = cb.closest('li');
            if (listItem) {
                listItem.toggleClass('is-checked', cb.checked);
                listItem.setAttribute('data-task', cb.checked ? 'x' : ' ');
            }

            cb.onclick = async (e: MouseEvent) => {
                e.stopPropagation();
                const isChecked = cb.checked;
                if (listItem) {
                    listItem.toggleClass('is-checked', isChecked);
                    listItem.setAttribute('data-task', isChecked ? 'x' : ' ');
                }

                const currentIdx = Number(rowEl.getAttribute('data-block-idx') ?? -1);
                const block = this._docBlocks[currentIdx];
                if (block) {
                    block.raw = block.raw.replace(/^(\s*[-*+]\s+\[)(.)(\]\s+)/, `$1${isChecked ? 'x' : ' '}$3`);
                    await this.queueSaveToDisk();
                }
            };
        });
    }

    private wirePreviewInternalLinks(container: HTMLElement, file: TFile): void {
        const links = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
        const todayStr = moment().format('YYYY-MM-DD');
        const yesterdayStr = moment().subtract(1, 'day').format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');

        links.forEach((link) => {
            link.addClass('pos-stream-wikilink');
            const href = link.getAttribute('data-href') || link.textContent || '';
            const dateMatch = href.match(/^(\d{4}-\d{2}-\d{2})$/);

            if (dateMatch) {
                const dateStr = dateMatch[1];
                link.addClass('pos-rendered-date-link');
                const taskLi = link.closest('li.task-list-item, li:has(input[type="checkbox"])');
                if (taskLi) {
                    let relativeLabel = dateStr;
                    if (dateStr === todayStr) relativeLabel = 'Today';
                    else if (dateStr === yesterdayStr) relativeLabel = 'Yesterday';
                    else if (dateStr === tomorrowStr) relativeLabel = 'Tomorrow';

                    const prevText = link.previousSibling?.textContent?.trim() || '';
                    const alreadyHasDue = /(?:due|Due):\s*$/.test(prevText);
                    link.textContent = alreadyHasDue ? relativeLabel : `Due: ${relativeLabel}`;
                }
            }

            link.onclick = async (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!Platform.isMobile) {
                    if (e.metaKey || e.ctrlKey) {
                        await this.commitActiveBlock();
                        if (!this._isWindowView) {
                            this.close();
                        }
                        await this.app.workspace.openLinkText(href, file.path, 'tab');
                        return;
                    }
                    if (e.altKey) {
                        await this.commitActiveBlock();
                        if (!this._isWindowView) {
                            this.close();
                        }
                        await openWikilinkInPeekWindow(this.app, href, file.path);
                        return;
                    }
                }
                await this.navigateToLink(href, file.path);
            };
        });
    }

    private renderUnresolvedState(container: HTMLElement): void {
        container.empty();
        const unresWrap = container.createDiv({ cls: 'pos-peek-unresolved-wrap' });

        const iconEl = unresWrap.createDiv({ cls: 'pos-peek-unresolved-icon' });
        setIcon(iconEl, 'file-plus');

        unresWrap.createEl('h4', {
            cls: 'pos-peek-unresolved-title',
            text: `"${this.cleanLinkName}" does not exist yet`
        });
        unresWrap.createEl('p', {
            cls: 'pos-peek-unresolved-desc',
            text: 'Create this permanent note now to start capturing tasks and logs.'
        });

        const createBtn = unresWrap.createEl('button', {
            cls: 'pos-peek-create-btn'
        });
        const btnIcon = createBtn.createSpan({ cls: 'pos-peek-btn-icon' });
        setIcon(btnIcon, 'plus');
        createBtn.createSpan({ text: 'Create Note' });

        createBtn.onclick = async () => {
            try {
                let targetFolderPath = '';
                const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
                if (sourceFile instanceof TFile && sourceFile.parent) {
                    const parentPath = sourceFile.parent.path;
                    // Avoid placing new permanent notes inside the raw capture inbox folder
                    if (!this._plugin?.index?.isCaptureFile(sourceFile.path)) {
                        targetFolderPath = parentPath;
                    }
                }
                const safeName = sanitizeVaultFilename(this.cleanLinkName);
                const newFilePath = targetFolderPath && targetFolderPath !== '/'
                    ? `${targetFolderPath}/${safeName}.md`
                    : `${safeName}.md`;

                const initialContent = `# ${this.cleanLinkName}\n\n`;
                const created = await this.app.vault.create(newFilePath, initialContent);
                this.targetFile = created;

                if (this._plugin?.index) {
                    this._plugin.index.invalidatePermanentNotesCache();
                    this._plugin.refreshCoordinator?.notifyRefresh('capture');
                }

                this._onTitleChange?.();
                new Notice(`Created note: ${this.cleanLinkName}`);
                await this.renderModalContent();
            } catch (err) {
                console.error('[DIWA WikilinkPeekModal] Failed to create note', err);
                new Notice('Failed to create note. It may already exist.');
            }
        };
    }

    private setupMobileGestures(modalEl: HTMLElement): void {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                startY = e.touches[0].clientY;
                isDragging = true;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
                modalEl.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            if (deltaY > 80) {
                this.close();
            } else {
                modalEl.style.transform = '';
            }
        };

        const dragHandle = modalEl.querySelector('.pos-sheet-drag-handle-wrap');
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
            dragHandle.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
            dragHandle.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
        }
    }

    onClose(): void {
        if (this._activeBlockIdx !== null && this._activeTextarea) {
            const block = this._docBlocks[this._activeBlockIdx];
            if (block) {
                block.raw = this._activeTextarea.value;
                void this.queueSaveToDisk();
            }
            this._activeBlockIdx = null;
            this._activeTextarea = null;
        }
        this._renderComponent.unload();
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class WikilinkPeekView extends ItemView {
    private _plugin: DiwaPlugin;
    private _peek: WikilinkPeekModal;
    private _isOpen: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this._plugin = plugin;
        this._peek = new WikilinkPeekModal(
            this.app,
            this._plugin,
            '',
            '',
            undefined,
            true,
            () => {
                (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
                this.app.workspace.requestSaveLayout();
            }
        );
    }

    getViewType(): string {
        return VIEW_TYPE_WIKILINK_PEEK;
    }

    getDisplayText(): string {
        return this._peek.getDisplayTitle();
    }

    getIcon(): string {
        return 'file-text';
    }

    getState(): Record<string, unknown> {
        return this._peek.getStateData();
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        const s = (state && typeof state === 'object' ? state : {}) as {
            linkText?: string;
            sourcePath?: string;
            history?: PeekHistoryEntry[];
        };
        const linkText = typeof s.linkText === 'string' ? s.linkText : '';
        const sourcePath = typeof s.sourcePath === 'string' ? s.sourcePath : '';
        const history = Array.isArray(s.history) ? s.history : [];

        await this._peek.setStateData(linkText, sourcePath, history);
        await super.setState(state, result);
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('diwa-workspace-root');
        this.contentEl.addClass('pos-wikilink-peek-view');
        this._isOpen = true;
        await this._peek.mountInlineView(this.contentEl);

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (!this._isOpen) return;
                if (file instanceof TFile && file.path === this._peek.getTargetFilePath()) {
                    void this._peek.refreshFromExternalModify();
                }
            })
        );
    }

    async onClose(): Promise<void> {
        this._isOpen = false;
        this._peek.unmountInlineView();
        this.contentEl.empty();
    }
}


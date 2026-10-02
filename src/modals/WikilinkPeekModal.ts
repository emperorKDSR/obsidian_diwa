import { App, Modal, TFile, MarkdownRenderer, Platform, setIcon, Notice, Component } from 'obsidian';
import type DiwaPlugin from '../main';

export class WikilinkPeekModal extends Modal {
    private linkText: string;
    private sourcePath: string;
    private onFilterStream?: (target: string) => void;
    private targetFile: TFile | null = null;
    private cleanLinkName: string;
    private _renderComponent: Component = new Component();

    constructor(
        app: App,
        _plugin: DiwaPlugin,
        linkText: string,
        sourcePath: string,
        onFilterStream?: (target: string) => void
    ) {
        super(app);
        this.linkText = linkText;
        this.sourcePath = sourcePath;
        this.onFilterStream = onFilterStream;

        // Parse link and optional heading/block subpath
        const subIndex = linkText.indexOf('#');
        if (subIndex !== -1) {
            this.cleanLinkName = linkText.substring(0, subIndex);
        } else {
            this.cleanLinkName = linkText;
        }

        this.targetFile = this.app.metadataCache.getFirstLinkpathDest(this.cleanLinkName, this.sourcePath);
    }

    async onOpen(): Promise<void> {
        this._renderComponent.load();
        const { contentEl, modalEl, containerEl } = this;
        contentEl.empty();

        modalEl.addClass('pos-wikilink-peek-modal');
        if (Platform.isMobile) {
            modalEl.addClass('pos-mobile-bottom-sheet');
            containerEl.addClass('pos-bottom-sheet-backdrop');
            this.setupMobileGestures(modalEl);
        }

        // 1. Mobile Drag Handle
        if (Platform.isMobile) {
            const dragWrap = contentEl.createDiv({ cls: 'pos-sheet-drag-handle-wrap' });
            dragWrap.createDiv({ cls: 'pos-sheet-drag-handle' });
        }

        // 2. Header Bar
        const headerEl = contentEl.createDiv({ cls: 'pos-peek-header' });

        const titleInfo = headerEl.createDiv({ cls: 'pos-peek-title-info' });
        if (this.targetFile) {
            const folderPath = this.targetFile.parent?.path || '';
            if (folderPath && folderPath !== '/') {
                titleInfo.createDiv({ cls: 'pos-peek-breadcrumb', text: folderPath });
            }
            titleInfo.createEl('h3', { cls: 'pos-peek-title', text: this.targetFile.basename });
        } else {
            titleInfo.createDiv({ cls: 'pos-peek-breadcrumb', text: 'Unresolved Link' });
            titleInfo.createEl('h3', { cls: 'pos-peek-title', text: this.cleanLinkName });
        }

        const actionsEl = headerEl.createDiv({ cls: 'pos-peek-actions' });

        // Filter Stream button
        if (this.onFilterStream) {
            const filterBtn = actionsEl.createEl('button', {
                cls: 'pos-peek-btn clickable-icon',
                attr: { 'aria-label': 'Filter stream by this note', 'title': 'Filter stream' }
            });
            setIcon(filterBtn, 'search');
            filterBtn.onclick = () => {
                this.close();
                this.onFilterStream?.(this.cleanLinkName);
            };
        }

        // Open in full editor button
        const openFullBtn = actionsEl.createEl('button', {
            cls: 'pos-peek-btn clickable-icon',
            attr: { 'aria-label': 'Open in full editor', 'title': 'Open note' }
        });
        setIcon(openFullBtn, 'external-link');
        openFullBtn.onclick = async () => {
            this.close();
            await this.app.workspace.openLinkText(this.linkText, this.sourcePath, false);
        };

        // Close button
        const closeBtn = actionsEl.createEl('button', {
            cls: 'pos-peek-btn clickable-icon',
            attr: { 'aria-label': 'Close preview', 'title': 'Close' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => this.close();

        // 3. Body View
        const bodyEl = contentEl.createDiv({ cls: 'pos-peek-body' });

        if (this.targetFile) {
            await this.renderFileContent(bodyEl, this.targetFile);
            this.renderQuickAppendBar(contentEl, this.targetFile);
        } else {
            this.renderUnresolvedState(bodyEl);
        }
    }

    private async renderFileContent(container: HTMLElement, file: TFile): Promise<void> {
        container.empty();
        const content = await this.app.vault.read(file);

        // Strip YAML frontmatter for compact preview
        let cleanBody = content;
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
        if (frontmatterMatch) {
            cleanBody = content.slice(frontmatterMatch[0].length);
        }

        if (!cleanBody.trim()) {
            container.createDiv({ cls: 'pos-peek-empty-state', text: 'Note is currently empty.' });
            return;
        }

        const renderedWrap = container.createDiv({ cls: 'pos-peek-markdown markdown-rendered' });
        await MarkdownRenderer.render(this.app, cleanBody, renderedWrap, file.path, this._renderComponent);

        // Wire interactive task checkboxes inside the preview
        this.wirePreviewCheckboxes(renderedWrap, file);
    }

    private wirePreviewCheckboxes(container: HTMLElement, file: TFile): void {
        const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        checkboxes.forEach((cb) => {
            cb.disabled = false;
            cb.addClass('pos-interactive-checkbox');

            cb.onclick = async (e) => {
                e.stopPropagation();
                const isChecked = cb.checked;
                const listItem = cb.closest('li');
                if (listItem) {
                    listItem.toggleClass('is-checked', isChecked);
                    listItem.setAttribute('data-task', isChecked ? 'x' : ' ');
                }

                // Update task directly in target file
                try {
                    const taskText = listItem?.textContent?.trim() || '';
                    await this.app.vault.process(file, (data) => {
                        const lines = data.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            const match = line.match(/^(\s*[-*+]\s+\[)(.)(\]\s+)(.*)$/);
                            if (match) {
                                const lineContent = match[4].trim();
                                if (taskText.includes(lineContent) || lineContent.includes(taskText)) {
                                    lines[i] = `${match[1]}${isChecked ? 'x' : ' '}${match[3]}${match[4]}`;
                                    break;
                                }
                            }
                        }
                        return lines.join('\n');
                    });
                } catch (err) {
                    console.error('[DIWA WikilinkPeekModal] Failed to toggle task in note', err);
                    cb.checked = !isChecked;
                    if (listItem) {
                        listItem.toggleClass('is-checked', !isChecked);
                        listItem.setAttribute('data-task', !isChecked ? 'x' : ' ');
                    }
                    new Notice('Failed to update task state');
                }
            };
        });
    }

    private renderQuickAppendBar(parentEl: HTMLElement, file: TFile): void {
        const footerEl = parentEl.createDiv({ cls: 'pos-peek-footer' });
        const inputWrap = footerEl.createDiv({ cls: 'pos-peek-append-wrap' });

        const input = inputWrap.createEl('input', {
            type: 'text',
            cls: 'pos-peek-append-input',
            placeholder: `⚡ Quick append to ${file.basename}...`
        });

        const sendBtn = inputWrap.createEl('button', {
            cls: 'pos-peek-append-send-btn clickable-icon',
            attr: { 'aria-label': 'Append thought', 'title': 'Send' }
        });
        setIcon(sendBtn, 'corner-down-left');

        const doAppend = async () => {
            const val = input.value.trim();
            if (!val) return;

            const appendLine = val.startsWith('- ') ? val : `- ${val}`;
            try {
                await this.app.vault.process(file, (data) => {
                    const separator = data.length > 0 && !data.endsWith('\n') ? '\n' : '';
                    return `${data}${separator}${appendLine}\n`;
                });
                input.value = '';
                new Notice(`Appended to ${file.basename}`);

                // Refresh preview body
                const bodyEl = parentEl.querySelector<HTMLElement>('.pos-peek-body');
                if (bodyEl) {
                    await this.renderFileContent(bodyEl, file);
                    bodyEl.scrollTop = bodyEl.scrollHeight;
                }
            } catch (err) {
                console.error('[DIWA WikilinkPeekModal] Quick append failed', err);
                new Notice('Failed to append to note');
            }
        };

        sendBtn.onclick = () => void doAppend();
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void doAppend();
            }
        };
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
            text: 'You can create this note now or dismiss this preview.'
        });

        const createBtn = unresWrap.createEl('button', {
            cls: 'pos-peek-create-btn',
            text: '➕ Create Note'
        });

        createBtn.onclick = async () => {
            try {
                // Determine folder path
                let targetFolderPath = '';
                const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
                if (sourceFile instanceof TFile && sourceFile.parent) {
                    targetFolderPath = sourceFile.parent.path;
                }
                const newFilePath = targetFolderPath && targetFolderPath !== '/'
                    ? `${targetFolderPath}/${this.cleanLinkName}.md`
                    : `${this.cleanLinkName}.md`;

                const initialContent = `# ${this.cleanLinkName}\n\n`;
                const created = await this.app.vault.create(newFilePath, initialContent);
                this.targetFile = created;

                new Notice(`Created note: ${this.cleanLinkName}`);

                // Re-render modal in open file state
                await this.onOpen();
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
                // Dragging downwards
                modalEl.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            if (deltaY > 80) {
                // Swipe down threshold met: close sheet
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
        this._renderComponent.unload();
        const { contentEl } = this;
        contentEl.empty();
    }
}

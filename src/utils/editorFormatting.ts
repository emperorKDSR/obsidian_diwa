import { setIcon, Component, MarkdownRenderer, TFile } from 'obsidian';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type DiwaPlugin from '../main';

export type FormattingType = 
    | 'bold' 
    | 'italic' 
    | 'h1' 
    | 'h2' 
    | 'h3' 
    | 'bullet' 
    | 'number' 
    | 'todo' 
    | 'quote' 
    | 'code';

export function insertFormatting(
    textarea: HTMLTextAreaElement, 
    type: FormattingType
): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selectedText = val.slice(start, end);

    let replacement = '';

    if (type === 'bold' || type === 'italic' || type === 'code') {
        const wrapChar = type === 'bold' ? '**' : type === 'italic' ? '*' : '`';
        if (selectedText.startsWith(wrapChar) && selectedText.endsWith(wrapChar)) {
            // Untoggle
            replacement = selectedText.slice(wrapChar.length, selectedText.length - wrapChar.length);
            textarea.value = val.slice(0, start) + replacement + val.slice(end);
            textarea.selectionStart = start;
            textarea.selectionEnd = start + replacement.length;
        } else {
            // Toggle on
            replacement = `${wrapChar}${selectedText}${wrapChar}`;
            textarea.value = val.slice(0, start) + replacement + val.slice(end);
            textarea.selectionStart = start + wrapChar.length;
            textarea.selectionEnd = start + wrapChar.length + selectedText.length;
        }
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // Line-based formatting
    const before = val.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const after = val.slice(end);
    const lineEnd = end + (after.indexOf('\n') !== -1 ? after.indexOf('\n') : after.length);
    const targetLines = val.slice(lineStart, lineEnd).split('\n');

    const prefix = 
        type === 'h1' ? '# ' :
        type === 'h2' ? '## ' :
        type === 'h3' ? '### ' :
        type === 'bullet' ? '- ' :
        type === 'number' ? '1. ' :
        type === 'todo' ? '- [ ] ' :
        type === 'quote' ? '> ' : '';

    const mappedLines = targetLines.map(line => {
        if (line.startsWith(prefix)) {
            // Toggle off
            return line.slice(prefix.length);
        } else {
            // Strip any existing prefix first
            const cleanLine = line.replace(/^(?:#+\s*|-\s+\[\s*[xX ]\s*\]\s*|-\s+|\d+\.\s*|>\s*)/, '');
            return prefix + cleanLine;
        }
    });

    const targetVal = mappedLines.join('\n');
    textarea.value = val.slice(0, lineStart) + targetVal + val.slice(lineEnd);
    
    // Set selection to cover the modified lines
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + targetVal.length;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function attachFormattingShortcuts(textarea: HTMLTextAreaElement): void {
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
        const isMod = e.metaKey || e.ctrlKey;
        if (!isMod) return;

        let type: FormattingType | null = null;
        if (e.key.toLowerCase() === 'b') {
            type = 'bold';
        } else if (e.key.toLowerCase() === 'i') {
            type = 'italic';
        } else if (e.key === '/') {
            type = 'todo';
        }

        if (type) {
            e.preventDefault();
            insertFormatting(textarea, type);
        }
    });
}

export function renderFormattingToolbar(
    parent: HTMLElement, 
    targetTextarea?: HTMLTextAreaElement
): HTMLElement {
    const toolbar = parent.createDiv({ cls: 'diwa-write-toolbar' });

    const tools: { type: FormattingType; icon: string; label: string }[] = [
        { type: 'bold', icon: 'bold', label: 'Bold' },
        { type: 'italic', icon: 'italic', label: 'Italic' },
        { type: 'h1', icon: 'heading-1', label: 'Heading 1' },
        { type: 'h2', icon: 'heading-2', label: 'Heading 2' },
        { type: 'h3', icon: 'heading-3', label: 'Heading 3' },
        { type: 'bullet', icon: 'list', label: 'Bullet List' },
        { type: 'number', icon: 'list-ordered', label: 'Numbered List' },
        { type: 'todo', icon: 'check-square', label: 'Task List' },
        { type: 'quote', icon: 'quote', label: 'Blockquote' },
        { type: 'code', icon: 'code', label: 'Code Block' },
    ];

    tools.forEach((tool) => {
        const btn = toolbar.createEl('button', {
            cls: 'diwa-write-toolbar-btn',
            attr: { 
                type: 'button',
                title: tool.label,
                'aria-label': tool.label
            }
        });
        setIcon(btn, tool.icon);
        
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const textarea = targetTextarea || (document.activeElement as HTMLTextAreaElement);
            if (textarea && textarea instanceof HTMLTextAreaElement) {
                insertFormatting(textarea, tool.type);
            }
        });
    });

    return toolbar;
}

export class MarkdownLineEditor {
    private container: HTMLElement;
    private file: TFile;
    private app: any;
    private component: Component;
    private plugin: DiwaPlugin;
    private onChange: (newVal: string) => void;
    
    private lines: string[] = [];
    private activeIndex: number | null = null;
    private isEditing: boolean = false;
    private cursorOffset: number = 0;

    constructor(
        container: HTMLElement, 
        initialVal: string, 
        file: TFile, 
        app: any, 
        component: Component,
        plugin: DiwaPlugin,
        onChange: (newVal: string) => void
    ) {
        this.container = container;
        this.file = file;
        this.app = app;
        this.component = component;
        this.plugin = plugin;
        this.onChange = onChange;
        
        this.setVal(initialVal);

        // Focus transition click handler
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                const lastIdx = this.lines.length - 1;
                if (this.activeIndex !== lastIdx) {
                    this.activeIndex = lastIdx;
                    this.cursorOffset = this.lines[lastIdx].length;
                    this.render();
                }
            }
        });
    }

    public setVal(val: string): void {
        this.lines = val.split('\n');
        if (this.lines.length === 0) {
            this.lines = [''];
        }
    }

    public getVal(): string {
        return this.lines.join('\n');
    }

    public render(): void {
        const savedScrollTop = this.container.scrollTop;
        this.container.empty();
        const fontSize = 12;
        
        let lastNonEmptyIdx = -1;
        for (let i = this.lines.length - 1; i >= 0; i--) {
            if (this.lines[i].trim() !== '') {
                lastNonEmptyIdx = i;
                break;
            }
        }
        const renderLength = Math.max(this.lines.length, lastNonEmptyIdx + 1 + 15);

        const displayLines: string[] = [];
        for (let i = 0; i < renderLength; i++) {
            displayLines.push(this.lines[i] || '');
        }

        displayLines.forEach((lineText, idx) => {
            const isEmpty = lineText.trim() === '';
            const isSelected = idx === this.activeIndex && !this.isEditing && !isEmpty;
            
            const lineWrap = this.container.createDiv({
                cls: 'diwa-editor-line-wrap' + (isSelected ? ' is-selected' : ''),
                attr: {
                    style: 'display: flex; flex-direction: column; min-height: auto; margin-bottom: 1px; cursor: text; position: relative; outline: none;'
                }
            });

            const shouldEdit = idx === this.activeIndex && (this.isEditing || isEmpty);

            if (shouldEdit) {
                const textarea = lineWrap.createEl('textarea', {
                    cls: 'diwa-editor-line-textarea',
                    attr: {
                        rows: '1',
                        style: `width: 100%; border: none; outline: none; background: transparent; padding: 0; margin: 0; font-family: Calibri, sans-serif; font-size: ${fontSize}px; line-height: 1.3; color: var(--text-normal); resize: none; overflow: hidden; height: auto; min-height: 1.3em;`
                    }
                }) as HTMLTextAreaElement;

                textarea.value = lineText;
                
                const autoGrow = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = `${textarea.scrollHeight}px`;
                };
                autoGrow();

                textarea.focus({ preventScroll: true });
                textarea.setSelectionRange(this.cursorOffset, this.cursorOffset);

                textarea.addEventListener('input', () => {
                    while (this.lines.length <= idx) {
                        this.lines.push('');
                    }
                    this.lines[idx] = textarea.value;
                    autoGrow();
                    this.onChange(this.getVal());
                });

                textarea.addEventListener('blur', () => {
                    setTimeout(() => {
                        // Skip blur swap if a suggest/file picker modal is currently open in the DOM
                        if (document.querySelector('.modal-container') || document.querySelector('.suggestion-container')) {
                            return;
                        }
                        if (document.activeElement !== textarea) {
                            if (this.activeIndex === idx) {
                                this.activeIndex = null;
                                this.isEditing = false;
                                this.render();
                            }
                        }
                    }, 150);
                });

                // Attach triggers
                attachInlineTriggers(
                    this.app,
                    textarea,
                    () => {},
                    (tag) => {
                        const cur = textarea.value;
                        const curPos = textarea.selectionStart;
                        const tagText = `#${tag} `;
                        textarea.value = cur.substring(0, curPos) + tagText + cur.substring(curPos);
                        textarea.setSelectionRange(curPos + tagText.length, curPos + tagText.length);
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    },
                    () => this.plugin.getContexts(),
                    this.plugin.settings.peopleFolder
                );
                attachMediaPasteHandler(
                    this.app,
                    textarea,
                    () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
                );
                attachFormattingShortcuts(textarea);

                // paste handler for line splits
                textarea.addEventListener('paste', (e: ClipboardEvent) => {
                    const pastedData = e.clipboardData?.getData('text') || '';
                    if (pastedData.includes('\n')) {
                        e.preventDefault();
                        const start = textarea.selectionStart;
                        const val = textarea.value;
                        const beforePaste = val.slice(0, start);
                        const afterPaste = val.slice(textarea.selectionEnd);

                        const pastedLines = pastedData.split('\n');
                        const firstLine = beforePaste + pastedLines[0];
                        const lastLine = pastedLines[pastedLines.length - 1] + afterPaste;

                        this.lines[idx] = firstLine;
                        for (let i = 1; i < pastedLines.length - 1; i++) {
                            this.lines.splice(idx + i, 0, pastedLines[i]);
                        }
                        this.lines.splice(idx + pastedLines.length - 1, 0, lastLine);

                        this.activeIndex = idx + pastedLines.length - 1;
                        this.cursorOffset = pastedLines[pastedLines.length - 1].length;
                        this.onChange(this.getVal());
                        this.render();
                    }
                });

                // navigation keys
                textarea.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        this.isEditing = false;
                        this.render();
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const start = textarea.selectionStart;
                        const val = textarea.value;
                        const firstHalf = val.slice(0, start);
                        const secondHalf = val.slice(start);

                        // Analyze firstHalf for outline prefixes
                        const todoMatch = firstHalf.match(/^(\s*)-\s+\[\s*[xX ]\s*\]\s*(.*)$/);
                        const bulletMatch = firstHalf.match(/^(\s*)([-*+])\s+(.*)$/);
                        const numberMatch = firstHalf.match(/^(\s*)(\d+)\.\s+(.*)$/);
                        const quoteMatch = firstHalf.match(/^(\s*)>\s*(.*)$/);

                        let nextPrefix = '';

                        if (todoMatch) {
                            const content = todoMatch[2];
                            if (content.trim() === '' && secondHalf.trim() === '') {
                                this.lines[idx] = '';
                                this.onChange(this.getVal());
                                this.render();
                                return;
                            } else {
                                nextPrefix = `${todoMatch[1]}- [ ] `;
                            }
                        } else if (bulletMatch) {
                            const content = bulletMatch[3];
                            if (content.trim() === '' && secondHalf.trim() === '') {
                                this.lines[idx] = '';
                                this.onChange(this.getVal());
                                this.render();
                                return;
                            } else {
                                nextPrefix = `${bulletMatch[1]}${bulletMatch[2]} `;
                            }
                        } else if (numberMatch) {
                            const content = numberMatch[3];
                            if (content.trim() === '' && secondHalf.trim() === '') {
                                this.lines[idx] = '';
                                this.onChange(this.getVal());
                                this.render();
                                return;
                            } else {
                                const nextNum = parseInt(numberMatch[2], 10) + 1;
                                nextPrefix = `${numberMatch[1]}${nextNum}. `;
                            }
                        } else if (quoteMatch) {
                            const content = quoteMatch[2];
                            if (content.trim() === '' && secondHalf.trim() === '') {
                                this.lines[idx] = '';
                                this.onChange(this.getVal());
                                this.render();
                                return;
                            } else {
                                nextPrefix = `${quoteMatch[1]}> `;
                            }
                        }

                        this.lines[idx] = firstHalf;
                        this.lines.splice(idx + 1, 0, nextPrefix + secondHalf);
                        this.activeIndex = idx + 1;
                        this.cursorOffset = nextPrefix.length;
                        this.isEditing = true;
                        this.onChange(this.getVal());
                        this.render();
                    } else if (e.key === 'Backspace' && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
                        if (idx > 0) {
                            e.preventDefault();
                            const prevLine = this.lines[idx - 1];
                            const currentLine = textarea.value;
                            this.lines[idx - 1] = prevLine + currentLine;
                            this.lines.splice(idx, 1);
                            this.activeIndex = idx - 1;
                            this.cursorOffset = prevLine.length;
                            this.isEditing = true;
                            this.onChange(this.getVal());
                            this.render();
                        }
                    } else if (e.key === 'ArrowUp') {
                        if (idx > 0) {
                            e.preventDefault();
                            this.activeIndex = idx - 1;
                            const prevLineEmpty = (this.lines[idx - 1] || '').trim() === '';
                            this.isEditing = prevLineEmpty;
                            this.cursorOffset = Math.min(this.cursorOffset, (this.lines[idx - 1] || '').length);
                            this.render();
                        }
                    } else if (e.key === 'ArrowDown') {
                        if (idx < renderLength - 1) {
                            e.preventDefault();
                            while (this.lines.length <= idx + 1) {
                                this.lines.push('');
                            }
                            this.activeIndex = idx + 1;
                            const nextLineEmpty = (this.lines[idx + 1] || '').trim() === '';
                            this.isEditing = nextLineEmpty;
                            this.cursorOffset = Math.min(this.cursorOffset, (this.lines[idx + 1] || '').length);
                            this.render();
                        }
                    }
                });
            } else {
                const markdownEl = lineWrap.createDiv({
                    cls: 'diwa-editor-line-markdown',
                    attr: {
                        style: `width: 100%; min-height: auto; font-family: Calibri, sans-serif; font-size: ${fontSize}px; line-height: 1.3; color: var(--text-normal);`
                    }
                });

                if (lineText.trim() === '') {
                    markdownEl.innerHTML = '&nbsp;';
                } else {
                    MarkdownRenderer.renderMarkdown(lineText, markdownEl, this.file.path, this.component);
                }

                // Bind checkbox toggles
                const checkboxes = markdownEl.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach((value: Element) => {
                    const cb = value as HTMLInputElement;
                    cb.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const oldText = this.lines[idx];
                        let newText = oldText;
                        const isChecked = /^(\s*)-\s+\[[xX]\]/.test(oldText);
                        if (isChecked) {
                            newText = oldText.replace(/^(\s*)-\s+\[[xX]\]/, '$1- [ ]');
                        } else {
                            newText = oldText.replace(/^(\s*)-\s+\[\s*\]/, '$1- [x]');
                        }
                        this.lines[idx] = newText;
                        this.onChange(this.getVal());
                        this.render();
                    });
                });

                // If isSelected, make focusable and listen to navigation/enter keys
                if (idx === this.activeIndex) {
                    lineWrap.tabIndex = 0;
                    lineWrap.focus({ preventScroll: true });

                    lineWrap.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.isEditing = true;
                            this.cursorOffset = lineText.length;
                            this.render();
                        } else if (e.key === 'ArrowUp') {
                            if (idx > 0) {
                                e.preventDefault();
                                this.activeIndex = idx - 1;
                                const prevLineEmpty = (this.lines[idx - 1] || '').trim() === '';
                                this.isEditing = prevLineEmpty;
                                this.cursorOffset = (this.lines[idx - 1] || '').length;
                                this.render();
                            }
                        } else if (e.key === 'ArrowDown') {
                            if (idx < renderLength - 1) {
                                e.preventDefault();
                                while (this.lines.length <= idx + 1) {
                                    this.lines.push('');
                                }
                                this.activeIndex = idx + 1;
                                const nextLineEmpty = (this.lines[idx + 1] || '').trim() === '';
                                this.isEditing = nextLineEmpty;
                                this.cursorOffset = (this.lines[idx + 1] || '').length;
                                this.render();
                            }
                        }
                    });
                }

                lineWrap.addEventListener('click', (e) => {
                    if (this.activeIndex === idx) {
                        return; // Ignore if already selected
                    }
                    while (this.lines.length <= idx) {
                        this.lines.push('');
                    }
                    this.activeIndex = idx;
                    this.isEditing = isEmpty; // Edit immediately if empty, else just select
                    this.cursorOffset = lineText.length;
                    this.render();
                });

                lineWrap.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    while (this.lines.length <= idx) {
                        this.lines.push('');
                    }
                    this.activeIndex = idx;
                    this.isEditing = true;
                    this.cursorOffset = lineText.length;
                    this.render();
                });
            }
        });

        this.container.scrollTop = savedScrollTop;
    }
}

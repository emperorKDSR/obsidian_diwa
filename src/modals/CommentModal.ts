import { App, Modal, Platform, Notice, moment, MarkdownRenderer } from 'obsidian';
import DiwaPlugin from '../main';
import { parseNaturalDate, isTablet, insertFilesAtCursor } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';
import { ContextSuggestModal } from './ContextSuggestModal';

export class CommentModal extends Modal {
    plugin: DiwaPlugin;
    parentId: string;
    parentText: string;
    onSave: (text: string) => Promise<void>;

    constructor(app: App, plugin: DiwaPlugin, parentId: string, parentText: string, onSave: (text: string) => Promise<void>) {
        super(app);
        this.plugin = plugin;
        this.parentId = parentId;
        this.parentText = parentText;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('diwa-modern-modal');

        // Style the modal wrapper
        modalEl.style.padding = '0';
        modalEl.style.borderRadius = '16px';
        modalEl.style.overflow = 'hidden';
        modalEl.style.border = '1px solid var(--background-modifier-border)';
        modalEl.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
        modalEl.style.maxWidth = '600px';

        if (Platform.isMobile) {
            const modalW = isTablet() ? '80vw' : '100vw';
            modalEl.style.width = modalW;
            modalEl.style.maxWidth = modalW;
            modalEl.style.height = '100vh';
            modalEl.style.borderRadius = '0';
        }

        // 1. Sleek Header
        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 12px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });
        header.createEl('h3', { text: 'Add Comment', attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 700;' } });
        
        const closeBtn = header.createEl('button', { text: '×', attr: { style: 'background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--text-muted); line-height: 1;' } });
        closeBtn.addEventListener('click', () => this.close());

        // 2. Parent Preview
        const parentArea = contentEl.createEl('div', { 
            attr: { style: 'padding: 14px 20px; background: var(--background-primary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); font-size: 0.85em; color: var(--text-muted); line-height: 1.4; max-height: 100px; overflow-y: auto;' } 
        });
        parentArea.createSpan({ text: 'Replying to: ', attr: { style: 'font-weight: 800; color: var(--interactive-accent); text-transform: uppercase; font-size: 0.75em; letter-spacing: 0.05em;' } });
        parentArea.createSpan({ text: this.parentText });

        // 3. Text Area
        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px;' } });
        const textArea = body.createEl('textarea', {
            attr: { 
                placeholder: 'Write your comment...',
                style: 'width: 100%; min-height: 150px; font-size: 1.05em; line-height: 1.6; font-family: var(--font-text); border: none; background: transparent; color: var(--text-normal); resize: none; outline: none; padding: 0;' 
            }
        });
        textArea.focus();

        let lastValue = '';
        textArea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            const val = target.value;
            const pos = target.selectionStart;
            const textBeforeCursor = val.substring(0, pos);

            // Natural Language Date conversion: @date
            const dateMatch = textBeforeCursor.match(/@([^@\n\s]+(?: [^@\n\s]+)*)([\s\n])$/);
            if (dateMatch) {
                const rawDate = dateMatch[1];
                const terminator = dateMatch[2];
                const parsed = parseNaturalDate(rawDate);
                if (parsed) {
                    const matchStart = dateMatch.index!;
                    const before = val.substring(0, matchStart);
                    const after = val.substring(pos);
                    const insertText = `[[${parsed}]]${terminator}`;
                    target.value = before + insertText + after;
                    const newPos = matchStart + insertText.length;
                    target.setSelectionRange(newPos, newPos);
                    lastValue = target.value;
                    return;
                }
            }

            // File/Context Suggestions
            if (val.length > lastValue.length) {
                const cursorPosition = target.selectionStart;
                if (cursorPosition >= 2 && val.substring(cursorPosition - 2, cursorPosition) === '[[') {
                    new FileSuggestModal(this.app, (file) => {
                        const before = val.substring(0, cursorPosition - 2);
                        const after = val.substring(cursorPosition);
                        const insertText = `[[${file.basename}]]`;
                        target.value = before + insertText + after;
                        setTimeout(() => { target.focus(); target.setSelectionRange(before.length + insertText.length, before.length + insertText.length); }, 50);
                    }, this.plugin.settings.newNoteFolder).open();
                } else if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '#') {
                    new ContextSuggestModal(this.app, this.plugin.settings.contexts, async (ctx) => {
                        const before = val.substring(0, cursorPosition - 1);
                        const after = val.substring(cursorPosition);
                        const insertText = `#${ctx} `;
                        target.value = before + insertText + after;
                        setTimeout(() => { target.focus(); target.setSelectionRange(before.length + insertText.length, before.length + insertText.length); }, 50);
                    }).open();
                }
            }
            lastValue = val;
        });

        // 4. Action Row (Attach)
        const actionRow = body.createEl('div', { attr: { style: 'margin-top: 12px; display: flex; gap: 8px;' } });
        const attachBtn = actionRow.createEl('button', { 
            attr: { style: 'background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; color: var(--text-muted); padding: 6px 12px; cursor: pointer; font-size: 0.8em; display: flex; align-items: center; gap: 6px;' } 
        });
        attachBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg> Attach';
        
        const fileInput = body.createEl('input', { attr: { type: 'file', multiple: '', style: 'display:none;', accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*' } }) as HTMLInputElement;
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            await insertFilesAtCursor(
                this.app,
                textArea,
                Array.from(fileInput.files),
                () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
            );
            fileInput.value = '';
        });
        attachBtn.addEventListener('click', () => fileInput.click());

        // 5. Footer
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end; gap: 12px;' }
        });

        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'background: transparent; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer;' } });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', { 
            text: 'Post Comment', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 24px; border-radius: 8px; font-weight: 700; cursor: pointer;' } 
        });

        const handleSave = async () => {
            const text = textArea.value.trim();
            if (!text) { return; }
            saveBtn.disabled = true;
            saveBtn.setText('Saving...');
            await this.onSave(text);
            this.close();
        };

        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); handleSave(); } });
    }

    onClose() { this.contentEl.empty(); }
}


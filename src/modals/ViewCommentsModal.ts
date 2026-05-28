import { App, Modal, TFile, Notice, MarkdownRenderer, setIcon, moment } from 'obsidian';
import DiwaPlugin from '../main';
import { TaskEntry, ReplyEntry } from '../types';
import { ICON_EDIT, ICON_TRASH } from '../constants';
import { EditEntryModal } from './EditEntryModal';
import { ConfirmModal } from './ConfirmModal';

export class ViewCommentsModal extends Modal {
    plugin: DiwaPlugin;
    entry: TaskEntry;
    onRefresh: () => void;

    constructor(app: App, plugin: DiwaPlugin, entry: TaskEntry, onRefresh: () => void) {
        super(app);
        this.plugin = plugin;
        this.entry = entry;
        this.onRefresh = onRefresh;
    }

    onOpen() {
        this.render();
    }

    async render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('diwa-view-comments-modal');

        const header = contentEl.createEl('div', { attr: { style: 'margin-bottom: 20px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px;' } });
        header.createEl('h2', { text: 'Comments', attr: { style: 'margin: 0; font-size: 1.2em;' } });
        header.createEl('p', { text: this.entry.title, attr: { style: 'margin: 5px 0 0 0; font-size: 0.8em; color: var(--text-muted);' } });

        const commentsList = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;' } });

        if (!this.entry.children || this.entry.children.length === 0) {
            commentsList.createEl('p', { text: 'No comments yet.', attr: { style: 'text-align: center; color: var(--text-muted); opacity: 0.5;' } });
        } else {
            for (const reply of this.entry.children) {
                const row = commentsList.createEl('div', { attr: { style: 'background: var(--background-secondary-alt); border-radius: 8px; padding: 12px; border: 1px solid var(--background-modifier-border-faint); position: relative;' } });
                
                const meta = row.createEl('div', { attr: { style: 'font-size: 0.65em; color: var(--text-muted); margin-bottom: 8px; display: flex; justify-content: space-between;' } });
                meta.createSpan({ text: `${reply.date} ${reply.time}` });

                const actions = meta.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
                
                const editBtn = actions.createEl('button', { attr: { style: 'background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-muted);' } });
                setIcon(editBtn, 'pencil');
                editBtn.addEventListener('click', () => {
                    new EditEntryModal(this.app, this.plugin, reply.text, '', null, false, async (newText) => {
                        const updated = await this.plugin.vault.updateComment(this.entry.filePath, reply.anchor, newText);
                        if (updated) {
                            await this.refresh();
                        }
                    }).open();
                });

                const deleteBtn = actions.createEl('button', { attr: { style: 'background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-muted);' } });
                setIcon(deleteBtn, 'trash');
                deleteBtn.addEventListener('click', () => {
                    new ConfirmModal(this.app, 'Delete this comment?', async () => {
                        const deleted = await this.plugin.vault.deleteComment(this.entry.filePath, reply.anchor);
                        if (deleted) {
                            await this.refresh();
                        }
                    }).open();
                });

                const body = row.createEl('div', { attr: { style: 'font-size: 0.9em; line-height: 1.4;' } });
                await MarkdownRenderer.render(this.app, reply.text, body, this.entry.filePath, this as any);
            }
        }

        const footer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end;' } });
        const closeBtn = footer.createEl('button', { text: 'Close', attr: { style: 'background: var(--background-secondary); border: 1px solid var(--background-modifier-border); padding: 6px 16px; border-radius: 6px; cursor: pointer;' } });
        closeBtn.addEventListener('click', () => this.close());
    }

    async refresh() {
        const file = this.app.vault.getAbstractFileByPath(this.entry.filePath);
        if (file instanceof TFile) {
            await this.plugin.index.indexTaskFile(file);
            const updated = this.plugin.index.taskIndex.get(file.path);
            if (updated) this.entry = updated;
            this.render();
            this.onRefresh();
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}


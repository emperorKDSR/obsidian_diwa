import { App, Modal, setIcon } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
    private noteTitle: string;
    private onConfirm: () => void | Promise<void>;

    constructor(app: App, noteTitle: string, onConfirm: () => void | Promise<void>) {
        super(app);
        this.noteTitle = noteTitle;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        this.modalEl.addClass('pos-confirm-delete-modal');
        const { contentEl } = this;
        contentEl.empty();

        const iconWrap = contentEl.createDiv({ cls: 'pos-confirm-delete-icon-wrap' });
        setIcon(iconWrap, 'trash');

        contentEl.createEl('h3', {
            cls: 'pos-confirm-delete-title',
            text: 'Move note to trash?'
        });

        const snippet = this.noteTitle.trim();
        const displaySnippet = snippet.length > 80 ? snippet.substring(0, 80) + '...' : snippet;
        contentEl.createEl('p', {
            cls: 'pos-confirm-delete-desc',
            text: displaySnippet ? `"${displaySnippet}" will be moved to trash.` : 'This note will be moved to trash.'
        });

        const btnRow = contentEl.createDiv({ cls: 'pos-confirm-delete-btn-row' });

        const cancelBtn = btnRow.createEl('button', {
            cls: 'pos-confirm-btn pos-confirm-btn-cancel',
            text: 'Cancel'
        });
        cancelBtn.onclick = () => this.close();

        const deleteBtn = btnRow.createEl('button', {
            cls: 'pos-confirm-btn pos-confirm-btn-delete mod-warning',
            text: 'Move to Trash'
        });
        deleteBtn.onclick = async () => {
            this.close();
            try {
                await this.onConfirm();
            } catch (err) {
                console.error('[DIWA] Delete error', err);
            }
        };

        // Default focus on delete button for quick keyboard navigation
        setTimeout(() => deleteBtn.focus(), 30);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

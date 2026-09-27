import { Modal, App, TFile, Notice } from 'obsidian';

export class RenameNoteModal extends Modal {
    private file: TFile;
    private currentName: string;
    private onRenameComplete: (newFile: TFile) => void;

    constructor(app: App, file: TFile, onRenameComplete: (newFile: TFile) => void) {
        super(app);
        this.file = file;
        this.currentName = file.basename; // filename without extension
        this.onRenameComplete = onRenameComplete;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h3', { text: 'Rename Active Note' });

        const inputContainer = contentEl.createDiv({
            attr: { style: 'margin: 16px 0;' }
        });
        
        const input = inputContainer.createEl('input', {
            type: 'text',
            value: this.currentName,
            attr: {
                style: 'width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: Calibri, sans-serif; font-size: 13px;'
            }
        });
        
        input.select();
        input.focus();

        const errorEl = contentEl.createDiv({
            attr: {
                style: 'color: var(--text-error); font-size: 12px; margin-bottom: 12px; display: none;'
            }
        });

        const btnRow = contentEl.createDiv({
            attr: {
                style: 'display: flex; gap: 12px; justify-content: flex-end;'
            }
        });

        const cancelBtn = btnRow.createEl('button', {
            text: 'Cancel',
            cls: 'mod-cancel'
        });
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
        });

        const renameBtn = btnRow.createEl('button', {
            text: 'Rename',
            cls: 'mod-cta'
        });

        const doRename = async () => {
            const newName = input.value.trim();
            if (!newName) {
                errorEl.textContent = 'Filename cannot be empty.';
                errorEl.style.display = 'block';
                return;
            }
            if (newName === this.currentName) {
                this.close();
                return;
            }

            // Construct new path in same directory
            const parentPath = this.file.parent ? this.file.parent.path : '';
            const newPath = parentPath && parentPath !== '/' ? `${parentPath}/${newName}.md` : `${newName}.md`;

            // Check if path already exists
            const existingFile = this.app.vault.getAbstractFileByPath(newPath);
            if (existingFile) {
                errorEl.textContent = 'A file with this name already exists. Please choose a different name.';
                errorEl.style.display = 'block';
                return;
            }

            renameBtn.disabled = true;
            renameBtn.textContent = 'Renaming...';

            try {
                // Rename file via Obsidian fileManager to preserve/update links
                await this.app.fileManager.renameFile(this.file, newPath);
                new Notice('Note renamed successfully!');
                this.onRenameComplete(this.file);
                this.close();
            } catch (err) {
                console.error('[DIWA] Rename failed:', err);
                errorEl.textContent = 'Failed to rename file. Check for special characters.';
                errorEl.style.display = 'block';
                renameBtn.disabled = false;
                renameBtn.textContent = 'Rename';
            }
        };

        renameBtn.addEventListener('click', (e) => {
            e.preventDefault();
            doRename();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doRename();
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

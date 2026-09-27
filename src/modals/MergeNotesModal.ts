import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import { CaptureEntry } from '../types';

export class MergeNotesModal extends Modal {
    private plugin: DiwaPlugin;
    private entries: CaptureEntry[];
    private onMerged: () => void;

    private mode: 'new' | 'append' = 'new';
    private newTitle: string = '';
    private targetFilePath: string = '';
    private trashSources: boolean = true;

    constructor(app: App, plugin: DiwaPlugin, entries: CaptureEntry[], onMerged: () => void) {
        super(app);
        this.plugin = plugin;
        this.entries = entries;
        this.onMerged = onMerged;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('diwa-merge-modal');

        contentEl.createEl('h2', { text: `Merge ${this.entries.length} Notes` });

        // Notes summary
        const summaryContainer = contentEl.createDiv({ cls: 'diwa-merge-summary' });
        for (const entry of this.entries.slice(0, 5)) {
            const preview = entry.body.slice(0, 80).replace(/\n/g, ' ') + (entry.body.length > 80 ? '...' : '');
            summaryContainer.createDiv({
                cls: 'diwa-merge-summary-item',
                text: `• ${preview || '(Empty note)'}`
            });
        }
        if (this.entries.length > 5) {
            summaryContainer.createDiv({
                cls: 'diwa-merge-summary-more',
                text: `+ ${this.entries.length - 5} more notes...`
            });
        }

        // Mode selection
        new Setting(contentEl)
            .setName('Destination')
            .setDesc('Choose where to merge these notes')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('new', 'Create a new note')
                    .addOption('append', 'Append to existing note')
                    .setValue(this.mode)
                    .onChange(val => {
                        this.mode = val as 'new' | 'append';
                        this.refreshModeSettings(detailsContainer);
                    });
            });

        const detailsContainer = contentEl.createDiv({ cls: 'diwa-merge-details' });
        this.refreshModeSettings(detailsContainer);

        // Trash option
        new Setting(contentEl)
            .setName('Trash original notes')
            .setDesc('Move original scratchpad notes to trash after merging')
            .addToggle(toggle => {
                toggle.setValue(this.trashSources).onChange(val => {
                    this.trashSources = val;
                });
            });

        // Actions
        const actionsEl = contentEl.createDiv({ cls: 'modal-button-container diwa-modal-actions' });
        const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();

        const mergeBtn = actionsEl.createEl('button', {
            text: 'Merge Notes',
            cls: 'mod-cta'
        });
        mergeBtn.onclick = async () => {
            mergeBtn.disabled = true;
            try {
                const sourcePaths = this.entries.map(e => e.filePath);
                if (this.mode === 'new') {
                    await this.plugin.capture.mergeNotes(
                        sourcePaths,
                        undefined,
                        this.newTitle || undefined,
                        this.trashSources
                    );
                } else {
                    if (!this.targetFilePath) {
                        new Notice('Please select a target file');
                        mergeBtn.disabled = false;
                        return;
                    }
                    await this.plugin.capture.mergeNotes(
                        sourcePaths,
                        this.targetFilePath,
                        undefined,
                        this.trashSources
                    );
                }
                new Notice(`Successfully merged ${this.entries.length} notes`);
                this.onMerged();
                this.close();
            } catch (err) {
                console.error('[DIWA MergeNotesModal] Error merging notes', err);
                new Notice(`Error merging notes: ${err instanceof Error ? err.message : String(err)}`);
                mergeBtn.disabled = false;
            }
        };
    }

    private refreshModeSettings(container: HTMLElement): void {
        container.empty();
        if (this.mode === 'new') {
            new Setting(container)
                .setName('Note Title')
                .setDesc('Title for the new merged note')
                .addText(text => {
                    text.setPlaceholder('Enter note title')
                        .setValue(this.newTitle)
                        .onChange(val => {
                            this.newTitle = val;
                        });
                });
        } else {
            new Setting(container)
                .setName('Target File Path')
                .setDesc('Path to the file to append to')
                .addText(text => {
                    text.setPlaceholder('e.g. Projects/My Project.md')
                        .setValue(this.targetFilePath)
                        .onChange(val => {
                            this.targetFilePath = val;
                        });
                });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

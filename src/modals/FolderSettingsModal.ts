import { App, Modal, Setting, Notice } from 'obsidian';
import DiwaPlugin from '../main';

export class FolderSettingsModal extends Modal {
    plugin: DiwaPlugin;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
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
        modalEl.style.maxWidth = '500px';

        // 1. Sleek Header
        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });
        header.createEl('h3', { text: 'Folder Configuration', attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 700;' } });
        
        const closeBtn = header.createEl('button', { text: '×', attr: { style: 'background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--text-muted); line-height: 1;' } });
        closeBtn.addEventListener('click', () => this.close());

        // 2. Settings Area
        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 70vh;' } });

        new Setting(body)
            .setName('Gawa Folder')
            .setDesc('Where gawa files are stored.')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA Gawa')
                .setValue(this.plugin.settings.tasksFolder)
                .onChange(async (value) => {
                    this.plugin.settings.tasksFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('Thoughts Folder')
            .setDesc('Where thought files are stored.')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA')
                .setValue(this.plugin.settings.thoughtsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.thoughtsFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('Bulsa Folder')
            .setDesc('Scanned for Bulsa recurring payment notes.')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA PF')
                .setValue(this.plugin.settings.pfFolder)
                .onChange(async (value) => {
                    this.plugin.settings.pfFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('New Note Folder')
            .setDesc('Where notes created via [[ links are saved.')
            .addText(text => text
                .setPlaceholder('000 Bin')
                .setValue(this.plugin.settings.newNoteFolder)
                .onChange(async (value) => {
                    this.plugin.settings.newNoteFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('Voice Memo Folder')
            .setDesc('Where recorded voice notes are stored.')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA Voice')
                .setValue(this.plugin.settings.voiceMemoFolder)
                .onChange(async (value) => {
                    this.plugin.settings.voiceMemoFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('AI Chat Folder')
            .setDesc('Where AI chat sessions are saved.')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA AI Chat')
                .setValue(this.plugin.settings.aiChatFolder)
                .onChange(async (value) => {
                    this.plugin.settings.aiChatFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(body)
            .setName('Reviews Folder')
            .setDesc('Root folder for Weekly and Monthly review files (sub-folders created automatically).')
            .addText(text => text
                .setPlaceholder('000 Bin/DIWA Reviews')
                .setValue(this.plugin.settings.reviewsFolder ?? '000 Bin/DIWA Reviews')
                .onChange(async (value) => {
                    this.plugin.settings.reviewsFolder = value;
                    await this.plugin.saveSettings();
                }));

        // 3. Footer
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end;' }
        });

        const doneBtn = footer.createEl('button', { 
            text: 'Done', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 24px; border-radius: 8px; font-weight: 700; cursor: pointer;' } 
        });
        doneBtn.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

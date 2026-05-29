import { App, Modal, Setting } from 'obsidian';
import DiwaPlugin from '../main';
import { bindDeferredTextSetting } from '../settings';

export class FolderSettingsModal extends Modal {
    plugin: DiwaPlugin;
    private pendingSettingFlushers: Array<() => Promise<void>> = [];
    private pendingFlushPromise: Promise<void> | null = null;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        this.pendingSettingFlushers = [];
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
        closeBtn.addEventListener('click', () => {
            void this.closeAfterSaving();
        });

        // 2. Settings Area
        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 70vh;' } });

        new Setting(body)
            .setName('Gawa Folder')
            .setDesc('Where gawa files are stored.')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA Gawa');
                this.pendingSettingFlushers.push(bindDeferredTextSetting(text, this.plugin.settings.tasksFolder, async (value) => {
                    await this.plugin.updateSetting('tasksFolder', value);
                }));
            });

        new Setting(body)
            .setName('Thoughts Folder')
            .setDesc('Where thought files are stored.')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA');
                this.pendingSettingFlushers.push(bindDeferredTextSetting(text, this.plugin.settings.thoughtsFolder, async (value) => {
                    await this.plugin.updateSetting('thoughtsFolder', value);
                }));
            });

        new Setting(body)
            .setName('Bulsa Folder')
            .setDesc('Scanned for Bulsa recurring payment notes.')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA PF');
                this.pendingSettingFlushers.push(bindDeferredTextSetting(text, this.plugin.settings.pfFolder, async (value) => {
                    await this.plugin.updateSetting('pfFolder', value);
                }));
            });

        new Setting(body)
            .setName('New Note Folder')
            .setDesc('Where notes created via [[ links are saved.')
            .addText(text => {
                text.setPlaceholder('000 Bin');
                this.pendingSettingFlushers.push(bindDeferredTextSetting(text, this.plugin.settings.newNoteFolder, async (value) => {
                    await this.plugin.updateSetting('newNoteFolder', value);
                }));
            });

        new Setting(body)
            .setName('Reviews Folder')
            .setDesc('Root folder for Weekly and Monthly review files (sub-folders created automatically).')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA Reviews');
                this.pendingSettingFlushers.push(bindDeferredTextSetting(text, this.plugin.settings.reviewsFolder ?? '000 Bin/DIWA Reviews', async (value) => {
                    await this.plugin.updateSetting('reviewsFolder', value);
                }));
            });

        // 3. Footer
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end;' }
        });

        const doneBtn = footer.createEl('button', { 
            text: 'Done', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 24px; border-radius: 8px; font-weight: 700; cursor: pointer;' } 
        });
        doneBtn.addEventListener('click', () => {
            void this.closeAfterSaving();
        });
    }

    onClose() {
        void this.flushPendingSettings();
        this.contentEl.empty();
    }

    private flushPendingSettings(): Promise<void> {
        if (this.pendingFlushPromise) return this.pendingFlushPromise;
        this.pendingFlushPromise = Promise.all(this.pendingSettingFlushers.map((flush) => flush()))
            .then(() => undefined)
            .finally(() => {
                this.pendingFlushPromise = null;
            });
        return this.pendingFlushPromise;
    }

    private async closeAfterSaving(): Promise<void> {
        await this.flushPendingSettings();
        this.close();
    }
}

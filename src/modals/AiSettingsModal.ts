import { App, Modal, Setting, Notice } from 'obsidian';
import DiwaPlugin from '../main';

export class AiSettingsModal extends Modal {
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
        header.createEl('h3', { text: 'AI Configuration', attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 700;' } });
        
        const closeBtn = header.createEl('button', { text: '×', attr: { style: 'background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--text-muted); line-height: 1;' } });
        closeBtn.addEventListener('click', () => this.close());

        // 2. Settings Area
        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 16px;' } });

        new Setting(body)
            .setName('Gemini API Key')
            .setDesc('Your Google Gemini API key.')
            .addText(text => {
                text.setPlaceholder('AIza...')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
                text.inputEl.style.width = '100%';
            });

        new Setting(body)
            .setName('Gemini Model')
            .setDesc('Model for AI chat and transcription.')
            .addDropdown(drop => {
                const models: Record<string, string> = {
                    'gemini-2.5-pro':      '2.5 Pro (Recommended)',
                    'gemini-2.5-flash':    '2.5 Flash',
                    'gemini-2.0-flash':    '2.0 Flash (Stable)',
                    'gemini-2.0-flash-lite': '2.0 Flash Lite',
                    'gemini-1.5-pro':      '1.5 Pro',
                    'gemini-1.5-flash':    '1.5 Flash',
                    'gemini-1.5-flash-8b': '1.5 Flash 8B',
                };
                for (const [value, label] of Object.entries(models)) {
                    drop.addOption(value, label);
                }
                drop.setValue(this.plugin.settings.geminiModel || 'gemini-2.5-pro');
                drop.onChange(async (value) => {
                    this.plugin.settings.geminiModel = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(body)
            .setName('Auto-classify notes')
            .setDesc('Automatically suggest a project for new notes using AI. Disabled by default — opt in to enable.')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.enableAutoClassification ?? false);
                toggle.onChange(async (value) => {
                    this.plugin.settings.enableAutoClassification = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(body)
            .setName('Max Output Tokens')
            .setDesc('Max response length (256–65536).')
            .addText(text => {
                text.setPlaceholder('65536').setValue(String(this.plugin.settings.maxOutputTokens ?? 65536));
                text.inputEl.type = 'number';
                text.inputEl.min = '256';
                text.inputEl.max = '65536';
                text.onChange(async (value) => {
                    const val = Math.min(65536, Math.max(256, parseInt(value) || 65536));
                    this.plugin.settings.maxOutputTokens = val;
                    await this.plugin.saveSettings();
                });
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
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}



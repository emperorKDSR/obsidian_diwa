import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import type DiwaPlugin from './main';
import { DatePickerModal } from './modals/DatePickerModal';
import { parseDateToIso } from './utils/dateParsing';
import { ScratchpadHorizon } from './types';

export function bindDeferredTextSetting(
    text: TextComponent,
    initialValue: string,
    onCommit: (value: string) => Promise<void>,
): () => Promise<void> {
    let draftValue = initialValue;
    let committedValue = initialValue;
    let saveChain = Promise.resolve();

    const commitValue = (value: string): Promise<void> => {
        if (value === committedValue) return saveChain;
        saveChain = saveChain
            .catch(() => undefined)
            .then(async () => {
                if (value === committedValue) return;
                await onCommit(value);
                committedValue = value;
            });
        return saveChain;
    };

    text
        .setValue(initialValue)
        .onChange((value) => {
            draftValue = value;
        });

    const flushDraft = (): Promise<void> => commitValue(draftValue);
    text.inputEl.addEventListener('blur', () => {
        void flushDraft();
    });
    text.inputEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void flushDraft();
        text.inputEl.blur();
    });

    return flushDraft;
}

export class DiwaSettingTab extends PluginSettingTab {
    plugin: DiwaPlugin;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'DIWA — Personal OS Settings' });

        // ── 1. Storage & Workspace ──
        containerEl.createEl('h3', { text: 'Storage & Workspace' });

        new Setting(containerEl)
            .setName('Capture Folder')
            .setDesc('Root folder for continuous workspace atomic notes (partitioned automatically by YYYY/MM).')
            .addText(text => {
                text.setPlaceholder('000 Bin/Diwa');
                bindDeferredTextSetting(text, this.plugin.settings.captureFolder ?? '000 Bin/Diwa', async (value) => {
                    await this.plugin.updateSetting('captureFolder', value);
                });
            });

        new Setting(containerEl)
            .setName('New Note Folder')
            .setDesc('Default destination folder when merging or creating new notes.')
            .addText(text => {
                text.setPlaceholder('000 Bin');
                bindDeferredTextSetting(text, this.plugin.settings.newNoteFolder ?? '000 Bin', async (value) => {
                    await this.plugin.updateSetting('newNoteFolder', value);
                });
            });

        new Setting(containerEl)
            .setName('Attachments Folder')
            .setDesc('Folder where pasted images and embedded assets are saved.')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA Attachments');
                bindDeferredTextSetting(text, this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments', async (value) => {
                    await this.plugin.updateSetting('attachmentsFolder', value);
                });
            });

        new Setting(containerEl)
            .setName('People Folder')
            .setDesc('Directory for people contact notes (triggered via `/` in composer).')
            .addText(text => {
                text.setPlaceholder('000 Bin/DIWA People');
                bindDeferredTextSetting(text, this.plugin.settings.peopleFolder ?? '000 Bin/DIWA People', async (value) => {
                    await this.plugin.updateSetting('peopleFolder', value);
                });
            });

        new Setting(containerEl)
            .setName('Additional Task Folders')
            .setDesc('Extra folders to scan for tasks displayed in Gawa Task Cockpit and Karon Horizon (e.g. "Projects, Areas, Tasks"). Separate multiple folders with commas or newlines.')
            .addTextArea(text => {
                text.setPlaceholder('Projects, Areas, Tasks');
                const initialVal = (this.plugin.settings.additionalTaskFolders || []).join(', ');
                text.setValue(initialVal);
                text.inputEl.rows = 2;
                text.inputEl.style.width = '100%';
                text.inputEl.style.resize = 'vertical';
                text.inputEl.addEventListener('blur', async () => {
                    const raw = text.getValue();
                    const parsed = Array.from(new Set(
                        raw
                            .split(/[\n,]/)
                            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                            .filter(Boolean)
                    ));
                    await this.plugin.updateSetting('additionalTaskFolders', parsed, 'tasks');
                });
            });

        new Setting(containerEl)
            .setName('Permanent Note Folders')
            .setDesc('Specific folders to scan for recently updated permanent notes (e.g. "Notes, Slipbox, Projects"). Leave blank to include all markdown files in the vault outside the capture folder.')
            .addTextArea(text => {
                text.setPlaceholder('Notes, Slipbox, Projects (leave blank for all non-capture folders)');
                const initialVal = (this.plugin.settings.permanentNotesFolders || []).join(', ');
                text.setValue(initialVal);
                text.inputEl.rows = 2;
                text.inputEl.style.width = '100%';
                text.inputEl.style.resize = 'vertical';
                text.inputEl.addEventListener('blur', async () => {
                    const raw = text.getValue();
                    const parsed = Array.from(new Set(
                        raw
                            .split(/[\n,]/)
                            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
                            .filter(Boolean)
                    ));
                    await this.plugin.updateSetting('permanentNotesFolders', parsed);
                });
            });

        // Scratchpad Note Horizon
        const currentHorizon = this.plugin.settings.scratchpadHorizon || '7d';
        new Setting(containerEl)
            .setName('Scratchpad Note Horizon')
            .setDesc('Time window of notes displayed in the DIWA Workspace / Scratchpad. Global search continues to search across all notes.')
            .addDropdown(drop => {
                drop
                    .addOption('today', '📅 Today only')
                    .addOption('3d', '🗓️ Last 3 days')
                    .addOption('7d', '⚡ Last 7 days (Recommended)')
                    .addOption('14d', '📆 Last 14 days')
                    .addOption('30d', '🗓️ Last 30 days')
                    .addOption('all', '📋 All notes (No time limit)')
                    .addOption('custom', '🎯 Specific date onwards...')
                    .setValue(currentHorizon)
                    .onChange(async (val) => {
                        await this.plugin.updateSetting('scratchpadHorizon', val as ScratchpadHorizon, 'all');
                        this.display();
                    });
            });

        if (currentHorizon === 'custom') {
            const customDateSetting = new Setting(containerEl)
                .setName('Custom Start Date')
                .setDesc('Only display notes created on or after this date (e.g. August 1, 2026 or 2026-08-01).');

            customDateSetting.addText(text => {
                text.setPlaceholder('YYYY-MM-DD or August 1, 2026');
                const rawVal = this.plugin.settings.scratchpadCustomDate || '';
                text.setValue(rawVal);
                bindDeferredTextSetting(text, rawVal, async (val) => {
                    const parsed = parseDateToIso(val);
                    const toSave = parsed || val.trim();
                    await this.plugin.updateSetting('scratchpadCustomDate', toSave, 'all');
                    this.display();
                });
            });

            customDateSetting.addButton(btn => {
                btn.setButtonText('📅 Pick Date')
                    .onClick(() => {
                        const initialIso = parseDateToIso(this.plugin.settings.scratchpadCustomDate) || '';
                        new DatePickerModal(this.app, initialIso, async (chosen) => {
                            await this.plugin.updateSetting('scratchpadCustomDate', chosen, 'all');
                            this.display();
                        }).open();
                    });
            });

            if (this.plugin.settings.scratchpadCustomDate) {
                customDateSetting.addButton(btn => {
                    btn.setButtonText('✕ Clear')
                        .setWarning()
                        .onClick(async () => {
                            await this.plugin.updateSetting('scratchpadCustomDate', '', 'all');
                            this.display();
                        });
                });
            }
        }

        new Setting(containerEl)
            .setName('Always Show Important Notes (⭐)')
            .setDesc('Keep notes marked with ⭐ Important visible in the workspace stream regardless of their age.')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.keepImportantInScratchpad !== false)
                    .onChange(async (val) => {
                        await this.plugin.updateSetting('keepImportantInScratchpad', val, 'all');
                    });
            });

        // ── 2. Life Areas Taxonomy ──
        containerEl.createEl('h3', { text: 'Life Areas Taxonomy' });
        const currentAreas = [...(this.plugin.settings.lifeAreas || [])];

        currentAreas.forEach((area, i) => {
            const rowSetting = new Setting(containerEl);
            rowSetting.setName(`${area.icon || '🏷️'} ${area.label}`);
            rowSetting.setDesc(`Tag identifier: #${area.id}`);

            rowSetting.addText(text => {
                text.setPlaceholder('Emoji')
                    .setValue(area.icon);
                text.inputEl.style.width = '60px';
                text.inputEl.style.textAlign = 'center';
                text.onChange(async (val) => {
                    currentAreas[i] = { ...currentAreas[i], icon: val.trim() };
                    rowSetting.setName(`${currentAreas[i].icon || '🏷️'} ${currentAreas[i].label}`);
                    await this.plugin.updateSetting('lifeAreas', [...currentAreas], 'all');
                });
            });

            rowSetting.addText(text => {
                text.setPlaceholder('Label')
                    .setValue(area.label);
                text.onChange(async (val) => {
                    const newLabel = val.trim();
                    const newId = newLabel.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || `area_${i}`;
                    currentAreas[i] = { ...currentAreas[i], label: newLabel, id: newId };
                    rowSetting.setName(`${currentAreas[i].icon || '🏷️'} ${currentAreas[i].label}`);
                    rowSetting.setDesc(`Tag identifier: #${currentAreas[i].id}`);
                    await this.plugin.updateSetting('lifeAreas', [...currentAreas], 'all');
                });
            });

            rowSetting.addButton(btn => {
                btn.setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        currentAreas.splice(i, 1);
                        await this.plugin.updateSetting('lifeAreas', [...currentAreas], 'all');
                        this.display();
                    });
            });
        });

        new Setting(containerEl)
            .setName('Add Life Area')
            .setDesc('Add a new life area category to your scratchpad')
            .addButton(btn => {
                btn.setButtonText('+ Add Area')
                    .setCta()
                    .onClick(async () => {
                        const newAreas = [
                            ...(this.plugin.settings.lifeAreas || []),
                            {
                                id: `area_${Date.now().toString().slice(-4)}`,
                                label: 'New Area',
                                icon: '⭐'
                            }
                        ];
                        await this.plugin.updateSetting('lifeAreas', newAreas, 'all');
                        this.display();
                    });
            });

        // ── 3. Device & Mobile Layout ──
        containerEl.createEl('h3', { text: 'Mobile & Layout' });

        new Setting(containerEl)
            .setName('Mobile Bottom Bar Height')
            .setDesc('Height (px) reserved above Obsidian mobile bottom navigation bar so the sticky composer stays visible.')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .setValue(this.plugin.settings.mobileBottomBarHeight ?? 56)
                    .onChange(async (value) => {
                        await this.plugin.updateSetting('mobileBottomBarHeight', value);
                    });
            });

        // ── 4. Contexts & Vault Tags ──
        containerEl.createEl('h3', { text: 'Contexts & Vault Tags' });

        new Setting(containerEl)
            .setName('Manage Contexts')
            .setDesc('Scan vault to populate and synchronize hashtag suggestions.')
            .addButton(btn => btn.setButtonText('Scan Vault').onClick(async () => {
                const found = await this.plugin.index.scanForContexts();
                let added = 0;
                found.forEach(c => {
                    if (!this.plugin.settings.contexts.includes(c)) {
                        this.plugin.settings.contexts.push(c);
                        added++;
                    }
                });
                if (added > 0) {
                    await this.plugin.saveSettings();
                    this.display();
                }
            }));
    }
}

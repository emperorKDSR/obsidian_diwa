import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import DiwaPlugin from './main';

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
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'DIWA Settings'});

        containerEl.createEl('h3', { text: 'Storage & Capture' });
		new Setting(containerEl).setName('Capture Folder').setDesc('Folder for daily capture logs (tables).').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA');
		    bindDeferredTextSetting(text, this.plugin.settings.captureFolder, async (value) => {
		        await this.plugin.updateSetting('captureFolder', value);
		    });
		});
		new Setting(containerEl).setName('Thoughts Folder').setDesc('Folder for individual thought files (YAML).').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA');
		    bindDeferredTextSetting(text, this.plugin.settings.thoughtsFolder, async (value) => {
		        await this.plugin.updateSetting('thoughtsFolder', value);
		    });
		});
		new Setting(containerEl).setName('Gawa Folder').setDesc('Folder for individual gawa files (YAML).').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA Gawa');
		    bindDeferredTextSetting(text, this.plugin.settings.tasksFolder, async (value) => {
		        await this.plugin.updateSetting('tasksFolder', value);
		    });
		});
		new Setting(containerEl).setName('Bulsa Folder').setDesc('Folder for Bulsa notes and recurring obligations.').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA PF');
		    bindDeferredTextSetting(text, this.plugin.settings.pfFolder, async (value) => {
		        await this.plugin.updateSetting('pfFolder', value);
		    });
		});
		new Setting(containerEl).setName('People Folder').setDesc('Folder where new people notes are created when using the / trigger.').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA People');
		    bindDeferredTextSetting(text, this.plugin.settings.peopleFolder ?? '000 Bin/DIWA People', async (value) => {
		        await this.plugin.updateSetting('peopleFolder', value);
		    });
		});
		new Setting(containerEl).setName('Attachments Folder').setDesc('Folder where pasted/dropped images and files are saved.').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA Attachments');
		    bindDeferredTextSetting(text, this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments', async (value) => {
		        await this.plugin.updateSetting('attachmentsFolder', value);
		    });
		});
		new Setting(containerEl).setName('New Note Folder').setDesc('Default folder for new synthesized notes.').addText(text => {
		    text.setPlaceholder('000 Bin');
		    bindDeferredTextSetting(text, this.plugin.settings.newNoteFolder, async (value) => {
		        await this.plugin.updateSetting('newNoteFolder', value);
		    });
		});
		new Setting(containerEl).setName('Reviews Folder').setDesc('Root folder for Weekly and Monthly review files.').addText(text => {
		    text.setPlaceholder('000 Bin/DIWA Reviews');
		    bindDeferredTextSetting(text, this.plugin.settings.reviewsFolder ?? '000 Bin/DIWA Reviews', async (value) => {
		        await this.plugin.updateSetting('reviewsFolder', value);
		    });
		});

        containerEl.createEl('h3', { text: 'Formats' });
		new Setting(containerEl).setName('Date Format').setDesc('moment.js format for dates.').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { await this.plugin.updateSetting('dateFormat', value, 'all'); }));
		new Setting(containerEl).setName('Time Format').setDesc('moment.js format for time.').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { await this.plugin.updateSetting('timeFormat', value, 'all'); }));
        new Setting(containerEl)
            .setName('Mobile bottom bar height')
            .setDesc('Height (px) reserved for Obsidian mobile bottom toolbar so DIWA tabs stay visible above it.')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .setValue(this.plugin.settings.mobileBottomBarHeight ?? 56)
                    .onChange(async (value) => {
                        await this.plugin.updateSetting('mobileBottomBarHeight', value);
                    });
            });

// Canvas Mind Map Settings
        containerEl.createEl('h3', { text: 'Canvas Mind Map Settings' });
        new Setting(containerEl).setName('Default Depth')
            .setDesc('BFS depth for mind map generation')
            .addText(text => text
                .setPlaceholder('2')
                .setValue(this.plugin.settings.canvasDefaultDepth?.toString() ?? '2')
                .onChange(async (value) => {
                    const num = parseInt(value);
                    await this.plugin.updateSetting('canvasDefaultDepth', isNaN(num) ? 2 : num);
                }));
        new Setting(containerEl).setName('Default Layout')
            .setDesc('Layout direction for mind map')
            .addDropdown(drop => drop
                .addOption('lr', 'Left-to-Right')
                .addOption('rl', 'Right-to-Left')
                .addOption('tb', 'Top-to-Bottom')
                .addOption('bt', 'Bottom-to-Top')
                .addOption('radial', 'Radial')
                .setValue(this.plugin.settings.canvasDefaultDirection ?? 'lr')
                .onChange(async (value) => {
                    await this.plugin.updateSetting('canvasDefaultDirection', value as 'lr'|'rl'|'tb'|'bt'|'radial');
                }));
        new Setting(containerEl).setName('Node Width')
            .setDesc('Default canvas node width in pixels')
            .addText(text => text
                .setPlaceholder('400')
                .setValue(this.plugin.settings.canvasNodeWidth?.toString() ?? '400')
                .onChange(async (value) => {
                    const num = parseInt(value);
                    await this.plugin.updateSetting('canvasNodeWidth', isNaN(num) ? 400 : num);
                }));
        new Setting(containerEl).setName('Node Height')
            .setDesc('Default canvas node height in pixels')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(this.plugin.settings.canvasNodeHeight?.toString() ?? '300')
                .onChange(async (value) => {
                    const num = parseInt(value);
                    await this.plugin.updateSetting('canvasNodeHeight', isNaN(num) ? 300 : num);
                }));
        new Setting(containerEl).setName('Horizontal Spacing')
            .setDesc('Spacing between nodes horizontally')
            .addText(text => text
                .setPlaceholder('100')
                .setValue(this.plugin.settings.canvasSpacingX?.toString() ?? '100')
                .onChange(async (value) => {
                    const num = parseInt(value);
                    await this.plugin.updateSetting('canvasSpacingX', isNaN(num) ? 100 : num);
                }));
        new Setting(containerEl).setName('Vertical Spacing')
            .setDesc('Spacing between nodes vertically')
            .addText(text => text
                .setPlaceholder('50')
                .setValue(this.plugin.settings.canvasSpacingY?.toString() ?? '50')
                .onChange(async (value) => {
                    const num = parseInt(value);
                    await this.plugin.updateSetting('canvasSpacingY', isNaN(num) ? 50 : num);
                }));
        new Setting(containerEl).setName('Canvas Output Folder')
            .setDesc('Folder to save generated canvas files (empty = same folder as source)')
            .addText(text => text
                .setPlaceholder('')
                .setValue(this.plugin.settings.canvasOutputFolder ?? '')
                .onChange(async (value) => {
                    await this.plugin.updateSetting('canvasOutputFolder', value.trim());
                }));
        // Bulsa heading restored
        containerEl.createEl('h3', { text: 'Bulsa' });
        new Setting(containerEl).setName('Monthly Income').setDesc('Used for the cashflow overview in Bulsa Insights.').addText(text => text.setPlaceholder('0').setValue(this.plugin.settings.monthlyIncome.toString()).onChange(async (value) => { await this.plugin.updateSetting('monthlyIncome', parseFloat(value) || 0); }));

        containerEl.createEl('h3', { text: 'Contexts & Tags' });
        const contextSetting = new Setting(containerEl).setName('Manage Contexts').setDesc('Click to rescan your vault for context tags (#tag).');
        contextSetting.addButton(btn => btn.setButtonText('Scan Vault').onClick(async () => {
            const found = await this.plugin.index.scanForContexts();
            let added = 0;
            found.forEach(c => { if (!this.plugin.settings.contexts.includes(c)) { this.plugin.settings.contexts.push(c); added++; } });
            if (added > 0) {
                await this.plugin.saveSettings();
                this.display();
            } else {
            }
        }));
	}
}

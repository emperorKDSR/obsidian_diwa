import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import DiwaPlugin from './main';

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
		new Setting(containerEl).setName('Capture Folder').setDesc('Folder for daily capture logs (tables).').addText(text => text.setPlaceholder('000 Bin/DIWA').setValue(this.plugin.settings.captureFolder).onChange(async (value) => { this.plugin.settings.captureFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Thoughts Folder').setDesc('Folder for individual thought files (YAML).').addText(text => text.setPlaceholder('000 Bin/DIWA').setValue(this.plugin.settings.thoughtsFolder).onChange(async (value) => { this.plugin.settings.thoughtsFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Gawa Folder').setDesc('Folder for individual gawa files (YAML).').addText(text => text.setPlaceholder('000 Bin/DIWA Gawa').setValue(this.plugin.settings.tasksFolder).onChange(async (value) => { this.plugin.settings.tasksFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Finance Folder').setDesc('Folder for personal finance (PF) dues.').addText(text => text.setPlaceholder('000 Bin/DIWA PF').setValue(this.plugin.settings.pfFolder).onChange(async (value) => { this.plugin.settings.pfFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('People Folder').setDesc('Folder where new people notes are created when using the / trigger.').addText(text => text.setPlaceholder('000 Bin/DIWA People').setValue(this.plugin.settings.peopleFolder ?? '000 Bin/DIWA People').onChange(async (value) => { this.plugin.settings.peopleFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Voice Memo Folder').setDesc('Folder for voice recording clips.').addText(text => text.setPlaceholder('000 Bin/DIWA Voice').setValue(this.plugin.settings.voiceMemoFolder).onChange(async (value) => { this.plugin.settings.voiceMemoFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Habits Folder').setDesc('Folder for habit tracking files.').addText(text => text.setPlaceholder('000 Bin/DIWA Habits').setValue(this.plugin.settings.habitsFolder).onChange(async (value) => { this.plugin.settings.habitsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Attachments Folder').setDesc('Folder where pasted/dropped images and files are saved.').addText(text => text.setPlaceholder('000 Bin/DIWA Attachments').setValue(this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments').onChange(async (value) => { this.plugin.settings.attachmentsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('New Note Folder').setDesc('Default folder for new synthesized notes.').addText(text => text.setPlaceholder('000 Bin').setValue(this.plugin.settings.newNoteFolder).onChange(async (value) => { this.plugin.settings.newNoteFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Reviews Folder').setDesc('Root folder for Weekly, Monthly, and Compass review files.').addText(text => text.setPlaceholder('000 Bin/DIWA Reviews').setValue(this.plugin.settings.reviewsFolder ?? '000 Bin/DIWA Reviews').onChange(async (value) => { this.plugin.settings.reviewsFolder = value; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Formats' });
		new Setting(containerEl).setName('Date Format').setDesc('moment.js format for dates.').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));
		new Setting(containerEl).setName('Time Format').setDesc('moment.js format for time.').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));
        new Setting(containerEl)
            .setName('Mobile bottom bar height')
            .setDesc('Height (px) reserved for Obsidian mobile bottom toolbar so DIWA tabs stay visible above it.')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .setValue(this.plugin.settings.mobileBottomBarHeight ?? 56)
                    .onChange(async (value) => {
                        this.plugin.settings.mobileBottomBarHeight = value;
                        await this.plugin.saveSettings();
                    });
            });

        containerEl.createEl('h3', { text: 'AI Configuration' });
        containerEl.createEl('p', {
            text: 'Populate only these fields: API key, model, and temperature.',
        });
        // sec-002: API key masked as password — was plain text
        new Setting(containerEl).setName('Gemini API Key').setDesc('Your Google AI Studio API key.').addText(text => {
            text.setPlaceholder('AIza...').setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => { this.plugin.settings.geminiApiKey = value; await this.plugin.saveSettings(); });
            text.inputEl.type = 'password';
        });
        new Setting(containerEl).setName('AI Model').setDesc('Model used by AIProcessor (e.g. gemini-2.5-flash or gpt-4o-mini).').addText(text => text.setPlaceholder('gpt-4o-mini').setValue(this.plugin.settings.ai.model).onChange(async (value) => {
            const model = (value || 'gpt-4o-mini').trim();
            this.plugin.settings.ai.model = model;
            // Keep legacy Gemini model in sync when a Gemini model is provided.
            if (model.startsWith('gemini-')) this.plugin.settings.geminiModel = model;
            await this.plugin.saveSettings();
        }));
        new Setting(containerEl).setName('AI Temperature').setDesc('Creativity control for AIProcessor calls (0.0 to 2.0).').addText(text => text.setPlaceholder('0.7').setValue(String(this.plugin.settings.ai.temperature)).onChange(async (value) => { const parsed = Number(value); this.plugin.settings.ai.temperature = Number.isFinite(parsed) ? Math.max(0, Math.min(2, parsed)) : 0.7; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Finance' });
        new Setting(containerEl).setName('Monthly Income').setDesc('Used for the Cashflow Dashboard in Finance Mode.').addText(text => text.setPlaceholder('0').setValue(this.plugin.settings.monthlyIncome.toString()).onChange(async (value) => { this.plugin.settings.monthlyIncome = parseFloat(value) || 0; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Contexts & Tags' });
        const contextSetting = new Setting(containerEl).setName('Manage Contexts').setDesc('Click to rescan your vault for context tags (#tag).');
        contextSetting.addButton(btn => btn.setButtonText('Scan Vault').onClick(async () => {
            const found = await this.plugin.index.scanForContexts();
            let added = 0;
            found.forEach(c => { if (!this.plugin.settings.contexts.includes(c)) { this.plugin.settings.contexts.push(c); added++; } });
            if (added > 0) {
                await this.plugin.saveSettings();
                new Notice(`Found and added ${added} new contexts.`);
                this.display();
            } else {
                new Notice('No new contexts found.');
            }
        }));

        containerEl.createEl('h3', { text: 'Reminders' });
        new Setting(containerEl).setName('Habit Reminders').setDesc('Hourly nudge for pending habits (quiet hours: 8 AM – 10 PM).').addToggle(toggle => toggle.setValue(this.plugin.settings.reminderHabitsEnabled ?? true).onChange(async (value) => { this.plugin.settings.reminderHabitsEnabled = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Gawa Reminders').setDesc('Hourly nudge for gawa due today (quiet hours: 8 AM – 10 PM).').addToggle(toggle => toggle.setValue(this.plugin.settings.reminderTasksEnabled ?? true).onChange(async (value) => { this.plugin.settings.reminderTasksEnabled = value; await this.plugin.saveSettings(); }));
	}
}

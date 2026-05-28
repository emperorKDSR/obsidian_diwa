import { moment, Platform, Notice, TFile } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { FolderSettingsModal } from '../modals/FolderSettingsModal';

export class SettingsTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }
    render(container: HTMLElement) {
        this.renderSettingsMode(container);
    }
    async renderSettingsMode(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { attr: { style: 'padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });
        
        // 1. Header (consistent with other modes)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;' }
        });

        header.createEl('h2', {
            text: 'Settings',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const actionRow = wrap.createEl('div', {
            attr: { style: 'display: flex; gap: 8px; margin-bottom: 12px;' }
        });

        const actionBtnStyle = 'diwa-settings-action-btn';

        const folderConfigBtn = actionRow.createEl('button', {
            cls: actionBtnStyle
        });
        folderConfigBtn.createSpan({ text: '📁' });
        folderConfigBtn.createSpan({ text: 'Folder Config' });
        folderConfigBtn.addEventListener('click', () => {
            new FolderSettingsModal(this.view.plugin.app, this.view.plugin).open();
        });

        const field = (label: string, desc: string, inputFn: (row: HTMLElement) => void) => {
            const row = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 12px;' } });
            row.createEl('div', { text: label, attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-normal);' } });
            if (desc) row.createEl('div', { text: desc, attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });
            inputFn(row);
        };

        const input = (parent: HTMLElement, value: string, placeholder: string, type = 'text', onChange: (v: string) => void) => {
            const el = parent.createEl('input', { type, attr: { value, placeholder, style: 'font-size: 0.85em; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); width: 100%; box-sizing: border-box;' } });
            el.addEventListener('change', () => onChange(el.value));
        };

        field('Date Format', 'moment.js format, e.g. YYYY-MM-DD', row => input(row, this.view.plugin.settings.dateFormat, 'YYYY-MM-DD', 'text', async v => { this.view.plugin.settings.dateFormat = v; await this.view.plugin.saveSettings(); }));
        field('Time Format', 'moment.js format, e.g. HH:mm', row => input(row, this.view.plugin.settings.timeFormat, 'HH:mm', 'text', async v => { this.view.plugin.settings.timeFormat = v; await this.view.plugin.saveSettings(); }));
        field('Monthly Income', 'For cashflow tracking in Bulsa Insights.', row => {
            const inp = row.createEl('input', { type: 'number', attr: { value: this.view.plugin.settings.monthlyIncome.toString(), style: 'font-size: 0.85em; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); width: 100%; box-sizing: border-box;' } });
            inp.addEventListener('change', async () => { this.view.plugin.settings.monthlyIncome = parseFloat(inp.value) || 0; await this.view.plugin.saveSettings(); });
        });
    }
}

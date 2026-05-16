import { moment, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";

export class CompassTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.renderCompassMode(container);
    }

    async renderCompassMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 2px;' } });
        this.renderHomeIcon(navRow);

        header.createEl('h2', {
            text: 'Quarterly Compass',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' }
        });

        const quarter = `Q${Math.floor((new Date().getMonth() + 3) / 3)} ${new Date().getFullYear()}`;
        header.createEl('span', {
            text: `Strategic focus for ${quarter}`,
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. North Star Goals
        const northStarSection = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; padding: 20px; background: var(--background-secondary-alt); border-radius: 20px; border: 1px solid var(--background-modifier-border-faint); box-shadow: 0 4px 15px rgba(0,0,0,0.03);' }
        });

        northStarSection.createEl('h3', { text: '✨ North Star Goals', attr: { style: 'margin: 0; font-size: 0.9em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--interactive-accent);' } });

        const quarterId = `${new Date().getFullYear()}-Q${Math.floor((new Date().getMonth() + 3) / 3)}`;
        // Load from MD file first (source of truth), fallback to settings
        const savedCompass = await this.vault.loadCompassData(quarterId);
        const goals = savedCompass?.northStarGoals ?? (this.settings.northStarGoals || []);
        let currentMission = savedCompass?.lifeMission ?? (this.settings.lifeMission || '');
        if (savedCompass) {
            this.settings.northStarGoals = savedCompass.northStarGoals;
            this.settings.lifeMission = savedCompass.lifeMission;
        }

        const currentGoals = [...goals];
        for (let i = 0; i < 3; i++) {
            const val = currentGoals[i] || '';
            const inp = northStarSection.createEl('input', {
                type: 'text',
                attr: { 
                    placeholder: `Vision Goal ${i+1}...`,
                    value: val,
                    style: 'width: 100%; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 10px; padding: 12px; font-size: 1em; color: var(--text-normal); font-weight: 500;' 
                }
            });
            inp.addEventListener('change', async () => {
                currentGoals[i] = inp.value;
                this.settings.northStarGoals = [...currentGoals];
                await this.plugin.saveSettings();
                await this.vault.saveCompassData(quarterId, currentGoals, currentMission);
                new Notice('Vision updated');
            });
        }

        // 3. Strategic Review (Stats)
        const reviewHeader = wrap.createEl('div', { attr: { style: 'margin-top: 10px; border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 8px;' } });
        reviewHeader.createEl('span', { text: 'Quarterly Audit', attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' } });

        const statsGrid = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px;' } });
        
        const projectCount = new Set([...Array.from(this.index.taskIndex.values()).map(t => t.project), ...Array.from(this.index.thoughtIndex.values()).map(t => t.project)].filter(p => p)).size;
        const tasksCompleted = Array.from(this.index.taskIndex.values()).filter(t => t.status === 'done').length;

        const statCard = (label: string, val: string, sub: string) => {
            const card = statsGrid.createEl('div', { attr: { style: 'background: var(--background-secondary); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--background-modifier-border-faint);' } });
            card.createSpan({ text: val, attr: { style: 'font-size: 1.5em; font-weight: 800; color: var(--text-normal);' } });
            card.createSpan({ text: label, attr: { style: 'font-size: 0.65em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;' } });
            card.createSpan({ text: sub, attr: { style: 'font-size: 0.7em; color: var(--text-faint); font-style: italic;' } });
        };

        statCard('Projects', projectCount.toString(), 'Active Objectives');
        statCard('Velocity', tasksCompleted.toString(), 'Total Gawa Done');

        // 4. Mission Statement — editable, backed by MD file + settings.lifeMission
        const missionWrap = wrap.createEl('div', {
            attr: { style: 'margin-top: 10px; display: flex; flex-direction: column; gap: 10px;' }
        });
        missionWrap.createEl('span', { text: 'Life Mission', attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' } });
        
        const missionTextarea = missionWrap.createEl('textarea', {
            attr: {
                placeholder: "Write your life mission — your 'Why'...",
                style: 'width: 100%; min-height: 110px; resize: vertical; background: var(--background-primary-alt); border: 1px solid var(--background-modifier-border); border-left: 4px solid var(--interactive-accent); border-radius: 12px; padding: 16px; font-size: 0.9em; line-height: 1.6; color: var(--text-normal); font-style: italic; font-family: inherit;'
            }
        });
        missionTextarea.value = currentMission;
        missionTextarea.addEventListener('change', async () => {
            currentMission = missionTextarea.value;
            this.settings.lifeMission = currentMission;
            await this.plugin.saveSettings();
            await this.vault.saveCompassData(quarterId, currentGoals, currentMission);
            new Notice('Mission saved');
        });
    }
}

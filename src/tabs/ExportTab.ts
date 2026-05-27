import { Notice, TFile, moment } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';

function csvField(val: string | number | undefined): string {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
}

export class ExportTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'diwa-export-wrap' });

        // ── Header ────────────────────────────────────────────────────────
        const headerRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 4px;' } });
        headerRow.createEl('h2', { text: 'Export & Backup', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800;' } });

        const thoughtCount = this.index.thoughtIndex.size;
        const taskCount = this.index.taskIndex.size;

        // ── Thoughts Export ───────────────────────────────────────────────
        const thoughtCard = wrap.createEl('div', { cls: 'diwa-export-card' });
        thoughtCard.createEl('div', { text: '💭 Thoughts Export', cls: 'diwa-export-card-title' });
        thoughtCard.createEl('span', { text: `${thoughtCount} thoughts`, cls: 'diwa-export-count-badge' });
        thoughtCard.createEl('div', { text: 'Exports all thoughts as a CSV file into your thoughts folder.', cls: 'diwa-export-card-desc' });
        const thoughtBtn = thoughtCard.createEl('button', { text: 'Export as CSV', cls: 'diwa-export-btn' });
        thoughtBtn.addEventListener('click', () => this._exportThoughts(thoughtBtn));

        // ── Gawa Export ──────────────────────────────────────────────────
        const taskCard = wrap.createEl('div', { cls: 'diwa-export-card' });
        taskCard.createEl('div', { text: '✅ Gawa Export', cls: 'diwa-export-card-title' });
        taskCard.createEl('span', { text: `${taskCount} tasks`, cls: 'diwa-export-count-badge' });
        taskCard.createEl('div', { text: 'Exports all tasks as a CSV file into your tasks folder.', cls: 'diwa-export-card-desc' });
        const taskBtn = taskCard.createEl('button', { text: 'Export as CSV', cls: 'diwa-export-btn' });
        taskBtn.addEventListener('click', () => this._exportTasks(taskBtn));

        // ── Full Backup ───────────────────────────────────────────────────
        const backupCard = wrap.createEl('div', { cls: 'diwa-export-card' });
        backupCard.createEl('div', { text: '💾 Full Backup', cls: 'diwa-export-card-title' });
        backupCard.createEl('div', { text: 'Creates a JSON backup of thoughts, tasks, projects, and settings (no API keys).', cls: 'diwa-export-card-desc' });
        const backupBtn = backupCard.createEl('button', { text: 'Create Backup', cls: 'diwa-export-btn' });
        backupBtn.addEventListener('click', () => this._createBackup(backupBtn));
    }

    private async _exportThoughts(btn: HTMLButtonElement) {
        btn.disabled = true;
        btn.textContent = 'Exporting…';
        try {
            const thoughts = Array.from(this.index.thoughtIndex.values());
            const rows = [
                ['title', 'created', 'day', 'contexts', 'body'].map(csvField).join(','),
                ...thoughts.map(t => [
                    t.title,
                    t.created,
                    t.day,
                    t.context.join('; '),
                    (t.body || '').slice(0, 200),
                ].map(csvField).join(','))
            ];
            const content = rows.join('\n');
            const folder = (this.settings.thoughtsFolder || '000 Bin/DIWA').replace(/\\/g, '/');
            const path = `${folder}/DIWA_Export_Thoughts.csv`;
            await this._writeFile(path, content);
        } catch (e) {
        } finally {
            btn.disabled = false;
            btn.textContent = 'Export as CSV';
        }
    }

    private async _exportTasks(btn: HTMLButtonElement) {
        btn.disabled = true;
        btn.textContent = 'Exporting…';
        try {
            const tasks = Array.from(this.index.taskIndex.values());
            const rows = [
                ['title', 'created', 'status', 'due', 'priority', 'energy', 'contexts'].map(csvField).join(','),
                ...tasks.map(t => [
                    t.title,
                    t.created,
                    t.status,
                    t.due || '',
                    t.priority || '',
                    t.energy || '',
                    t.context.join('; '),
                ].map(csvField).join(','))
            ];
            const content = rows.join('\n');
            const folder = (this.settings.tasksFolder || '000 Bin/DIWA Gawa').replace(/\\/g, '/');
            const path = `${folder}/DIWA_Export_Tasks.csv`;
            await this._writeFile(path, content);
        } catch (e) {
        } finally {
            btn.disabled = false;
            btn.textContent = 'Export as CSV';
        }
    }

    private async _createBackup(btn: HTMLButtonElement) {
        btn.disabled = true;
        btn.textContent = 'Creating…';
        try {
            const dateStr = moment().format('YYYYMMDD');
            const { geminiApiKey, ...safeSettings } = this.settings as any;
            const backup = {
                version: '1.14.0',
                exportedAt: new Date().toISOString(),
                thoughts: Array.from(this.index.thoughtIndex.values()),
                tasks: Array.from(this.index.taskIndex.values()),
                projects: Array.from(this.index.projectIndex.values()),
                settings: {
                    contexts: safeSettings.contexts,
                    weeklyGoals: safeSettings.weeklyGoals,
                    monthlyGoals: safeSettings.monthlyGoals,
                    northStarGoals: safeSettings.northStarGoals,
                },
            };
            const content = JSON.stringify(backup, null, 2);
            const folder = (this.settings.thoughtsFolder || '000 Bin/DIWA').replace(/\\/g, '/');
            const fileName = `DIWA_Backup_${dateStr}.json`;
            const path = `${folder}/${fileName}`;
            await this._writeFile(path, content);
        } catch (e) {
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Backup';
        }
    }

    private async _writeFile(path: string, content: string) {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(path, content);
        }
    }
}

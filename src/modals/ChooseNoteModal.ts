import { FuzzySuggestModal, App, TFile, FuzzyMatch } from 'obsidian';
import type DiwaPlugin from '../main';

export class ChooseNoteModal extends FuzzySuggestModal<TFile> {
    private plugin: DiwaPlugin;
    private onChoose: (file: TFile) => void;

    constructor(app: App, plugin: DiwaPlugin, onChoose: (file: TFile) => void) {
        super(app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        
        this.setPlaceholder('Type to search existing notes in Diwa folder...');
    }

    getItems(): TFile[] {
        const folderPath = this.plugin.settings.thoughtsFolder;
        const files: TFile[] = [];
        
        const abstractFiles = this.app.vault.getMarkdownFiles();
        for (const file of abstractFiles) {
            if (file.path.startsWith(folderPath)) {
                files.push(file);
            }
        }
        
        // Sort by modified time, newest first
        return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    }

    getItemText(item: TFile): string {
        const prefix = this.plugin.settings.thoughtsFolder;
        let relativePath = item.path;
        if (relativePath.startsWith(prefix)) {
            relativePath = relativePath.slice(prefix.length).replace(/^\//, '');
        }
        return relativePath || item.name;
    }

    renderSuggestion(item: FuzzyMatch<TFile>, el: HTMLElement) {
        super.renderSuggestion(item, el);
        
        const mtime = item.item.stat.mtime;
        const moment = (window as any).moment;
        const dateStr = moment ? moment(mtime).format('YYYY-MM-DD HH:mm:ss') : new Date(mtime).toLocaleString();
        
        el.createEl('div', {
            cls: 'suggestion-note',
            text: `Modified: ${dateStr}`,
            attr: {
                style: 'font-size: 11px; color: var(--text-muted); margin-top: 2px;'
            }
        });
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

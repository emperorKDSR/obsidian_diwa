import { App, TFile, Notice, SuggestModal } from 'obsidian';
import { FileOrCreate } from '../types';

export class FileSuggestModal extends SuggestModal<FileOrCreate> {
    onChoose: (file: TFile) => void;
    newNoteFolder: string;

    constructor(app: App, onChoose: (file: TFile) => void, newNoteFolder: string = '000 Bin') {
        super(app);
        this.onChoose = onChoose;
        this.newNoteFolder = newNoteFolder;
        this.setPlaceholder('Search notes… or type a name to create one');
    }

    getSuggestions(query: string): FileOrCreate[] {
        const q = query.toLowerCase().trim();
        const files = this.app.vault.getFiles()
            .filter(f => f.extension === 'md')
            .filter(f => !q || f.basename.toLowerCase().includes(q))
            .sort((a, b) => a.basename.localeCompare(b.basename));

        const results: FileOrCreate[] = [...files];

        // Offer "create" when query is non-empty and no file has that exact basename
        if (q && !files.some(f => f.basename.toLowerCase() === q)) {
            results.unshift(query.trim());
        }

        return results;
    }

    renderSuggestion(item: FileOrCreate, el: HTMLElement) {
        if (typeof item === 'string') {
            el.style.cssText = 'display:flex; align-items:center; gap:6px;';
            el.createSpan({ text: '＋', attr: { style: 'font-weight:700; color:var(--interactive-accent); font-size:1.1em;' } });
            el.createEl('div', {
                attr: { style: 'display:flex; flex-direction:column;' }
            }).createEl('span', {
                text: `Create "${item}"`,
                attr: { style: 'color:var(--interactive-accent); font-style:italic;' }
            });
        } else {
            const wrap = el.createEl('div', { attr: { style: 'display:flex; flex-direction:column;' } });
            wrap.createEl('span', { text: item.basename });
            if (item.parent && item.parent.path !== '/') {
                wrap.createEl('span', { text: item.parent.path, attr: { style: 'font-size:0.8em; color:var(--text-muted);' } });
            }
        }
    }

    async onChooseSuggestion(item: FileOrCreate, evt: MouseEvent | KeyboardEvent) {
        if (typeof item === 'string') {
            try {
                const folder = this.newNoteFolder.trim().replace(/\/$/, '');
                const path = folder ? `${folder}/${item}.md` : `${item}.md`;
                // Ensure folder exists
                if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
                    await this.app.vault.createFolder(folder);
                }
                const newFile = await this.app.vault.create(path, '');
                this.onChoose(newFile);
            } catch (e: any) {
            }
        } else {
            this.onChoose(item);
        }
    }
}


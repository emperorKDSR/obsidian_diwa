import { App, TFile, SuggestModal, Notice } from 'obsidian';

type PersonItem = TFile | { create: true; name: string };

/**
 * PersonSuggestModal — opened by the `/` trigger in capture inputs.
 * Lists all vault notes whose frontmatter `category` equals `"people"`.
 * When the typed query doesn't match any existing person, offers a
 * "Create '[name]'" option that creates a new note with category: people.
 */
export class PersonSuggestModal extends SuggestModal<PersonItem> {
    private onChoose: (file: TFile) => void;
    private peopleFolder: string;
    private initialQuery: string;

    constructor(app: App, onChoose: (file: TFile) => void, peopleFolder?: string, initialQuery?: string) {
        super(app);
        this.onChoose = onChoose;
        this.peopleFolder = (peopleFolder || '000 Bin/DIWA People').replace(/\\/g, '/');
        this.initialQuery = initialQuery || '';
        this.setPlaceholder('Search people… or type a name to create');
    }

    onOpen() {
        super.onOpen();
        if (this.initialQuery) {
            this.inputEl.value = this.initialQuery;
            this.inputEl.dispatchEvent(new Event('input'));
        }
    }

    getSuggestions(query: string): PersonItem[] {
        const q = query.toLowerCase().trim();
        const existing: TFile[] = this.app.vault.getMarkdownFiles()
            .filter(f => {
                const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                return fm?.category === 'people';
            })
            .filter(f => !q || f.basename.toLowerCase().includes(q))
            .sort((a, b) => a.basename.localeCompare(b.basename));

        const items: PersonItem[] = [...existing];

        // Append "Create" option when there's a query and no exact match
        if (q && !existing.some(f => f.basename.toLowerCase() === q)) {
            const displayName = query.trim();
            items.push({ create: true, name: displayName });
        }

        return items;
    }

    renderSuggestion(item: PersonItem, el: HTMLElement) {
        el.style.cssText = 'display:flex; align-items:center; gap:8px;';
        if ('create' in item) {
            el.createSpan({ text: '➕', attr: { style: 'font-size:1em; flex-shrink:0;' } });
            el.createEl('span', { text: `Create "${item.name}"`, cls: 'diwa-create-hint' });
        } else {
            el.createSpan({ text: '👤', attr: { style: 'font-size:1em; flex-shrink:0;' } });
            const info = el.createEl('div', { attr: { style: 'display:flex; flex-direction:column;' } });
            info.createEl('span', { text: item.basename });
            if (item.parent && item.parent.path !== '/') {
                info.createEl('span', { text: item.parent.path, attr: { style: 'font-size:0.8em; color:var(--text-muted);' } });
            }
        }
    }

    async onChooseSuggestion(item: PersonItem) {
        if ('create' in item) {
            await this._createPerson(item.name);
        } else {
            this.onChoose(item);
        }
    }

    private async _createPerson(name: string): Promise<void> {
        try {
            const folder = this.peopleFolder;
            // Ensure folder exists
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const safeName = name.replace(/[/\\?%*:|"<>]/g, '-');
            const path = `${folder}/${safeName}.md`;

            // Check if file already exists (race condition guard)
            let file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                const content = `---\ncategory: people\nname: "${name}"\ncreated: "${new Date().toISOString().slice(0, 10)}"\n---\n\n# ${name}\n`;
                file = await this.app.vault.create(path, content);
            }

            this.onChoose(file as TFile);
        } catch (e: any) {
        }
    }
}



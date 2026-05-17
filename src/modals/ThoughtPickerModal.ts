import { App, FuzzySuggestModal } from 'obsidian';
import type { ThoughtEntry } from '../types';

export class ThoughtPickerModal extends FuzzySuggestModal<ThoughtEntry> {
    private thoughts: ThoughtEntry[];
    onChoose: (entry: ThoughtEntry) => void;

    constructor(app: App, thoughts: Map<string, ThoughtEntry>, thoughtsFolder: string, onChoose: (entry: ThoughtEntry) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Search thoughts by content...');

        // Filter to thoughts folder, sort by last-modified (file mtime) descending
        const folder = thoughtsFolder.replace(/\/$/, '');
        this.thoughts = Array.from(thoughts.values())
            .filter(t => t.filePath.startsWith(folder + '/') || t.filePath.startsWith(folder))
            .sort((a, b) => (b.lastThreadUpdate || 0) - (a.lastThreadUpdate || 0));
    }

    getItems(): ThoughtEntry[] {
        return this.thoughts;
    }

    private stripFrontmatter(text: string): string {
        return text.replace(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/, '').trim();
    }

    /** Fuzzy search indexes against body content so the user filters by what thoughts say */
    getItemText(item: ThoughtEntry): string {
        return this.stripFrontmatter(item.body || '') || item.title;
    }

    renderSuggestion(item: { item: ThoughtEntry; match: any }, el: HTMLElement): void {
        const body = this.stripFrontmatter(item.item.body || '');
        const preview = body.replace(/\s+/g, ' ').trim().slice(0, 120);
        const date = item.item.modified ? item.item.modified.slice(0, 16)
            : item.item.lastThreadUpdate ? new Date(item.item.lastThreadUpdate).toISOString().slice(0, 16).replace('T', ' ')
            : '';

        el.createEl('div', { text: preview || item.item.title, cls: 'diwa-thought-picker-body' });
        if (date) el.createEl('div', { text: date, cls: 'diwa-thought-picker-date' });
    }

    onChooseItem(item: ThoughtEntry, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

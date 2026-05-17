import { App, FuzzySuggestModal } from 'obsidian';
import type { ThoughtEntry } from '../types';

export class ThoughtPickerModal extends FuzzySuggestModal<ThoughtEntry> {
    private thoughts: ThoughtEntry[];
    onChoose: (entry: ThoughtEntry) => void;

    constructor(app: App, thoughts: Map<string, ThoughtEntry>, thoughtsFolder: string, onChoose: (entry: ThoughtEntry) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Search thoughts by content...');

        // Filter to thoughts folder, sort most-recent first
        const folder = thoughtsFolder.replace(/\/$/, '');
        this.thoughts = Array.from(thoughts.values())
            .filter(t => t.filePath.startsWith(folder + '/') || t.filePath.startsWith(folder))
            .sort((a, b) => {
                const ta = a.created || '';
                const tb = b.created || '';
                return tb.localeCompare(ta);
            });
    }

    getItems(): ThoughtEntry[] {
        return this.thoughts;
    }

    /** Fuzzy search indexes against body content so the user filters by what thoughts say */
    getItemText(item: ThoughtEntry): string {
        return item.body || item.title;
    }

    renderSuggestion(item: { item: ThoughtEntry; match: any }, el: HTMLElement): void {
        const preview = (item.item.body || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const date = item.item.created ? item.item.created.slice(0, 16) : '';

        el.createEl('div', { text: preview || item.item.title, cls: 'diwa-thought-picker-body' });
        if (date) el.createEl('div', { text: date, cls: 'diwa-thought-picker-date' });
    }

    onChooseItem(item: ThoughtEntry, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

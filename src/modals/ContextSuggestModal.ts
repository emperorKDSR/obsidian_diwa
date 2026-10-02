import { App, SuggestModal } from 'obsidian';

export class ContextSuggestModal extends SuggestModal<string> {
    onChoose: (context: string) => void;
    existingContexts: string[];

    constructor(app: App, existingContexts: string[], onChoose: (context: string) => void) {
        super(app);
        this.existingContexts = existingContexts;
        this.onChoose = onChoose;
        this.setPlaceholder('Search contexts… or type to create one');
    }

    getSuggestions(query: string): string[] {
        const q = query.toLowerCase().trim();
        const safe = this.existingContexts.filter((c): c is string => !!c && typeof c === 'string');
        const matches = safe
            .filter(ctx => !q || ctx.toLowerCase().includes(q))
            .sort((a, b) => a.localeCompare(b));

        const results: string[] = [...matches];

        // Offer to create if query is non-empty and no exact match
        if (q && !safe.some(ctx => ctx.toLowerCase() === q)) {
            results.unshift(`＋ Create "${query.trim()}"`);
        }

        return results;
    }

    renderSuggestion(item: string, el: HTMLElement) {
        if (item.startsWith('＋ Create "')) {
            el.style.cssText = 'display:flex; align-items:center; gap:6px;';
            el.createSpan({ text: '＋', attr: { style: 'font-weight:700; color:var(--interactive-accent); font-size:1.1em;' } });
            el.createSpan({ 
                text: item.replace('＋ ', ''),
                attr: { style: 'color:var(--interactive-accent); font-style:italic;' }
            });
        } else {
            el.setText(`#${item}`);
        }
    }

    onChooseSuggestion(item: string) {
        if (item.startsWith('＋ Create "')) {
            const newContext = item.substring('＋ Create "'.length, item.length - 1);
            this.onChoose(newContext);
        } else {
            this.onChoose(item);
        }
    }
}


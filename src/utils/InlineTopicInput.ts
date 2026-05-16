import { setIcon } from 'obsidian';
import { ThoughtEntry } from '../types';
import type DiwaPlugin from '../main';

/**
 * InlineTopicInput — zero-modal inline topic assignment.
 *
 * Flow:
 *  1. Note has context OR active tab ≠ 'all' → go straight to topic input.
 *  2. Note has no context AND active tab = 'all' → show inline context pill row first,
 *     then transition to topic input after selection.
 *
 * Rendered as an absolutely-positioned panel anchored below the tag button.
 * Cleans up on Enter, Escape, or blur-outside.
 */
export class InlineTopicInput {
    private wrap: HTMLElement;
    private removed = false;
    private outsideHandler: (e: MouseEvent) => void;
    private keyHandler: (e: KeyboardEvent) => void;
    private selectedSuggIndex = -1;
    private suggestions: string[] = [];
    private ownerDoc: Document;
    private ownerWin: Window;

    private constructor(
        private plugin: DiwaPlugin,
        private anchorEl: HTMLElement,
        private resolvedContexts: string[],
        private onSave: (contexts: string[], topic: string) => Promise<void>,
    ) {
        this.ownerDoc = anchorEl.ownerDocument;
        this.ownerWin = this.ownerDoc.defaultView ?? window;
        this.wrap = this.ownerDoc.body.createEl('div', { cls: 'diwa-inline-topic-wrap' });

        this.outsideHandler = (e: MouseEvent) => {
            if (!this.wrap.contains(e.target as Node) && e.target !== this.anchorEl) {
                this.remove();
            }
        };
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); this.remove(); }
        };
    }

    /** Entry point. Decides whether to show context-picker or topic-input first. */
    static open(
        anchorEl: HTMLElement,
        entry: ThoughtEntry,
        activeCtx: string,
        plugin: DiwaPlugin,
        onSave: (contexts: string[], topic: string) => Promise<void>,
    ) {
        let resolvedContexts: string[] | null = null;
        if (entry.context.length > 0) {
            resolvedContexts = entry.context;
        } else if (activeCtx !== 'all') {
            resolvedContexts = [activeCtx];
        }

        const instance = new InlineTopicInput(plugin, anchorEl, resolvedContexts ?? [], onSave);
        instance.position();

        if (resolvedContexts !== null) {
            instance.renderTopicInput();
        } else {
            instance.renderContextPicker(plugin.settings.contexts ?? []);
        }

        instance.ownerDoc.addEventListener('mousedown', instance.outsideHandler, true);
        instance.ownerDoc.addEventListener('keydown', instance.keyHandler, true);
    }

    private position() {
        const rect = this.anchorEl.getBoundingClientRect();
        this.wrap.style.top = `${rect.bottom + this.ownerWin.scrollY + 4}px`;
        this.wrap.style.left = `${rect.left + this.ownerWin.scrollX}px`;
    }

    /** Step 1 (conditional): inline context pill row */
    private renderContextPicker(contexts: string[]) {
        this.wrap.empty();
        this.wrap.createEl('div', { text: 'Pick context', cls: 'diwa-inline-topic-label' });
        const pills = this.wrap.createEl('div', { cls: 'diwa-inline-topic-ctx-pills' });
        for (const ctx of contexts) {
            const pill = pills.createEl('button', { text: ctx.toUpperCase(), cls: 'diwa-inline-topic-ctx-pill' });
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resolvedContexts = [ctx];
                this.renderTopicInput();
            });
        }
    }

    /** Step 2 (always): topic text input with autocomplete */
    private renderTopicInput() {
        this.wrap.empty();

        const allTopics = this.plugin.index.getExistingTopics();
        const ctxLabel = this.resolvedContexts.length > 0
            ? this.resolvedContexts[0].toUpperCase()
            : '';

        if (ctxLabel) {
            this.wrap.createEl('div', { text: ctxLabel, cls: 'diwa-inline-topic-ctx-badge' });
        }

        const input = this.wrap.createEl('input', {
            cls: 'diwa-inline-topic-input',
            attr: { type: 'text', placeholder: 'Topic, e.g. Meeting, Q2 Review…', spellcheck: 'false' }
        }) as HTMLInputElement;

        const dropdown = this.wrap.createEl('div', { cls: 'diwa-inline-topic-suggestions' });
        dropdown.style.display = 'none';

        const confirm = async (val: string) => {
            const safe = val.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
            if (safe) {
                this.plugin.refreshCoordinator?.suppressNotifyRefresh(1200);
                await this.onSave(this.resolvedContexts, safe);
            }
            this.remove();
        };

        const renderSuggestions = (query: string) => {
            const q = query.toLowerCase();
            this.suggestions = allTopics.filter(t => t.toLowerCase().startsWith(q) && t.toLowerCase() !== q);
            this.selectedSuggIndex = -1;
            dropdown.empty();
            if (this.suggestions.length === 0) { dropdown.style.display = 'none'; return; }
            for (let i = 0; i < this.suggestions.length; i++) {
                const s = this.suggestions[i];
                const row = dropdown.createEl('div', { text: s, cls: 'diwa-inline-topic-suggestion-item' });
                row.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = s; confirm(s); });
            }
            dropdown.style.display = 'block';
        };

        const highlightSugg = (idx: number) => {
            const items = dropdown.querySelectorAll<HTMLElement>('.diwa-inline-topic-suggestion-item');
            items.forEach((el, i) => el.toggleClass('is-selected', i === idx));
        };

        input.addEventListener('input', () => renderSuggestions(input.value));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                if (this.selectedSuggIndex >= 0 && this.suggestions[this.selectedSuggIndex]) {
                    confirm(this.suggestions[this.selectedSuggIndex]);
                } else {
                    confirm(input.value);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedSuggIndex = Math.min(this.selectedSuggIndex + 1, this.suggestions.length - 1);
                highlightSugg(this.selectedSuggIndex);
                if (this.suggestions[this.selectedSuggIndex]) input.value = this.suggestions[this.selectedSuggIndex];
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedSuggIndex = Math.max(this.selectedSuggIndex - 1, -1);
                highlightSugg(this.selectedSuggIndex);
                if (this.selectedSuggIndex >= 0 && this.suggestions[this.selectedSuggIndex]) input.value = this.suggestions[this.selectedSuggIndex];
            }
        });

        // Delay focus slightly to avoid triggering outsideHandler on the tag-button click
        setTimeout(() => input.focus(), 30);
    }

    private remove() {
        if (this.removed) return;
        this.removed = true;
        this.ownerDoc.removeEventListener('mousedown', this.outsideHandler, true);
        this.ownerDoc.removeEventListener('keydown', this.keyHandler, true);
        this.wrap.remove();
    }
}

import {
    ItemView, WorkspaceLeaf, setIcon, TFile,
    prepareFuzzySearch, prepareSimpleSearch, renderMatches,
} from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_SEARCH, VIEW_TYPE_DIWA, SEARCH_SCOPES, SEARCH_TYPE_ICONS, SEARCH_QUICKJUMP_TABS } from '../constants';
import type { SearchMatches } from 'obsidian';

interface RichResult {
    type: 'thought' | 'task' | 'due' | 'project' | 'habit';
    title: string;
    titleMatches: SearchMatches | null;
    body: string;
    bodyMatches: SearchMatches | null;
    score: number;
    meta: string;
    filePath?: string;
    tabId: string;
    id: string;
}

export class SearchView extends ItemView {
    plugin: DiwaPlugin;
    private _closed = false;

    private inputEl!: HTMLInputElement;
    private scopeBar!: HTMLElement;
    private resultsEl!: HTMLElement;

    private activeScope: string = 'all';
    private allResults: RichResult[] = [];
    private resultEls: HTMLElement[] = [];
    private focusedIndex: number = -1;

    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_SEARCH; }
    getDisplayText(): string { return 'DIWA Search'; }
    getIcon(): string { return 'lucide-search'; }

    async onOpen() {
        this._closed = false;
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('diwa-sv-root');

        // Hide Obsidian leaf header
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';

        this.renderView(root);
    }

    async onClose() {
        this._closed = true;
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
    }

    private renderView(root: HTMLElement) {
        // ── Top bar: input + scope ───────────────────────────────
        const topBar = root.createEl('div', { cls: 'diwa-sv-top-bar' });
        const topBarInner = topBar.createEl('div', { cls: 'diwa-sv-top-bar-inner' });

        // Input row
        const inputRow = topBarInner.createEl('div', { cls: 'diwa-sv-input-row' });
        const searchIconEl = inputRow.createEl('span', { cls: 'diwa-sv-search-icon' });
        setIcon(searchIconEl, 'lucide-search');

        this.inputEl = inputRow.createEl('input', {
            cls: 'diwa-sv-input',
            attr: {
                type: 'text',
                placeholder: 'Search across DIWA…',
                autocomplete: 'off',
                spellcheck: 'false',
            }
        });

        const kbdHint = inputRow.createEl('span', { cls: 'diwa-sv-kbd-hint' });
        kbdHint.createEl('kbd', { text: 'ESC', cls: 'diwa-sv-kbd' });

        // Scope bar
        this.scopeBar = topBarInner.createEl('div', { cls: 'diwa-sv-scope-bar', attr: { role: 'tablist' } });
        for (const scope of SEARCH_SCOPES) {
            const btn = this.scopeBar.createEl('button', {
                cls: `diwa-sv-scope-btn${scope.id === this.activeScope ? ' is-active' : ''}`,
                attr: { 'data-scope': scope.id, role: 'tab' }
            });
            btn.createEl('span', { text: scope.label });
            btn.createEl('span', { cls: 'diwa-sv-scope-count', text: '' });
            btn.addEventListener('click', () => this.setScope(scope.id));
        }

        // ── Results area ─────────────────────────────────────────
        this.resultsEl = root.createEl('div', {
            cls: 'diwa-sv-results',
            attr: { role: 'listbox', 'aria-live': 'polite' }
        });

        // Events
        this.inputEl.addEventListener('input', () => this.onQueryChange());
        this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));

        this.renderInitialState();
        requestAnimationFrame(() => this.inputEl.focus());
    }

    private setScope(scopeId: string) {
        this.activeScope = scopeId;
        this.scopeBar.querySelectorAll<HTMLElement>('.diwa-sv-scope-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.scope === scopeId);
        });
        this.onQueryChange(true);
        this.inputEl.focus();
    }

    private onQueryChange(immediate = false) {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        const run = () => {
            const query = this.inputEl.value.trim();
            if (query.length === 0) { this.renderInitialState(); return; }
            this.performSearch(query);
        };
        if (immediate) { run(); return; }
        this._debounceTimer = setTimeout(run, 120);
    }

    private onKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.moveFocus(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.moveFocus(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const idx = this.focusedIndex >= 0 ? this.focusedIndex : 0;
            if (this.allResults[idx]) this.activateResult(this.allResults[idx]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.inputEl.value = '';
            this.renderInitialState();
            this.inputEl.focus();
        }
    }

    private moveFocus(dir: number) {
        if (this.resultEls.length === 0) return;
        this.focusedIndex += dir;
        if (this.focusedIndex < -1) this.focusedIndex = this.resultEls.length - 1;
        if (this.focusedIndex >= this.resultEls.length) this.focusedIndex = -1;
        this.resultEls.forEach((el, i) => el.classList.toggle('is-focused', i === this.focusedIndex));
        if (this.focusedIndex >= 0) this.resultEls[this.focusedIndex].scrollIntoView({ block: 'nearest' });
    }

    private performSearch(query: string) {
        const fuzzy  = prepareFuzzySearch(query);
        const simple = prepareSimpleSearch(query);

        const allCandidates: RichResult[] = [];
        const counts: Record<string, number> = { all: 0, thought: 0, task: 0, due: 0, project: 0, habit: 0 };

        // Thoughts
        this.plugin.index.thoughtIndex.forEach(t => {
            const tR = fuzzy(t.title);
            const bR = simple(t.body || '');
            if (!tR && !bR) return;
            counts.thought++;
            allCandidates.push({
                type: 'thought', title: t.title,
                titleMatches: tR?.matches ?? null,
                body: t.body || '', bodyMatches: bR?.matches ?? null,
                score: (tR ? tR.score * 2 : 0) + (bR ? bR.score : 0),
                meta: this.relativeDate(t.created),
                filePath: t.filePath, tabId: 'timeline', id: t.filePath,
            });
        });

        // Gawa
        this.plugin.index.taskIndex.forEach(t => {
            const tR = fuzzy(t.title);
            const bR = simple(t.body || '');
            if (!tR && !bR) return;
            counts.task++;
            allCandidates.push({
                type: 'task', title: t.title,
                titleMatches: tR?.matches ?? null,
                body: t.body || '', bodyMatches: bR?.matches ?? null,
                score: (tR ? tR.score * 2 : 0) + (bR ? bR.score : 0),
                meta: t.due ? `Due ${t.due}` : this.relativeDate(t.created),
                filePath: t.filePath, tabId: 'review-gawa', id: t.filePath,
            });
        });

        // Dues
        this.plugin.index.dueIndex.forEach(d => {
            const tR = fuzzy(d.title);
            if (!tR) return;
            counts.due++;
            allCandidates.push({
                type: 'due', title: d.title,
                titleMatches: tR.matches,
                body: '', bodyMatches: null,
                score: tR.score * 2,
                meta: d.dueDate || '',
                filePath: d.path, tabId: 'dues', id: d.path,
            });
        });

        // Projects
        this.plugin.index.projectIndex.forEach(p => {
            const tR = fuzzy(p.name);
            const gR = simple(p.goal || '');
            if (!tR && !gR) return;
            counts.project++;
            allCandidates.push({
                type: 'project', title: p.name,
                titleMatches: tR?.matches ?? null,
                body: p.goal || '', bodyMatches: gR?.matches ?? null,
                score: (tR ? tR.score * 2 : 0) + (gR ? gR.score : 0),
                meta: p.status,
                filePath: p.filePath, tabId: 'projects', id: p.id,
            });
        });

        // Habits
        (this.plugin.settings.habits || []).forEach((h: any) => {
            const tR = fuzzy(h.name);
            if (!tR) return;
            counts.habit++;
            const done = this.plugin.index.habitStatusIndex.includes(h.id);
            allCandidates.push({
                type: 'habit', title: `${h.icon ?? ''} ${h.name}`.trim(),
                titleMatches: tR.matches,
                body: '', bodyMatches: null,
                score: tR.score * 2,
                meta: done ? '✓ Done today' : '',
                filePath: undefined, tabId: 'habits', id: h.id,
            });
        });

        counts.all = counts.thought + counts.task + counts.due + counts.project + counts.habit;

        // Sort by score desc
        allCandidates.sort((a, b) => b.score - a.score);

        // Filter by scope, cap at 100
        const display = (this.activeScope === 'all'
            ? allCandidates
            : allCandidates.filter(r => r.type === this.activeScope)
        ).slice(0, 100);

        this.allResults = display;
        this.updateCounts(counts);
        this.renderResultsDOM(display);
    }

    private updateCounts(counts: Record<string, number>) {
        this.scopeBar.querySelectorAll<HTMLElement>('.diwa-sv-scope-btn').forEach(btn => {
            const scope = btn.dataset.scope ?? 'all';
            const countEl = btn.querySelector<HTMLElement>('.diwa-sv-scope-count');
            if (countEl) {
                const n = counts[scope] ?? 0;
                countEl.textContent = n > 0 ? String(n) : '';
            }
        });
    }

    private renderResultsDOM(results: RichResult[]) {
        this.resultsEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;

        if (results.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Group by type (preserve score order within group)
        const grouped: Partial<Record<string, RichResult[]>> = {};
        for (const r of results) {
            if (!grouped[r.type]) grouped[r.type] = [];
            grouped[r.type]!.push(r);
        }

        for (const [type, items] of Object.entries(grouped)) {
            if (!items) continue;
            const section = this.resultsEl.createEl('div', { cls: 'diwa-sv-section', attr: { 'data-type': type } });
            const secHdr = section.createEl('div', { cls: 'diwa-sv-section-header' });
            const secIcon = secHdr.createEl('span', { cls: 'diwa-sv-section-icon' });
            setIcon(secIcon, SEARCH_TYPE_ICONS[type] ?? 'lucide-file');
            secHdr.createEl('span', {
                text: (type.charAt(0).toUpperCase() + type.slice(1)) + 's',
                cls: 'diwa-sv-section-label',
            });
            secHdr.createEl('span', { text: String(items.length), cls: 'diwa-sv-section-count' });

            for (const item of items) {
                const row = section.createEl('div', {
                    cls: 'diwa-sv-result-row',
                    attr: { role: 'option', 'aria-selected': 'false' },
                });

                const rowIcon = row.createEl('div', { cls: `diwa-sv-result-icon diwa-sv-result-icon--${item.type}` });
                setIcon(rowIcon, SEARCH_TYPE_ICONS[item.type] ?? 'lucide-file');

                const body = row.createEl('div', { cls: 'diwa-sv-result-body' });

                // Title with match highlights
                const titleEl = body.createEl('span', { cls: 'diwa-sv-result-title' });
                renderMatches(titleEl, item.title, item.titleMatches);

                // Body snippet with match highlights
                if (item.body && item.bodyMatches && item.bodyMatches.length > 0) {
                    const [matchStart] = item.bodyMatches[0];
                    const snippetStart = Math.max(0, matchStart - 40);
                    const snippet = item.body.slice(snippetStart, snippetStart + 120);
                    const snippetEl = body.createEl('span', { cls: 'diwa-sv-result-snippet' });
                    renderMatches(snippetEl, snippet, item.bodyMatches, snippetStart);
                } else if (item.body) {
                    body.createEl('span', { text: item.body.slice(0, 80), cls: 'diwa-sv-result-snippet' });
                }

                if (item.meta) {
                    row.createEl('span', { text: item.meta, cls: 'diwa-sv-result-meta' });
                }

                row.addEventListener('click', () => this.activateResult(item));
                this.resultEls.push(row);
            }
        }
    }

    private async activateResult(result: RichResult) {
        if (result.filePath) {
            const file = this.app.vault.getAbstractFileByPath(result.filePath);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
                return;
            }
        }
        // Fallback: navigate MINA view tab (habits + unresolved paths)
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
        if (leaves.length > 0) {
            const view = leaves[0].view as any;
            this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
            view.activeTab = result.tabId;
            view.renderView();
        } else {
            this.plugin.activateView(result.tabId, false);
        }
    }

    private renderInitialState() {
        this.resultsEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;
        this.allResults = [];

        // Reset count badges
        this.scopeBar.querySelectorAll<HTMLElement>('.diwa-sv-scope-count').forEach(el => { el.textContent = ''; });

        const initial = this.resultsEl.createEl('div', { cls: 'diwa-sv-initial' });
        initial.createEl('span', { text: 'Quick Jump', cls: 'diwa-sv-quickjump-label' });

        const grid = initial.createEl('div', { cls: 'diwa-sv-quickjump-grid' });
        for (const tab of SEARCH_QUICKJUMP_TABS) {
            const btn = grid.createEl('button', { cls: 'diwa-sv-quickjump-btn', attr: { 'data-tab': tab.id } });
            const ic = btn.createEl('span', { cls: 'diwa-sv-quickjump-icon' });
            setIcon(ic, tab.icon);
            btn.createEl('span', { text: tab.label, cls: 'diwa-sv-quickjump-label-text' });
            btn.addEventListener('click', () => this.plugin.activateView(tab.id, false));
        }
    }

    private renderEmptyState() {
        const empty = this.resultsEl.createEl('div', { cls: 'diwa-sv-empty' });
        const ic = empty.createEl('span', { cls: 'diwa-sv-empty-icon' });
        setIcon(ic, 'lucide-search-x');
        const query = this.inputEl?.value ?? '';
        empty.createEl('span', { text: `No results for "${query}"`, cls: 'diwa-sv-empty-text' });
        empty.createEl('span', { text: 'Try a different term or switch scope to All.', cls: 'diwa-sv-empty-sub' });
    }

    private relativeDate(dateStr: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const diffMs = Date.now() - d.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return dateStr.slice(0, 10);
    }
}

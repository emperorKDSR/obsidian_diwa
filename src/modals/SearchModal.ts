import { App, Modal, setIcon, Platform, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';
import { VIEW_TYPE_DIWA, SEARCH_SCOPES, SEARCH_TYPE_ICONS, SEARCH_QUICKJUMP_TABS } from '../constants';

interface SearchResult {
    type: 'thought' | 'task' | 'due' | 'project';
    title: string;
    preview: string;
    meta: string;
    filePath?: string;
    tabId: string;
    id: string;
}

const SCOPE_ALL = 'all';

export class SearchModal extends Modal {
    private plugin: DiwaPlugin;
    private inputEl: HTMLInputElement;
    private bodyEl: HTMLElement;
    private scopeBar: HTMLElement;
    private activeScope: string = SCOPE_ALL;
    private focusedIndex: number = -1;
    private resultEls: HTMLElement[] = [];
    private allResults: SearchResult[] = [];
    private panelEl: HTMLElement;
    private viewportResizeHandler: (() => void) | null = null;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { modalEl } = this;
        const isPhone = Platform.isMobile && !isTablet();

        modalEl.empty();
        modalEl.addClass('diwa-search-overlay');

        if (isPhone) {
            modalEl.addClass('diwa-search-phone');
            document.body.addClass('diwa-search-phone-open');
        }

        this.panelEl = modalEl.createEl('div', {
            cls: 'diwa-search-panel',
            attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DIWA Global Search' }
        });

        // Input row
        const inputRow = this.panelEl.createEl('div', { cls: 'diwa-search-input-row' });

        if (isPhone) {
            const backBtn = inputRow.createEl('span', { cls: 'diwa-search-back-btn' });
            setIcon(backBtn, 'lucide-arrow-left');
            backBtn.addEventListener('click', () => this.closeWithAnimation());
        } else {
            const iconEl = inputRow.createEl('span', { cls: 'diwa-search-icon' });
            setIcon(iconEl, 'lucide-search');
        }

        this.inputEl = inputRow.createEl('input', {
            cls: 'diwa-search-input',
            attr: {
                type: 'text',
                placeholder: isPhone ? 'Search DIWA…' : 'Search across all of DIWA…',
                autocomplete: 'off',
                spellcheck: 'false',
                ...(isPhone ? { style: 'font-size:16px' } : {})
            }
        });

        if (isPhone) {
            const clearBtn = inputRow.createEl('span', { cls: 'diwa-search-clear-btn' });
            setIcon(clearBtn, 'lucide-x-circle');
            clearBtn.addEventListener('click', () => {
                this.inputEl.value = '';
                this.onQueryChange();
                this.inputEl.focus();
            });
        } else {
            inputRow.createEl('span', { cls: 'diwa-search-kbd-hint', text: 'ESC' });
        }

        // Scope bar
        this.scopeBar = this.panelEl.createEl('div', { cls: 'diwa-search-scope-bar', attr: { role: 'tablist' } });
        for (const scope of SEARCH_SCOPES) {
            const btn = this.scopeBar.createEl('button', {
                cls: `diwa-search-scope-btn${scope.id === this.activeScope ? ' is-active' : ''}`,
                attr: { 'data-scope': scope.id }
            });
            btn.createEl('span', { text: scope.label });
            btn.createEl('span', { cls: 'diwa-search-scope-count', text: '0' });
            btn.addEventListener('click', () => this.setScope(scope.id));
        }

        // Body
        this.bodyEl = this.panelEl.createEl('div', { cls: 'diwa-search-body', attr: { role: 'listbox', 'aria-live': 'polite' } });

        // Footer (desktop / tablet only)
        if (!Platform.isMobile || isTablet()) {
            const footer = this.panelEl.createEl('div', { cls: 'diwa-search-footer' });
            const hints: [string, string][] = [['↑↓', 'Navigate'], ['↵', 'Open'], ['ESC', 'Close']];
            hints.forEach(([key, label], i) => {
                if (i > 0) footer.createEl('div', { cls: 'diwa-search-footer-divider' });
                const hint = footer.createEl('div', { cls: 'diwa-search-footer-hint' });
                hint.createEl('kbd', { cls: 'diwa-search-footer-kbd', text: key });
                hint.createEl('span', { text: ` ${label}` });
            });
        }

        // Events
        this.inputEl.addEventListener('input', () => this.onQueryChange());
        this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));

        if (!isPhone) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) this.closeWithAnimation();
            });
        }

        if (isPhone) {
            this.attachSwipeToDismiss();
            this.attachKeyboardCompensation();
        }

        this.renderInitialState();
        setTimeout(() => this.inputEl.focus(), 80);
    }

    onClose() {
        this.modalEl.removeClass('diwa-search-overlay');
        this.modalEl.removeClass('diwa-search-phone');
        document.body.removeClass('diwa-search-phone-open');
        if (this.viewportResizeHandler && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this.viewportResizeHandler);
            this.viewportResizeHandler = null;
        }
    }

    private closeWithAnimation() {
        this.modalEl.addClass('is-closing');
        setTimeout(() => this.close(), 185);
    }

    private attachSwipeToDismiss() {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        this.panelEl.addEventListener('touchstart', (e: TouchEvent) => {
            if ((e.target as HTMLElement).closest('.diwa-search-body')) return;
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        this.panelEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const delta = currentY - startY;
            if (delta > 0) {
                const resistance = delta < 80 ? delta : 80 + (delta - 80) * 0.3;
                this.panelEl.style.transform = `translateY(${resistance}px)`;
                this.panelEl.style.transition = 'none';
            }
        }, { passive: true });

        this.panelEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const delta = currentY - startY;
            if (delta > 80) {
                this.closeWithAnimation();
            } else {
                this.panelEl.addClass('diwa-search-snapping-back');
                this.panelEl.style.transform = '';
                this.panelEl.style.transition = '';
                setTimeout(() => {
                    if (this.panelEl) this.panelEl.removeClass('diwa-search-snapping-back');
                }, 320);
            }
            currentY = 0; startY = 0;
        });
    }

    private attachKeyboardCompensation() {
        if (!window.visualViewport) return;
        const adjust = () => {
            const keyboardHeight = window.innerHeight - (window.visualViewport!.height);
            if (keyboardHeight > 50) {
                this.bodyEl.style.paddingBottom = `${keyboardHeight + 24}px`;
            } else {
                this.bodyEl.style.paddingBottom = '';
            }
        };
        this.viewportResizeHandler = adjust;
        window.visualViewport.addEventListener('resize', adjust);
    }

    private setScope(scopeId: string) {
        this.activeScope = scopeId;
        this.scopeBar.querySelectorAll('.diwa-search-scope-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-scope') === scopeId);
        });
        this.onQueryChange();
        this.inputEl.focus();
    }

    private onQueryChange() {
        const query = this.inputEl.value.trim().toLowerCase();
        this.panelEl.classList.toggle('has-query', query.length > 0);
        if (query.length === 0) {
            this.renderInitialState();
            return;
        }
        this.performSearch(query);
    }

    private onKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.moveFocus(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.moveFocus(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.focusedIndex >= 0 && this.focusedIndex < this.allResults.length) {
                this.activateResult(this.allResults[this.focusedIndex]);
            } else if (this.allResults.length > 0) {
                this.activateResult(this.allResults[0]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeWithAnimation();
        }
    }

    private moveFocus(dir: number) {
        if (this.resultEls.length === 0) return;
        this.focusedIndex += dir;
        if (this.focusedIndex < -1) this.focusedIndex = this.resultEls.length - 1;
        if (this.focusedIndex >= this.resultEls.length) this.focusedIndex = -1;
        this.resultEls.forEach((el, i) => el.classList.toggle('is-focused', i === this.focusedIndex));
        if (this.focusedIndex >= 0) {
            this.resultEls[this.focusedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    private activateResult(result: SearchResult) {
        this.close();
        // Use setTimeout to let the modal fully close before opening the result
        setTimeout(() => {
            void (async () => {
                if (result.filePath) {
                    const file = this.app.vault.getAbstractFileByPath(result.filePath);
                    if (file instanceof TFile) {
                        const leaf = this.app.workspace.getLeaf(false);
                        await leaf.openFile(file);
                        return;
                    }
                }
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
                if (leaves.length > 0) {
                    const view = leaves[0].view as any;
                    this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
                    view.activeTab = result.tabId;
                    view.renderView();
                } else {
                    await this.plugin.activateView(result.tabId, false);
                }
            })();
        }, 50);
    }

    private performSearch(query: string) {
        const index = this.plugin.index;
        const results: SearchResult[] = [];
        const counts: Record<string, number> = { all: 0, thought: 0, task: 0, due: 0, project: 0 };

        // Search thoughts
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'thought') {
            index.thoughtIndex.forEach(t => {
                if (t.title.toLowerCase().includes(query) || t.body.toLowerCase().includes(query)) {
                    counts.thought++;
                    if (results.filter(r => r.type === 'thought').length < 5) {
                        results.push({
                            type: 'thought', title: t.title, preview: t.context.join(', ') || t.body.slice(0, 60),
                            meta: this.relativeDate(t.created), filePath: t.filePath, tabId: 'home', id: t.filePath
                        });
                    }
                }
            });
        }

        // Search tasks
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'task') {
            index.taskIndex.forEach(t => {
                if (t.title.toLowerCase().includes(query) || t.body.toLowerCase().includes(query)) {
                    counts.task++;
                    if (results.filter(r => r.type === 'task').length < 5) {
                        results.push({
                            type: 'task', title: t.title, preview: t.project || t.context.join(', '),
                            meta: t.due ? `Due: ${t.due}` : this.relativeDate(t.created), filePath: t.filePath, tabId: 'review-gawa', id: t.filePath
                        });
                    }
                }
            });
        }

        // Search dues
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'due') {
            index.dueIndex.forEach(d => {
                if (d.title.toLowerCase().includes(query)) {
                    counts.due++;
                    if (results.filter(r => r.type === 'due').length < 5) {
                        results.push({
                            type: 'due', title: d.title, preview: d.amount ? `$${d.amount}` : '',
                            meta: d.dueDate || '', filePath: d.path, tabId: 'dues', id: d.path
                        });
                    }
                }
            });
        }

        // Search projects
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'project') {
            index.projectIndex.forEach(p => {
                if (p.name.toLowerCase().includes(query) || p.goal.toLowerCase().includes(query)) {
                    counts.project++;
                    if (results.filter(r => r.type === 'project').length < 5) {
                        results.push({
                            type: 'project', title: p.name, preview: p.goal.slice(0, 60),
                            meta: p.status, filePath: p.filePath, tabId: 'projects', id: p.id
                        });
                    }
                }
            });
        }

        counts.all = counts.thought + counts.task + counts.due + counts.project;
        this.allResults = results;

        // Update scope counts
        this.scopeBar.querySelectorAll('.diwa-search-scope-btn').forEach(btn => {
            const scope = btn.getAttribute('data-scope') || 'all';
            const countEl = btn.querySelector('.diwa-search-scope-count') as HTMLElement;
            if (countEl) countEl.textContent = String(counts[scope] || 0);
        });

        this.renderResults(results, query);
    }

    private renderResults(results: SearchResult[], query: string) {
        this.bodyEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;

        if (results.length === 0) {
            this.renderEmptyState(query);
            return;
        }

        // Group by type
        const grouped: Record<string, SearchResult[]> = {};
        for (const r of results) {
            if (!grouped[r.type]) grouped[r.type] = [];
            grouped[r.type].push(r);
        }

        for (const [type, items] of Object.entries(grouped)) {
            const section = this.bodyEl.createEl('div', { cls: 'diwa-search-section' });
            const header = section.createEl('div', { cls: 'diwa-search-section-header' });
            const typeIcon = header.createEl('span', { cls: 'diwa-search-section-type-icon' });
            setIcon(typeIcon, SEARCH_TYPE_ICONS[type] || 'lucide-file');
            header.createEl('span', { cls: 'diwa-search-section-type-label', text: type.charAt(0).toUpperCase() + type.slice(1) + 's' });
            header.createEl('span', { cls: 'diwa-search-section-result-count', text: String(items.length) });

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const row = section.createEl('div', {
                    cls: 'diwa-search-result-item',
                    attr: { role: 'option', 'aria-selected': 'false', style: `--diwa-search-i: ${Math.min(this.resultEls.length, 5)}` }
                });

                const iconWrap = row.createEl('div', { cls: `diwa-search-result-icon diwa-search-result-icon--${item.type}` });
                setIcon(iconWrap, SEARCH_TYPE_ICONS[item.type] || 'lucide-file');

                const body = row.createEl('div', { cls: 'diwa-search-result-body' });
                const titleEl = body.createEl('span', { cls: 'diwa-search-result-title' });
                titleEl.innerHTML = this.highlightMatch(item.title, query);
                if (item.preview) {
                    body.createEl('span', { cls: 'diwa-search-result-preview', text: item.preview });
                }

                if (item.meta) {
                    const meta = row.createEl('div', { cls: 'diwa-search-result-meta' });
                    meta.createEl('span', { cls: 'diwa-chip diwa-chip--date', text: item.meta });
                }

                row.addEventListener('click', () => this.activateResult(item));
                this.resultEls.push(row);
            }
        }
    }

    private renderInitialState() {
        this.bodyEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;
        this.allResults = [];

        const initial = this.bodyEl.createEl('div', { cls: 'diwa-search-initial' });
        initial.createEl('span', { cls: 'diwa-search-recents-label', text: 'Quick Jump' });

        const grid = initial.createEl('div', { cls: 'diwa-search-quickjump-grid' });
        for (const tab of SEARCH_QUICKJUMP_TABS) {
            const btn = grid.createEl('button', { cls: 'diwa-search-quickjump-btn', attr: { 'data-tab': tab.id } });
            const icon = btn.createEl('span', { cls: 'svg-icon' });
            setIcon(icon, tab.icon);
            btn.createEl('span', { cls: 'diwa-search-quickjump-label', text: tab.label });
            btn.addEventListener('click', () => {
                this.close();
                setTimeout(() => {
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
                    if (leaves.length > 0) {
                        const view = leaves[0].view as any;
                        this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
                        view.activeTab = tab.id;
                        view.renderView();
                    }
                }, 50);
            });
        }

        // Reset scope counts
        this.scopeBar.querySelectorAll('.diwa-search-scope-count').forEach(el => { (el as HTMLElement).textContent = '0'; });
    }

    private renderEmptyState(query: string) {
        const empty = this.bodyEl.createEl('div', { cls: 'diwa-search-empty' });
        const icon = empty.createEl('span', { cls: 'diwa-search-empty-icon' });
        setIcon(icon, 'lucide-search-x');
        const text = empty.createEl('span', { cls: 'diwa-search-empty-text' });
        text.innerHTML = `No results for <span class="diwa-search-empty-query">"${this.escapeHtml(query)}"</span>`;
        empty.createEl('span', { cls: 'diwa-search-empty-sub', text: 'Try searching by title, tag, or date — or switch scope to All.' });
    }

    private highlightMatch(text: string, query: string): string {
        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private relativeDate(dateStr: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return dateStr.split(' ')[0];
    }
}

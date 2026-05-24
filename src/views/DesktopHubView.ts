import { ItemView, WorkspaceLeaf, setIcon, Notice, ViewStateResult } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DIWA,
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
} from '../constants';
import { attachInlineTriggers, isTablet } from '../utils';
import type { TaskEntry, ThoughtEntry } from '../types';
import { DesktopTaskPaneView } from './DesktopTaskPane';
import { TaskController } from './TaskController';
import { ThoughtController } from './ThoughtController';

export class DesktopHubView extends ItemView {
    plugin: DiwaPlugin;
    isFocusMode: boolean = true;

    // Suppress re-renders while user is mid-capture (thought or task)
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Task panel filter: 'upcoming' = next 2 days + undated; 'all' = everything
    _taskFilter: 'upcoming' | 'all' = 'upcoming';

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;
    private _wrapEl: HTMLElement | null = null;
    private _topBarEl: HTMLElement | null = null;
    private _sidebarEl: HTMLElement | null = null;
    private _centerEl: HTMLElement | null = null;
    private _rightEl: HTMLElement | null = null;
    private _taskPaneView: DesktopTaskPaneView | null = null;
    private _taskController: TaskController;
    private _thoughtController: ThoughtController;
    private _captureSectionEl: HTMLElement | null = null;
    private _captureInputEl: HTMLTextAreaElement | null = null;
    private _captureHintEl: HTMLElement | null = null;

    // Feed state
    private _feedEl: HTMLElement | null = null;
    private _feedEmptyEl: HTMLElement | null = null;
    private _feedScope: 'today' | 'all' = 'today';
    private _activeContext: string = 'all';
    private _feedRowMap = new Map<string, { rootEl: HTMLElement; textEl: HTMLElement; timeEl: HTMLElement; ctxEl: HTMLElement; sig: string }>();
    private _thoughtUnsubscribe: (() => void) | null = null;
    private _feedRafId: number | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this._taskController = plugin.getTaskController();
        this._thoughtController = plugin.getThoughtController();
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    getState(): Record<string, unknown> {
        return { isFocusMode: this.isFocusMode };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this._thoughtUnsubscribe = this._thoughtController.subscribe(() => {
            this.scheduleFeedRefresh();
        });
        this.renderView();
    }

    async onClose() {
        this._closed = true;
        this._thoughtUnsubscribe?.();
        this._thoughtUnsubscribe = null;
        if (this._feedRafId !== null) { cancelAnimationFrame(this._feedRafId); this._feedRafId = null; }
        this.resetLayoutRefs();
    }

    renderView() {
        if (this._capturePending > 0 || this._taskPending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.addClass('diwa-dh-root');
        root.addClass('diwa-workspace-root');
        root.removeClass('diwa-skin--desktop');
        root.removeClass('diwa-skin--tablet');
        root.removeClass('diwa-skin--mobile');
        root.addClass(this.getWorkspaceSkinClass());
        root.toggleClass('is-tablet', isTablet());

        if (this.isMobile()) {
            this.applyMobileLayout(root);
            return;
        }
        this.applyDesktopLayout(root);
    }

    protected getWorkspaceSkinClass(): string {
        return 'diwa-skin--desktop';
    }

    private isMobile(): boolean {
        return this.plugin.isMobile() && !isTablet();
    }

    private applyDesktopLayout(root: HTMLElement): void {
        this._wrapEl?.removeClass('is-mobile-layout');

        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }

        this._wrapEl?.toggleClass('is-focus-mode', this.isFocusMode);

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }

        if (this._centerEl) {
            this.renderCenter(this._centerEl);
        }

        this.updateTaskPaneFromIndex();
    }

    private applyMobileLayout(root: HTMLElement): void {
        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }
        this._wrapEl?.addClass('is-mobile-layout');
        this._wrapEl?.removeClass('is-focus-mode');

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }
        if (this._centerEl) {
            this.renderCenter(this._centerEl);
        }
    }

    updateTaskPaneFromIndex(): void {
        this._taskController.syncFromIndex();
    }

    private buildStableLayout(root: HTMLElement): void {
        this.resetLayoutRefs();
        root.empty();

        this._wrapEl = root.createEl('div', { cls: 'diwa-dh-wrap' });
        this._topBarEl = this._wrapEl.createEl('div', { cls: 'diwa-dh-topbar' });

        const cols = this._wrapEl.createEl('div', { cls: 'diwa-dh-cols' });
        this._sidebarEl = cols.createEl('nav', { cls: 'diwa-dh-sidebar', attr: { 'aria-label': 'DIWA Navigation' } });
        this.renderSidebar(this._sidebarEl);

        this._centerEl = cols.createEl('div', { cls: 'diwa-dh-center' });
        this._rightEl = cols.createEl('div', { cls: 'diwa-dh-right' });
        this.mountTaskPane(this._rightEl);
    }

    private resetLayoutRefs(): void {
        this._taskPaneView?.destroy();
        this._wrapEl = null;
        this._topBarEl = null;
        this._sidebarEl = null;
        this._centerEl = null;
        this._rightEl = null;
        this._taskPaneView = null;
        this._captureSectionEl = null;
        this._captureInputEl = null;
        this._captureHintEl = null;
        this._feedEl = null;
        this._feedEmptyEl = null;
        this._feedRowMap.clear();
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent;

        const left = bar.createEl('div', { cls: 'diwa-dh-topbar-left' });
        left.createEl('span', { text: 'DIWA', cls: 'diwa-dh-topbar-logo' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        left.createEl('span', { text: `${greeting}, Emperor.`, cls: 'diwa-dh-topbar-greeting' });

        const center = bar.createEl('div', { cls: 'diwa-dh-topbar-center' });
        center.createEl('span', {
            text: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(),
            cls: 'diwa-dh-topbar-date'
        });
        const northStar = this.plugin.settings.northStarGoals?.[0];
        if (northStar) {
            center.createEl('span', { text: `★ ${northStar}`, cls: 'diwa-dh-topbar-northstar' });
        }

        const right = bar.createEl('div', { cls: 'diwa-dh-topbar-right' });

        const focusBtn = right.createEl('button', {
            cls: `diwa-dh-focus-btn${this.isFocusMode ? ' is-active' : ''}`,
            attr: { title: this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode' }
        });
        const focusIcon = focusBtn.createDiv({ cls: 'diwa-dh-focus-btn-icon' });
        setIcon(focusIcon, 'lucide-target');
        focusBtn.createSpan({ text: this.isFocusMode ? 'EXIT FOCUS' : 'FOCUS MODE' });
        focusBtn.addEventListener('click', () => {
            this.isFocusMode = !this.isFocusMode;
            this.renderView();
        });
    }

    // ── LEFT Sidebar ──────────────────────────────────────────────────────────
    private renderSidebar(parent: HTMLElement) {
        const sidebar = parent;

        const groups: { title: string; items: { label: string; icon: string; tab: string }[] }[] = [
            {
                title: 'ACTION',
                items: [
                    { label: 'Search', icon: 'lucide-search', tab: 'search' },
                    { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
                    { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
                    { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' },
                ],
            },
            {
                title: 'MANAGE',
                items: [
                    { label: 'Gawa', icon: 'lucide-check-square-2', tab: 'review-gawa' },
                    { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' },
                    { label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' },
                    { label: 'Calendar', icon: 'lucide-calendar', tab: 'calendar' },
                    { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
                    { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' },
                ],
            },
            {
                title: 'FEATURES',
                items: [
                    { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'diwa-ai' },
                    { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' },
                    { label: 'Habits', icon: 'lucide-flame', tab: 'habits' },
                ],
            },
            {
                title: 'SYSTEM',
                items: [
                    { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
                    { label: 'Manual', icon: 'lucide-book-open', tab: 'manual' },
                ],
            },
        ];

        for (const group of groups) {
            const groupEl = sidebar.createEl('div', { cls: 'diwa-dh-nav-group' });
            groupEl.createEl('span', { text: group.title, cls: 'diwa-dh-nav-group-label' });
            for (const item of group.items) {
                const btn = groupEl.createEl('button', {
                    cls: 'diwa-dh-nav-item',
                    attr: { title: item.label, 'aria-label': item.label }
                });
                const iconWrap = btn.createEl('span', { cls: 'diwa-dh-nav-icon' });
                setIcon(iconWrap, item.icon);
                btn.createEl('span', { text: item.label, cls: 'diwa-dh-nav-label' });
                btn.addEventListener('click', () => {
                    if (item.tab === 'search') { this.plugin.activateSearchView(); }
                    else { this.plugin.activateView(item.tab, false); }
                });
            }
        }
    }

    // ── CENTER Column ─────────────────────────────────────────────────────────
    private renderCenter(parent: HTMLElement) {
        if (!this._captureSectionEl || !parent.contains(this._captureSectionEl)) {
            this._captureSectionEl = parent.createEl('div', { cls: 'diwa-dh-capture-section' });
            this.renderCapture(this._captureSectionEl);
            this.renderContextFilter(this._captureSectionEl);
        }
        if (!this._feedEl || !parent.contains(this._feedEl)) {
            const feedWrap = parent.createEl('div', { cls: 'diwa-dh-feed-wrap' });
            this._feedEl = feedWrap.createEl('div', { cls: 'diwa-dh-feed-list' });
            this._feedEmptyEl = feedWrap.createEl('div', { cls: 'diwa-dh-feed-empty', text: 'Nothing captured yet.' });
        }
        // Always schedule a refresh — on first open the index may not be ready yet;
        // subsequent renderView() calls (e.g. after onLayoutReady hydrates the index)
        // must also repopulate the feed. RAF debounce makes extra calls free.
        this.scheduleFeedRefresh();
    }

    private renderContextFilter(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'diwa-dh-ctx-filter-bar' });

        const chipsEl = bar.createEl('div', { cls: 'diwa-dh-ctx-chips' });
        const scopeEl = bar.createEl('div', { cls: 'diwa-dh-scope-pills' });

        const renderChips = () => {
            chipsEl.empty();
            const contexts = this.plugin.settings.contexts ?? [];
            const all = ['all', ...contexts];
            for (const ctx of all) {
                const label = ctx === 'all' ? 'All' : `#${ctx}`;
                const chip = chipsEl.createEl('button', {
                    cls: `diwa-dh-ctx-chip${this._activeContext === ctx ? ' is-active' : ''}`,
                    text: label,
                    attr: { type: 'button' },
                });
                chip.addEventListener('click', () => {
                    this._activeContext = ctx;
                    renderChips();
                    this.scheduleFeedRefresh();
                });
            }
        };
        renderChips();

        const scopes: Array<{ key: 'today' | 'all'; label: string }> = [
            { key: 'today', label: 'Today' },
            { key: 'all', label: 'All' },
        ];
        for (const s of scopes) {
            const btn = scopeEl.createEl('button', {
                cls: `diwa-dh-scope-pill${this._feedScope === s.key ? ' is-active' : ''}`,
                text: s.label,
                attr: { type: 'button' },
            });
            btn.addEventListener('click', () => {
                this._feedScope = s.key;
                for (const el of Array.from(scopeEl.querySelectorAll<HTMLElement>('.diwa-dh-scope-pill'))) {
                    el.toggleClass('is-active', el.textContent === s.label);
                }
                this.scheduleFeedRefresh();
            });
        }
    }

    // ── Feed ──────────────────────────────────────────────────────────────────
    private scheduleFeedRefresh(): void {
        if (this._feedRafId !== null) return;
        this._feedRafId = window.requestAnimationFrame(() => {
            this._feedRafId = null;
            this.patchFeed();
        });
    }

    private patchFeed(): void {
        if (!this._feedEl || this._closed) return;

        const today = new Date().toISOString().slice(0, 10);
        let thoughts = this._thoughtController.getAllThoughts().filter(t => !t.archived);

        if (this._activeContext !== 'all') {
            const ctxLow = this._activeContext.toLowerCase();
            thoughts = thoughts.filter(t => (t.context ?? []).some(c => c.toLowerCase() === ctxLow));
        }
        if (this._feedScope === 'today') {
            thoughts = thoughts.filter(t => t.day === today);
        }

        // Newest first
        thoughts = [...thoughts].sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));

        const seen = new Set<string>();
        for (const thought of thoughts) {
            const id = thought.id || thought.filePath;
            seen.add(id);
            const sig = `${thought.created}|${thought.modified}|${thought.updatedAt}|${(thought.context ?? []).join(',')}|${thought.body || thought.content || thought.title}`;

            let row = this._feedRowMap.get(id);
            if (!row) {
                const rootEl = this._feedEl.createEl('div', { cls: 'diwa-dh-thought-row' });
                rootEl.dataset.id = id;
                const leftEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-left' });
                const timeEl = leftEl.createEl('span', { cls: 'diwa-dh-thought-row-time' });
                const bodyEl = rootEl.createEl('div', { cls: 'diwa-dh-thought-row-body' });
                const textEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-text' });
                const ctxEl = bodyEl.createEl('div', { cls: 'diwa-dh-thought-row-ctx' });
                const archiveBtn = rootEl.createEl('button', {
                    cls: 'diwa-dh-thought-row-archive',
                    attr: { type: 'button', title: 'Archive', 'aria-label': 'Archive' },
                }) as HTMLButtonElement;
                setIcon(archiveBtn, 'archive');
                archiveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const t = this._thoughtController.getThought(id);
                    if (t) await this._thoughtController.setArchived(id, true);
                });
                row = { rootEl, textEl, timeEl, ctxEl, sig: '' };
                this._feedRowMap.set(id, row);
            }

            if (row.sig !== sig) {
                row.timeEl.setText(this.formatThoughtTime(thought));
                row.textEl.setText(thought.body || thought.content || thought.title || '');
                row.ctxEl.empty();
                for (const ctx of (thought.context ?? [])) {
                    row.ctxEl.createEl('span', { cls: 'diwa-dh-thought-ctx-badge', text: `#${ctx}` });
                }
                row.sig = sig;
            }
        }

        // Remove rows no longer in set
        for (const [id, row] of this._feedRowMap) {
            if (!seen.has(id)) {
                row.rootEl.remove();
                this._feedRowMap.delete(id);
            }
        }

        // Enforce display order
        thoughts.forEach((t, i) => {
            const row = this._feedRowMap.get(t.id || t.filePath);
            if (!row) return;
            if (this._feedEl!.children[i] !== row.rootEl) {
                this._feedEl!.insertBefore(row.rootEl, this._feedEl!.children[i] ?? null);
            }
        });

        const hasVisible = seen.size > 0;
        if (this._feedEmptyEl) {
            this._feedEmptyEl.style.display = hasVisible ? 'none' : '';
            if (!hasVisible) {
                this._feedEmptyEl.setText(
                    this._feedScope === 'today' ? 'Nothing captured today.' : 'No thoughts yet.'
                );
            }
        }
    }

    private formatThoughtTime(t: ThoughtEntry): string {
        if (!t.created) return '';
        const today = new Date().toISOString().slice(0, 10);
        const isToday = t.day === today;
        const timeStr = (t.created ?? '').slice(11, 16); // "HH:mm"
        if (isToday) return timeStr;
        const dateStr = (t.created ?? '').slice(5, 10).replace('-', '/'); // "MM/DD"
        return `${dateStr} ${timeStr}`;
    }

    private renderCapture(parent: HTMLElement) {
        if (!this._captureInputEl) {
            parent.empty();
            const capture = parent.createEl('div', { cls: 'diwa-dh-capture diwa-capture-bar' });
            const textarea = capture.createEl('textarea', {
                cls: 'diwa-dh-capture-textarea',
                attr: { rows: '2', placeholder: 'Think here...' },
            }) as HTMLTextAreaElement;
            const contextHint = capture.createEl('div', { cls: 'diwa-dh-capture-hint' });
            this._captureInputEl = textarea;
            this._captureHintEl = contextHint;
            this._captureHintEl.setText('Enter → save  •  Shift+Enter → multiline');

            const autosize = () => {
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
            };
            textarea.addEventListener('input', autosize);
            requestAnimationFrame(autosize);
            capture.addEventListener('click', (event) => {
                const target = event.target as HTMLElement | null;
                if (!target) return;
                if (
                    target.closest('.diwa-chip')
                    || target.closest('.diwa-dh-chip')
                    || target.closest('.diwa-capture-desktop-chip-area')
                    || target.closest('button')
                    || target.closest('a')
                    || target.closest('[role="button"]')
                ) return;
                textarea.focus();
            });
            attachInlineTriggers(
                this.app,
                textarea,
                () => {},
                undefined,
                undefined,
                this.plugin.settings.peopleFolder,
            );

            textarea.addEventListener('keydown', async (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    textarea.value = '';
                    autosize();
                    return;
                }
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                const raw = textarea.value;
                if (!raw.trim()) return;
                this._capturePending++;
                textarea.disabled = true;
                try {
                    const created = await this._thoughtController.addThought({ content: raw, context: [] });
                    if (!created) {
                        new Notice('Error saving thought — please try again', 2500);
                        return;
                    }
                    textarea.value = '';
                    autosize();
                    new Notice('✦ Thought saved', 1200);
                } finally {
                    this._capturePending = Math.max(0, this._capturePending - 1);
                    textarea.disabled = false;
                }
            });
        }
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private mountTaskPane(parent: HTMLElement) {
        this._taskPaneView = new DesktopTaskPaneView(this, parent, this._taskController);
        this._taskPaneView.mount();
    }
}

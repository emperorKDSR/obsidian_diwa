import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult, MarkdownRenderer, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DIWA,
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
} from '../constants';
import { attachInlineTriggers } from '../utils';
import type { ThoughtEntry, TaskEntry } from '../types';
import type { DiwaView } from '../view';
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

    // Center pane context tab + scope
    _activeContextTab: string = 'all';
    _feedScope: 'today' | 'all' = 'today';

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
    private _thoughtSearchQuery: string = '';

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this._taskController = plugin.getTaskController();
        this._thoughtController = plugin.getThoughtController();
        console.log('[DIWA] DesktopHub controller ref:', this._taskController);
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'DIWA Desktop Hub'; }
    getIcon(): string { return 'layout-dashboard'; }

    getState(): Record<string, unknown> {
        return { isFocusMode: this.isFocusMode, activeContextTab: this._activeContextTab, feedScope: this._feedScope };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        if (state?.activeContextTab !== undefined) this._activeContextTab = String(state.activeContextTab);
        if (state?.feedScope === 'all' || state?.feedScope === 'today') this._feedScope = state.feedScope;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header (same pattern as DiwaView src/view.ts:128-132)
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        this._closed = true;
        this.resetLayoutRefs();
    }

    async renderView() {
        if (this._capturePending > 0 || this._taskPending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.addClass('diwa-dh-root');

        if (!Platform.isDesktop) {
            this.resetLayoutRefs();
            root.empty();
            root.createEl('div', {
                text: '⊕ DIWA Desktop Hub requires a desktop environment.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }

        if (!this._wrapEl || !root.contains(this._wrapEl)) {
            this.buildStableLayout(root);
        }

        this._wrapEl?.toggleClass('is-focus-mode', this.isFocusMode);

        if (this._topBarEl) {
            this._topBarEl.empty();
            this.renderTopBar(this._topBarEl);
        }

        if (this._centerEl) {
            this._centerEl.empty();
            await this.renderCenter(this._centerEl);
        }

        this.updateTaskPaneFromIndex();
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
            text: moment().format('dddd · MMMM D, YYYY').toUpperCase(),
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
    private async renderCenter(parent: HTMLElement) {
        const center = parent;
        const activeCtx = this._activeContextTab;
        this.renderCapture(center, activeCtx !== 'all' ? [activeCtx] : []);
        const inner = center.createEl('div', { cls: 'diwa-dh-center-inner' });
        this.renderContextTabs(inner);
        await this.renderFeed(inner);
    }

    private renderCapture(parent: HTMLElement, initialContexts: string[] = []) {
        const section = parent.createEl('div', { cls: 'diwa-dh-capture-section' });
        const capture = section.createEl('div', { cls: 'diwa-dh-capture' });
        const textarea = capture.createEl('textarea', {
            cls: 'diwa-dh-capture-textarea',
            attr: { rows: '2', placeholder: 'Think here…' },
        }) as HTMLTextAreaElement;
        const contextHint = capture.createEl('div', { cls: 'diwa-dh-capture-hint' });
        const activeContexts = initialContexts.length > 0 ? initialContexts.join(', ') : 'all contexts';
        contextHint.setText(`Enter to save • Shift+Enter newline • Esc clear • Scope: ${activeContexts}`);

        const autosize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
        };
        textarea.addEventListener('input', autosize);
        requestAnimationFrame(autosize);

        textarea.addEventListener('keydown', async (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                textarea.value = '';
                autosize();
                return;
            }
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            const raw = textarea.value.trim();
            if (!raw) return;
            this._capturePending++;
            textarea.disabled = true;
            try {
                const created = await this._thoughtController.addThought({ content: raw, context: initialContexts });
                if (!created) {
                    new Notice('Error saving thought — please try again', 2500);
                    return;
                }
                textarea.value = '';
                autosize();
                new Notice('✦ Thought saved', 1200);
                await this.renderView();
            } finally {
                this._capturePending = Math.max(0, this._capturePending - 1);
                textarea.disabled = false;
            }
        });
    }

    private renderContextTabs(parent: HTMLElement) {
        const known = this.plugin.settings.contexts ?? [];
        if (known.length === 0) return;

        // Resolve display order: user-defined order first, new contexts appended
        const order = (this.plugin.settings.contextOrder ?? []).filter(c => known.includes(c));
        const unordered = known.filter(c => !order.includes(c));
        const displayContexts = [...order, ...unordered];

        const bar = parent.createEl('div', { cls: 'diwa-dh-ctx-tabbar' });
        let dragIndex = -1;

        // Mouse drag-to-scroll
        let isMouseDown = false, scrollStartX = 0, scrollLeft = 0;
        bar.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).closest('button')) return; // let pill clicks pass
            isMouseDown = true;
            scrollStartX = e.pageX - bar.offsetLeft;
            scrollLeft = bar.scrollLeft;
            bar.addClass('is-scrolling');
        });
        bar.addEventListener('mouseleave', () => { isMouseDown = false; bar.removeClass('is-scrolling'); });
        bar.addEventListener('mouseup', () => { isMouseDown = false; bar.removeClass('is-scrolling'); });
        bar.addEventListener('mousemove', (e) => {
            e.preventDefault();
            const x = e.pageX - bar.offsetLeft;
            bar.scrollLeft = scrollLeft - (x - scrollStartX) * 1.5;
        });

        const tabs = [...displayContexts, 'all'];

        tabs.forEach((ctx, idx) => {
            const label = ctx === 'all' ? 'All' : ctx;
            const isActive = this._activeContextTab === ctx;
            const isDraggable = ctx !== 'all';
            const pill = bar.createEl('button', {
                cls: `diwa-dh-ctx-tab${isActive ? ' is-active' : ''}`,
                text: label,
                attr: {
                    title: ctx === 'all' ? 'Show all thoughts from today' : `Filter by #${ctx}`,
                    ...(isDraggable ? { draggable: 'true' } : {})
                }
            });

            pill.addEventListener('click', () => {
                if (this._activeContextTab === ctx) return;
                this._activeContextTab = ctx;
                if (ctx === 'all') this._feedScope = 'today';
                this.renderView();
            });

            if (!isDraggable) return;

            pill.addEventListener('dragstart', (e) => {
                dragIndex = idx;
                pill.addClass('is-dragging');
                e.dataTransfer?.setData('text/plain', String(idx));
            });

            pill.addEventListener('dragend', () => {
                pill.removeClass('is-dragging');
                bar.querySelectorAll('.diwa-dh-ctx-tab').forEach(p => p.removeClass('is-drag-over'));
            });

            pill.addEventListener('dragover', (e) => {
                e.preventDefault();
                bar.querySelectorAll('.diwa-dh-ctx-tab').forEach(p => p.removeClass('is-drag-over'));
                if (dragIndex !== idx) pill.addClass('is-drag-over');
            });

            pill.addEventListener('dragleave', () => {
                pill.removeClass('is-drag-over');
            });

            pill.addEventListener('drop', async (e) => {
                e.preventDefault();
                pill.removeClass('is-drag-over');
                const dropIndex = idx;
                if (dragIndex < 0 || dragIndex === dropIndex) return;
                const newOrder = [...displayContexts];
                const [moved] = newOrder.splice(dragIndex, 1);
                newOrder.splice(dropIndex, 0, moved);
                this.plugin.settings.contextOrder = newOrder;
                await this.plugin.saveSettings();
                this.renderView();
            });
        });

        // Equalize all pills to the width of the longest one (+ 2ch padding already set via CSS)
        requestAnimationFrame(() => {
            const pills = Array.from(bar.querySelectorAll<HTMLElement>('.diwa-dh-ctx-tab'));
            const maxW = Math.max(...pills.map(p => p.offsetWidth));
            if (maxW > 0) pills.forEach(p => { p.style.width = maxW + 'px'; });
        });
    }

    private async renderFeed(parent: HTMLElement) {
        const feed = parent.createEl('div', { cls: 'diwa-dh-feed' });
        const ctx = this._activeContextTab;
        const today = moment().format('YYYY-MM-DD');

        const header = feed.createEl('div', { cls: 'diwa-dh-feed-header' });
        const labelText = ctx === 'all' ? 'TODAY' : `#${ctx}`.toUpperCase();
        header.createEl('div', { text: labelText, cls: 'diwa-dh-feed-label' });
        const search = header.createEl('input', {
            cls: 'diwa-dh-thought-search',
            attr: { type: 'text', placeholder: 'Search thoughts...' },
        }) as HTMLInputElement;
        search.value = this._thoughtSearchQuery;
        search.addEventListener('input', () => {
            this._thoughtSearchQuery = search.value;
            this.renderView();
        });

        if (ctx !== 'all') {
            const toggle = header.createEl('div', { cls: 'diwa-dh-scope-toggle' });
            const todayPill = toggle.createEl('button', {
                cls: `diwa-dh-scope-pill${this._feedScope === 'today' ? ' is-active' : ''}`,
                text: 'Today'
            });
            const allPill = toggle.createEl('button', {
                cls: `diwa-dh-scope-pill${this._feedScope === 'all' ? ' is-active' : ''}`,
                text: 'All Time'
            });
            todayPill.addEventListener('click', () => { if (this._feedScope !== 'today') { this._feedScope = 'today'; this.renderView(); } });
            allPill.addEventListener('click', () => { if (this._feedScope !== 'all') { this._feedScope = 'all'; this.renderView(); } });
        }

        let thoughts = this._thoughtController.searchThoughts(this._thoughtSearchQuery);
        if (ctx === 'all') {
            thoughts = thoughts.filter(t => t.day === today);
        } else {
            const ctxLow = ctx.toLowerCase();
            thoughts = thoughts.filter(t => t.context.some(c => c.toLowerCase() === ctxLow));
            if (this._feedScope === 'today') thoughts = thoughts.filter(t => t.day === today);
        }
        thoughts = thoughts.filter((thought) => !thought.archived);
        thoughts.sort((a, b) => (b.createdAt ?? b.lastThreadUpdate ?? 0) - (a.createdAt ?? a.lastThreadUpdate ?? 0));

        if (thoughts.length === 0) {
            feed.createEl('div', {
                text: ctx === 'all' ? 'Nothing captured yet — your mind is clear.' : `No thoughts tagged #${ctx}${this._feedScope === 'today' ? ' today' : ''}.`,
                cls: 'diwa-dh-feed-empty'
            });
            return;
        }

        const pinned = thoughts.filter((t) => t.pinned || t.state === 'important');
        const recent = thoughts.filter((t) => !pinned.includes(t)).slice(0, 50);
        const older = thoughts.filter((t) => !pinned.includes(t) && !recent.includes(t));

        const list = feed.createEl('div', { cls: 'diwa-dh-feed-list' });
        const renderSection = async (title: string, sectionThoughts: ThoughtEntry[]) => {
            if (sectionThoughts.length === 0) return;
            const sectionEl = list.createEl('section', { cls: 'diwa-dh-thought-section' });
            sectionEl.createEl('div', { cls: 'diwa-dh-thought-section-title', text: `${title} (${sectionThoughts.length})` });
            for (const t of sectionThoughts) {
                const item = sectionEl.createEl('div', { cls: 'diwa-dh-feed-item' });
                item.createEl('span', { cls: 'diwa-dh-feed-dot' });
                const content = item.createEl('div', { cls: 'diwa-dh-feed-content' });
                const isToday = t.day === today;
                const ts = t.created
                    ? (isToday
                        ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm')
                        : moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('MMM D · HH:mm'))
                    : '';
                content.createEl('span', { text: ts, cls: 'diwa-dh-feed-time' });
                const mdEl = content.createEl('div', { cls: 'diwa-dh-feed-text' });
                await MarkdownRenderer.render(this.app, t.body || t.title || '', mdEl, t.filePath, this);
                const linkedTasksEl = content.createEl('div', { cls: 'diwa-dh-feed-linked-tasks' });
                this.renderLinkedTasksForThought(linkedTasksEl, t);

                const actions = item.createEl('div', { cls: 'diwa-dh-feed-actions' });
                const synBtn = actions.createEl('button', {
                    cls: 'diwa-dh-feed-edit-btn',
                    attr: { title: 'Open in synthesis', 'aria-label': 'Open in synthesis' }
                });
                setIcon(synBtn, 'sparkles');
                synBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.openSynthesisFromHub(t);
                });

                const convertBtn = actions.createEl('button', {
                    cls: 'diwa-dh-feed-edit-btn',
                    attr: { title: 'Convert to task', 'aria-label': 'Convert to task' }
                });
                setIcon(convertBtn, 'arrow-right');
                convertBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    convertBtn.disabled = true;
                    try {
                        const ok = await this._thoughtController.convertThoughtToTask(t.filePath, this._taskController);
                        if (!ok) {
                            new Notice('Could not convert thought to task.');
                            return;
                        }
                        const refreshed = this._thoughtController.getThought(t.filePath);
                        if (refreshed) this.renderLinkedTasksForThought(linkedTasksEl, refreshed);
                        new Notice('Thought converted to task', 1100);
                    } finally {
                        convertBtn.disabled = false;
                    }
                });

                const pinBtn = actions.createEl('button', {
                    cls: 'diwa-dh-feed-edit-btn',
                    attr: { title: t.pinned ? 'Unpin thought' : 'Pin thought', 'aria-label': t.pinned ? 'Unpin thought' : 'Pin thought' },
                });
                setIcon(pinBtn, t.pinned ? 'pin-off' : 'pin');
                pinBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    await this._thoughtController.setPinned(t.filePath, !t.pinned);
                    await this.renderView();
                });

                const archiveBtn = actions.createEl('button', {
                    cls: 'diwa-dh-feed-edit-btn',
                    attr: { title: t.archived ? 'Unarchive thought' : 'Archive thought', 'aria-label': t.archived ? 'Unarchive thought' : 'Archive thought' },
                });
                setIcon(archiveBtn, t.archived ? 'archive-restore' : 'archive');
                archiveBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    await this._thoughtController.setArchived(t.filePath, !t.archived);
                    await this.renderView();
                });

                const editBtn = actions.createEl('button', { cls: 'diwa-dh-feed-edit-btn', attr: { title: 'Edit thought', 'aria-label': 'Edit thought' } });
                setIcon(editBtn, 'lucide-pencil');
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.makeThoughtEditable(item, content, actions, t);
                });
            }
        };

        await renderSection('Pinned', pinned);
        await renderSection('Recent', recent);
        await renderSection('Older', older);
    }

    private renderLinkedTasksForThought(container: HTMLElement, thought: ThoughtEntry): void {
        container.empty();
        const linkedTasks = this._taskController.getLinkedTasksForThought(thought.filePath);
        if (linkedTasks.length === 0) return;

        for (const task of linkedTasks.slice(0, 3)) {
            const taskBtn = container.createEl('button', {
                cls: 'diwa-dh-feed-linked-task',
                text: `Linked Task -> ${task.title}`,
                attr: { type: 'button' },
            }) as HTMLButtonElement;
            taskBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(task.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
        if (linkedTasks.length > 3) {
            container.createEl('span', {
                cls: 'diwa-dh-feed-linked-task-count',
                text: `+${linkedTasks.length - 3} more`,
            });
        }
    }

    private makeThoughtEditable(item: HTMLElement, content: HTMLElement, actionsEl: HTMLElement, t: ThoughtEntry) {
        if (item.hasClass('is-editing')) return;
        item.addClass('is-editing');
        this._capturePending++;
        content.style.display = 'none';
        actionsEl.style.display = 'none';

        let editContexts = [...(t.context || [])];
        const form = item.createEl('div', { cls: 'diwa-edit-form' });

        const chipRow = form.createEl('div', { cls: 'diwa-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${ctx}` });
                chip.addEventListener('click', () => { editContexts = editContexts.filter(c => c !== ctx); renderChips(); });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', { cls: 'diwa-edit-textarea', attr: { rows: '2' } }) as HTMLTextAreaElement;
        textarea.value = t.body || t.title || '';
        const syncH = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        requestAnimationFrame(() => { syncH(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); });
        textarea.addEventListener('input', syncH);

        attachInlineTriggers(
            this.app, textarea, () => {},
            (tag) => { if (!editContexts.includes(tag)) { editContexts.push(tag); renderChips(); } },
            () => (this.plugin.settings.contexts ?? []).filter(c => !editContexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );

        const actions = form.createEl('div', { cls: 'diwa-edit-actions' });
        const saveBtn = actions.createEl('button', { cls: 'diwa-edit-save-btn', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'diwa-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            item.removeClass('is-editing');
            form.remove();
            this._capturePending = Math.max(0, this._capturePending - 1);
            if (restore) { content.style.display = ''; actionsEl.style.display = ''; }
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            exit(false);
            try {
                await this._thoughtController.updateThought({
                    ...t,
                    content: newText,
                    body: newText,
                    context: [...editContexts],
                });
                new Notice('✦ Thought updated', 1200);
            } catch {
                new Notice('Error updating thought', 2500);
                content.style.display = '';
                actionsEl.style.display = '';
            }
        };

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => exit(true));
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { exit(true); }
        });
    }

    private async openSynthesisFromHub(thought: ThoughtEntry): Promise<void> {
        await this.plugin.activateView('synthesis', false);
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA).find((l) => {
            const view = l.view as DiwaView;
            return !!view && view.activeTab === 'synthesis' && !view.isDedicated;
        });
        const view = leaf?.view as DiwaView | undefined;
        if (!view) return;

        const ctx = this._activeContextTab !== 'all' ? this._activeContextTab : (thought.context?.[0] ?? null);
        if (ctx) {
            view.synthesisContextMode = 'filter';
            view.synthesisActiveCtxFilter = ctx;
            view.activeSynthesisContexts = [ctx];
        }
        view.synthesisInspectorPath = thought.filePath;
        view.synthesisLastSelectedPath = thought.filePath;
        view.renderView();
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private mountTaskPane(parent: HTMLElement) {
        this._taskPaneView = new DesktopTaskPaneView(this, parent, this._taskController);
        this._taskPaneView.mount();
    }
}

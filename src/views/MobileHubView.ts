import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult, MarkdownRenderer, TFile } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { attachInlineTriggers, createThoughtCaptureWidget, isTablet } from '../utils';
import type { ThoughtEntry } from '../types';
import { InlineTopicInput } from '../utils/InlineTopicInput';
import { ConvertToTaskModal } from '../modals/ConvertToTaskModal';

export class MobileHubView extends ItemView {
    plugin: DiwaPlugin;

    _capturePending: number = 0;
    _activeContextTab: string = 'all';
    _feedScope: 'today' | 'all' = 'today';

    private _closed: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'DIWA Mobile Hub'; }
    getIcon(): string { return 'smartphone'; }

    getState(): Record<string, unknown> {
        return { activeContextTab: this._activeContextTab, feedScope: this._feedScope };
    }

    setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
        if (typeof state?.activeContextTab === 'string') this._activeContextTab = state.activeContextTab;
        if (state?.feedScope === 'today' || state?.feedScope === 'all') this._feedScope = state.feedScope as 'today' | 'all';
        this.renderView();
        return Promise.resolve();
    }

    async onOpen() {
        this.renderView();
    }

    async onClose() {
        this._closed = true;
    }

    async renderView() {
        if (this._capturePending > 0) return;
        if (this._closed) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('diwa-mh-root');

        if (!Platform.isMobile || isTablet()) {
            root.createEl('div', {
                text: '⊕ DIWA Mobile Hub requires a mobile device.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'diwa-mh-wrap' });
        this.renderCapture(wrap);
        this.renderContextTabs(wrap);
        await this.renderFeed(wrap);
    }

    private renderCapture(parent: HTMLElement) {
        const activeCtx = this._activeContextTab;
        const section = parent.createEl('div', { cls: 'diwa-mh-capture-section' });
        createThoughtCaptureWidget(section, {
            app: this.app,
            containerCls: 'diwa-mh-capture',
            textareaCls: 'diwa-mh-capture-textarea',
            chipCls: 'diwa-mh-chip',
            placeholder: 'Capture a thought…',
            getContexts: () => (this.plugin.settings.contexts ?? []),
            peopleFolder: this.plugin.settings.peopleFolder,
            attachmentsFolder: () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
            initialContexts: activeCtx !== 'all' ? [activeCtx] : [],
            onSave: async (raw, ctxs) => {
                try {
                    await this.plugin.vault.createThoughtFile(raw, ctxs);
                    new Notice('✦ Thought saved', 1200);
                } catch {
                    new Notice('Error saving thought — please try again', 2500);
                }
            },
            setPending: (v) => { this._capturePending = v; },
        });
    }

    private renderContextTabs(parent: HTMLElement) {
        const known = this.plugin.settings.contexts ?? [];
        if (known.length === 0) return;

        const order = (this.plugin.settings.contextOrder ?? []).filter(c => known.includes(c));
        const unordered = known.filter(c => !order.includes(c));
        const displayContexts = [...order, ...unordered];

        const bar = parent.createEl('div', { cls: 'diwa-mh-ctx-tabbar' });
        const tabs = [...displayContexts, 'all'];

        // Long-press reorder state
        let longPressTimer: ReturnType<typeof setTimeout> | null = null;
        let reorderMode = false;
        let dragEl: HTMLElement | null = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragCtx = '';

        const exitReorder = () => {
            reorderMode = false;
            bar.removeClass('is-reorder-mode');
            bar.querySelectorAll<HTMLElement>('.diwa-mh-ctx-tab').forEach(p => {
                p.style.transform = '';
                p.removeClass('is-dragging');
            });
        };

        tabs.forEach((ctx, idx) => {
            const label = ctx === 'all' ? 'All' : ctx;
            const isActive = this._activeContextTab === ctx;
            const isDraggable = ctx !== 'all';

            const pill = bar.createEl('button', {
                cls: `diwa-mh-ctx-tab${isActive ? ' is-active' : ''}`,
                text: label,
                attr: { title: ctx === 'all' ? 'Show all thoughts' : `Filter by #${ctx}` }
            });

            pill.addEventListener('click', (e) => {
                if (reorderMode) { exitReorder(); return; }
                if (this._activeContextTab === ctx) return;
                this._activeContextTab = ctx;
                if (ctx === 'all') this._feedScope = 'today';
                this.renderView();
            });

            if (!isDraggable) return;

            // Long-press to enter reorder mode
            pill.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => {
                    reorderMode = true;
                    bar.addClass('is-reorder-mode');
                    dragEl = pill;
                    dragCtx = ctx;
                    dragEl.addClass('is-dragging');
                    dragStartX = e.touches[0].clientX;
                    dragStartY = e.touches[0].clientY;
                }, 500);
            }, { passive: true });

            pill.addEventListener('touchend', () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            });

            pill.addEventListener('touchcancel', () => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                exitReorder();
            });

            pill.addEventListener('touchmove', async (e) => {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                if (!reorderMode || !dragEl || dragEl !== pill) return;
                e.preventDefault();

                const touch = e.touches[0];
                const dx = touch.clientX - dragStartX;
                pill.style.transform = `translateX(${dx}px)`;

                // Find drop target by midpoint comparison
                const pills = Array.from(bar.querySelectorAll<HTMLElement>('.diwa-mh-ctx-tab:not(.is-dragging)'));
                let dropTarget: HTMLElement | null = null;
                for (const p of pills) {
                    const rect = p.getBoundingClientRect();
                    if (touch.clientX >= rect.left && touch.clientX <= rect.right) { dropTarget = p; break; }
                }
                bar.querySelectorAll<HTMLElement>('.diwa-mh-ctx-tab').forEach(p => p.removeClass('is-drag-over'));
                if (dropTarget) dropTarget.addClass('is-drag-over');
            }, { passive: false });

            pill.addEventListener('touchend', async (e) => {
                if (!reorderMode || !dragEl || dragEl !== pill) return;
                const touch = e.changedTouches[0];
                const pills = Array.from(bar.querySelectorAll<HTMLElement>('.diwa-mh-ctx-tab'));
                let dropIdx = -1;
                pills.forEach((p, i) => {
                    const rect = p.getBoundingClientRect();
                    if (touch.clientX >= rect.left && touch.clientX <= rect.right) dropIdx = i;
                });

                if (dropIdx >= 0 && dropIdx !== idx) {
                    const newOrder = [...displayContexts];
                    const [moved] = newOrder.splice(idx, 1);
                    newOrder.splice(dropIdx, 0, moved);
                    this.plugin.settings.contextOrder = newOrder;
                    await this.plugin.saveSettings();
                }
                exitReorder();
                this.renderView();
            });
        });

        // Tap bar background to exit reorder mode
        bar.addEventListener('click', () => { if (reorderMode) exitReorder(); });

        // Equalize pill widths to the longest one
        requestAnimationFrame(() => {
            const pills = Array.from(bar.querySelectorAll<HTMLElement>('.diwa-mh-ctx-tab'));
            const maxW = Math.max(...pills.map(p => p.offsetWidth));
            if (maxW > 0) pills.forEach(p => { p.style.width = maxW + 'px'; });
        });
    }

    private async renderFeed(parent: HTMLElement) {
        const feed = parent.createEl('div', { cls: 'diwa-mh-feed' });
        const ctx = this._activeContextTab;
        const today = moment().format('YYYY-MM-DD');

        const header = feed.createEl('div', { cls: 'diwa-mh-feed-header' });
        const labelText = ctx === 'all' ? 'TODAY' : ctx.toUpperCase();
        header.createEl('div', { text: labelText, cls: 'diwa-mh-feed-label' });

        if (ctx !== 'all') {
            const toggle = header.createEl('div', { cls: 'diwa-mh-scope-toggle' });
            const todayPill = toggle.createEl('button', {
                cls: `diwa-mh-scope-pill${this._feedScope === 'today' ? ' is-active' : ''}`,
                text: 'Today'
            });
            const allPill = toggle.createEl('button', {
                cls: `diwa-mh-scope-pill${this._feedScope === 'all' ? ' is-active' : ''}`,
                text: 'All Time'
            });
            todayPill.addEventListener('click', () => { if (this._feedScope !== 'today') { this._feedScope = 'today'; this.renderView(); } });
            allPill.addEventListener('click', () => { if (this._feedScope !== 'all') { this._feedScope = 'all'; this.renderView(); } });
        }

        let thoughts = Array.from(this.plugin.index.thoughtIndex.values());
        if (ctx === 'all') {
            thoughts = thoughts.filter(t => t.day === today);
        } else {
            thoughts = thoughts.filter(t => t.context.includes(ctx));
            if (this._feedScope === 'today') thoughts = thoughts.filter(t => t.day === today);
        }
        thoughts.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (thoughts.length === 0) {
            feed.createEl('div', {
                text: ctx === 'all' ? 'Nothing captured yet — your mind is clear.' : `No thoughts tagged #${ctx}${this._feedScope === 'today' ? ' today' : ''}.`,
                cls: 'diwa-mh-feed-empty'
            });
            return;
        }

        const list = feed.createEl('div', { cls: 'diwa-mh-feed-list' });
        for (const t of thoughts) {
            const item = list.createEl('div', { cls: 'diwa-mh-feed-item' });
            item.createEl('span', { cls: 'diwa-mh-feed-dot' });
            const content = item.createEl('div', { cls: 'diwa-mh-feed-content' });
            const ts = t.created ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm') : '';
            content.createEl('span', { text: ts, cls: 'diwa-mh-feed-time' });
            const mdEl = content.createEl('div', { cls: 'diwa-mh-feed-text' });
            await MarkdownRenderer.render(this.app, t.body || t.title || '', mdEl, t.filePath, this);

            const feedActions = item.createEl('div', { cls: 'diwa-mh-feed-actions' });
            const tagBtn = feedActions.createEl('button', {
                cls: `diwa-mh-feed-tag-btn${t.context.length > 0 ? ' has-context' : ''}`,
                attr: { title: 'Assign topic', 'aria-label': 'Assign topic' }
            });
            setIcon(tagBtn, 'lucide-tag');
            tagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                InlineTopicInput.open(tagBtn, t, this._activeContextTab, this.plugin, async (contexts, topic) => {
                    await this.plugin.vault.assignContextToThought(t.filePath, contexts, topic);
                    const file = this.app.vault.getAbstractFileByPath(t.filePath);
                    if (file instanceof TFile) await this.plugin.index.indexThoughtFile(file);
                    tagBtn.toggleClass('has-context', contexts.length > 0);
                    if (this._activeContextTab !== 'all') {
                        const ctxLow = this._activeContextTab.toLowerCase();
                        const stillVisible = contexts.some(c => c.toLowerCase() === ctxLow);
                        if (!stillVisible) {
                            item.style.transition = 'opacity 0.2s';
                            item.style.opacity = '0';
                            setTimeout(() => item.remove(), 210);
                        }
                    }
                });
            });

            const convertBtn = feedActions.createEl('button', { cls: 'diwa-mh-feed-edit-btn', attr: { title: 'Convert to task', 'aria-label': 'Convert to task' } });
            setIcon(convertBtn, 'lucide-check-square');
            convertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                new ConvertToTaskModal(this.app, t.body || t.title || '', t.context, async (title, dueDate) => {
                    if (!title) {
                        new Notice('Task title is required.');
                        return;
                    }

                    const taskLink = this.plugin.taskLink;
                    if (!taskLink) {
                        new Notice('Task support is not ready.');
                        return;
                    }

                    const task = await taskLink.createTaskFromThought(t.filePath, title);
                    if (!task.filePath) {
                        new Notice('Could not create task.');
                        return;
                    }

                    if (dueDate) {
                        await this.plugin.vault.setTaskDue(task.filePath, dueDate);
                    }

                    await taskLink.linkTaskToThought(task.filePath, t.filePath);
                }).open();
            });

            const editBtn = feedActions.createEl('button', { cls: 'diwa-mh-feed-edit-btn', attr: { title: 'Edit', 'aria-label': 'Edit thought' } });
            setIcon(editBtn, 'lucide-pencil');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.makeThoughtEditable(item, content, feedActions, t);
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
                await this.plugin.vault.editThought(t.filePath, newText, [...editContexts]);
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
            if (e.key === 'Escape') exit(true);
        });
    }
}

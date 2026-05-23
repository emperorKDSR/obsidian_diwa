import { App, ItemView, MarkdownRenderer, Modal, Platform, TFile, WorkspaceLeaf, moment, setIcon } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';
import { MobilePostComposerModal } from '../modals/MobilePostComposerModal';
import type { ThoughtEntry } from '../types';
import { ConfirmModal } from '../modals/ConfirmModal';

export class MobileHubView extends ItemView {
    plugin: DiwaPlugin;
    private _feedContextFilter: string = 'all';

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'DIWA Mobile Hub'; }
    getIcon(): string { return 'smartphone'; }

    async onOpen() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        await this.renderView();
    }

    async onClose() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = '';
    }

    async renderView() {
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
        const top = wrap.createEl('div', { cls: 'diwa-mh-top' });
        const launcher = top.createEl('button', { cls: 'diwa-mh-launcher', type: 'button', attr: { 'aria-label': "What's on your mind?" } });
        const avatar = launcher.createEl('div', { cls: 'diwa-mh-launcher-avatar' });
        setIcon(avatar, 'message-circle');
        const body = launcher.createEl('div', { cls: 'diwa-mh-launcher-body' });
        body.createEl('div', { cls: 'diwa-mh-launcher-title', text: "What's on your mind?" });
        body.createEl('div', { cls: 'diwa-mh-launcher-subtitle', text: 'Tap to create a post' });
        const chevron = launcher.createEl('div', { cls: 'diwa-mh-launcher-chevron' });
        setIcon(chevron, 'chevron-right');

        launcher.addEventListener('click', () => {
            new MobilePostComposerModal(this.app, this.plugin).open();
        });

        this.renderFeedFilters(wrap);
        await this.renderFeed(wrap);
    }

    private renderFeedFilters(parent: HTMLElement) {
        const row = parent.createEl('div', { cls: 'diwa-mh-filters' });
        const contexts = [...(this.plugin.settings.contexts ?? [])].sort((a, b) => a.localeCompare(b));

        if (this._feedContextFilter !== 'all' && !contexts.includes(this._feedContextFilter)) {
            this._feedContextFilter = 'all';
        }

        const contextSelect = row.createEl('select', {
            cls: 'diwa-mh-filter-pill',
            attr: { 'aria-label': 'Filter feed by context' }
        }) as HTMLSelectElement;
        const allContexts = contextSelect.createEl('option', { text: 'CONTEXT: ALL' });
        allContexts.value = 'all';
        for (const ctx of contexts) {
            const option = contextSelect.createEl('option', { text: `CONTEXT: ${ctx.toUpperCase()}` });
            option.value = ctx;
        }
        contextSelect.value = this._feedContextFilter;
        contextSelect.addEventListener('change', () => {
            this._feedContextFilter = contextSelect.value;
            void this.renderView();
        });
    }

    private async renderFeed(parent: HTMLElement) {
        const feed = parent.createEl('div', { cls: 'diwa-mh-feed' });
        const head = feed.createEl('div', { cls: 'diwa-mh-feed-head' });
        head.createEl('div', { cls: 'diwa-mh-feed-title', text: 'FEED' });

        let thoughts = Array.from(this.plugin.index.thoughtIndex.values());
        if (this._feedContextFilter !== 'all') {
            const ctx = this._feedContextFilter.toLowerCase();
            thoughts = thoughts.filter(t => t.context.some(c => c.toLowerCase() === ctx));
        }
        thoughts = thoughts
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
            .slice(0, 80);

        if (thoughts.length === 0) {
            feed.createEl('div', {
                cls: 'diwa-mh-feed-empty',
                text: 'No notes match the selected context filter.'
            });
            return;
        }

        const list = feed.createEl('div', { cls: 'diwa-mh-feed-list' });
        for (const thought of thoughts) {
            await this.renderFeedItem(list, thought);
        }
    }

    private async renderFeedItem(parent: HTMLElement, thought: ThoughtEntry) {
        const item = parent.createEl('div', {
            cls: 'diwa-mh-feed-item',
            attr: { 'aria-label': `Open thought ${thought.title || ''}`, role: 'button', tabindex: '0' }
        });
        let longPressTimer: number | null = null;
        let longPressTriggered = false;
        let startX = 0;
        let startY = 0;

        const meta = item.createEl('div', { cls: 'diwa-mh-feed-meta' });
        const ts = thought.created
            ? moment(thought.created, 'YYYY-MM-DD HH:mm:ss').format('MMM D · HH:mm')
            : '';
        meta.createEl('span', { cls: 'diwa-mh-feed-time', text: ts });
        if (thought.context?.[0]) {
            meta.createEl('span', { cls: 'diwa-mh-feed-context', text: thought.context[0].toUpperCase() });
        }

        const content = item.createEl('div', { cls: 'diwa-mh-feed-text' });
        const body = (thought.body || '').trim();
        if (body) {
            await MarkdownRenderer.render(this.app, body, content, thought.filePath, this);
        } else {
            content.createEl('div', { cls: 'diwa-mh-feed-empty-item', text: 'No content' });
        }

        const openThought = async () => {
            const file = this.app.vault.getAbstractFileByPath(thought.filePath);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            }
        };
        const clearLongPress = () => {
            if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };
        item.addEventListener('pointerdown', (e: PointerEvent) => {
            longPressTriggered = false;
            startX = e.clientX;
            startY = e.clientY;
            clearLongPress();
            longPressTimer = window.setTimeout(() => {
                longPressTriggered = true;
                void this.openFeedItemActions(thought);
            }, 500);
        });
        item.addEventListener('pointermove', (e: PointerEvent) => {
            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);
            if (dx > 8 || dy > 8) clearLongPress();
        });
        item.addEventListener('pointerup', () => {
            clearLongPress();
            if (!longPressTriggered) void openThought();
        });
        item.addEventListener('pointercancel', clearLongPress);
        item.addEventListener('pointerleave', clearLongPress);
        item.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void openThought();
            }
        });
    }

    private async openFeedItemActions(thought: ThoughtEntry) {
        new MobileFeedItemActionsModal(
            this.app,
            async () => {
                new MobilePostComposerModal(this.app, this.plugin, {
                    editFilePath: thought.filePath,
                    text: thought.body || '',
                    contexts: [...(thought.context ?? [])],
                    topic: thought.topic || ''
                }).open();
            },
            async () => {
                new ConfirmModal(this.app, 'Move thought to trash?', async () => {
                    await this.plugin.vault.deleteFile(thought.filePath, 'thoughts');
                }).open();
            }
        ).open();
    }
}

class MobileFeedItemActionsModal extends Modal {
    constructor(
        app: App,
        private onEdit: () => Promise<void>,
        private onDelete: () => Promise<void>
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('diwa-mh-actions-modal');

        const wrap = contentEl.createEl('div', { cls: 'diwa-mh-actions-wrap' });
        const editBtn = wrap.createEl('button', { cls: 'diwa-mh-actions-btn', text: 'Edit', type: 'button' });
        const delBtn = wrap.createEl('button', { cls: 'diwa-mh-actions-btn is-danger', text: 'Delete', type: 'button' });
        const cancelBtn = wrap.createEl('button', { cls: 'diwa-mh-actions-btn', text: 'Cancel', type: 'button' });

        editBtn.addEventListener('click', async () => {
            this.close();
            await this.onEdit();
        });
        delBtn.addEventListener('click', async () => {
            this.close();
            await this.onDelete();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }
}

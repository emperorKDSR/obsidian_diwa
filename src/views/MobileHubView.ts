import { ItemView, Platform, WorkspaceLeaf, setIcon } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';
import { MobilePostComposerModal } from '../modals/MobilePostComposerModal';

export class MobileHubView extends ItemView {
    plugin: DiwaPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'DIWA Mobile Hub'; }
    getIcon(): string { return 'smartphone'; }

    async onOpen() {
        this.renderView();
    }

    private renderView() {
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
        const launcher = wrap.createEl('button', { cls: 'diwa-mh-launcher', type: 'button', attr: { 'aria-label': "What's on your mind?" } });
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
    }
}

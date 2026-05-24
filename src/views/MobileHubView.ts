import { ItemView, Platform, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';
import { DiwaMobileShell } from '../mobile/DiwaMobileShell';

export class MobileHubView extends ItemView {
    private shell: DiwaMobileShell;
    plugin: DiwaPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.shell = new DiwaMobileShell(this.app, plugin);
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    async onOpen() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = '';
    }

    renderView(): void {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('diwa-mobile-shell-root');

        if (!Platform.isMobile || isTablet()) {
            root.createEl('div', {
                text: 'DIWA Mobile Shell is available on phones only.',
                attr: {
                    style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;',
                },
            });
            return;
        }

        this.shell.render(root);
    }
}

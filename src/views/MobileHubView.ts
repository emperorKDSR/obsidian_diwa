import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { DiwaMobileShell, getPlatform } from '../mobile/DiwaMobileShell';

export class MobileHubView extends ItemView {
    private shell: DiwaMobileShell;
    plugin: DiwaPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.shell = new DiwaMobileShell(this.app, plugin, { platform: 'mobile' });
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

        const platform = getPlatform(this.app);
        if (platform === 'desktop') {
            root.createEl('div', {
                text: 'DIWA Mobile Shell is available on mobile devices only.',
                attr: {
                    style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;',
                },
            });
            return;
        }
        this.shell.setPlatform(platform);
        this.shell.render(root);
    }
}

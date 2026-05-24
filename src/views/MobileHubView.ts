import { WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { DesktopHubView } from './DesktopHubView';

export class MobileHubView extends DesktopHubView {
    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf, plugin);
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    async renderView() {
        await super.renderView();
        const root = this.containerEl.children[1] as HTMLElement | undefined;
        if (!root) return;
        root.addClass('diwa-workspace-root');
        root.addClass('diwa-skin--mobile');
    }
}

import { ItemView, type ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { DiwaMobileShell, getPlatform, type DiwaMobileShellState, type ShellPlatform } from '../mobile/DiwaMobileShell';

export class MobileHubView extends ItemView {
    private shell: DiwaMobileShell;
    plugin: DiwaPlugin;
    _taskTogglePending = 0;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.shell = new DiwaMobileShell(this.app, plugin, {
            platform: 'mobile',
            incrementTaskTogglePending: () => {
                this._taskTogglePending += 1;
            },
            decrementTaskTogglePending: () => {
                this._taskTogglePending = Math.max(0, this._taskTogglePending - 1);
            },
        });
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

    getState(): DiwaMobileShellState {
        return this.shell.getState();
    }

    async setState(state: DiwaMobileShellState, result: ViewStateResult): Promise<void> {
        this.shell.setState(state);
        await super.setState(state, result);
        const root = this.containerEl.children[1] as HTMLElement | undefined;
        if (root?.isConnected) this.renderView();
    }

    protected resolveShellPlatform(): ShellPlatform {
        return getPlatform(this.app);
    }

    renderView(options: { invalidateShellCaches?: boolean } = {}): void {
        const root = this.containerEl.children[1] as HTMLElement;
        root.addClass('diwa-mobile-shell-root');

        const platform = this.resolveShellPlatform();
        root.classList.toggle('diwa-tablet-hub-root', platform === 'tablet');
        root.classList.toggle('diwa-mobile-hub-root', platform === 'mobile');
        if (platform === 'desktop') {
            root.empty();
            root.createEl('div', {
                text: 'DIWA Mobile Shell is available on mobile devices only.',
                attr: {
                    style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;',
                },
            });
            return;
        }
        this.shell.setPlatform(platform);
        if (options.invalidateShellCaches) {
            this.shell.invalidateAllCaches();
        }
        this.shell.render(root);
    }

    refreshAll(): void {
        this.renderView({ invalidateShellCaches: true });
    }

    refreshTasks(): void {
        this.shell.refreshTasks();
    }

    refreshThoughts(): void {
        this.shell.refreshThoughts();
    }
}

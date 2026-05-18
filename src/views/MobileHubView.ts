import { ItemView, Notice, Platform, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import type DiwaPlugin from '../main';
import { createThoughtCaptureWidget, isTablet } from '../utils';

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
        const card = wrap.createEl('div', { cls: 'diwa-mh-capture-card' });

        createThoughtCaptureWidget(card, {
            app: this.app,
            containerCls: 'diwa-mh-capture',
            textareaCls: 'diwa-mh-capture-textarea',
            chipCls: 'diwa-mh-chip',
            placeholder: "What's on your mind?",
            getContexts: () => (this.plugin.settings.contexts ?? []),
            peopleFolder: this.plugin.settings.peopleFolder,
            attachmentsFolder: () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
            onSave: async (raw, contexts) => {
                try {
                    await this.plugin.vault.createThoughtFile(raw, contexts);
                    new Notice('✦ Thought saved', 1200);
                } catch {
                    new Notice('Error saving thought — please try again', 2500);
                }
            },
            setPending: () => {}
        });
    }
}

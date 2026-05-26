import { App, Modal, Notice, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    GAWA_DESKTOP_BUCKET_META,
    GAWA_PANE_META,
    GAWA_TABLET_BUCKET_META,
    cloneGawaLayoutPreferences,
    createDefaultGawaLayoutPreferences,
} from '../gawaLayout';
import { isTablet } from '../utils';
import type {
    GawaDesktopBucketId,
    GawaLayoutPreferences,
    GawaPaneId,
    GawaTabletBucketId,
} from '../types';

type LayoutGroup = 'desktop' | 'tablet';

export class GawaLayoutCustomizeModal extends Modal {
    private draft: GawaLayoutPreferences;
    private saving = false;

    constructor(
        app: App,
        private readonly plugin: DiwaPlugin,
        private readonly onSaveLayout: (preferences: GawaLayoutPreferences) => Promise<void>,
    ) {
        super(app);
        this.draft = cloneGawaLayoutPreferences(this.plugin.settings.gawaLayoutPreferences);
    }

    onOpen(): void {
        this.draft = cloneGawaLayoutPreferences(this.plugin.settings.gawaLayoutPreferences);
        this.modalEl.addClass('diwa-workspace-popup-shell', 'diwa-gawa-layout-modal');
        this.modalEl.toggleClass('diwa-gawa-layout-modal--tablet', isTablet());
        this.render();
    }

    onClose(): void {
        this.saving = false;
        this.modalEl.removeClass('diwa-workspace-popup-shell', 'diwa-gawa-layout-modal', 'diwa-gawa-layout-modal--tablet');
        this.contentEl.empty();
    }

    private captureScrollState(): { top: number; left: number } {
        const scrollContainer = this.contentEl;
        return {
            top: scrollContainer.scrollTop,
            left: scrollContainer.scrollLeft,
        };
    }

    private restoreScrollState(scrollState: { top: number; left: number }): void {
        window.requestAnimationFrame(() => {
            this.contentEl.scrollTop = scrollState.top;
            this.contentEl.scrollLeft = scrollState.left;
        });
    }

    private rerenderPreservingScroll(): void {
        const scrollState = this.captureScrollState();
        this.render();
        this.restoreScrollState(scrollState);
    }

    private render(): void {
        this.contentEl.empty();

        const tabletLayout = isTablet();
        this.modalEl.toggleClass('diwa-gawa-layout-modal--tablet', tabletLayout);
        const root = this.contentEl.createEl('div', { cls: 'diwa-gawa-layout-root' });
        const header = root.createEl('div', { cls: 'diwa-gawa-layout-header diwa-workspace-popup-header' });
        header.createEl('span', { cls: 'diwa-workspace-popup-eyebrow', text: 'Gawa customize' });
        const titleRow = header.createEl('div', { cls: 'diwa-workspace-popup-title-row' });
        const title = titleRow.createEl('div', { cls: 'diwa-workspace-popup-title', text: 'Arrange panes' });
        title.setAttr('role', 'heading');
        title.setAttr('aria-level', '2');
        header.createEl('p', {
            cls: 'diwa-workspace-popup-subtitle',
            text: 'Toggle panes on or off, then reorder them within each layout bucket.',
        });

        const body = root.createEl('div', { cls: 'diwa-gawa-layout-body' });
        const intro = body.createEl('div', { cls: 'diwa-gawa-layout-intro' });
        intro.createEl('span', { cls: 'diwa-workspace-popup-count diwa-gawa-layout-intro-badge', text: 'Bucket layout stays intact' });
        intro.createEl('p', {
            cls: 'diwa-gawa-layout-intro-copy',
            text: 'Hidden panes stay fully unmounted until you re-enable them, while each existing desktop and tablet bucket keeps its current structure.',
        });

        const layoutGroups: LayoutGroup[] = tabletLayout ? ['tablet', 'desktop'] : ['desktop', 'tablet'];
        layoutGroups.forEach((layoutGroup) => this.renderLayoutGroup(body, layoutGroup));

        const footer = root.createEl('div', { cls: 'diwa-gawa-layout-footer' });
        const dock = footer.createEl('div', { cls: 'diwa-gawa-layout-footer-dock' });
        const resetBtn = dock.createEl('button', {
            cls: 'diwa-gawa-layout-footer-btn diwa-gawa-layout-footer-btn--ghost',
            text: 'Reset to default',
            attr: { type: 'button' },
        });
        resetBtn.disabled = this.saving;
        resetBtn.addEventListener('click', () => {
            this.draft = createDefaultGawaLayoutPreferences();
            this.rerenderPreservingScroll();
        });

        const actions = dock.createEl('div', { cls: 'diwa-gawa-layout-footer-actions' });
        const cancelBtn = actions.createEl('button', {
            cls: 'diwa-gawa-layout-footer-btn diwa-gawa-layout-footer-btn--ghost',
            text: 'Cancel',
            attr: { type: 'button' },
        });
        cancelBtn.disabled = this.saving;
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = actions.createEl('button', {
            cls: 'diwa-gawa-layout-footer-btn diwa-gawa-layout-footer-btn--primary',
            text: this.saving ? 'Saving…' : 'Save layout',
            attr: { type: 'button' },
        });
        saveBtn.disabled = this.saving;
        saveBtn.addEventListener('click', () => {
            void this.save();
        });
    }

    private renderLayoutGroup(parent: HTMLElement, layoutGroup: LayoutGroup): void {
        const section = parent.createEl('section', {
            cls: `diwa-gawa-layout-section diwa-gawa-layout-section--${layoutGroup}`,
            attr: { 'data-layout-group': layoutGroup },
        });
        const sectionHeader = section.createEl('div', { cls: 'diwa-gawa-layout-section-header' });
        sectionHeader.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: layoutGroup === 'desktop' ? 'Desktop' : 'Tablet',
        });
        sectionHeader.createEl('span', {
            cls: 'diwa-gawa-layout-section-hint',
            text: layoutGroup === 'desktop'
                ? 'Left, center, and right columns'
                : 'Planning, execution, and support groups',
        });

        const cards = section.createEl('div', { cls: 'diwa-gawa-layout-card-grid' });
        if (layoutGroup === 'desktop') {
            this.renderBucketCard(cards, 'desktop', 'left');
            this.renderBucketCard(cards, 'desktop', 'center');
            this.renderBucketCard(cards, 'desktop', 'right');
            return;
        }
        this.renderBucketCard(cards, 'tablet', 'planning');
        this.renderBucketCard(cards, 'tablet', 'execution');
        this.renderBucketCard(cards, 'tablet', 'support');
    }

    private renderBucketCard(
        parent: HTMLElement,
        layoutGroup: 'desktop',
        bucketId: GawaDesktopBucketId,
    ): void;
    private renderBucketCard(
        parent: HTMLElement,
        layoutGroup: 'tablet',
        bucketId: GawaTabletBucketId,
    ): void;
    private renderBucketCard(
        parent: HTMLElement,
        layoutGroup: LayoutGroup,
        bucketId: GawaDesktopBucketId | GawaTabletBucketId,
    ): void {
        const meta = layoutGroup === 'desktop'
            ? GAWA_DESKTOP_BUCKET_META[bucketId as GawaDesktopBucketId]
            : GAWA_TABLET_BUCKET_META[bucketId as GawaTabletBucketId];
        const preference = layoutGroup === 'desktop'
            ? this.draft.desktop[bucketId as GawaDesktopBucketId]
            : this.draft.tablet[bucketId as GawaTabletBucketId];
        const hiddenSet = new Set(preference.hidden);

        const card = parent.createEl('div', { cls: 'diwa-gawa-layout-card' });
        const cardHeader = card.createEl('div', { cls: 'diwa-gawa-layout-card-header' });
        const cardTitleRow = cardHeader.createEl('div', { cls: 'diwa-gawa-layout-card-title-row' });
        cardTitleRow.createEl('h3', { cls: 'diwa-gawa-layout-card-title', text: meta.label });
        cardTitleRow.createEl('span', {
            cls: 'diwa-workspace-popup-count',
            text: `${preference.order.length - preference.hidden.length}/${preference.order.length} shown`,
        });
        cardHeader.createEl('p', { cls: 'diwa-gawa-layout-card-description', text: meta.description });

        const list = card.createEl('div', { cls: 'diwa-gawa-layout-list' });
        preference.order.forEach((paneId, index) => {
            const paneMeta = GAWA_PANE_META[paneId];
            const row = list.createEl('div', { cls: 'diwa-gawa-layout-row' });
            if (hiddenSet.has(paneId)) row.addClass('is-hidden');

            const rowMain = row.createEl('div', { cls: 'diwa-gawa-layout-row-main' });
            rowMain.createEl('div', { cls: 'diwa-gawa-layout-row-title', text: paneMeta.title });
            rowMain.createEl('div', { cls: 'diwa-gawa-layout-row-description', text: paneMeta.description });

            const actions = row.createEl('div', { cls: 'diwa-gawa-layout-row-actions' });
            const visibilityBtn = actions.createEl('button', {
                cls: 'diwa-gawa-layout-toggle',
                attr: {
                    type: 'button',
                    'aria-pressed': hiddenSet.has(paneId) ? 'false' : 'true',
                    'aria-label': `${hiddenSet.has(paneId) ? 'Show' : 'Hide'} ${paneMeta.title}`,
                },
            });
            if (hiddenSet.has(paneId)) visibilityBtn.addClass('is-hidden');
            const visibilityIcon = visibilityBtn.createEl('span', { cls: 'diwa-gawa-layout-toggle-icon' });
            setIcon(visibilityIcon, hiddenSet.has(paneId) ? 'eye-off' : 'eye');
            visibilityBtn.createEl('span', {
                cls: 'diwa-gawa-layout-toggle-label',
                text: hiddenSet.has(paneId) ? 'Hidden' : 'Shown',
            });
            visibilityBtn.addEventListener('click', () => {
                this.togglePaneVisibility(layoutGroup, bucketId, paneId);
                this.rerenderPreservingScroll();
            });

            const moveControls = actions.createEl('div', { cls: 'diwa-gawa-layout-move-controls' });
            const moveUpBtn = this.createMoveButton(
                moveControls,
                'Move up',
                'arrow-up',
                index === 0,
                () => {
                    this.movePane(layoutGroup, bucketId, index, index - 1);
                    this.rerenderPreservingScroll();
                },
            );
            moveUpBtn.toggleClass('is-disabled', index === 0);
            const moveDownBtn = this.createMoveButton(
                moveControls,
                'Move down',
                'arrow-down',
                index === preference.order.length - 1,
                () => {
                    this.movePane(layoutGroup, bucketId, index, index + 1);
                    this.rerenderPreservingScroll();
                },
            );
            moveDownBtn.toggleClass('is-disabled', index === preference.order.length - 1);
        });
    }

    private createMoveButton(
        parent: HTMLElement,
        label: string,
        icon: string,
        disabled: boolean,
        onClick: () => void,
    ): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'diwa-gawa-layout-move-btn',
            attr: { type: 'button', 'aria-label': label },
        }) as HTMLButtonElement;
        setIcon(button, icon);
        button.disabled = disabled;
        button.addEventListener('click', onClick);
        return button;
    }

    private togglePaneVisibility(
        layoutGroup: LayoutGroup,
        bucketId: GawaDesktopBucketId | GawaTabletBucketId,
        paneId: GawaPaneId,
    ): void {
        const preference = layoutGroup === 'desktop'
            ? this.draft.desktop[bucketId as GawaDesktopBucketId]
            : this.draft.tablet[bucketId as GawaTabletBucketId];
        if (preference.hidden.includes(paneId)) {
            preference.hidden = preference.hidden.filter((id) => id !== paneId);
            return;
        }
        preference.hidden = [...preference.hidden, paneId];
    }

    private movePane(
        layoutGroup: LayoutGroup,
        bucketId: GawaDesktopBucketId | GawaTabletBucketId,
        fromIndex: number,
        toIndex: number,
    ): void {
        if (toIndex < 0) return;
        const preference = layoutGroup === 'desktop'
            ? this.draft.desktop[bucketId as GawaDesktopBucketId]
            : this.draft.tablet[bucketId as GawaTabletBucketId];
        if (toIndex >= preference.order.length) return;
        const nextOrder = [...preference.order];
        const [paneId] = nextOrder.splice(fromIndex, 1);
        nextOrder.splice(toIndex, 0, paneId);
        preference.order = nextOrder;
    }

    private async save(): Promise<void> {
        if (this.saving) return;
        this.saving = true;
        this.rerenderPreservingScroll();
        try {
            await this.onSaveLayout(cloneGawaLayoutPreferences(this.draft));
            new Notice('Gawa layout updated.');
            this.close();
        } catch (error) {
            console.error('[DIWA GAWA] Failed to save layout preferences', error);
            new Notice('Failed to save Gawa layout.');
            this.saving = false;
            this.rerenderPreservingScroll();
        }
    }
}

import { App, Modal, Platform, setIcon, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import type { DesktopHubView } from '../views/DesktopHubView';

export class MobileAgendaSheetModal extends Modal {
    private plugin: DiwaPlugin;
    private view: DesktopHubView;
    private _bodyEl: HTMLElement | null = null;

    constructor(app: App, plugin: DiwaPlugin, view: DesktopHubView) {
        super(app);
        this.plugin = plugin;
        this.view = view;
    }

    onOpen(): void {
        const { modalEl, containerEl } = this;
        modalEl.empty();

        modalEl.addClass('pos-mobile-agenda-sheet-modal');
        modalEl.addClass('pos-mobile-bottom-sheet');
        containerEl.addClass('pos-bottom-sheet-backdrop');

        this.view.setMobileAgendaModal(this);

        if (Platform.isMobile) {
            this.setupMobileGestures(modalEl);
        }

        this.renderContent();
    }

    private renderContent(): void {
        const { modalEl } = this;
        modalEl.empty();

        // 1. Mobile Drag Handle
        const dragWrap = modalEl.createDiv({ cls: 'pos-sheet-drag-handle-wrap' });
        dragWrap.createDiv({ cls: 'pos-sheet-drag-handle' });

        // 2. Sheet Header
        const headerEl = modalEl.createDiv({ cls: 'pos-agenda-sheet-header' });

        const titleWrap = headerEl.createDiv({ cls: 'pos-agenda-sheet-title-wrap' });
        const titleIcon = titleWrap.createSpan({ cls: 'pos-agenda-sheet-title-icon' });
        setIcon(titleIcon, 'sun');

        void this.plugin.index.getOverdueCount().then(info => {
            if (titleIcon.isConnected) {
                titleIcon.toggleClass('has-overdue', info.total > 0);
            }
        });

        const titleTextWrap = titleWrap.createDiv({ cls: 'pos-agenda-sheet-text-wrap' });
        titleTextWrap.createEl('h3', { cls: 'pos-agenda-sheet-title', text: 'Agenda & Horizon' });
        const todayStr = moment().format('dddd, MMM D');
        titleTextWrap.createSpan({ cls: 'pos-agenda-sheet-subtitle', text: `${todayStr} · 5-Day Horizon` });

        const headerActions = headerEl.createDiv({ cls: 'pos-agenda-sheet-header-actions' });

        // Close button
        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-agenda-sheet-close-btn clickable-icon',
            attr: { 'aria-label': 'Close agenda sheet' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => {
            this.close();
        };

        // 3. Scrollable Body
        const bodyEl = modalEl.createDiv({ cls: 'pos-agenda-sheet-body pos-rail-content' });
        this._bodyEl = bodyEl;

        void this.view.renderHorizonRail(bodyEl);
    }

    public refreshAgenda(): void {
        if (this._bodyEl && this._bodyEl.isConnected) {
            void this.view.renderHorizonRail(this._bodyEl);
        }
        const titleIcon = this.modalEl?.querySelector('.pos-agenda-sheet-title-icon') as HTMLElement | null;
        if (titleIcon) {
            void this.plugin.index.getOverdueCount().then(info => {
                if (titleIcon.isConnected) {
                    titleIcon.toggleClass('has-overdue', info.total > 0);
                }
            });
        }
    }

    private setupMobileGestures(modalEl: HTMLElement): void {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                startY = e.touches[0].clientY;
                isDragging = true;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) {
                modalEl.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;
            if (deltaY > 80) {
                this.close();
            } else {
                modalEl.style.transform = '';
            }
        };

        const dragHandle = modalEl.querySelector('.pos-sheet-drag-handle-wrap');
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
            dragHandle.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
            dragHandle.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
        }
    }

    onClose(): void {
        this.view.setMobileAgendaModal(null);
        this._bodyEl = null;
        const { modalEl } = this;
        modalEl.empty();
    }
}

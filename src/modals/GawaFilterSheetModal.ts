import { App, Modal, Platform, setIcon, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import type { GawaCockpitView, DateFilterType } from '../views/GawaCockpitView';

export class GawaFilterSheetModal extends Modal {
    private plugin: DiwaPlugin;
    private view: GawaCockpitView;
    private activeDateFilter: DateFilterType;
    private activeAreaFilter: string;

    constructor(app: App, plugin: DiwaPlugin, view: GawaCockpitView) {
        super(app);
        this.plugin = plugin;
        this.view = view;
        this.activeDateFilter = view.activeDateFilter;
        this.activeAreaFilter = view.activeAreaFilter;
    }

    onOpen(): void {
        const { modalEl, containerEl } = this;
        modalEl.empty();

        modalEl.addClass('pos-mobile-filter-sheet-modal');
        modalEl.addClass('pos-mobile-bottom-sheet');
        containerEl.addClass('pos-bottom-sheet-backdrop');

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
        const headerEl = modalEl.createDiv({ cls: 'pos-filter-sheet-header' });

        const titleWrap = headerEl.createDiv({ cls: 'pos-filter-sheet-title-wrap' });
        const titleIcon = titleWrap.createSpan({ cls: 'pos-filter-sheet-title-icon' });
        setIcon(titleIcon, 'sliders-horizontal');
        titleWrap.createEl('h3', { cls: 'pos-filter-sheet-title', text: 'Task Lenses & Filters' });

        const headerActions = headerEl.createDiv({ cls: 'pos-filter-sheet-header-actions' });

        // Reset button
        const isFiltered = this.activeDateFilter !== 'all' || this.activeAreaFilter !== 'all';
        if (isFiltered) {
            const resetBtn = headerActions.createEl('button', {
                cls: 'pos-filter-sheet-reset-btn',
                text: 'Reset All',
                attr: { 'aria-label': 'Reset all active filters' }
            });
            resetBtn.onclick = () => {
                this.activeDateFilter = 'all';
                this.activeAreaFilter = 'all';
                this.applyState();
                this.renderContent();
            };
        }

        // Close button
        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-filter-sheet-close-btn clickable-icon',
            attr: { 'aria-label': 'Close filter sheet' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => {
            this.close();
        };

        // Scrollable Body
        const bodyEl = modalEl.createDiv({ cls: 'pos-filter-sheet-body' });

        const todayStr = moment().format('YYYY-MM-DD');
        const tasks = this.view.rawTasks;

        // Compute counts based on currently selected area filter (or all tasks for area chips)
        const totalCount = tasks.length;
        const overdueCount = tasks.filter(t => t.dueDate !== null && t.dueDate < todayStr).length;
        const todayCount = tasks.filter(t => t.dueDate === todayStr).length;
        const upcomingCount = tasks.filter(t => t.dueDate !== null && t.dueDate > todayStr).length;
        const undatedCount = tasks.filter(t => t.dueDate === null).length;

        // === SECTION 1: HORIZONS ===
        const horizonSection = bodyEl.createDiv({ cls: 'pos-filter-sheet-section' });
        horizonSection.createEl('div', { cls: 'pos-filter-sheet-section-title', text: 'DUE DATE HORIZON' });

        const horizonGrid = horizonSection.createDiv({ cls: 'pos-filter-sheet-grid' });

        const horizons: Array<{ id: DateFilterType; label: string; icon: string; count: number }> = [
            { id: 'all', label: 'All Open', icon: '📋', count: totalCount },
            { id: 'overdue', label: 'Overdue', icon: '🔴', count: overdueCount },
            { id: 'today', label: 'Today', icon: '🟡', count: todayCount },
            { id: 'upcoming', label: 'Upcoming', icon: '🟢', count: upcomingCount },
            { id: 'undated', label: 'Undated', icon: '⚪', count: undatedCount },
        ];

        for (const h of horizons) {
            const isSelected = this.activeDateFilter === h.id;
            const chip = horizonGrid.createDiv({
                cls: `pos-filter-sheet-chip ${isSelected ? 'is-active' : ''}`
            });
            chip.createSpan({ cls: 'pos-sheet-chip-icon', text: h.icon });
            chip.createSpan({ cls: 'pos-sheet-chip-label', text: h.label });
            chip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${h.count}` });
            chip.onclick = () => {
                this.activeDateFilter = isSelected && h.id !== 'all' ? 'all' : h.id;
                this.applyState();
                this.renderContent();
            };
        }

        // === SECTION 2: LIFE AREAS ===
        const areas = this.plugin.settings.lifeAreas || [];
        if (areas.length > 0) {
            const areaSection = bodyEl.createDiv({ cls: 'pos-filter-sheet-section' });
            areaSection.createEl('div', { cls: 'pos-filter-sheet-section-title', text: 'LIFE AREAS' });

            const areaGrid = areaSection.createDiv({ cls: 'pos-filter-sheet-grid' });

            // All Areas chip
            const isAllArea = this.activeAreaFilter === 'all';
            const allAreaChip = areaGrid.createDiv({
                cls: `pos-filter-sheet-chip ${isAllArea ? 'is-active' : ''}`
            });
            allAreaChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '🌐' });
            allAreaChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'All Areas' });
            allAreaChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${totalCount}` });
            allAreaChip.onclick = () => {
                this.activeAreaFilter = 'all';
                this.applyState();
                this.renderContent();
            };

            for (const area of areas) {
                const areaId = area.id.toLowerCase().trim();
                const areaCount = tasks.filter(t => t.areaId.toLowerCase() === areaId).length;
                const isSelected = this.activeAreaFilter.toLowerCase() === areaId;

                const areaChip = areaGrid.createDiv({
                    cls: `pos-filter-sheet-chip ${isSelected ? 'is-active' : ''}`
                });
                if (area.icon) {
                    areaChip.createSpan({ cls: 'pos-sheet-chip-icon', text: area.icon });
                }
                areaChip.createSpan({ cls: 'pos-sheet-chip-label', text: area.label || areaId });
                areaChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${areaCount}` });
                areaChip.onclick = () => {
                    this.activeAreaFilter = isSelected ? 'all' : areaId;
                    this.applyState();
                    this.renderContent();
                };
            }
        }
    }

    private applyState(): void {
        this.view.applyFiltersFromSheet(this.activeDateFilter, this.activeAreaFilter);
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
        const { modalEl } = this;
        modalEl.empty();
    }
}

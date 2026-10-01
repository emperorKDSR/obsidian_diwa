import { App, Modal, Platform, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import type { DesktopHubView } from '../views/DesktopHubView';
import type { ScratchpadFilterMode } from '../types';

export class MobileFilterSheetModal extends Modal {
    private plugin: DiwaPlugin;
    private view: DesktopHubView;
    private activeFilter: ScratchpadFilterMode;
    private filterTasksOnly: boolean;

    constructor(app: App, plugin: DiwaPlugin, view: DesktopHubView) {
        super(app);
        this.plugin = plugin;
        this.view = view;
        this.activeFilter = view.activeFilter;
        this.filterTasksOnly = view.filterTasksOnly;
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
        titleWrap.createEl('h3', { cls: 'pos-filter-sheet-title', text: 'Filters & Lenses' });

        const headerActions = headerEl.createDiv({ cls: 'pos-filter-sheet-header-actions' });
        
        // Reset button
        const isFiltered = this.activeFilter !== 'all' || this.filterTasksOnly;
        if (isFiltered) {
            const resetBtn = headerActions.createEl('button', {
                cls: 'pos-filter-sheet-reset-btn',
                text: 'Reset All',
                attr: { 'aria-label': 'Reset all active filters' }
            });
            resetBtn.onclick = () => {
                this.activeFilter = 'all';
                this.filterTasksOnly = false;
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

        const isTasksOnly = this.filterTasksOnly;
        const openTaskCount = this.plugin.index?.getOpenTaskCount?.() || 0;
        const openTaskNoteCount = this.plugin.index?.getOpenTaskNoteCount?.() || 0;
        const allCaptures = this.plugin.index?.getAllCaptures?.() || [];
        const totalCount = isTasksOnly ? openTaskNoteCount : allCaptures.length;
        const importantCount = this.plugin.index?.getImportantCount?.(isTasksOnly) || 0;
        const todayCount = this.plugin.index?.getTodayCapturesCount?.(isTasksOnly) || 0;
        const upcomingCount = this.plugin.index?.getUpcomingCapturesCount?.(isTasksOnly) || 0;
        const untaggedCount = this.plugin.index?.getUntaggedCount?.(isTasksOnly) || 0;
        const areaCounts = this.plugin.index?.getAreaCounts?.(isTasksOnly) || {};

        // === SECTION 1: QUICK LENSES ===
        const lensSection = bodyEl.createDiv({ cls: 'pos-filter-sheet-section' });
        lensSection.createEl('div', { cls: 'pos-filter-sheet-section-title', text: 'QUICK LENSES' });
        
        const lensGrid = lensSection.createDiv({ cls: 'pos-filter-sheet-grid' });

        // Modifier Chip: Open Tasks Toggle
        const tasksChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip pos-chip-tasks ${this.filterTasksOnly ? 'is-active' : ''}`
        });
        tasksChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '☑️' });
        tasksChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'Open Tasks' });
        tasksChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${openTaskCount}` });
        tasksChip.onclick = () => {
            this.filterTasksOnly = !this.filterTasksOnly;
            this.applyState();
            this.renderContent();
        };

        // All Notes / All Tasks
        const allChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip ${this.activeFilter === 'all' && !this.filterTasksOnly ? 'is-active' : ''}`
        });
        allChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '📋' });
        allChip.createSpan({ cls: 'pos-sheet-chip-label', text: isTasksOnly ? 'All Task Notes' : 'All Notes' });
        allChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${totalCount}` });
        allChip.onclick = () => {
            this.activeFilter = 'all';
            this.applyState();
            this.renderContent();
        };

        // Important / Starred Lens
        const importantChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip pos-chip-important ${this.activeFilter === 'important' ? 'is-active' : ''} ${importantCount > 0 ? 'has-items' : ''}`
        });
        importantChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '⭐' });
        importantChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'Important' });
        importantChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${importantCount}` });
        importantChip.onclick = () => {
            this.activeFilter = this.activeFilter === 'important' ? 'all' : 'important';
            this.applyState();
            this.renderContent();
        };

        // Today Lens
        const todayChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip pos-chip-today ${this.activeFilter === 'today' ? 'is-active' : ''} ${todayCount > 0 ? 'has-items' : ''}`
        });
        todayChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '📅' });
        todayChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'Today' });
        todayChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${todayCount}` });
        todayChip.onclick = () => {
            this.activeFilter = this.activeFilter === 'today' ? 'all' : 'today';
            this.applyState();
            this.renderContent();
        };

        // Upcoming Lens
        const upcomingChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip pos-chip-upcoming ${this.activeFilter === 'upcoming' ? 'is-active' : ''} ${upcomingCount > 0 ? 'has-items' : ''}`
        });
        upcomingChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '📆' });
        upcomingChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'Upcoming' });
        upcomingChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${upcomingCount}` });
        upcomingChip.onclick = () => {
            this.activeFilter = this.activeFilter === 'upcoming' ? 'all' : 'upcoming';
            this.applyState();
            this.renderContent();
        };

        // Untagged Lens
        const untaggedChip = lensGrid.createDiv({
            cls: `pos-filter-sheet-chip pos-chip-untagged ${this.activeFilter === 'untagged' ? 'is-active' : ''} ${untaggedCount > 0 ? 'has-items' : ''}`
        });
        untaggedChip.createSpan({ cls: 'pos-sheet-chip-icon', text: '🧹' });
        untaggedChip.createSpan({ cls: 'pos-sheet-chip-label', text: 'Untagged' });
        untaggedChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${untaggedCount}` });
        untaggedChip.onclick = () => {
            this.activeFilter = this.activeFilter === 'untagged' ? 'all' : 'untagged';
            this.applyState();
            this.renderContent();
        };

        // === SECTION 2: LIFE AREAS ===
        const rawAreas = this.plugin.settings?.lifeAreas || [];
        const areas = Array.isArray(rawAreas) ? rawAreas : [];
        if (areas.length > 0) {
            const areaSection = bodyEl.createDiv({ cls: 'pos-filter-sheet-section' });
            areaSection.createEl('div', { cls: 'pos-filter-sheet-section-title', text: 'LIFE AREAS' });

            const areaGrid = areaSection.createDiv({ cls: 'pos-filter-sheet-grid' });
            for (const area of areas) {
                if (!area || typeof area !== 'object') continue;
                const areaId = String(area.id || '').toLowerCase().trim();
                if (!areaId) continue;
                const count = areaCounts[areaId] || 0;
                const isSelected = this.activeFilter === areaId;
                
                const areaChip = areaGrid.createDiv({
                    cls: `pos-filter-sheet-chip ${isSelected ? 'is-active' : ''}`
                });
                if (area.icon) {
                    areaChip.createSpan({ cls: 'pos-sheet-chip-icon', text: area.icon });
                }
                areaChip.createSpan({ cls: 'pos-sheet-chip-label', text: area.label || areaId });
                areaChip.createSpan({ cls: 'pos-sheet-chip-badge', text: `${count}` });
                areaChip.onclick = () => {
                    this.activeFilter = isSelected ? 'all' : areaId;
                    this.applyState();
                    this.renderContent();
                };
            }
        }
    }

    private applyState(): void {
        this.view.applyFilterFromSheet(this.activeFilter, this.filterTasksOnly);
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

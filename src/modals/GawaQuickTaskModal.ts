import { App, Modal, moment, Notice } from 'obsidian';
import type DiwaPlugin from '../main';
import type { GawaCockpitView } from '../views/GawaCockpitView';

export class GawaQuickTaskModal extends Modal {
    private plugin: DiwaPlugin;
    private view: GawaCockpitView;
    private selectedDueDate: string | null = null;
    private selectedAreaId: string = '';

    constructor(app: App, plugin: DiwaPlugin, view: GawaCockpitView) {
        super(app);
        this.plugin = plugin;
        this.view = view;
        // Default to active area filter if one is selected
        if (view.activeAreaFilter && view.activeAreaFilter !== 'all') {
            this.selectedAreaId = view.activeAreaFilter;
        }
    }

    onOpen(): void {
        const { modalEl, containerEl } = this;
        modalEl.empty();

        modalEl.addClass('pos-mobile-quick-task-modal');
        modalEl.addClass('pos-mobile-bottom-sheet');
        containerEl.addClass('pos-bottom-sheet-backdrop');

        this.renderContent();
    }

    private renderContent(): void {
        const { modalEl } = this;
        modalEl.empty();

        // 1. Drag Handle
        const dragWrap = modalEl.createDiv({ cls: 'pos-sheet-drag-handle-wrap' });
        dragWrap.createDiv({ cls: 'pos-sheet-drag-handle' });

        // 2. Header
        const headerEl = modalEl.createDiv({ cls: 'pos-quick-task-header' });
        headerEl.createEl('h3', { text: 'New Gawa Task', cls: 'pos-quick-task-title' });

        // 3. Body
        const bodyEl = modalEl.createDiv({ cls: 'pos-quick-task-body' });

        // Title input
        const inputWrap = bodyEl.createDiv({ cls: 'pos-quick-task-input-wrap' });
        const inputEl = inputWrap.createEl('textarea', {
            cls: 'pos-quick-task-input',
            attr: {
                placeholder: 'What needs to be done? (e.g. Call client @tomorrow)',
                rows: '2',
                autofocus: 'true',
            }
        });

        // Quick Date Chips
        const dateSection = bodyEl.createDiv({ cls: 'pos-quick-task-section' });
        dateSection.createEl('label', { text: 'DUE DATE', cls: 'pos-quick-task-label' });
        const dateRow = dateSection.createDiv({ cls: 'pos-quick-task-chips-row' });

        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        const nextWeekStr = moment().add(7, 'day').format('YYYY-MM-DD');

        const dateOptions = [
            { label: 'Today', date: todayStr },
            { label: 'Tomorrow', date: tomorrowStr },
            { label: '+7 Days', date: nextWeekStr },
        ];

        dateOptions.forEach(opt => {
            const isSelected = this.selectedDueDate === opt.date;
            const chip = dateRow.createEl('button', {
                cls: `pos-quick-task-chip ${isSelected ? 'is-active' : ''}`,
                text: opt.label,
            });
            chip.onclick = (e) => {
                e.preventDefault();
                this.selectedDueDate = isSelected ? null : opt.date;
                this.renderContent();
            };
        });

        if (this.selectedDueDate) {
            const clearChip = dateRow.createEl('button', {
                cls: 'pos-quick-task-chip pos-chip-clear',
                text: `✕ ${this.selectedDueDate}`,
            });
            clearChip.onclick = (e) => {
                e.preventDefault();
                this.selectedDueDate = null;
                this.renderContent();
            };
        }

        // Life Area Chips
        const areas = this.plugin.settings.lifeAreas || [];
        if (areas.length > 0) {
            const areaSection = bodyEl.createDiv({ cls: 'pos-quick-task-section' });
            areaSection.createEl('label', { text: 'LIFE AREA', cls: 'pos-quick-task-label' });
            const areaRow = areaSection.createDiv({ cls: 'pos-quick-task-chips-row' });

            areas.forEach(a => {
                const isSelected = this.selectedAreaId.toLowerCase() === a.id.toLowerCase();
                const chip = areaRow.createEl('button', {
                    cls: `pos-quick-task-chip ${isSelected ? 'is-active' : ''}`,
                    text: `${a.icon || ''} ${a.label || a.id}`.trim(),
                });
                chip.onclick = (e) => {
                    e.preventDefault();
                    this.selectedAreaId = isSelected ? '' : a.id.toLowerCase();
                    this.renderContent();
                };
            });
        }

        // Actions: Submit Button
        const actionsRow = bodyEl.createDiv({ cls: 'pos-quick-task-actions' });
        const submitBtn = actionsRow.createEl('button', {
            cls: 'pos-btn pos-btn-primary pos-quick-task-submit',
            text: 'Add Task ✓',
        });

        const handleSave = async () => {
            const rawTitle = inputEl.value.trim();
            if (!rawTitle) {
                new Notice('Please enter a task title');
                return;
            }

            let taskLine = `- [ ] ${rawTitle}`;
            if (this.selectedDueDate && !rawTitle.includes(this.selectedDueDate)) {
                taskLine += ` 📅 ${this.selectedDueDate}`;
            }

            try {
                const newFile = await this.plugin.capture.createCaptureNote(
                    taskLine,
                    this.selectedAreaId || ''
                );
                await this.plugin.index.indexCaptureFile(newFile);
                this.view.refreshTasks();
                this.plugin.notifyRefresh('tasks');
                new Notice('Task created ✓');
                this.close();
            } catch (err) {
                console.error('[GawaQuickTaskModal] Error creating task:', err);
                new Notice('Failed to create task');
            }
        };

        submitBtn.onclick = () => {
            void handleSave();
        };

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSave();
            }
        };

        setTimeout(() => {
            if (inputEl.isConnected) {
                inputEl.focus();
            }
        }, 50);
    }

    onClose(): void {
        const { modalEl } = this;
        modalEl.empty();
    }
}

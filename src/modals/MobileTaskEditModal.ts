import { App, Modal, Notice, Platform, setIcon, moment, MarkdownRenderer, TFile, Component } from 'obsidian';
import type DiwaPlugin from '../main';
import type { DesktopHubView } from '../views/DesktopHubView';
import { WikilinkPeekModal } from './WikilinkPeekModal';

export interface MobileTaskRecord {
    filePath: string;
    lineIndex: number;
    rawTitle: string;
    cleanTitle?: string;
    completed: boolean;
    dueDate?: string | null;
    areaLabel?: string;
    areaIcon?: string;
    subtasks?: { title: string; completed: boolean }[];
    remarks?: string[];
}

export class MobileTaskEditModal extends Modal {
    private plugin: DiwaPlugin;
    private view: DesktopHubView | null;
    private task: MobileTaskRecord;
    private dueDate: string | null;
    private subtasks: { title: string; completed: boolean }[];
    private remarks: string[];
    private completed: boolean;
    private component: Component = new Component();

    private _bodyEl: HTMLElement | null = null;
    private _dateSectionEl: HTMLElement | null = null;
    private _subtasksSectionEl: HTMLElement | null = null;
    private _subtasksListEl: HTMLElement | null = null;
    private _subtasksBadgeEl: HTMLElement | null = null;
    private _remarksSectionEl: HTMLElement | null = null;
    private _remarksListEl: HTMLElement | null = null;
    private _remarksBadgeEl: HTMLElement | null = null;
    private _cleanupViewport: (() => void) | null = null;

    constructor(app: App, plugin: DiwaPlugin, task: MobileTaskRecord, view?: DesktopHubView) {
        super(app);
        this.plugin = plugin;
        this.view = view || null;
        this.task = { ...task };
        this.dueDate = task.dueDate || null;
        this.subtasks = Array.isArray(task.subtasks) ? task.subtasks.map(s => ({ ...s })) : [];
        this.remarks = Array.isArray(task.remarks) ? [...task.remarks] : [];
        this.completed = Boolean(task.completed);
    }

    onOpen(): void {
        this.component.load();
        const { modalEl, containerEl } = this;
        modalEl.empty();

        modalEl.addClass('pos-mobile-task-edit-modal');
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
        const headerEl = modalEl.createDiv({ cls: 'pos-task-edit-header' });

        const titleWrap = headerEl.createDiv({ cls: 'pos-task-edit-title-wrap' });
        const titleIcon = titleWrap.createSpan({ cls: 'pos-task-edit-title-icon' });
        setIcon(titleIcon, 'calendar-check');

        const titleTextWrap = titleWrap.createDiv({ cls: 'pos-task-edit-text-wrap' });
        titleTextWrap.createEl('h3', { cls: 'pos-task-edit-title', text: 'Schedule & Details' });
        
        const file = this.app.vault.getAbstractFileByPath(this.task.filePath);
        const sourceNote = file instanceof TFile ? file.basename : 'Task';
        titleTextWrap.createSpan({ cls: 'pos-task-edit-subtitle', text: sourceNote });

        const headerActions = headerEl.createDiv({ cls: 'pos-task-edit-header-actions' });

        const typingDoneBtn = headerActions.createEl('button', {
            cls: 'pos-task-edit-typing-done-btn',
            text: 'Done',
            attr: { 'aria-label': 'Finish typing' }
        });
        typingDoneBtn.onpointerdown = (e) => {
            e.preventDefault();
            this.exitTypingMode();
        };
        typingDoneBtn.onclick = (e) => {
            e.preventDefault();
            this.exitTypingMode();
        };

        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-task-edit-close-btn clickable-icon',
            attr: { 'aria-label': 'Close task editor' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = () => this.close();

        // 3. Scrollable Body
        const bodyEl = modalEl.createDiv({ cls: 'pos-task-edit-body' });
        this._bodyEl = bodyEl;

        // A. Task Preview & Toggle Card
        const previewCard = bodyEl.createDiv({ cls: 'pos-task-edit-preview-card' });
        const previewCheck = previewCard.createEl('input', {
            type: 'checkbox',
            cls: 'pos-task-edit-checkbox'
        });
        previewCheck.checked = this.completed;
        previewCheck.onclick = async (e) => {
            e.stopPropagation();
            this.completed = previewCheck.checked;
            try {
                await this.plugin.capture.toggleTaskInFile(this.task.filePath, this.task.lineIndex, this.completed);
                this.plugin.refreshCoordinator.notifyRefresh('tasks');
                titleEl.toggleClass('is-completed', this.completed);
            } catch (err) {
                console.error('[DIWA] Error toggling task', err);
                previewCheck.checked = !this.completed;
                this.completed = previewCheck.checked;
                new Notice('Failed to toggle task');
            }
        };

        const titleEl = previewCard.createDiv({
            cls: `pos-task-edit-task-title ${this.completed ? 'is-completed' : ''}`
        });
        const taskText = (this.task.cleanTitle || this.task.rawTitle || '').trim();
        void MarkdownRenderer.render(
            this.app,
            taskText,
            titleEl,
            this.task.filePath || '',
            this.component
        ).then(() => {
            const links = titleEl.querySelectorAll<HTMLAnchorElement>('a.internal-link');
            links.forEach(link => {
                const href = link.getAttribute('data-href') || link.textContent || '';
                link.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    new WikilinkPeekModal(
                        this.app,
                        this.plugin,
                        href,
                        this.task.filePath || '',
                        this.view ? (target) => this.view?.filterStreamByWikilink(target) : undefined
                    ).open();
                };
            });
        });

        // B. Due Date Section
        this._dateSectionEl = bodyEl.createDiv({ cls: 'pos-task-edit-section pos-task-edit-section-date' });
        this.renderDateSection();

        // C. Subtasks Section
        this._subtasksSectionEl = bodyEl.createDiv({ cls: 'pos-task-edit-section pos-task-edit-section-subtasks' });
        this.renderSubtasksSection();

        // D. Notes & Remarks Section
        this._remarksSectionEl = bodyEl.createDiv({ cls: 'pos-task-edit-section pos-task-edit-section-remarks' });
        this.renderRemarksSection();

        // 4. Modal Footer
        const footerEl = modalEl.createDiv({ cls: 'pos-task-edit-footer' });
        const doneBtn = footerEl.createEl('button', {
            cls: 'pos-task-edit-done-btn',
            text: 'Done'
        });
        doneBtn.onclick = () => this.close();

        // 5. Virtual Keyboard & Viewport Sync
        this.setupKeyboardHandling(modalEl, bodyEl);
    }

    private renderDateSection(): void {
        if (!this._dateSectionEl) return;
        this._dateSectionEl.empty();

        const sectionHeader = this._dateSectionEl.createDiv({ cls: 'pos-task-edit-section-header' });
        sectionHeader.createSpan({ cls: 'pos-task-edit-section-title', text: 'SCHEDULE DUE DATE' });
        if (this.dueDate) {
            const isOverdue = this.dueDate < moment().format('YYYY-MM-DD');
            sectionHeader.createSpan({
                cls: `pos-task-edit-badge ${isOverdue ? 'is-overdue' : ''}`,
                text: this.dueDate
            });
        }

        // Quick date shortcuts
        const chipsWrap = this._dateSectionEl.createDiv({ cls: 'pos-task-edit-chips' });
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        const in3DaysStr = moment().add(3, 'days').format('YYYY-MM-DD');
        const nextWeekStr = moment().add(7, 'days').format('YYYY-MM-DD');

        const shortcuts: { label: string; date: string | null }[] = [
            { label: 'Today', date: todayStr },
            { label: 'Tomorrow', date: tomorrowStr },
            { label: 'In 3 Days', date: in3DaysStr },
            { label: 'Next Week', date: nextWeekStr },
        ];

        if (this.dueDate) {
            shortcuts.push({ label: '✕ Clear', date: null });
        }

        for (const s of shortcuts) {
            const isSelected = s.date !== null && this.dueDate === s.date;
            const chip = chipsWrap.createEl('button', {
                cls: `pos-task-edit-chip ${isSelected ? 'is-active' : ''} ${s.date === null ? 'is-clear' : ''}`,
                text: s.label
            });
            chip.onclick = () => {
                void this.saveDueDate(s.date);
            };
        }

        // Native date picker input row
        const inputRow = this._dateSectionEl.createDiv({ cls: 'pos-task-edit-date-input-row' });
        const calIcon = inputRow.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');

        const dateInput = inputRow.createEl('input', {
            type: 'date',
            cls: 'pos-task-edit-date-input',
            value: this.dueDate || ''
        });
        dateInput.onchange = () => {
            const val = dateInput.value.trim();
            if (val && moment(val, 'YYYY-MM-DD', true).isValid()) {
                void this.saveDueDate(val);
            }
        };
    }

    private renderSubtasksSection(): void {
        if (!this._subtasksSectionEl) return;
        this._subtasksSectionEl.empty();

        const sectionHeader = this._subtasksSectionEl.createDiv({ cls: 'pos-task-edit-section-header' });
        sectionHeader.createSpan({ cls: 'pos-task-edit-section-title', text: 'SUBTASKS' });
        this._subtasksBadgeEl = sectionHeader.createSpan({
            cls: 'pos-task-edit-badge',
            text: '0/0'
        });

        // Quick add subtask row (kept permanently mounted so focus is never lost on save)
        const addRow = this._subtasksSectionEl.createDiv({ cls: 'pos-task-edit-add-row' });
        const addInput = addRow.createEl('input', {
            type: 'text',
            cls: 'pos-task-edit-add-input',
            placeholder: '+ Add subtask...',
            attr: {
                'enterkeyhint': 'done',
                'autocomplete': 'off',
                'autocorrect': 'off',
                'autocapitalize': 'sentences'
            }
        });
        const addBtn = addRow.createEl('button', {
            cls: 'pos-task-edit-add-btn',
            text: 'Add'
        });

        // Subtasks list
        this._subtasksListEl = this._subtasksSectionEl.createDiv({ cls: 'pos-task-edit-list' });
        this.refreshSubtasksList();

        addInput.addEventListener('focus', () => {
            this.enterTypingMode('subtask');
        });

        const submitSubtask = async () => {
            const val = addInput.value.trim();
            if (!val) return;
            this.subtasks.push({ title: val, completed: false });
            addInput.value = '';
            this.refreshSubtasksList(true);
            await this.saveSubtasks();
            if (addInput.isConnected) {
                addInput.focus({ preventScroll: true });
            }
        };

        addBtn.onpointerdown = (e) => {
            e.preventDefault();
        };
        addBtn.onclick = (e) => {
            e.preventDefault();
            void submitSubtask();
        };
        addInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (addInput.value.trim()) {
                    void submitSubtask();
                } else {
                    this.exitTypingMode();
                }
            }
        };
    }

    private refreshSubtasksList(scrollToLatest: boolean = false): void {
        if (!this._subtasksListEl) return;
        this._subtasksListEl.empty();

        if (this._subtasksBadgeEl) {
            const doneCount = this.subtasks.filter(s => s.completed).length;
            this._subtasksBadgeEl.textContent = `${doneCount}/${this.subtasks.length}`;
        }

        if (this.subtasks.length === 0) {
            this._subtasksListEl.createDiv({
                cls: 'pos-task-edit-empty-text',
                text: 'No subtasks yet. Break this task into steps above.'
            });
            return;
        }

        this.subtasks.forEach((st, idx) => {
            const itemRow = this._subtasksListEl!.createDiv({
                cls: `pos-task-edit-item-row ${st.completed ? 'is-completed' : ''}`
            });

            const check = itemRow.createEl('input', {
                type: 'checkbox',
                cls: 'pos-task-edit-subtask-check'
            });
            check.checked = Boolean(st.completed);
            check.onclick = async (e) => {
                e.stopPropagation();
                this.subtasks[idx].completed = check.checked;
                this.refreshSubtasksList();
                await this.saveSubtasks();
            };

            itemRow.createSpan({ cls: 'pos-task-edit-item-title', text: st.title });

            const delBtn = itemRow.createSpan({
                cls: 'pos-task-edit-del-btn',
                attr: { 'aria-label': 'Delete subtask' }
            });
            setIcon(delBtn, 'x');
            delBtn.onpointerdown = (e) => e.preventDefault();
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                this.subtasks.splice(idx, 1);
                this.refreshSubtasksList();
                await this.saveSubtasks();
            };
        });

        if (scrollToLatest && this._subtasksListEl) {
            this._subtasksListEl.scrollTop = this._subtasksListEl.scrollHeight;
        }
    }

    private renderRemarksSection(): void {
        if (!this._remarksSectionEl) return;
        this._remarksSectionEl.empty();

        const sectionHeader = this._remarksSectionEl.createDiv({ cls: 'pos-task-edit-section-header' });
        sectionHeader.createSpan({ cls: 'pos-task-edit-section-title', text: 'NOTES & REMARKS' });
        this._remarksBadgeEl = sectionHeader.createSpan({
            cls: 'pos-task-edit-badge',
            text: '0'
        });

        // Quick add remark row (kept permanently mounted so focus is never lost on save)
        const addRow = this._remarksSectionEl.createDiv({ cls: 'pos-task-edit-add-row' });
        const addInput = addRow.createEl('input', {
            type: 'text',
            cls: 'pos-task-edit-add-input',
            placeholder: '+ Add note or remark...',
            attr: {
                'enterkeyhint': 'done',
                'autocomplete': 'off',
                'autocorrect': 'off',
                'autocapitalize': 'sentences'
            }
        });
        const addBtn = addRow.createEl('button', {
            cls: 'pos-task-edit-add-btn',
            text: 'Add'
        });

        // Remarks list
        this._remarksListEl = this._remarksSectionEl.createDiv({ cls: 'pos-task-edit-list' });
        this.refreshRemarksList();

        addInput.addEventListener('focus', () => {
            this.enterTypingMode('remark');
        });

        const submitRemark = async () => {
            const val = addInput.value.trim();
            if (!val) return;
            this.remarks.push(val);
            addInput.value = '';
            this.refreshRemarksList(true);
            await this.saveRemarks();
            if (addInput.isConnected) {
                addInput.focus({ preventScroll: true });
            }
        };

        addBtn.onpointerdown = (e) => {
            e.preventDefault();
        };
        addBtn.onclick = (e) => {
            e.preventDefault();
            void submitRemark();
        };
        addInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (addInput.value.trim()) {
                    void submitRemark();
                } else {
                    this.exitTypingMode();
                }
            }
        };
    }

    private refreshRemarksList(scrollToLatest: boolean = false): void {
        if (!this._remarksListEl) return;
        this._remarksListEl.empty();

        if (this._remarksBadgeEl) {
            this._remarksBadgeEl.textContent = `${this.remarks.length}`;
        }

        if (this.remarks.length === 0) {
            this._remarksListEl.createDiv({
                cls: 'pos-task-edit-empty-text',
                text: 'No notes attached. Add context or updates above.'
            });
            return;
        }

        this.remarks.forEach((rem, idx) => {
            const itemRow = this._remarksListEl!.createDiv({ cls: 'pos-task-edit-item-row pos-task-remark-row' });
            
            const icon = itemRow.createSpan({ cls: 'pos-task-remark-icon' });
            setIcon(icon, 'message-square');

            itemRow.createSpan({ cls: 'pos-task-edit-item-title', text: rem });

            const delBtn = itemRow.createSpan({
                cls: 'pos-task-edit-del-btn',
                attr: { 'aria-label': 'Delete note' }
            });
            setIcon(delBtn, 'x');
            delBtn.onpointerdown = (e) => e.preventDefault();
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                this.remarks.splice(idx, 1);
                this.refreshRemarksList();
                await this.saveRemarks();
            };
        });

        if (scrollToLatest && this._remarksListEl) {
            this._remarksListEl.scrollTop = this._remarksListEl.scrollHeight;
        }
    }

    private async saveDueDate(newDate: string | null): Promise<void> {
        this.dueDate = newDate;
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: this.task.filePath,
                lineIndex: this.task.lineIndex,
                taskTitleFallback: this.task.rawTitle,
                newDueDate: newDate
            });
            const file = this.app.vault.getAbstractFileByPath(this.task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }
            this.view?.invalidateRenderCacheForFile(this.task.filePath);
            this.plugin.refreshCoordinator.notifyRefresh('tasks');
            this.plugin.refreshCoordinator.notifyRefresh('capture');
            new Notice(newDate ? `Due date set to ${newDate}` : 'Due date cleared');
            this.renderDateSection();
        } catch (err) {
            console.error('[DIWA] Error updating due date', err);
            new Notice('Failed to update due date');
        }
    }

    private async saveSubtasks(): Promise<void> {
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: this.task.filePath,
                lineIndex: this.task.lineIndex,
                taskTitleFallback: this.task.rawTitle,
                newSubtasks: this.subtasks
            });
            const file = this.app.vault.getAbstractFileByPath(this.task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }
            this.view?.invalidateRenderCacheForFile(this.task.filePath);
            this.plugin.refreshCoordinator.notifyRefresh('tasks');
            this.plugin.refreshCoordinator.notifyRefresh('capture');
        } catch (err) {
            console.error('[DIWA] Error updating subtasks', err);
            new Notice('Failed to update subtasks');
        }
    }

    private async saveRemarks(): Promise<void> {
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: this.task.filePath,
                lineIndex: this.task.lineIndex,
                taskTitleFallback: this.task.rawTitle,
                newRemarks: this.remarks
            });
            const file = this.app.vault.getAbstractFileByPath(this.task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }
            this.view?.invalidateRenderCacheForFile(this.task.filePath);
            this.plugin.refreshCoordinator.notifyRefresh('tasks');
            this.plugin.refreshCoordinator.notifyRefresh('capture');
        } catch (err) {
            console.error('[DIWA] Error updating notes', err);
            new Notice('Failed to update notes');
        }
    }

    private enterTypingMode(mode: 'subtask' | 'remark'): void {
        const { modalEl, containerEl } = this;
        modalEl.addClass('has-keyboard');
        modalEl.toggleClass('is-typing-subtask', mode === 'subtask');
        modalEl.toggleClass('is-typing-remark', mode === 'remark');

        if (this._bodyEl) {
            this._bodyEl.scrollTop = 0;
        }
        containerEl.scrollTop = 0;
        window.scrollTo(0, 0);

        setTimeout(() => {
            if (this._bodyEl) this._bodyEl.scrollTop = 0;
            containerEl.scrollTop = 0;
            window.scrollTo(0, 0);
        }, 60);
    }

    private exitTypingMode(): void {
        const { modalEl } = this;
        const active = document.activeElement;
        if (active instanceof HTMLElement && modalEl.contains(active)) {
            active.blur();
        }
        modalEl.removeClass('has-keyboard');
        modalEl.removeClass('is-typing-subtask');
        modalEl.removeClass('is-typing-remark');
        modalEl.style.removeProperty('--diwa-kb-h');
    }

    private setupKeyboardHandling(modalEl: HTMLElement, bodyEl: HTMLElement): void {
        const win = window;
        const vv = win.visualViewport;

        const syncViewportMetrics = () => {
            let kbHeight = 0;
            if (vv) {
                const offset = win.innerHeight - (vv.height + vv.offsetTop);
                if (offset > 60) {
                    kbHeight = Math.round(offset);
                }
            }

            const docKb = parseFloat(win.getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
            const bodyKb = parseFloat(win.getComputedStyle(document.body).getPropertyValue('--keyboard-height')) || 0;
            const finalKb = Math.max(kbHeight, docKb, bodyKb);

            if (finalKb > 60) {
                modalEl.style.setProperty('--diwa-kb-h', `${finalKb}px`);
            }

            if (modalEl.hasClass('has-keyboard')) {
                bodyEl.scrollTop = 0;
                this.containerEl.scrollTop = 0;
                if (win.scrollY !== 0) win.scrollTo(0, 0);
            }
        };

        const onFocusOut = () => {
            setTimeout(() => {
                const active = document.activeElement;
                const isTextInput = active instanceof HTMLInputElement && active.type === 'text';
                if (!isTextInput || !modalEl.contains(active)) {
                    modalEl.removeClass('has-keyboard');
                    modalEl.removeClass('is-typing-subtask');
                    modalEl.removeClass('is-typing-remark');
                    modalEl.style.removeProperty('--diwa-kb-h');
                }
            }, 120);
        };

        modalEl.addEventListener('focusout', onFocusOut, true);
        vv?.addEventListener('resize', syncViewportMetrics);
        vv?.addEventListener('scroll', syncViewportMetrics);
        win.addEventListener('resize', syncViewportMetrics);

        const obsEvents = ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide'];
        obsEvents.forEach(evt => win.addEventListener(evt, syncViewportMetrics));

        this._cleanupViewport = () => {
            modalEl.removeEventListener('focusout', onFocusOut, true);
            vv?.removeEventListener('resize', syncViewportMetrics);
            vv?.removeEventListener('scroll', syncViewportMetrics);
            win.removeEventListener('resize', syncViewportMetrics);
            obsEvents.forEach(evt => win.removeEventListener(evt, syncViewportMetrics));
            modalEl.removeClass('has-keyboard');
            modalEl.removeClass('is-typing-subtask');
            modalEl.removeClass('is-typing-remark');
            modalEl.style.removeProperty('--diwa-kb-h');
        };
    }

    private setupMobileGestures(modalEl: HTMLElement): void {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                this.exitTypingMode();
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
        if (this._cleanupViewport) {
            this._cleanupViewport();
            this._cleanupViewport = null;
        }
        this.component.unload();
        this.contentEl.empty();
    }
}


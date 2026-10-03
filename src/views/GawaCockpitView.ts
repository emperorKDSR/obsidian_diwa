import { ItemView, WorkspaceLeaf, setIcon, Notice, moment, TFile, MarkdownRenderer } from 'obsidian';
import type DiwaPlugin from '../main';
import { GawaTaskRecord, GawaSubtaskItem } from '../types';
import { VIEW_TYPE_GAWA_COCKPIT, GAWA_COCKPIT_ICON_ID } from '../constants';
import { WikilinkPeekModal } from '../modals/WikilinkPeekModal';

type DateFilterType = 'all' | 'overdue' | 'today' | 'upcoming' | 'undated';
type SortColumnType = 'dueDate' | 'title' | 'area';

export class GawaCockpitView extends ItemView {
    plugin: DiwaPlugin;

    // View state
    private _tasks: GawaTaskRecord[] = [];
    private _searchQuery: string = '';
    private _activeAreaFilter: string = 'all';
    private _activeDateFilter: DateFilterType = 'all';
    private _sortColumn: SortColumnType = 'dueDate';
    private _sortAscending: boolean = true;
    private _selectedTask: GawaTaskRecord | null = null;

    // DOM containers
    private _tableBodyEl: HTMLElement | null = null;
    private _inspectorEl: HTMLElement | null = null;
    private _chipsContainerEl: HTMLElement | null = null;
    private _countSummaryEl: HTMLElement | null = null;

    // Concurrency guard
    public _taskPending: number = 0;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_GAWA_COCKPIT;
    }

    getDisplayText(): string {
        return 'Gawa — Task Cockpit';
    }

    getIcon(): string {
        return GAWA_COCKPIT_ICON_ID;
    }

    async onOpen(): Promise<void> {
        this.renderView();
    }

    async onClose(): Promise<void> {
        this.containerEl.empty();
    }

    /**
     * Called by RefreshCoordinator when tasks change in the vault.
     */
    public refreshTasks(): void {
        this.loadTasksFromIndex();
        this.renderTableRows();
        this.updateFilterChips();
        this.updateSummaryText();
        if (this._selectedTask) {
            // Keep inspector in sync if the selected task was modified
            const updated = this._tasks.find(
                t => t.filePath === this._selectedTask?.filePath && t.lineIndex === this._selectedTask?.lineIndex
            );
            if (updated) {
                this._selectedTask = updated;
                this.renderInspector();
            } else {
                this.closeInspector();
            }
        }
    }

    private loadTasksFromIndex(): void {
        if (!this.plugin.index) {
            this._tasks = [];
            return;
        }
        // Load open tasks by default
        this._tasks = this.plugin.index.getGawaTasks(true);
    }

    private getFilteredAndSortedTasks(): GawaTaskRecord[] {
        let list = [...this._tasks];
        const query = this._searchQuery.toLowerCase().trim();

        // 1. Search Query Filter
        if (query) {
            list = list.filter(t => {
                const titleMatch = t.cleanTitle.toLowerCase().includes(query);
                const tagMatch = t.tags.some(tag => tag.toLowerCase().includes(query));
                const noteMatch = t.noteTitle.toLowerCase().includes(query);
                const remarksMatch = t.remarks.some(r => r.toLowerCase().includes(query));
                return titleMatch || tagMatch || noteMatch || remarksMatch;
            });
        }

        // 2. Life Area Filter
        if (this._activeAreaFilter !== 'all') {
            list = list.filter(t => t.areaId.toLowerCase() === this._activeAreaFilter.toLowerCase());
        }

        // 3. Date Horizon Filter
        const todayStr = moment().format('YYYY-MM-DD');
        if (this._activeDateFilter === 'overdue') {
            list = list.filter(t => t.dueDate !== null && t.dueDate < todayStr);
        } else if (this._activeDateFilter === 'today') {
            list = list.filter(t => t.dueDate === todayStr);
        } else if (this._activeDateFilter === 'upcoming') {
            list = list.filter(t => t.dueDate !== null && t.dueDate > todayStr);
        } else if (this._activeDateFilter === 'undated') {
            list = list.filter(t => t.dueDate === null);
        }

        // 4. Sorting
        list.sort((a, b) => {
            let comp = 0;
            if (this._sortColumn === 'dueDate') {
                if (a.dueDate === null && b.dueDate === null) comp = 0;
                else if (a.dueDate === null) comp = 1; // null dates sink to bottom
                else if (b.dueDate === null) comp = -1;
                else comp = a.dueDate.localeCompare(b.dueDate);
            } else if (this._sortColumn === 'title') {
                comp = a.cleanTitle.localeCompare(b.cleanTitle);
            } else if (this._sortColumn === 'area') {
                comp = (a.areaLabel || '').localeCompare(b.areaLabel || '');
            }

            return this._sortAscending ? comp : -comp;
        });

        return list;
    }

    public renderView(): void {
        const root = this.contentEl;
        root.empty();
        root.addClass('diwa-workspace-root', 'pos-gawa-workspace-root');

        this.loadTasksFromIndex();

        const container = root.createDiv({ cls: 'pos-gawa-cockpit-container' });

        // --- 1. Top Header Bar ---
        this.renderHeader(container);

        // --- 2. Filter Horizon Chips ---
        this.renderHorizonChips(container);

        // --- 3. Split Main Stage (Data Grid + Inspector) ---
        const mainStage = container.createDiv({ cls: 'pos-gawa-main-stage' });

        // Left/Center: Table Container
        const tableContainer = mainStage.createDiv({ cls: 'pos-gawa-table-container' });
        this.renderTable(tableContainer);

        // Right/Side: Slide-Over Inspector Container
        this._inspectorEl = mainStage.createDiv({ cls: 'pos-gawa-inspector' });
        this._inspectorEl.style.display = 'none';

        // Initial Data Populate
        this.renderTableRows();
        this.updateFilterChips();
        this.updateSummaryText();
    }

    private renderHeader(parent: HTMLElement): void {
        const header = parent.createDiv({ cls: 'pos-gawa-header-bar' });

        // Left Branding & Counters
        const leftGroup = header.createDiv({ cls: 'pos-gawa-header-left' });
        const logo = leftGroup.createSpan({ cls: 'pos-gawa-logo' });
        setIcon(logo, GAWA_COCKPIT_ICON_ID);
        leftGroup.createSpan({ text: 'Gawa Cockpit', cls: 'pos-gawa-title' });

        this._countSummaryEl = leftGroup.createSpan({ cls: 'pos-gawa-badge-counter' });

        // Right Controls: Search, Area Dropdown, Refresh
        const rightGroup = header.createDiv({ cls: 'pos-gawa-header-right' });

        // Search Input
        const searchBox = rightGroup.createDiv({ cls: 'pos-gawa-search-box' });
        const searchInput = searchBox.createEl('input', {
            type: 'search',
            placeholder: 'Search tasks, #tags, or remarks...',
            cls: 'pos-gawa-search-input',
            value: this._searchQuery,
        });
        searchInput.addEventListener('input', () => {
            this._searchQuery = searchInput.value;
            this.renderTableRows();
            this.updateSummaryText();
        });

        // Life Area Filter Dropdown
        const areaSelect = rightGroup.createEl('select', { cls: 'pos-gawa-area-select' });
        areaSelect.createEl('option', { value: 'all', text: 'All Areas' });
        for (const area of this.plugin.settings.lifeAreas) {
            areaSelect.createEl('option', {
                value: area.id,
                text: `${area.icon} ${area.label}`,
            });
        }
        areaSelect.value = this._activeAreaFilter;
        areaSelect.addEventListener('change', () => {
            this._activeAreaFilter = areaSelect.value;
            this.renderTableRows();
            this.updateFilterChips();
            this.updateSummaryText();
        });

        // Refresh Button
        const refreshBtn = rightGroup.createEl('button', {
            cls: 'pos-btn pos-btn-icon pos-gawa-refresh-btn',
            attr: { 'aria-label': 'Refresh Tasks' },
        });
        setIcon(refreshBtn, 'rotate-cw');
        refreshBtn.addEventListener('click', () => {
            this.refreshTasks();
            new Notice('Gawa tasks refreshed');
        });
    }

    private renderHorizonChips(parent: HTMLElement): void {
        this._chipsContainerEl = parent.createDiv({ cls: 'pos-gawa-horizon-chips' });
        this.updateFilterChips();
    }

    private updateFilterChips(): void {
        if (!this._chipsContainerEl) return;
        this._chipsContainerEl.empty();

        const todayStr = moment().format('YYYY-MM-DD');

        // Compute counts across current area filter & search query
        const baseTasks = this._tasks.filter(t => {
            if (this._activeAreaFilter !== 'all' && t.areaId.toLowerCase() !== this._activeAreaFilter.toLowerCase()) {
                return false;
            }
            return true;
        });

        const totalCount = baseTasks.length;
        const overdueCount = baseTasks.filter(t => t.dueDate !== null && t.dueDate < todayStr).length;
        const todayCount = baseTasks.filter(t => t.dueDate === todayStr).length;
        const upcomingCount = baseTasks.filter(t => t.dueDate !== null && t.dueDate > todayStr).length;
        const undatedCount = baseTasks.filter(t => t.dueDate === null).length;

        const chipsData: Array<{ id: DateFilterType; label: string; count: number; cls: string }> = [
            { id: 'all', label: 'All Open', count: totalCount, cls: 'chip-all' },
            { id: 'overdue', label: '🔴 Overdue', count: overdueCount, cls: 'chip-overdue' },
            { id: 'today', label: '🟡 Today', count: todayCount, cls: 'chip-today' },
            { id: 'upcoming', label: '🟢 Upcoming', count: upcomingCount, cls: 'chip-upcoming' },
            { id: 'undated', label: '⚪ Undated', count: undatedCount, cls: 'chip-undated' },
        ];

        for (const chip of chipsData) {
            const chipEl = this._chipsContainerEl.createDiv({
                cls: `pos-gawa-chip ${chip.cls} ${this._activeDateFilter === chip.id ? 'is-active' : ''}`,
            });
            chipEl.createSpan({ text: chip.label, cls: 'chip-label' });
            chipEl.createSpan({ text: String(chip.count), cls: 'chip-count' });

            chipEl.addEventListener('click', () => {
                this._activeDateFilter = chip.id;
                this.updateFilterChips();
                this.renderTableRows();
                this.updateSummaryText();
            });
        }
    }

    private updateSummaryText(): void {
        if (!this._countSummaryEl) return;
        const filteredCount = this.getFilteredAndSortedTasks().length;
        this._countSummaryEl.setText(`${filteredCount} tasks`);
    }

    private renderTable(parent: HTMLElement): void {
        const table = parent.createEl('table', { cls: 'pos-gawa-table' });

        // Table Header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');

        // Col 1: Checkbox
        headerRow.createEl('th', { cls: 'th-check', text: 'Status' });

        // Col 2: Task Title (Sortable)
        const thTitle = headerRow.createEl('th', { cls: 'th-title', text: 'Task Title' });
        this.attachSortHeader(thTitle, 'title');

        // Col 3: Due Date (Sortable)
        const thDate = headerRow.createEl('th', { cls: 'th-date', text: 'Earliest Due Date' });
        this.attachSortHeader(thDate, 'dueDate');

        // Col 4: Life Area (Sortable)
        const thArea = headerRow.createEl('th', { cls: 'th-area', text: 'Life Area' });
        this.attachSortHeader(thArea, 'area');

        // Col 5: Remarks Count
        headerRow.createEl('th', { cls: 'th-remarks', text: 'Remarks' });

        // Col 6: Source Note (Icon header)
        const thSource = headerRow.createEl('th', { cls: 'th-source', text: '' });
        setIcon(thSource, 'file-text');
        thSource.setAttribute('aria-label', 'Source Note');

        // Col 7: Inspect Action
        headerRow.createEl('th', { cls: 'th-action', text: '' });

        // Table Body
        this._tableBodyEl = table.createEl('tbody', { cls: 'pos-gawa-tbody' });
    }

    private attachSortHeader(th: HTMLElement, column: SortColumnType): void {
        th.addClass('is-sortable');
        const indicator = th.createSpan({ cls: 'sort-indicator' });
        this.updateSortIndicator(indicator, column);

        th.addEventListener('click', () => {
            if (this._sortColumn === column) {
                this._sortAscending = !this._sortAscending;
            } else {
                this._sortColumn = column;
                this._sortAscending = true;
            }
            // Update all sort headers
            const table = th.closest('table');
            if (table) {
                table.querySelectorAll('.sort-indicator').forEach(el => el.setText(''));
            }
            this.updateSortIndicator(indicator, column);
            this.renderTableRows();
        });
    }

    private updateSortIndicator(el: HTMLElement, column: SortColumnType): void {
        if (this._sortColumn === column) {
            el.setText(this._sortAscending ? ' ↑' : ' ↓');
        } else {
            el.setText('');
        }
    }

    private renderTableRows(): void {
        if (!this._tableBodyEl) return;
        this._tableBodyEl.empty();

        const tasks = this.getFilteredAndSortedTasks();

        if (tasks.length === 0) {
            const emptyRow = this._tableBodyEl.createEl('tr', { cls: 'pos-gawa-empty-row' });
            const cell = emptyRow.createEl('td', { attr: { colspan: '7' } });
            cell.createDiv({
                cls: 'pos-gawa-empty-state',
                text: '✨ No open tasks matching current filters. All caught up!',
            });
            return;
        }

        const todayStr = moment().format('YYYY-MM-DD');

        for (const task of tasks) {
            const isSelected = this._selectedTask?.filePath === task.filePath && this._selectedTask?.lineIndex === task.lineIndex;
            const row = this._tableBodyEl.createEl('tr', {
                cls: `pos-gawa-row ${isSelected ? 'is-selected' : ''}`,
            });

            // 1. Checkbox Cell
            const checkCell = row.createEl('td', { cls: 'td-check' });
            const checkbox = checkCell.createEl('input', {
                type: 'checkbox',
                cls: 'pos-gawa-checkbox task-list-item-checkbox',
            });
            checkbox.checked = task.completed;
            checkbox.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.handleTaskToggle(task, row, checkbox);
            });

            // 2. Title Cell with live Markdown / Wikilink rendering
            const titleCell = row.createEl('td', { cls: 'td-title' });
            const titleWrap = titleCell.createDiv({ cls: 'task-title-wrap' });
            const titleMarkdown = titleWrap.createDiv({ cls: 'task-title-markdown markdown-rendered' });

            void MarkdownRenderer.render(
                this.app,
                task.cleanTitle,
                titleMarkdown,
                task.filePath,
                this
            ).then(() => {
                const links = titleMarkdown.querySelectorAll<HTMLAnchorElement>('a.internal-link');
                links.forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const href = link.getAttribute('data-href') || link.textContent || '';
                        const cleanTarget = href.split('#')[0];
                        const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanTarget, task.filePath);
                        if (destFile) {
                            new WikilinkPeekModal(this.app, this.plugin, cleanTarget, task.filePath).open();
                        } else {
                            new Notice(`Note not found: ${cleanTarget}`);
                        }
                    });
                });
            });

            // Render subtask progress badge if present
            if (task.subtasks && task.subtasks.length > 0) {
                const doneCount = task.subtasks.filter(s => s.completed).length;
                const totalCount = task.subtasks.length;
                const allDone = doneCount === totalCount;
                const subtaskPill = titleWrap.createSpan({
                    cls: `pos-gawa-subtask-progress-pill ${allDone ? 'is-all-done' : ''}`,
                    text: allDone ? `✓ ${doneCount}/${totalCount}` : `☑ ${doneCount}/${totalCount}`,
                    attr: {
                        'aria-label': `${doneCount} of ${totalCount} subtasks completed`,
                        title: `${doneCount} of ${totalCount} subtasks completed`,
                    },
                });
                subtaskPill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInspector(task);
                });
            }

            // Render tags on title if present
            if (task.tags.length > 0) {
                const tagsWrapper = titleWrap.createSpan({ cls: 'pos-gawa-tags-wrap' });
                for (const tag of task.tags) {
                    tagsWrapper.createSpan({ text: `#${tag}`, cls: 'pos-gawa-inline-tag' });
                }
            }

            // 3. Due Date Cell
            const dateCell = row.createEl('td', { cls: 'td-date' });
            if (task.dueDate) {
                let badgeCls = 'date-upcoming';
                if (task.dueDate < todayStr) badgeCls = 'date-overdue';
                else if (task.dueDate === todayStr) badgeCls = 'date-today';
                else if (task.dueDate === moment().add(1, 'day').format('YYYY-MM-DD')) badgeCls = 'date-tomorrow';

                const datePill = dateCell.createSpan({
                    cls: `pos-gawa-date-pill ${badgeCls}`,
                    text: `${task.dueDate} (${task.dueDateRelative})`,
                });
                datePill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInspector(task);
                });
            } else {
                dateCell.createSpan({ text: '—', cls: 'date-none' });
            }

            // 4. Life Area Cell
            const areaCell = row.createEl('td', { cls: 'td-area' });
            if (task.areaId && task.areaId !== '—') {
                const areaPill = areaCell.createSpan({ cls: `pos-gawa-area-pill area-${task.areaId}` });
                areaPill.setText(`${task.areaIcon} ${task.areaLabel}`);
            } else {
                areaCell.createSpan({ text: '—', cls: 'area-none' });
            }

            // 5. Remarks Count Cell
            const remarksCell = row.createEl('td', { cls: 'td-remarks' });
            if (task.remarks && task.remarks.length > 0) {
                const remBadge = remarksCell.createSpan({
                    cls: 'pos-gawa-remarks-badge',
                    text: `💬 ${task.remarks.length}`,
                    attr: { 'aria-label': `${task.remarks.length} remarks` },
                });
                remBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInspector(task);
                });
            } else {
                remarksCell.createSpan({ text: '—', cls: 'rem-none' });
            }

            // 6. Source Link Cell (Icon button only)
            const sourceCell = row.createEl('td', { cls: 'td-source' });
            const sourceBtn = sourceCell.createEl('button', {
                cls: 'pos-btn-icon pos-gawa-source-btn',
                attr: {
                    'aria-label': `Peek source note: ${task.noteTitle}`,
                    title: `Peek source note: ${task.noteTitle}`,
                },
            });
            setIcon(sourceBtn, 'file-text');
            sourceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.peekSourceNote(task.filePath);
            });

            // 7. Inspect Button Cell
            const actionCell = row.createEl('td', { cls: 'td-action' });
            const inspectBtn = actionCell.createEl('button', {
                cls: 'pos-btn-icon pos-gawa-row-inspect-btn',
                attr: { 'aria-label': 'Inspect Task & Remarks' },
            });
            setIcon(inspectBtn, 'chevron-right');
            inspectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openInspector(task);
            });

            // Row click triggers inspector
            row.addEventListener('click', () => {
                this.openInspector(task);
            });
        }
    }

    private async handleTaskToggle(task: GawaTaskRecord, row: HTMLElement, checkbox: HTMLInputElement): Promise<void> {
        this._taskPending++;
        const newCompleted = checkbox.checked;
        row.toggleClass('is-completed', newCompleted);

        try {
            await this.plugin.capture.toggleTaskInFile(
                task.filePath,
                task.lineIndex,
                newCompleted,
                task.rawTitle
            );
            new Notice(newCompleted ? 'Task completed ✓' : 'Task reopened');

            // Optimistically update local model
            task.completed = newCompleted;

            // Trigger granular refresh
            this.plugin.notifyRefresh('tasks');
        } catch (err) {
            console.error('[GawaCockpitView] Failed to toggle task:', err);
            new Notice('Failed to update task state');
            checkbox.checked = !newCompleted;
            row.toggleClass('is-completed', !newCompleted);
        } finally {
            this._taskPending--;
        }
    }

    private peekSourceNote(filePath: string): void {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            const modal = new WikilinkPeekModal(this.app, this.plugin, file.basename, file.path);
            modal.open();
        } else {
            new Notice(`File not found: ${filePath}`);
        }
    }

    private openInspector(task: GawaTaskRecord): void {
        this._selectedTask = task;

        // Highlight selected row in table
        if (this._tableBodyEl) {
            this._tableBodyEl.querySelectorAll('tr').forEach(r => r.removeClass('is-selected'));
            const matchingRows = Array.from(this._tableBodyEl.querySelectorAll('tr'));
            const target = matchingRows.find(r => r.querySelector('.task-title-text')?.textContent === task.cleanTitle);
            if (target) target.addClass('is-selected');
        }

        this.renderInspector();
    }

    private closeInspector(): void {
        this._selectedTask = null;
        if (this._inspectorEl) {
            this._inspectorEl.style.display = 'none';
            this._inspectorEl.empty();
        }
        if (this._tableBodyEl) {
            this._tableBodyEl.querySelectorAll('tr').forEach(r => r.removeClass('is-selected'));
        }
    }

    private renderInspector(): void {
        if (!this._inspectorEl || !this._selectedTask) return;

        const task = this._selectedTask;
        this._inspectorEl.empty();
        this._inspectorEl.style.display = 'flex';

        // 1. Inspector Header
        const inspHeader = this._inspectorEl.createDiv({ cls: 'pos-gawa-insp-header' });
        inspHeader.createSpan({ text: 'Task Inspector', cls: 'insp-title' });

        const closeBtn = inspHeader.createEl('button', {
            cls: 'pos-btn-icon insp-close-btn',
            attr: { 'aria-label': 'Close Inspector' },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.closeInspector());

        // 2. Inspector Body
        const inspBody = this._inspectorEl.createDiv({ cls: 'pos-gawa-insp-body' });

        // Field: Title
        const titleField = inspBody.createDiv({ cls: 'pos-gawa-insp-field' });
        titleField.createEl('label', { text: 'Title' });
        const titleInput = titleField.createEl('input', {
            type: 'text',
            cls: 'pos-gawa-insp-input',
            value: task.cleanTitle,
        });

        // Field: Earliest Due Date
        const dateField = inspBody.createDiv({ cls: 'pos-gawa-insp-field' });
        dateField.createEl('label', { text: 'Earliest Due Date' });

        const dateControls = dateField.createDiv({ cls: 'pos-gawa-insp-date-controls' });
        const dateInput = dateControls.createEl('input', {
            type: 'date',
            cls: 'pos-gawa-insp-date-input',
            value: task.dueDate || '',
        });

        // Quick Date Chips
        const quickDates = dateField.createDiv({ cls: 'pos-gawa-insp-quick-dates' });
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        const nextWeekStr = moment().add(7, 'day').format('YYYY-MM-DD');

        const addQuickDateBtn = (label: string, dateVal: string | null) => {
            const btn = quickDates.createEl('button', {
                cls: 'pos-gawa-insp-date-btn',
                text: label,
            });
            btn.addEventListener('click', () => {
                dateInput.value = dateVal || '';
            });
        };

        addQuickDateBtn('Today', todayStr);
        addQuickDateBtn('Tomorrow', tomorrowStr);
        addQuickDateBtn('+7d', nextWeekStr);
        addQuickDateBtn('Clear', null);

        // Field: Life Area (Interactive Chips)
        const areaField = inspBody.createDiv({ cls: 'pos-gawa-insp-field' });
        areaField.createEl('label', { text: 'Life Area' });

        let selectedAreaId = task.areaId || '';
        const areaChipsWrap = areaField.createDiv({ cls: 'pos-gawa-insp-area-chips' });

        const unassignedChip = areaChipsWrap.createDiv({
            cls: `pos-gawa-insp-area-chip ${!selectedAreaId || selectedAreaId === '—' ? 'is-active' : ''}`,
            text: '— Unassigned',
        });
        unassignedChip.addEventListener('click', () => {
            selectedAreaId = '';
            areaChipsWrap.querySelectorAll('.pos-gawa-insp-area-chip').forEach(c => c.removeClass('is-active'));
            unassignedChip.addClass('is-active');
        });

        for (const area of this.plugin.settings.lifeAreas) {
            const isCurrent = (selectedAreaId || '').toLowerCase() === area.id.toLowerCase();
            const chip = areaChipsWrap.createDiv({
                cls: `pos-gawa-insp-area-chip area-${area.id} ${isCurrent ? 'is-active' : ''}`,
                text: `${area.icon} ${area.label}`,
            });
            chip.addEventListener('click', () => {
                selectedAreaId = area.id;
                areaChipsWrap.querySelectorAll('.pos-gawa-insp-area-chip').forEach(c => c.removeClass('is-active'));
                chip.addClass('is-active');
            });
        }

        // Field: Subtasks (Checklist, Progress Bar, & Quick Add)
        const subtasksField = inspBody.createDiv({ cls: 'pos-gawa-insp-field pos-gawa-insp-subtasks-field' });
        const subtasksCount = task.subtasks ? task.subtasks.length : 0;
        const subtasksDone = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;

        const subtaskHeader = subtasksField.createDiv({ cls: 'pos-gawa-insp-subtasks-header' });
        subtaskHeader.createEl('label', {
            text: `Subtasks (${subtasksDone}/${subtasksCount})`,
        });

        if (subtasksCount > 0) {
            const percent = Math.round((subtasksDone / subtasksCount) * 100);
            const progressRail = subtasksField.createDiv({ cls: 'pos-gawa-subtask-progress-rail' });
            const progressFill = progressRail.createDiv({ cls: 'pos-gawa-subtask-progress-fill' });
            progressFill.style.width = `${percent}%`;
            if (percent === 100) progressFill.addClass('is-complete');
        }

        // Subtasks List
        const subtasksList = subtasksField.createDiv({ cls: 'pos-gawa-subtask-list' });
        if (subtasksCount > 0) {
            task.subtasks.forEach((sub, idx) => {
                const subItem = subtasksList.createDiv({ cls: `pos-gawa-subtask-item ${sub.completed ? 'is-completed' : ''}` });

                // Checkbox
                const subCheckbox = subItem.createEl('input', {
                    type: 'checkbox',
                    cls: 'pos-gawa-subtask-checkbox task-list-item-checkbox',
                });
                subCheckbox.checked = sub.completed;
                subCheckbox.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.toggleSubtask(task, idx, subCheckbox.checked);
                });

                // Title
                const subTitle = subItem.createDiv({ cls: `pos-gawa-subtask-title ${sub.completed ? 'is-completed' : ''} markdown-rendered` });
                void MarkdownRenderer.render(this.app, sub.title, subTitle, task.filePath, this).then(() => {
                    subTitle.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach(link => {
                        link.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const href = link.getAttribute('data-href') || link.textContent || '';
                            const cleanTarget = href.split('#')[0];
                            const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanTarget, task.filePath);
                            if (destFile) {
                                new WikilinkPeekModal(this.app, this.plugin, cleanTarget, task.filePath).open();
                            } else {
                                new Notice(`Note not found: ${cleanTarget}`);
                            }
                        });
                    });
                });

                // Delete Button
                const delSubBtn = subItem.createEl('button', {
                    cls: 'pos-btn-icon pos-gawa-subtask-delete-btn',
                    attr: { 'aria-label': 'Delete subtask' },
                });
                setIcon(delSubBtn, 'trash-2');
                delSubBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.deleteSubtask(task, idx);
                });
            });
        } else {
            subtasksList.createDiv({
                cls: 'pos-gawa-subtasks-empty',
                text: 'No subtasks yet. Add step-by-step actions below.',
            });
        }

        // Add Subtask Composer
        const addSubtaskWrap = subtasksField.createDiv({ cls: 'pos-gawa-add-subtask-wrap' });
        const subtaskInput = addSubtaskWrap.createEl('input', {
            type: 'text',
            cls: 'pos-gawa-add-subtask-input',
            attr: {
                placeholder: 'Add a subtask... (Enter to save)',
            },
        });

        const addSubtaskBtn = addSubtaskWrap.createEl('button', {
            cls: 'pos-btn pos-btn-sm pos-gawa-add-subtask-btn',
            text: '+ Add',
        });

        const handleAddSubtask = async () => {
            const text = subtaskInput.value.trim();
            if (!text) return;
            await this.addSubtask(task, text);
            subtaskInput.value = '';
        };

        addSubtaskBtn.addEventListener('click', () => {
            void handleAddSubtask();
        });

        subtaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddSubtask();
            }
        });

        // Field: Notes & Comments (Interactive List + Add Composer)
        const commentsField = inspBody.createDiv({ cls: 'pos-gawa-insp-field' });
        commentsField.createEl('label', {
            text: `Notes & Comments (${task.remarks ? task.remarks.length : 0})`,
        });

        // 1. Rendered list of comments/notes
        const commentsList = commentsField.createDiv({ cls: 'pos-gawa-insp-comments-list' });
        if (task.remarks && task.remarks.length > 0) {
            task.remarks.forEach((rem, idx) => {
                const item = commentsList.createDiv({ cls: 'pos-gawa-insp-comment-item' });
                item.createSpan({ cls: 'pos-gawa-comment-bullet', text: '•' });

                const remContent = item.createDiv({ cls: 'pos-gawa-comment-content markdown-rendered' });
                void MarkdownRenderer.render(this.app, rem, remContent, task.filePath, this).then(() => {
                    remContent.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach(link => {
                        link.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const href = link.getAttribute('data-href') || link.textContent || '';
                            const cleanTarget = href.split('#')[0];
                            const destFile = this.app.metadataCache.getFirstLinkpathDest(cleanTarget, task.filePath);
                            if (destFile) {
                                new WikilinkPeekModal(this.app, this.plugin, cleanTarget, task.filePath).open();
                            } else {
                                new Notice(`Note not found: ${cleanTarget}`);
                            }
                        });
                    });
                });

                const deleteBtn = item.createEl('button', {
                    cls: 'pos-btn-icon pos-gawa-comment-delete-btn',
                    attr: { 'aria-label': 'Delete this note' },
                });
                setIcon(deleteBtn, 'trash-2');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.deleteComment(task, idx);
                });
            });
        } else {
            commentsList.createDiv({
                cls: 'pos-gawa-comments-empty',
                text: 'No notes or comments yet. Add one below to record context.',
            });
        }

        // 2. Add New Note / Comment Composer
        const addCommentWrap = commentsField.createDiv({ cls: 'pos-gawa-add-comment-wrap' });
        const commentInput = addCommentWrap.createEl('textarea', {
            cls: 'pos-gawa-insp-comment-input',
            attr: {
                rows: '2',
                placeholder: 'Add a note or comment... (⌘Enter to save)',
            },
        });

        const addCommentActions = addCommentWrap.createDiv({ cls: 'pos-gawa-add-comment-actions' });
        const addCommentBtn = addCommentActions.createEl('button', {
            cls: 'pos-btn pos-btn-sm pos-gawa-add-comment-btn',
            text: '+ Add Note',
        });

        const handleAddComment = async () => {
            const text = commentInput.value.trim();
            if (!text) return;
            await this.addComment(task, text);
            commentInput.value = '';
        };

        addCommentBtn.addEventListener('click', () => {
            void handleAddComment();
        });

        commentInput.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleAddComment();
            }
        });

        // Metadata footer
        const metaInfo = inspBody.createDiv({ cls: 'pos-gawa-insp-meta' });
        metaInfo.createDiv({ text: `Source: ${task.noteTitle}.md (line ${task.lineIndex + 1})` });

        // Save Button Footer
        const inspFooter = this._inspectorEl.createDiv({ cls: 'pos-gawa-insp-footer' });
        const saveBtn = inspFooter.createEl('button', {
            cls: 'pos-btn pos-btn-primary pos-gawa-save-btn',
            text: 'Save Changes',
        });

        saveBtn.addEventListener('click', async () => {
            await this.saveInspectorChanges(task, {
                title: titleInput.value.trim(),
                dueDate: dateInput.value ? dateInput.value : null,
                areaId: selectedAreaId,
                pendingCommentText: commentInput.value.trim(),
            });
        });
    }

    private async addSubtask(task: GawaTaskRecord, title: string): Promise<void> {
        const clean = title.trim();
        if (!clean) return;
        const updatedSubtasks = [...(task.subtasks || []), { title: clean, completed: false }];
        await this.persistSubtasks(task, updatedSubtasks);
        new Notice('Subtask added ✓');
    }

    private async toggleSubtask(task: GawaTaskRecord, index: number, completed: boolean): Promise<void> {
        const updatedSubtasks = [...(task.subtasks || [])];
        if (index >= 0 && index < updatedSubtasks.length) {
            updatedSubtasks[index] = { ...updatedSubtasks[index], completed };
            await this.persistSubtasks(task, updatedSubtasks);

            const allDone = updatedSubtasks.every(s => s.completed);
            if (allDone && updatedSubtasks.length > 0 && !task.completed) {
                new Notice('All subtasks completed! ✓');
            }
        }
    }

    private async deleteSubtask(task: GawaTaskRecord, index: number): Promise<void> {
        const updatedSubtasks = [...(task.subtasks || [])];
        if (index >= 0 && index < updatedSubtasks.length) {
            updatedSubtasks.splice(index, 1);
            await this.persistSubtasks(task, updatedSubtasks);
            new Notice('Subtask deleted');
        }
    }

    private async persistSubtasks(task: GawaTaskRecord, updatedSubtasks: GawaSubtaskItem[]): Promise<void> {
        this._taskPending++;
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: task.filePath,
                lineIndex: task.lineIndex,
                taskTitleFallback: task.rawTitle,
                newSubtasks: updatedSubtasks,
            });

            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }

            const freshTasks = this.plugin.index.getGawaTasks(false);
            const updatedRecord = freshTasks.find(t => t.filePath === task.filePath && (t.rawTitle === task.rawTitle || t.cleanTitle === task.cleanTitle));
            if (updatedRecord) {
                this._selectedTask = updatedRecord;
                Object.assign(task, updatedRecord);
            } else {
                task.subtasks = [...updatedSubtasks];
            }

            this.renderInspector();
            this.refreshTasks();
            this.plugin.notifyRefresh('tasks');
        } catch (err) {
            console.error('[GawaCockpitView] Failed to update subtasks:', err);
            new Notice('Failed to update subtasks');
        } finally {
            this._taskPending--;
        }
    }

    private async addComment(task: GawaTaskRecord, text: string): Promise<void> {
        const clean = text.trim();
        if (!clean) return;
        const updatedRemarks = [...(task.remarks || []), clean];
        await this.persistRemarks(task, updatedRemarks);
        new Notice('Note added ✓');
    }

    private async deleteComment(task: GawaTaskRecord, index: number): Promise<void> {
        const updatedRemarks = [...(task.remarks || [])];
        if (index >= 0 && index < updatedRemarks.length) {
            updatedRemarks.splice(index, 1);
            await this.persistRemarks(task, updatedRemarks);
            new Notice('Note deleted');
        }
    }

    private async persistRemarks(task: GawaTaskRecord, updatedRemarks: string[]): Promise<void> {
        this._taskPending++;
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: task.filePath,
                lineIndex: task.lineIndex,
                taskTitleFallback: task.rawTitle,
                newRemarks: updatedRemarks,
            });

            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }

            const freshTasks = this.plugin.index.getGawaTasks(false);
            const updatedRecord = freshTasks.find(t => t.filePath === task.filePath && (t.rawTitle === task.rawTitle || t.cleanTitle === task.cleanTitle));
            if (updatedRecord) {
                this._selectedTask = updatedRecord;
                Object.assign(task, updatedRecord);
            } else {
                task.remarks = [...updatedRemarks];
            }

            this.renderInspector();
            this.refreshTasks();
            this.plugin.notifyRefresh('tasks');
        } catch (err) {
            console.error('[GawaCockpitView] Failed to update remarks:', err);
            new Notice('Failed to update notes');
        } finally {
            this._taskPending--;
        }
    }

    private async saveInspectorChanges(
        task: GawaTaskRecord,
        changes: { title: string; dueDate: string | null; areaId: string; pendingCommentText?: string }
    ): Promise<void> {
        this._taskPending++;
        try {
            const finalRemarks = [...(task.remarks || [])];
            if (changes.pendingCommentText && changes.pendingCommentText.trim()) {
                finalRemarks.push(changes.pendingCommentText.trim());
            }

            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: task.filePath,
                lineIndex: task.lineIndex,
                taskTitleFallback: task.rawTitle,
                newTitle: changes.title,
                newDueDate: changes.dueDate,
                newAreaId: changes.areaId,
                newRemarks: finalRemarks,
            });

            // Re-index file in IndexService immediately so cache reflects updated remarks & title
            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file instanceof TFile) {
                await this.plugin.index.indexCaptureFile(file);
            }

            const freshTasks = this.plugin.index.getGawaTasks(false);
            const updatedRecord = freshTasks.find(t => t.filePath === task.filePath && (t.cleanTitle === changes.title || t.rawTitle.includes(changes.title)));
            if (updatedRecord) {
                this._selectedTask = updatedRecord;
                Object.assign(task, updatedRecord);
            } else {
                task.rawTitle = changes.title;
                task.cleanTitle = changes.title;
                task.dueDate = changes.dueDate;
                task.areaId = changes.areaId;
                const matchedArea = this.plugin.settings.lifeAreas.find(a => a.id.toLowerCase() === (changes.areaId || '').toLowerCase());
                task.areaLabel = matchedArea ? matchedArea.label : (changes.areaId ? changes.areaId.charAt(0).toUpperCase() + changes.areaId.slice(1) : '—');
                task.areaIcon = matchedArea ? matchedArea.icon : '—';
                task.remarks = finalRemarks;
            }

            new Notice('Task details saved ✓');
            this.renderInspector();
            this.refreshTasks();
            this.plugin.notifyRefresh('tasks');
        } catch (err) {
            console.error('[GawaCockpitView] Failed to save task changes:', err);
            new Notice('Failed to save task changes');
        } finally {
            this._taskPending--;
        }
    }
}

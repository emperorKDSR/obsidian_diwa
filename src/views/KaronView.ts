import { ItemView, WorkspaceLeaf, setIcon, moment, MarkdownRenderer, TFile } from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_KARON, KARON_ICON_ID } from '../constants';
import { GawaTaskRecord, CaptureEntry } from '../types';
import { WikilinkPeekModal } from '../modals/WikilinkPeekModal';

export class KaronView extends ItemView {
    plugin: DiwaPlugin;

    private _horizon: 'today' | '3d' | '7d' = 'today';
    private _collapsedSections: Set<string> = new Set();
    private _containerEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_KARON;
    }

    getDisplayText(): string {
        return 'Karon — Today & Horizon';
    }

    getIcon(): string {
        return KARON_ICON_ID;
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('diwa-workspace-root');
        this.contentEl.addClass('pos-karon-view');

        this._containerEl = this.contentEl.createDiv({ cls: 'pos-karon-container' });
        this.renderView();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    public refreshView(): void {
        this.renderView();
    }

    private renderView(): void {
        if (!this._containerEl) return;
        this._containerEl.empty();

        const today = moment();
        const todayStr = today.format('YYYY-MM-DD');

        // --- 1. Header Bar ---
        const headerEl = this._containerEl.createDiv({ cls: 'pos-karon-header' });
        
        const titleArea = headerEl.createDiv({ cls: 'pos-karon-title-area' });
        const titleRow = titleArea.createDiv({ cls: 'pos-karon-title-row' });
        const iconSpan = titleRow.createSpan({ cls: 'pos-karon-header-icon' });
        setIcon(iconSpan, 'sun');
        titleRow.createEl('h3', { text: `Karon · ${today.format('dddd, MMMM D, YYYY')}`, cls: 'pos-karon-title' });

        titleArea.createEl('p', {
            text: "Today's briefing & rolling intended horizon",
            cls: 'pos-karon-subtitle'
        });

        const actionsRow = headerEl.createDiv({ cls: 'pos-karon-actions-row' });

        // Horizon Selector Pills
        const horizonGroup = actionsRow.createDiv({ cls: 'pos-karon-horizon-group' });
        
        const horizons: { id: 'today' | '3d' | '7d'; label: string }[] = [
            { id: 'today', label: '☀️ Today' },
            { id: '3d', label: '📅 3 Days' },
            { id: '7d', label: '🗓️ 7 Days' },
        ];

        for (const h of horizons) {
            const btn = horizonGroup.createEl('button', {
                cls: `pos-karon-horizon-btn ${this._horizon === h.id ? 'is-active' : ''}`,
                text: h.label
            });
            btn.onclick = () => {
                this._horizon = h.id;
                this.renderView();
            };
        }

        // Quick Refresh Button
        const refreshBtn = actionsRow.createEl('button', {
            cls: 'pos-karon-action-btn',
            attr: { 'aria-label': 'Refresh Horizon' }
        });
        setIcon(refreshBtn, 'rotate-cw');
        refreshBtn.onclick = () => {
            this.renderView();
        };

        // --- 2. Main Stream Stage ---
        const streamStage = this._containerEl.createDiv({ cls: 'pos-karon-stage' });

        // Overdue Tasks Alert (if any)
        const overdueTasks = this.plugin.index.getOverdueTasks(todayStr);
        if (overdueTasks.length > 0) {
            this.renderOverdueSection(streamStage, overdueTasks);
        }

        // Compute list of dates based on active horizon
        const numDays = this._horizon === 'today' ? 1 : this._horizon === '3d' ? 4 : 8;
        const horizonDates: { dateStr: string; dayOffset: number }[] = [];

        for (let i = 0; i < numDays; i++) {
            const dateStr = moment(todayStr).add(i, 'days').format('YYYY-MM-DD');
            horizonDates.push({ dateStr, dayOffset: i });
        }

        // Render each day's accordion
        for (const item of horizonDates) {
            this.renderDaySection(streamStage, item.dateStr, item.dayOffset);
        }
    }

    /**
     * Render the Overdue Tasks Banner and accordion
     */
    private renderOverdueSection(container: HTMLElement, overdueTasks: GawaTaskRecord[]): void {
        const isCollapsed = this._collapsedSections.has('overdue');
        const sectionEl = container.createDiv({ cls: 'pos-karon-day-section pos-karon-overdue-section' });

        const headerEl = sectionEl.createDiv({ cls: 'pos-karon-section-header' });
        headerEl.onclick = () => {
            if (this._collapsedSections.has('overdue')) {
                this._collapsedSections.delete('overdue');
            } else {
                this._collapsedSections.add('overdue');
            }
            this.renderView();
        };

        const leftWrap = headerEl.createDiv({ cls: 'pos-karon-sec-header-left' });
        const toggleIcon = leftWrap.createSpan({ cls: 'pos-karon-collapse-icon' });
        setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

        const titleSpan = leftWrap.createSpan({ cls: 'pos-karon-sec-title pos-karon-overdue-title' });
        titleSpan.setText('🔴 Overdue Tasks');

        const badgeWrap = headerEl.createDiv({ cls: 'pos-karon-sec-badges' });
        badgeWrap.createSpan({ cls: 'pos-karon-pill pos-karon-pill-danger', text: `${overdueTasks.length} Overdue` });

        if (!isCollapsed) {
            const contentEl = sectionEl.createDiv({ cls: 'pos-karon-section-content' });
            for (const task of overdueTasks) {
                this.renderTaskRow(contentEl, task, true);
            }
        }
    }

    /**
     * Render a single day accordion section (Tasks + Notes)
     */
    private renderDaySection(container: HTMLElement, dateStr: string, dayOffset: number): void {
        const isCollapsed = this._collapsedSections.has(dateStr);
        const sectionEl = container.createDiv({
            cls: `pos-karon-day-section ${dayOffset === 0 ? 'is-today' : ''}`
        });

        // Day header labels
        let dayTitle = '';
        if (dayOffset === 0) {
            dayTitle = `Today · ${moment(dateStr).format('dddd, MMM D')}`;
        } else if (dayOffset === 1) {
            dayTitle = `Tomorrow · ${moment(dateStr).format('dddd, MMM D')}`;
        } else {
            dayTitle = moment(dateStr).format('dddd, MMMM D');
        }

        const tasks = this.plugin.index.getTasksForDueDate(dateStr);
        const notes = this.plugin.index.getCapturesForTargetDate(dateStr);
        const totalItems = tasks.length + notes.length;

        // Header
        const headerEl = sectionEl.createDiv({ cls: 'pos-karon-section-header' });
        headerEl.onclick = () => {
            if (this._collapsedSections.has(dateStr)) {
                this._collapsedSections.delete(dateStr);
            } else {
                this._collapsedSections.add(dateStr);
            }
            this.renderView();
        };

        const leftWrap = headerEl.createDiv({ cls: 'pos-karon-sec-header-left' });
        const toggleIcon = leftWrap.createSpan({ cls: 'pos-karon-collapse-icon' });
        setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

        const titleSpan = leftWrap.createSpan({ cls: 'pos-karon-sec-title' });
        titleSpan.setText(dayTitle);

        const badgesWrap = headerEl.createDiv({ cls: 'pos-karon-sec-badges' });
        
        // Relative day pill
        const relLabel = dayOffset === 0 ? 'Today' : `D+${dayOffset}`;
        badgesWrap.createSpan({ cls: `pos-karon-pill ${dayOffset === 0 ? 'pos-karon-pill-today' : ''}`, text: relLabel });

        if (tasks.length > 0) {
            badgesWrap.createSpan({ cls: 'pos-karon-pill', text: `☑️ ${tasks.length}` });
        }
        if (notes.length > 0) {
            badgesWrap.createSpan({ cls: 'pos-karon-pill', text: `📝 ${notes.length}` });
        }
        if (totalItems === 0) {
            badgesWrap.createSpan({ cls: 'pos-karon-pill pos-karon-pill-muted', text: 'Clear' });
        }

        if (isCollapsed) return;

        const contentEl = sectionEl.createDiv({ cls: 'pos-karon-section-content' });

        // Empty State
        if (totalItems === 0) {
            const emptyEl = contentEl.createDiv({ cls: 'pos-karon-empty-day' });
            emptyEl.setText('No tasks or notes scheduled for this day.');
            return;
        }

        // Sub-section 1: Tasks Due
        if (tasks.length > 0) {
            const tasksHeader = contentEl.createDiv({ cls: 'pos-karon-subsection-header' });
            const tIcon = tasksHeader.createSpan({ cls: 'pos-karon-sub-icon' });
            setIcon(tIcon, 'check-square');
            tasksHeader.createSpan({ text: `Tasks Due (${tasks.length})`, cls: 'pos-karon-sub-title' });

            const taskListEl = contentEl.createDiv({ cls: 'pos-karon-task-list' });
            for (const task of tasks) {
                this.renderTaskRow(taskListEl, task, false);
            }
        }

        // Sub-section 2: Notes Intended for Day
        if (notes.length > 0) {
            const notesHeader = contentEl.createDiv({ cls: 'pos-karon-subsection-header' });
            const nIcon = notesHeader.createSpan({ cls: 'pos-karon-sub-icon' });
            setIcon(nIcon, 'file-text');
            notesHeader.createSpan({ text: `Notes Intended for Today (${notes.length})`, cls: 'pos-karon-sub-title' });

            const noteListEl = contentEl.createDiv({ cls: 'pos-karon-note-list' });
            for (const note of notes) {
                this.renderNoteCard(noteListEl, note, dateStr);
            }
        }
    }

    /**
     * Render an individual Task row with interactive checkbox
     */
    private renderTaskRow(container: HTMLElement, task: GawaTaskRecord, isOverdue: boolean): void {
        const rowEl = container.createDiv({ cls: `pos-karon-task-row ${task.completed ? 'is-completed' : ''}` });

        // Checkbox
        const checkEl = rowEl.createEl('input', {
            type: 'checkbox',
            cls: 'pos-karon-checkbox task-list-item-checkbox'
        });
        checkEl.checked = task.completed;
        checkEl.onclick = async (e) => {
            e.stopPropagation();
            const newStatus = !task.completed;
            try {
                await this.plugin.capture.toggleTaskInFile(
                    task.filePath,
                    task.lineIndex,
                    newStatus,
                    task.rawTitle,
                    task.shadowedLocations
                );
                task.completed = newStatus;
                rowEl.toggleClass('is-completed', newStatus);
                // Trigger refresh via coordinator for zero-lag sync across views
                this.plugin.refreshCoordinator.notifyRefresh('tasks');
            } catch (err) {
                console.error('[DIWA Karon] Failed to toggle task', err);
            }
        };

        // Task Body & Title
        const bodyEl = rowEl.createDiv({ cls: 'pos-karon-task-body' });
        const titleSpan = bodyEl.createSpan({ cls: 'pos-karon-task-title' });
        titleSpan.setText(task.cleanTitle || task.rawTitle);

        // Meta tags: Area & Due
        const metaEl = rowEl.createDiv({ cls: 'pos-karon-task-meta' });

        if (task.areaLabel && task.areaLabel !== '—') {
            const areaBadge = metaEl.createSpan({ cls: 'pos-karon-meta-badge pos-karon-area-badge' });
            areaBadge.setText(`${task.areaIcon !== '—' ? task.areaIcon + ' ' : ''}${task.areaLabel}`);
        }

        if (isOverdue && task.dueDateRelative) {
            const dueBadge = metaEl.createSpan({ cls: 'pos-karon-meta-badge pos-karon-due-overdue' });
            dueBadge.setText(task.dueDateRelative);
        }

        // Remarks badge if any
        if (task.remarks && task.remarks.length > 0) {
            const remBadge = metaEl.createSpan({ cls: 'pos-karon-meta-badge', attr: { 'aria-label': `${task.remarks.length} remark(s)` } });
            remBadge.setText(`💬 ${task.remarks.length}`);
        }

        // Subtasks badge if any
        if (task.subtasks && task.subtasks.length > 0) {
            const doneSub = task.subtasks.filter(s => s.completed).length;
            const subBadge = metaEl.createSpan({ cls: 'pos-karon-meta-badge' });
            subBadge.setText(`☑ ${doneSub}/${task.subtasks.length}`);
        }

        // Source file peek/jump button
        const sourceBtn = rowEl.createEl('button', {
            cls: 'pos-karon-source-btn',
            attr: { 'aria-label': `Open ${task.noteTitle}` }
        });
        setIcon(sourceBtn, 'arrow-up-right');
        sourceBtn.onclick = (e) => {
            e.stopPropagation();
            new WikilinkPeekModal(this.app, this.plugin, task.noteTitle, task.filePath).open();
        };
    }

    /**
     * Render an individual Note Card with extracted snippets
     */
    private renderNoteCard(container: HTMLElement, entry: CaptureEntry, targetDate: string): void {
        const cardEl = container.createDiv({ cls: 'pos-karon-note-card' });

        // Card Header
        const cardHeader = cardEl.createDiv({ cls: 'pos-karon-card-header' });
        
        const titleArea = cardHeader.createDiv({ cls: 'pos-karon-card-title-wrap' });
        const noteName = entry.filePath.split('/').pop()?.replace(/\.md$/, '') || entry.id;
        const titleEl = titleArea.createEl('span', { text: noteName, cls: 'pos-karon-card-title' });
        titleEl.onclick = () => {
            new WikilinkPeekModal(this.app, this.plugin, noteName, entry.filePath).open();
        };

        const cardMeta = cardHeader.createDiv({ cls: 'pos-karon-card-meta' });
        if (entry.area) {
            const matchedArea = this.plugin.settings.lifeAreas.find(a => a.id.toLowerCase() === entry.area.toLowerCase());
            const areaBadge = cardMeta.createSpan({ cls: 'pos-karon-meta-badge pos-karon-area-badge' });
            areaBadge.setText(`${matchedArea?.icon ? matchedArea.icon + ' ' : ''}${matchedArea?.label || entry.area}`);
        }

        // Open Note Split Button
        const openBtn = cardMeta.createEl('button', {
            cls: 'pos-karon-card-action',
            attr: { 'aria-label': 'Open in split' }
        });
        setIcon(openBtn, 'external-link');
        openBtn.onclick = async () => {
            const file = this.app.vault.getAbstractFileByPath(entry.filePath);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf('split', 'vertical');
                await leaf.openFile(file);
            }
        };

        // Card Body with Snippets
        const cardBody = cardEl.createDiv({ cls: 'pos-karon-card-body' });
        const snippets = this.plugin.index.extractTargetDateSnippets(entry, targetDate);

        for (const snippet of snippets) {
            const snippetEl = cardBody.createDiv({ cls: 'pos-karon-snippet' });
            void MarkdownRenderer.renderMarkdown(
                snippet,
                snippetEl,
                entry.filePath,
                this
            );
        }

        // Attach interactive clicks to internal links within snippets
        this.attachInteractiveLinks(cardBody, entry.filePath);
    }

    /**
     * Intercept and handle wikilinks inside rendered markdown snippets
     */
    private attachInteractiveLinks(container: HTMLElement, sourcePath: string): void {
        const links = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
        links.forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const target = link.getAttribute('data-href') || link.innerText;
                if (!target) return;
                new WikilinkPeekModal(this.app, this.plugin, target, sourcePath).open();
            };
        });
    }
}

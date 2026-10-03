import { ItemView, WorkspaceLeaf, setIcon, Notice, moment, MarkdownRenderer, Platform } from 'obsidian';
import type DiwaPlugin from '../main';
import { DigestibleBlock } from '../types';
import { VIEW_TYPE_CALENDAR_DIGEST, CALENDAR_DIGEST_ICON_ID } from '../constants';
import { PreFlightDigestModal } from '../modals/PreFlightDigestModal';
import { isTablet } from '../utils';

export class CalendarDigestView extends ItemView {
    plugin: DiwaPlugin;

    private _selectedDate: string = moment().format('YYYY-MM-DD');
    private _currentMonth: string = moment().format('YYYY-MM');
    private _mobileTab: 'calendar' | 'stream' = 'stream';

    // DOM containers
    private _containerEl: HTMLElement | null = null;
    private _calendarPaneEl: HTMLElement | null = null;
    private _streamPaneEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_CALENDAR_DIGEST;
    }

    getDisplayText(): string {
        return 'Daily Digest & Review';
    }

    getIcon(): string {
        return CALENDAR_DIGEST_ICON_ID;
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('diwa-workspace-root');
        this.contentEl.addClass('pos-calendar-digest-view');

        this._containerEl = this.contentEl.createDiv({ cls: 'pos-digest-container' });
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

        const isNarrow = Platform.isMobile && !isTablet(this.app);

        // Header
        const headerEl = this._containerEl.createDiv({ cls: 'pos-digest-header' });
        const titleWrap = headerEl.createDiv({ cls: 'pos-digest-title-wrap' });
        const iconSpan = titleWrap.createSpan({ cls: 'pos-digest-icon' });
        setIcon(iconSpan, 'calendar-check');
        titleWrap.createEl('h3', { text: 'Daily Digest & Review', cls: 'pos-digest-title' });

        // Mobile Segmented Switcher
        if (isNarrow) {
            const tabsWrap = headerEl.createDiv({ cls: 'pos-digest-mobile-tabs' });
            const calTab = tabsWrap.createEl('button', {
                cls: `pos-digest-tab-btn ${this._mobileTab === 'calendar' ? 'is-active' : ''}`,
                text: '📅 Calendar'
            });
            calTab.onclick = () => {
                this._mobileTab = 'calendar';
                this.renderView();
            };

            const entries = this.plugin.index.getCapturesForDate(this._selectedDate);
            const streamTab = tabsWrap.createEl('button', {
                cls: `pos-digest-tab-btn ${this._mobileTab === 'stream' ? 'is-active' : ''}`,
                text: `📝 Stream (${entries.length})`
            });
            streamTab.onclick = () => {
                this._mobileTab = 'stream';
                this.renderView();
            };
        }

        // Split Stage
        const splitStage = this._containerEl.createDiv({ cls: 'pos-digest-split-stage' });

        if (!isNarrow || this._mobileTab === 'calendar') {
            this._calendarPaneEl = splitStage.createDiv({ cls: 'pos-digest-calendar-pane' });
            this.renderCalendarPane(this._calendarPaneEl);
        }

        if (!isNarrow || this._mobileTab === 'stream') {
            this._streamPaneEl = splitStage.createDiv({ cls: 'pos-digest-stage' });
            this.renderStreamPane(this._streamPaneEl);
        }
    }

    // --- Left Rail: Calendar Pane ---
    private renderCalendarPane(container: HTMLElement): void {
        container.empty();

        // Month Navigation
        const navEl = container.createDiv({ cls: 'pos-calendar-nav' });
        const prevBtn = navEl.createEl('button', { cls: 'pos-cal-nav-btn', attr: { 'aria-label': 'Previous Month' } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => {
            this._currentMonth = moment(this._currentMonth, 'YYYY-MM').subtract(1, 'month').format('YYYY-MM');
            this.renderCalendarPane(container);
        };

        navEl.createEl('span', {
            cls: 'pos-cal-month-label',
            text: moment(this._currentMonth, 'YYYY-MM').format('MMMM YYYY')
        });

        const nextBtn = navEl.createEl('button', { cls: 'pos-cal-nav-btn', attr: { 'aria-label': 'Next Month' } });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.onclick = () => {
            this._currentMonth = moment(this._currentMonth, 'YYYY-MM').add(1, 'month').format('YYYY-MM');
            this.renderCalendarPane(container);
        };

        const todayJump = navEl.createEl('button', { cls: 'pos-cal-today-btn', text: 'Today' });
        todayJump.onclick = () => {
            this._selectedDate = moment().format('YYYY-MM-DD');
            this._currentMonth = moment().format('YYYY-MM');
            this.renderView();
        };

        // Day of Week Headers
        const gridEl = container.createDiv({ cls: 'pos-calendar-grid' });
        const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
        for (const wd of weekdays) {
            gridEl.createDiv({ cls: 'pos-cal-weekday-header', text: wd });
        }

        // Calendar Day Cells
        const monthMoment = moment(this._currentMonth, 'YYYY-MM');
        const startOfMonth = monthMoment.clone().startOf('month');
        const daysInMonth = monthMoment.daysInMonth();
        const startDayOfWeek = (startOfMonth.isoWeekday() - 1); // 0 = Mon, 6 = Sun
        const todayStr = moment().format('YYYY-MM-DD');

        // Blank cells before month starts
        for (let i = 0; i < startDayOfWeek; i++) {
            gridEl.createDiv({ cls: 'pos-cal-cell is-empty-padding' });
        }

        // Days of month
        const summaryMap = this.plugin.index.getMonthDigestSummary(this._currentMonth);

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${this._currentMonth}-${String(d).padStart(2, '0')}`;
            const summary = summaryMap.get(dateStr) || {
                dateStr,
                totalCount: 0,
                digestedCount: 0,
                hasOpenTasks: false,
                status: 'empty' as const
            };

            const cell = gridEl.createDiv({
                cls: `pos-cal-cell ${dateStr === this._selectedDate ? 'is-selected' : ''} ${dateStr === todayStr ? 'is-today' : ''} status-${summary.status}`
            });

            cell.createSpan({ cls: 'pos-cal-day-num', text: String(d) });

            // Status Indicator Dot / Pill
            if (summary.status === 'digested') {
                const badge = cell.createSpan({ cls: 'pos-cal-dot is-digested', attr: { title: `${summary.totalCount} notes digested` } });
                setIcon(badge, 'check');
            } else if (summary.status === 'partial') {
                cell.createSpan({
                    cls: 'pos-cal-dot is-partial',
                    attr: { title: `${summary.digestedCount}/${summary.totalCount} digested` }
                });
            } else if (summary.status === 'raw') {
                cell.createSpan({
                    cls: 'pos-cal-dot is-raw',
                    attr: { title: `${summary.totalCount} raw notes pending review` }
                });
            }

            cell.onclick = () => {
                this._selectedDate = dateStr;
                if (Platform.isMobile && !isTablet(this.app)) {
                    this._mobileTab = 'stream';
                }
                this.renderView();
            };
        }

        // Quick Horizons Footer
        const horizonsEl = container.createDiv({ cls: 'pos-calendar-horizons' });
        const todayBtn = horizonsEl.createEl('button', {
            cls: `pos-horizon-pill ${this._selectedDate === todayStr ? 'is-active' : ''}`,
            text: '📅 Today'
        });
        todayBtn.onclick = () => {
            this._selectedDate = todayStr;
            this._currentMonth = moment().format('YYYY-MM');
            this.renderView();
        };

        const yesterdayStr = moment().subtract(1, 'day').format('YYYY-MM-DD');
        const yesterdayBtn = horizonsEl.createEl('button', {
            cls: `pos-horizon-pill ${this._selectedDate === yesterdayStr ? 'is-active' : ''}`,
            text: '⏪ Yesterday'
        });
        yesterdayBtn.onclick = () => {
            this._selectedDate = yesterdayStr;
            this._currentMonth = moment(yesterdayStr).format('YYYY-MM');
            this.renderView();
        };
    }

    // --- Right Stage: Note Stream & Digest Action ---
    private renderStreamPane(container: HTMLElement): void {
        container.empty();

        const entries = this.plugin.index.getCapturesForDate(this._selectedDate);
        const summary = this.plugin.index.getDayDigestSummary(this._selectedDate);
        const formattedDate = moment(this._selectedDate, 'YYYY-MM-DD').format('dddd, MMMM D, YYYY');

        // Stage Header
        const stageHeader = container.createDiv({ cls: 'pos-stage-header' });
        const leftMeta = stageHeader.createDiv({ cls: 'pos-stage-meta' });
        leftMeta.createEl('h2', { cls: 'pos-stage-date-title', text: formattedDate });

        leftMeta.createSpan({
            cls: `pos-stage-status-pill status-${summary.status}`,
            text: summary.status === 'digested'
                ? `✓ Digested (${summary.digestedCount}/${summary.totalCount})`
                : summary.status === 'partial'
                ? `⏳ Partially Digested (${summary.digestedCount}/${summary.totalCount})`
                : summary.status === 'raw'
                ? `⏳ Unprocessed (${summary.totalCount} notes)`
                : `○ No notes captured`
        });

        // Stage Actions
        const actionsWrap = stageHeader.createDiv({ cls: 'pos-stage-actions' });

        if (entries.length > 0) {
            const digestBtn = actionsWrap.createEl('button', {
                cls: `pos-digest-action-btn ${summary.status === 'digested' ? 'is-secondary' : 'mod-cta'}`,
                text: summary.status === 'digested' ? '↺ Re-digest Day' : '⚡ Digest Day'
            });
            digestBtn.onclick = () => {
                this.openPreFlightDigest();
            };

            if (summary.status === 'digested' || summary.status === 'partial') {
                const unmarkBtn = actionsWrap.createEl('button', {
                    cls: 'pos-undigest-btn',
                    text: 'Reset Status'
                });
                unmarkBtn.onclick = async () => {
                    for (const entry of entries) {
                        await this.plugin.capture.unmarkCaptureAsDigested(entry.filePath);
                    }
                    new Notice(`Digest status cleared for ${this._selectedDate}`);
                    this.renderView();
                };
            }
        }

        // Stream Body
        const streamContainer = container.createDiv({ cls: 'pos-digest-stream' });

        if (entries.length === 0) {
            const emptyEl = streamContainer.createDiv({ cls: 'pos-stream-empty' });
            setIcon(emptyEl.createDiv({ cls: 'pos-empty-icon' }), 'notebook');
            emptyEl.createEl('h4', { text: 'No notes captured for this date' });
            emptyEl.createEl('p', { text: 'Use the scratchpad or Quick Capture (⌘K) to record thoughts.' });
            return;
        }

        // Render Cards
        for (const entry of entries) {
            const card = streamContainer.createDiv({
                cls: `pos-digest-card ${entry.digested ? 'is-digested' : ''}`
            });

            // Card Top Meta
            const cardMeta = card.createDiv({ cls: 'pos-card-meta' });
            const timeStr = moment(entry.createdAtMs).format('HH:mm');
            cardMeta.createSpan({ cls: 'pos-card-time', text: timeStr });

            if (entry.area) {
                cardMeta.createSpan({ cls: 'pos-card-area-badge', text: entry.area.toUpperCase() });
            }

            if (entry.digested) {
                const digestPill = cardMeta.createSpan({ cls: 'pos-card-digested-badge' });
                setIcon(digestPill, 'check');
                digestPill.createSpan({ text: ' Digested' });
            }

            // Card Body (Render Markdown)
            const bodyEl = card.createDiv({ cls: 'pos-card-body markdown-rendered' });
            MarkdownRenderer.render(
                this.app,
                entry.body,
                bodyEl,
                entry.filePath,
                this
            );

            // Card Footer Actions
            const cardFooter = card.createDiv({ cls: 'pos-card-footer' });
            if (entry.hasTasks) {
                const taskBadge = cardFooter.createSpan({ cls: 'pos-card-task-badge' });
                setIcon(taskBadge, 'check-square');
                taskBadge.createSpan({ text: ` ${entry.tasks?.length || 0} task(s)` });
            }

            const cardActions = cardFooter.createDiv({ cls: 'pos-card-actions' });
            const viewFileBtn = cardActions.createEl('button', { cls: 'pos-card-btn', text: 'Open Note ↗' });
            viewFileBtn.onclick = () => {
                const file = this.app.vault.getAbstractFileByPath(entry.filePath);
                if (file) {
                    this.app.workspace.openLinkText(file.path, '', false);
                }
            };
        }
    }

    // --- Digest Trigger ---
    private openPreFlightDigest(): void {
        const entries = this.plugin.index.getCapturesForDate(this._selectedDate);
        if (entries.length === 0) {
            new Notice('No notes found for this date.');
            return;
        }

        // Compile all digestible blocks across all notes for this date
        const allBlocks: DigestibleBlock[] = [];
        for (const entry of entries) {
            const blocks = this.plugin.capture.parseDigestibleBlocks(
                entry.body,
                entry.filePath,
                entry.createdAtMs
            );
            allBlocks.push(...blocks);
        }

        if (allBlocks.length === 0) {
            new Notice('No digestible blocks identified in these notes.');
            return;
        }

        new PreFlightDigestModal(
            this.app,
            this.plugin,
            this._selectedDate,
            allBlocks,
            async (confirmedBlocks) => {
                await this.plugin.capture.executeBatchDigest(this._selectedDate, confirmedBlocks);
                await this.plugin.index.buildIndices();
                this.renderView();
            }
        ).open();
    }
}

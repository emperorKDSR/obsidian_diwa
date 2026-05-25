import { App, Modal, Platform, setIcon } from 'obsidian';
import { isTablet, parseNaturalDate } from '../utils';
import { ContextSuggestModal } from './ContextSuggestModal';
import { ProjectPickerModal } from './ProjectPickerModal';
import type { TaskEntry, ProjectEntry, RecurrenceRule } from '../types';
import type { VaultService } from '../services/VaultService';
import type { IndexService } from '../services/IndexService';

export class EditTaskModal extends Modal {
    private readonly task: TaskEntry;
    private readonly vault: VaultService;
    private readonly index: IndexService;
    private readonly onSaved: () => void;

    // ── Form state (initialized from task) ──────────────────────────────
    private _title: string;
    private _dueDate: string | null;
    private _recurrence: RecurrenceRule | null;
    private _priority: 'high' | 'medium' | 'low' | null;
    private _energy:   'high' | 'medium' | 'low' | null;
    private _status:   'open' | 'waiting' | 'someday';
    private _contexts: string[];
    private _project:  ProjectEntry | null;

    private _isMobileSheet = false;
    private _viewportCleanup: (() => void) | null = null;

    constructor(
        app: App,
        task: TaskEntry,
        vault: VaultService,
        index: IndexService,
        onSaved: () => void
    ) {
        super(app);
        this.task    = task;
        this.vault   = vault;
        this.index   = index;
        this.onSaved = onSaved;

        this._title      = task.title;
        this._dueDate    = task.due || null;
        this._recurrence = task.recurrence ?? null;
        this._priority   = task.priority   ?? null;
        this._energy     = task.energy     ?? null;
        this._status     = (task.status === 'waiting' || task.status === 'someday')
                           ? task.status : 'open';
        this._contexts   = [...(task.context ?? [])];

        const projName = task.project ?? null;
        this._project = projName
            ? (Array.from(index.projectIndex.values()).find(
                p => p.name === projName || p.id === projName) ?? null)
            : null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('diwa-workspace-popup-shell');
        this.modalEl.addClass('diwa-workspace-popup-shell--edit-task');
        if (Platform.isMobile && !isTablet()) {
            this._isMobileSheet = true;
            this._renderMobile();
        } else if (isTablet()) {
            this._renderTablet();
        } else {
            this._renderDesktop();
        }
    }

    onClose(): void {
        this._viewportCleanup?.();
        this._viewportCleanup = null;
        if (this._isMobileSheet) {
            document.body.removeClass('diwa-task-edit-active');
        }
        this.contentEl.empty();
    }

    // ── Save ─────────────────────────────────────────────────────────────

    private async _save(): Promise<void> {
        if (!this._title.trim()) return;
        const ok = await this.vault.updateTaskEntry(this.task.filePath, {
            title:      this._title.trim(),
            dueDate:    this._dueDate,
            recurrence: this._recurrence,
            priority:   this._priority,
            energy:     this._energy,
            status:     this._status ?? 'open',
            contexts:   this._contexts,
            project:    this._project?.name ?? null,
        });
        if (ok) {
            this.onSaved();
            this.close();
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // MOBILE RENDER — bottom sheet
    // ════════════════════════════════════════════════════════════════════

    private _renderMobile(): void {
        const { contentEl, modalEl } = this;

        modalEl.addClass('diwa-edit-task-sheet');
        modalEl.style.setProperty('border-radius', '16px', 'important');
        modalEl.style.setProperty('overflow', 'visible', 'important');
        contentEl.style.setProperty('border-radius', '16px', 'important');
        contentEl.style.setProperty('overflow', 'hidden', 'important');
        document.body.addClass('diwa-task-edit-active');

        const root = contentEl.createDiv({ cls: 'diwa-ets-root' });

        // Handle bar — drag pill + inline close button (no separate header)
        const handleBar = root.createDiv({ cls: 'diwa-ets-handle-bar' });
        handleBar.createDiv({ cls: 'diwa-ets-handle-pill' });
        const closeBtn = handleBar.createEl('button', {
            cls: 'diwa-ets-close-btn', attr: { 'aria-label': 'Close' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.close());

        // Title — borderless, full-focus textarea
        const titleWrap = root.createDiv({ cls: 'diwa-ets-title-wrap' });
        const titleTA = titleWrap.createEl('textarea', {
            cls: 'diwa-ets-title-textarea',
            attr: { placeholder: 'What needs to be done?' }
        }) as HTMLTextAreaElement;
        titleTA.value = this._title;

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        titleTA.addEventListener('input', () => {
            this._title = titleTA.value;
            titleTA.style.height = 'auto';
            titleTA.style.height = Math.min(titleTA.scrollHeight, 200) + 'px';
            refreshSave();
        });

        // Unified metadata dock — single horizontal scrollable row
        // dockWrap is position:relative so popovers open upward from it
        const dockWrap = root.createDiv({ cls: 'diwa-ets-dock-wrap' });
        const dock     = dockWrap.createDiv({ cls: 'diwa-ets-dock' });

        this._buildToolbarChips(dock, dockWrap, 'diwa-ets-tool-chip', 'diwa-ets-toolbar-dot');
        dock.createEl('span', { cls: 'diwa-ets-toolbar-dot', text: '·' });
        this._buildChipsRow(dock, 'diwa-ets-inline-chips',
            'diwa-ets-tag-chip', 'diwa-ets-tag-add-btn', 'diwa-ets-project-pill')();

        // Footer
        const footer = root.createDiv({ cls: 'diwa-ets-footer' });
        footer.createEl('button', { text: 'Cancel', cls: 'diwa-ets-cancel-btn' })
            .addEventListener('click', () => this.close());
        saveBtn = footer.createEl('button', {
            text: 'Save', cls: 'diwa-ets-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._save());
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
            if (e.key === 'Escape') this.close();
        });

        setTimeout(() => {
            titleTA.focus();
            titleTA.setSelectionRange(titleTA.value.length, titleTA.value.length);
            titleTA.style.height = 'auto';
            titleTA.style.height = Math.min(titleTA.scrollHeight, 200) + 'px';
        }, 80);

        // Swipe to dismiss only from handle bar — not from dock (avoid conflict with horizontal scroll)
        this._initSwipeToDismiss(modalEl, handleBar, handleBar);
    }

    // ════════════════════════════════════════════════════════════════════
    // TABLET RENDER — centered, portrait/landscape aware
    // ════════════════════════════════════════════════════════════════════

    private _renderTablet(): void {
        const { contentEl, modalEl } = this;

        modalEl.addClass('diwa-task-edit-modal');
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        if (isLandscape) modalEl.addClass('is-landscape');

        // Header
        const header = contentEl.createDiv({ cls: 'diwa-tem-header' });
        header.createDiv({ cls: 'diwa-tem-drag-handle' });
        const headerRow = header.createDiv({ cls: 'diwa-tem-header-row' });
        const closeBtn = headerRow.createEl('button', {
            text: '✕', cls: 'diwa-tem-close-btn', attr: { 'aria-label': 'Close' }
        });
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = contentEl.createDiv({
            cls: `diwa-tem-body${isLandscape ? ' is-split' : ''}`
        });

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        const buildTitleTA = (parent: HTMLElement, maxH: number): HTMLTextAreaElement => {
            const sec = parent.createDiv({ cls: 'diwa-tem-section diwa-tem-title-zone' });
            const ta = sec.createEl('textarea', {
                cls: 'diwa-tem-title-input', attr: { placeholder: 'What needs to be done?' }
            }) as HTMLTextAreaElement;
            ta.value = this._title;
            ta.addEventListener('input', () => {
                this._title = ta.value;
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
                refreshSave();
            });
            return ta;
        };

        let titleInput: HTMLTextAreaElement;

        if (isLandscape) {
            const leftPane  = body.createDiv({ cls: 'diwa-tem-left' });
            const rightPane = body.createDiv({ cls: 'diwa-tem-right' });

            titleInput = buildTitleTA(leftPane, 148);
            leftPane.createDiv({ cls: 'diwa-tem-spacer' });

            const chipZone = leftPane.createDiv({ cls: 'diwa-tem-section diwa-tem-chip-zone' });
            this._buildChipsRow(chipZone, 'diwa-tem-chips-row', 'diwa-tem-tag-chip', 'diwa-tem-tag-add-btn', 'diwa-tem-project-pill')();

            // Toolbar in right pane (landscape)
            const twWrap  = rightPane.createDiv({ cls: 'diwa-tem-toolbar-wrap' });
            const twInner = twWrap.createDiv({ cls: 'diwa-tem-toolbar' });
            this._buildToolbarChips(twInner, twWrap,
                'diwa-tem-tool-chip', 'diwa-tem-toolbar-dot');
        } else {
            titleInput = buildTitleTA(body, 148);

            // Toolbar (portrait)
            const tpWrap  = body.createDiv({ cls: 'diwa-tem-toolbar-wrap' });
            const tpInner = tpWrap.createDiv({ cls: 'diwa-tem-toolbar' });
            this._buildToolbarChips(tpInner, tpWrap,
                'diwa-tem-tool-chip', 'diwa-tem-toolbar-dot');

            const chipSec = body.createDiv({ cls: 'diwa-tem-section diwa-tem-chip-zone' });
            this._buildChipsRow(chipSec, 'diwa-tem-chips-row', 'diwa-tem-tag-chip', 'diwa-tem-tag-add-btn', 'diwa-tem-project-pill')();
        }

        // Footer
        const footer = contentEl.createDiv({ cls: 'diwa-tem-footer' });
        footer.createEl('button', { text: 'Cancel', cls: 'diwa-tem-cancel-btn' })
            .addEventListener('click', () => this.close());
        saveBtn = footer.createEl('button', {
            text: 'Save', cls: 'diwa-tem-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._save());
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
            if (e.key === 'Escape') this.close();
        });

        setTimeout(() => {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
            titleInput.style.height = 'auto';
            titleInput.style.height = Math.min(titleInput.scrollHeight, 148) + 'px';
        }, 80);

        const dragHandle = header.querySelector('.diwa-tem-drag-handle') as HTMLElement;
        this._initTabletSwipeDismiss(modalEl, dragHandle, header);
    }

    // ════════════════════════════════════════════════════════════════════
    // DESKTOP RENDER — single column, toolbar
    // ════════════════════════════════════════════════════════════════════

    private _renderDesktop(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass('diwa-edit-task-modal');

        const header = contentEl.createDiv({ cls: 'diwa-etm-shell-header diwa-workspace-popup-header' });
        header.createEl('span', { cls: 'diwa-workspace-popup-eyebrow', text: 'Task details' });
        const titleRow = header.createDiv({ cls: 'diwa-workspace-popup-title-row' });
        const title = titleRow.createDiv({ cls: 'diwa-workspace-popup-title', text: 'Edit task' });
        title.setAttr('role', 'heading');
        title.setAttr('aria-level', '2');
        const closeBtn = titleRow.createEl('button', {
            cls: 'diwa-workspace-popup-close diwa-etm-close-btn',
            text: '✕',
            attr: { type: 'button', 'aria-label': 'Close edit task modal' },
        });
        closeBtn.addEventListener('click', () => {
            modalEl.addClass('is-closing');
            setTimeout(() => this.close(), 140);
        });
        header.createEl('p', {
            cls: 'diwa-workspace-popup-subtitle',
            text: 'Refine schedule, effort, status, and tags without leaving the workspace.',
        });

        // Body — single column
        const body = contentEl.createDiv({ cls: 'diwa-etm-body' });

        const titleWrap = body.createDiv({ cls: 'diwa-etm-title-wrap' });
        const textarea  = titleWrap.createEl('textarea', {
            cls:  'diwa-etm-textarea',
            attr: { placeholder: 'What needs to be done?', rows: '1' }
        }) as HTMLTextAreaElement;
        textarea.value = this._title;

        // Metadata toolbar — row 1: scheduling | row 2: priority · energy · status
        const toolbarWrap = body.createDiv({ cls: 'diwa-etm-toolbar-wrap' });
        const toolbar     = toolbarWrap.createDiv({ cls: 'diwa-etm-toolbar' });
        this._buildToolbarChips(toolbar, toolbarWrap,
            'diwa-etm-tool-chip', 'diwa-etm-toolbar-dot', true);

        // Tags + project
        const chipsRow = body.createDiv({ cls: 'diwa-etm-chips-row' });
        this._buildChipsRow(
            chipsRow, 'diwa-etm-chips-inner',
            'diwa-etm-chip', 'diwa-etm-chip-add-btn', 'diwa-etm-proj-pill'
        )();

        // Footer
        const footer = contentEl.createDiv({ cls: 'diwa-etm-footer' });

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        textarea.addEventListener('input', () => {
            this._title = textarea.value;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 320) + 'px';
            refreshSave();
        });

        footer.createEl('button', { text: 'Cancel', cls: 'diwa-etm-cancel-btn' })
            .addEventListener('click', () => {
                modalEl.addClass('is-closing');
                setTimeout(() => this.close(), 140);
            });
        saveBtn = footer.createEl('button', {
            text: 'Save', cls: 'diwa-etm-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => {
            modalEl.addClass('is-closing');
            setTimeout(() => this._save(), 0);
        });
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                modalEl.addClass('is-closing');
                setTimeout(() => this._save(), 0);
            }
            if (e.key === 'Escape') {
                modalEl.addClass('is-closing');
                setTimeout(() => this.close(), 140);
            }
        }, true);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 320) + 'px';
        }, 80);
    }

    // ════════════════════════════════════════════════════════════════════
    // SHARED PRIMITIVES
    // ════════════════════════════════════════════════════════════════════

    private _buildDateStrip(container: HTMLElement, stripCls: string): void {
        const strip   = container.createDiv({ cls: stripCls });
        const display = container.createDiv({ cls: 'diwa-date-display' });
        display.style.display = 'none';
        const btnEls: HTMLButtonElement[] = [];

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'diwa-date-display-icon' });
            const lbl = display.createSpan({
                text: window.moment(dateStr).format('ddd, MMM D'),
                cls: 'diwa-date-display-label'
            });
            lbl.addEventListener('click', () => showNLPInput());
            const clr = display.createEl('button', { text: '×', cls: 'diwa-date-display-clear' });
            clr.addEventListener('click', () => {
                this._dueDate = null;
                updateDisplay(null);
                btnEls.forEach(b => b.removeClass('is-selected'));
            });
        };

        const setDueDate = (d: string) => {
            this._dueDate = d;
            updateDisplay(d);
        };

        const today     = window.moment();
        const dow       = today.day(); // 0=Sun
        const daysToFri = dow <= 4 ? (5 - dow) : (12 - dow);
        const rawShortcuts = [
            { label: 'TODAY',                                 days: 0              },
            { label: 'TMRW',                                  days: 1              },
            { label: daysToFri > 2 ? 'THIS FRI' : '+7D',     days: daysToFri > 2 ? daysToFri : 7 },
            { label: '+7D',                                   days: 7              },
            { label: '+30D',                                  days: 30             },
        ];
        const shortcuts = rawShortcuts.filter(
            (s, i, a) => a.findIndex(x => x.days === s.days) === i
        );

        shortcuts.forEach(s => {
            const btn = strip.createEl('button', {
                text: s.label, cls: 'diwa-date-shortcut-btn'
            }) as HTMLButtonElement;
            btnEls.push(btn);
            if (this._dueDate) {
                const btnDate = window.moment().add(s.days, 'days').format('YYYY-MM-DD');
                if (btnDate === this._dueDate) btn.addClass('is-selected');
            }
            btn.addEventListener('click', () => {
                const d = window.moment().add(s.days, 'days').format('YYYY-MM-DD');
                setDueDate(d);
                btnEls.forEach(b => b.removeClass('is-selected'));
                btn.addClass('is-selected');
            });
        });

        const pickBtn = strip.createEl('button', {
            text: 'PICK ▾', cls: 'diwa-date-shortcut-btn diwa-date-pick-btn'
        }) as HTMLButtonElement;
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.diwa-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'diwa-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text', cls: 'diwa-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            input.style.setProperty('font-size', 'max(16px, 0.875rem)');
            const confirmBtn = wrap.createEl('button', {
                text: '↵', cls: 'diwa-date-nlp-confirm',
                attr: { 'aria-label': 'Confirm date' }
            });
            const tryConfirm = () => {
                const parsed = parseNaturalDate(input.value.trim());
                if (parsed) {
                    setDueDate(parsed);
                    wrap.remove();
                } else {
                    input.addClass('is-error');
                    setTimeout(() => input.removeClass('is-error'), 600);
                }
            };
            confirmBtn.addEventListener('click', tryConfirm);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') tryConfirm();
                if (e.key === 'Escape') wrap.remove();
            });
            setTimeout(() => input.focus(), 0);
        };

        if (this._dueDate) updateDisplay(this._dueDate);
    }

    private _buildRecurStrip(
        container: HTMLElement,
        compact:   boolean,
        stripCls:  string
    ): void {
        const strip = container.createDiv({ cls: stripCls });

        if (!compact) {
            const iconWrap = strip.createDiv({ cls: 'diwa-recur-icon' });
            setIcon(iconWrap, 'repeat-2');
        }

        type ROption = { value: RecurrenceRule | null; label: string };
        const OPTIONS: ROption[] = [
            { value: null,        label: '—'        },
            { value: 'daily',     label: 'Daily'    },
            { value: 'weekly',    label: 'Weekly'   },
            { value: 'biweekly',  label: 'Biweekly' },
            { value: 'monthly',   label: 'Monthly'  },
        ];
        const btnEls: HTMLButtonElement[] = [];

        const syncActive = () => {
            btnEls.forEach((b, i) => {
                const active = OPTIONS[i].value === this._recurrence;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };

        OPTIONS.forEach(({ value, label }) => {
            const btn = strip.createEl('button', {
                text: label, cls: 'diwa-recur-btn',
                attr: { 'aria-pressed': 'false', 'data-recurrence': value ?? 'none' }
            }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                this._recurrence = (this._recurrence === value && value !== null) ? null : value;
                syncActive();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
            btn.addEventListener('keydown', (e: KeyboardEvent) => {
                const idx = btnEls.indexOf(btn);
                if (e.key === 'ArrowRight') { e.preventDefault(); btnEls[idx + 1]?.focus(); }
                if (e.key === 'ArrowLeft')  { e.preventDefault(); btnEls[idx - 1]?.focus(); }
            });
        });

        syncActive();
    }

    private _buildMetaStrip(
        container:         HTMLElement,
        compact:           boolean,
        stripCls:          string,
        includeOpenStatus: boolean = false
    ): void {
        const strip = container.createDiv({ cls: stripCls });

        const priValues:    ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const priLabels:    Record<string, string> = { low: '!', medium: '!!', high: '!!!' };
        const energyValues: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const energyLabels: Record<string, string> = { low: '🌙', medium: '〰', high: '⚡' };

        const priBtns:    HTMLButtonElement[] = [];
        const energyBtns: HTMLButtonElement[] = [];
        const statusBtns: HTMLButtonElement[] = [];

        const syncPri    = () => priBtns.forEach(b    => { const a = b.getAttribute('data-priority') === this._priority;    b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });
        const syncEnergy = () => energyBtns.forEach(b => { const a = b.getAttribute('data-energy')   === this._energy;      b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });
        const syncStatus = () => statusBtns.forEach(b => { const a = b.getAttribute('data-status')   === this._status;      b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });

        if (compact) {
            // Desktop / tablet landscape: icon + row layout
            const makeRow = (iconName: string, rowAttr: string): HTMLElement => {
                const row = strip.createDiv({ cls: 'diwa-meta-row', attr: { 'data-row': rowAttr } });
                const ico = row.createDiv({ cls: 'diwa-meta-icon' });
                setIcon(ico, iconName);
                return row;
            };

            const priRow = makeRow('flag', 'priority');
            priValues.forEach(val => {
                const btn = priRow.createEl('button', {
                    text: priLabels[val], cls: 'diwa-meta-btn diwa-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._priority = this._priority === val ? null : val;
                    syncPri();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = priBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); priBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); priBtns[idx - 1]?.focus(); }
                });
            });

            const energyRow = makeRow('zap', 'energy');
            energyValues.forEach(val => {
                const btn = energyRow.createEl('button', {
                    text: energyLabels[val], cls: 'diwa-meta-btn diwa-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._energy = this._energy === val ? null : val;
                    syncEnergy();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = energyBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); energyBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); energyBtns[idx - 1]?.focus(); }
                });
            });

            const statusRow = makeRow('circle-dot', 'status');
            const statusOptions = includeOpenStatus
                ? [{ value: 'open' as const, label: 'OPEN' }, { value: 'waiting' as const, label: 'WAITING' }, { value: 'someday' as const, label: 'SOMEDAY' }]
                : [{ value: 'waiting' as const, label: 'WAITING' }, { value: 'someday' as const, label: 'SOMEDAY' }];
            statusOptions.forEach(({ value, label }) => {
                const btn = statusRow.createEl('button', {
                    text: label, cls: 'diwa-meta-btn diwa-meta-btn--status',
                    attr: { 'data-status': value, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._status = (this._status === value && value !== 'open') ? 'open' : value;
                    syncStatus();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = statusBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); statusBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); statusBtns[idx - 1]?.focus(); }
                });
            });
        } else {
            // Mobile / tablet portrait: flat horizontal scroll with inline labels
            strip.createEl('span', { text: 'PRI', cls: 'diwa-meta-label' });
            priValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: priLabels[val], cls: 'diwa-meta-btn diwa-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._priority = this._priority === val ? null : val;
                    syncPri();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
            strip.createEl('span', { cls: 'diwa-meta-divider' });
            strip.createEl('span', { text: 'NRG', cls: 'diwa-meta-label' });
            energyValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: energyLabels[val], cls: 'diwa-meta-btn diwa-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._energy = this._energy === val ? null : val;
                    syncEnergy();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
            strip.createEl('span', { cls: 'diwa-meta-divider' });
            strip.createEl('span', { text: 'STATUS', cls: 'diwa-meta-label' });
            ([{ value: 'waiting' as const, label: '⏳ WAIT' }, { value: 'someday' as const, label: '☁ SMDY' }]).forEach(({ value, label }) => {
                const btn = strip.createEl('button', {
                    text: label, cls: 'diwa-meta-btn diwa-meta-btn--status',
                    attr: { 'data-status': value, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._status = this._status === value ? 'open' : value;
                    syncStatus();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
        }

        syncPri();
        syncEnergy();
        syncStatus();
    }

    // ── Toolbar chip: due date ────────────────────────────────────────────────

    private _buildDateChip(
        toolbar:       HTMLElement,
        popoverAnchor: HTMLElement,
        chipCls:       string
    ): HTMLButtonElement {
        const chip = toolbar.createEl('button', {
            cls:  `${chipCls} ${chipCls}--date`,
            attr: { 'aria-label': 'Set due date', type: 'button' }
        }) as HTMLButtonElement;

        const updateLabel = () => {
            chip.empty();
            chip.createSpan({ text: '📅 ' });
            chip.createSpan({
                text: this._dueDate
                    ? window.moment(this._dueDate).format('MMM D')
                    : 'Due'
            });
            chip.toggleClass('is-active', !!this._dueDate);
            if (this._dueDate) {
                const clr = chip.createSpan({
                    text: ' ×', cls: 'diwa-etm-chip-clear',
                    attr: { role: 'button', 'aria-label': 'Clear date', tabindex: '0' }
                });
                clr.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this._dueDate = null;
                    updateLabel();
                    popoverAnchor.querySelector('[data-etm-popover="date"]')?.remove();
                });
            }
        };
        updateLabel();

        chip.addEventListener('click', (e: MouseEvent) => {
            if ((e.target as HTMLElement).classList.contains('diwa-etm-chip-clear')) return;
            const existing = popoverAnchor.querySelector('[data-etm-popover="date"]');
            if (existing) { existing.remove(); return; }
            popoverAnchor.querySelector('.diwa-etm-popover')?.remove();

            const popover = popoverAnchor.createDiv({
                cls:  'diwa-etm-popover diwa-workspace-popup-shell diwa-workspace-popup-shell--inline',
                attr: { 'data-etm-popover': 'date' }
            });

            const shortcutsRow = popover.createDiv({ cls: 'diwa-etm-popover-shortcuts' });
            const today     = window.moment();
            const dow       = today.day();
            const daysToFri = dow <= 4 ? (5 - dow) : (12 - dow);
            const rawShortcuts = [
                { label: 'TODAY',                                 days: 0              },
                { label: 'TMRW',                                  days: 1              },
                { label: daysToFri > 2 ? 'THIS FRI' : '+7D',     days: daysToFri > 2 ? daysToFri : 7 },
                { label: '+7D',                                   days: 7              },
                { label: '+30D',                                  days: 30             },
            ];
            const shortcuts = rawShortcuts.filter(
                (s, i, a) => a.findIndex(x => x.days === s.days) === i
            );

            const scBtns: HTMLButtonElement[] = [];
            shortcuts.forEach(s => {
                const d   = window.moment().add(s.days, 'days').format('YYYY-MM-DD');
                const btn = shortcutsRow.createEl('button', {
                    text: s.label, cls: 'diwa-date-shortcut-btn', attr: { type: 'button' }
                }) as HTMLButtonElement;
                scBtns.push(btn);
                if (d === this._dueDate) btn.addClass('is-selected');
                btn.addEventListener('click', () => {
                    this._dueDate = d;
                    updateLabel();
                    scBtns.forEach(b => b.removeClass('is-selected'));
                    btn.addClass('is-selected');
                    setTimeout(() => popover.remove(), 200);
                });
            });

            const nlpWrap    = popover.createDiv({ cls: 'diwa-date-nlp-wrap' });
            const nlpInput   = nlpWrap.createEl('input', {
                type: 'text', cls: 'diwa-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            nlpInput.style.setProperty('font-size', 'max(16px, 0.82rem)');
            const confirmBtn = nlpWrap.createEl('button', {
                text: '↵', cls: 'diwa-date-nlp-confirm',
                attr: { 'aria-label': 'Confirm date', type: 'button' }
            });
            const tryConfirm = () => {
                const parsed = parseNaturalDate(nlpInput.value.trim());
                if (parsed) {
                    this._dueDate = parsed;
                    updateLabel();
                    popover.remove();
                } else {
                    nlpInput.addClass('is-error');
                    setTimeout(() => nlpInput.removeClass('is-error'), 600);
                }
            };
            confirmBtn.addEventListener('click', tryConfirm);
            nlpInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter')  tryConfirm();
                if (e.key === 'Escape') popover.remove();
            });
            const onOutside = (ev: MouseEvent) => {
                if (!popover.contains(ev.target as Node) && !chip.contains(ev.target as Node)) {
                    popover.remove();
                    document.removeEventListener('mousedown', onOutside);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
            setTimeout(() => nlpInput.focus(), 50);
        });

        return chip;
    }

    // ── Toolbar chip: recurrence ─────────────────────────────────────────────

    private _buildRecurChip(
        toolbar:       HTMLElement,
        popoverAnchor: HTMLElement,
        chipCls:       string
    ): HTMLButtonElement {
        type ROption = { value: RecurrenceRule | null; label: string };
        const OPTIONS: ROption[] = [
            { value: null,       label: '—'        },
            { value: 'daily',    label: 'Daily'    },
            { value: 'weekly',   label: 'Weekly'   },
            { value: 'biweekly', label: 'Biweekly' },
            { value: 'monthly',  label: 'Monthly'  },
        ];

        const chip = toolbar.createEl('button', {
            cls:  `${chipCls} ${chipCls}--recur`,
            attr: { 'aria-label': 'Set recurrence', type: 'button' }
        }) as HTMLButtonElement;

        const updateLabel = () => {
            chip.empty();
            chip.createSpan({ text: '🔁 ' });
            const active = OPTIONS.find(o => o.value === this._recurrence);
            chip.createSpan({ text: active?.value ? active.label : 'Repeat' });
            chip.toggleClass('is-active', !!this._recurrence);
        };
        updateLabel();

        chip.addEventListener('click', () => {
            const existing = popoverAnchor.querySelector('[data-etm-popover="recur"]');
            if (existing) { existing.remove(); return; }
            popoverAnchor.querySelector('.diwa-etm-popover')?.remove();

            const popover = popoverAnchor.createDiv({
                cls:  'diwa-etm-popover diwa-workspace-popup-shell diwa-workspace-popup-shell--inline',
                attr: { 'data-etm-popover': 'recur' }
            });
            const optsRow = popover.createDiv({ cls: 'diwa-etm-recur-opts' });

            const recurBtns: HTMLButtonElement[] = [];
            OPTIONS.forEach(({ value, label }) => {
                const btn = optsRow.createEl('button', {
                    text: label, cls: 'diwa-recur-btn',
                    attr: {
                        type: 'button',
                        'aria-pressed': String(this._recurrence === value),
                        'data-recurrence': value ?? 'none'
                    }
                }) as HTMLButtonElement;
                recurBtns.push(btn);
                btn.toggleClass('is-active', this._recurrence === value);
                btn.addEventListener('click', () => {
                    this._recurrence = (this._recurrence === value && value !== null) ? null : value;
                    updateLabel();
                    recurBtns.forEach(b => {
                        const rv = b.getAttribute('data-recurrence');
                        const resolved = rv === 'none' ? null : rv as RecurrenceRule;
                        b.toggleClass('is-active', this._recurrence === resolved);
                        b.setAttribute('aria-pressed', String(this._recurrence === resolved));
                    });
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    setTimeout(() => popover.remove(), 120);
                });
            });

            const onOutside = (ev: MouseEvent) => {
                if (!popover.contains(ev.target as Node) && !chip.contains(ev.target as Node)) {
                    popover.remove();
                    document.removeEventListener('mousedown', onOutside);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
        });

        return chip;
    }

    // ── Toolbar: full chip row ───────────────────────────────────────────────

    private _buildToolbarChips(
        toolbar:       HTMLElement,
        popoverAnchor: HTMLElement,
        chipCls:       string,
        dotCls:        string,
        twoRow =       false
    ): void {
        this._buildDateChip(toolbar, popoverAnchor, chipCls);
        this._buildRecurChip(toolbar, popoverAnchor, chipCls);

        if (twoRow) {
            // Force properties row to start on a new line
            toolbar.createDiv({ cls: 'diwa-etm-toolbar-row-break' });
        } else {
            toolbar.createSpan({ cls: dotCls, text: '·' });
        }

        // Priority
        const PRI: { val: 'low' | 'medium' | 'high'; label: string }[] = [
            { val: 'low',    label: '!'   },
            { val: 'medium', label: '!!'  },
            { val: 'high',   label: '!!!' },
        ];
        const priChips: HTMLButtonElement[] = [];
        PRI.forEach(({ val, label }) => {
            const c = toolbar.createEl('button', {
                cls:  `${chipCls} ${chipCls}--pri-${val}`,
                text: label,
                attr: { type: 'button', 'aria-label': `Priority ${val}`, 'aria-pressed': 'false' }
            }) as HTMLButtonElement;
            priChips.push(c);
            c.addEventListener('click', () => {
                this._priority = this._priority === val ? null : val;
                syncPri();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
        });
        const syncPri = () => PRI.forEach(({ val }, i) => {
            priChips[i].toggleClass('is-active', this._priority === val);
            priChips[i].setAttribute('aria-pressed', String(this._priority === val));
        });
        syncPri();

        // Energy
        const NRG: { val: 'low' | 'medium' | 'high'; label: string }[] = [
            { val: 'low',    label: '🌙' },
            { val: 'medium', label: '〰' },
            { val: 'high',   label: '⚡' },
        ];
        const nrgChips: HTMLButtonElement[] = [];
        NRG.forEach(({ val, label }) => {
            const c = toolbar.createEl('button', {
                cls:  `${chipCls} ${chipCls}--nrg-${val}`,
                text: label,
                attr: { type: 'button', 'aria-label': `Energy ${val}`, 'aria-pressed': 'false' }
            }) as HTMLButtonElement;
            nrgChips.push(c);
            c.addEventListener('click', () => {
                this._energy = this._energy === val ? null : val;
                syncNrg();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
        });
        const syncNrg = () => NRG.forEach(({ val }, i) => {
            nrgChips[i].toggleClass('is-active', this._energy === val);
            nrgChips[i].setAttribute('aria-pressed', String(this._energy === val));
        });
        syncNrg();

        toolbar.createSpan({ cls: dotCls, text: '·' });

        // Status
        const STATUS: { val: 'waiting' | 'someday'; label: string }[] = [
            { val: 'waiting', label: 'WAIT' },
            { val: 'someday', label: 'SMDY' },
        ];
        const statusChips: HTMLButtonElement[] = [];
        STATUS.forEach(({ val, label }) => {
            const c = toolbar.createEl('button', {
                cls:  chipCls,
                text: label,
                attr: { type: 'button', 'aria-label': `Status: ${val}`,
                        'aria-pressed': 'false', 'data-status': val }
            }) as HTMLButtonElement;
            statusChips.push(c);
            c.addEventListener('click', () => {
                this._status = this._status === val ? 'open' : val;
                syncStatus();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
        });
        const syncStatus = () => STATUS.forEach(({ val }, i) => {
            statusChips[i].toggleClass('is-active', this._status === val);
            statusChips[i].setAttribute('aria-pressed', String(this._status === val));
        });
        syncStatus();
    }

    private _buildChipsRow(
        container:      HTMLElement,
        rowCls:         string,
        chipCls:        string,
        addBtnCls:      string,
        projectPillCls: string
    ): () => void {
        const row = container.createDiv({ cls: rowCls });
        const allProjects = Array.from(this.index.projectIndex.values())
            .filter(p => p.status !== 'archived');

        const renderChips = (): void => {
            row.empty();

            if (this._contexts.length === 0) {
                row.createEl('span', { text: '# to tag', cls: 'diwa-chip-hint' });
            }

            this._contexts.forEach(ctx => {
                const chip = row.createEl('span', { cls: chipCls });
                chip.createEl('span', { text: `#${ctx}` });
                const xBtn = chip.createEl('button', {
                    text: '×', cls: 'diwa-chip-x',
                    attr: { 'aria-label': `Remove ${ctx}` }
                });
                xBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this._contexts = this._contexts.filter(c => c !== ctx);
                    renderChips();
                });
            });

            const addBtn = row.createEl('button', {
                text: '# tag', cls: addBtnCls,
                attr: { 'aria-label': 'Add context tag' }
            });
            addBtn.addEventListener('click', () => {
                const existingCtxs = this.index.settings.contexts ?? [];
                new ContextSuggestModal(this.app, existingCtxs, (chosen: string) => {
                    if (chosen && !this._contexts.includes(chosen)) {
                        this._contexts.push(chosen);
                        renderChips();
                    }
                }).open();
            });

            const openProjectPicker = () => {
                new ProjectPickerModal(this.app, allProjects, (picked: ProjectEntry | null) => {
                    this._project = picked;
                    renderChips();
                }).open();
            };

            if (this._project) {
                const pill = row.createEl('span', {
                    cls: `${projectPillCls} diwa-project-pill--active`,
                    attr: { role: 'button', tabindex: '0' }
                });
                if (this._project.color) pill.style.setProperty('--project-color', this._project.color);
                pill.createEl('span', { cls: 'diwa-project-pill-dot' });
                pill.createEl('span', { text: this._project.name, cls: 'diwa-project-pill-name' });
                const xBtn = pill.createEl('button', {
                    text: '×', cls: 'diwa-project-pill-x',
                    attr: { 'aria-label': 'Remove project' }
                });
                xBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this._project = null;
                    renderChips();
                });
                pill.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).classList.contains('diwa-project-pill-x')) return;
                    openProjectPicker();
                });
            } else if (allProjects.length > 0) {
                const emptyPill = row.createEl('button', {
                    cls: `${projectPillCls} diwa-project-pill--empty`,
                    attr: { 'aria-label': 'Assign project' }
                });
                emptyPill.createEl('span', { text: '◈', cls: 'diwa-project-pill-icon' });
                emptyPill.createEl('span', { text: 'Project' });
                emptyPill.addEventListener('click', openProjectPicker);
            }
        };

        return renderChips;
    }

    // ── Swipe dismiss — mobile ────────────────────────────────────────────

    // ── Keyboard avoidance — retired ──────────────────────────────────────────
    // Modal is now anchored to the top half of the screen; the keyboard rises
    // from the bottom and can never cover it. No JS avoidance needed.
    // This stub cleans up any stale CSS variables set by previous plugin builds.

    private _initKeyboardAvoidance(_modalEl: HTMLElement): void {
        document.documentElement.style.removeProperty('--diwa-kb-h');
        this._viewportCleanup = () => {
            document.documentElement.style.removeProperty('--diwa-kb-h');
        };
    }

    private _initSwipeToDismiss(
        modalEl:  HTMLElement,
        handleEl: HTMLElement,
        headerEl: HTMLElement
    ): void {
        const DISMISS_THRESHOLD  = 120;
        const VELOCITY_THRESHOLD = 600;
        const RESISTANCE         = 280;

        let startY = 0, currentY = 0, isDragging = false;
        let lastY = 0, lastTime = 0, velocity = 0;

        modalEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (!handleEl.contains(e.target as Node) && !headerEl.contains(e.target as Node)) return;
            startY = e.touches[0].clientY; lastY = startY; lastTime = Date.now();
            isDragging = true; currentY = 0;
            modalEl.style.transition = 'none';
        }, { passive: true });

        modalEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
            const bg = document.querySelector('.modal-bg') as HTMLElement | null;
            if (bg) bg.style.opacity = String(1 - Math.min(delta / 300, 1) * 0.7);
        }, { passive: true });

        modalEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => { modalEl.style.transition = ''; }, 400);
            }
            currentY = 0;
        }, { passive: true });
    }

    // ── Swipe dismiss — tablet ────────────────────────────────────────────

    private _initTabletSwipeDismiss(
        modalEl:  HTMLElement,
        handleEl: HTMLElement,
        headerEl: HTMLElement
    ): void {
        const DISMISS_THRESHOLD  = 100;
        const VELOCITY_THRESHOLD = 600;
        const RESISTANCE         = 280;

        let startY = 0, currentY = 0, isDragging = false;
        let lastY = 0, lastTime = 0, velocity = 0;

        modalEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (!handleEl?.contains(e.target as Node) && !headerEl.contains(e.target as Node)) return;
            startY = e.touches[0].clientY; lastY = startY; lastTime = Date.now();
            isDragging = true; currentY = 0;
            modalEl.style.transition = 'none';
        }, { passive: true });

        modalEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta < 0 ? delta * 0.1 : delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        }, { passive: true });

        modalEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => { modalEl.style.transition = ''; }, 400);
            }
            currentY = 0;
        }, { passive: true });
    }
}

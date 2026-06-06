import { App, Modal, Platform, Notice, moment, setIcon } from 'obsidian';
import DiwaPlugin from '../main';
import { isTablet, parseNaturalDate, parseContextString, attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';
import { ContextSuggestModal } from './ContextSuggestModal';
import type { RecurrenceRule } from '../types';

type CaptureMode = 'thought' | 'task';

export class EditEntryModal extends Modal {
    initialText: string;
    initialContexts: string[];
    initialDueDate: string | null;
    isTask: boolean;
    plugin: DiwaPlugin;
    onSave: (
        newText: string,
        newContexts: string,
        newDueDate: string | null,
        recurrence?: RecurrenceRule | null,
        priority?: 'high' | 'medium' | 'low' | null,
        energy?: 'high' | 'medium' | 'low' | null,
        status?: 'open' | 'waiting' | 'someday'
    ) => void;
    customTitle?: string;
    stayOpen: boolean;

    currentRecurrence: RecurrenceRule | null = null;
    currentPriority: 'high' | 'medium' | 'low' | null = null;
    currentEnergy: 'high' | 'medium' | 'low' | null = null;
    currentStatus: 'open' | 'waiting' | 'someday' = 'open';
    classificationTimeout: ReturnType<typeof setTimeout> | null = null;

    private currentMode: CaptureMode;
    private currentDueDate: string | null;
    private _viewportCleanup: (() => void) | null = null;
    private _isMobileSheet = false;

    constructor(
        app: App,
        plugin: DiwaPlugin,
        initialText: string,
        initialContext: string,
        initialDueDate: string | null,
        isTask: boolean,
        onSave: (
            newText: string,
            newContexts: string,
            newDueDate: string | null,
            recurrence?: RecurrenceRule | null,
            priority?: 'high' | 'medium' | 'low' | null,
            energy?: 'high' | 'medium' | 'low' | null,
            status?: 'open' | 'waiting' | 'someday'
        ) => void,
        customTitle?: string,
        stayOpen: boolean = false
    ) {
        super(app);
        this.plugin = plugin;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.initialContexts = initialContext ? parseContextString(initialContext) : [];
        this.initialDueDate = initialDueDate;
        this.currentDueDate = initialDueDate;
        this.isTask = isTask;
        this.currentMode = isTask ? 'task' : 'thought';
        this.onSave = onSave;
        this.customTitle = customTitle;
        this.stayOpen = stayOpen;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this._isMobileSheet = Platform.isMobile && !isTablet();
        if (this._isMobileSheet) {
            this._renderMobileFloat(contentEl, modalEl);
        } else {
            this._renderDesktop(contentEl, modalEl);
        }
    }

    /** ── MOBILE FLOATING CARD ────────────────────────── */
    private _renderMobileFloat(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('diwa-mobile-float');
        document.body.addClass('diwa-mobile-active');

        // Force sharp corners — override Obsidian's inline/theme border-radius at highest priority
        modalEl.style.setProperty('border-radius', '0', 'important');
        modalEl.style.setProperty('overflow', 'visible', 'important');
        contentEl.style.setProperty('border-radius', '0', 'important');
        contentEl.style.setProperty('overflow', 'visible', 'important');

        // Canvas — scrollable textarea (flex: 1)
        const canvas = contentEl.createDiv({ cls: 'diwa-float-canvas' });
        canvas.style.setProperty('border-radius', '0', 'important');
        const textArea = canvas.createEl('textarea', {
            text: this.initialText,
            cls: 'diwa-float-textarea',
            attr: { placeholder: this.currentMode === 'task' ? 'Execute intent…' : 'Capture thought…' }
        });

        // Dock — compact bottom strip
        const dock = contentEl.createDiv({ cls: 'diwa-float-dock' });

        // 1. Mode toggle
        const toggleBar = dock.createDiv({ cls: 'diwa-seg-bar diwa-float-toggle' });
        const thoughtBtn = toggleBar.createEl('button', {
            text: '✦ THOUGHT',
            cls: `diwa-seg-btn${this.currentMode === 'thought' ? ' is-active' : ''}`
        });
        const taskBtn = toggleBar.createEl('button', {
            text: '✓ TASK',
            cls: `diwa-seg-btn${this.currentMode === 'task' ? ' is-active' : ''}`
        });

        // 2. Date zone (collapsible)
        const dateZone = dock.createDiv({ cls: `diwa-mobile-date-zone${this.currentMode === 'task' ? ' is-visible' : ''}` });
        const { setDueDate } = this._buildDateStrip(dateZone);
        if (this.currentDueDate) setDueDate(this.currentDueDate);
        const { setRecurrence: setRecurrenceMobile } = this._buildRecurStrip(dateZone);
        if (this.currentRecurrence) setRecurrenceMobile(this.currentRecurrence);

        // 3. Chip strip
        const chipStrip = dock.createDiv({ cls: 'diwa-mobile-chip-strip' });

        const renderChips = () => {
            chipStrip.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipStrip.createEl('span', { cls: 'diwa-mobile-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'diwa-mobile-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    renderChips();
                });
            });
            if (this.initialContexts.length === 0) {
                chipStrip.createSpan({ text: '# to tag', cls: 'diwa-chip-hint' });
            }
        };
        renderChips();

        // 3b. Meta bar (priority / energy / status) — task-only, collapsible
        const metaBar = dock.createDiv({ cls: `diwa-task-meta-bar${this.currentMode === 'task' ? ' is-visible' : ''}` });
        const { setPriority, setEnergy, setStatus } = this._buildMetaStrip(metaBar, false);
        if (this.currentPriority) setPriority(this.currentPriority);
        if (this.currentEnergy) setEnergy(this.currentEnergy);
        if (this.currentStatus !== 'open') setStatus(this.currentStatus);

        // 4. Action row
        const actionRow = dock.createDiv({ cls: 'diwa-float-action-row' });
        const cancelBtn = actionRow.createEl('button', { text: 'Cancel', cls: 'diwa-float-cancel-btn' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveLabel = () => this.stayOpen ? 'ADD' : (this.currentMode === 'task' ? 'ADD TASK' : 'CAPTURE');
        const saveBtn = actionRow.createEl('button', { text: saveLabel(), cls: 'diwa-float-save-btn' }) as HTMLButtonElement;

        // Mode switch
        const switchMode = (mode: CaptureMode) => {
            this.currentMode = mode;
            textArea.placeholder = mode === 'task' ? 'Execute intent…' : 'Capture thought…';
            thoughtBtn.toggleClass('is-active', mode === 'thought');
            taskBtn.toggleClass('is-active', mode === 'task');
            dateZone.toggleClass('is-visible', mode === 'task');
            metaBar.toggleClass('is-visible', mode === 'task');
            if (mode === 'thought') {
                this.currentPriority = null; this.currentEnergy = null; this.currentStatus = 'open';
                setPriority(null); setEnergy(null); setStatus('open');
            }
            if (!this.stayOpen) saveBtn.textContent = saveLabel();
        };
        thoughtBtn.addEventListener('click', () => switchMode('thought'));
        taskBtn.addEventListener('click', () => switchMode('task'));

        // Save disabled when empty
        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = () => {
            if (!textArea.value.trim()) return;
            const text = textArea.value.replace(/\n/g, '<br>');
            const contexts = this.initialContexts.map(c => `#${c}`).join(' ');
            const due = this.currentMode === 'task' ? (this.currentDueDate ?? null) : null;
            const recur = this.currentMode === 'task' ? this.currentRecurrence : null;
            const priority = this.currentMode === 'task' ? this.currentPriority : null;
            const energy = this.currentMode === 'task' ? this.currentEnergy : null;
            const status = this.currentMode === 'task' ? this.currentStatus : 'open';
            this.onSave(text, contexts, due, recur, priority, energy, status);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); }
            else this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        this._attachInlineTriggers(textArea, setDueDate);
        attachMediaPasteHandler(this.app, textArea, () => this.plugin.settings.attachmentsFolder);

        // Short delay — just enough for modal animation to start
        setTimeout(() => { textArea.focus(); textArea.setSelectionRange(textArea.value.length, textArea.value.length); }, 80);
    }

    /** ── DATE SHORTCUT STRIP ─────────────────────────── */
    private _buildDateStrip(container: HTMLElement): { setDueDate: (d: string) => void } {
        const strip = container.createDiv({ cls: 'diwa-date-strip' });
        const display = container.createDiv({ cls: 'diwa-date-display' });
        display.style.display = 'none';

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'diwa-date-display-icon' });
            const lbl = display.createSpan({ text: moment(dateStr).format('dddd, MMM D'), cls: 'diwa-date-display-label' });
            const clr = display.createSpan({ text: '×', cls: 'diwa-date-display-clear' });
            lbl.addEventListener('click', () => showNLPInput());
            clr.addEventListener('click', () => {
                this.currentDueDate = null;
                updateDisplay(null);
                btnEls.forEach(b => b.removeClass('is-selected'));
            });
        };

        const setDueDate = (d: string) => { this.currentDueDate = d; updateDisplay(d); };

        // Compute contextual shortcuts
        const today = moment();
        const dow = today.day(); // 0=Sun … 6=Sat
        const daysToFriday = dow <= 4 ? (5 - dow) : (12 - dow); // days until next Fri
        const rawShortcuts = [
            { label: 'TODAY', days: 0 },
            { label: 'TMRW', days: 1 },
            { label: daysToFriday > 2 ? 'THIS FRI' : '+7D', days: daysToFriday > 2 ? daysToFriday : 7 },
            { label: '+7D', days: 7 },
            { label: '+30D', days: 30 },
        ];
        // Deduplicate by days count
        const shortcuts = rawShortcuts.filter((s, i, a) => a.findIndex(x => x.days === s.days) === i);

        const btnEls: HTMLButtonElement[] = [];
        shortcuts.forEach(s => {
            const btn = strip.createEl('button', { text: s.label, cls: 'diwa-date-shortcut-btn' }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                const d = moment().add(s.days, 'days').format('YYYY-MM-DD');
                setDueDate(d);
                btnEls.forEach(b => b.removeClass('is-selected'));
                btn.addClass('is-selected');
            });
        });

        // PICK ▾ → inline NLP input
        const pickBtn = strip.createEl('button', { text: 'PICK ▾', cls: 'diwa-date-shortcut-btn diwa-date-pick-btn' });
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.diwa-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'diwa-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text',
                cls: 'diwa-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const parsed = parseNaturalDate(input.value.trim());
                    if (parsed) { setDueDate(parsed); wrap.remove(); }
                    else input.style.setProperty('border-color', 'var(--color-red)');
                }
                if (e.key === 'Escape') wrap.remove();
            });
        };

        return { setDueDate };
    }

    private _buildRecurStrip(container: HTMLElement, compact = false): { setRecurrence: (r: RecurrenceRule | null) => void } {
        const strip = container.createDiv({ cls: `diwa-recur-strip${compact ? ' diwa-recur-strip--compact' : ''}` });
        const iconWrap = strip.createDiv({ cls: 'diwa-recur-icon' });
        setIcon(iconWrap, 'repeat-2');

        type ROption = { value: RecurrenceRule | null; label: string };
        const OPTIONS: ROption[] = [
            { value: null,       label: '—' },
            { value: 'daily',    label: 'Daily' },
            { value: 'weekly',   label: 'Weekly' },
            { value: 'biweekly', label: 'Biweekly' },
            { value: 'monthly',  label: 'Monthly' },
        ];
        const btnEls: HTMLButtonElement[] = [];
        OPTIONS.forEach(({ value, label }) => {
            const btn = strip.createEl('button', {
                text: label,
                cls: `diwa-recur-btn${this.currentRecurrence === value ? ' is-active' : ''}`,
                attr: { 'aria-pressed': String(this.currentRecurrence === value) }
            }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                this.currentRecurrence = value;
                syncActive();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowRight') { e.preventDefault(); btnEls[btnEls.indexOf(btn) + 1]?.focus(); }
                if (e.key === 'ArrowLeft')  { e.preventDefault(); btnEls[btnEls.indexOf(btn) - 1]?.focus(); }
            });
        });

        const syncActive = () => {
            btnEls.forEach((b, i) => {
                const active = OPTIONS[i].value === this.currentRecurrence;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };

        const setRecurrence = (r: RecurrenceRule | null) => {
            this.currentRecurrence = r;
            syncActive();
        };
        return { setRecurrence };
    }

    /** ── TASK META STRIP (Priority · Energy · Status) ── */
    private _buildMetaStrip(container: HTMLElement, compact: boolean): {
        setPriority: (v: 'high' | 'medium' | 'low' | null) => void;
        setEnergy:   (v: 'high' | 'medium' | 'low' | null) => void;
        setStatus:   (v: 'open' | 'waiting' | 'someday')   => void;
    } {
        const strip = container.createDiv({ cls: 'diwa-meta-strip' });

        const priValues:    Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
        const priLabels:    Record<string, string>            = { low: '!', medium: '!!', high: '!!!' };
        const energyValues: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
        const energyLabels: Record<string, string>            = { low: '🌙', medium: '〰', high: '⚡' };
        const statusValues: Array<'waiting' | 'someday'>      = ['waiting', 'someday'];

        const priBtns:    HTMLButtonElement[] = [];
        const energyBtns: HTMLButtonElement[] = [];
        const statusBtns: HTMLButtonElement[] = [];

        // Sync helpers — declared before button creation; arrays populated below via push()
        const syncPriority = () => {
            priBtns.forEach(b => {
                const active = b.getAttribute('data-priority') === this.currentPriority;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };
        const syncEnergy = () => {
            energyBtns.forEach(b => {
                const active = b.getAttribute('data-energy') === this.currentEnergy;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };
        const syncStatus = () => {
            statusBtns.forEach(b => {
                const active = b.getAttribute('data-status') === this.currentStatus;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };

        if (compact) {
            // ── Desktop: 3 labelled rows ──────────────────────

            // Priority row
            const priRow = strip.createDiv({ cls: 'diwa-meta-row', attr: { 'data-row': 'priority' } });
            const priIcon = priRow.createDiv({ cls: 'diwa-meta-icon' });
            setIcon(priIcon, 'flag');
            priValues.forEach(val => {
                const btn = priRow.createEl('button', {
                    text: priLabels[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false', 'aria-label': `Priority: ${val}` }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentPriority = this.currentPriority === val ? null : val;
                    syncPriority();
                });
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); priBtns[priBtns.indexOf(btn) + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); priBtns[priBtns.indexOf(btn) - 1]?.focus(); }
                });
            });

            // Energy row
            const energyRow = strip.createDiv({ cls: 'diwa-meta-row', attr: { 'data-row': 'energy' } });
            const energyIcon = energyRow.createDiv({ cls: 'diwa-meta-icon' });
            setIcon(energyIcon, 'zap');
            energyValues.forEach(val => {
                const btn = energyRow.createEl('button', {
                    text: energyLabels[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false', 'aria-label': `Energy: ${val}` }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentEnergy = this.currentEnergy === val ? null : val;
                    syncEnergy();
                });
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); energyBtns[energyBtns.indexOf(btn) + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); energyBtns[energyBtns.indexOf(btn) - 1]?.focus(); }
                });
            });

            // Status row
            const statusRow = strip.createDiv({ cls: 'diwa-meta-row', attr: { 'data-row': 'status' } });
            const statusIcon = statusRow.createDiv({ cls: 'diwa-meta-icon' });
            setIcon(statusIcon, 'circle-dot');
            const statusLabelsCompact: Record<string, string> = { waiting: 'WAITING', someday: 'SOMEDAY' };
            statusValues.forEach(val => {
                const btn = statusRow.createEl('button', {
                    text: statusLabelsCompact[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--status',
                    attr: { 'data-status': val, 'aria-pressed': 'false', 'aria-label': `Status: ${val}` }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentStatus = this.currentStatus === val ? 'open' : val;
                    syncStatus();
                });
                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); statusBtns[statusBtns.indexOf(btn) + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); statusBtns[statusBtns.indexOf(btn) - 1]?.focus(); }
                });
            });

        } else {
            // ── Mobile: flat horizontal scrollable ───────────

            // Priority section
            strip.createEl('span', { text: 'PRI', cls: 'diwa-meta-label' });
            priValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: priLabels[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false', 'aria-label': `Priority: ${val}` }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentPriority = this.currentPriority === val ? null : val;
                    syncPriority();
                });
            });

            strip.createEl('span', { cls: 'diwa-meta-divider' });

            // Energy section
            strip.createEl('span', { text: 'NRG', cls: 'diwa-meta-label' });
            energyValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: energyLabels[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false', 'aria-label': `Energy: ${val}` }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentEnergy = this.currentEnergy === val ? null : val;
                    syncEnergy();
                });
            });

            strip.createEl('span', { cls: 'diwa-meta-divider' });

            // Status section
            strip.createEl('span', { text: 'STATUS', cls: 'diwa-meta-label' });
            const statusLabelsMobile: Record<string, string> = { waiting: '⏳ WAIT', someday: '☁ SMDY' };
            statusValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: statusLabelsMobile[val],
                    cls: 'diwa-meta-btn diwa-meta-btn--status',
                    attr: { 'data-status': val, 'aria-pressed': 'false', 'aria-label': `Status: ${val}` }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    if ('vibrate' in navigator) navigator.vibrate(8);
                    this.currentStatus = this.currentStatus === val ? 'open' : val;
                    syncStatus();
                });
            });
        }

        const setPriority = (v: 'high' | 'medium' | 'low' | null) => { this.currentPriority = v; syncPriority(); };
        const setEnergy   = (v: 'high' | 'medium' | 'low' | null) => { this.currentEnergy   = v; syncEnergy();   };
        const setStatus   = (v: 'open' | 'waiting' | 'someday')   => { this.currentStatus   = v; syncStatus();   };

        return { setPriority, setEnergy, setStatus };
    }

    /** ── INLINE TRIGGERS (@date, [[link, #tag, + checklist) ── */
    private _attachInlineTriggers(textArea: HTMLTextAreaElement, setDueDate: (d: string) => void) {
        attachInlineTriggers(
            this.app, textArea, setDueDate,
            (tag: string) => {
                if (!this.plugin.settings.contexts) this.plugin.settings.contexts = [];
                if (!this.plugin.settings.contexts.includes(tag)) {
                    this.plugin.settings.contexts.push(tag);
                }
            },
            () => this.plugin.settings.contexts ?? [],
            this.plugin.settings.peopleFolder
        );
    }

    /** ── SWIPE TO DISMISS ────────────────────────────── */
    private _initSwipeToDismiss(modalEl: HTMLElement, handleEl: HTMLElement, canvasEl: HTMLElement) {
        const RESISTANCE = 280, DISMISS_THRESHOLD = 120, VELOCITY_THRESHOLD = 800;
        let startY = 0, currentY = 0, isDragging = false, lastY = 0, lastTime = 0, velocity = 0;

        const onTouchStart = (e: TouchEvent) => {
            const fromHandle = handleEl.contains(e.target as Node);
            const fromCanvas = canvasEl.contains(e.target as Node) && canvasEl.scrollTop === 0;
            if (!fromHandle && !fromCanvas) return;
            startY = e.touches[0].clientY;
            lastY = startY; lastTime = Date.now();
            isDragging = true;
            modalEl.style.transition = 'none';
            modalEl.style.willChange = 'transform';
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return; // ignore upward drags
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            // Rubber-band resistance after 80px
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
            // Fade backdrop proportionally
            const bg = document.querySelector('.modal-bg') as HTMLElement | null;
            if (bg) bg.style.opacity = String(1 - Math.min(delta / 300, 1) * 0.7);
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                // Spring snap-back
                modalEl.addClass('is-snapping-back');
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => modalEl.removeClass('is-snapping-back'), 400);
            }
            currentY = 0;
        };

        modalEl.addEventListener('touchstart', onTouchStart, { passive: true });
        modalEl.addEventListener('touchmove', onTouchMove, { passive: true });
        modalEl.addEventListener('touchend', onTouchEnd, { passive: true });
    }

    /** ── DESKTOP / TABLET PATH ───────────────────────── */
    private _renderDesktop(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('diwa-clean-modal');
        modalEl.addClass('diwa-edit-modal');
        if (Platform.isMobile && isTablet()) modalEl.addClass('is-tablet');

        // ── Mode toggle (TOP — primary entry point) ───────────────────────
        const header = contentEl.createEl('div', { cls: 'diwa-edit-modal-header' });
        const toggleBar = header.createDiv({ cls: 'diwa-seg-bar diwa-capture-inline-toggle' });
        const thoughtBtn = toggleBar.createEl('button', {
            text: '✦ THOUGHT',
            cls: `diwa-seg-btn${this.currentMode === 'thought' ? ' is-active' : ''}`
        });
        const taskBtn = toggleBar.createEl('button', {
            text: '✓ TASK',
            cls: `diwa-seg-btn${this.currentMode === 'task' ? ' is-active' : ''}`
        });
        const hint = header.createEl('span', { cls: 'diwa-edit-modal-hint', text: '⌘↵ to save' });

        // ── Body: 2-column wrapper (single col in thought mode / narrow) ──
        const body = contentEl.createEl('div', {
            cls: `diwa-edit-modal-body${this.currentMode === 'task' ? ' is-task-mode' : ''}`
        });

        // Left col: textarea
        const leftCol = body.createEl('div', { cls: 'diwa-edit-modal-left' });
        const textArea = leftCol.createEl('textarea', {
            text: this.initialText,
            cls: 'diwa-edit-modal-textarea',
            attr: { placeholder: this.currentMode === 'task' ? 'Execute intent…' : 'Capture thought…' }
        }) as HTMLTextAreaElement;

        // Right col: task metadata (hidden in thought mode)
        const rightCol = body.createEl('div', { cls: 'diwa-edit-modal-right' });
        rightCol.createEl('div', { cls: 'diwa-edit-modal-right-label', text: 'DUE DATE' });
        const dateZone = rightCol.createDiv({ cls: 'diwa-mobile-date-zone is-visible' });
        const { setDueDate } = this._buildDateStrip(dateZone);
        if (this.currentDueDate) setDueDate(this.currentDueDate);

        rightCol.createEl('div', { cls: 'diwa-edit-modal-right-label', text: 'REPEAT' });
        const recurZone = rightCol.createDiv({ cls: 'diwa-recur-zone is-visible' });
        const { setRecurrence: setRecurrenceDesktop } = this._buildRecurStrip(recurZone, true);
        if (this.currentRecurrence) setRecurrenceDesktop(this.currentRecurrence);

        rightCol.createEl('div', { cls: 'diwa-edit-modal-right-label', text: 'PROPERTIES' });
        const metaZone = rightCol.createDiv({ cls: 'diwa-meta-zone is-visible' });
        const { setPriority, setEnergy, setStatus } = this._buildMetaStrip(metaZone, true);
        if (this.currentPriority) setPriority(this.currentPriority);
        if (this.currentEnergy) setEnergy(this.currentEnergy);
        if (this.currentStatus !== 'open') setStatus(this.currentStatus);

        // ── Dock: context chips + actions ─────────────────────────────────
        const dock = contentEl.createEl('div', { cls: 'diwa-edit-modal-dock' });

        const chipArea = dock.createDiv({ cls: 'diwa-capture-desktop-chip-area' });
        const chipStrip = chipArea.createDiv({ cls: 'diwa-mobile-chip-strip' });

        const renderChips = () => {
            chipStrip.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipStrip.createEl('span', { cls: 'diwa-mobile-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'diwa-mobile-chip-x' });
                x.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    renderChips();
                });
            });
            const addBtn = chipStrip.createEl('button', { text: '+', cls: 'diwa-mobile-chip-add' });
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                new ContextSuggestModal(this.app, this.plugin.settings.contexts ?? [], async (ctx) => {
                    if (!this.initialContexts.includes(ctx)) { this.initialContexts.push(ctx); renderChips(); }
                }).open();
            });
        };
        renderChips();


        const actions = dock.createDiv({ cls: 'diwa-capture-desktop-actions' });
        const saveLabel = () => this.stayOpen ? 'ADD' : (this.currentMode === 'task' ? 'ADD TASK' : 'SAVE');
        const cancelBtn = actions.createEl('button', { text: 'CANCEL', cls: 'diwa-capture-inline-cancel' });
        const saveBtn = actions.createEl('button', { text: saveLabel(), cls: 'diwa-capture-inline-save' }) as HTMLButtonElement;

        // ── Mode switch ───────────────────────────────────────────────────
        const switchMode = (mode: CaptureMode) => {
            this.currentMode = mode;
            textArea.placeholder = mode === 'task' ? 'Execute intent…' : 'Capture thought…';
            thoughtBtn.toggleClass('is-active', mode === 'thought');
            taskBtn.toggleClass('is-active', mode === 'task');
            body.toggleClass('is-task-mode', mode === 'task');
            if (mode === 'thought') {
                this.currentRecurrence = null;
                this.currentPriority = null; this.currentEnergy = null; this.currentStatus = 'open';
                setPriority(null); setEnergy(null); setStatus('open');
            }
            if (!this.stayOpen) saveBtn.textContent = saveLabel();
        };
        thoughtBtn.addEventListener('click', () => switchMode('thought'));
        taskBtn.addEventListener('click', () => switchMode('task'));

        // Save gate
        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = () => {
            if (!textArea.value.trim()) return;
            const text = textArea.value.replace(/\n/g, '<br>');
            const contexts = this.initialContexts.map(c => `#${c}`).join(' ');
            const due = this.currentMode === 'task' ? (this.currentDueDate ?? null) : null;
            const recur = this.currentMode === 'task' ? this.currentRecurrence : null;
            const priority = this.currentMode === 'task' ? this.currentPriority : null;
            const energy = this.currentMode === 'task' ? this.currentEnergy : null;
            const status = this.currentMode === 'task' ? this.currentStatus : 'open';
            this.onSave(text, contexts, due, recur, priority, energy, status);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); }
            else this.close();
        };
        cancelBtn.addEventListener('click', () => this.close());
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        // Inline triggers — date trigger auto-switches to task mode
        this._attachInlineTriggers(textArea, (d: string) => {
            setDueDate(d);
            switchMode('task');
        });

        attachMediaPasteHandler(this.app, textArea, () => this.plugin.settings.attachmentsFolder);

        setTimeout(() => { textArea.focus(); textArea.setSelectionRange(textArea.value.length, textArea.value.length); }, 80);
    }

    onClose() {
        if (this.classificationTimeout) clearTimeout(this.classificationTimeout);
        if (this._isMobileSheet) {
            document.body.removeClass('diwa-mobile-active');
            if (this._viewportCleanup) { this._viewportCleanup(); this._viewportCleanup = null; }
        }
        this.contentEl.empty();
    }
}

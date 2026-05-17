import { moment, Platform, MarkdownRenderer, Notice, setIcon, Modal, TFile } from 'obsidian';
import type { DiwaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from './BaseTab';
import { isTablet, parseContextString } from '../utils';
import { EditEntryModal } from '../modals/EditEntryModal';
import { InlineContextPickerModal } from '../modals/InlineContextPickerModal';

// ── Add-Context Modal ─────────────────────────────────────────────────────────
class AddContextModal extends Modal {
    private onConfirm: (name: string) => void;

    constructor(app: any, onConfirm: (name: string) => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('diwa-modal-standard');

        const hdr = contentEl.createEl('div', { cls: 'diwa-modal-header' });
        hdr.createEl('h2', {
            text: 'New Context',
            attr: { style: 'margin:0; font-size:1.1em; font-weight:700;' },
        });

        const body = contentEl.createEl('div', {
            attr: { style: 'padding:20px 24px;' },
        });
        body.createEl('p', {
            text: 'Letters, numbers, and hyphens only.',
            attr: { style: 'margin:0 0 12px; font-size:0.85em; color:var(--text-muted);' },
        });

        const input = body.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'e.g. work, health, ideas',
                style: [
                    'width:100%; padding:8px 12px; border-radius:8px;',
                    'border:1px solid var(--background-modifier-border);',
                    'background:var(--background-secondary); color:var(--text-normal);',
                    'font-size:0.9em; box-sizing:border-box; outline:none;',
                ].join(' '),
            },
        });

        const footer = contentEl.createEl('div', { cls: 'diwa-modal-footer' });
        const cancelBtn = footer.createEl('button', {
            text: 'Cancel',
            cls: 'diwa-btn-secondary',
        });
        const confirmBtn = footer.createEl('button', {
            text: 'Add',
            cls: 'diwa-btn-primary',
        });

        const doConfirm = () => {
            const clean = input.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().trim();
            if (!clean) { new Notice('Invalid context name.'); return; }
            this.onConfirm(clean);
            this.close();
        };

        cancelBtn.addEventListener('click', () => this.close());
        confirmBtn.addEventListener('click', doConfirm);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConfirm(); });
        // Auto-focus
        setTimeout(() => input.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ── MergeModal ────────────────────────────────────────────────────────────────
class MergeModal extends Modal {
    private thoughts: ThoughtEntry[];
    private onConfirm: (mergedText: string, contexts: string[]) => void;

    constructor(app: any, thoughts: ThoughtEntry[], onConfirm: (mergedText: string, contexts: string[]) => void) {
        super(app);
        this.thoughts = thoughts;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('diwa-modal-standard');

        const hdr = contentEl.createEl('div', { cls: 'diwa-modal-header' });
        hdr.createEl('h2', {
            text: `Merge ${this.thoughts.length} Notes`,
            attr: { style: 'margin:0; font-size:1.1em; font-weight:700;' },
        });

        const body = contentEl.createEl('div', {
            attr: { style: 'padding:16px 24px; display:flex; flex-direction:column; gap:12px;' },
        });

        // Source previews
        const preview = body.createEl('div', { cls: 'diwa-merge-preview' });
        this.thoughts.forEach((t, i) => {
            if (i > 0) preview.createEl('hr', { cls: 'diwa-merge-preview-divider' });
            preview.createEl('p', {
                text: (t.body || '').substring(0, 140) + ((t.body || '').length > 140 ? '…' : ''),
                cls: 'diwa-merge-preview-item',
            });
        });

        // Union of contexts — editable before merging
        const unionContexts = [...new Set(this.thoughts.flatMap(t => t.context))];
        let editableContexts = [...unionContexts];
        const mergedBodies = this.thoughts.map(t => t.body || '').join('\n\n---\n\n');

        body.createEl('label', {
            text: 'Merged content — edit as needed',
            attr: { style: 'font-size:0.78rem; font-weight:600; color:var(--text-muted);' },
        });
        const textarea = body.createEl('textarea', {
            cls: 'diwa-merge-textarea',
        }) as HTMLTextAreaElement;
        textarea.value = mergedBodies;

        // Editable context chips
        body.createEl('label', {
            text: 'Contexts for merged note',
            attr: { style: 'font-size:0.78rem; font-weight:600; color:var(--text-muted);' },
        });
        const ctxRow = body.createEl('div', { cls: 'diwa-merge-ctx-row' });

        const renderMergeCtxChips = () => {
            ctxRow.empty();
            for (const ctx of editableContexts) {
                const chip = ctxRow.createEl('span', { cls: 'diwa-chip diwa-chip--ctx diwa-chip--removable' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createEl('button', { cls: 'diwa-chip-remove', text: '×' });
                x.addEventListener('click', () => {
                    editableContexts = editableContexts.filter(c => c !== ctx);
                    renderMergeCtxChips();
                });
            }
            const addBtn = ctxRow.createEl('button', { cls: 'diwa-chip diwa-chip--add', text: '+ Add' });
            addBtn.addEventListener('click', () => {
                const inp = document.createElement('input');
                inp.placeholder = 'context name';
                inp.style.cssText = 'width:100px; padding:2px 6px; border-radius:4px; border:1px solid var(--background-modifier-border); font-size:0.8em; background:var(--background-primary); color:var(--text-normal);';
                ctxRow.appendChild(inp);
                inp.focus();
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = inp.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
                        if (val && !editableContexts.includes(val)) editableContexts.push(val);
                        inp.remove();
                        renderMergeCtxChips();
                    }
                    if (e.key === 'Escape') inp.remove();
                });
            });
        };
        renderMergeCtxChips();

        const footer = contentEl.createEl('div', { cls: 'diwa-modal-footer' });
        footer.createEl('span', {
            text: '⌘↵ to merge',
            attr: { style: 'font-size:0.72rem; color:var(--text-faint); flex:1;' },
        });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'diwa-btn-secondary' });
        const mergeBtn = footer.createEl('button', {
            text: `Merge ${this.thoughts.length} Notes`,
            cls: 'diwa-btn-primary',
        });

        const doMerge = () => {
            const text = textarea.value.trim();
            if (!text) { new Notice('Merged content cannot be empty.'); return; }
            this.onConfirm(text, editableContexts);
            this.close();
        };

        cancelBtn.addEventListener('click', () => this.close());
        mergeBtn.addEventListener('click', doMerge);
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doMerge(); }
        });
        setTimeout(() => textarea.focus(), 60);
    }

    onClose(): void { this.contentEl.empty(); }
}

// ── SynthesisTab ─────────────────────────────────────────────────────────
export class SynthesisTab extends BaseTab {
    /**
     * State stored on the class.
     * Both fields delegate to existing view.ts fields so they survive
     * view.renderView() calls (which always instantiate a fresh tab instance).
     */
    // Multi-select: array of primed contexts, backed by view state for re-render survival
    private get primedContexts(): string[] { return this.view.activeSynthesisContexts; }
    private set primedContexts(v: string[]) { this.view.activeSynthesisContexts = v; }
    // Convenience: first primed context (for backward-compat echo text)
    private get primedContext(): string | null { return this.primedContexts[0] ?? null; }

    private get showHidden(): boolean { return this.view.synthesisShowHidden; }
    private set showHidden(v: boolean) { this.view.synthesisShowHidden = v; }

    private get synthesisSelectMode(): boolean { return this.view.synthesisSelectMode; }
    private set synthesisSelectMode(v: boolean) { this.view.synthesisSelectMode = v; }
    private get selectedPaths(): Set<string> { return this.view.synthesisSelectedPaths; }

    private get feedFilter(): 'no-context' | 'with-context' | 'processed' {
        return this.view.synthesisFeedFilter;
    }
    private set feedFilter(v: 'no-context' | 'with-context' | 'processed') {
        this.view.synthesisFeedFilter = v;
    }

    private get activeCtxFilter(): string | null { return this.view.synthesisActiveCtxFilter; }
    private set activeCtxFilter(v: string | null) { this.view.synthesisActiveCtxFilter = v; }

    /** Phone: pending thought for the bottom-sheet assign flow. */
    private pendingAssignThought: ThoughtEntry | null = null;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement): void {
        this.renderSynthesisMode(container);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Main shell
    // ═══════════════════════════════════════════════════════════════════════════

    private renderSynthesisMode(container: HTMLElement): void {
        container.empty();
        const isPhone = Platform.isMobile && !isTablet();
        const isTabletDevice = Platform.isMobile && isTablet();

        const shell = container.createEl('div', {
            cls: [
                'diwa-syn-shell',
                isPhone ? 'is-phone' : '',
                isTabletDevice ? 'is-tablet' : '',
            ].filter(Boolean).join(' '),
        });

        // ── Single-pane feed (full width on all devices) ──────────────────────
        const feed = shell.createEl('div', { cls: 'diwa-syn-feed diwa-syn-feed--full' });
        this.renderFeedPane(feed, shell, isPhone);

        // Context sheet (phone manage flow via strip's + button)
        if (isPhone) {
            this.renderContextSheet(shell);
        }

        this.renderFloatingActionBar(shell);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Context Panel (left 1/3)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderContextPanel(panel: HTMLElement, shell: HTMLElement): void {
        // ── Header ────────────────────────────────────────────────────────────
        const hdr = panel.createEl('div', { cls: 'diwa-syn-ctx-hdr' });

        const iconEl = hdr.createEl('span', {
            attr: { style: 'font-size:0.85em; opacity:0.55; flex-shrink:0; line-height:1;' },
        });
        iconEl.textContent = '◎';

        hdr.createEl('span', { text: 'CONTEXTS', cls: 'diwa-syn-ctx-hdr-label' });

        hdr.createEl('span', {
            text: String((this.settings.contexts || []).length),
            cls: 'diwa-syn-ctx-hdr-count',
        });

        const hdrAddBtn = hdr.createEl('button', {
            cls: 'diwa-syn-ctx-hdr-add',
            attr: { title: 'Add context' },
        });
        setIcon(hdrAddBtn, 'plus');
        hdrAddBtn.addEventListener('click', () => this.openAddContextModal(shell));

        // ── Primer strip ──────────────────────────────────────────────────────
        const primer = panel.createEl('div', {
            cls: `diwa-syn-ctx-primer${this.primedContexts.length > 0 ? ' is-primed' : ''}`,
        });
        this.buildPrimer(primer, shell);

        // ── Search input ──────────────────────────────────────────────────────
        const searchWrap = panel.createEl('div', { cls: 'diwa-syn-ctx-search' });
        const searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'diwa-syn-ctx-search-input',
            attr: { placeholder: 'Search…', spellcheck: 'false' },
        });

        // ── Context list ──────────────────────────────────────────────────────
        const list = panel.createEl('div', { cls: 'diwa-syn-ctx-list' });
        this.buildContextList(list, shell);

        // Live filter
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            list.querySelectorAll<HTMLElement>('.diwa-syn-ctx-row').forEach((row) => {
                const name = (row.dataset.ctx || '').toLowerCase();
                row.style.display = !q || name.includes(q) ? '' : 'none';
            });
        });
    }

    /**
     * Populates (or repopulates) the primer strip element in-place.
     * Safe to call on an already-rendered primer element — empties it first.
     */
    private buildPrimer(primer: HTMLElement, shell: HTMLElement): void {
        primer.empty();
        const hasAny = this.primedContexts.length > 0;
        primer.className = `diwa-syn-ctx-primer${hasAny ? ' is-primed' : ''}`;

        primer.createEl('span', { text: 'PRIME:', cls: 'diwa-syn-ctx-primer-label' });

        if (hasAny) {
            const pillsWrap = primer.createEl('div', { cls: 'diwa-syn-ctx-primer-pills' });
            for (const ctx of this.primedContexts) {
                const pill = pillsWrap.createEl('div', { cls: 'diwa-syn-ctx-primer-pill' });
                pill.createEl('div', { cls: 'diwa-syn-ctx-primer-pill-dot' });
                pill.createEl('span', { text: ctx });
                const dismiss = pill.createEl('button', {
                    cls: 'diwa-syn-ctx-primer-pill-dismiss',
                    attr: { title: `Deselect ${ctx}`, 'aria-label': `Deselect ${ctx}` },
                });
                dismiss.textContent = '×';
                dismiss.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
                    this.syncAllPrimingStates(shell);
                });
            }
        } else {
            primer.createEl('span', {
                text: 'None selected',
                cls: 'diwa-syn-ctx-primer-placeholder',
            });
        }
    }

    /**
     * Populates (or repopulates) the context list element in-place.
     */
    private buildContextList(list: HTMLElement, shell: HTMLElement): void {
        list.empty();
        const contexts = this.settings.contexts || [];
        const hidden = new Set<string>(this.settings.hiddenContexts || []);

        if (contexts.length === 0) {
            const empty = list.createEl('div', { cls: 'diwa-syn-ctx-empty' });
            empty.createEl('div', { text: '◎', cls: 'diwa-syn-ctx-empty-icon' });
            empty.createEl('div', { text: 'No Contexts Yet', cls: 'diwa-syn-ctx-empty-title' });
            empty.createEl('div', {
                text: 'Add a context to start organising your thoughts.',
                cls: 'diwa-syn-ctx-empty-sub',
            });
        } else {
            const counts = this.getContextCounts();
            const sorted = [...contexts].sort((a, b) => a.localeCompare(b));
            const visible = sorted.filter((c) => !hidden.has(c));
            const hiddenItems = sorted.filter((c) => hidden.has(c));

            // Render visible contexts
            for (const ctx of visible) {
                this.renderContextRow(list, shell, ctx, false, counts[ctx] || 0);
            }

            // Show-hidden toggle footer (only if there are hidden contexts)
            if (hiddenItems.length > 0) {
                const toggleBtn = list.createEl('button', { cls: 'diwa-syn-ctx-hidden-toggle' });
                setIcon(toggleBtn, this.showHidden ? 'eye-off' : 'eye');
                toggleBtn.createEl('span', {
                    text: this.showHidden
                        ? `Hide ${hiddenItems.length} hidden`
                        : `Show hidden (${hiddenItems.length})`,
                });
                toggleBtn.addEventListener('click', () => {
                    this.showHidden = !this.showHidden;
                    this.view.renderView();
                });

                // Render hidden contexts below the toggle (if revealed)
                if (this.showHidden) {
                    for (const ctx of hiddenItems) {
                        this.renderContextRow(list, shell, ctx, true, counts[ctx] || 0);
                    }
                }
            }
        }

        // ── Sticky add-context button at list bottom ───────────────────────
        const addBtn = list.createEl('button', { cls: 'diwa-syn-ctx-add-btn' });
        setIcon(addBtn, 'plus-circle');
        addBtn.createEl('span', { text: 'Add context', cls: 'diwa-syn-ctx-add-label' });
        addBtn.addEventListener('click', () => this.openAddContextModal(shell));
    }

    private renderContextRow(
        list: HTMLElement,
        shell: HTMLElement,
        ctx: string,
        isHidden: boolean,
        count: number,
    ): void {
        const row = list.createEl('div', {
            cls: [
                'diwa-syn-ctx-row',
                isHidden ? 'is-ctx-hidden' : '',
            ].filter(Boolean).join(' '),
            attr: { 'data-ctx': ctx, tabindex: '0' },
        });
        row.createEl('div', { cls: 'diwa-syn-ctx-row-dot' });
        row.createEl('span', { text: ctx, cls: 'diwa-syn-ctx-row-name' });
        row.createEl('span', { text: String(count), cls: 'diwa-syn-ctx-row-count' });

        // Eye/eye-off toggle (hover-revealed)
        const eyeBtn = row.createEl('button', {
            cls: 'diwa-syn-ctx-row-eye',
            attr: {
                title: isHidden ? `Unhide "${ctx}"` : `Hide "${ctx}"`,
                'aria-label': isHidden ? `Unhide ${ctx}` : `Hide ${ctx}`,
            },
        });
        setIcon(eyeBtn, isHidden ? 'eye' : 'eye-off');
        eyeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.toggleContextHidden(ctx, isHidden, shell);
        });

        // Delete button (hover-revealed)
        const delBtn = row.createEl('button', {
            cls: 'diwa-syn-ctx-row-del',
            attr: { title: `Remove context "${ctx}"`, 'aria-label': `Remove ${ctx}` },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.removeContextFromSettings(ctx, shell);
        });
    }

    private async toggleContextHidden(
        ctx: string,
        currentlyHidden: boolean,
        shell: HTMLElement,
    ): Promise<void> {
        if (!this.settings.hiddenContexts) this.settings.hiddenContexts = [];
        if (currentlyHidden) {
            this.settings.hiddenContexts = this.settings.hiddenContexts.filter((c) => c !== ctx);
        } else {
            if (!this.settings.hiddenContexts.includes(ctx)) {
                this.settings.hiddenContexts.push(ctx);
            }
            // Remove from primed selection if it was selected
            this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
        }
        await this.plugin.saveSettings();
        this.view.renderView();
    }

    private handleContextRowClick(ctx: string, shell: HTMLElement): void {
        // Multi-select: toggle in/out of primedContexts array
        if (this.primedContexts.includes(ctx)) {
            this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
        } else {
            this.primedContexts = [...this.primedContexts, ctx];
        }
        this.syncAllPrimingStates(shell);
    }

    private async removeContextFromSettings(ctx: string, shell: HTMLElement): Promise<void> {
        const idx = this.settings.contexts.indexOf(ctx);
        if (idx === -1) return;
        this.settings.contexts.splice(idx, 1);
        // Remove from primed selection if present
        this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
        await this.plugin.saveSettings();
        this.view.renderView();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Context Strip (collapsible horizontal chip row in feed header)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderContextStrip(parent: HTMLElement, shell: HTMLElement): void {
        const collapsed = this.view.synthesisCtxStripCollapsed;
        const strip = parent.createDiv({ cls: `diwa-syn-ctx-strip${collapsed ? ' is-collapsed' : ''}` });

        // Header row: label + count + add button + collapse button
        const stripHdr = strip.createDiv({ cls: 'diwa-syn-ctx-strip-hdr' });
        stripHdr.createEl('span', { text: 'CONTEXTS', cls: 'diwa-syn-ctx-strip-label' });
        stripHdr.createEl('span', {
            text: String((this.settings.contexts || []).length),
            cls: 'diwa-syn-ctx-strip-count',
        });

        const addCtxBtn = stripHdr.createEl('button', { cls: 'diwa-syn-ctx-strip-add', attr: { title: 'Add context' } });
        setIcon(addCtxBtn, 'plus');
        addCtxBtn.addEventListener('click', () => this.openAddContextModal(shell));

        const collapseBtn = stripHdr.createEl('button', {
            cls: 'diwa-syn-ctx-strip-collapse',
            attr: { title: collapsed ? 'Show contexts' : 'Hide contexts' },
        });
        setIcon(collapseBtn, collapsed ? 'chevron-down' : 'chevron-up');
        collapseBtn.addEventListener('click', () => {
            this.view.synthesisCtxStripCollapsed = !this.view.synthesisCtxStripCollapsed;
            this.view.renderView();
        });

        if (!collapsed) {
            const chipRow = strip.createDiv({ cls: 'diwa-syn-ctx-strip-chips' });
            const contexts = [...(this.settings.contexts || [])].sort((a, b) => a.localeCompare(b));
            const hidden = new Set<string>(this.settings.hiddenContexts || []);
            const counts = this.getContextCounts();

            for (const ctx of contexts) {
                if (hidden.has(ctx)) continue;
                const isActive = this.activeCtxFilter === ctx;
                const chip = chipRow.createEl('button', {
                    cls: `diwa-syn-ctx-chip${isActive ? ' is-active-filter' : ''}`,
                    attr: { 'data-ctx': ctx, title: `${counts[ctx] || 0} notes — click to filter` },
                });
                chip.createSpan({ cls: 'diwa-syn-ctx-chip-dot' });
                chip.createSpan({ text: ctx, cls: 'diwa-syn-ctx-chip-name' });
                chip.createSpan({ text: String(counts[ctx] || 0), cls: 'diwa-syn-ctx-chip-count' });
                chip.addEventListener('click', () => {
                    this.activeCtxFilter = isActive ? null : ctx;
                    this.view.renderView();
                });
            }

            const visibleCount = contexts.filter(c => !hidden.has(c)).length;
            if (visibleCount === 0) {
                chipRow.createEl('span', {
                    text: 'No contexts yet — click + to add one',
                    cls: 'diwa-syn-ctx-strip-empty',
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Inline Context Tagger (replaces modal for single-card assignment)
    // ═══════════════════════════════════════════════════════════════════════════

    private openContextPicker(thought: ThoughtEntry): void {
        new InlineContextPickerModal(
            this.app,
            this.plugin,
            thought.context || [],
            async (selected: string[]) => {
                await this.vault.assignContext(thought.filePath, selected, true);
                this.view.renderView();
            },
            `Assign to "${thought.title.substring(0, 40)}"`,
        ).open();
    }

    private openInlineTagger(thought: ThoughtEntry, card: HTMLElement): void {
        // Guard: if tagger already open on this card, just re-focus
        const existingTagger = card.querySelector<HTMLElement>('.diwa-ctx-tagger.is-open');
        if (existingTagger) {
            existingTagger.querySelector<HTMLInputElement>('.diwa-ctx-tagger-input')?.focus();
            return;
        }

        // Close any OTHER open taggers (commit them first)
        document.querySelectorAll<HTMLElement>('.diwa-ctx-tagger.is-open').forEach(t => {
            (t as any)._commit?.();
        });

        const cardHdr = card.querySelector<HTMLElement>('.diwa-syn-card-hdr');
        if (!cardHdr) return;

        // Remove existing chips/prompt area
        cardHdr.querySelector('.diwa-syn-card-ctx-chips')?.remove();
        cardHdr.querySelector('.diwa-syn-card-assign-prompt')?.remove();

        // Local state
        const original = [...(thought.context || [])];
        let staged = [...original];
        let focusedIdx = -1;
        let committed = false;
        const isPhone = Platform.isMobile && !isTablet();

        // Build DOM
        const tagger = cardHdr.createEl('div', {
            cls: 'diwa-ctx-tagger is-open',
            attr: { 'data-thought-path': thought.filePath },
        });

        const field = tagger.createEl('div', { cls: 'diwa-ctx-tagger-field' });
        const chipsRow = field.createEl('div', { cls: 'diwa-ctx-tagger-chips' });
        const inputWrap = chipsRow.createEl('span', { cls: 'diwa-ctx-tagger-input-wrap' });
        const input = inputWrap.createEl('input', {
            cls: 'diwa-ctx-tagger-input',
            attr: {
                type: 'text', spellcheck: 'false',
                autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none',
                placeholder: staged.length === 0 ? 'Assign context…' : '',
            },
        }) as HTMLInputElement;

        const dropdown = tagger.createEl('div', { cls: 'diwa-ctx-tagger-dropdown' });

        // Chip renderer
        const renderChips = () => {
            chipsRow.querySelectorAll('.diwa-chip--tagger').forEach(c => c.remove());
            for (const ctx of staged) {
                const chip = document.createElement('span');
                chip.className = 'diwa-chip diwa-chip--ctx diwa-chip--tagger';
                chip.dataset.ctx = ctx;
                const label = document.createElement('span');
                label.className = 'diwa-chip-label';
                label.textContent = `#${ctx}`;
                chip.appendChild(label);
                const rmBtn = document.createElement('button');
                rmBtn.className = 'diwa-chip-remove';
                rmBtn.setAttribute('aria-label', `Remove ${ctx}`);
                rmBtn.setAttribute('tabindex', '-1');
                rmBtn.textContent = '×';
                rmBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    chip.classList.add('is-removing');
                    setTimeout(() => {
                        staged = staged.filter(c => c !== ctx);
                        renderChips();
                        updatePlaceholder();
                        input.focus();
                    }, 100);
                });
                chip.appendChild(rmBtn);
                chipsRow.insertBefore(chip, inputWrap);
            }
        };
        renderChips();

        const updatePlaceholder = () => {
            input.placeholder = staged.length === 0 ? 'Assign context…' : '';
        };

        // Dropdown builder
        const buildDropdown = (query: string) => {
            dropdown.empty();
            focusedIdx = -1;
            const sanitized = query.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
            const allCtx = this.settings.contexts || [];
            const matches = allCtx
                .filter(c => !staged.includes(c))
                .filter(c => !query || c.toLowerCase().includes(sanitized))
                .slice(0, 5);
            const exactExists = allCtx.includes(sanitized);

            if (matches.length === 0 && !sanitized) {
                dropdown.classList.remove('is-visible');
                return;
            }

            for (const ctx of matches) {
                const item = dropdown.createEl('div', {
                    cls: 'diwa-ctx-tagger-item',
                    attr: { 'data-ctx': ctx, role: 'option' },
                });
                item.createEl('span', { cls: 'diwa-ctx-tagger-item-dot' });
                item.createEl('span', { text: `#${ctx}`, cls: 'diwa-ctx-tagger-item-label' });
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectCtx(ctx);
                });
            }

            if (sanitized && !exactExists && !staged.includes(sanitized)) {
                const createItem = dropdown.createEl('div', {
                    cls: 'diwa-ctx-tagger-item is-create',
                    attr: { 'data-ctx': sanitized, role: 'option' },
                });
                createItem.createEl('span', { cls: 'diwa-ctx-tagger-item-create-icon', text: '+' });
                createItem.createEl('span', { text: `Create "#${sanitized}"`, cls: 'diwa-ctx-tagger-item-label' });
                createItem.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    createAndSelect(sanitized);
                });
            }

            const hasItems = dropdown.childElementCount > 0;
            dropdown.classList.toggle('is-visible', hasItems);

            if (isPhone && hasItems) {
                const rect = tagger.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                dropdown.style.top = spaceBelow < 200 ? 'auto' : 'calc(100% + 4px)';
                dropdown.style.bottom = spaceBelow < 200 ? 'calc(100% + 4px)' : 'auto';
            }
        };

        // Context operations
        const selectCtx = (ctx: string) => {
            if (!staged.includes(ctx)) staged.push(ctx);
            input.value = '';
            dropdown.classList.remove('is-visible');
            renderChips();
            updatePlaceholder();
            input.focus();
        };

        const createAndSelect = (name: string) => {
            if (!this.settings.contexts.includes(name)) {
                this.settings.contexts.push(name);
                this.plugin.saveSettings();
            }
            selectCtx(name);
        };

        const confirmTyped = () => {
            const raw = input.value.trim();
            const name = raw.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
            if (!name || !/[a-z]/.test(name)) {
                tagger.classList.add('is-error');
                setTimeout(() => tagger.classList.remove('is-error'), 600);
                return;
            }
            if (this.settings.contexts.includes(name)) {
                selectCtx(name);
            } else {
                createAndSelect(name);
            }
        };

        // Commit / abort
        const commit = async () => {
            if (committed) return;
            committed = true;
            tagger.remove();
            this.rebuildCardCtxArea(cardHdr, thought, staged, card);
            const changed = staged.length !== original.length || staged.some((c, i) => c !== original[i]);
            if (changed) {
                await this.vault.assignContext(thought.filePath, staged, true);
                if (this.feedFilter === 'no-context' && staged.length > 0) {
                    this.exitCard(card, () => this.refreshCountsInDOM(
                        card.closest<HTMLElement>('.diwa-syn-shell')!
                    ));
                }
            }
        };

        const abort = () => {
            if (committed) return;
            committed = true;
            tagger.remove();
            this.rebuildCardCtxArea(cardHdr, thought, original, card);
        };

        (tagger as any)._commit = commit;

        // Event listeners
        input.addEventListener('input', () => {
            const q = input.value.replace(/,/g, '').trim();
            buildDropdown(q.toLowerCase());
        });

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            const items = Array.from(dropdown.querySelectorAll<HTMLElement>('.diwa-ctx-tagger-item'));
            switch (e.key) {
                case 'Enter': {
                    e.preventDefault();
                    if (focusedIdx >= 0 && items[focusedIdx]) {
                        const ctx = items[focusedIdx].dataset.ctx!;
                        items[focusedIdx].classList.contains('is-create')
                            ? createAndSelect(ctx) : selectCtx(ctx);
                    } else if (input.value.trim()) {
                        confirmTyped();
                    } else {
                        commit();
                    }
                    break;
                }
                case ',': {
                    e.preventDefault();
                    if (input.value.replace(',', '').trim()) confirmTyped();
                    break;
                }
                case 'ArrowDown': {
                    e.preventDefault();
                    focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
                    items.forEach((el, i) => el.classList.toggle('is-focused', i === focusedIdx));
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();
                    focusedIdx = Math.max(focusedIdx - 1, -1);
                    items.forEach((el, i) => el.classList.toggle('is-focused', i === focusedIdx));
                    break;
                }
                case 'Backspace': {
                    if (input.value === '' && staged.length > 0) {
                        e.preventDefault();
                        staged = staged.slice(0, -1);
                        renderChips();
                        updatePlaceholder();
                    }
                    break;
                }
                case 'Escape': {
                    e.preventDefault();
                    abort();
                    break;
                }
                case 'Tab': {
                    if (focusedIdx >= 0 && items[focusedIdx]) {
                        e.preventDefault();
                        const ctx = items[focusedIdx].dataset.ctx!;
                        items[focusedIdx].classList.contains('is-create')
                            ? createAndSelect(ctx) : selectCtx(ctx);
                    }
                    break;
                }
            }
        });

        // Blur = commit (delay for mousedown on suggestion)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (!tagger.contains(document.activeElement)) commit();
            }, 150);
        });

        // Focus + scroll into view
        setTimeout(() => {
            input.focus();
            if (isPhone) tagger.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 30);
    }

    /**
     * Rebuilds static chips/prompt area after tagger closes.
     */
    private rebuildCardCtxArea(
        cardHdr: HTMLElement,
        thought: ThoughtEntry,
        contexts: string[],
        card: HTMLElement,
    ): void {
        thought.context = contexts;

        if (contexts.length > 0) {
            const chipsEl = cardHdr.createEl('div', { cls: 'diwa-syn-card-ctx-chips' });
            for (const ctx of contexts) {
                const chip = chipsEl.createEl('span', {
                    text: `#${ctx}`,
                    cls: 'diwa-chip diwa-chip--ctx',
                    attr: { style: 'cursor:pointer;', title: 'Edit contexts' },
                });
                chip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInlineTagger(thought, card);
                });
            }
            if (!thought.synthesized) {
                const addChipBtn = chipsEl.createEl('button', {
                    cls: 'diwa-syn-card-add-ctx',
                    attr: { title: 'Add context' },
                });
                setIcon(addChipBtn, 'tag');
                addChipBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInlineTagger(thought, card);
                });
            }
        } else if (!thought.synthesized) {
            const assignPrompt = cardHdr.createEl('button', {
                cls: 'diwa-syn-card-assign-prompt',
                attr: { title: 'Assign context to this thought' },
            });
            setIcon(assignPrompt, 'tag');
            assignPrompt.createEl('span', { text: 'Assign Context' });
            assignPrompt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openInlineTagger(thought, card);
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Floating Action Bar
    // ═══════════════════════════════════════════════════════════════════════════

    private renderFloatingActionBar(shell: HTMLElement): void {
        if (!this.synthesisSelectMode) return;

        const bar = shell.createEl('div', { cls: 'diwa-syn-float-bar' });

        bar.createEl('span', {
            cls: 'diwa-syn-float-bar-count',
            text: `${this.selectedPaths.size} selected`,
        });

        const btnRow = bar.createEl('div', { cls: 'diwa-syn-float-bar-btns' });

        // Exit select mode button
        const selectToggle = btnRow.createEl('button', {
            cls: 'diwa-syn-float-bar-btn diwa-syn-float-bar-btn--select is-active',
            attr: { title: 'Exit select mode' },
        });
        setIcon(selectToggle, 'check-square');
        selectToggle.addEventListener('click', () => {
            this.synthesisSelectMode = false;
            this.view.synthesisSelectedPaths.clear();
            this.view.renderView();
        });

        // Assign context (1+ selected)
        if (this.selectedPaths.size >= 1) {
            const assignAllBtn = btnRow.createEl('button', {
                cls: 'diwa-syn-float-bar-btn',
                attr: { title: 'Assign context to selected' },
            });
            setIcon(assignAllBtn, 'tag');
            assignAllBtn.createEl('span', { text: 'Assign' });
            assignAllBtn.addEventListener('click', () => {
                const paths = [...this.selectedPaths];
                const thoughts = paths
                    .map(fp => Array.from(this.index.thoughtIndex.values()).find(t => t.filePath === fp))
                    .filter((t): t is ThoughtEntry => !!t);
                if (thoughts.length === 0) return;
                const union = [...new Set(thoughts.flatMap(t => t.context || []))];
                new InlineContextPickerModal(
                    this.app, this.plugin, union,
                    async (selected: string[]) => {
                        for (const t of thoughts) {
                            await this.vault.assignContext(t.filePath, selected, false);
                        }
                        new Notice(`Contexts assigned to ${thoughts.length} notes.`, 1500);
                        this.synthesisSelectMode = false;
                        this.view.synthesisSelectedPaths.clear();
                        this.view.renderView();
                    },
                    `Assign to ${thoughts.length} notes`,
                ).open();
            });
        }

        // Merge (2+ selected)
        if (this.selectedPaths.size >= 2) {
            const mergeBtn = btnRow.createEl('button', {
                cls: 'diwa-syn-float-bar-btn diwa-syn-float-bar-btn--merge',
                attr: { title: 'Merge selected notes' },
            });
            setIcon(mergeBtn, 'git-merge');
            mergeBtn.createEl('span', { text: `Merge (${this.selectedPaths.size})` });
            mergeBtn.addEventListener('click', () => this.openMergeModal(shell));
        }

        // Done All for selected (1+)
        if (this.selectedPaths.size >= 1) {
            const doneAllBtn = btnRow.createEl('button', {
                cls: 'diwa-syn-float-bar-btn diwa-syn-float-bar-btn--done',
                attr: { title: 'Mark selected as Done' },
            });
            setIcon(doneAllBtn, 'check-check');
            doneAllBtn.createEl('span', { text: 'Done' });
            doneAllBtn.addEventListener('click', async () => {
                const paths = [...this.selectedPaths];
                for (const fp of paths) {
                    await this.vault.markAsSynthesized(fp);
                }
                new Notice(`${paths.length} note(s) marked as Done.`, 1500);
                this.synthesisSelectMode = false;
                this.view.synthesisSelectedPaths.clear();
                this.view.renderView();
            });
        }

        // Close
        const closeBtn = btnRow.createEl('button', {
            cls: 'diwa-syn-float-bar-btn diwa-syn-float-bar-btn--close',
            attr: { title: 'Close' },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => {
            this.synthesisSelectMode = false;
            this.view.synthesisSelectedPaths.clear();
            this.view.renderView();
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Right-click context menu (desktop only)
    // ═══════════════════════════════════════════════════════════════════════════

    private showContextMenu(e: MouseEvent, thought: ThoughtEntry, card: HTMLElement, shell: HTMLElement): void {
        const menu = document.createElement('div');
        menu.className = 'diwa-ctx-menu';
        menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:9999;`;

        const items: Array<{ label: string; icon: string; action: () => void }> = [
            {
                label: 'Select',
                icon: 'check-square',
                action: () => {
                    this.synthesisSelectMode = true;
                    this.selectedPaths.add(thought.filePath);
                    this.view.renderView();
                },
            },
            {
                label: 'Assign Context…',
                icon: 'tag',
                action: () => this.openInlineTagger(thought, card),
            },
        ];

        if (!thought.synthesized) {
            items.push({
                label: 'Mark Done',
                icon: 'check',
                action: async () => {
                    await this.vault.markAsSynthesized(thought.filePath);
                    this.exitCard(card, () => this.view.renderView());
                },
            });
        }

        items.push({
            label: 'Delete',
            icon: 'trash-2',
            action: async () => {
                await this.vault.deleteFile(thought.filePath, 'thoughts');
                this.exitCard(card, () => this.view.renderView());
            },
        });

        for (const item of items) {
            const el = menu.createEl('button', { cls: 'diwa-ctx-menu-item', text: item.label });
            el.addEventListener('click', () => {
                item.action();
                menu.remove();
            });
        }

        document.body.appendChild(menu);

        const cleanup = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('mousedown', cleanup);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', cleanup), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Feed Pane (right 2/3)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderFeedPane(feed: HTMLElement, shell: HTMLElement, isPhone: boolean): void {
        const hdr = feed.createEl('div', { cls: 'diwa-syn-feed-hdr' });

        // ── Top row: home icon + segmented filter + Select + Done All ─────────
        const hdrTop = hdr.createEl('div', { cls: 'diwa-syn-feed-hdr-top' });
        const segBar = hdrTop.createEl('div', { cls: 'diwa-seg-bar diwa-syn-toggle-bar' });
        const feedScroll = feed.createEl('div', { cls: 'diwa-syn-feed-scroll' });

        // Select mode toggle
        const selectToggle = hdrTop.createEl('button', {
            cls: `diwa-syn-select-toggle${this.synthesisSelectMode ? ' is-active' : ''}`,
            attr: { title: this.synthesisSelectMode ? 'Exit select mode' : 'Select notes' },
        });
        setIcon(selectToggle, 'check-square');
        selectToggle.addEventListener('click', () => {
            this.synthesisSelectMode = !this.synthesisSelectMode;
            if (!this.synthesisSelectMode) this.view.synthesisSelectedPaths.clear();
            this.view.renderView();
        });

        // "Done All" — marks every Mapped note as synthesized
        const doneAllBtn = hdrTop.createEl('button', {
            cls: `diwa-syn-feed-done-all${this.feedFilter === 'with-context' ? '' : ' is-hidden'}`,
            attr: { title: 'Mark all mapped notes as Done' },
        });
        setIcon(doneAllBtn, 'check-check');
        doneAllBtn.createEl('span', { text: 'Done All' });
        doneAllBtn.addEventListener('click', async () => {
            const thoughts = this.getFilteredThoughts();
            if (thoughts.length === 0) return;
            doneAllBtn.disabled = true;
            for (const t of thoughts) {
                await this.vault.markAsSynthesized(t.filePath);
            }
            new Notice(`${thoughts.length} note${thoughts.length > 1 ? 's' : ''} marked as Done.`);
            this.view.renderView();
        });

        const FILTERS: Array<{ key: 'no-context' | 'with-context' | 'processed'; label: string }> = [
            { key: 'no-context',   label: 'Inbox' },
            { key: 'with-context', label: 'Mapped' },
            { key: 'processed',    label: 'Done' },
        ];

        for (const f of FILTERS) {
            const btn = segBar.createEl('button', {
                cls: `diwa-seg-btn${this.feedFilter === f.key ? ' is-active' : ''}`,
                attr: { 'data-filter': f.key },
            });
            btn.createEl('span', { text: f.label });
            btn.createEl('span', {
                text: String(this.getCountForFilter(f.key)),
                cls: 'diwa-seg-count',
            });
            btn.addEventListener('click', () => {
                if (this.feedFilter === f.key) return;
                this.feedFilter = f.key;

                if (this.synthesisSelectMode) {
                    this.synthesisSelectMode = false;
                    this.view.synthesisSelectedPaths.clear();
                }

                doneAllBtn.classList.toggle('is-hidden', this.feedFilter !== 'with-context');

                feedScroll.addClass('is-switching');
                setTimeout(() => {
                    this.buildThoughtList(feedScroll, shell, isPhone);
                    feedScroll.removeClass('is-switching');
                    segBar.querySelectorAll('.diwa-seg-btn').forEach((b) => {
                        const el = b as HTMLElement;
                        const key = el.dataset.filter as
                            'no-context' | 'with-context' | 'processed';
                        el.classList.toggle('is-active', key === this.feedFilter);
                        const countEl = el.querySelector('.diwa-seg-count');
                        if (countEl) countEl.textContent = String(this.getCountForFilter(key));
                    });
                }, 80);
            });
        }

        // ── Collapsible context strip ─────────────────────────────────────────
        this.renderContextStrip(hdr, shell);

        // ── Inline capture bar (desktop + tablet only) ────────────────────────
        if (!isPhone) {
            this.renderInlineCaptureBar(feedScroll, shell);
        }

        // ── Thought list ──────────────────────────────────────────────────────
        this.buildThoughtList(feedScroll, shell, isPhone);
    }

    /**
     * Populates (or repopulates) the context echo strip in-place.
     */
    private buildCtxEcho(echo: HTMLElement): void {
        echo.empty();
        const hasAny = this.primedContexts.length > 0;
        echo.className = `diwa-syn-feed-ctx-echo${hasAny ? ' is-primed' : ''}`;

        if (hasAny) {
            echo.createEl('span', { text: '←', cls: 'diwa-syn-feed-echo-label' });
            const pill = echo.createEl('span', { cls: 'diwa-syn-feed-echo-pill' });
            const label =
                this.primedContexts.length === 1
                    ? this.primedContexts[0]
                    : `${this.primedContexts.length} contexts`;
            pill.appendText(` ${label}`);
            echo.createEl('span', {
                text: '✓ ready to assign',
                cls: 'diwa-syn-feed-echo-ready',
            });
        } else {
            echo.createEl('span', {
                text: '← Select contexts to prime assignment',
                cls: 'diwa-syn-feed-echo-label',
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Thought list + cards
    // ═══════════════════════════════════════════════════════════════════════════

    private buildThoughtList(
        container: HTMLElement,
        shell: HTMLElement,
        isPhone: boolean,
    ): void {
        container.empty();
        const thoughts = this.getFilteredThoughts();

        if (thoughts.length === 0) {
            const empty = container.createEl('div', { cls: 'diwa-syn-feed-empty' });
            empty.createEl('span', {
                text: this.getEmptyIcon(),
                cls: 'diwa-syn-feed-empty-icon',
            });
            empty.createEl('span', {
                text: this.getEmptyTitle(),
                cls: 'diwa-syn-feed-empty-title',
            });
            empty.createEl('span', {
                text: this.getEmptySubtext(),
                cls: 'diwa-syn-feed-empty-sub',
            });
            return;
        }

        for (const thought of thoughts) {
            this.renderFeedCard(container, thought, shell, isPhone);
        }
    }

    private renderFeedCard(
        container: HTMLElement,
        thought: ThoughtEntry,
        shell: HTMLElement,
        isPhone: boolean,
    ): void {
        const card = container.createEl('div', {
            cls: `diwa-syn-card${thought.synthesized ? ' is-processed' : ''}`,
        });

        // Desktop: right-click context menu
        if (!Platform.isMobile) {
            card.addEventListener('contextmenu', (e: MouseEvent) => {
                e.preventDefault();
                this.showContextMenu(e, thought, card, shell);
            });
        }

        // Mobile: swipe-right to enter select mode
        if (Platform.isMobile) {
            let startX = 0;
            card.addEventListener('touchstart', (e: TouchEvent) => {
                startX = e.touches[0].clientX;
            }, { passive: true });
            card.addEventListener('touchend', (e: TouchEvent) => {
                const dx = e.changedTouches[0].clientX - startX;
                if (dx > 60) {
                    if (!this.synthesisSelectMode) {
                        this.synthesisSelectMode = true;
                        this.view.renderView();
                    }
                    this.selectedPaths.add(thought.filePath);
                    card.classList.add('is-selected');
                }
            }, { passive: true });
        }

        // Select-mode checkbox (inbox/mapped: unsynthesized only; Done: all)
        if (this.synthesisSelectMode && (!thought.synthesized || this.feedFilter === 'processed')) {
            const cbWrap = card.createEl('label', { cls: 'diwa-syn-card-cb-wrap' });
            const cb = cbWrap.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
            cb.checked = this.selectedPaths.has(thought.filePath);
            cbWrap.createEl('span', { cls: 'diwa-syn-card-cb-label' });
            cb.addEventListener('change', () => {
                if (cb.checked) this.selectedPaths.add(thought.filePath);
                else this.selectedPaths.delete(thought.filePath);
                card.classList.toggle('is-selected', cb.checked);
                // Update merge button in-place
                const mergeBtn = card.closest('.diwa-syn-shell')?.querySelector<HTMLElement>('.diwa-syn-merge-btn');
                if (mergeBtn) {
                    const count = this.selectedPaths.size;
                    mergeBtn.classList.toggle('is-hidden', count < 2);
                    const span = mergeBtn.querySelector('span');
                    if (span) span.textContent = `Merge (${count})`;
                }
            });
        }

        // ── Card header: timestamp + context chips ────────────────────────────
        const cardHdr = card.createEl('div', { cls: 'diwa-syn-card-hdr' });
        cardHdr.createEl('span', {
            text: moment(thought.lastThreadUpdate).fromNow(),
            cls: 'diwa-syn-card-time',
        });

        if (thought.context && thought.context.length > 0) {
            const chipsEl = cardHdr.createEl('div', { cls: 'diwa-syn-card-ctx-chips' });
            thought.context.forEach((ctx) => {
                const chip = chipsEl.createEl('span', {
                    text: `#${ctx}`,
                    cls: 'diwa-chip diwa-chip--ctx',
                });
                if (!thought.synthesized) {
                    chip.style.cursor = 'pointer';
                    chip.title = 'Edit contexts';
                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openInlineTagger(thought, card);
                    });
                }
            });
            if (!thought.synthesized) {
                const addChipBtn = chipsEl.createEl('button', {
                    cls: 'diwa-syn-card-add-ctx',
                    attr: { title: 'Add context' },
                });
                setIcon(addChipBtn, 'tag');
                addChipBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openInlineTagger(thought, card);
                });
            }
        } else if (!thought.synthesized) {
            const assignPrompt = cardHdr.createEl('button', {
                cls: 'diwa-syn-card-assign-prompt',
                attr: { title: 'Assign context to this thought' },
            });
            setIcon(assignPrompt, 'tag');
            assignPrompt.createEl('span', { text: 'Assign Context' });
            assignPrompt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openInlineTagger(thought, card);
            });
        }

        // ── Body (MarkdownRenderer with expand/collapse) ──────────────────────
        const bodyWrap = card.createEl('div', { cls: 'diwa-syn-card-body-wrap' });
        const bodyEl = bodyWrap.createEl('div', { cls: 'diwa-syn-card-body' });

        MarkdownRenderer.render(
            this.app,
            thought.body || '',
            bodyEl,
            thought.filePath,
            this.view,
        ).then(() => {
            requestAnimationFrame(() => {
                if (bodyEl.scrollHeight > 300) {
                    bodyWrap.dataset.long = 'true';
                    bodyWrap.dataset.expanded = 'false';
                    const expandBtn = bodyWrap.createEl('button', {
                        cls: 'diwa-syn-card-expand-btn',
                        text: 'Read more ↓',
                    });
                    expandBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const expanded = bodyWrap.dataset.expanded === 'true';
                        bodyWrap.dataset.expanded = expanded ? 'false' : 'true';
                        expandBtn.textContent = expanded ? 'Read more ↓' : 'Collapse ↑';
                    });
                }
            });
        });

        // ── Actions (only for non-synthesized thoughts) ───────────────────────
        if (!thought.synthesized) {
            const actions = card.createEl('div', { cls: 'diwa-syn-card-actions' });

            const assignBtn = actions.createEl('button', { cls: 'diwa-syn-card-btn diwa-syn-card-btn--assign' });
            setIcon(assignBtn, 'tag');
            assignBtn.createEl('span', { text: 'Assign…' });
            assignBtn.dataset.thoughtPath = thought.filePath;

            assignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openInlineTagger(thought, card);
            });

            // ── Mark Done button ──────────────────────────────────────────────
            const processBtn = actions.createEl('button', {
                cls: 'diwa-syn-card-btn diwa-syn-card-btn--process',
            });
            setIcon(processBtn, 'check');
            processBtn.createEl('span', { text: 'Done' });
            processBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.vault.markAsSynthesized(thought.filePath);
                // Remove from selection if selected
                this.selectedPaths.delete(thought.filePath);
                this.exitCard(card, () => this.view.renderView());
            });

            // ── Edit button ───────────────────────────────────────────────────
            const editBtn = actions.createEl('button', { cls: 'diwa-syn-card-btn diwa-syn-card-btn--edit' });
            setIcon(editBtn, 'pencil-line');
            editBtn.createEl('span', { text: 'Edit' });
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                new EditEntryModal(
                    this.app,
                    this.plugin,
                    thought.body || '',
                    thought.context.join(' '),
                    null,
                    false,
                    async (newText: string, newContexts: string) => {
                        const ctxArr = parseContextString(newContexts);
                        await this.vault.editThought(thought.filePath, newText, ctxArr);
                    },
                    'Edit Thought',
                ).open();
            });

            // ── Delete button (two-stage confirm) ─────────────────────────────
            const deleteBtn = actions.createEl('button', { cls: 'diwa-syn-card-btn diwa-syn-card-btn--delete' });
            setIcon(deleteBtn, 'trash-2');
            const deleteSpan = deleteBtn.createEl('span', { text: 'Delete' });
            let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null;
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (deleteBtn.classList.contains('is-confirm')) {
                    if (deleteConfirmTimer) { clearTimeout(deleteConfirmTimer); deleteConfirmTimer = null; }
                    deleteBtn.disabled = true;
                    this.selectedPaths.delete(thought.filePath);
                    await this.vault.deleteFile(thought.filePath, 'thoughts');
                    this.exitCard(card, () => this.refreshCountsInDOM(shell));
                } else {
                    deleteBtn.classList.add('is-confirm');
                    deleteSpan.textContent = 'Confirm?';
                    deleteConfirmTimer = setTimeout(() => {
                        deleteBtn.classList.remove('is-confirm');
                        deleteSpan.textContent = 'Delete';
                        deleteConfirmTimer = null;
                    }, 3000);
                }
            });
        } else {
            // ── Done card actions: Open in new window + Unmark ────────────────
            const doneActions = card.createEl('div', { cls: 'diwa-syn-card-actions diwa-syn-card-actions--done' });

            const openBtn = doneActions.createEl('button', { cls: 'diwa-syn-card-btn diwa-syn-card-btn--open' });
            setIcon(openBtn, 'external-link');
            openBtn.createEl('span', { text: 'Open' });
            openBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(thought.filePath);
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf('window');
                    await leaf.openFile(file);
                }
            });

            const unmarkBtn = doneActions.createEl('button', { cls: 'diwa-syn-card-btn diwa-syn-card-btn--unmark' });
            setIcon(unmarkBtn, 'rotate-ccw');
            unmarkBtn.createEl('span', { text: 'Unmark' });
            unmarkBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.vault.unmarkSynthesized(thought.filePath);
                this.exitCard(card, () => this.view.renderView());
            });
        }
    }

    private openMergeModal(shell: HTMLElement): void {
        const paths = [...this.selectedPaths];
        const thoughts = paths
            .map(fp => Array.from(this.index.thoughtIndex.values()).find(t => t.filePath === fp))
            .filter((t): t is ThoughtEntry => !!t);

        if (thoughts.length < 2) {
            new Notice('Select at least 2 notes to merge.', 2000);
            return;
        }

        new MergeModal(this.app, thoughts, async (mergedText: string, contexts: string[]) => {
            this.view._mergePending = 1;
            try {
                await this.vault.mergeThoughts(thoughts.map(t => t.filePath), mergedText, contexts);
                new Notice(`✓ ${thoughts.length} notes merged.`, 1500);
                this.synthesisSelectMode = false;
                this.view.synthesisSelectedPaths.clear();
            } catch (err) {
                new Notice('Merge failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 3000);
            } finally {
                this.view._mergePending = 0;
                this.view.renderView();
            }
        }).open();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Assign logic
    // ═══════════════════════════════════════════════════════════════════════════

    private async doAssign(
        thought: ThoughtEntry,
        card: HTMLElement,
        shell: HTMLElement,
    ): Promise<void> {
        if (this.primedContexts.length === 0) return;
        const ctxs = [...this.primedContexts]; // capture snapshot

        // 1. Flash animation + vault write (in parallel)
        card.classList.add('is-assign-flash');
        await this.vault.assignContext(thought.filePath, ctxs, false);

        // 2. After flash duration, remove flash + start exit (if Inbox filter)
        setTimeout(() => {
            card.classList.remove('is-assign-flash');
            if (this.feedFilter === 'no-context') {
                this.exitCard(card, () => {
                    // DOM surgery: refresh counts without blowing away primedContext
                    this.refreshCountsInDOM(shell);
                });
            } else {
                // In Mapped/Done view, just refresh the whole view for correctness
                this.view.renderView();
            }
        }, 400);
    }

    /**
     * Plays exit animation on a card, then calls onComplete after it collapses.
     */
    private exitCard(card: HTMLElement, onComplete: () => void): void {
        // Record the current rendered height so max-height transition works
        card.style.maxHeight = card.offsetHeight + 'px';
        card.classList.add('is-exiting');
        setTimeout(onComplete, 420); // slightly past the 0.4s CSS transition
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Sync priming states — in-place DOM updates, NO view.renderView()
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Called every time `primedContext` changes.
     * Updates context rows, primer strip, ctx echo, and ALL assign buttons.
     */
    private syncAllPrimingStates(shell: HTMLElement): void {
        // 1. Context rows
        shell.querySelectorAll<HTMLElement>('.diwa-syn-ctx-row').forEach((row) => {
            row.classList.toggle(
                'is-selected',
                this.primedContexts.includes(row.dataset.ctx || ''),
            );
        });

        // 2. Primer strip
        const primer = shell.querySelector<HTMLElement>('.diwa-syn-ctx-primer');
        if (primer) this.buildPrimer(primer, shell);

        // 3. Context echo
        const echo = shell.querySelector<HTMLElement>('.diwa-syn-feed-ctx-echo');
        if (echo) this.buildCtxEcho(echo);

        // 4. All assign buttons
        shell.querySelectorAll<HTMLElement>('.diwa-syn-card-btn--assign').forEach((btn) => {
            const filePath = btn.dataset.thoughtPath;
            if (!filePath) return;
            const thought = Array.from(this.index.thoughtIndex.values()).find(
                (t) => t.filePath === filePath,
            );
            if (!thought) return;

            const assignedAll =
                this.primedContexts.length > 0 &&
                this.primedContexts.every((c) => thought.context.includes(c));

            btn.classList.remove('is-primed', 'is-assigned');
            if (assignedAll)                          btn.classList.add('is-assigned');
            else if (this.primedContexts.length > 0) btn.classList.add('is-primed');

            const labelEl = btn.querySelector('span');
            if (labelEl) {
                labelEl.textContent = assignedAll
                    ? '✓ Assigned'
                    : this.primedContexts.length === 1
                        ? `Assign to ${this.primedContexts[0]}`
                        : this.primedContexts.length > 1
                            ? `Assign to ${this.primedContexts.length} contexts`
                            : 'Assign…';
            }
        });
    }

    /**
     * Refreshes context row counts and header count badge in-place.
     * Used after a card is assigned without a full view.renderView().
     */
    private refreshCountsInDOM(shell: HTMLElement): void {
        const counts = this.getContextCounts();

        shell.querySelectorAll<HTMLElement>('.diwa-syn-ctx-row').forEach((row) => {
            const ctx = row.dataset.ctx;
            if (!ctx) return;
            const countEl = row.querySelector<HTMLElement>('.diwa-syn-ctx-row-count');
            if (countEl) countEl.textContent = String(counts[ctx] || 0);
        });

        const hdrCount = shell.querySelector<HTMLElement>('.diwa-syn-ctx-hdr-count');
        if (hdrCount) hdrCount.textContent = String((this.settings.contexts || []).length);

        // Also refresh filter tab counts
        shell.querySelectorAll<HTMLElement>('.diwa-seg-btn[data-filter]').forEach((btn) => {
            const key = btn.dataset.filter as 'no-context' | 'with-context' | 'processed';
            if (!key) return;
            const countEl = btn.querySelector('.diwa-seg-count');
            if (countEl) countEl.textContent = String(this.getCountForFilter(key));
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Inline Capture Bar (desktop + tablet)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderInlineCaptureBar(feedScroll: HTMLElement, shell: HTMLElement): void {
        const bar = feedScroll.createEl('div', { cls: 'diwa-syn-inline-bar' });
        const expanded = this.view.synthesisCaptureExpanded;

        if (!expanded) {
            // Collapsed state — single-line trigger
            const trigger = bar.createEl('div', { cls: 'diwa-syn-inline-trigger' });
            const icon = trigger.createEl('span', { cls: 'diwa-syn-inline-icon' });
            setIcon(icon, 'edit-3');
            trigger.createEl('span', {
                cls: 'diwa-syn-inline-placeholder',
                text: 'Quick capture thought…',
            });
            trigger.addEventListener('click', () => {
                this.view.synthesisCaptureExpanded = true;
                this.view.renderView();
            });
            return;
        }

        // Expanded state
        bar.addClass('is-expanded');
        const textarea = bar.createEl('textarea', {
            cls: 'diwa-syn-inline-textarea',
            attr: { placeholder: 'Capture thought…', rows: '3' },
        }) as HTMLTextAreaElement;
        textarea.value = this.view.synthesisCaptureDraft;

        // Suppress re-renders while typing
        textarea.addEventListener('input', () => {
            this.view.synthesisCaptureDraft = textarea.value;
            this.view._synthesisCaptPending = textarea.value.trim().length > 0 ? 1 : 0;
        });

        // Context chips (read-only echo of primed contexts)
        if (this.primedContexts.length > 0) {
            const chips = bar.createEl('div', { cls: 'diwa-syn-inline-chips' });
            this.primedContexts.forEach(ctx => {
                chips.createEl('span', { cls: 'diwa-syn-inline-chip', text: `#${ctx}` });
            });
        }

        // Actions
        const actions = bar.createEl('div', { cls: 'diwa-syn-inline-actions' });
        const cancelBtn = actions.createEl('button', { text: 'CANCEL', cls: 'diwa-capture-inline-cancel' });
        const saveBtn = actions.createEl('button', { text: 'SAVE', cls: 'diwa-capture-inline-save' }) as HTMLButtonElement;

        const refreshSave = () => {
            const empty = !textarea.value.trim();
            saveBtn.disabled = empty;
            saveBtn.toggleClass('is-disabled', empty);
        };
        textarea.addEventListener('input', refreshSave);
        refreshSave();

        const doSave = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            saveBtn.disabled = true;
            try {
                await this.vault.createThoughtFile(text, this.primedContexts);
                new Notice('Thought captured.');
            } catch (e) {
                new Notice('Failed to capture thought.');
            } finally {
                this.view.synthesisCaptureDraft = '';
                this.view.synthesisCaptureExpanded = false;
                this.view._synthesisCaptPending = 0;
                this.view.renderView();
            }
        };

        const doCancel = () => {
            this.view.synthesisCaptureDraft = '';
            this.view.synthesisCaptureExpanded = false;
            this.view._synthesisCaptPending = 0;
            this.view.renderView();
        };

        saveBtn.addEventListener('click', doSave);
        cancelBtn.addEventListener('click', doCancel);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
            if (e.key === 'Escape') doCancel();
        });

        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); }, 50);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Add Context Modal
    // ═══════════════════════════════════════════════════════════════════════════

    private openAddContextModal(shell: HTMLElement): void {
        new AddContextModal(this.app, async (name: string) => {
            if (!this.settings.contexts.includes(name)) {
                this.settings.contexts.push(name);
                await this.plugin.saveSettings();
            }
            this.view.renderView();
        }).open();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phone: bottom nav + context sheet
    // ═══════════════════════════════════════════════════════════════════════════

    private renderPhoneNav(shell: HTMLElement): void {
        const nav = shell.createEl('div', { cls: 'diwa-syn-phone-nav' });

        const feedBtn = nav.createEl('button', {
            cls: 'diwa-syn-phone-nav-btn is-active',
        });
        setIcon(feedBtn, 'inbox');
        feedBtn.createEl('span', { text: 'Feed' });
        const inboxCount = this.getCountForFilter('no-context');
        if (inboxCount > 0) {
            feedBtn.createEl('span', {
                text: String(inboxCount),
                cls: 'diwa-syn-phone-nav-count',
                attr: { style: 'font-size:0.65em; font-weight:700; color:var(--text-error);' },
            });
        }

        const ctxBtn = nav.createEl('button', { cls: 'diwa-syn-phone-nav-btn' });
        setIcon(ctxBtn, 'tag');
        ctxBtn.createEl('span', { text: 'Contexts' });
        ctxBtn.addEventListener('click', () => {
            this.pendingAssignThought = null;
            const sheet = shell.querySelector<HTMLElement>('.diwa-syn-ctx-sheet');
            if (sheet) {
                this.renderManageSheetContent(sheet, shell);
                sheet.classList.add('is-open');
            }
        });
    }

    private renderContextSheet(shell: HTMLElement): void {
        const sheet = shell.createEl('div', { cls: 'diwa-syn-ctx-sheet' });
        sheet.createEl('div', { cls: 'diwa-syn-ctx-sheet-handle' });

        const sheetHdr = sheet.createEl('div', { cls: 'diwa-syn-ctx-sheet-hdr' });
        const sheetTitle = sheetHdr.createEl('span', {
            cls: 'diwa-syn-ctx-sheet-title',
            text: 'Contexts',
        });
        const closeBtn = sheetHdr.createEl('button', { cls: 'diwa-syn-ctx-sheet-close' });
        setIcon(closeBtn, 'x');

        const contentArea = sheet.createEl('div', { cls: 'diwa-syn-ctx-sheet-content' });

        const closeSheet = () => {
            sheet.classList.remove('is-open', 'is-manage');
            this.pendingAssignThought = null;
        };
        closeBtn.addEventListener('click', closeSheet);

        // Store refs for later population
        (sheet as any)._title   = sheetTitle;
        (sheet as any)._content = contentArea;
        (sheet as any)._close   = closeSheet;
    }

    private openContextSheet(shell: HTMLElement, thought: ThoughtEntry): void {
        this.pendingAssignThought = thought;
        const sheet = shell.querySelector<HTMLElement>('.diwa-syn-ctx-sheet');
        if (!sheet) return;
        sheet.classList.remove('is-manage');
        this.renderAssignSheetContent(sheet, thought);
        sheet.classList.add('is-open');
    }

    /** Assign mode: displayed when the user taps "Assign" on a card. */
    private renderAssignSheetContent(sheet: HTMLElement, thought: ThoughtEntry): void {
        const titleEl    = (sheet as any)._title   as HTMLElement | undefined;
        const contentArea = (sheet as any)._content as HTMLElement | undefined;
        if (!contentArea) return;

        if (titleEl) titleEl.textContent = `"${thought.title.substring(0, 50)}"`;
        contentArea.empty();

        // ── Search ───────────────────────────────────────────────────────────
        const searchInput = contentArea.createEl('input', {
            type: 'text',
            cls: 'diwa-syn-ctx-search-input diwa-syn-sheet-search',
            attr: { placeholder: 'Search contexts…', spellcheck: 'false' },
        });

        // ── Pills grid ───────────────────────────────────────────────────────
        const pillsGrid = contentArea.createEl('div', { cls: 'diwa-syn-sheet-pills' });

        // ── Also-process checkbox ────────────────────────────────────────────
        const alsoProcessLabel = contentArea.createEl('label', {
            cls: 'diwa-syn-sheet-also-process',
        });
        const alsoProcessCheck = alsoProcessLabel.createEl('input', { type: 'checkbox' });
        alsoProcessCheck.checked = true;
        alsoProcessLabel.createEl('span', { text: 'Also mark as synthesized' });

        // ── Apply button ─────────────────────────────────────────────────────
        const confirmBtn = contentArea.createEl('button', {
            text: 'Apply',
            cls: 'diwa-btn-primary diwa-syn-sheet-apply',
        });

        // Build sorted, hidden-filtered pills
        const hidden = new Set<string>(this.settings.hiddenContexts || []);
        const visibleContexts = [...(this.settings.contexts || [])]
            .filter((c) => !hidden.has(c))
            .sort((a, b) => a.localeCompare(b));

        const hiddenCount = (this.settings.contexts || []).filter((c) => hidden.has(c)).length;

        const buildPills = (query: string) => {
            pillsGrid.empty();
            for (const ctx of visibleContexts) {
                if (query && !ctx.toLowerCase().includes(query)) continue;
                const isActive = (thought.context || []).includes(ctx);
                const pill = pillsGrid.createEl('button', {
                    cls: `diwa-chip diwa-chip--ctx${isActive ? ' is-active' : ''}`,
                    text: `#${ctx}`,
                    attr: { 'data-ctx': ctx },
                });
                pill.addEventListener('click', () => pill.classList.toggle('is-active'));
            }
            if (hiddenCount > 0 && !query) {
                pillsGrid.createEl('span', {
                    text: `${hiddenCount} hidden`,
                    cls: 'diwa-syn-sheet-hidden-note',
                });
            }
        };

        buildPills('');
        searchInput.addEventListener('input', () =>
            buildPills(searchInput.value.toLowerCase().trim()),
        );

        confirmBtn.addEventListener('click', async () => {
            const selected: string[] = [];
            pillsGrid
                .querySelectorAll<HTMLElement>('[data-ctx].is-active')
                .forEach((p) => { if (p.dataset.ctx) selected.push(p.dataset.ctx); });
            if (selected.length > 0) {
                await this.vault.assignContext(thought.filePath, selected, false);
            }
            if (alsoProcessCheck.checked) {
                await this.vault.markAsSynthesized(thought.filePath);
            }
            new Notice(
                alsoProcessCheck.checked
                    ? 'Context assigned & synthesized.'
                    : 'Context assigned.',
            );
            const closeSheet = (sheet as any)._close as (() => void) | undefined;
            if (closeSheet) closeSheet();
            this.view.renderView();
        });
    }

    /** Manage mode: displayed when the user taps "Contexts" in the bottom nav. */
    private renderManageSheetContent(sheet: HTMLElement, shell: HTMLElement): void {
        const titleEl    = (sheet as any)._title   as HTMLElement | undefined;
        const contentArea = (sheet as any)._content as HTMLElement | undefined;
        if (!contentArea) return;

        if (titleEl) titleEl.textContent = 'CONTEXTS';
        sheet.classList.add('is-manage');
        contentArea.empty();

        // ── Search ───────────────────────────────────────────────────────────
        const searchWrap = contentArea.createEl('div', { cls: 'diwa-syn-ctx-search' });
        const searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'diwa-syn-ctx-search-input',
            attr: { placeholder: 'Search…', spellcheck: 'false' },
        });

        // ── Context list (same structure as desktop left panel) ───────────────
        const list = contentArea.createEl('div', {
            cls: 'diwa-syn-ctx-list diwa-syn-sheet-ctx-list',
        });
        this.buildContextList(list, shell);

        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            list.querySelectorAll<HTMLElement>('.diwa-syn-ctx-row').forEach((row) => {
                const name = (row.dataset.ctx || '').toLowerCase();
                row.style.display = !q || name.includes(q) ? '' : 'none';
            });
        });
    }

    // ── Legacy stub — kept so any stale references compile ────────────────────
    /** @deprecated Use renderAssignSheetContent or renderManageSheetContent */
    private populateContextSheet(
        _sheet: HTMLElement,
        _thought: ThoughtEntry | null,
    ): void { /* no-op */ }

    // ═══════════════════════════════════════════════════════════════════════════
    // Data helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private getFilteredThoughts(): ThoughtEntry[] {
        const all = Array.from(this.index.thoughtIndex.values())
            .filter((t) => !t.project)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        let results: ThoughtEntry[];
        switch (this.feedFilter) {
            case 'no-context':
                results = all.filter((t) => (!t.context || t.context.length === 0) && !t.synthesized);
                break;
            case 'with-context':
                results = all.filter((t) => t.context && t.context.length > 0 && !t.synthesized);
                break;
            case 'processed':
                results = all.filter((t) => t.synthesized === true);
                break;
        }

        // Apply context chip filter if active
        if (this.activeCtxFilter) {
            results = results.filter((t) => t.context && t.context.includes(this.activeCtxFilter!));
        }

        return results;
    }

    private getCountForFilter(
        filter: 'no-context' | 'with-context' | 'processed',
    ): number {
        const all = Array.from(this.index.thoughtIndex.values()).filter((t) => !t.project);
        switch (filter) {
            case 'no-context':
                return all.filter((t) => (!t.context || t.context.length === 0) && !t.synthesized).length;
            case 'with-context':
                return all.filter((t) => t.context && t.context.length > 0 && !t.synthesized).length;
            case 'processed':
                return all.filter((t) => t.synthesized === true).length;
        }
    }

    private getContextCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const t of this.index.thoughtIndex.values()) {
            for (const ctx of t.context || []) {
                counts[ctx] = (counts[ctx] || 0) + 1;
            }
        }
        return counts;
    }

    private getEmptyIcon(): string {
        switch (this.feedFilter) {
            case 'no-context':   return '🌊';
            case 'with-context': return '📋';
            case 'processed':    return '✅';
        }
    }

    private getEmptyTitle(): string {
        switch (this.feedFilter) {
            case 'no-context':   return 'Inbox Clear';
            case 'with-context': return 'Nothing Mapped Yet';
            case 'processed':    return 'Nothing Done Yet';
        }
    }

    private getEmptySubtext(): string {
        switch (this.feedFilter) {
            case 'no-context':   return 'All thoughts have been mapped. Well done.';
            case 'with-context': return 'Assign contexts from Inbox to see thoughts here.';
            case 'processed':    return 'Mark thoughts as Done to move them here.';
        }
    }
}


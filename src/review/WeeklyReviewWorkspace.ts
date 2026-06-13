import { App, Component, MarkdownRenderer, Notice, Platform, moment, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { EditTaskModal } from '../modals/EditTaskModal';
import { IndexService } from '../services/IndexService';
import { VaultService } from '../services/VaultService';
import type { DiwaSettings, DueEntry, TaskEntry, ThoughtEntry } from '../types';
import { enableImageZoom } from '../utils/imageZoom';
import { attachInlineTriggers } from '../utils';
import {
    getCurrentWeeklyReviewWeekId,
    getWeeklyReviewFocusEntries,
    getWeeklyReviewThoughtGroups,
    getWeeklyReviewWeekMeta,
    shiftWeeklyReviewWeek,
    stripWeeklyObjectiveToken,
    type WeeklyReviewFocusEntry,
    type WeeklyReviewWeekMeta,
} from '../utils/weeklyReview';

interface GlanceData {
    tasks: { completed: TaskEntry[]; overdue: TaskEntry[] };
    finance: { paid: DueEntry[]; overdue: DueEntry[] };
}

interface WeekPlanTaskSnapshot {
    openTasksByDue: Map<string, TaskEntry[]>;
    unscheduledOpenTasks: TaskEntry[];
}

export interface WeeklyReviewDraftState {
    wins: string;
    lessons: string;
    focus: string[];
}

export interface WeeklyReviewWorkspaceState {
    selectedReviewWeekId: string | null;
    reviewDraft: WeeklyReviewDraftState | null;
    reviewDraftWeekId: string | null;
    reviewDraftRevision: number | null;
    reviewDraftDirty: boolean;
    weekPlanDraft: Record<string, string> | null;
    weekPlanDraftWeekId: string | null;
    weekPlanDraftRevision: number | null;
    weekPlanDraftDirty: boolean;
    weekPlanTargetMode: 'next' | 'this';
}

export interface WeeklyReviewWorkspaceHost {
    app: App;
    component: Component;
    plugin: DiwaPlugin;
    settings: DiwaSettings;
    index: IndexService;
    vault: VaultService;
    platform: 'desktop' | 'mobile' | 'tablet';
    getState(): WeeklyReviewWorkspaceState;
    updateState(patch: Partial<WeeklyReviewWorkspaceState>): void;
    rerender(): void;
    isRenderActive(token: number, container: HTMLElement): boolean;
}

const WEEK_PLAN_PRIORITY_ORDER: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
};

export class WeeklyReviewWorkspace {
    private glanceCollapsed = false;
    private lastFocusedDateStr: string | null = null;
    private refreshGlanceContent: (() => void) | null = null;
    private refreshPlan: (() => void) | null = null;
    private invalidateTaskSnapshot: (() => void) | null = null;
    private dayInputValues = new Map<string, string>();
    private currentRenderedWeekId: string | null = null;

    constructor(private readonly host: WeeklyReviewWorkspaceHost) {}

    onTasksRefresh(): void {
        this.invalidateTaskSnapshot?.();
        this.refreshPlan?.();
        this.refreshGlanceContent?.();
    }

    private findScrollContainer(el: HTMLElement | null): HTMLElement | null {
        while (el) {
            if (el.classList.contains('view-content')) {
                return el;
            }
            const style = window.getComputedStyle(el);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    render(container: HTMLElement, renderToken: number): void {
        void this.renderReviewMode(container, renderToken);
    }

    private createSection(parent: HTMLElement, id: string, emoji: string, label: string): { section: HTMLElement; body: HTMLElement; toggle: HTMLElement } {
        const section = parent.createEl('div', { cls: 'diwa-review-section' });
        section.addClass(`diwa-review-section--${id}`);
        section.setAttribute('data-section-id', id);
        const header = section.createEl('div', { cls: 'diwa-review-section-header' });
        header.setAttribute('data-section-id', id);

        const left = header.createEl('div', { cls: 'diwa-review-section-header-left' });
        left.createEl('span', { cls: 'diwa-review-section-icon', text: emoji });
        left.createEl('span', { cls: 'diwa-review-section-title', text: label });

        const toggleEl = header.createEl('span', { cls: 'diwa-review-section-toggle' });
        setIcon(toggleEl, 'chevron-down');

        const body = section.createEl('div', { cls: 'diwa-review-section-body' });

        const storageKey = `diwa-review-collapse-${id}`;
        const isCollapsed = sessionStorage.getItem(storageKey) === 'true';
        if (isCollapsed) {
            body.style.display = 'none';
            toggleEl.style.transform = 'rotate(-90deg)';
        }

        header.addEventListener('click', () => {
            const collapsed = body.style.display === 'none';
            if (collapsed) {
                body.style.opacity = '0';
                body.style.display = 'flex';
                requestAnimationFrame(() => { body.style.opacity = '1'; });
                toggleEl.style.transform = 'rotate(0deg)';
                sessionStorage.removeItem(storageKey);
            } else {
                body.style.opacity = '0';
                setTimeout(() => {
                    if (body.isConnected) body.style.display = 'none';
                }, 120);
                toggleEl.style.transform = 'rotate(-90deg)';
                sessionStorage.setItem(storageKey, 'true');
            }
        });

        return { section, body, toggle: toggleEl };
    }

    private createAutoResizeTextarea(parent: HTMLElement, cls: string, placeholder: string, value: string, onChange: (v: string) => void): HTMLTextAreaElement {
        const ta = parent.createEl('textarea', { cls, attr: { placeholder } }) as HTMLTextAreaElement;
        ta.value = value;
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight || 88}px`;
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
            onChange(ta.value);
        });
        ta.addEventListener('focus', () => {
            ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return ta;
    }

    private getEditableFocusRows(values: string[]): string[] {
        const rows = values.map((value) => String(value ?? ''));
        while (rows.length > 0 && !rows[rows.length - 1].trim()) rows.pop();
        rows.push('');
        return rows;
    }

    private getFocusPlaceholder(index: number): string {
        if (index === 0) return 'Primary focus for next week…';
        if (index === 1) return 'Secondary focus…';
        if (index === 2) return 'Third priority…';
        return `Focus line ${index + 1}…`;
    }

    private getState(): WeeklyReviewWorkspaceState {
        return this.host.getState();
    }

    private updateState(patch: Partial<WeeklyReviewWorkspaceState>): void {
        this.host.updateState(patch);
    }

    private isCurrentWeek(weekId: string): boolean {
        return weekId === getCurrentWeeklyReviewWeekId();
    }

    private resolveSelectedWeekMeta(): WeeklyReviewWeekMeta {
        const state = this.getState();
        const meta = getWeeklyReviewWeekMeta(state.selectedReviewWeekId);
        if (state.selectedReviewWeekId && state.selectedReviewWeekId !== meta.weekId) {
            this.updateState({ selectedReviewWeekId: meta.weekId });
        }
        return meta;
    }

    private canSwitchWeeks(isDirty: boolean, reset?: () => void): boolean {
        if (!isDirty) return true;
        reset?.();
        new Notice('Save or discard review changes before switching weeks.');
        return false;
    }

    private getThoughtExcerpt(thought: ThoughtEntry): string {
        const excerpt = (thought.body || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[\[([^\]]+)\]\]/g, '$1')
            .replace(/^#+\s*/gm, '')
            .replace(/^-\s+\[[ x]\]\s+/gim, '')
            .replace(/^-\s+/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!excerpt) return 'Open note';
        return excerpt.length > 280 ? `${excerpt.slice(0, 277)}…` : excerpt;
    }

    private isInteractiveThoughtCardTarget(target: EventTarget | null): boolean {
        return target instanceof HTMLElement
            && Boolean(target.closest('a, button, input, textarea, select, summary, details, [contenteditable="true"]'));
    }

    private openThoughtNote(filePath: string): void {
        void this.host.app.workspace.openLinkText(filePath, '', 'tab');
    }

    private formatThoughtTime(thought: ThoughtEntry): string {
        if (!thought.created) return '';
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = thought.created.slice(11, 16);
        if (thought.day === today) return timeStr;
        const dateStr = thought.created.slice(5, 10).replace('-', '/');
        return `${dateStr} ${timeStr}`;
    }

    private async renderThoughtMarkdown(
        content: HTMLElement,
        thought: ThoughtEntry,
        renderToken: number,
        container: HTMLElement,
    ): Promise<void> {
        const staged = document.createElement('div');
        staged.className = content.className;

        const markdown = thought.body?.trim();
        if (markdown) {
            try {
                await MarkdownRenderer.render(this.host.app, markdown, staged, thought.filePath, this.host.component);
            } catch {
                staged.setText(this.getThoughtExcerpt(thought));
            }
        } else {
            staged.setText(this.getThoughtExcerpt(thought));
        }

        if (!this.host.isRenderActive(renderToken, container) || !content.isConnected) return;
        content.replaceWith(staged);
        enableImageZoom(this.host.app, staged);
    }

    private renderThoughtsSection(parent: HTMLElement, weekMeta: WeeklyReviewWeekMeta, renderToken: number, container: HTMLElement): void {
        const thoughtGroups = getWeeklyReviewThoughtGroups(this.host.index.thoughtIndex.values(), weekMeta.weekId)
            .slice()
            .sort((left, right) => left.day.localeCompare(right.day));
        const thoughtCount = thoughtGroups.reduce((total, group) => total + group.thoughts.length, 0);
        const { body } = this.createSection(parent, 'thoughts', '💭', 'THOUGHTS OF THE WEEK');

        const summary = body.createEl('div', { cls: 'diwa-review-thought-summary' });
        summary.createEl('span', {
            cls: 'diwa-review-week-label',
            text: thoughtCount === 0 ? 'No authored thoughts in this week' : `${thoughtCount} thought${thoughtCount === 1 ? '' : 's'}`,
        });
        summary.createEl('span', {
            cls: 'diwa-review-prev-week-chip',
            text: `${thoughtGroups.length} day${thoughtGroups.length === 1 ? '' : 's'}`,
        });

        if (thoughtCount === 0) {
            body.createEl('div', {
                cls: 'diwa-review-thought-empty',
                text: 'Nothing authored in this week yet. Capture during the week and this section will collect it automatically.',
            });
            return;
        }

        const list = body.createEl('div', { cls: 'diwa-review-thought-groups' });
        thoughtGroups.forEach((group) => {
            const groupEl = list.createEl('div', { cls: 'diwa-review-thought-day' });
            const groupHeader = groupEl.createEl('div', { cls: 'diwa-review-thought-day__header' });
            groupHeader.createEl('span', { cls: 'diwa-review-thought-day__label', text: group.label });
            groupHeader.createEl('span', { cls: 'diwa-review-thought-day__count', text: String(group.thoughts.length) });

            const dayList = groupEl.createEl('div', { cls: 'diwa-review-thought-day__list' });
            group.thoughts.forEach((thought) => {
                const card = dayList.createEl('div', {
                    cls: 'diwa-dh-thought-row diwa-review-thought-feed-row',
                    attr: {
                        role: 'button',
                        tabindex: '0',
                        'aria-label': `Open thought ${thought.title || 'Untitled thought'}`,
                    },
                });
                const left = card.createEl('div', { cls: 'diwa-dh-thought-row-left' });
                const meta = left.createEl('div', { cls: 'diwa-dh-thought-row-meta' });
                meta.createEl('span', {
                    cls: 'diwa-dh-thought-row-time',
                    text: this.formatThoughtTime(thought),
                });

                const body = card.createEl('div', { cls: 'diwa-dh-thought-row-body' });
                const content = body.createEl('div', { cls: 'diwa-dh-thought-row-content' });
                const text = content.createEl('div', {
                    cls: 'diwa-dh-thought-row-text diwa-review-thought-feed-row__text',
                    text: this.getThoughtExcerpt(thought),
                });
                void this.renderThoughtMarkdown(text, thought, renderToken, container);

                card.addEventListener('click', (event) => {
                    if (this.isInteractiveThoughtCardTarget(event.target)) return;
                    this.openThoughtNote(thought.filePath);
                });
                card.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (this.isInteractiveThoughtCardTarget(event.target)) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    this.openThoughtNote(thought.filePath);
                });
            });
        });
    }

    private formatWeekFocusMeta(entry: WeeklyReviewFocusEntry): string {
        const dayLabel = moment(entry.day, 'YYYY-MM-DD', true).format('ddd · MMM D');
        const created = moment(entry.created, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true);
        return created.isValid()
            ? `${dayLabel} · ${created.format('HH:mm')}`
            : dayLabel;
    }

    private renderWeekFocusSection(parent: HTMLElement, weekMeta: WeeklyReviewWeekMeta): void {
        const entries = getWeeklyReviewFocusEntries(this.host.index.thoughtIndex.values(), weekMeta.weekId);
        const { body } = this.createSection(parent, 'week-focus', '🎯', 'WEEK\'S FOCUS');

        const summary = body.createEl('div', { cls: 'diwa-review-week-focus-summary' });
        summary.createEl('span', {
            cls: 'diwa-review-week-label',
            text: entries.length === 0 ? 'No weekly objectives in this week' : `${entries.length} objective${entries.length === 1 ? '' : 's'}`,
        });

        if (entries.length === 0) {
            body.createEl('div', {
                cls: 'diwa-review-thought-empty',
                text: 'Any thought line with [[weeklyObjective]] in this week will appear here.',
            });
            return;
        }

        const list = body.createEl('div', { cls: 'diwa-review-week-focus-list' });
        entries.forEach((entry) => {
            const row = list.createEl('div', {
                cls: 'diwa-review-week-focus-row',
                attr: {
                    role: 'button',
                    tabindex: '0',
                    'aria-label': `Open weekly focus note for ${entry.day}`,
                },
            });
            row.createEl('span', {
                cls: 'diwa-review-week-focus-row__meta',
                text: this.formatWeekFocusMeta(entry),
            });
            row.createEl('span', {
                cls: 'diwa-review-week-focus-row__text',
                text: stripWeeklyObjectiveToken(entry.line) || 'Open note',
            });

            row.addEventListener('click', (event) => {
                if (this.isInteractiveThoughtCardTarget(event.target)) return;
                this.openThoughtNote(entry.filePath);
            });
            row.addEventListener('keydown', (event: KeyboardEvent) => {
                if (this.isInteractiveThoughtCardTarget(event.target)) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.openThoughtNote(entry.filePath);
            });
        });
    }

    private async renderReviewMode(container: HTMLElement, renderToken: number): Promise<void> {
        container.empty();

        const weekMeta = this.resolveSelectedWeekMeta();
        if (this.currentRenderedWeekId !== weekMeta.weekId) {
            this.currentRenderedWeekId = weekMeta.weekId;
            this.dayInputValues.clear();
        }
        const prevWeekMeta = getWeeklyReviewWeekMeta(shiftWeeklyReviewWeek(weekMeta.weekId, -1));
        const [existing, previousReview] = await Promise.all([
            this.host.vault.loadWeeklyReview(weekMeta.weekId),
            this.host.vault.loadWeeklyReview(prevWeekMeta.weekId),
        ]);
        if (!this.host.isRenderActive(renderToken, container)) return;

        const state = this.getState();
        const persistedReviewDraft: WeeklyReviewDraftState = {
            wins: existing?.wins ?? '',
            lessons: existing?.lessons ?? '',
            focus: [...(existing?.focus ?? [])],
        };
        const persistedRevision = existing?.mtime ?? null;
        const shouldReloadReviewDraft = !state.reviewDraft
            || state.reviewDraftWeekId !== weekMeta.weekId
            || (!state.reviewDraftDirty && state.reviewDraftRevision !== persistedRevision);
        if (shouldReloadReviewDraft) {
            this.updateState({
                reviewDraft: persistedReviewDraft,
                reviewDraftWeekId: weekMeta.weekId,
                reviewDraftRevision: persistedRevision,
                reviewDraftDirty: false,
            });
        }

        const persistedDayPlans = { ...(existing?.dayPlans ?? {}) };
        const shouldReloadWeekPlanDraft = !state.weekPlanDraft
            || state.weekPlanDraftWeekId !== weekMeta.weekId
            || (!state.weekPlanDraftDirty && state.weekPlanDraftRevision !== persistedRevision);
        if (shouldReloadWeekPlanDraft) {
            this.updateState({
                weekPlanDraft: persistedDayPlans,
                weekPlanDraftWeekId: weekMeta.weekId,
                weekPlanDraftRevision: persistedRevision,
                weekPlanDraftDirty: false,
            });
        }
        const latestState = this.getState();
        const latestReviewDraft = latestState.reviewDraft ?? persistedReviewDraft;
        let wins = latestReviewDraft.wins;
        let lessons = latestReviewDraft.lessons;
        let focus = this.getEditableFocusRows(latestReviewDraft.focus);
        let isDirty = Boolean(latestState.reviewDraftDirty || latestState.weekPlanDraftDirty);
        const nextWeekDayPlans = latestState.weekPlanDraft ?? {};
        const thisWeekDayPlans = { ...(previousReview?.dayPlans ?? {}) };
        this.updateState({ weekPlanDraft: nextWeekDayPlans });

        const wrap = container.createEl('div', { cls: 'diwa-review-wrap' });
        wrap.addClass(`diwa-review-wrap--${this.host.platform}`);

        const header = wrap.createEl('div', { cls: 'diwa-review-header' });
        const navRow = header.createEl('div', { cls: 'diwa-review-nav-row' });
        const dirtyDot = navRow.createEl('span', { cls: 'diwa-review-dirty-dot' });
        dirtyDot.style.display = 'none';

        header.createEl('h2', { text: 'Weekly Review', cls: 'diwa-tab-title' });

        const weekPicker = header.createEl('div', { cls: 'diwa-review-week-picker' });
        weekPicker.createEl('span', { cls: 'diwa-review-week-picker__label', text: 'Review week' });
        const weekControls = weekPicker.createEl('div', { cls: 'diwa-review-week-controls' });
        const weekInput = weekControls.createEl('input', {
            cls: 'diwa-review-input diwa-review-week-input',
            attr: {
                type: 'week',
                value: weekMeta.inputValue,
                'aria-label': 'Select review week',
            },
        }) as HTMLInputElement;
        const weekActions = weekControls.createEl('div', { cls: 'diwa-review-week-actions' });
        const prevBtn = weekActions.createEl('button', {
            cls: 'diwa-review-week-btn',
            text: '← Prev',
            attr: { type: 'button', 'aria-label': `Select ${prevWeekMeta.label}` },
        });
        const nextBtn = weekActions.createEl('button', {
            cls: 'diwa-review-week-btn',
            text: 'Next →',
            attr: { type: 'button', 'aria-label': `Select ${getWeeklyReviewWeekMeta(shiftWeeklyReviewWeek(weekMeta.weekId, 1)).label}` },
        });
        const currentBtn = weekActions.createEl('button', {
            cls: 'diwa-review-week-btn',
            text: 'This week',
            attr: { type: 'button' },
        });

        const selectWeek = (candidate: string | null) => {
            const nextMeta = getWeeklyReviewWeekMeta(candidate);
            const nextSelection = candidate ? nextMeta.weekId : null;
            if (nextMeta.weekId === weekMeta.weekId && (this.getState().selectedReviewWeekId ?? null) === nextSelection) {
                weekInput.value = nextMeta.inputValue;
                return;
            }
            if (!this.canSwitchWeeks(isDirty, () => { weekInput.value = weekMeta.inputValue; })) return;
            this.updateState({ selectedReviewWeekId: nextSelection });
            this.host.rerender();
        };

        weekInput.addEventListener('change', () => {
            if (!weekInput.value) {
                weekInput.value = weekMeta.inputValue;
                return;
            }
            selectWeek(weekInput.value);
        });
        prevBtn.addEventListener('click', () => selectWeek(shiftWeeklyReviewWeek(weekMeta.weekId, -1)));
        nextBtn.addEventListener('click', () => selectWeek(shiftWeeklyReviewWeek(weekMeta.weekId, 1)));
        currentBtn.addEventListener('click', () => selectWeek(null));

        const subtitleRow = header.createEl('div', { cls: 'diwa-review-subtitle-row' });
        subtitleRow.createEl('span', { cls: 'diwa-review-week-label', text: weekMeta.label });
        subtitleRow.createEl('span', { cls: 'diwa-review-prev-week-chip', text: weekMeta.dateRange });
        if (existing?.saved) {
            const rel = moment(existing.saved, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true).fromNow();
            subtitleRow.createEl('span', { cls: 'diwa-review-saved-badge', text: `Saved ${rel}` });
        }
        if (!this.isCurrentWeek(weekMeta.weekId)) {
            subtitleRow.createEl('span', { cls: 'diwa-review-readonly-badge', text: 'Non-current week · task changes locked' });
        }

        const markDirtyIndicator = () => {
            if (!isDirty) {
                isDirty = true;
                dirtyDot.style.display = 'inline-block';
            }
        };
        if (isDirty) dirtyDot.style.display = 'inline-block';

        const syncReviewDraft = () => {
            this.updateState({
                reviewDraft: { wins, lessons, focus: [...focus] },
                reviewDraftWeekId: weekMeta.weekId,
                reviewDraftRevision: persistedRevision,
                reviewDraftDirty: true,
            });
            markDirtyIndicator();
        };

        const markWeekPlanDirty = () => {
            this.updateState({ weekPlanDraftDirty: true });
            markDirtyIndicator();
        };

        const topStack = wrap.createEl('div', { cls: 'diwa-review-top-stack' });
        this.renderGlancePanel(topStack, weekMeta);
        this.renderWeekFocusSection(topStack, weekMeta);
        this.renderThoughtsSection(topStack, weekMeta, renderToken, container);

        const body = wrap.createEl('div', { cls: 'diwa-review-body' });



        const { body: focusBody } = this.createSection(body, 'focus', '🎯', "NEXT WEEK'S FOCUS");
        const focusList = focusBody.createEl('div', { cls: 'diwa-review-focus-list' });
        const renderFocusInputs = (focusIndex?: number, cursorPosition?: number) => {
            focus = this.getEditableFocusRows(focus);
            focusList.empty();

            focus.forEach((value, index) => {
                const item = focusList.createEl('div', { cls: 'diwa-review-focus-item' });
                item.createEl('span', { cls: 'diwa-review-focus-num', text: String(index + 1) });
                const input = item.createEl('input', {
                    cls: 'diwa-review-input',
                    attr: {
                        type: 'text',
                        placeholder: this.getFocusPlaceholder(index),
                        value,
                        'aria-label': `Next week focus line ${index + 1}`,
                    },
                }) as HTMLInputElement;
                input.addEventListener('input', () => {
                    const before = this.getEditableFocusRows(focus);
                    focus[index] = input.value;
                    const after = this.getEditableFocusRows(focus);
                    const caret = input.selectionStart ?? input.value.length;
                    focus = after;
                    syncReviewDraft();
                    if (after.length !== before.length) {
                        renderFocusInputs(index, caret);
                    }
                });
                input.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const insertionIndex = Math.min(index + 1, focus.length);
                    focus.splice(insertionIndex, 0, '');
                    focus = this.getEditableFocusRows(focus);
                    syncReviewDraft();
                    renderFocusInputs(insertionIndex, 0);
                });
            });

            if (typeof focusIndex !== 'number') return;
            requestAnimationFrame(() => {
                if (!this.host.isRenderActive(renderToken, container)) return;
                const inputs = focusList.querySelectorAll<HTMLInputElement>('input');
                const target = inputs[Math.max(0, Math.min(focusIndex, inputs.length - 1))];
                if (!target) return;
                target.focus();
                const caret = cursorPosition ?? target.value.length;
                target.setSelectionRange(caret, caret);
            });
        };
        renderFocusInputs();

        this.renderWeekPlanSection(body, weekMeta, prevWeekMeta, nextWeekDayPlans, thisWeekDayPlans, markWeekPlanDirty, renderToken, container);

        const saveRow = wrap.createEl('div', { cls: 'diwa-review-save-row' });
        const hintStack = saveRow.createEl('div', { cls: 'diwa-review-save-hints' });
        hintStack.createEl('span', {
            cls: 'diwa-review-kbd-hint',
            text: Platform.isMacOS ? '⌘↵ to save' : 'Ctrl+↵ to save',
        });
        if (!this.isCurrentWeek(weekMeta.weekId)) {
            hintStack.createEl('span', {
                cls: 'diwa-review-save-note',
                text: 'Task planning is read-only outside the current week.',
            });
        }
        const saveBtn = saveRow.createEl('button', { cls: 'diwa-review-save-btn', text: '💾  Save Review' });

        const doSave = async () => {
            if (saveBtn.disabled) return;
            saveBtn.textContent = 'Saving…';
            saveBtn.disabled = true;
            try {
                const nextRevision = await this.host.vault.saveWeeklyReview(
                    weekMeta.weekId,
                    weekMeta.dateRange,
                    wins,
                    lessons,
                    focus,
                    nextWeekDayPlans,
                    { expectedMtime: this.getState().weekPlanDraftRevision ?? null },
                );
                if (!this.host.isRenderActive(renderToken, container)) return;
                isDirty = false;
                this.updateState({
                    reviewDraft: { wins, lessons, focus: [...focus] },
                    reviewDraftWeekId: weekMeta.weekId,
                    reviewDraftRevision: nextRevision,
                    reviewDraftDirty: false,
                    weekPlanDraftWeekId: weekMeta.weekId,
                    weekPlanDraftRevision: nextRevision,
                    weekPlanDraftDirty: false,
                });
                dirtyDot.style.display = 'none';
                saveBtn.textContent = '✓  Saved';
                saveBtn.classList.add('is-saved');
                setTimeout(() => {
                    if (!this.host.isRenderActive(renderToken, container)) return;
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-saved');
                    saveBtn.disabled = false;
                }, 1800);
            } catch (error) {
                if (!this.host.isRenderActive(renderToken, container)) return;
                if (error instanceof Error && error.name === 'DIWA_WEEKLY_REVIEW_CONFLICT') {
                    const latest = await this.host.vault.loadWeeklyReview(weekMeta.weekId);
                    const latestFocus = [...(latest?.focus ?? [])];
                    this.updateState({
                        reviewDraft: {
                            wins: latest?.wins ?? '',
                            lessons: latest?.lessons ?? '',
                            focus: latestFocus,
                        },
                        reviewDraftWeekId: weekMeta.weekId,
                        reviewDraftRevision: latest?.mtime ?? null,
                        reviewDraftDirty: false,
                        weekPlanDraft: { ...(latest?.dayPlans ?? {}) },
                        weekPlanDraftWeekId: weekMeta.weekId,
                        weekPlanDraftRevision: latest?.mtime ?? null,
                        weekPlanDraftDirty: false,
                    });
                    new Notice('Weekly review changed on disk. Reloaded the latest saved plan.');
                    this.host.rerender();
                    return;
                }
                saveBtn.textContent = '⚠ Save Failed — Retry';
                saveBtn.classList.add('is-error');
                saveBtn.disabled = false;
                setTimeout(() => {
                    if (!this.host.isRenderActive(renderToken, container)) return;
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-error');
                }, 3000);
            }
        };

        saveBtn.addEventListener('click', doSave);
        wrap.addEventListener('keydown', (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void doSave();
            }
        });

        const prevCard = wrap.createEl('div', { cls: 'diwa-review-prev-card is-collapsed' });
        const prevTrigger = prevCard.createEl('div', { cls: 'diwa-review-prev-card__trigger' });
        const prevLeft = prevTrigger.createEl('div', { cls: 'diwa-review-prev-card__left' });
        prevLeft.createEl('span', { cls: 'diwa-section-label', text: '📅 PREVIOUS WEEK' });
        prevLeft.createEl('span', { cls: 'diwa-review-prev-week-chip', text: prevWeekMeta.label });
        const prevChevron = prevTrigger.createEl('span', { cls: 'diwa-review-prev-card__chevron' });
        setIcon(prevChevron, 'chevron-down');

        const prevBody = prevCard.createEl('div', { cls: 'diwa-review-prev-card__body' });
        let prevLoaded = false;

        prevTrigger.addEventListener('click', async () => {
            const isCollapsed = prevCard.classList.contains('is-collapsed');
            prevCard.classList.toggle('is-collapsed');
            if (!isCollapsed || prevLoaded) return;
            prevLoaded = true;
            const preview = await this.host.vault.loadWeeklyReviewPreview(prevWeekMeta.weekId);
            if (!this.host.isRenderActive(renderToken, container)) return;
            if (preview) {
                prevBody.createEl('span', { cls: 'diwa-review-readonly-badge', text: 'READ-ONLY' });
                const rendered = prevBody.createEl('div', { cls: 'diwa-review-prev-content' });
                await MarkdownRenderer.render(this.host.app, preview.body, rendered, preview.file.path, this.host.component);
                if (!this.host.isRenderActive(renderToken, container) || !rendered.isConnected) return;
                const openBtn = prevBody.createEl('button', {
                    cls: 'diwa-btn-secondary diwa-review-prev-open-btn',
                    text: 'Open in Vault →',
                });
                openBtn.addEventListener('click', () => {
                    void this.host.app.workspace.openLinkText(preview.file.path, '', 'tab');
                });
                return;
            }
            prevBody.createEl('div', { text: 'No review found for the previous week.', cls: 'diwa-review-prev-empty' });
        });
    }

    private renderWeekPlanSection(
        parent: HTMLElement,
        selectedWeekMeta: WeeklyReviewWeekMeta,
        previousWeekMeta: WeeklyReviewWeekMeta,
        nextWeekDayPlans: Record<string, string>,
        thisWeekDayPlans: Record<string, string>,
        markDirty: () => void,
        renderToken: number,
        container: HTMLElement,
    ): void {
        const { body: planBody } = this.createSection(parent, 'week-plan', '📅', 'WEEK PLAN');
        let taskSnapshotCache: WeekPlanTaskSnapshot | null = null;
        const canMutateTasks = this.isCurrentWeek(selectedWeekMeta.weekId);
        const invalidateTaskSnapshot = () => {
            taskSnapshotCache = null;
        };
        this.invalidateTaskSnapshot = invalidateTaskSnapshot;
        const getTaskSnapshot = (): WeekPlanTaskSnapshot => {
            if (taskSnapshotCache) return taskSnapshotCache;

            const openTasksByDue = new Map<string, TaskEntry[]>();
            const unscheduledOpenTasks: TaskEntry[] = [];

            for (const task of this.host.index.taskIndex.values()) {
                if (task.status !== 'open') continue;
                const due = (task.due || '').trim();
                if (!due) {
                    unscheduledOpenTasks.push(task);
                    continue;
                }
                const dayTasks = openTasksByDue.get(due);
                if (dayTasks) {
                    dayTasks.push(task);
                } else {
                    openTasksByDue.set(due, [task]);
                }
            }

            unscheduledOpenTasks.sort((left, right) => {
                const leftPriority = WEEK_PLAN_PRIORITY_ORDER[left.priority || 'low'] ?? 2;
                const rightPriority = WEEK_PLAN_PRIORITY_ORDER[right.priority || 'low'] ?? 2;
                if (leftPriority !== rightPriority) return leftPriority - rightPriority;
                return right.lastUpdate - left.lastUpdate;
            });

            taskSnapshotCache = { openTasksByDue, unscheduledOpenTasks };
            return taskSnapshotCache;
        };

        const targetRow = planBody.createEl('div', { cls: 'diwa-weekplan-target-row' });
        const targetModes: Array<{ key: 'next' | 'this'; label: string }> = [
            { key: 'this', label: 'This week' },
            { key: 'next', label: 'Next week' },
        ];

        const renderPlan = () => {
            const scrollContainer = this.findScrollContainer(planBody);
            const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

            const children = Array.from(planBody.children);
            children.forEach((child) => {
                if (child !== targetRow) child.remove();
            });

            const activeTarget = this.getState().weekPlanTargetMode;
            const anchorWeekMeta = getWeeklyReviewWeekMeta(
                activeTarget === 'this'
                    ? selectedWeekMeta.weekId
                    : shiftWeeklyReviewWeek(selectedWeekMeta.weekId, 1),
            );

            const weekStart = anchorWeekMeta.startDate;
            const weekEnd = anchorWeekMeta.endDate;
            const taskSnapshot = getTaskSnapshot();

            const planMeta = planBody.createEl('div', { cls: 'diwa-weekplan-meta' });
            planMeta.createEl('span', {
                cls: 'diwa-review-week-label',
                text: `${activeTarget === 'this' ? 'This week' : 'Next week'} · ${anchorWeekMeta.label}`,
            });
            if (activeTarget === 'this') {
                planMeta.createEl('span', {
                    cls: 'diwa-review-prev-week-chip',
                    text: `Loaded from ${previousWeekMeta.label}`,
                });
            }
            if (!canMutateTasks) {
                planMeta.createEl('span', {
                    cls: 'diwa-review-readonly-badge',
                    text: 'Read-only task view',
                });
            }

            const grid = planBody.createEl('div', { cls: 'diwa-weekplan-grid' });
            const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

            for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                const dayMoment = moment(anchorWeekMeta.startDate, 'YYYY-MM-DD').add(dayIndex, 'days');
                const dateStr = dayMoment.format('YYYY-MM-DD');
                const dayLabel = `${dayKeys[dayIndex]} · ${dayMoment.format('MMM D')}`;
                const dayTasks = taskSnapshot.openTasksByDue.get(dateStr) ?? [];

                const isToday = dateStr === moment().format('YYYY-MM-DD');
                const card = grid.createEl('div', { cls: `diwa-weekplan-day${isToday ? ' is-today' : ''}` });
                const storageKey = `diwa-weekplan-collapse-${dateStr}`;
                const bodyId = `diwa-weekplan-day-${activeTarget}-${dateStr}`;
                const header = card.createEl('button', {
                    cls: 'diwa-weekplan-day__header',
                    attr: {
                        type: 'button',
                        'aria-controls': bodyId,
                    },
                });
                const headerMain = header.createEl('span', { cls: 'diwa-weekplan-day__header-main' });
                headerMain.createEl('span', { cls: 'diwa-weekplan-day__label', text: dayLabel });
                if (dayTasks.length > 0) {
                    const countCls = dayTasks.length >= 6
                        ? 'diwa-weekplan-day__count diwa-weekplan-day__count--danger'
                        : dayTasks.length >= 4
                            ? 'diwa-weekplan-day__count diwa-weekplan-day__count--warn'
                            : 'diwa-weekplan-day__count';
                    headerMain.createEl('span', { cls: countCls, text: String(dayTasks.length) });
                }
                const chevron = header.createEl('span', {
                    cls: 'diwa-weekplan-day__chevron',
                    attr: { 'aria-hidden': 'true' },
                });
                setIcon(chevron, 'chevron-down');

                const cardBody = card.createEl('div', {
                    cls: 'diwa-weekplan-day__body',
                    attr: { id: bodyId },
                });
                const setCollapsed = (collapsed: boolean) => {
                    card.classList.toggle('is-collapsed', collapsed);
                    cardBody.style.display = collapsed ? 'none' : 'flex';
                    header.setAttribute('aria-expanded', String(!collapsed));
                    if (collapsed) sessionStorage.setItem(storageKey, 'true');
                    else sessionStorage.removeItem(storageKey);
                };
                setCollapsed(sessionStorage.getItem(storageKey) === 'true');

                header.addEventListener('click', () => {
                    const expanded = header.getAttribute('aria-expanded') === 'true';
                    setCollapsed(expanded);
                });



                if (dayTasks.length > 0) {
                    const taskList = cardBody.createEl('div', { cls: 'diwa-weekplan-day__tasks' });
                    const now = Date.now();
                    dayTasks.forEach((task) => {
                        const taskRow = taskList.createEl('div', { cls: 'diwa-weekplan-task' });
                        const checkbox = taskRow.createEl('input', {
                            cls: 'diwa-weekplan-task__check',
                            attr: { type: 'checkbox' },
                        }) as HTMLInputElement;
                        checkbox.disabled = !canMutateTasks;
                        taskRow.createEl('span', { cls: 'diwa-weekplan-task__title', text: task.title });
                        if (task.priority) {
                            const badge = task.priority === 'high' ? '↑H' : task.priority === 'medium' ? '~M' : '↓L';
                            taskRow.createEl('span', {
                                cls: `diwa-weekplan-task__priority diwa-weekplan-task__priority--${task.priority}`,
                                text: badge,
                            });
                        }
                        const createdMs = moment(task.created, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true).valueOf();
                        if (canMutateTasks && now - createdMs < 120_000) {
                            const editIcon = taskRow.createEl('span', {
                                cls: 'diwa-weekplan-task__edit',
                                text: '⚙',
                                attr: { title: 'Edit details' },
                            });
                            editIcon.addEventListener('click', (event) => {
                                event.stopPropagation();
                                new EditTaskModal(this.host.app, task, this.host.vault, this.host.index, () => renderPlan()).open();
                            });
                        }
                        checkbox.addEventListener('change', async () => {
                            if (!canMutateTasks) return;
                            await this.host.vault.toggleTask(task.filePath, true);
                            invalidateTaskSnapshot();
                            renderPlan();
                        });
                    });
                }

                if (canMutateTasks) {
                    const addRow = cardBody.createEl('div', { cls: 'diwa-weekplan-add-row' });
                    const addInput = addRow.createEl('input', {
                        cls: 'diwa-weekplan-add-input',
                        attr: {
                            type: 'text',
                            placeholder: '+ Add or assign task…',
                            value: this.dayInputValues.get(dateStr) || '',
                        },
                    }) as HTMLInputElement;

                    attachInlineTriggers(
                        this.host.app,
                        addInput,
                        () => {},
                        undefined,
                        undefined,
                        this.host.settings.peopleFolder
                    );

                    let picker: HTMLElement | null = null;
                    let suggestions: Array<{ type: 'new' | 'assign'; title: string; task?: TaskEntry; query?: string }> = [];
                    let selectedIndex = 0;

                    const closePicker = () => {
                        if (picker) {
                            picker.remove();
                            picker = null;
                        }
                    };

                    const executeSuggestion = async (sugg: { type: 'new' | 'assign'; title: string; task?: TaskEntry; query?: string }) => {
                        const queryVal = addInput.value.trim();
                        closePicker();
                        addInput.value = '';
                        this.dayInputValues.delete(dateStr);
                        addInput.disabled = true;

                        try {
                            if (sugg.type === 'new') {
                                const title = sugg.query || queryVal;
                                if (title) {
                                    await this.host.vault.createTaskFile(title, [], dateStr);
                                }
                            } else if (sugg.type === 'assign' && sugg.task) {
                                await this.host.vault.setTaskDue(sugg.task.filePath, dateStr);
                            }
                            setTimeout(() => {
                                if (!this.host.isRenderActive(renderToken, container)) return;
                                invalidateTaskSnapshot();
                                renderPlan();
                            }, 300);
                        } catch {
                            addInput.disabled = false;
                        }
                    };

                    const renderPicker = () => {
                        closePicker();

                        const query = addInput.value.trim();
                        suggestions = [];

                        if (query) {
                            suggestions.push({
                                type: 'new',
                                title: `Create task: "${query}"`,
                                query: query,
                            });
                        }

                        const allOpenTasks: TaskEntry[] = [];
                        for (const task of this.host.index.taskIndex.values()) {
                            if (task.status === 'open' && task.due !== dateStr) {
                                allOpenTasks.push(task);
                            }
                        }

                        const normalizedQuery = query.toLowerCase();
                        const matches = normalizedQuery
                            ? allOpenTasks.filter((t) =>
                                  t.title.toLowerCase().includes(normalizedQuery) ||
                                  t.body.toLowerCase().includes(normalizedQuery)
                              )
                            : allOpenTasks;

                        matches.sort((left, right) => {
                            const leftDue = (left.due || '').trim();
                            const rightDue = (right.due || '').trim();
                            if (!leftDue && rightDue) return -1;
                            if (leftDue && !rightDue) return 1;

                            const leftPriority = WEEK_PLAN_PRIORITY_ORDER[left.priority || 'low'] ?? 2;
                            const rightPriority = WEEK_PLAN_PRIORITY_ORDER[right.priority || 'low'] ?? 2;
                            if (leftPriority !== rightPriority) return leftPriority - rightPriority;

                            return right.lastUpdate - left.lastUpdate;
                        });

                        matches.slice(0, 8).forEach((task) => {
                            suggestions.push({
                                type: 'assign',
                                title: task.title,
                                task: task,
                            });
                        });

                        if (suggestions.length === 0) return;

                        if (selectedIndex >= suggestions.length) {
                            selectedIndex = suggestions.length - 1;
                        }
                        if (selectedIndex < 0) {
                            selectedIndex = 0;
                        }

                        picker = addRow.createEl('div', { cls: 'diwa-weekplan-picker' });
                        picker.addEventListener('mousedown', (e) => e.preventDefault());
                        picker.addEventListener('touchstart', (e) => e.preventDefault());

                        const list = picker.createEl('div', { cls: 'diwa-weekplan-picker__list' });
                        suggestions.forEach((sugg, idx) => {
                            const item = list.createEl('div', {
                                cls: `diwa-weekplan-picker__item${idx === selectedIndex ? ' is-selected' : ''}`,
                            });

                            if (sugg.type === 'new') {
                                item.createEl('span', { cls: 'diwa-weekplan-picker__icon', text: '✨' });
                                item.createEl('span', { cls: 'diwa-weekplan-picker__title', text: sugg.title });
                            } else {
                                item.createEl('span', { cls: 'diwa-weekplan-picker__title', text: sugg.title });
                                if (sugg.task?.priority) {
                                    const badge = sugg.task.priority === 'high' ? '↑H' : sugg.task.priority === 'medium' ? '~M' : '↓L';
                                    item.createEl('span', {
                                        cls: `diwa-weekplan-picker__priority diwa-weekplan-picker__priority--${sugg.task.priority}`,
                                        text: badge,
                                    });
                                }
                            }

                            item.addEventListener('click', async () => {
                                await executeSuggestion(sugg);
                            });
                        });
                    };

                    addInput.addEventListener('focus', () => {
                        this.lastFocusedDateStr = dateStr;
                        renderPicker();
                    });

                    addInput.addEventListener('blur', () => {
                        closePicker();
                        setTimeout(() => {
                            if (document.activeElement !== addInput) {
                                if (this.lastFocusedDateStr === dateStr) {
                                    this.lastFocusedDateStr = null;
                                }
                            }
                        }, 200);
                    });

                    addInput.addEventListener('input', () => {
                        selectedIndex = 0;
                        this.dayInputValues.set(dateStr, addInput.value);
                        renderPicker();
                    });

                    addInput.addEventListener('keydown', async (event: KeyboardEvent) => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            if (suggestions.length > 0) {
                                selectedIndex = (selectedIndex + 1) % suggestions.length;
                                renderPicker();
                            }
                        } else if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            if (suggestions.length > 0) {
                                selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
                                renderPicker();
                            }
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            if (suggestions.length > 0 && suggestions[selectedIndex]) {
                                await executeSuggestion(suggestions[selectedIndex]);
                            }
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            closePicker();
                            addInput.blur();
                        }
                    });

                    // Autofocus if this day's input was last focused
                    if (this.lastFocusedDateStr === dateStr) {
                        requestAnimationFrame(() => {
                            if (addInput.isConnected) {
                                addInput.focus();
                                addInput.setSelectionRange(addInput.value.length, addInput.value.length);
                            }
                        });
                    }
                }
            }

            let totalAssigned = 0;
            for (const [dueDate, tasks] of taskSnapshot.openTasksByDue.entries()) {
                if (dueDate >= weekStart && dueDate <= weekEnd) {
                    totalAssigned += tasks.length;
                }
            }
            if (totalAssigned === 0) {
                grid.createEl('div', {
                    cls: 'diwa-weekplan-empty',
                    text: 'No tasks scheduled or due for this anchored week.',
                });
            }

            if (scrollContainer) {
                requestAnimationFrame(() => {
                    scrollContainer.scrollTop = scrollTop;
                });
            }
        };

        targetModes.forEach(({ key, label }) => {
            const button = targetRow.createEl('button', {
                cls: `diwa-weekplan-target-btn${this.getState().weekPlanTargetMode === key ? ' is-active' : ''}`,
                text: label,
                attr: {
                    type: 'button',
                    'aria-pressed': String(this.getState().weekPlanTargetMode === key),
                },
            });
            button.addEventListener('click', () => {
                this.updateState({ weekPlanTargetMode: key });
                targetRow.querySelectorAll<HTMLButtonElement>('.diwa-weekplan-target-btn').forEach((el) => {
                    el.classList.toggle('is-active', el === button);
                    el.setAttribute('aria-pressed', String(el === button));
                });
                renderPlan();
            });
        });

        this.refreshPlan = renderPlan;
        renderPlan();
    }



    private renderGlancePanel(parent: HTMLElement, weekMeta: WeeklyReviewWeekMeta): void {
        const glance = parent.createEl('div', { cls: 'diwa-review-glance' });
        if (this.glanceCollapsed) glance.classList.add('is-collapsed');

        const glanceHeader = glance.createEl('div', { cls: 'diwa-review-glance__header' });
        glanceHeader.createEl('span', { cls: 'diwa-review-glance__title', text: '⚡ WEEK AT A GLANCE' });

        const glanceActions = glanceHeader.createEl('div', { cls: 'diwa-review-glance__actions' });
        const refreshBtn = glanceActions.createEl('button', { cls: 'diwa-review-glance__refresh', attr: { title: 'Refresh' } });
        setIcon(refreshBtn, 'refresh-cw');
        const toggleBtn = glanceActions.createEl('button', { cls: 'diwa-review-glance__toggle', attr: { title: 'Collapse' } });
        setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');

        const glanceBody = glance.createEl('div', { cls: 'diwa-review-glance__body' });
        const render = () => {
            glanceBody.empty();
            const data = this.computeGlanceData(weekMeta);
            this.renderGlanceTasks(glanceBody, data.tasks);
            this.renderGlanceFinance(glanceBody, data.finance);
        };
        this.refreshGlanceContent = render;
        render();

        toggleBtn.addEventListener('click', () => {
            this.glanceCollapsed = !this.glanceCollapsed;
            glance.classList.toggle('is-collapsed', this.glanceCollapsed);
            setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');
        });
        refreshBtn.addEventListener('click', render);
    }

    private computeGlanceData(weekMeta: WeeklyReviewWeekMeta): GlanceData {
        const weekStart = moment(weekMeta.startDate, 'YYYY-MM-DD');
        const weekEnd = moment(weekMeta.endDate, 'YYYY-MM-DD');
        const today = moment().startOf('day');
        const isCurrentSelectedWeek = this.isCurrentWeek(weekMeta.weekId);
        const referenceDay = isCurrentSelectedWeek ? today : weekEnd.clone();

        const completed: TaskEntry[] = [];
        const overdue: TaskEntry[] = [];
        for (const task of this.host.index.taskIndex.values()) {
            if (task.status === 'done') {
                const modified = moment(task.modified, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true);
                if (modified.isSameOrAfter(weekStart) && modified.isSameOrBefore(weekEnd)) {
                    completed.push(task);
                }
                continue;
            }
            if (task.status === 'open' && task.due) {
                const due = moment(task.due, 'YYYY-MM-DD', true);
                const isOverdue = due.isValid() && (
                    isCurrentSelectedWeek
                        ? due.isBefore(referenceDay, 'day')
                        : due.isSameOrBefore(referenceDay, 'day')
                );
                if (isOverdue) overdue.push(task);
            }
        }

        completed.sort((left, right) => (right.lastUpdate || 0) - (left.lastUpdate || 0));
        overdue.sort((left, right) => left.due.localeCompare(right.due) || (right.lastUpdate || 0) - (left.lastUpdate || 0));

        const finPaid: DueEntry[] = [];
        for (const due of this.host.index.dueIndex.values()) {
            if (!due.lastPayment) continue;
            const lastPayment = moment(due.lastPayment, 'YYYY-MM-DD', true);
            if (lastPayment.isValid() && lastPayment.isSameOrAfter(weekStart) && lastPayment.isSameOrBefore(weekEnd)) {
                finPaid.push(due);
            }
        }
        const paidPaths = new Set(finPaid.map((due) => due.path));

        const finOverdue: DueEntry[] = [];
        for (const due of this.host.index.dueIndex.values()) {
            if (!due.isActive || !due.dueMoment || paidPaths.has(due.path)) continue;
            const dueMoment = moment(due.dueMoment);
            const isOverdue = isCurrentSelectedWeek
                ? dueMoment.isBefore(referenceDay, 'day')
                : dueMoment.isSameOrBefore(referenceDay, 'day');
            if (isOverdue) finOverdue.push(due);
        }

        return { tasks: { completed, overdue }, finance: { paid: finPaid, overdue: finOverdue } };
    }

    private renderGlanceTasks(parent: HTMLElement, tasks: { completed: TaskEntry[]; overdue: TaskEntry[] }): void {
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const header = card.createEl('div', { cls: 'diwa-glance-card__header' });
        header.createEl('span', { cls: 'diwa-glance-card__icon', text: '✅' });
        header.createEl('span', { cls: 'diwa-glance-card__title', text: 'TASKS' });

        const statRow = card.createEl('div', { cls: 'diwa-glance-stat-row' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--done', text: `${tasks.completed.length} done` });
        statRow.createEl('span', { cls: 'diwa-glance-stat-sep', text: '·' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--overdue', text: `${tasks.overdue.length} overdue` });

        const list = card.createEl('ul', { cls: 'diwa-glance-list' });
        tasks.completed.slice(0, 3).forEach((task) => {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--done', text: task.title });
        });
        tasks.overdue.slice(0, 3).forEach((task) => {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--overdue', text: task.title });
        });
        if (tasks.completed.length === 0 && tasks.overdue.length === 0) {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--empty', text: 'No task activity in this week' });
        }
    }


    private renderGlanceFinance(parent: HTMLElement, finance: { paid: DueEntry[]; overdue: DueEntry[] }): void {
        if (finance.paid.length === 0 && finance.overdue.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const header = card.createEl('div', { cls: 'diwa-glance-card__header' });
        header.createEl('span', { cls: 'diwa-glance-card__icon', text: '💳' });
        header.createEl('span', { cls: 'diwa-glance-card__title', text: 'FINANCE' });

        finance.paid.forEach((due) => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--paid' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '✓' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: due.title });
        });
        finance.overdue.forEach((due) => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--overdue' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '⚠' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: due.title });
        });
    }
}

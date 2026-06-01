import { App, Component, MarkdownRenderer, Notice, Platform, TFile, moment, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import { EditTaskModal } from '../modals/EditTaskModal';
import { IndexService } from '../services/IndexService';
import { VaultService } from '../services/VaultService';
import type { DiwaSettings, DueEntry, ProjectEntry, TaskEntry, ThoughtEntry } from '../types';
import {
    getCurrentWeeklyReviewWeekId,
    getThoughtReviewDay,
    getWeeklyReviewThoughtGroups,
    getWeeklyReviewWeekMeta,
    shiftWeeklyReviewWeek,
    type WeeklyReviewWeekMeta,
} from '../utils/weeklyReview';

interface GlanceData {
    tasks: { completed: TaskEntry[]; overdue: TaskEntry[] };
    projects: ProjectEntry[];
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

    constructor(private readonly host: WeeklyReviewWorkspaceHost) {}

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
        return excerpt.length > 180 ? `${excerpt.slice(0, 177)}…` : excerpt;
    }

    private getThoughtMetaPills(thought: ThoughtEntry): string[] {
        const pills: string[] = [];
        const topics = Array.isArray(thought.topic)
            ? thought.topic.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : typeof thought.topic === 'string' && thought.topic.trim().length > 0
                ? [thought.topic]
                : [];
        topics.slice(0, 2).forEach((topic) => pills.push(topic));
        thought.context.slice(0, 3).forEach((context) => pills.push(`#${context}`));
        return pills.slice(0, 4);
    }

    private renderThoughtsSection(parent: HTMLElement, weekMeta: WeeklyReviewWeekMeta): void {
        const thoughtGroups = getWeeklyReviewThoughtGroups(this.host.index.thoughtIndex.values(), weekMeta.weekId);
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
                const thoughtDay = getThoughtReviewDay(thought) ?? group.day;
                const createdMoment = moment(thought.created, ['YYYY-MM-DD HH:mm:ss', moment.ISO_8601], true);
                const card = dayList.createEl('button', {
                    cls: 'diwa-review-thought-card',
                    attr: {
                        type: 'button',
                        'aria-label': `Open thought ${thought.title || 'Untitled thought'}`,
                    },
                });
                const top = card.createEl('div', { cls: 'diwa-review-thought-card__top' });
                const titleWrap = top.createEl('div', { cls: 'diwa-review-thought-card__titles' });
                titleWrap.createEl('div', {
                    cls: 'diwa-review-thought-card__title',
                    text: thought.title?.trim() || 'Untitled thought',
                });
                titleWrap.createEl('div', {
                    cls: 'diwa-review-thought-card__path',
                    text: thought.filePath.split('/').slice(-2).join(' / '),
                });
                top.createEl('span', {
                    cls: 'diwa-review-thought-card__time',
                    text: createdMoment.isValid() ? createdMoment.format('h:mm A') : thoughtDay,
                });

                card.createEl('div', {
                    cls: 'diwa-review-thought-card__excerpt',
                    text: this.getThoughtExcerpt(thought),
                });

                const pills = this.getThoughtMetaPills(thought);
                if (pills.length > 0) {
                    const meta = card.createEl('div', { cls: 'diwa-review-thought-card__meta' });
                    pills.forEach((pill) => {
                        meta.createEl('span', { cls: 'diwa-review-thought-card__pill', text: pill });
                    });
                }

                card.addEventListener('click', () => {
                    void this.host.app.workspace.openLinkText(thought.filePath, '', Platform.isMobile ? 'tab' : 'window');
                });
            });
        });
    }

    private async renderReviewMode(container: HTMLElement, renderToken: number): Promise<void> {
        container.empty();

        const weekMeta = this.resolveSelectedWeekMeta();
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
            focus: [...(existing?.focus ?? ['', '', ''])],
        };
        while (persistedReviewDraft.focus.length < 3) persistedReviewDraft.focus.push('');
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
        let focus = [...latestReviewDraft.focus];
        while (focus.length < 3) focus.push('');
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

        this.renderGlancePanel(wrap, weekMeta);

        const body = wrap.createEl('div', { cls: 'diwa-review-body' });
        const leftCol = body.createEl('div', { cls: 'diwa-review-col--left' });
        const rightCol = body.createEl('div', { cls: 'diwa-review-col--right' });

        const { body: winsBody } = this.createSection(leftCol, 'wins', '🏆', 'THIS WEEK\'S WINS');
        this.createAutoResizeTextarea(winsBody, 'diwa-review-textarea', 'What went well this week…', wins, (value) => { wins = value; syncReviewDraft(); });

        const { body: lessonsBody } = this.createSection(leftCol, 'lessons', '📚', 'LESSONS LEARNED');
        this.createAutoResizeTextarea(lessonsBody, 'diwa-review-textarea', 'What would you do differently…', lessons, (value) => { lessons = value; syncReviewDraft(); });

        const { body: focusBody } = this.createSection(rightCol, 'focus', '🎯', 'NEXT WEEK\'S FOCUS');
        const focusList = focusBody.createEl('div', { cls: 'diwa-review-focus-list' });
        const placeholders = ['Primary focus for next week…', 'Secondary focus…', 'Third priority…'];
        for (let index = 0; index < 3; index++) {
            const item = focusList.createEl('div', { cls: 'diwa-review-focus-item' });
            item.createEl('span', { cls: 'diwa-review-focus-num', text: String(index + 1) });
            const input = item.createEl('input', {
                cls: 'diwa-review-input',
                attr: {
                    type: 'text',
                    placeholder: placeholders[index],
                    value: focus[index] || '',
                },
            }) as HTMLInputElement;
            input.addEventListener('input', () => {
                focus[index] = input.value;
                syncReviewDraft();
            });
        }

        this.renderThoughtsSection(rightCol, weekMeta);
        this.renderWeekPlanSection(wrap, weekMeta, prevWeekMeta, nextWeekDayPlans, thisWeekDayPlans, markWeekPlanDirty, renderToken, container);

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
                    const latestFocus = [...(latest?.focus ?? ['', '', ''])];
                    while (latestFocus.length < 3) latestFocus.push('');
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
                    void this.host.app.workspace.openLinkText(preview.file.path, '', Platform.isMobile ? 'tab' : 'window');
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
            { key: 'next', label: 'Next Week' },
            { key: 'this', label: 'This Week' },
        ];

        const renderPlan = () => {
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
            const activeDayPlans = activeTarget === 'this' ? thisWeekDayPlans : nextWeekDayPlans;
            const canEditDayPlans = canMutateTasks && activeTarget === 'next';
            const weekStart = anchorWeekMeta.startDate;
            const weekEnd = anchorWeekMeta.endDate;
            const taskSnapshot = getTaskSnapshot();

            const planMeta = planBody.createEl('div', { cls: 'diwa-weekplan-meta' });
            planMeta.createEl('span', {
                cls: 'diwa-review-week-label',
                text: `${activeTarget === 'this' ? 'Selected week' : 'Following week'} · ${anchorWeekMeta.label}`,
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

                const card = grid.createEl('div', { cls: 'diwa-weekplan-day' });
                const header = card.createEl('div', { cls: 'diwa-weekplan-day__header' });
                header.createEl('span', { cls: 'diwa-weekplan-day__label', text: dayLabel });
                if (dayTasks.length > 0) {
                    const countCls = dayTasks.length >= 6
                        ? 'diwa-weekplan-day__count diwa-weekplan-day__count--danger'
                        : dayTasks.length >= 4
                            ? 'diwa-weekplan-day__count diwa-weekplan-day__count--warn'
                            : 'diwa-weekplan-day__count';
                    header.createEl('span', { cls: countCls, text: String(dayTasks.length) });
                }

                const cardBody = card.createEl('div', { cls: 'diwa-weekplan-day__body' });
                const storageKey = `diwa-weekplan-collapse-${dateStr}`;
                const isCollapsed = sessionStorage.getItem(storageKey) === 'true';
                if (isCollapsed) cardBody.style.display = 'none';

                header.addEventListener('click', () => {
                    const collapsed = cardBody.style.display === 'none';
                    if (collapsed) {
                        cardBody.style.display = 'flex';
                        sessionStorage.removeItem(storageKey);
                    } else {
                        cardBody.style.display = 'none';
                        sessionStorage.setItem(storageKey, 'true');
                    }
                });

                const intentionInput = cardBody.createEl('input', {
                    cls: `diwa-weekplan-day__intention${canEditDayPlans ? '' : ' is-readonly'}`,
                    attr: {
                        type: 'text',
                        placeholder: canEditDayPlans ? 'Theme for this day…' : 'Saved day theme',
                        value: activeDayPlans[dateStr] || '',
                    },
                }) as HTMLInputElement;
                intentionInput.readOnly = !canEditDayPlans;
                intentionInput.addEventListener('input', () => {
                    if (!canEditDayPlans) return;
                    nextWeekDayPlans[dateStr] = intentionInput.value;
                    markDirty();
                });
                intentionInput.addEventListener('click', (event) => event.stopPropagation());

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
                    const actionsRow = cardBody.createEl('div', { cls: 'diwa-weekplan-actions' });
                    const assignBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-assign-btn', text: '+ Assign Task' });
                    assignBtn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.openTaskPicker(
                            cardBody,
                            dateStr,
                            () => {
                                invalidateTaskSnapshot();
                                renderPlan();
                            },
                            taskSnapshot.unscheduledOpenTasks,
                        );
                    });

                    const newTaskBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-new-btn', text: '+ New Task' });
                    newTaskBtn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const existingQuickAdd = cardBody.querySelector('.diwa-weekplan-quickadd');
                        if (existingQuickAdd) {
                            existingQuickAdd.remove();
                            return;
                        }

                        const quickAdd = cardBody.createEl('div', { cls: 'diwa-weekplan-quickadd' });
                        const quickInput = quickAdd.createEl('input', {
                            cls: 'diwa-weekplan-quickadd__input',
                            attr: { type: 'text', placeholder: 'What needs to happen this day?' },
                        }) as HTMLInputElement;
                        const submitBtn = quickAdd.createEl('button', { cls: 'diwa-weekplan-quickadd__submit', text: '↵' });

                        const doCreate = async () => {
                            const title = quickInput.value.trim();
                            if (!title) return;
                            quickInput.disabled = true;
                            submitBtn.disabled = true;
                            try {
                                await this.host.vault.createTaskFile(title, [], dateStr);
                                quickAdd.remove();
                                setTimeout(() => {
                                    if (!this.host.isRenderActive(renderToken, container)) return;
                                    invalidateTaskSnapshot();
                                    renderPlan();
                                }, 300);
                            } catch {
                                quickInput.disabled = false;
                                submitBtn.disabled = false;
                            }
                        };

                        quickInput.addEventListener('keydown', (event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void doCreate();
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                quickAdd.remove();
                            }
                        });
                        quickInput.addEventListener('click', (event) => event.stopPropagation());
                        submitBtn.addEventListener('click', (event) => {
                            event.stopPropagation();
                            void doCreate();
                        });
                        requestAnimationFrame(() => {
                            if (!this.host.isRenderActive(renderToken, container) || !quickInput.isConnected) return;
                            quickInput.focus();
                        });
                    });
                }
            }

            const totalIntentions = Object.entries(activeDayPlans)
                .filter(([date, value]) => date >= weekStart && date <= weekEnd && value.trim())
                .length;
            let totalAssigned = 0;
            for (const [dueDate, tasks] of taskSnapshot.openTasksByDue.entries()) {
                if (dueDate >= weekStart && dueDate <= weekEnd) {
                    totalAssigned += tasks.length;
                }
            }
            if (totalIntentions === 0 && totalAssigned === 0) {
                grid.createEl('div', {
                    cls: 'diwa-weekplan-empty',
                    text: canEditDayPlans
                        ? 'Start with a theme, then assign or create the 1–3 things that make each day a success.'
                        : 'No saved day themes or currently due open tasks for this anchored week.',
                });
            }
        };

        targetModes.forEach(({ key, label }) => {
            const button = targetRow.createEl('button', {
                cls: `diwa-weekplan-target-btn${this.getState().weekPlanTargetMode === key ? ' is-active' : ''}`,
                text: label,
            });
            button.addEventListener('click', () => {
                this.updateState({ weekPlanTargetMode: key });
                targetRow.querySelectorAll('.diwa-weekplan-target-btn').forEach((el) => el.classList.remove('is-active'));
                button.classList.add('is-active');
                renderPlan();
            });
        });

        renderPlan();
    }

    private openTaskPicker(
        container: HTMLElement,
        targetDate: string,
        onAssigned: () => void,
        unscheduled: TaskEntry[],
    ): void {
        const existingPicker = container.querySelector('.diwa-weekplan-picker');
        if (existingPicker) {
            existingPicker.remove();
            return;
        }

        const picker = container.createEl('div', { cls: 'diwa-weekplan-picker' });
        const searchInput = picker.createEl('input', {
            cls: 'diwa-weekplan-picker__search',
            attr: { type: 'text', placeholder: 'Search tasks…' },
        }) as HTMLInputElement;
        const list = picker.createEl('div', { cls: 'diwa-weekplan-picker__list' });

        const renderList = (query: string) => {
            list.empty();
            const normalizedQuery = query.toLowerCase().trim();
            const filtered = normalizedQuery
                ? unscheduled.filter((task) => task.title.toLowerCase().includes(normalizedQuery) || task.body.toLowerCase().includes(normalizedQuery))
                : unscheduled;

            if (filtered.length === 0) {
                list.createEl('div', {
                    cls: 'diwa-weekplan-picker__empty',
                    text: normalizedQuery ? 'No matching tasks' : 'No unscheduled tasks',
                });
                return;
            }

            filtered.slice(0, 12).forEach((task) => {
                const item = list.createEl('div', { cls: 'diwa-weekplan-picker__item' });
                item.createEl('span', { cls: 'diwa-weekplan-picker__title', text: task.title });
                if (task.priority) {
                    const badge = task.priority === 'high' ? '↑H' : task.priority === 'medium' ? '~M' : '↓L';
                    item.createEl('span', {
                        cls: `diwa-weekplan-picker__priority diwa-weekplan-picker__priority--${task.priority}`,
                        text: badge,
                    });
                }
                item.addEventListener('click', async () => {
                    picker.remove();
                    await this.host.vault.editTask(task.filePath, task.body, task.context, targetDate);
                    onAssigned();
                });
            });
        };

        searchInput.addEventListener('input', () => renderList(searchInput.value));
        renderList('');
        requestAnimationFrame(() => {
            if (searchInput.isConnected) searchInput.focus();
        });
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
            this.renderGlanceProjects(glanceBody, data.projects);
            this.renderGlanceFinance(glanceBody, data.finance);
        };
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

        const projects = Array.from(this.host.index.projectIndex.values()).filter((project) => {
            if (project.status === 'archived') return false;
            const file = this.host.app.vault.getAbstractFileByPath(project.filePath);
            if (!(file instanceof TFile)) return false;
            const modified = moment(file.stat.mtime);
            return modified.isSameOrAfter(weekStart) && modified.isSameOrBefore(weekEnd);
        });

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

        return { tasks: { completed, overdue }, projects, finance: { paid: finPaid, overdue: finOverdue } };
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

    private renderGlanceProjects(parent: HTMLElement, projects: ProjectEntry[]): void {
        if (projects.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const header = card.createEl('div', { cls: 'diwa-glance-card__header' });
        header.createEl('span', { cls: 'diwa-glance-card__icon', text: '🗂' });
        header.createEl('span', { cls: 'diwa-glance-card__title', text: 'ACTIVE PROJECTS' });

        projects.forEach((project) => {
            const row = card.createEl('div', { cls: 'diwa-glance-project-row' });
            const dot = row.createEl('span', { cls: 'diwa-glance-project-dot' });
            if (project.color) dot.style.background = project.color;
            row.createEl('span', { cls: 'diwa-glance-project-name', text: project.name });
            row.createEl('span', {
                cls: `diwa-glance-project-status diwa-glance-project-status--${project.status}`,
                text: project.status,
            });
        });
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

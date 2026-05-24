import { moment, setIcon, MarkdownRenderer, Platform, TFile, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditTaskModal } from '../modals/EditTaskModal';
import type { ProjectEntry, TaskEntry, DueEntry, WeeklyReportContext } from '../types';

interface GlanceData {
    tasks: { completed: TaskEntry[]; overdue: TaskEntry[] };
    habits: { habit: { id: string; name: string; icon: string }; count: number }[];
    projects: ProjectEntry[];
    finance: { paid: DueEntry[]; overdue: DueEntry[] };
}

export class ReviewTab extends BaseTab {
    private glanceCollapsed = false;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewMode(container);
    }

    private getWeekId(): string {
        return moment().format('YYYY-[W]WW');
    }

    private getWeekDateRange(): string {
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`;
    }

    private getWeekLabel(): string {
        const weekNum = moment().isoWeek();
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private getPrevWeekId(): string {
        return moment().subtract(1, 'week').format('YYYY-[W]WW');
    }

    private getPrevWeekLabel(): string {
        const weekNum = moment().subtract(1, 'week').isoWeek();
        const start = moment().subtract(1, 'week').startOf('isoWeek');
        const end = moment().subtract(1, 'week').endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private getHabitHighlightText(): string {
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        if (habits.length === 0) return '';
        const weekStart = moment().startOf('isoWeek');
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        const completionCounts: Map<string, number> = new Map();
        habits.forEach(h => completionCounts.set(h.id, 0));
        for (let d = 0; d < 7; d++) {
            const dateStr = moment(weekStart).add(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const completed: string[] = Array.isArray(cache?.frontmatter?.['completed']) ? cache!.frontmatter!['completed'].map(String) : [];
            completed.forEach(id => {
                if (completionCounts.has(id)) completionCounts.set(id, (completionCounts.get(id) || 0) + 1);
            });
        }
        let best: { habit: (typeof habits)[0]; count: number } | null = null;
        habits.forEach(h => {
            const count = completionCounts.get(h.id) || 0;
            if (!best || count > best.count) best = { habit: h, count };
        });
        if (!best || (best as { habit: (typeof habits)[0]; count: number }).count === 0) return '';
        const b = best as { habit: (typeof habits)[0]; count: number };
        return `**${b.habit.icon} ${b.habit.name}** — 🔥 ${b.count}/7 days this week`;
    }

    private createSection(parent: HTMLElement, id: string, emoji: string, label: string): { section: HTMLElement; body: HTMLElement; toggle: HTMLElement } {
        const section = parent.createEl('div', { cls: 'diwa-review-section' });
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
                setTimeout(() => { body.style.display = 'none'; }, 120);
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
        ta.style.height = (ta.scrollHeight || 88) + 'px';
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            onChange(ta.value);
        });
        ta.addEventListener('focus', () => {
            ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return ta;
    }

    async renderReviewMode(container: HTMLElement) {
        container.empty();

        const weekId = this.getWeekId();
        const prevWeekId = this.getPrevWeekId();
        const weekLabel = this.getWeekLabel();
        const prevWeekLabel = this.getPrevWeekLabel();
        const dateRange = this.getWeekDateRange();

        // Load existing data
        const existing = await this.vault.loadWeeklyReview(weekId);
        let wins = existing?.wins ?? '';
        let lessons = existing?.lessons ?? '';
        let focus = existing?.focus ?? ['', '', ''];
        while (focus.length < 3) focus.push('');
        let isDirty = false;

        // Initialize week plan draft from saved data or empty
        if (!this.view.weekPlanDraft) {
            this.view.weekPlanDraft = existing?.dayPlans ?? {};
        }
        const dayPlans = this.view.weekPlanDraft;

        // Restore any previously generated AI report (session-level or from saved file)
        if (existing?.aiReport && !this.view.weeklyAiReport) {
            this.view.weeklyAiReport = existing.aiReport;
        }

        const wrap = container.createEl('div', { cls: 'diwa-review-wrap' });
        wrap.setAttribute('container-type', 'inline-size');

        // ── Header ──────────────────────────────────────────────
        const header = wrap.createEl('div', { cls: 'diwa-review-header' });
        const navRow = header.createEl('div', { cls: 'diwa-review-nav-row' });
        const dirtyDot = navRow.createEl('span', { cls: 'diwa-review-dirty-dot' });
        dirtyDot.style.display = 'none';

        header.createEl('h2', { text: 'Weekly Review', cls: 'diwa-tab-title' });
        const subtitleRow = header.createEl('div', { cls: 'diwa-review-subtitle-row' });
        subtitleRow.createEl('span', { cls: 'diwa-review-week-label', text: weekLabel });
        if (existing?.saved) {
            const rel = moment(existing.saved, 'YYYY-MM-DD HH:mm:ss').fromNow();
            subtitleRow.createEl('span', { cls: 'diwa-review-saved-badge', text: `Saved ${rel}` });
        }

        const markDirty = () => {
            if (!isDirty) { isDirty = true; dirtyDot.style.display = 'inline-block'; }
        };

        // ── Week at a Glance ─────────────────────────────────────
        this.renderGlancePanel(wrap, weekId);

        // ── Body: two-column on desktop ──────────────────────────
        const body = wrap.createEl('div', { cls: 'diwa-review-body' });
        const leftCol = body.createEl('div', { cls: 'diwa-review-col--left' });
        const rightCol = body.createEl('div', { cls: 'diwa-review-col--right' });

        // Wins section
        const { body: winsBody } = this.createSection(leftCol, 'wins', '🏆', 'THIS WEEK\'S WINS');
        this.createAutoResizeTextarea(winsBody, 'diwa-review-textarea', 'What went well this week…', wins, v => { wins = v; markDirty(); });

        // Lessons section
        const { body: lessonsBody } = this.createSection(leftCol, 'lessons', '📚', 'LESSONS LEARNED');
        this.createAutoResizeTextarea(lessonsBody, 'diwa-review-textarea', 'What would you do differently…', lessons, v => { lessons = v; markDirty(); });

        // Focus section
        const { body: focusBody } = this.createSection(rightCol, 'focus', '🎯', 'NEXT WEEK\'S FOCUS');
        const focusList = focusBody.createEl('div', { cls: 'diwa-review-focus-list' });
        const placeholders = ['Primary focus for next week…', 'Secondary focus…', 'Third priority…'];
        const focusInputs: HTMLInputElement[] = [];
        for (let i = 0; i < 3; i++) {
            const item = focusList.createEl('div', { cls: 'diwa-review-focus-item' });
            item.createEl('span', { cls: 'diwa-review-focus-num', text: String(i + 1) });
            const inp = item.createEl('input', { cls: 'diwa-review-input', attr: { type: 'text', placeholder: placeholders[i], value: focus[i] || '' } }) as HTMLInputElement;
            inp.addEventListener('input', () => { focus[i] = inp.value; markDirty(); });
            focusInputs.push(inp);
        }

        // Habit Highlight section (read-only)
        const { body: habitBody } = this.createSection(rightCol, 'habit-highlight', '💡', 'HABIT HIGHLIGHT');
        const highlightText = this.getHabitHighlightText();
        if (highlightText) {
            const hlCard = habitBody.createEl('div', { cls: 'diwa-review-habit-highlight' });
            const habits = (this.settings.habits || []).filter(h => !h.archived);
            const found = habits.find(h => highlightText.includes(h.name));
            hlCard.createEl('span', { cls: 'diwa-review-habit-highlight-emoji', text: found?.icon || '💡' });
            const hlInfo = hlCard.createEl('div', { cls: 'diwa-review-habit-highlight-info' });
            hlInfo.createEl('div', { cls: 'diwa-review-habit-name', text: found?.name || 'Top Habit' });
            hlInfo.createEl('div', { cls: 'diwa-review-habit-streak', text: highlightText.split('—')[1]?.trim() || '' });
        } else {
            habitBody.createEl('div', {
                cls: 'diwa-review-habit-highlight--empty',
                text: 'No habit data yet — complete habits to see highlights'
            });
        }

        // ── Next Week Plan Section ──────────────────────────────────
        this._renderWeekPlanSection(wrap, dayPlans, markDirty, () => ({ wins, lessons, focus }));

        // ── Save Row ─────────────────────────────────────────────
        const saveRow = wrap.createEl('div', { cls: 'diwa-review-save-row' });
        const kbdHint = saveRow.createEl('span', { cls: 'diwa-review-kbd-hint' });
        kbdHint.textContent = Platform.isMacOS ? '⌘↵ to save' : 'Ctrl+↵ to save';
        const saveBtn = saveRow.createEl('button', { cls: 'diwa-review-save-btn', text: '💾  Save Review' });

        const doSave = async () => {
            if (saveBtn.disabled) return;
            saveBtn.textContent = 'Saving…';
            saveBtn.disabled = true;
            try {
                await this.vault.saveWeeklyReview(weekId, dateRange, wins, lessons, focus, highlightText, this.view.weeklyAiReport ?? undefined, dayPlans);
                isDirty = false;
                dirtyDot.style.display = 'none';
                saveBtn.textContent = '✓  Saved';
                saveBtn.classList.add('is-saved');
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-saved');
                    saveBtn.disabled = false;
                }, 1800);
            } catch {
                saveBtn.textContent = '⚠ Save Failed — Retry';
                saveBtn.classList.add('is-error');
                saveBtn.disabled = false;
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-error');
                }, 3000);
            }
        };

        saveBtn.addEventListener('click', doSave);
        wrap.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
        });

        // ── AI Weekly Brief ───────────────────────────────────────
        this._renderAiSection(wrap, weekId, dateRange, () => ({ wins, lessons, focus }), doSave);

        // ── Previous Week Card ────────────────────────────────────
        const prevCard = wrap.createEl('div', { cls: 'diwa-review-prev-card is-collapsed' });
        const prevTrigger = prevCard.createEl('div', { cls: 'diwa-review-prev-card__trigger' });
        const prevLeft = prevTrigger.createEl('div', { cls: 'diwa-review-prev-card__left' });
        prevLeft.createEl('span', { cls: 'diwa-section-label', text: '📅 PREVIOUS WEEK' });
        prevLeft.createEl('span', { cls: 'diwa-review-prev-week-chip', text: prevWeekLabel });
        const prevChevron = prevTrigger.createEl('span', { cls: 'diwa-review-prev-card__chevron' });
        setIcon(prevChevron, 'chevron-down');

        const prevBody = prevCard.createEl('div', { cls: 'diwa-review-prev-card__body' });
        let prevLoaded = false;

        prevTrigger.addEventListener('click', async () => {
            const isCollapsed = prevCard.classList.contains('is-collapsed');
            prevCard.classList.toggle('is-collapsed');
            if (isCollapsed && !prevLoaded) {
                prevLoaded = true;
                const reviewsRoot = (this.settings.reviewsFolder || '000 Bin/DIWA Reviews').trim();
                const prevFile = this.app.vault.getAbstractFileByPath(`${reviewsRoot}/Weekly/${prevWeekId}.md`);
                if (prevFile instanceof TFile) {
                    prevBody.createEl('span', { cls: 'diwa-review-readonly-badge', text: 'READ-ONLY' });
                    const rendered = prevBody.createEl('div', { cls: 'diwa-review-prev-content' });
                    const content = await this.app.vault.read(prevFile);
                    const bodyOnly = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                    await MarkdownRenderer.render(this.app, bodyOnly, rendered, prevFile.path, this.view);
                    const openBtn = prevBody.createEl('button', { cls: 'diwa-btn-secondary diwa-review-prev-open-btn', text: 'Open in Vault →' });
                    openBtn.addEventListener('click', () => {
                        this.app.workspace.openLinkText(prevFile.path, '', Platform.isMobile ? 'tab' : 'window');
                    });
                } else {
                    prevBody.createEl('div', { text: 'No review found for last week.', cls: 'diwa-review-prev-empty' });
                }
            }
        });
    }

    // ── Next Week Plan ────────────────────────────────────────────────
    private _renderWeekPlanSection(parent: HTMLElement, dayPlans: Record<string, string>, markDirty: () => void, getFormData: () => { wins: string; lessons: string; focus: string[] }): void {
        const { body: planBody } = this.createSection(parent, 'week-plan', '📅', 'NEXT WEEK PLAN');

        // Week target toggle
        const targetRow = planBody.createEl('div', { cls: 'diwa-weekplan-target-row' });
        const targetModes: Array<{ key: 'next' | 'this'; label: string }> = [
            { key: 'next', label: 'Next Week' },
            { key: 'this', label: 'This Week' },
        ];

        const renderPlan = () => {
            // Clear everything below target row
            const children = Array.from(planBody.children);
            children.forEach(c => { if (c !== targetRow) c.remove(); });

            const baseWeek = this.view.weekPlanTargetMode === 'this'
                ? moment().startOf('isoWeek')
                : moment().add(1, 'week').startOf('isoWeek');

            const grid = planBody.createEl('div', { cls: 'diwa-weekplan-grid' });

            const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            for (let d = 0; d < 7; d++) {
                const dayMoment = baseWeek.clone().add(d, 'days');
                const dateStr = dayMoment.format('YYYY-MM-DD');
                const dayLabel = `${dayKeys[d]} · ${dayMoment.format('MMM D')}`;

                // Get tasks due this day
                const dayTasks = Array.from(this.index.taskIndex.values())
                    .filter(t => t.status === 'open' && t.due === dateStr);

                const card = grid.createEl('div', { cls: 'diwa-weekplan-day' });

                // Header
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

                // Collapsible body
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

                // Intention input
                const intentionInput = cardBody.createEl('input', {
                    cls: 'diwa-weekplan-day__intention',
                    attr: {
                        type: 'text',
                        placeholder: 'Theme for this day…',
                        value: dayPlans[dateStr] || '',
                    }
                }) as HTMLInputElement;
                intentionInput.addEventListener('input', () => {
                    dayPlans[dateStr] = intentionInput.value;
                    markDirty();
                });
                // Prevent header toggle when focusing input
                intentionInput.addEventListener('click', (e) => e.stopPropagation());

                // Task list
                if (dayTasks.length > 0) {
                    const taskList = cardBody.createEl('div', { cls: 'diwa-weekplan-day__tasks' });
                    const now = Date.now();
                    dayTasks.forEach(t => {
                        const taskRow = taskList.createEl('div', { cls: 'diwa-weekplan-task' });
                        const checkbox = taskRow.createEl('input', {
                            cls: 'diwa-weekplan-task__check',
                            attr: { type: 'checkbox' }
                        }) as HTMLInputElement;
                        taskRow.createEl('span', { cls: 'diwa-weekplan-task__title', text: t.title });
                        if (t.priority) {
                            const priBadge = t.priority === 'high' ? '↑H' : t.priority === 'medium' ? '~M' : '↓L';
                            taskRow.createEl('span', { cls: `diwa-weekplan-task__priority diwa-weekplan-task__priority--${t.priority}`, text: priBadge });
                        }
                        // Show edit icon for recently created tasks (< 120s)
                        const createdMs = moment(t.created, 'YYYY-MM-DD HH:mm:ss').valueOf();
                        if (now - createdMs < 120_000) {
                            const editIcon = taskRow.createEl('span', { cls: 'diwa-weekplan-task__edit', text: '⚙', attr: { title: 'Edit details' } });
                            editIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                new EditTaskModal(this.view.app, t, this.vault, this.index, () => renderPlan()).open();
                            });
                        }
                        checkbox.addEventListener('change', async () => {
                            await this.vault.editTask(t.filePath, t.body, t.context, t.due, { status: 'done' });
                            renderPlan();
                        });
                    });
                }

                // Action buttons row
                const actionsRow = cardBody.createEl('div', { cls: 'diwa-weekplan-actions' });

                // Assign existing task button
                const assignBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-assign-btn', text: '+ Assign Task' });
                assignBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._openTaskPicker(cardBody, assignBtn, dateStr, renderPlan);
                });

                // New task button (Day-Scoped Quick Add)
                const newTaskBtn = actionsRow.createEl('button', { cls: 'diwa-weekplan-new-btn', text: '+ New Task' });
                newTaskBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Toggle off if already open
                    const existing = cardBody.querySelector('.diwa-weekplan-quickadd');
                    if (existing) { existing.remove(); return; }

                    const quickAdd = cardBody.createEl('div', { cls: 'diwa-weekplan-quickadd' });
                    const quickInput = quickAdd.createEl('input', {
                        cls: 'diwa-weekplan-quickadd__input',
                        attr: { type: 'text', placeholder: 'What needs to happen this day?' }
                    }) as HTMLInputElement;
                    const submitBtn = quickAdd.createEl('button', { cls: 'diwa-weekplan-quickadd__submit', text: '↵' });

                    const doCreate = async () => {
                        const title = quickInput.value.trim();
                        if (!title) return;
                        quickInput.disabled = true;
                        submitBtn.disabled = true;
                        try {
                            await this.vault.createTaskFile(title, [], dateStr);
                            quickAdd.remove();
                            // Brief delay for index to catch up via file watcher
                            setTimeout(() => renderPlan(), 300);
                        } catch (err: any) {
                            quickInput.disabled = false;
                            submitBtn.disabled = false;
                        }
                    };

                    quickInput.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') { ev.preventDefault(); doCreate(); }
                        if (ev.key === 'Escape') { ev.preventDefault(); quickAdd.remove(); }
                    });
                    quickInput.addEventListener('click', (ev) => ev.stopPropagation());
                    submitBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doCreate(); });
                    requestAnimationFrame(() => quickInput.focus());
                });
            }

            // Empty state
            const totalIntentions = Object.values(dayPlans).filter(v => v.trim()).length;
            const totalAssigned = Array.from(this.index.taskIndex.values())
                .filter(t => {
                    if (t.status !== 'open' || !t.due) return false;
                    const d = moment(t.due, 'YYYY-MM-DD');
                    return d.isSameOrAfter(baseWeek) && d.isBefore(baseWeek.clone().add(7, 'days'));
                }).length;
            if (totalIntentions === 0 && totalAssigned === 0) {
                grid.createEl('div', { cls: 'diwa-weekplan-empty', text: 'Start with a theme, then assign or create the 1–3 things that make each day a success.' });
            }

            // AI Week Architect button
            const aiRow = planBody.createEl('div', { cls: 'diwa-weekplan-ai-row' });
            const aiBtn = aiRow.createEl('button', { cls: 'diwa-weekplan-ai-btn', text: '✨ AI Week Architect' });
            aiBtn.addEventListener('click', async () => {
                aiBtn.disabled = true;
                aiBtn.textContent = '⏳ Planning…';

                const { wins, lessons, focus } = getFormData();
                const weekId = this.getWeekId();
                const dateRange = this.getWeekDateRange();
                const ctx = this._buildWeeklyReportContext(weekId, dateRange, wins, lessons, focus);

                // Attach open tasks with metadata for AI prompt
                const openTasks = Array.from(this.index.taskIndex.values())
                    .filter(t => t.status === 'open' && !t.due)
                    .map(t => ({ title: t.title, priority: t.priority, energy: t.energy, project: t.project }));
                (ctx as any)._openTasks = openTasks;

                const targetDates: string[] = [];
                for (let d = 0; d < 7; d++) {
                    targetDates.push(baseWeek.clone().add(d, 'days').format('YYYY-MM-DD'));
                }

                try {
                    const result = await this.ai.generateWeekPlan(ctx, targetDates);
                    this._showAiStagingPanel(planBody, result, dayPlans, markDirty, renderPlan);
                    aiBtn.textContent = '✨ AI Week Architect';
                    aiBtn.disabled = false;
                } catch (e: any) {
                    aiBtn.textContent = '⚠ ' + (e?.message || 'Failed');
                    aiBtn.disabled = false;
                    setTimeout(() => { aiBtn.textContent = '✨ AI Week Architect'; }, 3000);
                }
            });
        };

        // Render toggle buttons
        targetModes.forEach(({ key, label }) => {
            const btn = targetRow.createEl('button', {
                cls: `diwa-weekplan-target-btn${this.view.weekPlanTargetMode === key ? ' is-active' : ''}`,
                text: label,
            });
            btn.addEventListener('click', () => {
                this.view.weekPlanTargetMode = key;
                // Re-render toggle active states
                targetRow.querySelectorAll('.diwa-weekplan-target-btn').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                renderPlan();
            });
        });

        renderPlan();
    }

    private _openTaskPicker(container: HTMLElement, anchorBtn: HTMLElement, targetDate: string, onAssigned: () => void): void {
        // If picker already exists, toggle off
        const existingPicker = container.querySelector('.diwa-weekplan-picker');
        if (existingPicker) { existingPicker.remove(); return; }

        const unscheduled = Array.from(this.index.taskIndex.values())
            .filter(t => t.status === 'open' && !t.due)
            .sort((a, b) => {
                const priOrder = { high: 0, medium: 1, low: 2 };
                const aPri = priOrder[a.priority || 'low'] ?? 2;
                const bPri = priOrder[b.priority || 'low'] ?? 2;
                if (aPri !== bPri) return aPri - bPri;
                return b.lastUpdate - a.lastUpdate;
            });

        const picker = container.createEl('div', { cls: 'diwa-weekplan-picker' });

        // Search input
        const searchInput = picker.createEl('input', {
            cls: 'diwa-weekplan-picker__search',
            attr: { type: 'text', placeholder: 'Search tasks…' }
        }) as HTMLInputElement;

        const list = picker.createEl('div', { cls: 'diwa-weekplan-picker__list' });

        const renderList = (query: string) => {
            list.empty();
            const q = query.toLowerCase().trim();
            const filtered = q
                ? unscheduled.filter(t => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q))
                : unscheduled;

            if (filtered.length === 0) {
                list.createEl('div', { cls: 'diwa-weekplan-picker__empty', text: q ? 'No matching tasks' : 'No unscheduled tasks' });
                return;
            }

            filtered.slice(0, 12).forEach(t => {
                const item = list.createEl('div', { cls: 'diwa-weekplan-picker__item' });
                item.createEl('span', { cls: 'diwa-weekplan-picker__title', text: t.title });
                if (t.priority) {
                    const priBadge = t.priority === 'high' ? '↑H' : t.priority === 'medium' ? '~M' : '↓L';
                    item.createEl('span', { cls: `diwa-weekplan-picker__priority diwa-weekplan-picker__priority--${t.priority}`, text: priBadge });
                }
                item.addEventListener('click', async () => {
                    picker.remove();
                    await this.vault.editTask(t.filePath, t.body, t.context, targetDate);
                    onAssigned();
                });
            });
        };

        searchInput.addEventListener('input', () => renderList(searchInput.value));
        renderList('');

        // Auto-focus search
        requestAnimationFrame(() => searchInput.focus());
    }

    private _showAiStagingPanel(
        container: HTMLElement,
        result: Record<string, { intention: string; tasks: string[] }>,
        dayPlans: Record<string, string>,
        markDirty: () => void,
        onDone: () => void
    ): void {
        // Remove existing panel
        container.querySelector('.diwa-weekplan-staging')?.remove();

        const panel = container.createEl('div', { cls: 'diwa-weekplan-staging' });
        const header = panel.createEl('div', { cls: 'diwa-weekplan-staging__header' });
        header.createEl('span', { cls: 'diwa-weekplan-staging__title', text: '✨ AI Suggestions' });

        const applyAllBtn = header.createEl('button', { cls: 'diwa-weekplan-staging__apply-all', text: 'Apply All' });
        const dismissAllBtn = header.createEl('button', { cls: 'diwa-weekplan-staging__dismiss', text: '✕' });

        const body = panel.createEl('div', { cls: 'diwa-weekplan-staging__body' });

        // Track accepted state per item
        const accepted: Map<string, { intention: boolean; tasks: Set<string> }> = new Map();

        const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        Object.entries(result).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, plan]) => {
            const dayMoment = moment(date, 'YYYY-MM-DD');
            const dayIdx = dayMoment.isoWeekday() - 1;
            const dayLabel = dayIdx >= 0 && dayIdx < 7 ? `${dayKeys[dayIdx]} · ${dayMoment.format('MMM D')}` : date;

            accepted.set(date, { intention: false, tasks: new Set() });

            const dayRow = body.createEl('div', { cls: 'diwa-weekplan-staging__day' });
            dayRow.createEl('div', { cls: 'diwa-weekplan-staging__day-label', text: dayLabel });

            if (plan.intention) {
                const intentionRow = dayRow.createEl('div', { cls: 'diwa-weekplan-staging__item' });
                intentionRow.createEl('span', { cls: 'diwa-weekplan-staging__item-text', text: `🎯 ${plan.intention}` });
                const acceptBtn = intentionRow.createEl('button', { cls: 'diwa-weekplan-staging__accept', text: '✓' });
                acceptBtn.addEventListener('click', () => {
                    accepted.get(date)!.intention = true;
                    acceptBtn.classList.add('is-accepted');
                    acceptBtn.disabled = true;
                });
            }

            if (plan.tasks && plan.tasks.length > 0) {
                plan.tasks.forEach(taskTitle => {
                    const taskRow = dayRow.createEl('div', { cls: 'diwa-weekplan-staging__item' });
                    taskRow.createEl('span', { cls: 'diwa-weekplan-staging__item-text', text: `○ ${taskTitle}` });
                    const acceptBtn = taskRow.createEl('button', { cls: 'diwa-weekplan-staging__accept', text: '✓' });
                    acceptBtn.addEventListener('click', () => {
                        accepted.get(date)!.tasks.add(taskTitle);
                        acceptBtn.classList.add('is-accepted');
                        acceptBtn.disabled = true;
                    });
                });
            }
        });

        const applyAccepted = async () => {
            // Apply intentions
            for (const [date, state] of accepted) {
                if (state.intention && result[date]?.intention) {
                    dayPlans[date] = result[date].intention;
                }
            }

            // Apply task assignments
            const allTasks = Array.from(this.index.taskIndex.values());
            for (const [date, state] of accepted) {
                for (const taskTitle of state.tasks) {
                    const match = allTasks.find(t => t.status === 'open' && !t.due && t.title === taskTitle);
                    if (match) {
                        await this.vault.editTask(match.filePath, match.body, match.context, date);
                    }
                }
            }

            markDirty();
            panel.remove();
            onDone();
        };

        applyAllBtn.addEventListener('click', async () => {
            // Mark everything accepted
            for (const [date, state] of accepted) {
                state.intention = true;
                if (result[date]?.tasks) result[date].tasks.forEach(t => state.tasks.add(t));
            }
            await applyAccepted();
        });

        dismissAllBtn.addEventListener('click', () => panel.remove());

        // Add an "Apply Selected" button at the bottom
        const footer = panel.createEl('div', { cls: 'diwa-weekplan-staging__footer' });
        const applySelectedBtn = footer.createEl('button', { cls: 'diwa-weekplan-staging__apply-selected', text: 'Apply Selected' });
        applySelectedBtn.addEventListener('click', applyAccepted);
    }

    private _buildWeeklyReportContext(weekId: string, dateRange: string, wins: string, lessons: string, focus: string[]): WeeklyReportContext {
        const weekStart = moment().startOf('isoWeek');
        const weekEnd = moment().endOf('isoWeek');

        const allTasks = Array.from(this.index.taskIndex.values());
        const completedTasks = allTasks
            .filter(t => {
                if (t.status !== 'done') return false;
                const mod = moment(t.modified, 'YYYY-MM-DD HH:mm:ss');
                return mod.isSameOrAfter(weekStart) && mod.isSameOrBefore(weekEnd);
            })
            .map(t => t.title || t.body.split('\n')[0])
            .slice(0, 15);

        const overdueTasks = allTasks
            .filter(t => t.status === 'open' && !!t.due && moment(t.due, 'YYYY-MM-DD').isBefore(moment(), 'day'))
            .map(t => t.title || t.body.split('\n')[0])
            .slice(0, 8);

        const habits = (this.settings.habits || []).filter(h => !h.archived);
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        const habitCounts: Map<string, number> = new Map();
        habits.forEach(h => habitCounts.set(h.id, 0));
        for (let d = 0; d < 7; d++) {
            const dateStr = moment(weekStart).add(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const done: string[] = Array.isArray(cache?.frontmatter?.['completed'])
                ? cache!.frontmatter!['completed'].map(String) : [];
            done.forEach(id => { if (habitCounts.has(id)) habitCounts.set(id, (habitCounts.get(id) || 0) + 1); });
        }
        const habitData = habits.map(h => ({ name: h.name, icon: h.icon, count: habitCounts.get(h.id) || 0 }));

        const activeProjects = Array.from(this.index.projectIndex.values())
            .filter(p => p.status !== 'archived' && p.status !== 'completed')
            .map(p => `${p.name} (${p.status})${p.goal ? ': ' + p.goal : ''}`)
            .slice(0, 6);

        const recentThoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => {
                const created = moment(t.created, 'YYYY-MM-DD HH:mm:ss');
                return created.isSameOrAfter(weekStart) && created.isSameOrBefore(weekEnd);
            })
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 10)
            .map(t => t.body.split('\n')[0].substring(0, 120));

        return {
            weekId,
            dateRange,
            wins,
            lessons,
            focus,
            habitData,
            completedTasks,
            overdueTasks,
            activeProjects,
            weeklyGoals: this.settings.weeklyGoals || [],
            northStarGoals: this.settings.northStarGoals || [],
            recentThoughts
        };
    }

    private _renderAiSection(
        parent: HTMLElement,
        weekId: string,
        dateRange: string,
        getFormData: () => { wins: string; lessons: string; focus: string[] },
        doSave: () => Promise<void>
    ): void {
        const section = parent.createEl('div', { cls: 'diwa-review-ai-section' });
        const sectionHeader = section.createEl('div', { cls: 'diwa-review-ai-header' });
        const titleEl = sectionHeader.createEl('span', { cls: 'diwa-review-ai-title' });
        setIcon(titleEl.createEl('span', { cls: 'diwa-review-ai-title-icon' }), 'lucide-sparkles');
        titleEl.createEl('span', { text: 'AI Weekly Brief' });

        const actionsEl = sectionHeader.createEl('div', { cls: 'diwa-review-ai-actions' });

        const resultCard = section.createEl('div', { cls: 'diwa-review-ai-card' });

        const showResult = (report: string) => {
            resultCard.removeClass('is-empty');
            resultCard.empty();
            const content = resultCard.createEl('div', { cls: 'diwa-review-ai-content' });
            MarkdownRenderer.render(this.app, report, content, '', this.view);
            this.hookInternalLinks(content, '');
        };

        const showLoading = () => {
            resultCard.removeClass('is-empty');
            resultCard.empty();
            const loadingEl = resultCard.createEl('div', { cls: 'diwa-review-ai-loading' });
            loadingEl.createEl('span', { cls: 'diwa-ai-dot' });
            loadingEl.createEl('span', { cls: 'diwa-ai-dot' });
            loadingEl.createEl('span', { cls: 'diwa-ai-dot' });
        };

        const showError = (msg: string) => {
            resultCard.removeClass('is-empty');
            resultCard.empty();
            resultCard.createEl('div', { cls: 'diwa-review-ai-error', text: `⚠ ${msg}` });
        };

        // Build action buttons — rebuilt after generate
        const buildActions = (hasReport: boolean) => {
            actionsEl.empty();

            if (hasReport) {
                const copyBtn = actionsEl.createEl('button', { cls: 'diwa-review-ai-action-btn', text: 'Copy' });
                setIcon(copyBtn.createEl('span', { cls: 'diwa-review-ai-btn-icon' }), 'lucide-copy');
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(this.view.weeklyAiReport || '');
                    } catch {
                    }
                });

                const saveBtn = actionsEl.createEl('button', { cls: 'diwa-review-ai-action-btn', text: 'Save to Review' });
                setIcon(saveBtn.createEl('span', { cls: 'diwa-review-ai-btn-icon' }), 'lucide-save');
                saveBtn.addEventListener('click', async () => {
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving…';
                    try {
                        await doSave();
                        saveBtn.textContent = '✓ Saved';
                        setTimeout(() => {
                            saveBtn.textContent = 'Save to Review';
                            saveBtn.disabled = false;
                        }, 1800);
                    } catch {
                        saveBtn.textContent = '⚠ Failed';
                        saveBtn.disabled = false;
                    }
                });
            }

            const genBtn = actionsEl.createEl('button', { cls: 'diwa-review-ai-gen-btn', text: hasReport ? '↺ Regenerate' : '✨ Generate AI Brief' });
            genBtn.addEventListener('click', async () => {
                genBtn.disabled = true;
                const { wins, lessons, focus } = getFormData();
                const ctx = this._buildWeeklyReportContext(weekId, dateRange, wins, lessons, focus);
                showLoading();
                try {
                    const report = await this.ai.generateWeeklyReport(ctx);
                    this.view.weeklyAiReport = report;
                    showResult(report);
                    buildActions(true);
                } catch (e: any) {
                    showError(e?.message || 'Generation failed');
                    buildActions(false);
                } finally {
                    genBtn.disabled = false;
                }
            });
        };

        // Initial state — restore if we have a cached report
        if (this.view.weeklyAiReport) {
            showResult(this.view.weeklyAiReport);
            buildActions(true);
        } else {
            resultCard.classList.add('is-empty');
            buildActions(false);
        }
    }

    private renderGlancePanel(parent: HTMLElement, weekId: string): void {
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
            const data = this.computeGlanceData(weekId);
            this.renderGlanceTasks(glanceBody, data.tasks);
            this.renderGlanceHabits(glanceBody, data.habits);
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

    private computeGlanceData(weekId: string): GlanceData {
        const today = moment();
        const weekStart = moment().startOf('isoWeek');
        const weekEnd = moment().endOf('isoWeek');

        // Tasks
        const allTasks = Array.from(this.index.taskIndex.values());
        const completed = allTasks.filter(t => {
            if (t.status !== 'done') return false;
            const mod = moment(t.modified, 'YYYY-MM-DD HH:mm:ss');
            return mod.isSameOrAfter(weekStart) && mod.isSameOrBefore(weekEnd);
        });
        const overdue = allTasks.filter(t => {
            if (t.status !== 'open' || !t.due) return false;
            return moment(t.due, 'YYYY-MM-DD').isBefore(today, 'day');
        });

        // Habits
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        const counts: Map<string, number> = new Map();
        habits.forEach(h => counts.set(h.id, 0));
        for (let d = 0; d < 7; d++) {
            const dateStr = moment(weekStart).add(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const done: string[] = Array.isArray(cache?.frontmatter?.['completed'])
                ? cache!.frontmatter!['completed'].map(String) : [];
            done.forEach(id => { if (counts.has(id)) counts.set(id, (counts.get(id) || 0) + 1); });
        }
        const habitsData = habits.map(h => ({ habit: h, count: counts.get(h.id) || 0 }));

        // Projects active this week
        const projects = Array.from(this.index.projectIndex.values()).filter(p => {
            if (p.status === 'archived') return false;
            const file = this.app.vault.getAbstractFileByPath(p.filePath);
            if (!(file instanceof TFile)) return false;
            return moment(file.stat.mtime).isSameOrAfter(weekStart);
        });

        // Finance
        const allDues = Array.from(this.index.dueIndex.values());
        const finPaid = allDues.filter(d => {
            if (!d.lastPayment) return false;
            const lp = moment(d.lastPayment, 'YYYY-MM-DD');
            return lp.isSameOrAfter(weekStart) && lp.isSameOrBefore(weekEnd);
        });
        const paidPaths = new Set(finPaid.map(d => d.path));
        const finOverdue = allDues.filter(d => {
            if (paidPaths.has(d.path)) return false;
            if (!d.dueMoment) return false;
            return moment(d.dueMoment).isBefore(today, 'day');
        });

        return { tasks: { completed, overdue }, habits: habitsData, projects, finance: { paid: finPaid, overdue: finOverdue } };
    }

    private renderGlanceTasks(parent: HTMLElement, tasks: { completed: TaskEntry[]; overdue: TaskEntry[] }): void {
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '✅' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'TASKS' });

        const statRow = card.createEl('div', { cls: 'diwa-glance-stat-row' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--done', text: `${tasks.completed.length} done` });
        statRow.createEl('span', { cls: 'diwa-glance-stat-sep', text: '·' });
        statRow.createEl('span', { cls: 'diwa-glance-stat diwa-glance-stat--overdue', text: `${tasks.overdue.length} overdue` });

        const list = card.createEl('ul', { cls: 'diwa-glance-list' });
        tasks.completed.slice(0, 6).forEach(t => {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--done', text: t.title });
        });
        if (tasks.completed.length === 0 && tasks.overdue.length === 0) {
            list.createEl('li', { cls: 'diwa-glance-item diwa-glance-item--empty', text: 'No task activity this week' });
        }
    }

    private renderGlanceHabits(parent: HTMLElement, habits: { habit: { id: string; name: string; icon: string }; count: number }[]): void {
        if (habits.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '🔁' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'HABITS' });

        habits.forEach(({ habit, count }) => {
            const row = card.createEl('div', { cls: 'diwa-glance-habit-row' });
            row.createEl('span', { cls: 'diwa-glance-habit-icon', text: habit.icon });
            row.createEl('span', { cls: 'diwa-glance-habit-name', text: habit.name });
            const barWrap = row.createEl('div', { cls: 'diwa-glance-habit-bar' });
            const fill = barWrap.createEl('div', { cls: 'diwa-glance-habit-fill' });
            fill.style.width = `${Math.round((count / 7) * 100)}%`;
            row.createEl('span', { cls: 'diwa-glance-habit-count', text: `${count}/7` });
        });
    }

    private renderGlanceProjects(parent: HTMLElement, projects: ProjectEntry[]): void {
        if (projects.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '🗂' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'ACTIVE PROJECTS' });

        projects.forEach(p => {
            const row = card.createEl('div', { cls: 'diwa-glance-project-row' });
            const dot = row.createEl('span', { cls: 'diwa-glance-project-dot' });
            if (p.color) dot.style.background = p.color;
            row.createEl('span', { cls: 'diwa-glance-project-name', text: p.name });
            row.createEl('span', { cls: `diwa-glance-project-status diwa-glance-project-status--${p.status}`, text: p.status });
        });
    }

    private renderGlanceFinance(parent: HTMLElement, finance: { paid: DueEntry[]; overdue: DueEntry[] }): void {
        if (finance.paid.length === 0 && finance.overdue.length === 0) return;
        const card = parent.createEl('div', { cls: 'diwa-glance-card' });
        const hdr = card.createEl('div', { cls: 'diwa-glance-card__header' });
        hdr.createEl('span', { cls: 'diwa-glance-card__icon', text: '💳' });
        hdr.createEl('span', { cls: 'diwa-glance-card__title', text: 'FINANCE' });

        finance.paid.forEach(d => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--paid' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '✓' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: d.title });
        });
        finance.overdue.forEach(d => {
            const row = card.createEl('div', { cls: 'diwa-glance-finance-row diwa-glance-finance-row--overdue' });
            row.createEl('span', { cls: 'diwa-glance-finance-icon', text: '⚠' });
            row.createEl('span', { cls: 'diwa-glance-finance-name', text: d.title });
        });
    }
}




import { App, Modal, Notice, Platform, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import { isTablet, parseNaturalDate } from '../utils';
import { attachMobileSheetViewportBehavior } from '../utils/mobileSheetViewport';

type TaskTarget = 'backlog' | 'active' | 'focus';
type TaskPriority = 'high' | 'medium' | 'low' | null;

const TARGET_META: Record<TaskTarget, {
    label: string;
    description: string;
    footerLabel: string;
    footerHint: string;
    cta: string;
}> = {
    backlog: {
        label: 'Backlog',
        description: 'Park it for later planning.',
        footerLabel: 'Backlog keeps new work ready for later review.',
        footerHint: 'Best when you want to capture fast and sort it out later.',
        cta: 'Add to Backlog',
    },
    active: {
        label: 'Active',
        description: 'Move it into the work queue now.',
        footerLabel: 'Active makes this part of the current workload.',
        footerHint: 'Use this when the task should already be in motion.',
        cta: 'Add to Active',
    },
    focus: {
        label: 'Focus',
        description: 'Pin it for immediate attention.',
        footerLabel: 'Focus highlights this task right away.',
        footerHint: 'Great for the one thing that needs your eyes next.',
        cta: 'Add to Focus',
    },
};

export interface FastTaskCapturePayload {
    text: string;
    contexts: string[];
    dueDate: string | null;
    priority: TaskPriority;
    project: string | null;
    target: TaskTarget;
    status: 'open' | 'waiting';
    focus: boolean;
}

interface ParsedCapture {
    cleanText: string;
    contexts: string[];
    dueDate: string | null;
    priority: TaskPriority;
    project: string | null;
}

interface CaptureOverrides {
    project: 'auto' | 'none' | string;
    due: string;
    priority: 'auto' | 'none' | 'high' | 'medium' | 'low';
}

type AdvancedLayout = 'desktop' | 'mobile';

export class FastTaskCaptureModal extends Modal {
    private inputEl!: HTMLTextAreaElement;
    private chipsEl!: HTMLElement;
    private advancedEl!: HTMLElement;
    private createBtn!: HTMLButtonElement;
    private errorEl: HTMLElement | null = null;
    private footerLabelEl: HTMLElement | null = null;
    private footerHintEl: HTMLElement | null = null;
    private advancedToggleBtn: HTMLButtonElement | null = null;
    private selectedTarget: TaskTarget = 'backlog';
    private overrides: CaptureOverrides = {
        project: 'auto',
        due: '',
        priority: 'auto',
    };
    private targetButtons = new Map<TaskTarget, HTMLButtonElement>();
    private isMobileSheet = false;
    private saving = false;
    private viewportCleanup: (() => void) | null = null;
    private focusTimer: number | null = null;

    constructor(
        app: App,
        private plugin: DiwaPlugin,
        private onCreate: (payload: FastTaskCapturePayload) => Promise<void>,
        private initialText = '',
    ) {
        super(app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.targetButtons.clear();
        this.errorEl = null;
        this.footerLabelEl = null;
        this.footerHintEl = null;
        this.advancedToggleBtn = null;
        this.isMobileSheet = Platform.isMobile && !isTablet();

        this.modalEl.addClass('diwa-ftc-modal');

        if (this.isMobileSheet) {
            this.modalEl.addClass('diwa-ftc-mobile-modal');
            this.renderMobile();
            return;
        }

        this.modalEl.addClass('diwa-workspace-popup-shell');
        this.modalEl.addClass('diwa-workspace-popup-shell--capture');
        this.renderDesktop();
    }

    onClose(): void {
        this.clearFocusTimer();
        this.viewportCleanup?.();
        this.viewportCleanup = null;
        this.modalEl.removeClass('diwa-ftc-mobile-modal');
        this.modalEl.removeClass('diwa-workspace-popup-shell');
        this.modalEl.removeClass('diwa-workspace-popup-shell--capture');
        this.contentEl.empty();
    }

    private renderDesktop(): void {
        const root = this.contentEl.createEl('div', { cls: 'diwa-ftc-root' });
        const header = root.createEl('div', { cls: 'diwa-ftc-header diwa-workspace-popup-header' });
        header.createEl('span', { cls: 'diwa-workspace-popup-eyebrow', text: 'Gawa capture' });
        const titleRow = header.createEl('div', { cls: 'diwa-workspace-popup-title-row' });
        const title = titleRow.createEl('div', {
            cls: 'diwa-workspace-popup-title',
            text: 'Add task',
        });
        title.setAttr('role', 'heading');
        title.setAttr('aria-level', '2');
        const closeBtn = titleRow.createEl('button', {
            cls: 'diwa-workspace-popup-close',
            text: '✕',
            attr: { type: 'button', 'aria-label': 'Close add task modal' },
        });
        closeBtn.addEventListener('click', () => this.close());
        header.createEl('p', {
            cls: 'diwa-workspace-popup-subtitle',
            text: 'Capture once and route it to backlog, active, or focus.',
        });

        this.renderInputSection(root);

        const targetSection = root.createEl('div', { cls: 'diwa-ftc-section' });
        targetSection.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Send to',
        });
        const targetRow = targetSection.createEl('div', { cls: 'diwa-ftc-targets' });
        this.renderDesktopTargetToggle(targetRow, 'backlog');
        this.renderDesktopTargetToggle(targetRow, 'active');
        this.renderDesktopTargetToggle(targetRow, 'focus');

        const advancedSection = root.createEl('div', { cls: 'diwa-ftc-section diwa-ftc-section--advanced' });
        const advancedSectionHeader = advancedSection.createEl('div', { cls: 'diwa-ftc-section-header' });
        advancedSectionHeader.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Refine',
        });
        this.advancedToggleBtn = advancedSectionHeader.createEl('button', {
            cls: 'diwa-ftc-advanced-toggle',
            text: 'Advanced',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        this.advancedToggleBtn.addEventListener('click', () => this.toggleAdvanced());

        this.advancedEl = advancedSection.createEl('div', { cls: 'diwa-ftc-advanced' });
        this.renderAdvancedFields(this.advancedEl, 'desktop');

        const footer = root.createEl('div', { cls: 'diwa-ftc-footer' });
        footer.createEl('span', {
            cls: 'diwa-ftc-hint',
            text: 'Enter creates · Shift+Enter active · Ctrl/Cmd+Enter focus',
        });
        this.createBtn = footer.createEl('button', {
            cls: 'diwa-ftc-create',
            text: 'Create task',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        this.createBtn.addEventListener('click', () => {
            void this.createWithTarget(this.selectedTarget);
        });

        this.setSelectedTarget(this.selectedTarget);
        this.refreshCreateState();
        this.focusInput();
    }

    private renderMobile(): void {
        const sheet = this.contentEl.createEl('div', { cls: 'diwa-ftc-mobile-sheet' });
        sheet.createEl('div', { cls: 'diwa-ftc-mobile-handle' });

        const header = sheet.createEl('div', { cls: 'diwa-ftc-mobile-header' });
        const cancelBtn = header.createEl('button', {
            cls: 'diwa-ftc-mobile-cancel',
            text: 'Cancel',
            attr: { type: 'button' },
        });
        cancelBtn.addEventListener('click', () => this.close());

        const headerCopy = header.createEl('div', { cls: 'diwa-ftc-mobile-header-copy' });
        headerCopy.createEl('div', { cls: 'diwa-ftc-mobile-kicker', text: 'Gawa capture' });
        headerCopy.createEl('div', { cls: 'diwa-ftc-mobile-title', text: 'Add task' });

        const body = sheet.createEl('div', { cls: 'diwa-ftc-mobile-body' });

        const captureCard = body.createEl('section', { cls: 'diwa-ftc-mobile-card diwa-ftc-mobile-card--capture' });
        captureCard.createEl('div', {
            cls: 'diwa-ftc-mobile-label',
            text: 'Write first',
        });
        this.renderInputSection(captureCard);
        captureCard.createEl('div', {
            cls: 'diwa-ftc-mobile-inline-hint',
            text: 'Use #project, @date, and !priority inline or refine below.',
        });

        const routeCard = body.createEl('section', { cls: 'diwa-ftc-mobile-card' });
        routeCard.createEl('div', {
            cls: 'diwa-ftc-mobile-label',
            text: 'Send it next',
        });
        const targetList = routeCard.createEl('div', { cls: 'diwa-ftc-mobile-targets' });
        this.renderMobileTargetToggle(targetList, 'backlog');
        this.renderMobileTargetToggle(targetList, 'active');
        this.renderMobileTargetToggle(targetList, 'focus');

        const advancedCard = body.createEl('section', { cls: 'diwa-ftc-mobile-card' });
        const advancedHeader = advancedCard.createEl('div', { cls: 'diwa-ftc-mobile-card-header' });
        advancedHeader.createEl('div', {
            cls: 'diwa-ftc-mobile-label',
            text: 'Refine',
        });
        this.advancedToggleBtn = advancedHeader.createEl('button', {
            cls: 'diwa-ftc-mobile-advanced-toggle',
            text: 'More options',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        this.advancedToggleBtn.addEventListener('click', () => this.toggleAdvanced());
        this.advancedEl = advancedCard.createEl('div', { cls: 'diwa-ftc-mobile-advanced' });
        this.renderAdvancedFields(this.advancedEl, 'mobile');

        const footer = sheet.createEl('div', { cls: 'diwa-ftc-mobile-footer' });
        const footerCopy = footer.createEl('div', { cls: 'diwa-ftc-mobile-footer-copy' });
        this.footerLabelEl = footerCopy.createEl('div', { cls: 'diwa-ftc-mobile-footer-label' });
        this.footerHintEl = footerCopy.createEl('div', { cls: 'diwa-ftc-mobile-footer-hint' });
        this.errorEl = footerCopy.createEl('div', { cls: 'diwa-ftc-mobile-error is-hidden' });

        this.createBtn = footer.createEl('button', {
            cls: 'diwa-ftc-mobile-create',
            text: TARGET_META[this.selectedTarget].cta,
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        this.createBtn.addEventListener('click', () => {
            void this.createWithTarget(this.selectedTarget);
        });

        this.viewportCleanup = attachMobileSheetViewportBehavior({
            sheetEl: sheet,
            scrollEl: body,
        });

        this.setSelectedTarget(this.selectedTarget);
        this.refreshCreateState();
        this.focusInput();
    }

    private renderInputSection(parent: HTMLElement): void {
        const inputWrap = parent.createEl('div', {
            cls: this.isMobileSheet ? 'diwa-ftc-mobile-input-wrap' : 'diwa-ftc-input-wrap',
        });
        this.inputEl = inputWrap.createEl('textarea', {
            cls: this.isMobileSheet ? 'diwa-ftc-mobile-input' : 'diwa-ftc-input',
            attr: {
                rows: '1',
                placeholder: 'Add task… (#project @date !priority)',
                'aria-label': 'Task input',
            },
        }) as HTMLTextAreaElement;
        this.inputEl.value = this.initialText;
        this.bindInputHandlers();
        this.syncHeight();

        this.chipsEl = parent.createEl('div', {
            cls: this.isMobileSheet ? 'diwa-ftc-mobile-chips' : 'diwa-ftc-chips',
        });
        this.renderMetadataPreview();
    }

    private bindInputHandlers(): void {
        this.inputEl.addEventListener('input', () => {
            this.syncHeight();
            this.setError();
            this.renderMetadataPreview();
            this.refreshCreateState();
        });
        this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => this.handleInputKeydown(event));
    }

    private renderDesktopTargetToggle(parent: HTMLElement, target: TaskTarget): void {
        const button = parent.createEl('button', {
            cls: 'diwa-ftc-target-btn',
            text: TARGET_META[target].label,
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        button.addEventListener('click', () => this.setSelectedTarget(target));
        this.targetButtons.set(target, button);
    }

    private renderMobileTargetToggle(parent: HTMLElement, target: TaskTarget): void {
        const button = parent.createEl('button', {
            cls: 'diwa-ftc-mobile-target',
            attr: { type: 'button', 'aria-label': `Route task to ${TARGET_META[target].label}` },
        }) as HTMLButtonElement;
        const copy = button.createEl('div', { cls: 'diwa-ftc-mobile-target-copy' });
        copy.createEl('div', { cls: 'diwa-ftc-mobile-target-title', text: TARGET_META[target].label });
        copy.createEl('div', { cls: 'diwa-ftc-mobile-target-description', text: TARGET_META[target].description });
        button.addEventListener('click', () => this.setSelectedTarget(target));
        this.targetButtons.set(target, button);
    }

    private setSelectedTarget(target: TaskTarget): void {
        if (this.saving) return;
        this.selectedTarget = target;
        for (const [key, button] of this.targetButtons.entries()) {
            const isActive = key === target;
            button.toggleClass('is-active', isActive);
            button.setAttr('aria-pressed', isActive ? 'true' : 'false');
        }
        this.refreshActionCopy();
    }

    private refreshActionCopy(): void {
        const meta = TARGET_META[this.selectedTarget];
        if (this.footerLabelEl) this.footerLabelEl.setText(meta.footerLabel);
        if (this.footerHintEl) this.footerHintEl.setText(meta.footerHint);
        if (this.createBtn) {
            this.createBtn.textContent = this.saving
                ? (this.isMobileSheet ? 'Adding task…' : 'Creating...')
                : (this.isMobileSheet ? meta.cta : 'Create task');
        }
    }

    private toggleAdvanced(): void {
        if (this.saving) return;
        const nextOpen = !this.advancedEl.hasClass('is-open');
        this.advancedEl.toggleClass('is-open', nextOpen);
        this.advancedToggleBtn?.toggleClass('is-open', nextOpen);
        if (this.advancedToggleBtn) {
            this.advancedToggleBtn.textContent = this.isMobileSheet
                ? (nextOpen ? 'Hide options' : 'More options')
                : 'Advanced';
        }
    }

    private renderAdvancedFields(parent: HTMLElement, layout: AdvancedLayout): void {
        const grid = parent.createEl('div', {
            cls: layout === 'mobile' ? 'diwa-ftc-mobile-advanced-grid' : 'diwa-ftc-advanced-grid',
        });

        const projectField = this.createAdvancedField(grid, layout, 'Project');
        const projectSelect = projectField.createEl('select', {
            cls: 'diwa-ftc-select',
            attr: { 'aria-label': 'Project override' },
        }) as HTMLSelectElement;
        projectSelect.createEl('option', { text: 'Project: Auto', value: 'auto' });
        projectSelect.createEl('option', { text: 'Project: None', value: 'none' });
        const projects = Array.from(this.plugin.index.projectIndex.values())
            .filter((project) => project.status !== 'archived')
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const project of projects) {
            projectSelect.createEl('option', { text: `Project: ${project.name}`, value: project.name });
        }
        projectSelect.value = this.overrides.project;
        projectSelect.addEventListener('change', () => {
            this.overrides.project = projectSelect.value as CaptureOverrides['project'];
            this.renderMetadataPreview();
        });

        const dueField = this.createAdvancedField(grid, layout, 'Due');
        const dueInput = dueField.createEl('input', {
            cls: 'diwa-ftc-input-compact',
            attr: {
                type: 'text',
                placeholder: 'Due override (e.g. tomorrow)',
                'aria-label': 'Due date override',
            },
        }) as HTMLInputElement;
        dueInput.value = this.overrides.due;
        dueInput.addEventListener('input', () => {
            this.overrides.due = dueInput.value.trim();
            this.renderMetadataPreview();
        });

        const priorityField = this.createAdvancedField(grid, layout, 'Priority');
        const prioritySelect = priorityField.createEl('select', {
            cls: 'diwa-ftc-select',
            attr: { 'aria-label': 'Priority override' },
        }) as HTMLSelectElement;
        prioritySelect.createEl('option', { text: 'Priority: Auto', value: 'auto' });
        prioritySelect.createEl('option', { text: 'Priority: None', value: 'none' });
        prioritySelect.createEl('option', { text: 'Priority: High', value: 'high' });
        prioritySelect.createEl('option', { text: 'Priority: Medium', value: 'medium' });
        prioritySelect.createEl('option', { text: 'Priority: Low', value: 'low' });
        prioritySelect.value = this.overrides.priority;
        prioritySelect.addEventListener('change', () => {
            this.overrides.priority = prioritySelect.value as CaptureOverrides['priority'];
            this.renderMetadataPreview();
        });
    }

    private createAdvancedField(grid: HTMLElement, layout: AdvancedLayout, label: string): HTMLElement {
        if (layout === 'desktop') return grid;
        const field = grid.createEl('label', { cls: 'diwa-ftc-mobile-field' });
        field.createEl('span', { cls: 'diwa-ftc-mobile-field-label', text: label });
        return field;
    }

    private handleInputKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }
        if (this.isMobileSheet || event.key !== 'Enter') return;
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
            void this.createWithTarget('focus');
            return;
        }
        if (event.shiftKey) {
            void this.createWithTarget('active');
            return;
        }
        void this.createWithTarget('backlog');
    }

    private syncHeight(): void {
        this.inputEl.style.height = 'auto';
        this.inputEl.style.overflowY = 'hidden';
        const minHeight = this.isMobileSheet ? 220 : 56;
        this.inputEl.style.height = `${Math.max(this.inputEl.scrollHeight, minHeight)}px`;
    }

    private refreshCreateState(): void {
        const parsed = this.resolveCapture();
        const disabled = parsed.cleanText.length === 0 || this.saving;
        this.createBtn.disabled = disabled;
        this.createBtn.toggleClass('is-disabled', disabled);
        for (const button of this.targetButtons.values()) {
            button.disabled = this.saving;
        }
        this.refreshActionCopy();
    }

    private renderMetadataPreview(): void {
        const parsed = this.resolveCapture();
        this.chipsEl.empty();

        const chipClass = this.isMobileSheet ? 'diwa-ftc-mobile-chip' : 'diwa-ftc-chip';
        const hintClass = this.isMobileSheet
            ? 'diwa-ftc-mobile-chip diwa-ftc-mobile-chip--hint'
            : 'diwa-ftc-chip diwa-ftc-chip--hint';
        const dueLabel = parsed.dueDate
            ? moment(parsed.dueDate, 'YYYY-MM-DD').format(this.isMobileSheet ? 'ddd, MMM D' : 'MMM D')
            : null;

        if (parsed.project) {
            this.chipsEl.createEl('span', { cls: chipClass, text: `#${parsed.project}` });
        }
        for (const context of parsed.contexts) {
            this.chipsEl.createEl('span', { cls: chipClass, text: `#${context}` });
        }
        if (dueLabel) {
            this.chipsEl.createEl('span', { cls: chipClass, text: `@${dueLabel}` });
        }
        if (parsed.priority) {
            this.chipsEl.createEl('span', { cls: chipClass, text: `!${parsed.priority}` });
        }
        if (!this.chipsEl.children.length) {
            this.chipsEl.createEl('span', {
                cls: hintClass,
                text: this.isMobileSheet
                    ? 'Metadata preview appears here.'
                    : 'Metadata preview',
            });
        }
    }

    private resolveCapture(): ParsedCapture {
        const parsed = this.parseInlineInput(this.inputEl.value);
        const dueOverride = this.overrides.due
            ? this.tryParseDate(this.overrides.due)
            : null;
        const priorityOverride =
            this.overrides.priority === 'auto'
                ? null
                : (this.overrides.priority === 'none' ? null : this.overrides.priority);

        const projectOverride =
            this.overrides.project === 'auto'
                ? parsed.project
                : (this.overrides.project === 'none' ? null : this.overrides.project);

        return {
            ...parsed,
            dueDate: dueOverride ?? parsed.dueDate,
            priority: this.overrides.priority === 'auto' ? parsed.priority : priorityOverride,
            project: projectOverride,
        };
    }

    private parseInlineInput(value: string): ParsedCapture {
        const tags = Array.from(value.matchAll(/(^|\s)#([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);
        const dueTokens = Array.from(value.matchAll(/(^|\s)@([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);
        const priorityTokens = Array.from(value.matchAll(/(^|\s)!([^\s#@!.,;:!?()[\]{}]+)/g)).map((match) => match[2]);

        const projectLookup = this.buildProjectLookup();
        let resolvedProject: string | null = null;
        const contexts: string[] = [];
        for (const tag of tags) {
            const key = this.normalizeToken(tag);
            const project = projectLookup.get(key);
            if (!resolvedProject && project) {
                resolvedProject = project;
                continue;
            }
            if (!contexts.includes(tag)) contexts.push(tag);
        }

        let resolvedDue: string | null = null;
        for (const token of dueTokens) {
            const parsed = this.tryParseDate(token);
            if (parsed) {
                resolvedDue = parsed;
                break;
            }
        }

        let resolvedPriority: TaskPriority = null;
        for (const token of priorityTokens) {
            const parsed = this.parsePriorityToken(token);
            if (parsed) {
                resolvedPriority = parsed;
                break;
            }
        }

        const cleanText = value
            .replace(/(^|\s)(#[^\s#@!.,;:!?()[\]{}]+|@[^\s#@!.,;:!?()[\]{}]+|![^\s#@!.,;:!?()[\]{}]+)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            cleanText,
            contexts,
            dueDate: resolvedDue,
            priority: resolvedPriority,
            project: resolvedProject,
        };
    }

    private buildProjectLookup(): Map<string, string> {
        const map = new Map<string, string>();
        for (const project of this.plugin.index.projectIndex.values()) {
            if (project.status === 'archived') continue;
            map.set(this.normalizeToken(project.name), project.name);
            map.set(this.normalizeToken(project.id), project.name);
        }
        return map;
    }

    private normalizeToken(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    private tryParseDate(token: string): string | null {
        const normalized = token.replace(/[_-]/g, ' ').trim();
        const parsed = parseNaturalDate(normalized);
        if (parsed) return parsed;
        const direct = moment(token, 'YYYY-MM-DD', true);
        return direct.isValid() ? direct.format('YYYY-MM-DD') : null;
    }

    private parsePriorityToken(token: string): TaskPriority {
        const normalized = token.toLowerCase();
        if (['h', 'high', 'p1', '1'].includes(normalized)) return 'high';
        if (['m', 'med', 'medium', 'p2', '2'].includes(normalized)) return 'medium';
        if (['l', 'low', 'p3', '3'].includes(normalized)) return 'low';
        return null;
    }

    private async createWithTarget(target: TaskTarget): Promise<void> {
        const capture = this.resolveCapture();
        if (!capture.cleanText || this.saving) return;

        const status: 'open' | 'waiting' = target === 'backlog' ? 'open' : 'waiting';
        const focus = target === 'focus';
        this.setSelectedTarget(target);
        this.saving = true;
        this.setError();
        this.refreshCreateState();

        try {
            await this.onCreate({
                text: capture.cleanText,
                contexts: capture.contexts,
                dueDate: capture.dueDate,
                priority: capture.priority,
                project: capture.project,
                target,
                status,
                focus,
            });
            this.close();
        } catch (error) {
            console.error('[DIWA FastTaskCaptureModal] create failed', error);
            const message = error instanceof Error && error.message
                ? error.message
                : 'Failed to add task to Gawa.';
            this.setError(message);
            new Notice(message);
        } finally {
            this.saving = false;
            this.refreshCreateState();
        }
    }

    private setError(message = ''): void {
        if (!this.errorEl) return;
        this.errorEl.setText(message);
        this.errorEl.toggleClass('is-hidden', !message);
    }

    private focusInput(): void {
        this.scheduleFocus(() => this.inputEl, true);
    }

    private scheduleFocus(
        getElement: () => HTMLInputElement | HTMLTextAreaElement | null,
        moveCursorToEnd = false,
    ): void {
        this.clearFocusTimer();
        this.focusTimer = window.setTimeout(() => {
            const element = getElement();
            if (!this.modalEl.isConnected || !element?.isConnected) return;
            element.focus();
            if (moveCursorToEnd && element instanceof HTMLTextAreaElement) {
                const end = element.value.length;
                element.setSelectionRange(end, end);
            }
        }, 50);
    }

    private clearFocusTimer(): void {
        if (this.focusTimer === null) return;
        window.clearTimeout(this.focusTimer);
        this.focusTimer = null;
    }
}

import { App, Modal, Notice, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import { parseNaturalDate } from '../utils';

type TaskTarget = 'backlog' | 'active' | 'focus';
type TaskPriority = 'high' | 'medium' | 'low' | null;

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

export class FastTaskCaptureModal extends Modal {
    private inputEl!: HTMLTextAreaElement;
    private chipsEl!: HTMLElement;
    private advancedEl!: HTMLElement;
    private createBtn!: HTMLButtonElement;
    private selectedTarget: TaskTarget = 'backlog';
    private overrides: CaptureOverrides = {
        project: 'auto',
        due: '',
        priority: 'auto',
    };
    private targetButtons = new Map<TaskTarget, HTMLButtonElement>();

    constructor(
        app: App,
        private plugin: DiwaPlugin,
        private onCreate: (payload: FastTaskCapturePayload) => Promise<void>,
        private initialText = '',
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('diwa-ftc-modal');
        this.modalEl.addClass('diwa-workspace-popup-shell');
        this.modalEl.addClass('diwa-workspace-popup-shell--capture');
        this.contentEl.empty();

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

        const inputWrap = root.createEl('div', { cls: 'diwa-ftc-input-wrap' });
        this.inputEl = inputWrap.createEl('textarea', {
            cls: 'diwa-ftc-input',
            attr: {
                rows: '1',
                placeholder: 'Add task… (#project @date !priority)',
                'aria-label': 'Task input',
            },
        }) as HTMLTextAreaElement;
        this.inputEl.value = this.initialText;
        this.syncHeight();
        this.inputEl.addEventListener('input', () => {
            this.syncHeight();
            this.renderMetadataPreview();
            this.refreshCreateState();
        });
        this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => this.handleInputKeydown(event));

        this.chipsEl = root.createEl('div', { cls: 'diwa-ftc-chips' });
        this.renderMetadataPreview();

        const targetSection = root.createEl('div', { cls: 'diwa-ftc-section' });
        targetSection.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Send to',
        });
        const targetRow = targetSection.createEl('div', { cls: 'diwa-ftc-targets' });
        this.renderTargetToggle(targetRow, 'backlog', 'Backlog');
        this.renderTargetToggle(targetRow, 'active', 'Active');
        this.renderTargetToggle(targetRow, 'focus', 'Focus');

        const advancedSection = root.createEl('div', { cls: 'diwa-ftc-section diwa-ftc-section--advanced' });
        const advancedSectionHeader = advancedSection.createEl('div', { cls: 'diwa-ftc-section-header' });
        advancedSectionHeader.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Refine',
        });
        const advancedToggle = advancedSectionHeader.createEl('button', {
            cls: 'diwa-ftc-advanced-toggle',
            text: 'Advanced',
            attr: { type: 'button' },
        });
        advancedToggle.addEventListener('click', () => {
            const nextOpen = !this.advancedEl.hasClass('is-open');
            this.advancedEl.toggleClass('is-open', nextOpen);
            advancedToggle.toggleClass('is-open', nextOpen);
        });

        this.advancedEl = advancedSection.createEl('div', { cls: 'diwa-ftc-advanced' });
        this.renderAdvancedFields(this.advancedEl);

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
        this.refreshCreateState();

        setTimeout(() => {
            this.inputEl.focus();
            this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
        }, 40);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderTargetToggle(parent: HTMLElement, target: TaskTarget, label: string): void {
        const button = parent.createEl('button', {
            cls: 'diwa-ftc-target-btn',
            text: label,
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        button.addEventListener('click', () => this.setSelectedTarget(target));
        this.targetButtons.set(target, button);
        this.setSelectedTarget(this.selectedTarget);
    }

    private setSelectedTarget(target: TaskTarget): void {
        this.selectedTarget = target;
        for (const [key, button] of this.targetButtons.entries()) {
            button.toggleClass('is-active', key === target);
            button.setAttr('aria-pressed', key === target ? 'true' : 'false');
        }
    }

    private renderAdvancedFields(parent: HTMLElement): void {
        const grid = parent.createEl('div', { cls: 'diwa-ftc-advanced-grid' });

        const projectSelect = grid.createEl('select', {
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
        projectSelect.addEventListener('change', () => {
            this.overrides.project = projectSelect.value as CaptureOverrides['project'];
            this.renderMetadataPreview();
        });

        const dueInput = grid.createEl('input', {
            cls: 'diwa-ftc-input-compact',
            attr: {
                type: 'text',
                placeholder: 'Due override (e.g. tomorrow)',
                'aria-label': 'Due date override',
            },
        }) as HTMLInputElement;
        dueInput.addEventListener('input', () => {
            this.overrides.due = dueInput.value.trim();
            this.renderMetadataPreview();
        });

        const prioritySelect = grid.createEl('select', {
            cls: 'diwa-ftc-select',
            attr: { 'aria-label': 'Priority override' },
        }) as HTMLSelectElement;
        prioritySelect.createEl('option', { text: 'Priority: Auto', value: 'auto' });
        prioritySelect.createEl('option', { text: 'Priority: None', value: 'none' });
        prioritySelect.createEl('option', { text: 'Priority: High', value: 'high' });
        prioritySelect.createEl('option', { text: 'Priority: Medium', value: 'medium' });
        prioritySelect.createEl('option', { text: 'Priority: Low', value: 'low' });
        prioritySelect.addEventListener('change', () => {
            this.overrides.priority = prioritySelect.value as CaptureOverrides['priority'];
            this.renderMetadataPreview();
        });
    }

    private handleInputKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key !== 'Enter') return;
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
        this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
    }

    private refreshCreateState(): void {
        const parsed = this.resolveCapture();
        const disabled = parsed.cleanText.length === 0;
        this.createBtn.disabled = disabled;
        this.createBtn.toggleClass('is-disabled', disabled);
    }

    private renderMetadataPreview(): void {
        const parsed = this.resolveCapture();
        this.chipsEl.empty();

        if (parsed.project) {
            this.chipsEl.createEl('span', { cls: 'diwa-ftc-chip', text: `#${parsed.project}` });
        }
        for (const context of parsed.contexts) {
            this.chipsEl.createEl('span', { cls: 'diwa-ftc-chip', text: `#${context}` });
        }
        if (parsed.dueDate) {
            const dueLabel = moment(parsed.dueDate, 'YYYY-MM-DD').format('MMM D');
            this.chipsEl.createEl('span', { cls: 'diwa-ftc-chip', text: `@${dueLabel}` });
        }
        if (parsed.priority) {
            this.chipsEl.createEl('span', { cls: 'diwa-ftc-chip', text: `!${parsed.priority}` });
        }
        if (!this.chipsEl.children.length) {
            this.chipsEl.createEl('span', { cls: 'diwa-ftc-chip diwa-ftc-chip--hint', text: 'Metadata preview' });
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
        if (!capture.cleanText) {
            return;
        }
        const status: 'open' | 'waiting' = target === 'backlog' ? 'open' : 'waiting';
        const focus = target === 'focus';
        this.setSelectedTarget(target);
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
        }
    }
}

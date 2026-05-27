import { App, Modal, Platform, moment } from 'obsidian';
import type { ProjectEntry } from '../types';
import type { VaultService } from '../services/VaultService';
import { isTablet } from '../utils';

const PROJECT_COLORS = [
    { hex: '#6366f1', label: 'Indigo' },
    { hex: '#8b5cf6', label: 'Purple' },
    { hex: '#ec4899', label: 'Pink' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#10b981', label: 'Emerald' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#ef4444', label: 'Red' },
    { hex: '#64748b', label: 'Slate' },
];

export class NewProjectModal extends Modal {
    private vaultService: VaultService;
    private onCreated: (entry: ProjectEntry) => void;

    private name = '';
    private goal = '';
    private status: ProjectEntry['status'] = 'active';
    private due = '';
    private color = '#6366f1';

    constructor(app: App, vaultService: VaultService, onCreated: (entry: ProjectEntry) => void) {
        super(app);
        this.vaultService = vaultService;
        this.onCreated = onCreated;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        const isMobilePhone = Platform.isMobile && !isTablet();
        if (isMobilePhone) {
            this.renderMobileSheet(contentEl, modalEl);
            return;
        }
        this.renderDesktopModal(contentEl, modalEl);
    }

    onClose(): void {
        document.body.removeClass('diwa-mobile-active');
        this.contentEl.empty();
    }

    private renderDesktopModal(contentEl: HTMLElement, modalEl: HTMLElement): void {
        modalEl.addClass('diwa-new-project-modal');

        const header = contentEl.createDiv('diwa-modal-header');
        const copy = header.createDiv('diwa-project-modal-header-copy');
        copy.createDiv({ cls: 'diwa-project-modal-eyebrow', text: 'Project workspace' });
        copy.createEl('h2', { text: 'New Project', cls: 'diwa-modal-title' });
        const closeBtn = header.createEl('button', {
            cls: 'diwa-modal-close-btn',
            text: '×',
            attr: { type: 'button', 'aria-label': 'Close new project modal' },
        });
        closeBtn.addEventListener('click', () => this.close());

        const body = contentEl.createDiv('diwa-project-modal-body');
        this.buildForm(body);

        const actions = contentEl.createDiv('diwa-modal-actions');
        const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'diwa-btn diwa-btn--ghost', attr: { type: 'button' } });
        cancelBtn.addEventListener('click', () => this.close());
        const createBtn = actions.createEl('button', {
            text: 'Create Project',
            cls: 'diwa-btn diwa-btn--primary',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        createBtn.addEventListener('click', () => { void this.submit(createBtn); });
    }

    private renderMobileSheet(contentEl: HTMLElement, modalEl: HTMLElement): void {
        modalEl.addClass('diwa-mobile-sheet');
        modalEl.addClass('diwa-new-project-sheet');
        document.body.addClass('diwa-mobile-active');
        contentEl.style.setProperty('padding', '0', 'important');

        const handleBar = contentEl.createDiv('diwa-mobile-handle-bar');
        handleBar.createDiv('diwa-mobile-handle-pill');

        const header = contentEl.createDiv('diwa-epm-header');
        const headerLeft = header.createDiv('diwa-epm-header-left');
        const colorRing = headerLeft.createDiv('diwa-epm-color-ring');
        colorRing.style.setProperty('--project-color', this.color);
        headerLeft.createDiv({ cls: 'diwa-project-modal-eyebrow', text: 'Project workspace' });
        headerLeft.createEl('h3', { text: 'New Project', cls: 'diwa-epm-title' });
        const closeBtn = header.createEl('button', {
            cls: 'diwa-epm-header-close',
            text: '×',
            attr: { type: 'button', 'aria-label': 'Close new project sheet' },
        });
        closeBtn.addEventListener('click', () => this.close());

        const body = contentEl.createDiv('diwa-epm-body');
        this.buildForm(body, colorRing);

        const footer = contentEl.createDiv('diwa-epm-footer');
        const cancelBtn = footer.createEl('button', {
            text: 'Cancel',
            cls: 'diwa-epm-cancel-btn',
            attr: { type: 'button' },
        });
        cancelBtn.addEventListener('click', () => this.close());
        const createBtn = footer.createEl('button', {
            text: 'Create Project',
            cls: 'diwa-epm-save-btn',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        createBtn.addEventListener('click', () => { void this.submit(createBtn); });

        this.initSwipeToDismiss(modalEl, handleBar, body);
    }

    private buildForm(container: HTMLElement, colorRingEl?: HTMLElement): void {
        const nameWrap = container.createDiv('diwa-field-group');
        nameWrap.createEl('label', { text: 'Project Name', cls: 'diwa-field-label' });
        const nameInput = nameWrap.createEl('input', {
            type: 'text',
            cls: 'diwa-field-input',
            attr: { placeholder: 'e.g. Launch DIWA Plugin', autocomplete: 'off' },
        }) as HTMLInputElement;
        nameInput.value = this.name;
        nameInput.addEventListener('input', () => {
            this.name = nameInput.value.trim();
        });
        setTimeout(() => nameInput.focus(), 80);

        const goalWrap = container.createDiv('diwa-field-group');
        goalWrap.createEl('label', { text: 'Goal / Outcome', cls: 'diwa-field-label' });
        const goalTextarea = goalWrap.createEl('textarea', {
            cls: 'diwa-field-textarea',
            attr: { placeholder: 'What does success look like?', rows: '3' },
        }) as HTMLTextAreaElement;
        goalTextarea.value = this.goal;
        goalTextarea.addEventListener('input', () => {
            this.goal = goalTextarea.value.trim();
        });

        const statusWrap = container.createDiv('diwa-field-group');
        statusWrap.createEl('label', { text: 'Status', cls: 'diwa-field-label' });
        const segBar = statusWrap.createDiv('diwa-seg-bar diwa-epm-status-bar');
        const statuses: { val: ProjectEntry['status']; label: string }[] = [
            { val: 'active', label: 'Active' },
            { val: 'on-hold', label: 'On Hold' },
        ];
        const segBtns: HTMLButtonElement[] = [];
        statuses.forEach((status) => {
            const btn = segBar.createEl('button', {
                text: status.label,
                cls: 'diwa-seg-btn',
                attr: { type: 'button' },
            }) as HTMLButtonElement;
            if (status.val === this.status) btn.addClass('is-active');
            btn.addEventListener('click', () => {
                this.status = status.val;
                segBtns.forEach((segment) => segment.removeClass('is-active'));
                btn.addClass('is-active');
            });
            segBtns.push(btn);
        });

        const dueWrap = container.createDiv('diwa-field-group');
        dueWrap.createEl('label', { text: 'Due Date (optional)', cls: 'diwa-field-label' });
        const dueInput = dueWrap.createEl('input', {
            type: 'date',
            cls: 'diwa-field-input',
        }) as HTMLInputElement;
        dueInput.value = this.due;
        dueInput.addEventListener('change', () => {
            this.due = dueInput.value;
        });

        const colorWrap = container.createDiv('diwa-field-group');
        colorWrap.createEl('label', { text: 'Color', cls: 'diwa-field-label' });
        const colorPicker = colorWrap.createDiv('diwa-project-color-picker');
        const swatches: HTMLElement[] = [];
        PROJECT_COLORS.forEach((color) => {
            const swatch = colorPicker.createDiv('diwa-color-swatch');
            swatch.style.setProperty('--swatch-color', color.hex);
            swatch.setAttribute('title', color.label);
            if (color.hex === this.color) swatch.addClass('is-selected');
            swatch.addEventListener('click', () => {
                this.color = color.hex;
                swatches.forEach((item) => item.removeClass('is-selected'));
                swatch.addClass('is-selected');
                colorRingEl?.style.setProperty('--project-color', color.hex);
            });
            swatches.push(swatch);
        });

        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.submit();
            }
            if (event.key === 'Escape') this.close();
        });
    }

    private async submit(submitBtn?: HTMLButtonElement): Promise<void> {
        if (!this.name) return;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating…';
        }

        const id = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const entry: ProjectEntry = {
            id,
            name: this.name,
            status: this.status,
            goal: this.goal,
            due: this.due || undefined,
            created: moment().format('YYYY-MM-DD HH:mm:ss'),
            color: this.color,
            filePath: '',
        };

        try {
            const file = await this.vaultService.createProject(entry);
            entry.filePath = file.path;
            this.onCreated(entry);
            this.close();
        } catch (error) {
            console.error('[DIWA] createProject failed', error);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Project';
            }
        }
    }

    private initSwipeToDismiss(modalEl: HTMLElement, handleEl: HTMLElement, scrollEl: HTMLElement): void {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let velocity = 0;
        let lastY = 0;
        let lastTime = 0;
        const dismissThreshold = 120;
        const velocityThreshold = 0.5;

        const onTouchStart = (event: TouchEvent) => {
            if (scrollEl.scrollTop > 0) return;
            startY = event.touches[0].clientY;
            currentY = 0;
            isDragging = true;
            velocity = 0;
            lastY = startY;
            lastTime = Date.now();
            modalEl.style.willChange = 'transform';
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!isDragging) return;
            const delta = event.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (event.touches[0].clientY - lastY) / Math.max(1, now - lastTime);
            lastY = event.touches[0].clientY;
            lastTime = now;
            const resisted = delta < 30 ? delta : 30 + (delta - 30) * 0.4;
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > dismissThreshold || velocity > velocityThreshold) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.addClass('is-snapping-back');
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => modalEl.removeClass('is-snapping-back'), 400);
            }
            currentY = 0;
        };

        handleEl.addEventListener('touchstart', onTouchStart, { passive: true });
        modalEl.addEventListener('touchmove', onTouchMove, { passive: true });
        modalEl.addEventListener('touchend', onTouchEnd, { passive: true });
    }
}

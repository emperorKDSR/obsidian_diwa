import { App, Modal, Platform, TFile, setIcon } from 'obsidian';
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

export class EditProjectModal extends Modal {
    private vaultService: VaultService;
    private project: ProjectEntry;
    private onSaved: (updated: ProjectEntry) => void;

    private draftName: string;
    private draftGoal: string;
    private draftStatus: ProjectEntry['status'];
    private draftDue: string;
    private draftColor: string;

    constructor(
        app: App,
        vaultService: VaultService,
        project: ProjectEntry,
        onSaved: (updated: ProjectEntry) => void
    ) {
        super(app);
        this.vaultService = vaultService;
        this.project = project;
        this.onSaved = onSaved;
        this.draftName   = project.name;
        this.draftGoal   = project.goal || '';
        this.draftStatus = project.status;
        this.draftDue    = project.due || '';
        this.draftColor  = project.color || '#6366f1';
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        const isMobilePhone = Platform.isMobile && !isTablet();
        if (isMobilePhone) {
            this._renderMobileSheet(contentEl, modalEl);
        } else {
            this._renderDesktopModal(contentEl, modalEl);
        }
    }

    onClose() {
        document.body.removeClass('diwa-mobile-active');
        this.contentEl.empty();
    }

    private _renderMobileSheet(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('diwa-mobile-sheet');
        modalEl.addClass('diwa-edit-project-sheet');
        document.body.addClass('diwa-mobile-active');
        contentEl.style.setProperty('padding', '0', 'important');

        // Handle bar
        const handleBar = contentEl.createDiv('diwa-mobile-handle-bar');
        handleBar.createDiv('diwa-mobile-handle-pill');

        // Header
        const header = contentEl.createDiv('diwa-epm-header');
        const headerLeft = header.createDiv('diwa-epm-header-left');
        const colorRing = headerLeft.createDiv('diwa-epm-color-ring');
        colorRing.style.setProperty('--project-color', this.draftColor);
        headerLeft.createDiv({ cls: 'diwa-project-modal-eyebrow', text: 'Project workspace' });
        headerLeft.createEl('h3', { text: 'Edit Project', cls: 'diwa-epm-title' });
        const closeBtn = header.createEl('button', { cls: 'diwa-epm-header-close', text: '×' });
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = contentEl.createDiv('diwa-epm-body');
        this._buildForm(body, colorRing);

        // Footer
        const footer = contentEl.createDiv('diwa-epm-footer');
        const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'diwa-epm-cancel-btn' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = footer.createEl('button', { text: 'Save Changes', cls: 'diwa-epm-save-btn' }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._submit(saveBtn));

        this._initSwipeToDismiss(modalEl, handleBar, body);
    }

    private _renderDesktopModal(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('diwa-new-project-modal');
        modalEl.addClass('diwa-edit-project-modal');

        const header = contentEl.createDiv('diwa-modal-header');
        const copy = header.createDiv('diwa-project-modal-header-copy');
        copy.createDiv({ cls: 'diwa-project-modal-eyebrow', text: 'Project workspace' });
        copy.createEl('h2', { text: 'Edit Project', cls: 'diwa-modal-title' });
        const closeBtn = header.createEl('button', {
            cls: 'diwa-modal-close-btn',
            text: '×',
            attr: { type: 'button', 'aria-label': 'Close edit project modal' },
        });
        closeBtn.addEventListener('click', () => this.close());

        const body = contentEl.createDiv('diwa-project-modal-body');
        this._buildForm(body);
        const actions = contentEl.createDiv('diwa-modal-actions');
        const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'diwa-btn diwa-btn--ghost' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = actions.createEl('button', { text: 'Save Changes', cls: 'diwa-btn diwa-btn--primary' }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._submit(saveBtn));
    }

    private _buildForm(container: HTMLElement, colorRingEl?: HTMLElement) {
        // Name
        const nameWrap = container.createDiv('diwa-field-group');
        nameWrap.createEl('label', { text: 'Project Name', cls: 'diwa-field-label' });
        const nameInput = nameWrap.createEl('input', {
            type: 'text',
            cls: 'diwa-field-input',
            attr: { placeholder: 'e.g. Launch DIWA Plugin', autocomplete: 'off' }
        }) as HTMLInputElement;
        nameInput.value = this.draftName;
        nameInput.addEventListener('input', () => { this.draftName = nameInput.value.trim(); });
        setTimeout(() => nameInput.focus(), 80);

        // Goal
        const goalWrap = container.createDiv('diwa-field-group');
        goalWrap.createEl('label', { text: 'Goal / Outcome', cls: 'diwa-field-label' });
        const goalTextarea = goalWrap.createEl('textarea', {
            cls: 'diwa-field-textarea',
            attr: { placeholder: 'What does success look like?', rows: '3' }
        }) as HTMLTextAreaElement;
        goalTextarea.value = this.draftGoal;
        goalTextarea.addEventListener('input', () => { this.draftGoal = goalTextarea.value.trim(); });

        // Status
        const statusWrap = container.createDiv('diwa-field-group');
        statusWrap.createEl('label', { text: 'Status', cls: 'diwa-field-label' });
        const segBar = statusWrap.createDiv('diwa-seg-bar diwa-epm-status-bar');
        const statuses: { val: ProjectEntry['status']; label: string }[] = [
            { val: 'active',    label: 'Active' },
            { val: 'on-hold',   label: 'On Hold' },
            { val: 'completed', label: 'Completed' },
        ];
        const segBtns: HTMLButtonElement[] = [];
        statuses.forEach(s => {
            const btn = segBar.createEl('button', { text: s.label, cls: 'diwa-seg-btn' }) as HTMLButtonElement;
            if (s.val === this.draftStatus) btn.addClass('is-active');
            btn.addEventListener('click', () => {
                this.draftStatus = s.val;
                segBtns.forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
            segBtns.push(btn);
        });

        // Due Date
        const dueWrap = container.createDiv('diwa-field-group');
        dueWrap.createEl('label', { text: 'Due Date (optional)', cls: 'diwa-field-label' });
        const dueInput = dueWrap.createEl('input', {
            type: 'date',
            cls: 'diwa-field-input'
        }) as HTMLInputElement;
        dueInput.value = this.draftDue;
        dueInput.addEventListener('change', () => { this.draftDue = dueInput.value; });

        // Color
        const colorWrap = container.createDiv('diwa-field-group');
        colorWrap.createEl('label', { text: 'Color', cls: 'diwa-field-label' });
        const colorPicker = colorWrap.createDiv('diwa-project-color-picker');
        const swatches: HTMLElement[] = [];
        PROJECT_COLORS.forEach(c => {
            const swatch = colorPicker.createDiv('diwa-color-swatch');
            swatch.style.setProperty('--swatch-color', c.hex);
            swatch.setAttribute('title', c.label);
            if (c.hex === this.draftColor) swatch.addClass('is-selected');
            swatch.addEventListener('click', () => {
                this.draftColor = c.hex;
                swatches.forEach(s => s.removeClass('is-selected'));
                swatch.addClass('is-selected');
                if (colorRingEl) colorRingEl.style.setProperty('--project-color', c.hex);
                if ('vibrate' in navigator) navigator.vibrate(6);
            });
            swatches.push(swatch);
        });
    }

    private async _submit(saveBtn: HTMLButtonElement) {
        if (!this.draftName) return;
        saveBtn.addClass('is-saving');
        saveBtn.textContent = 'Saving…';

        const file = this.app.vault.getAbstractFileByPath(this.project.filePath);
        if (!(file instanceof TFile)) {
            saveBtn.removeClass('is-saving');
            saveBtn.textContent = 'Save Changes';
            return;
        }

        const updates: Partial<ProjectEntry> = {
            name:   this.draftName,
            goal:   this.draftGoal,
            status: this.draftStatus,
            due:    this.draftDue || undefined,
            color:  this.draftColor,
        };
        try {
            await this.vaultService.updateProject(file, updates);
            this.onSaved({ ...this.project, ...updates });
            this.close();
        } catch (e) {
            console.error('[DIWA] updateProject failed', e);
            saveBtn.removeClass('is-saving');
            saveBtn.textContent = 'Save Changes';
        }
    }

    private _initSwipeToDismiss(modalEl: HTMLElement, handleEl: HTMLElement, scrollEl: HTMLElement) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let velocity = 0;
        let lastY = 0;
        let lastTime = 0;
        const DISMISS_THRESHOLD = 120;
        const VELOCITY_THRESHOLD = 0.5;

        const onTouchStart = (e: TouchEvent) => {
            if (scrollEl.scrollTop > 0) return;
            startY = e.touches[0].clientY;
            currentY = 0;
            isDragging = true;
            velocity = 0;
            lastY = startY;
            lastTime = Date.now();
            modalEl.style.willChange = 'transform';
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(1, now - lastTime);
            lastY = e.touches[0].clientY;
            lastTime = now;
            const resisted = delta < 30 ? delta : 30 + (delta - 30) * 0.4;
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
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


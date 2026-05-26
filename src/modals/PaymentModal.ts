import { App, Modal, Notice, Platform, TFile, moment } from 'obsidian';
import type DiwaPlugin from '../main';
import { isTablet } from '../utils';

export class PaymentModal extends Modal {
    plugin: DiwaPlugin;
    file: TFile;
    currentDueDate: string;
    onPaymentSaved: () => void;
    quickDate: string | null;
    private attachedFiles: File[] = [];
    private paymentDateInput: HTMLInputElement | null = null;
    private nextDueDateInput: HTMLInputElement | null = null;
    private notesInput: HTMLTextAreaElement | null = null;
    private previewContainer: HTMLElement | null = null;
    private fileInput: HTMLInputElement | null = null;
    private readonly isMobileSheet: boolean;

    constructor(app: App, plugin: DiwaPlugin, file: TFile, currentDueDate: string, onPaymentSaved: () => void, quickDate: string | null = null) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.currentDueDate = currentDueDate;
        this.onPaymentSaved = onPaymentSaved;
        this.quickDate = quickDate;
        this.isMobileSheet = Platform.isMobile && !isTablet();
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this.attachedFiles = [];
        this.paymentDateInput = null;
        this.nextDueDateInput = null;
        this.notesInput = null;
        this.previewContainer = null;
        this.fileInput = null;

        modalEl.addClass('diwa-payment-modal');
        if (this.isMobileSheet) {
            modalEl.addClass('diwa-payment-modal--mobile');
            this.renderMobile(contentEl);
        } else {
            modalEl.addClass('diwa-workspace-popup-shell');
            this.renderDesktop(contentEl);
        }

        window.setTimeout(() => this.notesInput?.focus(), 10);
    }

    onClose() {
        this.modalEl.removeClass('diwa-payment-modal', 'diwa-payment-modal--mobile', 'diwa-workspace-popup-shell');
        this.contentEl.empty();
        this.attachedFiles = [];
        this.paymentDateInput = null;
        this.nextDueDateInput = null;
        this.notesInput = null;
        this.previewContainer = null;
        this.fileInput = null;
    }

    private renderDesktop(contentEl: HTMLElement): void {
        const root = contentEl.createEl('div', { cls: 'diwa-payment-modal-root' });
        this.renderHeader(root);
        const body = root.createEl('div', { cls: 'diwa-payment-modal-body' });
        this.renderSummary(body);
        this.renderFormSections(body);
        this.renderFooter(root);
    }

    private renderMobile(contentEl: HTMLElement): void {
        const sheet = contentEl.createEl('div', { cls: 'diwa-payment-modal-sheet' });
        sheet.createEl('div', { cls: 'diwa-payment-modal-sheet-handle' });
        this.renderHeader(sheet);
        const body = sheet.createEl('div', { cls: 'diwa-payment-modal-sheet-body' });
        this.renderSummary(body);
        this.renderFormSections(body);
        this.renderFooter(sheet, true);
    }

    private renderHeader(parent: HTMLElement): void {
        const header = parent.createEl('div', {
            cls: `diwa-workspace-popup-header ${this.isMobileSheet ? 'diwa-payment-modal-sheet-header' : 'diwa-payment-modal-header'}`,
        });
        header.createEl('span', {
            cls: 'diwa-workspace-popup-eyebrow',
            text: 'Bulsa payment',
        });

        const titleRow = header.createEl('div', { cls: 'diwa-workspace-popup-title-row' });
        const title = titleRow.createEl('div', {
            cls: 'diwa-workspace-popup-title',
            text: `Pay ${this.file.basename}`,
        });
        title.setAttr('role', 'heading');
        title.setAttr('aria-level', '2');

        const closeBtn = titleRow.createEl('button', {
            cls: 'diwa-workspace-popup-close diwa-payment-modal-close',
            text: '✕',
            attr: {
                type: 'button',
                'aria-label': 'Close payment modal',
            },
        });
        closeBtn.addEventListener('click', () => this.close());

        header.createEl('p', {
            cls: 'diwa-workspace-popup-subtitle',
            text: 'Log the payment date, update the next due date, and keep a quick receipt or reference note.',
        });
    }

    private renderSummary(parent: HTMLElement): void {
        const summary = parent.createEl('section', {
            cls: 'diwa-workspace-popup-section diwa-payment-modal-summary',
        });
        summary.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Overview',
        });

        const grid = summary.createEl('div', { cls: 'diwa-payment-modal-summary-grid' });
        this.createSummaryItem(grid, 'Current due', this.formatSummaryDate(this.currentDueDate));
        this.createSummaryItem(grid, 'Default next cycle', this.formatSummaryDate(this.getNextDueDefault()));
    }

    private createSummaryItem(parent: HTMLElement, label: string, value: string): void {
        const item = parent.createEl('div', { cls: 'diwa-payment-modal-summary-item' });
        item.createEl('span', { cls: 'diwa-payment-modal-summary-label', text: label });
        item.createEl('span', { cls: 'diwa-payment-modal-summary-value', text: value });
    }

    private renderFormSections(parent: HTMLElement): void {
        const datesSection = parent.createEl('section', {
            cls: 'diwa-workspace-popup-section diwa-payment-modal-form-section',
        });
        datesSection.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Dates',
        });
        const datesGrid = datesSection.createEl('div', { cls: 'diwa-payment-modal-date-grid' });

        this.paymentDateInput = this.createInputField(
            datesGrid,
            'Payment Date',
            'date',
            this.quickDate || moment().format('YYYY-MM-DD'),
            'diwa-payment-modal-input'
        );
        this.nextDueDateInput = this.createInputField(
            datesGrid,
            'Next Due Date',
            'date',
            this.getNextDueDefault(),
            'diwa-payment-modal-input'
        );

        const notesSection = parent.createEl('section', {
            cls: 'diwa-workspace-popup-section diwa-payment-modal-form-section',
        });
        notesSection.createEl('span', {
            cls: 'diwa-workspace-popup-section-label',
            text: 'Reference',
        });

        const notesField = this.createField(notesSection, 'Notes / Snippet / Reference');
        this.notesInput = notesField.createEl('textarea', {
            cls: 'diwa-payment-modal-textarea',
            attr: {
                placeholder: 'Paste screenshots or type confirmation numbers...',
            },
        }) as HTMLTextAreaElement;
        this.notesInput.addEventListener('paste', (event) => this.handlePaste(event));

        const attachRow = notesSection.createEl('div', { cls: 'diwa-payment-modal-attach-row' });
        this.fileInput = attachRow.createEl('input', {
            cls: 'diwa-payment-modal-file-input',
            attr: {
                type: 'file',
                multiple: 'multiple',
            },
        }) as HTMLInputElement;
        this.fileInput.addEventListener('change', () => this.handleFileSelection());

        const attachBtn = attachRow.createEl('button', {
            cls: 'diwa-payment-modal-attach-btn',
            text: '📎 Attach files',
            attr: { type: 'button' },
        });
        attachBtn.addEventListener('click', () => this.fileInput?.click());

        this.previewContainer = notesSection.createEl('div', {
            cls: 'diwa-payment-modal-preview-list',
        });
    }

    private createField(parent: HTMLElement, label: string): HTMLElement {
        const field = parent.createEl('div', { cls: 'diwa-payment-modal-field' });
        field.createEl('label', {
            cls: 'diwa-payment-modal-label',
            text: label,
        });
        return field;
    }

    private createInputField(parent: HTMLElement, label: string, type: string, value: string, cls: string): HTMLInputElement {
        const field = this.createField(parent, label);
        return field.createEl('input', {
            cls,
            type,
            value,
        }) as HTMLInputElement;
    }

    private renderFooter(parent: HTMLElement, stacked = false): void {
        const footer = parent.createEl('div', {
            cls: `diwa-payment-modal-footer${stacked ? ' diwa-payment-modal-footer--mobile' : ''}`,
        });
        const cancelBtn = footer.createEl('button', {
            cls: 'diwa-payment-modal-action diwa-payment-modal-action--ghost',
            text: 'Cancel',
            attr: { type: 'button' },
        });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', {
            cls: 'diwa-payment-modal-action diwa-payment-modal-action--primary',
            text: 'Save Payment',
            attr: { type: 'button' },
        });
        saveBtn.addEventListener('click', () => {
            void this.handleSave();
        });
    }

    private handlePaste(event: ClipboardEvent): void {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (!items[i].type.startsWith('image/')) continue;
            const file = items[i].getAsFile();
            if (file) this.addFilePreview(file);
        }
    }

    private handleFileSelection(): void {
        if (!this.fileInput?.files) return;
        for (let i = 0; i < this.fileInput.files.length; i++) {
            this.addFilePreview(this.fileInput.files[i]);
        }
        this.fileInput.value = '';
    }

    private addFilePreview(file: File): void {
        if (!this.previewContainer) return;

        const row = this.previewContainer.createEl('div', {
            cls: 'diwa-payment-modal-preview-item',
        });
        const media = row.createEl('div', { cls: 'diwa-payment-modal-preview-media' });

        if (file.type.startsWith('image/')) {
            const img = media.createEl('img', {
                cls: 'diwa-payment-modal-preview-image',
                attr: { alt: file.name },
            });
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                img.src = loadEvent.target?.result as string;
            };
            reader.readAsDataURL(file);
        } else {
            media.createEl('div', {
                cls: 'diwa-payment-modal-preview-placeholder',
                text: 'FILE',
            });
        }

        const copy = row.createEl('div', { cls: 'diwa-payment-modal-preview-copy' });
        copy.createEl('div', {
            cls: 'diwa-payment-modal-preview-name',
            text: file.name,
        });
        copy.createEl('div', {
            cls: 'diwa-payment-modal-preview-meta',
            text: file.type.startsWith('image/') ? 'Image attachment' : 'File attachment',
        });

        const removeBtn = row.createEl('button', {
            cls: 'diwa-payment-modal-preview-remove',
            text: 'Remove',
            attr: {
                type: 'button',
                'aria-label': `Remove ${file.name}`,
            },
        });
        removeBtn.addEventListener('click', () => {
            const idx = this.attachedFiles.indexOf(file);
            if (idx > -1) this.attachedFiles.splice(idx, 1);
            row.remove();
        });

        this.attachedFiles.push(file);
    }

    private getNextDueDefault(): string {
        const currentDue = moment(this.currentDueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
        if (currentDue.isValid()) return currentDue.add(1, 'month').format('YYYY-MM-DD');
        const paymentBase = this.quickDate || moment().format('YYYY-MM-DD');
        return moment(paymentBase).add(1, 'month').format('YYYY-MM-DD');
    }

    private formatSummaryDate(value: string): string {
        const parsed = moment(value, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
        return parsed.isValid() ? parsed.format('MMM D, YYYY') : 'Not set';
    }

    private async handleSave(): Promise<void> {
        if (!this.paymentDateInput?.value || !this.nextDueDateInput?.value) {
            new Notice('Choose a payment date and next due date.');
            return;
        }

        try {
            await this.plugin.vault.savePayment(
                this.file,
                this.paymentDateInput.value,
                this.nextDueDateInput.value,
                this.notesInput?.value || '',
                this.attachedFiles
            );
            this.onPaymentSaved();
            this.close();
        } catch (error) {
            console.error('[DIWA PaymentModal] Failed to save payment', error);
            new Notice('Failed to save payment.');
        }
    }
}

import { App, Modal, TFile, Notice, moment } from 'obsidian';
import type DiwaPlugin from '../main';

export class PaymentModal extends Modal {
    plugin: DiwaPlugin;
    file: TFile;
    currentDueDate: string;
    onPaymentSaved: () => void;
    quickDate: string | null;

    // sec-010: Accept plugin via constructor — eliminates (app as any) runtime lookup
    constructor(app: App, plugin: DiwaPlugin, file: TFile, currentDueDate: string, onPaymentSaved: () => void, quickDate: string | null = null) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.currentDueDate = currentDueDate;
        this.onPaymentSaved = onPaymentSaved;
        this.quickDate = quickDate;
    }

    onOpen() {
        this.modalEl.style.cssText = 'border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 500px; padding: 0; overflow: hidden;';
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.padding = '0';

        const header = contentEl.createEl('div', { attr: { style: 'padding: 20px 24px 16px 24px; border-bottom: 1px solid var(--background-modifier-border-faint);' } });
        header.createEl('h3', { text: `Pay: ${this.file.basename}`, attr: { style: 'margin: 0; font-size: 1em; font-weight: 800; color: var(--text-normal);' } });

        const main = contentEl.createEl('div', { attr: { style: 'padding: 20px 24px; display: flex; flex-direction: column; gap: 20px;' } });

        const datesRow = main.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 15px;' } });
        
        const pCol = datesRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        pCol.createEl('label', { text: 'Payment Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const pInput = pCol.createEl('input', { type: 'date', value: this.quickDate || moment().format('YYYY-MM-DD'), attr: { style: 'padding: 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });

        const nCol = datesRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        nCol.createEl('label', { text: 'Next Due Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        
        const currentDueM = moment(this.currentDueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
        const nextDefault = currentDueM.isValid() ? currentDueM.add(1, 'month').format('YYYY-MM-DD') : moment(pInput.value).add(1, 'month').format('YYYY-MM-DD');
        
        const nInput = nCol.createEl('input', { type: 'date', value: nextDefault, attr: { style: 'padding: 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });

        const notesCol = main.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        notesCol.createEl('label', { text: 'Notes / Snippet / Reference', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const textArea = notesCol.createEl('textarea', { 
            placeholder: 'Paste screenshots or type confirmation numbers...',
            attr: { style: 'width: 100%; height: 120px; resize: none; padding: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } 
        });

        const previewContainer = notesCol.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;' } });
        const attachedFiles: File[] = [];

        const addFilePreview = (file: File) => {
            const wrap = previewContainer.createEl('div', { attr: { style: 'position: relative; width: 60px; height: 60px; border: 1px solid var(--background-modifier-border); border-radius: 4px; overflow: hidden; background-color: var(--background-secondary);' } });
            if (file.type.startsWith('image/')) {
                const img = wrap.createEl('img', { attr: { style: 'width: 100%; height: 100%; object-fit: cover;' } });
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target?.result as string;
                reader.readAsDataURL(file);
            } else {
                wrap.createEl('div', { text: '📎', attr: { style: 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5em;' } });
            }
            const remove = wrap.createEl('div', { text: '✕', attr: { style: 'position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: white; width: 16px; height: 16px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;' } });
            remove.onclick = () => {
                const idx = attachedFiles.indexOf(file);
                if (idx > -1) attachedFiles.splice(idx, 1);
                wrap.remove();
            };
            attachedFiles.push(file);
        };

        textArea.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) addFilePreview(file);
                }
            }
        });

        const fileRow = main.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        const fileInput = fileRow.createEl('input', { type: 'file', attr: { style: 'display: none;', multiple: 'multiple' } });
        const attachBtn = fileRow.createEl('button', { text: '📎 Attach Files', attr: { style: 'font-size: 0.85em; padding: 4px 10px;' } });
        attachBtn.onclick = () => fileInput.click();
        fileInput.onchange = () => {
            if (fileInput.files) {
                for (let i = 0; i < fileInput.files.length; i++) addFilePreview(fileInput.files[i]);
            }
        };

        const footer = main.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; padding-top: 16px; border-top: 1px solid var(--background-modifier-border-faint);' } });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 8px 16px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; cursor: pointer;' } });
        const saveBtn = footer.createEl('button', { text: 'Save Payment', attr: { style: 'padding: 8px 20px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; font-weight: 700; cursor: pointer;' } });

        cancelBtn.onclick = () => this.close();
        saveBtn.onclick = async () => {
            try {
                await this.plugin.vault.savePayment(this.file, pInput.value, nInput.value, textArea.value, attachedFiles);
                this.onPaymentSaved();
                this.close();
            } catch (e: any) {
            }
        };

        setTimeout(() => textArea.focus(), 10);
    }

    onClose() { this.contentEl.empty(); }
}


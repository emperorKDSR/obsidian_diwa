import { App, Modal, moment, setIcon } from 'obsidian';

export class DatePickerModal extends Modal {
    private initialDate: string;
    private onSelectDate: (selectedDate: string) => void;

    constructor(app: App, initialDate: string, onSelectDate: (selectedDate: string) => void) {
        super(app);
        this.initialDate = initialDate || moment().format('YYYY-MM-DD');
        this.onSelectDate = onSelectDate;
    }

    onOpen(): void {
        this.modalEl.style.cssText = 'border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 380px; padding: 0; overflow: hidden;';
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.padding = '0';

        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 20px 24px 16px 24px; border-bottom: 1px solid var(--background-modifier-border-faint);' }
        });
        const iconWrap = header.createEl('div', {
            attr: { style: 'width: 36px; height: 36px; border-radius: 50%; background: var(--interactive-accent-faint, rgba(120,80,220,0.12)); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; color: var(--interactive-accent);' }
        });
        setIcon(iconWrap, 'calendar');

        header.createEl('h3', {
            text: 'Schedule / Resurface Note',
            attr: { style: 'margin: 0 0 4px 0; font-size: 1.05em; font-weight: 700; color: var(--text-normal);' }
        });
        header.createEl('p', {
            text: 'Choose a date to be reminded of this note.',
            attr: { style: 'margin: 0; font-size: 0.88em; color: var(--text-muted); line-height: 1.4;' }
        });

        const body = contentEl.createEl('div', {
            attr: { style: 'padding: 18px 24px; display: flex; flex-direction: column; gap: 14px;' }
        });

        // Quick shortcut buttons
        const shortcutsRow = body.createEl('div', {
            attr: { style: 'display: flex; gap: 8px; flex-wrap: wrap;' }
        });

        const shortcuts = [
            { label: 'Today', days: 0 },
            { label: 'Tomorrow', days: 1 },
            { label: '+3 Days', days: 3 },
            { label: '+1 Week', days: 7 },
        ];

        const dateInput = body.createEl('input', {
            type: 'date',
            attr: {
                style: 'width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 1em;'
            }
        });
        dateInput.value = this.initialDate;

        for (const s of shortcuts) {
            const btn = shortcutsRow.createEl('button', {
                text: s.label,
                attr: {
                    style: 'padding: 6px 12px; border-radius: 14px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-muted); font-size: 0.84em; cursor: pointer;'
                }
            });
            btn.onclick = () => {
                const target = moment().add(s.days, 'days').format('YYYY-MM-DD');
                dateInput.value = target;
            };
        }

        // Footer
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 24px; display: flex; justify-content: flex-end; gap: 10px; background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border-faint);' }
        });

        const cancelBtn = footer.createEl('button', {
            text: 'Cancel',
            attr: { style: 'padding: 8px 16px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; cursor: pointer;' }
        });
        cancelBtn.onclick = () => this.close();

        const applyBtn = footer.createEl('button', {
            text: 'Apply Date',
            attr: { style: 'padding: 8px 18px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; font-weight: 700; cursor: pointer;' }
        });
        applyBtn.onclick = () => {
            const chosen = dateInput.value;
            if (chosen && moment(chosen, 'YYYY-MM-DD', true).isValid()) {
                this.onSelectDate(chosen);
                this.close();
            }
        };
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

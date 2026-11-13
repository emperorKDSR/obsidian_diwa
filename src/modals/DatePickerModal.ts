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
        this.modalEl.addClass('pos-date-picker-modal');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('pos-date-picker-content');

        const header = contentEl.createDiv({ cls: 'pos-date-picker-header' });
        const iconWrap = header.createDiv({ cls: 'pos-date-picker-icon-wrap' });
        setIcon(iconWrap, 'calendar');

        header.createEl('h3', {
            text: 'Schedule / Resurface Note',
            cls: 'pos-date-picker-title'
        });
        header.createEl('p', {
            text: 'Choose a date to be reminded of this note.',
            cls: 'pos-date-picker-subtitle'
        });

        const body = contentEl.createDiv({ cls: 'pos-date-picker-body' });

        // Quick shortcut chips
        const shortcutsRow = body.createDiv({ cls: 'pos-date-picker-shortcuts' });
        const shortcuts = [
            { label: 'Today', days: 0 },
            { label: 'Tomorrow', days: 1 },
            { label: '+3 Days', days: 3 },
            { label: '+1 Week', days: 7 }
        ];

        const chipEntries: { el: HTMLButtonElement; targetDate: string }[] = [];

        const dateInput = body.createEl('input', {
            type: 'date',
            cls: 'pos-date-picker-input'
        });
        dateInput.value = this.initialDate;

        const syncActiveChips = () => {
            const val = dateInput.value;
            for (const entry of chipEntries) {
                entry.el.toggleClass('is-active', entry.targetDate === val);
            }
        };

        for (const s of shortcuts) {
            const targetDate = moment().add(s.days, 'days').format('YYYY-MM-DD');
            const btn = shortcutsRow.createEl('button', {
                text: s.label,
                cls: 'pos-date-picker-chip'
            });
            chipEntries.push({ el: btn, targetDate });
            btn.onclick = () => {
                dateInput.value = targetDate;
                syncActiveChips();
            };
        }

        syncActiveChips();
        dateInput.oninput = syncActiveChips;

        // Footer
        const footer = contentEl.createDiv({ cls: 'pos-date-picker-footer' });

        const cancelBtn = footer.createEl('button', {
            text: 'Cancel',
            cls: 'pos-date-picker-btn-cancel'
        });
        cancelBtn.onclick = () => this.close();

        const applyBtn = footer.createEl('button', {
            text: 'Apply Date',
            cls: 'pos-date-picker-btn-apply'
        });

        const applySelectedDate = () => {
            const chosen = dateInput.value;
            if (chosen && moment(chosen, 'YYYY-MM-DD', true).isValid()) {
                this.onSelectDate(chosen);
                this.close();
            }
        };

        applyBtn.onclick = applySelectedDate;
        dateInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applySelectedDate();
            }
        };
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

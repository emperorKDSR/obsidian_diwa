import { App } from 'obsidian';
import type DiwaPlugin from '../main';
import { attachInlineTriggers } from '../utils';

export interface JournalComposerValue {
    title: string;
    body: string;
    contexts: string[];
    journalType: string | null;
}

export interface JournalComposerOptions {
    app: App;
    plugin: DiwaPlugin;
    parent: HTMLElement;
    mode: 'new' | 'edit';
    value: JournalComposerValue;
    variant: 'mobile' | 'modal' | 'embedded';
    autoFocus?: boolean;
    onCancel?: () => void;
    onSave: (value: JournalComposerValue) => Promise<void> | void;
}

export function renderJournalComposer(options: JournalComposerOptions): void {
    const { parent, value, onSave, onCancel, app, plugin, autoFocus } = options;
    parent.empty();

    const container = parent.createEl('div', { cls: 'diwa-journal-composer' });

    const titleInput = container.createEl('input', {
        cls: 'diwa-journal-title-input',
        attr: { type: 'text', placeholder: 'Title (optional)' },
    });
    titleInput.value = value.title || '';

    const textarea = container.createEl('textarea', {
        cls: 'diwa-journal-body-input',
        attr: { placeholder: 'Write your journal entry...', rows: '8' },
    });
    textarea.value = value.body || '';

    attachInlineTriggers(
        app,
        textarea,
        () => {},
        undefined,
        () => plugin.getContexts(),
        plugin.settings.peopleFolder,
    );

    const btnRow = container.createEl('div', { cls: 'diwa-journal-actions' });
    if (onCancel) {
        const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', onCancel);
    }

    const saveBtn = btnRow.createEl('button', { cls: 'mod-cta', text: options.mode === 'new' ? 'Save Entry' : 'Update Entry' });
    saveBtn.addEventListener('click', async () => {
        await onSave({
            ...value,
            title: titleInput.value.trim(),
            body: textarea.value.trim(),
        });
    });

    if (autoFocus) {
        setTimeout(() => textarea.focus(), 50);
    }
}

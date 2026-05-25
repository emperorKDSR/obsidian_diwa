import { App, moment, setIcon } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    attachInlineTriggers,
    attachMediaPasteHandler,
    insertFilesAtCursor,
} from '../utils';
import {
    getJournalTypeOption,
    JOURNAL_TYPES,
    type JournalTypeId,
} from './shared';

export interface JournalComposerValue {
    title: string;
    body: string;
    contexts: string[];
    journalType: JournalTypeId | null;
}

interface JournalComposerOptions {
    app: App;
    plugin: DiwaPlugin;
    parent: HTMLElement;
    mode: 'new' | 'edit';
    value: JournalComposerValue;
    variant: 'desktop' | 'mobile' | 'modal';
    created?: string;
    modified?: string;
    autoFocus?: boolean;
    onChange?: (value: JournalComposerValue) => void;
    onSave: (value: JournalComposerValue) => Promise<void>;
    onDelete?: () => Promise<void> | void;
    onCancel?: () => void;
}

export interface JournalComposerController {
    focus(): void;
}

export function renderJournalComposer(options: JournalComposerOptions): JournalComposerController {
    const {
        app,
        plugin,
        parent,
        mode,
        value,
        variant,
        created,
        modified,
        autoFocus = false,
        onChange,
        onSave,
        onDelete,
        onCancel,
    } = options;

    let title = value.title || '';
    let body = value.body || '';
    let contexts = Array.from(new Set((value.contexts ?? []).map((ctx) => String(ctx || '').trim()).filter(Boolean)));
    let journalType = value.journalType ?? null;
    let savePending = false;

    const root = parent.createDiv(`diwa-journal-composer diwa-journal-composer--${variant}`);
    const surface = root.createDiv('diwa-journal-composer__surface');
    const header = surface.createDiv('diwa-journal-composer__header');
    const meta = header.createDiv('diwa-journal-composer__meta');

    const metaBadge = meta.createSpan({
        cls: 'diwa-journal-composer__badge',
        text: mode === 'new' ? 'New entry' : 'Editing',
    });
    if (mode === 'edit') metaBadge.addClass('is-editing');

    const metaText = meta.createSpan({
        cls: 'diwa-journal-composer__meta-text',
        text: buildMetaLabel(created, modified, mode),
    });

    const headerActions = header.createDiv('diwa-journal-composer__header-actions');
    const fileInput = surface.createEl('input', {
        attr: {
            type: 'file',
            multiple: 'true',
            accept: '*/*',
            style: 'display:none',
        },
    }) as HTMLInputElement;

    const attachBtn = headerActions.createEl('button', {
        cls: 'diwa-journal-composer__ghost-btn',
        attr: {
            type: 'button',
            'aria-label': 'Attach files',
        },
    });
    setIcon(attachBtn, 'paperclip');
    attachBtn.createSpan({ text: 'Attach' });
    attachBtn.addEventListener('click', () => fileInput.click());

    const titleInput = surface.createEl('input', {
        cls: 'diwa-journal-composer__title',
        attr: {
            type: 'text',
            placeholder: 'Journal title',
            'aria-label': 'Journal title',
        },
    }) as HTMLInputElement;
    titleInput.value = title;

    const typeRow = surface.createDiv('diwa-journal-composer__types');
    const typeButtons = new Map<string, HTMLButtonElement>();

    const bodyWrap = surface.createDiv('diwa-journal-composer__body-wrap');
    const bodyInput = bodyWrap.createEl('textarea', {
        cls: 'diwa-journal-composer__body',
        attr: {
            placeholder: getJournalTypeOption(journalType).placeholder,
            'aria-label': 'Journal body',
        },
    }) as HTMLTextAreaElement;
    bodyInput.value = body;

    const contextsRow = surface.createDiv('diwa-journal-composer__contexts');
    const footer = surface.createDiv('diwa-journal-composer__footer');
    const footerHint = footer.createDiv('diwa-journal-composer__hint');
    footerHint.createSpan({ text: 'Paste, drag, or choose files. Use # to add contexts.' });

    const footerActions = footer.createDiv('diwa-journal-composer__actions');
    if (onDelete) {
        const deleteBtn = footerActions.createEl('button', {
            cls: 'diwa-journal-composer__subtle-btn is-danger',
            text: 'Delete',
            attr: { type: 'button', 'aria-label': 'Delete journal entry' },
        });
        deleteBtn.addEventListener('click', () => { void Promise.resolve(onDelete()); });
    }
    if (onCancel) {
        const cancelBtn = footerActions.createEl('button', {
            cls: 'diwa-journal-composer__subtle-btn',
            text: mode === 'new' ? 'Reset' : 'Cancel',
            attr: { type: 'button', 'aria-label': mode === 'new' ? 'Reset journal composer' : 'Cancel journal editing' },
        });
        cancelBtn.addEventListener('click', () => onCancel());
    }
    const saveBtn = footerActions.createEl('button', {
        cls: 'diwa-journal-composer__save-btn',
        text: mode === 'new' ? 'Save entry' : 'Update entry',
        attr: { type: 'button', 'aria-label': mode === 'new' ? 'Save journal entry' : 'Update journal entry' },
    }) as HTMLButtonElement;

    const emitChange = () => {
        onChange?.({
            title,
            body,
            contexts: [...contexts],
            journalType,
        });
    };

    const renderContexts = () => {
        contextsRow.empty();
        if (contexts.length === 0) {
            contextsRow.createSpan({
                cls: 'diwa-journal-composer__context-hint',
                text: 'No extra contexts yet',
            });
            return;
        }
        contexts.forEach((ctx) => {
            const chip = contextsRow.createSpan({ cls: 'diwa-journal-composer__chip' });
            chip.createSpan({ text: `#${ctx}` });
            const removeBtn = chip.createEl('button', {
                cls: 'diwa-journal-composer__chip-remove',
                text: '×',
                attr: { type: 'button', 'aria-label': `Remove #${ctx}` },
            });
            removeBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                contexts = contexts.filter((value) => value !== ctx);
                renderContexts();
                emitChange();
            });
        });
    };

    const syncSaveState = () => {
        const disabled = savePending || !title.trim();
        saveBtn.disabled = disabled;
        saveBtn.toggleClass('is-disabled', disabled);
    };

    const syncBodyPlaceholder = () => {
        bodyInput.placeholder = getJournalTypeOption(journalType).placeholder;
    };

    const autoGrowBody = () => {
        bodyInput.style.height = 'auto';
        bodyInput.style.height = `${Math.max(bodyInput.scrollHeight, variant === 'mobile' ? 260 : 320)}px`;
    };

    const setActiveType = (typeId: JournalTypeId | null) => {
        journalType = typeId;
        typeButtons.forEach((button, id) => {
            const active = id === (typeId ?? 'free');
            button.toggleClass('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        syncBodyPlaceholder();
        emitChange();
    };

    JOURNAL_TYPES.forEach((type) => {
        const button = typeRow.createEl('button', {
            cls: 'diwa-journal-composer__type-pill',
            attr: {
                type: 'button',
                'aria-pressed': 'false',
                'aria-label': `${type.label} journal type`,
            },
        }) as HTMLButtonElement;
        button.createSpan({ cls: 'diwa-journal-composer__type-icon', text: type.icon });
        button.createSpan({ cls: 'diwa-journal-composer__type-label', text: type.label });
        button.addEventListener('click', () => {
            setActiveType(type.id === 'free' ? null : type.id);
            bodyInput.focus();
        });
        typeButtons.set(type.id, button);
    });

    titleInput.addEventListener('input', () => {
        title = titleInput.value;
        syncSaveState();
        emitChange();
    });

    bodyInput.addEventListener('input', () => {
        body = bodyInput.value;
        autoGrowBody();
        emitChange();
    });

    bodyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleSave();
        }
    });

    const handleSave = async () => {
        if (savePending || !title.trim()) return;
        savePending = true;
        syncSaveState();
        try {
            await onSave({
                title: title.trim(),
                body: body.trim(),
                contexts: [...contexts],
                journalType,
            });
        } finally {
            savePending = false;
            syncSaveState();
        }
    };

    saveBtn.addEventListener('click', () => { void handleSave(); });

    fileInput.addEventListener('change', () => {
        if (!fileInput.files?.length) return;
        const files = Array.from(fileInput.files);
        void insertFilesAtCursor(
            app,
            bodyInput,
            files,
            () => plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
            { prefix: 'journal' },
        ).then(() => {
            body = bodyInput.value;
            autoGrowBody();
            emitChange();
            fileInput.value = '';
        });
    });

    attachInlineTriggers(
        app,
        bodyInput,
        () => {},
        (tag: string) => {
            if (!tag || contexts.includes(tag)) return;
            contexts = [...contexts, tag];
            renderContexts();
            emitChange();
        },
        () => plugin.settings.contexts ?? [],
        plugin.settings.peopleFolder,
    );

    attachMediaPasteHandler(
        app,
        bodyInput,
        () => plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
        { prefix: 'journal' },
    );

    surface.addEventListener('dragover', (event) => {
        const dragEvent = event as DragEvent;
        if (!dragEvent.dataTransfer?.files?.length) return;
        event.preventDefault();
        surface.addClass('is-dragover');
        dragEvent.dataTransfer.dropEffect = 'copy';
    });
    surface.addEventListener('dragleave', () => surface.removeClass('is-dragover'));
    surface.addEventListener('drop', (event) => {
        const dragEvent = event as DragEvent;
        const files = dragEvent.dataTransfer?.files;
        surface.removeClass('is-dragover');
        if (!files?.length) return;
        const target = dragEvent.target as HTMLElement | null;
        if (target?.closest('textarea')) return;
        event.preventDefault();
        void insertFilesAtCursor(
            app,
            bodyInput,
            Array.from(files),
            () => plugin.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
            { prefix: 'journal' },
        ).then(() => {
            body = bodyInput.value;
            autoGrowBody();
            emitChange();
            bodyInput.focus();
        });
    });

    renderContexts();
    setActiveType(journalType);
    syncSaveState();
    autoGrowBody();

    if (autoFocus) {
        window.setTimeout(() => {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        }, 50);
    }

    return {
        focus: () => {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        },
    };
}

function buildMetaLabel(created: string | undefined, modified: string | undefined, mode: 'new' | 'edit'): string {
    if (mode === 'new') return `Today · ${moment().format('ddd, MMM D')}`;
    const createdLabel = created ? `Created ${moment(created, 'YYYY-MM-DD HH:mm:ss', true).isValid() ? moment(created, 'YYYY-MM-DD HH:mm:ss').format('MMM D') : created}` : '';
    const modifiedLabel = modified ? `Updated ${moment(modified, 'YYYY-MM-DD HH:mm:ss', true).isValid() ? moment(modified, 'YYYY-MM-DD HH:mm:ss').fromNow() : modified}` : '';
    return [createdLabel, modifiedLabel].filter(Boolean).join(' · ') || 'Existing entry';
}

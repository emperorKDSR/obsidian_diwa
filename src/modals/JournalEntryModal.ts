import { App, Modal, Platform } from 'obsidian';
import DiwaPlugin from '../main';
import { renderJournalComposer, type JournalComposerValue } from '../journal/JournalComposer';
import {
    buildJournalContexts,
    getThoughtDisplayTitle,
    inferJournalType,
    stripReservedJournalContexts,
} from '../journal/shared';

export class JournalEntryModal extends Modal {
    constructor(
        app: App,
        private plugin: DiwaPlugin,
        private mode: 'new' | 'edit',
        private initialText: string,
        private filePath: string | null,
        private onSave: (value: JournalComposerValue & { contexts: string[] }) => Promise<void>,
        private initialContexts: string[] = [],
        private initialTitle = '',
        private initialJournalType: string | null = null,
    ) {
        super(app);
    }

    onOpen() {
        this.modalEl.addClass('diwa-journal-entry-modal');
        this.contentEl.empty();

        const initialValue: JournalComposerValue = {
            title: this.mode === 'new'
                ? (this.initialTitle || '')
                : getThoughtDisplayTitle({ title: this.initialTitle, body: this.initialText }, 'Untitled journal'),
            body: this.initialText.replace(/<br>/g, '\n'),
            contexts: stripReservedJournalContexts(this.initialContexts),
            journalType: inferJournalType({
                journalType: this.initialJournalType,
                context: this.initialContexts,
            }),
        };

        renderJournalComposer({
            app: this.app,
            plugin: this.plugin,
            parent: this.contentEl,
            mode: this.mode,
            value: initialValue,
            variant: Platform.isMobile ? 'mobile' : 'modal',
            autoFocus: true,
            onCancel: () => this.close(),
            onSave: async (value) => {
                await this.onSave({
                    ...value,
                    contexts: buildJournalContexts(value.contexts, value.journalType),
                });
                this.close();
            },
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

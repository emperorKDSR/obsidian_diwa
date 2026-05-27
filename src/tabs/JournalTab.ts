import { Notice, Platform, moment, setIcon } from 'obsidian';
import { BaseTab } from './BaseTab';
import { ConfirmModal } from '../modals/ConfirmModal';
import { renderJournalComposer, type JournalComposerValue } from '../journal/JournalComposer';
import {
    buildJournalContexts,
    getJournalTypeOption,
    getThoughtDisplayTitle,
    getThoughtPreviewLine,
    inferJournalType,
    JOURNAL_CONTEXT,
    stripReservedJournalContexts,
    type JournalTypeId,
} from '../journal/shared';
import type { ThoughtEntry } from '../types';
import { isTablet } from '../utils';
import { normalizeThoughtTopics } from '../utils/topics';

interface JournalEditorState extends JournalComposerValue {
    filePath: string | null;
    created?: string;
    modified?: string;
}

type DesktopJournalMode = 'new' | 'existing';
const LOW_SIGNAL_JOURNAL_RAIL_TYPES = new Set<JournalTypeId | null>(['idea', 'free']);

export class JournalTab extends BaseTab {
    private editorState: JournalEditorState = this.createBlankState();
    private selectedPath: string | null = null;
    private desktopMode: DesktopJournalMode = 'existing';
    private focusComposerOnRender = false;

    render(container: HTMLElement) {
        container.empty();
        const entries = this.getJournalEntries();
        const isMobilePhone = Platform.isMobile && !isTablet();

        if (isMobilePhone) {
            this.ensureMobileState();
            this.renderMobile(container);
            return;
        }

        this.ensureDesktopState(entries);
        this.renderDesktop(container, entries);
    }

    private renderDesktop(container: HTMLElement, entries: ThoughtEntry[]): void {
        const root = container.createDiv('diwa-journal-workspace');
        const rail = root.createDiv('diwa-journal-rail');
        const railHeader = rail.createDiv('diwa-journal-rail__header');
        const railCopy = railHeader.createDiv('diwa-journal-rail__copy');
        railCopy.createSpan({ cls: 'diwa-journal-rail__eyebrow', text: 'Journal archive' });
        railCopy.createEl('h2', { cls: 'diwa-journal-rail__title', text: 'Journal' });
        railCopy.createSpan({
            cls: 'diwa-journal-rail__meta',
            text: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
        });

        const newBtn = railHeader.createEl('button', {
            cls: 'diwa-journal-rail__new-btn',
            attr: { type: 'button', 'aria-label': 'Create a new journal entry' },
        });
        setIcon(newBtn, 'plus');
        newBtn.createSpan({ text: 'New' });
        newBtn.addEventListener('click', () => {
            this.startNewEntry(true);
            this.view.renderView();
        });

        const railList = rail.createDiv('diwa-journal-rail__list');
        if (entries.length === 0) {
            railList.createDiv({
                cls: 'diwa-journal-rail__empty',
                text: 'No journal entries yet.',
            });
        } else {
            entries.forEach((entry) => {
                const journalType = getJournalTypeOption(inferJournalType(entry));
                const preview = getThoughtPreviewLine(entry, 'Open this entry to keep writing.');
                const metadataChips = [
                    ...normalizeThoughtTopics(entry.topic),
                    ...stripReservedJournalContexts(entry.context).slice(0, 2),
                ];
                const shouldRenderTypeChip = !LOW_SIGNAL_JOURNAL_RAIL_TYPES.has(journalType.id);
                const item = railList.createEl('button', {
                    cls: 'diwa-journal-rail__item',
                    attr: {
                        type: 'button',
                        'aria-pressed': entry.filePath === this.selectedPath ? 'true' : 'false',
                        title: getThoughtDisplayTitle(entry, 'Untitled journal'),
                    },
                });
                if (entry.filePath === this.selectedPath) item.addClass('is-active');

                const indicator = item.createDiv('diwa-journal-rail__item-indicator');
                indicator.createSpan({ text: journalType.icon });

                const itemContent = item.createDiv('diwa-journal-rail__item-content');
                const itemTop = itemContent.createDiv('diwa-journal-rail__item-top');
                itemTop.createEl('h4', {
                    cls: 'diwa-journal-rail__item-title',
                    text: getThoughtDisplayTitle(entry, 'Untitled journal'),
                });
                itemTop.createSpan({
                    cls: 'diwa-journal-rail__item-time',
                    text: this.formatEntryTimestamp(entry),
                });

                itemContent.createDiv({
                    cls: 'diwa-journal-rail__item-preview',
                    text: preview,
                });

                if (shouldRenderTypeChip || metadataChips.length) {
                    const itemChips = itemContent.createDiv('diwa-journal-rail__item-chips');
                    if (shouldRenderTypeChip) {
                        itemChips.createSpan({
                            cls: 'diwa-journal-rail__item-chip is-type',
                            text: `${journalType.icon} ${journalType.label}`,
                        });
                    }
                    metadataChips.forEach((chip) => {
                        itemChips.createSpan({
                            cls: 'diwa-journal-rail__item-chip',
                            text: chip,
                        });
                    });
                }

                item.addEventListener('click', () => {
                    this.loadEntry(entry, false);
                    this.view.renderView();
                });
            });
        }

        const main = root.createDiv('diwa-journal-main');
        const mainHeader = main.createDiv('diwa-journal-main__header');
        const mainCopy = mainHeader.createDiv('diwa-journal-main__copy');
        mainCopy.createSpan({ cls: 'diwa-journal-main__eyebrow', text: 'Writing workspace' });
        mainCopy.createEl('h3', {
            cls: 'diwa-journal-main__title',
            text: this.editorState.filePath ? 'Refine entry' : 'Compose entry',
        });
        mainCopy.createSpan({
            cls: 'diwa-journal-main__meta',
            text: this.editorState.filePath
                ? 'Titles stay pinned to the archive. Type, body, and attachments update in place.'
                : 'Give the entry a clear title, choose a type, then write into the body.',
        });

        renderJournalComposer({
            app: this.app,
            plugin: this.plugin,
            parent: main,
            mode: this.editorState.filePath ? 'edit' : 'new',
            value: {
                title: this.editorState.title,
                body: this.editorState.body,
                contexts: this.editorState.contexts,
                journalType: this.editorState.journalType,
            },
            created: this.editorState.created,
            modified: this.editorState.modified,
            variant: 'desktop',
            autoFocus: this.consumeAutoFocus(),
            onChange: (value) => {
                this.editorState = {
                    ...this.editorState,
                    ...value,
                };
            },
            onCancel: () => {
                if (this.editorState.filePath) {
                    const entry = entries.find((item) => item.filePath === this.editorState.filePath);
                    if (entry) this.loadEntry(entry, false);
                } else {
                    this.loadDesktopFallbackEntry(entries, false);
                }
                this.view.renderView();
            },
            onDelete: this.editorState.filePath
                ? async () => {
                    const path = this.editorState.filePath;
                    if (!path) return;
                    new ConfirmModal(this.app, 'Move this journal entry to trash?', async () => {
                        await this.vault.deleteFile(path, 'thoughts');
                        this.loadDesktopFallbackEntry(
                            entries.filter((entry) => entry.filePath !== path),
                            false,
                        );
                        this.view.renderView();
                    }).open();
                }
                : undefined,
            onSave: async (value) => {
                const wasEditing = !!this.editorState.filePath;
                const saved = await this.saveEntry(value);
                if (!saved) {
                    new Notice('Failed to save journal entry.');
                    return;
                }
                this.loadEntry(saved, false);
                new Notice(wasEditing ? 'Journal entry updated' : 'Journal entry saved');
                this.view.renderView();
            },
        });
    }

    private renderMobile(container: HTMLElement): void {
        const root = container.createDiv('diwa-journal-mobile');
        const shell = root.createDiv('diwa-journal-mobile__shell');
        renderJournalComposer({
            app: this.app,
            plugin: this.plugin,
            parent: shell,
            mode: 'new',
            value: {
                title: this.editorState.title,
                body: this.editorState.body,
                contexts: this.editorState.contexts,
                journalType: this.editorState.journalType,
            },
            variant: 'mobile',
            autoFocus: this.consumeAutoFocus() || this.plugin.consumeJournalInputFocusRequest(),
            onChange: (value) => {
                this.editorState = {
                    ...this.editorState,
                    ...value,
                    filePath: null,
                };
            },
            onCancel: () => {
                this.startNewEntry(false);
                this.view.renderView();
            },
            onSave: async (value) => {
                const saved = await this.saveEntry(value);
                if (!saved) {
                    new Notice('Failed to save journal entry.');
                    return;
                }
                new Notice('Journal entry saved');
                this.startNewEntry(true);
                this.view.renderView();
            },
        });
    }

    private getJournalEntries(): ThoughtEntry[] {
        return Array.from(this.index.thoughtIndex.values())
            .filter((entry) => Array.isArray(entry.context) && entry.context.includes(JOURNAL_CONTEXT))
            .sort((left, right) =>
                moment(right.modified || right.created, 'YYYY-MM-DD HH:mm:ss').valueOf()
                - moment(left.modified || left.created, 'YYYY-MM-DD HH:mm:ss').valueOf(),
            );
    }

    private ensureDesktopState(entries: ThoughtEntry[]): void {
        if (this.desktopMode === 'new') {
            if (this.editorState.filePath) {
                this.startNewEntry(false);
            }
            return;
        }

        if (this.editorState.filePath) {
            const current = entries.find((entry) => entry.filePath === this.editorState.filePath);
            if (current) return;
            this.selectedPath = null;
            this.editorState = this.createBlankState();
        }

        if (!this.selectedPath && (this.editorState.title.trim() || this.editorState.body.trim())) return;
        if (this.selectedPath) {
            const selected = entries.find((entry) => entry.filePath === this.selectedPath);
            if (selected) {
                this.loadEntry(selected, false);
                return;
            }
        }

        if (entries.length > 0) {
            this.loadEntry(entries[0], false);
            return;
        }

        if (!this.editorState.filePath) {
            this.startNewEntry(false);
        }
    }

    private ensureMobileState(): void {
        if (this.editorState.filePath) {
            this.editorState = this.createBlankState();
        }
    }

    private loadEntry(entry: ThoughtEntry, autoFocus: boolean): void {
        this.desktopMode = 'existing';
        this.selectedPath = entry.filePath;
        this.editorState = {
            filePath: entry.filePath,
            title: getThoughtDisplayTitle(entry, 'Untitled journal'),
            body: entry.body || entry.content || '',
            contexts: stripReservedJournalContexts(entry.context),
            journalType: inferJournalType(entry),
            created: entry.created,
            modified: entry.modified,
        };
        this.focusComposerOnRender = autoFocus;
    }

    private startNewEntry(autoFocus: boolean): void {
        this.desktopMode = 'new';
        this.selectedPath = null;
        this.editorState = this.createBlankState();
        this.focusComposerOnRender = autoFocus;
    }

    private loadDesktopFallbackEntry(entries: ThoughtEntry[], autoFocus: boolean): void {
        if (entries.length > 0) {
            this.loadEntry(entries[0], autoFocus);
            return;
        }
        this.startNewEntry(autoFocus);
    }

    private createBlankState(overrides: Partial<JournalEditorState> = {}): JournalEditorState {
        return {
            filePath: null,
            title: '',
            body: '',
            contexts: [],
            journalType: null,
            ...overrides,
        };
    }

    private consumeAutoFocus(): boolean {
        const shouldFocus = this.focusComposerOnRender;
        this.focusComposerOnRender = false;
        return shouldFocus;
    }

    private async saveEntry(value: JournalComposerValue): Promise<ThoughtEntry | null> {
        const contexts = buildJournalContexts(value.contexts, value.journalType);
        const editingPath = this.editorState.filePath;
        if (editingPath) {
            return await this.plugin.getThoughtController().updateThought({
                filePath: editingPath,
                title: value.title,
                content: value.body,
                context: contexts,
                journalType: value.journalType,
            });
        }

        return await this.plugin.getThoughtController().addThought({
            title: value.title,
            content: value.body,
            context: contexts,
            journalType: value.journalType,
        });
    }

    private formatEntryTimestamp(entry: ThoughtEntry): string {
        const source = entry.modified || entry.created;
        const parsed = moment(source, 'YYYY-MM-DD HH:mm:ss', true);
        if (!parsed.isValid()) return source;
        if (parsed.isSame(moment(), 'day')) return parsed.format('h:mm A');
        if (parsed.isSame(moment(), 'year')) return parsed.format('MMM D');
        return parsed.format('MMM D, YYYY');
    }
}

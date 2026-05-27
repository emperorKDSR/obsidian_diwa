import { MarkdownRenderer, TFile, moment, setIcon } from 'obsidian';
import { BaseTab } from './BaseTab';
import type { ThoughtEntry } from '../types';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ICON_EYE, ICON_TRASH } from '../constants';
import { normalizeThoughtTopics, toStoredThoughtTopic } from '../utils/topics';

type ArchivedFilter = 'false' | 'true' | 'all';

interface FilterOption<T extends string> {
    value: T;
    label: string;
}

interface SynthesisCardBinding {
    row: HTMLElement;
    archived: boolean;
    contexts: string[];
    topics: string[];
}

export class SynthesisTab extends BaseTab {
    private hostContainer: HTMLElement | null = null;
    private inlineMetaRefreshHoldUntil = 0;

    render(container: HTMLElement): void {
        this.hostContainer = container;
        this.renderWorkspace(container);
    }

    onunload(): void {
        this.hostContainer = null;
    }

    onThoughtsRefresh(): void {
        // Inline metadata edits already patch the visible card; ignore the trailing
        // global refresh burst so the redesigned surface does not flicker.
        if (Date.now() < this.inlineMetaRefreshHoldUntil) return;
        if (this.hostContainer?.isConnected) this.render(this.hostContainer);
    }

    onTasksRefresh(): void {
        // Synthesis is thought-only; ignore task-only refreshes so task sync does not
        // force full rerenders that can leave the loading state stuck onscreen.
    }

    private renderWorkspace(container: HTMLElement): void {
        container.empty();

        const wrap = container.createEl('div', { cls: 'diwa-tab-wrap diwa-synth-workspace diwa-synth-workspace--redesign' });
        const header = this.renderPageHeader(
            wrap,
            'Synthesis',
            'Review raw thoughts, refine their metadata, and keep them aligned with the DIWA workspace.'
        );
        header.addClass('diwa-synth-page-header');

        const stage = wrap.createEl('div', { cls: 'diwa-synth-stage' });

        try {
            const thoughts = Array.from(this.index.thoughtIndex.values())
                .sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
            const allContexts = this.collectAllContexts(thoughts);
            const allTopics = this.collectAllTopics(thoughts);
            const globalTopicsForCards = Array.from(allTopics).sort((a, b) => a.localeCompare(b));

            this.renderSummaryGrid(
                stage,
                thoughts.length,
                thoughts.filter((thought) => !thought.synthesized).length,
                thoughts.filter((thought) => thought.synthesized).length,
                allContexts.size,
            );

            if (thoughts.length === 0) {
                if (!this.plugin.getThoughtController().isReady()) {
                    this.renderEmptyStateCard(
                        stage,
                        'Indexing thought notes',
                        'DIWA is still building the thought index. Synthesis will populate automatically once indexing is complete.',
                    );
                } else {
                    this.renderEmptyStateCard(
                        stage,
                        'No thought notes yet',
                        'Capture or import thoughts first. They will appear here for synthesis review once indexed.',
                    );
                }
                return;
            }

            const controls = stage.createEl('section', { cls: 'diwa-card diwa-synth-controls' });
            const controlsTop = controls.createEl('div', { cls: 'diwa-synth-controls-top' });
            const resultChip = controlsTop.createEl('span', { cls: 'diwa-synth-results-chip' });
            controlsTop.createEl('span', {
                cls: 'diwa-synth-controls-hint',
                text: 'Use DIWA-style filters, then edit archive, context, or topics directly from each thought card.',
            });

            const filterGrid = controls.createEl('div', { cls: 'diwa-synth-filter-grid' });

            const sortedContexts = Array.from(allContexts).sort((a, b) => a.localeCompare(b));
            const sortedTopics = Array.from(allTopics).sort((a, b) => a.localeCompare(b));

            let archivedFilter: ArchivedFilter = this.view.synthesisTableArchivedFilter || 'false';
            let contextFilter = sortedContexts.includes(this.view.synthesisTableContextFilter)
                ? this.view.synthesisTableContextFilter
                : 'all';
            let topicFilter = sortedTopics.includes(this.view.synthesisTableTopicFilter)
                ? this.view.synthesisTableTopicFilter
                : 'all';

            this.view.synthesisTableArchivedFilter = archivedFilter;
            this.view.synthesisTableContextFilter = contextFilter;
            this.view.synthesisTableTopicFilter = topicFilter;

            const listSection = stage.createEl('section', { cls: 'diwa-synth-list-section' });
            const list = listSection.createEl('div', { cls: 'diwa-synth-list' });
            const emptyFiltered = listSection.createEl('div', { cls: 'diwa-synth-empty diwa-synth-empty--filtered' });
            emptyFiltered.style.display = 'none';
            this.populateEmptyStateIcon(emptyFiltered, 'funnel');
            emptyFiltered.createEl('strong', { text: 'No thoughts match these filters', cls: 'diwa-synth-empty-title' });
            emptyFiltered.createEl('span', {
                text: 'Try widening the status, context, or topic filters to bring more thoughts back into view.',
                cls: 'diwa-synth-empty-copy',
            });

            let applyFilters = () => {};
            const cards = thoughts.map((thought) =>
                this.renderThoughtCard(list, thought, () => applyFilters(), globalTopicsForCards),
            );

            this.renderFilterGroup(
                filterGrid,
                'Status',
                [
                    { value: 'false', label: 'Needs review' },
                    { value: 'true', label: 'Processed' },
                    { value: 'all', label: 'All thoughts' },
                ],
                () => archivedFilter,
                (value) => {
                    archivedFilter = value;
                    this.view.synthesisTableArchivedFilter = value;
                    applyFilters();
                },
            );

            this.renderFilterGroup(
                filterGrid,
                'Context',
                [{ value: 'all', label: 'All contexts' }, ...sortedContexts.map((value) => ({ value, label: value }))],
                () => contextFilter,
                (value) => {
                    contextFilter = value;
                    this.view.synthesisTableContextFilter = value;
                    applyFilters();
                },
            );

            this.renderFilterGroup(
                filterGrid,
                'Topic',
                [{ value: 'all', label: 'All topics' }, ...sortedTopics.map((value) => ({ value, label: value }))],
                () => topicFilter,
                (value) => {
                    topicFilter = value;
                    this.view.synthesisTableTopicFilter = value;
                    applyFilters();
                },
            );

            applyFilters = () => {
                let visible = 0;
                for (const card of cards) {
                    const archivedOk = archivedFilter === 'all'
                        ? true
                        : archivedFilter === 'true'
                            ? card.archived
                            : !card.archived;
                    const contextOk = contextFilter === 'all'
                        ? true
                        : card.contexts.some((context) => context.toLowerCase() === contextFilter.toLowerCase());
                    const topicOk = topicFilter === 'all'
                        ? true
                        : card.topics.some((topic) => topic.toLowerCase() === topicFilter.toLowerCase());
                    const show = archivedOk && contextOk && topicOk;
                    card.row.style.display = show ? '' : 'none';
                    if (show) visible++;
                }

                resultChip.setText(`${visible} of ${thoughts.length} thoughts visible`);
                emptyFiltered.style.display = visible === 0 ? '' : 'none';
            };

            applyFilters();
        } catch (error) {
            console.error('[DIWA SynthesisTab] Render phase failed', { error });
            stage.empty();
            this.renderEmptyStateCard(
                stage,
                'Synthesis error',
                'An unexpected error prevented the workspace from rendering. Open the developer console for details.',
            );
        }
    }

    private holdInlineMetaRefresh(ms = 900): void {
        const holdUntil = Date.now() + ms;
        if (holdUntil > this.inlineMetaRefreshHoldUntil) {
            this.inlineMetaRefreshHoldUntil = holdUntil;
        }
    }

    private renderSummaryGrid(
        parent: HTMLElement,
        totalThoughts: number,
        rawThoughts: number,
        processedThoughts: number,
        contextCount: number,
    ): void {
        const summary = parent.createEl('section', { cls: 'diwa-synth-summary-grid' });
        this.renderSummaryCard(summary, 'Thoughts', totalThoughts, 'Indexed in synthesis');
        this.renderSummaryCard(summary, 'Needs review', rawThoughts, 'Unprocessed notes');
        this.renderSummaryCard(summary, 'Processed', processedThoughts, 'Archived in synthesis');
        this.renderSummaryCard(summary, 'Contexts', contextCount, 'Available focus lanes');
    }

    private renderSummaryCard(parent: HTMLElement, label: string, value: number, subtitle: string): void {
        const card = parent.createEl('div', { cls: 'diwa-synth-summary-card' });
        card.createEl('span', { text: label, cls: 'diwa-synth-summary-label' });
        card.createEl('strong', { text: String(value), cls: 'diwa-synth-summary-value' });
        card.createEl('span', { text: subtitle, cls: 'diwa-synth-summary-sub' });
    }

    private renderFilterGroup<T extends string>(
        parent: HTMLElement,
        label: string,
        options: Array<FilterOption<T>>,
        getValue: () => T,
        onSelect: (value: T) => void,
    ): void {
        const group = parent.createEl('div', { cls: 'diwa-synth-filter-group' });
        group.createEl('span', { text: label, cls: 'diwa-synth-filter-label' });
        const rail = group.createEl('div', { cls: 'diwa-filter-pills diwa-synth-filter-rail' });
        const buttons = new Map<T, HTMLButtonElement>();

        const syncButtons = () => {
            const active = getValue();
            buttons.forEach((button, value) => {
                button.classList.toggle('is-active', value === active);
            });
        };

        for (const option of options) {
            const button = rail.createEl('button', {
                text: option.label,
                cls: 'diwa-filter-pill diwa-synth-filter-pill',
                attr: { type: 'button' },
            });
            buttons.set(option.value, button);
            button.addEventListener('click', () => {
                onSelect(option.value);
                syncButtons();
            });
        }

        syncButtons();
    }

    private renderThoughtCard(
        list: HTMLElement,
        thought: ThoughtEntry,
        onMetaChange?: () => void,
        globalTopics?: string[],
    ): SynthesisCardBinding {
        const row = list.createEl('article', { cls: 'diwa-card-row diwa-synth-card-row' });
        try {
            const card = row.createEl('div', { cls: 'diwa-card diwa-synth-card' });

            let contexts = this.normalizeContexts(thought.context);
            let topics = this.getStoredThoughtTopics(thought);
            let archived = !!thought.synthesized;

            const binding: SynthesisCardBinding = {
                row,
                archived,
                contexts: [...contexts],
                topics: [...topics],
            };

            const syncBinding = () => {
                binding.archived = archived;
                binding.contexts = [...contexts];
                binding.topics = [...topics];
            };

            const header = card.createEl('div', { cls: 'diwa-synth-card-header' });
            const titleWrap = header.createEl('div', { cls: 'diwa-synth-card-title-wrap' });
            titleWrap.createEl('h3', { text: this.getThoughtTitle(thought), cls: 'diwa-synth-card-title' });
            titleWrap.createEl('span', { text: thought.filePath, cls: 'diwa-synth-card-path' });

            const statusMeta = header.createEl('div', { cls: 'diwa-synth-card-status-meta' });
            const statusPill = statusMeta.createEl('span', {
                text: archived ? 'Processed' : 'Needs review',
                cls: `diwa-synth-status-pill${archived ? ' is-processed' : ''}`,
            });
            const updatedBadge = statusMeta.createEl('span', {
                text: this.formatThoughtTimestamp(thought.modified || thought.created),
                cls: 'diwa-synth-card-updated',
            });

            const actions = row.createEl('div', { cls: 'diwa-actions-overlay diwa-synth-card-actions' });
            this.renderThoughtCardActions(actions, thought);

            const contentGrid = card.createEl('div', { cls: 'diwa-synth-card-grid' });
            const preview = contentGrid.createEl('section', { cls: 'diwa-synth-card-preview' });
            const previewBody = preview.createEl('div', { cls: 'diwa-card-text diwa-synth-card-markdown' });
            const cleanBody = this.stripFrontmatterAndProperties(typeof thought.body === 'string' ? thought.body : '');
            if (cleanBody) {
                void MarkdownRenderer.render(this.app, cleanBody, previewBody, thought.filePath, this.view)
                    .then(() => {
                        this.hookInternalLinks(previewBody, thought.filePath);
                        this.hookImageZoom(previewBody);
                    })
                    .catch((error) => {
                        console.error('[DIWA SynthesisTab] Failed to render thought markdown', { filePath: thought.filePath, error });
                        previewBody.empty();
                        previewBody.createEl('div', {
                            text: 'Preview unavailable for this thought. Open the note to inspect the raw content.',
                            cls: 'diwa-synth-card-empty-preview',
                        });
                    });
            } else {
                previewBody.createEl('div', {
                    text: 'No body content yet. Open the note to continue writing.',
                    cls: 'diwa-synth-card-empty-preview',
                });
            }

            const tagRow = preview.createEl('div', { cls: 'diwa-synth-card-tags' });
            const renderTags = () => {
                tagRow.empty();
                if (contexts.length === 0 && topics.length === 0) {
                    tagRow.createEl('span', { text: 'Needs classification', cls: 'diwa-synth-muted-chip' });
                    return;
                }

                for (const context of contexts) tagRow.createEl('span', { text: `#${context}`, cls: 'diwa-context-chip' });
                for (const topic of topics) tagRow.createEl('span', { text: topic, cls: 'diwa-synth-topic-pill' });
            };
            renderTags();

            const rail = contentGrid.createEl('aside', { cls: 'diwa-synth-card-rail' });

            const modifiedField = this.createField(rail, 'Updated');
            const modifiedValue = modifiedField.createEl('span', {
                text: this.formatThoughtTimestamp(thought.modified || thought.created),
                cls: 'diwa-synth-field-value',
            });
            const createdField = this.createField(rail, 'Created');
            createdField.createEl('span', {
                text: this.formatThoughtTimestamp(thought.created),
                cls: 'diwa-synth-field-value',
            });

            const applyThoughtMeta = (
                updatedThought: ThoughtEntry | null,
                overrides: { archived?: boolean; contexts?: string[]; topics?: string[] } = {},
            ) => {
                if (updatedThought) {
                    thought.synthesized = !!updatedThought.synthesized;
                    thought.context = this.normalizeContexts(updatedThought.context);
                    thought.topic = updatedThought.topic ?? null;
                    thought.created = updatedThought.created || thought.created;
                    thought.modified = updatedThought.modified || thought.modified;
                    thought.updatedAt = updatedThought.updatedAt ?? thought.updatedAt;
                }

                archived = overrides.archived ?? (updatedThought ? !!updatedThought.synthesized : archived);
                contexts = overrides.contexts ? [...overrides.contexts] : (updatedThought ? this.normalizeContexts(updatedThought.context) : [...contexts]);
                topics = overrides.topics
                    ? this.normalizeTopicArray(overrides.topics)
                    : (updatedThought ? this.getStoredThoughtTopics(updatedThought) : [...topics]);

                thought.synthesized = archived;
                thought.context = [...contexts];
                thought.topic = toStoredThoughtTopic(topics);

                statusPill.setText(archived ? 'Processed' : 'Needs review');
                statusPill.classList.toggle('is-processed', archived);

                const timestamp = this.formatThoughtTimestamp(thought.modified || thought.created);
                updatedBadge.setText(timestamp);
                modifiedValue.setText(timestamp);

                syncBinding();
                renderTags();
            };

            const archivedField = this.createField(rail, 'Archive state');
            this.renderArchivedEditor(archivedField, thought, (updatedThought, nextArchived) => {
                applyThoughtMeta(updatedThought, { archived: nextArchived, contexts, topics });
                onMetaChange?.();
            });

            const contextField = this.createField(rail, 'Context');
            this.renderContextEditor(
                contextField,
                thought,
                contexts,
                () => topics,
                (updatedThought, nextContexts) => {
                    applyThoughtMeta(updatedThought, { archived, contexts: nextContexts, topics });
                    onMetaChange?.();
                },
            );

            const topicField = this.createField(rail, 'Topic');
            this.renderTopicEditor(
                topicField,
                thought,
                () => contexts,
                topics,
                (updatedThought, nextTopics) => {
                    applyThoughtMeta(updatedThought, { archived, contexts, topics: nextTopics });
                    onMetaChange?.();
                },
                globalTopics,
            );

            syncBinding();
            return binding;
        } catch (error) {
            console.error('[DIWA SynthesisTab] Failed to render thought card', { filePath: thought.filePath, error });
            row.empty();
            row.addClass('diwa-synth-card-row--error');
            this.renderThoughtCardFallback(row, thought);
            return {
                row,
                archived: !!thought.synthesized,
                contexts: this.normalizeContexts(thought.context),
                topics: this.getStoredThoughtTopics(thought),
            };
        }
    }

    private renderThoughtCardActions(parent: HTMLElement, thought: ThoughtEntry): void {
        const openButton = this.renderActionButton(parent, ICON_EYE, 'Open note', () => void this.openThoughtFile(thought.filePath), 'var(--interactive-accent)');
        openButton.classList.add('diwa-synth-note-action', 'diwa-synth-note-action--open');
        const deleteButton = this.renderActionButton(parent, ICON_TRASH, 'Delete note', () => {
            new ConfirmModal(this.app, 'Move this thought to trash?', async () => {
                await this.vault.deleteFile(thought.filePath, 'thoughts');
                this.plugin.getThoughtController().removeThoughtFromIndex(thought.filePath);
                this.view.renderView();
            }).open();
        }, 'var(--text-error)');
        deleteButton.classList.add('diwa-synth-note-action', 'diwa-synth-note-action--delete');
    }

    private renderThoughtCardFallback(row: HTMLElement, thought: ThoughtEntry): void {
        const card = row.createEl('div', { cls: 'diwa-card diwa-synth-card diwa-synth-card--error' });
        const titleWrap = card.createEl('div', { cls: 'diwa-synth-card-title-wrap' });
        titleWrap.createEl('h3', { text: this.getThoughtTitle(thought), cls: 'diwa-synth-card-title' });
        titleWrap.createEl('span', { text: thought.filePath, cls: 'diwa-synth-card-path' });
        card.createEl('div', {
            text: 'This thought could not be rendered, but the rest of Synthesis is still available. Open the note to inspect it directly.',
            cls: 'diwa-synth-card-empty-preview',
        });

        const actions = row.createEl('div', { cls: 'diwa-actions-overlay diwa-synth-card-actions' });
        this.renderThoughtCardActions(actions, thought);
    }

    private createField(parent: HTMLElement, label: string): HTMLElement {
        const field = parent.createEl('div', { cls: 'diwa-synth-field' });
        field.createEl('span', { text: label, cls: 'diwa-synth-field-label' });
        return field;
    }

    private renderEmptyStateCard(parent: HTMLElement, title: string, copy: string): void {
        const empty = parent.createEl('div', { cls: 'diwa-synth-empty' });
        this.populateEmptyStateIcon(empty, 'lightbulb');
        empty.createEl('strong', { text: title, cls: 'diwa-synth-empty-title' });
        empty.createEl('span', { text: copy, cls: 'diwa-synth-empty-copy' });
    }

    private populateEmptyStateIcon(parent: HTMLElement, icon: string): void {
        const iconWrap = parent.createEl('div', { cls: 'diwa-synth-empty-icon' });
        setIcon(iconWrap, icon);
    }

    private async openThoughtFile(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            return;
        }

        const leaf = this.app.workspace.getLeaf('window') ?? this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    private renderArchivedEditor(
        cell: HTMLElement,
        thought: ThoughtEntry,
        onChanged?: (updatedThought: ThoughtEntry | null, archived: boolean) => void,
    ): void {
        const toggle = cell.createEl('label', { cls: 'diwa-synth-toggle' });
        const check = toggle.createEl('input', { type: 'checkbox', cls: 'diwa-synth-toggle-input' }) as HTMLInputElement;
        check.checked = !!thought.synthesized;

        const track = toggle.createEl('span', { cls: 'diwa-synth-toggle-track' });
        track.createEl('span', { cls: 'diwa-synth-toggle-thumb' });

        const copy = toggle.createEl('span', { cls: 'diwa-synth-toggle-copy' });
        const title = copy.createEl('span', { cls: 'diwa-synth-toggle-title' });
        copy.createEl('span', {
            text: 'Controls whether this thought stays in the raw review queue.',
            cls: 'diwa-synth-toggle-hint',
        });

        const sync = () => {
            toggle.classList.toggle('is-checked', check.checked);
            title.setText(check.checked ? 'Processed' : 'Needs review');
        };

        sync();

        check.addEventListener('change', async () => {
            const next = check.checked;
            sync();
            check.disabled = true;
            this.holdInlineMetaRefresh();
            this.plugin.refreshCoordinator.suppressNotifyRefresh(1500);

            try {
                const updatedThought = await this.plugin.getThoughtController().setSynthesized(thought.filePath, next);
                const resolvedArchived = updatedThought?.synthesized ?? next;
                thought.synthesized = resolvedArchived;
                onChanged?.(updatedThought, resolvedArchived);
            } catch (error) {
                check.checked = !next;
                sync();
                console.error('[DIWA SynthesisTab] Failed to update synthesized flag', error);
            } finally {
                check.disabled = false;
            }
        });
    }

    private renderContextEditor(
        cell: HTMLElement,
        thought: ThoughtEntry,
        safeContexts: string[],
        topicsProvider: () => string[],
        onChanged?: (updatedThought: ThoughtEntry | null, contexts: string[]) => void,
    ): void {
        const selectWrap = cell.createEl('div', { cls: 'diwa-synth-select-wrap' });
        const select = selectWrap.createEl('select', { cls: 'diwa-synth-select' }) as HTMLSelectElement;
        const contexts = Array.from(new Set(this.settings.contexts ?? []));
        let current = safeContexts[0] ?? '';

        select.createEl('option', { value: '', text: 'No context' });
        for (const context of contexts) {
            select.createEl('option', { value: context, text: context });
        }
        select.value = current;

        const chevron = selectWrap.createEl('span', { cls: 'diwa-synth-select-chevron' });
        setIcon(chevron, 'chevron-down');

        select.addEventListener('change', async () => {
            select.disabled = true;
            const nextContext = select.value;
            const nextContexts = nextContext ? [nextContext] : [];
            this.holdInlineMetaRefresh();
            this.plugin.refreshCoordinator.suppressNotifyRefresh(1500);

            try {
                const updatedThought = await this.plugin.getThoughtController().assignThoughtContext(
                    thought.filePath,
                    nextContexts,
                    topicsProvider(),
                );
                thought.context = nextContexts;
                current = nextContext;
                onChanged?.(updatedThought, nextContexts);
            } catch (error) {
                console.error('[DIWA SynthesisTab] Failed to update context', error);
                select.value = current;
            } finally {
                select.disabled = false;
            }
        });
    }

    private renderTopicEditor(
        cell: HTMLElement,
        thought: ThoughtEntry,
        contextsProvider: () => string[],
        safeTopics: string[],
        onChanged?: (updatedThought: ThoughtEntry | null, topics: string[]) => void,
        precomputedGlobalTopics?: string[],
    ): void {
        const editor = cell.createEl('div', { cls: 'diwa-synth-topic-editor' });
        const selectedRow = editor.createEl('div', { cls: 'diwa-synth-topic-selected' });
        const inputWrap = editor.createEl('div', { cls: 'diwa-synth-select-wrap' });
        const input = inputWrap.createEl('input', {
            cls: 'diwa-synth-select diwa-synth-topic-input',
            attr: { type: 'text', placeholder: 'Add topic and press Enter' },
        }) as HTMLInputElement;
        const listId = `diwa-synth-topic-list-${Math.abs(this.hashString(thought.filePath))}`;
        input.setAttribute('list', listId);

        const suggIcon = inputWrap.createEl('span', { cls: 'diwa-synth-select-chevron' });
        setIcon(suggIcon, 'sparkles');

        const dataList = editor.createEl('datalist');
        dataList.id = listId;

        const globalTopics = this.normalizeTopicArray(precomputedGlobalTopics ?? this.index.getExistingTopics());
        let selectedTopics = this.normalizeTopicArray(safeTopics);
        let persisting = false;

        const syncEditorState = () => {
            editor.classList.toggle('is-persisting', persisting);
            input.disabled = persisting;
        };

        const acquirePersistLock = (): boolean => {
            if (persisting) return false;
            persisting = true;
            syncEditorState();
            return true;
        };

        const releasePersistLock = (): void => {
            persisting = false;
            syncEditorState();
        };

        const renderSuggestions = () => {
            const selectedSet = new Set(selectedTopics.map((topic) => topic.toLowerCase()));
            dataList.empty();
            for (const topic of globalTopics) {
                if (selectedSet.has(topic.toLowerCase())) continue;
                dataList.createEl('option', { value: topic });
            }
        };

        const renderSelected = () => {
            selectedRow.empty();
            if (selectedTopics.length === 0) {
                selectedRow.createEl('span', { cls: 'diwa-synth-topic-empty', text: 'No topics yet' });
                return;
            }

            for (const topic of selectedTopics) {
                const chip = selectedRow.createEl('button', {
                    cls: 'diwa-synth-topic-chip',
                    text: topic,
                    attr: { type: 'button', 'aria-label': `Remove topic ${topic}` },
                }) as HTMLButtonElement;
                chip.disabled = persisting;
                chip.createEl('span', { cls: 'diwa-synth-topic-chip-close', text: '×' });
                chip.addEventListener('click', async (event) => {
                    event.preventDefault();
                    const previous = [...selectedTopics];
                    const nextTopics = this.normalizeTopicArray(
                        selectedTopics.filter((value) => value.toLowerCase() !== topic.toLowerCase()),
                    );
                    if (nextTopics.length === selectedTopics.length) return;
                    if (!acquirePersistLock()) return;
                    selectedTopics = nextTopics;
                    renderSelected();
                    renderSuggestions();
                    const persisted = await persist(previous, nextTopics, true);
                    if (persisted) input.value = '';
                });
            }
        };

        const persist = async (
            previousTopics: string[],
            nextTopics: string[] = selectedTopics,
            skipLock = false,
        ): Promise<boolean> => {
            const normalizedNextTopics = this.normalizeTopicArray(nextTopics);
            const normalizedPreviousTopics = this.normalizeTopicArray(previousTopics);
            if (!skipLock && !acquirePersistLock()) return false;
            if (!skipLock) {
                selectedTopics = normalizedNextTopics;
                renderSelected();
                renderSuggestions();
            }
            this.holdInlineMetaRefresh();
            this.plugin.refreshCoordinator.suppressNotifyRefresh(1500);
            try {
                const updatedThought = await this.plugin.getThoughtController().assignThoughtContext(
                    thought.filePath,
                    contextsProvider().slice(0, 1),
                    normalizedNextTopics,
                );
                selectedTopics = normalizedNextTopics;
                thought.topic = toStoredThoughtTopic(normalizedNextTopics);
                onChanged?.(updatedThought, normalizedNextTopics);
                return true;
            } catch (error) {
                console.error('[DIWA SynthesisTab] Failed to update topic', error);
                selectedTopics = normalizedPreviousTopics;
                return false;
            } finally {
                releasePersistLock();
                renderSelected();
                renderSuggestions();
            }
        };

        const commitInput = async () => {
            const raw = this.sanitizeTopic(input.value);
            if (!raw) {
                input.value = '';
                return;
            }

            const anticipated = this.getAnticipatedTopic(raw, globalTopics);
            const next = anticipated ?? raw;
            if (selectedTopics.some((topic) => topic.toLowerCase() === next.toLowerCase())) {
                input.value = '';
                return;
            }

            const previous = [...selectedTopics];
            const nextTopics = this.normalizeTopicArray([...selectedTopics, next]);
            if (!acquirePersistLock()) return;
            selectedTopics = nextTopics;
            renderSelected();
            renderSuggestions();
            const persisted = await persist(previous, nextTopics, true);
            if (persisted) input.value = '';
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                void commitInput();
            }
        });
        let suppressNextBlurCommit = false;
        selectedRow.addEventListener('pointerdown', () => {
            suppressNextBlurCommit = true;
        });
        input.addEventListener('blur', (event) => {
            const nextFocus = event.relatedTarget;
            if ((nextFocus instanceof Node && selectedRow.contains(nextFocus)) || suppressNextBlurCommit) {
                suppressNextBlurCommit = false;
                return;
            }
            suppressNextBlurCommit = false;
            void commitInput();
        });

        syncEditorState();
        renderSelected();
        renderSuggestions();
    }

    private stripFrontmatterAndProperties(text: string): string {
        let cleaned = text.replace(/^\uFEFF/, '');
        cleaned = cleaned.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

        const lines = cleaned.split(/\r?\n/);
        let idx = 0;
        while (idx < lines.length && /^[A-Za-z0-9_-]+:\s.+$/.test(lines[idx].trim())) idx++;
        if (idx >= 2 && idx < lines.length && lines[idx].trim() === '') {
            cleaned = lines.slice(idx + 1).join('\n');
        }

        return cleaned.trim();
    }

    private normalizeContexts(value: unknown): string[] {
        if (!Array.isArray(value)) return [];
        return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    }

    private collectAllContexts(thoughts: ThoughtEntry[]): Set<string> {
        const contexts = new Set<string>();
        for (const thought of thoughts) {
            for (const context of this.normalizeContexts(thought.context)) {
                contexts.add(context);
            }
        }
        return contexts;
    }

    private collectAllTopics(thoughts: ThoughtEntry[]): Set<string> {
        const topics = new Set<string>();
        for (const thought of thoughts) {
            for (const topic of this.getStoredThoughtTopics(thought)) {
                topics.add(topic);
            }
        }
        return topics;
    }

    private getStoredThoughtTopics(thought: { topic?: string | string[] | null }): string[] {
        return normalizeThoughtTopics(thought.topic);
    }

    private getThoughtTitle(thought: ThoughtEntry): string {
        if (thought.title?.trim()) return thought.title.trim();
        const fileName = thought.filePath.split('/').pop() || 'Untitled thought';
        return fileName.replace(/\.md$/i, '');
    }

    private formatThoughtTimestamp(value: string): string {
        const parsed = moment(value, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD'], true);
        return parsed.isValid() ? parsed.format('MMM D, YYYY · HH:mm') : value || '—';
    }

    private normalizeTopicArray(values: string[]): string[] {
        const byKey = new Map<string, string>();
        for (const raw of values) {
            const sanitized = this.sanitizeTopic(raw);
            if (!sanitized) continue;
            const key = sanitized.toLowerCase();
            if (!byKey.has(key)) byKey.set(key, sanitized);
        }
        return Array.from(byKey.values());
    }

    private sanitizeTopic(value: string): string {
        return value.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    }

    private getAnticipatedTopic(input: string, globalTopics: string[]): string | null {
        const query = input.toLowerCase();
        const exact = globalTopics.find((topic) => topic.toLowerCase() === query);
        if (exact) return exact;
        const prefix = globalTopics.find((topic) => topic.toLowerCase().startsWith(query));
        return prefix ?? null;
    }

    private hashString(value: string): number {
        let hash = 0;
        for (let index = 0; index < value.length; index++) hash = ((hash << 5) - hash) + value.charCodeAt(index);
        return hash | 0;
    }

}

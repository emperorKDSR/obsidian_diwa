import { MarkdownRenderer, Notice, setIcon, TFile } from 'obsidian';
import { BaseTab } from './BaseTab';
import type { ThoughtEntry } from '../types';
import { ConfirmModal } from '../modals/ConfirmModal';

export class SynthesisTab extends BaseTab {
    render(container: HTMLElement): void {
        container.empty();
        const root = container.createEl('div', { cls: 'diwa-syn-table-root' });
        root.createEl('h2', { cls: 'diwa-syn-table-title', text: 'Synthesis' });
        this.renderThoughtTable(root);
    }

    private renderThoughtTable(root: HTMLElement): void {
        const thoughts = Array.from(this.index.thoughtIndex.values())
            .sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));

        if (thoughts.length === 0) {
            root.createEl('div', {
                cls: 'diwa-syn-table-empty',
                text: 'No thought notes found.',
            });
            return;
        }

        const filters = root.createEl('div', { cls: 'diwa-syn-table-filters' });
        const archivedFilter = filters.createEl('select', { cls: 'diwa-syn-table-filter' }) as HTMLSelectElement;
        archivedFilter.createEl('option', { value: 'false', text: 'Archived: false' });
        archivedFilter.createEl('option', { value: 'true', text: 'Archived: true' });
        archivedFilter.createEl('option', { value: 'all', text: 'Archived: all' });

        const contextFilter = filters.createEl('select', { cls: 'diwa-syn-table-filter' }) as HTMLSelectElement;
        contextFilter.createEl('option', { value: 'all', text: 'Context: all' });

        const topicFilter = filters.createEl('select', { cls: 'diwa-syn-table-filter' }) as HTMLSelectElement;
        topicFilter.createEl('option', { value: 'all', text: 'Topic: all' });

        const wrap = root.createEl('div', { cls: 'diwa-syn-table-wrap' });
        const table = wrap.createEl('table', { cls: 'diwa-syn-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        for (const header of ['', 'archived', 'content', 'modified date', 'context', 'topic']) {
            headerRow.createEl('th', { text: header });
        }

        const rows: Array<{ row: HTMLElement; archived: boolean; contexts: string[]; topics: string[] }> = [];
        let applyFilters = () => {};
        const tbody = table.createEl('tbody');
        for (const thought of thoughts) {
            try {
                rows.push(this.renderTableRow(tbody, thought, () => applyFilters()));
            } catch (e) {
                console.error('[DIWA SynthesisTab] Failed to render row', thought?.filePath, e);
            }
        }

        const emptyFiltered = root.createEl('div', {
            cls: 'diwa-syn-table-empty',
            text: 'No rows match the selected filters.',
        });

        const allContexts = new Set<string>();
        const allTopics = new Set<string>();
        for (const r of rows) {
            for (const c of r.contexts) allContexts.add(c);
            for (const t of r.topics) allTopics.add(t);
        }
        for (const c of Array.from(allContexts).sort((a, b) => a.localeCompare(b))) {
            contextFilter.createEl('option', { value: c, text: `Context: ${c}` });
        }
        for (const t of Array.from(allTopics).sort((a, b) => a.localeCompare(b))) {
            topicFilter.createEl('option', { value: t, text: `Topic: ${t}` });
        }

        applyFilters = () => {
            const archived = archivedFilter.value;
            const context = contextFilter.value;
            const topic = topicFilter.value;
            this.view.synthesisTableArchivedFilter = archived === 'true' || archived === 'all' ? archived : 'false';
            this.view.synthesisTableContextFilter = context || 'all';
            this.view.synthesisTableTopicFilter = topic || 'all';
            let visible = 0;
            for (const r of rows) {
                const archivedOk = archived === 'all'
                    ? true
                    : archived === 'true'
                        ? r.archived
                        : !r.archived;
                const contextOk = context === 'all'
                    ? true
                    : r.contexts.some((c) => c.toLowerCase() === context.toLowerCase());
                const topicOk = topic === 'all'
                    ? true
                    : r.topics.some((t) => t.toLowerCase() === topic.toLowerCase());
                const show = archivedOk && contextOk && topicOk;
                r.row.style.display = show ? '' : 'none';
                if (show) visible++;
            }
            emptyFiltered.style.display = visible === 0 ? '' : 'none';
        };

        archivedFilter.addEventListener('change', applyFilters);
        contextFilter.addEventListener('change', applyFilters);
        topicFilter.addEventListener('change', applyFilters);
        archivedFilter.value = this.view.synthesisTableArchivedFilter || 'false';
        contextFilter.value = this.optionExists(contextFilter, this.view.synthesisTableContextFilter)
            ? this.view.synthesisTableContextFilter
            : 'all';
        topicFilter.value = this.optionExists(topicFilter, this.view.synthesisTableTopicFilter)
            ? this.view.synthesisTableTopicFilter
            : 'all';
        applyFilters();
    }

    private renderTableRow(
        tbody: HTMLElement,
        thought: ThoughtEntry,
        onMetaChange?: () => void
    ): { row: HTMLElement; archived: boolean; contexts: string[]; topics: string[] } {
        const row = tbody.createEl('tr');
        let contexts = this.normalizeContexts(thought.context);
        let topics = this.getThoughtTopics(thought);
        let archived = !!thought.synthesized;
        const modified = typeof thought.modified === 'string' && thought.modified ? thought.modified : '';
        const created = typeof thought.created === 'string' && thought.created ? thought.created : '';
        const body = typeof thought.body === 'string' ? thought.body : '';

        const openCell = row.createEl('td', { cls: 'diwa-syn-table-open' });
        this.renderOpenNoteButton(openCell, thought.filePath);

        const archivedCell = row.createEl('td', { cls: 'diwa-syn-table-archived' });
        this.renderArchivedEditor(archivedCell, thought, (nextArchived) => { archived = nextArchived; onMetaChange?.(); });

        const contentCell = row.createEl('td', { cls: 'diwa-syn-table-content' });
        const contentHost = contentCell.createEl('div', { cls: 'diwa-syn-table-content-md' });
        const cleanBody = this.stripFrontmatterAndProperties(body);
        void MarkdownRenderer.render(
            this.app,
            cleanBody || '*No content*',
            contentHost,
            thought.filePath,
            this.view
        );
        row.createEl('td', { text: modified || created || '—' });

        const contextCell = row.createEl('td');
        this.renderContextEditor(
            contextCell,
            thought,
            contexts,
            () => topics,
            (nextContexts) => { contexts = nextContexts; onMetaChange?.(); }
        );

        const topicCell = row.createEl('td');
        this.renderTopicEditor(
            topicCell,
            thought,
            () => contexts,
            topics,
            (nextTopics) => { topics = nextTopics; onMetaChange?.(); }
        );
        return { row, archived, contexts, topics };
    }

    private renderOpenNoteButton(cell: HTMLElement, filePath: string): void {
        const actionWrap = cell.createEl('div', { cls: 'diwa-syn-row-actions' });
        const btn = cell.createEl('button', {
            cls: 'diwa-syn-open-note-btn',
            attr: { type: 'button', title: 'Open note' },
        });
        actionWrap.appendChild(btn);
        setIcon(btn, 'file-text');
        btn.addEventListener('click', async () => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                return;
            }
            const leaf = this.app.workspace.getLeaf('window') ?? this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        });

        const delBtn = actionWrap.createEl('button', {
            cls: 'diwa-syn-open-note-btn diwa-syn-delete-note-btn',
            attr: { type: 'button', title: 'Delete note' },
        });
        setIcon(delBtn, 'trash-2');
        delBtn.addEventListener('click', () => {
            new ConfirmModal(this.app, 'Move this thought to trash?', async () => {
                await this.vault.deleteFile(filePath, 'thoughts');
                this.plugin.getThoughtController().removeThoughtFromIndex(filePath);
                this.view.renderView();
            }).open();
        });
    }

    private renderArchivedEditor(cell: HTMLElement, thought: ThoughtEntry, onChanged?: (archived: boolean) => void): void {
        const check = cell.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
        check.checked = !!thought.synthesized;
        check.addEventListener('change', async () => {
            const next = check.checked;
            check.disabled = true;
            try {
                await this.plugin.getThoughtController().setSynthesized(thought.filePath, next);
                thought.synthesized = next;
                onChanged?.(next);
                await this.refreshAfterMutation(thought.filePath);
            } catch (e) {
                check.checked = !next;
                console.error('[DIWA SynthesisTab] Failed to update synthesized flag', e);
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
        onChanged?: (contexts: string[]) => void
    ): void {
        const select = cell.createEl('select', { cls: 'diwa-syn-table-select' }) as HTMLSelectElement;
        const contexts = Array.from(new Set(this.settings.contexts ?? []));
        let current = safeContexts[0] ?? '';

        select.createEl('option', { value: '', text: '—' });
        for (const ctx of contexts) {
            select.createEl('option', { value: ctx, text: ctx });
        }
        select.value = current;

        select.addEventListener('change', async () => {
            select.disabled = true;
            const nextContext = select.value;
            const nextContexts = nextContext ? [nextContext] : [];
            try {
                await this.plugin.getThoughtController().assignThoughtContext(
                    thought.filePath,
                    nextContexts,
                    topicsProvider()
                );
                thought.context = nextContexts;
                current = nextContext;
                onChanged?.(nextContexts);
                await this.refreshAfterMutation(thought.filePath);
            } catch (e) {
                console.error('[DIWA SynthesisTab] Failed to update context', e);
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
        onChanged?: (topics: string[]) => void
    ): void {
        const editor = cell.createEl('div', { cls: 'diwa-syn-table-topic-editor' });
        const selectedRow = editor.createEl('div', { cls: 'diwa-syn-topic-selected' });
        const input = editor.createEl('input', {
            cls: 'diwa-syn-table-select diwa-syn-topic-input',
            attr: { type: 'text', placeholder: 'Add topic and press Enter' },
        }) as HTMLInputElement;
        const listId = `diwa-syn-topic-list-${Math.abs(this.hashString(thought.filePath))}`;
        input.setAttribute('list', listId);
        const dataList = editor.createEl('datalist');
        dataList.id = listId;

        const globalTopics = this.normalizeTopicArray(this.index.getExistingTopics());
        let selectedTopics = this.normalizeTopicArray(safeTopics);

        const renderSuggestions = () => {
            const selectedSet = new Set(selectedTopics.map((t) => t.toLowerCase()));
            dataList.empty();
            for (const topic of globalTopics) {
                if (selectedSet.has(topic.toLowerCase())) continue;
                dataList.createEl('option', { value: topic });
            }
        };

        const persist = async () => {
            input.disabled = true;
            try {
                await this.plugin.getThoughtController().assignThoughtContext(
                    thought.filePath,
                    contextsProvider().slice(0, 1),
                    selectedTopics
                );
                thought.topic = selectedTopics.length > 0 ? selectedTopics[0] : null;
                onChanged?.(selectedTopics);
                await this.refreshAfterMutation(thought.filePath);
            } catch (e) {
                console.error('[DIWA SynthesisTab] Failed to update topic', e);
            } finally {
                input.disabled = false;
            }
        };

        const renderSelected = () => {
            selectedRow.empty();
            if (selectedTopics.length === 0) {
                selectedRow.createEl('span', { cls: 'diwa-syn-topic-empty', text: '—' });
            } else {
                for (const topic of selectedTopics) {
                    const chip = selectedRow.createEl('button', { cls: 'diwa-syn-topic-chip', text: topic });
                    chip.type = 'button';
                    const close = chip.createEl('span', { cls: 'diwa-syn-topic-chip-close', text: '×' });
                    close.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectedTopics = selectedTopics.filter((t) => t.toLowerCase() !== topic.toLowerCase());
                        renderSelected();
                        renderSuggestions();
                        await persist();
                    });
                }
            }
        };

        const commitInput = async () => {
            const raw = this.sanitizeTopic(input.value);
            if (!raw) return;
            const anticipated = this.getAnticipatedTopic(raw, globalTopics);
            const next = anticipated ?? raw;
            if (!selectedTopics.some((t) => t.toLowerCase() === next.toLowerCase())) {
                selectedTopics.push(next);
                selectedTopics = this.normalizeTopicArray(selectedTopics);
                renderSelected();
                renderSuggestions();
                await persist();
            }
            input.value = '';
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                void commitInput();
            }
        });
        input.addEventListener('blur', () => { void commitInput(); });

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
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }

    private getThoughtTopics(thought: ThoughtEntry): string[] {
        const file = this.app.vault.getAbstractFileByPath(thought.filePath);
        if (file instanceof TFile) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const raw = fm?.topic;
            if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
            if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
        }
        if (typeof thought.topic === 'string' && thought.topic.trim()) return [thought.topic.trim()];
        return [];
    }

    private normalizeTopicArray(values: string[]): string[] {
        const byKey = new Map<string, string>();
        for (const raw of values) {
            const s = this.sanitizeTopic(raw);
            if (!s) continue;
            const key = s.toLowerCase();
            if (!byKey.has(key)) byKey.set(key, s);
        }
        return Array.from(byKey.values());
    }

    private sanitizeTopic(value: string): string {
        return value.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    }

    private getAnticipatedTopic(input: string, globalTopics: string[]): string | null {
        const q = input.toLowerCase();
        const exact = globalTopics.find((t) => t.toLowerCase() === q);
        if (exact) return exact;
        const prefix = globalTopics.find((t) => t.toLowerCase().startsWith(q));
        return prefix ?? null;
    }

    private hashString(value: string): number {
        let h = 0;
        for (let i = 0; i < value.length; i++) h = ((h << 5) - h) + value.charCodeAt(i);
        return h | 0;
    }

    private optionExists(select: HTMLSelectElement, value: string): boolean {
        return Array.from(select.options).some((o) => o.value === value);
    }

    private async refreshAfterMutation(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.index.indexThoughtFile(file);
        }
        this.view.renderView();
    }
}

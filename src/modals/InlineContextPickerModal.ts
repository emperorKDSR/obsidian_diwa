import { App, Modal, Notice, setIcon } from 'obsidian';
import DiwaPlugin from '../main';

export class InlineContextPickerModal extends Modal {
    private plugin: DiwaPlugin;
    private currentContexts: string[];
    private onConfirm: (selected: string[]) => Promise<void>;
    private onConfirmWithTopic?: (contexts: string[], topic: string) => Promise<void>;
    private title: string;
    private topicMode: boolean;

    constructor(
        app: App,
        plugin: DiwaPlugin,
        currentContexts: string[],
        onConfirm: (selected: string[]) => Promise<void>,
        title?: string,
        topicMode?: boolean,
        onConfirmWithTopic?: (contexts: string[], topic: string) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.currentContexts = [...currentContexts];
        this.onConfirm = onConfirm;
        this.onConfirmWithTopic = onConfirmWithTopic;
        this.title = title || 'Assign Contexts';
        this.topicMode = topicMode ?? false;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('diwa-modal-standard');

        // Header
        const hdr = contentEl.createEl('div', { cls: 'diwa-modal-header' });
        hdr.createEl('h2', {
            text: this.title,
            attr: { style: 'margin:0; font-size:1.05em; font-weight:700; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' },
        });
        const closeBtn = hdr.createEl('button', {
            cls: 'diwa-modal-close-btn',
            attr: { title: 'Close', style: 'background:none;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;padding:4px;border-radius:6px;flex-shrink:0;' },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = contentEl.createEl('div', { cls: 'diwa-ctx-picker-body' });

        // Search
        const searchInput = body.createEl('input', {
            cls: 'diwa-ctx-picker-search',
            type: 'text',
            attr: { placeholder: 'Search contexts…', spellcheck: 'false' },
        });

        // Pill grid
        const pillGrid = body.createEl('div', { cls: 'diwa-ctx-picker-grid' });

        // Track selected in local mutable state
        let selected: string[] = [...this.currentContexts];

        const buildGrid = (query: string) => {
            pillGrid.empty();
            const contexts = [...(this.plugin.settings.contexts || [])].sort((a, b) => a.localeCompare(b));
            for (const ctx of contexts) {
                if (query && !ctx.toLowerCase().includes(query)) continue;
                const isActive = selected.includes(ctx);
                const pill = pillGrid.createEl('button', {
                    cls: `diwa-chip diwa-chip--ctx${isActive ? ' is-active' : ''}`,
                    text: `#${ctx}`,
                    attr: { 'data-ctx': ctx },
                });
                pill.addEventListener('click', () => {
                    if (this.topicMode) {
                        // Single-select in topic mode
                        selected = selected.includes(ctx) ? [] : [ctx];
                        pillGrid.querySelectorAll('.diwa-chip--ctx').forEach(p => p.classList.remove('is-active'));
                        if (selected.includes(ctx)) pill.classList.add('is-active');
                    } else {
                        if (selected.includes(ctx)) {
                            selected = selected.filter(c => c !== ctx);
                            pill.classList.remove('is-active');
                        } else {
                            selected.push(ctx);
                            pill.classList.add('is-active');
                        }
                    }
                });
            }
            if (pillGrid.childElementCount === 0) {
                pillGrid.createEl('span', {
                    text: query ? `No contexts match "${query}"` : 'No contexts yet — create one below',
                    attr: { style: 'font-size:0.82em; color:var(--text-faint);' },
                });
            }
        };

        buildGrid('');
        searchInput.addEventListener('input', () => buildGrid(searchInput.value.toLowerCase().trim()));

        // Topic input (topic mode only)
        let topicInput: HTMLInputElement | null = null;
        if (this.topicMode) {
            const topicRow = body.createEl('div', { cls: 'diwa-ctx-picker-topic-row' });
            topicRow.createEl('label', {
                text: 'Sub-topic (optional)',
                attr: { style: 'font-size:0.78em; color:var(--text-muted); display:block; margin-bottom:4px;' }
            });
            topicInput = topicRow.createEl('input', {
                cls: 'diwa-ctx-picker-topic-input',
                type: 'text',
                attr: { placeholder: 'e.g. Meeting, Q2 Review, Design…', spellcheck: 'false' },
            });
        }

        // Create new context row (hidden in topic mode)
        if (!this.topicMode) {
            const newRow = body.createEl('div', { cls: 'diwa-ctx-picker-new' });
            const newInput = newRow.createEl('input', {
                cls: 'diwa-ctx-picker-new-input',
                type: 'text',
                attr: { placeholder: 'New context name…' },
            });
            const newBtn = newRow.createEl('button', {
                cls: 'diwa-ctx-picker-new-btn',
                text: 'Create',
            });

            const doCreate = async () => {
                const val = newInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
                if (!val) { return; }
                if (!this.plugin.settings.contexts.includes(val)) {
                    this.plugin.settings.contexts.push(val);
                    await this.plugin.saveSettings();
                }
                if (!selected.includes(val)) selected.push(val);
                newInput.value = '';
                buildGrid(searchInput.value.toLowerCase().trim());
            };

            newBtn.addEventListener('click', doCreate);
            newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
        }

        // Footer
        const footer = contentEl.createEl('div', { cls: 'diwa-modal-footer' });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'diwa-btn-secondary' });
        const applyBtn = footer.createEl('button', { text: 'Apply', cls: 'diwa-btn-primary' });

        cancelBtn.addEventListener('click', () => this.close());
        applyBtn.addEventListener('click', async () => {
            if (this.topicMode && this.onConfirmWithTopic) {
                await this.onConfirmWithTopic(selected, topicInput?.value.trim() ?? '');
            } else {
                await this.onConfirm(selected);
            }
            this.close();
        });

        setTimeout(() => searchInput.focus(), 50);
    }

    onClose(): void { this.contentEl.empty(); }
}



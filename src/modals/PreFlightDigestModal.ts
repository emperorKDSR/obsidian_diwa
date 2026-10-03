import { App, Modal, Notice } from 'obsidian';
import type DiwaPlugin from '../main';
import { DigestibleBlock } from '../types';
import { FileSuggestModal } from './FileSuggestModal';

export class PreFlightDigestModal extends Modal {
    private plugin: DiwaPlugin;
    private dateStr: string;
    private blocks: DigestibleBlock[];
    private onConfirm: (blocks: DigestibleBlock[]) => Promise<void>;

    constructor(
        app: App,
        plugin: DiwaPlugin,
        dateStr: string,
        blocks: DigestibleBlock[],
        onConfirm: (blocks: DigestibleBlock[]) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.dateStr = dateStr;
        this.blocks = blocks;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('pos-preflight-modal');

        // Header
        const headerEl = contentEl.createDiv({ cls: 'pos-preflight-header' });
        headerEl.createEl('h2', { text: `Pre-Flight Digest: ${this.dateStr}` });
        headerEl.createEl('p', {
            cls: 'pos-preflight-subtitle',
            text: `Review destinations and task routing for ${this.blocks.length} block(s).`
        });

        if (this.blocks.length === 0) {
            contentEl.createDiv({
                cls: 'pos-preflight-empty',
                text: 'No digestible blocks found for this date.'
            });
            return;
        }

        // Blocks container
        const listContainer = contentEl.createDiv({ cls: 'pos-preflight-list' });

        this.blocks.forEach((block) => {
            const card = listContainer.createDiv({ cls: 'pos-preflight-card' });

            // Card Header
            const cardHeader = card.createDiv({ cls: 'pos-preflight-card-header' });
            cardHeader.createSpan({
                cls: `pos-preflight-pill ${block.isTask ? 'is-task' : 'is-log'}`,
                text: block.isTask ? (block.isCompletedTask ? '☑ Completed Task' : '☐ Open Task') : '📝 Thought / Log'
            });
            if (block.dueDate) {
                cardHeader.createSpan({
                    cls: 'pos-preflight-due-pill',
                    text: `Due: ${block.dueDate}`
                });
            }

            // Card Snippet
            const snippet = card.createDiv({ cls: 'pos-preflight-snippet' });
            snippet.setText(block.cleanText);

            // Routing Selector
            const routingRow = card.createDiv({ cls: 'pos-preflight-routing-row' });
            routingRow.createSpan({ cls: 'pos-preflight-label', text: 'Route to:' });

            const pillsWrap = routingRow.createDiv({ cls: 'pos-preflight-pills-wrap' });

            // Re-render helper for this card's pills
            const renderPills = () => {
                pillsWrap.empty();

                // 1. Primary target pill (if any)
                if (block.primaryTarget) {
                    const primaryBtn = pillsWrap.createEl('button', {
                        cls: `pos-pill-btn ${block.actionRoute !== 'keep_scratchpad' && block.actionRoute !== 'gawa_inbox' ? 'is-active' : ''}`,
                        text: `🟢 [[${block.primaryTarget}]]`
                    });
                    primaryBtn.onclick = () => {
                        if (block.isTask && !block.isCompletedTask) {
                            block.actionRoute = 'target_tasks';
                        } else {
                            block.actionRoute = 'target_log';
                        }
                        renderPills();
                    };
                }

                // 2. Alternative target pills
                for (const alt of block.alternativeTargets) {
                    const altBtn = pillsWrap.createEl('button', {
                        cls: 'pos-pill-btn is-alt',
                        text: `[[${alt}]]`
                    });
                    altBtn.onclick = () => {
                        const prevPrimary = block.primaryTarget;
                        block.primaryTarget = alt;
                        if (prevPrimary && !block.alternativeTargets.includes(prevPrimary)) {
                            block.alternativeTargets.push(prevPrimary);
                        }
                        block.alternativeTargets = block.alternativeTargets.filter(t => t !== alt);
                        if (block.isTask && !block.isCompletedTask) {
                            block.actionRoute = 'target_tasks';
                        } else {
                            block.actionRoute = 'target_log';
                        }
                        renderPills();
                    };
                }

                // 3. Search / custom note picker
                const searchBtn = pillsWrap.createEl('button', {
                    cls: 'pos-pill-btn is-action',
                    text: '🔍 Pick Note…'
                });
                searchBtn.onclick = () => {
                    new FileSuggestModal(this.app, (chosenFile) => {
                        block.primaryTarget = chosenFile.basename;
                        if (block.isTask && !block.isCompletedTask) {
                            block.actionRoute = 'target_tasks';
                        } else {
                            block.actionRoute = 'target_log';
                        }
                        renderPills();
                    }, this.plugin.settings.newNoteFolder || '000 Bin').open();
                };

                // 4. Task-specific options or Keep in Daily Log
                if (block.isTask && !block.isCompletedTask) {
                    const gawaInboxBtn = pillsWrap.createEl('button', {
                        cls: `pos-pill-btn ${block.actionRoute === 'gawa_inbox' ? 'is-active' : ''}`,
                        text: '📋 Gawa Inbox'
                    });
                    gawaInboxBtn.onclick = () => {
                        block.actionRoute = 'gawa_inbox';
                        renderPills();
                    };
                }

                const keepBtn = pillsWrap.createEl('button', {
                    cls: `pos-pill-btn ${block.actionRoute === 'keep_scratchpad' ? 'is-active' : ''}`,
                    text: '📁 Keep in Scratchpad'
                });
                keepBtn.onclick = () => {
                    block.actionRoute = 'keep_scratchpad';
                    renderPills();
                };
            };

            renderPills();
        });

        // Footer Actions
        const actionsEl = contentEl.createDiv({ cls: 'modal-button-container pos-preflight-actions' });
        const cancelBtn = actionsEl.createEl('button', { text: 'Cancel' });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = actionsEl.createEl('button', {
            text: `Execute Digest (${this.blocks.length} blocks)`,
            cls: 'mod-cta'
        });

        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            confirmBtn.setText('Executing Digest…');
            try {
                await this.onConfirm(this.blocks);
                new Notice(`Day ${this.dateStr} successfully digested!`);
                this.close();
            } catch (err) {
                console.error('[DIWA PreFlightDigestModal] Digest error', err);
                new Notice(`Digest error: ${err instanceof Error ? err.message : String(err)}`);
                confirmBtn.disabled = false;
                confirmBtn.setText(`Execute Digest (${this.blocks.length} blocks)`);
            }
        };

        // Keyboard Enter shortcut
        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !confirmBtn.disabled) {
                const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
                if (targetTag !== 'input' && targetTag !== 'textarea') {
                    e.preventDefault();
                    confirmBtn.click();
                }
            }
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

import { Platform, MarkdownRenderer, Notice, TFile, moment } from 'obsidian';
import type { DiwaView } from '../view';
import type { ThoughtEntry, TaskEntry, ReplyEntry } from '../types';
import { NINJA_AVATAR_SVG, ICON_PIN, ICON_EDIT, ICON_TRASH, ICON_REPLY, ICON_LINK, ICON_EYE, ICON_EYE_OFF, ICON_ARROW_RIGHT, ICON_MESSAGE_SQUARE } from '../constants';
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ConvertToTaskModal } from '../modals/ConvertToTaskModal';
import { CommentModal } from '../modals/CommentModal';
import { ViewCommentsModal } from '../modals/ViewCommentsModal';
import { isTablet, parseContextString } from '../utils';

export class BaseTab {
    view: DiwaView;
    constructor(view: DiwaView) { this.view = view; }

    // Unified Access to Services
    get plugin() { return this.view.plugin; }
    get app() { return this.view.app; }
    get settings() { return this.view.plugin.settings; }
    
    // Services shortcuts
    get vault() { return this.plugin.vault; }
    get ai() { return this.plugin.ai; }
    get index() { return this.plugin.index; }

    /** ob-dry-01: Render a standard page header with nav row + h2 title */
    renderPageHeader(parent: HTMLElement, title: string, subtitle?: string): HTMLElement {
        const header = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' } });
        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 2px;' } });
        header.createEl('h2', { text: title, attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' } });
        if (subtitle) header.createEl('span', { text: subtitle, attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' } });
        return header;
    }

    /** ob-dry-04: Render a standard centered empty state message */
    renderEmptyState(parent: HTMLElement, message: string): void {
        parent.createEl('div', {
            text: message,
            attr: { style: 'color: var(--text-muted); font-size: 0.9em; font-style: italic; text-align: center; margin-top: 40px; padding: 24px; background: var(--background-secondary); border-radius: 12px;' }
        });
    }

    /** ob-dry-03: Render a toggle/filter pill button */
    renderFilterPill(parent: HTMLElement, label: string, isActive: boolean, onClick: () => void): HTMLElement {
        const btn = parent.createEl('button', {
            text: label,
            attr: {
                style: `padding: 6px 14px; border-radius: 20px; border: 1px solid ${isActive ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background: ${isActive ? 'var(--interactive-accent)' : 'transparent'}; color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'}; font-size: 0.78em; font-weight: 700; cursor: pointer; transition: all 0.15s; white-space: nowrap;`
            }
        });
        btn.addEventListener('click', onClick);
        return btn;
    }

    hookInternalLinks(el: HTMLElement, sourcePath: string) {
        el.querySelectorAll('a.internal-link').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
                if (href) this.view.plugin.app.workspace.openLinkText(href, sourcePath, Platform.isMobile ? 'tab' : 'window');
            });
        });
    }

    hookImageZoom(el: HTMLElement) {
        el.querySelectorAll('img').forEach((img) => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const overlay = this.view.containerEl.createEl('div', { attr: { style: 'position:absolute; inset:0; z-index:99999; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; backdrop-filter: blur(4px);' } });
                const zoomed = overlay.createEl('img', { attr: { src: img.src, style: 'max-width:90%; max-height:90%; object-fit:contain; border-radius:12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); cursor: zoom-out;' } });
                overlay.addEventListener('click', () => overlay.remove());
            });
        });
    }

    // sec-013: iconPath is an SVG path string — safe only because all callers use hardcoded constants.
    // Do NOT pass user-supplied strings; migrate callers to setIcon() if extensibility is needed.
    renderActionButton(parent: HTMLElement, iconPath: string, title: string, onClick: () => void, color: string = 'var(--text-muted)') {
        const btn = parent.createEl('button', { attr: { title, class: 'diwa-action-btn', style: `color: ${color};` } });
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    }

    renderSearchInput(parent: HTMLElement, onSearch: (val: string) => void) {
        const wrap = parent.createEl('div', { attr: { style: 'padding: 0 14px 10px 14px; flex-shrink: 0;' } });
        const inp = wrap.createEl('input', { type: 'text', attr: { placeholder: 'Search...', style: 'width: 100%; padding: 10px 16px; border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.9em; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);' } });
        inp.addEventListener('input', (e) => onSearch((e.target as HTMLInputElement).value));
    }

    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {
        const cbs = el.querySelectorAll('input[type="checkbox"]');
        cbs.forEach((cb, idx) => {
            cb.addEventListener('change', async () => {
                const isChecked = (cb as HTMLInputElement).checked;
                const lines = entry.body.split('\n');
                let count = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('- [ ]') || lines[i].includes('- [x]')) {
                        if (count === idx) {
                            lines[i] = lines[i].replace(isChecked ? '- [ ]' : '- [x]', isChecked ? '- [x]' : '- [ ]');
                            break;
                        }
                        count++;
                    }
                }
                await this.plugin.getThoughtController().updateThought({
                    filePath: entry.filePath,
                    content: lines.join('\n'),
                    context: entry.context,
                });
                new Notice(isChecked ? 'Task completed' : 'Task reopened');
            });
        });
    }

    refreshCurrentList() {
        if (typeof (this as any).render === 'function') {
            const container = (this.view as any).containerEl.querySelector('.diwa-view-content');
            if (container) (this as any).render(container);
            else this.view.renderView();
        } else {
            this.view.renderView();
        }
    }

    async renderTaskRow(entry: TaskEntry, container: HTMLElement, hideMetadata = false) {
        const isDone = entry.status === 'done';
        const row = container.createEl('div', { cls: 'diwa-card-row', attr: { style: 'position:relative; margin-bottom:12px;' } });
        const card = row.createEl('div', { cls: `diwa-card${isDone ? ' is-done-card' : ''}` });
        const topRow = card.createEl('div', { attr: { style: 'display:flex; gap:12px; align-items:flex-start;' } });
        const cb = topRow.createEl('input', { type: 'checkbox', attr: { style: 'margin-top:4px; cursor:pointer; width: 18px; height: 18px;' } });
        cb.checked = isDone;
        cb.addEventListener('change', async () => {
            await this.vault.toggleTask(entry.filePath, cb.checked);
            this.refreshCurrentList();
        });

        const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
        const textEl = content.createEl('div', { cls: `diwa-card-text${isDone ? ' is-done-text' : ''}` });
        await MarkdownRenderer.render(this.app, entry.body || entry.title, textEl, entry.filePath, this.view);
        this.hookInternalLinks(textEl, entry.filePath); this.hookImageZoom(textEl);

        const actions = row.createEl('div', { cls: 'diwa-actions-overlay', attr: { style: 'position:absolute; top:8px; right:8px; display:flex; gap:4px; padding:4px; background:var(--background-primary); border-radius:10px; border:1px solid var(--background-modifier-border-faint); box-shadow: var(--diwa-shadow);' } });

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), entry.due || null, true, async (newText, newCtxStr, newDue) => {
                const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                await this.vault.editTask(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_REPLY, 'Comment', () => { 
            new CommentModal(this.app, this.plugin, entry.filePath, entry.body || entry.title, async (text) => {
                const success = await this.vault.appendComment(entry.filePath, text);
                if (success) this.refreshCurrentList();
            }).open();
        });

        if (entry.children && entry.children.length > 0) {
            this.renderActionButton(actions, ICON_MESSAGE_SQUARE, `View Comments (${entry.children.length})`, () => {
                new ViewCommentsModal(this.app, this.plugin, entry, () => this.refreshCurrentList()).open();
            }, 'var(--interactive-accent)');
        }

        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.app, 'Move this task to trash?', async () => { await this.vault.deleteFile(entry.filePath, 'tasks'); this.refreshCurrentList(); }).open();
        }, 'var(--text-error)');

        if (!hideMetadata) {
            const metaRow = card.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:10px; flex-wrap:wrap; gap:8px;' } });
            if (entry.due) {
                const dueM = moment(entry.due, 'YYYY-MM-DD', true); const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment(), 'day');
                metaRow.createEl('span', { text: `📅 ${entry.due}`, attr: { style: `font-size:0.75em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; font-weight:700; text-transform: uppercase; letter-spacing: 0.05em;` } });
            }
            const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:6px;' } });
            for (const ctx of entry.context) ctxRight.createEl('span', { text: `#${ctx}`, cls: 'diwa-context-chip' });
        }
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0, hideAvatar: boolean = false, blur?: boolean) {
        const isCollapsed = this.view.collapsedThreads.has(entry.filePath); const indentStep = 24;
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 8px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border-faint); padding-left: 14px;` : ''}` } });

        const iconSection = itemEl.createEl('div', { attr: { style: 'width: 36px; margin-right: 12px; margin-top: 4px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center;' } });
        if (level === 0 && !hideAvatar) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 2px solid var(--background-modifier-border-faint); box-shadow: var(--diwa-shadow);' } });
            const img = iconContainer.createEl('img'); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
        }

        const contentDiv = itemEl.createEl('div', { cls: 'diwa-thought-content', attr: { style: 'flex-grow: 1; min-width: 0; position: relative;' } });
        const isBlurred = blur ?? this.settings.blurredNotes.includes(entry.filePath);
        
        const card = contentDiv.createEl('div', { cls: 'diwa-card' + (isBlurred ? ' diwa-blurred' : ''), attr: { style: 'cursor: text;' } });
        await MarkdownRenderer.render(this.app, entry.body, card, filePath, this.view);
        this.hookInternalLinks(card, filePath); this.hookImageZoom(card); this.hookCheckboxes(card, entry);

        const actions = contentDiv.createEl('div', { cls: 'diwa-actions-overlay', attr: { style: 'position:absolute; top:4px; right:4px; display:flex; gap:4px; padding:4px; background:var(--background-primary); border-radius:10px; border:1px solid var(--background-modifier-border-faint); z-index:10; box-shadow: var(--diwa-shadow);' } });

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), null, false, async (newText, newCtxStr) => {
                const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                await this.plugin.getThoughtController().updateThought({
                    filePath: entry.filePath,
                    content: newText.replace(/<br>/g, '\n'),
                    context: ctxArr,
                });
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_ARROW_RIGHT, 'Convert to Task', () => {
            new ConvertToTaskModal(this.app, entry.body, entry.context, async (title, dueDate) => {
                if (!title) {
                    new Notice('Task title is required.');
                    return;
                }

                const taskLink = this.plugin.taskLink;
                if (!taskLink) {
                    new Notice('Task support is not ready.');
                    return;
                }

                const task = await taskLink.createTaskFromThought(entry.filePath, title);
                if (!task.filePath) {
                    new Notice('Could not create task.');
                    return;
                }

                if (dueDate) {
                    await this.plugin.vault.setTaskDue(task.filePath, dueDate);
                }

                await taskLink.linkTaskToThought(task.filePath, entry.filePath);
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_REPLY, 'Reply', () => { 
            new CommentModal(this.app, this.plugin, entry.filePath, entry.body, async (text) => {
                const success = await this.vault.appendComment(entry.filePath, text);
                if (success) this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.app, 'Move thought to trash?', async () => { await this.vault.deleteFile(entry.filePath, 'thoughts'); this.refreshCurrentList(); }).open();
        }, 'var(--text-error)');

        if (entry.context.length > 0) {
            const ctxRow = card.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;' } });
            for (const ctx of entry.context) ctxRow.createEl('span', { text: `#${ctx}`, cls: 'diwa-context-chip' });
        }


    }

    async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement, blur?: boolean) {
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 6px; display: flex; align-items: flex-start; margin-left: 28px; border-left: 2.5px solid var(--background-modifier-border-faint); padding-left: 16px; opacity: 0.9;` } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; min-width: 0; position: relative;' } });
        const card = contentDiv.createEl('div', { cls: 'diwa-card' + (blur ? ' diwa-blurred' : ''), attr: { style: 'background:var(--background-secondary-alt); border-radius:12px; padding:12px; border:1px solid var(--background-modifier-border-faint); box-shadow: none;' } });
        await MarkdownRenderer.render(this.app, reply.text, card, parent.filePath, this.view);
        this.hookInternalLinks(card, parent.filePath); this.hookImageZoom(card);
    }

    // Default unload hook — override in tabs that allocate global resources
    onunload(): void { /* no-op */ }

    /** Optional hook: called when only tasks have changed (avoids full re-render). Override in task-aware tabs. */
    onTasksRefresh?(): void;

    render(container: HTMLElement, ...args: any[]): void {}
}

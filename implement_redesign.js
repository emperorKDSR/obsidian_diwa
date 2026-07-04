const fs = require('fs');
let code = fs.readFileSync('src/tabs/GawaTab.ts', 'utf8');

const oldRenderTableView = `    private renderTableView(parent: HTMLElement): void {
        const tableContainer = parent.createEl('div', { cls: 'diwa-gawa-table-view' });
        
        const table = tableContainer.createEl('table', { cls: 'diwa-gawa-modern-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Status' });
        headerRow.createEl('th', { text: 'Title' });
        headerRow.createEl('th', { text: 'Priority' });
        headerRow.createEl('th', { text: 'Due Date' });

        const tbody = table.createEl('tbody');
        
        let tasks = Array.from(this.plugin.index.taskIndex.values());
        if (!this._showDoneInTable) {
            tasks = tasks.filter(t => t.status !== 'done');
        }
        
        tasks.sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return (b.modified || '').localeCompare(a.modified || '');
        });

        if (tasks.length === 0) {
            const emptyRow = tbody.createEl('tr');
            emptyRow.createEl('td', {
                attr: { colspan: '4' },
                cls: 'diwa-gawa-table-empty',
                text: 'No tasks found. Create one to get started.'
            });
            return;
        }

        for (const task of tasks) {
            const tr = tbody.createEl('tr');
            
            const statusCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-status' });
            const statusIcon = statusCell.createEl('span', { cls: \`diwa-task-status-icon is-\${task.status}\` });
            setIcon(statusIcon, task.status === 'done' ? 'check-circle' : 'circle');
            
            statusCell.addEventListener('click', (e) => {
                e.stopPropagation();
                void this._taskController.toggleTask(this.getTaskIdentity(task));
            });

            const titleCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-title' });
            titleCell.createEl('span', { text: task.title, cls: 'diwa-gawa-table-title-text' });
            if (task.context && task.context.length > 0) {
                const tagsSpan = titleCell.createEl('span', { cls: 'diwa-gawa-table-tags' });
                task.context.forEach((tag: string) => {
                    tagsSpan.createEl('span', { cls: 'diwa-gawa-table-tag', text: \`#\${tag}\` });
                });
            }

            const priorityCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-priority' });
            if (task.priority) {
                const pSpan = priorityCell.createEl('span', { cls: \`diwa-priority-badge is-\${task.priority}\` });
                pSpan.setText(task.priority.toUpperCase());
            } else {
                priorityCell.setText('-');
                priorityCell.addClass('is-empty');
            }

            const dueCell = tr.createEl('td', { cls: 'diwa-gawa-table-cell-due' });
            if (task.due) {
                dueCell.setText(task.due);
            } else {
                dueCell.setText('-');
                dueCell.addClass('is-empty');
            }
            
            tr.addEventListener('click', () => {
                new EditTaskModal(
                    this.app,
                    task,
                    this.vault,
                    this.plugin.index,
                    () => {
                        this._taskController.syncFromIndex();
                        this.updateWorkspaceStats();
                    }
                ).open();
            });
        }
    }`;

const newRenderTableView = `    private formatRelativeDate(dateStr: string): string {
        const d = moment(dateStr, 'YYYY-MM-DD', true);
        if (!d.isValid()) return dateStr;
        const today = moment().startOf('day');
        if (d.isSame(today, 'day')) return 'Today';
        if (d.isSame(moment(today).add(1, 'day'), 'day')) return 'Tomorrow';
        if (d.isSame(moment(today).subtract(1, 'day'), 'day')) return 'Yesterday';
        return d.format('MMM D');
    }

    private getDateSeverityClass(dateStr: string): string {
        const d = moment(dateStr, 'YYYY-MM-DD', true);
        if (!d.isValid()) return '';
        const today = moment().startOf('day');
        if (d.isBefore(today)) return 'is-overdue';
        if (d.isSame(today, 'day')) return 'is-today';
        return '';
    }

    private getPriorityIcon(priority: string): string {
        const p = priority.toLowerCase();
        if (p === 'high') return 'signal-high';
        if (p === 'medium') return 'signal-medium';
        if (p === 'low') return 'signal-low';
        return 'signal-low';
    }

    private renderTableView(parent: HTMLElement): void {
        const container = parent.createEl('div', { cls: 'diwa-gawa-table-view diwa-gawa-list-container' });
        
        const header = container.createEl('div', { cls: 'diwa-gawa-list-header' });
        header.createEl('span', { text: 'Task', cls: 'col-main' });
        header.createEl('span', { text: 'Priority', cls: 'col-priority' });
        header.createEl('span', { text: 'Due', cls: 'col-due' });
        header.createEl('span', { text: '', cls: 'col-actions' });

        const listBody = container.createEl('div', { cls: 'diwa-gawa-list-body' });

        let tasks = Array.from(this.plugin.index.taskIndex.values());
        if (!this._showDoneInTable) {
            tasks = tasks.filter(t => t.status !== 'done');
        }
        
        tasks.sort((a, b) => {
            if (a.status === 'done' && b.status !== 'done') return 1;
            if (a.status !== 'done' && b.status === 'done') return -1;
            return (b.modified || '').localeCompare(a.modified || '');
        });

        if (tasks.length === 0) {
            const emptyRow = listBody.createEl('div', { cls: 'diwa-gawa-table-empty' });
            emptyRow.setText('No tasks found. Create one to get started.');
            return;
        }

        for (const task of tasks) {
            const row = listBody.createEl('div', { cls: 'diwa-gawa-list-row' });
            if (task.status === 'done') row.addClass('is-done');
            
            const mainCol = row.createEl('div', { cls: 'col-main' });
            
            const statusIcon = mainCol.createEl('span', { cls: \`diwa-status-icon is-\${task.status}\` });
            setIcon(statusIcon, task.status === 'done' ? 'check-circle' : 'circle');
            
            statusIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                void this._taskController.toggleTask(this.getTaskIdentity(task));
            });

            mainCol.createEl('span', { text: task.title, cls: 'diwa-title-text' });
            
            if (task.context && task.context.length > 0) {
                const tagsContainer = mainCol.createEl('div', { cls: 'diwa-tags-container' });
                task.context.forEach(tag => {
                    tagsContainer.createEl('span', { cls: 'diwa-tag', text: \`#\${tag}\` });
                });
            }

            const priorityCol = row.createEl('div', { cls: 'col-priority' });
            if (task.priority) {
                const pBadge = priorityCol.createEl('div', { cls: \`diwa-priority-badge is-\${task.priority.toLowerCase()}\` });
                setIcon(pBadge, this.getPriorityIcon(task.priority));
            }

            const dueCol = row.createEl('div', { cls: 'col-due' });
            if (task.due) {
                dueCol.setText(this.formatRelativeDate(task.due));
                const severity = this.getDateSeverityClass(task.due);
                if (severity) dueCol.addClass(severity);
            }

            const actionsCol = row.createEl('div', { cls: 'col-actions' });
            const editBtn = actionsCol.createEl('span', { cls: 'diwa-action-btn diwa-action-btn-ghost' });
            setIcon(editBtn, 'pencil');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                new EditTaskModal(
                    this.app,
                    task,
                    this.vault,
                    this.plugin.index,
                    () => {
                        this._taskController.syncFromIndex();
                        this.updateWorkspaceStats();
                    }
                ).open();
            });

            row.addEventListener('click', () => {
                new EditTaskModal(
                    this.app,
                    task,
                    this.vault,
                    this.plugin.index,
                    () => {
                        this._taskController.syncFromIndex();
                        this.updateWorkspaceStats();
                    }
                ).open();
            });
        }
    }`;

if (code.includes('private renderTableView(parent: HTMLElement): void {')) {
    code = code.replace(oldRenderTableView, newRenderTableView);
    fs.writeFileSync('src/tabs/GawaTab.ts', code);
    console.log("Successfully replaced renderTableView in GawaTab.ts");
} else {
    console.log("Could not find old renderTableView!");
}

let styles = fs.readFileSync('styles.css', 'utf8');

const newStyles = \`
/* ═══════════════════════════════════════════════════
   GAWA GRID LIST VIEW (Modern Table)
   ═══════════════════════════════════════════════════ */
.diwa-gawa-list-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
}

.diwa-gawa-list-header {
    display: grid;
    grid-template-columns: minmax(250px, 1fr) 80px 100px 40px;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.75em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}

.diwa-gawa-list-body {
    display: flex;
    flex-direction: column;
}

.diwa-gawa-list-row {
    display: grid;
    grid-template-columns: minmax(250px, 1fr) 80px 100px 40px;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border-faint);
    transition: background-color 0.15s ease;
    cursor: pointer;
}

.diwa-gawa-list-row:hover {
    background-color: var(--background-secondary-alt);
}

.diwa-gawa-list-row.is-done {
    opacity: 0.5;
}

.col-main {
    display: flex;
    align-items: center;
    gap: 12px;
    overflow: hidden;
}

.diwa-status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    cursor: pointer;
    transition: color 0.15s;
    width: 18px;
    height: 18px;
}
.diwa-status-icon:hover {
    color: var(--interactive-accent);
}
.diwa-status-icon.is-done {
    color: var(--interactive-accent);
}

.diwa-title-text {
    font-size: 0.9em;
    font-weight: 600;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.diwa-gawa-list-row.is-done .diwa-title-text {
    text-decoration: line-through;
}

.diwa-tags-container {
    display: flex;
    gap: 4px;
}

.diwa-tag {
    font-size: 0.7em;
    font-weight: 700;
    color: var(--text-muted);
    background-color: var(--background-secondary);
    padding: 2px 6px;
    border-radius: 4px;
}

.col-priority {
    display: flex;
    align-items: center;
    justify-content: flex-start;
}
.diwa-priority-badge {
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
}
.diwa-priority-badge.is-high { color: var(--text-error); }
.diwa-priority-badge.is-medium { color: #f59e0b; }

.col-due {
    font-size: 0.85em;
    font-weight: 500;
    color: var(--text-muted);
}
.col-due.is-today {
    color: var(--interactive-accent);
    font-weight: 700;
}
.col-due.is-overdue {
    color: var(--text-error);
    font-weight: 700;
}

.col-actions {
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
    display: flex;
    justify-content: flex-end;
}

.diwa-gawa-list-row:hover .col-actions {
    opacity: 1;
}

.diwa-action-btn-ghost {
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s, color 0.15s;
}

.diwa-action-btn-ghost:hover {
    background-color: var(--background-modifier-active-hover);
    color: var(--text-normal);
}
\`;

styles += newStyles;
fs.writeFileSync('styles.css', styles);
console.log("Successfully appended new styles to styles.css");

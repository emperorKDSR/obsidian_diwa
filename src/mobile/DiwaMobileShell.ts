import { App } from 'obsidian';
import type { TaskEntry, ThoughtEntry } from '../types';
import type DiwaPlugin from '../main';

type MobileView = 'home' | 'tasks' | 'thoughts' | 'ai';

const MOBILE_SHELL_STYLE_ID = 'diwa-mobile-shell-style';

export class DiwaMobileShell {
    private activeView: MobileView = 'home';
    private hostEl: HTMLElement | null = null;

    constructor(private app: App, private plugin: DiwaPlugin) {}

    public render(container: HTMLElement): void {
        this.ensureStyles();
        this.hostEl = container;
        container.empty();

        const shell = container.createDiv('diwa-mobile-shell');
        const content = shell.createDiv('diwa-mobile-content');
        const nav = shell.createDiv('diwa-mobile-nav');

        this.renderActiveView(content);
        this.renderBottomNav(nav);
    }

    private renderActiveView(container: HTMLElement): void {
        container.empty();

        switch (this.activeView) {
            case 'home':
                this.renderHome(container);
                break;
            case 'tasks':
                this.renderTasks(container);
                break;
            case 'thoughts':
                this.renderThoughts(container);
                break;
            case 'ai':
                this.renderAI(container);
                break;
        }
    }

    private switchView(view: MobileView): void {
        this.activeView = view;
        if (this.hostEl) this.render(this.hostEl);
    }

    private renderHome(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-home');

        const capture = wrap.createEl('button', {
            cls: 'diwa-mobile-capture-entry',
            text: 'Capture a thought or task...',
            attr: { type: 'button' },
        });
        capture.addEventListener('click', () => this.plugin.openCaptureModal());

        const focus = wrap.createDiv('diwa-mobile-focus');
        focus.createDiv({ cls: 'diwa-mobile-section-title', text: 'Today Focus' });
        const focusList = focus.createDiv('diwa-mobile-focus-list');
        const tasks = this.plugin.getTopTasks(3);
        if (tasks.length === 0) {
            focusList.createDiv({ cls: 'diwa-mobile-empty', text: 'No priority tasks yet.' });
        } else {
            tasks.forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true, compact: true });
            });
        }

        wrap.createDiv({
            cls: 'diwa-mobile-nav-hint',
            text: 'Use the bottom tabs to jump between Tasks, Thoughts, and AI.',
        });
    }

    private renderTasks(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-list-wrap');
        wrap.createDiv({ cls: 'diwa-mobile-section-title', text: 'Tasks' });
        const list = wrap.createDiv('diwa-mobile-list');
        const tasks = this.plugin.getAllTasks();
        if (tasks.length === 0) {
            list.createDiv({ cls: 'diwa-mobile-empty', text: 'No tasks available.' });
            return;
        }
        tasks.forEach((task: TaskEntry) => {
            this.plugin.renderTaskRow(list, task, { mobile: true });
        });
    }

    private renderThoughts(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-list-wrap');
        wrap.createDiv({ cls: 'diwa-mobile-section-title', text: 'Thoughts' });
        const list = wrap.createDiv('diwa-mobile-list');
        const thoughts = this.plugin.getAllThoughts();
        if (thoughts.length === 0) {
            list.createDiv({ cls: 'diwa-mobile-empty', text: 'No thoughts available.' });
            return;
        }
        thoughts.forEach((thought: ThoughtEntry) => {
            this.plugin.renderThoughtCard(list, thought, { mobile: true });
        });
    }

    private renderAI(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-ai');
        this.plugin.renderAIView(wrap);
    }

    private renderBottomNav(container: HTMLElement): void {
        const items: Array<{ id: MobileView; label: string }> = [
            { id: 'home', label: 'Home' },
            { id: 'tasks', label: 'Tasks' },
            { id: 'thoughts', label: 'Thoughts' },
            { id: 'ai', label: 'AI' },
        ];

        items.forEach((item) => {
            const btn = container.createEl('button', {
                cls: 'diwa-mobile-nav-btn',
                text: item.label,
                attr: { type: 'button' },
            });

            if (this.activeView === item.id) {
                btn.addClass('is-active');
            }

            btn.addEventListener('click', () => this.switchView(item.id));
        });
    }

    private ensureStyles(): void {
        if (document.getElementById(MOBILE_SHELL_STYLE_ID)) return;
        const styleEl = document.createElement('style');
        styleEl.id = MOBILE_SHELL_STYLE_ID;
        styleEl.textContent = `
.diwa-mobile-shell { display:flex; flex-direction:column; height:100%; background:var(--background-primary); }
.diwa-mobile-content { flex:1; overflow-y:auto; padding-bottom:8px; }
.diwa-mobile-nav { display:flex; border-top:1px solid var(--background-modifier-border); background:var(--background-primary); }
.diwa-mobile-nav-btn { flex:1; min-height:52px; border:none; background:transparent; color:var(--text-muted); text-align:center; font-size:13px; font-weight:700; }
.diwa-mobile-nav-btn.is-active { color:var(--interactive-accent); }
.diwa-mobile-home { padding:16px; display:flex; flex-direction:column; gap:12px; }
.diwa-mobile-capture-entry { min-height:52px; width:100%; border:none; border-radius:12px; background:var(--background-secondary-alt); color:var(--text-normal); text-align:left; padding:14px; font-size:15px; font-weight:600; }
.diwa-mobile-focus, .diwa-mobile-list-wrap { display:flex; flex-direction:column; gap:10px; }
.diwa-mobile-section-title { font-size:12px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted); }
.diwa-mobile-focus-list, .diwa-mobile-list { display:flex; flex-direction:column; gap:8px; }
.diwa-mobile-empty { color:var(--text-muted); font-size:13px; padding:8px 2px; }
.diwa-mobile-nav-hint { font-size:12px; color:var(--text-muted); }
.diwa-mobile-task-row { display:flex; align-items:flex-start; gap:10px; min-height:48px; padding:10px 12px; border-radius:12px; border:1px solid var(--background-modifier-border-faint); background:var(--background-secondary); }
.diwa-mobile-task-row.is-done .diwa-mobile-task-title { text-decoration:line-through; color:var(--text-muted); }
.diwa-mobile-task-row.is-compact { padding:10px; }
.diwa-mobile-task-toggle { min-width:44px; min-height:44px; margin:-4px 0; border:none; background:transparent; color:var(--text-muted); display:flex; align-items:center; justify-content:center; }
.diwa-mobile-task-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
.diwa-mobile-task-title { color:var(--text-normal); font-size:14px; line-height:1.35; word-break:break-word; }
.diwa-mobile-task-meta { color:var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:0.04em; }
.diwa-mobile-thought-card { min-height:48px; padding:12px; border-radius:12px; border:1px solid var(--background-modifier-border-faint); background:var(--background-secondary); display:flex; flex-direction:column; gap:6px; }
.diwa-mobile-thought-title { font-size:14px; font-weight:600; color:var(--text-normal); }
.diwa-mobile-thought-body { font-size:13px; color:var(--text-muted); line-height:1.4; white-space:pre-wrap; word-break:break-word; }
.diwa-mobile-thought-meta { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em; }
.diwa-mobile-thought-open-btn, .diwa-mobile-ai-open-btn, .diwa-mobile-ai-capture-btn { min-height:44px; border-radius:10px; border:1px solid var(--background-modifier-border); background:var(--background-secondary); color:var(--text-normal); font-weight:700; }
.diwa-mobile-ai { padding:16px; }
.diwa-mobile-ai-card { padding:14px; border-radius:12px; border:1px solid var(--background-modifier-border-faint); background:var(--background-secondary); display:flex; flex-direction:column; gap:10px; }
.diwa-mobile-ai-title { font-size:16px; font-weight:800; color:var(--text-normal); }
.diwa-mobile-ai-subtitle { font-size:13px; color:var(--text-muted); line-height:1.4; }
        `.trim();
        document.head.appendChild(styleEl);
    }
}

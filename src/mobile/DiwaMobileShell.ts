import { App, Modal } from 'obsidian';
import type { TaskEntry, ThoughtEntry } from '../types';
import type DiwaPlugin from '../main';

type MobileView = 'home' | 'tasks' | 'thoughts' | 'ai';
export type ShellPlatform = 'mobile' | 'tablet' | 'desktop';

export function getPlatform(app: App): ShellPlatform {
    const isMobile = (app as { isMobile?: boolean }).isMobile ?? false;
    if (!isMobile) return 'desktop';
    return window.innerWidth >= 768 ? 'tablet' : 'mobile';
}

export class DiwaMobileShell {
    private activeView: MobileView = 'home';
    private activeContexts: Set<string> = new Set();
    private selectedThought: ThoughtEntry | null = null;
    private hostEl: HTMLElement | null = null;
    private platform: Exclude<ShellPlatform, 'desktop'>;

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        options: { platform?: Exclude<ShellPlatform, 'desktop'> } = {},
    ) {
        this.platform = options.platform ?? 'mobile';
    }

    public setPlatform(platform: Exclude<ShellPlatform, 'desktop'>): void {
        this.platform = platform;
    }

    public render(container: HTMLElement): void {
        this.hostEl = container;
        container.empty();

        const shellClass = this.platform === 'tablet'
            ? 'diwa-mobile-shell diwa-tablet-shell'
            : 'diwa-mobile-shell';
        const shell = container.createDiv(shellClass);

        if (this.platform === 'tablet') {
            this.renderTopTabs(shell);
        }

        const contentClass = this.platform === 'tablet'
            ? 'diwa-content-tablet'
            : 'diwa-mobile-content';
        const content = shell.createDiv(contentClass);
        this.renderActiveView(content);

        if (this.platform === 'tablet') {
            return;
        }
        this.renderBottomNav(shell.createDiv('diwa-mobile-nav'));
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
        this.refreshView();
    }

    private refreshView(): void {
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
        const tasks = this.plugin.getTodayFocusTasks(3);
        if (tasks.length === 0) {
            focusList.createDiv({ cls: 'diwa-mobile-empty', text: 'No priority tasks yet.' });
        } else {
            tasks.forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true, compact: true });
            });
        }

        wrap.createDiv({
            cls: 'diwa-mobile-nav-hint',
            text: 'Use the tabs to jump between Gawa, Diwa, and AI.',
        });
    }

    private renderTasks(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-list-wrap');
        wrap.createDiv({ cls: 'diwa-mobile-section-title', text: 'Gawa' });
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
        const wrap = container.createDiv('diwa-thoughts-wrap');
        wrap.createDiv({ cls: 'diwa-mobile-section-title', text: 'Diwa' });
        const contexts = this.plugin.getContexts();
        this.renderContextBar(wrap, contexts);
        const thoughts = this.filterThoughts(this.plugin.getAllThoughts(), this.activeContexts);

        if (this.platform === 'tablet') {
            this.renderTabletThoughtsLayout(wrap, thoughts);
            return;
        }

        const list = wrap.createDiv('diwa-thought-list');
        this.renderThoughtList(list, thoughts, false);
    }

    private filterThoughts(thoughts: ThoughtEntry[], activeContexts: Set<string>): ThoughtEntry[] {
        if (activeContexts.size === 0) return thoughts;
        return thoughts.filter((thought) => (thought.context ?? []).some((ctx) => activeContexts.has(ctx)));
    }

    private renderContextBar(container: HTMLElement, contexts: string[]): void {
        const bar = container.createDiv('diwa-context-bar');

        const allChip = bar.createDiv('diwa-chip');
        allChip.setText('All');
        if (this.activeContexts.size === 0) {
            allChip.addClass('is-active');
        }
        allChip.addEventListener('click', () => {
            this.activeContexts.clear();
            this.refreshView();
        });

        contexts.forEach((ctx) => {
            const chip = bar.createDiv('diwa-chip');
            chip.setText(ctx);
            if (this.activeContexts.has(ctx)) {
                chip.addClass('is-active');
            }
            chip.addEventListener('click', () => {
                if (this.activeContexts.has(ctx)) this.activeContexts.delete(ctx);
                else this.activeContexts.add(ctx);
                this.refreshView();
            });
        });

        const more = bar.createDiv('diwa-chip diwa-chip-add');
        more.setText('+');
        more.addEventListener('click', () => this.openContextPicker(contexts));
    }

    private openContextPicker(contexts: string[]): void {
        new MobileContextPickerModal(this.app, contexts, this.activeContexts, () => this.refreshView()).open();
    }

    private renderThoughtList(container: HTMLElement, thoughts: ThoughtEntry[], selectable: boolean): void {
        if (thoughts.length === 0) {
            container.createDiv({ cls: 'diwa-mobile-empty', text: 'No thoughts available.' });
            return;
        }
        thoughts.forEach((thought: ThoughtEntry) => {
            const card = this.plugin.renderThoughtCard(container, thought, { mobile: true });
            if (!selectable) return;
            if (this.selectedThought && (this.selectedThought.id || this.selectedThought.filePath) === (thought.id || thought.filePath)) {
                card.addClass('is-selected');
            }
            card.addEventListener('click', (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest('a')) return;
                this.selectedThought = thought;
                this.refreshView();
            });
        });
    }

    private renderTabletThoughtsLayout(container: HTMLElement, thoughts: ThoughtEntry[]): void {
        const layout = container.createDiv('diwa-tablet-split');
        const left = layout.createDiv('diwa-tablet-left');
        const right = layout.createDiv('diwa-tablet-right');
        const list = left.createDiv('diwa-thought-list');

        this.renderThoughtList(list, thoughts, true);
        if (thoughts.length === 0) {
            right.createDiv({ cls: 'diwa-mobile-empty', text: 'Select a thought to preview.' });
            return;
        }

        const selectedId = this.selectedThought?.id || this.selectedThought?.filePath || '';
        const resolved = thoughts.find((thought) => (thought.id || thought.filePath) === selectedId) ?? thoughts[0];
        this.selectedThought = resolved;
        right.createDiv({ cls: 'diwa-mobile-section-title', text: 'Preview' });
        this.plugin.renderThoughtCard(right, resolved, { mobile: true });
    }

    private renderAI(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-ai');
        this.plugin.renderAIView(wrap);
    }

    private renderTopTabs(container: HTMLElement): void {
        const bar = container.createDiv('diwa-tablet-tabs');
        const items: Array<{ id: MobileView; label: string }> = [
            { id: 'home', label: 'Home' },
            { id: 'tasks', label: 'Gawa' },
            { id: 'thoughts', label: 'Diwa' },
            { id: 'ai', label: 'AI' },
        ];

        items.forEach((item) => {
            const tab = bar.createDiv('diwa-tab');
            tab.setText(item.label);
            if (this.activeView === item.id) tab.addClass('is-active');
            tab.addEventListener('click', () => {
                this.activeView = item.id;
                this.refreshView();
            });
        });
    }

    private renderBottomNav(container: HTMLElement): void {
        const items: Array<{ id: MobileView; label: string }> = [
            { id: 'home', label: 'Home' },
            { id: 'tasks', label: 'Gawa' },
            { id: 'thoughts', label: 'Diwa' },
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
}

class MobileContextPickerModal extends Modal {
    constructor(
        app: App,
        private contexts: string[],
        private activeContexts: Set<string>,
        private onApply: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('diwa-context-modal');
        contentEl.empty();

        const wrap = contentEl.createDiv('diwa-context-picker');
        wrap.createDiv({ cls: 'diwa-context-picker-title', text: 'Filter contexts' });
        const list = wrap.createDiv('diwa-context-picker-list');

        this.contexts.forEach((ctx) => {
            const row = list.createDiv('diwa-context-row');
            const checkbox = row.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
            checkbox.checked = this.activeContexts.has(ctx);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) this.activeContexts.add(ctx);
                else this.activeContexts.delete(ctx);
            });
            row.createDiv({ cls: 'diwa-context-row-label', text: ctx });
        });

        const apply = wrap.createEl('button', {
            cls: 'diwa-btn-primary',
            text: 'Apply',
            attr: { type: 'button' },
        });
        apply.addEventListener('click', () => {
            this.onApply();
            this.close();
        });
    }
}

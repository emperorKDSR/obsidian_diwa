import { App, Component, MarkdownRenderer, Platform, TFile, setIcon } from 'obsidian';
import type { TaskEntry, ThoughtEntry } from '../types';
import type { TaskController } from './TaskController';
import type { ThoughtController } from './ThoughtController';
import type { ThoughtProcessor } from './ThoughtProcessor';
import type DiwaPlugin from '../main';

export class ThoughtFocusPanel {
    private hostEl: HTMLElement | null = null;
    private rootEl: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    private aiModeEl: HTMLElement | null = null;
    private aiLoadingEl: HTMLElement | null = null;
    private aiContainerEl: HTMLElement | null = null;
    private aiTriggerBtn: HTMLButtonElement | null = null;
    private guidedNextEl: HTMLElement | null = null;
    private guidedClustersEl: HTMLElement | null = null;
    private relatedEl: HTMLElement | null = null;
    private recallEl: HTMLElement | null = null;
    private tasksEl: HTMLElement | null = null;
    private notesEl: HTMLElement | null = null;
    private backBtn: HTMLButtonElement | null = null;
    private forwardBtn: HTMLButtonElement | null = null;
    private mobileBackBtn: HTMLButtonElement | null = null;

    private history: string[] = [];
    private index = -1;
    private expandedClusterLabel: string | null = null;
    private currentThoughtId: string | null = null;
    private aiInFlight = new Set<string>();
    private aiCache = new Map<string, NonNullable<ThoughtEntry['aiResult']>>();

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        private thoughtController: ThoughtController,
        private taskController: TaskController,
        private thoughtProcessor: ThoughtProcessor,
        private markdownHost: Component,
    ) {}

    attach(hostEl: HTMLElement): void {
        this.hostEl = hostEl;
        if (this.rootEl && this.rootEl.parentElement === hostEl) return;
        this.rootEl?.remove();
        this.rootEl = hostEl.createEl('section', { cls: 'diwa-thought-focus-panel is-hidden' });

        const header = this.rootEl.createEl('div', { cls: 'diwa-thought-focus-header' });
        this.mobileBackBtn = header.createEl('button', {
            cls: 'diwa-thought-focus-mobile-back',
            text: '← Back',
            attr: { type: 'button', title: 'Close panel' },
        }) as HTMLButtonElement;
        this.backBtn = header.createEl('button', { cls: 'diwa-thought-focus-nav', attr: { type: 'button', title: 'Back' } }) as HTMLButtonElement;
        setIcon(this.backBtn, 'arrow-left');
        this.forwardBtn = header.createEl('button', { cls: 'diwa-thought-focus-nav', attr: { type: 'button', title: 'Forward' } }) as HTMLButtonElement;
        setIcon(this.forwardBtn, 'arrow-right');
        this.titleEl = header.createEl('div', { cls: 'diwa-thought-focus-title', text: 'Thought Focus' });
        this.aiModeEl = header.createEl('div', { cls: 'diwa-thought-focus-ai-mode' });

        const body = this.rootEl.createEl('div', { cls: 'diwa-thought-focus-body' });
        this.contentEl = body.createEl('div', { cls: 'diwa-thought-focus-content' });
        this.aiLoadingEl = body.createEl('div', { cls: 'ai-loading' });
        this.aiContainerEl = body.createEl('div', { cls: 'ai-container' });
        this.aiTriggerBtn = body.createEl('button', {
            cls: 'ai-trigger-btn',
            text: '🧠 Analyze',
            attr: { type: 'button' },
        }) as HTMLButtonElement;
        this.guidedNextEl = body.createEl('div', { cls: 'guided-next', attr: { style: 'display:none;' } });
        this.guidedClustersEl = body.createEl('div', { cls: 'guided-clusters', attr: { style: 'display:none;' } });
        this.relatedEl = body.createEl('div', { cls: 'diwa-thought-focus-section' });
        this.recallEl = body.createEl('div', { cls: 'diwa-thought-focus-section' });
        this.tasksEl = body.createEl('div', { cls: 'diwa-thought-focus-section' });
        this.notesEl = body.createEl('div', { cls: 'diwa-thought-focus-section' });

        this.mobileBackBtn.addEventListener('click', () => this.closeMobile());
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.aiTriggerBtn.addEventListener('click', () => {
            const thoughtId = this.currentThoughtId;
            if (!thoughtId) return;
            const thought = this.thoughtController.getThought(thoughtId);
            if (!thought) return;
            void this.triggerAI(thought);
        });
        this.updateNavState();
    }

    destroy(): void {
        this.rootEl?.remove();
        this.rootEl = null;
        this.hostEl = null;
    }

    open(thoughtId: string, fromHistory = false): void {
        const thought = this.thoughtController.getThought(thoughtId);
        if (!thought) return;
        this.currentThoughtId = thought.id || thought.filePath;
        if (!fromHistory) {
            if (this.index < this.history.length - 1) {
                this.history = this.history.slice(0, this.index + 1);
            }
            this.history.push(thought.id || thought.filePath);
            this.index = this.history.length - 1;
        }
        if (this.isMobile()) {
            this.openMobile(thought.id || thought.filePath);
        }
        void this.render(thought);
        window.setTimeout(() => {
            void this.triggerAI(thought);
        }, 0);
        this.updateNavState();
    }

    openMobile(thoughtId: string): void {
        this.currentThoughtId = thoughtId;
        this.rootEl?.addClass('open');
        this.rootEl?.removeClass('is-hidden');
    }

    closeMobile(): void {
        this.rootEl?.removeClass('open');
        this.rootEl?.addClass('is-hidden');
    }

    goBack(): void {
        if (this.index <= 0) return;
        this.index -= 1;
        const thoughtId = this.history[this.index];
        if (thoughtId) this.open(thoughtId, true);
    }

    goForward(): void {
        if (this.index >= this.history.length - 1) return;
        this.index += 1;
        const thoughtId = this.history[this.index];
        if (thoughtId) this.open(thoughtId, true);
    }

    private async render(thought: ThoughtEntry): Promise<void> {
        if (!this.rootEl || !this.titleEl || !this.contentEl || !this.guidedNextEl || !this.guidedClustersEl || !this.relatedEl || !this.recallEl || !this.tasksEl || !this.notesEl) return;
        this.rootEl.removeClass('is-hidden');
        this.aiModeEl?.setText(this.plugin.shouldUseAI() ? '🤖 Assist Mode' : '');
        const title = (thought.title || thought.content || thought.body || thought.filePath).split('\n').find((line) => line.trim())?.trim() || 'Thought';
        this.titleEl.setText(title.length > 48 ? `${title.slice(0, 45)}...` : title);

        this.contentEl.empty();
        void MarkdownRenderer.render(this.app, thought.body || thought.content || thought.title || '', this.contentEl, thought.filePath, this.markdownHost);
        this.renderAIState(thought);

        const next = await this.thoughtProcessor.getNextBestThought(thought);
        this.guidedNextEl.empty();
        if (next) {
            this.guidedNextEl.createEl('div', { cls: 'label', text: 'Suggested Next' });
            const row = this.guidedNextEl.createEl('div', { cls: 'guided-next-row' });
            row.createEl('span', { cls: 'text', text: this.snippet(next) });
            const open = row.createEl('button', {
                cls: 'guided-next-open diwa-thought-focus-open',
                attr: { type: 'button', title: 'Open suggested thought', 'aria-label': 'Open suggested thought' },
            }) as HTMLButtonElement;
            setIcon(open, 'arrow-up-right');
            open.addEventListener('click', () => this.open(next.id || next.filePath));
            this.guidedNextEl.style.display = '';
        } else {
            this.guidedNextEl.style.display = 'none';
        }

        this.renderGuidedClusters(thought);

        const relatedResult = await this.thoughtProcessor.findRelatedWithMeta(thought);
        this.renderThoughtList(
            this.relatedEl,
            relatedResult.usedAI ? '✨ Related (AI)' : 'Related Thoughts',
            relatedResult.thoughts,
            relatedResult.usedAI,
        );
        this.renderThoughtList(this.recallEl, 'Related Past Thoughts', this.thoughtProcessor.recall(thought));
        this.renderTasks(this.tasksEl, this.taskController.getLinkedTasksForThought(thought.filePath));
        this.renderNotes(this.notesEl, thought.wikilinks || []);
    }

    private async triggerAI(thought: ThoughtEntry): Promise<void> {
        const thoughtKey = thought.id || thought.filePath;
        if (!thoughtKey) return;
        if (!this.plugin.shouldUseAI() || !this.plugin.aiProcessor?.available) return;
        if (this.aiInFlight.has(thoughtKey)) return;
        if (thought.aiProcessed && thought.aiResult) {
            this.aiCache.set(thoughtKey, thought.aiResult);
            if ((this.currentThoughtId || '') === thoughtKey) this.renderAI(thought.aiResult);
            return;
        }
        const existing = this.aiCache.get(thoughtKey);
        if (existing) {
            thought.aiProcessed = true;
            thought.aiResult = existing;
            if ((this.currentThoughtId || '') === thoughtKey) this.renderAI(existing);
            return;
        }

        this.aiInFlight.add(thoughtKey);
        if ((this.currentThoughtId || '') === thoughtKey) this.setAILoading(true);
        try {
            const source = thought.content || thought.body || thought.title || '';
            const result = await this.plugin.aiProcessor.analyzeThought(source);
            thought.aiProcessed = true;
            thought.aiResult = result;
            this.aiCache.set(thoughtKey, result);
            if ((this.currentThoughtId || '') === thoughtKey) this.renderAI(result);
        } catch (error) {
            console.warn('AI error:', error);
        } finally {
            this.aiInFlight.delete(thoughtKey);
            if ((this.currentThoughtId || '') === thoughtKey) this.setAILoading(false);
        }
    }

    private setAILoading(flag: boolean): void {
        if (!this.aiLoadingEl) return;
        this.aiLoadingEl.setText(flag ? '⏳ Analyzing...' : '');
        if (this.aiTriggerBtn) this.aiTriggerBtn.disabled = flag;
    }

    private renderAIState(thought: ThoughtEntry): void {
        const thoughtKey = thought.id || thought.filePath;
        if (!thoughtKey || !this.aiContainerEl || !this.aiTriggerBtn) return;
        this.aiContainerEl.empty();
        if (!this.plugin.shouldUseAI() || !this.plugin.aiProcessor?.available) {
            this.setAILoading(false);
            this.aiTriggerBtn.style.display = 'none';
            return;
        }
        const cached = thought.aiResult || this.aiCache.get(thoughtKey);
        if (cached) {
            this.aiTriggerBtn.style.display = 'none';
            this.setAILoading(false);
            this.renderAI(cached);
            return;
        }
        if (this.aiInFlight.has(thoughtKey)) {
            this.aiTriggerBtn.style.display = 'none';
            this.setAILoading(true);
            return;
        }
        this.setAILoading(false);
        this.aiTriggerBtn.style.display = '';
    }

    private renderAI(result: NonNullable<ThoughtEntry['aiResult']>): void {
        if (!this.aiContainerEl || !result) return;
        this.aiContainerEl.empty();
        const section = this.aiContainerEl.createEl('div', { cls: 'ai-section' });
        section.createEl('div', { cls: 'ai-label', text: '🧠 AI Insight' });
        section.createEl('div', { cls: 'ai-content', text: result.summary || '' });
        if (this.aiTriggerBtn) this.aiTriggerBtn.style.display = 'none';
    }

    private renderGuidedClusters(currentThought: ThoughtEntry): void {
        if (!this.guidedClustersEl) return;
        const clusters = this.thoughtProcessor.getClusterSuggestions(currentThought);
        this.guidedClustersEl.empty();
        if (clusters.length === 0) {
            this.guidedClustersEl.style.display = 'none';
            return;
        }
        this.guidedClustersEl.style.display = '';
        this.guidedClustersEl.createEl('div', { cls: 'label', text: 'Explore Direction' });
        const list = this.guidedClustersEl.createEl('div', { cls: 'guided-clusters-list' });
        const labels = new Set(clusters.map((cluster) => cluster.label));
        if (this.expandedClusterLabel && !labels.has(this.expandedClusterLabel)) {
            this.expandedClusterLabel = null;
        }

        for (const cluster of clusters) {
            const row = list.createEl('div', { cls: 'guided-cluster-row' });
            const trigger = row.createEl('button', {
                cls: 'guided-cluster-item',
                text: `${cluster.label} (${cluster.thoughts.length})`,
                attr: { type: 'button' },
            }) as HTMLButtonElement;
            const shouldExpand = this.expandedClusterLabel === cluster.label;
            if (shouldExpand) trigger.addClass('is-active');
            trigger.addEventListener('click', () => {
                this.expandedClusterLabel = this.expandedClusterLabel === cluster.label ? null : cluster.label;
                this.renderGuidedClusters(currentThought);
            });
            if (!shouldExpand) continue;
            const thoughtList = row.createEl('div', { cls: 'guided-cluster-thoughts' });
            for (const thought of cluster.thoughts) {
                thoughtList.createEl('div', { cls: 'guided-cluster-thought', text: `• ${this.snippet(thought)}` });
            }
        }
    }

    private renderThoughtList(container: HTMLElement, title: string, thoughts: ThoughtEntry[], aiGenerated = false): void {
        container.empty();
        container.createEl('div', { cls: aiGenerated ? 'ai-label' : 'label', text: title });
        if (thoughts.length === 0) {
            container.createEl('div', { cls: 'diwa-thought-focus-empty', text: 'None' });
            return;
        }
        const list = container.createEl('div', { cls: 'diwa-thought-focus-list' });
        for (const thought of thoughts) {
            const row = list.createEl('div', { cls: 'diwa-thought-focus-row' });
            row.createEl('span', { text: this.snippet(thought) });
            const open = row.createEl('button', { cls: 'diwa-thought-focus-open', text: '↗', attr: { type: 'button' } }) as HTMLButtonElement;
            open.addEventListener('click', async () => {
                const file = this.app.vault.getAbstractFileByPath(thought.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    private renderTasks(container: HTMLElement, tasks: TaskEntry[]): void {
        container.empty();
        container.createEl('div', { cls: 'diwa-thought-focus-section-title', text: 'Linked Tasks' });
        if (tasks.length === 0) {
            container.createEl('div', { cls: 'diwa-thought-focus-empty', text: 'None' });
            return;
        }
        const list = container.createEl('div', { cls: 'diwa-thought-focus-list' });
        for (const task of tasks) {
            const row = list.createEl('div', { cls: 'diwa-thought-focus-row' });
            row.createEl('span', { text: task.title || task.filePath });
            const open = row.createEl('button', { cls: 'diwa-thought-focus-open', text: '↗', attr: { type: 'button' } }) as HTMLButtonElement;
            open.addEventListener('click', async () => {
                const file = this.app.vault.getAbstractFileByPath(task.filePath);
                if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    private renderNotes(container: HTMLElement, notes: string[]): void {
        container.empty();
        container.createEl('div', { cls: 'diwa-thought-focus-section-title', text: 'Wikilinks' });
        if (notes.length === 0) {
            container.createEl('div', { cls: 'diwa-thought-focus-empty', text: 'None' });
            return;
        }
        const list = container.createEl('div', { cls: 'diwa-thought-focus-list' });
        for (const note of notes) {
            const row = list.createEl('div', { cls: 'diwa-thought-focus-row' });
            row.createEl('span', { text: note });
            const open = row.createEl('button', { cls: 'diwa-thought-focus-open', text: '↗', attr: { type: 'button' } }) as HTMLButtonElement;
            open.addEventListener('click', async () => {
                const file = this.thoughtController.resolveWikiLink(note);
                if (file instanceof TFile) {
                    await this.app.workspace.getLeaf(false).openFile(file);
                    return;
                }
                await this.app.workspace.openLinkText(note, '', false);
            });
        }
    }

    private snippet(thought: ThoughtEntry): string {
        const raw = (thought.body || thought.content || thought.title || thought.filePath).split('\n').find((line) => line.trim())?.trim() || thought.filePath;
        return raw.length > 68 ? `${raw.slice(0, 65)}...` : raw;
    }

    private updateNavState(): void {
        if (this.backBtn) this.backBtn.disabled = this.index <= 0;
        if (this.forwardBtn) this.forwardBtn.disabled = this.index >= this.history.length - 1;
    }

    private isMobile(): boolean {
        return Platform.isMobile;
    }
}

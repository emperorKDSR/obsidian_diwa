import { App, Component, Modal, Notice, TFile, moment, setIcon } from 'obsidian';
import type {
    BulsaLeafState,
    ResponsiveShellState,
    ResponsiveWorkspaceView,
    TaskEntry,
    ThoughtEntry,
} from '../types';
import type DiwaPlugin from '../main';
import { getWorkspaceViewportSize, isTaskDone, isTablet } from '../utils';
import { EditTaskModal } from '../modals/EditTaskModal';
import { FastTaskCaptureModal, type FastTaskCapturePayload } from '../modals/FastTaskCaptureModal';
import { NewDueModal } from '../modals/NewDueModal';
import { PaymentModal } from '../modals/PaymentModal';
import { renderResponsiveBulsa } from './BulsaResponsiveRenderer';
import { WeeklyReviewWorkspace } from '../review/WeeklyReviewWorkspace';

export type ShellPlatform = 'mobile' | 'tablet' | 'desktop';

interface ShellNavItem {
    id: ResponsiveWorkspaceView;
    label: string;
    icon: string;
    shortLabel?: string;
    ariaLabel?: string;
}

const SHELL_ITEMS: ShellNavItem[] = [
    { id: 'home', label: 'Home', icon: 'house' },
    { id: 'review', label: 'Review', shortLabel: 'Rev', ariaLabel: 'Weekly Review', icon: 'calendar' },
    { id: 'bulsa', label: 'Bulsa', icon: 'wallet' },
    { id: 'tasks', label: 'Gawa', icon: 'check-square-2' },
    { id: 'thoughts', label: 'Diwa', icon: 'pen-square' },
];

const DEFAULT_BULSA_STATE: Required<BulsaLeafState> = {
    mode: 'ledger',
    showAllDues: false,
};

interface TaskCache {
    all: TaskEntry[];
    open: TaskEntry[];
    focus: TaskEntry[];
}

interface ThoughtCache {
    all: ThoughtEntry[];
    recentTwo: ThoughtEntry[];
    recentThree: ThoughtEntry[];
    filtered: Map<string, ThoughtEntry[]>;
}

type ShellRefreshScope = 'all' | 'tasks' | 'thoughts';
export interface DiwaMobileShellState extends ResponsiveShellState {}

function isResponsiveWorkspaceView(value: string | null | undefined): value is ResponsiveWorkspaceView {
    return SHELL_ITEMS.some((item) => item.id === value);
}

interface DiwaMobileShellOptions {
    platform?: Exclude<ShellPlatform, 'desktop'>;
    incrementTaskTogglePending?: () => void;
    decrementTaskTogglePending?: () => void;
}

export function getPlatform(app: App): ShellPlatform {
    const isMobile = (app as { isMobile?: boolean }).isMobile ?? false;
    if (!isMobile) return 'desktop';
    return isTablet(app) ? 'tablet' : 'mobile';
}

export class DiwaMobileShell {
    private activeView: ResponsiveWorkspaceView = 'home';
    private activeContexts: Set<string> = new Set();
    private selectedThought: ThoughtEntry | null = null;
    private bulsa: Required<BulsaLeafState> = { ...DEFAULT_BULSA_STATE };
    private selectedBulsaDuePath: string | null = null;
    private selectedReviewWeekId: string | null = null;
    private reviewDraft: { wins: string; lessons: string; focus: string[] } | null = null;
    private reviewDraftWeekId: string | null = null;
    private reviewDraftRevision: number | null = null;
    private reviewDraftDirty = false;
    private weekPlanDraft: Record<string, string> | null = null;
    private weekPlanDraftWeekId: string | null = null;
    private weekPlanDraftRevision: number | null = null;
    private weekPlanDraftDirty = false;
    private weekPlanTargetMode: 'next' | 'this' = 'this';
    private hostEl: HTMLElement | null = null;
    private shellEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    private navEl: HTMLElement | null = null;
    private tabsEl: HTMLElement | null = null;
    private platform: Exclude<ShellPlatform, 'desktop'>;
    private taskCache: TaskCache | null = null;
    private thoughtCache: ThoughtCache | null = null;
    private lastChromeKey: string | null = null;
    private renderCycleToken = 0;
    private reviewMarkdownHost: Component | null = null;
    private reviewWorkspace: WeeklyReviewWorkspace | null = null;

    constructor(
        private app: App,
        private plugin: DiwaPlugin,
        private options: DiwaMobileShellOptions = {},
    ) {
        this.platform = options.platform ?? 'mobile';
    }

    public setPlatform(platform: Exclude<ShellPlatform, 'desktop'>): void {
        this.platform = platform;
    }

    public getState(): DiwaMobileShellState {
        return {
            activeView: this.activeView,
            activeContexts: Array.from(this.activeContexts),
            selectedThoughtId: this.selectedThought?.id || this.selectedThought?.filePath || null,
            selectedBulsaDuePath: this.selectedBulsaDuePath,
            selectedReviewWeekId: this.selectedReviewWeekId,
            reviewDraft: this.reviewDraft,
            reviewDraftWeekId: this.reviewDraftWeekId,
            reviewDraftRevision: this.reviewDraftRevision,
            reviewDraftDirty: this.reviewDraftDirty,
            weekPlanDraft: this.weekPlanDraft,
            weekPlanDraftWeekId: this.weekPlanDraftWeekId,
            weekPlanDraftRevision: this.weekPlanDraftRevision,
            weekPlanDraftDirty: this.weekPlanDraftDirty,
            weekPlanTargetMode: this.weekPlanTargetMode,
            bulsa: { ...this.bulsa },
        };
    }

    public setState(state: DiwaMobileShellState | null | undefined): void {
        if (!state) return;
        const activeView = (state as Record<string, unknown>).activeView;
        if (activeView === 'projects') {
            this.activeView = 'tasks';
        } else if (state.activeView && isResponsiveWorkspaceView(state.activeView)) {
            this.activeView = state.activeView;
        }
        if (Array.isArray(state.activeContexts)) {
            this.activeContexts = new Set(state.activeContexts.filter((value): value is string => typeof value === 'string' && value.length > 0));
        }
        this.selectedThought = this.findThoughtById(state.selectedThoughtId ?? null);
        if (Object.prototype.hasOwnProperty.call(state, 'selectedBulsaDuePath')) {
            this.selectedBulsaDuePath = typeof state.selectedBulsaDuePath === 'string' && state.selectedBulsaDuePath.length > 0
                ? state.selectedBulsaDuePath
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'selectedReviewWeekId')) {
            this.selectedReviewWeekId = typeof state.selectedReviewWeekId === 'string' && state.selectedReviewWeekId.length > 0
                ? state.selectedReviewWeekId
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'reviewDraft')) {
            const reviewDraft = state.reviewDraft;
            this.reviewDraft = reviewDraft && typeof reviewDraft === 'object'
                ? {
                    wins: typeof reviewDraft.wins === 'string' ? reviewDraft.wins : '',
                    lessons: typeof reviewDraft.lessons === 'string' ? reviewDraft.lessons : '',
                    focus: Array.isArray(reviewDraft.focus) ? reviewDraft.focus.map((value) => String(value ?? '')) : [],
                }
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'reviewDraftWeekId')) {
            this.reviewDraftWeekId = typeof state.reviewDraftWeekId === 'string' && state.reviewDraftWeekId.length > 0
                ? state.reviewDraftWeekId
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'reviewDraftRevision')) {
            this.reviewDraftRevision = typeof state.reviewDraftRevision === 'number' ? state.reviewDraftRevision : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'reviewDraftDirty')) {
            this.reviewDraftDirty = state.reviewDraftDirty === true;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'weekPlanDraft')) {
            const weekPlanDraft = state.weekPlanDraft;
            this.weekPlanDraft = weekPlanDraft && typeof weekPlanDraft === 'object'
                ? Object.fromEntries(Object.entries(weekPlanDraft).map(([date, value]) => [date, String(value ?? '')]))
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'weekPlanDraftWeekId')) {
            this.weekPlanDraftWeekId = typeof state.weekPlanDraftWeekId === 'string' && state.weekPlanDraftWeekId.length > 0
                ? state.weekPlanDraftWeekId
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'weekPlanDraftRevision')) {
            this.weekPlanDraftRevision = typeof state.weekPlanDraftRevision === 'number' ? state.weekPlanDraftRevision : null;
        }
        if (Object.prototype.hasOwnProperty.call(state, 'weekPlanDraftDirty')) {
            this.weekPlanDraftDirty = state.weekPlanDraftDirty === true;
        }
        if (state.weekPlanTargetMode === 'next' || state.weekPlanTargetMode === 'this') {
            this.weekPlanTargetMode = state.weekPlanTargetMode;
        }
        if (state.bulsa !== undefined) {
            this.bulsa = {
                mode: state.bulsa?.mode === 'insights' ? 'insights' : DEFAULT_BULSA_STATE.mode,
                showAllDues: state.bulsa?.showAllDues === true,
            };
        }
    }

    public refreshTasks(): void {
        this.invalidateCaches('tasks');
        if (this.activeView === 'thoughts' || this.activeView === 'bulsa') return;
        if (this.activeView === 'review' && this.reviewWorkspace) {
            this.reviewWorkspace.onTasksRefresh();
            return;
        }
        this.refreshView();
    }

    public refreshThoughts(): void {
        this.invalidateCaches('thoughts');
        this.selectedThought = this.findThoughtById(this.selectedThought?.id || this.selectedThought?.filePath || null);
        if (this.activeView !== 'home' && this.activeView !== 'thoughts' && this.activeView !== 'review') return;
        this.refreshView();
    }

    public invalidateAllCaches(): void {
        this.invalidateCaches('all');
    }

    public destroy(): void {
        this.disposeReviewMarkdownHost();
        this.hostEl = null;
        this.shellEl = null;
        this.contentEl = null;
        this.navEl = null;
        this.tabsEl = null;
    }

    public render(container: HTMLElement): void {
        this.hostEl = container;
        this.ensureShell(container);
        this.syncShellStructure();
        this.refreshView();
    }

    private ensureShell(container: HTMLElement): void {
        const mounted = this.shellEl && container.contains(this.shellEl);
        if (this.hostEl === container && mounted && this.contentEl) return;

        container.empty();
        this.shellEl = container.createDiv('diwa-mobile-shell');
        this.contentEl = this.shellEl.createDiv('diwa-mobile-content');
        this.navEl = null;
        this.tabsEl = null;
        this.lastChromeKey = null;
        this.attachScrollHandlers();
    }

    private attachScrollHandlers(): void {
        if (!this.contentEl) return;
        let lastScrollTop = 0;
        this.contentEl.addEventListener('scroll', () => {
            if (!this.navEl || this.platform !== 'mobile') return;
            const scrollTop = this.contentEl?.scrollTop ?? 0;
            const fab = this.shellEl?.querySelector('.diwa-fab') as HTMLElement | null;
            
            if (scrollTop > lastScrollTop && scrollTop > 100) {
                this.navEl.addClass('diwa-nav-hidden');
                if (fab) {
                    fab.style.transform = 'translateY(120px) scale(0)';
                }
            } else {
                this.navEl.removeClass('diwa-nav-hidden');
                if (fab) {
                    fab.style.transform = 'translateY(0) scale(1)';
                }
            }
            lastScrollTop = scrollTop;
        }, { passive: true });
    }

    private createGlobalFab(): void {
        if (!this.shellEl) return;
        this.shellEl.querySelector('.diwa-fab')?.remove();
        if (this.platform !== 'mobile') return;

        const fab = this.shellEl.createEl('button', {
            cls: 'diwa-fab',
            attr: { type: 'button', 'aria-label': 'Capture' }
        });
        this.applyIcon(fab, 'plus');
        fab.addEventListener('click', () => {
            this.plugin.openCaptureModal();
        });
    }

    private syncShellStructure(): void {
        if (!this.shellEl || !this.contentEl) return;

        this.shellEl.className = this.platform === 'tablet'
            ? 'diwa-mobile-shell diwa-tablet-shell'
            : 'diwa-mobile-shell';
        this.shellEl.setAttribute('data-shell-platform', this.platform);
        this.contentEl.className = this.platform === 'tablet'
            ? 'diwa-content-tablet'
            : 'diwa-mobile-content';

        if (this.platform === 'tablet') {
            if (!this.tabsEl || this.tabsEl.parentElement !== this.shellEl) {
                this.tabsEl?.remove();
                this.tabsEl = document.createElement('div');
                this.tabsEl.className = 'diwa-tablet-tabs';
                this.shellEl.insertBefore(this.tabsEl, this.contentEl);
                this.lastChromeKey = null;
            }
            this.navEl?.remove();
            this.navEl = null;
            this.shellEl.querySelector('.diwa-fab')?.remove();
            return;
        }

        this.tabsEl?.remove();
        this.tabsEl = null;
        if (!this.navEl || this.navEl.parentElement !== this.shellEl) {
            this.navEl?.remove();
            this.navEl = this.shellEl.createDiv('diwa-mobile-nav');
            this.lastChromeKey = null;
        }
        this.createGlobalFab();
    }

    private refreshView(options: { forceChrome?: boolean } = {}): void {
        if (!this.contentEl) {
            if (this.hostEl) this.render(this.hostEl);
            return;
        }

        this.renderActiveView(this.contentEl);
        this.refreshChrome(options.forceChrome ?? false);
    }

    private refreshChrome(force = false): void {
        const chromeKey = this.getChromeKey();
        if (!force && chromeKey === this.lastChromeKey) return;

        if (this.tabsEl) this.renderTopTabs(this.tabsEl);
        if (this.navEl) this.renderBottomNav(this.navEl);
        this.lastChromeKey = chromeKey;
    }

    private renderActiveView(container: HTMLElement): void {
        this.invalidateRenderCycle();
        this.disposeReviewMarkdownHost();
        container.empty();

        switch (this.activeView) {
            case 'home':
                this.renderHome(container);
                break;
            case 'bulsa':
                this.renderBulsa(container);
                break;
            case 'review':
                this.renderReview(container);
                break;
            case 'tasks':
                this.renderTasks(container);
                break;
            case 'thoughts':
                this.renderThoughts(container);
                break;
        }
    }

    private switchView(view: ResponsiveWorkspaceView): void {
        if (this.activeView === view) return;
        this.activeView = view;
        this.refreshView();
    }

    private renderReview(container: HTMLElement): void {
        const renderToken = this.beginRenderCycle();
        this.reviewMarkdownHost = new Component();
        this.plugin.addChild(this.reviewMarkdownHost);
        this.reviewWorkspace = new WeeklyReviewWorkspace({
            app: this.app,
            component: this.reviewMarkdownHost,
            plugin: this.plugin,
            settings: this.plugin.settings,
            index: this.plugin.index,
            vault: this.plugin.vault,
            platform: this.platform,
            getState: () => ({
                selectedReviewWeekId: this.selectedReviewWeekId,
                reviewDraft: this.reviewDraft,
                reviewDraftWeekId: this.reviewDraftWeekId,
                reviewDraftRevision: this.reviewDraftRevision,
                reviewDraftDirty: this.reviewDraftDirty,
                weekPlanDraft: this.weekPlanDraft,
                weekPlanDraftWeekId: this.weekPlanDraftWeekId,
                weekPlanDraftRevision: this.weekPlanDraftRevision,
                weekPlanDraftDirty: this.weekPlanDraftDirty,
                weekPlanTargetMode: this.weekPlanTargetMode,
            }),
            updateState: (patch) => {
                if (patch.selectedReviewWeekId !== undefined) this.selectedReviewWeekId = patch.selectedReviewWeekId;
                if (patch.reviewDraft !== undefined) this.reviewDraft = patch.reviewDraft;
                if (patch.reviewDraftWeekId !== undefined) this.reviewDraftWeekId = patch.reviewDraftWeekId;
                if (patch.reviewDraftRevision !== undefined) this.reviewDraftRevision = patch.reviewDraftRevision;
                if (patch.reviewDraftDirty !== undefined) this.reviewDraftDirty = patch.reviewDraftDirty;
                if (patch.weekPlanDraft !== undefined) this.weekPlanDraft = patch.weekPlanDraft;
                if (patch.weekPlanDraftWeekId !== undefined) this.weekPlanDraftWeekId = patch.weekPlanDraftWeekId;
                if (patch.weekPlanDraftRevision !== undefined) this.weekPlanDraftRevision = patch.weekPlanDraftRevision;
                if (patch.weekPlanDraftDirty !== undefined) this.weekPlanDraftDirty = patch.weekPlanDraftDirty;
                if (patch.weekPlanTargetMode !== undefined) this.weekPlanTargetMode = patch.weekPlanTargetMode;
            },
            rerender: () => this.refreshView(),
            isRenderActive: (token, target) => this.isRenderCycleActive(token, target),
        });
        this.reviewWorkspace.render(container, renderToken);
    }

    private disposeReviewMarkdownHost(): void {
        this.reviewMarkdownHost?.unload();
        this.reviewMarkdownHost = null;
        this.reviewWorkspace = null;
    }

    private renderBulsa(container: HTMLElement): void {
        this.syncBulsaSelection();
        renderResponsiveBulsa({
            container,
            platform: this.platform,
            dues: this.plugin.index.dueIndex.values(),
            monthlyIncome: this.plugin.settings.monthlyIncome,
            state: this.bulsa,
            selectedDuePath: this.selectedBulsaDuePath,
            onModeChange: (mode) => {
                if (this.bulsa.mode === mode) return;
                this.bulsa = { ...this.bulsa, mode };
                this.refreshView();
            },
            onShowAllChange: (showAllDues) => {
                if (this.bulsa.showAllDues === showAllDues) return;
                this.bulsa = { ...this.bulsa, showAllDues };
                this.refreshView();
            },
            onSelectDue: (path) => {
                if (this.selectedBulsaDuePath === path) return;
                this.selectedBulsaDuePath = path;
                this.refreshView();
            },
            onAddDue: () => this.openBulsaDueModal(),
            onOpenDue: (entry) => void this.openBulsaDueNote(entry.path),
            onRecordPayment: (entry) => this.openBulsaPaymentModal(entry.path, entry.dueDate),
        });
    }

    private openBulsaDueModal(): void {
        new NewDueModal(
            this.app,
            this.plugin.vault,
            this.plugin.settings.pfFolder,
            () => void this.refreshBulsaWorkspace()
        ).open();
    }

    private openBulsaPaymentModal(path: string, currentDueDate: string): void {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('Could not find the due note for payment logging.');
            return;
        }

        new PaymentModal(
            this.app,
            this.plugin,
            file,
            currentDueDate,
            () => void this.refreshBulsaWorkspace()
        ).open();
    }

    private async openBulsaDueNote(path: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('Could not find the Bulsa note to open.');
            return;
        }

        await this.app.workspace.getLeaf(false).openFile(file);
    }

    private async refreshBulsaWorkspace(): Promise<void> {
        await this.plugin.index.buildDueIndex();
        this.syncBulsaSelection();
        this.refreshView();
    }

    private syncBulsaSelection(): void {
        if (this.selectedBulsaDuePath && !this.plugin.index.dueIndex.has(this.selectedBulsaDuePath)) {
            this.selectedBulsaDuePath = null;
        }
    }

    private renderHome(container: HTMLElement): void {
        if (this.platform === 'tablet') {
            this.renderTabletHome(container);
            return;
        }
        this.renderMobileHome(container);
    }

    private getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }

    private renderProgressRing(parent: HTMLElement, completed: number, total: number): void {
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        const radius = 16;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;

        const ringWrap = parent.createDiv('diwa-progress-ring-wrap');
        ringWrap.innerHTML = `
            <svg class="diwa-progress-ring" width="40" height="40">
                <circle class="diwa-progress-ring-bg" cx="20" cy="20" r="${radius}" stroke="var(--background-modifier-border)" stroke-width="3" fill="transparent" />
                <circle class="diwa-progress-ring-fg" cx="20" cy="20" r="${radius}" stroke="var(--interactive-accent)" stroke-width="3" fill="transparent" 
                        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
            </svg>
            <div class="diwa-progress-text">${completed}/${total}</div>
        `;
    }

    private renderMobileHome(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-mobile-home');
        const focusTasks = this.getFocusTasks();
        const recentThoughts = this.getRecentThoughts(2);
        const openTasks = this.getOpenTaskCount();
        const completedFocus = focusTasks.filter(task => isTaskDone(task)).length;

        // Bento 1: Hero Greeting Tile
        const hero = wrap.createDiv('diwa-home-bento-hero');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Personal OS' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: `${this.getGreeting()}, K.` });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: focusTasks.length === 0 
                ? 'Your focus runway is clear. Capture a task to begin.'
                : `You have ${focusTasks.length - completedFocus} active focus tasks for today.`,
        });

        // Bento 2: Today Focus Card (Progress Ring)
        const focus = wrap.createDiv('diwa-home-bento-focus');
        this.renderSectionHeader(
            focus,
            'Today focus',
            undefined,
            undefined,
            (actionsParent) => {
                this.renderProgressRing(actionsParent, completedFocus, focusTasks.length);
            }
        );
        const focusList = focus.createDiv('diwa-mobile-focus-list');
        if (focusTasks.length === 0) {
            this.renderEmptyState(
                focusList,
                'sparkles',
                'A calm runway',
                'Promote a task in Gawa to target your energy today.'
            );
        } else {
            focusTasks.slice(0, 4).forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true, compact: true });
            });
        }

        // Stats Grid Container (spans both columns)
        const statsGrid = wrap.createDiv('diwa-home-stats-grid');

        // Bento 3: Open Tasks Stat Card
        const openStat = statsGrid.createDiv('diwa-home-bento-stat');
        openStat.createDiv({ cls: 'diwa-mobile-hero-stat-value', text: String(openTasks) });
        openStat.createDiv({ cls: 'diwa-mobile-hero-stat-label', text: 'Open Tasks' });
        openStat.addEventListener('click', () => this.switchView('tasks'));

        // Bento 4: Thoughts Stat Card
        const thoughtsStat = statsGrid.createDiv('diwa-home-bento-stat');
        thoughtsStat.createDiv({ cls: 'diwa-mobile-hero-stat-value', text: String(this.getThoughts().length) });
        thoughtsStat.createDiv({ cls: 'diwa-mobile-hero-stat-label', text: 'Thoughts' });
        thoughtsStat.addEventListener('click', () => this.switchView('thoughts'));

        // Bento 4b: Bulsa Stat Card
        const bulsaStat = statsGrid.createDiv('diwa-home-bento-stat');
        const activeDuesCount = Array.from(this.plugin.index.dueIndex.values()).filter(d => d.isActive).length;
        bulsaStat.createDiv({ cls: 'diwa-mobile-hero-stat-value', text: String(activeDuesCount) });
        bulsaStat.createDiv({ cls: 'diwa-mobile-hero-stat-label', text: 'Dues' });
        bulsaStat.addEventListener('click', () => this.switchView('bulsa'));

        // Bento 5: Recent Thoughts Section
        const thoughts = wrap.createDiv('diwa-mobile-home-section diwa-mobile-surface');
        thoughts.style.gridColumn = 'span 2';
        this.renderSectionHeader(
            thoughts,
            'Recent thoughts',
            recentThoughts.length === 0 ? 'Capture your first note' : 'Fresh context from Diwa',
            `${recentThoughts.length}`
        );
        const thoughtList = thoughts.createDiv('diwa-thought-list');
        if (recentThoughts.length === 0) {
            this.renderEmptyState(
                thoughtList,
                'pen-square',
                'Nothing captured yet',
                'Tap the plus button below to capture your first thought.'
            );
        } else {
            recentThoughts.forEach((thought) => {
                this.plugin.renderThoughtCard(thoughtList, thought, { mobile: true });
            });
        }
    }

    private renderTabletHome(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-tablet-home');
        const focusTasks = this.getFocusTasks();
        const recentThoughts = this.getRecentThoughts(3);
        const openTasks = this.getOpenTaskCount();
        const completedFocus = focusTasks.filter(task => isTaskDone(task)).length;

        // Bento 1: Hero Greeting Tile (Spans 2 columns)
        const hero = wrap.createDiv('diwa-tablet-home-hero diwa-mobile-surface');
        hero.createDiv({ cls: 'diwa-mobile-hero-eyebrow', text: 'Diwa workspace' });
        hero.createDiv({ cls: 'diwa-mobile-hero-title', text: `${this.getGreeting()}, K.` });
        hero.createDiv({
            cls: 'diwa-mobile-hero-subtitle',
            text: 'Your control center for capture, weekly review, and daily focus.',
        });

        const heroActions = hero.createDiv('diwa-tablet-home-actions');
        const capture = this.createActionButton(
            heroActions,
            'Capture',
            'plus',
            () => this.plugin.openCaptureModal(),
            'diwa-mobile-quick-action'
        );
        capture.addClass('is-primary');
        this.createActionButton(heroActions, 'Open Gawa', 'check-square-2', () => this.switchView('tasks'), 'diwa-mobile-quick-action');
        this.createActionButton(heroActions, 'Review Diwa', 'pen-square', () => this.switchView('thoughts'), 'diwa-mobile-quick-action');

        // Bento 2: Metrics overview widget card (Spans 1 column)
        const metricsCard = wrap.createDiv('diwa-tablet-home-metrics');
        metricsCard.createDiv({ cls: 'diwa-mobile-section-title', text: 'Activity Overview' });
        const metrics = metricsCard.createDiv('diwa-mobile-hero-stats');
        // Let's set 4 columns inline or via CSS
        metrics.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        this.renderMetricChip(metrics, 'Focus', focusTasks.length);
        this.renderMetricChip(metrics, 'Open tasks', openTasks);
        this.renderMetricChip(metrics, 'Thoughts', this.getThoughts().length);
        const activeDuesCount = Array.from(this.plugin.index.dueIndex.values()).filter(d => d.isActive).length;
        this.renderMetricChip(metrics, 'Dues', activeDuesCount);

        // Bento 3: Today's Focus Card (Spans 2 columns)
        const focus = wrap.createDiv('diwa-tablet-home-focus-card diwa-mobile-surface');
        this.renderSectionHeader(
            focus,
            'Today focus',
            focusTasks.length === 0 ? 'Nothing urgent yet' : 'Priority tasks that deserve attention now',
            undefined,
            (actionsParent) => {
                this.renderProgressRing(actionsParent, completedFocus, focusTasks.length);
            }
        );
        const focusList = focus.createDiv('diwa-mobile-focus-list');
        if (focusTasks.length === 0) {
            this.renderEmptyState(
                focusList,
                'sparkles',
                'Focus is clear',
                'When you elevate a task, it will land here with space to breathe.'
            );
        } else {
            focusTasks.slice(0, 5).forEach((task) => {
                this.plugin.renderTaskRow(focusList, task, { mobile: true });
            });
        }

        // Bento 4: Recent Thoughts Card (Spans 1 column)
        const thoughts = wrap.createDiv('diwa-tablet-home-thoughts-card diwa-mobile-surface');
        this.renderSectionHeader(
            thoughts,
            'Recent thoughts',
            recentThoughts.length === 0 ? 'Start a trail of ideas' : 'Recent notes ready to reopen',
            `${recentThoughts.length}`
        );
        const list = thoughts.createDiv('diwa-thought-list');
        if (recentThoughts.length === 0) {
            this.renderEmptyState(
                list,
                'pen-square',
                'No thought cards yet',
                'Capture a note and it will appear here for quick review.'
            );
        } else {
            recentThoughts.forEach((thought) => {
                this.plugin.renderThoughtCard(list, thought, { mobile: true });
            });
        }
    }

    private renderTasks(container: HTMLElement): void {
        const tasks = this.getOpenTasks();
        const wrap = container.createDiv('diwa-mobile-list-wrap');
        this.renderSectionHeader(
            wrap,
            'Gawa',
            tasks.length === 0 ? 'All open loops are clear' : 'Open tasks across your workspace',
            `${tasks.length}`,
            (actionsParent) => {
                this.createActionButton(
                    actionsParent,
                    'Capture task',
                    'sparkles',
                    () => this.openCreateTaskModal(),
                    'diwa-mobile-header-action'
                );
            }
        );
        const list = wrap.createDiv('diwa-mobile-list diwa-gawa-list');
        if (tasks.length === 0) {
            this.renderEmptyState(
                list,
                'check-square-2',
                'Nothing open right now',
                'Your next captured task will appear here when it is ready for action.'
            );
            return;
        }
        tasks.forEach((task: TaskEntry) => {
            this.plugin.renderTaskRow(list, task, { mobile: true });
        });
    }

    private renderThoughts(container: HTMLElement): void {
        const wrap = container.createDiv('diwa-thoughts-wrap');
        const thoughts = this.filterThoughts(this.getThoughts(), this.activeContexts);
        this.renderSectionHeader(
            wrap,
            'Diwa',
            thoughts.length === 0 ? 'No thoughts in view' : 'Thoughts filtered by context',
            `${thoughts.length}`
        );
        const contexts = this.plugin.getContexts();
        this.renderContextBar(wrap, contexts);

        // Render Twitter-style Inline Composer at the top of the feed
        this.renderInlineComposer(wrap);

        if (this.platform === 'tablet') {
            this.renderTabletThoughtsLayout(wrap, thoughts);
            return;
        }

        const list = wrap.createDiv('diwa-thought-list');
        this.renderThoughtList(list, thoughts, false);
    }

    private renderInlineComposer(container: HTMLElement): void {
        const composerWrap = container.createDiv('diwa-composer-wrap');
        
        const editorContainer = composerWrap.createDiv('diwa-composer-editor');
        
        // Collapsed Placeholder
        const placeholder = editorContainer.createDiv('diwa-composer-placeholder');
        placeholder.createSpan({ text: "What's happening?" });
        
        // Expanded form
        const form = editorContainer.createEl('form', { cls: 'diwa-composer-form diwa-composer-hidden' });
        
        // Textarea
        const textarea = form.createEl('textarea', {
            cls: 'diwa-composer-textarea',
            attr: { placeholder: "What's happening?", rows: '2' }
        });
        
        // Action row (toolbar + submit button)
        const toolbar = form.createDiv('diwa-composer-toolbar');
        
        // Left icons side (attachment icons or char count ring)
        const toolsLeft = toolbar.createDiv('diwa-composer-tools-left');
        
        // SVG progress ring helper for character counts
        const ring = toolsLeft.createSvg('svg', { cls: 'diwa-char-ring', attr: { width: '24', height: '24' } });
        const radius = 9;
        const circ = 2 * Math.PI * radius;
        ring.createSvg('circle', {
            attr: { cx: '12', cy: '12', r: String(radius), stroke: 'var(--background-modifier-border)', 'stroke-width': '2', fill: 'none' }
        });
        const ringFg = ring.createSvg('circle', {
            attr: { 
                cx: '12', cy: '12', r: String(radius), 
                stroke: 'var(--interactive-accent)', 'stroke-width': '2', fill: 'none',
                'stroke-dasharray': String(circ), 'stroke-dashoffset': String(circ)
            }
        });
        
        // Right submit/cancel side
        const toolsRight = toolbar.createDiv('diwa-composer-tools-right');
        const cancelBtn = toolsRight.createEl('button', {
            cls: 'diwa-composer-cancel',
            text: 'Cancel',
            attr: { type: 'button' }
        });
        const postBtn = toolsRight.createEl('button', {
            cls: 'diwa-composer-post diwa-btn-primary',
            text: 'Post',
            attr: { type: 'submit', disabled: 'true' }
        });
        
        // Textarea auto-resize and character limit check
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
            
            const len = textarea.value.length;
            const pct = Math.min(len / 280, 1);
            const offset = circ - (pct * circ);
            ringFg.setAttribute('stroke-dashoffset', String(offset));
            
            // Limit checks
            if (len >= 280) {
                ringFg.setAttribute('stroke', 'var(--text-error)');
                postBtn.setAttribute('disabled', 'true');
            } else if (len >= 260) {
                ringFg.setAttribute('stroke', 'var(--text-warning)');
                postBtn.removeAttribute('disabled');
            } else {
                ringFg.setAttribute('stroke', 'var(--interactive-accent)');
                if (len > 0) {
                    postBtn.removeAttribute('disabled');
                } else {
                    postBtn.setAttribute('disabled', 'true');
                }
            }
        });
        
        // Toggle Expanded / Collapsed
        const expand = () => {
            placeholder.addClass('diwa-composer-hidden');
            form.removeClass('diwa-composer-hidden');
            textarea.focus();
        };
        const collapse = () => {
            placeholder.removeClass('diwa-composer-hidden');
            form.addClass('diwa-composer-hidden');
            textarea.value = '';
            textarea.style.height = 'auto';
            ringFg.setAttribute('stroke-dashoffset', String(circ));
            postBtn.setAttribute('disabled', 'true');
        };
        
        placeholder.addEventListener('click', expand);
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            collapse();
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = textarea.value.trim();
            if (!text) return;
            
            const contexts = Array.from(this.activeContexts);
            await this.plugin.vault.createThoughtFile(text, contexts);
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }
            collapse();
            this.refreshView();
        });
    }

    private filterThoughts(thoughts: ThoughtEntry[], activeContexts: Set<string>): ThoughtEntry[] {
        if (activeContexts.size === 0) return thoughts;

        const cache = this.getThoughtCache();
        const cacheKey = Array.from(activeContexts).sort((left, right) => left.localeCompare(right)).join('\u0000');
        const cached = cache.filtered.get(cacheKey);
        if (cached) return cached;

        const filtered = thoughts.filter((thought) => (thought.context ?? []).some((ctx) => activeContexts.has(ctx)));
        cache.filtered.set(cacheKey, filtered);
        return filtered;
    }

    private renderContextBar(container: HTMLElement, contexts: string[]): void {
        const bar = container.createDiv('diwa-context-bar');

        const allChip = bar.createEl('button', {
            cls: 'diwa-chip',
            text: 'All',
            attr: { type: 'button' },
        });
        if (this.activeContexts.size === 0) {
            allChip.addClass('is-active');
        }
        allChip.addEventListener('click', () => {
            this.activeContexts.clear();
            this.refreshView();
        });

        contexts.forEach((ctx) => {
            const chip = bar.createEl('button', {
                cls: 'diwa-chip',
                text: ctx,
                attr: { type: 'button' },
            });
            if (this.activeContexts.has(ctx)) {
                chip.addClass('is-active');
            }
            chip.addEventListener('click', () => {
                if (this.activeContexts.has(ctx)) this.activeContexts.delete(ctx);
                else this.activeContexts.add(ctx);
                this.refreshView();
            });
        });

        const more = bar.createEl('button', {
            cls: 'diwa-chip diwa-chip-add',
            text: '+',
            attr: { type: 'button', 'aria-label': 'More contexts' },
        });
        more.addEventListener('click', () => this.openContextPicker(contexts));
    }

    private openContextPicker(contexts: string[]): void {
        new MobileContextPickerModal(this.app, contexts, this.activeContexts, () => this.refreshView()).open();
    }

    private findThoughtById(thoughtId: string | null): ThoughtEntry | null {
        if (!thoughtId) return null;
        const thoughts = this.getThoughtCache().all;
        return thoughts.find((thought) => (thought.id || thought.filePath) === thoughtId) ?? null;
    }

    private renderThoughtList(container: HTMLElement, thoughts: ThoughtEntry[], selectable: boolean): void {
        if (thoughts.length === 0) {
            this.renderEmptyState(
                container,
                'pen-square',
                'No thoughts here',
                this.activeContexts.size === 0
                    ? 'Capture a thought to start your stream.'
                    : 'Try clearing or changing your active contexts.'
            );
            return;
        }

        thoughts.forEach((thought: ThoughtEntry) => {
            const card = this.plugin.renderThoughtCard(container, thought, { mobile: true });
            if (!selectable) return;
            const thoughtId = thought.id || thought.filePath;
            const selectedId = this.selectedThought?.id || this.selectedThought?.filePath;
            if (selectedId === thoughtId) {
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
        const left = layout.createDiv('diwa-tablet-left diwa-mobile-surface');
        const right = layout.createDiv('diwa-tablet-right diwa-mobile-surface');

        this.renderSectionHeader(
            left,
            'Thought list',
            thoughts.length === 0 ? 'No thoughts to preview' : 'Select a card to open the detail view',
            `${thoughts.length}`
        );
        const list = left.createDiv('diwa-thought-list');
        this.renderThoughtList(list, thoughts, true);

        const detail = right.createDiv('diwa-tablet-thought-detail');
        const detailHeader = detail.createDiv('diwa-tablet-thought-detail-header');
        detailHeader.createDiv({ cls: 'diwa-mobile-section-title', text: 'Preview' });

        if (thoughts.length === 0) {
            this.renderEmptyState(
                detail,
                'sparkles',
                'Nothing selected',
                'Pick a thought on the left to preview it here with room to read.'
            );
            return;
        }

        const selectedId = this.selectedThought?.id || this.selectedThought?.filePath || '';
        const resolved = thoughts.find((thought) => (thought.id || thought.filePath) === selectedId) ?? thoughts[0];
        this.selectedThought = resolved;
        detailHeader.createDiv({
            cls: 'diwa-tablet-thought-detail-caption',
            text: 'Open links directly or long-press for actions.',
        });
        const body = detail.createDiv('diwa-tablet-thought-detail-body');
        this.plugin.renderThoughtCard(body, resolved, { mobile: true });
    }

    private renderTopTabs(container: HTMLElement): void {
        container.empty();
        container.setAttribute('role', 'tablist');
        container.setAttribute('aria-label', 'DIWA workspace sections');

        this.getShellItems().forEach((item) => {
            const isActive = this.activeView === item.id;
            const tab = container.createEl('button', {
                cls: 'diwa-tab',
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                },
            });
            if (isActive) tab.addClass('is-active');

            const icon = tab.createSpan('diwa-tab-icon');
            this.applyIcon(icon, item.icon);
            tab.createSpan({ cls: 'diwa-tab-label', text: item.label });
            tab.addEventListener('click', () => this.switchView(item.id));
        });
    }

    private renderBottomNav(container: HTMLElement): void {
        container.empty();
        container.setAttribute('role', 'tablist');
        container.setAttribute('aria-label', 'DIWA mobile navigation');

        this.getShellItems().forEach((item) => {
            const isActive = this.activeView === item.id;
            const btn = container.createEl('button', {
                cls: 'diwa-mobile-nav-btn',
                attr: {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': isActive ? 'true' : 'false',
                    'aria-label': item.ariaLabel ?? item.label,
                },
            });

            if (isActive) {
                btn.addClass('is-active');
            }

            const icon = btn.createSpan('diwa-mobile-nav-icon');
            this.applyIcon(icon, item.icon);
            btn.createSpan({ cls: 'diwa-mobile-nav-label', text: item.label });
            btn.addEventListener('click', () => this.switchView(item.id));
        });
    }

    private openCreateTaskModal(initialText: string = ''): void {
        new FastTaskCaptureModal(
            this.app,
            this.plugin,
            async (payload) => {
                try {
                    this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                    const created = await this.plugin.vault.createTaskFile(
                        payload.text,
                        payload.contexts,
                        payload.dueDate || undefined,
                        {
                            priority: payload.priority ?? undefined,
                            status: payload.status,
                        }
                    );
                    if (created instanceof TFile) {
                        await this.plugin.refreshCoordinator.reindexFile(created);
                        const indexedTask = this.plugin.index.taskIndex.get(created.path);
                        if (indexedTask) {
                            this.plugin.getTaskController().addTask(indexedTask);
                            if (payload.focus) {
                                await this.plugin.getTaskController().moveTaskToBucket(
                                    indexedTask.taskId || indexedTask.id || indexedTask.filePath,
                                    'active',
                                    { focus: true }
                                );
                            }
                        } else {
                            this.plugin.getTaskController().syncFromIndex();
                        }
                    } else {
                        this.plugin.getTaskController().syncFromIndex();
                    }
                    this.refreshTasks();
                } catch (error) {
                    console.error('[DIWA MOBILE] Failed to create task', error);
                    new Notice('Failed to create task');
                }
            },
            initialText,
        ).open();
    }
    private getShellItems(): ShellNavItem[] {
        const useCompactLabels = this.platform === 'mobile' && this.getViewportWidth() <= 390;
        return SHELL_ITEMS.map((item) => ({
            ...item,
            label: useCompactLabels ? (item.shortLabel ?? item.label) : item.label,
        }));
    }

    private getChromeKey(): string {
        const useCompactLabels = this.platform === 'mobile' && this.getViewportWidth() <= 390;
        return `${this.platform}:${this.activeView}:${useCompactLabels ? 'compact' : 'full'}`;
    }

    private getViewportWidth(): number {
        const hostWidth = this.hostEl?.getBoundingClientRect().width ?? 0;
        if (hostWidth > 0) return Math.round(hostWidth);
        return getWorkspaceViewportSize(this.app).width;
    }

    private invalidateCaches(scope: ShellRefreshScope): void {
        if (scope === 'all' || scope === 'tasks') {
            this.taskCache = null;
        }
        if (scope === 'all' || scope === 'thoughts') {
            this.thoughtCache = null;
        }
    }

    private getTaskCache(): TaskCache {
        if (this.taskCache) return this.taskCache;

        const all = this.plugin.getAllTasks();
        const open = all.filter((task) => !isTaskDone(task));

        this.taskCache = {
            all,
            open,
            focus: this.plugin.getTodayFocusTasks(),
        };
        return this.taskCache;
    }

    private invalidateRenderCycle(): void {
        this.renderCycleToken++;
    }

    private beginRenderCycle(): number {
        return ++this.renderCycleToken;
    }

    private isRenderCycleActive(token: number, target: HTMLElement): boolean {
        return this.renderCycleToken === token && target.isConnected;
    }

    private getOpenTasks(): TaskEntry[] {
        return this.getTaskCache().open;
    }

    private getOpenTaskCount(): number {
        return this.getOpenTasks().length;
    }

    private getFocusTasks(): TaskEntry[] {
        return this.getTaskCache().focus;
    }

    private getThoughtCache(): ThoughtCache {
        if (this.thoughtCache) return this.thoughtCache;

        const all = this.plugin.getAllThoughts();
        this.thoughtCache = {
            all,
            recentTwo: all.slice(0, 2),
            recentThree: all.slice(0, 3),
            filtered: new Map(),
        };
        return this.thoughtCache;
    }

    private getThoughts(): ThoughtEntry[] {
        return this.getThoughtCache().all;
    }

    private getRecentThoughts(limit: 2 | 3): ThoughtEntry[] {
        const cache = this.getThoughtCache();
        return limit === 2 ? cache.recentTwo : cache.recentThree;
    }

    private renderSectionHeader(
        container: HTMLElement,
        title: string,
        subtitle?: string,
        count?: string,
        actions?: (parent: HTMLElement) => void
    ): HTMLElement {
        const head = container.createDiv('diwa-mobile-section-head');
        const copy = head.createDiv('diwa-mobile-section-copy');
        copy.createDiv({ cls: 'diwa-mobile-section-title', text: title });
        if (subtitle) {
            copy.createDiv({ cls: 'diwa-mobile-section-subtitle', text: subtitle });
        }
        if (count) {
            head.createDiv({ cls: 'diwa-mobile-section-count', text: count });
        }
        if (actions) {
            const actionsContainer = head.createDiv('diwa-mobile-section-actions');
            actions(actionsContainer);
        }
        return head;
    }

    private renderMetricChip(parent: HTMLElement, label: string, value: number | string): void {
        const chip = parent.createDiv('diwa-mobile-hero-stat');
        chip.createDiv({ cls: 'diwa-mobile-hero-stat-value', text: String(value) });
        chip.createDiv({ cls: 'diwa-mobile-hero-stat-label', text: label });
    }

    private renderEmptyState(parent: HTMLElement, iconName: string, title: string, subtitle: string): void {
        const empty = parent.createDiv('diwa-mobile-empty-state');
        const icon = empty.createDiv('diwa-mobile-empty-icon');
        this.applyIcon(icon, iconName);
        empty.createDiv({ cls: 'diwa-mobile-empty-title', text: title });
        empty.createDiv({ cls: 'diwa-mobile-empty-sub', text: subtitle });
    }

    private createActionButton(
        parent: HTMLElement,
        label: string,
        iconName: string,
        onClick: () => void,
        className: string
    ): HTMLElement {
        const button = parent.createEl('button', {
            cls: className,
            attr: { type: 'button', 'aria-label': label },
        });
        const icon = button.createSpan(`${className}-icon`);
        this.applyIcon(icon, iconName);
        button.addEventListener('click', onClick);
        return button;
    }

    private applyIcon(target: HTMLElement, iconName: string): void {
        try {
            setIcon(target, iconName);
        } catch {
            setIcon(target, 'circle');
        }
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

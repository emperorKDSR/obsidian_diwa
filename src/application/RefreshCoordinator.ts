import { App, Notice, TFile } from 'obsidian';
import { VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_DIWA, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB } from '../constants';
import type { DiwaSettings } from '../types';
import { DesktopHubView } from '../views/DesktopHubView';
import { DiwaView } from '../view';
import { MobileHubView } from '../views/MobileHubView';
import type { IndexService } from '../services/IndexService';

export type RefreshScope = 'all' | 'tasks' | 'thoughts';

export class RefreshCoordinator {
    private _indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _reindexCooldown: Map<string, number> = new Map();
    private _suppressNotifyRefreshUntil: number = 0;
    private _pendingRefreshScope: RefreshScope | null = null;

    constructor(
        private app: App,
        private settings: DiwaSettings,
        private index: IndexService,
    ) {}

    updateSettings(settings: DiwaSettings): void {
        this.settings = settings;
    }

    suppressNotifyRefresh(ms = 1200): void {
        const until = Date.now() + ms;
        if (until > this._suppressNotifyRefreshUntil) this._suppressNotifyRefreshUntil = until;
    }

    /** Prevent immediate follow-up reindex calls from stale intermediate vault events. */
    bumpReindexCooldown(filePath: string): void {
        this._reindexCooldown.set(filePath, Date.now());
    }

    async reindexFile(file: TFile): Promise<void> {
        // CRIT-01: Deduplicate concurrent calls from vault 'modify' + metadataCache 'changed'.
        // Both events fire on every local save; a 300ms cooldown window collapses them into one.
        const now = Date.now();
        const last = this._reindexCooldown.get(file.path) ?? 0;
        if (now - last < 300) return;
        this._reindexCooldown.set(file.path, now);

        const habitsFolder = (this.settings.habitsFolder || '000 Bin/DIWA Habits').replace(/\\/g, '/');
        const capPath = `${this.settings.captureFolder.trim() || '000 Bin/DIWA'}/${this.settings.captureFilePath.trim() || 'Daily Capture.md'}`;

        if (this.index.isThoughtFile(file.path)) await this.index.indexThoughtFile(file);
        else if (this.index.isTaskFile(file.path)) await this.index.indexTaskFile(file);
        else if (this.index.isDueFile(file.path)) await this.index.buildDueIndex();

        if (file.path.startsWith(habitsFolder)) await this.index.refreshHabitIndex();
        else if (file.path === capPath) await this.index.buildChecklistIndex();
    }

    notifyRefresh(scope: RefreshScope = 'all'): void {
        if (Date.now() < this._suppressNotifyRefreshUntil) return;
        this._pendingRefreshScope = this.mergeRefreshScope(this._pendingRefreshScope, scope);
        if (this._indexDebounceTimer) clearTimeout(this._indexDebounceTimer);
        
        // Task-only updates flush on next-frame cadence; other scopes batch to absorb sync bursts
        const debounceMs = this._pendingRefreshScope === 'tasks' ? 16 : 400;
        
        this._indexDebounceTimer = setTimeout(() => {
            if (Date.now() < this._suppressNotifyRefreshUntil) return;
            const scope = this._pendingRefreshScope ?? 'all';
            this._pendingRefreshScope = null;
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
            for (const leaf of leaves) {
                const view = leaf.view as DiwaView;
                if (view && typeof view.renderView === 'function') {
                    // Don't re-render while the user is mid-toggle — let optimistic UI stand
                    if (view._taskTogglePending > 0 || view._habitTogglePending > 0 || view._checklistTogglePending > 0 || view._capturePending > 0 || view._synthesisCaptPending > 0 || view._mergePending > 0) continue;
                    // For task-only updates use incremental refresh to avoid full DOM rebuild
                    if (scope === 'tasks' && typeof (view as any).refreshTasks === 'function') {
                        (view as any).refreshTasks();
                    } else {
                        view.renderView();
                    }
                }
            }
            // Refresh any open Desktop Hub leaves
            const hubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
            for (const leaf of hubLeaves) {
                const view = leaf.view as DesktopHubView;
                if (view && typeof view.renderView === 'function') {
                    if (scope === 'tasks' && typeof view.updateTaskPaneFromIndex === 'function') {
                        view.updateTaskPaneFromIndex();
                        continue;
                    }
                    if (view._capturePending > 0 || view._taskPending > 0) continue;
                    view.renderView();
                }
            }
            const mobileHubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB);
            for (const leaf of mobileHubLeaves) {
                const view = leaf.view as MobileHubView;
                if (view && typeof view.renderView === 'function') {
                    view.renderView();
                }
            }
            const tabletHubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB);
            for (const leaf of tabletHubLeaves) {
                const view = leaf.view as MobileHubView;
                if (view && typeof view.renderView === 'function') {
                    view.renderView();
                }
            }
        }, debounceMs);
    }

    private mergeRefreshScope(current: RefreshScope | null, next: RefreshScope): RefreshScope {
        if (!current || current === next) return next;
        if (current === 'all' || next === 'all') return 'all';
        return 'all';
    }

    onunload(): void {
        if (this._indexDebounceTimer) {
            clearTimeout(this._indexDebounceTimer);
            this._indexDebounceTimer = null;
        }
        this._pendingRefreshScope = null;
        this._reindexCooldown.clear();
    }
}

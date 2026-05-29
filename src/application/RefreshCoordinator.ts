import { App, Notice, TFile } from 'obsidian';
import { VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_DIWA, VIEW_TYPE_MOBILE_HUB, VIEW_TYPE_TABLET_HUB } from '../constants';
import type { DiwaSettings } from '../types';
import { DesktopHubView } from '../views/DesktopHubView';
import { DiwaView } from '../view';
import { MobileHubView } from '../views/MobileHubView';
import type { IndexService } from '../services/IndexService';
import { getCanonicalCapturePath } from '../utils/settingsPaths';

export type RefreshScope = 'all' | 'tasks' | 'thoughts';

const TASK_ONLY_REFRESH_DEBOUNCE_MS = 400;
const DEFAULT_REFRESH_DEBOUNCE_MS = 400;

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

        const capPath = getCanonicalCapturePath(this.settings);

        if (this.index.isThoughtFile(file.path)) await this.index.indexThoughtFile(file);
        else if (this.index.isTaskFile(file.path)) await this.index.indexTaskFile(file);
        else if (this.index.isDueFile(file.path)) this.index.indexDueFile(file);
        else if (this.index.isProjectFile(file.path)) await this.index.indexProjectFile(file);

        if (file.path === capPath) await this.index.buildChecklistIndex();
    }

    notifyRefresh(scope: RefreshScope = 'all'): void {
        this._pendingRefreshScope = this.mergeRefreshScope(this._pendingRefreshScope, scope);
        if (this._indexDebounceTimer) clearTimeout(this._indexDebounceTimer);

        if (Date.now() < this._suppressNotifyRefreshUntil) {
            const deferMs = Math.max(50, this._suppressNotifyRefreshUntil - Date.now() + 50);
            this._indexDebounceTimer = setTimeout(() => {
                this._indexDebounceTimer = null;
                this._dispatchRefresh();
            }, deferMs);
            return;
        }

        // Task-only updates still stay responsive, but batch long enough to absorb save/index bursts.
        const debounceMs = this._pendingRefreshScope === 'tasks'
            ? TASK_ONLY_REFRESH_DEBOUNCE_MS
            : DEFAULT_REFRESH_DEBOUNCE_MS;
        this._indexDebounceTimer = setTimeout(() => {
            this._indexDebounceTimer = null;
            this._dispatchRefresh();
        }, debounceMs);
    }

    private _dispatchRefresh(): void {
        if (Date.now() < this._suppressNotifyRefreshUntil) {
            const deferMs = Math.max(50, this._suppressNotifyRefreshUntil - Date.now() + 50);
            this._indexDebounceTimer = setTimeout(() => {
                this._indexDebounceTimer = null;
                this._dispatchRefresh();
            }, deferMs);
            return;
        }

        const scope = this._pendingRefreshScope ?? 'all';
        this._pendingRefreshScope = null;
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
        for (const leaf of leaves) {
            const view = leaf.view as DiwaView;
            if (view && typeof view.renderView === 'function') {
                // Don't re-render while the user is mid-toggle — let optimistic UI stand
                if (view._taskTogglePending > 0 || view._checklistTogglePending > 0 || view._capturePending > 0) continue;
                // For task-only updates use incremental refresh to avoid full DOM rebuild
                if (scope === 'tasks' && typeof (view as any).refreshTasks === 'function') {
                    (view as any).refreshTasks();
                } else if (scope === 'thoughts' && typeof (view as any).refreshThoughts === 'function') {
                    (view as any).refreshThoughts();
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
                if (scope === 'tasks' && typeof (view as DesktopHubView & { refreshTasks?: () => void }).refreshTasks === 'function') {
                    (view as DesktopHubView & { refreshTasks: () => void }).refreshTasks();
                    continue;
                }
                if (view._capturePending > 0 || view._taskPending > 0) continue;
                if (scope === 'all' && typeof (view as DesktopHubView & { refreshAll?: () => void }).refreshAll === 'function') {
                    (view as DesktopHubView & { refreshAll: () => void }).refreshAll();
                } else {
                    view.renderView();
                }
            }
        }
        const mobileHubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MOBILE_HUB);
        for (const leaf of mobileHubLeaves) {
            const view = leaf.view as unknown as MobileHubView;
            if (view && typeof view.renderView === 'function') {
                if (scope === 'tasks' && typeof view.refreshTasks === 'function') {
                    view.refreshTasks();
                } else if (scope === 'thoughts' && typeof view.refreshThoughts === 'function') {
                    view.refreshThoughts();
                } else if (scope === 'all' && typeof (view as MobileHubView & { refreshAll?: () => void }).refreshAll === 'function') {
                    (view as MobileHubView & { refreshAll: () => void }).refreshAll();
                } else {
                    view.renderView();
                }
            }
        }
        const tabletHubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLET_HUB);
        for (const leaf of tabletHubLeaves) {
            const view = leaf.view as unknown as MobileHubView;
            if (view && typeof view.renderView === 'function') {
                if (scope === 'tasks' && typeof view.refreshTasks === 'function') {
                    view.refreshTasks();
                } else if (scope === 'thoughts' && typeof view.refreshThoughts === 'function') {
                    view.refreshThoughts();
                } else if (scope === 'all' && typeof (view as MobileHubView & { refreshAll?: () => void }).refreshAll === 'function') {
                    (view as MobileHubView & { refreshAll: () => void }).refreshAll();
                } else {
                    view.renderView();
                }
            }
        }
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

import { App, Notice, TFile } from 'obsidian';
import { VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_DIWA } from '../constants';
import type { DiwaSettings } from '../types';
import { DesktopHubView } from '../views/DesktopHubView';
import { DiwaView } from '../view';
import type { IndexService } from '../services/IndexService';

export class RefreshCoordinator {
    private _indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _reindexCooldown: Map<string, number> = new Map();
    private _suppressNotifyRefreshUntil: number = 0;

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

    notifyRefresh(): void {
        if (Date.now() < this._suppressNotifyRefreshUntil) return;
        if (this._indexDebounceTimer) clearTimeout(this._indexDebounceTimer);
        this._indexDebounceTimer = setTimeout(() => {
            if (Date.now() < this._suppressNotifyRefreshUntil) return;
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIWA);
            for (const leaf of leaves) {
                const view = leaf.view as DiwaView;
                if (view && typeof view.renderView === 'function') {
                    // Don't re-render while the user is mid-toggle — let optimistic UI stand
                    if (view._taskTogglePending > 0 || view._habitTogglePending > 0 || view._checklistTogglePending > 0 || view._capturePending > 0 || view._synthesisCaptPending > 0 || view._mergePending > 0) continue;
                    view.renderView();
                }
            }
            // Refresh any open Desktop Hub leaves
            const hubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
            for (const leaf of hubLeaves) {
                const view = leaf.view as DesktopHubView;
                if (view && typeof view.renderView === 'function') {
                    if (view._capturePending > 0 || view._taskPending > 0) continue;
                    view.renderView();
                }
            }
        }, 400); // 400ms: handles cloud-sync bursts and gives async indexing headroom
    }

    onunload(): void {
        if (this._indexDebounceTimer) {
            clearTimeout(this._indexDebounceTimer);
            this._indexDebounceTimer = null;
        }
        this._reindexCooldown.clear();
    }
}

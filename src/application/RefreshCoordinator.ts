import { App, TFile } from 'obsidian';
import { VIEW_TYPE_DESKTOP_HUB } from '../constants';
import type { DiwaSettings } from '../types';
import { DesktopHubView } from '../views/DesktopHubView';
import type { IndexService } from '../services/IndexService';

export type RefreshScope = 'all' | 'tasks' | 'capture';

const CAPTURE_REFRESH_DEBOUNCE_MS = 250;
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

    async reindexFile(file: TFile, isMetadataChange = false): Promise<void> {
        // Deduplicate rapid repeat calls; raw vault 'modify' events within 300ms are coalesced,
        // while metadataCache 'changed' updates with parsed frontmatter are always accepted.
        const now = Date.now();
        const last = this._reindexCooldown.get(file.path) ?? 0;
        if (!isMetadataChange && (now - last < 300)) return;
        this._reindexCooldown.set(file.path, now);

        if (this.index.isCaptureFile(file.path)) {
            await this.index.indexCaptureFile(file);
            this.notifyRefresh('capture');
        } else {
            this.notifyRefresh('all');
        }
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

        const debounceMs = this._pendingRefreshScope === 'capture'
            ? CAPTURE_REFRESH_DEBOUNCE_MS
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

        // Refresh all open Desktop Hub (Workspace) views
        const hubLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DESKTOP_HUB);
        for (const leaf of hubLeaves) {
            const view = leaf.view as DesktopHubView;
            if (view && typeof view.renderView === 'function') {
                if (view._capturePending > 0 || view._taskPending > 0) continue;
                if (scope === 'all' && typeof view.refreshAll === 'function') {
                    view.refreshAll();
                } else if (scope === 'capture' && typeof view.refreshCapture === 'function') {
                    view.refreshCapture();
                } else {
                    view.renderView();
                }
            }
        }
    }

    private mergeRefreshScope(current: RefreshScope | null, next: RefreshScope): RefreshScope {
        if (!current || current === next) return next;
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

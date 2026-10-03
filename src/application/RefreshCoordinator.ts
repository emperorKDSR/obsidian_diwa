import { App, TFile } from 'obsidian';
import { VIEW_TYPE_DESKTOP_HUB, VIEW_TYPE_GAWA_COCKPIT } from '../constants';
import { DesktopHubView } from '../views/DesktopHubView';
import type { IndexService } from '../services/IndexService';

export type RefreshScope = 'all' | 'tasks' | 'capture';

const CAPTURE_REFRESH_DEBOUNCE_MS = 250;
const DEFAULT_REFRESH_DEBOUNCE_MS = 400;

export class RefreshCoordinator {
    private _indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _reindexCooldown: Map<string, number> = new Map();
    private _pendingRefreshScope: RefreshScope | null = null;

    constructor(
        private app: App,
        private index: IndexService,
    ) {}

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

        const debounceMs = this._pendingRefreshScope === 'capture'
            ? CAPTURE_REFRESH_DEBOUNCE_MS
            : DEFAULT_REFRESH_DEBOUNCE_MS;
        this._indexDebounceTimer = setTimeout(() => {
            this._indexDebounceTimer = null;
            this._dispatchRefresh();
        }, debounceMs);
    }

    private _dispatchRefresh(): void {
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

        // Refresh all open Gawa Cockpit views
        const gawaLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GAWA_COCKPIT);
        for (const leaf of gawaLeaves) {
            const view = leaf.view as any;
            if (view && typeof view.refreshTasks === 'function') {
                if (view._taskPending > 0) continue;
                view.refreshTasks();
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

import type { DiwaView } from '../view';
import { WeeklyReviewWorkspace } from '../review/WeeklyReviewWorkspace';
import { BaseTab } from './BaseTab';

export class ReviewTab extends BaseTab {
    private readonly workspace: WeeklyReviewWorkspace;

    constructor(view: DiwaView) {
        super(view);
        this.workspace = new WeeklyReviewWorkspace({
            app: this.app,
            component: this.view,
            plugin: this.plugin,
            settings: this.settings,
            index: this.index,
            vault: this.vault,
            platform: 'desktop',
            getState: () => ({
                selectedReviewWeekId: this.view.selectedReviewWeekId,
                reviewDraft: this.view.reviewDraft,
                reviewDraftWeekId: this.view.reviewDraftWeekId,
                reviewDraftRevision: this.view.reviewDraftRevision,
                reviewDraftDirty: this.view.reviewDraftDirty,
                weekPlanDraft: this.view.weekPlanDraft,
                weekPlanDraftWeekId: this.view.weekPlanDraftWeekId,
                weekPlanDraftRevision: this.view.weekPlanDraftRevision,
                weekPlanDraftDirty: this.view.weekPlanDraftDirty,
                weekPlanTargetMode: this.view.weekPlanTargetMode,
            }),
            updateState: (patch) => {
                if (patch.selectedReviewWeekId !== undefined) this.view.selectedReviewWeekId = patch.selectedReviewWeekId;
                if (patch.reviewDraft !== undefined) this.view.reviewDraft = patch.reviewDraft;
                if (patch.reviewDraftWeekId !== undefined) this.view.reviewDraftWeekId = patch.reviewDraftWeekId;
                if (patch.reviewDraftRevision !== undefined) this.view.reviewDraftRevision = patch.reviewDraftRevision;
                if (patch.reviewDraftDirty !== undefined) this.view.reviewDraftDirty = patch.reviewDraftDirty;
                if (patch.weekPlanDraft !== undefined) this.view.weekPlanDraft = patch.weekPlanDraft;
                if (patch.weekPlanDraftWeekId !== undefined) this.view.weekPlanDraftWeekId = patch.weekPlanDraftWeekId;
                if (patch.weekPlanDraftRevision !== undefined) this.view.weekPlanDraftRevision = patch.weekPlanDraftRevision;
                if (patch.weekPlanDraftDirty !== undefined) this.view.weekPlanDraftDirty = patch.weekPlanDraftDirty;
                if (patch.weekPlanTargetMode !== undefined) this.view.weekPlanTargetMode = patch.weekPlanTargetMode;
            },
            rerender: () => this.view.renderView(),
            isRenderActive: (token, container) => this.isRenderCycleActive(token, container),
        });
    }

    render(container: HTMLElement): void {
        this.workspace.render(container, this.beginRenderCycle());
    }
}

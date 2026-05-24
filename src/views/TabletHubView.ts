import { VIEW_TYPE_TABLET_HUB } from '../constants';
import { DesktopHubView } from './DesktopHubView';

export class TabletHubView extends DesktopHubView {
    getViewType(): string { return VIEW_TYPE_TABLET_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    protected getWorkspaceSkinClass(): string {
        return 'diwa-skin--tablet';
    }
}

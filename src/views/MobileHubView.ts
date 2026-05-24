import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import { DesktopHubView } from './DesktopHubView';

export class MobileHubView extends DesktopHubView {
    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }

    protected getWorkspaceSkinClass(): string {
        return 'diwa-skin--mobile';
    }
}

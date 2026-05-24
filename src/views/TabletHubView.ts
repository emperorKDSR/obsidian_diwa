import { VIEW_TYPE_TABLET_HUB } from '../constants';
import { MobileHubView } from './MobileHubView';

export class TabletHubView extends MobileHubView {
    getViewType(): string { return VIEW_TYPE_TABLET_HUB; }
    getDisplayText(): string { return 'Diwa Workspace'; }
    getIcon(): string { return 'layout-dashboard'; }
}

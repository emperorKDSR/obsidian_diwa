import { DiwaSettings, LifeArea } from './types';

export const DEFAULT_LIFE_AREAS: LifeArea[] = [
    { id: 'work', label: 'Work', icon: '💼' },
    { id: 'health', label: 'Health', icon: '🌱' },
    { id: 'wealth', label: 'Wealth', icon: '💰' },
    { id: 'growth', label: 'Growth', icon: '💡' },
];

export const VIEW_TYPE_DESKTOP_HUB = "diwa-desktop-hub";
export const VIEW_TYPE_MOBILE_HUB  = "diwa-mobile-hub";
export const VIEW_TYPE_TABLET_HUB  = "diwa-tablet-hub";

// Desktop Hub ribbon icon — three-pane cockpit layout
export const DESKTOP_HUB_ICON_ID = "diwa-desktop-hub-icon";
export const DESKTOP_HUB_ICON_SVG = `<g transform="translate(8,8) scale(3.3)">
    <rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <line x1="8" y1="3" x2="8" y2="17" stroke="currentColor" stroke-width="1" stroke-dasharray="0"/>
    <line x1="16" y1="3" x2="16" y2="17" stroke="currentColor" stroke-width="1"/>
    <circle cx="5" cy="8" r="1" fill="currentColor"/>
    <circle cx="5" cy="11" r="1" fill="currentColor"/>
    <circle cx="5" cy="14" r="1" fill="currentColor"/>
</g>`;

export const DEFAULT_SETTINGS: DiwaSettings = {
    captureFolder: '000 Bin/Diwa',
    lifeAreas: DEFAULT_LIFE_AREAS,
    newNoteFolder: '000 Bin',
    attachmentsFolder: '000 Bin/DIWA Attachments',
    peopleFolder: '000 Bin/DIWA People',
    contexts: [],
    hiddenContexts: [],
    mobileBottomBarHeight: 56,
};

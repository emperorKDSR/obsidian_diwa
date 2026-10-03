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
export const VIEW_TYPE_GAWA_COCKPIT = "diwa-gawa-cockpit";

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

// Gawa Cockpit icon — checklist table layout
export const GAWA_COCKPIT_ICON_ID = "diwa-gawa-icon";
export const GAWA_COCKPIT_ICON_SVG = `<g transform="translate(8,8) scale(3.3)">
    <rect x="2" y="3" width="20" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="1.2"/>
    <line x1="8" y1="3" x2="8" y2="21" stroke="currentColor" stroke-width="1.2"/>
    <polyline points="4,5.5 5,6.5 7,4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="4,12 5,13 7,11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="4,16.5 5,17.5 7,15.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="10" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="10" y1="16.5" x2="18" y2="16.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
</g>`;

export const DEFAULT_SETTINGS: DiwaSettings = {
    captureFolder: '000 Bin/Diwa',
    lifeAreas: DEFAULT_LIFE_AREAS,
    newNoteFolder: '000 Bin',
    attachmentsFolder: '000 Bin/DIWA Attachments',
    peopleFolder: '000 Bin/DIWA People',
    contexts: [],
    mobileBottomBarHeight: 56,
};


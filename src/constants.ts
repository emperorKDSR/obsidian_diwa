import { DiwaSettings } from './types';
import { createDefaultGawaLayoutPreferences } from './gawaLayout';

export const VIEW_TYPE_DIWA = "diwa-view";
export const VIEW_TYPE_DESKTOP_HUB = "diwa-desktop-hub";
export const VIEW_TYPE_MOBILE_HUB  = "diwa-mobile-hub";
export const VIEW_TYPE_MOBILE_GAWA = "diwa-mobile-gawa";
export const VIEW_TYPE_TABLET_HUB  = "diwa-tablet-hub";
export const VIEW_TYPE_SEARCH = "diwa-search-view";
export const VIEW_TYPE_GRAPH_EXPLORER = "diwa-graph-explorer";

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

// Custom icon — Tactical reticle (precision targeting, cockpit HUD aesthetic)
export const KATANA_ICON_ID = "diwa-katana";

// addIcon content — transform maps 24x24 coords into Obsidian's 100×100 icon space
export const KATANA_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
    <line x1="12" y1="1.5" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="17" x2="12" y2="22.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="1.5" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="17" y1="12" x2="22.5" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</g>`;

export const NINJA_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    <line x1="12" y1="1.5" x2="12" y2="7"/>
    <line x1="12" y1="17" x2="12" y2="22.5"/>
    <line x1="1.5" y1="12" x2="7" y2="12"/>
    <line x1="17" y1="12" x2="22.5" y2="12"/>
</svg>`;

export const JOURNAL_ICON_ID = "diwa-journal-icon";
export const JOURNAL_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const DAILY_ICON_ID = "diwa-daily-icon";
export const DAILY_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</g>`;

export const AI_CHAT_ICON_ID = "diwa-ai-icon";
export const AI_CHAT_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <rect x="5" y="6" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <circle cx="9" cy="11" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="11" r="1.5" fill="currentColor"/>
    <path d="M12 2v4M8 2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M9 15h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</g>`;

export const TIMELINE_ICON_ID = "diwa-timeline-icon";
export const TIMELINE_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const GRUNDFOS_ICON_ID = "diwa-grundfos-icon";
export const GRUNDFOS_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <circle cx="9" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M14 14h5M16.5 14v-6M19 8h-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M9 9V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 5H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</g>`;

export const TASK_ICON_ID = "diwa-task-icon";
export const TASK_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <polyline points="9 11 12 14 22 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const PF_ICON_ID = "diwa-pf-icon";
export const PF_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <line x1="12" y1="1" x2="12" y2="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const VOICE_ICON_ID = "diwa-voice-icon";
export const VOICE_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="12" y1="18" x2="12" y2="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="8" y1="22" x2="16" y2="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const SETTINGS_ICON_ID = "diwa-settings-icon";
export const SETTINGS_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V11a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const PROJECT_ICON_ID = "diwa-project-icon";
export const PROJECT_ICON_SVG = `<g transform="translate(10,10) scale(3.5)"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;

export const SYNTHESIS_ICON_ID = "diwa-synthesis-icon";
export const SYNTHESIS_ICON_SVG = `<g transform="translate(10,10) scale(3.5)"><path d="M9 18h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 22h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 2a7 7 0 0 0-7 7c0 2.32 1.25 4.34 3.12 5.5L9 18h6l.88-3.5C17.75 13.34 19 11.32 19 9a7 7 0 0 0-7-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;

export const COMPASS_ICON_ID = "diwa-compass-icon";
export const COMPASS_ICON_SVG = `<g transform="translate(10,10) scale(3.5)"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;

export const REVIEW_ICON_ID = "diwa-review-icon";
export const REVIEW_ICON_SVG = `<g transform="translate(10,10) scale(3.5)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="9 16 11 18 15 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;

// Action Icons (Simple paths for 16x16 viewbox)
export const ICON_PIN = '<path d="M12 2v8m0 0l4 4m-4-4l-4 4M4 14h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_EDIT = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_TRASH = '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_PLUS = '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_REPLY = '<polyline points="9 17 4 12 9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 18v-2a4 4 0 0 0-4-4H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_ARROW_RIGHT = '<path d="M5 12h14"/><path d="M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_MESSAGE_SQUARE = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_LINK = '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_EYE = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_EYE_OFF = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
export const ICON_CHECKLIST = '<polyline points="9 11 12 14 22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

// ── Search shared constants ────────────────────────────────────────────────

export const SEARCH_SCOPES = [
    { id: 'all',     label: 'All' },
    { id: 'thought', label: 'Thoughts' },
    { id: 'task',    label: 'Gawa' },
    { id: 'due',     label: 'Bulsa' },
    { id: 'project', label: 'Projects' },
] as const;

export const SEARCH_TYPE_ICONS: Record<string, string> = {
    thought: 'lucide-message-circle',
    task:    'lucide-check-square-2',
    due:     'lucide-wallet',
    project: 'lucide-folder-kanban',
};

export const SEARCH_QUICKJUMP_TABS = [
    { id: 'timeline',     label: 'Timeline', icon: 'lucide-message-circle' },
    { id: 'review-gawa',  label: 'Gawa',     icon: 'lucide-check-square-2' },
    { id: 'dues',         label: 'Bulsa',    icon: 'lucide-wallet' },
    { id: 'projects',     label: 'Projects', icon: 'lucide-folder-kanban' },
    { id: 'journal',      label: 'Journal',  icon: 'lucide-book-open' },
];

export const DEFAULT_SETTINGS: DiwaSettings = {
    captureFolder: '000 Bin',
	captureFilePath: 'diwa.md',
    tasksFilePath: 'diwa_tasks.md',
    thoughtsFolder: '000 Bin/DIWA',
    tasksFolder: '000 Bin/DIWA Gawa',
    pfFolder: '000 Bin/DIWA PF',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [],
    hiddenContexts: [],
    selectedContexts: [],
        contextOrder: [],
    geminiApiKey: '',
    geminiModel: 'gemini-1.5-pro',
    maxOutputTokens: 65536,
    newNoteFolder: '000 Bin',
    voiceMemoFolder: '000 Bin/DIWA Voice',
    aiChatFolder: '000 Bin/DIWA AI Chat',
    transcriptionLanguage: 'English',
    dailySectionStates: {},
    showDailySections: true,
    showDailyChecklist: true,
    showDailyTasks: true,
    showDailyDues: true,
    showDailyThoughts: true,
    showDailyPinned: true,
    showDailySummary: true,
    grundfosModeOrder: [],
    journalModeOrder: [],
    pfModeOrder: [],
    grundfosKeywords: [],
    journalKeywords: [],
    blurredNotes: [],
    isCompactView: false,
    customModes: [],
    customModeOrders: {},
    weeklyGoals: [],
    monthlyGoals: [],
    monthlyIncome: 0,
    northStarGoals: [],
    enableAutoClassification: false,
    lifeMission: '',
    attachmentsFolder: '000 Bin/DIWA Attachments',
    projectsFolder: 'Projects',
    reviewsFolder: '000 Bin/DIWA Reviews',
    reminderTasksEnabled: true,
    mobileBottomBarHeight: 56,
    peopleFolder: '000 Bin/DIWA People',
    legacyMigrated: false,
    gawaLayoutPreferences: createDefaultGawaLayoutPreferences(),
    ai: {
        enabled: false,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        enableSuggestions: false,
        enableSummaries: true,
    },
}

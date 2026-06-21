import { TFile } from 'obsidian';

export type GawaPaneId =
    | 'gawa-inbox'
    | 'gawa-today'
    | 'gawa-focus'
    | 'gawa-active'
    | 'gawa-backlog';

export type GawaDesktopBucketId = 'left' | 'center' | 'right';
export type GawaTabletBucketId = 'planning' | 'execution' | 'support';

export interface GawaLayoutBucketPreference {
    order: GawaPaneId[];
    hidden: GawaPaneId[];
}

export interface GawaLayoutPreferences {
    version: 1;
    desktop: Record<GawaDesktopBucketId, GawaLayoutBucketPreference>;
    tablet: Record<GawaTabletBucketId, GawaLayoutBucketPreference>;
}

export type ResponsiveWorkspaceView = 'home' | 'review' | 'tasks' | 'thoughts' | 'bulsa';
export type BulsaMode = 'ledger' | 'insights';

export interface BulsaLeafState {
    mode?: BulsaMode;
    showAllDues?: boolean;
}

export interface ResponsiveShellState extends Record<string, unknown> {
    activeView?: ResponsiveWorkspaceView;
    activeContexts?: string[];
    selectedThoughtId?: string | null;
    selectedBulsaDuePath?: string | null;
    selectedReviewWeekId?: string | null;
    reviewDraft?: { wins: string; lessons: string; focus: string[] } | null;
    reviewDraftWeekId?: string | null;
    reviewDraftRevision?: number | null;
    reviewDraftDirty?: boolean;
    weekPlanDraft?: Record<string, string> | null;
    weekPlanDraftWeekId?: string | null;
    weekPlanDraftRevision?: number | null;
    weekPlanDraftDirty?: boolean;
    weekPlanTargetMode?: 'next' | 'this';
    bulsa?: BulsaLeafState;
}

export interface DiwaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
    thoughtsFolder: string;
    tasksFolder: string;
    pfFolder: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    hiddenContexts: string[];
    selectedContexts: string[];
    newNoteFolder: string;
    dailySectionStates: Record<string, boolean>;
    showDailySections: boolean;
    showDailyChecklist: boolean;
    showDailyTasks: boolean;
    showDailyDues: boolean;
    showDailyThoughts: boolean;
    showDailyPinned: boolean;
    showDailySummary: boolean;
    grundfosModeOrder: string[];
    journalModeOrder: string[];
    pfModeOrder: string[];
    grundfosKeywords: string[];
    journalKeywords: string[];
    blurredNotes: string[];
    isCompactView: boolean;
    customModes: CustomMode[];
    customModeOrders: Record<string, string[]>;
    weeklyGoals: string[];
    monthlyGoals: string[];
    monthlyIncome: number;
    northStarGoals: string[];
    attachmentsFolder: string;
    reviewsFolder: string;
    mobileBottomBarHeight: number;
    legacyMigrated?: boolean;
    peopleFolder: string;
    contextOrder: string[];
    gawaLayoutPreferences: GawaLayoutPreferences;
    canvasDefaultDepth: number; // default BFS depth for mind map generation
    canvasDefaultDirection: 'lr' | 'rl' | 'tb' | 'bt' | 'radial'; // default layout direction
    canvasNodeWidth: number; // default canvas node width (px)
    canvasNodeHeight: number; // default canvas node height (px)
    canvasSpacingX: number; // horizontal spacing between nodes (px)
    canvasSpacingY: number; // vertical spacing between nodes (px)
    canvasOutputFolder: string; // folder to place generated canvas files (empty = same folder as source)
    mindMapNodeSizes: Record<string, {width: number, height: number, x?: number, y?: number}>;
    mindMapFloatingNodes: Record<string, string[]>;
}

export interface CustomMode {
    id: string;
    name: string;
    context: string;
    keywords: string[];
    icon: string;
}

export interface ReplyEntry {
    anchor: string;   // e.g. "reply-1774590963512"
    date: string;     // YYYY-MM-DD
    time: string;     // HH:mm:ss
    text: string;     // reply body text
}

export interface ThoughtEntry {
    id?: string;               // stable ID alias; defaults to filePath when absent
    filePath: string;          // vault path to the file
    title: string;             // from frontmatter
    created: string;           // YYYY-MM-DD HH:mm:ss
    modified: string;          // YYYY-MM-DD HH:mm:ss
    createdAt?: number;        // ms timestamp for lifecycle-aware sorting
    updatedAt?: number;        // ms timestamp for lifecycle-aware sorting
    day: string;               // e.g. "2026-03-28"
    allDates: string[];        // all [[YYYY-MM-DD]] links found in full content
    context: string[];         // from frontmatter context list
    topic?: string | string[] | null; // sub-topic label(s), e.g. "Meeting"
    journalType?: string | null;
    body: string;              // text before first ## reply header
    content?: string;          // canonical full content alias
    wikilinks: string[];       // derived from [[wikilinks]] in content/body
    lastThreadUpdate: number;  // ms timestamp for sorting
    state?: 'raw' | 'refined' | 'important';
    pinned?: boolean;          // true if the thought is pinned
    archived?: boolean;
    tags?: string[];
    synthesized?: boolean;     // true if the thought has been synthesized into a master note
    links?: {
        tasks: string[];       // linked task IDs (file paths in current implementation)
        thoughts: string[];    // linked thought IDs
    };
}

export interface TaskEntry {
    id?: string;           // stable ID alias; defaults to taskId/filePath when absent
    filePath: string;
    title: string;
    created: string;       // "YYYY-MM-DD HH:mm:ss"
    modified: string;
    day: string;           // "YYYY-MM-DD"
    status: 'open' | 'done' | 'waiting' | 'someday';
    state?: 'backlog' | 'active' | 'done' | 'open' | 'waiting' | 'someday'; // legacy alias persisted in older frontmatter
    due: string;           // "YYYY-MM-DD" or ""
    context: string[];
    body: string;
    lastUpdate: number;    // ms timestamp of modified for sorting
    children: ReplyEntry[]; // Support comments/replies on tasks
    priority?: 'high' | 'medium' | 'low';
    energy?: 'high' | 'medium' | 'low';
    recurrence?: RecurrenceRule;
    recurrenceParentId?: string;
    bucketStatus?: TaskBucketStatus;
    focus?: boolean;
    // Unified task model fields — absent on legacy tasks; treat as defaults below
    taskId?: string;                        // stable ID stored in frontmatter
    origin?: 'thought' | 'direct';         // how the task was created
    sourceThoughtIds?: string[];            // thought file paths that originated this task
    // Lifecycle fields — absent on legacy tasks; safe to default
    lifecycleStatus?: 'planned' | 'active' | 'done';
    createdAt?: string;                     // ISO-8601 timestamp
    updatedAt?: string;                     // ISO-8601 timestamp, updated on every state change
    completedAt?: string;                   // ISO-8601 timestamp, set when lifecycleStatus = done
    reflectionThoughtId?: string;           // vault path of the reflection note for this task
    links?: {
        thoughts: string[];                 // linked thought IDs (file paths in current implementation)
    };
}

export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type TaskBucketStatus = 'backlog' | 'active' | 'done';

/**
 * Unified task object — represents both tasks created from thoughts and
 * tasks created directly. Separate from TaskEntry (which is file-per-task
 * with YAML frontmatter); Task is a lightweight inline model used for
 * checklist-embedded tasks that carry optional structured metadata.
 */
export interface Task {
    id: string;
    filePath?: string;
    title: string;
    origin: 'thought' | 'direct';
    sourceThoughtIds: string[];
    status: 'planned' | 'active' | 'done';
    due?: string;
    context?: string;
    // Lifecycle timestamps — optional; absent on tasks parsed from legacy lines
    createdAt?: string;    // ISO-8601
    updatedAt?: string;    // ISO-8601
    completedAt?: string;  // ISO-8601, present only when status = done
    rescheduleCount?: number; // incremented each time auto-scheduling moves this task
    reflectionThoughtId?: string; // vault path of the reflection note for this task
}

export interface DueEntry { 
    title: string; 
    path: string; 
    dueDate: string; 
    lastPayment: string; 
    dueMoment: import('moment').Moment | null; 
    hasRecurring: boolean; 
    isActive: boolean;
    amount?: number;
    category?: string;
}

export type FileOrCreate = TFile | string;

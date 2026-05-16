import { TFile } from 'obsidian';

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export interface ProjectEntry {
    id: string;
    name: string;
    status: 'active' | 'on-hold' | 'completed' | 'archived';
    goal: string;
    due?: string;
    created: string;
    color?: string;
    filePath: string;
    milestones?: Milestone[];
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
    geminiApiKey: string;
    geminiModel: string;
    maxOutputTokens: number;
    newNoteFolder: string;
    voiceMemoFolder: string;
    aiChatFolder: string;
    transcriptionLanguage: string;
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
    habitsFolder: string;
    habits: Habit[];
    weeklyGoals: string[];
    monthlyGoals: string[];
    monthlyIncome: number;
    northStarGoals: string[];
    enableAutoClassification: boolean;
    lifeMission: string;
    attachmentsFolder: string;
    projectsFolder: string;
    reviewsFolder: string;
    reminderHabitsEnabled: boolean;
    reminderTasksEnabled: boolean;
    legacyMigrated?: boolean;
    peopleFolder: string;
    contextOrder: string[];
}

export interface Milestone {
    id: string;
    title: string;
    done: boolean;
    dueDate?: string;
}

export interface Habit {
    id: string;
    name: string;
    icon: string; // e.g. "💧", "🧘"
    archived?: boolean;
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
    filePath: string;          // vault path to the file
    title: string;             // from frontmatter
    created: string;           // YYYY-MM-DD HH:mm:ss
    modified: string;          // YYYY-MM-DD HH:mm:ss
    day: string;               // e.g. "2026-03-28"
    allDates: string[];        // all [[YYYY-MM-DD]] links found in full content
    context: string[];         // from frontmatter context list
    topic?: string | null;     // sub-topic label, e.g. "Meeting"
    body: string;              // text before first ## reply header
    lastThreadUpdate: number;  // ms timestamp for sorting
    pinned?: boolean;          // true if the thought is pinned
    project?: string;          // associated project name
    synthesized?: boolean;     // true if the thought has been synthesized into a master note
}

export interface TaskEntry {
    filePath: string;
    title: string;
    created: string;       // "YYYY-MM-DD HH:mm:ss"
    modified: string;
    day: string;           // "YYYY-MM-DD"
    status: 'open' | 'done' | 'waiting' | 'someday';
    due: string;           // "YYYY-MM-DD" or ""
    context: string[];
    body: string;
    lastUpdate: number;    // ms timestamp of modified for sorting
    children: ReplyEntry[]; // Support comments/replies on tasks
    project?: string;       // associated project name
    priority?: 'high' | 'medium' | 'low';
    energy?: 'high' | 'medium' | 'low';
    recurrence?: RecurrenceRule;
    recurrenceParentId?: string;
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
}

export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly';

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
}

export type FileOrCreate = TFile | string;

export type VoiceState = 'idle' | 'recording' | 'processing' | 'reviewing' | 'confirmed';

export interface WeeklyReportContext {
    weekId: string;
    dateRange: string;
    wins: string;
    lessons: string;
    focus: string[];
    habitData: { name: string; icon: string; count: number }[];
    completedTasks: string[];
    overdueTasks: string[];
    activeProjects: string[];
    weeklyGoals: string[];
    northStarGoals: string[];
    recentThoughts: string[];
    dayPlans?: Record<string, string>;
}

export interface ReviewData {
    transcript: string;
    clipFile: TFile | null;
    durationMs: number;
    clipFileName: string;
}

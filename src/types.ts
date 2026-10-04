import { TFile } from 'obsidian';

export interface LifeArea {
    id: string;
    label: string;
    icon: string;
}

export interface CaptureTaskItem {
    lineIndex: number;
    title: string;
    completed: boolean;
}

export interface GawaSubtaskItem {
    title: string;
    completed: boolean;
}

export interface GawaTaskRecord {
    filePath: string;
    noteTitle: string;
    lineIndex: number;
    rawTitle: string;
    cleanTitle: string;
    completed: boolean;
    dueDate: string | null;       // "YYYY-MM-DD" (earliest date)
    dueDateRelative?: string;     // "Overdue", "Today", "Tomorrow", "In 3d", etc.
    areaId: string;
    areaLabel: string;
    areaIcon: string;
    tags: string[];
    wikilinks: string[];
    subtasks: GawaSubtaskItem[];  // Indented child task lines
    remarks: string[];            // Indented child remark lines
    shadowedLocations?: { filePath: string; lineIndex: number; title?: string }[];
}

export interface CaptureEntry {
    id: string;
    filePath: string;
    created: string; // ISO-8601 or YYYY-MM-DD HH:mm:ss
    modified: string;
    createdAtMs: number;
    area: string;
    tags: string[];
    body: string;
    rawBody?: string;
    hasTasks: boolean;
    tasks: CaptureTaskItem[];
    gawaTasks?: GawaTaskRecord[];
    allDates: string[];
    wikilinks: string[];
    pinned?: boolean;
    important?: boolean;
    digested?: boolean;
    digestedAt?: string;
}

export type ScratchpadFilterMode = 'all' | 'unprocessed' | 'digested' | 'tasks_only' | 'important' | 'untagged' | string;

export interface DigestibleBlock {
    sourceFilePath: string;
    sourceCreatedMs: number;
    blockIndex: number;
    deterministicId: string;
    rawContent: string;
    cleanText: string;
    isTask: boolean;
    isCompletedTask: boolean;
    dueDate: string | null;
    primaryTarget: string | null;
    alternativeTargets: string[];
    actionRoute: 'target_log' | 'target_tasks' | 'keep_scratchpad' | 'gawa_inbox';
    area?: string | null;
}

export interface DayDigestSummary {
    dateStr: string;
    totalCount: number;
    digestedCount: number;
    hasOpenTasks: boolean;
    status: 'empty' | 'raw' | 'partial' | 'digested';
}

export type ScratchpadHorizon = 'today' | '3d' | '7d' | '14d' | '30d' | 'all' | 'custom';

export interface DiwaSettings {
    captureFolder: string;
    lifeAreas: LifeArea[];
    newNoteFolder: string;
    attachmentsFolder: string;
    peopleFolder: string;
    contexts: string[];
    mobileBottomBarHeight: number;
    trackedTaskFiles?: string[];
    additionalTaskFolders?: string[];
    scratchpadHorizon: ScratchpadHorizon;
    scratchpadCustomDate?: string;
    keepImportantInScratchpad: boolean;
    permanentNotesFolders?: string[];
}

export interface PermanentNoteRecord {
    filePath: string;
    title: string;
    folder: string;
    mtime: number;
    modifiedRelative: string;
    tags: string[];
}

export type FileOrCreate = TFile | string;

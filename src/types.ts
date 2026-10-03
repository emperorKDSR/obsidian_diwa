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
    remarks: string[];            // Indented child remark lines
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
    hasTasks: boolean;
    tasks: CaptureTaskItem[];
    gawaTasks?: GawaTaskRecord[];
    allDates: string[];
    wikilinks: string[];
    pinned?: boolean;
    important?: boolean;
}

export type ScratchpadFilterMode = 'all' | 'tasks_only' | 'important' | 'untagged' | string;

export interface DiwaSettings {
    captureFolder: string;
    lifeAreas: LifeArea[];
    newNoteFolder: string;
    attachmentsFolder: string;
    peopleFolder: string;
    contexts: string[];
    mobileBottomBarHeight: number;
}

export type FileOrCreate = TFile | string;

import { TFile } from 'obsidian';

export interface LifeArea {
    id: string;
    label: string;
    icon: string;
    color?: string;
}

export interface CaptureTaskItem {
    lineIndex: number;
    rawLine: string;
    title: string;
    completed: boolean;
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
    thoughtsFolder?: string;
    tasksFolder?: string;
    pfFolder?: string;
    reviewsFolder?: string;
    contexts: string[];
    hiddenContexts: string[];
    mobileBottomBarHeight: number;
    legacyMigrated?: boolean;
}

export type FileOrCreate = TFile | string;

import { DEFAULT_SETTINGS } from '../constants';
import type { DiwaSettings } from '../types';
import { normalizeVaultRelativePath } from './vaultFiles';

export function normalizeConfiguredSettingPath(path: string | undefined, fallback: string, label: string): string {
    const candidate = (path || '').trim() || fallback;
    const kind = label.toLowerCase().includes('folder') ? 'folder' : 'path';
    try {
        return normalizeVaultRelativePath(candidate, kind);
    } catch (error) {
        console.warn(`[DIWA] Invalid ${label} setting "${candidate}". Falling back to "${fallback}".`, error);
        return normalizeVaultRelativePath(fallback, kind);
    }
}

function joinConfiguredPath(...segments: string[]): string {
    return normalizeVaultRelativePath(segments.filter(Boolean).join('/'), 'path');
}

export function getCanonicalCaptureFolder(settings: DiwaSettings): string {
    return normalizeConfiguredSettingPath(settings.captureFolder, DEFAULT_SETTINGS.captureFolder, 'captureFolder');
}

export function getCanonicalCapturePath(settings: DiwaSettings): string {
    const folder = getCanonicalCaptureFolder(settings);
    const file = normalizeConfiguredSettingPath(settings.captureFilePath, DEFAULT_SETTINGS.captureFilePath, 'captureFilePath');
    return joinConfiguredPath(folder, file);
}

export function getCanonicalLegacyTasksCapturePath(settings: DiwaSettings): string {
    const folder = getCanonicalCaptureFolder(settings);
    const file = normalizeConfiguredSettingPath(settings.tasksFilePath, DEFAULT_SETTINGS.tasksFilePath, 'tasksFilePath');
    return joinConfiguredPath(folder, file);
}

export function getCanonicalReviewsFolder(settings: DiwaSettings): string {
    return normalizeConfiguredSettingPath(settings.reviewsFolder, DEFAULT_SETTINGS.reviewsFolder, 'reviewsFolder');
}

export function getCanonicalWeeklyReviewsFolder(settings: DiwaSettings): string {
    return joinConfiguredPath(getCanonicalReviewsFolder(settings), 'Weekly');
}

export function getCanonicalWeeklyReviewPath(settings: DiwaSettings, weekId: string): string {
    return joinConfiguredPath(getCanonicalWeeklyReviewsFolder(settings), `${weekId}.md`);
}

export function getCanonicalMonthlyGoalsPath(settings: DiwaSettings, monthId: string): string {
    return joinConfiguredPath(getCanonicalReviewsFolder(settings), 'Monthly', `${monthId}.md`);
}

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
    const file = normalizeConfiguredSettingPath((settings as any).captureFilePath, 'diwa.md', 'captureFilePath');
    return joinConfiguredPath(folder, file);
}

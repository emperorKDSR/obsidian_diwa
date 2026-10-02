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

export function getCanonicalCaptureFolder(settings: DiwaSettings): string {
    return normalizeConfiguredSettingPath(settings.captureFolder, DEFAULT_SETTINGS.captureFolder, 'captureFolder');
}

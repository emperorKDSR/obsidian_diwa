import { App, TFile } from 'obsidian';

export interface VaultCreateOptions {
    onCollision?: 'suffix' | 'error';
}

type FrontmatterScalar = string | number | boolean | null;
type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[] | undefined;

export function normalizeVaultRelativePath(path: string, kind: 'folder' | 'path' = 'folder'): string {
    const normalized = String(path || '')
        .trim()
        .replace(/\\/g, '/');
    if (!normalized || normalized === '.') {
        return '';
    }
    if (
        normalized.startsWith('/')
        || normalized.startsWith('~')
        || normalized.startsWith('//')
        || /^[A-Za-z]:/.test(normalized)
    ) {
        throw new Error(`Invalid ${kind} path: "${path}"`);
    }

    const segments = normalized.split('/');
    const sanitizedSegments: string[] = [];
    for (const segment of segments) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            throw new Error(`Invalid ${kind} path: "${path}"`);
        }
        sanitizedSegments.push(segment);
    }

    return sanitizedSegments.join('/');
}

function normalizeVaultFolder(folder: string): string {
    const normalized = normalizeVaultRelativePath(folder, 'folder');
    if (!normalized) {
        return '';
    }
    return normalized;
}

function sanitizeVaultFilename(filename: string): string {
    const trimmed = (filename || '').trim();
    const extIdx = trimmed.lastIndexOf('.');
    const base = extIdx > 0 ? trimmed.substring(0, extIdx) : trimmed;
    const ext = extIdx > 0 ? trimmed.substring(extIdx) : '';
    const safeBase = base
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '') || 'Untitled';
    const safeExt = ext.replace(/[^.\w-]/g, '');
    return `${safeBase}${safeExt}`;
}

export async function ensureVaultFolder(app: App, folder: string): Promise<void> {
    const normalizedFolder = normalizeVaultFolder(folder);
    if (!normalizedFolder) return;
    const parts = normalizedFolder.split('/').filter(Boolean);
    let pathSoFar = '';
    for (const part of parts) {
        pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
        if (app.vault.getAbstractFileByPath(pathSoFar)) continue;
        try {
            await app.vault.createFolder(pathSoFar);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('already exists')) throw error;
        }
    }
}

async function resolveVaultCreatePath(app: App, folder: string, filename: string, options: VaultCreateOptions = {}): Promise<string> {
    const normalizedFolder = normalizeVaultFolder(folder);
    const normalizedFilename = sanitizeVaultFilename(filename);
    if (normalizedFolder) {
        await ensureVaultFolder(app, normalizedFolder);
    }

    const path = normalizedFolder ? `${normalizedFolder}/${normalizedFilename}` : normalizedFilename;
    if (!app.vault.getAbstractFileByPath(path)) {
        return path;
    }

    if (options.onCollision === 'error') {
        throw new Error('A file with that name already exists.');
    }

    const extIdx = normalizedFilename.lastIndexOf('.');
    const base = extIdx !== -1 ? normalizedFilename.substring(0, extIdx) : normalizedFilename;
    const ext = extIdx !== -1 ? normalizedFilename.substring(extIdx) : '';
    const uniqueName = `${base} (${Date.now()})${ext}`;
    return normalizedFolder ? `${normalizedFolder}/${uniqueName}` : uniqueName;
}

function serializeFrontmatterScalar(value: FrontmatterScalar): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return 'null';
}

export function buildYamlFrontmatter(frontmatter: Record<string, FrontmatterValue>): string {
    const lines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined) continue;
        if (!/^[A-Za-z0-9_-]+$/.test(key)) {
            throw new Error(`Invalid frontmatter key: "${key}"`);
        }
        if (Array.isArray(value)) {
            lines.push(`${key}:`);
            if (value.length === 0) {
                lines.push('  []');
            } else {
                value.forEach((item) => lines.push(`  - ${serializeFrontmatterScalar(item)}`));
            }
            continue;
        }
        lines.push(`${key}: ${serializeFrontmatterScalar(value)}`);
    }
    lines.push('---');
    return `${lines.join('\n')}\n`;
}

export async function createVaultFile(app: App, folder: string, filename: string, content: string, options: VaultCreateOptions = {}): Promise<TFile> {
    const finalPath = await resolveVaultCreatePath(app, folder, filename, options);
    return app.vault.create(finalPath, content);
}

export async function createVaultBinaryFile(app: App, folder: string, filename: string, content: ArrayBuffer, options: VaultCreateOptions = {}): Promise<TFile> {
    const finalPath = await resolveVaultCreatePath(app, folder, filename, options);
    return app.vault.createBinary(finalPath, content);
}

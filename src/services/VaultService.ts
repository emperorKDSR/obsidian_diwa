import { App, TFile, Notice, moment } from 'obsidian';
import type { DiwaSettings } from '../types';
import { createVaultBinaryFile, createVaultFile, ensureVaultFolder, normalizeVaultRelativePath } from '../utils/vaultFiles';

export { createVaultBinaryFile, createVaultFile };

export class VaultService {
    app: App;
    settings: DiwaSettings;

    constructor(app: App, settings: DiwaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: DiwaSettings) {
        this.settings = settings;
    }

    /** Ensure a folder exists in the vault */
    async ensureFolder(folderPath: string): Promise<void> {
        await ensureVaultFolder(this.app, folderPath);
    }

    /** Map errors to user-friendly messages; never surface raw e.message */
    private static toUserMessage(e: unknown): string {
        const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('access')) return 'Permission denied — check your vault folder permissions.';
        if (msg.includes('not found') || msg.includes('does not exist')) return 'File not found — it may have been moved or deleted.';
        if (msg.includes('already exists')) return 'A file with that name already exists.';
        if (msg.includes('disk') || msg.includes('space') || msg.includes('enospc')) return 'Not enough disk space — free up storage and try again.';
        return 'Something went wrong. Open the developer console (Ctrl+Shift+I) for details.';
    }

    sanitizeContext(c: string): string {
        return c.replace(/^#+/, '').trim();
    }

    /** Toggle a markdown task item on a given line index atomically */
    async toggleTask(filePath: string, lineIndex: number, currentDone: boolean): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            new Notice('File not found.');
            return false;
        }

        try {
            let targetUpdated = false;
            await this.app.vault.process(file, (content) => {
                const lines = content.split('\n');
                if (lineIndex < 0 || lineIndex >= lines.length) {
                    return content;
                }

                const line = lines[lineIndex];
                let updatedLine: string | null = null;
                if (currentDone) {
                    updatedLine = line.replace(/^(\s*[-*+]\s*\[)[xX](\])/, '$1 $2');
                } else {
                    updatedLine = line.replace(/^(\s*[-*+]\s*\[)\s*(\])/, '$1x$2');
                }

                if (updatedLine && updatedLine !== line) {
                    lines[lineIndex] = updatedLine;
                    targetUpdated = true;
                    return lines.join('\n');
                }
                return content;
            });

            return targetUpdated;
        } catch (e) {
            console.error('[DIWA VaultService] toggleTask:', e);
            new Notice(VaultService.toUserMessage(e));
            return false;
        }
    }
}

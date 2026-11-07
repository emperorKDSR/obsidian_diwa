import test from 'node:test';
import assert from 'node:assert';
import { App, TFile } from 'obsidian';
import { IndexService } from '../src/services/IndexService';
import { DEFAULT_SETTINGS } from '../src/constants';

test('isCaptureFile correctly matches notes in default capture folder and additional capture folders', () => {
    const app = new App();
    const settings = {
        ...DEFAULT_SETTINGS,
        captureFolder: '000 Bin/Diwa',
        additionalCaptureFolders: ['000 Bin/qc']
    };
    const index = new IndexService(app, settings);

    // Primary capture folder
    assert.strictEqual(index.isCaptureFile('000 Bin/Diwa/2026/10/2026-10-31 10.00.00.md'), true);
    assert.strictEqual(index.isCaptureFile('000 bin/diwa/sub/note.md'), true);

    // Additional capture folder (000 Bin/qc)
    assert.strictEqual(index.isCaptureFile('000 Bin/qc/202610301702 qc 1.md'), true);
    assert.strictEqual(index.isCaptureFile('000 bin/qc/202610301702 qc.md'), true);

    // Trash and non-markdown exclusions
    assert.strictEqual(index.isCaptureFile('000 Bin/qc/trash/note.md'), false);
    assert.strictEqual(index.isCaptureFile('000 Bin/qc/image.png'), false);

    // Permanent note outside capture folders
    assert.strictEqual(index.isCaptureFile('000 Bin/Personal Note.md'), false);
    assert.strictEqual(index.isCaptureFile('Notes/Slipbox/Idea.md'), false);
});

test('isPermanentNoteFile excludes notes in additional capture folders', () => {
    const app = new App();
    const settings = {
        ...DEFAULT_SETTINGS,
        captureFolder: '000 Bin/Diwa',
        additionalCaptureFolders: ['000 Bin/qc'],
        permanentNotesFolders: []
    };
    const index = new IndexService(app, settings);

    // Capture notes should not be permanent notes
    assert.strictEqual(index.isPermanentNoteFile('000 Bin/Diwa/note.md'), false);
    assert.strictEqual(index.isPermanentNoteFile('000 Bin/qc/202610301702 qc 1.md'), false);

    // Non-capture notes should be permanent notes
    assert.strictEqual(index.isPermanentNoteFile('000 Bin/Personal Note.md'), true);
    assert.strictEqual(index.isPermanentNoteFile('Notes/Slipbox/Idea.md'), true);
});

test('indexCaptureFile extracts both date and time from compact YYYYMMDDHHmm filenames', async () => {
    const app = new App();
    const settings = {
        ...DEFAULT_SETTINGS,
        captureFolder: '000 Bin/Diwa',
        additionalCaptureFolders: ['000 Bin/qc']
    };
    const index = new IndexService(app, settings);

    const fileWithTime = new TFile('000 Bin/qc/202610301702 qc.md');
    app.vault.read = async () => 'This is a test note';
    app.metadataCache.getFileCache = () => ({ frontmatter: undefined });

    const entryWithTime = await index.indexCaptureFile(fileWithTime);
    assert.ok(entryWithTime);
    assert.strictEqual(entryWithTime?.created, '2026-10-30T17:02:00');

    const fileDateOnly = new TFile('000 Bin/qc/20261030 note.md');
    const entryDateOnly = await index.indexCaptureFile(fileDateOnly);
    assert.ok(entryDateOnly);
    assert.strictEqual(entryDateOnly?.created, '2026-10-30T00:00:00');
});

test('additionalCaptureFoldersChanged detects modifications to folder settings', () => {
    const app = new App();
    const settings = {
        ...DEFAULT_SETTINGS,
        additionalCaptureFolders: ['000 Bin/qc']
    };
    const index = new IndexService(app, settings);

    // Initial state after indexing
    (index as any)._lastIndexedAdditionalCaptureFolders = '000 bin/qc';
    assert.strictEqual(index.additionalCaptureFoldersChanged(), false);

    // Change setting
    settings.additionalCaptureFolders = ['000 Bin/qc', '000 Bin/inbox'];
    assert.strictEqual(index.additionalCaptureFoldersChanged(), true);
});

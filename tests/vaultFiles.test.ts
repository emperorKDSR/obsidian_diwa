import test from 'node:test';
import assert from 'node:assert';
import {
    sanitizeVaultFilename,
    normalizeVaultRelativePath,
    buildYamlFrontmatter
} from '../src/utils/vaultFiles';

test('sanitizeVaultFilename cleans illegal filesystem characters', () => {
    assert.strictEqual(sanitizeVaultFilename('Project: Strategy 2026'), 'Project- Strategy 2026');
    assert.strictEqual(sanitizeVaultFilename('Client / Onboarding?'), 'Client - Onboarding-');
    assert.strictEqual(sanitizeVaultFilename('Note *with* "quotes" & | pipe'), 'Note -with- -quotes- & - pipe');
    assert.strictEqual(sanitizeVaultFilename(''), 'Untitled');
    assert.strictEqual(sanitizeVaultFilename('   '), 'Untitled');
    assert.strictEqual(sanitizeVaultFilename('...leading.dots...'), 'leading.dots');
});

test('normalizeVaultRelativePath guards against path traversal and root paths', () => {
    assert.strictEqual(normalizeVaultRelativePath('000 Bin/Diwa'), '000 Bin/Diwa');
    assert.strictEqual(normalizeVaultRelativePath('notes/subfolder/file.md', 'path'), 'notes/subfolder/file.md');
    assert.strictEqual(normalizeVaultRelativePath('.'), '');
    assert.strictEqual(normalizeVaultRelativePath(''), '');

    assert.throws(() => normalizeVaultRelativePath('/root/folder'), /Invalid folder path/);
    assert.throws(() => normalizeVaultRelativePath('../escape/dir'), /Invalid folder path/);
    assert.throws(() => normalizeVaultRelativePath('C:/Windows/System32'), /Invalid folder path/);
});

test('buildYamlFrontmatter produces valid YAML and handles types', () => {
    const fm = buildYamlFrontmatter({
        title: 'Meeting Notes',
        created: '2026-10-11T12:00:00',
        important: true,
        count: 5,
        tags: ['work', 'project'],
        emptyList: []
    });

    assert.ok(fm.startsWith('---\n'));
    assert.ok(fm.endsWith('---\n'));
    assert.ok(fm.includes('title: "Meeting Notes"'));
    assert.ok(fm.includes('important: true'));
    assert.ok(fm.includes('count: 5'));
    assert.ok(fm.includes('  - "work"'));
    assert.ok(fm.includes('  - "project"'));
    assert.ok(fm.includes('emptyList:\n  []'));
});

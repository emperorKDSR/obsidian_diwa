import test from 'node:test';
import assert from 'node:assert';
import { GawaTaskRecord } from '../src/types';
import { IndexService } from '../src/services/IndexService';
import {
    filterKaronTasks,
    formatKaronNotesHeading,
    formatKaronQuickCaptureContent,
    formatKaronQuickTaskContent,
    getKaronDayTitle,
    hasMocTopicTag,
    normalizeTagComparison,
    parseStandaloneWikilinkSchedule,
    slugifyMocTopicTag
} from '../src/utils/karonHelpers';

function makeTask(overrides: Partial<GawaTaskRecord> = {}): GawaTaskRecord {
    return {
        filePath: '000 Bin/Diwa/2026/11/sample.md',
        noteTitle: 'sample',
        lineIndex: 0,
        rawTitle: 'Sample task',
        cleanTitle: 'Sample task',
        completed: false,
        dueDate: '2026-11-11',
        areaId: '',
        areaLabel: '—',
        areaIcon: '—',
        tags: [],
        wikilinks: [],
        subtasks: [],
        remarks: [],
        ...overrides
    };
}

test('filterKaronTasks excludes completed tasks and Handumanan paths', () => {
    const tasks: GawaTaskRecord[] = [
        makeTask({ rawTitle: 'Open task', completed: false, filePath: '000 Bin/Diwa/a.md' }),
        makeTask({ rawTitle: 'Done task', completed: true, filePath: '000 Bin/Diwa/b.md' }),
        makeTask({ rawTitle: 'Handumanan upper', completed: false, filePath: 'Handumanan/journal.md' }),
        makeTask({ rawTitle: 'Handumanan nested', completed: false, filePath: 'Archive/handumanan/note.md' })
    ];

    const filtered = filterKaronTasks(tasks);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].rawTitle, 'Open task');
});

test('formatKaronNotesHeading formats Today, Tomorrow, and future dates cleanly', () => {
    assert.strictEqual(formatKaronNotesHeading(0, '2026-11-11', 2), 'Notes for Today (2)');
    assert.strictEqual(formatKaronNotesHeading(1, '2026-11-12', 1), 'Notes for Tomorrow (1)');
    assert.strictEqual(formatKaronNotesHeading(3, '2026-11-14', 4), 'Notes for Nov 14 (4)');
});

test('getKaronDayTitle renders Today, Tomorrow, and weekday labels', () => {
    assert.strictEqual(getKaronDayTitle(0, '2026-11-11'), 'Today · Wednesday, Nov 11');
    assert.strictEqual(getKaronDayTitle(1, '2026-11-12'), 'Tomorrow · Thursday, Nov 12');
    assert.strictEqual(getKaronDayTitle(2, '2026-11-13'), 'Friday, November 13');
});

test('formatKaronQuickTaskContent normalizes checklist prefix and preserves explicit dates', () => {
    assert.strictEqual(formatKaronQuickTaskContent('   ', '2026-11-11'), '');
    assert.strictEqual(
        formatKaronQuickTaskContent('Review PR #work', '2026-11-11'),
        '- [ ] Review PR #work [[2026-11-11]]'
    );
    assert.strictEqual(
        formatKaronQuickTaskContent('- Buy milk', '2026-11-11'),
        '- [ ] Buy milk [[2026-11-11]]'
    );
    assert.strictEqual(
        formatKaronQuickTaskContent('- [ ] Call dentist [[2026-11-20]]', '2026-11-11'),
        '- [ ] Call dentist [[2026-11-20]]'
    );
    assert.strictEqual(
        formatKaronQuickTaskContent('Pay rent 📅 2026-11-15', '2026-11-11'),
        '- [ ] Pay rent 📅 2026-11-15'
    );
});

test('formatKaronQuickCaptureContent supports note mode without checklist prefix', () => {
    assert.strictEqual(
        formatKaronQuickCaptureContent('Prep agenda for [[Project Alpha]] #work', 'note', '2026-11-11'),
        'Prep agenda for [[Project Alpha]] #work [[2026-11-11]]'
    );
    assert.strictEqual(
        formatKaronQuickCaptureContent('Line one\nLine two', 'note', '2026-11-11'),
        'Line one\nLine two\n[[2026-11-11]]'
    );
    assert.strictEqual(
        formatKaronQuickCaptureContent('Meeting notes [[2026-11-20]]', 'note', '2026-11-11'),
        'Meeting notes [[2026-11-20]]'
    );
});

test('IndexService.extractVaultNoteSnippetsForDate falls back to body/title when scheduled via frontmatter', () => {
    const bodyWithTasksAndNote = `# Project Alpha

- [ ] Finish spec

Discussed architecture with team.`;

    const snippets = IndexService.extractVaultNoteSnippetsForDate(
        bodyWithTasksAndNote,
        '2026-11-11',
        true,
        'Project Alpha'
    );
    assert.deepStrictEqual(snippets, ['Discussed architecture with team.']);

    const emptyNoteSnippets = IndexService.extractVaultNoteSnippetsForDate(
        '',
        '2026-11-11',
        true,
        'Blank Scheduled Note'
    );
    assert.deepStrictEqual(emptyNoteSnippets, ['Blank Scheduled Note']);

    const unmatchedBodySnippets = IndexService.extractVaultNoteSnippetsForDate(
        'Unrelated paragraph',
        '2026-11-11',
        false,
        'Other Note'
    );
    assert.deepStrictEqual(unmatchedBodySnippets, []);
});

test('parseStandaloneWikilinkSchedule parses standalone note links and rejects prose/date links', () => {
    assert.deepStrictEqual(
        parseStandaloneWikilinkSchedule('[[Project Alpha]]'),
        { linkTarget: 'Project Alpha' }
    );
    assert.deepStrictEqual(
        parseStandaloneWikilinkSchedule('  [[Project Alpha|Alpha]] [[2026-11-15]]  '),
        { linkTarget: 'Project Alpha', explicitDate: '2026-11-15' }
    );
    assert.strictEqual(parseStandaloneWikilinkSchedule('Prep for [[Project Alpha]]'), null);
    assert.strictEqual(parseStandaloneWikilinkSchedule('[[2026-11-15]]'), null);
    assert.strictEqual(parseStandaloneWikilinkSchedule('   '), null);
});

test('slugifyMocTopicTag transforms labels into clean moc/<slug> format', () => {
    assert.strictEqual(slugifyMocTopicTag('Work Projects'), 'moc/work-projects');
    assert.strictEqual(slugifyMocTopicTag('Personal & Health'), 'moc/personal-health');
    assert.strictEqual(slugifyMocTopicTag('moc/research'), 'moc/research');
    assert.strictEqual(slugifyMocTopicTag('#moc/finance'), 'moc/finance');
    assert.strictEqual(slugifyMocTopicTag('   Deep Work 2026!  '), 'moc/deep-work-2026');
    assert.strictEqual(slugifyMocTopicTag(''), 'moc/topic');
});

test('normalizeTagComparison strips leading hashes and lowercases', () => {
    assert.strictEqual(normalizeTagComparison('#MOC/work'), 'moc/work');
    assert.strictEqual(normalizeTagComparison('moc/work'), 'moc/work');
    assert.strictEqual(normalizeTagComparison('  #Personal  '), 'personal');
});

test('hasMocTopicTag accurately matches exact tags and hierarchical subtags', () => {
    // Exact match with different case and # prefixes
    assert.strictEqual(hasMocTopicTag(['moc/work', 'other'], 'moc/work'), true);
    assert.strictEqual(hasMocTopicTag(['#MOC/Work'], 'moc/work'), true);
    assert.strictEqual(hasMocTopicTag(['#moc/work'], '#MOC/WORK'), true);

    // Hierarchical subtag match (e.g., moc/work/client matches moc/work)
    assert.strictEqual(hasMocTopicTag(['#moc/work/acme'], 'moc/work'), true);

    // Should NOT match partial word prefixes
    assert.strictEqual(hasMocTopicTag(['#moc/workout'], 'moc/work'), false);

    // Empty or non-matching
    assert.strictEqual(hasMocTopicTag([], 'moc/work'), false);
    assert.strictEqual(hasMocTopicTag(['project', 'finance'], 'moc/work'), false);
});


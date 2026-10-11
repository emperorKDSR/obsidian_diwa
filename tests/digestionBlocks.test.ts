import test from 'node:test';
import assert from 'node:assert';
import { CaptureService } from '../src/services/CaptureService';
import { IndexService } from '../src/services/IndexService';
import { DEFAULT_SETTINGS } from '../src/constants';

test('parseDigestibleBlocks treats one note as one block with intact content and targets', () => {
    const service = new CaptureService({} as any, { ...DEFAULT_SETTINGS });
    const content = `---
created: 2026-10-11T12:00:00
---

- [ ] Prepare pitch deck -> [[Product Launch]]
    - [ ] Add market analysis
    - remark: verify numbers

Reflect on quarterly revenue [[Strategy 2026]]
`;

    const blocks = service.parseDigestibleBlocks(content, '000 Bin/Diwa/2026/10/note.md', Date.now());

    // 1 note = 1 block
    assert.strictEqual(blocks.length, 1);

    // Starts with task checkbox -> isTask: true
    assert.strictEqual(blocks[0].isTask, true);
    assert.strictEqual(blocks[0].primaryTarget, 'Product Launch');
    assert.strictEqual(blocks[0].actionRoute, 'target_tasks');
    assert.ok(blocks[0].alternativeTargets.includes('Strategy 2026'));
    assert.ok(blocks[0].cleanText.includes('- [ ] Prepare pitch deck'));
    assert.ok(blocks[0].cleanText.includes('Add market analysis'));
    assert.ok(blocks[0].cleanText.includes('Reflect on quarterly revenue'));

    // Non-task note test
    const noteContent = `Meeting with design team\n\nReviewed wireframes and agreed on muted palette -> [[Design System]]`;
    const noteBlocks = service.parseDigestibleBlocks(noteContent, '000 Bin/Diwa/2026/10/note2.md', Date.now());
    assert.strictEqual(noteBlocks.length, 1);
    assert.strictEqual(noteBlocks[0].isTask, false);
    assert.strictEqual(noteBlocks[0].primaryTarget, 'Design System');
    assert.strictEqual(noteBlocks[0].actionRoute, 'target_log');
});

test('wrapBlockAsDigested wraps content non-destructively in Markdown comments', () => {
    const service = new CaptureService({} as any, { ...DEFAULT_SETTINGS });
    const initialContent = `# Note\n\n- [ ] Task to digest\n\nSome reflection.\n`;

    const mockBlock = {
        sourceFilePath: 'note.md',
        sourceCreatedMs: Date.now(),
        blockIndex: 1,
        deterministicId: 'dw-test-b1',
        rawContent: '- [ ] Task to digest',
        cleanText: '- [ ] Task to digest',
        isTask: true,
        isCompletedTask: false,
        dueDate: null,
        primaryTarget: 'Project X',
        alternativeTargets: [],
        actionRoute: 'target_tasks' as const,
        area: null
    };

    const wrapped = service.wrapBlockAsDigested(initialContent, mockBlock);
    assert.ok(wrapped.includes('%%\ndiwa-digested:dest=[[Project X]]\n- [ ] Task to digest\n%%'));
    assert.ok(wrapped.includes('Some reflection.'));

    // Unwrapping restores the original markdown
    const unwrapped = service.unwrapDigestedComments(wrapped);
    assert.ok(unwrapped.includes('- [ ] Task to digest'));
    assert.ok(!unwrapped.includes('diwa-digested:'));
});

test('IndexService.stripDigestMetadata strips digest timestamps and anchors while preserving body dates', () => {
    const service = new IndexService({} as any, { ...DEFAULT_SETTINGS });

    // Normal non-digest text remains unchanged
    assert.strictEqual(service.stripDigestMetadata('Some normal reflection [[2026-10-12]]'), 'Some normal reflection [[2026-10-12]]');

    // Digest timestamp header stripped, intentional body date preserved
    const digestParagraph = `#### [[2026-10-11]] 19:30\nClient kickoff meeting [[2026-10-12]]\n^dw-a1b2c3-b1`;
    const clean = service.stripDigestMetadata(digestParagraph);
    assert.strictEqual(clean, 'Client kickoff meeting [[2026-10-12]]');
    assert.ok(!clean.includes('2026-10-11'));
    assert.ok(clean.includes('2026-10-12'));

    // Pure digest entry with no body date produces clean body without timestamp
    const pureDigest = `#### [[2026-10-11]] 14:00\nGeneral reflection on sprint\n^dw-abcdef-b1`;
    const cleanPure = service.stripDigestMetadata(pureDigest);
    assert.strictEqual(cleanPure, 'General reflection on sprint');
    assert.ok(!cleanPure.includes('2026-10-11'));
});

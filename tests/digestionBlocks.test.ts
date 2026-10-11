import test from 'node:test';
import assert from 'node:assert';
import { CaptureService } from '../src/services/CaptureService';
import { DEFAULT_SETTINGS } from '../src/constants';

test('parseDigestibleBlocks separates tasks, subtasks, paragraphs, and explicit targets', () => {
    const service = new CaptureService({} as any, { ...DEFAULT_SETTINGS });
    const content = `---
created: 2026-10-11T12:00:00
---

- [ ] Prepare pitch deck -> [[Product Launch]]
    - [ ] Add market analysis
    - remark: verify numbers

Reflect on quarterly revenue -> [[Strategy 2026]]

- [ ] Independent inbox task
`;

    const blocks = service.parseDigestibleBlocks(content, '000 Bin/Diwa/2026/10/note.md', Date.now());

    assert.strictEqual(blocks.length, 3);

    // Block 1: Parent task with child subtasks and target
    assert.strictEqual(blocks[0].isTask, true);
    assert.strictEqual(blocks[0].primaryTarget, 'Product Launch');
    assert.strictEqual(blocks[0].actionRoute, 'target_tasks');
    assert.ok(blocks[0].cleanText.includes('- [ ] Prepare pitch deck'));
    assert.ok(blocks[0].cleanText.includes('Add market analysis'));

    // Block 2: Thought routed to Strategy 2026
    assert.strictEqual(blocks[1].isTask, false);
    assert.strictEqual(blocks[1].primaryTarget, 'Strategy 2026');
    assert.strictEqual(blocks[1].actionRoute, 'target_log');

    // Block 3: Untargeted task -> Gawa Inbox
    assert.strictEqual(blocks[2].isTask, true);
    assert.strictEqual(blocks[2].primaryTarget, null);
    assert.strictEqual(blocks[2].actionRoute, 'gawa_inbox');
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

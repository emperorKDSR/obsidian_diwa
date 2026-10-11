import test from 'node:test';
import assert from 'node:assert';
import { IndexService } from '../src/services/IndexService';

test('parseFrontmatterFallback parses valid YAML frontmatter blocks', () => {
    const content = `---
created: 2026-10-11T12:00:00
area: work
important: true
tags:
  - alpha
  - beta
---

# Title
Body text
`;

    const fm = IndexService.parseFrontmatterFallback(content);
    assert.ok(fm !== null);
    assert.strictEqual(fm.created, '2026-10-11T12:00:00');
    assert.strictEqual(fm.area, 'work');
    assert.strictEqual(fm.important, true);
    assert.deepStrictEqual(fm.tags, ['alpha', 'beta']);
});

test('parseFrontmatterFallback does not misparse Obsidian wikilinks [[...]] as YAML arrays', () => {
    const content = `---
created: 2026-10-11T12:00:00
due: [[2026-10-15]]
related: [[Some Note]]
---
Note body
`;

    const fm = IndexService.parseFrontmatterFallback(content);
    assert.ok(fm !== null);
    assert.strictEqual(fm.due, '2026-10-15');
    assert.strictEqual(fm.related, 'Some Note');
});

test('parseFrontmatterFallback returns null when no frontmatter block exists', () => {
    const content = `# Regular Markdown
Without any frontmatter header
`;
    assert.strictEqual(IndexService.parseFrontmatterFallback(content), null);
});

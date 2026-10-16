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

test('extractPendingBillFromMetadata extracts bill/pending notes with due_date property', () => {
    const content = `---
tags:
  - bill/pending
due_date: 2026-10-18
amount: "$120.50"
---
Electricity bill
`;
    const fm = IndexService.parseFrontmatterFallback(content);
    const bill = IndexService.extractPendingBillFromMetadata('Bills/Electricity.md', 'Electricity', fm);
    assert.ok(bill !== null);
    assert.strictEqual(bill.filePath, 'Bills/Electricity.md');
    assert.strictEqual(bill.noteTitle, 'Electricity');
    assert.strictEqual(bill.dueDate, '2026-10-18');
    assert.strictEqual(bill.amount, '$120.50');
});

test('extractPendingBillFromMetadata supports wikilink due_date and inline #bill/pending tag', () => {
    const content = `---
due_date: [[2026-10-15]]
---
Water bill #bill/pending
`;
    const fm = IndexService.parseFrontmatterFallback(content);
    const bill = IndexService.extractPendingBillFromMetadata('Bills/Water.md', 'Water', fm, ['#bill/pending']);
    assert.ok(bill !== null);
    assert.strictEqual(bill.dueDate, '2026-10-15');
    assert.strictEqual(bill.amount, undefined);

    // Non-pending bill (e.g., bill/paid) returns null
    const paidBill = IndexService.extractPendingBillFromMetadata('Bills/Water.md', 'Water', { tags: ['bill/paid'], due_date: '2026-10-15' });
    assert.strictEqual(paidBill, null);
});


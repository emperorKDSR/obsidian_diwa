import test from 'node:test';
import assert from 'node:assert';
import { IndexService } from '../src/services/IndexService';

test('normalizeTaskSignature produces identical canonical signatures across variants', () => {
    // 1. Basic title
    const sig1 = IndexService.normalizeTaskSignature('Review architecture proposal');

    // 2. With tags
    const sig2 = IndexService.normalizeTaskSignature('Review architecture proposal #work #urgent');

    // 3. With block ID
    const sig3 = IndexService.normalizeTaskSignature('Review architecture proposal ^dw-abc123-b1');

    // 4. With wikilinks
    const sig4 = IndexService.normalizeTaskSignature('Review [[architecture]] proposal');

    // 5. With markdown bold/italic
    const sig5 = IndexService.normalizeTaskSignature('**Review** *architecture* proposal');

    assert.strictEqual(sig1, 'review architecture proposal');
    assert.strictEqual(sig2, 'review architecture proposal');
    assert.strictEqual(sig3, 'review architecture proposal');
    assert.strictEqual(sig4, 'review architecture proposal');
    assert.strictEqual(sig5, 'review architecture proposal');
});

test('normalizeContext handles string scalars, arrays, tags, and cleans hashes', () => {
    assert.deepStrictEqual(IndexService.normalizeContext('#work, #health'), ['work', 'health']);
    assert.deepStrictEqual(IndexService.normalizeContext(['#personal', 'finance']), ['personal', 'finance']);
    assert.deepStrictEqual(IndexService.normalizeContext('singletag'), ['singletag']);
    assert.deepStrictEqual(IndexService.normalizeContext(null), []);
    assert.deepStrictEqual(IndexService.normalizeContext(undefined), []);
});

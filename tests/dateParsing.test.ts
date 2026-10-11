import test from 'node:test';
import assert from 'node:assert';
import { parseDateToIso, formatDateForDisplay } from '../src/utils/dateParsing';
import { parseNaturalDate } from '../src/utils';

test('parseDateToIso correctly parses standard ISO and localized date formats', () => {
    assert.strictEqual(parseDateToIso('2026-10-11'), '2026-10-11');
    assert.strictEqual(parseDateToIso('2026-01-05'), '2026-01-05');
    assert.strictEqual(parseDateToIso(''), null);
    assert.strictEqual(parseDateToIso('invalid-date-string'), null);

    // Natural dates via chrono-node
    const augustDate = parseDateToIso('August 15, 2026');
    assert.strictEqual(augustDate, '2026-08-15');
});

test('formatDateForDisplay produces readable strings', () => {
    assert.strictEqual(formatDateForDisplay('2026-10-11'), 'October 11, 2026');
    assert.strictEqual(formatDateForDisplay('2026-01-01'), 'January 1, 2026');
    assert.strictEqual(formatDateForDisplay(''), '');
});

test('parseNaturalDate extracts relative dates from text', () => {
    const todayParsed = parseNaturalDate('today');
    assert.ok(todayParsed !== null && /^\d{4}-\d{2}-\d{2}$/.test(todayParsed));

    const tomorrowParsed = parseNaturalDate('tomorrow');
    assert.ok(tomorrowParsed !== null && /^\d{4}-\d{2}-\d{2}$/.test(tomorrowParsed));
});

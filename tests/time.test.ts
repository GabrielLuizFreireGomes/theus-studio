import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, addMonth, dayAt, overlaps, studioDay } from '../lib/time';

test('uses the São Paulo date near UTC midnight', () => {
  assert.equal(studioDay(new Date('2026-11-17T01:00:00Z')), '2026-11-16');
  assert.equal(dayAt('2026-11-16', 9 * 60).toISOString(), '2026-11-16T12:00:00.000Z');
});

test('handles month ends and leap years', () => {
  assert.equal(addMonth('2027-01-31'), '2027-02-28');
  assert.equal(addMonth('2028-01-31'), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('allows adjacent appointments and rejects partial overlap', () => {
  assert.equal(overlaps(540, 575, 555, 585), true);
  assert.equal(overlaps(540, 575, 575, 605), false);
});

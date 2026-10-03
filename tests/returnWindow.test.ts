import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETURN_WINDOW_DAYS,
  returnWindowEnd,
  isWithinReturnWindow,
  returnRequestTiming,
} from '../src/lib/returnWindow.ts';

const DAY = 86_400_000;
const delivered = new Date('2026-10-01T10:00:00Z');
const at = (ms: number) => new Date(delivered.getTime() + ms);

test('the return window is 7 days, the same as firestore.rules', () => {
  assert.equal(RETURN_WINDOW_DAYS, 7);
});

test('a return can be requested until 7 days after delivery', () => {
  assert.equal(isWithinReturnWindow(delivered, at(0)), true);
  assert.equal(isWithinReturnWindow(delivered, at(7 * DAY - 1000)), true);
});

test('the window closes at exactly 7 days, like the rule (request.time < deliveredAt + 7d)', () => {
  assert.equal(isWithinReturnWindow(delivered, at(7 * DAY)), false);
  assert.equal(isWithinReturnWindow(delivered, at(30 * DAY)), false);
});

test('a missing or unreadable delivery time closes the window, as the rules do', () => {
  for (const value of [null, undefined, '', 'not a date', {}, Number.NaN]) {
    assert.equal(isWithinReturnWindow(value, at(0)), false, String(value));
    assert.equal(returnWindowEnd(value), null, String(value));
  }
});

test('reads Firestore Timestamps, {seconds} objects, Dates, ISO strings and epoch millis', () => {
  const end = delivered.getTime() + 7 * DAY;
  const forms: unknown[] = [
    delivered,
    { toDate: () => delivered },
    { seconds: delivered.getTime() / 1000, nanoseconds: 0 },
    delivered.toISOString(),
    delivered.getTime(),
  ];
  for (const form of forms) assert.equal(returnWindowEnd(form)?.getTime(), end, JSON.stringify(form));
});

test('returnRequestTiming tells the shop whether a request came in time', () => {
  assert.equal(returnRequestTiming(delivered, at(2 * DAY)), 'in-window');
  assert.equal(returnRequestTiming(delivered, at(9 * DAY)), 'late');
  assert.equal(returnRequestTiming(null, at(2 * DAY)), 'unknown');
  assert.equal(returnRequestTiming(delivered, undefined), 'unknown');
});

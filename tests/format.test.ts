import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatINR, formatDate, formatDateTime, plural } from '../src/lib/format.ts';

test('formatINR groups in the Indian style with no decimals for whole rupees', () => {
  assert.equal(formatINR(1499), '₹1,499');
  assert.equal(formatINR(100000), '₹1,00,000');
  assert.equal(formatINR(0), '₹0');
});

test('formatINR keeps paise when there are any', () => {
  assert.equal(formatINR(1499.5), '₹1,499.50');
  assert.equal(formatINR(12.25), '₹12.25');
});

test('formatINR treats missing or bad input as zero instead of printing NaN', () => {
  assert.equal(formatINR(undefined), '₹0');
  assert.equal(formatINR(null), '₹0');
  assert.equal(formatINR(Number.NaN), '₹0');
});

test('formatDate prints day, short month and year', () => {
  assert.equal(formatDate(new Date(2026, 9, 3, 20, 1)), '3 Oct 2026');
});

test('formatDate accepts Firestore-like timestamps, millis and ISO strings', () => {
  const d = new Date(2026, 9, 3, 20, 1);
  assert.equal(formatDate({ toDate: () => d }), '3 Oct 2026');
  assert.equal(formatDate({ seconds: Math.floor(d.getTime() / 1000) }), '3 Oct 2026');
  assert.equal(formatDate(d.getTime()), '3 Oct 2026');
  assert.equal(formatDate(d.toISOString()), '3 Oct 2026');
});

test('formatDate returns an empty string for a missing date', () => {
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('not a date'), '');
});

test('formatDateTime adds a 12-hour time in lower case', () => {
  assert.equal(formatDateTime(new Date(2026, 9, 3, 20, 1)), '3 Oct 2026, 8:01 pm');
  assert.equal(formatDateTime(new Date(2026, 9, 3, 9, 5)), '3 Oct 2026, 9:05 am');
});

test('plural picks the singular only for exactly one', () => {
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'item'), '3 items');
  assert.equal(plural(0, 'item'), '0 items');
  assert.equal(plural(2, 'box', 'boxes'), '2 boxes');
  assert.equal(plural(1200, 'point'), '1,200 points');
});

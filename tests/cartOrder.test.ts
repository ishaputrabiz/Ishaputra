import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortCartLines } from '../src/lib/cartOrder.ts';

test('orders cart lines by when they were added', () => {
  const lines = [
    { id: 'a', addedAt: 300 },
    { id: 'b', addedAt: 100 },
    { id: 'c', addedAt: 200 },
  ];
  assert.deepEqual(sortCartLines(lines).map((l) => l.id), ['b', 'c', 'a']);
});

test('older lines without addedAt come first, in their existing order', () => {
  const lines = [
    { id: 'new', addedAt: 50 },
    { id: 'old1' },
    { id: 'old2' },
  ];
  assert.deepEqual(sortCartLines(lines).map((l) => l.id), ['old1', 'old2', 'new']);
});

test('does not mutate its input', () => {
  const lines = [{ id: 'a', addedAt: 2 }, { id: 'b', addedAt: 1 }];
  sortCartLines(lines);
  assert.deepEqual(lines.map((l) => l.id), ['a', 'b']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The rewards-core block of a file, line endings normalised. */
const block = (path: string) => {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf('// >>> rewards-core');
  const end = text.indexOf('// <<< rewards-core');
  assert.ok(start >= 0 && end > start, `${path} has no rewards-core block`);
  return text.slice(start, end);
};

test('api copies of rewards-core match src/lib/rewards.ts', () => {
  const source = block('src/lib/rewards.ts');
  for (const copy of ['api/create-order.ts', 'api/notify-order.ts']) {
    assert.equal(block(copy), source, `${copy} has drifted from src/lib/rewards.ts`);
  }
});

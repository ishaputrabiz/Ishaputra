import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A marked block (`// >>> name` … `// <<< name`) of a file, line endings normalised. */
const marked = (path: string, name: string) => {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf(`// >>> ${name}`);
  const end = text.indexOf(`// <<< ${name}`);
  assert.ok(start >= 0 && end > start, `${path} has no ${name} block`);
  return text.slice(start, end);
};

test('api copies of rewards-core match src/lib/rewards.ts', () => {
  const source = marked('src/lib/rewards.ts', 'rewards-core');
  for (const copy of ['api/create-order.ts', 'api/notify-order.ts']) {
    assert.equal(marked(copy, 'rewards-core'), source, `${copy} has drifted from src/lib/rewards.ts`);
  }
});

test('api copy of scratch-core matches src/lib/scratchWin.ts', () => {
  assert.equal(
    marked('api/notify-order.ts', 'scratch-core'),
    marked('src/lib/scratchWin.ts', 'scratch-core'),
    'api/notify-order.ts has drifted from src/lib/scratchWin.ts',
  );
});

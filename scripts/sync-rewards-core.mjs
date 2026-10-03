// node scripts/sync-rewards-core.mjs
// Copies the rewards-core block of src/lib/rewards.ts into the api/ functions
// that carry their own copy (api/ files import nothing from src/).
// tests/rewards-parity.test.ts fails until this has been run after an edit.
import { readFileSync, writeFileSync } from 'node:fs';

const START = '// >>> rewards-core';
const END = '// <<< rewards-core';
const COPIES = ['api/create-order.ts', 'api/notify-order.ts'];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const block = (text, path) => {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${path} has no rewards-core block`);
  return { start, end: end + END.length };
};

const source = read('src/lib/rewards.ts').replace(/\r\n/g, '\n');
const s = block(source, 'src/lib/rewards.ts');
const core = source.slice(s.start, s.end);

for (const path of COPIES) {
  const raw = read(path);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.replace(/\r\n/g, '\n');
  const b = block(text, path);
  const next = text.slice(0, b.start) + core + text.slice(b.end);
  if (next === text) {
    console.log(`${path}: already in sync`);
    continue;
  }
  writeFileSync(new URL(`../${path}`, import.meta.url), next.replace(/\n/g, eol));
  console.log(`${path}: updated`);
}

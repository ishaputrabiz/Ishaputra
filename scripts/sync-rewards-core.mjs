// node scripts/sync-rewards-core.mjs   (npm run sync:rewards)
// Copies the shared marked blocks of src/lib/ into the api/ functions that
// carry their own copy (api/ files import nothing from src/):
//   rewards-core  src/lib/rewards.ts    -> api/create-order.ts, api/notify-order.ts
//   scratch-core  src/lib/scratchWin.ts -> api/notify-order.ts
// tests/rewards-parity.test.ts fails until this has been run after an edit.
import { readFileSync, writeFileSync } from 'node:fs';

const BLOCKS = [
  { name: 'rewards-core', source: 'src/lib/rewards.ts', copies: ['api/create-order.ts', 'api/notify-order.ts'] },
  { name: 'scratch-core', source: 'src/lib/scratchWin.ts', copies: ['api/notify-order.ts'] },
];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

for (const { name, source, copies } of BLOCKS) {
  const START = `// >>> ${name}`;
  const END = `// <<< ${name}`;
  const block = (text, path) => {
    const start = text.indexOf(START);
    const end = text.indexOf(END);
    if (start < 0 || end < start) throw new Error(`${path} has no ${name} block`);
    return { start, end: end + END.length };
  };

  const src = read(source).replace(/\r\n/g, '\n');
  const s = block(src, source);
  const core = src.slice(s.start, s.end);

  for (const path of copies) {
    const raw = read(path);
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const text = raw.replace(/\r\n/g, '\n');
    const b = block(text, path);
    const next = text.slice(0, b.start) + core + text.slice(b.end);
    if (next === text) {
      console.log(`${path} (${name}): already in sync`);
      continue;
    }
    writeFileSync(new URL(`../${path}`, import.meta.url), next.replace(/\n/g, eol));
    console.log(`${path} (${name}): updated`);
  }
}

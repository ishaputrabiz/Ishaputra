/* eslint-disable */
// One-shot script to add `dark:` variants to common light-mode-only Tailwind
// utility classes across user-facing page files. Idempotent: never touches a
// className that already contains the equivalent dark variant.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Files to skip (admin / already audited)
const SKIP = new Set([
  'AdminBanners.tsx',
  'AdminOrders.tsx',
]); 

const TARGETS = ['src/pages', 'src/components'];
const list = TARGETS.flatMap((dir) =>
  execSync(`git ls-files ${dir}`, { encoding: 'utf8' })
    .split('\n')
    .filter((p) => p.endsWith('.tsx') && !p.includes('/admin/'))
    .filter((p) => !SKIP.has(p.split('/').pop()))
);
 
const PAIRS = [
  ['bg-white/95', 'dark:bg-zinc-900/95'],
  ['bg-white/90', 'dark:bg-zinc-900/90'],
  ['bg-white/88', 'dark:bg-zinc-900/88'],
  ['bg-white/85', 'dark:bg-zinc-900/85'],
  ['bg-white/80', 'dark:bg-zinc-900/80'],
  ['bg-white', 'dark:bg-zinc-900'],
  ['bg-gray-50', 'dark:bg-zinc-900'],
  ['bg-gray-100', 'dark:bg-zinc-800'],
  ['bg-gray-200', 'dark:bg-zinc-800'],
  ['border-gray-100', 'dark:border-zinc-800'],
  ['border-gray-200', 'dark:border-zinc-800'],
  ['border-gray-300', 'dark:border-zinc-700'],
  ['text-gray-900', 'dark:text-zinc-100'],
  ['text-gray-800', 'dark:text-zinc-200'],
  ['text-gray-700', 'dark:text-zinc-300'],
  ['text-gray-600', 'dark:text-zinc-400'],
  ['text-gray-500', 'dark:text-zinc-500'],
  ['text-gray-400', 'dark:text-zinc-500'],
  ['hover:bg-gray-50', 'dark:hover:bg-zinc-800'],
  ['hover:bg-gray-100', 'dark:hover:bg-zinc-800'],
  ['divide-gray-200', 'dark:divide-zinc-800'],
  ['placeholder-gray-400', 'dark:placeholder-zinc-500'],
  ['placeholder:text-gray-500', 'dark:placeholder:text-zinc-500'],
  ['placeholder:text-gray-400', 'dark:placeholder:text-zinc-500'],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const transformClassValue = (value) => {
  // Skip if no light-mode tokens present
  let out = value;
  for (const [light, dark] of PAIRS) {
    // Only add dark variant if light token exists AND dark token absent
    const lightRe = new RegExp(`(?<![\\w/-])${escapeRe(light)}(?![\\w/-])`);
    if (lightRe.test(out) && !out.includes(dark)) {
      // Insert dark variant right after the FIRST occurrence of light token
      out = out.replace(lightRe, `${light} ${dark}`);
    }
  }
  return out;
};

let totalChanged = 0;
const changedFiles = [];

for (const rel of list) {
  const abs = join(process.cwd(), rel);
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  // Match className="..." (single line) and className={`...`}
  let modified = src;
  // Quoted className
  modified = modified.replace(/className="([^"]+)"/g, (_m, val) => {
    const next = transformClassValue(val);
    return `className="${next}"`;
  });
  // Backtick className (ignore expressions inside ${} - simple heuristic)
  modified = modified.replace(/className=\{`([^`$]+)`\}/g, (_m, val) => {
    const next = transformClassValue(val);
    return 'className={`' + next + '`}';
  });

  if (modified !== src) {
    writeFileSync(abs, modified, 'utf8');
    totalChanged++;
    changedFiles.push(rel);
  }
}

console.log(`Updated ${totalChanged} files`);
for (const f of changedFiles) console.log('  ' + f);

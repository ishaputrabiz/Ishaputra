// Every template src/services/whatsappService.ts sends must match what
// scripts/whatsapp-meta-setup.mjs submits to Meta: same name, same number of
// body variables, a URL button only when the code sends a urlSuffix, and the
// name allowed by api/whatsapp-send.ts. Meta refuses a send that doesn't match.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] || '.');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8').replace(/\r\n/g, '\n');
const setup = read('scripts/whatsapp-meta-setup.mjs');
const service = read('src/services/whatsappService.ts');
const sendApi = read('api/whatsapp-send.ts');

let passed = 0;
const t = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (e) {
    console.log('  FAIL', name, '\n', e.message);
    process.exitCode = 1;
  }
};

// Split on commas that are not inside (), [], {} or quotes.
const topLevelItems = (src) => {
  const out = [];
  let depth = 0, quote = '', cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) { cur += c; if (c === '\\') { cur += src[++i]; } else if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

// Templates submitted to Meta: name -> { vars, button }
const defs = new Map();
const defRe = /T\('([a-z_]+)', '[A-Z]+', \[([\s\S]*?)(?=\n  T\(|\n  \/\/|\n\];)/g;
for (const m of setup.matchAll(defRe)) {
  const bodyText = (m[2].match(/body\('([^']*)'/) || [])[1] || '';
  const vars = new Set(bodyText.match(/\{\{\d+\}\}/g) || []).size;
  defs.set(m[1], { vars, button: /urlBtn\(/.test(m[2]) });
}

// Templates the client code sends: { name, params, urlSuffix }
const calls = [];
const callRe = /sendOrderTemplate\(\{([\s\S]*?)\}\)\.catch/g;
for (const m of service.matchAll(callRe)) {
  const name = (m[1].match(/template: '([a-z_]+)'/) || [])[1];
  const params = (m[1].match(/params: \[([\s\S]*?)\],\n/) || [])[1];
  calls.push({ name, params: params === undefined ? null : topLevelItems(params).length, urlSuffix: /urlSuffix:/.test(m[1]) });
}

t('found the template definitions and the code calls', () => {
  assert.ok(defs.size >= 15, `only ${defs.size} definitions parsed`);
  assert.ok(calls.length >= 15, `only ${calls.length} calls parsed`);
});

for (const c of calls) {
  t(`${c.name}: defined, same variables, same button, allowed by the API`, () => {
    const d = defs.get(c.name);
    assert.ok(d, `${c.name} is sent but not defined in whatsapp-meta-setup.mjs`);
    assert.equal(c.params, d.vars, `${c.name}: code sends ${c.params} params, template has ${d.vars}`);
    assert.equal(c.urlSuffix, d.button, `${c.name}: code ${c.urlSuffix ? 'sends' : 'omits'} a button param, template ${d.button ? 'has' : 'has no'} URL button`);
    assert.ok(sendApi.includes(`'${c.name}'`), `${c.name} is not in api/whatsapp-send.ts ORDER_TEMPLATES`);
  });
}

t('admin_low_stock_alert is retired (Meta made it MARKETING)', () => {
  assert.ok(!/admin_low_stock_alert'/.test(service + sendApi), 'old name still used');
  assert.ok(defs.has('admin_stock_update'));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

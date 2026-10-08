// Server tests for the WhatsApp additions in api/whatsapp-reply.ts and the
// picture header in api/broadcast.ts. Real source, fake Firestore + fake Meta.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || '.');
const { build } = createRequire(repo + '/package.json')('esbuild');
const out = path.join(here, 'out');
const alias = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^firebase-admin$/ }, () => ({ path: pathToFileURL(path.join(here, 'fake-firebase-admin.mjs')).href, external: true }));
  },
};
for (const [entry, name] of [['api/whatsapp-reply.ts', 'reply2.mjs'], ['api/broadcast.ts', 'broadcast2.mjs']]) {
  await build({ entryPoints: [path.join(repo, entry)], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, name), plugins: [alias], external: ['@vercel/node'], logLevel: 'error' });
}
const rp = await import(pathToFileURL(path.join(out, 'reply2.mjs')).href);
const bc = await import(pathToFileURL(path.join(out, 'broadcast2.mjs')).href);
const fake = await import(pathToFileURL(path.join(here, 'fake-firebase-admin.mjs')).href);

let passed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (e) {
    console.log('  FAIL', name, '\n', e);
    process.exitCode = 1;
  }
};

process.env.R2_PUBLIC_URL = 'https://images.example.com';
process.env.WHATSAPP_TOKEN = 'tok';
process.env.WHATSAPP_PHONE_ID = 'PID';
process.env.WHATSAPP_WABA_ID = 'WABA';
delete process.env.WHATSAPP_APP_ID;

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });
const call = async (body) => {
  let status = 0;
  let payload = null;
  const headers = {};
  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    send(p) { payload = p; return this; },
    end() { return this; },
  };
  await rp.default({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, body }, res);
  return { status, payload, headers };
};
const seed = () => {
  const s = fake.store;
  s.clear();
  s.set('users/admin1', { role: 'admin' });
  // Window open: customer wrote an hour ago.
  s.set('whatsappThreads/+919876543210', {
    phone: '+919876543210',
    replyWindowClosesAt: { toMillis: () => Date.now() + 23 * 3600e3 },
  });
  s.set('whatsappThreads/+919111111111', {
    phone: '+919111111111',
    replyWindowClosesAt: { toMillis: () => Date.now() - 3600e3 },
  });
};

// ---- pure
await t('store URL guard', () => {
  assert.ok(rp.isStoreMediaUrl('https://images.example.com/media/2026/10/a.jpg'));
  assert.ok(!rp.isStoreMediaUrl('http://images.example.com/media/a.jpg'));
  assert.ok(!rp.isStoreMediaUrl('https://evil.example.net/a.jpg'));
  assert.ok(!rp.isStoreMediaUrl('https://images.example.com.evil.net/a.jpg'));
  assert.ok(!rp.isStoreMediaUrl('not a url'));
  assert.ok(!rp.isStoreMediaUrl('https://x.r2.dev/a.jpg', ''));
});
await t('media slices', () => {
  const C = 3.5 * 1024 * 1024;
  assert.deepEqual(rp.mediaSlice(1000, 0), { start: 0, end: 1000, next: null });
  assert.deepEqual(rp.mediaSlice(10 * 1024 * 1024, 0), { start: 0, end: C, next: C });
  assert.deepEqual(rp.mediaSlice(10 * 1024 * 1024, 2 * C), { start: 2 * C, end: 10 * 1024 * 1024, next: null });
  assert.equal(rp.mediaSlice(1000, 1000), null);
  assert.equal(rp.mediaSlice(1000, -1), null);
});
await t('send components with picture header', () => {
  assert.deepEqual(rp.templateSendComponents(['a'], 'https://images.example.com/x.jpg'), [
    { type: 'header', parameters: [{ type: 'image', image: { link: 'https://images.example.com/x.jpg' } }] },
    { type: 'body', parameters: [{ type: 'text', text: 'a' }] },
  ]);
  assert.deepEqual(rp.templateSendComponents([], null), []);
});
await t('validator: picture header needs a store URL; builds IMAGE header with handle', () => {
  const base = { name: 'promo_pic', language: 'en', category: 'MARKETING', body: { text: 'Hi {{1}}, new in store.', examples: ['Asha'] } };
  const bad = rp.validateTemplateInput({ ...base, header: { format: 'IMAGE', imageUrl: 'https://evil.net/a.jpg' } });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors['header.imageUrl']);
  const good = rp.validateTemplateInput({ ...base, header: { text: '', format: 'IMAGE', imageUrl: 'https://images.example.com/media/a.jpg' } });
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  const comps = rp.buildTemplateComponents(good.value, 'H123');
  assert.deepEqual(comps[0], { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['H123'] } });
  const textOnly = rp.validateTemplateInput({ ...base, header: { text: 'Hello' } });
  assert.deepEqual(rp.buildTemplateComponents(textOnly.value)[0], { type: 'HEADER', format: 'TEXT', text: 'Hello' });
});
await t('normalize keeps header format', () => {
  const m = rp.normalizeMetaTemplate({ name: 'x', language: 'en', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi' }] });
  assert.equal(m.headerFormat, 'IMAGE');
});

// ---- handlers
await t('templates-create with a picture: uploads sample to Meta, saves default picture', async () => {
  seed();
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, init });
    if (url === 'https://images.example.com/media/a.jpg') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    if (url.endsWith('/app')) return json({ id: 'APP1' });
    if (url.includes('/APP1/uploads?')) return json({ id: 'upload:SESSION?sig=1' });
    if (url.includes('/upload:SESSION')) return json({ h: 'HANDLE1' });
    if (url.includes('/WABA/message_templates')) return json({ id: 'T1', status: 'PENDING', category: 'MARKETING' });
    throw new Error('unexpected ' + url);
  };
  const r = await call({
    action: 'templates-create',
    name: 'promo_pic',
    language: 'en',
    category: 'MARKETING',
    header: { text: '', format: 'IMAGE', imageUrl: 'https://images.example.com/media/a.jpg' },
    body: { text: 'Hi {{1}}, new in store.', examples: ['Asha'] },
    paramLabels: ['Name'],
  });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  const up = calls.find((c) => c.url.includes('/upload:SESSION'));
  assert.equal(up.init.headers.Authorization, 'OAuth tok');
  assert.equal(up.init.headers.file_offset, '0');
  const create = JSON.parse(calls.find((c) => c.url.includes('/message_templates')).init.body);
  assert.deepEqual(create.components[0], { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['HANDLE1'] } });
  const doc = fake.store.get('whatsappTemplates/promo_pic');
  assert.equal(doc.headerFormat, 'IMAGE');
  assert.equal(doc.headerImageUrl, 'https://images.example.com/media/a.jpg');
});

await t('send template with picture header attaches the saved picture', async () => {
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    sent.push(JSON.parse(init.body));
    return json({ messages: [{ id: 'wamid.T' }] });
  };
  const r = await call({ action: 'send', phone: '+919111111111', template: { name: 'promo_pic', language: 'en', params: ['Asha'] } });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.deepEqual(sent[0].template.components[0], { type: 'header', parameters: [{ type: 'image', image: { link: 'https://images.example.com/media/a.jpg' } }] });
  const msg = fake.store.get('whatsappThreads/+919111111111/messages/wamid.T');
  assert.equal(msg.text, 'Hi Asha, new in store.');
});

await t('send template with picture header but none saved: clear error, nothing sent', async () => {
  fake.store.set('whatsappTemplates/promo_pic', { ...fake.store.get('whatsappTemplates/promo_pic'), headerImageUrl: null });
  let sent = 0;
  globalThis.fetch = async () => { sent += 1; return json({}); };
  const r = await call({ action: 'send', phone: '+919111111111', template: { name: 'promo_pic', language: 'en', params: ['Asha'] } });
  assert.equal(r.status, 400);
  assert.match(r.payload.error, /Set picture/);
  assert.equal(sent, 0);
});

await t('plain text send still works and records the thread', async () => {
  globalThis.fetch = async () => json({ messages: [{ id: 'wamid.X' }] });
  const r = await call({ action: 'send', phone: '+919876543210', text: 'Hello' });
  assert.equal(r.status, 200);
  assert.equal(fake.store.get('whatsappThreads/+919876543210').lastOutboundMessageId, 'wamid.X');
  assert.equal(fake.store.get('whatsappThreads/+919876543210/messages/wamid.X').text, 'Hello');
});

await t('send-media: uploads to Meta then sends a document with caption', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/PID/media')) return json({ id: 'MEDIA1' });
    return json({ messages: [{ id: 'wamid.M' }] });
  };
  const data = Buffer.from('%PDF-1.4 test').toString('base64');
  const r = await call({ action: 'send-media', phone: '+919876543210', media: { mime: 'application/pdf', filename: 'invoice.pdf', data }, caption: 'Your invoice' });
  assert.equal(r.status, 200, JSON.stringify(r.payload));
  assert.ok(calls[0].init.body instanceof FormData, 'multipart upload');
  assert.equal(calls[0].init.headers['Content-Type'], undefined, 'no JSON content type on upload');
  assert.equal(calls[0].init.body.get('type'), 'application/pdf');
  const msg = JSON.parse(calls[1].init.body);
  assert.deepEqual(msg.document, { id: 'MEDIA1', filename: 'invoice.pdf', caption: 'Your invoice' });
  const stored = fake.store.get('whatsappThreads/+919876543210/messages/wamid.M');
  assert.equal(stored.type, 'document');
  assert.equal(stored.media.id, 'MEDIA1');
  assert.equal(fake.store.get('whatsappThreads/+919876543210').lastMessage, 'Document: Your invoice');
});

await t('send-media: refused outside the 24 h window, bad type, too big', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({}); };
  const data = Buffer.from('x').toString('base64');
  let r = await call({ action: 'send-media', phone: '+919111111111', media: { mime: 'image/jpeg', filename: 'a.jpg', data } });
  assert.equal(r.status, 409);
  r = await call({ action: 'send-media', phone: '+919876543210', media: { mime: 'image/webp', filename: 'a.webp', data } });
  assert.equal(r.status, 400);
  r = await call({ action: 'send-media', phone: '+919876543210', media: { mime: 'image/jpeg', filename: 'a.jpg', data: Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64') } });
  assert.equal(r.status, 413);
  assert.equal(calls, 0);
});

await t('media: big file comes back in slices (Range honoured or not)', async () => {
  const size = 8 * 1024 * 1024;
  const file = Buffer.alloc(size, 7);
  file[size - 1] = 9;
  for (const honourRange of [true, false]) {
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes('/123456789')) return json({ url: 'https://lookaside.fbsbx.com/x', file_size: size, mime_type: 'video/mp4' });
      const range = init.headers?.Range;
      if (honourRange && range) {
        const [a, b] = range.replace('bytes=', '').split('-').map(Number);
        return new Response(file.subarray(a, b + 1), { status: 206 });
      }
      return new Response(file, { status: 200 });
    };
    const parts = [];
    let offset = 0;
    while (offset !== null) {
      const r = await call({ action: 'media', mediaId: '123456789', offset });
      assert.equal(r.status, 200, JSON.stringify(r.payload));
      parts.push(r.payload);
      offset = r.headers['x-media-next-offset'] ? Number(r.headers['x-media-next-offset']) : null;
    }
    const joined = Buffer.concat(parts);
    assert.equal(joined.length, size);
    assert.equal(joined[size - 1], 9);
    assert.equal(parts.length, 3);
  }
});

await t('media: over 25 MB refused with a clear message', async () => {
  globalThis.fetch = async () => json({ url: 'https://lookaside.fbsbx.com/x', file_size: 26 * 1024 * 1024, mime_type: 'video/mp4' });
  const r = await call({ action: 'media', mediaId: '123456789' });
  assert.equal(r.status, 413);
});

// ---- broadcast with picture header
await t('broadcast: picture template attaches picture; missing picture fails before sending', async () => {
  const s = fake.store;
  s.set('users/u1', { role: 'user', username: 'Asha', phone: '9876543210' });
  s.set('whatsappTemplates/promo_pic', { name: 'promo_pic', language: 'en', headerFormat: 'IMAGE', headerImageUrl: 'https://images.example.com/media/a.jpg', bodyText: 'Hi {{1}}' });
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return json({ messages: [{ id: 'w1' }] });
  };
  const run = async () => {
    let payload = null;
    const res = { setHeader() {}, status() { return this; }, json(p) { payload = p; return this; }, end() { return this; } };
    await bc.default({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, body: { audience: 'selected', selectedUids: ['u1'], channels: { whatsapp: true }, whatsapp: { template: 'promo_pic', language: 'en', params: ['there'] } } }, res);
    return payload;
  };
  let p = await run();
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(sent[0].template.components[0].type, 'header');
  s.set('whatsappTemplates/promo_pic', { ...s.get('whatsappTemplates/promo_pic'), headerImageUrl: null });
  sent.length = 0;
  p = await run();
  assert.equal(p.ok, false);
  assert.match(p.error, /Set picture/);
  assert.equal(sent.length, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

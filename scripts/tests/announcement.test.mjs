// Bundles the real source with esbuild (firebase-admin swapped for a fake)
// and checks the announcement path end to end.
import { createRequire } from 'node:module';
const { build } = createRequire(path.resolve(process.argv[2] || '.') + '/package.json')('esbuild');
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || '.');
const out = path.join(here, 'out');

const alias = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^firebase-admin$/ }, () => ({ path: pathToFileURL(path.join(here, 'fake-firebase-admin.mjs')).href, external: true }));
    b.onResolve({ filter: /^@\/components\/admin\/whatsapp\/templateRules$/ }, () => ({
      path: path.join(repo, 'src/components/admin/whatsapp/templateRules.ts'),
    }));
    b.onResolve({ filter: /^@\/config\/brand$/ }, () => ({
      path: path.join(repo, 'src/config/brand.ts'),
    }));
  },
};
for (const [entry, name] of [
  ['api/broadcast.ts', 'broadcast.mjs'],
  ['api/whatsapp-webhook.ts', 'webhook.mjs'],
  ['src/components/admin/marketing/announcement.ts', 'announcement.mjs'],
]) {
  await build({
    entryPoints: [path.join(repo, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: path.join(out, name),
    plugins: [alias],
    external: ['@vercel/node'],
    logLevel: 'error',
  });
}
const imp = (n) => import(pathToFileURL(path.join(out, n)).href);
const bc = await imp('broadcast.mjs');
const wh = await imp('webhook.mjs');
const an = await imp('announcement.mjs');
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

// ---- pure helpers
await t('phone: 10-digit Indian mobile gets 91', () => assert.equal(bc.normalizeWhatsAppNumber('98765 43210'), '919876543210'));
await t('phone: leading 0 replaced', () => assert.equal(bc.normalizeWhatsAppNumber('09876543210'), '919876543210'));
await t('phone: +91 kept', () => assert.equal(bc.normalizeWhatsAppNumber('+91 98765-43210'), '919876543210'));
await t('phone: 91 prefix without + kept', () => assert.equal(bc.normalizeWhatsAppNumber('919876543210'), '919876543210'));
await t('phone: foreign with + kept', () => assert.equal(bc.normalizeWhatsAppNumber('+1 415 555 0100'), '14155550100'));
await t('phone: junk rejected', () => {
  assert.equal(bc.normalizeWhatsAppNumber('12345'), null);
  assert.equal(bc.normalizeWhatsAppNumber(''), null);
  assert.equal(bc.normalizeWhatsAppNumber('5876543210'), null);
});
await t('client mirror matches server', () => {
  for (const p of ['98765 43210', '09876543210', '+91 98765-43210', '+1 415 555 0100', '12345', '', '919876543210'])
    assert.equal(an.normalizeWhatsAppNumber(p), bc.normalizeWhatsAppNumber(p), p);
});
await t('roles: user/customer/none count, admin/delivery do not', () => {
  assert.ok(bc.isCustomerRole('user') && bc.isCustomerRole('customer') && bc.isCustomerRole(undefined));
  assert.ok(!bc.isCustomerRole('admin') && !bc.isCustomerRole('delivery'));
});
await t('param: new lines and long spaces folded', () =>
  assert.equal(bc.sanitizeTemplateParam('Line one\n\nLine\ttwo     end '), 'Line one Line two end'));
await t('plan: dedupe, opt-out, missing and invalid numbers', () => {
  const { recipients, skipped } = bc.planWhatsAppRecipients(
    [
      { uid: 'a', tokens: [], phone: '9876543210', name: 'Asha K' },
      { uid: 'b', tokens: [], phone: '+919876543210' },
      { uid: 'c', tokens: [], phone: '9123456789' },
      { uid: 'd', tokens: [] },
      { uid: 'e', tokens: [], phone: '123' },
    ],
    new Set(['919123456789']),
  );
  assert.deepEqual(recipients.map((r) => r.uid), ['a']);
  assert.deepEqual(skipped, { noPhone: 1, invalidPhone: 1, optedOut: 1, duplicate: 1 });
});
await t('concurrency: never more than the limit in flight', async () => {
  let live = 0;
  let peak = 0;
  const seen = [];
  await bc.mapWithConcurrency([...Array(20).keys()], 3, async (i) => {
    live += 1;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    seen.push(i);
    live -= 1;
  });
  assert.equal(peak, 3);
  assert.equal(seen.length, 20);
});
await t('webhook consent keywords', () => {
  assert.equal(wh.marketingConsentChange('STOP'), 'out');
  assert.equal(wh.marketingConsentChange(' stop. '), 'out');
  assert.equal(wh.marketingConsentChange('Unsubscribe'), 'out');
  assert.equal(wh.marketingConsentChange('START'), 'in');
  assert.equal(wh.marketingConsentChange('please stop by the store'), null);
  assert.equal(wh.marketingConsentChange('Hi'), null);
  // The footer's own wording, and the ways people actually phrase it.
  assert.equal(wh.marketingConsentChange('Stop these updates'), 'out');
  assert.equal(wh.marketingConsentChange('STOP 🙏'), 'out');
  assert.equal(wh.marketingConsentChange('stop please'), 'out');
  assert.equal(wh.marketingConsentChange('Please stop sending messages!'), 'out');
  assert.equal(wh.marketingConsentChange('stop!!'), 'out');
  assert.equal(wh.marketingConsentChange('Unsubscribe me'), 'out');
  assert.equal(wh.marketingConsentChange('start updates'), 'in');
  // Annoyed customers repeat themselves; Hinglish and plain requests too.
  assert.equal(wh.marketingConsentChange('STOP STOP'), 'out');
  assert.equal(wh.marketingConsentChange('Stop. Unsubscribe'), 'out');
  assert.equal(wh.marketingConsentChange('please stop, stop sending'), 'out');
  assert.equal(wh.marketingConsentChange('stop karo'), 'out');
  assert.equal(wh.marketingConsentChange('band karo'), 'out');
  assert.equal(wh.marketingConsentChange('I want to unsubscribe'), 'out');
  assert.equal(wh.marketingConsentChange('remove me from your list'), 'out');
  assert.equal(wh.marketingConsentChange('stop spam'), 'out');
  assert.equal(wh.marketingConsentChange('stop start'), null, 'mixed: no change');
  assert.equal(wh.marketingConsentChange('remove the oil from my order'), null);
  // "remove" alone is usually about an order item, not announcements.
  assert.equal(wh.marketingConsentChange('please remove it'), null);
  assert.equal(wh.marketingConsentChange('I want to remove this'), null);
  assert.equal(wh.marketingConsentChange('remove from list'), 'out');
  // Not opt-outs: ordinary sentences that happen to start with the keyword.
  assert.equal(wh.marketingConsentChange('stop by the store tomorrow?'), null);
  assert.equal(wh.marketingConsentChange('Start my order please'), null);
  assert.equal(wh.marketingConsentChange('when will you stop the sale'), null);
  assert.equal(wh.marketingConsentChange(''), null);
});

// ---- announcement template
await t('template draft passes the server validator', async () => {
  const rp = await (async () => {
    await build({
      entryPoints: [path.join(repo, 'api/whatsapp-reply.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'reply.mjs'),
      plugins: [alias], external: ['@vercel/node'], logLevel: 'error',
    });
    return imp('reply.mjs');
  })();
  const res = rp.validateTemplateInput(an.announcementTemplateDraft('store_announcement'));
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.value.category, 'MARKETING');
  assert.deepEqual(rp.extractVariables(an.ANNOUNCEMENT_BODY), [1, 2]);
});
await t('template picking: newest approved wins, else newest', () => {
  const rows = [
    { id: '1', name: 'store_announcement', language: 'en', status: 'REJECTED' },
    { id: '2', name: 'store_announcement_v2', language: 'en', status: 'APPROVED' },
    { id: '3', name: 'store_announcement_v3', language: 'en', status: 'PENDING' },
    { id: '4', name: 'order_update', language: 'en', status: 'APPROVED' },
  ];
  assert.equal(an.pickAnnouncementTemplate(rows).name, 'store_announcement_v2');
  assert.equal(an.pickAnnouncementTemplate(rows.filter((r) => r.id !== '2')).name, 'store_announcement_v3');
  assert.equal(an.pickAnnouncementTemplate([rows[3]]), null);
  assert.equal(an.nextAnnouncementName(rows), 'store_announcement_v4');
  assert.equal(an.nextAnnouncementName([]), 'store_announcement');
});
await t('preview renders name and folds message', () =>
  assert.equal(
    an.renderAnnouncement('Asha', 'Sale\nthis week'),
    'Hello Asha,\n\nHere is an update from Ishaputra Botanicals:\n\nSale this week\n\nThank you for shopping with us.',
  ));
await t('reach count matches server plan', () => {
  const rows = [
    an.toCustomerRow('a', { name: 'A', whatsappNumber: '9876543210', phone: '9000000000' }),
    an.toCustomerRow('b', { phone: '+919876543210' }),
    an.toCustomerRow('c', { mobile: '9123456789' }),
    an.toCustomerRow('d', {}),
  ];
  assert.equal(rows[0].waNumber, '919876543210');
  assert.deepEqual(an.countWhatsAppReach(rows, new Set(['919123456789'])), { reach: 1, noNumber: 1, optedOut: 1, duplicate: 1 });
});

// ---- handler end to end with fake Firestore + fake Meta
await t('handler: announcement to all customers', async () => {
  const s = fake.store;
  s.clear();
  s.set('users/admin1', { role: 'admin', phone: '9999999999', username: 'Owner' });
  s.set('users/u1', { role: 'user', username: 'Asha Kumari', whatsappNumber: '9876543210' });
  s.set('users/u2', { role: 'customer', fullName: 'Ravi', phone: '09123456789' });
  s.set('users/u3', { role: 'user', phone: '9111111111' }); // opted out
  s.set('users/u4', { role: 'delivery', phone: '9222222222' });
  s.set('users/u5', { role: 'user', username: 'Dup', phone: '+91 98765 43210' }); // same as u1
  s.set('users/u6', { username: 'No phone' });
  s.set('whatsappThreads/+919111111111', { marketingOptOut: true });
  s.set('whatsappThreads/+919123456789', { phone: '+919123456789', lastMessage: 'old' });
  s.set('whatsappTemplates/store_announcement', {
    name: 'store_announcement', language: 'en',
    bodyText: 'Hello {{1}},\n\nHere is an update from Ishaputra Botanicals:\n\n{{2}}\n\nThank you for shopping with us.',
  });

  process.env.WHATSAPP_TOKEN = 'x';
  process.env.WHATSAPP_PHONE_ID = 'PID';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.to === '919123456789') {
      // first call for Ravi succeeds
    }
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${body.to}` }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  let status = 0;
  let payload = null;
  const res = {
    setHeader() {},
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    end() { return this; },
  };
  await bc.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token' },
      body: {
        audience: 'customers',
        channels: { whatsapp: true },
        whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'New oils\nin store'], personalizeFirst: true },
        kind: 'announcement',
        actorUid: 'admin1',
      },
    },
    res,
  );
  assert.equal(status, 200, JSON.stringify(payload));
  // u1, u2 sent; u3 opted out; u5 duplicate; u6 no phone; admin + delivery excluded.
  assert.equal(payload.recipientCount, 5);
  assert.equal(payload.whatsapp.successCount, 2);
  assert.deepEqual(payload.whatsapp.skipped, { noPhone: 1, invalidPhone: 0, optedOut: 1, duplicate: 1 });
  const byTo = Object.fromEntries(calls.map((c) => [c.to, c]));
  assert.deepEqual(Object.keys(byTo).sort(), ['919123456789', '919876543210']);
  assert.deepEqual(
    byTo['919876543210'].template.components[0].parameters.map((p) => p.text),
    ['Asha', 'New oils in store'],
  );
  assert.equal(byTo['919876543210'].template.name, 'store_announcement');
  assert.equal(byTo['919876543210'].template.language.code, 'en');

  // Inbox log: message stored for both; only the existing thread was bumped.
  const msg = s.get('whatsappThreads/+919876543210/messages/wamid.919876543210');
  assert.ok(msg, 'message logged');
  assert.match(msg.text, /Hello Asha,[\s\S]*New oils in store/);
  assert.equal(s.get('whatsappThreads/+919876543210'), undefined, 'no new thread doc');
  assert.equal(s.get('whatsappThreads/+919123456789').lastOutboundMessageId, 'wamid.919123456789');
  const campaign = [...s.entries()].find(([k]) => k.startsWith('broadcastCampaigns/'))[1];
  assert.equal(campaign.kind, 'announcement');
  assert.equal(campaign.status, 'completed');
});

await t('handler: chosen customers only', async () => {
  const s = fake.store;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.to);
    return new Response(JSON.stringify({ messages: [{ id: `w.${body.to}` }] }), { status: 200 });
  };
  let payload = null;
  const res = { setHeader() {}, status() { return this; }, json(p) { payload = p; return this; }, end() { return this; } };
  await bc.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token' },
      body: {
        audience: 'selected',
        selectedUids: ['u2'],
        channels: { whatsapp: true },
        whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Hi'] },
      },
    },
    res,
  );
  assert.equal(payload.ok, true);
  assert.deepEqual(calls, ['919123456789']);
});

await t('handler: Meta error is counted, not fatal', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Template not approved' } }), { status: 400 });
  let payload = null;
  const res = { setHeader() {}, status() { return this; }, json(p) { payload = p; return this; }, end() { return this; } };
  await bc.default(
    {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token' },
      body: { audience: 'selected', selectedUids: ['u1'], channels: { whatsapp: true }, whatsapp: { template: 'x', params: ['a', 'b'] } },
    },
    res,
  );
  assert.equal(payload.ok, true);
  assert.equal(payload.whatsapp.failureCount, 1);
  assert.match(payload.whatsapp.failures[0].error, /Template not approved/);
});

await t('handler: non-admin refused', async () => {
  let status = 0;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json() { return this; }, end() { return this; } };
  await bc.default({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: {} }, res);
  assert.equal(status, 401);
});

// ---- broadcast safety: no double sends, time budget, size cap, real actor
const callHandler = async (body) => {
  let status = 0;
  let payload = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(p) { payload = p; return this; }, end() { return this; } };
  await bc.default({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, body }, res);
  return { status, payload };
};
const okFetch = (calls) => async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push(body.to);
  return new Response(JSON.stringify({ messages: [{ id: `w.${body.to}.${calls.length}` }] }), { status: 200 });
};

await t('handler: the same broadcast again is refused, nothing re-sent', async () => {
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const body = {
    audience: 'selected',
    selectedUids: ['u1'],
    channels: { whatsapp: true },
    whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Repeat test'] },
  };
  const first = await callHandler(body);
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.equal(calls.length, 1);
  const second = await callHandler(body);
  assert.equal(second.status, 409, JSON.stringify(second.payload));
  assert.match(second.payload.error, /already sent/i);
  assert.equal(calls.length, 1, 'no second paid message');
  // A different message to the same people is fine.
  const third = await callHandler({ ...body, whatsapp: { ...body.whatsapp, params: ['there', 'Another update'] } });
  assert.equal(third.status, 200);
  assert.equal(calls.length, 2);
});

await t('handler: a run cut off mid-way (still "sending") also blocks a repeat', async () => {
  const s = fake.store;
  const body = {
    audience: 'selected',
    selectedUids: ['u2'],
    channels: { whatsapp: true },
    whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Cut off'] },
  };
  const lockId = bc.broadcastLockIds(body).whatsapp;
  s.set(`broadcastLocks/${lockId}`, { state: 'sending', campaignId: 'cut1', startedAtMs: Date.now() - 60_000, expiresAtMs: Date.now() + 3600e3 });
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const r = await callHandler(body);
  assert.equal(r.status, 409);
  assert.match(r.payload.error, /may have been sent/i);
  assert.equal(calls.length, 0);
});

await t('handler: a broadcast where every send failed can be retried', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Template paused' } }), { status: 400 });
  const body = { audience: 'selected', selectedUids: ['u1'], channels: { whatsapp: true }, whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Retry me'] } };
  const first = await callHandler(body);
  assert.equal(first.payload.whatsapp.successCount, 0);
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const second = await callHandler(body);
  assert.equal(second.status, 200, JSON.stringify(second.payload));
  assert.equal(calls.length, 1);
});

await t('handler: two sends of the same broadcast at once: only one goes out', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    await new Promise((r) => setTimeout(r, 20));
    return okFetch(calls)(url, init);
  };
  const body = { audience: 'selected', selectedUids: ['u1'], channels: { whatsapp: true }, whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Race'] } };
  const [a, b] = await Promise.all([callHandler(body), callHandler(body)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(calls.length, 1);
});

await t('handler: a Meta timeout counts as maybe sent, so a retry is refused', async () => {
  globalThis.fetch = async () => {
    const e = new Error('The operation was aborted due to timeout');
    e.name = 'TimeoutError';
    throw e;
  };
  const body = { audience: 'selected', selectedUids: ['u2'], channels: { whatsapp: true }, whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Slow Meta'] } };
  const first = await callHandler(body);
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.whatsapp.uncertain, 1);
  assert.equal(first.payload.whatsapp.successCount, 0);
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const second = await callHandler(body);
  assert.equal(second.status, 409);
  assert.match(second.payload.error, /may have been sent/i);
  assert.equal(calls.length, 0);
});

await t('handler: WhatsApp problem found before push goes out; fixed retry sends push once', async () => {
  const s = fake.store;
  s.set('userTokens/t1', { uid: 'u1', token: 'tok-u1' });
  s.set('whatsappTemplates/pic_promo', { name: 'pic_promo', language: 'en', headerFormat: 'IMAGE', headerImageUrl: null, bodyText: 'Hi {{1}}' });
  const body = {
    audience: 'selected', selectedUids: ['u1'], channels: { push: true, whatsapp: true },
    push: { title: 'Sale', body: 'This week' },
    whatsapp: { template: 'pic_promo', language: 'en', params: ['there'] },
  };
  fake.pushCalls.length = 0;
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const first = await callHandler(body);
  assert.equal(first.status, 500);
  assert.match(first.payload.error, /Set picture/);
  assert.equal(fake.pushCalls.length, 0, 'no push before the WhatsApp check');
  s.set('whatsappTemplates/pic_promo', { ...s.get('whatsappTemplates/pic_promo'), headerImageUrl: 'https://images.example.com/a.jpg' });
  const second = await callHandler(body);
  assert.equal(second.status, 200, JSON.stringify(second.payload));
  assert.equal(fake.pushCalls.length, 1);
  assert.equal(calls.length, 1);
  s.delete('userTokens/t1');
});

await t('handler: retrying "WhatsApp only" after push+WhatsApp went out is refused', async () => {
  const s = fake.store;
  s.set('userTokens/t2', { uid: 'u2', token: 'tok-u2' });
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const both = {
    audience: 'selected', selectedUids: ['u2'], channels: { push: true, whatsapp: true },
    push: { title: 'Hello', body: 'News' },
    whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Both channels'] },
  };
  assert.equal((await callHandler(both)).status, 200);
  const waOnly = await callHandler({ ...both, channels: { whatsapp: true }, push: undefined });
  assert.equal(waOnly.status, 409);
  assert.equal(calls.length, 1);
  s.delete('userTokens/t2');
});

await t('dispatch: stops starting sends at the deadline and counts the rest', async () => {
  process.env.WHATSAPP_TOKEN = 'x';
  process.env.WHATSAPP_PHONE_ID = 'PID';
  globalThis.fetch = async (url, init) => {
    await new Promise((r) => setTimeout(r, 20));
    return new Response(JSON.stringify({ messages: [{ id: 'w' }] }), { status: 200 });
  };
  const recipients = Array.from({ length: 60 }, (_, i) => ({ uid: `x${i}`, to: `9190000000${String(i).padStart(2, '0')}`, name: '' }));
  const r = await bc.dispatchWhatsApp(recipients, { template: 't' }, () => [], undefined, Date.now() + 50);
  assert.ok(r.notSent > 0, `notSent ${r.notSent}`);
  assert.ok(r.successCount > 0);
  assert.equal(r.successCount + r.failureCount + r.uncertain + r.notSent, 60);
});

await t('handler: too many WhatsApp recipients refused before sending', async () => {
  const s = fake.store;
  const uids = [];
  for (let i = 0; i <= bc.MAX_WA_RECIPIENTS; i += 1) {
    const uid = `bulk${i}`;
    uids.push(uid);
    s.set(`users/${uid}`, { role: 'user', phone: `98${String(i).padStart(8, '0')}` });
  }
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const r = await callHandler({ audience: 'selected', selectedUids: uids, channels: { whatsapp: true }, whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Bulk'] } });
  for (const uid of uids) s.delete(`users/${uid}`);
  assert.equal(r.status, 400, JSON.stringify(r.payload));
  assert.match(r.payload.error, /at most/i);
  assert.equal(calls.length, 0);
});

await t('handler: actor comes from the login, not the request body', async () => {
  const calls = [];
  globalThis.fetch = okFetch(calls);
  const r = await callHandler({
    audience: 'selected', selectedUids: ['u2'], channels: { whatsapp: true },
    whatsapp: { template: 'store_announcement', language: 'en', params: ['there', 'Actor test'] },
    actorUid: 'someone-else', actorEmail: 'fake@example.com',
  });
  assert.equal(r.status, 200);
  const campaign = fake.store.get(`broadcastCampaigns/${r.payload.campaignId}`);
  assert.equal(campaign.actorUid, 'admin1');
});

await t('handler: campaign id with a slash refused', async () => {
  const r = await callHandler({ campaignId: 'a/b', audience: 'selected', selectedUids: ['u2'], channels: { whatsapp: true }, whatsapp: { template: 'x', params: [] } });
  assert.equal(r.status, 400);
  const r2 = await callHandler({ audience: 'selected', selectedUids: ['../x'], channels: { whatsapp: true }, whatsapp: { template: 'x', params: [] } });
  assert.equal(r2.status, 400);
});

// ---- webhook: STOP sets the flag on the thread
await t('webhook: STOP message opts the number out', async () => {
  const writes = [];
  const fakeDb = {
    collection: () => ({
      doc: (id) => ({
        id,
        collection: () => ({ doc: (mid) => ({ id: mid }) }),
      }),
    }),
    batch: () => ({
      set: (ref, data) => writes.push({ ref, data }),
      commit: async () => {},
    }),
  };
  const deps = { fromMillis: (ms) => ms, increment: (n) => ({ inc: n }), serverTimestamp: () => 'now' };
  await wh.storeInbound(fakeDb, { from: '919111111111', id: 'm1', type: 'text', text: { body: 'STOP' }, timestamp: '1' }, null, deps);
  assert.equal(writes[0].data.marketingOptOut, true);
  writes.length = 0;
  await wh.storeInbound(fakeDb, { from: '919111111111', id: 'm2', type: 'text', text: { body: 'start' }, timestamp: '2' }, null, deps);
  assert.equal(writes[0].data.marketingOptOut, false);
  writes.length = 0;
  await wh.storeInbound(fakeDb, { from: '919111111111', id: 'm3', type: 'text', text: { body: 'Hello' }, timestamp: '3' }, null, deps);
  assert.equal('marketingOptOut' in writes[0].data, false);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

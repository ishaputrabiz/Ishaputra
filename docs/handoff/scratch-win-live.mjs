// Live Scratch & Win run against the Ishaputra project with the test shopper.
// Real: create-order / verify-payment / notify-order code, Firestore, the deployed
// security rules (over REST as the shopper) and the storefront in a browser (the
// dev server has no /api/notify-order, so the browser's calls are routed to the
// real handler in this process). Faked: the Razorpay API.
// Turns the feature on, then puts it back exactly as it was and deletes
// everything it created. Needs the owner's OK: it writes to the live Firestore.
// node docs/handoff/scratch-win-live.mjs [BASE] [OUT]   (run from ssecommerce/, dev server on BASE)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';

const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const { chromium } = createRequire('C:/Users/chala/AppData/Roaming/npm/node_modules/playwright/package.json')('playwright');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const T = admin.firestore.Timestamp;

const BASE = process.argv[2] || 'http://127.0.0.1:5182';
const OUT = process.argv[3] || '../shots/scratch-win-live';
mkdirSync(OUT, { recursive: true });

process.env.RAZORPAY_KEY_ID = 'rzp_test_localcheck';
process.env.RAZORPAY_KEY_SECRET = 'local-check-secret';
process.env.FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
process.env.FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

// ── Fake Razorpay ────────────────────────────────────────────────────────────
const rzpOrders = new Map();
const realFetch = globalThis.fetch;
let seq = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const m = u.match(/^https:\/\/api\.razorpay\.com\/v1\/orders(?:\/([^/?]+))?(\/payments)?/);
  if (!m) return realFetch(url, init);
  if ((init.method || 'GET') === 'POST') {
    const body = JSON.parse(init.body);
    const id = `order_swlive${Date.now()}${seq++}`;
    rzpOrders.set(id, { id, status: 'created', amount_paid: 0, payments: [], ...body });
    return new Response(JSON.stringify({ id, amount: body.amount, currency: body.currency }), { status: 200 });
  }
  const o = rzpOrders.get(decodeURIComponent(m[1] || ''));
  if (!o) return new Response('{}', { status: 404 });
  if (m[2]) return new Response(JSON.stringify({ items: o.payments }), { status: 200 });
  const { payments, ...order } = o;
  return new Response(JSON.stringify(order), { status: 200 });
};

// ── Code under test ──────────────────────────────────────────────────────────
const base = pathToFileURL(`${process.cwd()}/`);
const createOrder = (await import(new URL('api/create-order.ts', base).href)).default;
const verifyPayment = (await import(new URL('api/verify-payment.ts', base).href)).default;
const notifyOrder = (await import(new URL('api/notify-order.ts', base).href)).default;
const { summariseRewards } = await import(new URL('src/lib/rewards.ts', base).href);

const call = async (handler, body, token, method = 'POST') => {
  let status = 0;
  let json;
  const res = {
    setHeader() {},
    status(c) { status = c; return this; },
    json(j) { json = j; return this; },
    end() { return this; },
  };
  await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return { status, json };
};

// ── Test shopper over REST (the deployed security rules apply) ───────────────
const creds = JSON.parse(readFileSync('docs/handoff/shopper.local', 'utf8'));
const KEY = process.env.VITE_FIREBASE_API_KEY;
const P = process.env.VITE_FIREBASE_PROJECT_ID;
const s = await (await realFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
})).json();
if (!s.idToken) throw new Error('sign-in failed');
const uid = s.localId;
const H = { Authorization: `Bearer ${s.idToken}`, 'Content-Type': 'application/json' };
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const enc = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const restPatch = async (path, data) => {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return (await realFetch(`${FS}/${path}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: fields(data) }) })).status;
};
const restCreate = async (coll, id, data) =>
  (await realFetch(`${FS}/${coll}?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers: H, body: JSON.stringify({ fields: fields(data) }) })).status;
const restGet = async (path) => (await realFetch(`${FS}/${path}`, { headers: H })).status;

// The customer's own writes, exactly as src/services/orderService.ts makes them.
const askReturn = (rzp, extra = {}) => {
  const now = new Date();
  return restPatch(`orders/${rzp}`, { status: 'returnRequested', returnReason: 'Live check', returnRequestedAt: now,
    returnStatus: 'pending', updatedAt: now, lastUpdated: now, ...extra });
};
const cancelReturn = (rzp) => {
  const now = new Date();
  return restPatch(`orders/${rzp}`, { status: 'delivered', returnCancelled: true, returnCancelledAt: now,
    return_otp: null, return_otp_verified: null, updatedAt: now, lastUpdated: now });
};

// ── Fixtures ─────────────────────────────────────────────────────────────────
const user = db.collection('users').doc(uid);
const ledger = user.collection('rewardLedger');
const cards = user.collection('scratchCards');
const settingsRef = db.collection('siteSettings').doc('scratchWin');
const originalSettings = await settingsRef.get();
const ledgerBefore = (await ledger.get()).docs.map((d) => d.id).sort();

const prod = (await db.collection('products').where('flags.isActive', '==', true).limit(30).get())
  .docs.find((d) => Number(d.data().inventory?.stock) > 2 && Number(d.data().price) >= 300 && !d.data().silverPricing?.enabled);
assert.ok(prod, 'need an active in-stock product priced >= Rs 300');
const p = prod.data();
const price = Number(p.price);
const image = p.images?.[0]?.url || p.images?.[0] || p.image || '';
const addr = { fullName: 'Preview Shopper', mobile: '9000000000', pincode: '500001', address: '1 Demo Street',
  city: 'Hyderabad', state: 'Telangana', addressType: 'home' };

const created = new Set();
const step = (msg) => console.log(`  ok  ${msg}`);
const read = async (ref) => (await ref.get()).data();
const reconcile = (rzp) => call(notifyOrder, { action: 'reconcile-rewards', orderId: rzp }, s.idToken);
const scratch = (rzp) => call(notifyOrder, { action: 'scratch-card', orderId: rzp }, s.idToken);

/** A paid checkout through the real create-order and verify-payment, then the order the storefront would write, delivered now. */
async function deliveredOrder(tag, deliveredAgoMs = 0) {
  const r = await call(createOrder, { items: [{ productId: prod.id, quantity: 2 }], shippingState: 'Telangana' }, s.idToken);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const rzp = r.json.order_id;
  created.add(rzp);
  const o = rzpOrders.get(rzp);
  Object.assign(o, { status: 'paid', amount_paid: o.amount, payments: [{ id: `pay_${rzp}`, status: 'captured' }] });
  const sig = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${rzp}|pay_${rzp}`).digest('hex');
  const v = await call(verifyPayment, { razorpay_order_id: rzp, razorpay_payment_id: `pay_${rzp}`, razorpay_signature: sig });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  const total = r.json.amount / 100;
  const subtotal = price * 2;
  await db.collection('orders').doc(rzp).set({
    demo: true, userId: uid, userEmail: creds.email, userName: 'Preview Shopper', orderId: `SW-${tag}-${rzp.slice(-4)}`,
    items: [{ productId: prod.id, name: p.name, image: typeof image === 'string' ? image : '', price, quantity: 2 }],
    subtotal, discount: 0, deliveryCharge: Math.max(0, total - subtotal), taxAmount: 0, total,
    paymentMethod: 'Razorpay', paymentStatus: 'paid', razorpayOrderId: rzp, razorpayPaymentId: `pay_${rzp}`,
    shippingAddress: addr, status: 'delivered', createdAt: T.fromMillis(Date.now() - 2 * 864e5), updatedAt: T.now(),
    deliveredAt: T.fromMillis(Date.now() - deliveredAgoMs), statusHistory: [{ status: 'delivered', timestamp: T.now(), note: 'Live check' }],
  });
  return { rzp, total };
}

let browser;
try {
  const before = summariseRewards((await ledger.get()).docs.map((d) => {
    const x = d.data();
    return { currency: x.currency, amount: Number(x.amount) || 0, status: x.status, kind: x.kind || 'adjust',
      unlockAtMs: x.unlockAt?.toMillis?.() || 0, held: x.held === true };
  }), Date.now());
  console.log(`shopper: ${before.points.available} points, Rs ${before.cashback.available} cashback; product Rs ${price} x 2`);

  // 0. Rules: nobody but the server writes cards; the switch is off.
  assert.equal(await restCreate(`users/${uid}/scratchCards`, 'forged', { status: 'new', points: 0 }), 403, 'customer cannot create a card');
  step('rules: the customer cannot create a scratch card');

  // A delivered order while the switch is off gets no card.
  // Delivered an hour ago: outside the 15 minutes allowed for device clocks once the switch goes on.
  const off = await deliveredOrder('OFF', 3_600_000);
  const offRec = await reconcile(off.rzp);
  assert.equal(offRec.status, 200, JSON.stringify(offRec.json));
  assert.equal((await cards.doc(off.rzp).get()).exists, false, 'no card while Scratch & Win is off');
  step('switch off: a delivered order earns points but no card');

  // 1. Turn the feature on the way the admin tab does (enabledAt from the server clock).
  await settingsRef.set({ enabled: true, minOrder: 499, expiryDays: 30, noWinWeight: 0,
    prizes: [{ points: 5, weight: 40 }, { points: 10, weight: 35 }, { points: 25, weight: 20 }, { points: 50, weight: 5 }],
    enabledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const offAgain = await reconcile(off.rzp);
  assert.equal((await cards.doc(off.rzp).get()).exists, false, `an order delivered before the switch went on gets no card: ${JSON.stringify(offAgain.json)}`);
  step('switch on: the order delivered before it still gets no card');

  // 2. Order A delivered -> card; the customer can read it but not change it.
  const A = await deliveredOrder('A');
  assert.ok(A.total >= 499, `order A must be >= Rs 499 (is ${A.total})`);
  const recA = await reconcile(A.rzp);
  assert.equal(recA.status, 200, JSON.stringify(recA.json));
  assert.ok(recA.json.changed.includes(`scratchCards/${A.rzp}`), `card given: ${JSON.stringify(recA.json)}`);
  const cardA = await read(cards.doc(A.rzp));
  assert.equal(cardA.status, 'new'); assert.equal(cardA.orderAmount, A.total);
  assert.ok((await read(db.collection('payments').doc(A.rzp))).scratchCardGivenAt, 'payment stamped scratchCardGivenAt');
  const earnA = await read(ledger.doc(`earn_${A.rzp}`));
  assert.ok(earnA, 'points earned on delivery');
  assert.ok(earnA.unlockAt.toMillis() >= Date.now() + 7 * 864e5 - 60_000, 'points unlock no earlier than delivery + 7 days');
  assert.equal(cardA.unlockAt.toMillis(), earnA.unlockAt.toMillis(), 'the prize unlocks with the earned points');
  assert.equal(await restGet(`users/${uid}/scratchCards/${A.rzp}`), 200, 'customer reads own card');
  assert.equal(await restPatch(`users/${uid}/scratchCards/${A.rzp}`, { status: 'scratched', points: 50 }), 403, 'customer cannot scratch by writing');
  const recA2 = await reconcile(A.rzp);
  assert.ok(!recA2.json.changed.some((c) => c.startsWith('scratchCards/')), 'a second reconcile gives no second card');
  step(`delivered Rs ${A.total}: one card, readable by the shopper, not writable; payment stamped; unlock = earned points`);

  // 3. Scratch in the browser (390, light), through the real handler.
  browser = await chromium.launch();
  const errors = [];
  const ctxFor = async (w, h, theme) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    await ctx.addInitScript((t) => localStorage.setItem('ishaputra-theme', t), theme);
    await ctx.route('**/api/notify-order', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fulfill({ status: 204, body: '' });
      const token = (req.headers().authorization || '').replace(/^Bearer /, '');
      const r = await call(notifyOrder, JSON.parse(req.postData() || '{}'), token);
      await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.json ?? {}) });
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w}-${theme}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${w}-${theme}: ${e.message}`));
    await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    await page.locator('input[type="email"]').first().fill(creds.email);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return { ctx, page };
  };
  const settle = async (page) => {
    await page.waitForFunction(() => document.body.innerText.length > 300 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
  };
  const shot = async (page, name, fullPage = true) => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(wide, false, `${name}: no sideways overflow`);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
    console.log('      shot', name);
  };

  {
    const { ctx, page } = await ctxFor(390, 844, 'light');
    await page.goto(`${BASE}/wallet`, { waitUntil: 'load' });
    await settle(page);
    const tile = page.getByRole('button', { name: /Scratch the card for order/ });
    await tile.first().waitFor({ timeout: 20000 });
    await shot(page, 'A1-wallet-new-card-390-light');
    await tile.first().click();
    const reveal = page.getByRole('button', { name: 'Reveal prize' });
    await reveal.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await shot(page, 'A2-dialog-before-390-light', false);
    await reveal.click();
    await page.getByRole('img', { name: /You won|No prize this time/ }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, 'A3-dialog-won-390-light', false);
    await ctx.close();
  }
  const cardAs = await read(cards.doc(A.rzp));
  assert.equal(cardAs.status, 'scratched');
  assert.ok(cardAs.points > 0, 'noWinWeight 0: always a prize');
  const prizeA = await read(ledger.doc(`scratch_${A.rzp}`));
  assert.deepEqual([prizeA.kind, prizeA.source, prizeA.status, prizeA.held, prizeA.amount, prizeA.currency],
    ['earn', 'scratch', 'active', false, cardAs.points, 'points']);
  assert.equal(cardAs.prizeState, 'active');
  const again = await scratch(A.rzp);
  assert.equal(again.status, 200); assert.equal(again.json.points, cardAs.points, 'scratching again returns the same prize');
  step(`browser scratch: won ${cardAs.points} points; ledger scratch_<rzp> earn/scratch/active; a re-scratch returns the same prize`);

  // 4. Return of order A: request (rules), hold, approve, no cancel after approval, returned -> void.
  assert.equal(await askReturn(A.rzp, { returnStatus: 'approved' }), 403, 'a return request cannot start approved');
  assert.equal(await askReturn(A.rzp), 200, 'a pending return request is accepted');
  await reconcile(A.rzp);
  assert.equal((await read(ledger.doc(`scratch_${A.rzp}`))).held, true, 'prize held while the return is open');
  assert.equal((await read(cards.doc(A.rzp))).prizeState, 'held');
  assert.equal((await read(ledger.doc(`earn_${A.rzp}`))).held, true, 'earned points held too');
  await db.collection('orders').doc(A.rzp).update({ returnStatus: 'approved', updatedAt: T.now() });
  assert.equal(await cancelReturn(A.rzp), 403, 'no cancel after the shop approved the return');
  {
    const { ctx, page } = await ctxFor(390, 844, 'light');
    await page.goto(`${BASE}/account/orders/${A.rzp}`, { waitUntil: 'load' });
    await settle(page);
    await shot(page, 'A4-order-return-approved-390-light');
    await ctx.close();
  }
  await db.collection('orders').doc(A.rzp).update({ status: 'returned', updatedAt: T.now() });
  const recRet = await reconcile(A.rzp);
  assert.ok(recRet.json.changed.some((c) => c === `scratchCards/${A.rzp}:prize-void`), `prize voided: ${JSON.stringify(recRet.json)}`);
  assert.equal((await read(ledger.doc(`scratch_${A.rzp}`))).status, 'void');
  assert.equal((await read(cards.doc(A.rzp))).prizeState, 'void');
  assert.equal((await read(ledger.doc(`earn_${A.rzp}`))).status, 'void', 'earned points voided');
  const afterVoid = await scratch(A.rzp);
  assert.equal(afterVoid.json.prizeState, 'void', 'the dialog is told the prize was taken back');
  step('return: request must start pending; prize + points held; no cancel once approved; returned -> both void');

  // 5. Order B: unscratched card, return requested then cancelled (allowed while pending), then returned -> card void.
  const B = await deliveredOrder('B');
  await reconcile(B.rzp);
  assert.equal((await read(cards.doc(B.rzp))).status, 'new');
  assert.equal(await askReturn(B.rzp), 200);
  await reconcile(B.rzp);
  assert.equal(await cancelReturn(B.rzp), 200, 'the customer can cancel a pending return');
  await reconcile(B.rzp);
  assert.equal((await read(cards.doc(B.rzp))).status, 'new', 'card still scratchable after the cancelled return');
  await db.collection('orders').doc(B.rzp).update({ status: 'returned', returnStatus: 'approved', updatedAt: T.now() });
  await reconcile(B.rzp);
  const cardB = await read(cards.doc(B.rzp));
  assert.equal(cardB.status, 'void'); assert.equal(cardB.voidReason, 'order-returned');
  const sB = await scratch(B.rzp);
  assert.equal(sB.status, 409); assert.equal(sB.json.error, 'card_void');
  assert.equal((await ledger.doc(`scratch_${B.rzp}`).get()).exists, false, 'no prize for a voided card');
  step('unscratched card: kept through a cancelled return, void once returned, scratch refused with no draw');

  // 6. Order C stays delivered with a new card: final screens in all four combos.
  const C = await deliveredOrder('C');
  await reconcile(C.rzp);
  assert.equal((await read(cards.doc(C.rzp))).status, 'new');
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const { ctx, page } = await ctxFor(w, h, theme);
      await page.goto(`${BASE}/wallet`, { waitUntil: 'load' });
      await settle(page);
      await page.getByRole('heading', { name: /Scratch cards/i }).first().waitFor({ timeout: 20000 });
      await shot(page, `C-wallet-${w}-${theme}`);
      await page.goto(`${BASE}/account/orders/${C.rzp}`, { waitUntil: 'load' });
      await settle(page);
      await shot(page, `C-order-${w}-${theme}`);
      await ctx.close();
    }
  }
  step('wallet and order page with live cards at 390 and 1440, light and dark, no sideways overflow');
  const real = errors.filter((e) => !/favicon|DevTools|Download the React/.test(e));
  console.log(real.length ? `console errors:\n${real.join('\n')}` : '  ok  0 console errors');
  console.log('scratch-win live run: PASS');
} finally {
  if (browser) await browser.close();
  // Put everything back: the shopper keeps only the demo balances, the switch goes back to how it was.
  let n = 0;
  for (const d of (await ledger.get()).docs) {
    if ([...created].some((id) => d.id.includes(id))) { await d.ref.delete(); n++; }
  }
  for (const id of created) {
    await cards.doc(id).delete();
    await db.collection('orders').doc(id).delete();
    await db.collection('payments').doc(id).delete();
  }
  await user.collection('rewardState').doc('lock').delete();
  if (originalSettings.exists) await settingsRef.set(originalSettings.data());
  else await settingsRef.delete();
  const after = (await ledger.get()).docs.map((d) => d.id).sort();
  console.log(`cleaned up ${n} ledger entries, ${created.size} orders, payments and cards; Scratch & Win settings restored (${originalSettings.exists ? 'as saved' : 'deleted: was never set'})`);
  console.log(`ledger back to its start: ${JSON.stringify(after) === JSON.stringify(ledgerBefore)}`);
}
process.exit(0);

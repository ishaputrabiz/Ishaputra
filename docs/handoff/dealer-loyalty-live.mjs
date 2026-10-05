// Live Dealer Membership + Loyalty card run against the Ishaputra project with the test shopper.
//
// Real: the deployed security rules (over REST as the shopper), the real api/create-order.ts,
// api/verify-payment.ts and api/notify-order.ts handlers (run in this process), Firestore, and the
// storefront in Chromium. Faked: the Razorpay API only (an in-memory stand-in), and in the browser
// the /api/create-order call for the UI-only steps (so nothing can be charged) plus the third-party
// geocoder.
//
// It needs the owner's OK and the new firestore.rules to be deployed first: it WRITES to the live
// Firestore (dealer programme settings, dealer prices, the loyalty tiers, Scratch & Win, the test
// shopper's dealer application, cart, address, orders, payments, ledger entries and scratch cards).
// Everything it touches is snapshotted first and put back exactly in `finally`; everything it
// creates is deleted. Credentials are loaded at run time and never printed.
//
// node docs/handoff/dealer-loyalty-live.mjs [BASE] [OUT]
//   run from ssecommerce/, dev server on BASE (default http://127.0.0.1:5182),
//   screenshots to OUT (default ../shots/dealer-loyalty-live). Exit code 1 on any FAIL.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

if (!existsSync('api/create-order.ts')) throw new Error('run this from the ssecommerce folder');

const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const { chromium } = createRequire('C:/Users/chala/AppData/Roaming/npm/node_modules/playwright/package.json')('playwright');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const T = admin.firestore.Timestamp;
const FV = admin.firestore.FieldValue;

const BASE = process.argv[2] || 'http://127.0.0.1:5182';
const OUT = process.argv[3] || '../shots/dealer-loyalty-live';
mkdirSync(OUT, { recursive: true });

process.env.RAZORPAY_KEY_ID = 'rzp_test_localcheck';
process.env.RAZORPAY_KEY_SECRET = 'local-check-secret';
process.env.FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
process.env.FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

// ── Test shopper credentials (loaded, never printed) ─────────────────────────
const creds = JSON.parse(readFileSync('docs/handoff/shopper.local', 'utf8'));
const KEY = process.env.VITE_FIREBASE_API_KEY;
const P = process.env.VITE_FIREBASE_PROJECT_ID;

// ── Output: PASS / FAIL per check; anything secret is masked before it prints ─
const secrets = [KEY, creds.email, creds.password];
const redact = (s) => {
  let out = String(s);
  for (const x of secrets) if (typeof x === 'string' && x.length > 5) out = out.split(x).join('***');
  return out;
};
const log = (...a) => console.log(redact(a.join(' ')));
let passes = 0;
let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passes++; log(`  PASS  ${label}`); } else { failures++; log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ''}`); }
  return Boolean(ok);
};
const is = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
const section = async (title, fn) => {
  log(`\n== ${title}`);
  try { await fn(); } catch (e) { failures++; log(`  FAIL  ${title}: step crashed -- ${e?.message || e}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, every = 250) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(every); }
  return false;
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Fake Razorpay (the only fake on the server side) ─────────────────────────
const PREFIX = 'order_dlive';
const rzpOrders = new Map();
const realFetch = globalThis.fetch;
let seq = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const m = u.match(/^https:\/\/api\.razorpay\.com\/v1\/orders(?:\/([^/?]+))?(\/payments)?/);
  if (!m) return realFetch(url, init);
  if ((init.method || 'GET') === 'POST') {
    const body = JSON.parse(init.body);
    const id = `${PREFIX}${Date.now()}${seq++}`;
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
const { summariseRewards, normaliseRewardSettings, pointsForBase } = await import(new URL('src/lib/rewards.ts', base).href);
const { dealerQuote, normaliseDealerSettings, normaliseDealerPricing } = await import(new URL('src/lib/dealer.ts', base).href);
const { memberDigits, formatMemberNumber } = await import(new URL('src/lib/loyaltyCard.ts', base).href);
const MEMBER_PREFIX = (readFileSync('src/config/brand.ts', 'utf8').match(/memberPrefix:\s*'([^']*)'/) || [])[1] ?? 'IB';

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

// ── Test shopper: ID token for the handlers and for REST (the deployed rules apply) ─
let session = null;
let sessionAt = 0;
async function signIn() {
  const r = await realFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
  });
  const s = await r.json();
  if (!s.idToken) throw new Error('sign-in failed');
  session = s; sessionAt = Date.now(); secrets.push(s.idToken);
}
await signIn();
const uid = session.localId;
const idToken = async () => { if (Date.now() - sessionAt > 40 * 60_000) await signIn(); return session.idToken; };

const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const docName = (path) => `projects/${P}/databases/(default)/documents/${path}`;
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
const http = async (method, url, body, auth = true) => {
  const headers = { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${await idToken()}` } : {}) };
  const r = await realFetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  let json = null;
  try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
};
const rGet = (path, auth = true) => http('GET', `${FS}/${path}${auth ? '' : `?key=${KEY}`}`, undefined, auth);
const rDelete = (path) => http('DELETE', `${FS}/${path}`);
const rPatch = (path, data) => {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return http('PATCH', `${FS}/${path}?${mask}`, { fields: fields(data) });
};
const rCreate = (coll, id, data) => http('POST', `${FS}/${coll}?documentId=${encodeURIComponent(id)}`, { fields: fields(data) });
/** One write with server-time fields (request.time), the way the Firestore SDK sends serverTimestamp(). */
const rCommit = ({ path, data, mask = null, stamp = [] }) =>
  http('POST', `${FS}:commit`, {
    writes: [{
      update: { name: docName(path), fields: fields(data) },
      ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
      ...(stamp.length ? { updateTransforms: stamp.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}),
    }],
  });
const why = (r) => `HTTP ${r.status}${r.status !== 403 && r.json?.error?.message ? ` (${String(r.json.error.message).slice(0, 110)})` : ''}`;
const denied = (label, r) => check(label, r.status === 403, why(r));
const allowed = (label, r) => check(label, r.status === 200, why(r));

// ── Independent price replica (the spec, not the code under test) ────────────
const r2 = (n) => Math.round(n * 100) / 100;
const normState = (v) => String(v || '').trim().toLowerCase();
const DEFAULT_DELIVERY = { enabled: true, homeState: 'Andhra Pradesh', withinStateCharge: 50, outsideStateCharge: 100, stateRates: [], freeDeliveryAbove: 999 };
const DEFAULT_GST = { enabled: false, rate: 3, inclusive: false };
function normalizeDelivery(raw) {
  const merged = { ...DEFAULT_DELIVERY, ...(raw || {}) };
  if (raw && raw.withinStateCharge === undefined && Array.isArray(raw.tiers) && raw.tiers.length) {
    const legacy = Number(raw.tiers[0]?.charge) || 0;
    merged.withinStateCharge = legacy; merged.outsideStateCharge = legacy;
  }
  merged.enabled = raw?.enabled ?? true;
  merged.stateRates = Array.isArray(merged.stateRates) ? merged.stateRates : [];
  return merged;
}
function itemDeliveryCharge(product, destState, s) {
  const cfg = product?.delivery;
  if (cfg && cfg.chargeEnabled === false) return 0;
  const isHome = !destState || normState(destState) === normState(s.homeState);
  if (!isHome) {
    const override = (Array.isArray(s.stateRates) ? s.stateRates : []).find((r) => normState(r?.state) === normState(destState));
    if (override) return Math.max(0, Number(override.charge) || 0);
  }
  if (cfg && cfg.chargeEnabled) return Math.max(0, Number(isHome ? cfg.withinState : cfg.outsideState) || 0);
  if (!s.enabled) return 0;
  return Math.max(0, Number(isHome ? s.withinStateCharge : s.outsideStateCharge) || 0);
}
const deliveryFor = (subtotal, s, products, destState) => {
  if (s.freeDeliveryAbove > 0 && subtotal >= s.freeDeliveryAbove) return 0;
  return (products.length ? products : [null]).reduce((max, p) => Math.max(max, itemDeliveryCharge(p, destState, s)), 0);
};
const gstOnTop = (subtotal, gst) => (!gst?.enabled || !(gst.rate > 0) || gst.inclusive ? 0 : Math.round((subtotal * gst.rate) / 100));
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatINR = (n) => (Math.round(Math.abs(n) * 100) % 100 !== 0 ? inrPaise : inrWhole).format(n);

// ── Fixtures ─────────────────────────────────────────────────────────────────
const user = db.collection('users').doc(uid);
const ledger = user.collection('rewardLedger');
const cards = user.collection('scratchCards');
const addresses = user.collection('addresses');
const tracked = {
  'siteSettings/dealer': db.doc('siteSettings/dealer'),
  'dealerPricing/current': db.doc('dealerPricing/current'),
  'siteSettings/rewards': db.doc('siteSettings/rewards'),
  'siteSettings/scratchWin': db.doc('siteSettings/scratchWin'),
  [`dealers/<shopper>`]: db.doc(`dealers/${uid}`),
  [`carts/<shopper>`]: db.doc(`carts/${uid}`),
  [`users/<shopper>/rewardState/lock`]: db.doc(`users/${uid}/rewardState/lock`),
};
const dealerRef = tracked['dealers/<shopper>'];
const settingsRef = tracked['siteSettings/dealer'];
const pricingRef = tracked['dealerPricing/current'];
const rewardsRef = tracked['siteSettings/rewards'];
const scratchRef = tracked['siteSettings/scratchWin'];
const cartRef = tracked['carts/<shopper>'];

const normalize = (v) => {
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalize(v[k])]));
  return v;
};
const sameData = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

const created = new Set();
const sweep = async () => {
  const ids = new Set(created);
  for (const d of (await db.collection('payments').where('uid', '==', uid).get()).docs) if (d.id.startsWith(PREFIX)) ids.add(d.id);
  for (const d of (await db.collection('orders').where('userId', '==', uid).get()).docs) if (d.id.startsWith(PREFIX)) ids.add(d.id);
  for (const id of await cards.listDocuments().then((l) => l.map((x) => x.id))) if (id.startsWith(PREFIX)) ids.add(id);
  const counts = { orders: 0, payments: 0, ledger: 0, cards: 0 };
  for (const d of (await ledger.get()).docs) {
    if (d.id.includes(PREFIX) || [...ids].some((id) => d.id.includes(id))) { await d.ref.delete(); counts.ledger++; }
  }
  for (const id of ids) {
    if ((await cards.doc(id).get()).exists) { await cards.doc(id).delete(); counts.cards++; }
    if ((await db.collection('orders').doc(id).get()).exists) { await db.collection('orders').doc(id).delete(); counts.orders++; }
    if ((await db.collection('payments').doc(id).get()).exists) { await db.collection('payments').doc(id).delete(); counts.payments++; }
  }
  return counts;
};

// Leftovers of an earlier interrupted run (only documents carrying this script's fake order ids).
{
  const c = await sweep();
  if (c.orders + c.payments + c.ledger + c.cards) log(`removed leftovers of an earlier run: ${JSON.stringify(c)}`);
}

// Pre-flight, before anything is written.
const me = (await user.get()).data() || {};
if (me.role === 'admin') throw new Error('refusing: the test shopper is an admin, so the rules checks would mean nothing');
try {
  const r = await realFetch(BASE, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  throw new Error(`dev server not reachable at ${BASE}: ${e.message}`);
}

// Snapshot: existence and full data of everything this run will change.
const snaps = {};
for (const [name, ref] of Object.entries(tracked)) {
  const s = await ref.get();
  snaps[name] = { exists: s.exists, data: s.exists ? s.data() : null };
}
const ledgerSnap = new Map((await ledger.get()).docs.map((d) => [d.id, d.data()]));
const addressIdsBefore = new Set((await addresses.listDocuments()).map((d) => d.id));
log(`snapshot taken: ${Object.entries(snaps).map(([n, s]) => `${n} ${s.exists ? 'exists' : 'absent'}`).join('; ')}; ${ledgerSnap.size} ledger entries`);

// The product: active, in stock, a plain price (no silver pricing), cheap enough that a dealer cart needs 2+ units.
let MIN = 2000;
const activeProducts = (await db.collection('products').where('flags.isActive', '==', true).limit(200).get()).docs
  .map((d) => ({ id: d.id, p: d.data() }))
  .filter(({ p }) => !p.silverPricing?.enabled && Number(p.price) > 0 && Number(p.inventory?.stock) >= 2);
let pick = activeProducts
  .map((c) => ({ ...c, price: Number(c.p.price), stock: Number(c.p.inventory.stock), q: Math.ceil(MIN / Number(c.p.price)) }))
  .filter((c) => c.price < MIN && c.q <= c.stock && c.q <= 20)
  .sort((a, b) => a.q - b.q || b.price - a.price)[0];
if (!pick) {
  const c = activeProducts.map((x) => ({ ...x, price: Number(x.p.price), stock: Number(x.p.inventory.stock) })).sort((a, b) => b.stock - a.stock)[0];
  if (!c) throw new Error('need an active in-stock product with a plain price');
  MIN = Math.ceil(c.price * 2);
  pick = { ...c, q: 2 };
  log(`note: no product fits a Rs 2,000 cart, so the dealer minimum is set to Rs ${MIN} for this run`);
}
const prod = { id: pick.id };
const p = pick.p;
const price = pick.price;
const QTY = pick.q;
const stock = pick.stock;
const RETAIL_QTY = Math.min(stock, Math.max(1, Math.ceil(1000 / price)));
const image = p.images?.[0]?.url || p.images?.[0] || p.image || '';
const DEST = 'Telangana';
const deliveryCfg = normalizeDelivery((await db.doc('siteSettings/delivery').get()).data() || null);
const gstCfg = { ...DEFAULT_GST, ...((await db.doc('siteSettings/gst').get()).data() || {}) };

const PRICING20 = { discountPercent: 20, productPrices: {} };
const unitDealer = (regular, pr) => {
  const fixed = pr.productPrices?.[prod.id];
  if (typeof fixed === 'number' && fixed > 0) return Math.min(regular, r2(fixed));
  const off = Math.round((regular * (100 - pr.discountPercent)) / 100);
  return Math.min(regular, Math.max(Math.min(1, regular), off));
};
/** What the server must charge for `qty` of the product: retail (dealer = null) or for an approved dealer on these prices. */
function expected(qty, dealer = null) {
  const regularSubtotal = r2(price * qty);
  let subtotal = regularSubtotal;
  let applies = false;
  let unit = price;
  if (dealer) {
    unit = unitDealer(price, dealer);
    const ds = r2(unit * qty);
    if (regularSubtotal >= MIN && ds < regularSubtotal) { subtotal = ds; applies = true; }
  }
  const delivery = deliveryFor(subtotal, deliveryCfg, [p], DEST);
  const gst = gstOnTop(subtotal, gstCfg);
  const total = r2(subtotal + delivery + gst);
  return { regularSubtotal, subtotal, applies, unit: applies ? unit : price, delivery, gst, total, paise: Math.round(total * 100), savings: applies ? r2(regularSubtotal - subtotal) : 0 };
}
const exRetail = expected(QTY, null);
const exDealer = expected(QTY, PRICING20);
const exUnder = expected(1, PRICING20);
const exRetailQty = expected(RETAIL_QTY, null);

const APP = {
  businessName: 'Live Test Traders', businessType: 'retail', contactName: 'Live Tester', phone: '9000000000',
  city: 'Hyderabad', state: DEST, gstin: '29ABCDE1234F1Z5', message: 'Automated live test application. Removed after the run.',
};
const APP_KEYS = Object.keys(APP);
const addrFixture = { userId: uid, fullName: 'Preview Shopper', phoneNumber: '9000000000', pinCode: '500001', locality: 'Test Locality',
  address: '1 Demo Street', city: 'Hyderabad', state: DEST, isDefault: true };

const cart = (qty, extra = {}) => ({ items: [{ productId: prod.id, quantity: qty }], shippingState: DEST, ...extra });
const adminReview = async (status, note = '') => {
  const s = await dealerRef.get();
  const first = status === 'approved' && !s.data()?.approvedAt;
  await dealerRef.update({ status, reviewNote: note, reviewedAt: FV.serverTimestamp(), reviewedBy: 'dealer-loyalty-live', updatedAt: FV.serverTimestamp(), ...(first ? { approvedAt: FV.serverTimestamp() } : {}) });
};
const adminApplication = (status) =>
  dealerRef.set({ uid, ...APP, status, appliedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
    ...(status === 'pending' ? {} : { reviewNote: '', reviewedAt: FV.serverTimestamp(), reviewedBy: 'dealer-loyalty-live' }),
    ...(status === 'approved' ? { approvedAt: FV.serverTimestamp() } : {}) });
const setProgramme = (enabled) =>
  settingsRef.set({ enabled, minOrder: MIN, ...(enabled ? { enabledAt: FV.serverTimestamp() } : {}), updatedAt: FV.serverTimestamp() });
const setPricing = (pr) => pricingRef.set({ discountPercent: pr.discountPercent, productPrices: pr.productPrices, updatedAt: FV.serverTimestamp() });
const setCart = (qty) =>
  cartRef.set({
    items: { [prod.id]: { id: prod.id, name: String(p.name || 'Product'), price, image: typeof image === 'string' ? image : '',
      quantity: qty, stock, category: String(p.category || ''), addedAt: Date.now() } },
    updatedAt: new Date().toISOString(),
  });

// Tier spend as the spec states it: rupees paid online (payments.amountPaise) for delivered, non-dealer orders.
async function tierSpendOf(excludeId = '', includeDealer = false) {
  const pays = (await db.collection('payments').where('uid', '==', uid).get()).docs.filter((d) => d.id !== excludeId);
  if (!pays.length) return 0;
  const orders = await db.getAll(...pays.map((d) => db.collection('orders').doc(d.id)));
  let paise = 0;
  pays.forEach((d, i) => {
    const pay = d.data();
    if ((pay.dealer === true && !includeDealer) || orders[i].data()?.status !== 'delivered') return;
    const a = Number(pay.amountPaise) || 0;
    if (a > 0) paise += Math.round(a);
  });
  return paise / 100;
}
const tierOf = (spend, tiers) => { let i = 0; tiers.forEach((t, k) => { if (spend >= t.minSpend) i = k; }); return { index: i, ...tiers[i] }; };

/** A paid checkout through the real create-order and verify-payment (fake Razorpay), then the order document the storefront writes. */
async function paidOrder({ qty, pricing, tag, delivered = true }) {
  const r = await call(createOrder, cart(qty, pricing ? { pricing } : {}), await idToken());
  if (r.status !== 200) throw new Error(`create-order ${tag}: HTTP ${r.status} ${JSON.stringify(r.json)}`);
  const rzp = r.json.order_id;
  created.add(rzp);
  const o = rzpOrders.get(rzp);
  Object.assign(o, { status: 'paid', amount_paid: o.amount, payments: [{ id: `pay_${rzp}`, status: 'captured' }] });
  const sig = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${rzp}|pay_${rzp}`).digest('hex');
  const v = await call(verifyPayment, { razorpay_order_id: rzp, razorpay_payment_id: `pay_${rzp}`, razorpay_signature: sig });
  if (v.status !== 200 || v.json?.paymentRecorded !== true) throw new Error(`verify-payment ${tag}: HTTP ${v.status} ${JSON.stringify(v.json)}`);
  const total = r.json.amount / 100;
  const dealerPriced = o.notes?.rw_dealer === '1';
  const unit = dealerPriced ? unitDealer(price, PRICING20) : price;
  await db.collection('orders').doc(rzp).set({
    demo: true, userId: uid, userEmail: creds.email, userName: 'Preview Shopper', orderId: `DL-${tag}-${rzp.slice(-4)}`,
    items: [{ productId: prod.id, name: p.name, image: typeof image === 'string' ? image : '', price: dealerPriced ? unit : price, quantity: qty }],
    subtotal: dealerPriced ? r2(unit * qty) : r2(price * qty), discount: 0, deliveryCharge: 0, taxAmount: 0, total,
    ...(dealerPriced ? { pricing: 'dealer', regularSubtotal: r2(price * qty), dealerSavings: r2(price * qty - unit * qty), buyerBusiness: { name: APP.businessName, gstin: APP.gstin } } : {}),
    paymentMethod: 'Razorpay', paymentStatus: 'paid', razorpayOrderId: rzp, razorpayPaymentId: `pay_${rzp}`,
    shippingAddress: { fullName: 'Preview Shopper', mobile: '9000000000', pincode: '500001', address: '1 Demo Street', city: 'Hyderabad', state: DEST, addressType: 'home' },
    status: delivered ? 'delivered' : 'pending', createdAt: T.fromMillis(Date.now() - 2 * 864e5), updatedAt: T.now(),
    ...(delivered ? { deliveredAt: T.now() } : {}),
    statusHistory: [{ status: delivered ? 'delivered' : 'pending', timestamp: T.now(), note: 'Live check' }],
  });
  return { rzp, total, paise: r.json.amount, notes: o.notes };
}
const reconcile = async (rzp) => call(notifyOrder, { action: 'reconcile-rewards', orderId: rzp }, await idToken());
const readDoc = async (ref) => (await ref.get()).data();

/** A create-order the server must refuse (and nothing may reach Razorpay). */
async function refused(label, body, status, code, { token, pricing } = {}) {
  const before = rzpOrders.size;
  const r = await call(createOrder, body, token === undefined ? await idToken() : token);
  const ok = r.status === status && r.json?.code === code && (pricing === undefined || r.json?.pricing === pricing) && rzpOrders.size === before;
  check(label, ok, `HTTP ${r.status} ${JSON.stringify({ code: r.json?.code, pricing: r.json?.pricing })}; Razorpay orders created: ${rzpOrders.size - before}`);
  return r;
}
async function charged(label, body, wantPaise) {
  const r = await call(createOrder, body, await idToken());
  check(label, r.status === 200 && r.json?.amount === wantPaise, `HTTP ${r.status}, amount ${r.json?.amount}, want ${wantPaise} ${r.status !== 200 ? JSON.stringify(r.json) : ''}`);
  return r;
}

// ── Browser helpers ──────────────────────────────────────────────────────────
let browser;
const uiErrors = [];
let phase = 'browse';
const bodyText = (page) => page.evaluate(() => document.body.textContent || '');
const waitText = (page, re, timeout = 30_000) =>
  page.waitForFunction(([src, flags]) => new RegExp(src, flags).test(document.body.textContent || ''), [re.source, re.flags], { timeout }).then(() => true, () => false);
const settle = async (page) => {
  await page.waitForFunction(() => document.body.innerText.length > 300 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
};
const shot = async (page, name, full = true) => {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`no sideways overflow: ${name}`, !wide);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  log(`        shot ${name}`);
};
async function ctxFor(w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('ishaputra-theme', t); } catch { /* storage blocked */ } }, theme);
  const stub = { calls: [] };
  // UI-only: the real create-order is NOT called from the browser; it answers with a plain refusal so nothing is charged.
  await ctx.route('**/api/create-order', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: 204, body: '' });
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* not json */ }
    stub.calls.push({ body, signedIn: Boolean(req.headers().authorization) });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'Live test stub: nothing was charged' }) });
  });
  // The dev server has no /api/notify-order: route any call to the real handler in this process.
  await ctx.route('**/api/notify-order', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: 204, body: '' });
    const token = (req.headers().authorization || '').replace(/^Bearer /, '');
    const r = await call(notifyOrder, JSON.parse(req.postData() || '{}'), token);
    await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.json ?? {}) });
  });
  // Third-party geocoder used right before payment: no traffic to it from a test.
  await ctx.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => { if (m.type() === 'error') uiErrors.push({ tag: `${w}-${theme}`, phase, text: m.text() }); });
  page.on('pageerror', (e) => uiErrors.push({ tag: `${w}-${theme}`, phase, text: e.message }));
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return { ctx, page, stub };
}

/** Restores one snapshotted document: put its data back, or delete it when it did not exist. */
async function restoreDoc(name, ref) {
  const s = snaps[name];
  if (s.exists) await ref.set(s.data); else await ref.delete();
  const now = await ref.get();
  const ok = s.exists ? now.exists && sameData(now.data(), s.data) : !now.exists;
  return ok;
}

const cleanup = { errors: [] };
let fatal = null;
let dealerOrder = null;

try {
  // ═══ Fixtures: the programme on at the spec's placeholders, Scratch & Win on, rewards on ═══
  await section('Setup (admin writes, restored at the end)', async () => {
    log(`product: ${String(p.name).slice(0, 60)} at Rs ${price}, stock ${stock}; dealer cart ${QTY} x = Rs ${exDealer.regularSubtotal} regular, Rs ${exDealer.subtotal} dealer; minimum Rs ${MIN}`);
    log(`expected dealer total Rs ${exDealer.total} (delivery ${exDealer.delivery}, GST ${exDealer.gst}); retail total Rs ${exRetail.total}`);
    await dealerRef.delete();
    await setProgramme(true);
    await setPricing(PRICING20);
    // Scratch & Win on (so "no card for a dealer order" is a real test), and rewards on at 10 points per Rs 100 so tier multipliers are easy to read.
    await scratchRef.set({ enabled: true, minOrder: 499, expiryDays: 30, noWinWeight: 0,
      prizes: [{ points: 5, weight: 40 }, { points: 10, weight: 35 }, { points: 25, weight: 20 }, { points: 50, weight: 5 }],
      enabledAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    await rewardsRef.set({ ...(snaps['siteSettings/rewards'].data || {}), enabled: true, pointsPer100: 10 });
    await addresses.doc('dl-live-address').set({ ...addrFixture, createdAt: T.now(), updatedAt: T.now() });
    await setCart(QTY);
    const quote = dealerQuote([{ productId: prod.id, unit: price, quantity: QTY }], normaliseDealerSettings({ enabled: true, minOrder: MIN }), normaliseDealerPricing(PRICING20), true);
    check('this script\'s price replica agrees with dealer-core', quote.applies === exDealer.applies && quote.subtotal === exDealer.subtotal && quote.savings === exDealer.savings,
      `replica ${JSON.stringify({ a: exDealer.applies, s: exDealer.subtotal })}, dealer-core ${JSON.stringify({ a: quote.applies, s: quote.subtotal })}`);
    check('dealer cart is dearer than the minimum and the dealer total is lower', exDealer.regularSubtotal >= MIN && exDealer.subtotal < exDealer.regularSubtotal);
    check('one unit is under the minimum', exUnder.regularSubtotal < MIN && !exUnder.applies);
  });

  // ═══ 1. Rules: no application yet ═══
  await section('Rules: signed in, no dealer application', async () => {
    denied('shopper cannot read dealerPricing/current (no application)', await rGet('dealerPricing/current'));
    denied('a signed-out visitor cannot read dealerPricing/current', await rGet('dealerPricing/current', false));
    allowed('the programme switch siteSettings/dealer is public', await rGet('siteSettings/dealer', false));
    denied('shopper cannot write siteSettings/dealer', await rPatch('siteSettings/dealer', { enabled: false }));
    denied('shopper cannot list dealer applications', await rGet('dealers'));
    denied('shopper cannot read another customer\'s dealer record', await rGet('dealers/dl-live-nobody'));
    const stamp = ['appliedAt', 'updatedAt'];
    const ok = { uid, ...APP, status: 'pending' };
    const tries = [
      ['cannot create an application as approved', { data: { ...ok, status: 'approved' }, stamp }],
      ['cannot create an application as rejected', { data: { ...ok, status: 'rejected' }, stamp }],
      ['cannot create one carrying approvedAt', { data: { ...ok, approvedAt: new Date() }, stamp }],
      ['cannot create one carrying reviewNote', { data: { ...ok, reviewNote: 'approved by me' }, stamp }],
      ['cannot create one carrying reviewedBy / reviewedAt', { data: { ...ok, reviewedBy: uid, reviewedAt: new Date() }, stamp }],
      ['cannot back-date appliedAt (must be the server time)', { data: { ...ok, appliedAt: new Date(Date.now() - 864e5) }, stamp: ['updatedAt'] }],
      ['cannot put another uid in the record', { data: { ...ok, uid: 'dl-live-nobody' }, stamp }],
      ['cannot use a business type outside the list', { data: { ...ok, businessType: 'wholesale' }, stamp }],
      ['cannot send a bad phone number', { data: { ...ok, phone: 'call me' }, stamp }],
      ['cannot send a malformed GSTIN', { data: { ...ok, gstin: '29abcde1234f1z5x' }, stamp }],
      ['cannot send a one-letter business name', { data: { ...ok, businessName: 'A' }, stamp }],
      ['cannot add an unknown field', { data: { ...ok, isDealer: true }, stamp }],
    ];
    for (const [label, t] of tries) denied(`create: ${label}`, await rCommit({ path: `dealers/${uid}`, ...t }));
    denied('cannot create a record under another customer\'s id', await rCommit({ path: 'dealers/dl-live-nobody', data: { ...ok, uid: 'dl-live-nobody' }, stamp }));
    check('none of the refused writes left a record behind', !(await dealerRef.get()).exists);
  });

  // ═══ 2. Rules: pending application, plus what the server does for a non-dealer ═══
  await section('Rules: pending application', async () => {
    const stamp = ['appliedAt', 'updatedAt'];
    allowed('create: a plain pending application is accepted', await rCommit({ path: `dealers/${uid}`, data: { uid, ...APP, status: 'pending' }, stamp }));
    const d = await readDoc(dealerRef);
    is('the stored record is pending', d?.status, 'pending');
    is('only the application fields + uid, status, appliedAt, updatedAt were stored', Object.keys(d || {}).sort(), [...APP_KEYS, 'uid', 'status', 'appliedAt', 'updatedAt'].sort());
    const own = await rGet(`dealers/${uid}`);
    check('shopper reads their own application', own.status === 200 && own.json?.fields?.status?.stringValue === 'pending', why(own));
    denied('shopper cannot read dealerPricing/current while pending', await rGet('dealerPricing/current'));
    denied('shopper cannot read a product dealer price (dealerPricing/other) while pending', await rGet('dealerPricing/other'));

    const upd = [
      ['status to approved', { status: 'approved' }],
      ['status to rejected', { status: 'rejected' }],
      ['approvedAt', { approvedAt: new Date() }],
      ['reviewNote', { reviewNote: 'looks fine' }],
      ['reviewedBy', { reviewedBy: uid }],
      ['their own business name (only a rejected application can be edited)', { businessName: 'Changed Name' }],
    ];
    for (const [label, data] of upd) denied(`update: cannot set ${label}`, await rCommit({ path: `dealers/${uid}`, data, mask: Object.keys(data) }));
    denied('cannot write dealerPricing/current: discountPercent', await rPatch('dealerPricing/current', { discountPercent: 90 }));
    denied('cannot write dealerPricing/current: a product price', await rPatch('dealerPricing/current', { productPrices: { [prod.id]: 1 } }));
    denied('cannot create another dealerPricing document', await rCreate('dealerPricing', 'dl-live-other', { discountPercent: 90 }));
    denied('cannot delete dealerPricing/current', await rDelete('dealerPricing/current'));
    const still = await readDoc(dealerRef);
    check('the refused updates changed nothing', still?.status === 'pending' && !still.approvedAt && !still.reviewNote && still.businessName === APP.businessName);
    const pr = await readDoc(pricingRef);
    check('dealerPricing/current is untouched', pr?.discountPercent === 20 && Object.keys(pr?.productPrices || {}).length === 0);

    // The shopper may withdraw while pending, and apply again.
    allowed('withdraw: the shopper can delete a pending application', await rDelete(`dealers/${uid}`));
    check('the application is gone', !(await dealerRef.get()).exists);
    allowed('re-create: a fresh pending application is accepted', await rCommit({ path: `dealers/${uid}`, data: { uid, ...APP, status: 'pending' }, stamp }));

    // Server: this shopper is not a dealer (yet), so dealer prices are never given.
    log('  server (not approved):');
    await refused('pending customer sending pricing "dealer" -> 409 dealer_pricing_changed, server says retail', cart(QTY, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { pricing: 'retail' });
    await charged(`pending customer, pricing "retail" -> retail amount (${exRetail.paise} paise)`, cart(QTY, { pricing: 'retail' }), exRetail.paise);
    await charged('pending customer, no pricing sent -> still the retail amount, never cheaper', cart(QTY), exRetail.paise);
    await refused('a signed-out request sending pricing "dealer" -> 409 (retail)', cart(QTY, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { token: null, pricing: 'retail' });
    await refused('a request with a bad sign-in token claiming dealer prices -> 503 dealer_unavailable', cart(QTY, { pricing: 'dealer' }), 503, 'dealer_unavailable', { token: 'not-a-real-token' });
  });

  // ═══ 3. Rejected, then the shopper applies again ═══
  await section('Rules: rejected, then re-apply', async () => {
    await adminReview('rejected', 'Live test: please add your GSTIN');
    const r = await rGet(`dealers/${uid}`);
    check('shopper sees the reviewer note on a rejected application', r.status === 200 && r.json?.fields?.reviewNote?.stringValue === 'Live test: please add your GSTIN', why(r));
    denied('rejected: cannot flip status to approved', await rCommit({ path: `dealers/${uid}`, data: { status: 'approved' }, mask: ['status'] }));
    denied('rejected: cannot delete the record (only pending can be withdrawn)', await rDelete(`dealers/${uid}`));
    const stamp = ['appliedAt', 'updatedAt'];
    const again = { ...APP, businessName: 'Live Test Traders Ltd' };
    denied('re-apply: cannot also clear the reviewer note', await rCommit({ path: `dealers/${uid}`, data: { ...again, status: 'pending', reviewNote: '' }, mask: [...APP_KEYS, 'status', 'reviewNote'], stamp }));
    denied('re-apply: cannot also set approvedAt', await rCommit({ path: `dealers/${uid}`, data: { ...again, status: 'pending', approvedAt: new Date() }, mask: [...APP_KEYS, 'status', 'approvedAt'], stamp }));
    denied('re-apply: cannot back-date appliedAt', await rCommit({ path: `dealers/${uid}`, data: { ...again, status: 'pending', appliedAt: new Date(Date.now() - 864e5) }, mask: [...APP_KEYS, 'status', 'appliedAt'], stamp: ['updatedAt'] }));
    allowed('re-apply: new details, status back to pending', await rCommit({ path: `dealers/${uid}`, data: { ...again, status: 'pending' }, mask: [...APP_KEYS, 'status'], stamp }));
    is('the record is pending again', (await readDoc(dealerRef))?.status, 'pending');
    // Back to the application the rest of the run (and the screens) use.
    await adminApplication('pending');
  });

  // ═══ 4. Approved: rules ═══
  await section('Rules: approved dealer', async () => {
    await adminReview('approved', '');
    const r = await rGet('dealerPricing/current');
    check('shopper CAN read dealerPricing/current once approved', r.status === 200, why(r));
    is('...and sees the discount the admin set', Number(r.json?.fields?.discountPercent?.integerValue ?? r.json?.fields?.discountPercent?.doubleValue), 20);
    denied('approved: cannot write dealerPricing/current: discountPercent', await rPatch('dealerPricing/current', { discountPercent: 90 }));
    denied('approved: cannot write dealerPricing/current: a product price', await rPatch('dealerPricing/current', { productPrices: { [prod.id]: 1 } }));
    denied('approved: cannot create another dealerPricing document', await rCreate('dealerPricing', 'dl-live-other', { discountPercent: 90 }));
    denied('approved: cannot delete dealerPricing/current', await rDelete('dealerPricing/current'));
    denied('approved: cannot suspend or un-approve themselves by writing status', await rCommit({ path: `dealers/${uid}`, data: { status: 'pending' }, mask: ['status'] }));
    denied('approved: cannot write their own reviewNote', await rCommit({ path: `dealers/${uid}`, data: { reviewNote: 'all good' }, mask: ['reviewNote'] }));
    denied('approved: cannot write their own approvedAt', await rCommit({ path: `dealers/${uid}`, data: { approvedAt: new Date() }, mask: ['approvedAt'] }));
    denied('approved: cannot delete the record (only pending can be withdrawn)', await rDelete(`dealers/${uid}`));
    const pr = await readDoc(pricingRef);
    check('dealer prices are untouched by the refused writes', pr?.discountPercent === 20 && Object.keys(pr?.productPrices || {}).length === 0);
    check('the record is still approved', (await readDoc(dealerRef))?.status === 'approved');
    // Orders rule: dealer fields only on an approved dealer's own order, for the approved business.
    const base = { userId: uid, status: 'pending', paymentStatus: 'pending', total: 1 };
    const biz = { name: APP.businessName, gstin: APP.gstin };
    allowed('orders rule: approved dealer CAN create a dealer-priced order for their business', await rCreate('orders', `${PREFIX}_rules_ok`, { ...base, pricing: 'dealer', regularSubtotal: 2000, dealerSavings: 400, buyerBusiness: biz }));
    denied('orders rule: approved dealer cannot print another GSTIN', await rCreate('orders', `${PREFIX}_rules_gst`, { ...base, pricing: 'dealer', buyerBusiness: { ...biz, gstin: '27ABCDE1234F1Z5' } }));
    denied('orders rule: approved dealer cannot print another business name', await rCreate('orders', `${PREFIX}_rules_name`, { ...base, pricing: 'dealer', buyerBusiness: { ...biz, name: 'Someone Else Pvt Ltd' } }));
    denied('orders rule: pricing other than "dealer" is refused', await rCreate('orders', `${PREFIX}_rules_retail`, { ...base, pricing: 'retail' }));
    allowed('orders rule: a plain retail order (no dealer fields) is still allowed', await rCreate('orders', `${PREFIX}_rules_plain`, base));
    for (const s of ['ok', 'gst', 'name', 'retail', 'plain']) await db.collection('orders').doc(`${PREFIX}_rules_${s}`).delete();
  });

  // ═══ 5. Server: approved dealer pricing ═══
  await section('Server: approved dealer (programme on, 20% off, minimum Rs ' + MIN + ')', async () => {
    const dealerBody = cart(QTY, { pricing: 'dealer' });
    const r = await charged(`dealer cart ${QTY} x Rs ${price}, pricing "dealer" -> exactly ${exDealer.paise} paise (Rs ${exDealer.total})`, dealerBody, exDealer.paise);
    check('...which is lower than the retail amount', exDealer.paise < exRetail.paise, `${exDealer.paise} vs ${exRetail.paise}`);
    const notes = rzpOrders.get(r.json?.order_id)?.notes || {};
    check('...with notes rw_dealer=1, rw_regular=<retail subtotal>, rw_base=0', notes.rw_dealer === '1' && notes.rw_regular === String(exDealer.regularSubtotal) && notes.rw_base === '0',
      JSON.stringify({ d: notes.rw_dealer, r: notes.rw_regular, b: notes.rw_base }));
    await charged('...and an approved dealer who sends no pricing is charged the dealer amount too', cart(QTY), exDealer.paise);
    const sameCartRetail = await refused('same cart priced as "retail" by the browser -> 409 dealer_pricing_changed, server says dealer', cart(QTY, { pricing: 'retail' }), 409, 'dealer_pricing_changed', { pricing: 'dealer' });
    check('...and the 409 names the new pricing for the browser to re-price', sameCartRetail.json?.pricing === 'dealer');
    await refused('dealer cart with a coupon code -> 400 dealer_no_extras', cart(QTY, { pricing: 'dealer', couponCode: 'WELCOME10' }), 400, 'dealer_no_extras');
    await refused('dealer cart using points -> 400 dealer_no_extras', cart(QTY, { pricing: 'dealer', usePoints: true }), 400, 'dealer_no_extras');
    await refused('dealer cart using cashback -> 400 dealer_no_extras', cart(QTY, { pricing: 'dealer', useCashback: true }), 400, 'dealer_no_extras');
    await refused('a coupon with no pricing sent is refused the same way', cart(QTY, { couponCode: 'WELCOME10' }), 400, 'dealer_no_extras');

    // Under the minimum at regular prices: retail.
    await charged(`one unit (Rs ${exUnder.regularSubtotal} < Rs ${MIN}) is charged at retail (${exUnder.paise} paise)`, cart(1, { pricing: 'retail' }), exUnder.paise);
    await refused('...and sending "dealer" for it -> 409, server says retail', cart(1, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { pricing: 'retail' });
    await charged('...an under-minimum cart is a retail order in every way: a coupon code is not refused as dealer_no_extras (an unknown code just gives no discount)', cart(1, { pricing: 'retail', couponCode: 'NOSUCHCODE' }), exUnder.paise);

    // A fixed per-product dealer price wins over the percentage; it is capped at the regular price.
    const fixed = Math.max(1, Math.floor(price / 2));
    await setPricing({ discountPercent: 20, productPrices: { [prod.id]: fixed } });
    const exFixed = expected(QTY, { discountPercent: 20, productPrices: { [prod.id]: fixed } });
    await charged(`a fixed dealer price of Rs ${fixed} beats the 20% (${exFixed.paise} paise)`, cart(QTY, { pricing: 'dealer' }), exFixed.paise);
    check('...and it really is a different amount from the percentage one', exFixed.paise !== exDealer.paise);
    await setPricing({ discountPercent: 20, productPrices: { [prod.id]: price * 2 } });
    await refused('a fixed dealer price above the regular price is capped: no saving, so dealer pricing does not apply', cart(QTY, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { pricing: 'retail' });
    await charged('...and the cart is charged at the regular price', cart(QTY, { pricing: 'retail' }), exRetail.paise);
    await setPricing(PRICING20);

    // Programme off: dealers keep their status but get no dealer prices.
    await setProgramme(false);
    await refused('programme off: an approved dealer sending "dealer" -> 409, server says retail', cart(QTY, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { pricing: 'retail' });
    await charged('programme off: charged at retail', cart(QTY, { pricing: 'retail' }), exRetail.paise);
    check('programme off: the dealer record is still approved', (await readDoc(dealerRef))?.status === 'approved');
    await setProgramme(true);
    await charged('programme back on: dealer amount again', dealerBody, exDealer.paise);
  });

  // ═══ 6. Full dealer order: create -> verify -> payment record -> delivered -> reconcile ═══
  await section('Server: a full dealer order earns nothing and gets no scratch card', async () => {
    const D = await paidOrder({ qty: QTY, pricing: 'dealer', tag: 'D' });
    dealerOrder = D;
    is(`order total = server dealer total (${exDealer.paise} paise)`, D.paise, exDealer.paise);
    const pay = await readDoc(db.collection('payments').doc(D.rzp));
    check('payments record: dealer: true', pay?.dealer === true, JSON.stringify(pay && { dealer: pay.dealer }));
    is('payments record: regularSubtotal', pay?.regularSubtotal, exDealer.regularSubtotal);
    is('payments record: amountPaise is the dealer amount', pay?.amountPaise, exDealer.paise);
    is('payments record: base (points base) is 0', pay?.base, 0);
    check('payments record: bound to the shopper, verified', pay?.uid === uid && pay?.status === 'verified');
    const rec = await reconcile(D.rzp);
    check('reconcile (delivered dealer order) succeeds', rec.status === 200, JSON.stringify(rec.json));
    check('NO earn entry for the dealer order', !(await ledger.doc(`earn_${D.rzp}`).get()).exists, JSON.stringify(rec.json?.changed));
    check('NO scratch card for the dealer order', !(await cards.doc(D.rzp).get()).exists);
    check('NO scratch prize entry either', !(await ledger.doc(`scratch_${D.rzp}`).get()).exists);
    check('payment record is not stamped scratchCardGivenAt', !(await readDoc(db.collection('payments').doc(D.rzp)))?.scratchCardGivenAt);
    const rec2 = await reconcile(D.rzp);
    check('a second reconcile still gives nothing', rec2.status === 200 && !rec2.json.changed.some((c) => /earn_|scratchCards\//.test(c)), JSON.stringify(rec2.json?.changed));
    check('the order carries no points earned', (await readDoc(db.collection('orders').doc(D.rzp)))?.pointsEarned === undefined);
  });

  // ═══ 7. Suspended ═══
  await section('Suspended dealer', async () => {
    await adminReview('suspended', 'Live test: paused');
    denied('suspended: shopper cannot read dealerPricing/current', await rGet('dealerPricing/current'));
    const own = await rGet(`dealers/${uid}`);
    check('suspended: shopper still reads their own record (sees the note)', own.status === 200 && own.json?.fields?.reviewNote?.stringValue === 'Live test: paused', why(own));
    await refused('suspended: sending "dealer" -> 409, server says retail', cart(QTY, { pricing: 'dealer' }), 409, 'dealer_pricing_changed', { pricing: 'retail' });
    await charged(`suspended: charged at retail (${exRetail.paise} paise)`, cart(QTY, { pricing: 'retail' }), exRetail.paise);
    denied('orders rule: a suspended dealer cannot create a dealer-priced order', await rCreate('orders', `${PREFIX}_rules_susp`, { userId: uid, status: 'pending', paymentStatus: 'pending', total: 1, pricing: 'dealer', buyerBusiness: { name: APP.businessName, gstin: APP.gstin } }));
    await db.collection('orders').doc(`${PREFIX}_rules_susp`).delete();
  });

  // ═══ 8. Tier multiplier (still suspended, so these orders are plain retail orders) ═══
  let goldTiers = null;
  await section('Server: tier multiplier on earned points', async () => {
    // R1 under the shop's own tiers.
    const t1 = normaliseRewardSettings({ ...(snaps['siteSettings/rewards'].data || {}), enabled: true, pointsPer100: 10 });
    const R1 = await paidOrder({ qty: RETAIL_QTY, pricing: 'retail', tag: 'R1' });
    check('R1 is a retail order: its payment record has no dealer flag', (await readDoc(db.collection('payments').doc(R1.rzp)))?.dealer === undefined);
    const spend1 = await tierSpendOf(R1.rzp);
    const tier1 = tierOf(spend1, t1.tiers);
    log(`  R1: other delivered online spend Rs ${spend1} -> ${tier1.name} (${tier1.multiplier}x) under the shop's tiers`);
    const rec1 = await reconcile(R1.rzp);
    check('R1 reconcile succeeds', rec1.status === 200, JSON.stringify(rec1.json));
    const pay1 = await readDoc(db.collection('payments').doc(R1.rzp));
    const rate1 = gstCfg.enabled && gstCfg.inclusive && gstCfg.rate > 0 ? gstCfg.rate : 0;
    const base1 = Math.floor(((exRetailQty.subtotal * 100) / (100 + rate1)) * 100 + 1e-6) / 100;
    is('R1 payment base = product amount (the points base)', pay1?.base, base1);
    const earn1 = await readDoc(ledger.doc(`earn_${R1.rzp}`));
    const want1 = Math.floor((Math.min(base1, R1.paise / 100) * 10 * Math.round(tier1.multiplier * 100)) / 10000 + 1e-9);
    check('R1 earned points = base x 10/100 x tier multiplier', earn1?.amount === want1, `got ${earn1?.amount}, want ${want1}`);
    check('...and the earn entry records the tier and multiplier', earn1?.tierName === tier1.name && earn1?.multiplier === tier1.multiplier, JSON.stringify({ n: earn1?.tierName, m: earn1?.multiplier }));
    is('...and agrees with pointsForBase()', want1, pointsForBase(Math.min(base1, R1.paise / 100), t1, tier1.multiplier));
    check('retail control: R1 (>= Rs 499, delivered after Scratch & Win was switched on) gets a scratch card', (await cards.doc(R1.rzp).get()).exists);
    const rec1b = await reconcile(R1.rzp);
    check('R1: a second reconcile earns nothing more', rec1b.status === 200 && !rec1b.json.changed.some((c) => c === `earn_${R1.rzp}`), JSON.stringify(rec1b.json?.changed));

    // R2 with the tiers set so that this shopper's spend lands in a 1.25x tier.
    const R2 = await paidOrder({ qty: RETAIL_QTY, pricing: 'retail', tag: 'R2' });
    const spend2 = await tierSpendOf(R2.rzp);
    const G = Math.floor(spend2);
    check('R2: the shopper has delivered online spend of at least Rs 1 to set a Gold threshold on', G >= 1, `spend ${spend2}`);
    goldTiers = [
      { name: 'Silver', minSpend: 0, multiplier: 1 },
      { name: 'Gold', minSpend: G, multiplier: 1.25 },
      { name: 'Platinum', minSpend: G + 100000, multiplier: 1.5 },
      { name: 'Premium', minSpend: G + 200000, multiplier: 2 },
    ];
    await rewardsRef.set({ ...(snaps['siteSettings/rewards'].data || {}), enabled: true, pointsPer100: 10, tiers: goldTiers });
    log(`  R2: other delivered online spend Rs ${spend2}; tiers set to Gold from Rs ${G} at 1.25x`);
    const rec2 = await reconcile(R2.rzp);
    check('R2 reconcile succeeds', rec2.status === 200, JSON.stringify(rec2.json));
    const pay2 = await readDoc(db.collection('payments').doc(R2.rzp));
    const earn2 = await readDoc(ledger.doc(`earn_${R2.rzp}`));
    const want2 = Math.floor((Math.min(pay2?.base ?? 0, R2.paise / 100) * 10 * 125) / 10000 + 1e-9);
    const plain2 = Math.floor((Math.min(pay2?.base ?? 0, R2.paise / 100) * 10) / 100 + 1e-9);
    check('R2 earned points = base x 10/100 x 1.25', earn2?.amount === want2, `got ${earn2?.amount}, want ${want2}`);
    check('...which is more than the 1x amount would have been', want2 > plain2, `${want2} vs ${plain2}`);
    check('...and the earn entry says Gold at 1.25x', earn2?.tierName === 'Gold' && earn2?.multiplier === 1.25, JSON.stringify({ n: earn2?.tierName, m: earn2?.multiplier }));
    is('...and agrees with pointsForBase()', want2, pointsForBase(Math.min(pay2?.base ?? 0, R2.paise / 100), normaliseRewardSettings({ enabled: true, pointsPer100: 10, tiers: goldTiers }), 1.25));
    // Dealer-priced orders do not count towards the tier: the delivered dealer order is the whole difference.
    if (dealerOrder) {
      const withDealer = await tierSpendOf('', true);
      const without = await tierSpendOf('');
      check('the delivered dealer order is in the shopper\'s payments but not in tier spend',
        r2(withDealer - without) === r2(dealerOrder.paise / 100), `with ${withDealer}, without ${without}, dealer order Rs ${dealerOrder.paise / 100}`);
    }
  });

  // ═══ 9. Browser: the real storefront as the approved dealer ═══
  await section('Browser: dealer screens (390 and 1440, light and dark)', async () => {
    await adminReview('approved', '');
    await setProgramme(true);
    await setPricing(PRICING20);
    browser = await chromium.launch();
    const tiersNow = normaliseRewardSettings((await readDoc(rewardsRef)) || {}).tiers;
    const spendNow = await tierSpendOf('');
    const tierNow = tierOf(spendNow, tiersNow);
    const memberNumber = formatMemberNumber(memberDigits(uid), MEMBER_PREFIX);
    const hasMemberSince = Boolean(me.createdAt);
    const unit = exDealer.unit;
    const pct = Math.round((1 - unit / price) * 100);
    log(`  expected: dealer unit Rs ${unit} (-${pct}%), checkout total ${formatINR(exDealer.total)}, wallet tier ${tierNow.name}`);

    for (const theme of ['light', 'dark']) {
      for (const [w, h] of [[390, 844], [1440, 900]]) {
        const tag = `${w}-${theme}`;
        const label = `${w}px ${theme}`;
        log(`  -- ${label}`);
        const { ctx, page, stub } = await ctxFor(w, h, theme);
        const ui = async (what, fn) => {
          try { await fn(); } catch (e) { check(`${label}: ${what}`, false, `step crashed: ${String(e?.message || e).split('\n')[0]}`); }
        };
        try {
          await setCart(QTY);

          // Product card (search results page uses the shared card).
          await ui('product card shows the dealer price', async () => {
            await page.goto(`${BASE}/search-results?q=${encodeURIComponent(String(p.name))}`, { waitUntil: 'load' });
            const cardLoc = page.locator('article.card-product').filter({ has: page.locator(`a[href="/product/${prod.id}"]`) }).first();
            let found = await cardLoc.waitFor({ timeout: 25_000 }).then(() => true, () => false);
            let loc = cardLoc;
            if (!found) {
              await page.goto(`${BASE}/products`, { waitUntil: 'load' });
              loc = page.locator('article, li').filter({ has: page.locator(`a[href="/product/${prod.id}"]`) }).first();
              found = await loc.waitFor({ timeout: 25_000 }).then(() => true, () => false);
            }
            if (!found) return void check(`${label}: product card found`, false, 'the product is not in the search results or on /products page 1');
            await page.waitForFunction((id) => /Dealer price/i.test(document.querySelector(`a[href="/product/${id}"]`)?.closest('article, li')?.textContent || ''), prod.id, { timeout: 30_000 }).catch(() => {});
            const t = (await loc.textContent()) || '';
            check(`${label}: card shows "Dealer price" ${formatINR(unit)}`, /Dealer price/i.test(t) && t.includes(formatINR(unit)), t.replace(/\s+/g, ' ').slice(0, 140));
            check(`${label}: card shows the regular price ${formatINR(price)} struck and the chip`, t.includes(formatINR(price)) && (pct <= 0 || /Dealer\s*[\u2212-]\s*\d+%/.test(t)));
            await loc.scrollIntoViewIfNeeded().catch(() => {});
            await loc.screenshot({ path: `${OUT}/dealer-product-card-${tag}.png` });
            log(`        shot dealer-product-card-${tag}`);
            await shot(page, `dealer-product-list-${tag}`, false);
          });

          // Product page.
          await ui('product page shows the dealer price', async () => {
            await page.goto(`${BASE}/product/${prod.id}`, { waitUntil: 'load' });
            await waitText(page, /Dealer price/i);
            await settle(page);
            const t = await bodyText(page);
            check(`${label}: product page shows "Dealer price" ${formatINR(unit)} and Regular ${formatINR(price)}`, /Dealer price/i.test(t) && t.includes(formatINR(unit)) && t.includes(`Regular`) && t.includes(formatINR(price)));
            check(`${label}: product page says dealer prices apply from ${formatINR(MIN)}`, t.includes(`Dealer prices apply on orders of ${formatINR(MIN)} or more at regular prices.`));
            await shot(page, `dealer-product-page-${tag}`, false);
          });

          // Cart drawer (desktop header). On the phone the cart is the checkout page's first step, checked below.
          if (w >= 1024) {
            await ui('cart drawer shows the dealer subtotal', async () => {
              await page.goto(`${BASE}/`, { waitUntil: 'load' });
              await settle(page);
              await page.getByRole('button', { name: /^Cart/ }).first().click();
              const drawer = page.locator('[data-cart-drawer]');
              await drawer.waitFor({ timeout: 20_000 });
              await waitText(page, /Dealer prices applied/i);
              await page.waitForTimeout(800);
              const t = (await drawer.textContent()) || '';
              check(`${label}: drawer says "Dealer prices applied" with the saving ${formatINR(exDealer.savings)}`, /Dealer prices applied/.test(t) && t.includes(formatINR(exDealer.savings)));
              check(`${label}: drawer Item total = ${formatINR(exDealer.subtotal)} with ${formatINR(exDealer.regularSubtotal)} struck`, t.includes(formatINR(exDealer.subtotal)) && t.includes(formatINR(exDealer.regularSubtotal)));
              check(`${label}: drawer line shows ${formatINR(unit)} each and the Dealer chip`, t.includes(`${formatINR(unit)} each`) && /Dealer\s*[\u2212-]\s*\d+%/.test(t));
              await shot(page, `dealer-cart-drawer-${tag}`, false);
              await page.keyboard.press('Escape');
            });
          }

          // Checkout with a dealer cart.
          await ui('checkout shows the dealer prices', async () => {
            await page.goto(`${BASE}/checkout`, { waitUntil: 'load' });
            await waitText(page, /Dealer prices applied/i);
            await settle(page);
            const t = await bodyText(page);
            check(`${label}: checkout shows the "Dealer prices applied" notice`, /Dealer prices applied/.test(t));
            check(`${label}: bill rows "Items at regular prices" ${formatINR(exDealer.regularSubtotal)} and "Dealer prices" \u2212${formatINR(exDealer.savings)}`,
              t.includes('Items at regular prices') && t.includes(formatINR(exDealer.regularSubtotal)) && t.includes('Dealer prices') && t.includes(`\u2212${formatINR(exDealer.savings)}`));
            check(`${label}: no plain "Item total" row (replaced by the two dealer rows)`, !/Item total/.test(t));
            const couponSel = w >= 768 ? '#desktop-coupon' : '#mobile-coupon';
            check(`${label}: coupon field is disabled`, await page.locator(couponSel).isDisabled());
            check(`${label}: coupon note "Coupons, points and cashback don't apply to dealer-priced orders."`, /Coupons, points and cashback don.t apply to dealer-priced orders\./.test(t));
            check(`${label}: no rewards card on a dealer order`, !/Your rewards/i.test(t));
            await shot(page, `dealer-checkout-${tag}`);

            // One slide (phone) or one click (desktop) sends exactly one create-order, priced as dealer, with no extras.
            phase = 'pay';
            stub.calls.length = 0;
            if (w < 768) {
              await page.getByRole('button', { name: /Proceed to checkout/ }).click();
              const thumb = page.getByRole('button', { name: /Press Enter or slide to confirm/ });
              await thumb.waitFor({ timeout: 30_000 });
              const t2 = await bodyText(page);
              check(`${label}: step 2 bill still shows the dealer rows`, t2.includes('Items at regular prices') && t2.includes('Dealer prices'));
              is(`${label}: slider amount is the server-expected total`, await thumb.getAttribute('aria-label'), `Pay ${formatINR(exDealer.total)}. Press Enter or slide to confirm`);
              await shot(page, `dealer-checkout-pay-${tag}`);
              await thumb.focus();
              await page.keyboard.press('Enter');
            } else {
              const payBtn = page.getByRole('button', { name: /^Pay / });
              await payBtn.waitFor({ timeout: 30_000 });
              is(`${label}: Pay button amount is the server-expected total`, (await payBtn.textContent())?.trim(), `Pay ${formatINR(exDealer.total)}`);
              await payBtn.click();
            }
            await until(() => stub.calls.length >= 1, 30_000);
            await page.waitForTimeout(2500);
            is(`${label}: exactly 1 create-order call from one slide/click`, stub.calls.length, 1);
            const b = stub.calls[0]?.body || {};
            check(`${label}: it was priced as dealer, with no coupon, points or cashback`, b.pricing === 'dealer' && !b.couponCode && b.usePoints === false && b.useCashback === false,
              JSON.stringify({ pricing: b.pricing, couponCode: b.couponCode, usePoints: b.usePoints, useCashback: b.useCashback }));
            check(`${label}: it carried the cart and the dealer amount (${exDealer.paise} paise), signed in`,
              JSON.stringify(b.items) === JSON.stringify([{ productId: prod.id, quantity: QTY }]) && b.amount === exDealer.paise && b.amountBeforeRewards === exDealer.paise && stub.calls[0]?.signedIn === true,
              JSON.stringify({ items: b.items, amount: b.amount, before: b.amountBeforeRewards }));
            phase = 'browse';
          });

          // Under the minimum: the nudge, regular prices, and the rewards card back as a control.
          await ui('under-minimum cart shows the nudge', async () => {
            await setCart(1);
            await page.goto(`${BASE}/checkout`, { waitUntil: 'load' });
            await waitText(page, /more to unlock dealer prices/i);
            await settle(page);
            const t = await bodyText(page);
            check(`${label}: nudge "Add ${formatINR(MIN - price)} more to unlock dealer prices."`, t.includes(`Add ${formatINR(MIN - price)} more to unlock dealer prices.`));
            check(`${label}: nudge says these items cost ${formatINR(price - unitDealer(price, PRICING20))} less at dealer prices`, t.includes(`${formatINR(price - unitDealer(price, PRICING20))} less at dealer prices`));
            check(`${label}: under the minimum the bill is retail (Item total, no dealer rows)`, /Item total/.test(t) && !t.includes('Items at regular prices'));
            const bal = summariseRewards((await ledger.get()).docs.map((d) => {
              const x = d.data();
              return { currency: x.currency, amount: Number(x.amount) || 0, status: x.status, kind: x.kind || 'adjust', unlockAtMs: x.unlockAt?.toMillis?.() || 0, held: x.held === true };
            }), Date.now());
            if (bal.points.available + bal.points.pending + bal.cashback.available + bal.cashback.pending > 0) {
              check(`${label}: control: the rewards card IS shown on a retail cart (so its absence on the dealer cart means something)`, /Your rewards/i.test(t));
            } else {
              log(`      (no balance to show a rewards card: control skipped at ${label})`);
            }
            await shot(page, `dealer-checkout-nudge-${tag}`);
          });
          await setCart(QTY);

          // Wallet: the member card.
          await ui('wallet member card', async () => {
            await page.goto(`${BASE}/wallet`, { waitUntil: 'load' });
            const group = page.getByRole('group', { name: /member card/i }).first();
            await group.waitFor({ timeout: 30_000 });
            await settle(page);
            const t = ((await group.textContent()) || '').replace(/\s+/g, ' ');
            check(`${label}: member card names the tier ${tierNow.name} (${tierNow.multiplier}x points)`, t.includes(tierNow.name) && t.includes(`${tierNow.multiplier}x points`), t.slice(0, 160));
            check(`${label}: member card shows the member number ${memberNumber}`, t.includes(memberNumber));
            check(`${label}: member card shows the Dealer chip`, /Dealer/.test(t));
            if (hasMemberSince) check(`${label}: member card shows "Member since"`, /Member since/.test(t));
            await group.screenshot({ path: `${OUT}/dealer-member-card-${tag}.png` });
            await shot(page, `dealer-wallet-${tag}`);
          });

          // The /dealer page, approved.
          await ui('/dealer approved state', async () => {
            await page.goto(`${BASE}/dealer`, { waitUntil: 'load' });
            await waitText(page, /Dealer account/i);
            await settle(page);
            const t = await bodyText(page);
            check(`${label}: /dealer shows the approved account card for "${APP.businessName}"`, /Dealer account/.test(t) && t.includes(APP.businessName));
            check(`${label}: /dealer says "Dealer prices on" and lists the terms (20% off, from ${formatINR(MIN)})`,
              t.includes('Dealer prices on') && t.includes('20% off regular prices') && t.includes(`Applies on orders of ${formatINR(MIN)} or more at regular prices.`));
            check(`${label}: /dealer offers "Shop at dealer prices"`, /Shop at dealer prices/.test(t));
            await shot(page, `dealer-page-approved-${tag}`);
          });
        } finally {
          await ctx.close();
        }
      }
    }
    const benign = /favicon|DevTools|Download the React/;
    const stubbed = /Error placing order|Could not start the payment|Live test stub/;
    const real = uiErrors.filter((e) => !benign.test(e.text) && !(e.phase === 'pay' && stubbed.test(e.text)));
    check('no console errors in any browser run (known-benign ones and the stubbed pay refusal ignored)', real.length === 0,
      real.slice(0, 6).map((e) => `[${e.tag}] ${e.text.slice(0, 160)}`).join(' | '));
    log(`      (${uiErrors.length - real.length} console messages ignored as known-benign or the expected stub refusal)`);
  });
} catch (e) {
  fatal = e;
  failures++;
  log(`  FAIL  run aborted -- ${e?.message || e}`);
} finally {
  log('\n== Cleanup');
  try { if (browser) await browser.close(); } catch (e) { cleanup.errors.push(`browser: ${e?.message}`); }
  let counts = { orders: 0, payments: 0, ledger: 0, cards: 0 };
  try { counts = await sweep(); } catch (e) { cleanup.errors.push(`sweep: ${e?.message}`); }
  const restored = [];
  for (const [name, ref] of Object.entries(tracked)) {
    try {
      const ok = await restoreDoc(name, ref);
      restored.push(`${name}: ${snaps[name].exists ? 'restored as it was' : 'deleted (did not exist)'}${ok ? '' : '  !! DOES NOT MATCH THE SNAPSHOT'}`);
      if (!ok) cleanup.errors.push(`${name} does not match its snapshot`);
    } catch (e) { cleanup.errors.push(`${name}: ${e?.message}`); }
  }
  try { await addresses.doc('dl-live-address').delete(); } catch (e) { cleanup.errors.push(`address: ${e?.message}`); }
  try {
    // The shopper's ledger must be exactly what it was: put back anything changed, report anything unexpected.
    const now = new Map((await ledger.get()).docs.map((d) => [d.id, d.data()]));
    let fixed = 0;
    for (const [id, data] of ledgerSnap) {
      if (!now.has(id) || !sameData(now.get(id), data)) { await ledger.doc(id).set(data); fixed++; }
    }
    const extras = [...now.keys()].filter((id) => !ledgerSnap.has(id));
    const after = (await ledger.get()).docs.map((d) => d.id).sort();
    const same = JSON.stringify(after) === JSON.stringify([...ledgerSnap.keys()].sort());
    if (fixed) log(`  put back ${fixed} ledger entries that had changed`);
    if (extras.length) cleanup.errors.push(`unexpected extra ledger entries left: ${extras.length}`);
    log(`  ledger back to its start: ${same} (${after.length} entries)`);
  } catch (e) { cleanup.errors.push(`ledger: ${e?.message}`); }
  try {
    const addrAfter = new Set((await addresses.listDocuments()).map((d) => d.id));
    const addressesOk = [...addrAfter].every((id) => addressIdsBefore.has(id)) && [...addressIdsBefore].every((id) => addrAfter.has(id));
    log(`  saved addresses back to their start: ${addressesOk}`);
    if (!addressesOk) cleanup.errors.push('addresses differ from the start');
  } catch (e) { cleanup.errors.push(`addresses: ${e?.message}`); }
  log(`  deleted ${counts.orders} orders, ${counts.payments} payments, ${counts.ledger} ledger entries, ${counts.cards} scratch cards created by this run`);
  for (const line of restored) log(`  ${line}`);
  if (cleanup.errors.length) { failures += cleanup.errors.length; for (const e of cleanup.errors) log(`  FAIL  cleanup: ${e}`); }
  else log('  cleanup complete');
}

log(`\ndealer-loyalty live run: ${passes} passed, ${failures} failed${fatal ? ' (run aborted early)' : ''}`);
process.exit(failures ? 1 : 0);

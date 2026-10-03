// End-to-end check of the hardened rewards flow against the Ishaputra preview project.
// Real: create-order / verify-payment / reconcile / releaseHolds code, Firestore, the
// deployed security rules (exercised over REST as the test shopper). Faked: the Razorpay API.
// node hardening-check.mjs <shopper.json>   (run from ssecommerce/)
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

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
    const id = `order_hc_${Date.now()}_${seq++}`;
    rzpOrders.set(id, { id, status: 'created', amount_paid: 0, payments: [], ...body });
    return new Response(JSON.stringify({ id, amount: body.amount, currency: body.currency }), { status: 200 });
  }
  const o = rzpOrders.get(decodeURIComponent(m[1] || ''));
  if (!o) return new Response('{}', { status: 404 });
  if (m[2]) return new Response(JSON.stringify({ items: o.payments }), { status: 200 });
  const { payments, ...order } = o;
  return new Response(JSON.stringify(order), { status: 200 });
};
const markPaid = (id) => {
  const o = rzpOrders.get(id);
  Object.assign(o, { status: 'paid', amount_paid: o.amount, payments: [{ id: `pay_${id}`, status: 'captured' }] });
};

// ── Code under test ──────────────────────────────────────────────────────────
const base = pathToFileURL(`${process.cwd()}/`);
const createOrder = (await import(new URL('api/create-order.ts', base).href)).default;
const verifyPayment = (await import(new URL('api/verify-payment.ts', base).href)).default;
const { reconcileRewards, releaseHolds } = await import(new URL('api/notify-order.ts', base).href);
const { summariseRewards, earnBase, pointsForBase, normaliseRewardSettings, cartKey } = await import(
  new URL('src/lib/rewards.ts', base).href
);

const call = async (handler, body, token) => {
  let status = 0;
  let json;
  const res = {
    setHeader() {},
    status(c) { status = c; return this; },
    json(j) { json = j; return this; },
    end() { return this; },
  };
  await handler({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return { status, json };
};
const sign = (orderId, paymentId) =>
  createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
const verify = (orderId) => {
  const paymentId = `pay_${orderId}`;
  return call(verifyPayment, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) });
};

// ── Test shopper over REST (the security rules apply) ────────────────────────
const creds = JSON.parse(readFileSync(process.argv[2], 'utf8'));
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
const restCreate = async (coll, id, data) =>
  (await realFetch(`${FS}/${coll}?documentId=${encodeURIComponent(id)}`, { method: 'POST', headers: H, body: JSON.stringify({ fields: fields(data) }) })).status;
const restPatch = async (path, data) => {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  return (await realFetch(`${FS}/${path}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: fields(data) }) })).status;
};
const restGet = async (path) => (await realFetch(`${FS}/${path}`, { headers: H })).status;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ledger = db.collection('users').doc(uid).collection('rewardLedger');
const settings = normaliseRewardSettings((await db.collection('siteSettings').doc('rewards').get()).data() || null);
const gstDoc = (await db.collection('siteSettings').doc('gst').get()).data() || {};
const gst = { enabled: gstDoc.enabled === true, inclusive: gstDoc.inclusive === true, rate: Number(gstDoc.rate) || 3 };
const toLike = (d) => {
  const x = d.data();
  return { currency: x.currency, amount: Number(x.amount) || 0, status: x.status, kind: x.kind || 'adjust',
    unlockAtMs: x.unlockAt?.toMillis?.() || 0, held: x.held === true };
};
const balances = async () => summariseRewards((await ledger.get()).docs.map(toLike), Date.now());

const prod = (await db.collection('products').where('flags.isActive', '==', true).limit(30).get())
  .docs.find((d) => Number(d.data().inventory?.stock) > 2 && Number(d.data().price) >= 500 && !d.data().silverPricing?.enabled);
assert.ok(prod, 'need an active in-stock product priced >= Rs 500');
const items = [{ productId: prod.id, quantity: 2 }];
const subtotal = Number(prod.data().price) * 2;
const ORDER = (rzp, extra = {}) => ({
  userId: uid, orderId: `HC-${rzp.slice(-6)}`, status: 'pending', paymentStatus: 'paid', paymentMethod: 'Razorpay',
  razorpayOrderId: rzp, total: 1, subtotal, items: [{ productId: prod.id, name: 'x', quantity: 2, price: subtotal / 2 }],
  ...extra,
});

const created = { orders: new Set(), payments: new Set(), rzp: new Set() };
const step = (msg) => console.log(`  ok  ${msg}`);

try {
  const start = await balances();
  console.log(`shopper balance: ${start.points.available} points, Rs ${start.cashback.available} cashback; cart Rs ${subtotal}`);
  assert.ok(start.cashback.available >= 1 && start.points.available >= 1, 'shopper needs demo points and cashback');
  const B_c = Math.floor(start.cashback.available);

  const plain = await call(createOrder, { items, shippingState: 'Telangana' }, s.idToken);
  assert.equal(plain.status, 200, JSON.stringify(plain.json));
  created.rzp.add(plain.json.order_id);
  const fullPaise = plain.json.amount;
  const plainNotes = rzpOrders.get(plain.json.order_id).notes;
  assert.equal(plainNotes.rw_uid, uid, 'every checkout is bound to the signed-in customer');
  assert.ok(Number(plainNotes.rw_base) > 0 && /^[0-9a-f]{64}$/.test(plainNotes.rw_cart), 'base and cart hash recorded');
  step('plain checkout: rw_uid, rw_base, rw_cart set by the server');

  // 1. Two checkouts race for the same cashback: exactly one reserves it.
  const claim = fullPaise - B_c * 100;
  const race = await Promise.all([0, 1].map(() =>
    call(createOrder, { items, shippingState: 'Telangana', useCashback: true, amount: claim, amountBeforeRewards: fullPaise,
      notes: { orderNumber: 'HC', rw_uid: 'attacker', rw_cashback: '99999' } }, s.idToken)));
  race.forEach((r) => r.json?.order_id && created.rzp.add(r.json.order_id));
  console.log('race:', JSON.stringify(race.map((r) => [r.status, r.json])));
  const won = race.filter((r) => r.status === 200);
  // The loser is refused either way; under lock contention it may time out (rewards_unavailable).
  const lost = race.filter((r) => r.status === 409 && ['rewards_changed', 'rewards_unavailable'].includes(r.json.code));
  assert.equal(won.length, 1, `one checkout wins: ${JSON.stringify(race.map((r) => [r.status, r.json?.code]))}`);
  assert.equal(lost.length, 1, 'the other is told the balance changed');
  const rzpA = won[0].json.order_id;
  for (const r of rzpOrders.values()) if (r.notes?.rw_cashback) created.rzp.add(r.id);
  assert.equal(won[0].json.cashbackApplied, B_c);
  const notesA = rzpOrders.get(rzpA).notes;
  assert.equal(notesA.rw_uid, uid, 'client rw_uid ignored');
  assert.equal(notesA.rw_cashback, String(B_c), 'client rw_cashback ignored');
  const holdA = (await ledger.doc(`spend_${rzpA}_cashback`).get()).data();
  assert.equal(holdA.hold, true); assert.equal(holdA.amount, -B_c);
  assert.equal(Math.floor((await balances()).cashback.available), 0, 'reserved cashback is out of available');
  step(`race: one reservation of Rs ${B_c}, the other got 409 ${lost[0].json.code}${lost[0].json.detail ? ` (${lost[0].json.detail})` : ''}`);

  // 2. A later checkout cannot spend the reserved cashback either.
  const again = await call(createOrder, { items, shippingState: 'Telangana', useCashback: true, amount: claim, amountBeforeRewards: fullPaise }, s.idToken);
  assert.equal(again.status, 409); assert.equal(again.json.code, 'rewards_changed');
  step('sequential re-use of a reserved balance: 409 rewards_changed');

  // 3. Closing the payment window releases the hold (Razorpay says unpaid).
  const rel = await releaseHolds(db, uid, rzpA);
  assert.deepEqual(rel.released, [rzpA]);
  const relA = (await ledger.doc(`spend_${rzpA}_cashback`).get()).data();
  assert.equal(relA.status, 'void'); assert.equal(relA.voidReason, 'payment-not-completed');
  assert.equal(Math.floor((await balances()).cashback.available), B_c, 'balance is back');
  step('release on dismiss: hold voided, balance restored');

  // 4. Paid after all (late): verify-payment spends it again and says so.
  markPaid(rzpA);
  const vA = await verify(rzpA);
  created.payments.add(rzpA);
  assert.equal(vA.status, 200); assert.equal(vA.json.verified, true);
  assert.equal(vA.json.paymentRecorded, true); assert.equal(vA.json.rewardsLate, true);
  const lateA = (await ledger.doc(`spend_${rzpA}_cashback`).get()).data();
  assert.equal(lateA.status, 'active'); assert.equal(lateA.late, true); assert.equal(lateA.hold, false);
  // Undo it so the rest of the check starts from the demo balance again.
  await ledger.doc(`spend_${rzpA}_cashback`).update({ status: 'void', voidReason: 'test-cleanup' });
  step('late payment: spend re-activated (late), payment recorded');

  // 5. Normal paid checkout with points + cashback; rules around the order document.
  const b5 = await balances();
  const r5 = await call(createOrder, { items, shippingState: 'Telangana', usePoints: true, useCashback: true }, s.idToken);
  assert.equal(r5.status, 200, JSON.stringify(r5.json));
  const rzpB = r5.json.order_id;
  created.rzp.add(rzpB);
  const pB = r5.json.pointsApplied;
  const cB = r5.json.cashbackApplied;
  assert.ok(pB > 0 && cB > 0, 'both redeemed');
  assert.equal(r5.json.pointsValue, pB * settings.pointValue);
  markPaid(rzpB);
  const vB = await verify(rzpB);
  created.payments.add(rzpB);
  assert.equal(vB.json.paymentRecorded, true);
  const pay = (await db.collection('payments').doc(rzpB).get()).data();
  assert.equal(pay.uid, uid); assert.equal(pay.points, pB); assert.equal(pay.cashback, cB);
  const expectBase = earnBase({ subtotal, couponDiscount: 0, pointsValue: pB * settings.pointValue, cashback: cB,
    gstEnabled: gst.enabled, gstInclusive: gst.inclusive, gstRate: gst.rate });
  assert.equal(pay.base, expectBase, 'payment record carries the server earn base');
  const { createHash } = await import('node:crypto');
  assert.equal(pay.cartHash, createHash('sha256').update(cartKey(items)).digest('hex'));
  for (const c of ['points', 'cashback']) {
    const d = (await ledger.doc(`spend_${rzpB}_${c}`).get()).data();
    assert.equal(d.hold, false, `${c} hold confirmed`);
  }
  const b5after = await balances();
  assert.equal(b5after.points.available, b5.points.available - pB);
  assert.equal(b5after.cashback.available, b5.cashback.available - cB);
  step(`paid checkout: ${pB} points + Rs ${cB} cashback spent, payment record written`);

  assert.equal(await restCreate('orders', rzpB, ORDER(rzpB)), 200, 'customer creates the paid order at orders/<rzp>');
  created.orders.add(rzpB);
  assert.ok([403, 409].includes(await restCreate('orders', rzpB, ORDER(rzpB))), 'a second order for the payment is refused');
  const forgedId = `hc-forged-${Date.now()}`;
  assert.equal(await restCreate('orders', forgedId, ORDER(rzpB)), 403, 'copy of the paid order under another id is refused');
  const rzpC = plain.json.order_id; // created, never paid
  assert.equal(await restCreate('orders', rzpC, ORDER(rzpC)), 403, 'paid order without a verified payment is refused');
  assert.equal(await restCreate('orders', `hc-x1-${Date.now()}`, { userId: uid, status: 'delivered', paymentStatus: 'pending', total: 5 }), 403, 'new order cannot start delivered');
  assert.equal(await restCreate('orders', `hc-x2-${Date.now()}`, { userId: uid, status: 'pending', paymentStatus: 'pending', total: 5, deliveredAt: new Date(0) }), 403, 'deliveredAt cannot be preset');
  assert.equal(await restCreate('orders', `hc-x3-${Date.now()}`, { userId: uid, status: 'pending', paymentStatus: 'pending', total: 5, delivery_boy_id: uid }), 403, 'cannot assign itself as delivery partner');
  assert.equal(await restCreate('orders', rzpC, ORDER(rzpC, { paymentStatus: 'pending' })), 200, 'unverified payment can be saved as payment pending (fallback)');
  created.orders.add(rzpC);
  assert.equal(await restGet(`payments/${rzpB}`), 200, 'customer reads own payment record');
  assert.equal(await restCreate('payments', `hc-pay-${Date.now()}`, { uid, amountPaise: 1 }), 403, 'customer cannot write payment records');
  assert.equal(await restGet(`users/${uid}/rewardState/lock`), 403, 'reward lock is server-only');
  step('rules: one order per verified payment, no forged/preset fields, payment records server-only');

  // 6. Lifecycle through reconcile, with the customer's own updates over REST.
  const orderB = db.collection('orders').doc(rzpB);
  const rec = async (id = rzpB) => reconcileRewards(db, id, (await db.collection('orders').doc(id).get()).data());
  await orderB.update({ status: 'delivered', total: 10_000_000, taxAmount: -999_000, deliveredAt: admin.firestore.Timestamp.fromMillis(0) });
  const r6 = await rec();
  const earn = (await ledger.doc(`earn_${rzpB}`).get()).data();
  const expectPoints = pointsForBase(Math.min(expectBase, r5.json.amount / 100), settings);
  assert.equal(earn.amount, expectPoints, `earned on the server base (${expectBase}), not the forged total`);
  assert.ok(earn.unlockAt.toMillis() > Date.now() + (settings.unlockDays * 86_400_000) - 120_000, 'unlock counted from now, not the preset deliveredAt');
  assert.equal(earn.held, false);
  let ob = (await orderB.get()).data();
  assert.equal(ob.pointsEarned, expectPoints); assert.equal(ob.pointsEarnedState, 'active');
  assert.deepEqual((await rec()).changed, [], 'idempotent');
  step(`delivered: earned ${expectPoints} points on base Rs ${expectBase} (forged total ignored); changes ${JSON.stringify(r6.changed)}`);

  assert.equal(await restPatch(`orders/${rzpB}`, { status: 'returnRequested', returnReason: 'x', userId: 'someone-else' }), 403, 'return request cannot move the order to another user');
  assert.equal(await restPatch(`orders/${rzpB}`, { status: 'returnRequested', returnReason: 'Did not suit', returnRequestedAt: new Date(), returnStatus: 'pending', updatedAt: new Date(), lastUpdated: new Date() }), 200, 'legit return request');
  await rec();
  assert.equal((await ledger.doc(`earn_${rzpB}`).get()).data().held, true, 'earn frozen while the return is open');
  assert.equal((await orderB.get()).data().pointsEarnedState, 'held');
  assert.equal(await restPatch(`orders/${rzpB}`, { status: 'delivered', returnCancelled: true, returnCancelledAt: new Date(), updatedAt: new Date(), lastUpdated: new Date() }), 200, 'customer withdraws the return');
  await rec();
  assert.equal((await ledger.doc(`earn_${rzpB}`).get()).data().held, false, 'earn released');
  assert.equal(await restPatch(`orders/${rzpB}`, { status: 'returnRequested', returnReason: 'again', returnRequestedAt: new Date(), returnStatus: 'pending', updatedAt: new Date(), lastUpdated: new Date() }), 403, 'a withdrawn return cannot be requested again');
  step('return request / withdrawal: whitelisted fields, earn held then released');

  await orderB.update({ status: 'returned' });
  const r7 = await rec();
  assert.equal((await ledger.doc(`earn_${rzpB}`).get()).data().status, 'void', 'earn voided on return even though no unlock check');
  assert.equal((await ledger.doc(`refund_${rzpB}_points`).get()).data().amount, pB);
  assert.equal((await ledger.doc(`refund_${rzpB}_cashback`).get()).data().amount, cB);
  const b7 = await balances();
  assert.equal(b7.points.available, b5.points.available, 'points back');
  assert.equal(b7.cashback.available, b5.cashback.available, 'cashback back');
  assert.deepEqual((await rec()).changed, [], 'idempotent after return');
  step(`returned: earn void, refunds ${pB} pts + Rs ${cB}; ${JSON.stringify(r7.changed)}`);

  await orderB.update({ status: 'delivered' });
  await rec();
  assert.equal((await ledger.doc(`earn_${rzpB}`).get()).data().status, 'active', 'earn restored on reopen');
  assert.equal((await ledger.doc(`refund_${rzpB}_points`).get()).data().status, 'void', 'refund taken back');
  assert.equal((await ledger.doc(`refund_${rzpB}_cashback`).get()).data().status, 'void');
  await orderB.update({ status: 'cancelled' });
  await rec();
  assert.equal((await ledger.doc(`refund_${rzpB}_points`).get()).data().status, 'active', 'refund restored when it ends again');
  step('reopen and end again: earn/refunds follow the status both ways');

  // Copies and forged documents (admin-created here to get past the rules, as legacy data would be).
  const copyId = `hc-copy-${Date.now()}`;
  await db.collection('orders').doc(copyId).set({ userId: uid, status: 'cancelled', razorpayOrderId: rzpB });
  created.orders.add(copyId);
  const rc = await rec(copyId);
  assert.equal(rc.skipped, 'order_not_bound_to_payment'); assert.deepEqual(rc.changed, []);
  await db.collection('orders').doc(rzpC).update({ status: 'delivered', total: 10_000_000 });
  const rf = await rec(rzpC);
  assert.equal(rf.skipped, 'payment_not_verified');
  assert.equal((await ledger.doc(`earn_${rzpC}`).get()).exists, false);
  step('copies of an order and unpaid "delivered" orders earn and refund nothing');

  // A half-written spend pair is repaired from the payment record.
  await orderB.update({ status: 'delivered' });
  await ledger.doc(`spend_${rzpB}_cashback`).delete();
  await rec();
  const repaired = (await ledger.doc(`spend_${rzpB}_cashback`).get()).data();
  assert.equal(repaired.amount, -cB); assert.equal(repaired.status, 'active');
  step('missing cashback spend recreated from the payment record');

  // 7. An expired, unpaid hold is released without an id.
  const r8 = await call(createOrder, { items, shippingState: 'Telangana', usePoints: true }, s.idToken);
  assert.equal(r8.status, 200, JSON.stringify(r8.json));
  const rzpD = r8.json.order_id;
  created.rzp.add(rzpD);
  await ledger.doc(`spend_${rzpD}_points`).update({ holdUntil: admin.firestore.Timestamp.fromMillis(Date.now() - 1000) });
  const r9 = await releaseHolds(db, uid);
  assert.ok(r9.released.includes(rzpD), JSON.stringify(r9));
  step('expired hold released by the sweep');

  const bad = await call(verifyPayment, { razorpay_order_id: rzpB, razorpay_payment_id: 'pay_x', razorpay_signature: 'deadbeef' });
  assert.equal(bad.status, 400, 'bad signature rejected');
  console.log('hardening check: PASS');
} finally {
  // Clean up everything this run created; the shopper's demo balances stay.
  const snap = await ledger.get();
  let n = 0;
  for (const d of snap.docs) {
    if ([...created.rzp].some((id) => d.id.includes(id))) { await d.ref.delete(); n++; }
  }
  for (const id of created.orders) await db.collection('orders').doc(id).delete();
  for (const id of new Set([...created.payments, ...created.rzp])) await db.collection('payments').doc(id).delete();
  await db.collection('users').doc(uid).collection('rewardState').doc('lock').delete();
  console.log(`cleaned up ${n} ledger entries, ${created.orders.size} orders, payment records and the lock`);
}
process.exit(0);

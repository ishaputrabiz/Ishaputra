import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { FakeFirestore } from './helpers/fakeFirestore.ts';
import { reconcileRewards } from '../api/notify-order.ts';

const T = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const UID = 'cust1';
const asDb = (db: FakeFirestore) => db as unknown as Parameters<typeof reconcileRewards>[0];

function shop() {
  const db = new FakeFirestore();
  db.applySet('siteSettings/rewards', { enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 }, false);
  db.applySet('siteSettings/scratchWin', { enabled: true, minOrder: 499, expiryDays: 30, prizes: [{ points: 5, weight: 1 }], noWinWeight: 0 }, false);
  return db;
}

/** A paid order with its payment record. */
function order(db: FakeFirestore, rzp: string, rupees: number, status: string, extra: Record<string, unknown> = {}) {
  db.applySet(`payments/${rzp}`, { uid: UID, amountPaise: rupees * 100, base: rupees, points: 0, pointsValue: 0, cashback: 0, ...extra }, false);
  db.applySet(`orders/${rzp}`, { userId: UID, orderId: `ORD-${rzp}`, razorpayOrderId: rzp, status, paymentStatus: 'paid', total: rupees, deliveredAt: T(Date.now()) }, false);
}
const reconcile = (db: FakeFirestore, rzp: string) => reconcileRewards(asDb(db), rzp, db.read(`orders/${rzp}`)!);

test('a Silver customer earns at 1x and the entry records the tier', async () => {
  const db = shop();
  order(db, 'o1', 1650, 'delivered');
  await reconcile(db, 'o1');
  const e = db.read(`users/${UID}/rewardLedger/earn_o1`)!;
  assert.equal(e.amount, 16);
  assert.equal(e.tierName, 'Silver');
  assert.equal(e.multiplier, 1);
});

test('earlier delivered spend sets the multiplier; this order and other statuses do not count', async () => {
  const db = shop();
  order(db, 'p1', 3000, 'delivered');
  order(db, 'p2', 2500, 'delivered');
  // Each excluded order is large enough that counting any one of them (or the
  // order itself) would reach Platinum (15,000) instead of Gold (5,000).
  order(db, 'p3', 9500, 'returned');
  order(db, 'p4', 9500, 'shipped');
  order(db, 'p5', 9500, 'delivered', { dealer: true, base: 0 });
  order(db, 'o2', 9500, 'delivered');
  await reconcile(db, 'o2');
  const e = db.read(`users/${UID}/rewardLedger/earn_o2`)!;
  assert.equal(e.tierName, 'Gold', 'p1 + p2 = 5,500 reaches Gold');
  assert.equal(e.multiplier, 1.25);
  assert.equal(e.amount, 118);
});

test('a dealer-priced order earns no points and gets no scratch card', async () => {
  const db = shop();
  order(db, 'd1', 2400, 'delivered', { dealer: true, base: 0, regularSubtotal: 3000 });
  const r = await reconcile(db, 'd1');
  assert.equal(db.read(`users/${UID}/rewardLedger/earn_d1`), undefined);
  assert.equal(db.read(`users/${UID}/scratchCards/d1`), undefined);
  assert.ok(!r.changed.some((c) => c.includes('scratchCards')), r.changed.join(' '));
});

test('a dealer-priced order earns nothing even if its base is non-zero', async () => {
  const db = shop();
  order(db, 'd2', 2400, 'delivered', { dealer: true, base: 2400 });
  await reconcile(db, 'd2');
  assert.equal(db.read(`users/${UID}/rewardLedger/earn_d2`), undefined);
});

test('a retail order still gets its scratch card', async () => {
  const db = shop();
  order(db, 'r1', 600, 'delivered');
  await reconcile(db, 'r1');
  assert.ok(db.read(`users/${UID}/scratchCards/r1`));
});

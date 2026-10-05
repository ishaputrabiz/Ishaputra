import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { FakeFirestore } from './helpers/fakeFirestore.ts';
import { reconcileRewards } from '../api/notify-order.ts';

/**
 * Money review A, L1 and L2: the tier multiplier an order earns at is fixed
 * when it first earns, from the customer's other delivered orders. An order
 * that is later returned or cancelled must stop lifting the multiplier of the
 * orders it helped, and nothing else may move an earn that is already booked.
 */

const T = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const UID = 'cust1';
const asDb = (db: FakeFirestore) => db as unknown as Parameters<typeof reconcileRewards>[0];

function shop() {
  const db = new FakeFirestore();
  db.applySet('siteSettings/rewards', { enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 }, false);
  return db;
}
function order(db: FakeFirestore, rzp: string, rupees: number, status: string, extra: Record<string, unknown> = {}) {
  db.applySet(`payments/${rzp}`, { uid: UID, amountPaise: rupees * 100, base: rupees, points: 0, pointsValue: 0, cashback: 0, ...extra }, false);
  db.applySet(`orders/${rzp}`, { userId: UID, orderId: `ORD-${rzp}`, razorpayOrderId: rzp, status, paymentStatus: 'paid', total: rupees, deliveredAt: T(Date.now()) }, false);
}
const setStatus = (db: FakeFirestore, rzp: string, status: string) => db.applyUpdate(`orders/${rzp}`, { status });
const reconcile = (db: FakeFirestore, rzp: string) => reconcileRewards(asDb(db), rzp, db.read(`orders/${rzp}`)!);
const earn = (db: FakeFirestore, rzp: string) => db.read(`users/${UID}/rewardLedger/earn_${rzp}`)!;

test('multiplier is fixed once: return + reopen does not re-price, even after the tier changed', async () => {
  const db = shop();
  order(db, 'o1', 10000, 'delivered');
  await reconcile(db, 'o1');
  assert.equal(earn(db, 'o1').amount, 100);
  // The customer reaches Premium in between.
  order(db, 'big', 40000, 'delivered');
  setStatus(db, 'o1', 'returned');
  await reconcile(db, 'o1');
  assert.equal(earn(db, 'o1').status, 'void');
  setStatus(db, 'o1', 'delivered');
  await reconcile(db, 'o1');
  assert.equal(earn(db, 'o1').status, 'active');
  assert.equal(earn(db, 'o1').amount, 100, 'still 1x');
  await reconcile(db, 'o1');
  assert.equal(earn(db, 'o1').amount, 100);
});

test('L1: X lifts Y to Premium, then X is returned: Y goes back to the tier it would have had', async () => {
  const db = shop();
  order(db, 'X', 30000, 'delivered');
  await reconcile(db, 'X');
  order(db, 'Y', 30000, 'delivered');
  await reconcile(db, 'Y');
  assert.equal(earn(db, 'Y').multiplier, 2);
  assert.equal(earn(db, 'Y').amount, 600);
  assert.equal(db.read('orders/Y')!.pointsEarned, 600);

  setStatus(db, 'X', 'returned');
  const r = await reconcile(db, 'X');
  assert.equal(earn(db, 'X').status, 'void');
  assert.ok(r.changed.includes('earn_Y:tier'), r.changed.join(' '));
  assert.equal(earn(db, 'Y').amount, 300, 'Y earns as a Silver order: nothing but its own purchase');
  assert.equal(earn(db, 'Y').multiplier, 1);
  assert.equal(earn(db, 'Y').tierName, 'Silver');
  assert.equal(earn(db, 'Y').status, 'active', 'only the amount moves');
  assert.equal(db.read('orders/Y')!.pointsEarned, 300, 'the order page follows');

  // Running it again, or reconciling Y, changes nothing.
  assert.deepEqual((await reconcile(db, 'X')).changed, []);
  await reconcile(db, 'Y');
  assert.equal(earn(db, 'Y').amount, 300);
  // Reopening X does not give the boost back: it is only ever taken away.
  setStatus(db, 'X', 'delivered');
  await reconcile(db, 'X');
  await reconcile(db, 'Y');
  assert.equal(earn(db, 'Y').amount, 300);
});

test('L1: a cancelled order stops lifting the orders it helped, too', async () => {
  const db = shop();
  order(db, 'X', 6000, 'delivered');
  await reconcile(db, 'X');
  order(db, 'Y', 1000, 'delivered');
  await reconcile(db, 'Y');
  assert.equal(earn(db, 'Y').tierName, 'Gold');
  assert.equal(earn(db, 'Y').amount, 12, '1,000 at 1.25x = 12.5, rounded down');
  setStatus(db, 'X', 'cancelled');
  await reconcile(db, 'X');
  assert.equal(earn(db, 'Y').amount, 10);
  assert.equal(earn(db, 'Y').tierName, 'Silver');
});

test('L1: only the boost goes: Y keeps a lower multiplier that another delivered order still supports', async () => {
  const db = shop();
  order(db, 'W', 6000, 'delivered'); // alone: Gold (5,000)
  await reconcile(db, 'W');
  order(db, 'X', 25000, 'delivered'); // with W: Premium for Y
  await reconcile(db, 'X');
  order(db, 'Y', 10000, 'delivered');
  await reconcile(db, 'Y');
  assert.equal(earn(db, 'Y').tierName, 'Premium');
  assert.equal(earn(db, 'Y').amount, 200);
  setStatus(db, 'X', 'returned');
  await reconcile(db, 'X');
  assert.equal(earn(db, 'Y').tierName, 'Gold', 'W alone still reaches Gold');
  assert.equal(earn(db, 'Y').multiplier, 1.25);
  assert.equal(earn(db, 'Y').amount, 125);
});

test('L1: if the points rate changed since the earn, only the multiplier ratio is taken off', async () => {
  const db = shop();
  order(db, 'X', 6000, 'delivered');
  await reconcile(db, 'X');
  order(db, 'Y', 1000, 'delivered');
  await reconcile(db, 'Y'); // Gold: 12 points
  assert.equal(earn(db, 'Y').amount, 12);
  db.applySet('siteSettings/rewards', { enabled: true, pointsPer100: 2, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 }, false);
  setStatus(db, 'X', 'returned');
  await reconcile(db, 'X');
  assert.equal(earn(db, 'Y').multiplier, 1);
  assert.equal(earn(db, 'Y').amount, 9, '12 x 1 / 1.25, rounded down: the new rate is not applied to a booked earn');
});

test('L1: a return that did not lift anything leaves booked earns alone', async () => {
  const db = shop();
  order(db, 'W', 6000, 'delivered');
  await reconcile(db, 'W');
  order(db, 'Y', 1000, 'delivered');
  await reconcile(db, 'Y'); // Gold, from W
  assert.equal(earn(db, 'Y').amount, 12);
  order(db, 'Z', 200, 'delivered'); // delivered after, 200 changes no tier
  await reconcile(db, 'Z');
  setStatus(db, 'Z', 'returned');
  const r = await reconcile(db, 'Z');
  assert.equal(earn(db, 'Y').amount, 12);
  assert.ok(!r.changed.some((c) => c.endsWith(':tier')), r.changed.join(' '));
});

test('L1: editing the tier thresholds later does not re-price earns that a return did not touch', async () => {
  const db = shop();
  order(db, 'W', 6000, 'delivered');
  await reconcile(db, 'W');
  order(db, 'Y', 1000, 'delivered');
  await reconcile(db, 'Y'); // Gold at 1.25x
  assert.equal(earn(db, 'Y').multiplier, 1.25);
  // The shop raises Gold to 50,000.
  db.applySet(
    'siteSettings/rewards',
    {
      enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20,
      tiers: [
        { name: 'Silver', minSpend: 0, multiplier: 1 },
        { name: 'Gold', minSpend: 50000, multiplier: 1.25 },
        { name: 'Platinum', minSpend: 60000, multiplier: 1.5 },
        { name: 'Premium', minSpend: 70000, multiplier: 2 },
      ],
    },
    false,
  );
  order(db, 'Z', 300, 'delivered');
  await reconcile(db, 'Z');
  setStatus(db, 'Z', 'returned');
  await reconcile(db, 'Z');
  assert.equal(earn(db, 'Y').amount, 12, 'a small unrelated return does not touch Y');
});

test('L1: a dealer-priced order that is returned never counted, so nothing is re-priced', async () => {
  const db = shop();
  order(db, 'W', 6000, 'delivered');
  await reconcile(db, 'W');
  order(db, 'Y', 1000, 'delivered');
  await reconcile(db, 'Y');
  order(db, 'D', 40000, 'delivered', { dealer: true, base: 0 });
  setStatus(db, 'D', 'returned');
  const r = await reconcile(db, 'D');
  assert.equal(earn(db, 'Y').amount, 12);
  assert.deepEqual(r.changed.filter((c) => c.endsWith(':tier')), []);
});

test('L2 (accepted by the spec): two orders delivered before either reconciles lift each other', async () => {
  const db = shop();
  order(db, 'A', 5000, 'delivered');
  order(db, 'B', 5000, 'delivered');
  await reconcile(db, 'A');
  await reconcile(db, 'B');
  assert.equal(earn(db, 'A').tierName, 'Gold');
  assert.equal(earn(db, 'B').tierName, 'Gold');
});

test('dealer-priced spend never counts; a returnRequested order does not count', async () => {
  const db = shop();
  order(db, 'D', 40000, 'delivered', { dealer: true, base: 0 });
  order(db, 'R', 40000, 'returnRequested');
  order(db, 'Z', 1000, 'delivered');
  await reconcile(db, 'Z');
  assert.equal(earn(db, 'Z').tierName, 'Silver');
});

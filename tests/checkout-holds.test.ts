import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { FakeFirestore } from './helpers/fakeFirestore.ts';
import { holdEarnedOffDelivered } from '../api/create-order.ts';
import { summariseRewards } from '../src/lib/rewards.ts';

const DAY = 86_400_000;
const T = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const UID = 'cust1';
const L = `users/${UID}/rewardLedger`;
const asDb = (db: FakeFirestore) => db as unknown as Parameters<typeof holdEarnedOffDelivered>[0];

const earned = (orderId: string, amount: number, unlockAtMs: number, extra: Record<string, unknown> = {}) => ({
  currency: 'points',
  amount,
  kind: 'earn',
  status: 'active',
  held: false,
  unlockAt: T(unlockAtMs),
  orderId,
  razorpayOrderId: orderId,
  createdBy: 'server',
  ...extra,
});

test('checkout holds unlocked points and prizes whose order is not at delivered', async () => {
  const now = Date.now();
  const db = new FakeFirestore();
  db.applySet('orders/o_return', { status: 'returnRequested' }, false);
  db.applySet('orders/o_done', { status: 'delivered' }, false);
  db.applySet('orders/o_back', { status: 'returned' }, false);
  db.applySet(`${L}/earn_o_return`, earned('o_return', 20, now - DAY), false);
  db.applySet(`${L}/scratch_o_return`, earned('o_return', 50, now - DAY, { source: 'scratch' }), false);
  db.applySet(`${L}/earn_o_done`, earned('o_done', 30, now - DAY), false);
  db.applySet(`${L}/earn_o_back`, earned('o_back', 40, now - DAY), false);
  // Still locked: pending anyway, so its order is not looked up.
  db.applySet(`${L}/earn_o_locked`, earned('o_return', 5, now + DAY), false);
  // The order was deleted by the shop: left as it is.
  db.applySet(`${L}/earn_o_gone`, earned('o_gone', 7, now - DAY), false);
  // Not earned on an order.
  db.applySet(`${L}/adjust_1`, { currency: 'points', amount: 100, kind: 'adjust', status: 'active', unlockAt: T(now - DAY) }, false);

  const snap = await db.collection(L).get();
  const held = await holdEarnedOffDelivered(asDb(db), snap.docs, now);
  assert.deepEqual([...held].sort(), ['earn_o_back', 'earn_o_return', 'scratch_o_return']);
  // Held in the ledger, as reconcile would, so the customer's live balance agrees.
  assert.equal(db.read(`${L}/earn_o_return`)!.held, true);
  assert.equal(db.read(`${L}/scratch_o_return`)!.held, true);
  assert.equal(db.read(`${L}/earn_o_done`)!.held, false);
  assert.equal(db.read(`${L}/earn_o_gone`)!.held, false);

  const after = await db.collection(L).get();
  const balances = summariseRewards(
    after.docs.map((d) => {
      const x = d.data()!;
      return { currency: 'points' as const, amount: x.amount, status: x.status, kind: x.kind, unlockAtMs: x.unlockAt.toMillis(), held: x.held === true };
    }),
    now,
  );
  assert.deepEqual(balances.points, { available: 30 + 7 + 100, pending: 20 + 50 + 40 + 5 });
});

test('nothing to check: no order lookups, nothing held', async () => {
  const now = Date.now();
  const db = new FakeFirestore();
  db.applySet(`${L}/earn_old`, earned('o_old', 10, now - 400 * DAY), false); // unlocked long ago
  db.applySet(`${L}/earn_held`, earned('o_x', 10, now - DAY, { held: true }), false);
  db.applySet(`${L}/earn_void`, earned('o_x', 10, now - DAY, { status: 'void' }), false);
  db.applySet('orders/o_old', { status: 'returned' }, false);
  db.applySet('orders/o_x', { status: 'returned' }, false);
  const snap = await db.collection(L).get();
  const held = await holdEarnedOffDelivered(asDb(db), snap.docs, now);
  assert.equal(held.size, 0);
  assert.equal(db.read(`${L}/earn_old`)!.held, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { FakeFirestore } from './helpers/fakeFirestore.ts';
import { scratchCard, reconcileRewards } from '../api/notify-order.ts';

const DAY = 86_400_000;
const T = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const UID = 'cust1';
const RZP = 'order_ABC';
const now = () => Date.now();
/** The stand-in, typed as the Admin SDK Firestore the server functions take. */
const asDb = (db: FakeFirestore) => db as unknown as Parameters<typeof scratchCard>[0];

/** A paid online order with its payment record, rewards on and Scratch & Win live. */
function shop(opts: { amount?: number; scratchOn?: boolean; status?: string; deliveredAgoDays?: number } = {}) {
  const db = new FakeFirestore();
  const amount = opts.amount ?? 600;
  db.applySet(`payments/${RZP}`, { uid: UID, amountPaise: amount * 100, base: amount, points: 0, pointsValue: 0, cashback: 0 }, false);
  db.applySet('siteSettings/rewards', { enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 }, false);
  db.applySet(
    'siteSettings/scratchWin',
    {
      enabled: opts.scratchOn ?? true,
      minOrder: 499,
      expiryDays: 30,
      prizes: [{ points: 5, weight: 40 }, { points: 10, weight: 35 }, { points: 25, weight: 20 }, { points: 50, weight: 5 }],
      noWinWeight: 0,
    },
    false,
  );
  db.applySet(
    `orders/${RZP}`,
    {
      userId: UID,
      orderId: 'ORD-1042',
      razorpayOrderId: RZP,
      status: opts.status ?? 'delivered',
      paymentStatus: 'paid',
      total: amount,
      deliveredAt: T(now() - (opts.deliveredAgoDays ?? 0) * DAY),
    },
    false,
  );
  return db;
}

const cardPath = `users/${UID}/scratchCards/${RZP}`;
const prizePath = `users/${UID}/rewardLedger/scratch_${RZP}`;
const reconcile = (db: FakeFirestore) => reconcileRewards(asDb(db), RZP, db.read(`orders/${RZP}`)!);
const setStatus = (db: FakeFirestore, status: string) => {
  db.applyUpdate(`orders/${RZP}`, { status });
  return reconcile(db);
};

test('delivery gives one card, with the order unlock date and a 30-day expiry', async () => {
  const db = shop();
  const r = await reconcile(db);
  assert.ok(r.changed.includes(`scratchCards/${RZP}`), r.changed.join(' '));
  const card = db.read(cardPath)!;
  assert.equal(card.status, 'new');
  assert.equal(card.orderNumber, 'ORD-1042');
  assert.equal(card.orderAmount, 600);
  assert.equal(card.createdBy, 'server');
  const earn = db.read(`users/${UID}/rewardLedger/earn_${RZP}`)!;
  assert.equal(card.unlockAt.toMillis(), earn.unlockAt.toMillis());
  assert.equal(card.expiresAt.toMillis(), card.deliveredAt.toMillis() + 30 * DAY);
  // running it again changes nothing
  const again = await reconcile(db);
  assert.ok(!again.changed.some((c) => c.startsWith('scratchCards')), again.changed.join(' '));
});

test('no card below the minimum, while off, before delivery, or long after delivery', async () => {
  for (const db of [shop({ amount: 498 }), shop({ scratchOn: false }), shop({ status: 'shipped' }), shop({ deliveredAgoDays: 31 })]) {
    await reconcile(db);
    assert.equal(db.read(cardPath), undefined);
  }
});

test('no card while loyalty rewards are off', async () => {
  const db = shop();
  db.applyUpdate('siteSettings/rewards', { enabled: false });
  await reconcile(db);
  assert.equal(db.read(cardPath), undefined);
});

test('scratching draws on the server, writes the prize entry once, and a second scratch returns the same prize', async () => {
  const db = shop();
  await reconcile(db);
  const first = await scratchCard(asDb(db), UID, RZP, () => 60); // 40 <= 60 < 75: 10 points
  assert.equal(first.status, 200);
  assert.equal(first.body.points, 10);
  assert.equal(first.body.held, false);
  const prize = db.read(prizePath)!;
  assert.deepEqual(
    [prize.currency, prize.amount, prize.kind, prize.source, prize.status, prize.held, prize.createdBy],
    ['points', 10, 'earn', 'scratch', 'active', false, 'server'],
  );
  assert.equal(prize.unlockAt.toMillis(), db.read(cardPath)!.unlockAt.toMillis());
  assert.equal(prize.note, 'Scratch card prize, order ORD-1042');
  const card = db.read(cardPath)!;
  assert.deepEqual([card.status, card.points, card.prizeState], ['scratched', 10, 'active']);
  assert.equal(first.body.unlockAtMs, card.unlockAt.toMillis());
  const second = await scratchCard(asDb(db), UID, RZP, () => 99);
  assert.equal(second.status, 200);
  assert.equal(second.body.points, 10);
  assert.equal(db.read(prizePath)!.amount, 10);
});

test('two scratches racing commit one draw', async () => {
  const db = shop();
  await reconcile(db);
  let rolls = 0;
  const roll = () => (rolls++ === 0 ? 0 : 99); // first draw 5 points, any later draw 50
  const [a, b] = await Promise.all([scratchCard(asDb(db), UID, RZP, roll), scratchCard(asDb(db), UID, RZP, roll)]);
  assert.equal(a.body.points, b.body.points);
  assert.equal(db.read(prizePath)!.amount, a.body.points);
  assert.equal(db.read(cardPath)!.points, a.body.points);
  assert.ok(db.retries >= 1);
});

test('better luck next time writes no ledger entry', async () => {
  const db = shop();
  db.applyUpdate('siteSettings/scratchWin', { noWinWeight: 100 });
  await reconcile(db);
  const r = await scratchCard(asDb(db), UID, RZP, () => 150);
  assert.equal(r.body.points, 0);
  assert.equal(db.read(prizePath), undefined);
  assert.equal(db.read(cardPath)!.status, 'scratched');
  assert.equal(db.read(cardPath)!.prizeState, undefined);
});

test('cards still scratch after the switch is turned off', async () => {
  const db = shop();
  await reconcile(db);
  db.applyUpdate('siteSettings/scratchWin', { enabled: false });
  const r = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.points, 5);
});

test('refusals: missing, someone else, expired, order ended', async () => {
  const db = shop();
  await reconcile(db);
  assert.equal((await scratchCard(asDb(db), UID, 'order_OTHER', () => 0)).status, 404);
  assert.equal((await scratchCard(asDb(db), 'intruder', RZP, () => 0)).status, 404);

  db.applyUpdate(cardPath, { expiresAt: T(now() - 1000) });
  const expired = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.deepEqual([expired.status, expired.body.error], [409, 'card_expired']);
  assert.equal(db.read(cardPath)!.status, 'new');

  db.applyUpdate(cardPath, { expiresAt: T(now() + DAY) });
  db.applyUpdate(`orders/${RZP}`, { status: 'returned' }); // reconcile has not run yet
  const ended = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.deepEqual([ended.status, ended.body.error, ended.body.reason], [409, 'card_void', 'order-returned']);
  assert.equal(db.read(cardPath)!.status, 'void');
  assert.equal(db.read(prizePath), undefined);
  const again = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.deepEqual([again.status, again.body.error], [409, 'card_void']);
});

test('a scratch while a return is open is held; the prize follows the order', async () => {
  const db = shop();
  await reconcile(db);
  db.applyUpdate(`orders/${RZP}`, { status: 'returnRequested' });
  const r = await scratchCard(asDb(db), UID, RZP, () => 99);
  assert.deepEqual([r.body.points, r.body.held], [50, true]);
  assert.equal(db.read(prizePath)!.held, true);
  assert.equal(db.read(cardPath)!.prizeState, 'held');

  await setStatus(db, 'delivered'); // return rejected
  assert.equal(db.read(prizePath)!.held, false);
  assert.equal(db.read(cardPath)!.prizeState, 'active');

  await setStatus(db, 'returned');
  assert.equal(db.read(prizePath)!.status, 'void');
  assert.equal(db.read(prizePath)!.voidReason, 'order-returned');
  assert.equal(db.read(cardPath)!.prizeState, 'void');

  await setStatus(db, 'delivered'); // the shop reopens it
  assert.equal(db.read(prizePath)!.status, 'active');
  assert.equal(db.read(cardPath)!.prizeState, 'active');
});

test('an unscratched card is cancelled when the order ends and comes back if reopened', async () => {
  const db = shop();
  await reconcile(db);
  await setStatus(db, 'cancelled');
  assert.deepEqual([db.read(cardPath)!.status, db.read(cardPath)!.voidReason], ['void', 'order-cancelled']);
  await setStatus(db, 'delivered');
  assert.equal(db.read(cardPath)!.status, 'new');
});

test('a prize voided by the shop stays void', async () => {
  const db = shop();
  await reconcile(db);
  await scratchCard(asDb(db), UID, RZP, () => 0);
  db.applyUpdate(prizePath, { status: 'void', voidedBy: 'admin:a1' });
  await setStatus(db, 'delivered');
  assert.equal(db.read(prizePath)!.status, 'void');
  assert.equal(db.read(cardPath)!.prizeState, 'void');
});

test('prizes count as pending points until the order unlock date', async () => {
  const { summariseRewards } = await import('../src/lib/rewards.ts');
  const db = shop();
  await reconcile(db);
  await scratchCard(asDb(db), UID, RZP, () => 99);
  const p = db.read(prizePath)!;
  const entry = { currency: 'points' as const, amount: p.amount, status: p.status, kind: p.kind, unlockAtMs: p.unlockAt.toMillis(), held: p.held };
  assert.deepEqual(summariseRewards([entry], now()).points, { available: 0, pending: 50 });
  assert.deepEqual(summariseRewards([entry], now() + 8 * DAY).points, { available: 50, pending: 0 });
});

const earnPath = `users/${UID}/rewardLedger/earn_${RZP}`;

test('points and prizes never unlock before the return window closes', async () => {
  // A short unlock setting: the 7-day return window still decides.
  const db = shop();
  db.applyUpdate('siteSettings/rewards', { unlockDays: 3 });
  await reconcile(db);
  const delivered = db.read(`orders/${RZP}`)!.deliveredAt.toMillis();
  assert.equal(db.read(earnPath)!.unlockAt.toMillis(), delivered + 7 * DAY);
  assert.equal(db.read(cardPath)!.unlockAt.toMillis(), delivered + 7 * DAY);

  // A delivery date written 30 days ahead keeps returns open that long, so the points wait with it.
  const ahead = shop();
  const future = now() + 30 * DAY;
  ahead.applyUpdate(`orders/${RZP}`, { deliveredAt: T(future) });
  await reconcile(ahead);
  assert.equal(ahead.read(earnPath)!.unlockAt.toMillis(), future + 7 * DAY);
  const card = ahead.read(cardPath)!;
  assert.equal(card.unlockAt.toMillis(), future + 7 * DAY);
  assert.ok(card.expiresAt.toMillis() <= now() + 30 * DAY, 'expiry still counts from now');
});

test('a card is given once per payment: deleting it does not bring a fresh draw', async () => {
  const db = shop();
  await reconcile(db);
  await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.ok(db.read(`payments/${RZP}`)!.scratchCardGivenAt);
  db.docs.delete(cardPath);
  db.docs.delete(prizePath);
  await reconcile(db);
  assert.equal(db.read(cardPath), undefined);
});

test('turning Scratch & Win on gives no cards for orders delivered while it was off', async () => {
  const before = shop({ deliveredAgoDays: 2 });
  before.applyUpdate('siteSettings/scratchWin', { enabledAt: T(now() - DAY) });
  await reconcile(before);
  assert.equal(before.read(cardPath), undefined);

  const after = shop();
  after.applyUpdate('siteSettings/scratchWin', { enabledAt: T(now() - DAY) });
  await reconcile(after);
  assert.equal(after.read(cardPath)!.status, 'new');
});

test('an unscratched card is cancelled on return or refund, restored without its cancellation fields', async () => {
  for (const status of ['returned', 'refunded']) {
    const db = shop();
    await reconcile(db);
    await setStatus(db, status);
    assert.deepEqual([db.read(cardPath)!.status, db.read(cardPath)!.voidReason], ['void', `order-${status}`]);
    const again = await reconcile(db);
    assert.ok(!again.changed.some((c) => c.startsWith('scratchCards')), again.changed.join(' '));
    await setStatus(db, 'delivered');
    const card = db.read(cardPath)!;
    assert.equal(card.status, 'new');
    assert.ok(card.restoredAt);
    assert.deepEqual([card.voidedAt, card.voidedBy, card.voidReason], [undefined, undefined, undefined]);
  }
});

test('holding and releasing a prize twice changes nothing the second time', async () => {
  const db = shop();
  await reconcile(db);
  await scratchCard(asDb(db), UID, RZP, () => 99);
  await setStatus(db, 'returnRequested');
  const held = await reconcile(db);
  assert.ok(!held.changed.some((c) => c.startsWith('scratchCards')), held.changed.join(' '));
  await setStatus(db, 'delivered');
  const released = await reconcile(db);
  assert.ok(!released.changed.some((c) => c.startsWith('scratchCards')), released.changed.join(' '));
});

test('scratching again after the prize was taken back says so', async () => {
  const db = shop();
  await reconcile(db);
  await scratchCard(asDb(db), UID, RZP, () => 99);
  await setStatus(db, 'returned');
  const r = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.deepEqual([r.status, r.body.points, r.body.prizeState], [200, 50, 'void']);
});

test('a card whose order is missing or not the caller\'s is cancelled, not scratched', async () => {
  const db = shop();
  await reconcile(db);
  db.applyUpdate(`orders/${RZP}`, { userId: 'someone-else' });
  const r = await scratchCard(asDb(db), UID, RZP, () => 0);
  assert.deepEqual([r.status, r.body.error, r.body.reason], [409, 'card_void', 'order-not-yours']);
  assert.equal(db.read(prizePath), undefined);

  const gone = shop();
  await reconcile(gone);
  gone.docs.delete(`orders/${RZP}`);
  const g = await scratchCard(asDb(gone), UID, RZP, () => 0);
  assert.deepEqual([g.status, g.body.reason], [409, 'order-missing']);
  assert.equal(gone.read(prizePath), undefined);
});

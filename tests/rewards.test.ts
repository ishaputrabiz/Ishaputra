import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  summariseRewards,
  computeRedemption,
  earnBase,
  pointsForBase,
  cartKey,
  type RewardBalances,
} from '../src/lib/rewards.ts';

const S = DEFAULT_REWARD_SETTINGS;
const bal = (points: number, cashback: number): RewardBalances => ({
  points: { available: points, pending: 0 },
  cashback: { available: cashback, pending: 0 },
});
const base = { subtotal: 1000, couponDiscount: 0, deliveryCharge: 0, gstOnTop: 0, settings: S };

test('normaliseRewardSettings fills defaults and clamps', () => {
  assert.deepEqual(normaliseRewardSettings(null), S);
  const n = normaliseRewardSettings({
    enabled: false,
    pointsPer100: -5,
    maxPointsPercent: 250,
    unlockDays: 'x' as unknown as number,
  });
  assert.equal(n.enabled, false);
  assert.equal(n.pointsPer100, 0);
  assert.equal(n.maxPointsPercent, 100);
  assert.equal(n.unlockDays, S.unlockDays);
});

test('summariseRewards: earned points wait until unlock; void entries are skipped', () => {
  const now = 1_000_000;
  const b = summariseRewards(
    [
      { currency: 'points', amount: 50, status: 'active', kind: 'earn', unlockAtMs: now - 1 },
      { currency: 'points', amount: 30, status: 'active', kind: 'earn', unlockAtMs: now + 1 },
      { currency: 'points', amount: -10, status: 'active', kind: 'spend', unlockAtMs: now },
      { currency: 'points', amount: 999, status: 'void', kind: 'earn', unlockAtMs: 0 },
      { currency: 'cashback', amount: 120, status: 'active', kind: 'adjust', unlockAtMs: 0 },
    ],
    now,
  );
  assert.deepEqual(b, { points: { available: 40, pending: 30 }, cashback: { available: 120, pending: 0 } });
});

test('summariseRewards: only earned points can be pending, whatever the clock says', () => {
  // A spend, a refund and an adjustment the server stamped a minute "in the
  // future" of this device's clock still count at once (no client/server drift).
  const now = 1_000_000;
  const later = now + 60_000;
  const b = summariseRewards(
    [
      { currency: 'cashback', amount: 500, status: 'active', kind: 'adjust', unlockAtMs: later },
      { currency: 'cashback', amount: -100, status: 'active', kind: 'spend', unlockAtMs: later },
      { currency: 'points', amount: 25, status: 'active', kind: 'refund', unlockAtMs: later },
    ],
    now,
  );
  assert.deepEqual(b, { points: { available: 25, pending: 0 }, cashback: { available: 400, pending: 0 } });
});

test('summariseRewards: earned points stay pending while a return is open, even after unlock', () => {
  const now = 1_000_000;
  const b = summariseRewards(
    [{ currency: 'points', amount: 20, status: 'active', kind: 'earn', unlockAtMs: now - 1, held: true }],
    now,
  );
  assert.deepEqual(b.points, { available: 0, pending: 20 });
});

test('summariseRewards: a reservation (hold) is taken out of available at once', () => {
  const b = summariseRewards(
    [
      { currency: 'cashback', amount: 1000, status: 'active', kind: 'adjust', unlockAtMs: 0 },
      { currency: 'cashback', amount: -1000, status: 'active', kind: 'spend', unlockAtMs: 0 },
    ],
    0,
  );
  assert.equal(b.cashback.available, 0);
});

test('points are capped at maxPointsPercent of products after coupon', () => {
  const r = computeRedemption({
    ...base,
    couponDiscount: 100,
    deliveryCharge: 50,
    balances: bal(500, 0),
    usePoints: true,
    useCashback: false,
  });
  assert.deepEqual(r, { points: 180, pointsValue: 180, cashback: 0, payable: 770 });
});

test('points are limited by the balance', () => {
  const r = computeRedemption({ ...base, balances: bal(50, 0), usePoints: true, useCashback: false });
  assert.equal(r.points, 50);
  assert.equal(r.payable, 950);
});

test('cashback comes after points, covers delivery, keeps ₹1 payable', () => {
  const r = computeRedemption({
    ...base,
    subtotal: 100,
    deliveryCharge: 50,
    balances: bal(0, 1000),
    usePoints: false,
    useCashback: true,
  });
  assert.deepEqual(r, { points: 0, pointsValue: 0, cashback: 149, payable: 1 });
});

test('nothing is redeemed when rewards are off, toggles are off, or the balance is negative', () => {
  const off = normaliseRewardSettings({ enabled: false });
  assert.equal(
    computeRedemption({ ...base, settings: off, balances: bal(500, 500), usePoints: true, useCashback: true }).payable,
    1000,
  );
  assert.equal(
    computeRedemption({ ...base, balances: bal(500, 500), usePoints: false, useCashback: false }).payable,
    1000,
  );
  const owed = computeRedemption({ ...base, balances: bal(-40, -300), usePoints: true, useCashback: true });
  assert.deepEqual(owed, { points: 0, pointsValue: 0, cashback: 0, payable: 1000 });
});

test('fractional point value converts the cap into more points', () => {
  const half = normaliseRewardSettings({ pointValue: 0.5 });
  const r = computeRedemption({ ...base, settings: half, balances: bal(1000, 0), usePoints: true, useCashback: false });
  assert.equal(r.points, 400);
  assert.equal(r.pointsValue, 200);
  assert.equal(r.payable, 800);
});

const gstOff = { gstEnabled: false, gstInclusive: false, gstRate: 0 };

test('earnBase: products after coupon, points and cashback; no delivery', () => {
  assert.equal(earnBase({ subtotal: 1000, couponDiscount: 100, pointsValue: 180, cashback: 0, ...gstOff }), 720);
  // Cashback beyond the products (it also covered delivery) never goes below zero.
  assert.equal(earnBase({ subtotal: 100, couponDiscount: 0, pointsValue: 0, cashback: 149, ...gstOff }), 0);
});

test('earnBase: GST is taken out of GST-inclusive prices, and is not in the base when added on top', () => {
  const inclusive = { gstEnabled: true, gstInclusive: true, gstRate: 18 };
  // ₹11,800 including 18% GST is ₹10,000 of goods: 100 points, the same as ₹10,000 + GST on top.
  assert.equal(earnBase({ subtotal: 11800, couponDiscount: 0, pointsValue: 0, cashback: 0, ...inclusive }), 10000);
  assert.equal(pointsForBase(10000, S), 100);
  const onTop = { gstEnabled: true, gstInclusive: false, gstRate: 18 };
  assert.equal(earnBase({ subtotal: 10000, couponDiscount: 0, pointsValue: 0, cashback: 0, ...onTop }), 10000);
  // Inclusive GST switched off in settings: nothing is taken out.
  assert.equal(
    earnBase({ subtotal: 11800, couponDiscount: 0, pointsValue: 0, cashback: 0, gstEnabled: false, gstInclusive: true, gstRate: 18 }),
    11800,
  );
});

test('pointsForBase: exact for every rate, and nothing when off', () => {
  const at = (pointsPer100: number) => normaliseRewardSettings({ pointsPer100 });
  assert.equal(pointsForBase(820, at(15)), 123);
  assert.equal(pointsForBase(116, at(25)), 29);
  assert.equal(pointsForBase(29, at(100)), 29);
  assert.equal(pointsForBase(999, S), 9);
  assert.equal(pointsForBase(1000, normaliseRewardSettings({ enabled: false })), 0);
  assert.equal(pointsForBase(-50, S), 0);
  // Brute force: integer bases against exact integer arithmetic.
  for (const rate of [1, 2, 3, 7, 15, 25, 50, 75, 100]) {
    for (let b = 0; b <= 20000; b += 1) {
      assert.equal(pointsForBase(b, at(rate)), Math.floor((b * rate) / 100), `base ${b} at ${rate}`);
    }
  }
});

test('cartKey merges lines per product and ignores order', () => {
  const a = cartKey([
    { productId: 'b', quantity: 1 },
    { productId: 'a', quantity: 2 },
    { productId: 'b', quantity: 3 },
  ]);
  const b = cartKey([
    { productId: 'a', quantity: 2 },
    { productId: 'b', quantity: 4 },
  ]);
  assert.equal(a, 'a:2|b:4');
  assert.equal(a, b);
  assert.notEqual(cartKey([{ productId: 'a', quantity: 1 }]), a);
});

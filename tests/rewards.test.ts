import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  summariseRewards,
  computeRedemption,
  pointsForOrder,
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

test('summariseRewards splits available and pending, skips void', () => {
  const now = 1_000_000;
  const b = summariseRewards(
    [
      { currency: 'points', amount: 50, status: 'active', unlockAtMs: now - 1 },
      { currency: 'points', amount: 30, status: 'active', unlockAtMs: now + 1 },
      { currency: 'points', amount: -10, status: 'active', unlockAtMs: now },
      { currency: 'points', amount: 999, status: 'void', unlockAtMs: 0 },
      { currency: 'cashback', amount: 120, status: 'active', unlockAtMs: 0 },
    ],
    now,
  );
  assert.deepEqual(b, { points: { available: 40, pending: 30 }, cashback: { available: 120, pending: 0 } });
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

test('nothing is redeemed when rewards are off or toggles are off', () => {
  const off = normaliseRewardSettings({ enabled: false });
  assert.equal(
    computeRedemption({ ...base, settings: off, balances: bal(500, 500), usePoints: true, useCashback: true }).payable,
    1000,
  );
  assert.equal(
    computeRedemption({ ...base, balances: bal(500, 500), usePoints: false, useCashback: false }).payable,
    1000,
  );
});

test('fractional point value converts the cap into more points', () => {
  const half = normaliseRewardSettings({ pointValue: 0.5 });
  const r = computeRedemption({ ...base, settings: half, balances: bal(1000, 0), usePoints: true, useCashback: false });
  assert.equal(r.points, 400);
  assert.equal(r.pointsValue, 200);
  assert.equal(r.payable, 800);
});

test('pointsForOrder earns on the product amount only', () => {
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50, taxAmount: 0 }, S), 9);
  assert.equal(pointsForOrder({ total: 1079, deliveryCharge: 50, taxAmount: 30 }, S), 9);
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50, taxAmount: 30, gstInclusive: true }, S), 9);
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50 }, normaliseRewardSettings({ enabled: false })), 0);
});

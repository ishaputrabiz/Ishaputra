import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REWARD_SETTINGS,
  DEFAULT_TIERS,
  normaliseRewardSettings,
  pointsForBase,
  tierIndexForSpend,
  tierSpend,
} from '../src/lib/rewards.ts';

test('default tiers are the placeholders', () => {
  assert.deepEqual(DEFAULT_TIERS, [
    { name: 'Silver', minSpend: 0, multiplier: 1 },
    { name: 'Gold', minSpend: 5000, multiplier: 1.25 },
    { name: 'Platinum', minSpend: 15000, multiplier: 1.5 },
    { name: 'Premium', minSpend: 30000, multiplier: 2 },
  ]);
  assert.deepEqual(DEFAULT_REWARD_SETTINGS.tiers, DEFAULT_TIERS);
  assert.deepEqual(normaliseRewardSettings(null).tiers, DEFAULT_TIERS);
});

test('tiers are normalised: always 4, first starts at 0, clamped, sorted', () => {
  const s = normaliseRewardSettings({
    tiers: [
      { name: '  Bronze ', minSpend: 999, multiplier: 0.5 },
      { name: '', minSpend: 40000, multiplier: 9 },
      { name: 'Mid', minSpend: '12000' as unknown as number, multiplier: 1.333 },
    ],
  } as never);
  assert.equal(s.tiers.length, 4);
  assert.deepEqual(s.tiers[0], { name: 'Bronze', minSpend: 0, multiplier: 1 });
  assert.deepEqual(s.tiers.map((t) => t.minSpend), [0, 12000, 30000, 40000]);
  assert.deepEqual(s.tiers.map((t) => t.name), ['Bronze', 'Mid', 'Premium', 'Gold']);
  assert.equal(s.tiers.find((t) => t.name === 'Gold')!.multiplier, 5);
  assert.equal(s.tiers.find((t) => t.name === 'Mid')!.multiplier, 1.33);
});

test('tierIndexForSpend picks the highest tier reached', () => {
  const t = DEFAULT_TIERS;
  assert.equal(tierIndexForSpend(0, t), 0);
  assert.equal(tierIndexForSpend(4999.99, t), 0);
  assert.equal(tierIndexForSpend(5000, t), 1);
  assert.equal(tierIndexForSpend(29999, t), 2);
  assert.equal(tierIndexForSpend(1e9, t), 3);
});

test('tierSpend counts delivered, non-dealer payments only, and can leave one out', () => {
  const rows = [
    { id: 'a', amountPaise: 150000, orderStatus: 'delivered' },
    { id: 'b', amountPaise: 99999, orderStatus: 'delivered' },
    { id: 'c', amountPaise: 500000, orderStatus: 'returned' },
    { id: 'd', amountPaise: 700000, orderStatus: 'delivered', dealer: true },
    { id: 'e', amountPaise: 20000, orderStatus: 'shipped' },
  ];
  assert.equal(tierSpend(rows), 2499.99);
  assert.equal(tierSpend(rows, 'a'), 999.99);
  assert.equal(tierSpend([]), 0);
});

test('pointsForBase applies the multiplier exactly', () => {
  const s = normaliseRewardSettings({ pointsPer100: 15 });
  assert.equal(pointsForBase(820, s), 123);
  assert.equal(pointsForBase(820, s, 1), 123);
  const one = normaliseRewardSettings({ pointsPer100: 1 });
  assert.equal(pointsForBase(1650, one, 1.25), 20);
  assert.equal(pointsForBase(1000, one, 1.1), 11);
  assert.equal(pointsForBase(60, one, 2), 1);
  assert.equal(pointsForBase(1000, one, 0.2), 10, 'multiplier never below 1');
  assert.equal(pointsForBase(0, one, 2), 0);
  assert.equal(pointsForBase(1000, normaliseRewardSettings({ enabled: false }), 2), 0);
});

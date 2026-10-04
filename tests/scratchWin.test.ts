import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCRATCH_SETTINGS,
  normaliseScratchSettings,
  scratchTotalWeight,
  drawScratchPrize,
  scratchCardEligible,
  planScratchReconcile,
  scratchCardView,
  sortScratchCards,
  scratchPrizeStats,
  voidReasonText,
  type ScratchCard,
  type ScratchReconcileInput,
} from '../src/lib/scratchWin.ts';

const DAY = 86_400_000;
const S = { ...DEFAULT_SCRATCH_SETTINGS, enabled: true };

test('defaults are the placeholders and ship off', () => {
  assert.deepEqual(normaliseScratchSettings(null), DEFAULT_SCRATCH_SETTINGS);
  assert.equal(DEFAULT_SCRATCH_SETTINGS.enabled, false);
  assert.equal(DEFAULT_SCRATCH_SETTINGS.minOrder, 499);
  assert.equal(DEFAULT_SCRATCH_SETTINGS.expiryDays, 30);
  assert.deepEqual(DEFAULT_SCRATCH_SETTINGS.prizes.map((p) => [p.points, p.weight]), [[5, 40], [10, 35], [25, 20], [50, 5]]);
  assert.equal(DEFAULT_SCRATCH_SETTINGS.noWinWeight, 0);
});

test('normalise clamps, floors, drops bad rows and caps at 10 prizes', () => {
  const s = normaliseScratchSettings({
    enabled: 'yes' as unknown as boolean,
    minOrder: -5,
    expiryDays: 0,
    noWinWeight: 5000,
    prizes: [
      { points: 0, weight: 10 },
      { points: 12.9, weight: 3.7 },
      { points: 99999, weight: -1 },
      { points: 'abc' as unknown as number, weight: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({ points: i + 1, weight: 1 })),
    ],
  });
  assert.equal(s.enabled, false);
  assert.equal(s.minOrder, 0);
  assert.equal(s.expiryDays, 1);
  assert.equal(s.noWinWeight, 1000);
  assert.deepEqual(s.prizes[0], { points: 12, weight: 3 });
  assert.deepEqual(s.prizes[1], { points: 10000, weight: 0 });
  assert.equal(s.prizes.length, 10);
});

test('an empty prize table stays empty (every card is better luck next time)', () => {
  const s = normaliseScratchSettings({ prizes: [] });
  assert.deepEqual(s.prizes, []);
  assert.equal(drawScratchPrize(s, 0), 0);
});

test('every roll maps to the right prize', () => {
  assert.equal(scratchTotalWeight(S), 100);
  const counts = new Map<number, number>();
  for (let roll = 0; roll < 100; roll++) {
    const p = drawScratchPrize(S, roll);
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  assert.deepEqual([...counts.entries()], [[5, 40], [10, 35], [25, 20], [50, 5]]);
  assert.equal(drawScratchPrize(S, 39), 5);
  assert.equal(drawScratchPrize(S, 40), 10);
  assert.equal(drawScratchPrize(S, 99), 50);
});

test('better luck next time takes the last share; out-of-range rolls win nothing', () => {
  const s = { ...S, noWinWeight: 100 };
  assert.equal(scratchTotalWeight(s), 200);
  assert.equal(drawScratchPrize(s, 99), 50);
  assert.equal(drawScratchPrize(s, 100), 0);
  assert.equal(drawScratchPrize(s, 199), 0);
  assert.equal(drawScratchPrize(s, 200), 0);
  assert.equal(drawScratchPrize(s, -1), 0);
  assert.equal(drawScratchPrize(s, Number.NaN), 0);
});

test('zero-weight prizes are never drawn', () => {
  const s = { ...S, prizes: [{ points: 100, weight: 0 }, { points: 5, weight: 1 }] };
  assert.equal(drawScratchPrize(s, 0), 5);
});

const elig = (over: Partial<Parameters<typeof scratchCardEligible>[0]> = {}) =>
  scratchCardEligible({ status: 'delivered', amountRupees: 499, scratch: S, rewardsEnabled: true, deliveredAtMs: 0, nowMs: 1000 * DAY, ...over });

test('a delivered order at the minimum gets a card that expires expiryDays later', () => {
  assert.deepEqual(elig(), { anchorMs: 1000 * DAY, expiresAtMs: 1030 * DAY });
  assert.deepEqual(elig({ deliveredAtMs: 990 * DAY }), { anchorMs: 990 * DAY, expiresAtMs: 1020 * DAY });
});

test('no card below the minimum, when off, when rewards are off, or before delivery', () => {
  assert.equal(elig({ amountRupees: 498.99 }), null);
  assert.equal(elig({ scratch: { ...S, enabled: false } }), null);
  assert.equal(elig({ rewardsEnabled: false }), null);
  for (const status of ['pending', 'shipped', 'returnRequested', 'returned', 'cancelled']) {
    assert.equal(elig({ status }), null, status);
  }
});

test('no card for an order delivered longer ago than the expiry; a future delivery time is ignored', () => {
  assert.equal(elig({ deliveredAtMs: 970 * DAY }), null);
  assert.deepEqual(elig({ deliveredAtMs: 1001 * DAY }), { anchorMs: 1000 * DAY, expiresAtMs: 1030 * DAY });
});

const plan = (over: Partial<ScratchReconcileInput>) =>
  planScratchReconcile({ status: 'delivered', ended: false, reachedCustomer: true, card: null, prize: null, give: null, ...over });
const GIVE = { anchorMs: 1, expiresAtMs: 2 };
const NONE = { card: null, prize: null, prizeState: null };

test('reconcile: gives a card only when eligible and none exists', () => {
  assert.deepEqual(plan({ give: GIVE }), { ...NONE, card: 'create' });
  assert.deepEqual(plan({ give: null }), NONE);
  assert.deepEqual(plan({ give: GIVE, card: { status: 'new', points: 0 } }), NONE);
});

test('reconcile: an unscratched card is cancelled when the order ends and restored when reopened', () => {
  const ended = { status: 'returned', ended: true, reachedCustomer: false };
  assert.deepEqual(plan({ ...ended, card: { status: 'new', points: 0 } }), { ...NONE, card: 'void' });
  assert.deepEqual(plan({ card: { status: 'void', points: 0, voidedBy: 'server' } }), { ...NONE, card: 'restore' });
  assert.deepEqual(plan({ card: { status: 'void', points: 0, voidedBy: 'admin:x' } }), NONE);
  assert.deepEqual(plan({ status: 'shipped', reachedCustomer: false, card: { status: 'void', points: 0, voidedBy: 'server' } }), NONE);
  assert.deepEqual(plan({ status: 'returnRequested', card: { status: 'new', points: 0 } }), NONE);
});

const won = (prizeState?: 'active' | 'held' | 'void') => ({ status: 'scratched' as const, points: 25, prizeState });

test('reconcile: a won prize follows its order', () => {
  // ends
  assert.deepEqual(
    plan({ status: 'returned', ended: true, reachedCustomer: false, card: won('active'), prize: { status: 'active', held: false } }),
    { card: null, prize: 'void', prizeState: 'void' },
  );
  // return opens, then is rejected
  assert.deepEqual(
    plan({ status: 'returnRequested', card: won('active'), prize: { status: 'active', held: false } }),
    { card: null, prize: 'hold', prizeState: 'held' },
  );
  assert.deepEqual(plan({ card: won('held'), prize: { status: 'active', held: true } }), { card: null, prize: 'release', prizeState: 'active' });
  // reopened after a server void
  assert.deepEqual(
    plan({ card: won('void'), prize: { status: 'void', held: false, voidedBy: 'server' } }),
    { card: null, prize: 'restore', prizeState: 'active' },
  );
  assert.deepEqual(
    plan({ status: 'returnScheduled', card: won('void'), prize: { status: 'void', held: false, voidedBy: 'server' } }),
    { card: null, prize: 'restore', prizeState: 'held' },
  );
  // voided by the shop: left alone, card mirrors it
  assert.deepEqual(plan({ card: won('active'), prize: { status: 'void', held: false, voidedBy: 'admin:x' } }), { ...NONE, prizeState: 'void' });
  // already in line
  assert.deepEqual(plan({ card: won('active'), prize: { status: 'active', held: false } }), NONE);
  // no prize: nothing to follow
  assert.deepEqual(plan({ status: 'returned', ended: true, card: { status: 'scratched', points: 0 } }), NONE);
});

const card = (over: Partial<ScratchCard>): ScratchCard => ({
  id: 'rzp_1', orderNumber: 'ORD-1', orderAmount: 600, status: 'new', points: 0,
  createdAtMs: 0, deliveredAtMs: 0, expiresAtMs: 10 * DAY, unlockAtMs: 7 * DAY, scratchedAtMs: 0, voidedAtMs: 0, ...over,
});

test('card view states', () => {
  assert.equal(scratchCardView(card({}), 1 * DAY), 'new');
  assert.equal(scratchCardView(card({}), 10 * DAY), 'expired');
  assert.equal(scratchCardView(card({ status: 'void' }), 1 * DAY), 'void');
  assert.equal(scratchCardView(card({ status: 'scratched', points: 0 }), 1 * DAY), 'nowin');
  assert.equal(scratchCardView(card({ status: 'scratched', points: 5, prizeState: 'active' }), 1 * DAY), 'won-pending');
  assert.equal(scratchCardView(card({ status: 'scratched', points: 5, prizeState: 'active' }), 7 * DAY), 'won-ready');
  assert.equal(scratchCardView(card({ status: 'scratched', points: 5, prizeState: 'held' }), 8 * DAY), 'won-held');
  assert.equal(scratchCardView(card({ status: 'scratched', points: 5, prizeState: 'void' }), 1 * DAY), 'won-void');
});

test('sort: waiting cards first by soonest expiry, then the rest newest first', () => {
  const now = 1 * DAY;
  const sorted = sortScratchCards(
    [
      card({ id: 'old-won', status: 'scratched', points: 5, scratchedAtMs: 2 }),
      card({ id: 'new-late', expiresAtMs: 20 * DAY }),
      card({ id: 'expired', expiresAtMs: 0.5 * DAY, createdAtMs: 1 }),
      card({ id: 'new-soon', expiresAtMs: 5 * DAY }),
      card({ id: 'recent-won', status: 'scratched', points: 5, scratchedAtMs: 9 }),
    ],
    now,
  );
  assert.deepEqual(sorted.map((c) => c.id), ['new-soon', 'new-late', 'recent-won', 'old-won', 'expired']);
});

test('prize stats for the admin page', () => {
  const st = scratchPrizeStats(S);
  assert.equal(st.totalWeight, 100);
  assert.equal(st.averagePoints, 13);
  assert.deepEqual(st.top, { points: 50, weight: 5 });
  assert.equal(st.topOneIn, 20);
  assert.equal(st.winShare, 1);
  const none = scratchPrizeStats({ ...S, prizes: [], noWinWeight: 0 });
  assert.equal(none.averagePoints, 0);
  assert.equal(none.top, null);
  assert.equal(none.topOneIn, null);
  assert.equal(none.winShare, 0);
});

test('void reasons read as plain words', () => {
  assert.equal(voidReasonText('order-returned'), 'order returned');
  assert.equal(voidReasonText('order-cancelled'), 'order cancelled');
  assert.equal(voidReasonText(undefined), 'order closed');
});

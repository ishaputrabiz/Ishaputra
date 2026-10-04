# Scratch & Win Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delivered online orders at or above an admin minimum give the customer one scratch card; scratching it makes the server draw a loyalty-points prize that follows the order like earned points.

**Architecture:** Pure rules in `src/lib/scratchWin.ts` (a `scratch-core` block copied into `api/notify-order.ts`, checked by the parity test). The server gives, cancels and restores cards inside `reconcileRewards` and draws prizes in a new `scratch-card` action, both in Firestore transactions. The browser only reads cards (`users/{uid}/scratchCards/{rzp}`) and asks the server to scratch.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui (Sheet, Dialog, Tabs), Firebase v10 web SDK, `firebase-admin` in Vercel functions, `node --test` with type stripping (Node 22).

**Spec:** `docs/superpowers/specs/2026-10-04-scratch-win-design.md`. Read it first; this plan does not repeat its rules.

## Global Constraints

- No new files in `api/`; the new action lives in `api/notify-order.ts` (Vercel Hobby: 12 functions, all used).
- `api/` files import nothing from `src/`. Shared code is copied between markers and synced with `npm run sync:rewards`.
- Feature ships off: `DEFAULT_SCRATCH_SETTINGS.enabled = false`. Placeholders: minimum ₹499, expiry 30 days, prizes 5/10/25/50 points at weights 40/35/20/5, better luck 0.
- Fixed ids only: `users/{uid}/scratchCards/{rzp}` and `users/{uid}/rewardLedger/scratch_{rzp}`, written only by the Admin SDK.
- Prize ledger entries are `kind: 'earn'`, `source: 'scratch'`; `rewards-core` does not change.
- Copy says "scratch the bronze foil", never "with your finger". No pop-ups. Real content only.
- Accessibility floor: 4.5:1 text, visible focus, keyboard path (Reveal prize), `prefers-reduced-motion` respected.
- Every colour works in light and dark. Check 390 px and 1440 px.
- Don't write to live Firestore, deploy rules, push or deploy without the owner's OK.
- Working-tree files are CRLF; patch scripts normalise `\r\n`.
- Node type stripping: no TypeScript parameter properties, enums or namespaces in files that tests import.

## File map

| File | Responsibility |
|---|---|
| `src/lib/scratchWin.ts` (new) | `scratch-core` (settings, draw, eligibility, reconcile planner) + browser helpers (card view, sort, stats) |
| `src/lib/format.ts` | add `formatDayMonth` ("4 Nov") |
| `scripts/sync-rewards-core.mjs` | sync both `rewards-core` and `scratch-core` |
| `tests/rewards-parity.test.ts` | parity for both blocks |
| `tests/scratchWin.test.ts` (new) | unit tests for the lib |
| `tests/helpers/fakeFirestore.ts` (new) | in-memory Firestore stand-in with transactions |
| `tests/scratch-server.test.ts` (new) | `scratchCard` and `reconcileRewards` against the stand-in |
| `api/notify-order.ts` | `scratch-core` copy, `reconcileScratchCard`, `scratchCard`, `scratch-card` action |
| `firestore.rules` | read-only `scratchCards` |
| `src/services/rewardsService.ts` | export `rewardsAction`; `source` on entries |
| `src/services/scratchWinService.ts` (new) | read cards and settings, save settings, scratch request |
| `src/hooks/useScratchCards.ts` (new) | live cards + settings for the wallet |
| `src/hooks/useWaitingScratchCards.ts` (new) | one shared `status == 'new'` listener per session for the header dot |
| `src/components/scratch/ScratchFoil.tsx` (new) | canvas foil, destination-out brush, cleared share |
| `src/components/scratch/ScratchCardStage.tsx` (new) | the card, the ask/reveal flow, result line, Next / Done |
| `src/components/scratch/ScratchCardDialog.tsx` (new) | Sheet (phone) or Dialog (desktop), queue of cards |
| `src/components/scratch/ScratchCardsPanel.tsx` (new) | wallet panel container + presentational view + tiles |
| `src/components/scratch/ScratchCardOrderNote.tsx` (new) | the order page line |
| `src/components/admin/ScratchWinSettingsTab.tsx` (new) | admin tab |
| `src/index.css` | Scratch & Win block: foil gradient, pop, sheen, reduced motion |
| `src/pages/PurchaseSummary.tsx` | mount the panel |
| `src/pages/admin/AdminCommerceSettings.tsx` | add the tab |
| `src/components/LoyaltyPointsButton.tsx` | copper dot |
| `src/components/rewards/RewardsWalletCard.tsx` | ticket icon for scratch prizes |
| `src/pages/OrderDetailsPage.tsx`, `src/pages/admin/AdminOrderDetails.tsx` | card lines |
| `CLIENT.md`, `docs/HANDOFF.md`, `docs/ui-system.md` | notes |

---

### Task 1: Shared rules (`src/lib/scratchWin.ts`) with tests

**Files:**
- Create: `src/lib/scratchWin.ts`, `tests/scratchWin.test.ts`
- Modify: `src/lib/format.ts`, `tests/format.test.ts`

**Interfaces (produces):**
- Types: `ScratchPrize { points; weight }`, `ScratchWinSettings { enabled; minOrder; expiryDays; prizes; noWinWeight }`, `ScratchCardState`, `ScratchPrizeState`, `ScratchReconcileInput`, `ScratchReconcilePlan`, `ScratchTiming { anchorMs; expiresAtMs }`, `ScratchCard`, `ScratchCardView`, `ScratchPrizeStats`.
- `DEFAULT_SCRATCH_SETTINGS`, `SCRATCH_MAX_PRIZES = 10`
- `normaliseScratchSettings(raw): ScratchWinSettings`
- `scratchTotalWeight(s): number`
- `drawScratchPrize(s, roll: number): number`
- `scratchCardEligible(i: { status; amountRupees; scratch; rewardsEnabled; deliveredAtMs; nowMs }): ScratchTiming | null`
- `planScratchReconcile(i: ScratchReconcileInput): ScratchReconcilePlan`
- Browser only (outside the core block): `scratchCardView(card, nowMs): ScratchCardView`, `sortScratchCards(cards, nowMs): ScratchCard[]`, `scratchPrizeStats(s): ScratchPrizeStats`, `voidReasonText(reason?: string): string`
- `formatDayMonth(value): string` in `src/lib/format.ts` ("4 Nov")

- [ ] **Step 1: Write the failing tests** (`tests/scratchWin.test.ts`)

```ts
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
```

Add to `tests/format.test.ts`:

```ts
test('formatDayMonth prints day and short month', () => {
  assert.equal(formatDayMonth(new Date(2026, 10, 4)), '4 Nov');
  assert.equal(formatDayMonth(null), '');
});
```
(and add `formatDayMonth` to that file's import from `../src/lib/format.ts`).

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/lib/scratchWin.ts'` and `formatDayMonth` is not a function.

- [ ] **Step 3: Implement `src/lib/scratchWin.ts`**

```ts
/**
 * Scratch & Win rules, shared by the storefront and api/notify-order.ts.
 * Pure and dependency-free.
 *
 * The block between the scratch-core markers is copied verbatim into
 * api/notify-order.ts (api/ files import nothing from src/) by
 * `npm run sync:rewards`. tests/rewards-parity.test.ts fails if it drifts.
 */

// >>> scratch-core
interface ScratchPrize {
  /** Loyalty points won. */
  points: number;
  /** Relative chance: a higher weight comes up more often. */
  weight: number;
}

interface ScratchWinSettings {
  enabled: boolean;
  /** Rupees paid online at or above which a delivered order gets a card. */
  minOrder: number;
  /** Days from delivery before an unscratched card expires. */
  expiryDays: number;
  prizes: ScratchPrize[];
  /** Weight of "better luck next time". */
  noWinWeight: number;
}

const SCRATCH_MAX_PRIZES = 10;

// TODO(client): placeholders until Ishaputra confirms them (CLIENT.md).
const DEFAULT_SCRATCH_SETTINGS: ScratchWinSettings = {
  enabled: false,
  minOrder: 499,
  expiryDays: 30,
  prizes: [
    { points: 5, weight: 40 },
    { points: 10, weight: 35 },
    { points: 25, weight: 20 },
    { points: 50, weight: 5 },
  ],
  noWinWeight: 0,
};

function normaliseScratchSettings(raw: Partial<ScratchWinSettings> | null | undefined): ScratchWinSettings {
  const whole = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
  };
  const d = DEFAULT_SCRATCH_SETTINGS;
  const rows: unknown[] = Array.isArray(raw?.prizes) ? (raw!.prizes as unknown[]) : d.prizes;
  const prizes: ScratchPrize[] = [];
  for (const row of rows) {
    const r = (row || {}) as Partial<ScratchPrize>;
    const points = whole(r.points, 0, 0, 10_000);
    if (points < 1) continue;
    prizes.push({ points, weight: whole(r.weight, 0, 0, 1_000) });
    if (prizes.length === SCRATCH_MAX_PRIZES) break;
  }
  return {
    enabled: raw?.enabled === true,
    minOrder: whole(raw?.minOrder, d.minOrder, 0, 1_000_000),
    expiryDays: whole(raw?.expiryDays, d.expiryDays, 1, 365),
    prizes,
    noWinWeight: whole(raw?.noWinWeight, d.noWinWeight, 0, 1_000),
  };
}

function scratchTotalWeight(s: ScratchWinSettings): number {
  return s.prizes.reduce((sum, p) => sum + p.weight, 0) + s.noWinWeight;
}

/**
 * The points a roll wins; 0 is "better luck next time". `roll` is a whole
 * number in [0, scratchTotalWeight(s)); anything else wins nothing.
 */
function drawScratchPrize(s: ScratchWinSettings, roll: number): number {
  let r = Math.floor(roll);
  if (!(r >= 0) || r >= scratchTotalWeight(s)) return 0;
  for (const p of s.prizes) {
    if (r < p.weight) return p.points;
    r -= p.weight;
  }
  return 0;
}

interface ScratchTiming {
  /** The expiry clock's start: the order's delivery time, or now when that is unknown. */
  anchorMs: number;
  expiresAtMs: number;
}

/**
 * Whether an order should get its card now (null: no). Only delivered orders,
 * only while Scratch & Win and loyalty rewards are on, only at or above the
 * minimum paid online, and never a card that would already have expired.
 */
function scratchCardEligible(i: {
  status: string;
  /** Rupees paid online for the order. */
  amountRupees: number;
  scratch: ScratchWinSettings;
  rewardsEnabled: boolean;
  /** order.deliveredAt in ms, 0 when unknown. */
  deliveredAtMs: number;
  nowMs: number;
}): ScratchTiming | null {
  if (i.status !== 'delivered' || !i.scratch.enabled || !i.rewardsEnabled) return null;
  if (!(i.amountRupees >= i.scratch.minOrder)) return null;
  const anchorMs = i.deliveredAtMs > 0 && i.deliveredAtMs <= i.nowMs ? i.deliveredAtMs : i.nowMs;
  const expiresAtMs = anchorMs + i.scratch.expiryDays * 86_400_000;
  return expiresAtMs > i.nowMs ? { anchorMs, expiresAtMs } : null;
}

interface ScratchCardState {
  status: 'new' | 'scratched' | 'void';
  points: number;
  prizeState?: 'active' | 'held' | 'void';
  voidedBy?: string;
}

interface ScratchPrizeState {
  status: 'active' | 'void';
  held: boolean;
  voidedBy?: string;
}

interface ScratchReconcileInput {
  /** The order's status. */
  status: string;
  /** Cancelled, returned or refunded. */
  ended: boolean;
  /** Delivered, or a return is open. */
  reachedCustomer: boolean;
  card: ScratchCardState | null;
  /** users/{uid}/rewardLedger/scratch_{rzp}, when it exists. */
  prize: ScratchPrizeState | null;
  /** scratchCardEligible's answer, when no card exists yet. */
  give: ScratchTiming | null;
}

interface ScratchReconcilePlan {
  card: 'create' | 'void' | 'restore' | null;
  prize: 'void' | 'restore' | 'hold' | 'release' | null;
  /** The card's new prizeState, only when it differs. */
  prizeState: 'active' | 'held' | 'void' | null;
}

/**
 * What reconcile changes on an order's card and its prize entry. A won prize
 * follows the order like earned points: spendable only while the order sits
 * at delivered, void when it ends, restored if the shop reopens it. A prize
 * or card voided by anyone but the server is left alone.
 */
function planScratchReconcile(i: ScratchReconcileInput): ScratchReconcilePlan {
  const plan: ScratchReconcilePlan = { card: null, prize: null, prizeState: null };
  const c = i.card;
  if (!c) {
    if (i.give && !i.ended) plan.card = 'create';
    return plan;
  }
  if (c.status === 'new') {
    if (i.ended) plan.card = 'void';
    return plan;
  }
  if (c.status === 'void') {
    if (c.voidedBy === 'server' && !i.ended && i.reachedCustomer) plan.card = 'restore';
    return plan;
  }
  const p = i.prize;
  if (!p || !(c.points > 0)) return plan;
  const held = i.status !== 'delivered';
  let next: 'active' | 'held' | 'void';
  if (p.status === 'active') {
    if (i.ended) {
      plan.prize = 'void';
      next = 'void';
    } else {
      if (held !== p.held) plan.prize = held ? 'hold' : 'release';
      next = held ? 'held' : 'active';
    }
  } else if (p.voidedBy === 'server' && !i.ended && i.reachedCustomer) {
    plan.prize = 'restore';
    next = held ? 'held' : 'active';
  } else {
    next = 'void';
  }
  if (c.prizeState !== next) plan.prizeState = next;
  return plan;
}
// <<< scratch-core

/** A card as the browser shows it (src/services/scratchWinService.ts maps the document). */
interface ScratchCard {
  id: string;
  orderNumber: string;
  orderAmount: number;
  status: 'new' | 'scratched' | 'void';
  /** 0 = better luck next time (or not scratched yet). */
  points: number;
  prizeState?: 'active' | 'held' | 'void';
  voidReason?: string;
  createdAtMs: number;
  deliveredAtMs: number;
  expiresAtMs: number;
  unlockAtMs: number;
  scratchedAtMs: number;
  voidedAtMs: number;
}

type ScratchCardView = 'new' | 'expired' | 'void' | 'nowin' | 'won-pending' | 'won-ready' | 'won-held' | 'won-void';

function scratchCardView(c: ScratchCard, nowMs: number): ScratchCardView {
  if (c.status === 'void') return 'void';
  if (c.status === 'new') return c.expiresAtMs > nowMs ? 'new' : 'expired';
  if (!(c.points > 0)) return 'nowin';
  if (c.prizeState === 'void') return 'won-void';
  if (c.prizeState === 'held') return 'won-held';
  return c.unlockAtMs > nowMs ? 'won-pending' : 'won-ready';
}

/** Waiting cards first (soonest expiry first), then the rest, newest first. */
function sortScratchCards(cards: ScratchCard[], nowMs: number): ScratchCard[] {
  const waiting = (c: ScratchCard) => scratchCardView(c, nowMs) === 'new';
  const latest = (c: ScratchCard) => Math.max(c.scratchedAtMs, c.voidedAtMs, c.createdAtMs);
  return [...cards].sort((a, b) => {
    const wa = waiting(a);
    const wb = waiting(b);
    if (wa !== wb) return wa ? -1 : 1;
    return wa ? a.expiresAtMs - b.expiresAtMs : latest(b) - latest(a);
  });
}

interface ScratchPrizeStats {
  totalWeight: number;
  /** Average points per card. */
  averagePoints: number;
  /** The biggest prize that can come up. */
  top: ScratchPrize | null;
  /** "About 1 in N cards" for the biggest prize. */
  topOneIn: number | null;
  /** Share of cards that win something, 0 to 1. */
  winShare: number;
}

function scratchPrizeStats(s: ScratchWinSettings): ScratchPrizeStats {
  const totalWeight = scratchTotalWeight(s);
  if (totalWeight <= 0) return { totalWeight: 0, averagePoints: 0, top: null, topOneIn: null, winShare: 0 };
  const averagePoints = s.prizes.reduce((sum, p) => sum + p.points * p.weight, 0) / totalWeight;
  const top = s.prizes.reduce<ScratchPrize | null>((m, p) => (p.weight > 0 && (!m || p.points > m.points) ? p : m), null);
  return {
    totalWeight,
    averagePoints,
    top,
    topOneIn: top ? Math.round(totalWeight / top.weight) : null,
    winShare: (totalWeight - s.noWinWeight) / totalWeight,
  };
}

/** 'order-returned' -> 'order returned'. */
function voidReasonText(reason?: string): string {
  return reason?.startsWith('order-') ? reason.replace(/-/g, ' ') : 'order closed';
}

export type {
  ScratchPrize,
  ScratchWinSettings,
  ScratchTiming,
  ScratchCardState,
  ScratchPrizeState,
  ScratchReconcileInput,
  ScratchReconcilePlan,
  ScratchCard,
  ScratchCardView,
  ScratchPrizeStats,
};
export {
  SCRATCH_MAX_PRIZES,
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
};
```

Add to `src/lib/format.ts` after `formatDate`:

```ts
/** '4 Nov'. Empty string when the date is missing. */
export function formatDayMonth(value: unknown): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (32 old + the new ones).

- [ ] **Step 5: Commit** `git add src/lib/scratchWin.ts src/lib/format.ts tests/scratchWin.test.ts tests/format.test.ts` and commit "Scratch & Win: shared rules".

---

### Task 2: Sync script and parity test for `scratch-core`

**Files:** Modify `scripts/sync-rewards-core.mjs`, `tests/rewards-parity.test.ts`.

**Interfaces:** consumes the `// >>> scratch-core` markers from Task 1. Produces `npm run sync:rewards` that syncs both blocks.

- [ ] **Step 1: Failing test.** Append to `tests/rewards-parity.test.ts` (generalise `block` to take the marker name):

```ts
const marked = (path: string, name: string) => {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf(`// >>> ${name}`);
  const end = text.indexOf(`// <<< ${name}`);
  assert.ok(start >= 0 && end > start, `${path} has no ${name} block`);
  return text.slice(start, end);
};

test('api copy of scratch-core matches src/lib/scratchWin.ts', () => {
  assert.equal(marked('api/notify-order.ts', 'scratch-core'), marked('src/lib/scratchWin.ts', 'scratch-core'));
});
```

- [ ] **Step 2:** `npm test` fails: `api/notify-order.ts has no scratch-core block`.

- [ ] **Step 3: Script.** Rewrite `scripts/sync-rewards-core.mjs` to loop over

```js
const BLOCKS = [
  { name: 'rewards-core', source: 'src/lib/rewards.ts', copies: ['api/create-order.ts', 'api/notify-order.ts'] },
  { name: 'scratch-core', source: 'src/lib/scratchWin.ts', copies: ['api/notify-order.ts'] },
];
```

using the existing read/replace logic per block, keeping each file's line endings. In `api/notify-order.ts`, insert an empty marked block right after `// <<< rewards-core`:

```ts

// ── Scratch & Win (cards and prizes) ──────────────────────────────────────────
// The block below is a verbatim copy of src/lib/scratchWin.ts.
// >>> scratch-core
// <<< scratch-core
```

then run `npm run sync:rewards`.

- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5: Commit** "Scratch & Win: sync scratch-core into notify-order".

---

### Task 3: Server: give, cancel and scratch cards (`api/notify-order.ts`)

**Files:**
- Create: `tests/helpers/fakeFirestore.ts`, `tests/scratch-server.test.ts`
- Modify: `api/notify-order.ts`

**Interfaces:**
- Consumes: Task 1 core functions (inside the copied block).
- Produces: `export async function scratchCard(db, uid: string, cardId: string, roll?: (total: number) => number): Promise<{ status: 200 | 404 | 409; body: Record<string, unknown> }>`; `reconcileRewards` now also returns scratch changes (`scratchCards/<rzp>`, `scratchCards/<rzp>:void|restore|prize-void|prize-restore|prize-hold|prize-release|prize-state`); handler action `scratch-card` returning `{ ok: true, points, held, unlockAtMs, scratchedAtMs }` or `{ error: 'card_not_found' | 'card_expired' | 'card_void', reason? }`.

- [ ] **Step 1: The Firestore stand-in** (`tests/helpers/fakeFirestore.ts`). Supports `collection().doc()`, nested `doc().collection()`, `get/create/set/update` and `runTransaction` with optimistic concurrency (a transaction whose reads changed before commit is retried, like Firestore's), so racing scratches can be tested.

```ts
/** In-memory Firestore stand-in for server tests: documents, subcollections and retried transactions. */
type Data = Record<string, any>;

class FakeSnap {
  id: string;
  ref: FakeDoc;
  exists: boolean;
  private value: Data | undefined;
  constructor(ref: FakeDoc, value: Data | undefined) {
    this.ref = ref;
    this.id = ref.id;
    this.value = value;
    this.exists = value !== undefined;
  }
  data() {
    return this.value ? { ...this.value } : undefined;
  }
}

class FakeDoc {
  db: FakeFirestore;
  path: string;
  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
  }
  get id() {
    return this.path.split('/').pop() as string;
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnap(this, this.db.read(this.path));
  }
  async create(data: Data) {
    this.db.applyCreate(this.path, data);
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    this.db.applySet(this.path, data, opts?.merge === true);
  }
  async update(data: Data) {
    this.db.applyUpdate(this.path, data);
  }
}

class FakeCollection {
  db: FakeFirestore;
  path: string;
  constructor(db: FakeFirestore, path: string) {
    this.db = db;
    this.path = path;
  }
  doc(id: string) {
    return new FakeDoc(this.db, `${this.path}/${id}`);
  }
  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.docs.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => new FakeSnap(new FakeDoc(this.db, p), this.db.read(p)));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeTx {
  db: FakeFirestore;
  reads = new Map<string, number>();
  writes: Array<() => void> = [];
  constructor(db: FakeFirestore) {
    this.db = db;
  }
  async get(ref: FakeDoc) {
    if (this.writes.length) throw new Error('Firestore transactions require all reads before all writes');
    this.reads.set(ref.path, this.db.version(ref.path));
    await Promise.resolve(); // let a racing transaction interleave, like a network round trip
    return new FakeSnap(ref, this.db.read(ref.path));
  }
  create(ref: FakeDoc, data: Data) {
    this.writes.push(() => this.db.applyCreate(ref.path, data));
    return this;
  }
  set(ref: FakeDoc, data: Data, opts?: { merge?: boolean }) {
    this.writes.push(() => this.db.applySet(ref.path, data, opts?.merge === true));
    return this;
  }
  update(ref: FakeDoc, data: Data) {
    this.writes.push(() => this.db.applyUpdate(ref.path, data));
    return this;
  }
}

export class FakeFirestore {
  docs = new Map<string, Data>();
  versions = new Map<string, number>();
  /** Transactions retried because a document they read changed first. */
  retries = 0;

  collection(name: string) {
    return new FakeCollection(this, name);
  }
  doc(path: string) {
    return new FakeDoc(this, path);
  }
  read(path: string) {
    const d = this.docs.get(path);
    return d ? { ...d } : undefined;
  }
  version(path: string) {
    return this.versions.get(path) || 0;
  }
  private bump(path: string) {
    this.versions.set(path, this.version(path) + 1);
  }
  applyCreate(path: string, data: Data) {
    if (this.docs.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS: ${path} already exists`), { code: 6 });
    this.docs.set(path, { ...data });
    this.bump(path);
  }
  applySet(path: string, data: Data, merge: boolean) {
    this.docs.set(path, merge ? { ...(this.docs.get(path) || {}), ...data } : { ...data });
    this.bump(path);
  }
  applyUpdate(path: string, data: Data) {
    const cur = this.docs.get(path);
    if (!cur) throw Object.assign(new Error(`NOT_FOUND: ${path}`), { code: 5 });
    this.docs.set(path, { ...cur, ...data });
    this.bump(path);
  }
  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = new FakeTx(this);
      const out = await fn(tx);
      const stale = [...tx.reads].some(([path, v]) => this.version(path) !== v);
      if (stale) {
        this.retries++;
        continue;
      }
      tx.writes.forEach((w) => w());
      return out;
    }
    throw new Error('ABORTED: too much contention');
  }
}
```

- [ ] **Step 2: Failing server tests** (`tests/scratch-server.test.ts`)

```ts
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

/** A paid online order with its payment record, rewards on and Scratch & Win live. */
function shop(opts: { amount?: number; scratchOn?: boolean; status?: string; deliveredAgoDays?: number } = {}) {
  const db = new FakeFirestore();
  const amount = opts.amount ?? 600;
  db.doc(`payments/${RZP}`).set({ uid: UID, amountPaise: amount * 100, base: amount, points: 0, pointsValue: 0, cashback: 0 });
  db.doc('siteSettings/rewards').set({ enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 });
  db.doc('siteSettings/scratchWin').set({ enabled: opts.scratchOn ?? true, minOrder: 499, expiryDays: 30, prizes: [{ points: 5, weight: 40 }, { points: 10, weight: 35 }, { points: 25, weight: 20 }, { points: 50, weight: 5 }], noWinWeight: 0 });
  const order: Record<string, any> = {
    userId: UID,
    orderId: 'ORD-1042',
    razorpayOrderId: RZP,
    status: opts.status ?? 'delivered',
    paymentStatus: 'paid',
    total: amount,
    deliveredAt: T(now() - (opts.deliveredAgoDays ?? 0) * DAY),
  };
  db.doc(`orders/${RZP}`).set(order);
  return db;
}

const cardPath = `users/${UID}/scratchCards/${RZP}`;
const prizePath = `users/${UID}/rewardLedger/scratch_${RZP}`;
const setStatus = async (db: FakeFirestore, status: string) => {
  db.applyUpdate(`orders/${RZP}`, { status });
  return reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
};

test('delivery gives one card, with the order unlock date and a 30-day expiry', async () => {
  const db = shop();
  const r = await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  assert.ok(r.changed.includes(`scratchCards/${RZP}`));
  const card = db.read(cardPath)!;
  assert.equal(card.status, 'new');
  assert.equal(card.orderNumber, 'ORD-1042');
  assert.equal(card.orderAmount, 600);
  const earn = db.read(`users/${UID}/rewardLedger/earn_${RZP}`)!;
  assert.equal(card.unlockAt.toMillis(), earn.unlockAt.toMillis());
  assert.ok(Math.abs(card.expiresAt.toMillis() - (card.deliveredAt.toMillis() + 30 * DAY)) < 5);
  // running it again changes nothing
  const again = await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  assert.ok(!again.changed.some((c) => c.startsWith('scratchCards')));
});

test('no card below the minimum, while off, before delivery, or long after delivery', async () => {
  for (const db of [shop({ amount: 498 }), shop({ scratchOn: false }), shop({ status: 'shipped' }), shop({ deliveredAgoDays: 31 })]) {
    await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
    assert.equal(db.read(cardPath), undefined);
  }
});

test('scratching draws on the server, writes the prize entry once, and a second scratch returns the same prize', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  const first = await scratchCard(db as any, UID, RZP, () => 60); // 40+35 = 75 > 60 >= 40: 10 points
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
  const second = await scratchCard(db as any, UID, RZP, () => 99);
  assert.equal(second.status, 200);
  assert.equal(second.body.points, 10);
});

test('two scratches racing commit one draw', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  let rolls = 0;
  const roll = () => (rolls++ === 0 ? 0 : 99); // first draw 5 points, any later draw 50
  const [a, b] = await Promise.all([scratchCard(db as any, UID, RZP, roll), scratchCard(db as any, UID, RZP, roll)]);
  assert.equal(a.body.points, b.body.points);
  assert.equal(db.read(prizePath)!.amount, a.body.points);
  assert.ok(db.retries >= 1);
});

test('better luck next time writes no ledger entry', async () => {
  const db = shop();
  db.applyUpdate('siteSettings/scratchWin', { noWinWeight: 100 });
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  const r = await scratchCard(db as any, UID, RZP, () => 150);
  assert.equal(r.body.points, 0);
  assert.equal(db.read(prizePath), undefined);
  assert.equal(db.read(cardPath)!.status, 'scratched');
});

test('cards still scratch after the switch is turned off', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  db.applyUpdate('siteSettings/scratchWin', { enabled: false });
  const r = await scratchCard(db as any, UID, RZP, () => 0);
  assert.equal(r.status, 200);
  assert.equal(r.body.points, 5);
});

test('refusals: missing, someone else, expired, cancelled, order ended', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  assert.equal((await scratchCard(db as any, UID, 'order_OTHER', () => 0)).status, 404);
  assert.equal((await scratchCard(db as any, 'intruder', RZP, () => 0)).status, 404);

  db.applyUpdate(cardPath, { expiresAt: T(now() - 1000) });
  const expired = await scratchCard(db as any, UID, RZP, () => 0);
  assert.deepEqual([expired.status, expired.body.error], [409, 'card_expired']);

  db.applyUpdate(cardPath, { expiresAt: T(now() + DAY) });
  db.applyUpdate(`orders/${RZP}`, { status: 'returned' }); // reconcile has not run yet
  const ended = await scratchCard(db as any, UID, RZP, () => 0);
  assert.deepEqual([ended.status, ended.body.error, ended.body.reason], [409, 'card_void', 'order-returned']);
  assert.equal(db.read(cardPath)!.status, 'void');
  assert.equal(db.read(prizePath), undefined);
  const again = await scratchCard(db as any, UID, RZP, () => 0);
  assert.deepEqual([again.status, again.body.error], [409, 'card_void']);
});

test('a scratch while a return is open is held; the prize follows the order', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  db.applyUpdate(`orders/${RZP}`, { status: 'returnRequested' });
  const r = await scratchCard(db as any, UID, RZP, () => 99);
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

  await setStatus(db, 'delivered'); // shop reopens it
  assert.equal(db.read(prizePath)!.status, 'active');
  assert.equal(db.read(cardPath)!.prizeState, 'active');
});

test('an unscratched card is cancelled when the order ends and comes back if reopened', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  await setStatus(db, 'cancelled');
  assert.deepEqual([db.read(cardPath)!.status, db.read(cardPath)!.voidReason], ['void', 'order-cancelled']);
  await setStatus(db, 'delivered');
  assert.equal(db.read(cardPath)!.status, 'new');
});

test('a prize voided by the shop stays void', async () => {
  const db = shop();
  await reconcileRewards(db as any, RZP, db.read(`orders/${RZP}`)!);
  await scratchCard(db as any, UID, RZP, () => 0);
  db.applyUpdate(prizePath, { status: 'void', voidedBy: 'admin:a1' });
  await setStatus(db, 'delivered');
  assert.equal(db.read(prizePath)!.status, 'void');
  assert.equal(db.read(cardPath)!.prizeState, 'void');
});
```

- [ ] **Step 3:** `npm test` fails: `scratchCard` is not exported.

- [ ] **Step 4: Implement in `api/notify-order.ts`**

Add `import { randomInt } from 'node:crypto';` after the `firebase-admin` import. Update the header comment to list `{ action: 'scratch-card', orderId }`.

After `releaseHolds`, add:

```ts
// ── Scratch & Win ─────────────────────────────────────────────────────────────

const scratchRefs = (db: admin.firestore.Firestore, uid: string, rzp: string) => ({
  card: db.collection('users').doc(uid).collection('scratchCards').doc(rzp),
  prize: db.collection('users').doc(uid).collection('rewardLedger').doc(`scratch_${rzp}`),
  order: db.collection('orders').doc(rzp),
});

async function loadScratchSettings(db: admin.firestore.Firestore): Promise<ScratchWinSettings> {
  const snap = await db.collection('siteSettings').doc('scratchWin').get();
  return normaliseScratchSettings(snap.exists ? (snap.data() as Partial<ScratchWinSettings>) : null);
}

/**
 * Give, cancel or restore an order's scratch card, and keep a won prize in
 * line with the order (see planScratchReconcile). One transaction that also
 * re-reads the order, so a scratch racing a status change cannot leave an
 * active prize on an ended order.
 */
async function reconcileScratchCard(
  db: admin.firestore.Firestore,
  uid: string,
  rzp: string,
  payment: PaymentRecord,
  rewards: RewardSettings,
  earnUnlockAt: admin.firestore.Timestamp | null,
): Promise<string[]> {
  const refs = scratchRefs(db, uid, rzp);
  const scratch = await loadScratchSettings(db);
  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(refs.order);
    const cardSnap = await tx.get(refs.card);
    const prizeSnap = await tx.get(refs.prize);
    const order = orderSnap.data();
    if (!order || order.userId !== uid) return [];
    const status = String(order.status || '');
    const ended = ENDED_STATUSES.includes(status);
    const now = admin.firestore.Timestamp.now();
    const c = cardSnap.data();
    const p = prizeSnap.data();
    const give = c
      ? null
      : scratchCardEligible({
          status,
          amountRupees: whole(payment.amountPaise) / 100,
          scratch,
          rewardsEnabled: rewards.enabled,
          deliveredAtMs: millis(order.deliveredAt),
          nowMs: now.toMillis(),
        });
    const plan = planScratchReconcile({
      status,
      ended,
      reachedCustomer: status === 'delivered' || isReturnOpen(order),
      card: c ? { status: c.status, points: whole(c.points), prizeState: c.prizeState, voidedBy: c.voidedBy } : null,
      prize: p ? { status: p.status === 'void' ? 'void' : 'active', held: p.held === true, voidedBy: p.voidedBy } : null,
      give,
    });
    const changed: string[] = [];
    const id = `scratchCards/${rzp}`;
    if (plan.card === 'create' && give) {
      tx.create(refs.card, {
        orderId: rzp,
        orderNumber: String(order.orderId || rzp),
        orderAmount: whole(payment.amountPaise) / 100,
        status: 'new',
        createdAt: now,
        deliveredAt: admin.firestore.Timestamp.fromMillis(give.anchorMs),
        expiresAt: admin.firestore.Timestamp.fromMillis(give.expiresAtMs),
        unlockAt: earnUnlockAt ?? admin.firestore.Timestamp.fromMillis(now.toMillis() + rewards.unlockDays * DAY_MS),
        createdBy: 'server',
      });
      changed.push(id);
    } else if (plan.card === 'void') {
      tx.update(refs.card, { status: 'void', voidedAt: now, voidedBy: 'server', voidReason: `order-${status}` });
      changed.push(`${id}:void`);
    } else if (plan.card === 'restore') {
      tx.update(refs.card, { status: 'new', restoredAt: now });
      changed.push(`${id}:restore`);
    }
    if (plan.prize === 'void') {
      tx.update(refs.prize, { status: 'void', voidedAt: now, voidedBy: 'server', voidReason: `order-${status}` });
    } else if (plan.prize === 'restore') {
      tx.update(refs.prize, { status: 'active', held: status !== 'delivered', restoredAt: now });
    } else if (plan.prize === 'hold' || plan.prize === 'release') {
      tx.update(refs.prize, { held: plan.prize === 'hold' });
    }
    if (plan.prize) changed.push(`${id}:prize-${plan.prize}`);
    if (plan.prizeState) {
      tx.update(refs.card, { prizeState: plan.prizeState });
      changed.push(`${id}:prize-state`);
    }
    return changed;
  });
}

type ScratchReply = { status: 200 | 404 | 409; body: Record<string, unknown> };

/**
 * Scratch one of the caller's cards: the server draws the prize. One
 * transaction reads the card, its order and its prize entry; the draw happens
 * inside it, so a retried transaction draws again and only one draw is ever
 * committed. The answer is sent after the commit, so it cannot be peeked at
 * and abandoned. Scratching an already scratched card returns its prize.
 */
export async function scratchCard(
  db: admin.firestore.Firestore,
  uid: string,
  cardId: string,
  roll: (total: number) => number = (total) => randomInt(total),
): Promise<ScratchReply> {
  const refs = scratchRefs(db, uid, cardId);
  const scratch = await loadScratchSettings(db);
  return db.runTransaction(async (tx): Promise<ScratchReply> => {
    const cardSnap = await tx.get(refs.card);
    const orderSnap = await tx.get(refs.order);
    const prizeSnap = await tx.get(refs.prize);
    const c = cardSnap.data();
    if (!c) return { status: 404, body: { error: 'card_not_found' } };
    const reply = (d: Record<string, any>): ScratchReply => ({
      status: 200,
      body: {
        ok: true,
        points: whole(d.points),
        held: d.prizeState === 'held',
        unlockAtMs: millis(d.unlockAt),
        scratchedAtMs: millis(d.scratchedAt),
      },
    });
    if (c.status === 'scratched') return reply(c);
    if (c.status !== 'new') return { status: 409, body: { error: 'card_void', reason: c.voidReason || '' } };
    const now = admin.firestore.Timestamp.now();
    if (millis(c.expiresAt) <= now.toMillis()) return { status: 409, body: { error: 'card_expired' } };

    const order = orderSnap.data();
    const status = String(order?.status || '');
    if (!order || order.userId !== uid || ENDED_STATUSES.includes(status)) {
      const reason = !order ? 'order-missing' : order.userId !== uid ? 'order-not-yours' : `order-${status}`;
      tx.update(refs.card, { status: 'void', voidedAt: now, voidedBy: 'server', voidReason: reason });
      return { status: 409, body: { error: 'card_void', reason } };
    }

    const held = status !== 'delivered';
    const existing = prizeSnap.data();
    const total = scratchTotalWeight(scratch);
    // A prize entry without a scratched card should never exist; if one does, keep it rather than draw again.
    const points = existing ? whole(existing.amount) : total > 0 ? drawScratchPrize(scratch, roll(total)) : 0;
    if (points > 0 && !existing) {
      tx.create(refs.prize, {
        currency: 'points',
        amount: points,
        kind: 'earn',
        source: 'scratch',
        status: 'active',
        held,
        unlockAt: c.unlockAt,
        orderId: cardId,
        razorpayOrderId: cardId,
        note: `Scratch card prize, order ${c.orderNumber || cardId}`,
        createdAt: now,
        createdBy: 'server',
      });
    }
    const update: Record<string, unknown> = { status: 'scratched', points, scratchedAt: now };
    if (points > 0) update.prizeState = existing?.status === 'void' ? 'void' : held ? 'held' : 'active';
    tx.update(refs.card, update);
    return reply({ ...c, ...update });
  });
}
```

In `reconcileRewards`, before `// 4. What the order pages show`, add:

```ts
  // 4. Scratch card: given on delivery, cancelled (or its prize voided) when the order ends.
  changed.push(...(await reconcileScratchCard(db, uid, rzp, payment, settings, earn?.unlockAt ?? null)));
```

and renumber the next comment to `// 5.`.

In the handler: `const isScratch = body.action === 'scratch-card';`, change the audience guard to `if (!isReconcile && !isRelease && !isScratch)`, document the action in the body type comment, and before the order lookup add:

```ts
  if (isScratch) {
    try {
      // The caller's own card: users/<callerUid>/scratchCards/<orderId>.
      const r = await scratchCard(db, callerUid, orderId);
      return res.status(r.status).json(r.body);
    } catch (err: any) {
      // Nothing was written: the card stays unscratched for another try.
      return res.status(503).json({ error: 'scratch_failed', detail: err?.message || String(err) });
    }
  }
```

- [ ] **Step 5:** `npm test` passes (all files).
- [ ] **Step 6: Commit** "Scratch & Win: server gives, cancels and scratches cards".

---

### Task 4: Security rule

**Files:** Modify `firestore.rules` (after the `rewardState` block).

- [ ] **Step 1:** Add

```
      // --- SCRATCH CARDS (Scratch & Win) ---
      // Given, cancelled and scratched only by api/notify-order.ts through the
      // Admin SDK (the server draws the prize). Customers read their own.
      match /scratchCards/{cardId} {
        allow read: if isOwner(userId) || isAdmin();
        allow write: if false;
      }
```

- [ ] **Step 2:** No emulator here (no Java). Check the syntax by eye against the neighbouring blocks. Deploying is the owner's call (`node docs/handoff/deploy-rules.mjs`); note it in HANDOFF.
- [ ] **Step 3: Commit** with Task 5 (it has no test of its own).

---

### Task 5: Browser data layer

**Files:** Create `src/services/scratchWinService.ts`, `src/hooks/useScratchCards.ts`, `src/hooks/useWaitingScratchCards.ts`. Modify `src/services/rewardsService.ts`.

**Interfaces:**
- `rewardsService.ts`: `export async function rewardsAction(payload)` (now exported); `RewardEntry.source?: string` mapped from `d.source`.
- `scratchWinService.ts`:
  - `toScratchCard(id: string, d: Record<string, any>): ScratchCard`
  - `subscribeScratchCards(uid, cb: (cards: ScratchCard[]) => void, onError: (err: Error) => void): Unsubscribe`
  - `subscribeWaitingScratchCards(uid, cb, onError)`: `where('status', '==', 'new')`
  - `subscribeScratchSettings(cb: (s: ScratchWinSettings) => void): Unsubscribe` (a failed read gives the defaults, which are off)
  - `getScratchSettings(): Promise<ScratchWinSettings>` (throws), `saveScratchSettings(s): Promise<void>` (normalised, `updatedAt`, merge)
  - `getScratchCard(uid, orderId): Promise<ScratchCard | null>` (never throws; null on error)
  - `type ScratchResult = { ok: true; points: number; held: boolean; unlockAtMs: number } | { ok: false; reason: 'expired' | 'void' | 'missing' | 'network'; voidReason?: string; detail?: string }`
  - `requestScratch(orderId): Promise<ScratchResult>` (POST `{ action: 'scratch-card', orderId }` through `rewardsAction`; 409 `card_expired` gives `expired`, other 409 `void`, 404 `missing`, anything else `network`)
- `useScratchCards(uid)`: `{ cards: ScratchCard[] (sorted), settings: ScratchWinSettings | null, loading, error, retry }`; re-sorts every minute.
- `useWaitingScratchCards(): number`: one module-level listener per uid (started by the first mounted caller, swapped on sign-in/out, never per page view) through `useSyncExternalStore`; counts new cards whose `expiresAtMs > Date.now()`; errors count as 0 and log nothing.

- [ ] **Step 1:** Write the three files and the `rewardsService` edits.
- [ ] **Step 2:** `npm run build` passes.
- [ ] **Step 3: Commit** (with Task 4) "Scratch & Win: rules and browser data layer".

---

### Task 6: The scratch card (foil, stage, dialog) and its CSS

**Files:** Create `src/components/scratch/ScratchFoil.tsx`, `ScratchCardStage.tsx`, `ScratchCardDialog.tsx`. Modify `src/index.css`.

**Interfaces:**
- `ScratchFoil({ resetKey: number; fading: boolean; onFirstStroke(): void; onCleared(): void })`: a canvas filling its positioned parent, `aria-hidden`, `touch-none`. Paints the bronze foil (gradient stops `#6f5230 0, #b8925a .22, #8c6834 .42, #d4b27a .62, #94703c .82, #6a4d2a 1`, deterministic brushed hairlines, inner bevel, "IS" monogram ring, "SCRATCH TO REVEAL", "or press Reveal prize below") at device-pixel size with a `ResizeObserver` (repaints on size change only before the first stroke) and after `document.fonts.ready`. Brush: round, `max(34, height × 0.17)` device px, `destination-out`. Every 6th move samples every 24th alpha value; over 50% cleared calls `onCleared` once. `resetKey` change repaints fresh. `fading` fades it out over 300 ms (opacity).
- `ScratchCardStage({ card: ScratchCard; position?: { index: number; total: number }; scratch: () => Promise<ScratchResult>; pointValue: number; unlockDays: number; minOrder: number | null; onNext?: () => void; onDone: () => void; onGone?: (reason: 'expired' | 'void' | 'missing') => void })`:
    - phases `idle → asking → (ready) → revealed`, or `error` (foil repainted, Notice "Couldn't reveal this card. Check your connection and try again." + Try again), or `gone` (Notice: "This card has expired." / "This card was cancelled: order returned." / "This card is no longer available.").
    - The first stroke or Reveal asks once; reveal happens when the prize is known and the customer cleared 50% or pressed Reveal.
    - Face: skeleton while unknown; won: "You won" / number / "Points" / "Worth ₹N" (formatINR of points × pointValue); no prize: "Not this time" / "Better luck next time" / "Thanks for shopping with Ishaputra."
    - Card chrome as the mockup: `tx-slate tx-contour rounded-panel p-4 shadow-panel`, eyebrow "Scratch & Win", order number, `aspect-[16/10] rounded-card` face with `role="img"` and label ("Scratch card, not revealed yet" / "You won N points" / "No prize this time"), footer "Expires 4 Nov 2026" or "Scratched 5 Oct 2026", and "1 of 2 new" when `total > 1`.
    - Below: before reveal, an outline "Reveal prize" button (Eye icon, full width) and "Scratch the bronze foil, or press Reveal prize."; after, a `role="status"` line with the result copy from the spec, then a 2-column row "Next card" (only with `onNext`) and "Done" (full width when alone).
    - Reveal motion: foil fades, face gets `sw-pop`, a won face gets one `sw-sheen` sweep.
- `ScratchCardDialog({ open; onOpenChange; cards: ScratchCard[]; startId?: string; scratch: (card) => Promise<ScratchResult>; pointValue; unlockDays; minOrder; title?: string; describe?: (card) => string })`: a bottom Sheet below 1024 px, a Dialog (`max-w-[440px]`) from 1024 px. The queue is fixed when it opens (the `new` cards, starting at `startId`), so a card that turns `scratched` stays on screen. Title "Scratch card" gets focus on open (no ring on Reveal). Description "For order ORD-1042, delivered 5 Oct". Sheet has the grab bar and `tx-paper`.
- `src/index.css` Scratch & Win block:

```css
/* ── Scratch & Win (src/components/scratch/) ─────────────────────────────── */
.scratch-foil {
  background-image: linear-gradient(125deg, #6f5230 0%, #b8925a 22%, #8c6834 42%, #d4b27a 62%, #94703c 82%, #6a4d2a 100%);
}
@keyframes sw-sheen {
  from { transform: translateX(-130%) skewX(-18deg); }
  to { transform: translateX(260%) skewX(-18deg); }
}
.sw-sheen { animation: sw-sheen 900ms cubic-bezier(0.23, 1, 0.32, 1) 160ms 1 both; }
@keyframes sw-pop {
  from { transform: scale(0.96); opacity: 0.5; }
  to { transform: none; opacity: 1; }
}
.sw-pop { animation: sw-pop 320ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .sw-sheen { display: none; }
  .sw-pop { animation: sw-fade 200ms ease-out both; }
}
@keyframes sw-fade { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 1:** Write the three components and the CSS block.
- [ ] **Step 2:** `npm run build` passes.
- [ ] **Step 3: Commit** "Scratch & Win: the scratch card".

---

### Task 7: Wallet panel, order notes, header dot, history icon

**Files:** Create `src/components/scratch/ScratchCardsPanel.tsx`, `src/components/scratch/ScratchCardOrderNote.tsx`. Modify `src/pages/PurchaseSummary.tsx` (panel between the tier card and `<RewardsWalletCard>`), `src/components/LoyaltyPointsButton.tsx`, `src/components/rewards/RewardsWalletCard.tsx`, `src/pages/OrderDetailsPage.tsx`, `src/pages/admin/AdminOrderDetails.tsx`.

**Interfaces:**
- `ScratchCardsPanel({ uid })`: container (useScratchCards, `subscribeRewardSettings` for `pointValue`/`unlockDays`, `?card=` deep link opened once then removed with `replace`) rendering `ScratchCardsPanelView`.
- `ScratchCardsPanelView({ cards; settings: ScratchWinSettings; loading; error; onRetry; onOpen(cardId); nowMs })`: exported for the screenshot harness. Hidden (`null`) when `!settings.enabled && cards.length === 0`, or when `!settings.enabled && error`. Section `panel tx-sheet mb-6 p-6`, `aria-labelledby="scratch-heading"`, heading "Scratch cards" with the `tx-slate` Ticket badge and the copper "N new" chip. List `ul` as the mockup (swipe row, `lg:grid lg:grid-cols-5`), first 10 then "Show all N" / "Show recent only". Tiles per the spec's states. Footer line per the spec. Loading: two skeleton tiles. Empty and on: "Your first card comes with your next delivered order of ₹499 or more."
- `ScratchCardOrderNote({ card: ScratchCard | null; nowMs })`: null unless the card is `new` (unexpired): "A scratch card is waiting for this order." + link "Scratch it" to `/wallet?card=<id>`; or won: "Scratch card: you won N points" (+ " (taken back, order returned)" when void). Same look as the points line (`flex items-start gap-2 px-4 pb-3 text-xs text-muted-foreground`, Ticket icon in primary).
- `LoyaltyPointsButton`: `useWaitingScratchCards() > 0` adds a copper dot (`absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background`, `aria-hidden`) and the label "Rewards, scratch card waiting". Also export `LoyaltyPointsButtonView({ size, waiting })` for the harness.
- `RewardsWalletCard`: `const Icon = e.source === 'scratch' ? Ticket : KIND_ICON[e.kind] || SlidersHorizontal`.
- `OrderDetailsPage`: `getScratchCard(user.uid, order.id)` once per order id when the order has `razorpayOrderId`; render `ScratchCardOrderNote` under the points note.
- `AdminOrderDetails`: `getScratchCard(order.userId, order.id)`; one more line in the rewards area: "Scratch card: not scratched yet, expires 4 Nov 2026" / "won N points" (+ " (on hold)" / " (voided, order returned)") / "no prize" / "cancelled (order returned)" / "expired, not scratched".

- [ ] **Step 1:** Write and wire them.
- [ ] **Step 2:** `npm run build` passes.
- [ ] **Step 3: Commit** "Scratch & Win: wallet panel, order notes and header dot".

---

### Task 8: Admin tab

**Files:** Create `src/components/admin/ScratchWinSettingsTab.tsx`. Modify `src/pages/admin/AdminCommerceSettings.tsx` (Ticket import; trigger "Scratch & Win" after Rewards; `<TabsContent value="scratch">`).

**Interfaces:** `ScratchWinSettingsTab()` loads `getScratchSettings()` and `getRewardSettings()` together; a failed load shows the danger Notice with Retry and a disabled Save (never defaults). Form state rows `{ id, points, weight }`. Layout and copy exactly as the mockup (spec "Admin"). Stats from `scratchPrizeStats(normaliseScratchSettings(form))`: "Average cost per card" `"13 pts"` / `"₹13, 2.6% of a ₹499 order"`; "Biggest prize" `"50 pts"` / `"About 1 in 20 cards"` (or "Never drawn"); "Cards that win" `"100%"` / `"Better luck next time: 0%"`. Chip from the saved settings. Add prize adds `{ points: 100, weight: 1 }`, disabled at 10. Preview opens `ScratchCardDialog` with one fake card (`orderNumber: 'PREVIEW'`), title "Preview card", description "Preview, gives nothing", and a local draw (`crypto.getRandomValues`). Save normalises, writes, reloads the form with what was written, toasts "Scratch & Win saved" (+ "Values outside the allowed range were adjusted to fit." when clamped).

- [ ] **Step 1:** Write and wire it.
- [ ] **Step 2:** `npm run build` passes.
- [ ] **Step 3: Commit** "Scratch & Win: admin tab".

---

### Task 9: Verify in a browser

**Files:** a temporary, git-excluded harness: `scratch-harness.html` (copy of `index.html`'s head) + `src/dev/ScratchHarness.tsx`, listed in `.git/info/exclude`, deleted at the end.

- [ ] **Step 1:** Harness renders, from fixtures: the wallet panel view (new ×2, won pending, no prize, expired, cancelled), the dialog for a new card with a fake `scratch` (resolves after 400 ms with 25 points; `?fail=1` rejects once), the order note, the header icon with the dot, and the admin tab (reads live `siteSettings`, writes nothing). `?theme=dark` sets the class.
- [ ] **Step 2:** Start `npx vite --port 5182 --strictPort --host 127.0.0.1` (check `netstat -ano | grep :5182` first). A scratchpad Playwright script captures 390 and 1440, light and dark: the panel, the sheet/dialog before, mid-scratch (pointer drag), and after the reveal, the admin tab; logs console errors and page width. Expected: 0 console errors, no horizontal overflow, focus on the title when the sheet opens, Reveal works by keyboard.
- [ ] **Step 3:** Load the real `/` and `/wallet` (signed out) once: 0 console errors.
- [ ] **Step 4:** `npm test`, `npm run build`, type check (`tsconfig.check.json`: only the known `videoCallService` 6 and `DeliveryDashboard` 1 errors), ESLint on the new files.
- [ ] **Step 5:** Delete the harness and its exclude lines.

---

### Task 10: Docs

**Files:** `CLIENT.md` (Scratch & Win section with the placeholders; Features line; decisions log), `docs/HANDOFF.md` (State, Next steps: owner's yes on rules deploy, then the ultracode money-logic review, then a live test), `docs/ui-system.md` (one paragraph on `components/scratch/`).

- [ ] **Step 1:** Write them.
- [ ] **Step 2: Commit** "docs: Scratch & Win built".

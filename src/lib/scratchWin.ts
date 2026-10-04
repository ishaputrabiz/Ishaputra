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

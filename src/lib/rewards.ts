/**
 * Loyalty points + wallet cashback rules, shared by the storefront and the
 * payment functions. Pure and dependency-free.
 *
 * The block between the rewards-core markers is copied verbatim into
 * api/create-order.ts and api/notify-order.ts (api/ files import nothing from
 * src/). tests/rewards-parity.test.ts fails if a copy drifts.
 */

// >>> rewards-core
type RewardCurrency = 'points' | 'cashback';
type RewardKind = 'earn' | 'spend' | 'refund' | 'adjust';

interface RewardSettings {
  enabled: boolean;
  /** Points earned per ₹100 paid for products. */
  pointsPer100: number;
  /** Rupee value of one point. */
  pointValue: number;
  /** Days after delivery before earned points can be spent (the return window). */
  unlockDays: number;
  /** Share of the product amount (after coupon) that points may cover, in percent. */
  maxPointsPercent: number;
}

// TODO(client): placeholders until Ishaputra confirms its rules.
const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  enabled: true,
  pointsPer100: 1,
  pointValue: 1,
  unlockDays: 7,
  maxPointsPercent: 20,
};

interface LedgerLike {
  currency: RewardCurrency;
  amount: number;
  status: 'active' | 'void';
  kind: RewardKind;
  /** When earned points become spendable. Only earn entries wait; every other entry counts at once. */
  unlockAtMs: number;
  /** Earned points frozen while their order has a return open. */
  held?: boolean;
}

interface RewardBalances {
  points: { available: number; pending: number };
  cashback: { available: number; pending: number };
}

function normaliseRewardSettings(raw: Partial<RewardSettings> | null | undefined): RewardSettings {
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const d = DEFAULT_REWARD_SETTINGS;
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled === true,
    pointsPer100: num(raw?.pointsPer100, d.pointsPer100, 0, 100),
    pointValue: num(raw?.pointValue, d.pointValue, 0, 100),
    unlockDays: num(raw?.unlockDays, d.unlockDays, 0, 365),
    maxPointsPercent: num(raw?.maxPointsPercent, d.maxPointsPercent, 0, 100),
  };
}

/**
 * Balances from ledger entries. Only earned points can be pending (until their
 * unlock date, or while their order has a return open). Spends, refunds and
 * adjustments count the moment they exist, so the browser and the server agree
 * whatever their clocks say.
 */
function summariseRewards(entries: LedgerLike[], nowMs: number): RewardBalances {
  const out: RewardBalances = {
    points: { available: 0, pending: 0 },
    cashback: { available: 0, pending: 0 },
  };
  for (const e of entries) {
    if (e.status !== 'active') continue;
    const bucket = out[e.currency];
    if (!bucket) continue;
    const amount = Number(e.amount) || 0;
    const waiting = e.kind === 'earn' && amount > 0 && (e.held === true || e.unlockAtMs > nowMs);
    if (waiting) bucket.pending += amount;
    else bucket.available += amount;
  }
  return out;
}

interface RedemptionInput {
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  gstOnTop: number;
  balances: RewardBalances;
  settings: RewardSettings;
  usePoints: boolean;
  useCashback: boolean;
}

interface Redemption {
  points: number;
  pointsValue: number;
  cashback: number;
  /** Left to pay; redemptions never take it below ₹1 (Razorpay's minimum). */
  payable: number;
}

function computeRedemption(i: RedemptionInput): Redemption {
  const s = i.settings;
  const productsAfterCoupon = Math.max(0, i.subtotal - i.couponDiscount);
  let payable = Math.max(0, productsAfterCoupon + i.deliveryCharge + i.gstOnTop);
  let points = 0;
  let pointsValue = 0;
  let cashback = 0;
  if (s.enabled && i.usePoints && s.pointValue > 0) {
    const capRupees = Math.floor((productsAfterCoupon * s.maxPointsPercent) / 100);
    const rupees = Math.max(0, Math.min(capRupees, Math.floor(payable - 1)));
    const affordable = Math.floor(rupees / s.pointValue);
    points = Math.max(0, Math.min(Math.floor(i.balances.points.available), affordable));
    pointsValue = points * s.pointValue;
    payable -= pointsValue;
  }
  if (s.enabled && i.useCashback) {
    cashback = Math.max(0, Math.min(Math.floor(i.balances.cashback.available), Math.floor(payable - 1)));
    payable -= cashback;
  }
  return { points, pointsValue, cashback, payable };
}

interface EarnBaseInput {
  subtotal: number;
  couponDiscount: number;
  /** Rupee value of the points spent on the order. */
  pointsValue: number;
  cashback: number;
  /** The shop's GST settings when the order was priced. */
  gstEnabled: boolean;
  gstInclusive: boolean;
  gstRate: number;
}

/**
 * Rupees paid for products, which is what points are earned on: after the
 * coupon, points and cashback, without delivery, and without the GST that
 * GST-inclusive prices carry. Two decimals. Worked out by api/create-order.ts
 * and kept with the payment, so nothing the browser writes can change it.
 */
function earnBase(i: EarnBaseInput): number {
  const paid = Math.max(0, i.subtotal - i.couponDiscount - i.pointsValue - i.cashback);
  const rate = i.gstEnabled && i.gstInclusive && i.gstRate > 0 ? i.gstRate : 0;
  return Math.floor(((paid * 100) / (100 + rate)) * 100 + 1e-6) / 100;
}

/** Points earned on a base from earnBase. */
function pointsForBase(base: number, s: RewardSettings): number {
  if (!s.enabled || !(base > 0)) return 0;
  // Multiply before dividing, with a hair of tolerance: ₹820 at 15 per ₹100 is 123, not 122.
  return Math.max(0, Math.floor((base * s.pointsPer100) / 100 + 1e-9));
}

/**
 * A cart in a canonical form (productId:quantity, merged and sorted) so what
 * was paid for can be compared with what was ordered. Stored as a SHA-256 hash.
 */
function cartKey(items: Array<{ productId?: string; quantity?: unknown }>): string {
  const qty = new Map<string, number>();
  for (const it of items || []) {
    const id = String(it?.productId || '');
    if (id) qty.set(id, (qty.get(id) || 0) + (Number(it?.quantity) || 0));
  }
  return [...qty.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, q]) => `${id}:${q}`)
    .join('|');
}
// <<< rewards-core

export type {
  RewardCurrency,
  RewardKind,
  RewardSettings,
  LedgerLike,
  RewardBalances,
  RedemptionInput,
  Redemption,
  EarnBaseInput,
};
export {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  summariseRewards,
  computeRedemption,
  earnBase,
  pointsForBase,
  cartKey,
};

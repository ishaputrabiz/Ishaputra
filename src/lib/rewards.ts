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

interface LoyaltyTier {
  name: string;
  /** Rupees paid online on delivered orders from which the tier starts. */
  minSpend: number;
  /** Points multiplier for orders delivered while the customer is in this tier. */
  multiplier: number;
}

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
  /** Exactly 4, sorted by minSpend; the first starts at ₹0. */
  tiers: LoyaltyTier[];
}

// TODO(client): tier names, thresholds and multipliers.
const DEFAULT_TIERS: LoyaltyTier[] = [
  { name: 'Silver', minSpend: 0, multiplier: 1 },
  { name: 'Gold', minSpend: 5000, multiplier: 1.25 },
  { name: 'Platinum', minSpend: 15000, multiplier: 1.5 },
  { name: 'Premium', minSpend: 30000, multiplier: 2 },
];

// TODO(client): placeholders until Ishaputra confirms its rules.
const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  enabled: true,
  pointsPer100: 1,
  pointValue: 1,
  unlockDays: 7,
  maxPointsPercent: 20,
  tiers: DEFAULT_TIERS,
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

/** Four tiers: missing or bad values fall back to the defaults, the first starts at ₹0, sorted by minSpend. */
function normaliseTiers(raw: unknown): LoyaltyTier[] {
  const rows = Array.isArray(raw) ? raw : [];
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const tiers = DEFAULT_TIERS.map((d, i) => {
    const r = (rows[i] && typeof rows[i] === 'object' ? rows[i] : {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 24) : d.name;
    const min = num(r.minSpend);
    const minSpend = i === 0 ? 0 : Number.isFinite(min) ? Math.round(Math.min(10_000_000, Math.max(0, min))) : d.minSpend;
    const m = num(r.multiplier);
    const multiplier = Number.isFinite(m) ? Math.round(Math.min(5, Math.max(1, m)) * 100) / 100 : d.multiplier;
    return { name, minSpend, multiplier };
  });
  return tiers.sort((a, b) => a.minSpend - b.minSpend);
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
    tiers: normaliseTiers((raw as { tiers?: unknown } | null | undefined)?.tiers),
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

/** Points earned on a base from earnBase, times the customer's tier multiplier (1 to 5, in hundredths). */
function pointsForBase(base: number, s: RewardSettings, multiplier = 1): number {
  if (!s.enabled || !(base > 0)) return 0;
  const hundredths = Math.round(Math.min(5, Math.max(1, Number(multiplier) || 1)) * 100);
  // Multiply before dividing, with a hair of tolerance: ₹820 at 15 per ₹100 is 123, not 122.
  return Math.max(0, Math.floor((base * s.pointsPer100 * hundredths) / 10_000 + 1e-9));
}

/** The customer's tier: the highest one whose minSpend they have reached. */
function tierIndexForSpend(spend: number, tiers: LoyaltyTier[]): number {
  let index = 0;
  for (let i = 0; i < tiers.length; i++) if (spend >= tiers[i].minSpend) index = i;
  return index;
}

interface TierSpendRow {
  /** The Razorpay order id (payments/<id>, orders/<id>). */
  id: string;
  amountPaise: number;
  /** A dealer-priced order (payments/<id>.dealer). */
  dealer?: boolean;
  /** orders/<id>.status now. */
  orderStatus: string;
}

/**
 * What tiers count: rupees paid online for delivered orders that were not
 * dealer-priced, from the server's payment records (never order.total, which
 * the browser writes). A returned or cancelled order drops out with its
 * status. excludeId leaves out the order being earned on.
 */
function tierSpend(rows: TierSpendRow[], excludeId = ''): number {
  let paise = 0;
  for (const r of rows) {
    if (r.id === excludeId || r.dealer === true || r.orderStatus !== 'delivered') continue;
    const p = Number(r.amountPaise);
    if (Number.isFinite(p) && p > 0) paise += Math.round(p);
  }
  return paise / 100;
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
  LoyaltyTier,
  RewardSettings,
  LedgerLike,
  RewardBalances,
  RedemptionInput,
  Redemption,
  EarnBaseInput,
  TierSpendRow,
};
export {
  DEFAULT_TIERS,
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  summariseRewards,
  computeRedemption,
  earnBase,
  pointsForBase,
  tierIndexForSpend,
  tierSpend,
  cartKey,
};

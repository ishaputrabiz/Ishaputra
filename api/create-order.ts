import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';

/**
 * POST /api/create-order
 *
 * Creates a Razorpay order so the browser can open Standard Checkout against
 * a real `order_id`.
 *
 * SECURITY: the order amount is computed HERE, from Firestore, and the client's
 * figure is only used as a cross-check. An earlier version took `amount`
 * straight from the request body and validated nothing but "is it >= 100 paise",
 * so anyone could open devtools and pay Rs.1 for a Rs.45,600 order - the
 * signature returned by Razorpay would verify perfectly, because it signs the
 * order, not the price. Every input below (product prices, delivery tiers, GST,
 * coupons, silver rate) is server-controlled data.
 *
 * Body:    { items: [{ productId, quantity }], paymentMethod?, couponCode?,
 *            usePoints?, useCashback?, currency?, receipt?, notes?,
 *            amount? (client's claim, checked),
 *            amountBeforeRewards? (client's claim before points/cashback, checked) }
 * Header:  Authorization: Bearer <Firebase ID token> (sent whenever signed in)
 * Returns: { order_id, amount, currency, key_id, pointsApplied, pointsValue, cashbackApplied }
 *
 * The server's facts about the payment travel in the Razorpay order notes,
 * which only this function writes (any rw_* note from the browser is dropped):
 *   rw_uid    the signed-in customer (from the verified ID token)
 *   rw_base   rupees paid for products, which points are earned on (earnBase)
 *   rw_cart   SHA-256 of the cart (cartKey), to compare with the order later
 *   rw_points / rw_pv / rw_cashback   points spent, their rupee value, cashback spent
 * api/verify-payment.ts copies them into payments/<razorpay order id>, the
 * record an order document must be created against.
 *
 * Loyalty points / wallet cashback: the customer's private ledger is read with
 * the Admin SDK, the redemption is priced with the shared rules below, and the
 * amounts are RESERVED before the order id is returned: spend entries
 * (spend_<razorpay order id>_<currency>, hold: true) are written in a
 * transaction that re-checks the balance under a per-customer lock, so two
 * checkouts cannot spend one balance. verify-payment confirms the hold; a hold
 * whose payment never happens is released by the 'release-holds' action in
 * api/notify-order.ts. 409 rewards_unavailable when rewards cannot be priced
 * safely, 409 rewards_changed when the balance moved; nothing is charged.
 */

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
/** Client and server both round; allow a rupee of drift before rejecting. */
const AMOUNT_TOLERANCE_PAISE = 100;
/** How long a checkout keeps the customer's points/cashback reserved. */
const HOLD_MS = 30 * 60_000;
/** The Admin SDK can retry for many seconds; checkout must not hang on it. */
const ADMIN_TIMEOUT_MS = 6000;
/**
 * Two checkouts reserving at once are serialised by the customer lock: the
 * second waits for the first and retries, which takes a few seconds. Long
 * enough for it to see the first one and answer rewards_changed.
 */
const RESERVE_TIMEOUT_MS = 9000;

/**
 * Firestore access uses the REST API with the public web key, not the Admin SDK.
 *
 * On the Spark plan the Admin SDK's Firestore reads fail with
 * `8 RESOURCE_EXHAUSTED: Quota exceeded` (server-side API quota is zeroed
 * without billing), which would take checkout down entirely. Everything read
 * here - products, coupons, siteSettings - is already `allow read: if true`, so
 * the public key is sufficient and this works on both Spark and Blaze.
 *
 * Read-only and public does not mean untrusted: these documents are only
 * writable by admins, so they remain a trustworthy source of prices.
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const WEB_API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;

const firestoreBase = () =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Unwrap Firestore's typed REST representation into plain JS. */
function decodeValue(v: any): any {
  if (v == null) return undefined;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return undefined;
}

function decodeFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/** Returns the document's data, or null when it does not exist. */
async function getDoc(path: string): Promise<Record<string, any> | null> {
  const resp = await fetch(`${firestoreBase()}/${path}?key=${WEB_API_KEY}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Firestore read failed for ${path} (HTTP ${resp.status})`);
  const json = (await resp.json()) as { fields?: Record<string, any> };
  return decodeFields(json.fields || {});
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Loyalty points / wallet cashback ─────────────────────────────────────────
// Verbatim copy of src/lib/rewards.ts (api/ files import nothing from src/).
// tests/rewards-parity.test.ts fails if it drifts.

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

/** Reject when `p` takes longer than `ms`, so a slow Admin SDK call cannot hang checkout. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The Admin SDK, loaded lazily: only the customer lookup and the rewards
 * paths need it, so a broken service-account variable cannot stop pricing.
 */
async function adminSdk() {
  const { default: admin } = await import('firebase-admin');
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64 || '', 'base64').toString('utf8')),
        ),
      });
  return { admin, app, db: admin.firestore(app) };
}

/** The signed-in customer from the Bearer ID token; null when none was sent. Throws if it does not verify. */
async function customerUid(req: VercelRequest): Promise<string | null> {
  const header = String(req.headers.authorization || '');
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) return null;
  const { admin, app } = await adminSdk();
  const { uid } = await withTimeout(admin.auth(app).verifyIdToken(idToken), ADMIN_TIMEOUT_MS, 'Sign-in check');
  return uid;
}

type LedgerDoc = { data: () => Record<string, any> };

const toLedgerLike = (d: LedgerDoc): LedgerLike => {
  const x = d.data();
  return {
    currency: x.currency === 'cashback' ? 'cashback' : 'points',
    amount: Number(x.amount) || 0,
    status: x.status === 'void' ? 'void' : 'active',
    kind: x.kind === 'earn' || x.kind === 'spend' || x.kind === 'refund' ? x.kind : 'adjust',
    unlockAtMs: typeof x.unlockAt?.toMillis === 'function' ? x.unlockAt.toMillis() : 0,
    held: x.held === true,
  };
};

/** Price the customer's opted-in points/cashback against their ledger as it stands. */
async function priceRewards(
  uid: string,
  input: Omit<RedemptionInput, 'balances' | 'settings'>,
): Promise<Redemption> {
  const { db } = await adminSdk();
  const [settingsSnap, ledgerSnap] = await withTimeout(
    Promise.all([
      db.collection('siteSettings').doc('rewards').get(),
      db.collection('users').doc(uid).collection('rewardLedger').get(),
    ]),
    ADMIN_TIMEOUT_MS,
    'Rewards lookup',
  );
  const settings = normaliseRewardSettings(
    settingsSnap.exists ? (settingsSnap.data() as Partial<RewardSettings>) : null,
  );
  const balances = summariseRewards(ledgerSnap.docs.map(toLedgerLike), Date.now());
  return computeRedemption({ ...input, balances, settings });
}

const spendNote = (currency: RewardCurrency, amount: number) =>
  currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`;

/**
 * Reserve the redemption for this Razorpay order: spend entries with
 * hold: true, written in a transaction that re-reads the ledger and writes the
 * customer's lock document, so concurrent checkouts are serialised and each
 * sees the others' holds. Returns false when the balance no longer covers it.
 */
async function reserveRewards(
  uid: string,
  razorpayOrderId: string,
  want: { points: number; cashback: number },
): Promise<boolean> {
  const { admin, db } = await adminSdk();
  const user = db.collection('users').doc(uid);
  const ledger = user.collection('rewardLedger');
  const lock = user.collection('rewardState').doc('lock');
  return withTimeout(
    db.runTransaction(async (tx) => {
      await tx.get(lock);
      const snap = await tx.get(ledger);
      const nowMs = Date.now();
      const balances = summariseRewards(snap.docs.map(toLedgerLike), nowMs);
      if (
        want.points > Math.floor(balances.points.available) ||
        want.cashback > Math.floor(balances.cashback.available)
      ) {
        return false;
      }
      const now = admin.firestore.Timestamp.fromMillis(nowMs);
      tx.set(lock, { updatedAt: now, lastRazorpayOrderId: razorpayOrderId }, { merge: true });
      for (const currency of ['points', 'cashback'] as const) {
        const amount = want[currency];
        if (amount <= 0) continue;
        tx.create(ledger.doc(`spend_${razorpayOrderId}_${currency}`), {
          currency,
          amount: -amount,
          kind: 'spend',
          status: 'active',
          hold: true,
          holdUntil: admin.firestore.Timestamp.fromMillis(nowMs + HOLD_MS),
          unlockAt: now,
          razorpayOrderId,
          note: spendNote(currency, amount),
          createdAt: now,
          createdBy: 'server',
        });
      }
      return true;
    }),
    RESERVE_TIMEOUT_MS,
    'Rewards reservation',
  );
}

/** Notes the browser may add to the Razorpay order: a few short ones, never rw_*. */
function clientNotes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => !k.startsWith('rw_') && (typeof v === 'string' || typeof v === 'number'))
      .slice(0, 5)
      .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 200)]),
  );
}

// ── Pricing helpers: must mirror src/hooks/useCheckoutPricing.ts ─────────────

const DEFAULT_DELIVERY = {
  enabled: true,
  homeState: 'Andhra Pradesh',
  withinStateCharge: 50,
  outsideStateCharge: 100,
  stateRates: [] as Array<{ state: string; charge: number }>,
  freeDeliveryAbove: 999,
};
/** Must mirror DEFAULT_GST in src/services/siteSettingsService.ts. */
const DEFAULT_GST = { enabled: false, rate: 3, inclusive: false };

const normState = (v: unknown) => String(v || '').trim().toLowerCase();

/**
 * Per-product delivery charge - mirrors `computeItemDeliveryCharge` in
 * src/services/siteSettingsService.ts. Keep the two in step: the client's total
 * is cross-checked against this one and a divergence blocks checkout.
 */
function itemDeliveryCharge(product: any, destState: string, s: any): number {
  const cfg = product?.delivery;
  if (cfg && cfg.chargeEnabled === false) return 0;

  const isHome = !destState || normState(destState) === normState(s.homeState);

  if (!isHome) {
    const rates = Array.isArray(s.stateRates) ? s.stateRates : [];
    const override = rates.find((r: any) => normState(r?.state) === normState(destState));
    if (override) return Math.max(0, Number(override.charge) || 0);
  }

  if (cfg && cfg.chargeEnabled) {
    return Math.max(0, Number(isHome ? cfg.withinState : cfg.outsideState) || 0);
  }

  if (!s.enabled) return 0;
  return Math.max(0, Number(isHome ? s.withinStateCharge : s.outsideStateCharge) || 0);
}

/**
 * Bring a stored delivery document up to the current shape - mirrors
 * `normalizeDelivery` in src/services/siteSettingsService.ts.
 *
 * This must run on the RAW document, before defaults are merged in: after a
 * merge `withinStateCharge` is always set, so a legacy tiers-only document
 * would silently be priced at the default rate instead of its own, and the
 * client/server totals would disagree - which blocks checkout outright.
 */
function normalizeDelivery(raw: Record<string, any> | null) {
  const merged: any = { ...DEFAULT_DELIVERY, ...(raw || {}) };

  if (raw && raw.withinStateCharge === undefined && Array.isArray(raw.tiers) && raw.tiers.length) {
    const legacy = Number(raw.tiers[0]?.charge) || 0;
    merged.withinStateCharge = legacy;
    merged.outsideStateCharge = legacy;
  }

  merged.enabled = raw?.enabled ?? true;
  merged.stateRates = Array.isArray(merged.stateRates) ? merged.stateRates : [];
  return merged;
}

/** A cart is one parcel, so it pays the highest line charge - never the sum. */
function computeDeliveryCharge(
  subtotal: number,
  s: any,
  products: any[],
  destState: string,
): number {
  if (s.freeDeliveryAbove > 0 && subtotal >= s.freeDeliveryAbove) return 0;

  const lines = products.length ? products : [null];
  return lines.reduce(
    (max: number, p: any) => Math.max(max, itemDeliveryCharge(p, destState, s)),
    0,
  );
}

/**
 * GST added on top of the subtotal.
 *
 * When the admin marks prices GST-inclusive the tax is already inside the item
 * prices, so nothing is added - the checkout only shows how much of the total
 * is tax. Returning a figure here in that case double-charged the customer.
 */
function computeGstOnTop(subtotal: number, gst: any): number {
  if (!gst?.enabled || !(gst.rate > 0) || gst.inclusive) return 0;
  return Math.round((subtotal * gst.rate) / 100);
}

function computeSilverPrice(sp: any, ratePerGram: number): number {
  const x = (sp.weightGrams || 0) * ratePerGram;
  const y = x * ((sp.wastagePercent || 0) / 100);
  return Math.ceil(x + y + (sp.makingCharges || 0));
}

/**
 * Does the cart contain anything this coupon applies to?
 *
 * Mirrors the same check in src/services/couponService.ts. An empty or absent
 * list means "everything". Compared case-insensitively because the admin stores
 * category names, not ids.
 *
 * Both lists must be satisfied when both are set: `applicableSubcategories`
 * narrows within `applicableCategories` ("Jewellery, but only Necklaces"),
 * it does not widen the offer.
 */
function couponCoversCart(coupon: any, products: any[]): boolean {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const matches = (list: unknown, field: 'category' | 'subcategory') => {
    const allowed = Array.isArray(list) ? list.map(norm) : [];
    if (allowed.length === 0) return true;
    return products.some((p) => allowed.includes(norm(p?.[field])));
  };
  return (
    matches(coupon.applicableCategories, 'category') &&
    matches(coupon.applicableSubcategories, 'subcategory')
  );
}

function couponDiscount(coupon: any, subtotal: number): number {
  if (coupon.type === 'percent') {
    let d = Math.floor((subtotal * coupon.value) / 100);
    if (coupon.maxDiscount > 0) d = Math.min(d, coupon.maxDiscount);
    return d;
  }
  return Math.min(coupon.value, subtotal);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body || {}) as {
    items?: Array<{ productId?: string; quantity?: unknown }>;
    paymentMethod?: string;
    shippingState?: string;
    couponCode?: string;
    /** Spend available loyalty points (capped by the shop's rules). */
    usePoints?: boolean;
    /** Spend available wallet cashback. */
    useCashback?: boolean;
    amount?: unknown;
    /** The browser's total before points/cashback, so a cart problem is told apart from a rewards one. */
    amountBeforeRewards?: unknown;
    currency?: unknown;
    receipt?: unknown;
    notes?: Record<string, string>;
  };

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'items[] is required to price this order' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res
      .status(500)
      .json({ error: 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured' });
  }

  if (!PROJECT_ID || !WEB_API_KEY) {
    return res.status(500).json({ error: 'Firebase project id / web API key are not configured' });
  }

  // Validate every cart line before spending any network calls on it.
  for (const line of items) {
    const quantity = Number(line.quantity);
    if (!line.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return res
        .status(400)
        .json({ error: `Invalid cart line for product ${String(line.productId || '')}` });
    }
  }

  let serverTotal: number;
  // Kept for the rewards step, which prices after the coupon and delivery.
  let parts = {
    subtotal: 0,
    discount: 0,
    deliveryCharge: 0,
    gstAmount: 0,
    gst: { enabled: false, inclusive: false, rate: 0 },
  };
  try {
    // ── Settings (admin-managed documents, never client-supplied) ──
    const [deliveryDoc, gstDoc, silverDoc] = await Promise.all([
      getDoc('siteSettings/delivery'),
      getDoc('siteSettings/gst'),
      getDoc('siteSettings/silverRate'),
    ]);
    const delivery = normalizeDelivery(deliveryDoc);
    const gst = { ...DEFAULT_GST, ...(gstDoc || {}) };
    const ratePerGram = Number(silverDoc?.manualPricePerGramInr) || 0;

    // ── Subtotal from stored product prices ──
    const products = await Promise.all(
      items.map((line) => getDoc(`products/${String(line.productId)}`)),
    );

    let subtotal = 0;
    for (let i = 0; i < items.length; i++) {
      const productId = String(items[i].productId);
      const p = products[i];
      if (!p) {
        return res.status(400).json({ error: `Product ${productId} no longer exists` });
      }
      if (p.flags?.isActive === false) {
        return res.status(400).json({ error: `Product ${productId} is no longer available` });
      }

      // Stock was previously checked only when the order document was written,
      // which happens AFTER this payment is captured. Refusing here means an
      // oversold item costs the customer nothing instead of leaving them
      // charged with no order.
      const stock = Number(p.inventory?.stock ?? 0);
      if (stock < Number(items[i].quantity)) {
        return res.status(400).json({
          error:
            stock <= 0
              ? `${p.name || 'An item in your cart'} is out of stock`
              : `Only ${stock} left in stock for ${p.name || 'an item in your cart'}`,
        });
      }

      const sp = p.silverPricing;
      const unit =
        sp?.enabled && ratePerGram > 0 ? computeSilverPrice(sp, ratePerGram) : Number(p.price);
      if (!Number.isFinite(unit) || unit < 0) {
        return res.status(400).json({ error: `Product ${productId} has no valid price` });
      }
      subtotal += unit * Number(items[i].quantity);
    }

    // ── Coupon, re-validated server-side ──
    let discount = 0;
    const code = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : '';
    if (code) {
      const resp = await fetch(`${firestoreBase()}:runQuery?key=${WEB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'coupons' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'code' },
                op: 'EQUAL',
                value: { stringValue: code },
              },
            },
            limit: 1,
          },
        }),
      });
      const rows = resp.ok ? ((await resp.json()) as any[]) : [];
      const found = rows.find((r) => r?.document?.fields);
      const coupon = found ? decodeFields(found.document.fields) : null;
      const now = new Date();
      const usable =
        coupon &&
        coupon.active &&
        (!coupon.validFrom || coupon.validFrom <= now) &&
        (!coupon.validTo || coupon.validTo >= now) &&
        !(coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) &&
        subtotal >= (coupon.minOrderValue || 0) &&
        couponCoversCart(coupon, products);
      if (usable) discount = couponDiscount(coupon, subtotal);
    }

    // The destination state comes from the customer's own shipping address, the
    // same value stored on the order document, and only selects a delivery rate.
    const destState = typeof body.shippingState === 'string' ? body.shippingState : '';
    const deliveryCharge = computeDeliveryCharge(subtotal, delivery, products, destState);
    const gstAmount = computeGstOnTop(subtotal, gst);

    parts = {
      subtotal,
      discount,
      deliveryCharge,
      gstAmount,
      gst: { enabled: gst.enabled === true, inclusive: gst.inclusive === true, rate: Number(gst.rate) || 0 },
    };
    serverTotal = Math.max(0, subtotal + deliveryCharge + gstAmount - discount);
  } catch (error: unknown) {
    return res.status(500).json({
      error: 'Could not price this order',
      detail: error instanceof Error ? error.message : 'Unknown pricing error',
    });
  }

  const wantsRewards = body.usePoints === true || body.useCashback === true;
  const conflict = (code: 'rewards_unavailable' | 'rewards_changed', detail?: string) =>
    res.status(409).json({
      code,
      error:
        code === 'rewards_changed'
          ? 'Your points or cashback balance just changed. Check the new total and pay again.'
          : 'Rewards are unavailable right now. Your balance is safe - pay without them or try again shortly.',
      ...(detail ? { detail } : {}),
    });

  // Cross-check the client's figure before rewards. A mismatch means the two
  // pricing paths have diverged (a bug) or someone is tampering - either way,
  // do not take payment.
  const mismatch = (claimed: number, server: number) =>
    Number.isFinite(claimed) && Math.abs(claimed - server) > AMOUNT_TOLERANCE_PAISE;
  const beforeRewardsPaise = Math.round(serverTotal * 100);
  const claimedBefore = Number(body.amountBeforeRewards);
  if (body.amountBeforeRewards != null && mismatch(claimedBefore, beforeRewardsPaise)) {
    return res.status(400).json({
      error: 'Order total mismatch. Please refresh your cart and try again.',
      detail: `client=${claimedBefore} server=${beforeRewardsPaise}`,
    });
  }

  // ── Who is paying ──
  // Sent whenever the customer is signed in. It binds the payment to them
  // (rw_uid), which is what lets an order be recorded as paid and earn points.
  // Without rewards a failed check is not fatal: the customer can still pay,
  // the order is then recorded for a manual payment check.
  let uid: string | null = null;
  try {
    uid = await customerUid(req);
  } catch (error: unknown) {
    if (wantsRewards) return conflict('rewards_unavailable', error instanceof Error ? error.message : undefined);
    console.warn('[create-order] could not verify the customer:', error instanceof Error ? error.message : error);
  }
  if (wantsRewards && !uid) return conflict('rewards_unavailable', 'Sign in again to use your rewards');

  // ── Loyalty points / wallet cashback (only when the customer opted in) ──
  let redemption: Redemption = { points: 0, pointsValue: 0, cashback: 0, payable: serverTotal };
  if (wantsRewards && uid) {
    try {
      redemption = await priceRewards(uid, {
        subtotal: parts.subtotal,
        couponDiscount: parts.discount,
        deliveryCharge: parts.deliveryCharge,
        gstOnTop: parts.gstAmount,
        usePoints: body.usePoints === true,
        useCashback: body.useCashback === true,
      });
    } catch (error: unknown) {
      return conflict('rewards_unavailable', error instanceof Error ? error.message : undefined);
    }
  }
  const spendsRewards = redemption.points > 0 || redemption.cashback > 0;

  const amountInPaise = Math.round(redemption.payable * 100);
  if (amountInPaise < 100) {
    return res.status(400).json({ error: 'Order total is below the ₹1.00 minimum' });
  }

  // The final figure. With rewards in play a difference here means the
  // browser's view of the balance is out of date, not that the cart is wrong.
  const claimed = Number(body.amount);
  if (mismatch(claimed, amountInPaise)) {
    if (wantsRewards) return conflict('rewards_changed', `client=${claimed} server=${amountInPaise}`);
    return res.status(400).json({
      error: 'Order total mismatch. Please refresh your cart and try again.',
      detail: `client=${claimed} server=${amountInPaise}`,
    });
  }

  const currency = typeof body.currency === 'string' && body.currency ? body.currency : 'INR';
  const receipt =
    typeof body.receipt === 'string' && body.receipt ? body.receipt.slice(0, 40) : `rcpt_${Date.now()}`;

  // The server's facts about this payment. Only this function writes rw_* notes;
  // verify-payment copies them into payments/<razorpay order id>.
  const base = earnBase({
    subtotal: parts.subtotal,
    couponDiscount: parts.discount,
    pointsValue: redemption.pointsValue,
    cashback: redemption.cashback,
    gstEnabled: parts.gst.enabled,
    gstInclusive: parts.gst.inclusive,
    gstRate: parts.gst.rate,
  });
  const notes: Record<string, string> = {
    ...clientNotes(body.notes),
    rw_base: String(base),
    rw_cart: createHash('sha256').update(cartKey(items)).digest('hex'),
    ...(uid ? { rw_uid: uid } : {}),
    ...(spendsRewards
      ? {
          rw_points: String(redemption.points),
          rw_pv: String(redemption.pointsValue),
          rw_cashback: String(redemption.cashback),
        }
      : {}),
  };

  let orderId: string;
  let orderAmount: number | undefined;
  let orderCurrency: string | undefined;
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const resp = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountInPaise, currency, receipt, notes }),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      id?: string;
      amount?: number;
      currency?: string;
      error?: { description?: string };
    };

    if (!resp.ok || !data.id) {
      const detail = data?.error?.description || `Razorpay API error (HTTP ${resp.status})`;
      if (resp.status === 401) {
        return res.status(401).json({ error: 'Razorpay authentication failed', detail });
      }
      return res.status(500).json({ error: 'Failed to create Razorpay order', detail });
    }
    orderId = data.id;
    orderAmount = data.amount;
    orderCurrency = data.currency;
  } catch (error: unknown) {
    return res.status(500).json({
      error: 'Failed to create Razorpay order',
      detail: error instanceof Error ? error.message : 'Unknown Razorpay error',
    });
  }

  // ── Reserve what this payment spends ──
  // Until this succeeds the browser has no order id, so an order that loses
  // the race (or times out) can never be paid; Razorpay lets it lapse.
  if (spendsRewards && uid) {
    try {
      const reserved = await reserveRewards(uid, orderId, {
        points: redemption.points,
        cashback: redemption.cashback,
      });
      if (!reserved) return conflict('rewards_changed');
    } catch (error: unknown) {
      return conflict('rewards_unavailable', error instanceof Error ? error.message : undefined);
    }
  }

  return res.status(200).json({
    order_id: orderId,
    amount: orderAmount,
    currency: orderCurrency,
    key_id: keyId,
    pointsApplied: redemption.points,
    pointsValue: redemption.pointsValue,
    cashbackApplied: redemption.cashback,
  });
}

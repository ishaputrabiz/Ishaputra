/**
 * Vercel serverless function — order-scoped FCM push notifications.
 *
 * Endpoint:  POST /api/notify-order
 *            (also { action: 'reconcile-rewards', orderId } - see reconcileRewards,
 *             { action: 'release-holds', razorpayOrderId? } - see releaseHolds,
 *             and { action: 'scratch-card', orderId } - see scratchCard;
 *             they live here because the Hobby plan allows only 12 functions)
 * Auth:      Authorization: Bearer <Firebase ID token>
 * Body:
 *   {
 *     "orderId":  "abc123",                    // required (Firestore order doc id)
 *     "audience": "customer" | "admins" | "delivery",
 *     "title":    "Order update",
 *     "body":     "Your order is now packed",
 *     "url":      "/account/orders/abc123",    // optional click target
 *     "data":     { "key": "value" }           // optional extra payload
 *   }
 *
 * Authorization rules (server-enforced):
 *   The caller must be one of:
 *     - the order's userId (customer)
 *     - a user with role 'admin'
 *     - the order's assigned delivery partner (delivery_partner_id / delivery_boy_id)
 *
 * Recipient resolution:
 *   - audience='customer': order.userId
 *   - audience='admins'  : every user where role == 'admin'
 *   - audience='delivery': order.delivery_partner_id || order.delivery_boy_id
 *
 * Required env vars (Vercel):
 *   FIREBASE_ADMIN_SDK_BASE64
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { randomInt } from 'node:crypto';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  let svc: admin.ServiceAccount;
  try {
    svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('FIREBASE_ADMIN_SDK_BASE64 is not valid base64-encoded JSON');
  }
  return admin.initializeApp({ credential: admin.credential.cert(svc) });
}


// ── Rewards reconcile (loyalty points + wallet cashback) ──────────────────────
// The block below is a verbatim copy of src/lib/rewards.ts (api/ files import
// nothing from src/). tests/rewards-parity.test.ts fails if it drifts.

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

// ── Scratch & Win rules ───────────────────────────────────────────────────────
// The block below is a verbatim copy of src/lib/scratchWin.ts.
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
 * minimum paid online, never for an order delivered before the switch was
 * last turned on (no cards for orders delivered while it was off), and never
 * a card that would already have expired.
 */
function scratchCardEligible(i: {
  status: string;
  /** Rupees paid online for the order. */
  amountRupees: number;
  scratch: ScratchWinSettings;
  rewardsEnabled: boolean;
  /** order.deliveredAt in ms, 0 when unknown. */
  deliveredAtMs: number;
  /** When the switch was last turned on (siteSettings/scratchWin.enabledAt), 0 when unknown. */
  enabledAtMs?: number;
  nowMs: number;
}): ScratchTiming | null {
  if (i.status !== 'delivered' || !i.scratch.enabled || !i.rewardsEnabled) return null;
  if (!(i.amountRupees >= i.scratch.minOrder)) return null;
  const anchorMs = i.deliveredAtMs > 0 && i.deliveredAtMs <= i.nowMs ? i.deliveredAtMs : i.nowMs;
  if (anchorMs < (i.enabledAtMs || 0)) return null;
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

const CURRENCIES = ['points', 'cashback'] as const;
const ENDED_STATUSES = ['cancelled', 'returned', 'refunded'];
const DAY_MS = 86_400_000;
const RAZORPAY_TIMEOUT_MS = 2500;
/** Why the server voided a spend hold. verify-payment and reconcile undo only this kind. */
const RELEASED = 'payment-not-completed';

/** A return is open: earned points stay frozen until it is settled. */
const isReturnOpen = (order: Record<string, any>) =>
  order.status === 'returnRequested' ||
  order.status === 'returnScheduled' ||
  (order.status === 'picked' && !!order.returnScheduledAt);

const isAlreadyExists = (err: any) => err?.code === 6 || /already exists/i.test(String(err?.message || ''));

/** Create a ledger entry unless one with this id exists. Returns true when it wrote. */
async function createOnce(ref: admin.firestore.DocumentReference, data: Record<string, unknown>): Promise<boolean> {
  try {
    await ref.create(data);
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

const millis = (v: any): number => (typeof v?.toMillis === 'function' ? v.toMillis() : 0);
const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const money = (v: unknown) => Math.max(0, Number(v) || 0);

/** The customer's return window: firestore.rules isValidReturnRequest and src/lib/returnWindow.ts. */
const RETURN_WINDOW_DAYS = 7;

/**
 * When earned points (and a scratch prize) unlock: unlockDays after the server
 * first sees the delivery, and never before the customer's return window
 * closes, so points can't be spent and then taken back by a return. A
 * delivery time in the future (it is written from the shop's or the delivery
 * partner's device) keeps returns open longer, so it delays the points too.
 */
const unlockAtMs = (nowMs: number, deliveredAt: unknown, unlockDays: number) =>
  Math.max(nowMs + unlockDays * DAY_MS, millis(deliveredAt) > 0 ? millis(deliveredAt) + RETURN_WINDOW_DAYS * DAY_MS : 0);

/** GET from the Razorpay API with a time limit. Throws when Razorpay cannot be asked. */
async function razorpayGet<T>(path: string): Promise<T> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured');
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/${path}`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Razorpay lookup failed (HTTP ${resp.status})`);
  return (await resp.json()) as T;
}

interface RazorpayOrder {
  id: string;
  status: string;
  amount: number;
  amount_paid: number;
  notes?: Record<string, string>;
}

/**
 * Where a Razorpay order's money stands:
 *   paid     captured (or authorized, awaiting capture)
 *   waiting  a payment was started and may still complete (e.g. a UPI request)
 *   unpaid   nothing is on its way
 */
async function paymentState(rzpOrderId: string): Promise<{ state: 'paid' | 'waiting' | 'unpaid'; order: RazorpayOrder }> {
  const order = await razorpayGet<RazorpayOrder>(`orders/${encodeURIComponent(rzpOrderId)}`);
  if (order.status === 'paid' || Number(order.amount_paid) > 0) return { state: 'paid', order };
  if (order.status === 'created') return { state: 'unpaid', order };
  const { items = [] } = await razorpayGet<{ items?: Array<{ status: string }> }>(
    `orders/${encodeURIComponent(rzpOrderId)}/payments`,
  );
  if (items.some((p) => p.status === 'captured' || p.status === 'authorized')) return { state: 'paid', order };
  if (items.some((p) => p.status === 'created')) return { state: 'waiting', order };
  return { state: 'unpaid', order };
}

interface PaymentRecord {
  uid: string;
  amountPaise: number;
  base: number;
  points: number;
  pointsValue: number;
  cashback: number;
}

/** payments/<rzp> from a paid Razorpay order's notes (what verify-payment writes). */
async function writePaymentRecord(
  db: admin.firestore.Firestore,
  rzp: string,
  order: RazorpayOrder,
): Promise<PaymentRecord | null> {
  const notes = order.notes || {};
  if (!notes.rw_uid) return null;
  const record = {
    uid: String(notes.rw_uid),
    razorpayOrderId: rzp,
    amountPaise: whole(order.amount),
    base: money(notes.rw_base),
    points: whole(notes.rw_points),
    pointsValue: money(notes.rw_pv),
    cashback: whole(notes.rw_cashback),
    cartHash: String(notes.rw_cart || ''),
    status: 'verified',
    verifiedAt: admin.firestore.Timestamp.now(),
    source: 'reconcile',
  };
  await db.collection('payments').doc(rzp).set(record, { merge: true });
  return record;
}

/**
 * The server's record of a payment: payments/<rzp>, or Razorpay itself when
 * verify-payment could not write it (the record is then written here). Null
 * when the Razorpay order is not paid. Throws when Razorpay cannot be asked.
 */
async function loadPayment(db: admin.firestore.Firestore, rzp: string): Promise<PaymentRecord | null> {
  const snap = await db.collection('payments').doc(rzp).get();
  if (snap.exists) return snap.data() as PaymentRecord;
  const { state, order } = await paymentState(rzp);
  return state === 'paid' ? writePaymentRecord(db, rzp, order) : null;
}

const spendNote = (currency: RewardCurrency, amount: number) =>
  currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`;

/**
 * Bring a customer's reward ledger in line with one order. Idempotent: entry
 * ids are fixed per payment and each step moves an entry to the state the
 * order calls for, so running it twice changes nothing.
 *
 * Trusts only server facts: the payment record (what was paid, by whom, which
 * points/cashback it spent and the base points are earned on) and the order's
 * status, which only the shop and its delivery partners can set. An order is
 * considered only at orders/<razorpay order id> - one order per payment - so a
 * copy of an order cannot earn or refund a second time.
 *
 *   spend   spend_<rzp>_<currency>  confirmed once the payment is verified
 *   earn    earn_<rzp>              created on first delivery, unlocking
 *                                   unlockDays later; frozen while a return is
 *                                   open; void when the order ends; restored if
 *                                   the shop reopens it
 *   refund  refund_<rzp>_<currency> what the payment spent, while the order is
 *                                   cancelled / returned / refunded; taken back
 *                                   if it is reopened
 *   scratch scratchCards/<rzp>      given on delivery (Scratch & Win), cancelled
 *           and scratch_<rzp>       while unscratched if the order ends; a won
 *                                   prize follows the order like earn_<rzp>
 *                                   (see reconcileScratchCard)
 */
export async function reconcileRewards(
  db: admin.firestore.Firestore,
  orderId: string,
  order: Record<string, any>,
): Promise<{ changed: string[]; skipped?: string }> {
  const uid = String(order.userId || '');
  const rzp = String(order.razorpayOrderId || '');
  if (!uid) return { changed: [], skipped: 'no_customer' };
  if (!rzp) return { changed: [], skipped: 'not_paid_online' };
  if (orderId !== rzp) return { changed: [], skipped: 'order_not_bound_to_payment' };

  const payment = await loadPayment(db, rzp);
  if (!payment) return { changed: [], skipped: 'payment_not_verified' };
  if (payment.uid !== uid) return { changed: [], skipped: 'payment_belongs_to_another_customer' };

  const settingsSnap = await db.collection('siteSettings').doc('rewards').get();
  const settings = normaliseRewardSettings(
    settingsSnap.exists ? (settingsSnap.data() as Partial<RewardSettings>) : null,
  );
  const ledger = db.collection('users').doc(uid).collection('rewardLedger');
  const now = admin.firestore.Timestamp.now();
  const status = String(order.status || '');
  const ended = ENDED_STATUSES.includes(status);
  const returnOpen = isReturnOpen(order);
  const changed: string[] = [];
  const orderUpdate: Record<string, unknown> = {};
  // Flag the order once (rewardsLate) so the shop sees it, even if the flag is later cleared by hand.
  const flagLate = () => {
    if (order.rewardsLate === true) return;
    orderUpdate.rewardsLate = true;
    orderUpdate.needsManualReview = true;
    orderUpdate.manualReviewReason =
      'Points or cashback reserved for this payment were released before it completed, then spent again: the customer balance may be below zero.';
  };

  const spendRefs = { points: ledger.doc(`spend_${rzp}_points`), cashback: ledger.doc(`spend_${rzp}_cashback`) };
  const refundRefs = { points: ledger.doc(`refund_${rzp}_points`), cashback: ledger.doc(`refund_${rzp}_cashback`) };
  const earnRef = ledger.doc(`earn_${rzp}`);
  const [spendP, spendC, refundP, refundC, earnSnap] = await Promise.all([
    spendRefs.points.get(),
    spendRefs.cashback.get(),
    refundRefs.points.get(),
    refundRefs.cashback.get(),
    earnRef.get(),
  ]);
  const spendSnaps = { points: spendP, cashback: spendC };
  const refundSnaps = { points: refundP, cashback: refundC };

  // 1. Spends: the payment is verified, so what it reserved is final.
  const spent: Record<RewardCurrency, number> = { points: 0, cashback: 0 };
  for (const currency of CURRENCIES) {
    const want = whole(currency === 'points' ? payment.points : payment.cashback);
    const ref = spendRefs[currency];
    const d = spendSnaps[currency].data();
    if (!d) {
      if (want <= 0) continue;
      const wrote = await createOnce(ref, {
        currency,
        amount: -want,
        kind: 'spend',
        status: 'active',
        hold: false,
        unlockAt: now,
        razorpayOrderId: rzp,
        orderId,
        note: spendNote(currency, want),
        createdAt: now,
        confirmedAt: now,
        createdBy: 'server',
      });
      if (wrote) changed.push(ref.id);
      spent[currency] = want;
    } else if (d.status === 'active') {
      if (d.hold === true) {
        await ref.update({ hold: false, confirmedAt: now, orderId });
        changed.push(`${ref.id}:confirm`);
      }
      // verify-payment already re-spent a released reservation (paid late).
      if (d.late === true) flagLate();
      spent[currency] = -Number(d.amount) || 0;
    } else if (d.voidReason === RELEASED) {
      // Released as abandoned, then paid after all: spend it after all.
      await ref.update({ status: 'active', hold: false, late: true, confirmedAt: now, orderId });
      changed.push(`${ref.id}:late`);
      spent[currency] = -Number(d.amount) || 0;
      flagLate();
    }
    // Voided by the shop: leave it.
  }

  // 2. Earned points.
  const e = earnSnap.data();
  let earn: { points: number; state: 'active' | 'held' | 'void'; unlockAt: admin.firestore.Timestamp } | null = e
    ? {
        points: Number(e.amount) || 0,
        state: e.status === 'void' ? 'void' : e.held === true ? 'held' : 'active',
        unlockAt: e.unlockAt,
      }
    : null;
  const reachedCustomer = status === 'delivered' || returnOpen;
  if (!e) {
    if (reachedCustomer && settings.enabled) {
      const base = Math.min(money(payment.base), money(payment.amountPaise) / 100);
      const points = pointsForBase(base, settings);
      if (points > 0) {
        const unlockAt = admin.firestore.Timestamp.fromMillis(
          unlockAtMs(now.toMillis(), order.deliveredAt, settings.unlockDays),
        );
        const wrote = await createOnce(earnRef, {
          currency: 'points',
          amount: points,
          kind: 'earn',
          status: 'active',
          held: returnOpen,
          unlockAt,
          orderId,
          razorpayOrderId: rzp,
          note: `Earned on order ${order.orderId || orderId}`,
          createdAt: now,
          createdBy: 'server',
        });
        if (wrote) {
          changed.push(earnRef.id);
          earn = { points, state: returnOpen ? 'held' : 'active', unlockAt };
        }
      }
    }
  } else if (ended) {
    if (e.status === 'active') {
      await earnRef.update({ status: 'void', voidedAt: now, voidedBy: 'server', voidReason: `order-${status}` });
      changed.push(`${earnRef.id}:void`);
      earn!.state = 'void';
    }
  } else if (e.status === 'void') {
    if (e.voidedBy === 'server' && reachedCustomer) {
      await earnRef.update({ status: 'active', held: returnOpen, restoredAt: now });
      changed.push(`${earnRef.id}:restore`);
      earn!.state = returnOpen ? 'held' : 'active';
    }
  } else {
    // Spendable only while the order sits at delivered.
    const held = status !== 'delivered';
    if ((e.held === true) !== held) {
      await earnRef.update({ held });
      changed.push(`${earnRef.id}:${held ? 'hold' : 'release'}`);
      earn!.state = held ? 'held' : 'active';
    }
  }

  // 3. Refunds of what the payment spent.
  for (const currency of CURRENCIES) {
    const ref = refundRefs[currency];
    const r = refundSnaps[currency].data();
    const amount = spent[currency];
    const label = order.orderId || orderId;
    if (ended && amount > 0) {
      if (!r) {
        const wrote = await createOnce(ref, {
          currency,
          amount,
          kind: 'refund',
          status: 'active',
          unlockAt: now,
          orderId,
          razorpayOrderId: rzp,
          note:
            currency === 'points'
              ? `${amount} points returned: order ${label} ${status}`
              : `₹${amount} cashback returned: order ${label} ${status}`,
          createdAt: now,
          createdBy: 'server',
        });
        if (wrote) changed.push(ref.id);
      } else if (r.status === 'void' && r.voidedBy === 'server') {
        await ref.update({ status: 'active', restoredAt: now });
        changed.push(`${ref.id}:restore`);
      }
    } else if (!ended && r?.status === 'active' && r.createdBy === 'server') {
      await ref.update({ status: 'void', voidedAt: now, voidedBy: 'server', voidReason: 'order-reopened' });
      changed.push(`${ref.id}:void`);
    }
  }

  // 4. Scratch card: given on delivery, cancelled (or its prize voided) when the order ends.
  changed.push(...(await reconcileScratchCard(db, uid, rzp, payment, settings)));

  // 5. What the order pages show. Written only when something differs.
  if (order.paymentStatus === 'pending') {
    orderUpdate.paymentStatus = 'paid';
    orderUpdate.paymentVerifiedAt = now;
  }
  if (earn) {
    if (order.pointsEarned !== earn.points) orderUpdate.pointsEarned = earn.points;
    if (order.pointsEarnedState !== earn.state) orderUpdate.pointsEarnedState = earn.state;
    if (millis(order.pointsUnlockAt) !== millis(earn.unlockAt)) orderUpdate.pointsUnlockAt = earn.unlockAt;
  }
  if (Object.keys(orderUpdate).length) {
    await db.collection('orders').doc(orderId).update(orderUpdate);
    changed.push(`order:${Object.keys(orderUpdate).join(',')}`);
  }

  return { changed };
}

/**
 * Release points/cashback reserved by checkouts that were never paid: the
 * customer closed the payment window (`razorpayOrderId` given), or the
 * 30-minute hold ran out. Razorpay is asked first: a paid order's hold is
 * confirmed instead, and one with a payment still on its way is kept.
 */
export async function releaseHolds(
  db: admin.firestore.Firestore,
  uid: string,
  razorpayOrderId?: string,
): Promise<{ released: string[]; confirmed: string[]; kept: string[] }> {
  const out = { released: [] as string[], confirmed: [] as string[], kept: [] as string[] };
  const snap = await db.collection('users').doc(uid).collection('rewardLedger').get();
  const nowMs = Date.now();
  const byOrder = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.kind !== 'spend' || d.status !== 'active' || d.hold !== true) continue;
    const rzp = String(d.razorpayOrderId || '');
    if (!rzp) continue;
    if (razorpayOrderId ? rzp !== razorpayOrderId : millis(d.holdUntil) > nowMs) continue;
    byOrder.set(rzp, [...(byOrder.get(rzp) || []), doc]);
  }
  for (const [rzp, docs] of byOrder) {
    const { state, order } = await paymentState(rzp);
    const now = admin.firestore.Timestamp.now();
    if (state === 'paid') {
      const record = await db.collection('payments').doc(rzp).get();
      if (!record.exists) await writePaymentRecord(db, rzp, order);
      await Promise.all(docs.map((d) => d.ref.update({ hold: false, confirmedAt: now })));
      out.confirmed.push(rzp);
    } else if (state === 'waiting') {
      out.kept.push(rzp);
    } else {
      await Promise.all(
        docs.map((d) => d.ref.update({ status: 'void', voidedAt: now, voidedBy: 'server', voidReason: RELEASED })),
      );
      out.released.push(rzp);
    }
  }
  return out;
}

// ── Scratch & Win ─────────────────────────────────────────────────────────────

const scratchRefs = (db: admin.firestore.Firestore, uid: string, rzp: string) => ({
  card: db.collection('users').doc(uid).collection('scratchCards').doc(rzp),
  prize: db.collection('users').doc(uid).collection('rewardLedger').doc(`scratch_${rzp}`),
  earn: db.collection('users').doc(uid).collection('rewardLedger').doc(`earn_${rzp}`),
  order: db.collection('orders').doc(rzp),
  payment: db.collection('payments').doc(rzp),
});

/** siteSettings/scratchWin, and when its switch was last turned on (0 when unknown). */
async function loadScratchSettings(
  db: admin.firestore.Firestore,
): Promise<{ scratch: ScratchWinSettings; enabledAtMs: number }> {
  const snap = await db.collection('siteSettings').doc('scratchWin').get();
  const raw = snap.exists ? snap.data() : undefined;
  return { scratch: normaliseScratchSettings(raw as Partial<ScratchWinSettings> | undefined), enabledAtMs: millis(raw?.enabledAt) };
}

/**
 * Give, cancel or restore an order's scratch card, and keep a won prize in
 * line with the order (see planScratchReconcile). One transaction that also
 * re-reads the order, so a scratch racing a status change cannot leave an
 * active prize on an ended order. A payment gets one card ever
 * (payments/<rzp>.scratchCardGivenAt), so a card deleted by hand never comes
 * back for a fresh draw.
 */
async function reconcileScratchCard(
  db: admin.firestore.Firestore,
  uid: string,
  rzp: string,
  payment: PaymentRecord,
  rewards: RewardSettings,
): Promise<string[]> {
  const refs = scratchRefs(db, uid, rzp);
  const { scratch, enabledAtMs } = await loadScratchSettings(db);
  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(refs.order);
    const cardSnap = await tx.get(refs.card);
    const prizeSnap = await tx.get(refs.prize);
    const earnSnap = await tx.get(refs.earn);
    const paymentSnap = await tx.get(refs.payment);
    const order = orderSnap.data();
    if (!order || order.userId !== uid) return [];
    const status = String(order.status || '');
    const ended = ENDED_STATUSES.includes(status);
    const now = admin.firestore.Timestamp.now();
    const c = cardSnap.data();
    const p = prizeSnap.data();
    const give =
      c || paymentSnap.data()?.scratchCardGivenAt
        ? null
        : scratchCardEligible({
            status,
            amountRupees: whole(payment.amountPaise) / 100,
            scratch,
            rewardsEnabled: rewards.enabled,
            deliveredAtMs: millis(order.deliveredAt),
            enabledAtMs,
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
      // The prize unlocks with the order's earned points, or as they would have.
      const earnUnlockAt = earnSnap.data()?.unlockAt;
      tx.create(refs.card, {
        orderId: rzp,
        // The display number is written by the customer's browser: kept short.
        orderNumber: String(order.orderId || rzp).slice(0, 40),
        orderAmount: whole(payment.amountPaise) / 100,
        status: 'new',
        createdAt: now,
        deliveredAt: admin.firestore.Timestamp.fromMillis(give.anchorMs),
        expiresAt: admin.firestore.Timestamp.fromMillis(give.expiresAtMs),
        unlockAt:
          millis(earnUnlockAt) > 0
            ? earnUnlockAt
            : admin.firestore.Timestamp.fromMillis(unlockAtMs(now.toMillis(), order.deliveredAt, rewards.unlockDays)),
        createdBy: 'server',
      });
      tx.set(refs.payment, { scratchCardGivenAt: now }, { merge: true });
      changed.push(id);
    } else if (plan.card === 'void') {
      tx.update(refs.card, { status: 'void', voidedAt: now, voidedBy: 'server', voidReason: `order-${status}` });
      changed.push(`${id}:void`);
    } else if (plan.card === 'restore') {
      const clear = admin.firestore.FieldValue.delete();
      tx.update(refs.card, { status: 'new', restoredAt: now, voidedAt: clear, voidedBy: clear, voidReason: clear });
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
 * Works while Scratch & Win is off: cards already given stay scratchable.
 */
export async function scratchCard(
  db: admin.firestore.Firestore,
  uid: string,
  cardId: string,
  roll: (total: number) => number = (total) => randomInt(total),
): Promise<ScratchReply> {
  const refs = scratchRefs(db, uid, cardId);
  const { scratch } = await loadScratchSettings(db);
  return db.runTransaction(async (tx): Promise<ScratchReply> => {
    const cardSnap = await tx.get(refs.card);
    const orderSnap = await tx.get(refs.order);
    const prizeSnap = await tx.get(refs.prize);
    const c = cardSnap.data();
    if (!c) return { status: 404, body: { error: 'card_not_found' } };
    const reply = (d: admin.firestore.DocumentData): ScratchReply => ({
      status: 200,
      body: {
        ok: true,
        points: whole(d.points),
        held: d.prizeState === 'held',
        // 'void' when the prize was taken back (the order ended), so the page doesn't say it is in the wallet.
        prizeState: d.prizeState ?? null,
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

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getBearerToken(req: VercelRequest) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

async function tokensForUid(db: admin.firestore.Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection('userTokens').where('uid', '==', uid).get();
  return snap.docs.map((d) => String(d.data().token || d.id || '')).filter(Boolean);
}

async function tokensForRole(db: admin.firestore.Firestore, role: string): Promise<string[]> {
  const usersSnap = await db.collection('users').where('role', '==', role).get();
  const uids = usersSnap.docs.map((u) => u.id);
  if (!uids.length) return [];
  const all: string[] = [];
  // Firestore 'in' supports up to 30 values per query.
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const tokSnap = await db
      .collection('userTokens')
      .where('uid', 'in', chunk)
      .get();
    tokSnap.docs.forEach((d) => {
      const t = String(d.data().token || d.id || '');
      if (t) all.push(t);
    });
  }
  return all;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const idToken = getBearerToken(req);
  if (!idToken) return res.status(401).json({ error: 'Missing Authorization bearer token' });

  const body = (req.body || {}) as {
    /**
     * 'reconcile-rewards': sync this order's payment and points/cashback instead of sending a push.
     * 'release-holds': free points/cashback reserved by unpaid checkouts (no orderId needed).
     * 'scratch-card': scratch the caller's card for orderId; the server draws the prize.
     */
    action?: string;
    orderId?: string;
    /** release-holds: only this checkout's hold (the customer closed the payment window). */
    razorpayOrderId?: string;
    /** release-holds, admins only: whose holds to release (default: the caller's). */
    uid?: string;
    audience?: 'customer' | 'admins' | 'delivery';
    title?: string;
    body?: string;
    url?: string;
    data?: Record<string, string>;
  };

  const orderId = String(body.orderId || '').trim();
  const audience = body.audience;
  const title = String(body.title || '').trim();
  const message = String(body.body || '').trim();

  const isReconcile = body.action === 'reconcile-rewards';
  const isRelease = body.action === 'release-holds';
  const isScratch = body.action === 'scratch-card';
  if (!orderId && !isRelease) return res.status(400).json({ error: 'orderId is required' });
  // An order id (and a card id, a document id under the caller's own user
  // document) is one path segment: a slash would reach another document.
  if (orderId && !/^[\w-]{1,128}$/.test(orderId)) return res.status(400).json({ error: 'invalid orderId' });
  if (!isReconcile && !isRelease && !isScratch) {
    if (!audience || !['customer', 'admins', 'delivery'].includes(audience)) {
      return res.status(400).json({ error: 'audience must be customer|admins|delivery' });
    }
    if (!title || !message) return res.status(400).json({ error: 'title and body are required' });
  }

  let app;
  try {
    app = initAdmin();
  } catch (err: any) {
    return res.status(500).json({ error: 'Admin SDK init failed', detail: err.message });
  }

  const auth = admin.auth(app);
  const db = admin.firestore(app);

  let callerUid: string;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    callerUid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid ID token' });
  }

  const callerProfileSnap = await db.collection('users').doc(callerUid).get();
  const isAdmin = callerProfileSnap.data()?.role === 'admin';

  if (isRelease) {
    const uid = isAdmin && body.uid ? String(body.uid) : callerUid;
    const rzp = body.razorpayOrderId ? String(body.razorpayOrderId) : undefined;
    try {
      return res.status(200).json({ ok: true, ...(await releaseHolds(db, uid, rzp)) });
    } catch (err: any) {
      // Holds stay in place until Razorpay can confirm the payment never happened.
      return res.status(503).json({ error: 'Could not check the payment with Razorpay', detail: err?.message || String(err) });
    }
  }

  if (isScratch) {
    try {
      // Always the caller's own card: users/<callerUid>/scratchCards/<orderId>.
      const r = await scratchCard(db, callerUid, orderId);
      return res.status(r.status).json(r.body);
    } catch (err) {
      // Nothing was written: the card stays unscratched for another try.
      console.error('[notify-order] scratch-card failed:', err instanceof Error ? err.message : err);
      return res.status(503).json({ error: 'scratch_failed' });
    }
  }

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });
  const order = orderSnap.data() as Record<string, any>;

  // Authorise the caller against this order.
  const isOwner = order.userId === callerUid;
  const isAssignedDelivery =
    order.delivery_partner_id === callerUid || order.delivery_boy_id === callerUid;

  if (!isAdmin && !isOwner && !isAssignedDelivery) {
    return res.status(403).json({ error: 'Not authorised for this order' });
  }

  if (isReconcile) {
    try {
      const result = await reconcileRewards(db, orderId, order);
      return res.status(200).json({ ok: true, ...result });
    } catch (err: any) {
      // Usually Razorpay could not be asked whether the order was paid; nothing was guessed.
      return res.status(503).json({ error: 'Could not check this payment right now', detail: err?.message || String(err) });
    }
  }

  // Resolve recipient tokens.
  let tokens: string[] = [];
  let recipientLabel = '';
  if (audience === 'customer') {
    if (!order.userId) {
      return res.status(200).json({ ok: true, notified: false, reason: 'no_customer_uid' });
    }
    tokens = await tokensForUid(db, order.userId);
    recipientLabel = `customer:${order.userId}`;
  } else if (audience === 'admins') {
    tokens = await tokensForRole(db, 'admin');
    recipientLabel = 'admins';
  } else {
    const partnerUid = order.delivery_partner_id || order.delivery_boy_id;
    if (!partnerUid) {
      return res.status(200).json({ ok: true, notified: false, reason: 'no_delivery_assigned' });
    }
    tokens = await tokensForUid(db, partnerUid);
    recipientLabel = `delivery:${partnerUid}`;
  }

  if (!tokens.length) {
    return res.status(200).json({ ok: true, notified: false, reason: 'no_tokens', recipient: recipientLabel });
  }

  const dataPayload: Record<string, string> = {
    orderId,
    audience,
    title,
    body: message,
    tag: `order-${orderId}`,
    ...(body.url ? { url: body.url } : {}),
    ...(body.data || {}),
  };

  try {
    const messaging = admin.messaging(app);
    const resp = await messaging.sendEachForMulticast({
      tokens,
      data: dataPayload,
      webpush: {
        fcmOptions: body.url ? { link: body.url } : undefined,
      },
    });

    // Best-effort cleanup of dead tokens.
    const invalid: string[] = [];
    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-argument') ||
          code.includes('invalid-registration-token')
        ) {
          invalid.push(tokens[idx]);
        }
      }
    });
    if (invalid.length) {
      await Promise.allSettled(invalid.map((t) => db.collection('userTokens').doc(t).delete()));
    }

    return res.status(200).json({
      ok: true,
      notified: true,
      recipient: recipientLabel,
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      cleanedTokens: invalid.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Send failed', detail: err.message });
  }
}

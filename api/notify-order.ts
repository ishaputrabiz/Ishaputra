/**
 * Vercel serverless function — order-scoped FCM push notifications.
 *
 * Endpoint:  POST /api/notify-order
 *            (also { action: 'reconcile-rewards', orderId } - see reconcileRewards)
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
  unlockAtMs: number;
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
    if (e.unlockAtMs <= nowMs) bucket.available += amount;
    else bucket.pending += amount;
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

function pointsForOrder(
  order: { total?: number; deliveryCharge?: number; taxAmount?: number; gstInclusive?: boolean },
  s: RewardSettings,
): number {
  if (!s.enabled) return 0;
  const tax = order.gstInclusive ? 0 : Number(order.taxAmount) || 0;
  const base = (Number(order.total) || 0) - (Number(order.deliveryCharge) || 0) - tax;
  return Math.max(0, Math.floor((base / 100) * s.pointsPer100));
}
// <<< rewards-core

const ENDED_STATUSES = ['cancelled', 'returned', 'refunded'];
const DAY_MS = 86_400_000;

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

/** Notes stored on a Razorpay order by api/create-order.ts (rw_uid, rw_points, rw_cashback). */
async function razorpayNotes(razorpayOrderId: string): Promise<Record<string, string> | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { notes?: Record<string, string> };
  return data.notes || {};
}

const spendNote = (currency: RewardCurrency, amount: number) =>
  currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`;

/**
 * Bring a customer's reward ledger in line with one order. Idempotent:
 * deterministic entry ids + create-once, so running it twice changes nothing.
 *   paid       → spend entries exist (from the Razorpay order notes)
 *   delivered  → earn_<orderId> exists, pending until deliveredAt + unlockDays
 *   cancelled / returned / refunded → pending earn voided, spends refunded
 */
export async function reconcileRewards(
  db: admin.firestore.Firestore,
  orderId: string,
  order: Record<string, any>,
): Promise<{ changed: string[]; skipped?: string }> {
  const uid = String(order.userId || '');
  if (!uid) return { changed: [], skipped: 'no_customer' };

  const settingsSnap = await db.collection('siteSettings').doc('rewards').get();
  const settings = normaliseRewardSettings(
    settingsSnap.exists ? (settingsSnap.data() as Partial<RewardSettings>) : null,
  );
  const ledger = db.collection('users').doc(uid).collection('rewardLedger');
  const now = admin.firestore.Timestamp.now();
  const status = String(order.status || '');
  const changed: string[] = [];

  // 1. Spends for a paid order (normally already written by verify-payment).
  const spends: Record<RewardCurrency, number> = { points: 0, cashback: 0 };
  const rzp = String(order.razorpayOrderId || '');
  if (rzp) {
    const refs = {
      points: ledger.doc(`spend_${rzp}_points`),
      cashback: ledger.doc(`spend_${rzp}_cashback`),
    };
    const [p, c] = await Promise.all([refs.points.get(), refs.cashback.get()]);
    if (p.exists) spends.points = -Number(p.data()?.amount || 0);
    if (c.exists) spends.cashback = -Number(c.data()?.amount || 0);
    if (!p.exists && !c.exists) {
      const notes = await razorpayNotes(rzp);
      if (notes && notes.rw_uid === uid) {
        for (const currency of ['points', 'cashback'] as const) {
          const amount = Math.floor(Number(notes[`rw_${currency}`]) || 0);
          if (amount <= 0) continue;
          const wrote = await createOnce(refs[currency], {
            currency,
            amount: -amount,
            kind: 'spend',
            status: 'active',
            unlockAt: now,
            razorpayOrderId: rzp,
            orderId,
            note: spendNote(currency, amount),
            createdAt: now,
            createdBy: 'server',
          });
          if (wrote) changed.push(refs[currency].id);
          spends[currency] = amount;
        }
      }
    }
  }

  // 2. Earn on delivery, pending through the return window.
  const earnRef = ledger.doc(`earn_${orderId}`);
  if (status === 'delivered' && settings.enabled) {
    const points = pointsForOrder(order, settings);
    if (points > 0) {
      const deliveredAt =
        typeof order.deliveredAt?.toMillis === 'function' ? order.deliveredAt.toMillis() : now.toMillis();
      const wrote = await createOnce(earnRef, {
        currency: 'points',
        amount: points,
        kind: 'earn',
        status: 'active',
        unlockAt: admin.firestore.Timestamp.fromMillis(deliveredAt + settings.unlockDays * DAY_MS),
        orderId,
        note: `Earned on order ${order.orderId || orderId}`,
        createdAt: now,
        createdBy: 'server',
      });
      if (wrote) {
        changed.push(earnRef.id);
        await db.collection('orders').doc(orderId).update({ pointsEarned: points });
      }
    }
  }

  // 3. Cancelled / returned / refunded: void pending earn, refund what was spent.
  if (ENDED_STATUSES.includes(status)) {
    const earn = await earnRef.get();
    const e = earn.data();
    if (
      earn.exists &&
      e?.status === 'active' &&
      typeof e.unlockAt?.toMillis === 'function' &&
      e.unlockAt.toMillis() > now.toMillis()
    ) {
      await earnRef.update({ status: 'void', voidedAt: now, voidedBy: 'server' });
      changed.push(`${earnRef.id}:void`);
    }
    for (const currency of ['points', 'cashback'] as const) {
      const amount = spends[currency];
      if (amount <= 0) continue;
      const ref = ledger.doc(`refund_${orderId}_${currency}`);
      const label = order.orderId || orderId;
      const wrote = await createOnce(ref, {
        currency,
        amount,
        kind: 'refund',
        status: 'active',
        unlockAt: now,
        orderId,
        note:
          currency === 'points'
            ? `${amount} points returned: order ${label} ${status}`
            : `₹${amount} cashback returned: order ${label} ${status}`,
        createdAt: now,
        createdBy: 'server',
      });
      if (wrote) changed.push(ref.id);
    }
  }

  return { changed };
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
    /** 'reconcile-rewards': sync this order's points/cashback instead of sending a push. */
    action?: string;
    orderId?: string;
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

  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  const isReconcile = body.action === 'reconcile-rewards';
  if (!isReconcile) {
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

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found' });
  const order = orderSnap.data() as Record<string, any>;

  // Authorise the caller against this order.
  const callerProfileSnap = await db.collection('users').doc(callerUid).get();
  const callerRole = callerProfileSnap.data()?.role;
  const isAdmin = callerRole === 'admin';
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
      return res.status(500).json({ error: 'Reward reconcile failed', detail: err?.message || String(err) });
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

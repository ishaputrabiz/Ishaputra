import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * POST /api/verify-payment
 *
 * Verifies the signature Razorpay returns to the browser after a successful
 * payment. Razorpay signs `${order_id}|${payment_id}` with HMAC-SHA256 using
 * the key secret; we recompute it and compare in constant time. The order is
 * only considered paid when the recomputed HMAC matches.
 *
 * Self-contained (Node built-ins only) so the serverless function can't fail
 * to load — mirrors the other functions in /api.
 *
 * Body:    { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Returns: { verified: true } on match, 400 otherwise (never marks as paid).
 *          Adds `rewardsPending: true` when the points/cashback spend could
 *          not be recorded (the reconcile action in notify-order repairs it).
 */

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isValidSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(String(signature), 'utf8');

  // timingSafeEqual throws if the buffers differ in length — guard first.
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * After a verified payment, record the points/cashback it used. The amounts
 * come from the notes api/create-order.ts put on the Razorpay order, not from
 * the browser. firebase-admin is imported lazily so this file still verifies
 * payments if it cannot load; a miss is repaired by the reconcile action.
 */
async function recordRewardSpend(razorpayOrderId: string): Promise<{ ok: boolean; detail?: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { ok: false, detail: 'Razorpay keys missing' };
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!resp.ok) return { ok: false, detail: `Razorpay order lookup failed (HTTP ${resp.status})` };
  const notes = ((await resp.json()) as { notes?: Record<string, string> }).notes || {};
  const uid = notes.rw_uid;
  const amounts = {
    points: Math.floor(Number(notes.rw_points) || 0),
    cashback: Math.floor(Number(notes.rw_cashback) || 0),
  };
  if (!uid || (amounts.points <= 0 && amounts.cashback <= 0)) return { ok: true };

  const { default: admin } = await import('firebase-admin');
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64 || '', 'base64').toString('utf8')),
        ),
      });
  const ledger = admin.firestore(app).collection('users').doc(uid).collection('rewardLedger');
  const now = admin.firestore.Timestamp.now();
  for (const currency of ['points', 'cashback'] as const) {
    const amount = amounts[currency];
    if (amount <= 0) continue;
    try {
      await ledger.doc(`spend_${razorpayOrderId}_${currency}`).create({
        currency,
        amount: -amount,
        kind: 'spend',
        status: 'active',
        unlockAt: now,
        razorpayOrderId,
        note: currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`,
        createdAt: now,
        createdBy: 'server',
      });
    } catch (err: any) {
      if (!(err?.code === 6 || /already exists/i.test(String(err?.message || '')))) throw err;
    }
  }
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body || {}) as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };

  const orderId = body.razorpay_order_id;
  const paymentId = body.razorpay_payment_id;
  const signature = body.razorpay_signature;

  // ── Missing fields → 400 ──
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({
      verified: false,
      error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
    });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ verified: false, error: 'RAZORPAY_KEY_SECRET is not configured' });
  }

  // ── Signature mismatch → 400, do NOT mark as paid ──
  if (!isValidSignature(orderId, paymentId, signature, keySecret)) {
    return res.status(400).json({ verified: false, error: 'Payment signature verification failed' });
  }

  // Never let rewards bookkeeping affect the verification answer.
  const rewards = await recordRewardSpend(orderId).catch((err: unknown) => ({
    ok: false,
    detail: err instanceof Error ? err.message : String(err),
  }));
  if (!rewards.ok) console.warn('[verify-payment] reward spend not recorded:', rewards.detail);

  return res.status(200).json({
    verified: true,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    ...(rewards.ok ? {} : { rewardsPending: true }),
  });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import type { firestore } from 'firebase-admin';

/**
 * POST /api/verify-payment
 *
 * Verifies the signature Razorpay returns to the browser after a successful
 * payment. Razorpay signs `${order_id}|${payment_id}` with HMAC-SHA256 using
 * the key secret; we recompute it and compare in constant time. The order is
 * only considered paid when the recomputed HMAC matches.
 *
 * Self-contained (Node built-ins only, firebase-admin loaded lazily) so the
 * serverless function can't fail to load — mirrors the other functions in /api.
 *
 * Body:    { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Returns: { verified: true, paymentRecorded, ... } on match, 400 otherwise
 *          (never marks as paid).
 *
 * After a match the payment is RECORDED as payments/<razorpay order id>, from
 * the notes api/create-order.ts put on the Razorpay order (never from the
 * browser): the customer it is bound to, the amount, the cart hash and the
 * points/cashback it spent. firestore.rules only lets a customer create an
 * order marked paid at orders/<razorpay order id> when that record exists and
 * names them. The same transaction confirms the points/cashback reserved for
 * the payment (or spends them again if they had been released as abandoned).
 *
 * `paymentRecorded: false` means the bookkeeping did not finish in time; the
 * browser retries once, and the reconcile action in api/notify-order.ts
 * repairs it from Razorpay later. Bookkeeping never changes the verification
 * answer.
 */

const RAZORPAY_TIMEOUT_MS = 2500;
/** Upper bound on the bookkeeping, so a captured payment is never kept waiting long. */
const BOOKKEEPING_TIMEOUT_MS = 4500;

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

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const money = (v: unknown) => Math.max(0, Number(v) || 0);

/**
 * Write payments/<razorpayOrderId> and confirm the reserved spends.
 * Returns recorded: false when the Razorpay order carries no customer (it was
 * created without a signed-in customer), so there is nothing to bind it to.
 */
async function recordPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<{ recorded: boolean; late?: boolean }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys missing');
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Razorpay order lookup failed (HTTP ${resp.status})`);
  const rzpOrder = (await resp.json()) as { amount?: number; notes?: Record<string, string> };
  const notes = rzpOrder.notes || {};
  const uid = String(notes.rw_uid || '');
  if (!uid) return { recorded: false };

  const { default: admin } = await import('firebase-admin');
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64 || '', 'base64').toString('utf8')),
        ),
      });
  const db = admin.firestore(app);
  const ledger = db.collection('users').doc(uid).collection('rewardLedger');
  const want = { points: whole(notes.rw_points), cashback: whole(notes.rw_cashback) };

  let late = false;
  await db.runTransaction(async (tx) => {
    late = false;
    const now = admin.firestore.Timestamp.now();
    const spends = (['points', 'cashback'] as const).filter((c) => want[c] > 0);
    const snaps: firestore.DocumentSnapshot[] = [];
    for (const currency of spends) snaps.push(await tx.get(ledger.doc(`spend_${razorpayOrderId}_${currency}`)));

    tx.set(
      db.collection('payments').doc(razorpayOrderId),
      {
        uid,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise: whole(rzpOrder.amount),
        base: money(notes.rw_base),
        points: want.points,
        pointsValue: money(notes.rw_pv),
        cashback: want.cashback,
        cartHash: String(notes.rw_cart || ''),
        ...(notes.rw_dealer === '1' ? { dealer: true, regularSubtotal: money(notes.rw_regular) } : {}),
        status: 'verified',
        verifiedAt: now,
        source: 'verify-payment',
      },
      { merge: true },
    );

    spends.forEach((currency, i) => {
      const snap = snaps[i];
      const d = snap.data();
      if (!snap.exists || !d) {
        // Nothing was reserved (a checkout from before reservations): spend it now.
        tx.create(snap.ref, {
          currency,
          amount: -want[currency],
          kind: 'spend',
          status: 'active',
          hold: false,
          unlockAt: now,
          razorpayOrderId,
          note:
            currency === 'points'
              ? `Used ${want[currency]} points on an order`
              : `Used ₹${want[currency]} wallet cashback on an order`,
          createdAt: now,
          confirmedAt: now,
          createdBy: 'server',
        });
      } else if (d.status === 'active' && d.hold === true) {
        tx.update(snap.ref, { hold: false, confirmedAt: now });
      } else if (d.status === 'void' && d.voidReason === 'payment-not-completed') {
        // Released as abandoned, then paid after all. Spend it now; the
        // balance may go below zero, which the shop sees on the order.
        tx.update(snap.ref, { status: 'active', hold: false, late: true, confirmedAt: now });
        late = true;
      }
    });
  });
  return { recorded: true, late };
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

  // The order id becomes the payments/<id> document id (one path segment).
  if (typeof orderId !== 'string' || !/^[\w-]{1,128}$/.test(orderId)) {
    return res.status(400).json({ verified: false, error: 'invalid razorpay_order_id' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ verified: false, error: 'RAZORPAY_KEY_SECRET is not configured' });
  }

  // ── Signature mismatch → 400, do NOT mark as paid ──
  if (!isValidSignature(orderId, paymentId, signature, keySecret)) {
    return res.status(400).json({ verified: false, error: 'Payment signature verification failed' });
  }

  // Never let the bookkeeping change the verification answer, or hold it up for long.
  const record = await withTimeout(
    recordPayment(orderId, paymentId),
    BOOKKEEPING_TIMEOUT_MS,
    'Payment record',
  ).catch((err: unknown) => {
    console.warn('[verify-payment] payment not recorded:', err instanceof Error ? err.message : err);
    return { recorded: false, late: false };
  });

  return res.status(200).json({
    verified: true,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    paymentRecorded: record.recorded,
    ...(record.recorded ? {} : { rewardsPending: true }),
    ...(record.late ? { rewardsLate: true } : {}),
  });
}

/**
 * Vercel serverless function — order-scoped FCM push notifications.
 *
 * Endpoint:  POST /api/notify-order
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
  if (!audience || !['customer', 'admins', 'delivery'].includes(audience)) {
    return res.status(400).json({ error: 'audience must be customer|admins|delivery' });
  }
  if (!title || !message) return res.status(400).json({ error: 'title and body are required' });

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

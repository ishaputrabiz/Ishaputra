/**
 * Vercel serverless function — send FCM push notification(s)
 *
 * Endpoint:  POST /api/send-notification
 * Body:
 *   {
 *     "tokens": ["..."],            // optional list of FCM tokens
 *     "topic":  "all-users",        // optional FCM topic
 *     "title":  "Order shipped",
 *     "body":   "Your order #1234 is on the way",
 *     "image":  "https://...",      // optional
 *     "url":    "/orders/1234",     // optional click target
 *     "data":   { "key": "value" }  // optional extra data
 *   }
 *
 * Auth: requires header `x-admin-key` matching env ADMIN_NOTIFICATION_KEY
 *       (set in Vercel project env vars; same value goes into the admin UI)
 *
 * Required env vars (Vercel):
 *   FIREBASE_ADMIN_SDK_BASE64  — base64 of the Firebase admin SDK JSON file
 *   ADMIN_NOTIFICATION_KEY     — shared secret for the admin broadcaster UI
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

function initAdmin() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  }
  let svc: admin.ServiceAccount;
  try {
    svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('FIREBASE_ADMIN_SDK_BASE64 is not valid base64-encoded JSON');
  }
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expectedKey = process.env.ADMIN_NOTIFICATION_KEY;
  if (expectedKey) {
    const provided = req.headers['x-admin-key'];
    if (provided !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const body = (req.body || {}) as {
    tokens?: string[];
    topic?: string;
    title: string;
    body: string;
    image?: string;
    url?: string;
    data?: Record<string, string>;
  };

  if (!body.title || !body.body) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  if ((!body.tokens || body.tokens.length === 0) && !body.topic) {
    return res.status(400).json({ error: 'tokens[] or topic is required' });
  }

  try {
    initAdmin();
  } catch (err: any) {
    return res.status(500).json({ error: 'Admin SDK init failed', detail: err.message });
  }

  const messaging = admin.messaging();
  const baseNotification = {
    title: body.title,
    body: body.body,
    ...(body.image ? { imageUrl: body.image } : {}),
  };
  const baseData: Record<string, string> = {
    ...(body.url ? { url: body.url } : {}),
    ...(body.data || {}),
  };

  try {
    if (body.topic) {
      const id = await messaging.send({
        topic: body.topic,
        notification: baseNotification,
        data: baseData,
        webpush: {
          fcmOptions: body.url ? { link: body.url } : undefined,
        },
      });
      return res.status(200).json({ ok: true, mode: 'topic', messageId: id });
    }

    // Multicast to a list of tokens (chunks of 500 max per FCM limits)
    const tokens = (body.tokens || []).filter(Boolean);
    const chunkSize = 500;
    const results: { successCount: number; failureCount: number; invalidTokens: string[] } = {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    };

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const resp = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: baseNotification,
        data: baseData,
        webpush: {
          fcmOptions: body.url ? { link: body.url } : undefined,
        },
      });
      results.successCount += resp.successCount;
      results.failureCount += resp.failureCount;
      resp.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code || '';
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument') ||
            code.includes('invalid-registration-token')
          ) {
            results.invalidTokens.push(chunk[idx]);
          }
        }
      });
    }

    return res.status(200).json({ ok: true, mode: 'tokens', ...results });
  } catch (err: any) {
    return res.status(500).json({ error: 'Send failed', detail: err.message });
  }
}

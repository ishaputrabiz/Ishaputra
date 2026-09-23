import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

function initAdmin() {
  if (admin.apps.length) return admin.app();

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' });

  const body = (req.body || {}) as { callId?: string; callerName?: string };
  const callId = String(body.callId || '').trim();
  if (!callId) return res.status(400).json({ error: 'callId is required' });

  try {
    const app = initAdmin();
    const auth = admin.auth(app);
    const db = admin.firestore(app);
    const decoded = await auth.verifyIdToken(token);

    const callRef = db.collection('videoCalls').doc(callId);
    const callSnap = await callRef.get();
    if (!callSnap.exists) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const callData = callSnap.data() as { callerUid?: string; calleeUid?: string } | undefined;
    if (!callData?.callerUid || !callData?.calleeUid) {
      return res.status(400).json({ error: 'Call document is incomplete' });
    }

    if (callData.callerUid !== decoded.uid) {
      return res.status(403).json({ error: 'Only the caller can send this notification' });
    }

    const tokenSnap = await db.collection('userTokens').where('uid', '==', callData.calleeUid).get();
    const tokens = tokenSnap.docs
      .map((doc) => String(doc.data().token || doc.id || ''))
      .filter(Boolean);

    if (!tokens.length) {
      return res.status(200).json({ ok: true, notified: false, reason: 'no_tokens' });
    }

    const callerName = String(body.callerName || '').trim().slice(0, 60) || 'Sreerasthu Silvers customer';
    const url = `/call/${callId}`;
    const response = await admin.messaging(app).sendEachForMulticast({
      tokens,
      notification: {
        title: 'Incoming video call',
        body: `${callerName} is calling you`,
      },
      data: {
        type: 'incoming-call',
        callId,
        url,
        tag: `call-${callId}`,
        requireInteraction: 'true',
      },
      webpush: {
        fcmOptions: { link: url },
        notification: {
          tag: `call-${callId}`,
          requireInteraction: true,
        },
      },
    });

    return res.status(200).json({
      ok: true,
      notified: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal error',
    });
  }
}
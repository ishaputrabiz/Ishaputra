/**
 * Admin reply endpoint for the WhatsApp inbox.
 *
 * Free-form text replies are only allowed when the customer's
 * `replyWindowClosesAt` (set by the inbound webhook) is still in the future.
 * Outside that 24-hour window, callers must specify an approved template name
 * — the request is forwarded to Meta's Cloud API as a template message.
 *
 * POST /api/whatsapp-reply
 * Headers: Authorization: Bearer <Firebase ID token for an admin user>
 * Body: { phone: '+91...', text?: string,
 *         template?: { name, language?, params?: string[] },
 *         actorUid?: string, actorEmail?: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

const META_BASE = 'https://graph.facebook.com/v21.0';

function initAdmin() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
}

function getErrorMessage(err: unknown, fallback = 'Unexpected error') {
  return err instanceof Error ? err.message : fallback;
}

function readMetaMessageId(data: unknown) {
  return (data as { messages?: Array<{ id?: string }> }).messages?.[0]?.id || null;
}

function readApiErrorMessage(data: unknown, fallback: string) {
  const shaped = data as { error?: { message?: string } | string };
  if (typeof shaped.error === 'string') return shaped.error;
  return shaped.error?.message || fallback;
}

async function requireAdmin(req: VercelRequest, db: admin.firestore.Firestore) {
  const expected = process.env.ADMIN_NOTIFICATION_KEY;
  if (expected && req.headers['x-admin-key'] === expected) return null;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Unauthorized');

  const decoded = await admin.auth().verifyIdToken(token);
  const claims = decoded as admin.auth.DecodedIdToken & { admin?: boolean; role?: string };
  if (claims.admin === true || claims.role === 'admin') return decoded;

  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const role = userDoc.exists ? userDoc.data()?.role : null;
  if (role !== 'admin') throw new Error('Unauthorized');
  return decoded;
}

async function sendToMeta(payload: Record<string, unknown>) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error('WhatsApp env not configured');
  const resp = await fetch(`${META_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(readApiErrorMessage(data, `HTTP ${resp.status}`));
  }
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = (req.body || {}) as {
    phone?: string;
    text?: string;
    template?: { name?: string; language?: string; params?: string[] };
    actorUid?: string;
    actorEmail?: string;
  };

  const phone = String(body.phone || '').replace(/[^+\d]/g, '');
  if (!phone) return res.status(400).json({ ok: false, error: 'Missing phone' });
  const phoneId = phone.startsWith('+') ? phone : '+' + phone;
  const wantsTemplate = !!body.template?.name;
  const text = (body.text || '').trim();

  if (!wantsTemplate && !text) {
    return res.status(400).json({ ok: false, error: 'Provide text or template.' });
  }

  try {
    initAdmin();
  } catch (err: unknown) {
    return res.status(500).json({ ok: false, error: 'Admin init failed', detail: getErrorMessage(err) });
  }
  const db = admin.firestore();
  try {
    await requireAdmin(req, db);
  } catch {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Fetch reply window from thread document.
  const threadRef = db.collection('whatsappThreads').doc(phoneId);
  const threadSnap = await threadRef.get();
  const threadData = threadSnap.exists ? threadSnap.data() || {} : {};
  const windowClosesAt: admin.firestore.Timestamp | undefined = threadData.replyWindowClosesAt;
  const windowOpen = windowClosesAt
    ? windowClosesAt.toMillis() > Date.now()
    : false;

  if (!wantsTemplate && !windowOpen) {
    return res.status(409).json({
      ok: false,
      error: 'Free-form reply window has closed. Send an approved template instead.',
      replyWindowClosesAt: windowClosesAt?.toMillis() || null,
    });
  }

  const to = phoneId.replace(/^\+/, '');
  const recordedAt = admin.firestore.FieldValue.serverTimestamp();
  const messageDoc: Record<string, unknown> = {
    direction: 'outbound',
    actorUid: body.actorUid || null,
    actorEmail: body.actorEmail || null,
    createdAt: recordedAt,
  };

  try {
    if (wantsTemplate) {
      const t = body.template!;
      const tplName = String(t.name || '');
      const tplLang = String(t.language || 'en_US');
      const params = (t.params || []).map((p) => String(p));
      const components = params.length
        ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }]
        : [];
      const data = await sendToMeta({
        to,
        type: 'template',
        template: { name: tplName, language: { code: tplLang }, components },
      });
      messageDoc.type = 'template';
      messageDoc.template = { name: tplName, language: tplLang, params };
      messageDoc.providerMessageId = readMetaMessageId(data);
      messageDoc.text = `[template:${tplName}] ${params.join(' | ')}`;
    } else {
      const data = await sendToMeta({ to, type: 'text', text: { body: text.slice(0, 1000) } });
      messageDoc.type = 'text';
      messageDoc.text = text.slice(0, 1000);
      messageDoc.providerMessageId = readMetaMessageId(data);
    }

    const batch = db.batch();
    const msgRef = threadRef.collection('messages').doc();
    batch.set(msgRef, messageDoc);
    batch.set(
      threadRef,
      {
        phone: phoneId,
        lastMessage: String(messageDoc.text || '').slice(0, 200),
        lastDirection: 'outbound',
        lastOutboundAt: recordedAt,
        unreadCount: 0,
        updatedAt: recordedAt,
      },
      { merge: true },
    );
    await batch.commit();

    return res.status(200).json({ ok: true, messageId: messageDoc.providerMessageId || null });
  } catch (err: unknown) {
    return res.status(502).json({ ok: false, error: getErrorMessage(err, 'Send failed') });
  }
}

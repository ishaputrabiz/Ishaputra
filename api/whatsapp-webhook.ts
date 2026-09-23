/**
 * WhatsApp Cloud API webhook
 *
 * GET  — Meta verification handshake.
 *        Required query: hub.mode=subscribe & hub.verify_token=<token> & hub.challenge=<n>
 * POST — Inbound message dispatch from Meta. Body is signed with the
 *        x-hub-signature-256 header using the App Secret. We reject unsigned
 *        or invalid payloads.
 *
 * Inbound text messages are upserted into Firestore:
 *   whatsappThreads/{phone}                — last message preview, replyWindowClosesAt
 *   whatsappThreads/{phone}/messages/{id}  — individual inbound + outbound messages
 *
 * Required env vars:
 *   FIREBASE_ADMIN_SDK_BASE64
 *   WHATSAPP_VERIFY_TOKEN     — chosen freely; entered in Meta dashboard
 *   WHATSAPP_APP_SECRET       — Meta app secret used to sign payloads
 *
 * NB: Vercel needs `bodyParser: false` so we can verify the raw body
 * signature byte-for-byte. We therefore read the raw stream manually.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { createHmac, timingSafeEqual } from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

function initAdmin() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody: Buffer, signatureHeader?: string | string[]): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!sig || !sig.startsWith('sha256=')) return false;
  const provided = Buffer.from(sig.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // -------- GET handshake ------------------------------------------------
  if (req.method === 'GET') {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // -------- POST: signed event ------------------------------------------
  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: 'Could not read request body' });
  }

  if (!verifySignature(raw, req.headers['x-hub-signature-256'])) {
    return res.status(401).json({ ok: false, error: 'Invalid signature' });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  try {
    initAdmin();
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: 'Admin init failed', detail: err.message });
  }
  const db = admin.firestore();

  const entries = (payload?.entry || []) as any[];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = (value.messages || []) as any[];
      const contacts = (value.contacts || []) as any[];
      const contactName = contacts?.[0]?.profile?.name || null;

      for (const msg of messages) {
        const from = String(msg.from || '').replace(/[^+\d]/g, '');
        if (!from) continue;
        const phoneId = '+' + from.replace(/^\+/, '');

        // Capture text or fall back to message kind so admins see something.
        let bodyText = '';
        const type = String(msg.type || 'text');
        if (type === 'text') bodyText = String(msg.text?.body || '');
        else if (type === 'button') bodyText = String(msg.button?.text || '');
        else if (type === 'interactive')
          bodyText =
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            '[interactive]';
        else bodyText = `[${type}]`;

        const tsMs = Number(msg.timestamp || 0) * 1000 || Date.now();
        const inboundAt = admin.firestore.Timestamp.fromMillis(tsMs);
        // Meta lets you reply free-form for 24 hours after the customer's
        // last inbound message.
        const windowClosesAt = admin.firestore.Timestamp.fromMillis(tsMs + 24 * 60 * 60 * 1000);

        const threadRef = db.collection('whatsappThreads').doc(phoneId);
        const msgRef = threadRef.collection('messages').doc(String(msg.id || `inb_${tsMs}`));

        const batch = db.batch();
        batch.set(
          threadRef,
          {
            phone: phoneId,
            contactName,
            lastMessage: bodyText.slice(0, 200),
            lastDirection: 'inbound',
            lastInboundAt: inboundAt,
            replyWindowClosesAt: windowClosesAt,
            unreadCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        batch.set(msgRef, {
          direction: 'inbound',
          type,
          text: bodyText,
          rawType: type,
          providerMessageId: msg.id || null,
          createdAt: inboundAt,
        });
        await batch.commit();
      }
    }
  }

  return res.status(200).json({ ok: true });
}

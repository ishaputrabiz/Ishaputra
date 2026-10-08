/**
 * WhatsApp Cloud API webhook
 *
 * GET  — Meta verification handshake.
 *        Required query: hub.mode=subscribe & hub.verify_token=<token> & hub.challenge=<n>
 * POST — Event dispatch from Meta. Body is signed with the x-hub-signature-256
 *        header using the App Secret. Unsigned or invalid payloads are rejected.
 *
 * Firestore layout:
 *   whatsappThreads/{+phone}                — preview, contact name, unread count,
 *                                             replyWindowClosesAt, status (open/resolved)
 *   whatsappThreads/{+phone}/messages/{id}  — inbound, outbound and internal notes.
 *                                             Inbound and outbound docs use Meta's
 *                                             message id (wamid) as the doc id.
 *
 * Events handled:
 *   value.messages  — text, button, interactive, image, video, audio, document,
 *                     sticker, location, contacts, reaction. Media is stored as
 *                     its Meta media id; the admin fetches it on demand through
 *                     /api/whatsapp-reply { action: 'media' }.
 *   value.statuses  — sent / delivered / read / failed for outbound messages.
 *                     Updates the message doc (never moving a status backwards)
 *                     and the thread's last-status tick.
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

export function verifySignature(rawBody: Buffer, signatureHeader?: string | string[], secret = process.env.WHATSAPP_APP_SECRET): boolean {
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

// ===========================================================================
// Pure helpers (unit-tested)
// ===========================================================================
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export interface InboundSummary {
  type: string;
  /** Text shown in the bubble (caption, body, or a short label). */
  text: string;
  /** One-line preview for the thread list. */
  preview: string;
  media?: { id: string; mimeType: string | null; caption: string | null; filename: string | null; voice?: boolean } | null;
  location?: { latitude: number; longitude: number; name: string | null; address: string | null } | null;
  reaction?: { emoji: string; messageId: string } | null;
  contextMessageId?: string | null;
}

const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  sticker: 'Sticker',
};

export function describeInbound(msg: Record<string, any>): InboundSummary {
  const type = s(msg?.type) || 'text';
  const contextMessageId = s(msg?.context?.id) || null;
  if (type === 'text') {
    const text = s(msg.text?.body);
    return { type, text, preview: text, contextMessageId };
  }
  if (type === 'button') {
    const text = s(msg.button?.text);
    return { type, text, preview: text, contextMessageId };
  }
  if (type === 'interactive') {
    const text = s(msg.interactive?.button_reply?.title) || s(msg.interactive?.list_reply?.title) || 'Interactive reply';
    return { type, text, preview: text, contextMessageId };
  }
  if (MEDIA_LABEL[type]) {
    const m = msg[type] || {};
    const caption = s(m.caption) || null;
    const filename = s(m.filename) || null;
    const voice = type === 'audio' && m.voice === true;
    const label = voice ? 'Voice message' : MEDIA_LABEL[type];
    const text = caption || (type === 'document' && filename ? filename : '');
    return {
      type,
      text,
      preview: `${label}${text ? `: ${text}` : ''}`,
      media: { id: s(m.id), mimeType: s(m.mime_type) || null, caption, filename, ...(voice ? { voice } : {}) },
      contextMessageId,
    };
  }
  if (type === 'location') {
    const l = msg.location || {};
    const name = s(l.name) || null;
    const address = s(l.address) || null;
    const label = name || address || 'Shared location';
    return {
      type,
      text: [name, address].filter(Boolean).join(', '),
      preview: `Location: ${label}`,
      location: { latitude: Number(l.latitude) || 0, longitude: Number(l.longitude) || 0, name, address },
      contextMessageId,
    };
  }
  if (type === 'contacts') {
    const c = Array.isArray(msg.contacts) ? msg.contacts[0] : null;
    const name = s(c?.name?.formatted_name) || 'a contact';
    const phone = s(c?.phones?.[0]?.phone);
    const text = phone ? `${name} (${phone})` : name;
    return { type, text, preview: `Contact: ${name}`, contextMessageId };
  }
  if (type === 'reaction') {
    const emoji = s(msg.reaction?.emoji);
    const target = s(msg.reaction?.message_id);
    return {
      type,
      text: emoji ? `Reacted ${emoji}` : 'Removed a reaction',
      preview: emoji ? `Reacted ${emoji}` : 'Removed a reaction',
      reaction: { emoji, messageId: target },
      contextMessageId,
    };
  }
  if (type === 'unsupported') {
    return { type, text: 'Message type not supported by the WhatsApp Cloud API', preview: 'Unsupported message', contextMessageId };
  }
  return { type, text: `[${type}]`, preview: `[${type}]`, contextMessageId };
}

/** Order of outbound delivery states. `failed` wins over everything but `read`. */
export const STATUS_RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * Patch for an outbound message doc given an incoming status, or null when the
 * event is stale (Meta can deliver `delivered` after `read`).
 */
export function nextStatusPatch(
  current: Record<string, any> | undefined,
  status: Record<string, any>,
  toTimestamp: (ms: number) => unknown,
): Record<string, unknown> | null {
  const incoming = s(status?.status).toLowerCase();
  if (!(incoming in STATUS_RANK) || incoming === 'accepted') return null;
  const cur = s(current?.status).toLowerCase() || 'accepted';
  const curRank = STATUS_RANK[cur] ?? 0;
  if (cur === 'read' && incoming === 'failed') return null;
  if (incoming !== 'failed' && STATUS_RANK[incoming] <= curRank) return null;
  if (cur === 'failed' && incoming !== 'failed') return null;
  const ms = Number(status?.timestamp || 0) * 1000 || Date.now();
  const at = toTimestamp(ms);
  const patch: Record<string, unknown> = {
    status: incoming,
    statusUpdatedAt: at,
    [`statusTimestamps.${incoming}`]: at,
  };
  if (incoming === 'failed') {
    const e = Array.isArray(status?.errors) ? status.errors[0] : null;
    patch.error = e
      ? {
          code: Number(e.code) || null,
          title: s(e.title) || null,
          message: s(e.error_data?.details) || s(e.message) || s(e.title) || 'Delivery failed',
        }
      : { code: null, title: null, message: 'Delivery failed' };
  }
  return patch;
}

// ===========================================================================
// Firestore writers (take a db so tests can pass a fake)
// ===========================================================================
interface TxLike {
  get(ref: any): Promise<{ exists: boolean; data(): Record<string, any> | undefined }>;
  update(ref: any, data: Record<string, unknown>): unknown;
}
export interface WebhookDb {
  collection(name: string): any;
  runTransaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>;
  batch(): { set(ref: any, data: Record<string, unknown>, opts?: { merge: boolean }): unknown; commit(): Promise<unknown> };
}
export interface WebhookDeps {
  fromMillis: (ms: number) => unknown;
  serverTimestamp: () => unknown;
  increment: (n: number) => unknown;
}

export async function applyStatus(db: WebhookDb, status: Record<string, any>, deps: WebhookDeps) {
  const wamid = s(status?.id);
  const recipient = s(status?.recipient_id).replace(/\D/g, '');
  if (!wamid || !recipient) return 'skipped';
  const threadRef = db.collection('whatsappThreads').doc(`+${recipient}`);
  const msgRef = threadRef.collection('messages').doc(wamid);
  return db.runTransaction(async (tx) => {
    const msgSnap = await tx.get(msgRef);
    const threadSnap = await tx.get(threadRef);
    // Order notifications are not stored in threads: ignore. (Broadcasts are.)
    if (!msgSnap.exists) return 'missing';
    const patch = nextStatusPatch(msgSnap.data(), status, deps.fromMillis);
    if (!patch) return 'stale';
    tx.update(msgRef, patch);
    if (threadSnap.exists && threadSnap.data()?.lastOutboundMessageId === wamid) {
      tx.update(threadRef, { lastStatus: patch.status });
    }
    return 'updated';
  });
}

/**
 * Marketing consent keywords. "STOP" opts a number out of announcements
 * (broadcast skips it); "START" opts it back in. Anything else: no change.
 */
export function marketingConsentChange(text: string): 'out' | 'in' | null {
  const word = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '');
  if (['stop', 'unsubscribe', 'stop updates', 'stop messages'].includes(word)) return 'out';
  if (['start', 'subscribe', 'unstop'].includes(word)) return 'in';
  return null;
}

export async function storeInbound(
  db: WebhookDb,
  msg: Record<string, any>,
  contactName: string | null,
  deps: WebhookDeps,
) {
  const from = s(msg?.from).replace(/\D/g, '');
  if (!from) return 'skipped';
  const phoneId = `+${from}`;
  const summary = describeInbound(msg);
  const tsMs = Number(msg.timestamp || 0) * 1000 || Date.now();
  const inboundAt = deps.fromMillis(tsMs);
  // Meta allows free-form replies for 24 hours after the customer's last message.
  const windowClosesAt = deps.fromMillis(tsMs + 24 * 60 * 60 * 1000);

  const threadRef = db.collection('whatsappThreads').doc(phoneId);
  const msgRef = threadRef.collection('messages').doc(s(msg.id) || `inb_${tsMs}`);
  const threadPatch: Record<string, unknown> = {
    phone: phoneId,
    lastMessage: summary.preview.slice(0, 200),
    lastMessageType: summary.type,
    lastDirection: 'inbound',
    lastInboundAt: inboundAt,
    lastInboundMessageId: s(msg.id) || null,
    replyWindowClosesAt: windowClosesAt,
    unreadCount: deps.increment(1),
    // A new customer message reopens a resolved conversation.
    status: 'open',
    updatedAt: deps.serverTimestamp(),
  };
  if (contactName) threadPatch.contactName = contactName;
  const consent = summary.type === 'text' || summary.type === 'button' ? marketingConsentChange(summary.text) : null;
  if (consent) {
    threadPatch.marketingOptOut = consent === 'out';
    threadPatch.marketingConsentAt = deps.serverTimestamp();
  }

  const batch = db.batch();
  batch.set(threadRef, threadPatch, { merge: true });
  batch.set(msgRef, {
    direction: 'inbound',
    type: summary.type,
    text: summary.text,
    rawType: summary.type,
    media: summary.media || null,
    location: summary.location || null,
    reaction: summary.reaction || null,
    contextMessageId: summary.contextMessageId || null,
    providerMessageId: s(msg.id) || null,
    createdAt: inboundAt,
  });
  await batch.commit();
  return 'stored';
}

export async function processWebhookPayload(db: WebhookDb, payload: Record<string, any>, deps: WebhookDeps) {
  const result = { messages: 0, statuses: 0 };
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const msg of Array.isArray(value.messages) ? value.messages : []) {
        const contact = contacts.find((c: any) => s(c?.wa_id) === s(msg?.from)) || contacts[0];
        const name = s(contact?.profile?.name) || null;
        if ((await storeInbound(db, msg, name, deps)) === 'stored') result.messages += 1;
      }
      for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
        if ((await applyStatus(db, st, deps)) === 'updated') result.statuses += 1;
      }
    }
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // -------- GET handshake ------------------------------------------------
  if (req.method === 'GET') {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (verifyToken && mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
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
  } catch {
    return res.status(400).json({ ok: false, error: 'Could not read request body' });
  }

  if (!verifySignature(raw, req.headers['x-hub-signature-256'])) {
    return res.status(401).json({ ok: false, error: 'Invalid signature' });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  try {
    initAdmin();
  } catch (err: unknown) {
    return res.status(500).json({ ok: false, error: 'Admin init failed', detail: err instanceof Error ? err.message : '' });
  }
  const db = admin.firestore();

  try {
    const result = await processWebhookPayload(db as unknown as WebhookDb, payload, {
      fromMillis: (ms) => admin.firestore.Timestamp.fromMillis(ms),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      increment: (n) => admin.firestore.FieldValue.increment(n),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err: unknown) {
    // A 500 makes Meta retry the delivery later, which is what we want.
    console.error('[whatsapp-webhook] processing failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Processing failed' });
  }
}

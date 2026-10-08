/**
 * Marketing broadcast endpoint.
 *
 * Resolves audience server-side using the firebase-admin SDK, then fans out
 * to web-push (FCM) and/or WhatsApp Cloud API. Updates the broadcastCampaigns
 * document with success/failure counts per channel.
 *
 * POST /api/broadcast
 * Headers: Authorization: Bearer <Firebase ID token for an admin user>
 * Body: {
 *   campaignId?: string,         // if omitted a new doc is created
 *   audience: 'all' | 'customers' | 'delivery' | 'pushEnabled' | 'selected',
 *   selectedUids?: string[],     // required when audience === 'selected'
 *   channels: { push?: boolean, whatsapp?: boolean },
 *   push?: { title: string, body: string, image?: string, url?: string },
 *   whatsapp?: { template: string, language?: string, params?: string[],
 *                personalizeFirst?: boolean }  // {{1}} = first name (default true)
 * }
 *
 * WhatsApp sends skip numbers that replied STOP (whatsappThreads.marketingOptOut)
 * and go once per number even when two accounts share it.
 *
 * Required env vars:
 *   FIREBASE_ADMIN_SDK_BASE64
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID  (only when sending WA)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

const META_BASE = 'https://graph.facebook.com/v21.0';
/** Parallel WhatsApp sends. Well under Meta's 80 msg/s, fast enough for Vercel. */
const WA_CONCURRENCY = 8;

export const config = { maxDuration: 60 };

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Shoppers sign up with role 'user'; older accounts say 'customer' or nothing. */
export function isCustomerRole(role: unknown) {
  return role !== 'admin' && role !== 'delivery';
}

/**
 * Cloud API wants digits with the country code and no '+'. Phones are saved
 * as typed, often as a bare 10-digit Indian mobile, so add 91 to those.
 */
export function normalizeWhatsAppNumber(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (text.startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/**
 * Meta rejects template parameters with new lines, tabs or more than four
 * spaces in a row (error 132018), so fold them into single spaces.
 */
export function sanitizeTemplateParam(value: unknown) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Run `fn` over items with at most `limit` in flight. */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
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

function readApiErrorMessage(data: unknown, fallback: string) {
  const shaped = data as { error?: { message?: string } };
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

interface AudienceTarget {
  uid: string;
  tokens: string[];
  phone?: string;
  name?: string;
  role?: string;
}

export interface WhatsAppRecipient {
  uid: string;
  to: string;
  name?: string;
}

/**
 * Turn audience targets into one WhatsApp recipient per number, dropping
 * numbers that opted out, and count why the others were skipped.
 */
export function planWhatsAppRecipients(targets: AudienceTarget[], optedOut: Set<string>) {
  const recipients: WhatsAppRecipient[] = [];
  const seen = new Set<string>();
  const skipped = { noPhone: 0, invalidPhone: 0, optedOut: 0, duplicate: 0 };
  for (const t of targets) {
    if (!t.phone) {
      skipped.noPhone += 1;
      continue;
    }
    const to = normalizeWhatsAppNumber(t.phone);
    if (!to) skipped.invalidPhone += 1;
    else if (optedOut.has(to)) skipped.optedOut += 1;
    else if (seen.has(to)) skipped.duplicate += 1;
    else {
      seen.add(to);
      recipients.push({ uid: t.uid, to, name: t.name });
    }
  }
  return { recipients, skipped };
}

async function resolveAudience(
  db: admin.firestore.Firestore,
  audience: string,
  selectedUids?: string[],
): Promise<AudienceTarget[]> {
  // Fetch all userTokens once — we then filter by uid based on audience.
  const tokensSnap = await db.collection('userTokens').get();
  const tokensByUid = new Map<string, string[]>();
  tokensSnap.forEach((doc) => {
    const data = doc.data();
    const uid = data.uid as string | undefined;
    const token = data.token as string | undefined;
    if (!uid || !token) return;
    const arr = tokensByUid.get(uid) || [];
    arr.push(token);
    tokensByUid.set(uid, arr);
  });

  // Decide which uids are in scope.
  let candidateUids: string[] = [];

  if (audience === 'selected') {
    candidateUids = (selectedUids || []).filter(Boolean);
  } else if (audience === 'pushEnabled') {
    candidateUids = Array.from(tokensByUid.keys());
  } else {
    // all / customers / delivery — load users and filter by role
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach((u) => {
      const role = u.data().role as string | undefined;
      if (audience === 'all') candidateUids.push(u.id);
      else if (audience === 'customers' && isCustomerRole(role)) candidateUids.push(u.id);
      else if (audience === 'delivery' && role === 'delivery') candidateUids.push(u.id);
    });
  }

  // Hydrate each uid with profile + tokens.
  const targets: AudienceTarget[] = [];
  // Use chunked getAll so we don't hammer Firestore one-doc-at-a-time.
  const chunkSize = 30;
  for (let i = 0; i < candidateUids.length; i += chunkSize) {
    const chunk = candidateUids.slice(i, i + chunkSize);
    const refs = chunk.map((uid) => db.collection('users').doc(uid));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      const uid = chunk[idx];
      const tokens = tokensByUid.get(uid) || [];
      if (!snap.exists) {
        if (tokens.length) targets.push({ uid, tokens });
        return;
      }
      const data = snap.data() || {};
      targets.push({
        uid,
        tokens,
        // Prefer the number the customer gave for WhatsApp.
        phone:
          (data.whatsappNumber as string | undefined) ||
          (data.phone as string | undefined) ||
          (data.mobile as string | undefined),
        name:
          (data.fullName as string | undefined) ||
          (data.name as string | undefined) ||
          (data.username as string | undefined) ||
          (data.displayName as string | undefined),
        role: data.role as string | undefined,
      });
    });
  }
  return targets;
}

// ---------------------------------------------------------------------------
async function dispatchPush(
  targets: AudienceTarget[],
  push: { title: string; body: string; image?: string; url?: string },
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  const messaging = admin.messaging();
  const tokens = targets.flatMap((t) => t.tokens).filter(Boolean);
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }
  const result = { successCount: 0, failureCount: 0, invalidTokens: [] as string[] };
  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const resp = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: push.title,
        body: push.body,
        ...(push.image ? { imageUrl: push.image } : {}),
      },
      data: push.url ? { url: push.url } : {},
      webpush: push.url ? { fcmOptions: { link: push.url } } : undefined,
    });
    result.successCount += resp.successCount;
    result.failureCount += resp.failureCount;
    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-argument') ||
          code.includes('invalid-registration-token')
        ) {
          result.invalidTokens.push(chunk[idx]);
        }
      }
    });
  }
  return result;
}

async function sendWhatsAppTemplate(
  to: string,
  template: string,
  language: string,
  params: string[],
  headerImageUrl?: string | null,
): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error('WhatsApp env not configured');
  const components: Array<Record<string, unknown>> = [];
  // Picture-header templates carry their saved picture on every send.
  if (headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] });
  if (params.length) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) });
  const resp = await fetch(`${META_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: template, language: { code: language }, components },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(readApiErrorMessage(data, `HTTP ${resp.status}`));
  return (data as { messages?: Array<{ id?: string }> }).messages?.[0]?.id || null;
}

/** The synced template doc: wording for the inbox, and any header picture. */
async function loadTemplateInfo(db: admin.firestore.Firestore, name: string, language: string) {
  try {
    const snap = await db.collection('whatsappTemplates').where('name', '==', name).limit(10).get();
    const match = snap.docs.find((d) => (d.data().language || 'en_US') === language) || snap.docs[0];
    const data = match?.data() || {};
    return {
      bodyText: (data.bodyText as string | undefined) || '',
      headerFormat: (data.headerFormat as string | undefined) || null,
      headerImageUrl: (data.headerImageUrl as string | undefined) || null,
    };
  } catch {
    return { bodyText: '', headerFormat: null, headerImageUrl: null };
  }
}

/**
 * Log a sent template in the customer's inbox thread so delivery ticks land
 * on it and the team sees what the customer is replying to. Only existing
 * threads get their preview bumped: a broadcast must not fill the inbox with
 * conversations nobody started. The message itself is always stored, so it is
 * there when the customer writes back.
 */
async function logToInbox(
  db: admin.firestore.Firestore,
  to: string,
  wamid: string,
  entry: { template: string; language: string; params: string[]; text: string; campaignId: string },
  actor: { uid: string | null; email: string | null },
) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const threadRef = db.collection('whatsappThreads').doc(`+${to}`);
  await threadRef.collection('messages').doc(wamid).set({
    direction: 'outbound',
    type: 'template',
    template: { name: entry.template, language: entry.language, params: entry.params },
    text: entry.text,
    campaignId: entry.campaignId,
    providerMessageId: wamid,
    status: 'accepted',
    actorUid: actor.uid,
    actorEmail: actor.email,
    createdAt: now,
  });
  await threadRef
    .update({
      lastMessage: entry.text.slice(0, 200),
      lastMessageType: 'template',
      lastDirection: 'outbound',
      lastOutboundAt: now,
      lastOutboundMessageId: wamid,
      lastStatus: 'accepted',
      updatedAt: now,
    })
    .catch(() => {
      /* no thread yet: the customer never wrote to us */
    });
}

async function loadOptedOutNumbers(db: admin.firestore.Firestore) {
  const snap = await db.collection('whatsappThreads').where('marketingOptOut', '==', true).get();
  return new Set(snap.docs.map((d) => d.id.replace(/\D/g, '')));
}

async function dispatchWhatsApp(
  recipients: WhatsAppRecipient[],
  whatsapp: { template: string; language?: string; headerImageUrl?: string | null },
  paramResolver: (recipient: WhatsAppRecipient) => string[],
  onSent?: (recipient: WhatsAppRecipient, wamid: string, params: string[]) => Promise<void>,
): Promise<{ successCount: number; failureCount: number; failures: Array<{ uid: string; error: string }> }> {
  const language = whatsapp.language || 'en_US';
  const result = {
    successCount: 0,
    failureCount: 0,
    failures: [] as Array<{ uid: string; error: string }>,
  };
  await mapWithConcurrency(recipients, WA_CONCURRENCY, async (r) => {
    try {
      const params = paramResolver(r);
      const wamid = await sendWhatsAppTemplate(r.to, whatsapp.template, language, params, whatsapp.headerImageUrl);
      result.successCount += 1;
      if (wamid && onSent) await onSent(r, wamid, params).catch(() => undefined);
    } catch (err: unknown) {
      result.failureCount += 1;
      result.failures.push({ uid: r.uid, error: getErrorMessage(err, 'send failed') });
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

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

  const body = (req.body || {}) as {
    campaignId?: string;
    audience?: 'all' | 'customers' | 'delivery' | 'pushEnabled' | 'selected';
    selectedUids?: string[];
    channels?: { push?: boolean; whatsapp?: boolean };
    push?: { title?: string; body?: string; image?: string; url?: string };
    whatsapp?: { template?: string; language?: string; params?: string[]; personalizeFirst?: boolean };
    actorUid?: string;
    actorEmail?: string;
    kind?: string;
  };

  const audience = body.audience || 'all';
  const channels = body.channels || {};
  if (!channels.push && !channels.whatsapp) {
    return res.status(400).json({ ok: false, error: 'At least one channel must be enabled.' });
  }
  if (channels.push && (!body.push?.title || !body.push?.body)) {
    return res.status(400).json({ ok: false, error: 'Push title and body required.' });
  }
  if (channels.whatsapp && !body.whatsapp?.template) {
    return res.status(400).json({ ok: false, error: 'WhatsApp template name required.' });
  }
  if (audience === 'selected' && !(body.selectedUids && body.selectedUids.length)) {
    return res.status(400).json({ ok: false, error: 'selectedUids required for "selected" audience.' });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  // Create or update campaign record so it's auditable.
  const campaignRef = body.campaignId
    ? db.collection('broadcastCampaigns').doc(body.campaignId)
    : db.collection('broadcastCampaigns').doc();

  const baseCampaign = {
    kind: body.kind === 'announcement' ? 'announcement' : 'custom',
    audience,
    selectedUids: audience === 'selected' ? body.selectedUids || [] : [],
    channels: { push: !!channels.push, whatsapp: !!channels.whatsapp },
    push: channels.push ? body.push || null : null,
    whatsapp: channels.whatsapp ? body.whatsapp || null : null,
    status: 'sending',
    actorUid: body.actorUid || null,
    actorEmail: body.actorEmail || null,
    createdAt: now,
    startedAt: now,
  };

  await campaignRef.set(baseCampaign, { merge: true });

  try {
    const targets = await resolveAudience(db, audience, body.selectedUids);

    let pushResult: Awaited<ReturnType<typeof dispatchPush>> | null = null;
    let waResult:
      | (Awaited<ReturnType<typeof dispatchWhatsApp>> & {
          skipped: ReturnType<typeof planWhatsAppRecipients>['skipped'];
        })
      | null = null;

    if (channels.push && body.push?.title && body.push?.body) {
      pushResult = await dispatchPush(targets, {
        title: body.push.title,
        body: body.push.body,
        image: body.push.image,
        url: body.push.url,
      });
    }

    if (channels.whatsapp && body.whatsapp?.template) {
      const baseParams = (body.whatsapp.params || []).map(sanitizeTemplateParam);
      const personalize = body.whatsapp.personalizeFirst !== false;
      // {{1}} becomes the customer's first name; the admin's value is the
      // fallback for customers without a name.
      const paramResolver = (r: WhatsAppRecipient): string[] => {
        if (!personalize || baseParams.length === 0) return baseParams;
        const firstName = sanitizeTemplateParam((r.name || '').split(' ')[0]) || baseParams[0];
        return [firstName, ...baseParams.slice(1)];
      };
      const { recipients, skipped } = planWhatsAppRecipients(targets, await loadOptedOutNumbers(db));
      const template = body.whatsapp.template;
      const language = body.whatsapp.language || 'en_US';
      const { bodyText, headerFormat, headerImageUrl } = await loadTemplateInfo(db, template, language);
      if (headerFormat === 'IMAGE' && !headerImageUrl) {
        throw new Error('This template has a picture at the top but none is saved. Add one in Marketing → Templates → Library (Set picture).');
      }
      const actor = { uid: body.actorUid || null, email: body.actorEmail || null };
      const sent = await dispatchWhatsApp(recipients, { template, language, headerImageUrl }, paramResolver, (r, wamid, params) =>
        logToInbox(
          db,
          r.to,
          wamid,
          {
            template,
            language,
            params,
            text: bodyText
              ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
              : `[template:${template}] ${params.join(' | ')}`,
            campaignId: campaignRef.id,
          },
          actor,
        ),
      );
      // Keep the stored failure list short; the counts tell the story.
      waResult = { ...sent, failures: sent.failures.slice(0, 50), skipped };
    }

    await campaignRef.set(
      {
        status: 'completed',
        recipientCount: targets.length,
        pushResult,
        whatsappResult: waResult,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return res.status(200).json({
      ok: true,
      campaignId: campaignRef.id,
      recipientCount: targets.length,
      push: pushResult,
      whatsapp: waResult,
    });
  } catch (err: unknown) {
    await campaignRef.set(
      {
        status: 'failed',
        error: getErrorMessage(err, String(err)),
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return res.status(500).json({ ok: false, error: getErrorMessage(err, 'Broadcast failed') });
  }
}

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
 *   whatsapp?: { template: string, language?: string, params?: string[] }
 * }
 *
 * Required env vars:
 *   FIREBASE_ADMIN_SDK_BASE64
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID  (only when sending WA)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

const META_BASE = 'https://graph.facebook.com/v21.0';

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
      const role = (u.data().role as string | undefined) || 'customer';
      if (audience === 'all') candidateUids.push(u.id);
      else if (audience === 'customers' && role === 'customer') candidateUids.push(u.id);
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
        phone: (data.phone as string | undefined) || (data.mobile as string | undefined),
        name: (data.fullName as string | undefined) || (data.name as string | undefined),
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
): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error('WhatsApp env not configured');
  const components = params.length
    ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
    : [];
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
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(readApiErrorMessage(data, `HTTP ${resp.status}`));
  }
}

async function dispatchWhatsApp(
  targets: AudienceTarget[],
  whatsapp: { template: string; language?: string; params?: string[] },
  paramResolver: (target: AudienceTarget) => string[],
): Promise<{ successCount: number; failureCount: number; failures: Array<{ uid: string; error: string }> }> {
  const language = whatsapp.language || 'en_US';
  const result = {
    successCount: 0,
    failureCount: 0,
    failures: [] as Array<{ uid: string; error: string }>,
  };
  // Sequential to stay within Cloud API rate limits (250/sec default — but
  // we cap conservatively for Vercel function execution time).
  for (const target of targets) {
    if (!target.phone) {
      result.failureCount += 1;
      result.failures.push({ uid: target.uid, error: 'missing phone' });
      continue;
    }
    const to = String(target.phone).replace(/[^+\d]/g, '');
    if (!to) {
      result.failureCount += 1;
      result.failures.push({ uid: target.uid, error: 'invalid phone' });
      continue;
    }
    try {
      await sendWhatsAppTemplate(to, whatsapp.template, language, paramResolver(target));
      result.successCount += 1;
    } catch (err: unknown) {
      result.failureCount += 1;
      result.failures.push({ uid: target.uid, error: getErrorMessage(err, 'send failed') });
    }
  }
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
    whatsapp?: { template?: string; language?: string; params?: string[] };
    actorUid?: string;
    actorEmail?: string;
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
    let waResult: Awaited<ReturnType<typeof dispatchWhatsApp>> | null = null;

    if (channels.push && body.push?.title && body.push?.body) {
      pushResult = await dispatchPush(targets, {
        title: body.push.title,
        body: body.push.body,
        image: body.push.image,
        url: body.push.url,
      });
    }

    if (channels.whatsapp && body.whatsapp?.template) {
      const baseParams = body.whatsapp.params || [];
      // Personalise {{1}} with first name when present, otherwise leave the
      // template author's default param 0 in place.
      const paramResolver = (t: AudienceTarget): string[] => {
        if (baseParams.length === 0) return baseParams;
        const firstName = (t.name || '').split(' ')[0] || baseParams[0];
        return [firstName, ...baseParams.slice(1)];
      };
      waResult = await dispatchWhatsApp(
        targets,
        { template: body.whatsapp.template, language: body.whatsapp.language, params: baseParams },
        paramResolver,
      );
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

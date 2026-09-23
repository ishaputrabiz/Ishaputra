/**
 * WhatsApp send service (Vercel serverless)
 * Provider: Meta WhatsApp Cloud API (free tier available)
 *
 * Required env vars:
 *   WHATSAPP_TOKEN          — Permanent or system-user access token
 *   WHATSAPP_PHONE_ID       — Phone number ID from Meta dashboard
 *   ADMIN_NOTIFICATION_KEY  — Shared secret (same as push notifications)
 *
 * POST body:
 *   { to: '+91...', kind: 'text'|'template'|'otp', text?, template?, params?, otp? }
 *
 * For OTP, this function ALSO writes a hashed OTP record to Firestore
 * via admin SDK so /api/whatsapp-verify-otp can validate it.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { createHash, randomInt } from 'crypto';

const META_BASE = 'https://graph.facebook.com/v21.0';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 not set');
  const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return admin.initializeApp({ credential: admin.credential.cert(svc) });
}

function hashOtp(otp: string, salt: string) {
  return createHash('sha256').update(`${salt}:${otp}`).digest('hex');
}

async function sendToMeta(payload: Record<string, unknown>) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    throw new Error('WHATSAPP_TOKEN or WHATSAPP_PHONE_ID env not configured');
  }
  const url = `${META_BASE}/${phoneId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // Include full error for debugging (#132018 and similar)
    const errBody = (data as any)?.error || data;
    const msg = errBody?.message || `HTTP ${resp.status}`;
    const err = new Error(`Meta API error: ${msg}`);
    (err as any).metaError = errBody;
    throw err;
  }
  return data;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Auth:
  //  • OTP  — always public (customer needs to receive it before being authenticated).
  //  • Order notification templates — public, but only the 4 fixed approved template names
  //    are accepted. Any other template name still requires admin-key.
  //  • text / all other templates — must carry x-admin-key.
  const ORDER_TEMPLATES = new Set([
    // customer
    'order_confirmed',          // was order_placed (recreated with button)
    'order_out_for_delivery',
    'order_delivered',
    'order_cancelled',
    'order_refunded',
    'order_return_update',
    'order_timeslot',
    // admin
    'admin_order_alert',        // was admin_new_order (recreated with button)
    'admin_low_stock_alert',
    'admin_order_delivered',
    'admin_return_requested',
    'admin_return_picked',
    'admin_returned',
    // delivery partner
    'delivery_new_task',        // was delivery_assigned (recreated with button)
    // video calls
    'video_call_inapp',
    'video_call_meet',
  ]);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const kind = body.kind as 'text' | 'template' | 'otp' | undefined;
  const adminKey = req.headers['x-admin-key'] as string | undefined;
  const expected = process.env.ADMIN_NOTIFICATION_KEY;
  const isOrderTemplate =
    kind === 'template' && ORDER_TEMPLATES.has(String(body.template || ''));
  if (kind !== 'otp' && !isOrderTemplate && expected && adminKey !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const to = String(body.to || '').replace(/[^+\d]/g, '');
  if (!to) return res.status(400).json({ ok: false, error: 'Missing recipient "to"' });

  try {
    if (kind === 'text') {
      const text = String(body.text || '').slice(0, 1000);
      if (!text) return res.status(400).json({ ok: false, error: 'Missing text' });
      const data = await sendToMeta({ to, type: 'text', text: { body: text } });
      return res.status(200).json({ ok: true, messageId: (data as any)?.messages?.[0]?.id });
    }

    if (kind === 'template') {
      const name = String(body.template || '');
      const lang = String(body.language || 'en_US');
      const params: string[] = Array.isArray(body.params) ? body.params : [];
      // urlSuffix: appended to the template's Dynamic button base URL (e.g. orderId)
      const urlSuffix: string | undefined = body.urlSuffix ? String(body.urlSuffix) : undefined;
      if (!name) return res.status(400).json({ ok: false, error: 'Missing template name' });
      const components: Record<string, unknown>[] = [];
      if (params.length) {
        components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) });
      }
      // If a URL suffix is provided, attach it as button index 0 (Dynamic URL type in Meta)
      if (urlSuffix) {
        components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlSuffix }] });
      }
      const data = await sendToMeta({
        to,
        type: 'template',
        template: { name, language: { code: lang }, components },
      });
      return res.status(200).json({ ok: true, messageId: (data as any)?.messages?.[0]?.id });
    }

    if (kind === 'otp') {
      // Generate 6-digit OTP, write hashed record, send via WhatsApp template
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const app = initAdmin();
      const db = admin.firestore(app);
      const salt = createHash('sha256').update(to + Date.now()).digest('hex').slice(0, 16);
      const docId = `${to}_${Date.now()}`;
      await db.collection('whatsappOtps').doc(docId).set({
        to,
        hash: hashOtp(otp, salt),
        salt,
        attempts: 0,
        verified: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      });

      // Try template "otp_login" first; fall back to plain text if not approved
      const templateName = process.env.WHATSAPP_OTP_TEMPLATE || 'otp_login';
      // otp_login template is registered as "English" in Meta = lang code 'en'.
      // hello_world uses "English (US)" = 'en_US'. Override via WHATSAPP_OTP_LANG env var.
      const templateLang = process.env.WHATSAPP_OTP_LANG || 'en';
      let deliveryMode: 'template' | 'text' = 'template';
      let templateError: string | null = null;
      let metaErrorDetails: unknown = null;
      try {
        // Authentication template: body has {{1}} = OTP.
        // Meta confirmed button 0 is URL type — use sub_type: 'url' with text param.
        await sendToMeta({
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: otp }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
            ], 
          },
        });
      } catch (templateErr: any) {
        templateError = templateErr?.message || String(templateErr);
        metaErrorDetails = templateErr?.metaError;
        console.error('[whatsapp-send] template error:', { template: templateName, lang: templateLang, to, error: templateError, meta: metaErrorDetails });
        try {
          await sendToMeta({
            to,
            type: 'text',
            text: { body: `Your Sreerasthu Silvers verification code is ${otp}. Valid for 10 minutes.` },
          });
          deliveryMode = 'text';
        } catch (textErr: any) {
          const textErrorMsg = textErr?.message || String(textErr);
          console.error('[whatsapp-send] text fallback error:', { to, error: textErrorMsg });
          // Both attempts failed — surface a clear, actionable message
          return res.status(502).json({
            ok: false,
            error: `Could not deliver WhatsApp OTP. ${textErrorMsg}`,
            templateError,
            hint: 'Verify WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, and that template "' + templateName + '" (' + templateLang + ') is approved in Meta dashboard. Also ensure the recipient has opted in to your WhatsApp Business number within the last 24 hours.',
          });
        }
      }
      return res.status(200).json({ ok: true, otpRef: docId, mode: deliveryMode, templateError: templateError || undefined, metaErrorDetails: metaErrorDetails || undefined, _debug: { templateName, templateLang } });
    }

    return res.status(400).json({ ok: false, error: 'Unknown kind' });
  } catch (err: any) {
    console.error('[whatsapp-send] error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
}

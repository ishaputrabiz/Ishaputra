/**
 * WhatsApp OTP verification endpoint.
 * POST { otpRef, otp } -> { ok, verified }
 * On verify success the document is marked verified=true; caller may use
 * this as proof to mint a Firebase custom token in a separate flow.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { createHash } from 'crypto';

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 not set');
  const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return admin.initializeApp({ credential: admin.credential.cert(svc) });
}

const hashOtp = (otp: string, salt: string) =>
  createHash('sha256').update(`${salt}:${otp}`).digest('hex');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { otpRef?: string; otp?: string };
  const otpRef = String(body.otpRef || '');
  const otp = String(body.otp || '').trim();
  if (!otpRef || !/^\d{4,8}$/.test(otp)) {
    return res.status(400).json({ ok: false, error: 'Invalid input' });
  }

  try {
    const app = initAdmin();
    const db = admin.firestore(app);
    const ref = db.collection('whatsappOtps').doc(otpRef);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: 'OTP not found' });
    const data = snap.data() as any;

    if (data.verified) return res.status(409).json({ ok: false, error: 'Already used' });
    if (data.attempts >= 5) return res.status(429).json({ ok: false, error: 'Too many attempts' });
    const expiresAt: admin.firestore.Timestamp = data.expiresAt;
    if (expiresAt.toMillis() < Date.now()) {
      return res.status(410).json({ ok: false, error: 'Code expired' });
    }

    const expected = hashOtp(otp, data.salt);
    if (expected !== data.hash) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(400).json({ ok: false, error: 'Incorrect code' });
    }

    await ref.update({ verified: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ ok: true, verified: true, to: data.to });
  } catch (err: any) {
    console.error('[whatsapp-verify-otp] error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
}

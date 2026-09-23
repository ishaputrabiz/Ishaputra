import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';

// Model fallback chain. The free-tier daily quota is PER PROJECT *and PER MODEL*,
// so when one model is exhausted the next still has its own fresh budget. Quality
// order: best first. Override with GEMINI_MODELS="a,b,c" if needed.
const DEFAULT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
];

// GEMINI_API_KEY (and/or GEMINI_API_KEYS) may hold MULTIPLE keys separated by
// commas/whitespace/newlines. Free-tier quota is per Google project, so keys
// from different projects multiply the daily budget. We rotate across them.
function parseKeys(): string[] {
  const raw = `${process.env.GEMINI_API_KEY || ''},${process.env.GEMINI_API_KEYS || ''}`;
  return [...new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

function parseModels(): string[] {
  const models = (process.env.GEMINI_MODELS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return models.length ? models : DEFAULT_MODELS;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Quota / rate-limit (429) errors mean "try a different key or model".
function isQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('rate limit')
  );
}

// Increase body size limit to 20MB to handle base64-encoded product images
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function initAdmin() {
  if (admin.apps.length) return;

  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  }

  let serviceAccount: admin.ServiceAccount;
  try {
    serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error('FIREBASE_ADMIN_SDK_BASE64 is not valid base64-encoded JSON');
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function requireAdminUser(req: VercelRequest) {
  initAdmin();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    throw new Error('Missing Authorization bearer token');
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
  const role = userDoc.data()?.role;

  if (role !== 'admin') {
    throw new Error('Only admins can generate Gemini prompts');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await requireAdminUser(req);
  } catch (error: any) {
    return res.status(401).json({ error: error.message || 'Unauthorized' });
  }

  const keys = parseKeys();
  if (keys.length === 0) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }
  const models = parseModels();

  const body = (req.body || {}) as {
    contents?: unknown;
    generationConfig?: Record<string, unknown>;
  };

  if (!body.contents) {
    return res.status(400).json({ error: 'contents is required' });
  }

  // Diversity defaults. The prompt-writing model converged to near-identical
  // output before, which is why generations felt repetitive. The creative
  // endpoints (product / model / variation) override this with a higher
  // temperature + concept rotation; faithful tasks like refine keep ~1.0.
  const config: Record<string, unknown> = {
    temperature: 1.0,
    topP: 0.95,
    ...(body.generationConfig || {}),
  };

  // Try each model (best first) across every key (shuffled to spread load). A
  // 429/quota error just advances to the next key, then the next model, so a
  // single exhausted free-tier key/model never blocks the request.
  let lastError = 'Unknown Gemini error';
  let sawQuota = false;

  for (const model of models) {
    for (const key of shuffle(keys)) {
      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const response = await ai.models.generateContent({
          model,
          contents: body.contents as never,
          config: config as never,
        });

        if (response.text) {
          return res.status(200).json({ ok: true, text: response.text, model });
        }
        lastError = `${model} returned no text`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown Gemini error';
        if (isQuotaError(error)) sawQuota = true;
        // Move on to the next key / model regardless of error type.
      }
    }
  }

  if (sawQuota) {
    return res.status(429).json({
      error: 'Gemini free-tier quota exhausted on all keys/models right now.',
      detail:
        'Every configured API key and model hit the daily free-tier limit. Add more keys to GEMINI_API_KEY (comma-separated, ideally from different Google projects) or wait for the quota to reset.',
    });
  }

  return res.status(500).json({ error: 'Gemini request failed', detail: lastError });
}
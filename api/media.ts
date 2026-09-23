import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import { AwsClient } from 'aws4fetch';
import { randomBytes } from 'node:crypto';

/**
 * /api/media - the only door into object storage (Cloudflare R2 today).
 *
 *   GET  /api/media                      -> usage vs free tier (admin)
 *   GET  /api/media?og=product&id=<id>   -> link-preview HTML for WhatsApp etc. (public)
 *   POST /api/media { action: 'upload' } -> store one file (+ optional preview / og image)
 *   POST /api/media { action: 'delete' } -> remove files by public URL
 *   POST /api/media { action: 'publish-catalog' }            -> rebuild catalog snapshot (admin)
 *   POST /api/media { action: 'publish-catalog', productIds } -> refresh those products (signed in)
 *
 * Why one function: the Vercel Hobby plan caps a deployment at 12 serverless
 * functions and this project already had 11. The catalog snapshot and the link
 * previews live here for the same reason - both are files in object storage.
 *
 * Catalog snapshot: the storefront reads the product list from
 * `catalog/products.json` (served same-origin at /catalog/products.json via a
 * vercel.json rewrite) instead of querying Firestore. On the Spark plan the
 * Firestore free tier is 50k document reads a day and the catalog alone is ~600
 * documents, so reading it per visitor capped the site at a few dozen visitors a
 * day. Product writes (admin edits, order stock changes, review counts) ask this
 * endpoint to refresh just those products, so a normal edit costs one read.
 *
 * Why uploads go through here instead of straight from the browser: the R2
 * secret must never reach the client, and this is where the free-tier guard
 * lives. Every write checks live usage first and refuses once any limit is at
 * BLOCK_AT, so the account never silently rolls into paid usage.
 *
 * Portability: objects are stored under plain, provider-neutral keys
 * (`products/2026/09/m<hex>.jpg`) and Firestore only ever holds
 * `${R2_PUBLIC_URL}/${key}`. Moving to S3 or anything else is: copy the bucket
 * with the same keys, point R2_* env vars at the new store, and run
 * scripts/rewrite-media-urls.mjs to swap the URL prefix. See MEDIA_STORAGE.md.
 *
 * Env (server only):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_URL               public read base, no trailing slash
 *   R2_BILLING_CYCLE_DAY        day of month the Cloudflare period starts (default 1)
 *   CLOUDFLARE_ANALYTICS_TOKEN  API token with Account Analytics: Read, plus Cache
 *                               Purge for the zone (optional; without Analytics:Read,
 *                               Class B reads cannot be measured; without Cache Purge,
 *                               a deleted photo can keep serving from Cloudflare's edge
 *                               cache for up to a year - see purgeCache() below)
 *   CLOUDFLARE_ZONE_ID          the zone owning R2_PUBLIC_URL's domain (needed for
 *                               Cache Purge above; found on the domain's Overview page)
 */

// Free tier, per Cloudflare account, per billing month. Storage uses decimal GB
// on purpose: it is the smaller reading of "10 GB", so we stop early, not late.
const FREE_TIER = {
  storageBytes: 10 * 1000 ** 3,
  classA: 1_000_000,
  classB: 10_000_000,
};
const WARN_AT = 0.8;
/** Analytics lag by a few minutes; the 5% margin absorbs that. */
const BLOCK_AT = 0.95;

const MAX_IMAGE_BYTES = 500 * 1024;
/** Hero banners only - see CATEGORIES below. */
const MAX_BANNER_BYTES = 1024 * 1024;
const MAX_PREVIEW_BYTES = 200 * 1024;
const MAX_PDF_BYTES = 1024 * 1024;
const PREVIEW_SUFFIX = '__w600.webp';
/**
 * JPEG copy used as the og:image in link previews. WhatsApp silently drops
 * preview images much above ~300 KB and does not reliably accept WebP, so the
 * WebP card preview can't double as it and the full photo is often too large.
 */
const OG_SUFFIX = '__og.jpg';
const MAX_OG_BYTES = 280 * 1024;
const MAX_DELETE_BATCH = 25;

const CATALOG_KEY = 'catalog/products.json';
/** Browsers and the CDN may reuse the snapshot for this long after a product change. */
const CATALOG_CACHE_CONTROL = 'public, max-age=60';
const MAX_REFRESH_IDS = 25;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Category =
  | 'products' | 'banners' | 'home' | 'gallery' | 'showcases' | 'testimonials'
  | 'media' | 'receipts' | 'avatars' | 'reviews';

/**
 * `perUser` categories are open to any signed-in user and keyed by their uid.
 * `maxImageBytes` overrides the 500 KB default: hero banners are a handful of
 * full-width images that carry the shop front, so they are allowed 1 MB.
 */
const CATEGORIES: Record<Category, { perUser: boolean; allowPdf: boolean; maxImageBytes?: number }> = {
  products: { perUser: false, allowPdf: false },
  banners: { perUser: false, allowPdf: false, maxImageBytes: MAX_BANNER_BYTES },
  home: { perUser: false, allowPdf: false },
  gallery: { perUser: false, allowPdf: false },
  showcases: { perUser: false, allowPdf: false },
  testimonials: { perUser: false, allowPdf: false },
  media: { perUser: false, allowPdf: false },
  receipts: { perUser: false, allowPdf: true },
  avatars: { perUser: true, allowPdf: false },
  reviews: { perUser: true, allowPdf: false },
};

/** Matches only keys this endpoint generated - nothing else can be deleted. */
const MANAGED_KEY = /^[a-z]+\/(?:[A-Za-z0-9_-]{1,128}\/)?\d{4}\/\d{2}\/m[0-9a-f]{24}\.(jpg|png|webp|pdf)$/;

// ── Plumbing ────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: object) {
    super(message);
  }
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new HttpError(503, 'NOT_CONFIGURED', 'Media storage is not configured on the server (R2_* env vars).');
  }
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
    bucketUrl: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    bucket: R2_BUCKET,
    accountId: R2_ACCOUNT_ID,
  };
}

function publicBase(): string {
  const base = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    throw new HttpError(
      503,
      'NOT_CONFIGURED',
      'Public access for the storage bucket is not set up yet (R2_PUBLIC_URL is empty).',
    );
  }
  return base;
}

function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

// ── Auth ────────────────────────────────────────────────────────────────────

interface Caller {
  uid: string;
  isAdmin: boolean;
}

function initAdmin() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (b64) {
    const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  } else {
    // verifyIdToken only needs the project id - it checks Google's public keys.
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID });
  }
}

/**
 * The role is read through the Firestore REST API *as the caller* rather than
 * with the Admin SDK: a user may always read their own users/{uid} doc, and
 * this keeps working on the Spark plan where server-side Admin SDK Firestore
 * reads have hit RESOURCE_EXHAUSTED (see api/create-order.ts).
 */
async function authenticate(req: VercelRequest): Promise<Caller> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'AUTH', 'Please sign in to upload files.');

  initAdmin();
  let uid: string;
  try {
    uid = (await admin.auth().verifyIdToken(token)).uid;
  } catch {
    throw new HttpError(401, 'AUTH', 'Your session has expired. Please sign in again.');
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const resp = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  let role: string | undefined;
  if (resp.ok) {
    const json = (await resp.json()) as { fields?: { role?: { stringValue?: string } } };
    role = json.fields?.role?.stringValue;
  } else if (resp.status !== 404) {
    throw new HttpError(502, 'SERVER', `Could not verify your account (HTTP ${resp.status}).`);
  }
  return { uid, isAdmin: role === 'admin' };
}

// ── Usage vs free tier ──────────────────────────────────────────────────────

interface Usage {
  periodStart: string;
  periodEnd: string;
  storageBytes: number;
  objectCount: number;
  classA: number;
  /** null when no analytics token is configured - reads can't be counted then. */
  classB: number | null;
  source: 'analytics' | 'estimate';
  fetchedAt: string;
  limits: typeof FREE_TIER;
  thresholds: { warn: number; block: number };
  percent: { storage: number; classA: number; classB: number | null };
  level: 'ok' | 'warn' | 'block';
  /** Human-readable reasons for `warn` / `block`. */
  reasons: string[];
  notes: string[];
}

const CLASS_A_ACTIONS = new Set([
  'ListBuckets', 'PutBucket', 'ListObjects', 'PutObject', 'CopyObject', 'CompleteMultipartUpload',
  'CreateMultipartUpload', 'LifecycleStorageTierTransition', 'ListMultipartUploads', 'UploadPart',
  'UploadPartCopy', 'ListParts', 'PutBucketEncryption', 'PutBucketCors', 'PutBucketLifecycleConfiguration',
]);
const CLASS_B_ACTIONS = new Set([
  'HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation',
  'GetBucketCors', 'GetBucketLifecycleConfiguration',
]);

function billingPeriod(now = new Date()) {
  const day = Math.min(28, Math.max(1, parseInt(process.env.R2_BILLING_CYCLE_DAY || '1', 10) || 1));
  const y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (now.getUTCDate() < day) m -= 1;
  const start = new Date(Date.UTC(y, m, day));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  return { start, end };
}

async function cloudflareGraphql(token: string, query: string, variables: Record<string, string>) {
  const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await resp.json()) as any;
  if (!resp.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || `Cloudflare analytics HTTP ${resp.status}`);
  }
  const account = json.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('Cloudflare analytics returned no account data');
  return account;
}

/** Latest storage sample per bucket. Looks back a day so a brand-new period still has one. */
async function storageFromAnalytics(token: string, accountId: string, now: Date) {
  const account = await cloudflareGraphql(
    token,
    `query R2Storage($account: string!, $start: Time!, $end: Time!) {
      viewer { accounts(filter: { accountTag: $account }) {
        r2StorageAdaptiveGroups(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end }, orderBy: [datetime_DESC]) {
          max { objectCount payloadSize metadataSize }
          dimensions { datetime bucketName }
        }
      } }
    }`,
    { account: accountId, start: new Date(now.getTime() - 86400000).toISOString(), end: now.toISOString() },
  );
  return account.r2StorageAdaptiveGroups || [];
}

async function opsInPeriod(token: string, accountId: string, start: Date, now: Date) {
  const account = await cloudflareGraphql(
    token,
    `query R2Ops($account: string!, $start: Time!, $end: Time!) {
      viewer { accounts(filter: { accountTag: $account }) {
        r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end }) {
          sum { requests }
          dimensions { actionType }
        }
      } }
    }`,
    { account: accountId, start: start.toISOString(), end: now.toISOString() },
  );
  let classA = 0;
  let classB = 0;
  for (const g of account.r2OperationsAdaptiveGroups || []) {
    const n = Number(g.sum?.requests) || 0;
    if (CLASS_A_ACTIONS.has(g.dimensions?.actionType)) classA += n;
    else if (CLASS_B_ACTIONS.has(g.dimensions?.actionType)) classB += n;
  }
  return { classA, classB };
}

/**
 * Without an analytics token, list the bucket. Every object was written by a
 * single PutObject through this endpoint, so objects modified this period are a
 * fair count of our Class A spend (plus the list calls themselves). Listing is
 * itself Class A - one op per 1000 objects - which is why this is cached.
 */
async function usageFromListing(start: Date) {
  const { client, bucketUrl } = r2();
  let storageBytes = 0;
  let objectCount = 0;
  let writesThisPeriod = 0;
  let listCalls = 0;
  let token: string | undefined;
  do {
    const url = `${bucketUrl}?list-type=2&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
    const resp = await client.fetch(url);
    listCalls += 1;
    if (!resp.ok) throw new Error(`R2 list failed (HTTP ${resp.status})`);
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0);
      const modified = /<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1];
      storageBytes += size;
      objectCount += 1;
      if (modified && new Date(modified) >= start) writesThisPeriod += 1;
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1]
      : undefined;
  } while (token && listCalls < 200);
  return { storageBytes, objectCount, classA: writesThisPeriod + listCalls };
}

let usageCache: { usage: Usage; expires: number } | null = null;

function finalizeUsage(u: Omit<Usage, 'percent' | 'level' | 'reasons' | 'limits' | 'thresholds'>): Usage {
  const percent = {
    storage: u.storageBytes / FREE_TIER.storageBytes,
    classA: u.classA / FREE_TIER.classA,
    classB: u.classB == null ? null : u.classB / FREE_TIER.classB,
  };
  const reasons: string[] = [];
  const check = (p: number | null, label: string) => {
    if (p == null) return 'ok';
    if (p >= BLOCK_AT) {
      reasons.push(`${label} is at ${Math.round(p * 100)}% of the free limit`);
      return 'block';
    }
    if (p >= WARN_AT) {
      reasons.push(`${label} is at ${Math.round(p * 100)}% of the free limit`);
      return 'warn';
    }
    return 'ok';
  };
  const levels = [
    check(percent.storage, 'Storage space'),
    check(percent.classA, 'Uploads (Class A operations)'),
    check(percent.classB, 'Image views (Class B operations)'),
  ];
  const level = levels.includes('block') ? 'block' : levels.includes('warn') ? 'warn' : 'ok';
  return { ...u, percent, level, reasons, limits: FREE_TIER, thresholds: { warn: WARN_AT, block: BLOCK_AT } };
}

async function getUsage(force = false): Promise<Usage> {
  if (!force && usageCache && usageCache.expires > Date.now()) return usageCache.usage;

  const now = new Date();
  const { start, end } = billingPeriod(now);
  const token = (process.env.CLOUDFLARE_ANALYTICS_TOKEN || '').trim();
  const { accountId, bucket } = r2();
  const notes: string[] = [];
  let usage: Usage;

  let analyticsError: string | null = null;
  if (token) {
    try {
      const [storageGroups, ops] = await Promise.all([
        storageFromAnalytics(token, accountId, now),
        opsInPeriod(token, accountId, start, now),
      ]);
      // Latest sample per bucket, summed: the free tier is account-wide.
      const latest = new Map<string, { objectCount: number; bytes: number }>();
      for (const g of storageGroups) {
        const name = g.dimensions?.bucketName || bucket;
        if (latest.has(name)) continue;
        latest.set(name, {
          objectCount: Number(g.max?.objectCount) || 0,
          bytes: (Number(g.max?.payloadSize) || 0) + (Number(g.max?.metadataSize) || 0),
        });
      }
      let storageBytes = 0;
      let objectCount = 0;
      latest.forEach((v) => {
        storageBytes += v.bytes;
        objectCount += v.objectCount;
      });
      notes.push('Live numbers from Cloudflare analytics (can lag a few minutes).');
      usage = finalizeUsage({
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        storageBytes,
        objectCount,
        classA: ops.classA,
        classB: ops.classB,
        source: 'analytics',
        fetchedAt: now.toISOString(),
        notes,
      });
      usageCache = { usage, expires: Date.now() + 5 * 60 * 1000 };
      return usage;
    } catch (err) {
      analyticsError = err instanceof Error ? err.message : String(err);
    }
  }

  const listed = await usageFromListing(start);
  notes.push(
    analyticsError
      ? `Cloudflare analytics failed (${analyticsError}); showing an estimate from the bucket listing.`
      : 'Estimate from the bucket listing. Add CLOUDFLARE_ANALYTICS_TOKEN to see exact operations and image views.',
  );
  usage = finalizeUsage({
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    storageBytes: listed.storageBytes,
    objectCount: listed.objectCount,
    classA: listed.classA,
    classB: null,
    source: 'estimate',
    fetchedAt: now.toISOString(),
    notes,
  });
  usageCache = { usage, expires: Date.now() + 15 * 60 * 1000 };
  return usage;
}

/** Keep the cached figures honest between refreshes. */
function recordWrite(bytes: number, objects: number) {
  if (!usageCache) return;
  const u = usageCache.usage;
  usageCache.usage = finalizeUsage({
    ...u,
    storageBytes: Math.max(0, u.storageBytes + bytes),
    objectCount: Math.max(0, u.objectCount + objects),
    classA: u.classA + Math.max(0, objects),
  });
}

/**
 * A delete doesn't report the size it freed (finding out costs a HEAD, a Class
 * B op), so drop the cache and let the next usage read re-measure.
 */
function invalidateUsage() {
  usageCache = null;
}

/** Cloudflare's purge-by-URL API accepts at most 30 URLs per call. */
const PURGE_BATCH = 30;

/**
 * Ask Cloudflare to drop cached copies of these URLs from its edge.
 *
 * Deleted objects are marked `Cache-Control: immutable, max-age=31536000`, so
 * without this, Cloudflare keeps serving a cached copy of a "deleted" photo
 * for up to a year - deleting from R2 alone is not enough. Best-effort: a
 * failure here must not fail the delete the caller already asked for and got
 * (the file really is gone from storage; only the edge cache lags).
 *
 * Needs CLOUDFLARE_ZONE_ID and a Cloudflare API token with "Cache Purge"
 * permission for the zone (the same token used for CLOUDFLARE_ANALYTICS_TOKEN
 * can hold both permissions - see MEDIA_STORAGE.md). Silently skipped if
 * either is missing, so cache purging is optional, not required to run.
 */
async function purgeCache(urls: string[]): Promise<void> {
  const zoneId = (process.env.CLOUDFLARE_ZONE_ID || '').trim();
  const token = (process.env.CLOUDFLARE_ANALYTICS_TOKEN || '').trim();
  if (!zoneId || !token || urls.length === 0) return;

  for (let i = 0; i < urls.length; i += PURGE_BATCH) {
    const batch = urls.slice(i, i + PURGE_BATCH);
    try {
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: batch }),
      });
      const json = (await resp.json()) as { success?: boolean; errors?: unknown };
      if (!resp.ok || !json.success) {
        console.warn('[media] cache purge failed (file stays cached until it expires):', JSON.stringify(json.errors));
      }
    } catch (err) {
      console.warn('[media] cache purge request failed:', err);
    }
  }
}

// ── Upload ──────────────────────────────────────────────────────────────────

type Sniffed = { ext: 'jpg' | 'png' | 'webp' | 'pdf'; contentType: string };

/** Trust the bytes, not the browser's claimed MIME type. */
function sniff(buf: Buffer): Sniffed | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', contentType: 'image/png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', contentType: 'image/webp' };
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', contentType: 'application/pdf' };
  return null;
}

function decodeBase64(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw new HttpError(400, 'BAD_REQUEST', 'No file data received.');
  return Buffer.from(data.replace(/^data:[^,]*,/, ''), 'base64');
}

function kb(bytes: number) {
  return `${Math.ceil(bytes / 1024)} KB`;
}

async function putObject(key: string, body: Buffer, contentType: string, extraHeaders: Record<string, string> = {}) {
  const { client, bucketUrl } = r2();
  const resp = await client.fetch(`${bucketUrl}/${encodeKey(key)}`, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: {
      'Content-Type': contentType,
      // Keys are random and never overwritten, so they are safe to cache forever.
      // With a custom domain this lets Cloudflare's cache answer repeat views
      // without touching R2 (and without spending Class B operations).
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...extraHeaders,
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new HttpError(502, 'SERVER', `Storage rejected the upload (HTTP ${resp.status}). ${text.slice(0, 200)}`);
  }
}

async function handleUpload(req: VercelRequest, caller: Caller) {
  const body = (req.body || {}) as {
    category?: string;
    file?: { name?: string; data?: string };
    preview?: { data?: string };
    og?: { data?: string };
  };

  const category = body.category as Category;
  const rules = CATEGORIES[category];
  if (!rules) throw new HttpError(400, 'BAD_REQUEST', 'Unknown upload category.');
  if (!rules.perUser && !caller.isAdmin) throw new HttpError(403, 'FORBIDDEN', 'Only admins can upload here.');

  const base = publicBase();
  const file = decodeBase64(body.file?.data);
  const type = sniff(file);
  if (!type || (type.ext === 'pdf' && !rules.allowPdf)) {
    throw new HttpError(415, 'BAD_TYPE', rules.allowPdf ? 'Only JPG, PNG, WebP or PDF files are allowed.' : 'Only JPG, PNG or WebP images are allowed.');
  }
  const limit = type.ext === 'pdf' ? MAX_PDF_BYTES : rules.maxImageBytes ?? MAX_IMAGE_BYTES;
  if (file.length > limit) {
    throw new HttpError(413, 'TOO_LARGE', `File is ${kb(file.length)}. The limit is ${kb(limit)}.`, { bytes: file.length, limit });
  }

  let preview: Buffer | null = null;
  if (type.ext !== 'pdf' && body.preview?.data) {
    preview = decodeBase64(body.preview.data);
    const pType = sniff(preview);
    if (!pType || pType.ext === 'pdf' || preview.length > MAX_PREVIEW_BYTES) {
      preview = null; // A bad preview isn't worth failing the upload; the full image still works.
    }
  }

  let og: Buffer | null = null;
  if (type.ext !== 'pdf' && body.og?.data) {
    og = decodeBase64(body.og.data);
    if (sniff(og)?.ext !== 'jpg' || og.length > MAX_OG_BYTES) og = null; // same reasoning as the preview
  }

  const usage = await getUsage();
  if (usage.level === 'block') {
    throw new HttpError(429, 'LIMIT_REACHED', 'Uploads are paused: the free storage plan is almost used up.', { usage });
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = `m${randomBytes(12).toString('hex')}`;
  const dir = rules.perUser ? `${category}/${caller.uid}/${yyyy}/${mm}` : `${category}/${yyyy}/${mm}`;
  const key = `${dir}/${id}.${type.ext}`;

  const extra: Record<string, string> = {};
  if (type.ext === 'pdf') {
    const safeName = String(body.file?.name || 'document.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
    extra['Content-Disposition'] = `inline; filename="${safeName}"`;
  }

  await putObject(key, file, type.contentType, extra);
  let previewUrl: string | undefined;
  if (preview) {
    const previewKey = `${dir}/${id}${PREVIEW_SUFFIX}`;
    try {
      // Content-Type from the bytes: browsers without WebP encoding send JPEG.
      await putObject(previewKey, preview, sniff(preview)!.contentType);
      previewUrl = `${base}/${previewKey}`;
    } catch (err) {
      console.warn('[media] preview upload failed, original kept:', err);
      preview = null;
    }
  }
  let ogUrl: string | undefined;
  if (og) {
    const ogKey = `${dir}/${id}${OG_SUFFIX}`;
    try {
      await putObject(ogKey, og, 'image/jpeg');
      ogUrl = `${base}/${ogKey}`;
    } catch (err) {
      console.warn('[media] og image upload failed, original kept:', err);
      og = null;
    }
  }
  recordWrite(file.length + (preview?.length || 0) + (og?.length || 0), 1 + (preview ? 1 : 0) + (og ? 1 : 0));

  return {
    url: `${base}/${key}`,
    key,
    bytes: file.length,
    contentType: type.contentType,
    previewUrl,
    ogUrl,
  };
}

// ── Delete ──────────────────────────────────────────────────────────────────

async function handleDelete(req: VercelRequest, caller: Caller) {
  const urls = ((req.body || {}) as { urls?: unknown }).urls;
  if (!Array.isArray(urls) || urls.length === 0) throw new HttpError(400, 'BAD_REQUEST', 'No files to delete.');
  if (urls.length > MAX_DELETE_BATCH) throw new HttpError(400, 'BAD_REQUEST', `Delete at most ${MAX_DELETE_BATCH} files at once.`);

  const base = publicBase();
  const { client, bucketUrl } = r2();
  const deleted: string[] = [];
  const skipped: string[] = [];
  const purgeUrls: string[] = [];

  for (const raw of urls) {
    const url = String(raw || '');
    const key = url.startsWith(`${base}/`) ? decodeURIComponent(url.slice(base.length + 1)) : '';
    if (!MANAGED_KEY.test(key)) {
      skipped.push(url); // Cloudinary, external links, or someone else's bucket - not ours to remove.
      continue;
    }
    const [category, owner] = key.split('/');
    const ownsIt = CATEGORIES[category as Category]?.perUser && owner === caller.uid;
    if (!caller.isAdmin && !ownsIt) throw new HttpError(403, 'FORBIDDEN', 'You can only delete your own files.');

    const keys = [key];
    if (!key.endsWith('.pdf')) {
      keys.push(key.replace(/\.(jpg|png|webp)$/, PREVIEW_SUFFIX), key.replace(/\.(jpg|png|webp)$/, OG_SUFFIX));
    }
    // DeleteObject is a free operation on R2. A 404 is fine - it's already gone.
    for (const k of keys) {
      const resp = await client.fetch(`${bucketUrl}/${encodeKey(k)}`, { method: 'DELETE' });
      if (!resp.ok && resp.status !== 404) {
        throw new HttpError(502, 'SERVER', `Storage refused to delete a file (HTTP ${resp.status}).`);
      }
      purgeUrls.push(`${base}/${k}`);
    }
    deleted.push(url);
  }
  if (deleted.length) invalidateUsage();
  await purgeCache(purgeUrls);
  return { deleted, skipped };
}

// ── Catalog snapshot ────────────────────────────────────────────────────────

type CatalogProduct = Record<string, unknown> & { id: string };
interface CatalogFile {
  version: 1;
  generatedAt: string;
  count: number;
  products: CatalogProduct[];
}

/**
 * Firestore values that JSON can't carry are flattened. Timestamps become
 * `{ __ts, seconds, nanoseconds }`, which src/services/productCache.ts turns
 * back into real Timestamps so storefront code calling `.toDate()` still works.
 */
function toJsonSafe(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return { __ts: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (value instanceof admin.firestore.GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

const isListed = (doc: admin.firestore.DocumentSnapshot) => doc.exists && doc.get('flags.isActive') === true;
const catalogEntry = (doc: admin.firestore.DocumentSnapshot): CatalogProduct => ({
  id: doc.id,
  ...(toJsonSafe(doc.data()) as Record<string, unknown>),
});
const createdSeconds = (p: CatalogProduct) => Number((p.createdAt as { seconds?: number } | undefined)?.seconds ?? 0);

/** Newest first - the order the storefront has always shown. */
function serializeCatalog(products: CatalogProduct[]): Buffer {
  products.sort((a, b) => createdSeconds(b) - createdSeconds(a));
  const file: CatalogFile = { version: 1, generatedAt: new Date().toISOString(), count: products.length, products };
  return Buffer.from(JSON.stringify(file));
}

/**
 * Strip the weak-validator prefix from an ETag.
 *
 * R2 hands back `W/"abc..."` for this object, and a weak validator is not
 * allowed in `If-Match` (RFC 9110 §13.1.1) - R2 answers such a request with
 * 412 every single time, whether or not the object actually changed.
 *
 * Passing that value straight back meant `writeCatalog` always returned false,
 * the retry loop burned all five attempts, and `publish-catalog` ended in a 409
 * that catalogPublisher only logged. The net effect: no product edit ever
 * reached the storefront snapshot. The listing pages kept serving whatever the
 * last full rebuild produced, while product and checkout pages - which read
 * Firestore directly - showed the new price. That is exactly the "price is old
 * in the grid but correct inside the product" report.
 */
const strongETag = (value: string | null): string => {
  const tag = (value || '').trim();
  return tag.startsWith('W/') ? tag.slice(2) : tag;
};

async function readCatalog(): Promise<{ file: CatalogFile; etag: string } | null> {
  const { client, bucketUrl } = r2();
  const resp = await client.fetch(`${bucketUrl}/${encodeKey(CATALOG_KEY)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new HttpError(502, 'SERVER', `Could not read the catalog snapshot (HTTP ${resp.status}).`);
  return { file: (await resp.json()) as CatalogFile, etag: strongETag(resp.headers.get('etag')) };
}

/** Returns false when `ifMatch` no longer matches, i.e. someone else saved first. */
async function writeCatalog(body: Buffer, ifMatch?: string): Promise<boolean> {
  const { client, bucketUrl } = r2();
  const resp = await client.fetch(`${bucketUrl}/${encodeKey(CATALOG_KEY)}`, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CATALOG_CACHE_CONTROL,
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
  });
  if (resp.status === 412) return false;
  if (!resp.ok) throw new HttpError(502, 'SERVER', `Could not save the catalog snapshot (HTTP ${resp.status}).`);

  // Drop the edge copy so a price change is visible now rather than whenever
  // the 60-second CDN cache happens to expire. Best-effort: without a Cache
  // Purge token the snapshot simply ages out on its own, as before.
  const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (publicBase) await purgeCache([`${publicBase}/${CATALOG_KEY}`]);

  await stampCatalogVersion(body);
  return true;
}

/**
 * Tell open browsers a new snapshot exists.
 *
 * Every storefront listing shares one Firestore listener on this document (see
 * `watchCatalogVersion` in src/services/productCache.ts), so stamping it makes
 * an admin price change appear on pages that are already open. Without it a
 * shopper sitting on a category page keeps the prices they loaded with, however
 * fresh the snapshot itself is.
 *
 * One tiny document rather than a listener on `products`: the same liveness for
 * one read per visitor instead of ~600.
 *
 * Best-effort - the snapshot is already saved, and failing to stamp only costs
 * liveness, so it must never turn a successful publish into an error.
 */
async function stampCatalogVersion(body: Buffer): Promise<void> {
  try {
    const { generatedAt } = JSON.parse(body.toString('utf8')) as { generatedAt?: string };
    if (!generatedAt) return;
    initAdmin();
    await admin
      .firestore()
      .collection('siteSettings')
      .doc('catalogVersion')
      .set({ generatedAt, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('[media] could not stamp catalogVersion; open pages refresh on their own TTL:', err);
  }
}

/** Full rebuild: one read per active product (~600). Admin only. */
async function rebuildCatalog() {
  initAdmin();
  const snap = await admin.firestore().collection('products').where('flags.isActive', '==', true).get();
  const body = serializeCatalog(snap.docs.map(catalogEntry));
  await writeCatalog(body);
  return { mode: 'rebuilt', count: snap.size, bytes: body.length };
}

/**
 * Refresh named products in the snapshot: one read each, never the whole
 * collection. Any signed-in user may ask (an order changes stock, a review
 * changes the rating), because the server re-reads the truth from Firestore -
 * the caller only names products, it can't supply their contents.
 */
async function handlePublishCatalog(req: VercelRequest, caller: Caller) {
  const raw = ((req.body || {}) as { productIds?: unknown }).productIds;
  if (raw === undefined) {
    if (!caller.isAdmin) throw new HttpError(403, 'FORBIDDEN', 'Only admins can rebuild the whole catalog.');
    return rebuildCatalog();
  }
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > MAX_REFRESH_IDS ||
    !raw.every((id) => typeof id === 'string' && PRODUCT_ID.test(id))
  ) {
    throw new HttpError(400, 'BAD_REQUEST', `Send between 1 and ${MAX_REFRESH_IDS} product ids.`);
  }

  const ids = [...new Set(raw as string[])];
  initAdmin();
  const db = admin.firestore();
  const docs = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));

  // Read-modify-write guarded by the ETag, so two refreshes at once can't drop each other's change.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readCatalog();
    if (!current) {
      // No snapshot yet. Creating one costs a full read, which only an admin may trigger.
      if (caller.isAdmin) return rebuildCatalog();
      return { mode: 'skipped', reason: 'no-catalog' };
    }
    const byId = new Map(current.file.products.map((p) => [String(p.id), p]));
    for (const doc of docs) {
      if (isListed(doc)) byId.set(doc.id, catalogEntry(doc));
      else byId.delete(doc.id);
    }
    if (await writeCatalog(serializeCatalog([...byId.values()]), current.etag)) {
      return { mode: 'refreshed', refreshed: ids.length, count: byId.size };
    }
  }
  throw new HttpError(409, 'CONFLICT', 'The catalog kept changing while saving. Please try again.');
}

// ── Link previews ───────────────────────────────────────────────────────────

/**
 * WhatsApp, Facebook, Telegram etc. build a link preview from the raw HTML of a
 * URL and never run JavaScript, so the SPA's product page shows them only the
 * generic index.html tags. vercel.json sends those crawlers' requests for
 * /product/:id here instead; people still get the normal app.
 */
interface PreviewProduct {
  name?: string;
  description?: string;
  price?: number;
  media?: { thumbnail?: string; images?: string[] };
}

const MANAGED_IMAGE = /^(https?:\/\/[^?#]+\/m[0-9a-f]{24})\.(jpg|png|webp)$/;
const PREVIEW_LOOKUP_TIMEOUT_MS = 2500;

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

export function productPreviewHtml(product: PreviewProduct | null, pageUrl: string, image: string | null): string {
  const name = product?.name?.trim();
  const title = name ? `${name} | Sreerasthu Silvers` : 'Sreerasthu Silvers | 92.5 Pure Silver Jewellery';
  const price = typeof product?.price === 'number' ? `₹${product.price.toLocaleString('en-IN')}` : '';
  const about = String(product?.description || '').replace(/\s+/g, ' ').trim();
  let description = [price, about].filter(Boolean).join(' · ');
  if (description.length > 200) description = `${description.slice(0, 197).trimEnd()}...`;
  if (!description) description = 'Handcrafted 92.5 pure silver jewellery, gifts and pooja articles.';
  const imageType = image?.endsWith('.png') ? 'image/png' : image?.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(pageUrl);
  const i = image ? escapeHtml(image) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="Sreerasthu Silvers">
<meta property="og:type" content="product">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
${image ? `<meta property="og:image" content="${i}">
<meta property="og:image:secure_url" content="${i}">
<meta property="og:image:type" content="${imageType}">
<meta property="og:image:alt" content="${t}">
` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${image ? `<meta name="twitter:image" content="${i}">\n` : ''}</head>
<body>
<p><a href="${u}">${t}</a></p>
<script>location.replace(${JSON.stringify(pageUrl).replace(/</g, '\\u003c')})</script>
</body>
</html>`;
}

/** The small JPEG made for previews, falling back to the product photo itself. */
async function previewImage(product: PreviewProduct | null): Promise<string | null> {
  const src = product?.media?.thumbnail || product?.media?.images?.[0];
  if (!src) return null;
  const managed = MANAGED_IMAGE.exec(src);
  if (!managed) return src;
  const og = `${managed[1]}${OG_SUFFIX}`;
  try {
    if ((await fetch(og, { method: 'HEAD' })).ok) return og;
  } catch {
    // fall through to the original photo
  }
  return src;
}

async function handleProductPreview(req: VercelRequest, res: VercelResponse) {
  const params = new URL(req.url || '/', 'http://localhost').searchParams;
  const id = params.get('id') || '';
  const header = (name: string) => String(req.headers[name] || '').split(',')[0].trim();
  const host = header('x-forwarded-host') || header('host');
  const proto = header('x-forwarded-proto') || 'https';
  const pageUrl = `${host ? `${proto}://${host}` : ''}/product/${encodeURIComponent(id)}`;

  let product: PreviewProduct | null = null;
  if (PRODUCT_ID.test(id)) {
    try {
      product = ((await readCatalog())?.file.products.find((p) => p.id === id) as PreviewProduct | undefined) ?? null;
    } catch (err) {
      console.warn('[media] preview: catalog unavailable:', err);
    }
    if (!product) {
      // Not in the snapshot yet (brand new, or no snapshot published): one read.
      // Bounded: link-preview crawlers give up after a few seconds, and the SDK
      // retries a quota error for ~10s. A generic preview beats no preview.
      try {
        initAdmin();
        const doc = await Promise.race([
          admin.firestore().collection('products').doc(id).get(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`no answer in ${PREVIEW_LOOKUP_TIMEOUT_MS}ms`)), PREVIEW_LOOKUP_TIMEOUT_MS),
          ),
        ]);
        if (isListed(doc)) product = doc.data() as PreviewProduct;
      } catch (err) {
        console.warn('[media] preview: product lookup failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  const html = productPreviewHtml(product, pageUrl, await previewImage(product));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Let Vercel's edge answer repeat crawls; a miss is cached briefly so a new product shows up soon.
  res.setHeader(
    'Cache-Control',
    product ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400' : 'public, max-age=0, s-maxage=60',
  );
  res.statusCode = 200;
  res.end(html);
}

// ── Entry ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Public, before authentication: crawlers building link previews never sign in.
    if (req.method === 'GET' && /[?&]og=product(&|$)/.test(req.url || '')) {
      return await handleProductPreview(req, res);
    }

    const caller = await authenticate(req);

    if (req.method === 'GET') {
      if (!caller.isAdmin) throw new HttpError(403, 'FORBIDDEN', 'Only admins can view storage usage.');
      const force = /[?&]refresh=1\b/.test(req.url || '');
      const usage = await getUsage(force);
      return res.status(200).json({ ok: true, usage, publicUrlConfigured: /^https?:\/\//.test(process.env.R2_PUBLIC_URL || '') });
    }

    if (req.method === 'POST') {
      const action = ((req.body || {}) as { action?: string }).action;
      if (action === 'upload') return res.status(200).json({ ok: true, ...(await handleUpload(req, caller)) });
      if (action === 'delete') return res.status(200).json({ ok: true, ...(await handleDelete(req, caller)) });
      if (action === 'publish-catalog') {
        return res.status(200).json({ ok: true, ...(await handlePublishCatalog(req, caller)) });
      }
      throw new HttpError(400, 'BAD_REQUEST', 'Unknown action.');
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ ok: false, code: err.code, error: err.message, ...(err.extra || {}) });
    }
    console.error('[media] unexpected error:', err);
    return res.status(500).json({ ok: false, code: 'SERVER', error: err instanceof Error ? err.message : 'Unexpected server error' });
  }
}

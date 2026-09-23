/**
 * Rebuild the storefront catalog snapshot (catalog/products.json) from Firestore.
 *
 * The storefront reads its product list from this file instead of querying
 * Firestore (see src/services/productCache.ts). Normal product changes keep it
 * current by themselves - admin edits, orders and reviews each refresh the
 * products they touch through api/media.ts. Run this after anything that
 * writes products outside the app: bulk scripts, Firebase console edits, or to
 * create the snapshot the first time.
 *
 *   node scripts/publish-catalog.mjs             # rebuild and upload
 *   node scripts/publish-catalog.mjs --dry-run   # build and report, upload nothing
 *
 * Cost: one Firestore read per active product (~600). The file format must stay
 * identical to serializeCatalog() in api/media.ts.
 */
import 'dotenv/config';
import admin from 'firebase-admin';
import { AwsClient } from 'aws4fetch';

const DRY = process.argv.includes('--dry-run');
const KEY = 'catalog/products.json';

const { FIREBASE_ADMIN_SDK_BASE64, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
for (const [k, v] of Object.entries({ FIREBASE_ADMIN_SDK_BASE64, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL })) {
  if (!v) {
    console.error(`${k} missing from .env`);
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(Buffer.from(FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'))),
});
const db = admin.firestore();

/** Same flattening as api/media.ts toJsonSafe(). */
function toJsonSafe(value) {
  if (value instanceof admin.firestore.Timestamp) {
    return { __ts: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (value instanceof admin.firestore.GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}

const snap = await db.collection('products').where('flags.isActive', '==', true).get();
const products = snap.docs.map((d) => ({ id: d.id, ...toJsonSafe(d.data()) }));
products.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
const generatedAt = new Date().toISOString();
const body = JSON.stringify({ version: 1, generatedAt, count: products.length, products });

console.log(`active products : ${products.length}`);
console.log(`snapshot size   : ${(body.length / 1024).toFixed(0)} KB`);
if (DRY) {
  console.log('dry run - nothing uploaded');
  process.exit(0);
}

const aws = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
const put = await aws.fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${KEY}`, {
  method: 'PUT',
  body,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
});
if (!put.ok) {
  console.error(`upload failed: HTTP ${put.status} ${(await put.text()).slice(0, 300)}`);
  process.exit(1);
}

// Tell open browsers a new snapshot exists. Storefront pages share one
// listener on this document, so a bulk rebuild reaches them straight away
// instead of waiting for each visitor's cache to expire. Mirrors
// stampCatalogVersion() in api/media.ts.
try {
  await db.collection('siteSettings').doc('catalogVersion').set(
    { generatedAt, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  console.log('version stamped : catalogVersion ->', generatedAt);
} catch (err) {
  console.warn('version stamp failed (pages refresh on their own TTL):', err?.message || err);
}

// Read it back through the public domain the site proxies to.
const check = await fetch(`${R2_PUBLIC_URL.replace(/\/+$/, '')}/${KEY}`, { cache: 'no-store' });
const parsed = check.ok ? await check.json() : null;
console.log(`published       : ${check.status} ${parsed ? `${parsed.count} products, generated ${parsed.generatedAt}` : ''}`);
process.exit(parsed ? 0 : 1);

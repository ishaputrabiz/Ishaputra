/**
 * Create the link-preview JPEG (`<name>__og.jpg`) for product photos uploaded
 * before uploads began making one.
 *
 * WhatsApp shows a product photo in a shared link's preview card only if the
 * og:image is small (roughly under 300 KB) and a format it accepts; see
 * OG_SUFFIX in api/media.ts, which serves these files, and createOgImage() in
 * src/services/mediaStorage.ts, which makes them for new uploads.
 *
 * Works from the bucket listing alone - no Firestore reads. Safe to re-run:
 * photos that already have one are skipped.
 *
 *   node scripts/backfill-og-images.mjs --dry-run
 *   node scripts/backfill-og-images.mjs
 *   node scripts/backfill-og-images.mjs --concurrency=8
 */
import 'dotenv/config';
import sharp from 'sharp';
import { AwsClient } from 'aws4fetch';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const DRY = process.argv.includes('--dry-run');
const CONCURRENCY = Math.max(1, Number(arg('concurrency') || 6));

const MAX_EDGE = 800;
const MAX_BYTES = 250 * 1024;
const MAIN_IMAGE = /^products\/\d{4}\/\d{2}\/m[0-9a-f]{24}\.(jpg|png|webp)$/;

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('R2_* settings missing from .env');
  process.exit(1);
}
const BUCKET_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
const PUBLIC = R2_PUBLIC_URL.replace(/\/+$/, '');
const aws = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });

async function listKeys(prefix) {
  const keys = [];
  let token = '';
  do {
    const qs = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
    if (token) qs.set('continuation-token', token);
    const resp = await aws.fetch(`${BUCKET_URL}?${qs}`);
    if (!resp.ok) throw new Error(`list failed: HTTP ${resp.status}`);
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1]);
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)</)?.[1] ?? '') : '';
  } while (token);
  return keys;
}

async function makeOg(buffer) {
  const base = sharp(buffer)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  for (const quality of [82, 70, 55]) {
    const out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  return null;
}

const keys = await listKeys('products/');
const existing = new Set(keys);
const todo = keys.filter((k) => MAIN_IMAGE.test(k) && !existing.has(k.replace(/\.(jpg|png|webp)$/, '__og.jpg')));
console.log(`photos: ${keys.filter((k) => MAIN_IMAGE.test(k)).length}   need a preview JPEG: ${todo.length}`);
if (DRY || !todo.length) process.exit(0);

let done = 0;
let failed = 0;
let bytes = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        // Through the CDN: usually a cache hit, so no R2 read is spent.
        const src = await fetch(`${PUBLIC}/${key}`);
        if (!src.ok) throw new Error(`download HTTP ${src.status}`);
        const og = await makeOg(Buffer.from(await src.arrayBuffer()));
        if (!og) throw new Error('could not get under the size limit');
        const put = await aws.fetch(`${BUCKET_URL}/${key.replace(/\.(jpg|png|webp)$/, '__og.jpg')}`, {
          method: 'PUT',
          body: og,
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
        if (!put.ok) throw new Error(`upload HTTP ${put.status}`);
        bytes += og.length;
        done++;
      } catch (err) {
        failed++;
        console.error(`FAILED ${key}: ${err.message}`);
      }
      if ((done + failed) % 100 === 0) console.log(`  ${done + failed}/${todo.length}`);
    }
  }),
);
console.log(`created ${done}, failed ${failed}, ${(bytes / 1024 / 1024).toFixed(1)} MB (avg ${done ? Math.round(bytes / done / 1024) : 0} KB)`);
process.exit(failed ? 1 : 0);

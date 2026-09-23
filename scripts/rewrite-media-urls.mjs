/**
 * Swap the media URL prefix stored in Firestore.
 *
 * Firestore stores full image URLs (`<R2_PUBLIC_URL>/<key>`). When the files
 * move - r2.dev link -> custom domain, or R2 -> AWS S3/CloudFront - the keys stay
 * the same and only the prefix changes. This walks documents and replaces every
 * string that starts with --from with --to, at any depth (arrays, maps).
 *
 * Usage:
 *   node scripts/rewrite-media-urls.mjs --from=https://pub-xxxx.r2.dev --to=https://images.example.com
 *        -> dry run: prints what would change, writes nothing
 *   node scripts/rewrite-media-urls.mjs --from=... --to=... --apply
 *        -> writes the changes
 *   --collections=products,banners   limit to these root collections (default: all)
 *   --deep                           also walk subcollections (more document reads)
 *
 * Credentials: FIREBASE_ADMIN_SDK_BASE64 in .env, or ./serviceAccount.json,
 * or GOOGLE_APPLICATION_CREDENTIALS. Safe to re-run: already-rewritten URLs no
 * longer match --from.
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const flag = (name) => process.argv.includes(`--${name}`);

const FROM = (arg('from') || '').replace(/\/+$/, '');
const TO = (arg('to') || '').replace(/\/+$/, '');
const APPLY = flag('apply');
const DEEP = flag('deep');
const ONLY = (arg('collections') || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!/^https?:\/\//.test(FROM) || !/^https?:\/\//.test(TO) || FROM === TO) {
  console.error('Pass --from=<old base URL> and --to=<new base URL> (both http(s), different).');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolve(__dirname, '..', 'serviceAccount.json');
let credential;
if (process.env.FIREBASE_ADMIN_SDK_BASE64) {
  credential = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
} else if (existsSync(saPath)) {
  credential = JSON.parse(readFileSync(saPath, 'utf8'));
} else {
  console.error('No Firebase credentials: set FIREBASE_ADMIN_SDK_BASE64 in .env or add serviceAccount.json.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(credential) });
const db = admin.firestore();

// Match the prefix followed by "/" so https://a.dev never rewrites https://a.dev.evil.com
const PREFIX = `${FROM}/`;

/** Returns [newValue, changedCount]. */
function rewrite(value) {
  if (typeof value === 'string') {
    return value.startsWith(PREFIX) ? [TO + value.slice(FROM.length), 1] : [value, 0];
  }
  if (Array.isArray(value)) {
    let n = 0;
    const out = value.map((v) => {
      const [nv, c] = rewrite(v);
      n += c;
      return nv;
    });
    return [out, n];
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let n = 0;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const [nv, c] = rewrite(v);
      out[k] = nv;
      n += c;
    }
    return [out, n];
  }
  return [value, 0]; // Timestamps, GeoPoints, refs, numbers...
}

let docsScanned = 0;
let docsChanged = 0;
let urlsChanged = 0;

async function walk(collectionRef) {
  const snap = await collectionRef.get();
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    docsScanned += 1;
    const updates = {};
    let changed = 0;
    for (const [field, value] of Object.entries(doc.data())) {
      const [nv, c] = rewrite(value);
      if (c) {
        updates[field] = nv;
        changed += c;
      }
    }
    if (changed) {
      docsChanged += 1;
      urlsChanged += changed;
      console.log(`${APPLY ? 'update' : 'would update'} ${doc.ref.path} (${changed} URL${changed === 1 ? '' : 's'})`);
      if (APPLY) {
        batch.update(doc.ref, updates);
        if (++pending === 400) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
    }
    if (DEEP) {
      for (const sub of await doc.ref.listCollections()) await walk(sub);
    }
  }
  if (APPLY && pending) await batch.commit();
}

const roots = (await db.listCollections()).filter((c) => !ONLY.length || ONLY.includes(c.id));
for (const c of roots) await walk(c);

console.log(
  `\n${APPLY ? 'Done' : 'Dry run'}: scanned ${docsScanned} docs, ${docsChanged} ${APPLY ? 'updated' : 'to update'}, ${urlsChanged} URLs.` +
    (APPLY ? '' : '\nRe-run with --apply to write.'),
);
process.exit(0);

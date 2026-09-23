/**
 * Load the product catalog for read-only scripts, without spending Firestore reads.
 *
 * The storefront snapshot (`catalog/products.json` on R2) is a full copy of every
 * listed product, so a script that only matches or reports can read it over plain
 * HTTPS for free. Firestore's free plan allows 50,000 reads a day and the
 * collection is ~600 documents, so re-running a few scripts used to be a real
 * dent - and the same reads are what the storefront needs for real visitors.
 *
 * Use this only where a slightly stale copy is fine (matching, reporting, dry
 * runs). Anything that writes, or that must see products hidden from the
 * storefront, should read Firestore: pass `firestore: true`, or let the script
 * take a --firestore flag.
 *
 *   import { loadCatalogProducts } from './lib/catalog.mjs';
 *   const { products } = await loadCatalogProducts({ firestore: flag('firestore') });
 *
 * Products come back exactly as Firestore holds them (`{ id, ...data }`), with
 * timestamps carrying `toMillis()` / `toDate()` from either source.
 */
const KEY = 'catalog/products.json';

/** Snapshot timestamps are flattened to `{ __ts, seconds, nanoseconds }`; give them their methods back. */
function reviveTimestamps(value) {
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (value && typeof value === 'object') {
    if (value.__ts && typeof value.seconds === 'number') {
      const millis = value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
      return {
        seconds: value.seconds,
        nanoseconds: value.nanoseconds || 0,
        toMillis: () => millis,
        toDate: () => new Date(millis),
      };
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveTimestamps(v);
    return out;
  }
  return value;
}

/**
 * By document id, which is the order a plain `collection('products').get()`
 * returns. The snapshot is sorted newest-first for the storefront, and scripts
 * that match folders to products break ties by position - so both sources must
 * hand back the same order or the same run would give two different answers.
 */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function fromSnapshot() {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const resp = await fetch(`${base}/${KEY}`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const file = await resp.json();
  if (!Array.isArray(file?.products) || !file.products.length) throw new Error('unexpected file shape');
  return {
    products: file.products.map(reviveTimestamps).sort(byId),
    source: 'snapshot',
    generatedAt: file.generatedAt || null,
    reads: 0,
  };
}

async function fromFirestore() {
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 missing from .env');
  const { default: admin } = await import('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))),
    });
  }
  const snap = await admin.firestore().collection('products').get();
  return {
    products: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byId),
    source: 'firestore',
    generatedAt: null,
    reads: snap.size,
  };
}

/**
 * @param {{ firestore?: boolean, quiet?: boolean }} [options]
 *   firestore - skip the snapshot and read the collection (costs one read per product)
 * @returns {Promise<{ products: object[], source: 'snapshot'|'firestore', generatedAt: string|null, reads: number }>}
 */
export async function loadCatalogProducts({ firestore = false, quiet = false } = {}) {
  if (!firestore) {
    try {
      const result = await fromSnapshot();
      if (result) {
        if (!quiet) {
          const age = result.generatedAt ? `, published ${result.generatedAt}` : '';
          console.log(`catalog     : ${result.products.length} products from the snapshot${age} (0 Firestore reads)`);
        }
        return result;
      }
      if (!quiet) console.warn('catalog     : R2_PUBLIC_URL not set, reading Firestore instead');
    } catch (err) {
      if (!quiet) console.warn(`catalog     : snapshot unavailable (${err.message}), reading Firestore instead`);
      if (!quiet) console.warn('              run `node scripts/publish-catalog.mjs` to create it');
    }
  }
  const result = await fromFirestore();
  if (!quiet) console.log(`catalog     : ${result.products.length} products from Firestore (${result.reads} reads)`);
  return result;
}

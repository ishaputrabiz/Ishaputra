import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Product } from './productService';
import { USES_CLOUDINARY } from './mediaStorage';

/**
 * Session-scoped cache for the public product catalog.
 *
 * Before this, every storefront surface (each category page, each home section,
 * search, mobile grid) opened its own unbounded `onSnapshot` over the whole
 * products collection. With ~350 active products a single category page view
 * cost ~1000 document reads and held listeners open. The free tier is 50k
 * reads/day, so roughly 47 page views exhausted it.
 *
 * A storefront catalog does not need to be realtime - a shopper does not care
 * that a new bangle appeared without a refresh. So we read once, share the
 * result across every consumer, and re-read only after TTL or an admin write.
 *
 * Where the catalog comes from: a JSON snapshot of the active products, served
 * from the CDN (see `publish-catalog` in api/media.ts), costs no Firestore reads
 * at all. Even reading once per visitor, ~600 documents each, would cap the site
 * at about 80 visitors a day on the free plan. If the snapshot can't be loaded
 * the catalog is read from Firestore as before, so the site keeps working.
 *
 * Admin screens deliberately bypass this and keep using getAllProducts().
 */

const PRODUCTS_COLLECTION = 'products';
/**
 * Matches the snapshot's own `Cache-Control: max-age=60`.
 *
 * At five minutes this was the slowest step between an admin saving a price and
 * a shopper seeing it. Re-reading costs nothing: past 60s the browser
 * revalidates with If-None-Match and the CDN answers 304 with no body unless
 * the catalog actually changed.
 */
const TTL_MS = 60 * 1000;
const STORAGE_KEY = 'ss:catalog:v2';
/** Same-origin; vercel.json (production) and vite.config.ts (dev) proxy it to object storage. */
const CATALOG_URL = import.meta.env.VITE_CATALOG_URL || '/catalog/products.json';

/**
 * Restore Firestore Timestamps flattened to JSON - the snapshot's
 * `{ __ts, seconds, nanoseconds }` and `Timestamp.toJSON()`'s shape in
 * sessionStorage - so code calling `createdAt.toDate()` works either way.
 */
const reviveTimestamps = (_key: string, value: unknown) => {
  if (value && typeof value === 'object') {
    const v = value as { __ts?: boolean; type?: string; seconds?: number; nanoseconds?: number };
    if ((v.__ts === true || v.type === 'firestore/timestamp/1.0') && typeof v.seconds === 'number') {
      return new Timestamp(v.seconds, v.nanoseconds ?? 0);
    }
  }
  return value;
};
/** Above this, skip sessionStorage rather than risk a QuotaExceededError. */
const MAX_PERSIST_BYTES = 2_000_000;

type CacheEntry = { data: Product[]; at: number; generatedAt?: string };

let memory: CacheEntry | null = null;
/** Dedupes concurrent callers so a page with 5 sections issues 1 query, not 5. */
let inFlight: Promise<Product[]> | null = null;

const isFresh = (entry: CacheEntry | null): entry is CacheEntry =>
  !!entry && Date.now() - entry.at < TTL_MS;

const readPersisted = (): CacheEntry | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw, reviveTimestamps) as CacheEntry;
    return isFresh(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const persist = (entry: CacheEntry) => {
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_PERSIST_BYTES) return;
    sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Private mode or quota exceeded - memory cache still applies.
  }
};

/** Newest first. Snapshot and Firestore timestamps carry `seconds`; a locally built product may hold a Date. */
const createdMillis = (p: Product) => {
  const value = p.createdAt;
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const seconds = (value as { seconds?: number }).seconds;
  return typeof seconds === 'number' ? seconds * 1000 : 0;
};

/** 1 when the product has at least one photo, 0 when it has none - used to sort, so it is a number. */
const hasPhoto = (p: Product) => (p.media?.images?.length ? 1 : 0);

/** `generatedAt` of the snapshot currently in `memory`, for staleness checks. */
let loadedGeneratedAt = '';

const fetchSnapshot = async (): Promise<Product[]> => {
  // `cache: 'no-cache'` still uses the HTTP cache but always revalidates, so an
  // unchanged catalog costs a 304 with no body while a changed one is never
  // served stale from the browser's own copy.
  const resp = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  // A missing rewrite serves index.html with a 200, which fails to parse here - also a fallback case.
  const file = JSON.parse(await resp.text(), reviveTimestamps) as {
    version?: number;
    products?: Product[];
    generatedAt?: string;
  };
  if (file.version !== 1 || !Array.isArray(file.products)) throw new Error('unexpected snapshot format');
  loadedGeneratedAt = file.generatedAt || '';
  return file.products.filter((p) => p.flags?.isActive === true);
};

const readActiveFromFirestore = async (): Promise<Product[]> => {
  const snapshot = await getDocs(
    query(collection(db, PRODUCTS_COLLECTION), where('flags.isActive', '==', true)),
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
};

const fetchActiveProducts = async (): Promise<Product[]> => {
  let products: Product[];
  if (USES_CLOUDINARY) {
    // No R2 snapshot exists while images live on Cloudinary.
    products = await readActiveFromFirestore();
  } else {
    try {
      products = await fetchSnapshot();
    } catch (err) {
      console.warn('[productCache] catalog snapshot unavailable, reading Firestore instead:', err);
      products = await readActiveFromFirestore();
    }
  }

  // Newest first, but a product with no photo never leads a row: it would show
  // as an empty grey card on the homepage, and the newest products are exactly
  // the ones still waiting for their photoshoot. They stay listed and findable -
  // adding a photo puts them back in date order by itself.
  products.sort((a, b) => hasPhoto(b) - hasPhoto(a) || createdMillis(b) - createdMillis(a));

  return products;
};

/**
 * Forget the cached catalog so the next read fetches a fresh snapshot.
 *
 * Called after an admin write: the server-side snapshot has just been rebuilt,
 * but this tab is still holding the copy it read before the edit, so without
 * this the admin saves a price and then sees their own old figure on the
 * storefront and assumes the save failed.
 */
export const invalidateCatalogCache = () => {
  memory = null;
  inFlight = null;
  loadedGeneratedAt = '';
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode - the memory cache is already cleared, which is enough.
  }
};

/** All active products, from cache when possible. */
export const getActiveProductsCached = async (): Promise<Product[]> => {
  if (isFresh(memory)) return memory.data;

  const persisted = readPersisted();
  if (persisted) {
    memory = persisted;
    loadedGeneratedAt = persisted.generatedAt || '';
    return persisted.data;
  }

  if (inFlight) return inFlight;

  inFlight = fetchActiveProducts()
    .then((data) => {
      const entry: CacheEntry = { data, at: Date.now(), generatedAt: loadedGeneratedAt };
      memory = entry;
      persist(entry);
      return data;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * Drop-in replacement for the old `subscribeToProducts(cb, true)`.
 *
 * Keeps the unsubscribe-function shape so `useEffect` call sites work unchanged,
 * but resolves from cache and never opens a Firestore listener. The returned
 * function cancels delivery to a unmounted component.
 */
// ── Live catalog updates ────────────────────────────────────────────────────
//
// `siteSettings/catalogVersion` is a single tiny document the server stamps
// every time it republishes the snapshot. Every listing surface shares ONE
// listener on it, so an admin price change reaches open pages within a second
// for the cost of one document read per visitor - instead of the ~600 reads a
// realtime listener on the products collection itself would bill for.
//
// This is what makes the storefront genuinely live. `subscribeToActiveProducts`
// used to resolve a promise once and never speak again, so a page that had
// already rendered kept its prices until someone reloaded it: the admin edited
// a price, the snapshot updated within seconds, and the shopper still saw the
// old figure indefinitely.

const subscribers = new Set<(products: Product[]) => void>();
/** Listeners that only want to know *that* the catalog changed. */
const revisionListeners = new Set<(revision: number) => void>();
let revision = 0;
let versionUnsub: (() => void) | null = null;

/** Re-read the catalog and push it to every live surface. */
const refreshAllSubscribers = async () => {
  invalidateCatalogCache();
  try {
    const products = await getActiveProductsCached();
    revision += 1;
    for (const cb of subscribers) cb(products);
    for (const cb of revisionListeners) cb(revision);
  } catch (error) {
    console.error('[productCache] live refresh failed:', error);
  }
};

/** The publish this tab has already reacted to. */
let lastSeenVersion = '';

const watchCatalogVersion = () => {
  if (versionUnsub) return;
  versionUnsub = onSnapshot(
    doc(db, 'siteSettings', 'catalogVersion'),
    (snap) => {
      const generatedAt = snap.exists() ? String((snap.data() as any).generatedAt || '') : '';
      if (!generatedAt) return; // nothing published yet

      // onSnapshot fires once on attach with the current value. Record it, and
      // only refresh then if what we are displaying is demonstrably older.
      if (!lastSeenVersion) {
        lastSeenVersion = generatedAt;
        if (loadedGeneratedAt && generatedAt !== loadedGeneratedAt) void refreshAllSubscribers();
        return;
      }

      // Any later change is a new publish, whatever we think we are holding.
      // Keyed off this document rather than off the loaded snapshot's own
      // `generatedAt`, which is blank whenever the catalog came from
      // sessionStorage - that left a reloaded tab permanently deaf to updates.
      if (generatedAt === lastSeenVersion) return;
      lastSeenVersion = generatedAt;
      void refreshAllSubscribers();
    },
    (err) => {
      // Without the marker the catalog still refreshes on its normal TTL.
      console.warn('[productCache] catalog version listener unavailable:', err);
    },
  );
};

const stopWatchingIfIdle = () => {
  if (subscribers.size === 0 && revisionListeners.size === 0 && versionUnsub) {
    versionUnsub();
    versionUnsub = null;
  }
};

/**
 * A number that changes whenever a newly published catalog has been loaded.
 *
 * For screens that read the catalog with a plain `await` inside an effect
 * rather than through {@link subscribeToActiveProducts}: add this to the
 * effect's dependencies and the screen re-reads itself when an admin publishes,
 * instead of showing whatever it loaded with until someone reloads the page.
 */
export const useCatalogRevision = (): number => {
  const [value, setValue] = useState(revision);

  useEffect(() => {
    const listener = (n: number) => setValue(n);
    revisionListeners.add(listener);
    watchCatalogVersion();
    return () => {
      revisionListeners.delete(listener);
      stopWatchingIfIdle();
    };
  }, []);

  return value;
};

export const subscribeToActiveProducts = (callback: (products: Product[]) => void) => {
  let cancelled = false;
  const deliver = (products: Product[]) => {
    if (!cancelled) callback(products);
  };

  subscribers.add(deliver);
  watchCatalogVersion();

  getActiveProductsCached()
    .then(deliver)
    .catch((error) => {
      console.error('[productCache] catalog load failed:', error);
      deliver([]);
    });

  return () => {
    cancelled = true;
    subscribers.delete(deliver);
    stopWatchingIfIdle();
  };
};

/**
 * Cache-backed replacement for `subscribeToProductsBySubcategory`. Filtering the
 * shared catalog in memory costs zero reads; the old version opened a separate
 * listener per subcategory page (59 of them across the app).
 */
export const subscribeToActiveProductsBySubcategory = (
  subcategory: string,
  callback: (products: Product[]) => void,
) => {
  const target = subcategory.toLowerCase();
  return subscribeToActiveProducts((products) =>
    callback(products.filter((p) => (p.subcategory || '').toLowerCase() === target)),
  );
};

type SectionFlag = 'isBestSeller' | 'isTopDeal' | 'isFeatured' | 'isNewArrival' | 'isTrendProduct';

/**
 * Cache-backed replacement for the home-page section listeners
 * (best sellers / top deals / featured / new arrivals / trends). The home page
 * ran five separate queries; now all five read the one cached catalog.
 *
 * Products with no photo are left out of these rows entirely: a card with an
 * empty grey box is worse than a shorter row, and every section here already
 * handles having nothing to show. They stay listed in categories and search.
 */
export const subscribeToActiveProductsByFlag = (
  flag: SectionFlag,
  callback: (products: Product[]) => void,
  limitCount = 10,
) =>
  subscribeToActiveProducts((products) =>
    callback(products.filter((p) => p.flags?.[flag] === true && hasPhoto(p)).slice(0, limitCount)),
  );

/**
 * Call after any admin write so the next read reflects it immediately.
 * Alias of {@link invalidateCatalogCache}, kept for existing call sites.
 */
export const invalidateProductCache = invalidateCatalogCache;

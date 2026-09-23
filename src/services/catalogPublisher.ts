import { auth } from '@/config/firebase';
import { callMediaApi, USES_CLOUDINARY } from './mediaStorage';
import { invalidateCatalogCache } from './productCache';

/**
 * Keeps the storefront catalog snapshot (catalog/products.json) in step with
 * Firestore.
 *
 * Call it after any write to a product document. Ids are batched briefly so a
 * bulk edit sends one request, and the server re-reads only those products (one
 * Firestore read each) - see `publish-catalog` in api/media.ts.
 *
 * A failure never blocks the write that triggered it: the snapshot is a cache.
 * Until the next change touches that product, shoppers may see its old details
 * (checkout still re-checks stock and price against Firestore). A full rebuild
 * is `node scripts/publish-catalog.mjs`.
 */

const BATCH_DELAY_MS = 800;
const MAX_IDS_PER_REQUEST = 25;

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Notified when a publish fails, so the admin UI can say so out loud. */
type PublishFailureListener = (message: string) => void;
const failureListeners = new Set<PublishFailureListener>();

/**
 * Subscribe to publish failures.
 *
 * This used to be a bare `console.warn`, which is how a broken publish went
 * unnoticed for days: every product edit was silently failing to reach the
 * storefront snapshot (an `If-Match` bug in api/media.ts), the admin saw the
 * new price on the product page - which reads Firestore - and had no way to
 * know the grid everyone else sees was still serving the old one.
 */
export const onCatalogPublishFailure = (listener: PublishFailureListener): (() => void) => {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
};

const flush = async () => {
  timer = null;
  const ids = [...pending];
  pending.clear();
  // Guests can't place orders or edit products, so there is nothing of theirs to publish.
  if (!ids.length || !auth.currentUser) return;

  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    try {
      await callMediaApi(
        { action: 'publish-catalog', productIds: ids.slice(i, i + MAX_IDS_PER_REQUEST) },
        // Survives the admin navigating away right after saving.
        { keepalive: true },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[catalog] snapshot refresh failed; the storefront may show old details for:', ids, err);
      for (const listener of failureListeners) {
        listener(`The storefront listing could not be updated (${detail}). Your change is saved, but shoppers may still see the old details.`);
      }
    }
  }

  // This tab read the catalog before the edit; drop that copy so the admin sees
  // their own change instead of the figure they just replaced.
  invalidateCatalogCache();
};

export const requestCatalogRefresh = (productIds: Array<string | null | undefined>) => {
  // No snapshot to refresh while images live on Cloudinary; the storefront reads Firestore.
  if (USES_CLOUDINARY) {
    invalidateCatalogCache();
    return;
  }
  for (const id of productIds) if (id) pending.add(id);
  if (!pending.size) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
};

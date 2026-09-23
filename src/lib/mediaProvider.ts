/**
 * Where uploaded images live, chosen per deployment with VITE_MEDIA_PROVIDER.
 *
 *  - `r2` (default): uploads go through /api/media to Cloudflare R2, and the
 *    storefront reads the product list from the R2 catalog snapshot.
 *  - `cloudinary`: a stop-gap for stores whose Cloudflare account isn't set up
 *    yet. The browser uploads straight to Cloudinary with an unsigned preset,
 *    and the storefront reads products from Firestore, because there is no
 *    snapshot to read.
 *
 * Switching to R2 later is an env change plus `node scripts/publish-catalog.mjs`;
 * Cloudinary URLs already stored on products keep rendering through
 * src/lib/cloudinaryUrl.ts.
 */
export const MEDIA_PROVIDER: 'r2' | 'cloudinary' =
  import.meta.env.VITE_MEDIA_PROVIDER === 'cloudinary' ? 'cloudinary' : 'r2';

export const usesCloudinary = MEDIA_PROVIDER === 'cloudinary';

export const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
export const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

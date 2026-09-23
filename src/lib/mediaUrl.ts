/**
 * URL helpers for files stored through /api/media (Cloudflare R2 today).
 *
 * Every uploaded image gets a sibling preview, capped at 600px, stored next to
 * it: `.../m<24 hex>.jpg` -> `.../m<24 hex>__w600.webp`. R2 has no on-the-fly
 * resizing, so without the preview every product card would download the full
 * (up to 500 KB) photo.
 *
 * Detection is by the generated filename rather than by host, so it keeps
 * working after the bucket moves to a custom domain or another provider.
 */

const MANAGED_FILE = /^(https?:\/\/[^?#]+\/m[0-9a-f]{24})\.(jpg|png|webp)$/;

export const PREVIEW_MAX_EDGE = 600;
export const PREVIEW_SUFFIX = '__w600.webp';

export const isManagedImageUrl = (url: string | undefined | null): url is string =>
  typeof url === 'string' && MANAGED_FILE.test(url);

/** The 600px preview for a managed image, or null for anything else. */
export const mediaPreviewUrl = (url: string | undefined | null): string | null => {
  if (!url) return null;
  const match = MANAGED_FILE.exec(url);
  return match ? `${match[1]}${PREVIEW_SUFFIX}` : null;
};

/**
 * Central Cloudinary URL transformer.
 *
 * Every image rendered in the app must go through here. Serving raw
 * `secure_url` originals (3-5 MB studio photos) into small layout slots is what
 * burned 94 of 25 monthly credits with no real traffic.
 *
 * Two rules keep the bill down:
 *  1. Always send `f_auto,q_auto` so Cloudinary serves AVIF/WebP at a sane quality.
 *  2. Always send an explicit `w_` from the fixed ladder below.
 *
 * The ladder matters: Cloudinary bills 1 credit per 1000 *distinct* derived
 * assets, and each new width is a new derived asset. A fixed set of widths keeps
 * the derived-asset count bounded and the CDN cache hot. Never build a width
 * from a runtime measurement.
 */

/** The only widths we are allowed to request. */
export const WIDTH_LADDER = [64, 128, 200, 400, 600, 900, 1200, 1600] as const;
export type LadderWidth = (typeof WIDTH_LADDER)[number];

export type ImagePreset =
  | 'thumb' // 64px  - cart lines, admin list rows, avatars
  | 'tile' // 200px - mobile grid, small pickers
  | 'card' // 400px - product grid cards (the hot path)
  | 'detail' // 900px - product detail main image
  | 'hero' // 1600px - banners, showcase, full-bleed
  | 'zoom'; // 1600px - lightbox / pinch-zoom

const PRESET_WIDTH: Record<ImagePreset, LadderWidth> = {
  thumb: 64,
  tile: 200,
  card: 400,
  detail: 900,
  hero: 1600,
  zoom: 1600,
};

/**
 * `q_auto:eco` is visibly identical at small sizes and materially cheaper.
 * Reserve the better quality tiers for images the customer actually inspects.
 */
const PRESET_QUALITY: Record<ImagePreset, string> = {
  thumb: 'auto:eco',
  tile: 'auto:eco',
  card: 'auto:eco',
  detail: 'auto:good',
  hero: 'auto:good',
  zoom: 'auto:best',
};

const CLOUDINARY_HOST = 'res.cloudinary.com';

/** Cloudinary delivery URLs are `.../<type>/upload/<transforms>/<version>/<public_id>`. */
const UPLOAD_SEGMENT = /\/(image|video)\/upload\//;

/**
 * A transformation segment is the path chunk right after `/upload/`, made of
 * comma-joined `k_v` pairs. Used to detect URLs that were already transformed so
 * we don't stack a second transform on top (which silently double-bills).
 */
const EXISTING_TRANSFORM = /^[a-z]{1,3}_[^/]*$/;

export const isCloudinaryUrl = (url: string): boolean =>
  typeof url === 'string' && url.includes(CLOUDINARY_HOST);

/**
 * Build a delivery URL for `url` at the given preset.
 *
 * Non-Cloudinary inputs (local `/placeholder.jpg`, Firebase Storage, data URIs,
 * blob previews from an in-progress upload) pass through untouched.
 */
export const cldUrl = (
  url: string | undefined | null,
  preset: ImagePreset = 'card',
  overrides?: { width?: LadderWidth; crop?: 'limit' | 'fill'; quality?: string },
): string => {
  if (!url || !isCloudinaryUrl(url)) return url || '';

  const match = url.match(UPLOAD_SEGMENT);
  if (!match) return url;

  const [head, ...tailParts] = url.split(match[0]);
  let tail = tailParts.join(match[0]);

  // Drop any transform the URL already carries so presets stay authoritative and
  // we never emit `/upload/w_1600/w_400/...`.
  const segments = tail.split('/');
  if (segments.length > 1 && EXISTING_TRANSFORM.test(segments[0])) {
    tail = segments.slice(1).join('/');
  }

  const width = overrides?.width ?? PRESET_WIDTH[preset];
  const quality = overrides?.quality ?? PRESET_QUALITY[preset];
  // `c_limit` never upscales - a 300px original stays 300px instead of being
  // blown up to 1600 and billed as if it were large.
  const crop = overrides?.crop ?? 'limit';

  const transform = `f_auto,q_${quality},w_${width},c_${crop}`;

  return `${head}${match[0]}${transform}/${tail}`;
};

/**
 * Build a `srcset` so retina screens get a sharp image without every device
 * paying for the 2x asset. Capped at 1600 - the top of the ladder.
 */
export const cldSrcSet = (
  url: string | undefined | null,
  preset: ImagePreset = 'card',
): string | undefined => {
  if (!url || !isCloudinaryUrl(url)) return undefined;

  const base = PRESET_WIDTH[preset];
  const retina = WIDTH_LADDER.find((w) => w >= base * 2) ?? 1600;
  if (retina === base) return undefined;

  return [
    `${cldUrl(url, preset, { width: base })} 1x`,
    `${cldUrl(url, preset, { width: retina })} 2x`,
  ].join(', ');
};

/**
 * Poster frame for a video, as a still image. Serving a video tag to a grid to
 * show one frame is the single most expensive thing we could do.
 */
export const cldVideoPoster = (url: string | undefined | null, preset: ImagePreset = 'card'): string => {
  if (!url || !isCloudinaryUrl(url)) return url || '';
  return cldUrl(url.replace(/\.(mp4|webm|mov)$/i, '.jpg'), preset);
};

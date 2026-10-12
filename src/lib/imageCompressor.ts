/**
 * Best-quality image compression for the admin "Image Compressor" page.
 *
 * Goal: get each photo under the upload limit while keeping it as sharp as
 * possible. For every candidate resolution we binary-search the encoder
 * quality and keep the highest one that fits; resolution only steps down when
 * even a good quality (>= MIN_GOOD_QUALITY) can't fit. That beats hand-run
 * "export at 60%" compression, which is what was visibly degrading photos.
 */

export type OutputFormat = 'webp' | 'jpeg';

export interface CompressOptions {
  /** Hard size limit in bytes (the server rejects anything above it). */
  maxBytes: number;
  format: OutputFormat;
  /** Longest edge cap in px. Product photos never need more than this. */
  maxEdge?: number;
}

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  /** Encoder quality used (0-1), or null when the original was kept as-is. */
  quality: number | null;
  /** True when the file was already under the limit and kept untouched. */
  keptOriginal: boolean;
}

const UPLOADABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_EDGE = 2400;
const MIN_EDGE = 900;
const MAX_QUALITY = 0.95;
/** Below this, artifacts start to show - prefer a slightly smaller image instead. */
const MIN_GOOD_QUALITY = 0.74;
/** Last-resort floor, only used at the smallest resolution. */
const MIN_QUALITY = 0.45;
/** Keep a little headroom under the limit. */
const SAFETY_BYTES = 2 * 1024;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

let webpSupport: Promise<boolean> | null = null;
/** Safari can't encode WebP and silently returns PNG instead. */
export const canEncodeWebp = (): Promise<boolean> => {
  if (!webpSupport) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    webpSupport = toBlob(c, 'image/webp', 0.8).then((b) => !!b && b.type === 'image/webp');
  }
  return webpSupport;
};

/**
 * Draw `bitmap` at `width` x `height`. Big reductions are done in halving
 * steps, which keeps fine detail (engraving, filigree) crisper than a single
 * large downscale.
 */
const render = (bitmap: ImageBitmap, width: number, height: number, flatten: boolean): HTMLCanvasElement => {
  let source: CanvasImageSource = bitmap;
  let sw = bitmap.width;
  let sh = bitmap.height;

  while (sw / 2 >= width && sh / 2 >= height) {
    const step = document.createElement('canvas');
    step.width = Math.round(sw / 2);
    step.height = Math.round(sh / 2);
    const sctx = step.getContext('2d')!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(source, 0, 0, step.width, step.height);
    source = step;
    sw = step.width;
    sh = step.height;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  if (flatten) {
    // JPEG has no transparency - transparent pixels would turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
};

/** Highest quality in [lo, hi] whose encoding fits `limit`, or null if even `lo` doesn't. */
const bestQualityThatFits = async (
  canvas: HTMLCanvasElement,
  mime: string,
  limit: number,
  lo: number,
  hi: number,
): Promise<{ blob: Blob; quality: number } | null> => {
  const top = await toBlob(canvas, mime, hi);
  if (top && top.size <= limit) return { blob: top, quality: hi };

  const bottom = await toBlob(canvas, mime, lo);
  if (!bottom || bottom.size > limit) return null;

  let best = { blob: bottom, quality: lo };
  let low = lo;
  let high = hi;
  // ~1% quality resolution is plenty; 6 rounds gets there from a 0.2-0.5 range.
  for (let i = 0; i < 6; i++) {
    const mid = (low + high) / 2;
    const blob = await toBlob(canvas, mime, mid);
    if (blob && blob.size <= limit) {
      best = { blob, quality: mid };
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
};

export const compressImage = async (file: File, options: CompressOptions): Promise<CompressResult> => {
  const { maxBytes, maxEdge = DEFAULT_MAX_EDGE } = options;
  const limit = maxBytes - SAFETY_BYTES;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not read this file as an image (JPG, PNG or WebP only).');
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);

    // Already small enough, in an uploadable format, and not oversized: keep it bit-for-bit.
    if (file.size <= limit && UPLOADABLE_TYPES.includes(file.type) && longest <= maxEdge) {
      return { blob: file, width: bitmap.width, height: bitmap.height, quality: null, keptOriginal: true };
    }

    const useWebp = options.format === 'webp' && (await canEncodeWebp());
    const mime = useWebp ? 'image/webp' : 'image/jpeg';

    let edge = Math.min(longest, maxEdge);
    for (;;) {
      const scale = edge / longest;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = render(bitmap, width, height, !useWebp);
      const atSmallest = edge <= MIN_EDGE;
      const fit = await bestQualityThatFits(canvas, mime, limit, atSmallest ? MIN_QUALITY : MIN_GOOD_QUALITY, MAX_QUALITY);
      if (fit) return { blob: fit.blob, width, height, quality: fit.quality, keptOriginal: false };
      if (atSmallest) break;
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.88));
    }
  } finally {
    bitmap.close();
  }
  throw new Error('This image has too much detail to fit the limit. Try cropping it first.');
};

/** "photo.png" -> "photo.webp", keeping names unique inside one ZIP. */
export const outputName = (original: string, blob: Blob, taken: Set<string>): string => {
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const base = original.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-') || 'image';
  let name = `${base}.${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`;
  taken.add(name.toLowerCase());
  return name;
};

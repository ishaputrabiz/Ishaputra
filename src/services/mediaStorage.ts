import { auth } from '@/config/firebase';
import { PREVIEW_MAX_EDGE } from '@/lib/mediaUrl';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, usesCloudinary } from '@/lib/mediaProvider';

/**
 * Client for /api/media - every file upload in the app goes through here.
 * With VITE_MEDIA_PROVIDER=cloudinary the same functions upload straight to
 * Cloudinary instead (see src/lib/mediaProvider.ts).
 *
 * Rules (the server enforces them again; these just fail fast with a clear message):
 *  - Images: JPG, PNG or WebP, at most 500 KB.
 *    Admin screens reject bigger files - photos are compressed before upload.
 *    Customer screens (review photos, profile picture) shrink the photo in the
 *    browser instead, because customers can't be asked to compress.
 *  - PDFs (refund receipts only): at most 1 MB.
 *  - Products: at most MAX_PRODUCT_IMAGES photos.
 */

export const MAX_IMAGE_BYTES = 500 * 1024;
/**
 * Hero banners are allowed 1 MB: there are only a few of them, they fill the
 * whole width of the shop front, and squeezing them to 500 KB shows.
 * The server applies the same per-category limit.
 */
export const MAX_BANNER_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 5;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** For `<input accept>` - narrower than image/* so HEIC/GIF aren't offered. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');

/** Fired on window when the server pauses uploads; the admin popup listens for it. */
export const STORAGE_LIMIT_EVENT = 'media:storage-limit';

export type MediaCategory =
  | 'products' | 'banners' | 'home' | 'gallery' | 'showcases' | 'testimonials'
  | 'media' | 'receipts' | 'avatars' | 'reviews';

export type MediaErrorCode =
  | 'TOO_LARGE' | 'BAD_TYPE' | 'LIMIT_REACHED' | 'AUTH' | 'FORBIDDEN'
  | 'NOT_CONFIGURED' | 'NETWORK' | 'SERVER' | 'BAD_REQUEST';

export class MediaUploadError extends Error {
  constructor(public code: MediaErrorCode, message: string, public usage?: StorageUsage) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

export interface UploadedMedia {
  url: string;
  key: string;
  bytes: number;
  contentType: string;
  previewUrl?: string;
  /** Small JPEG used as the link-preview image when the product is shared (products only). */
  ogUrl?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface StorageUsage {
  periodStart: string;
  periodEnd: string;
  storageBytes: number;
  objectCount: number;
  classA: number;
  classB: number | null;
  source: 'analytics' | 'estimate';
  fetchedAt: string;
  limits: { storageBytes: number; classA: number; classB: number };
  thresholds: { warn: number; block: number };
  percent: { storage: number; classA: number; classB: number | null };
  level: 'ok' | 'warn' | 'block';
  reasons: string[];
  notes: string[];
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1000 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1000 ** 3).toFixed(2)} GB`;
};

// ── Validation ──────────────────────────────────────────────────────────────

/** The image size limit for a destination: 1 MB for hero banners, 500 KB elsewhere. */
export const maxImageBytesFor = (category?: MediaCategory) =>
  category === 'banners' ? MAX_BANNER_BYTES : MAX_IMAGE_BYTES;

/** Throws a readable error unless `file` is an allowed image within the limit for `category`. */
export const assertUploadableImage = (file: File, category?: MediaCategory): void => {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new MediaUploadError('BAD_TYPE', `"${file.name}" is not a JPG, PNG or WebP image.`);
  }
  const limit = maxImageBytesFor(category);
  if (file.size > limit) {
    throw new MediaUploadError(
      'TOO_LARGE',
      `"${file.name}" is ${formatBytes(file.size)}. Please compress it to ${formatBytes(limit)} or less and upload again.`,
    );
  }
};

// ── In-browser image work ───────────────────────────────────────────────────

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Draw `bitmap` scaled to fit `maxEdge` and encode it. WebP where the browser
 * can encode it; Safari can't and silently returns PNG, so fall back to JPEG
 * on a white ground (JPEG has no alpha - transparent pixels would turn black).
 */
const encodeScaled = async (bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> => {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaUploadError('BAD_TYPE', 'This browser cannot process images.');

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new MediaUploadError('BAD_TYPE', 'Could not process this image.');
  return jpeg;
};

const decode = async (file: Blob, name: string): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new MediaUploadError('BAD_TYPE', `"${name}" could not be read as an image.`);
  }
};

/** Small preview used by product cards and thumbnails. Best effort. */
const createPreview = async (file: File): Promise<Blob | null> => {
  try {
    const bitmap = await decode(file, file.name);
    try {
      return await encodeScaled(bitmap, PREVIEW_MAX_EDGE, 0.8);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
};

const OG_MAX_EDGE = 800;
const MAX_OG_BYTES = 250 * 1024;

/**
 * JPEG shown when a product link is shared on WhatsApp. It has to be JPEG and
 * small: WhatsApp drops preview images above roughly 300 KB and doesn't reliably
 * take WebP, so neither the full photo nor the WebP card preview will do.
 * Best effort - without it the share preview falls back to the full photo.
 */
const createOgImage = async (file: File): Promise<Blob | null> => {
  try {
    const bitmap = await decode(file, file.name);
    try {
      const scale = Math.min(1, OG_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff'; // JPEG has no alpha - transparent pixels would turn black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.55]) {
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (jpeg && jpeg.size <= MAX_OG_BYTES) return jpeg;
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
};

/**
 * Shrink a customer photo until it fits in 500 KB. Photos already within the
 * limit are still re-encoded when they're JPEGs, which strips EXIF data such as
 * the GPS location a phone camera embeds.
 */
export const compressImageToLimit = async (file: File, maxBytes = MAX_IMAGE_BYTES): Promise<File> => {
  if (file.size <= maxBytes && file.type !== 'image/jpeg' && IMAGE_TYPES.includes(file.type)) return file;

  const bitmap = await decode(file, file.name);
  try {
    const attempts: Array<[number, number]> = [
      [2000, 0.85], [2000, 0.72], [1600, 0.72], [1280, 0.7], [1024, 0.65], [800, 0.6], [640, 0.55],
    ];
    for (const [edge, quality] of attempts) {
      const blob = await encodeScaled(bitmap, edge, quality);
      if (blob.size <= maxBytes) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + `.${ext}`, { type: blob.type });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new MediaUploadError('TOO_LARGE', `"${file.name}" could not be made small enough. Please choose another photo.`);
};

// ── Transport ───────────────────────────────────────────────────────────────

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new MediaUploadError('BAD_TYPE', 'Could not read the file.'));
    reader.readAsDataURL(blob);
  });

const authHeader = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new MediaUploadError('AUTH', 'Please sign in to upload files.');
  return `Bearer ${await user.getIdToken()}`;
};

/** Shape of every /api/media JSON response. */
interface ApiPayload {
  ok?: boolean;
  code?: MediaErrorCode;
  error?: string;
  usage?: StorageUsage;
  publicUrlConfigured?: boolean;
}

const toMediaError = (status: number, payload: ApiPayload | null): MediaUploadError => {
  const code = (payload?.code as MediaErrorCode) || (status === 0 ? 'NETWORK' : 'SERVER');
  const error = new MediaUploadError(code, payload?.error || `Upload failed (HTTP ${status}).`, payload?.usage);
  if (code === 'LIMIT_REACHED' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_LIMIT_EVENT, { detail: payload?.usage }));
  }
  return error;
};

const postJson = <T>(body: object, onProgress?: (p: UploadProgress) => void) =>
  authHeader().then(
    (authorization) =>
      new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', authorization);
        if (onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              onProgress({ loaded: e.loaded, total: e.total, percentage: Math.round((e.loaded / e.total) * 100) });
            }
          };
        }
        xhr.onload = () => {
          let payload: ApiPayload | null = null;
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON (e.g. a proxy error page) */
          }
          if (xhr.status >= 200 && xhr.status < 300 && payload?.ok) resolve(payload as unknown as T);
          else reject(toMediaError(xhr.status, payload));
        };
        xhr.onerror = () => reject(new MediaUploadError('NETWORK', 'Network error during upload. Check your connection.'));
        xhr.send(JSON.stringify(body));
      }),
  );

/** Shape of a Cloudinary upload response (only the fields we read). */
interface CloudinaryUpload {
  secure_url: string;
  public_id: string;
  bytes: number;
  format?: string;
  resource_type?: string;
}

/**
 * Unsigned upload straight from the browser. There is no preview or og file
 * to store: Cloudinary resizes on request (src/lib/cloudinaryUrl.ts).
 */
const uploadToCloudinary = (
  file: Blob,
  category: MediaCategory,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadedMedia> => {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    return Promise.reject(
      new MediaUploadError('NOT_CONFIGURED', 'Cloudinary is not set up (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET).'),
    );
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', category);

  return new Promise<UploadedMedia>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({ loaded: e.loaded, total: e.total, percentage: Math.round((e.loaded / e.total) * 100) });
        }
      };
    }
    xhr.onload = () => {
      let payload: (CloudinaryUpload & { error?: { message?: string } }) | null = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.secure_url) {
        resolve({
          url: payload.secure_url,
          key: payload.public_id,
          bytes: payload.bytes,
          contentType: file.type || `${payload.resource_type || 'image'}/${payload.format || ''}`,
        });
      } else {
        reject(new MediaUploadError('SERVER', payload?.error?.message || `Upload failed (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new MediaUploadError('NETWORK', 'Network error during upload. Check your connection.'));
    xhr.send(form);
  });
};

// ── Public API ──────────────────────────────────────────────────────────────

export interface UploadImageOptions {
  category: MediaCategory;
  /** Shrink oversized photos instead of rejecting them (customer-facing screens). */
  autoCompress?: boolean;
  onProgress?: (progress: UploadProgress) => void;
}

export const uploadImage = async (file: File, options: UploadImageOptions): Promise<UploadedMedia> => {
  const ready = options.autoCompress ? await compressImageToLimit(file) : file;
  assertUploadableImage(ready);

  if (usesCloudinary) return uploadToCloudinary(ready, options.category, options.onProgress);

  const preview = await createPreview(ready);
  const og = options.category === 'products' ? await createOgImage(ready) : null;
  return postJson<UploadedMedia>(
    {
      action: 'upload',
      category: options.category,
      file: { name: ready.name, data: await toBase64(ready) },
      ...(preview ? { preview: { data: await toBase64(preview) } } : {}),
      ...(og ? { og: { data: await toBase64(og) } } : {}),
    },
    options.onProgress,
  );
};

/** A JSON action on /api/media that isn't a file transfer (e.g. refreshing the catalog). */
export const callMediaApi = async <T extends object>(body: object, init: { keepalive?: boolean } = {}): Promise<T> => {
  const resp = await fetch('/api/media', {
    method: 'POST',
    keepalive: init.keepalive,
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify(body),
  });
  let payload: ApiPayload | null = null;
  try {
    payload = await resp.json();
  } catch {
    /* non-JSON (e.g. a proxy error page) */
  }
  if (!resp.ok || !payload?.ok) throw toMediaError(resp.status, payload);
  return payload as unknown as T;
};

/** Image (≤500 KB) or PDF (≤1 MB). Used for refund receipts. */
export const uploadDocument = async (
  file: File,
  options: { category: MediaCategory; onProgress?: (progress: UploadProgress) => void },
): Promise<UploadedMedia> => {
  if (file.type !== 'application/pdf') return uploadImage(file, options);
  if (file.size > MAX_PDF_BYTES) {
    throw new MediaUploadError('TOO_LARGE', `"${file.name}" is ${formatBytes(file.size)}. PDFs must be 1 MB or less.`);
  }
  if (usesCloudinary) return uploadToCloudinary(file, options.category, options.onProgress);
  return postJson<UploadedMedia>(
    { action: 'upload', category: options.category, file: { name: file.name, data: await toBase64(file) } },
    options.onProgress,
  );
};

/**
 * Remove stored files by URL. Anything that isn't ours (Cloudinary, pasted
 * links) is skipped by the server. Never throws: a failed cleanup must not
 * fail the save that triggered it - it only leaves an orphaned file behind.
 */
export const deleteMedia = async (urls: Array<string | undefined | null>): Promise<void> => {
  // An unsigned preset can upload but not delete; old files stay on Cloudinary.
  if (usesCloudinary) return;
  const list = [...new Set(urls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)))];
  for (let i = 0; i < list.length; i += 25) {
    try {
      await postJson({ action: 'delete', urls: list.slice(i, i + 25) });
    } catch (err) {
      console.warn('[media] cleanup failed:', err);
    }
  }
};

export const fetchStorageUsage = async (
  refresh = false,
): Promise<{ usage: StorageUsage; publicUrlConfigured: boolean }> => {
  if (usesCloudinary) {
    throw new MediaUploadError(
      'NOT_CONFIGURED',
      'Images are stored on Cloudinary for now. Check storage and credits on the Cloudinary dashboard.',
    );
  }
  const resp = await fetch(`/api/media${refresh ? '?refresh=1' : ''}`, {
    headers: { Authorization: await authHeader() },
  });
  let payload: ApiPayload | null = null;
  try {
    payload = (await resp.json()) as ApiPayload;
  } catch {
    /* handled below */
  }
  if (!resp.ok || !payload?.ok) throw toMediaError(resp.status, payload);
  return { usage: payload.usage, publicUrlConfigured: !!payload.publicUrlConfigured };
};

/** One friendly sentence for a toast. */
export const describeUploadError = (error: unknown): string => {
  if (error instanceof MediaUploadError) {
    if (error.code === 'LIMIT_REACHED') return 'Uploads are paused because the free storage plan is almost full.';
    if (error.code === 'NOT_CONFIGURED') return usesCloudinary ? error.message : 'Image storage is not set up on the server yet.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Upload failed.';
};

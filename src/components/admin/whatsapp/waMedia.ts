/**
 * Browser-side file prep for WhatsApp: photos must be JPEG or PNG (WhatsApp
 * shows WebP only as stickers), and every upload has a size cap.
 */
import { uploadImage } from '@/services/mediaStorage';

/** Mirrors SENDABLE_MEDIA in api/whatsapp-reply.ts. */
export const SENDABLE_DOC_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
export const ATTACH_ACCEPT = ['image/*', ...SENDABLE_DOC_TYPES, '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'].join(',');
/** Same as MAX_SEND_MEDIA_BYTES on the server. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
/** The store's upload limit for images (api/media.ts). */
export const MAX_TEMPLATE_PICTURE_BYTES = 500 * 1024;

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * Re-encode any decodable image as a JPEG within `maxBytes`, shrinking it
 * step by step. Transparent areas become white, as WhatsApp would show them.
 */
export async function toJpegWithin(file: Blob, maxBytes: number, name = 'photo'): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This file could not be read as a picture. Try a JPEG or PNG.');
  }
  try {
    const attempts: Array<[number, number]> = [
      [2048, 0.85], [2048, 0.75], [1600, 0.75], [1280, 0.72], [1024, 0.7], [800, 0.65],
    ];
    for (const [edge, quality] of attempts) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot process pictures.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToJpeg(canvas, quality);
      if (blob && blob.size <= maxBytes) {
        return new File([blob], `${name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error('This picture could not be made small enough. Try a smaller one.');
}

/** Photos go out as JPEG/PNG under the cap; documents must already fit. */
export async function prepareAttachment(file: File): Promise<{ file: File; kind: 'image' | 'document' }> {
  if (file.type.startsWith('image/')) {
    const ok = (file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= MAX_ATTACHMENT_BYTES;
    return { file: ok ? file : await toJpegWithin(file, MAX_ATTACHMENT_BYTES, file.name), kind: 'image' };
  }
  if (!SENDABLE_DOC_TYPES.includes(file.type)) {
    throw new Error('Send a photo, or a PDF, Word, Excel, PowerPoint or text file.');
  }
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Files sent from here can be up to 3 MB.');
  return { file, kind: 'document' };
}

export const fileToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });

/** Store a template header picture (JPEG ≤ 500 KB) and return its public URL. */
export async function uploadTemplatePicture(file: File): Promise<string> {
  const jpeg = file.type === 'image/jpeg' && file.size <= MAX_TEMPLATE_PICTURE_BYTES
    ? file
    : await toJpegWithin(file, MAX_TEMPLATE_PICTURE_BYTES, file.name);
  const uploaded = await uploadImage(jpeg, { category: 'media' });
  return uploaded.url;
}

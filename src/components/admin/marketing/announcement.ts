/**
 * The one WhatsApp template behind Marketing → Announcement.
 *
 * {{1}} is the customer's first name (filled per customer by /api/broadcast),
 * {{2}} is whatever the admin types. Meta reviews the template once; after
 * that every announcement reuses it. A rejected template is resubmitted under
 * the next version name (store_announcement_v2, _v3 …) because Meta blocks
 * reusing a name.
 */
import { BRAND } from '@/config/brand';
import type { TemplateDraft } from '@/components/admin/whatsapp/templateRules';

export const ANNOUNCEMENT_BASE_NAME = 'store_announcement';
export const ANNOUNCEMENT_LANGUAGE = 'en';
export const ANNOUNCEMENT_MAX_LENGTH = 600;
/** Used for {{1}} when a customer has no name on file: "Hello there,". */
export const NAME_FALLBACK = 'there';

export const ANNOUNCEMENT_BODY =
  `Hello {{1}},\n\nHere is an update from ${BRAND.name}:\n\n{{2}}\n\nThank you for shopping with us.`;
export const ANNOUNCEMENT_FOOTER = 'Reply STOP to stop these updates';

export interface AnnouncementTemplateRow {
  id: string;
  name: string;
  language: string;
  status?: string | null;
  rejectedReason?: string | null;
}

const NAME_RE = new RegExp(`^${ANNOUNCEMENT_BASE_NAME}(?:_v(\\d+))?$`);

export function announcementVersion(name: string): number | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return m[1] ? Number(m[1]) : 1;
}

/**
 * The template to send with: the newest approved one, otherwise the newest
 * of any status (so the admin sees "in review" or "rejected").
 */
export function pickAnnouncementTemplate<T extends AnnouncementTemplateRow>(templates: T[]): T | null {
  const ours = templates
    .filter((t) => announcementVersion(t.name) !== null)
    .sort((a, b) => (announcementVersion(b.name) ?? 0) - (announcementVersion(a.name) ?? 0));
  return ours.find((t) => String(t.status || '').toUpperCase() === 'APPROVED') || ours[0] || null;
}

/** Name for the next submission: the first unused version. */
export function nextAnnouncementName(templates: AnnouncementTemplateRow[]): string {
  const used = templates.map((t) => announcementVersion(t.name)).filter((v): v is number => v !== null);
  if (used.length === 0) return ANNOUNCEMENT_BASE_NAME;
  return `${ANNOUNCEMENT_BASE_NAME}_v${Math.max(...used) + 1}`;
}

export function announcementTemplateDraft(name: string): TemplateDraft {
  return {
    name,
    language: ANNOUNCEMENT_LANGUAGE,
    category: 'MARKETING',
    header: null,
    body: {
      text: ANNOUNCEMENT_BODY,
      examples: ['Priya', 'Our new herbal hair oil is now on the website. Take a look this weekend.'],
    },
    footer: { text: ANNOUNCEMENT_FOOTER },
    buttons: [],
    paramLabels: ['Customer first name', 'Announcement'],
  };
}

/** Same folding as the server: WhatsApp parameters cannot hold line breaks. */
export function toWhatsAppParam(text: string) {
  return String(text || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function renderAnnouncement(firstName: string, message: string) {
  return ANNOUNCEMENT_BODY.replace('{{1}}', firstName || NAME_FALLBACK).replace('{{2}}', toWhatsAppParam(message));
}

/** Mirror of normalizeWhatsAppNumber in api/broadcast.ts (keep in sync). */
export function normalizeWhatsAppNumber(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (text.startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/** Mirror of isCustomerRole in api/broadcast.ts. */
export const isCustomerRole = (role: unknown) => role !== 'admin' && role !== 'delivery';

export interface CustomerRow {
  uid: string;
  name: string;
  email: string;
  phone: string;
  /** Normalised WhatsApp number, or null when there is no usable number. */
  waNumber: string | null;
}

export function toCustomerRow(uid: string, data: Record<string, unknown>): CustomerRow {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const phone = str(data.whatsappNumber) || str(data.phone) || str(data.mobile);
  return {
    uid,
    name: str(data.fullName) || str(data.name) || str(data.username) || str(data.displayName),
    email: str(data.email),
    phone,
    waNumber: normalizeWhatsAppNumber(phone),
  };
}

/** How many WhatsApp messages a send would really make, and why others drop. */
export function countWhatsAppReach(rows: CustomerRow[], optedOut: Set<string>) {
  const seen = new Set<string>();
  let reach = 0;
  let noNumber = 0;
  let opted = 0;
  let duplicate = 0;
  for (const r of rows) {
    if (!r.waNumber) noNumber += 1;
    else if (optedOut.has(r.waNumber)) opted += 1;
    else if (seen.has(r.waNumber)) duplicate += 1;
    else {
      seen.add(r.waNumber);
      reach += 1;
    }
  }
  return { reach, noNumber, optedOut: opted, duplicate };
}

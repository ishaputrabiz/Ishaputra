/**
 * Admin-only WhatsApp endpoint: inbox replies, template management, media
 * proxy and setup status. Every action needs an admin Firebase ID token.
 *
 * POST /api/whatsapp-reply
 * Headers: Authorization: Bearer <Firebase ID token for an admin user>
 *
 * Body `action` (defaults to 'send' so older callers keep working):
 *   send              { phone, text? , template?: { name, language?, params?: string[],
 *                       headerImageUrl? } }  Image-header templates use the
 *                       template's saved picture unless headerImageUrl is given.
 *   send-media        { phone, media: { mime, filename, data (base64) }, caption? }
 *                     Uploads a photo (JPEG/PNG) or document (max 3 MB) to Meta
 *                     and sends it. Only inside the 24-hour reply window.
 *                     Free-form text only inside the 24 h window; outside it a
 *                     template is required.
 *   mark-read         { phone, messageId? }  Zero the unread count; if messageId is
 *                     given, also send a read receipt (blue ticks) to Meta.
 *   media             { mediaId, offset? }  Streams a media file (up to 25 MB) in
 *                     3.5 MB slices, since Vercel caps responses at 4.5 MB. The
 *                     X-Media-Next-Offset header says where the next slice starts.
 *   templates-list    { sync?: boolean = true }  Lists every template on the WABA
 *                     (all pages) and upserts them into `whatsappTemplates`.
 *   templates-create  { name, language, category, header?, body, footer?, buttons?,
 *                       paramLabels?, auth? }  Submits a template for Meta review.
 *   templates-delete  { name, metaId? }  Deletes a template (every language, or the
 *                     one language whose metaId is given).
 *   config-status     {}  Returns which env vars are set, as booleans only.
 *
 * Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_WABA_ID, FIREBASE_ADMIN_SDK_BASE64
 * (plus WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET, used by the webhook).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

export const META_GRAPH_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TEMPLATES_COLLECTION = 'whatsappTemplates';
/** Largest inbound file the inbox opens (WhatsApp video and audio max out at 16 MB). */
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
/** One response slice; Vercel refuses responses over 4.5 MB. */
const MEDIA_CHUNK_BYTES = 3.5 * 1024 * 1024;

// ===========================================================================
// Errors and small helpers
// ===========================================================================
export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function initAdmin() {
  if (admin.apps.length) return;
  const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
  if (!b64) throw new Error('FIREBASE_ADMIN_SDK_BASE64 env var is missing');
  const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
}

function getErrorMessage(err: unknown, fallback = 'Unexpected error') {
  return err instanceof Error ? err.message : fallback;
}

function readMetaMessageId(data: unknown) {
  return (data as { messages?: Array<{ id?: string }> }).messages?.[0]?.id || null;
}

function normalizePhone(input: unknown) {
  const digits = String(input || '').replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

/**
 * Turn a Graph API error body into one sentence an admin can act on.
 * Meta puts the human-readable text in `error_user_title` / `error_user_msg`
 * when it has one; otherwise `message` is the developer text.
 */
export function formatMetaError(data: unknown, httpStatus: number): { message: string; code?: number } {
  const err = (data as { error?: Record<string, unknown> | string })?.error;
  if (typeof err === 'string') return { message: err };
  if (!err) return { message: `Meta returned HTTP ${httpStatus}.` };
  const code = Number(err.code) || undefined;
  const sub = Number(err.error_subcode) || undefined;
  const title = typeof err.error_user_title === 'string' ? err.error_user_title : '';
  const userMsg = typeof err.error_user_msg === 'string' ? err.error_user_msg : '';
  const devMsg = typeof err.message === 'string' ? err.message : '';

  if (code === 190) {
    return { code, message: 'The WhatsApp token is invalid or has expired. Create a new permanent token (setup guide, step 4) and update WHATSAPP_TOKEN.' };
  }
  if (code === 10 || code === 200 || code === 294) {
    return { code, message: 'The token is missing a permission. Give the System User the whatsapp_business_management and whatsapp_business_messaging permissions (setup guide, step 4).' };
  }
  if (code === 4 || code === 80007 || code === 130429) {
    return { code, message: 'Meta rate limit reached. Wait a few minutes and try again.' };
  }
  if (code === 100 && sub === 33) {
    return { code, message: 'Meta cannot find that ID. Check WHATSAPP_WABA_ID / WHATSAPP_PHONE_ID (setup guide, step 5).' };
  }
  const human = [title, userMsg].filter(Boolean).join(': ');
  const base = human || devMsg || `Meta returned HTTP ${httpStatus}.`;
  return { code, message: code ? `${base} (Meta code ${code}${sub ? `/${sub}` : ''})` : base };
}

type FetchLike = typeof fetch;

/** Call the Graph API with the server token; throws HttpError with Meta's message. */
export async function metaRequest(
  url: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new HttpError(503, 'WHATSAPP_TOKEN is not set. See the setup guide, step 6.');
  const resp = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      // FormData and binary uploads set their own Content-Type.
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const { message, code } = formatMetaError(data, resp.status);
    // 4xx from Meta is almost always a fixable input/config problem.
    throw new HttpError(resp.status >= 400 && resp.status < 500 ? 400 : 502, message, { metaCode: code ?? null });
  }
  return data;
}

async function requireAdmin(req: VercelRequest, db: admin.firestore.Firestore) {
  const expected = process.env.ADMIN_NOTIFICATION_KEY;
  if (expected && req.headers['x-admin-key'] === expected) return null;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Unauthorized');

  const decoded = await admin.auth().verifyIdToken(token);
  const claims = decoded as admin.auth.DecodedIdToken & { admin?: boolean; role?: string };
  if (claims.admin === true || claims.role === 'admin') return decoded;

  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const role = userDoc.exists ? userDoc.data()?.role : null;
  if (role !== 'admin') throw new Error('Unauthorized');
  return decoded;
}

async function sendToMeta(payload: Record<string, unknown>) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!process.env.WHATSAPP_TOKEN || !phoneId) {
    throw new HttpError(503, 'WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID). See the setup guide, step 6.');
  }
  return metaRequest(`${META_BASE}/${phoneId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
}

// ===========================================================================
// Template validation (pure: unit-tested, mirrored in the admin form)
// ===========================================================================
export const TEMPLATE_LIMITS = {
  name: 512,
  body: 1024,
  header: 60,
  footer: 60,
  buttonText: 25,
  buttons: 10,
  urlButtons: 2,
  phoneButtons: 1,
  url: 2000,
  example: 200,
  label: 60,
} as const;

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateButtonInput =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone: string };

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  /** Text header, or an image header whose sample (and default picture) is `imageUrl`. */
  header?: { text: string } | { format: 'IMAGE'; imageUrl: string } | null;
  body?: { text: string; examples: string[] } | null;
  footer?: { text: string } | null;
  buttons?: TemplateButtonInput[];
  paramLabels?: string[];
  auth?: { addSecurityRecommendation?: boolean; codeExpirationMinutes?: number | null } | null;
}

const VAR_RE = /\{\{(\d+)\}\}/g;

/** Distinct variable numbers in order of first appearance. */
export function extractVariables(text: string): number[] {
  const seen: number[] = [];
  for (const m of String(text || '').matchAll(VAR_RE)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** True when the text has `{{`/`}}` that is not a well-formed `{{n}}`. */
function hasMalformedVariable(text: string) {
  const stripped = String(text || '').replace(VAR_RE, '');
  return stripped.includes('{{') || stripped.includes('}}');
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function validateTemplateInput(
  raw: unknown,
): { ok: true; value: TemplateInput } | { ok: false; errors: Record<string, string> } {
  const r = (raw || {}) as Record<string, any>;
  const errors: Record<string, string> = {};

  const name = str(r.name).trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > TEMPLATE_LIMITS.name) errors.name = `Name must be ${TEMPLATE_LIMITS.name} characters or fewer.`;
  else if (!/^[a-z0-9_]+$/.test(name)) errors.name = 'Use only lowercase letters, numbers and underscores (for example order_update_v2).';

  const language = str(r.language).trim();
  if (!/^[a-z]{2,3}(_[A-Z]{2,3})?$/.test(language)) errors.language = 'Use a language code like en, en_US, hi or te.';

  const category = str(r.category).trim().toUpperCase() as TemplateCategory;
  if (!TEMPLATE_CATEGORIES.includes(category)) errors.category = 'Pick Marketing, Utility or Authentication.';

  const labelsIn: string[] = Array.isArray(r.paramLabels) ? r.paramLabels.map((x: unknown) => str(x).trim()) : [];

  if (category === 'AUTHENTICATION') {
    const exp = r.auth?.codeExpirationMinutes;
    let codeExpirationMinutes: number | null = null;
    if (exp !== undefined && exp !== null && exp !== '') {
      const n = Number(exp);
      if (!Number.isInteger(n) || n < 1 || n > 90) errors['auth.codeExpirationMinutes'] = 'Code expiry must be a whole number from 1 to 90 minutes.';
      else codeExpirationMinutes = n;
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    return {
      ok: true,
      value: {
        name,
        language,
        category,
        auth: { addSecurityRecommendation: r.auth?.addSecurityRecommendation !== false, codeExpirationMinutes },
        paramLabels: ['One-time code'],
      },
    };
  }

  // ---- body
  const bodyText = str(r.body?.text).trim();
  const examplesIn: string[] = Array.isArray(r.body?.examples) ? r.body.examples.map((x: unknown) => str(x).trim()) : [];
  let vars: number[] = [];
  if (!bodyText) errors['body.text'] = 'Message text is required.';
  else if (bodyText.length > TEMPLATE_LIMITS.body) errors['body.text'] = `Message text must be ${TEMPLATE_LIMITS.body} characters or fewer.`;
  else if (hasMalformedVariable(bodyText)) errors['body.text'] = 'Variables must look exactly like {{1}}, {{2}} (no spaces or names inside the braces).';
  else {
    vars = extractVariables(bodyText);
    const sorted = [...vars].sort((a, b) => a - b);
    if (sorted.some((n, i) => n !== i + 1)) {
      errors['body.text'] = `Variables must be numbered in sequence starting at {{1}} (found ${sorted.map((n) => `{{${n}}}`).join(', ')}).`;
    } else if (/^\{\{\d+\}\}/.test(bodyText) || /\{\{\d+\}\}$/.test(bodyText)) {
      errors['body.text'] = 'Meta rejects text that starts or ends with a variable. Add words before the first or after the last variable.';
    }
  }
  const examples = vars.map((_, i) => examplesIn[i] || '');
  vars.forEach((_, i) => {
    if (!examples[i]) errors[`body.examples.${i}`] = `Add an example for {{${i + 1}}}. Meta needs one for every variable.`;
    else if (examples[i].length > TEMPLATE_LIMITS.example) errors[`body.examples.${i}`] = `Keep the example under ${TEMPLATE_LIMITS.example} characters.`;
    else if (/\{\{|\}\}/.test(examples[i])) errors[`body.examples.${i}`] = 'Examples cannot contain {{ or }}.';
  });

  // ---- header
  let header: TemplateInput['header'] = null;
  const headerText = str(r.header?.text).trim();
  if (str(r.header?.format).toUpperCase() === 'IMAGE') {
    const imageUrl = str(r.header?.imageUrl).trim();
    if (!isStoreMediaUrl(imageUrl)) errors['header.imageUrl'] = 'Upload the header picture again.';
    else header = { format: 'IMAGE', imageUrl };
  } else if (headerText) {
    if (headerText.length > TEMPLATE_LIMITS.header) errors['header.text'] = `Header must be ${TEMPLATE_LIMITS.header} characters or fewer.`;
    else if (/\{\{|\}\}/.test(headerText)) errors['header.text'] = 'Variables in the header are not supported here. Put them in the message text.';
    else if (/[\r\n]/.test(headerText)) errors['header.text'] = 'The header must be one line.';
    else header = { text: headerText };
  }

  // ---- footer
  let footer: TemplateInput['footer'] = null;
  const footerText = str(r.footer?.text).trim();
  if (footerText) {
    if (footerText.length > TEMPLATE_LIMITS.footer) errors['footer.text'] = `Footer must be ${TEMPLATE_LIMITS.footer} characters or fewer.`;
    else if (/\{\{|\}\}/.test(footerText)) errors['footer.text'] = 'The footer cannot contain variables.';
    else if (/[\r\n]/.test(footerText)) errors['footer.text'] = 'The footer must be one line.';
    else footer = { text: footerText };
  }

  // ---- buttons
  const buttonsIn: any[] = Array.isArray(r.buttons) ? r.buttons : [];
  const buttons: TemplateButtonInput[] = [];
  if (buttonsIn.length > TEMPLATE_LIMITS.buttons) errors.buttons = `At most ${TEMPLATE_LIMITS.buttons} buttons.`;
  let urlCount = 0;
  let phoneCount = 0;
  const seenText = new Set<string>();
  buttonsIn.slice(0, TEMPLATE_LIMITS.buttons).forEach((b, i) => {
    const type = str(b?.type).toUpperCase();
    const text = str(b?.text).trim();
    const key = `buttons.${i}`;
    if (!text) errors[`${key}.text`] = 'Button label is required.';
    else if (text.length > TEMPLATE_LIMITS.buttonText) errors[`${key}.text`] = `Button labels must be ${TEMPLATE_LIMITS.buttonText} characters or fewer.`;
    else if (seenText.has(text.toLowerCase())) errors[`${key}.text`] = 'Two buttons cannot have the same label.';
    seenText.add(text.toLowerCase());

    if (type === 'QUICK_REPLY') {
      buttons.push({ type, text });
    } else if (type === 'URL') {
      urlCount += 1;
      const url = str(b?.url).trim();
      let validUrl = false;
      try {
        const u = new URL(url);
        validUrl = (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname.includes('.');
      } catch {
        validUrl = false;
      }
      if (!url) errors[`${key}.url`] = 'Link is required.';
      else if (url.length > TEMPLATE_LIMITS.url) errors[`${key}.url`] = 'Link is too long.';
      else if (/\{\{|\}\}/.test(url)) errors[`${key}.url`] = 'Links with variables are not supported here yet. Use a fixed link.';
      else if (!validUrl) errors[`${key}.url`] = 'Enter a full link starting with https://';
      buttons.push({ type, text, url });
    } else if (type === 'PHONE_NUMBER') {
      phoneCount += 1;
      const phone = str(b?.phone).replace(/[\s()-]/g, '');
      if (!/^\+\d{8,15}$/.test(phone)) errors[`${key}.phone`] = 'Enter the number with country code, for example +919876543210.';
      buttons.push({ type, text, phone });
    } else {
      errors[`${key}.type`] = 'Button type must be Quick reply, Website link or Call phone number.';
    }
  });
  if (urlCount > TEMPLATE_LIMITS.urlButtons) errors.buttons = `At most ${TEMPLATE_LIMITS.urlButtons} website-link buttons.`;
  if (phoneCount > TEMPLATE_LIMITS.phoneButtons) errors.buttons = `At most ${TEMPLATE_LIMITS.phoneButtons} call button.`;

  const paramLabels = vars.map((_, i) => (labelsIn[i] || '').slice(0, TEMPLATE_LIMITS.label) || `Variable ${i + 1}`);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, language, category, header, body: { text: bodyText, examples }, footer, buttons, paramLabels },
  };
}

/** Meta `components` array for POST /{WABA_ID}/message_templates. */
export function buildTemplateComponents(t: TemplateInput, headerHandle?: string): Array<Record<string, unknown>> {
  if (t.category === 'AUTHENTICATION') {
    const comps: Array<Record<string, unknown>> = [
      { type: 'BODY', add_security_recommendation: t.auth?.addSecurityRecommendation !== false },
    ];
    if (t.auth?.codeExpirationMinutes) comps.push({ type: 'FOOTER', code_expiration_minutes: t.auth.codeExpirationMinutes });
    comps.push({ type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] });
    return comps;
  }
  const comps: Array<Record<string, unknown>> = [];
  if (t.header && 'text' in t.header && t.header.text) comps.push({ type: 'HEADER', format: 'TEXT', text: t.header.text });
  if (t.header && 'format' in t.header) {
    // The sample Meta reviews; set by handleTemplatesCreate after uploading it.
    comps.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle || ''] } });
  }
  const examples = t.body?.examples || [];
  comps.push({
    type: 'BODY',
    text: t.body?.text || '',
    ...(examples.length ? { example: { body_text: [examples] } } : {}),
  });
  if (t.footer?.text) comps.push({ type: 'FOOTER', text: t.footer.text });
  const buttons = t.buttons || [];
  if (buttons.length) {
    // Meta requires quick replies to be grouped together, not mixed with links.
    const ordered = [...buttons.filter((b) => b.type === 'QUICK_REPLY'), ...buttons.filter((b) => b.type !== 'QUICK_REPLY')];
    comps.push({
      type: 'BUTTONS',
      buttons: ordered.map((b) =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text, url: b.url }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }
            : { type: 'QUICK_REPLY', text: b.text },
      ),
    });
  }
  return comps;
}

// ===========================================================================
// Meta template list -> Firestore metadata
// ===========================================================================
export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  components: Array<Record<string, any>>;
  bodyText: string;
  headerText: string | null;
  /** TEXT, IMAGE, VIDEO, DOCUMENT or LOCATION; null without a header. */
  headerFormat: string | null;
  footerText: string | null;
  buttons: Array<{ type: string; text: string; url?: string; phone?: string }>;
  paramCount: number;
  examples: string[];
}

export function normalizeMetaTemplate(t: Record<string, any>): MetaTemplate {
  const components = Array.isArray(t.components) ? t.components : [];
  const find = (type: string) => components.find((c: any) => String(c?.type).toUpperCase() === type);
  const body = find('BODY');
  const header = find('HEADER');
  const footer = find('FOOTER');
  const btns = find('BUTTONS');
  const category = String(t.category || '').toUpperCase();
  let bodyText = str(body?.text);
  if (!bodyText && category === 'AUTHENTICATION') bodyText = '{{1}} is your verification code.';
  const rejected = str(t.rejected_reason);
  return {
    id: str(t.id),
    name: str(t.name),
    language: str(t.language),
    category,
    status: String(t.status || 'PENDING').toUpperCase(),
    rejectedReason: rejected && rejected !== 'NONE' ? rejected : null,
    components,
    bodyText,
    headerText: header && String(header.format || 'TEXT').toUpperCase() === 'TEXT' ? str(header.text) || null : header ? `[${String(header.format).toLowerCase()}]` : null,
    headerFormat: header ? String(header.format || 'TEXT').toUpperCase() : null,
    footerText: footer ? str(footer.text) || null : null,
    buttons: Array.isArray(btns?.buttons)
      ? btns.buttons.map((b: any) => ({
          type: String(b.type || '').toUpperCase(),
          text: str(b.text),
          ...(b.url ? { url: str(b.url) } : {}),
          ...(b.phone_number ? { phone: str(b.phone_number) } : {}),
        }))
      : [],
    paramCount: extractVariables(bodyText).length,
    examples: Array.isArray(body?.example?.body_text?.[0]) ? body.example.body_text[0].map(str) : [],
  };
}

/** Every template on the WABA, following `paging.next` (bounded). */
export async function listMetaTemplates(fetchImpl: FetchLike = fetch): Promise<MetaTemplate[]> {
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!waba) throw new HttpError(503, 'WHATSAPP_WABA_ID is not set. See the setup guide, steps 5 and 6.');
  const fields = 'id,name,language,category,status,components,rejected_reason';
  let url: string | null = `${META_BASE}/${encodeURIComponent(waba)}/message_templates?fields=${fields}&limit=100`;
  const out: MetaTemplate[] = [];
  for (let page = 0; url && page < 20; page += 1) {
    const data = await metaRequest(url, { method: 'GET' }, fetchImpl);
    const rows = Array.isArray(data.data) ? (data.data as Record<string, any>[]) : [];
    out.push(...rows.map(normalizeMetaTemplate));
    const next = (data.paging as { next?: string } | undefined)?.next;
    // Only follow Meta's own URLs: the request carries our token.
    url = next && next.startsWith('https://graph.facebook.com/') ? next : null;
  }
  return out;
}

/** Minimal Firestore surface used by the sync, so tests can pass a fake. */
interface FsDocSnap { id: string; data(): Record<string, any> | undefined }
interface FsBatch {
  set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown;
  delete(ref: unknown): unknown;
  commit(): Promise<unknown>;
}
export interface FsLike {
  collection(name: string): { get(): Promise<{ docs: FsDocSnap[] }>; doc(id: string): unknown };
  batch(): FsBatch;
}

/** Firestore doc for a Meta template, in the shape the inbox and broadcast read. */
export function templateDocFields(t: MetaTemplate, existing: Record<string, any> | undefined, now: unknown, labels?: string[]) {
  const prevLabels: string[] = Array.isArray(existing?.paramLabels) ? existing!.paramLabels : [];
  let paramLabels: string[];
  if (labels && labels.length === t.paramCount) paramLabels = labels;
  else if (prevLabels.length === t.paramCount) paramLabels = prevLabels;
  else paramLabels = Array.from({ length: t.paramCount }, (_, i) => prevLabels[i] || `Variable ${i + 1}`);
  return {
    name: t.name,
    language: t.language,
    // The app has always stored lowercase categories.
    category: t.category.toLowerCase(),
    paramLabels,
    status: t.status,
    rejectedReason: t.rejectedReason,
    metaId: t.id || null,
    source: 'meta',
    bodyText: t.bodyText,
    headerText: t.headerText,
    headerFormat: t.headerFormat,
    footerText: t.footerText,
    buttons: t.buttons,
    examples: t.examples,
    syncedAt: now,
    updatedAt: now,
  };
}

function pickDocId(t: { name: string; language: string }, docs: FsDocSnap[]) {
  const same = docs.find((d) => d.data()?.name === t.name && (d.data()?.language || 'en_US') === t.language);
  if (same) return same.id;
  const byName = docs.find((d) => d.id === t.name);
  return byName ? `${t.name}__${t.language}` : t.name;
}

export async function syncTemplatesToFirestore(db: FsLike, templates: MetaTemplate[], now: unknown) {
  const col = db.collection(TEMPLATES_COLLECTION);
  const snap = await col.get();
  const docs = [...snap.docs];
  const keep = new Set<string>();
  const ops: Array<(b: FsBatch) => void> = [];

  for (const t of templates) {
    const id = pickDocId(t, docs);
    keep.add(id);
    const existing = docs.find((d) => d.id === id);
    if (!existing) docs.push({ id, data: () => ({ name: t.name, language: t.language }) });
    const fields = templateDocFields(t, existing?.data(), now);
    ops.push((b) => b.set(col.doc(id), fields, { merge: true }));
  }
  let removed = 0;
  for (const d of snap.docs) {
    // Only remove what a previous sync created; manual entries stay as a fallback.
    if (d.data()?.source === 'meta' && !keep.has(d.id)) {
      removed += 1;
      ops.push((b) => b.delete(col.doc(d.id)));
    }
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { upserted: templates.length, removed };
}

/** Render a template body with params for the inbox timeline. */
export function renderTemplateText(bodyText: string, params: string[]) {
  return String(bodyText || '').replace(VAR_RE, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);
}

// ===========================================================================
// Media helpers
// ===========================================================================

/**
 * Pictures the server may fetch or hand to Meta: only files in the store's
 * own bucket (R2_PUBLIC_URL), so a request cannot point it at other hosts.
 */
export function isStoreMediaUrl(value: string, base = process.env.R2_PUBLIC_URL || '') {
  if (!value || !base) return false;
  try {
    const u = new URL(value);
    const b = new URL(base);
    return u.protocol === 'https:' && u.host === b.host && u.pathname.startsWith(b.pathname.replace(/\/$/, '') + '/');
  } catch {
    return false;
  }
}

/** What the team can send from the inbox, by MIME type. */
export const SENDABLE_MEDIA: Record<string, 'image' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'application/pdf': 'document',
  'text/plain': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
};
/** Base64 in a JSON body must stay under Vercel's 4.5 MB request limit. */
export const MAX_SEND_MEDIA_BYTES = 3 * 1024 * 1024;
const MAX_HEADER_IMAGE_BYTES = 5 * 1024 * 1024;

/** Body (and image header) parameters for a template send. */
export function templateSendComponents(params: string[], headerImageUrl?: string | null) {
  const comps: Array<Record<string, unknown>> = [];
  if (headerImageUrl) comps.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] });
  if (params.length) comps.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) });
  return comps;
}

/** The Meta app behind the token; needed for the resumable upload API. */
async function getAppId() {
  if (process.env.WHATSAPP_APP_ID) return process.env.WHATSAPP_APP_ID;
  try {
    const app = await metaRequest(`${META_BASE}/app`, { method: 'GET' });
    if (app.id) return str(app.id);
  } catch {
    /* fall through to the setup hint */
  }
  throw new HttpError(503, 'Could not work out the Meta app ID. Add WHATSAPP_APP_ID in Vercel (Meta app dashboard → App settings → Basic → App ID) and redeploy.');
}

/**
 * Upload a header sample with Meta's resumable upload API and return the
 * handle the template needs (example.header_handle).
 */
async function uploadHeaderSample(bytes: Buffer, mime: string, fileName: string) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new HttpError(503, 'WHATSAPP_TOKEN is not set. See the setup guide, step 6.');
  const appId = await getAppId();
  const qs = new URLSearchParams({ file_name: fileName, file_length: String(bytes.length), file_type: mime });
  const session = await metaRequest(`${META_BASE}/${encodeURIComponent(appId)}/uploads?${qs}`, { method: 'POST' });
  const sessionId = str(session.id);
  if (!sessionId.startsWith('upload:')) throw new HttpError(502, 'Meta did not start the picture upload.');
  const resp = await fetch(`${META_BASE}/${sessionId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': mime },
    body: new Uint8Array(bytes),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok || !data.h) {
    const { message, code } = formatMetaError(data, resp.status);
    throw new HttpError(502, `Meta did not accept the header picture: ${message}`, { metaCode: code ?? null });
  }
  return str(data.h);
}

/** Fetch a picture from the store's bucket, checking type and size. */
async function fetchStoreImage(url: string) {
  if (!isStoreMediaUrl(url)) throw new HttpError(400, 'Upload the header picture again.');
  const resp = await fetch(url);
  if (!resp.ok) throw new HttpError(502, `Could not read the header picture (HTTP ${resp.status}).`);
  const mime = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (mime !== 'image/jpeg' && mime !== 'image/png') throw new HttpError(400, 'The header picture must be a JPEG or PNG.');
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > MAX_HEADER_IMAGE_BYTES) throw new HttpError(400, 'The header picture must be 5 MB or smaller.');
  return { bytes, mime };
}

/** Free-form messages are only allowed for 24 h after the customer last wrote. */
async function assertReplyWindow(threadRef: admin.firestore.DocumentReference) {
  const threadSnap = await threadRef.get();
  const threadData = threadSnap.exists ? threadSnap.data() || {} : {};
  const windowClosesAt: admin.firestore.Timestamp | undefined = threadData.replyWindowClosesAt;
  const windowOpen = windowClosesAt ? windowClosesAt.toMillis() > Date.now() : false;
  if (!windowOpen) {
    throw new HttpError(409, 'Free-form reply window has closed. Send an approved template instead.', {
      replyWindowClosesAt: windowClosesAt?.toMillis() || null,
    });
  }
}

/**
 * Store an outbound message under Meta's message id (so the webhook finds it
 * when delivery/read statuses arrive) and bump the thread preview.
 */
async function recordOutbound(
  db: admin.firestore.Firestore,
  threadRef: admin.firestore.DocumentReference,
  phoneId: string,
  messageDoc: Record<string, unknown>,
  preview: string,
) {
  const recordedAt = admin.firestore.FieldValue.serverTimestamp();
  const wamid = messageDoc.providerMessageId ? String(messageDoc.providerMessageId) : '';
  const msgRef = wamid ? threadRef.collection('messages').doc(wamid) : threadRef.collection('messages').doc();
  const batch = db.batch();
  batch.set(msgRef, { ...messageDoc, createdAt: recordedAt, status: 'accepted' });
  batch.set(
    threadRef,
    {
      phone: phoneId,
      lastMessage: preview.slice(0, 200),
      lastMessageType: messageDoc.type,
      lastDirection: 'outbound',
      lastOutboundAt: recordedAt,
      lastOutboundMessageId: wamid || null,
      lastStatus: 'accepted',
      unreadCount: 0,
      updatedAt: recordedAt,
    },
    { merge: true },
  );
  await batch.commit();
  return wamid || null;
}

// ===========================================================================
// Action handlers
// ===========================================================================
type Ctx = {
  req: VercelRequest;
  res: VercelResponse;
  db: admin.firestore.Firestore;
  body: Record<string, any>;
  actor: { uid: string | null; email: string | null };
};

async function handleSend({ res, db, body, actor }: Ctx) {
  const phoneId = normalizePhone(body.phone);
  if (!phoneId) throw new HttpError(400, 'Missing phone');
  const wantsTemplate = !!body.template?.name;
  const text = str(body.text).trim();
  if (!wantsTemplate && !text) throw new HttpError(400, 'Provide text or template.');

  const threadRef = db.collection('whatsappThreads').doc(phoneId);
  if (!wantsTemplate) await assertReplyWindow(threadRef);

  const to = phoneId.replace(/^\+/, '');
  const messageDoc: Record<string, unknown> = { direction: 'outbound', actorUid: actor.uid, actorEmail: actor.email };

  if (wantsTemplate) {
    const t = body.template as { name?: string; language?: string; params?: unknown[]; headerImageUrl?: string };
    const tplName = str(t.name);
    const tplLang = str(t.language) || 'en_US';
    const params = (Array.isArray(t.params) ? t.params : []).map((p) => str(p));
    // Look the template up first: an image header needs its picture on every send.
    let tplData: Record<string, any> | undefined;
    try {
      const tplSnap = await db.collection(TEMPLATES_COLLECTION).where('name', '==', tplName).limit(10).get();
      const match = tplSnap.docs.find((d) => (d.data().language || 'en_US') === tplLang) || tplSnap.docs[0];
      tplData = match?.data();
    } catch {
      /* rendering is cosmetic; the header check below just will not apply */
    }
    let headerImageUrl: string | null = null;
    if (str(tplData?.headerFormat) === 'IMAGE') {
      headerImageUrl = str(t.headerImageUrl) || str(tplData?.headerImageUrl) || null;
      if (!headerImageUrl) {
        throw new HttpError(400, 'This template has a picture at the top. Add one in Marketing → Templates → Library (Set picture), then send again.');
      }
      if (!isStoreMediaUrl(headerImageUrl)) throw new HttpError(400, 'The template picture must be uploaded through the admin.');
    }
    const data = await sendToMeta({
      to,
      type: 'template',
      template: { name: tplName, language: { code: tplLang }, components: templateSendComponents(params, headerImageUrl) },
    });
    // Show the real wording in the timeline when we know the template body.
    const bodyText = str(tplData?.bodyText);
    messageDoc.type = 'template';
    messageDoc.template = { name: tplName, language: tplLang, params, ...(headerImageUrl ? { headerImageUrl } : {}) };
    messageDoc.providerMessageId = readMetaMessageId(data);
    messageDoc.text = bodyText ? renderTemplateText(bodyText, params) : `[template:${tplName}] ${params.join(' | ')}`;
  } else {
    const data = await sendToMeta({ to, type: 'text', text: { body: text.slice(0, 4096) } });
    messageDoc.type = 'text';
    messageDoc.text = text.slice(0, 4096);
    messageDoc.providerMessageId = readMetaMessageId(data);
  }

  const wamid = await recordOutbound(db, threadRef, phoneId, messageDoc, str(messageDoc.text));
  return res.status(200).json({ ok: true, messageId: wamid });
}

async function handleSendMedia({ res, db, body, actor }: Ctx) {
  const phoneId = normalizePhone(body.phone);
  if (!phoneId) throw new HttpError(400, 'Missing phone');
  const mime = str(body.media?.mime).toLowerCase();
  const kind = SENDABLE_MEDIA[mime];
  if (!kind) throw new HttpError(400, 'Send a JPEG or PNG photo, or a PDF, Word, Excel, PowerPoint or text file.');
  const bytes = Buffer.from(str(body.media?.data), 'base64');
  if (!bytes.length) throw new HttpError(400, 'The file is empty.');
  if (bytes.length > MAX_SEND_MEDIA_BYTES) throw new HttpError(413, 'Files sent from here can be up to 3 MB.');
  const filename = str(body.media?.filename).replace(/[\\/\r\n"]/g, '').trim().slice(0, 120) || (kind === 'image' ? 'photo.jpg' : 'document');
  const caption = str(body.caption).trim().slice(0, 1024);

  const threadRef = db.collection('whatsappThreads').doc(phoneId);
  await assertReplyWindow(threadRef);

  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
  if (!process.env.WHATSAPP_TOKEN || !phoneNumberId) {
    throw new HttpError(503, 'WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID). See the setup guide, step 6.');
  }
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const uploaded = await metaRequest(`${META_BASE}/${phoneNumberId}/media`, { method: 'POST', body: form });
  const mediaId = str(uploaded.id);
  if (!mediaId) throw new HttpError(502, 'Meta did not return a media id.');

  const to = phoneId.replace(/^\+/, '');
  const withCaption = caption ? { caption } : {};
  const data = await sendToMeta(
    kind === 'image'
      ? { to, type: 'image', image: { id: mediaId, ...withCaption } }
      : { to, type: 'document', document: { id: mediaId, filename, ...withCaption } },
  );
  const label = kind === 'image' ? 'Photo' : 'Document';
  const wamid = await recordOutbound(
    db,
    threadRef,
    phoneId,
    {
      direction: 'outbound',
      actorUid: actor.uid,
      actorEmail: actor.email,
      type: kind,
      text: caption || (kind === 'document' ? filename : ''),
      media: { id: mediaId, mimeType: mime, caption: caption || null, filename: kind === 'document' ? filename : null },
      providerMessageId: readMetaMessageId(data),
    },
    `${label}${caption ? `: ${caption}` : kind === 'document' ? `: ${filename}` : ''}`,
  );
  return res.status(200).json({ ok: true, messageId: wamid, mediaId });
}

async function handleMarkRead({ res, db, body }: Ctx) {
  const phoneId = normalizePhone(body.phone);
  if (!phoneId) throw new HttpError(400, 'Missing phone');
  await db
    .collection('whatsappThreads')
    .doc(phoneId)
    .set({ unreadCount: 0, lastReadAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  let receiptSent = false;
  const messageId = str(body.messageId);
  if (messageId && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
    try {
      await sendToMeta({ status: 'read', message_id: messageId });
      receiptSent = true;
    } catch {
      // A read receipt is best effort (Meta rejects very old message ids).
    }
  }
  return res.status(200).json({ ok: true, receiptSent });
}

const MEDIA_HOST_OK = (host: string) =>
  host.endsWith('.fbsbx.com') || host.endsWith('.facebook.com') || host.endsWith('.whatsapp.net') || host.endsWith('.fbcdn.net');

/**
 * Which slice of a media file to send. Vercel caps a response at 4.5 MB, so
 * bigger files go out in MEDIA_CHUNK_BYTES pieces that the admin page joins.
 */
export function mediaSlice(size: number, offset: number) {
  if (!Number.isFinite(offset) || offset < 0 || (size > 0 && offset >= size)) return null;
  const end = size > 0 ? Math.min(size, offset + MEDIA_CHUNK_BYTES) : offset + MEDIA_CHUNK_BYTES;
  return { start: offset, end, next: size > 0 && end < size ? end : null };
}

async function handleMedia({ res, body }: Ctx) {
  const mediaId = str(body.mediaId);
  if (!/^\d{5,30}$/.test(mediaId)) throw new HttpError(400, 'Invalid media id.');
  const offset = Number(body.offset || 0);
  const meta = await metaRequest(`${META_BASE}/${mediaId}`, { method: 'GET' });
  const url = str(meta.url);
  const size = Number(meta.file_size || 0);
  const mime = str(meta.mime_type) || 'application/octet-stream';
  if (size > MAX_MEDIA_BYTES) {
    throw new HttpError(413, `This file is larger than ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB, so it cannot be opened here. Open it in the WhatsApp Business app.`);
  }
  const slice = mediaSlice(size, offset);
  if (!slice) throw new HttpError(416, 'Invalid media offset.');
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (!host || !MEDIA_HOST_OK(host)) throw new HttpError(502, 'Meta returned an unexpected media link.');
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  // Ask for just this slice; if Meta ignores Range we cut it out ourselves.
  if (size > MEDIA_CHUNK_BYTES) headers.Range = `bytes=${slice.start}-${slice.end - 1}`;
  const fileResp = await fetch(url, { headers });
  if (!fileResp.ok) throw new HttpError(502, `Could not download the media from Meta (HTTP ${fileResp.status}). Media links expire after a while.`);
  let buf = Buffer.from(await fileResp.arrayBuffer());
  if (fileResp.status !== 206 && size > MEDIA_CHUNK_BYTES) buf = buf.subarray(slice.start, slice.end);
  if (buf.length > MEDIA_CHUNK_BYTES) throw new HttpError(413, 'This file is too large to open here.');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Media-Size', String(size || buf.length));
  if (slice.next !== null) res.setHeader('X-Media-Next-Offset', String(slice.next));
  return res.status(200).send(buf);
}

async function handleTemplatesList({ res, db, body }: Ctx) {
  const templates = await listMetaTemplates();
  let sync: { upserted: number; removed: number } | null = null;
  if (body.sync !== false) {
    sync = await syncTemplatesToFirestore(db as unknown as FsLike, templates, admin.firestore.FieldValue.serverTimestamp());
  }
  return res.status(200).json({
    ok: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      rejectedReason: t.rejectedReason,
      components: t.components,
      bodyText: t.bodyText,
      paramCount: t.paramCount,
    })),
    sync,
  });
}

async function handleTemplatesCreate({ res, db, body }: Ctx) {
  const waba = process.env.WHATSAPP_WABA_ID;
  const checked = validateTemplateInput(body);
  if (checked.ok === false) {
    const first = Object.values(checked.errors)[0];
    throw new HttpError(400, first || 'Invalid template.', { fieldErrors: checked.errors });
  }
  if (!waba) throw new HttpError(503, 'WHATSAPP_WABA_ID is not set. See the setup guide, steps 5 and 6.');
  const t = checked.value;
  let headerHandle: string | undefined;
  let headerImageUrl: string | null = null;
  if (t.header && 'format' in t.header) {
    headerImageUrl = t.header.imageUrl;
    const img = await fetchStoreImage(headerImageUrl);
    headerHandle = await uploadHeaderSample(img.bytes, img.mime, `${t.name}.${img.mime === 'image/png' ? 'png' : 'jpg'}`);
  }
  const payload: Record<string, unknown> = {
    name: t.name,
    language: t.language,
    category: t.category,
    components: buildTemplateComponents(t, headerHandle),
  };
  const data = await metaRequest(`${META_BASE}/${encodeURIComponent(waba)}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const created = normalizeMetaTemplate({
    id: data.id,
    name: t.name,
    language: t.language,
    category: data.category || t.category,
    status: data.status || 'PENDING',
    components: payload.components as Array<Record<string, unknown>>,
  });
  const col = db.collection(TEMPLATES_COLLECTION);
  const snap = await col.get();
  const id = pickDocId(created, snap.docs as unknown as FsDocSnap[]);
  const existing = snap.docs.find((d) => d.id === id)?.data();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await col.doc(id).set(
    { ...templateDocFields(created, existing, now, t.paramLabels), ...(headerImageUrl ? { headerImageUrl } : {}), createdAt: now },
    { merge: true },
  );

  return res.status(200).json({
    ok: true,
    template: { id: created.id, name: created.name, language: created.language, category: created.category, status: created.status },
  });
}

async function handleTemplatesDelete({ res, db, body }: Ctx) {
  const waba = process.env.WHATSAPP_WABA_ID;
  const name = str(body.name).trim();
  const metaId = str(body.metaId).trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new HttpError(400, 'Invalid template name.');
  if (metaId && !/^\d{1,30}$/.test(metaId)) throw new HttpError(400, 'Invalid template id.');
  if (!waba) throw new HttpError(503, 'WHATSAPP_WABA_ID is not set. See the setup guide, steps 5 and 6.');
  const qs = new URLSearchParams({ name, ...(metaId ? { hsm_id: metaId } : {}) });
  await metaRequest(`${META_BASE}/${encodeURIComponent(waba)}/message_templates?${qs}`, { method: 'DELETE' });

  const snap = await db.collection(TEMPLATES_COLLECTION).where('name', '==', name).get();
  const batch = db.batch();
  let removed = 0;
  snap.docs.forEach((d) => {
    if (metaId && d.data().metaId && d.data().metaId !== metaId) return;
    batch.delete(d.ref);
    removed += 1;
  });
  if (removed) await batch.commit();
  return res.status(200).json({ ok: true, removed });
}

export function configStatus(env: Record<string, string | undefined> = process.env) {
  const has = (k: string) => typeof env[k] === 'string' && env[k]!.trim().length > 0;
  return {
    WHATSAPP_TOKEN: has('WHATSAPP_TOKEN'),
    WHATSAPP_PHONE_ID: has('WHATSAPP_PHONE_ID'),
    WHATSAPP_WABA_ID: has('WHATSAPP_WABA_ID'),
    WHATSAPP_VERIFY_TOKEN: has('WHATSAPP_VERIFY_TOKEN'),
    WHATSAPP_APP_SECRET: has('WHATSAPP_APP_SECRET'),
    FIREBASE_ADMIN_SDK_BASE64: has('FIREBASE_ADMIN_SDK_BASE64'),
  };
}

async function handleConfigStatus({ res, db }: Ctx) {
  let webhookSeen = false;
  try {
    const snap = await db.collection('whatsappThreads').orderBy('lastInboundAt', 'desc').limit(1).get();
    webhookSeen = !snap.empty;
  } catch {
    webhookSeen = false;
  }
  return res.status(200).json({ ok: true, env: configStatus(), webhookSeen, graphVersion: META_GRAPH_VERSION });
}

const ACTIONS: Record<string, (ctx: Ctx) => Promise<unknown>> = {
  send: handleSend,
  'send-media': handleSendMedia,
  'mark-read': handleMarkRead,
  media: handleMedia,
  'templates-list': handleTemplatesList,
  'templates-create': handleTemplatesCreate,
  'templates-delete': handleTemplatesDelete,
  'config-status': handleConfigStatus,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = (req.body || {}) as Record<string, any>;
  const action = str(body.action) || 'send';
  const run = ACTIONS[action];
  if (!run) return res.status(400).json({ ok: false, error: 'Unknown action.' });

  try {
    initAdmin();
  } catch (err: unknown) {
    if (action === 'config-status') {
      // Without the admin SDK we cannot check who is asking, so report only that.
      return res.status(200).json({ ok: true, partial: true, env: { FIREBASE_ADMIN_SDK_BASE64: false } });
    }
    return res.status(500).json({ ok: false, error: 'Admin init failed', detail: getErrorMessage(err) });
  }
  const db = admin.firestore();
  let decoded: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    decoded = await requireAdmin(req, db);
  } catch {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const actor = {
    uid: decoded?.uid || (body.actorUid ? str(body.actorUid) : null),
    email: decoded?.email || (body.actorEmail ? str(body.actorEmail) : null),
  };

  try {
    await run({ req, res, db, body, actor });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ ok: false, error: err.message, ...(err.extra || {}) });
    }
    return res.status(502).json({ ok: false, error: getErrorMessage(err, 'Request failed') });
  }
}

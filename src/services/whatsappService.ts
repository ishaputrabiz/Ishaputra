/**
 * Client-side wrapper for the WhatsApp serverless endpoints.
 * Use these helpers instead of calling /api/whatsapp-* directly.
 */

const ADMIN_KEY_LS = 'adminNotificationKey';

interface TextOpts {
  to: string;
  text: string;
}
interface TemplateOpts {
  to: string;
  template: string;
  language?: string;
  params?: string[];
  /** Appended to the template's Dynamic button base URL (e.g. full Firestore orderId) */
  urlSuffix?: string;
}
interface OtpStartOpts {
  to: string;
}
interface OtpVerifyOpts {
  otpRef: string;
  otp: string;
}

export const normalizePhoneNumber = (input?: string) => {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
};

const adminHeaders = () => {
  const key = typeof localStorage !== 'undefined' ? localStorage.getItem(ADMIN_KEY_LS) || '' : '';
  return key ? { 'x-admin-key': key } : {};
};

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as T;
  if (!resp.ok) {
    const msg = (data as any)?.error || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

/** Send a free-form WhatsApp text (admin-gated). */
export const sendWhatsAppText = (opts: TextOpts) =>
  postJson<{ ok: boolean; messageId?: string }>(
    '/api/whatsapp-send',
    { kind: 'text', ...opts, to: normalizePhoneNumber(opts.to) },
    adminHeaders(),
  );

/** Send a pre-approved template message (admin-gated). */
export const sendWhatsAppTemplate = (opts: TemplateOpts) =>
  postJson<{ ok: boolean; messageId?: string }>(
    '/api/whatsapp-send',
    { kind: 'template', ...opts, to: normalizePhoneNumber(opts.to) },
    adminHeaders(),
  );

/**
 * Send one of the 4 approved order-notification templates without requiring
 * an admin key — the server allows these specific template names from any
 * authenticated user session.
 */
const sendOrderTemplate = (opts: TemplateOpts) =>
  postJson<{ ok: boolean; messageId?: string }>(
    '/api/whatsapp-send',
    { kind: 'template', ...opts, to: normalizePhoneNumber(opts.to) },
    // No admin header — the server allowlists these template names for public use
  );
// Note: urlSuffix is forwarded via spread (...opts) and consumed by the API to
// add a button component for Dynamic URL type Meta templates.

/** Trigger an OTP send. Returns an opaque otpRef to be passed back to verify. */
export const startWhatsAppOtp = (opts: OtpStartOpts) =>
  postJson<{ ok: boolean; otpRef: string }>('/api/whatsapp-send', {
    kind: 'otp',
    ...opts,
    to: normalizePhoneNumber(opts.to),
  });

/** Verify an OTP entered by the user. */
export const verifyWhatsAppOtp = (opts: OtpVerifyOpts) =>
  postJson<{ ok: boolean; verified: boolean; to?: string }>('/api/whatsapp-verify-otp', opts);

/**
 * Convenience: send a localised order status alert.
 * Skips silently if the recipient phone is missing.
 *
 * NOTE: the user's standing rule excludes OTP / security-sensitive messages
 * from going through this generic broadcast — those use startWhatsAppOtp.
 *
 * @deprecated Use sendOrderStatusTemplate for template-based sends.
 */
export const sendOrderStatusAlert = async (params: {
  to?: string;
  orderId: string;
  status: string;
  customerName?: string;
}) => {
  if (!params.to) return { ok: false, skipped: true } as const;
  const friendly: Record<string, string> = {
    pending: 'received and is awaiting confirmation',
    processing: 'is being prepared',
    shipped: 'has been shipped',
    assigned: 'has been assigned to a delivery partner',
    picked: 'has been picked up by our delivery partner',
    outForDelivery: 'is out for delivery',
    delivered: 'has been delivered',
    cancelled: 'was cancelled',
    returnRequested: 'return request has been received',
    returnScheduled: 'return has been scheduled',
    returned: 'return is complete',
  };
  const phrase = friendly[params.status] || `status changed to ${params.status}`;
  const name = params.customerName ? params.customerName.split(' ')[0] : 'there';
  const text =
    `Hi ${name}, your Sreerasthu Silvers order #${params.orderId.slice(-6).toUpperCase()} ${phrase}. ` +
    `Track it any time in your account.`;
  try {
    return await sendWhatsAppText({ to: params.to, text });
  } catch (err) {
    console.warn('[whatsapp] order status send failed:', err);
    return { ok: false, error: (err as Error).message } as const;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-approved Meta template helpers
// All are fire-and-forget wrappers — they never throw, never block order flow.
//
// ACTIVE TEMPLATES (create all in Meta WhatsApp Manager):
//
//  CUSTOMER
//    order_placed          {{1}}firstName {{2}}orderId {{3}}items {{4}}total
//    order_out_for_delivery {{1}}firstName {{2}}orderId {{3}}items
//    order_delivered        {{1}}firstName {{2}}orderId {{3}}items
//    order_cancelled        {{1}}firstName {{2}}orderId {{3}}items
//    order_return_update    {{1}}firstName {{2}}orderId {{3}}items {{4}}approved|rejected
//    order_timeslot         {{1}}firstName {{2}}orderId {{3}}date {{4}}timeRange
//
//  ADMIN
//    admin_new_order        {{1}}orderId {{2}}items {{3}}total {{4}}customerName
//    admin_order_delivered  {{1}}orderId {{2}}customerName
//    admin_return_requested {{1}}orderId {{2}}customerName {{3}}items
//    admin_return_picked    {{1}}orderId {{2}}items
//    admin_returned         {{1}}orderId {{2}}customerName {{3}}items
//
//  DELIVERY PARTNER
//    delivery_assigned      {{1}}partnerFirstName {{2}}orderId {{3}}items {{4}}address
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (orderId: string) => `#${orderId.slice(-6).toUpperCase()}`;
const firstName = (name?: string) => (name || 'there').split(' ')[0];

// ── CUSTOMER templates ────────────────────────────────────────────────────────

/** Order placed confirmation → customer */
export const sendOrderPlacedTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  total: number;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_confirmed',  // renamed due to Meta 4-week cooldown on deleted name
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items', String(Math.round(opts.total))],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_placed failed:', err); return { ok: false }; });
};

/** Out for delivery → customer */
export const sendOutForDeliveryTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_out_for_delivery',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_out_for_delivery failed:', err); return { ok: false }; });
};

/** Order delivered → customer */
export const sendOrderDeliveredTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_delivered',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_delivered failed:', err); return { ok: false }; });
};

/** Order cancelled → customer */
export const sendOrderCancelledTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_cancelled',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_cancelled failed:', err); return { ok: false }; });
};

/** Refund processed → customer
 *  Template: order_refunded  {{1}}firstName {{2}}orderId {{3}}items
 */
export const sendOrderRefundedTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_refunded',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_refunded failed:', err); return { ok: false }; });
};

/** Return approved or rejected → customer
 *  Template: order_return_update  {{1}}firstName {{2}}orderId {{3}}items {{4}}"approved"/"rejected"
 */
export const sendReturnUpdateTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  result: 'approved' | 'rejected';
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_return_update',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.itemsSummary || 'your items', opts.result],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_return_update failed:', err); return { ok: false }; });
};

/** Delivery time slot set → customer
 *  Template: order_timeslot  {{1}}firstName {{2}}orderId {{3}}date {{4}}timeRange (e.g. "9 AM – 12 PM")
 */
export const sendTimeslotTemplate = (opts: {
  to?: string;
  customerName: string;
  orderId: string;
  date: string;       // e.g. "30 Apr"
  timeRange: string;  // e.g. "9 AM – 12 PM"
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'order_timeslot',
    language: 'en',
    params: [firstName(opts.customerName), fmt(opts.orderId), opts.date, opts.timeRange],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] order_timeslot failed:', err); return { ok: false }; });
};

// ── ADMIN templates ───────────────────────────────────────────────────────────

/** New order → admin */
export const sendAdminNewOrderTemplate = (opts: {
  to?: string;
  orderId: string;
  total: number;
  customerName: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_order_alert',  // renamed due to Meta 4-week cooldown on deleted name
    language: 'en',
    params: [fmt(opts.orderId), opts.itemsSummary || 'items', String(Math.round(opts.total)), opts.customerName || 'a customer'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_new_order failed:', err); return { ok: false }; });
};

/** Order delivered → admin
 *  Template: admin_order_delivered  {{1}}orderId {{2}}customerName
 */
export const sendAdminOrderDeliveredTemplate = (opts: {
  to?: string;
  orderId: string;
  customerName: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_order_delivered',
    language: 'en',
    params: [fmt(opts.orderId), opts.customerName || 'a customer'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_order_delivered failed:', err); return { ok: false }; });
};

/** Return requested → admin
 *  Template: admin_return_requested  {{1}}orderId {{2}}customerName {{3}}items
 */
export const sendAdminReturnRequestedTemplate = (opts: {
  to?: string;
  orderId: string;
  customerName: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_return_requested',
    language: 'en',
    params: [fmt(opts.orderId), opts.customerName || 'a customer', opts.itemsSummary || 'items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_return_requested failed:', err); return { ok: false }; });
};

/** Low stock alert → admin
 *  Template: admin_low_stock_alert  {{1}}orderId {{2}}productName {{3}}stockLeft
 */
export const sendAdminLowStockTemplate = (opts: {
  to?: string;
  orderId: string;
  productName: string;
  stockLeft: number;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_low_stock_alert',
    language: 'en',
    params: [fmt(opts.orderId), opts.productName, String(opts.stockLeft)],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_low_stock_alert failed:', err); return { ok: false }; });
};

/** Return picked up by partner → admin
 *  Template: admin_return_picked  {{1}}orderId {{2}}items
 */
export const sendAdminReturnPickedTemplate = (opts: {
  to?: string;
  orderId: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_return_picked',
    language: 'en',
    params: [fmt(opts.orderId), opts.itemsSummary || 'items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_return_picked failed:', err); return { ok: false }; });
};

/** Return completed (item back at store) → admin
 *  Template: admin_returned  {{1}}orderId {{2}}customerName {{3}}items
 */
export const sendAdminReturnedTemplate = (opts: {
  to?: string;
  orderId: string;
  customerName: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'admin_returned',
    language: 'en',
    params: [fmt(opts.orderId), opts.customerName || 'a customer', opts.itemsSummary || 'items'],
    urlSuffix: opts.orderId,
  }).catch((err) => { console.warn('[whatsapp] admin_returned failed:', err); return { ok: false }; });
};

// ── DELIVERY PARTNER template ─────────────────────────────────────────────────

/** Delivery or return-pickup assigned → delivery partner
 *  Template: delivery_assigned  {{1}}partnerFirstName {{2}}orderId {{3}}items {{4}}address
 */
export const sendDeliveryAssignedTemplate = (opts: {
  to?: string;
  partnerName: string;
  orderId: string;
  deliveryAddress: string;
  itemsSummary?: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'delivery_new_task',  // renamed due to Meta 4-week cooldown on deleted name
    language: 'en',
    params: [firstName(opts.partnerName), fmt(opts.orderId), opts.itemsSummary || 'items', opts.deliveryAddress],
  }).catch((err) => { console.warn('[whatsapp] delivery_assigned failed:', err); return { ok: false }; });
};

// ── VIDEO CALL templates ──────────────────────────────────────────────────────

/** In-App video call started → customer gets deep link to join
 *  Template: video_call_inapp  {{1}}customerName {{2}}productTitle
 *  Button: Dynamic URL → base https://sreerasthusilvers-kkd.vercel.app/call/ + {{1}} = requestId
 */
export const sendVideoCallInAppTemplate = (opts: {
  to?: string;
  customerName: string;
  productTitle?: string;
  requestId: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  return sendOrderTemplate({
    to: opts.to,
    template: 'video_call_inapp',
    language: 'en',
    params: [opts.customerName || 'there', opts.productTitle || 'your product'],
    urlSuffix: opts.requestId,
  }).catch((err) => { console.warn('[whatsapp] video_call_inapp failed:', err); return { ok: false }; });
};

/** Google Meet confirmed → customer gets Meet link
 *  Template: video_call_meet  {{1}}customerName {{2}}productTitle
 *  Button: Dynamic URL → base https://meet.google.com/ + {{1}} = meeting code (e.g. eth-ptgj-rym)
 */
export const sendVideoCallMeetTemplate = (opts: {
  to?: string;
  customerName: string;
  productTitle?: string;
  meetUrl: string;
}): Promise<unknown> => {
  if (!opts.to) return Promise.resolve({ ok: false, skipped: true });
  // Extract the meeting code from full URL: https://meet.google.com/eth-ptgj-rym → eth-ptgj-rym
  const meetCode = opts.meetUrl.replace(/^https?:\/\/meet\.google\.com\//, '').split('?')[0];
  return sendOrderTemplate({
    to: opts.to,
    template: 'video_call_meet',
    language: 'en',
    params: [opts.customerName || 'there', opts.productTitle || 'your product'],
    urlSuffix: meetCode,
  }).catch((err) => { console.warn('[whatsapp] video_call_meet failed:', err); return { ok: false }; });
};

// ── Kept for backward-compat (deprecated) ────────────────────────────────────
/** @deprecated */
export const sendOrderStatusTemplate = sendOrderDeliveredTemplate as unknown as (opts: {
  to?: string; customerName: string; orderId: string; status: string; itemsSummary?: string;
}) => Promise<unknown>;

export const WhatsApp = {
  sendText: sendWhatsAppText,
  sendTemplate: sendWhatsAppTemplate,
  startOtp: startWhatsAppOtp,
  verifyOtp: verifyWhatsAppOtp,
  sendOrderStatusAlert,
};

export default WhatsApp;

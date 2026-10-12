/**
 * WhatsApp Template Test — calls Meta API directly (no server needed)
 * Usage:  node scripts/test-templates.mjs
 *
 * Reads WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and VITE_SITE_URL from .env.
 * Recipients: TEST_CUSTOMER_PHONE, TEST_ADMIN_PHONE, TEST_DELIVERY_PHONE
 * (digits with country code, e.g. 919876543210).
 */

import 'dotenv/config';
const TOKEN    = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
if (!TOKEN || !PHONE_ID) { console.error('Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env'); process.exit(1); }
const BASE     = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

// ── recipients ──────────────────────────────────────────────────────────────
const customer = process.env.TEST_CUSTOMER_PHONE;
const admin    = process.env.TEST_ADMIN_PHONE;
const delivery = process.env.TEST_DELIVERY_PHONE;
if (!customer || !admin) { console.error('Set TEST_CUSTOMER_PHONE and TEST_ADMIN_PHONE in .env'); process.exit(1); }

// fake orderId that will form the button deep link
const ORDER_ID = 'TESTORDER123ABC';
const SITE = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
const CUSTOMER_BASE = `${SITE}/account/orders/`;
const ADMIN_BASE    = `${SITE}/admin/orders/`;

async function send(label, to, templateName, bodyParams, urlSuffix = null) {
  const components = [];
  if (bodyParams.length) {
    components.push({ type: 'body', parameters: bodyParams.map(p => ({ type: 'text', text: p })) });
  }
  if (urlSuffix) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: urlSuffix }] });
  }
  const resp = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: 'en' }, components },
    }),
  });
  const data = await resp.json();
  if (resp.ok) {
    console.log(`✅  ${label} → sent  (id: ${data?.messages?.[0]?.id})`);
  } else {
    console.log(`❌  ${label} → FAILED`);
    console.log(`    Error: ${data?.error?.message || JSON.stringify(data?.error)}`);
  }
}

console.log('\n=== WhatsApp Template Test — all 13 templates ===\n');

// ── CUSTOMER ─────────────────────────────────────────────────────────────────
await send('order_confirmed → customer',        customer, 'order_confirmed',
  ['Priya', '#AB12CD', 'Herbal Hair Oil', '1299'], ORDER_ID);

await send('order_out_for_delivery → customer', customer, 'order_out_for_delivery',
  ['Priya', '#AB12CD', 'Herbal Hair Oil'],          ORDER_ID);

await send('order_delivered → customer',        customer, 'order_delivered',
  ['Priya', '#AB12CD', 'Herbal Hair Oil'],          ORDER_ID);

await send('order_cancelled → customer',        customer, 'order_cancelled',
  ['Priya', '#AB12CD', 'Herbal Hair Oil'],          ORDER_ID);

await send('order_refunded → customer',         customer, 'order_refunded',
  ['Priya', '#AB12CD', 'Herbal Hair Oil'],          ORDER_ID);

await send('order_return_update → customer',    customer, 'order_return_update',
  ['Priya', '#AB12CD', 'Herbal Hair Oil', 'approved'], ORDER_ID);

await send('order_timeslot → customer',         customer, 'order_timeslot',
  ['Priya', '#AB12CD', '30 Apr', '9 AM - 12 PM'], ORDER_ID);

// ── ADMIN ─────────────────────────────────────────────────────────────────────
await send('admin_order_alert → admin',         admin, 'admin_order_alert',
  ['#AB12CD', 'Herbal Hair Oil', '1299', 'Priya Nair'], ORDER_ID);

await send('admin_order_delivered → admin',     admin, 'admin_order_delivered',
  ['#AB12CD', 'Priya Nair'],                     ORDER_ID);

await send('admin_return_requested → admin',    admin, 'admin_return_requested',
  ['#AB12CD', 'Priya Nair', 'Herbal Hair Oil'],     ORDER_ID);

await send('admin_return_picked → admin',       admin, 'admin_return_picked',
  ['#AB12CD', 'Herbal Hair Oil'],                   ORDER_ID);

await send('admin_returned → admin',            admin, 'admin_returned',
  ['#AB12CD', 'Priya Nair', 'Herbal Hair Oil'],     ORDER_ID);

// ── DELIVERY PARTNER ─────────────────────────────────────────────────────────
// delivery_new_task has a Static button URL (no urlSuffix needed)
await send('delivery_new_task → partner',       delivery, 'delivery_new_task',
  ['Ravi', '#AB12CD', 'Herbal Hair Oil', '12 Road No. 1, Hyderabad'], null);

console.log('\nDone.\n');

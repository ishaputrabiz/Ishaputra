// WhatsApp Cloud API setup helper for Ishaputra. Reads secrets from ssecommerce/.env and never prints them.
// Usage (from ssecommerce/): node scripts/whatsapp-meta-setup.mjs .env <check|templates|templates-dry|register|subscribe|status|webhook>
import fs from 'node:fs';

const [envPath, cmd] = process.argv.slice(2);
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const G = 'https://graph.facebook.com/v21.0';
const TOKEN = env.WHATSAPP_TOKEN, WABA = env.WHATSAPP_WABA_ID, PHONE = env.WHATSAPP_PHONE_ID;
const SITE = 'https://www.ishaputra.in';

async function api(method, path, body, token = TOKEN) {
  const r = await fetch(`${G}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
const errMsg = (j) => j?.error ? `${j.error.code}/${j.error.error_subcode ?? ''} ${j.error.error_user_msg || j.error.message}` : '';

const urlBtn = (text, base, example) => ({ type: 'BUTTONS', buttons: [{ type: 'URL', text, url: `${base}{{1}}`, example: [`${base}${example}`] }] });
const body = (text, examples) => ({ type: 'BODY', text, example: { body_text: [examples] } });
const ORDER = `${SITE}/account/orders/`;
const T = (name, category, components) => ({ name, language: 'en', category, components });

const TEMPLATES = [
  T('order_confirmed', 'UTILITY', [
    body('Hi {{1}}, thank you for your order {{2}} with Ishaputra Botanicals.\n\nItems: {{3}}\nTotal: Rs {{4}}\n\nWe will message you when it is on the way.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1', '1499']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('order_out_for_delivery', 'UTILITY', [
    body('Hi {{1}}, your order {{2}} ({{3}}) is out for delivery today. Please keep your phone handy for the delivery partner.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1']),
    urlBtn('Track order', ORDER, 'AbC123xyz')]),
  T('order_delivered', 'UTILITY', [
    body('Hi {{1}}, your order {{2}} ({{3}}) has been delivered. Thank you for shopping with Ishaputra Botanicals.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('order_cancelled', 'UTILITY', [
    body('Hi {{1}}, your order {{2}} ({{3}}) has been cancelled. If you paid online, the refund goes back to your original payment method.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('order_refunded', 'UTILITY', [
    body('Hi {{1}}, the refund for your order {{2}} ({{3}}) has been processed. It can take a few working days to reach your account, depending on your bank.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('order_return_update', 'UTILITY', [
    body('Hi {{1}}, your return request for order {{2}} ({{3}}) has been {{4}}. Open your order to see the details.', ['Priya', '#A1B2C3', 'Shilajit Resin x 1', 'approved']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('order_timeslot', 'UTILITY', [
    body('Hi {{1}}, your order {{2}} is scheduled for delivery on {{3}} between {{4}}. Please keep your phone handy.', ['Priya', '#A1B2C3', '18 Oct 2026', '10 am and 1 pm']),
    urlBtn('View order', ORDER, 'AbC123xyz')]),
  T('admin_order_alert', 'UTILITY', [
    body('New order {{1}} on Ishaputra Botanicals.\n\nItems: {{2}}\nTotal: Rs {{3}}\nCustomer: {{4}}\n\nOpen the admin panel to process it.', ['#A1B2C3', 'Shilajit Resin x 1', '1499', 'Priya Sharma']),
    urlBtn('Open order', `${SITE}/admin/orders/`, 'AbC123xyz')]),
  T('admin_order_delivered', 'UTILITY', [
    body('Order {{1}} for {{2}} has been delivered successfully.', ['#A1B2C3', 'Priya Sharma'])]),
  T('admin_return_requested', 'UTILITY', [
    body('Return requested for order {{1}} by {{2}}.\n\nItems: {{3}}\n\nPlease review it in the admin panel.', ['#A1B2C3', 'Priya Sharma', 'Shilajit Resin x 1'])]),
  T('admin_low_stock_alert', 'UTILITY', [
    body('Low stock alert after order {{1}}: {{2}} has only {{3}} left in stock. Please restock soon.', ['#A1B2C3', 'Shilajit Resin', '2'])]),
  T('admin_return_picked', 'UTILITY', [
    body('The return for order {{1}} ({{2}}) has been picked up from the customer.', ['#A1B2C3', 'Shilajit Resin x 1'])]),
  T('admin_returned', 'UTILITY', [
    body('Return completed for order {{1}} from {{2}}.\n\nItems: {{3}}\n\nThe items are back with the store.', ['#A1B2C3', 'Priya Sharma', 'Shilajit Resin x 1'])]),
  T('delivery_new_task', 'UTILITY', [
    body('Hi {{1}}, a new delivery has been assigned to you.\n\nOrder: {{2}}\nItems: {{3}}\nAddress: {{4}}\n\nOpen the delivery app to start.', ['Ravi', '#A1B2C3', 'Shilajit Resin x 1', 'Road No. 12, Banjara Hills, Hyderabad'])]),
  T('video_call_inapp', 'UTILITY', [
    body('Hi {{1}}, your video call request for {{2}} is confirmed. Tap the button below to join the call on our website.', ['Priya', 'Shilajit Resin']),
    urlBtn('Join call', `${SITE}/call/`, 'AbC123xyz')]),
  T('video_call_meet', 'UTILITY', [
    body('Hi {{1}}, your video call for {{2}} is confirmed. Tap the button below to join on Google Meet.', ['Priya', 'Shilajit Resin']),
    urlBtn('Join on Meet', 'https://meet.google.com/', 'abc-defg-hij')]),
  // Same draft as src/components/admin/marketing/announcement.ts (announcementTemplateDraft)
  T('store_announcement', 'MARKETING', [
    body('Hello {{1}},\n\nHere is an update from Ishaputra Botanicals:\n\n{{2}}\n\nThank you for shopping with us.', ['Priya', 'Our new herbal hair oil is now on the website. Take a look this weekend.']),
    { type: 'FOOTER', text: 'Reply STOP to stop these updates' }]),
  // api/whatsapp-send.ts kind 'otp': body param = code, button 0 sub_type url = code
  T('otp_login', 'AUTHENTICATION', [
    { type: 'BODY', add_security_recommendation: true },
    { type: 'FOOTER', code_expiration_minutes: 10 },
    { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] }]),
];

async function listTemplates() {
  const r = await api('GET', `${WABA}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`);
  if (r.status !== 200) throw new Error(errMsg(r.j));
  return r.j.data || [];
}

const need = (...k) => { const miss = k.filter((x) => !env[x]); if (miss.length) { console.log('MISSING in .env:', miss.join(', ')); process.exit(2); } };

if (cmd === 'templates-dry') {
  for (const t of TEMPLATES) console.log(`\n[${t.category}] ${t.name}\n${t.components.find((c) => c.type === 'BODY').text || '(Meta standard OTP text)'}`);
} else if (cmd === 'check') {
  need('WHATSAPP_TOKEN', 'WHATSAPP_WABA_ID', 'WHATSAPP_PHONE_ID');
  const me = await api('GET', 'me?fields=id,name');
  console.log('token owner:', me.status, me.j.name || errMsg(me.j));
  const app = env.WHATSAPP_APP_ID && env.WHATSAPP_APP_SECRET ? `${env.WHATSAPP_APP_ID}|${env.WHATSAPP_APP_SECRET}` : null;
  if (app) {
    const d = await api('GET', `debug_token?input_token=${encodeURIComponent(TOKEN)}`, null, app);
    const x = d.j.data || {};
    console.log('token valid:', x.is_valid, '| expires:', x.expires_at === 0 ? 'never' : x.expires_at, '| scopes:', (x.scopes || []).join(','), d.status !== 200 ? errMsg(d.j) : '');
  } else console.log('app secret not set yet; skipping expiry check');
  const p = await api('GET', `${PHONE}?fields=display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,status`);
  console.log('phone:', p.status, JSON.stringify(p.j.error ? errMsg(p.j) : p.j));
} else if (cmd === 'register') {
  need('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'WHATSAPP_2FA_PIN');
  const r = await api('POST', `${PHONE}/register`, { messaging_product: 'whatsapp', pin: env.WHATSAPP_2FA_PIN });
  console.log('register:', r.status, r.j.success ?? errMsg(r.j));
} else if (cmd === 'subscribe') {
  need('WHATSAPP_TOKEN', 'WHATSAPP_WABA_ID');
  const r = await api('POST', `${WABA}/subscribed_apps`);
  console.log('subscribe app to WABA:', r.status, r.j.success ?? errMsg(r.j));
  const l = await api('GET', `${WABA}/subscribed_apps`);
  console.log('subscribed apps:', (l.j.data || []).map((a) => a.whatsapp_business_api_data?.name || a.whatsapp_business_api_data?.id).join(', '));
} else if (cmd === 'webhook') {
  need('WHATSAPP_APP_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN');
  const app = `${env.WHATSAPP_APP_ID}|${env.WHATSAPP_APP_SECRET}`;
  const r = await api('POST', `${env.WHATSAPP_APP_ID}/subscriptions`, {
    object: 'whatsapp_business_account', callback_url: `${SITE}/api/whatsapp-webhook`,
    verify_token: env.WHATSAPP_VERIFY_TOKEN, fields: 'messages',
  }, app);
  console.log('webhook:', r.status, r.j.success ?? errMsg(r.j));
  const l = await api('GET', `${env.WHATSAPP_APP_ID}/subscriptions`, null, app);
  console.log('subscriptions:', JSON.stringify((l.j.data || []).map((s) => ({ object: s.object, url: s.callback_url, active: s.active, fields: (s.fields || []).map((f) => f.name) }))));
} else if (cmd === 'templates') {
  need('WHATSAPP_TOKEN', 'WHATSAPP_WABA_ID');
  const existing = new Map((await listTemplates()).map((t) => [t.name, t]));
  for (const t of TEMPLATES) {
    if (existing.has(t.name)) { console.log(`skip ${t.name}: already ${existing.get(t.name).status}`); continue; }
    const r = await api('POST', `${WABA}/message_templates`, t);
    console.log(`${t.name}:`, r.status, r.j.status || errMsg(r.j), r.j.category && r.j.category !== t.category ? `(Meta set category ${r.j.category})` : '');
  }
} else if (cmd === 'status') {
  need('WHATSAPP_TOKEN', 'WHATSAPP_WABA_ID');
  for (const t of await listTemplates()) console.log(`${t.status.padEnd(9)} ${t.category.padEnd(14)} ${t.language} ${t.name}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ' reason=' + t.rejected_reason : ''}`);
} else {
  console.log('unknown command');
}

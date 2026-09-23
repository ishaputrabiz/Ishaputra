/**
 * Quick background-push validator — no UID required.
 * Finds the first token in the userTokens collection and sends a test push.
 *
 * Usage:  node scripts/test-push-any-token.mjs
 *
 * IMPORTANT:  Before running, open your site in Chrome and grant notification
 * permission so a token is stored in Firestore.
 * Then MINIMISE the browser window (or switch tab) and run this script.
 * You should see an OS notification pop up within ~5 seconds.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from 'dotenv';
import { existsSync } from 'fs';

// Load both .env and .env.local (.env.local overrides .env for shared keys)
config(); // load .env first
if (existsSync('.env.local')) config({ path: '.env.local', override: false }); // .env.local adds Vercel dev vars without overwriting .env secrets

const SDK_BASE64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
if (!SDK_BASE64) {
  console.error('❌ Missing FIREBASE_ADMIN_SDK_BASE64 in .env / .env.local');
  process.exit(1);
}

const sdk = JSON.parse(Buffer.from(SDK_BASE64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db = getFirestore(app);
const messaging = getMessaging(app);

// List all tokens (limit 20 for safety)
const snap = await db.collection('userTokens').limit(20).get();
if (snap.empty) {
  console.error('❌ No tokens in userTokens collection.\n   Open the site in Chrome, sign in, and allow notifications first.');
  process.exit(1);
}

const entries = snap.docs.map(d => ({ uid: d.data().uid, token: d.id || d.data().token }));
console.log(`Found ${entries.length} token(s):`);
entries.forEach((e, i) =>
  console.log(`  ${i + 1}. uid=${e.uid}  token=${e.token.slice(0, 20)}…`)
);

// Send to all found tokens
const tokens = entries.map(e => e.token).filter(Boolean);
const orderId = `test-${Date.now()}`;
const url = '/account/orders/' + orderId;

console.log('\nSending background push to all tokens…');
console.log('👉 MINIMISE your browser now to test background delivery!\n');

const resp = await messaging.sendEachForMulticast({
  tokens,
  notification: {
    title: '🔔 Web push is working!',
    body: 'Background notifications are enabled. Tap to open your orders.',
  },
  data: {
    orderId,
    audience: 'customer',
    url,
    type: 'order-test',
  },
  webpush: {
    fcmOptions: { link: url },
    notification: { tag: `order-${orderId}` },
    headers: { Urgency: 'high' },
  },
});

resp.responses.forEach((r, i) => {
  if (r.success) {
    console.log(`  ✅ ${tokens[i].slice(0, 20)}…  delivered (messageId: ${r.messageId})`);
  } else {
    console.log(`  ❌ ${tokens[i].slice(0, 20)}…  FAILED: ${r.error?.code} — ${r.error?.message}`);
  }
});

console.log(`\nResult: ${resp.successCount} delivered  |  ${resp.failureCount} failed`);

if (resp.successCount > 0) {
  console.log('\n✅ FCM accepted the message. If no OS notification appeared:');
  console.log('   1. Make sure the browser tab is NOT focused (minimise or switch tabs)');
  console.log('   2. Check Chrome: DevTools → Application → Service Workers');
  console.log('      → firebase-messaging-sw.js must be "activated and running"');
  console.log('   3. Windows: Settings → System → Notifications → Chrome must be ON');
} else {
  console.log('\n❌ All tokens failed. Tokens may be stale — reopen the site and re-grant permission.');
}

process.exit(0);

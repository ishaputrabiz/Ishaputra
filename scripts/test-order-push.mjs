/**
 * Local background-notification tester.
 *
 * Sends a single FCM web push with the exact payload shape used by
 * /api/notify-order, targeted at one Firebase user's registered tokens.
 *
 * Usage:
 *   node scripts/test-order-push.mjs <uid> [orderId] [audience]
 *
 * Examples:
 *   node scripts/test-order-push.mjs abc123XYZ
 *   node scripts/test-order-push.mjs abc123XYZ ord_456 customer
 *
 * What this verifies:
 *   1. The user has at least one valid token in userTokens/
 *   2. The service worker (public/firebase-messaging-sw.js) displays the
 *      notification when the tab is in the background or closed
 *   3. Click target (webpush.fcmOptions.link) routes the user back into
 *      the right page
 *
 * IMPORTANT: To verify *background* delivery, after running this script
 * you must minimise the browser window or switch to a different tab —
 * otherwise the foreground onMessage handler fires instead.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from 'dotenv';

config();

const [, , uidArg, orderIdArg, audienceArg] = process.argv;
if (!uidArg) {
  console.error('Usage: node scripts/test-order-push.mjs <uid> [orderId] [audience]');
  process.exit(1);
}

const SDK_BASE64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
if (!SDK_BASE64) {
  console.error('Missing FIREBASE_ADMIN_SDK_BASE64 in .env');
  process.exit(1);
}

const sdk = JSON.parse(Buffer.from(SDK_BASE64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db = getFirestore(app);
const messaging = getMessaging(app);

const orderId = orderIdArg || `test-${Date.now()}`;
const audience = audienceArg || 'customer';

const snap = await db.collection('userTokens').where('uid', '==', uidArg).get();
const tokens = snap.docs
  .map((d) => String(d.data().token || d.id || ''))
  .filter(Boolean);

if (!tokens.length) {
  console.error(`No tokens found for uid=${uidArg}. Sign in to the site and grant notification permission first.`);
  process.exit(1);
}

console.log(`Sending background push to ${tokens.length} device(s) for uid=${uidArg}`);

const url = `/account/orders/${orderId}`;
const resp = await messaging.sendEachForMulticast({
  tokens,
  notification: {
    title: 'Background push test',
    body: `If you can see this with the tab minimised, background notifications work. (audience=${audience})`,
  },
  data: {
    orderId,
    audience,
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
    console.log(`  ✅ ${tokens[i].slice(0, 12)}…  messageId=${r.messageId}`);
  } else {
    console.log(`  ❌ ${tokens[i].slice(0, 12)}…  ${r.error?.code} — ${r.error?.message}`);
  }
});

console.log(`\nResult: ${resp.successCount} delivered, ${resp.failureCount} failed`);
process.exit(0);

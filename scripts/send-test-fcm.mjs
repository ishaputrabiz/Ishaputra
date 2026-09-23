import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from 'dotenv';
config(); // Load .env — never hardcode secrets

const SDK_BASE64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
if (!SDK_BASE64) throw new Error('Missing FIREBASE_ADMIN_SDK_BASE64 in .env');

const sdk = JSON.parse(Buffer.from(SDK_BASE64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db = getFirestore(app);
const messaging = getMessaging(app);

// Get all real (non-synthetic) tokens
const snap = await db.collection('userTokens').get();
const realTokens = snap.docs
  .filter(d => !d.data().synthetic)
  .map(d => ({ token: d.id, uid: d.data().uid }));

console.log(`Found ${realTokens.length} real FCM tokens`);

let successCount = 0;
let staleCount = 0;

for (const { token, uid } of realTokens) {
  try {
    const msgId = await messaging.send({
      token,
      notification: {
        title: '📞 Incoming Video Call',
        body: 'TestCaller is calling you — tap to answer'
      },
      data: {
        callId: 'test-e2e-verification',
        callerUid: '2LVWsqclZxW38GMIOTFysjRuvZI3',
        callerName: 'TestCaller',
        type: 'video_call'
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: 'http://127.0.0.1:5173/call/test-e2e-verification' }
      }
    });
    console.log(`✅ FCM delivered  uid=${uid.slice(0,10)}... → messageId=${msgId}`);
    successCount++;
  } catch (e) {
    const code = e.errorInfo?.code || e.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      console.log(`⚠️  Stale token  uid=${uid.slice(0,10)}...  (browser unsubscribed)`);
      staleCount++;
    } else {
      console.log(`❌ Error  uid=${uid.slice(0,10)}...  ${e.message}`);
    }
  }
}

console.log(`\nSummary: ${successCount} delivered, ${staleCount} stale, ${realTokens.length} total`);
process.exit(0);

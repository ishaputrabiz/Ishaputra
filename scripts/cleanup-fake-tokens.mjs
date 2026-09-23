import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
config();
const sdk = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db = getFirestore(app);
const snap = await db.collection('userTokens').get();
const fakes = snap.docs.filter(d => {
  const token = d.id || d.data().token || '';
  return token.includes('synthetic') || token.includes('eTest_');
});
for (const doc of fakes) {
  await doc.ref.delete();
  console.log('Deleted fake token:', doc.id.slice(0, 30) + '...');
}
console.log(`Cleaned ${fakes.length} fake token(s).`);
process.exit(0);

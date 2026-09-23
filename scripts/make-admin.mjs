/**
 * Give a signed-up account the admin role.
 *
 *   node scripts/make-admin.mjs owner@example.com
 *
 * The security rules stop anyone from making themselves admin, so the first
 * admin has to be set from outside the app. Sign up on the site first, then run
 * this with the same email. Needs FIREBASE_ADMIN_SDK_BASE64 in .env.
 */
import 'dotenv/config';
import admin from 'firebase-admin';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.mjs <email>');
  process.exit(1);
}
if (!process.env.FIREBASE_ADMIN_SDK_BASE64) {
  console.error('FIREBASE_ADMIN_SDK_BASE64 missing from .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'))),
});

try {
  const user = await admin.auth().getUserByEmail(email);
  await admin.firestore().collection('users').doc(user.uid).set(
    { role: 'admin', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  console.log(`${email} (${user.uid}) is now an admin. Sign out and back in to see the admin panel at /admin.`);
} catch (err) {
  console.error(err.code === 'auth/user-not-found' ? `No account for ${email}. Sign up on the site first.` : err.message);
  process.exit(1);
}
process.exit(0);

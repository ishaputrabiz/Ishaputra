/**
 * Add empty testimonial slots for the team to fill with real customer words.
 *
 * They are created with status 'inactive', so nothing appears on the site until
 * somebody edits one in Admin > Testimonials and switches it on. Invented
 * customers are not written here: made-up reviews mislead shoppers, and India's
 * consumer-protection rules on fake reviews apply to a live shop.
 *
 *   node scripts/seed-testimonial-drafts.mjs --dry-run
 *   node scripts/seed-testimonial-drafts.mjs
 *
 * Re-running does not duplicate: slots are matched by their author line.
 */
import 'dotenv/config';
import admin from 'firebase-admin';

const DRY = process.argv.includes('--dry-run');
const b64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
if (!b64) {
  console.error('FIREBASE_ADMIN_SDK_BASE64 missing from .env');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
const db = admin.firestore();

const SLOT = (n) => ({
  title: '(paste the line the customer wrote)',
  quote: '(the rest of their message - WhatsApp, Google review or in store)',
  author: `Customer ${n} - replace this name`,
  role: 'Verified buyer',
  rating: 5,
  order: 100 + n,
  status: 'inactive',
  avatarType: 'avatar',
  avatarUrl: '',
});

const snap = await db.collection('testimonials').get();
const existing = new Set(snap.docs.map((d) => String(d.get('author') || '')));

let added = 0;
for (let n = 1; n <= 4; n += 1) {
  const slot = SLOT(n);
  if (existing.has(slot.author)) {
    console.log(`  = slot ${n} already there`);
    continue;
  }
  console.log(`  ${DRY ? '~' : '+'} slot ${n} (hidden until someone fills it in)`);
  if (!DRY) {
    await db.collection('testimonials').add({
      ...slot,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  added += 1;
}

// The one real entry says "verfied buyer".
const real = snap.docs.find((d) => String(d.get('role') || '').toLowerCase() === 'verfied buyer');
if (real) {
  console.log(`  ${DRY ? '~' : '+'} testimonials/${real.id}: role "verfied buyer" -> "Verified buyer"`);
  if (!DRY) await real.ref.update({ role: 'Verified buyer' });
}

console.log(`\n${DRY ? 'Would add' : 'Added'} ${added} hidden slot(s). Fill them in at /admin/testimonials.`);
process.exit(0);

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
config();

const SDK_BASE64 = process.env.FIREBASE_ADMIN_SDK_BASE64;
if (!SDK_BASE64) throw new Error('Missing FIREBASE_ADMIN_SDK_BASE64 in .env');

const sdk = JSON.parse(Buffer.from(SDK_BASE64, 'base64').toString());
const app = initializeApp({ credential: cert(sdk) });
const db = getFirestore(app);

// Fetch all approved reviews
const reviewsSnap = await db.collection('reviews')
  .where('status', '==', 'approved')
  .get();

console.log(`Found ${reviewsSnap.size} approved reviews`);

// Group by productId
const byProduct = {};
for (const doc of reviewsSnap.docs) {
  const { productId, rating } = doc.data();
  if (!productId || typeof rating !== 'number') continue;
  if (!byProduct[productId]) byProduct[productId] = [];
  byProduct[productId].push(rating);
}

const productIds = Object.keys(byProduct);
console.log(`Updating ${productIds.length} product(s)...`);

for (const productId of productIds) {
  const ratings = byProduct[productId];
  const totalReviews = ratings.length;
  const averageRating = Math.round((ratings.reduce((s, r) => s + r, 0) / totalReviews) * 10) / 10;

  await db.collection('products').doc(productId).update({
    rating: averageRating,
    reviewCount: totalReviews,
    reviews: totalReviews,
  });

  console.log(`  ✓ ${productId}: rating=${averageRating}, reviewCount=${totalReviews}`);
}

console.log('Done.');

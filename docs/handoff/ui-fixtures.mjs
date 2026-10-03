// UI-review fixtures for screenshots of logged-in pages (owner's OK, 2026-10-03).
// seed:   demo orders in every status for the preview shopper, plus a temporary admin
//         whose login is written to docs/handoff/admin.local (git-ignored).
// remove: deletes every fixture order, the temporary admin and admin.local.
// Everything is marked demo: true and uiFixture: true. Run from ssecommerce/:
//   node docs/handoff/ui-fixtures.mjs seed
//   node docs/handoff/ui-fixtures.mjs remove
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';

const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const T = admin.firestore.Timestamp;
const ADMIN_FILE = 'docs/handoff/admin.local';
const DAY = 86_400_000;
const HOUR = 3_600_000;

async function remove() {
  const orders = await db.collection('orders').where('uiFixture', '==', true).get();
  for (const d of orders.docs) await d.ref.delete();
  const users = await db.collection('users').where('uiFixture', '==', true).get();
  for (const u of users.docs) {
    await admin.auth().deleteUser(u.id).catch(() => {});
    await u.ref.delete();
  }
  if (existsSync(ADMIN_FILE)) unlinkSync(ADMIN_FILE);
  console.log(`removed ${orders.size} fixture orders and ${users.size} temporary admin(s)`);
}

async function seed() {
  await remove();
  const shopper = JSON.parse(readFileSync('docs/handoff/shopper.local', 'utf8'));
  const uid = (await admin.auth().getUserByEmail(shopper.email)).uid;
  const products = (await db.collection('products').where('flags.isActive', '==', true).limit(40).get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => Number(p.price) > 0 && !p.silverPricing?.enabled);
  if (products.length < 3) throw new Error('need at least 3 active products');
  const image = (p) => {
    const first = p.images?.[0];
    return typeof first === 'string' ? first : first?.url || p.image || '';
  };
  const line = (i, quantity = 1) => {
    const p = products[i % products.length];
    return { productId: p.id, name: p.name, image: image(p), price: Number(p.price), quantity };
  };
  const now = Date.now();
  const at = (msAgo) => T.fromMillis(now - msAgo);
  const address = {
    fullName: 'Preview Shopper', mobile: '9000000000', pincode: '500034',
    address: 'Flat 4B, Road No. 12', locality: 'Banjara Hills', city: 'Hyderabad', state: 'Telangana',
    landmark: 'Near the park', addressType: 'home',
  };
  const history = (steps) => steps.map(([status, msAgo, note]) => ({ status, timestamp: at(msAgo), ...(note ? { note } : {}) }));

  // [id suffix, status, placed ms ago, items, extra fields, history steps]
  const specs = [
    ['pending-cod', 'pending', 2 * HOUR, [line(0, 1)], { paymentMethod: 'Cash On Delivery', paymentStatus: 'pending' },
      [['pending', 2 * HOUR]]],
    ['processing', 'processing', 1 * DAY, [line(1, 2)], {},
      [['pending', 1 * DAY], ['processing', 20 * HOUR]]],
    ['packed', 'packed', 2 * DAY, [line(2, 1), line(3, 1)], {},
      [['pending', 2 * DAY], ['processing', 40 * HOUR], ['packed', 30 * HOUR]]],
    ['out-for-delivery', 'outForDelivery', 3 * DAY, [line(4, 1)], {
      carrier: 'Delhivery', trackingId: 'DLV7342190563',
      delivery_window_date: new Date(now).toISOString().slice(0, 10), delivery_window_from: '14:00', delivery_window_to: '17:00',
    }, [['pending', 3 * DAY], ['processing', 70 * HOUR], ['packed', 50 * HOUR], ['outForDelivery', 3 * HOUR]]],
    ['delivered', 'delivered', 5 * DAY, [line(5, 1), line(6, 2)], {
      deliveredAt: at(2 * DAY), pointsEarned: 24, pointsEarnedState: 'active', pointsUnlockAt: T.fromMillis(now + 5 * DAY),
    }, [['pending', 5 * DAY], ['processing', 4.5 * DAY], ['packed', 4 * DAY], ['outForDelivery', 2.2 * DAY], ['delivered', 2 * DAY]]],
    ['delivered-old', 'delivered', 16 * DAY, [line(7, 1)], {
      deliveredAt: at(12 * DAY), pointsEarned: 12, pointsEarnedState: 'active', pointsUnlockAt: at(5 * DAY),
    }, [['pending', 16 * DAY], ['processing', 15 * DAY], ['outForDelivery', 12.3 * DAY], ['delivered', 12 * DAY]]],
    ['cancelled', 'cancelled', 6 * DAY, [line(8, 1)], {
      paymentMethod: 'Cash On Delivery', paymentStatus: 'pending',
      cancellationReason: 'Ordered by mistake', cancelledAt: at(5.8 * DAY), cancelledBy: 'user',
    }, [['pending', 6 * DAY], ['cancelled', 5.8 * DAY, 'Cancelled by customer: Ordered by mistake']]],
    ['return-requested', 'returnRequested', 7 * DAY, [line(9, 1)], {
      deliveredAt: at(3 * DAY), returnReason: 'Seal was broken on arrival', returnRequestedAt: at(1 * DAY), returnStatus: 'pending',
      pointsEarned: 18, pointsEarnedState: 'held',
    }, [['pending', 7 * DAY], ['processing', 6.5 * DAY], ['outForDelivery', 3.2 * DAY], ['delivered', 3 * DAY], ['returnRequested', 1 * DAY]]],
    ['return-late', 'returnRequested', 14 * DAY, [line(10, 1)], {
      deliveredAt: at(10 * DAY), returnReason: 'Did not suit my skin', returnRequestedAt: at(2 * DAY), returnStatus: 'pending',
      pointsEarned: 9, pointsEarnedState: 'held',
    }, [['pending', 14 * DAY], ['processing', 13 * DAY], ['outForDelivery', 10.2 * DAY], ['delivered', 10 * DAY], ['returnRequested', 2 * DAY]]],
    ['return-scheduled', 'returnScheduled', 9 * DAY, [line(11, 1)], {
      deliveredAt: at(5 * DAY), returnReason: 'Wrong variant delivered', returnRequestedAt: at(3 * DAY), returnStatus: 'approved',
      returnApprovedAt: at(2 * DAY), returnScheduledAt: at(2 * DAY),
      return_window_date: new Date(now + DAY).toISOString().slice(0, 10), return_window_from: '10:00', return_window_to: '13:00',
      pointsEarned: 15, pointsEarnedState: 'held',
    }, [['pending', 9 * DAY], ['outForDelivery', 5.2 * DAY], ['delivered', 5 * DAY], ['returnRequested', 3 * DAY], ['returnScheduled', 2 * DAY]]],
    ['returned', 'returned', 20 * DAY, [line(0, 2)], {
      deliveredAt: at(15 * DAY), returnReason: 'Changed my mind', returnRequestedAt: at(13 * DAY), returnStatus: 'approved',
      returnApprovedAt: at(12 * DAY), pointsEarned: 20, pointsEarnedState: 'void',
    }, [['pending', 20 * DAY], ['delivered', 15 * DAY], ['returnRequested', 13 * DAY], ['returnScheduled', 12 * DAY], ['returned', 10 * DAY]]],
    ['refunded', 'refunded', 25 * DAY, [line(1, 1)], {
      deliveredAt: at(21 * DAY), paymentStatus: 'refunded', returnReason: 'Damaged bottle', returnRequestedAt: at(19 * DAY),
      returnStatus: 'approved', pointsEarned: 10, pointsEarnedState: 'void',
    }, [['pending', 25 * DAY], ['delivered', 21 * DAY], ['returnRequested', 19 * DAY], ['returned', 16 * DAY], ['refunded', 15 * DAY]]],
    ['delivery-failed', 'deliveryFailed', 4 * DAY, [line(2, 1)], {
      deliveryFailedAt: at(1 * DAY), deliveryFailureReason: 'Customer not reachable on phone',
    }, [['pending', 4 * DAY], ['processing', 3.5 * DAY], ['outForDelivery', 1.2 * DAY], ['deliveryFailed', 1 * DAY]]],
  ];

  let n = 0;
  for (const [suffix, status, placedAgo, items, extra, steps] of specs) {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryCharge = subtotal >= 999 ? 0 : 60;
    const discount = n % 3 === 1 ? Math.round(subtotal * 0.1) : 0;
    const id = `ui-fx-${suffix}`;
    await db.collection('orders').doc(id).set({
      demo: true, uiFixture: true,
      orderId: String(48210371 + n * 7919), userId: uid, userEmail: shopper.email, userName: 'Preview Shopper', userPhone: '+919000000000',
      items, subtotal, deliveryCharge, taxAmount: 0, discount, total: subtotal + deliveryCharge - discount,
      ...(discount ? { couponCode: 'WELCOME10', couponDiscount: discount, couponType: 'percent', couponValue: 10 } : {}),
      paymentMethod: 'Razorpay', paymentStatus: 'paid', razorpayOrderId: `order_uifx${n}`, razorpayPaymentId: `pay_uifx${n}`,
      shippingAddress: address, status,
      createdAt: at(placedAgo), updatedAt: at(steps[steps.length - 1][1]), lastUpdated: at(steps[steps.length - 1][1]),
      statusHistory: history(steps),
      ...extra,
    });
    console.log(`order ${id} (${status})`);
    n++;
  }

  const email = `ui-admin-${now}@ishaputra.test`;
  const password = randomBytes(18).toString('base64url');
  const user = await admin.auth().createUser({ email, password, emailVerified: true, displayName: 'UI Review Admin' });
  await db.doc(`users/${user.uid}`).set({ demo: true, uiFixture: true, role: 'admin', email, name: 'UI Review Admin', uid: user.uid });
  writeFileSync(ADMIN_FILE, JSON.stringify({ email, password, uid: user.uid,
    note: 'Temporary admin for UI screenshots. node docs/handoff/ui-fixtures.mjs remove deletes it.' }, null, 2));
  console.log(`temporary admin ${email} (login in ${ADMIN_FILE})`);
}

if (process.argv[2] === 'seed') await seed();
else if (process.argv[2] === 'remove') await remove();
else console.log('usage: node docs/handoff/ui-fixtures.mjs seed|remove');
process.exit(0);

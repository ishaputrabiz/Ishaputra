// Seeds a demo paid order (points + cashback + verified payment record) for the
// preview shopper, a second order whose total was "edited" (payment mismatch),
// a reserved points hold, and a temporary admin. Takes screenshots, then deletes
// everything it created. Run from ssecommerce/ with the dev server on BASE.
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const require = createRequire(`${ROOT}/package.json`);
require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const { chromium } = createRequire('C:/Users/chala/AppData/Roaming/npm/node_modules/playwright/package.json')('playwright');
const { cartKey } = await import(pathToFileURL(`${ROOT}/src/lib/rewards.ts`).href);

const BASE = process.argv[2] || 'http://127.0.0.1:5182';
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const shopper = JSON.parse(readFileSync('docs/handoff/shopper.local', 'utf8'));

const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const T = admin.firestore.Timestamp;
const now = Date.now();

const uid = (await admin.auth().getUserByEmail(shopper.email)).uid;
const prod = (await db.collection('products').where('flags.isActive', '==', true).limit(30).get())
  .docs.find((d) => Number(d.data().price) >= 300 && !d.data().silverPricing?.enabled);
const p = prod.data();
const price = Number(p.price);
const image = p.images?.[0]?.url || p.images?.[0] || p.image || '';
const items = [{ productId: prod.id, name: p.name, image: typeof image === 'string' ? image : '', price, quantity: 2 }];
const hash = createHash('sha256').update(cartKey(items)).digest('hex');

const rzpA = `order_shotA${now}`;
const rzpB = `order_shotB${now}`;
const rzpHold = `order_shotH${now}`;
const subtotal = price * 2;
const coupon = 100, delivery = 50, pointsUsed = 180, pointsValue = 90, cashback = 150;
const total = subtotal - coupon + delivery - pointsValue - cashback;
const addr = { fullName: 'Preview Shopper', mobile: '9000000000', pincode: '500001', address: '1 Demo Street',
  city: 'Hyderabad', state: 'Telangana', addressType: 'home' };
const order = (rzp, extra = {}) => ({
  demo: true, userId: uid, userEmail: shopper.email, userName: 'Preview Shopper', orderId: `SHOT-${rzp.slice(-5)}`,
  items, subtotal, discount: coupon, couponDiscount: coupon, couponCode: 'DEMO100', deliveryCharge: delivery,
  taxAmount: 0, total, pointsUsed, pointsValue, cashbackUsed: cashback, paymentMethod: 'Razorpay',
  paymentStatus: 'paid', razorpayOrderId: rzp, razorpayPaymentId: `pay_${rzp}`, shippingAddress: addr,
  status: 'delivered', createdAt: T.fromMillis(now - 3 * 864e5), updatedAt: T.now(), deliveredAt: T.fromMillis(now - 864e5),
  pointsEarned: 24, pointsEarnedState: 'active', pointsUnlockAt: T.fromMillis(now + 6 * 864e5), ...extra,
});
const payment = (rzp) => ({ demo: true, uid, razorpayOrderId: rzp, razorpayPaymentId: `pay_${rzp}`,
  amountPaise: total * 100, base: subtotal - coupon, points: pointsUsed, pointsValue, cashback, cartHash: hash,
  status: 'verified', verifiedAt: T.now(), source: 'screenshot' });

const ledger = db.collection('users').doc(uid).collection('rewardLedger');
const tmpEmail = `shot-admin-${now}@ishaputra.test`;
const tmpPass = randomBytes(18).toString('base64url');
let tmpUid = null;

try {
  await db.doc(`orders/${rzpA}`).set(order(rzpA));
  await db.doc(`payments/${rzpA}`).set(payment(rzpA));
  // B: the order document's total was raised after payment -> mismatch panel.
  const { pointsEarned, pointsEarnedState, pointsUnlockAt, deliveredAt, ...orderB } = order(rzpB, { total: total + 500, status: 'processing' });
  await db.doc(`orders/${rzpB}`).set(orderB);
  await db.doc(`payments/${rzpB}`).set(payment(rzpB));
  await ledger.doc(`earn_${rzpA}`).set({ demo: true, kind: 'earn', currency: 'points', amount: 24, status: 'active',
    note: `Earned on order SHOT-${rzpA.slice(-5)}`, orderId: rzpA, razorpayOrderId: rzpA,
    unlockAt: T.fromMillis(now + 6 * 864e5), createdAt: T.fromMillis(now - 864e5) });
  await ledger.doc(`spend_${rzpHold}_points`).set({ demo: true, kind: 'spend', currency: 'points', amount: -40,
    status: 'active', hold: true, holdUntil: T.fromMillis(now + 30 * 6e4), note: 'Points used at checkout',
    razorpayOrderId: rzpHold, unlockAt: T.now(), createdAt: T.now() });

  const tmp = await admin.auth().createUser({ email: tmpEmail, password: tmpPass, emailVerified: true });
  tmpUid = tmp.uid;
  await db.doc(`users/${tmpUid}`).set({ demo: true, role: 'admin', email: tmpEmail, name: 'Screenshot Admin', uid: tmpUid });

  const browser = await chromium.launch();
  const login = async (ctx, path, email, pass, after) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(after, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return page;
  };
  const shoot = async (page, url, name) => {
    await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
    // Wait for full-screen loaders and loading tiles to finish (dev server can take ~6 s).
    await page.waitForFunction(() => document.body.innerText.length > 300 && !document.querySelector('.min-h-screen > .animate-spin, .min-h-screen .animate-spin:only-child, [aria-busy="true"]'), null, { timeout: 30000 }).catch(() => console.log('still loading:', url));
    // Scroll through so scroll-revealed sections and lazy blocks (footer map) render as a visitor sees them.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log('shot', name);
  };

  for (const theme of ['light', 'dark']) {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
      await ctx.addInitScript((t) => localStorage.setItem('ishaputra-theme', t), theme);
      const c = await login(ctx, '/login', shopper.email, shopper.password, (u) => !/login/.test(u.pathname));
      await shoot(c, '/wallet', `wallet-${w}-${theme}`);
      await shoot(c, `/account/orders/${rzpA}`, `order-${w}-${theme}`);
      await ctx.close();

      const actx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
      await actx.addInitScript((t) => localStorage.setItem('ishaputra-theme', t), theme);
      const a = await login(actx, '/admin', tmpEmail, tmpPass, /dashboard/);
      await shoot(a, `/admin/orders/${rzpA}`, `admin-${w}-${theme}`);
      if (w === 1440 && theme === 'light') await shoot(a, `/admin/orders/${rzpB}`, `admin-mismatch-${w}-${theme}`);
      await actx.close();
    }
  }
  await browser.close();
} finally {
  for (const p of [`orders/${rzpA}`, `orders/${rzpB}`, `payments/${rzpA}`, `payments/${rzpB}`]) await db.doc(p).delete();
  await ledger.doc(`earn_${rzpA}`).delete();
  await ledger.doc(`spend_${rzpHold}_points`).delete();
  if (tmpUid) {
    await db.doc(`users/${tmpUid}`).delete();
    await admin.auth().deleteUser(tmpUid);
  }
  console.log('cleaned up');
}

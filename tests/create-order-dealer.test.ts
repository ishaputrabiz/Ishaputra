import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerCheck, loadDealer } from '../api/create-order.ts';
import { dealerQuote, normaliseDealerPricing } from '../src/lib/dealer.ts';
import { FakeFirestore } from './helpers/fakeFirestore.ts';

const ON = { enabled: true, minOrder: 2000 };
const P = normaliseDealerPricing({ discountPercent: 20 });
const big = dealerQuote([{ productId: 'a', unit: 800, quantity: 3 }], ON, P, true);
const small = dealerQuote([{ productId: 'a', unit: 800, quantity: 1 }], ON, P, true);

test('a matching dealer checkout goes on', () => {
  assert.equal(big.applies, true);
  assert.equal(dealerCheck(big, { pricing: 'dealer' }), null);
  assert.equal(dealerCheck(small, { pricing: 'retail', couponCode: 'SAVE10', usePoints: true }), null);
  assert.equal(dealerCheck(big, {}), null, 'an older page without pricing is left to the amount check');
});

test('pricing the browser did not expect is a 409 with the server pricing', () => {
  const r = dealerCheck(big, { pricing: 'retail' });
  assert.equal(r?.status, 409);
  assert.equal(r?.body.code, 'dealer_pricing_changed');
  assert.equal(r?.body.pricing, 'dealer');
  assert.equal(dealerCheck(small, { pricing: 'dealer' })?.body.pricing, 'retail');
});

test('coupons, points and cashback are refused on dealer prices', () => {
  for (const extra of [{ couponCode: 'SAVE10' }, { usePoints: true }, { useCashback: true }]) {
    const r = dealerCheck(big, { pricing: 'dealer', ...extra });
    assert.equal(r?.status, 400);
    assert.equal(r?.body.code, 'dealer_no_extras');
  }
  assert.equal(dealerCheck(big, { pricing: 'dealer', couponCode: '   ' }), null);
});

// ── loadDealer: only an approved dealer, with the programme on, gets dealer prices ──

const asDb = (db: FakeFirestore) => db as unknown as NonNullable<Parameters<typeof loadDealer>[2]>;
const RETAIL = { approved: false, pricing: null };

function shop(dealer?: Record<string, unknown>) {
  const db = new FakeFirestore();
  db.applySet('dealerPricing/current', { discountPercent: 25, productPrices: { a: 500 } }, false);
  if (dealer) db.applySet('dealers/cust1', dealer, false);
  return db;
}

test('an approved dealer gets the stored dealer prices', async () => {
  const r = await loadDealer('cust1', ON, asDb(shop({ status: 'approved' })));
  assert.equal(r.approved, true);
  assert.equal(r.pricing?.discountPercent, 25);
  assert.equal(r.pricing?.productPrices.a, 500);
});

test('any status other than approved is priced as retail, with no prices read out', async () => {
  for (const status of ['pending', 'rejected', 'suspended', 'APPROVED', '', undefined, null, true]) {
    assert.deepEqual(await loadDealer('cust1', ON, asDb(shop({ status }))), RETAIL, `status ${String(status)}`);
  }
});

test('no dealer record, a guest, or the programme off is retail', async () => {
  assert.deepEqual(await loadDealer('cust1', ON, asDb(shop())), RETAIL, 'no application');
  assert.deepEqual(await loadDealer(null, ON, asDb(shop({ status: 'approved' }))), RETAIL, 'signed out');
  assert.deepEqual(
    await loadDealer('cust1', { enabled: false, minOrder: 2000 }, asDb(shop({ status: 'approved' }))),
    RETAIL,
    'programme off',
  );
});

test("another customer's approval does not carry over", async () => {
  const db = shop({ status: 'approved' });
  assert.deepEqual(await loadDealer('cust2', ON, asDb(db)), RETAIL);
});

test('an approved dealer with no price document gets the default discount', async () => {
  const db = new FakeFirestore();
  db.applySet('dealers/cust1', { status: 'approved' }, false);
  const r = await loadDealer('cust1', ON, asDb(db));
  assert.equal(r.approved, true);
  assert.equal(r.pricing?.discountPercent, 20);
});

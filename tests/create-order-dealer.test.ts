import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerCheck } from '../api/create-order.ts';
import { dealerQuote, normaliseDealerPricing } from '../src/lib/dealer.ts';

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

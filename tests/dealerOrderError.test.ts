import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerPricingChangeMessage } from '../src/lib/dealerOrderError.ts';

const DEFAULT = 'Your dealer prices changed. Check the new total and pay again.';

test('409 dealer_pricing_changed is a pricing change, in the server words when it sends some', () => {
  assert.equal(dealerPricingChangeMessage(409, { code: 'dealer_pricing_changed', error: 'Prices moved.' }, 'retail'), 'Prices moved.');
  assert.equal(dealerPricingChangeMessage(409, { code: 'dealer_pricing_changed' }, 'dealer'), DEFAULT);
});

test('400 dealer_no_extras is a pricing change', () => {
  assert.equal(
    dealerPricingChangeMessage(400, { code: 'dealer_no_extras', error: "Coupons don't apply." }, 'dealer'),
    "Coupons don't apply.",
  );
  assert.equal(dealerPricingChangeMessage(400, { code: 'dealer_no_extras' }, 'dealer'), DEFAULT);
});

test('503 dealer_unavailable is a pricing change', () => {
  assert.equal(
    dealerPricingChangeMessage(503, { code: 'dealer_unavailable', error: 'Please try again.' }, 'retail'),
    'Please try again.',
  );
  assert.equal(dealerPricingChangeMessage(503, { code: 'dealer_unavailable' }, 'retail'), DEFAULT);
});

test('a dealer code on the wrong status is not a pricing change', () => {
  assert.equal(dealerPricingChangeMessage(500, { code: 'dealer_pricing_changed' }, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(400, { code: 'dealer_unavailable' }, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(409, { code: 'dealer_no_extras' }, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(409, { code: 'rewards_changed' }, 'dealer'), null);
});

test('"Order total mismatch" re-prices only when the request was dealer-priced', () => {
  assert.equal(dealerPricingChangeMessage(400, { error: 'Order total mismatch' }, 'dealer'), DEFAULT);
  assert.equal(dealerPricingChangeMessage(400, { error: 'order total mismatch: expected 123' }, 'dealer'), DEFAULT);
});

test('a retail "Order total mismatch", or none, stays a generic error', () => {
  assert.equal(dealerPricingChangeMessage(400, { error: 'Order total mismatch' }, 'retail'), null);
  assert.equal(dealerPricingChangeMessage(400, { error: 'Order total mismatch' }, undefined), null);
});

test('a dealer request with another 400, or a mismatch on another status, is generic', () => {
  assert.equal(dealerPricingChangeMessage(400, { error: 'Invalid items' }, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(500, { error: 'Order total mismatch' }, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(400, {}, 'dealer'), null);
  assert.equal(dealerPricingChangeMessage(400, null, 'dealer'), null);
});

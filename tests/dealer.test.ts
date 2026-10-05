import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEALER_PRICING,
  DEFAULT_DEALER_SETTINGS,
  dealerQuote,
  dealerUnitPrice,
  normaliseDealerPricing,
  normaliseDealerSettings,
} from '../src/lib/dealer.ts';

const ON = { enabled: true, minOrder: 2000 };
const P = normaliseDealerPricing({ discountPercent: 20, productPrices: { shilajit: 810 } });

test('defaults are the placeholders', () => {
  assert.deepEqual(DEFAULT_DEALER_SETTINGS, { enabled: false, minOrder: 2000 });
  assert.deepEqual(DEFAULT_DEALER_PRICING, { discountPercent: 20, productPrices: {} });
  assert.deepEqual(normaliseDealerSettings(null), { enabled: false, minOrder: 2000 });
  assert.deepEqual(normaliseDealerPricing(undefined), { discountPercent: 20, productPrices: {} });
});

test('normalise clamps and drops bad product prices', () => {
  assert.deepEqual(normaliseDealerSettings({ enabled: 'yes' as never, minOrder: -5 }), { enabled: false, minOrder: 0 });
  assert.equal(normaliseDealerSettings({ minOrder: '1500.6' as never }).minOrder, 1501);
  const p = normaliseDealerPricing({ discountPercent: 95, productPrices: { a: 100.555, b: 0, c: -1, d: 'x' as never } });
  assert.equal(p.discountPercent, 90);
  assert.deepEqual(p.productPrices, { a: 100.56 });
});

test('unit price: fixed price wins, capped at regular; else percent in whole rupees', () => {
  assert.equal(dealerUnitPrice('ashwa', 800, P), 640);
  assert.equal(dealerUnitPrice('ashwa', 799, P), 639);
  assert.equal(dealerUnitPrice('shilajit', 1150, P), 810);
  assert.equal(dealerUnitPrice('shilajit', 700, P), 700, 'a later sale never makes the dealer price higher');
  assert.equal(dealerUnitPrice('x', 1, P), 1);
  assert.equal(dealerUnitPrice('x', 0.5, P), 0.5);
  assert.equal(dealerUnitPrice('x', 0, P), 0);
  assert.equal(dealerUnitPrice('x', 800, normaliseDealerPricing({ discountPercent: 0 })), 800);
});

test('quote: not a dealer, or programme off, is regular prices', () => {
  const lines = [{ productId: 'ashwa', unit: 800, quantity: 3 }];
  for (const q of [dealerQuote(lines, ON, P, false), dealerQuote(lines, { ...ON, enabled: false }, P, true), dealerQuote(lines, ON, null, true)]) {
    assert.deepEqual(q, { applies: false, regularSubtotal: 2400, dealerSubtotal: 2400, subtotal: 2400, savings: 0, shortBy: 0, units: [800] });
  }
});

test('quote: at or above the threshold at regular prices, dealer prices apply', () => {
  const q = dealerQuote([{ productId: 'ashwa', unit: 800, quantity: 2 }, { productId: 'oil', unit: 400, quantity: 1 }], ON, P, true);
  assert.deepEqual(q, { applies: true, regularSubtotal: 2000, dealerSubtotal: 1600, subtotal: 1600, savings: 400, shortBy: 0, units: [640, 320] });
});

test('quote: below the threshold, regular prices and how much more is needed', () => {
  const q = dealerQuote([{ productId: 'shilajit', unit: 1150, quantity: 1 }, { productId: 'oil', unit: 400, quantity: 1 }], ON, P, true);
  assert.equal(q.applies, false);
  assert.equal(q.subtotal, 1550);
  assert.equal(q.dealerSubtotal, 1130);
  assert.equal(q.shortBy, 450);
  assert.deepEqual(q.units, [1150, 400]);
});

test('quote: no saving means no dealer pricing', () => {
  const q = dealerQuote([{ productId: 'x', unit: 2500, quantity: 1 }], ON, normaliseDealerPricing({ discountPercent: 0 }), true);
  assert.equal(q.applies, false);
  assert.equal(q.subtotal, 2500);
});

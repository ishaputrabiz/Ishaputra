import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerOrderTotals, dealerPriceError, parseDealerPrice } from '../src/lib/dealerPriceForm.ts';

test('a blank dealer price is valid and means no fixed price', () => {
  assert.equal(parseDealerPrice(''), null);
  assert.equal(parseDealerPrice('   '), null);
  assert.equal(dealerPriceError('', 800), undefined);
  assert.equal(dealerPriceError('  ', 800), undefined);
});

test('a price below the regular price with up to 2 decimals is valid', () => {
  assert.equal(parseDealerPrice('600'), 600);
  assert.equal(dealerPriceError('600', 800), undefined);
  assert.equal(dealerPriceError('799.99', 800), undefined);
  assert.equal(dealerPriceError('0.07', 800), undefined);
  assert.equal(dealerPriceError('600.5', 800), undefined);
});

test('zero, negative and unreadable prices are rejected', () => {
  assert.equal(dealerPriceError('0', 800), 'Must be more than ₹0');
  assert.equal(dealerPriceError('-5', 800), 'Must be more than ₹0');
  assert.equal(dealerPriceError('abc', 800), 'Must be more than ₹0');
  assert.equal(dealerPriceError('Infinity', 800), 'Must be more than ₹0');
});

test('more than 2 decimals is rejected', () => {
  assert.equal(dealerPriceError('600.555', 800), 'Use at most 2 decimal places');
  assert.equal(dealerPriceError('0.001', 800), 'Use at most 2 decimal places');
});

test('a price equal to or above the regular price is rejected, naming that price', () => {
  assert.equal(dealerPriceError('800', 800), 'Must be below the ₹800 price');
  assert.equal(dealerPriceError('850', 800), 'Must be below the ₹800 price');
  assert.equal(dealerPriceError('5000', 1499.5), 'Must be below the ₹1,499.5 price');
  assert.equal(dealerPriceError('1', 1250000), undefined);
});

test('with no regular price yet only the number itself is checked', () => {
  assert.equal(dealerPriceError('600', 0), undefined);
  assert.equal(dealerPriceError('600', Number.NaN), undefined);
  assert.equal(dealerPriceError('0', 0), 'Must be more than ₹0');
});

test('dealer order totals are the regular subtotal and the saving, to paise', () => {
  assert.deepEqual(dealerOrderTotals(3200, 2560), { regularSubtotal: 3200, savings: 640 });
  assert.deepEqual(dealerOrderTotals(1000.1, 800.05), { regularSubtotal: 1000.1, savings: 200.05 });
  // Floating-point noise rounds away: 0.3 - 0.1 is 0.19999999999999998.
  assert.deepEqual(dealerOrderTotals(0.3, 0.1), { regularSubtotal: 0.3, savings: 0.2 });
});

test('dealer order totals are hidden when there is nothing to show', () => {
  assert.equal(dealerOrderTotals(undefined, 2560), null);
  assert.equal(dealerOrderTotals('x', 2560), null);
  assert.equal(dealerOrderTotals(0, 0), null);
  assert.equal(dealerOrderTotals(2560, 2560), null);
  assert.equal(dealerOrderTotals(2560, 3000), null);
  assert.equal(dealerOrderTotals(2560.004, 2560), null);
});

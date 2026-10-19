import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showsCartPill } from '../src/lib/cartPill.ts';

test('the View cart pill shows on the shopping pages', () => {
  for (const path of ['/', '/category/learning-kits', '/products', '/search-results', '/wishlist', '/categories']) {
    assert.equal(showsCartPill(path), true, path);
  }
});

test('the pill stays off where it would cover a page\'s own bar or make no sense', () => {
  // The product page has its own sticky Buy bar; checkout is the cart; admin, account and sign-in are not shopping.
  for (const path of ['/product/abc', '/checkout', '/cart', '/admin', '/admin/orders', '/account', '/account/orders/1', '/login', '/delivery']) {
    assert.equal(showsCartPill(path), false, path);
  }
});

test('a look-alike path is not mistaken for a shopping page', () => {
  assert.equal(showsCartPill('/productsx'), false);
  assert.equal(showsCartPill('/category'), true);
});

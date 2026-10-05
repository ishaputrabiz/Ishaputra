import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createDealerStore, dealerPayHold, dealerPricingUncertain, type DealerSources } from '../src/lib/dealerState.ts';
import { normaliseDealerPricing, type DealerPricing, type DealerSettings } from '../src/lib/dealer.ts';

/**
 * Money review B, B1 and B3: what the checkout knows about a customer's dealer
 * state, and when it holds payment. A read that fails, or an empty answer from
 * the offline cache, is "could not confirm", never "not a dealer" and never a
 * default 20%. Payment waits only for carts a dealer could be priced
 * differently on, and a customer with no dealer record is never blocked.
 */

type Rec = Parameters<Parameters<DealerSources['subscribeRecord']>[1]>[0];
const ON: DealerSettings = { enabled: true, minOrder: 2000 };
const OFF: DealerSettings = { enabled: false, minOrder: 2000 };
const APPROVED = { status: 'approved', businessName: 'Acme', gstin: '' } as unknown as NonNullable<Rec>;
const PRICES: DealerPricing = { discountPercent: 30, productPrices: {} };

/** Fake listeners the test drives by hand. */
function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settings = { next: null as null | ((s: DealerSettings, answered: boolean) => void), error: null as null | ((e: Error) => void), starts: 0 };
  const record = { next: null as null | ((r: Rec, answered: boolean) => void), error: null as null | ((e: Error) => void), starts: 0 };
  const prices = { next: null as null | ((p: DealerPricing, answered: boolean) => void), error: null as null | ((e: Error) => void), starts: 0 };
  const sources: DealerSources = {
    subscribeSettings(next, error) {
      settings.next = next;
      settings.error = error;
      settings.starts++;
      return () => {};
    },
    subscribeRecord(_uid, next, error) {
      record.next = next;
      record.error = error;
      record.starts++;
      return () => {};
    },
    subscribePricing(next, error) {
      prices.next = next;
      prices.error = error;
      prices.starts++;
      return () => {};
    },
  };
  const store = createDealerStore(sources, { pricingRetryMs: 2000 });
  store.watch('u1');
  return { store, settings, record, prices, wait: () => t.mock.timers.tick(2000) };
}
const boom = new Error('permission-denied');

test('a customer with no dealer record is simply not a dealer', (t) => {
  const { store, settings, record } = setup(t);
  assert.equal(store.getState().ready, false);
  settings.next!(ON, true);
  record.next!(null, true);
  const d = store.getState();
  assert.equal(d.ready, true);
  assert.equal(d.unavailable, false);
  assert.equal(d.active, false);
  assert.equal(dealerPayHold(d, 50_000), null);
});

test('B3: a settings read that fails is unavailable, never a hold when the minimum was never known', (t) => {
  const { store, settings, record } = setup(t);
  settings.error!(boom);
  record.next!(null, true);
  const d = store.getState();
  assert.equal(d.ready, true, 'the page does not wait for ever');
  assert.equal(d.unavailable, true);
  assert.equal(d.minOrder, null);
  assert.equal(dealerPayHold(d, 1_000_000), null, 'a signed-in customer with no dealer record is never blocked');
  assert.equal(dealerPricingUncertain(d, 1_000_000), false);
});

test('B3: a dealer-record read error holds payment from the minimum up, not below it', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!(ON, true);
  record.error!(boom);
  const d = store.getState();
  assert.equal(d.ready, true);
  assert.equal(d.unavailable, true);
  assert.equal(d.active, false);
  assert.equal(d.minOrder, 2000);
  assert.equal(dealerPayHold(d, 2000), 'Dealer prices unavailable', 'at the minimum');
  assert.equal(dealerPayHold(d, 1999.99), null, 'below it retail is right');
});

test('B3: an empty answer from the offline cache is not "not a dealer"', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!(ON, true);
  record.next!(null, false); // fromCache and missing
  assert.equal(store.getState().ready, true);
  assert.equal(store.getState().unavailable, true);
  assert.equal(dealerPayHold(store.getState(), 5000), 'Dealer prices unavailable');
  // The server answers: this customer has no record after all.
  record.next!(null, true);
  assert.equal(store.getState().unavailable, false);
  assert.equal(dealerPayHold(store.getState(), 5000), null);
});

test('B3: settings answered only from the offline cache are not "programme off"', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!(OFF, false);
  record.next!(null, true);
  assert.equal(store.getState().unavailable, true);
  assert.equal(store.getState().minOrder, null);
  assert.equal(dealerPayHold(store.getState(), 9999), null);
  settings.next!(ON, true);
  assert.equal(store.getState().unavailable, false);
  assert.equal(store.getState().minOrder, 2000);
});

test('B3: the programme being off means a record problem changes nothing', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!(OFF, true);
  record.error!(boom);
  assert.equal(store.getState().unavailable, false);
  assert.equal(dealerPayHold(store.getState(), 9999), null);
});

test('B3: the last known settings stand when a later read fails', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!({ enabled: true, minOrder: 3000 }, true);
  record.next!(null, true);
  settings.error!(boom);
  const d = store.getState();
  assert.equal(d.settings.minOrder, 3000);
  assert.equal(d.minOrder, 3000);
  assert.equal(d.unavailable, true);
  assert.equal(dealerPayHold(d, 2999), null);
  assert.equal(dealerPayHold(d, 3000), 'Dealer prices unavailable');
});

test('B1: an approved dealer whose prices cannot be read is held only from the minimum up', (t) => {
  const { store, settings, record, prices, wait } = setup(t);
  settings.next!(ON, true);
  record.next!(APPROVED, true);
  assert.equal(store.getState().ready, false, 'prices still loading');
  prices.error!(boom);
  assert.equal(store.getState().ready, false, 'the one automatic retry is pending');
  wait();
  prices.error!(boom);
  const d = store.getState();
  assert.equal(d.ready, true);
  assert.equal(d.pricingError, true);
  assert.equal(d.unavailable, true);
  assert.equal(d.active, false);
  assert.equal(dealerPayHold(d, 2500), 'Dealer prices unavailable');
  assert.equal(dealerPayHold(d, 1000), null, 'under the minimum the regular price is the right price');
});

test('B3: prices answered only from the offline cache are not the default percent', (t) => {
  const { store, settings, record, prices } = setup(t);
  settings.next!(ON, true);
  record.next!(APPROVED, true);
  prices.next!(normaliseDealerPricing(null), false); // missing in the cache: the default 20%, not an answer
  let d = store.getState();
  assert.equal(d.pricing, null);
  assert.equal(d.active, false);
  assert.equal(d.ready, true);
  assert.equal(d.pricingError, true);
  assert.equal(dealerPayHold(d, 2500), 'Dealer prices unavailable');
  // The server then answers with the real prices.
  prices.next!(PRICES, true);
  d = store.getState();
  assert.equal(d.active, true);
  assert.equal(d.pricing?.discountPercent, 30);
  assert.equal(d.unavailable, false);
  assert.equal(dealerPayHold(d, 2500), null);
});

test('B3: a price document the server says is missing still means the default percent (the server uses it too)', (t) => {
  const { store, settings, record, prices } = setup(t);
  settings.next!(ON, true);
  record.next!(APPROVED, true);
  prices.next!(normaliseDealerPricing(null), true);
  assert.equal(store.getState().active, true);
  assert.equal(store.getState().pricing?.discountPercent, 20);
});

test('Retry subscribes again to whatever failed', (t) => {
  const { store, settings, record, prices } = setup(t);
  settings.error!(boom);
  record.error!(boom);
  assert.equal(settings.starts, 1);
  assert.equal(record.starts, 1);
  store.retry();
  assert.equal(settings.starts, 2);
  assert.equal(record.starts, 2);
  assert.equal(store.getState().ready, false, 'checking again');
  settings.next!(ON, true);
  record.next!(APPROVED, true);
  prices.next!(PRICES, true);
  const d = store.getState();
  assert.equal(d.ready, true);
  assert.equal(d.unavailable, false);
  assert.equal(d.active, true);
  // Nothing failed now: Retry does not restart healthy listeners.
  store.retry();
  assert.equal(settings.starts, 2);
  assert.equal(record.starts, 2);
});

test('Retry after the prices failed subscribes to the prices again', (t) => {
  const { store, settings, record, prices, wait } = setup(t);
  settings.next!(ON, true);
  record.next!(APPROVED, true);
  prices.error!(boom);
  wait();
  prices.error!(boom);
  assert.equal(store.getState().unavailable, true);
  const before = prices.starts;
  store.retry();
  assert.equal(prices.starts, before + 1);
  prices.next!(PRICES, true);
  assert.equal(store.getState().unavailable, false);
  assert.equal(store.getState().active, true);
});

test('a different customer never sees the last one\'s state', (t) => {
  const { store, settings, record } = setup(t);
  settings.next!(ON, true);
  record.error!(boom);
  assert.equal(store.getState().unavailable, true);
  store.watch('u2');
  const d = store.getState();
  assert.equal(d.ready, false);
  assert.equal(d.unavailable, false);
  store.watch(null);
  assert.equal(store.getState().signedIn, false);
  assert.equal(store.getState().unavailable, false);
});

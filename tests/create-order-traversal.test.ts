import { test } from 'node:test';
import assert from 'node:assert/strict';

// create-order reads these when it loads, so they are set before the import.
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'secret_x';
process.env.FIREBASE_PROJECT_ID = 'p';
process.env.FIREBASE_API_KEY = 'k';

const { default: handler } = await import('../api/create-order.ts');

/**
 * Money review A, H1: the cart's product id went straight into the REST path
 * `products/<id>`. fetch() removes dot segments, so `../reviews/r1` read a
 * review the customer wrote (public-read, any extra fields) and priced the
 * order from it. A product id is one path segment: refuse anything else
 * before any read.
 */

interface Run {
  status: number;
  json: Record<string, unknown> | null;
  /** Every URL the handler asked fetch for, as the network sees it (dot segments removed). */
  hits: string[];
  razorpayAmount: number | null;
}

async function post(items: Array<{ productId: unknown; quantity: unknown }>, amount = 15000): Promise<Run> {
  const hits: string[] = [];
  let razorpayAmount: number | null = null;
  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    const url = new URL(String(input));
    hits.push(url.pathname);
    if (url.hostname === 'firestore.googleapis.com') {
      if (url.pathname.endsWith('/documents/reviews/r1')) {
        // A review any signed-in customer can write, with a price they chose.
        return new Response(
          JSON.stringify({
            fields: {
              userId: { stringValue: 'attacker' },
              price: { integerValue: '1' },
              inventory: { mapValue: { fields: { stock: { integerValue: '100' } } } },
            },
          }),
          { status: 200 },
        );
      }
      if (url.pathname.endsWith('/documents/products/prod_1-A')) {
        return new Response(
          JSON.stringify({
            fields: {
              name: { stringValue: 'Real product' },
              price: { integerValue: '100' },
              inventory: { mapValue: { fields: { stock: { integerValue: '5' } } } },
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    }
    if (url.hostname === 'api.razorpay.com') {
      const sent = JSON.parse(String(init?.body));
      razorpayAmount = sent.amount;
      return new Response(JSON.stringify({ id: 'order_X', amount: sent.amount, currency: 'INR' }), { status: 200 });
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof fetch;

  let status = 0;
  let json: Run['json'] = null;
  const res = {
    setHeader() {},
    status(s: number) {
      status = s;
      return res;
    },
    json(j: Run['json']) {
      json = j;
      return res;
    },
    end() {
      return res;
    },
  };
  await handler({ method: 'POST', headers: {}, body: { items, amount } } as never, res as never);
  return { status, json, hits, razorpayAmount };
}

test('a product id that is not a single path segment is refused before any read', async () => {
  const bad = [
    '../reviews/r1',
    '%2e%2e/reviews/r1',
    '%2E%2E%2Freviews%2Fr1',
    'a/b',
    '..',
    '.',
    'prod_1-A/../../reviews/r1',
    'prod_1-A?x=1',
    'prod_1-A#frag',
    'prod 1',
    'x'.repeat(129),
  ];
  for (const productId of bad) {
    const run = await post([{ productId, quantity: 1 }]);
    assert.equal(run.status, 400, `${productId}: ${JSON.stringify(run.json)}`);
    assert.match(String(run.json?.error), /invalid/i, productId);
    assert.deepEqual(run.hits, [], `${productId}: nothing is read or created`);
    assert.equal(run.razorpayAmount, null, productId);
  }
});

test('a product id that is not a string is refused before any read', async () => {
  for (const productId of [{ toString: () => '../reviews/r1' }, ['../reviews/r1'], 123, true]) {
    const run = await post([{ productId, quantity: 1 }]);
    assert.equal(run.status, 400);
    assert.deepEqual(run.hits, []);
  }
});

test('one bad line spoils the whole cart, even behind a good one', async () => {
  const run = await post([
    { productId: 'prod_1-A', quantity: 1 },
    { productId: '../reviews/r1', quantity: 100 },
  ]);
  assert.equal(run.status, 400);
  assert.deepEqual(run.hits, []);
  assert.equal(run.razorpayAmount, null);
});

test('a normal product id still prices and creates the order (100 + 50 delivery)', async () => {
  const run = await post([{ productId: 'prod_1-A', quantity: 1 }]);
  assert.equal(run.status, 200, JSON.stringify(run.json));
  assert.ok(run.hits.some((p) => p.endsWith('/documents/products/prod_1-A')));
  assert.ok(!run.hits.some((p) => p.includes('/reviews/')));
  assert.equal(run.razorpayAmount, 15000);
});

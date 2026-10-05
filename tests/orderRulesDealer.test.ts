import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Money review A (L4) and B (B5): the invoice prints orders.buyerBusiness when
 * orders.pricing is 'dealer', and both are written by the browser. The rules
 * decide who may write them. The emulator cannot run here (no Java), so this
 * reads firestore.rules and fails if the guard is removed or loosened by an edit.
 */

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The text of `function <name>() { ... }` up to its closing brace at the same indent. */
function fn(name: string): string {
  const m = rules.match(new RegExp(`^( *)function ${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\1\\}`, 'm'));
  assert.ok(m, `function ${name} is in firestore.rules`);
  return m[0];
}

const dealerFields = fn('hasValidDealerFields');
const orderCreate = fn('isValidOrderCreate');

test('a new order must pass the dealer-fields check', () => {
  assert.match(orderCreate, /&& hasValidDealerFields\(\)/);
});

test('a retail order carries none of the dealer fields', () => {
  for (const key of ['pricing', 'regularSubtotal', 'dealerSavings', 'buyerBusiness']) {
    assert.match(dealerFields, new RegExp(`'${key}'`), key);
  }
  assert.match(dealerFields, /!d\.keys\(\)\.hasAny\(\[/);
});

test('dealer fields need pricing dealer, an approved dealer record and the approved business details', () => {
  assert.match(dealerFields, /d\.get\('pricing', ''\) == 'dealer'/);
  assert.match(dealerFields, /dealers\/\$\(request\.auth\.uid\)/);
  assert.match(dealerFields, /get\(dealer\)\.data\.status == 'approved'/);
  assert.match(dealerFields, /d\.buyerBusiness\.name == get\(dealer\)\.data\.businessName/);
  assert.match(dealerFields, /d\.buyerBusiness\.gstin == get\(dealer\)\.data\.gstin/);
});

test('the dealer record has the fields the rule compares', () => {
  const keys = fn('dealerAppKeys');
  assert.match(keys, /'businessName'/);
  assert.match(keys, /'gstin'/);
});

test('only creating an order can set the dealer fields: customer updates are limited to fixed keys', () => {
  // Cancel, return request and return withdrawal list the keys they may touch (none is a dealer field).
  for (const name of ['isValidCancellation', 'isValidReturnRequest', 'isValidReturnCancel']) {
    assert.doesNotMatch(fn(name), /pricing|buyerBusiness|regularSubtotal|dealerSavings/, name);
  }
});

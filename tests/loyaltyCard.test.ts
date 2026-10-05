import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMemberNumber, memberDigits } from '../src/lib/loyaltyCard.ts';

test('member digits are 64-bit FNV-1a of the uid, mod 10^12, zero-padded', () => {
  assert.equal(memberDigits('a'), '200555641996');
  assert.equal(memberDigits('cust1'), '315597000457');
  assert.match(memberDigits('X9fQ2LkP0aBcDeFgHiJk'), /^\d{12}$/);
  assert.equal(memberDigits('same-uid'), memberDigits('same-uid'));
  assert.notEqual(memberDigits('uid-1'), memberDigits('uid-2'));
});

test('member number format', () => {
  assert.equal(formatMemberNumber('200555641996', 'IB'), 'IB 2005 5564 1996');
  assert.equal(formatMemberNumber('200555641996', ''), '2005 5564 1996');
});

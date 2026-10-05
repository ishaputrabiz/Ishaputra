import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDealerApplication, validateDealerApplication } from '../src/lib/dealerForm.ts';

const ok = {
  businessName: 'Rao Wellness Store',
  businessType: 'ayurvedic',
  contactName: 'Ananya Rao',
  phone: '98765 43210',
  city: 'Mysuru',
  state: 'Karnataka',
  gstin: '29abcde1234f1z5',
  message: '',
};

test('a complete application is valid after cleaning', () => {
  const c = cleanDealerApplication({ ...ok, businessName: '  Rao Wellness Store ', gstin: ' 29abcde1234f1z5 ' });
  assert.equal(c.businessName, 'Rao Wellness Store');
  assert.equal(c.gstin, '29ABCDE1234F1Z5');
  assert.deepEqual(validateDealerApplication(c), {});
  assert.deepEqual(validateDealerApplication(cleanDealerApplication({ ...ok, gstin: '' })), {});
});

test('each field is checked', () => {
  const e = validateDealerApplication(
    cleanDealerApplication({ businessName: 'A', businessType: 'shop', contactName: '', phone: '12345', city: '', state: '', gstin: '29ABCDE1234F1X5', message: 'x'.repeat(501) }),
  );
  assert.deepEqual(Object.keys(e).sort(), ['businessName', 'businessType', 'city', 'contactName', 'gstin', 'message', 'phone', 'state']);
});

test('phone must start with a digit', () => {
  // Phone starting with + followed by space is invalid (after cleaning, becomes '+ 9876543210')
  const invalid1 = validateDealerApplication(cleanDealerApplication({ ...ok, phone: '+ 9876543210' }));
  assert(typeof invalid1.phone === 'string', 'phone with + followed by space should be invalid');

  // Valid phones: with country code and spaces
  const valid1 = validateDealerApplication(cleanDealerApplication({ ...ok, phone: '+91 98765 43210' }));
  assert(!('phone' in valid1), 'phone +91 98765 43210 should be valid');

  // Valid phones: without country code
  const valid2 = validateDealerApplication(cleanDealerApplication({ ...ok, phone: '9876543210' }));
  assert(!('phone' in valid2), 'phone 9876543210 should be valid');
});

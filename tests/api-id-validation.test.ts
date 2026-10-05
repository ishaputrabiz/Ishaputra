import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RAZORPAY_KEY_SECRET = 'secret_x';
delete process.env.FIREBASE_ADMIN_SDK_BASE64;

const { default: verifyPayment } = await import('../api/verify-payment.ts');
const { default: verifyOtp } = await import('../api/whatsapp-verify-otp.ts');
const { default: callNotification } = await import('../api/send-call-notification.ts');

/**
 * Ids from the request that become one segment of a Firestore document path
 * (money review A, H1 audit): a slash or a dot segment would reach another
 * document, so each function refuses them before touching the database.
 */

function call(handler: (req: never, res: never) => Promise<unknown>, body: unknown, headers: Record<string, string> = {}) {
  return (async () => {
    let status = 0;
    let json: Record<string, unknown> | null = null;
    const res = {
      setHeader() {},
      status(s: number) {
        status = s;
        return res;
      },
      json(j: Record<string, unknown>) {
        json = j;
        return res;
      },
      end() {
        return res;
      },
    };
    await handler({ method: 'POST', headers, body } as never, res as never);
    return { status, json: json as Record<string, unknown> | null };
  })();
}

const BAD = ['../payments/x', '%2e%2e/x', 'a/b', '..', 'a b', 'x'.repeat(129)];

test('verify-payment refuses an order id that is not one path segment, before the signature check', async () => {
  for (const razorpay_order_id of BAD) {
    const r = await call(verifyPayment, { razorpay_order_id, razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' });
    assert.equal(r.status, 400, razorpay_order_id);
    assert.equal(r.json?.error, 'invalid razorpay_order_id', razorpay_order_id);
  }
  // A real-looking id passes the id check and meets the signature check instead.
  const ok = await call(verifyPayment, { razorpay_order_id: 'order_Abc123', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' });
  assert.equal(ok.status, 400);
  assert.equal(ok.json?.error, 'Payment signature verification failed');
});

test('whatsapp-verify-otp refuses an otpRef that is not one path segment', async () => {
  for (const otpRef of BAD) {
    const r = await call(verifyOtp, { otpRef, otp: '123456' });
    assert.equal(r.status, 400, otpRef);
    assert.equal(r.json?.error, 'Invalid input', otpRef);
  }
  // The shape whatsapp-send writes (+<phone>_<ms>) passes the check (the missing admin credentials fail later).
  const ok = await call(verifyOtp, { otpRef: '+919876543210_1767600000000', otp: '123456' });
  assert.notEqual(ok.json?.error, 'Invalid input');
});

test('send-call-notification refuses a callId that is not one path segment', async () => {
  for (const callId of BAD) {
    const r = await call(callNotification, { callId }, { authorization: 'Bearer t' });
    assert.equal(r.status, 400, callId);
    assert.equal(r.json?.error, 'invalid callId', callId);
  }
  const ok = await call(callNotification, { callId: 'aB3dE5gH7jK9mN1pQ3sT' }, { authorization: 'Bearer t' });
  assert.notEqual(ok.json?.error, 'invalid callId');
});

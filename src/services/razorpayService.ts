/**
 * Razorpay Standard Checkout — frontend service.
 *
 * Flow:
 *   1. POST /api/create-order  → get a Razorpay order_id (amount validated server-side)
 *   2. Open the Razorpay modal (checkout.js, loaded on demand)
 *   3. On success, POST /api/verify-payment to confirm the signature server-side
 *   4. Resolve with the verified payment, or reject on dismissal / failure
 *
 * The key secret never touches this file — only the public key id is used,
 * and it is returned by /api/create-order (falling back to VITE_RAZORPAY_KEY_ID).
 */

import { auth } from '@/config/firebase';

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export interface VerifiedPayment {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
  /** Loyalty points the server applied to this payment. */
  pointsApplied: number;
  /** Wallet cashback (₹) the server applied to this payment. */
  cashbackApplied: number;
  /** True when the spend could not be recorded yet (reconcile repairs it). */
  rewardsPending?: boolean;
}

export interface RazorpayCheckoutOptions {
  /**
   * Amount in the major unit (rupees). Sent only as a cross-check - the server
   * re-prices the order from Firestore and rejects a mismatch. Changing this
   * value in devtools cannot change what the customer is charged.
   */
  amount: number;
  /** Cart contents. The server prices these; required for the order to be created. */
  lineItems: Array<{ productId: string; quantity: number }>;
  /** Recorded on the order; every payment now runs through Razorpay. */
  paymentMethod?: string;
  /**
   * Destination state from the shipping address. The server prices delivery
   * from it (within-state vs outside-state vs a per-state override), so it must
   * match the address the order is placed against.
   */
  shippingState?: string;
  /** Re-validated server-side; an invalid code is simply ignored. */
  couponCode?: string;
  /** Spend loyalty points / wallet cashback. Priced server-side from the ledger. */
  usePoints?: boolean;
  useCashback?: boolean;
  /** Defaults to INR. */
  currency?: string;
  /** Receipt id stored against the Razorpay order (e.g. the internal order number). */
  receipt?: string;
  /** Display name shown in the modal header. */
  name?: string;
  /** Short description shown in the modal. */
  description?: string;
  /** Prefilled customer details. */
  prefill?: { name?: string; email?: string; contact?: string };
  /** Theme accent colour for the modal. */
  themeColor?: string;
  /** Extra notes attached to the Razorpay order. */
  notes?: Record<string, string>;
}

/** Raised when the customer closes the modal without paying. */
export class PaymentCancelledError extends Error {
  constructor(message = 'Payment was cancelled') {
    super(message);
    this.name = 'PaymentCancelledError';
  }
}

/**
 * The server could not price points/cashback (409 rewards_unavailable). The
 * customer has not been charged; checkout turns the toggles off so they can
 * review the full total.
 */
export class RewardsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RewardsUnavailableError';
  }
}

/** Inject checkout.js once and resolve when it is ready. */
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay can only run in the browser'));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Razorpay checkout script')),
      );
      // Already loaded between query and listener attach.
      if (window.Razorpay) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  });
}

interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  pointsApplied?: number;
  cashbackApplied?: number;
}

async function createOrder(options: RazorpayCheckoutOptions): Promise<CreateOrderResponse> {
  const amountInPaise = Math.round(options.amount * 100);

  const wantsRewards = options.usePoints === true || options.useCashback === true;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (wantsRewards) {
    // The reward ledger is private: the server reads it as this customer.
    const idToken = await auth.currentUser?.getIdToken().catch(() => '');
    if (idToken) headers.Authorization = `Bearer ${idToken}`;
  }

  let res: Response;
  try {
    res = await fetch('/api/create-order', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // The server prices `items` and treats `amount` only as a cross-check.
        items: options.lineItems,
        paymentMethod: options.paymentMethod,
        shippingState: options.shippingState,
        couponCode: options.couponCode,
        usePoints: options.usePoints === true,
        useCashback: options.useCashback === true,
        amount: amountInPaise,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        notes: options.notes,
      }),
    });
  } catch {
    throw new Error('Could not reach the payment server. Check your connection and try again.');
  }

  // Parse defensively: a misconfigured/missing endpoint returns HTML, not JSON.
  const raw = await res.text();
  let data: Partial<CreateOrderResponse> & { error?: string; detail?: string; code?: string } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (res.status === 409 && data.code === 'rewards_unavailable') {
    throw new RewardsUnavailableError(data.error || 'Rewards are unavailable right now.');
  }
  if (!res.ok || !data.order_id) {
    const detail =
      data.error ||
      data.detail ||
      (raw && !raw.trim().startsWith('<') ? raw.slice(0, 200) : `HTTP ${res.status}`);
    throw new Error(`Could not start the payment: ${detail}`);
  }
  return data as CreateOrderResponse;
}

async function verifyPayment(
  response: RazorpaySuccessResponse,
  order: CreateOrderResponse,
): Promise<VerifiedPayment> {
  const res = await fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.verified) {
    throw new Error(data?.error || 'Payment could not be verified. You have not been charged.');
  }

  return {
    razorpayPaymentId: response.razorpay_payment_id,
    razorpayOrderId: response.razorpay_order_id,
    razorpaySignature: response.razorpay_signature,
    pointsApplied: Number(order.pointsApplied) || 0,
    cashbackApplied: Number(order.cashbackApplied) || 0,
    ...(data?.rewardsPending === true ? { rewardsPending: true } : {}),
  };
}

/**
 * Run the full create → pay → verify flow.
 *
 * Resolves with the verified payment, rejects with {@link PaymentCancelledError}
 * if the user dismisses the modal, or a generic Error on payment / verification
 * failure.
 */
export async function payWithRazorpay(
  options: RazorpayCheckoutOptions,
): Promise<VerifiedPayment> {
  const order = await createOrder(options);
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is unavailable. Please try again.');
  }

  return new Promise<VerifiedPayment>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const rzp = new window.Razorpay!({
      key: order.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: options.name || 'Ishaputra Botanicals',
      description: options.description || 'Order payment',
      ...(options.prefill ? { prefill: options.prefill } : {}),
      ...(options.notes ? { notes: options.notes } : {}),
      theme: { color: options.themeColor || '#A4532C' },
      modal: {
        ondismiss: () => finish(() => reject(new PaymentCancelledError())),
      },
      handler: (response: RazorpaySuccessResponse) => {
        verifyPayment(response, order)
          .then((verified) => finish(() => resolve(verified)))
          .catch((err) => finish(() => reject(err)));
      },
    });

    // Surface gateway-reported failures (card declined, etc.).
    rzp.on('payment.failed', (response) => {
      finish(() =>
        reject(new Error(response?.error?.description || 'Payment failed. Please try again.')),
      );
    });

    rzp.open();
  });
}

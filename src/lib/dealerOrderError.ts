// ============================================
// DEALER PRICING ERRORS FROM /api/create-order: a pure mapping, so the rule is
// testable without Firebase or fetch. razorpayService turns a message here into
// a DealerPricingChangedError (nothing was charged; checkout re-prices).
// ============================================

const CHANGED_DEFAULT = 'Your dealer prices changed. Check the new total and pay again.';

/** The parts of the server's JSON error reply that matter here. */
interface CreateOrderErrorBody {
  code?: string;
  error?: string;
}

/**
 * The message to show when the server's refusal means "dealer pricing is not
 * what this page sent", or null for any other reply (which keeps the generic
 * error path).
 *
 *  - 409 dealer_pricing_changed, 400 dealer_no_extras, 503 dealer_unavailable:
 *    the server's own words, or the default.
 *  - 400 "Order total mismatch": only when this request was dealer-priced (the
 *    dealer discount was edited between the page's price and the payment). A
 *    retail mismatch is a real failure and stays generic.
 */
export function dealerPricingChangeMessage(
  status: number,
  data: CreateOrderErrorBody | null | undefined,
  requestPricing: 'dealer' | 'retail' | undefined,
): string | null {
  const body = data ?? {};
  if (
    (status === 409 && body.code === 'dealer_pricing_changed') ||
    (status === 400 && body.code === 'dealer_no_extras') ||
    (status === 503 && body.code === 'dealer_unavailable')
  ) {
    return body.error || CHANGED_DEFAULT;
  }
  if (requestPricing === 'dealer' && status === 400 && /order total mismatch/i.test(body.error || '')) {
    return CHANGED_DEFAULT;
  }
  return null;
}

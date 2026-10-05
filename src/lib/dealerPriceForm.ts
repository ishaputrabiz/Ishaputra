/*
 * Admin > product form: the optional per-product dealer price, and what the
 * order page shows for a dealer order. Pure and dependency-free so
 * tests/dealerPriceForm.test.ts can import it.
 */

const rupees = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)}`;

const paise = (n: number) => Math.round(n * 100) / 100;

/**
 * The typed dealer price: null when blank (no fixed price: the store-wide
 * percent applies), otherwise the number typed (NaN when unreadable).
 */
export function parseDealerPrice(raw: string): number | null {
  const text = raw.trim();
  return text === '' ? null : Number(text);
}

/**
 * Why a typed dealer price cannot be saved, or undefined when it can: blank,
 * or a number above 0 with at most 2 decimals and below the product's price.
 * With no product price yet (0 or not a number) only the number itself is
 * checked; the Price field reports its own error.
 */
export function dealerPriceError(raw: string, regularPrice: number): string | undefined {
  const value = parseDealerPrice(raw);
  if (value === null) return undefined;
  if (!Number.isFinite(value) || value <= 0) return 'Must be more than ₹0';
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return 'Use at most 2 decimal places';
  if (regularPrice > 0 && value >= regularPrice) return `Must be below the ${rupees(regularPrice)} price`;
  return undefined;
}

/** A dealer order's regular-price line items, for the order page's totals. */
export interface DealerOrderTotals {
  /** What the items would have cost at regular prices. */
  regularSubtotal: number;
  /** regularSubtotal minus the order's (dealer-price) subtotal. Above 0. */
  savings: number;
}

/**
 * The two extra rows of a dealer order's totals ("Items at regular prices" and
 * "Dealer prices"), or null when there is nothing to show: the regular
 * subtotal is missing, or is no higher than the subtotal charged (a 0 row is
 * hidden). Rounded to paise.
 */
export function dealerOrderTotals(regularSubtotal: unknown, orderSubtotal: unknown): DealerOrderTotals | null {
  const regular = Number(regularSubtotal);
  const charged = Number(orderSubtotal);
  if (!Number.isFinite(regular) || !Number.isFinite(charged) || regular <= 0) return null;
  const savings = paise(regular - charged);
  return savings > 0 ? { regularSubtotal: paise(regular), savings } : null;
}

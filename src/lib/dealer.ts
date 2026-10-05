/**
 * Dealer prices, shared by the storefront and api/create-order.ts. Pure and
 * dependency-free.
 *
 * The block between the dealer-core markers is copied verbatim into
 * api/create-order.ts (npm run sync:rewards). tests/rewards-parity.test.ts
 * fails if the copy drifts.
 */

// >>> dealer-core
interface DealerSettings {
  /** The programme switch. Off: no dealer prices, and /dealer is hidden from customers with no application. */
  enabled: boolean;
  /** Dealer prices apply when the cart is worth at least this much at regular prices (rupees). */
  minOrder: number;
}

interface DealerPricing {
  /** Store-wide discount off the regular price, in percent. */
  discountPercent: number;
  /** Fixed dealer unit prices by product id (rupees). A product without one uses the percent. */
  productPrices: Record<string, number>;
}

// TODO(client): placeholders until Ishaputra confirms its dealer terms.
const DEFAULT_DEALER_SETTINGS: DealerSettings = { enabled: false, minOrder: 2000 };
const DEFAULT_DEALER_PRICING: DealerPricing = { discountPercent: 20, productPrices: {} };

interface DealerLine {
  productId: string;
  /** Regular unit price, rupees. */
  unit: number;
  quantity: number;
}

interface DealerQuote {
  /** True when this cart is charged dealer prices. */
  applies: boolean;
  regularSubtotal: number;
  /** The cart at dealer prices (the regular subtotal for a customer who is not a dealer). */
  dealerSubtotal: number;
  /** What the products are charged: dealerSubtotal when applies, otherwise regularSubtotal. */
  subtotal: number;
  /** regularSubtotal - subtotal. */
  savings: number;
  /** Rupees more, at regular prices, before dealer prices apply. 0 once met, and for non-dealers. */
  shortBy: number;
  /** The charged unit price of each line, in line order. */
  units: number[];
}

const dealerMoney = (n: number) => Math.round(n * 100) / 100;

function dealerNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normaliseDealerSettings(raw: Partial<DealerSettings> | null | undefined): DealerSettings {
  return {
    enabled: raw?.enabled === true,
    minOrder: Math.round(dealerNum(raw?.minOrder, DEFAULT_DEALER_SETTINGS.minOrder, 0, 10_000_000)),
  };
}

function normaliseDealerPricing(raw: Partial<DealerPricing> | null | undefined): DealerPricing {
  const productPrices: Record<string, number> = {};
  const source = raw?.productPrices && typeof raw.productPrices === 'object' ? raw.productPrices : {};
  for (const [id, v] of Object.entries(source)) {
    if (id && typeof v === 'number' && Number.isFinite(v) && v > 0) productPrices[id] = dealerMoney(v);
  }
  const percent = dealerNum(raw?.discountPercent, DEFAULT_DEALER_PRICING.discountPercent, 0, 90);
  return { discountPercent: Math.round(percent * 100) / 100, productPrices };
}

/**
 * One product's dealer unit price. A fixed dealer price wins, capped at the
 * regular price (a later sale never makes it dearer than the regular price).
 * Otherwise the store-wide percent off, in whole rupees, never above the
 * regular price and never below ₹1 unless the regular price is.
 */
function dealerUnitPrice(productId: string, regularUnit: number, p: DealerPricing): number {
  const regular = Number(regularUnit);
  if (!(regular > 0)) return Math.max(0, regular || 0);
  const fixed = p.productPrices[productId];
  if (typeof fixed === 'number' && fixed > 0) return Math.min(regular, dealerMoney(fixed));
  const off = Math.round((regular * (100 - p.discountPercent)) / 100);
  return Math.min(regular, Math.max(Math.min(1, regular), off));
}

/**
 * A cart priced for this customer. Dealer prices apply only to an approved
 * dealer, while the programme is on, when the cart is worth at least minOrder
 * at regular prices and the dealer total is lower.
 */
function dealerQuote(
  lines: DealerLine[],
  s: DealerSettings,
  p: DealerPricing | null,
  approved: boolean,
): DealerQuote {
  let regular = 0;
  for (const l of lines) regular += l.unit * l.quantity;
  regular = dealerMoney(regular);
  const regularUnits = lines.map((l) => l.unit);
  if (!approved || !s.enabled || !p) {
    return { applies: false, regularSubtotal: regular, dealerSubtotal: regular, subtotal: regular, savings: 0, shortBy: 0, units: regularUnits };
  }
  const units = lines.map((l) => dealerUnitPrice(l.productId, l.unit, p));
  let dealer = 0;
  for (let i = 0; i < lines.length; i++) dealer += units[i] * lines[i].quantity;
  dealer = dealerMoney(dealer);
  const met = regular >= s.minOrder;
  const applies = met && dealer < regular;
  return {
    applies,
    regularSubtotal: regular,
    dealerSubtotal: dealer,
    subtotal: applies ? dealer : regular,
    savings: applies ? dealerMoney(regular - dealer) : 0,
    shortBy: met ? 0 : dealerMoney(s.minOrder - regular),
    units: applies ? units : regularUnits,
  };
}
// <<< dealer-core

export type { DealerSettings, DealerPricing, DealerLine, DealerQuote };
export {
  DEFAULT_DEALER_SETTINGS,
  DEFAULT_DEALER_PRICING,
  normaliseDealerSettings,
  normaliseDealerPricing,
  dealerUnitPrice,
  dealerQuote,
};

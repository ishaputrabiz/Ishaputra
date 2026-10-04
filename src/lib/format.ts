/**
 * Display formatting for prices, dates and counts. Pure and dependency-free.
 *
 * Display only: never use these to compute a total. Totals come from the cart
 * and checkout logic (useCheckoutPricing, orderService); these only print them.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const count = new Intl.NumberFormat('en-IN');

/** '₹1,499', '₹1,00,000', or '₹1,499.50' when there are paise. Missing values print '₹0'. */
export function formatINR(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const hasPaise = Math.round(Math.abs(n) * 100) % 100 !== 0;
  return (hasPaise ? inrPaise : inrWhole).format(n);
}

/** Indian digit grouping without a currency sign: 1200 -> '1,200'. */
export function formatNumber(n: number | null | undefined): string {
  return count.format(typeof n === 'number' && Number.isFinite(n) ? n : 0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A Firestore Timestamp, {seconds}, Date, ISO string or epoch millis as a Date; null when missing or unreadable. */
export function toDate(value: unknown): Date | null {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number') date = new Date(value);
  else if (typeof value === 'string' && value.trim() !== '') date = new Date(value);
  else if (value && typeof value === 'object') {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') date = v.toDate();
    else if (typeof v.seconds === 'number') date = new Date(v.seconds * 1000);
  }
  return date && Number.isFinite(date.getTime()) ? date : null;
}

/** '3 Oct 2026'. Empty string when the date is missing. */
export function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** '4 Nov'. Empty string when the date is missing. */
export function formatDayMonth(value: unknown): string {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** '8:01 pm'. Empty string when the date is missing. */
export function formatTime(value: unknown): string {
  const d = toDate(value);
  if (!d) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** '3 Oct 2026, 8:01 pm'. Empty string when the date is missing. */
export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  if (!d) return '';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** '1 item', '3 items', '2 boxes' (pass the plural when it is not just +s). */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

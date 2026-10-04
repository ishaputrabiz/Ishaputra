/**
 * The return window: a customer can ask for a return until 7 days after
 * delivery. Pure and dependency-free.
 *
 * firestore.rules (isValidReturnRequest) enforces the same window with
 * `request.time < deliveredAt + duration.value(7, 'd')` and refuses orders that
 * have no delivery time, so the storefront button, the order service and the
 * admin warning all use these helpers to agree with it.
 */

export const RETURN_WINDOW_DAYS = 7;

/**
 * Days after delivery before earned points (and scratch prizes) unlock: the
 * admin's unlockDays, but never sooner than the return window closes - the
 * rule api/notify-order.ts applies (unlockAtMs).
 */
export const unlockDaysAfterDelivery = (unlockDays: number) => Math.max(unlockDays, RETURN_WINDOW_DAYS);

const DAY_MS = 86_400_000;

/** A Firestore Timestamp, {seconds}, Date, ISO string or epoch millis as a Date; null when missing or unreadable. */
function toDate(value: unknown): Date | null {
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

/** When the return window closes, or null when the delivery time is unknown. */
export function returnWindowEnd(deliveredAt: unknown): Date | null {
  const delivered = toDate(deliveredAt);
  return delivered ? new Date(delivered.getTime() + RETURN_WINDOW_DAYS * DAY_MS) : null;
}

/** True while a return can still be requested. An unknown delivery time counts as closed. */
export function isWithinReturnWindow(deliveredAt: unknown, now: Date = new Date()): boolean {
  const end = returnWindowEnd(deliveredAt);
  return end !== null && now.getTime() < end.getTime();
}

/** For the shop: did this return request arrive inside the window? */
export function returnRequestTiming(deliveredAt: unknown, requestedAt: unknown): 'in-window' | 'late' | 'unknown' {
  const end = returnWindowEnd(deliveredAt);
  const requested = toDate(requestedAt);
  if (!end || !requested) return 'unknown';
  return requested.getTime() < end.getTime() ? 'in-window' : 'late';
}

import { useEffect, useState } from 'react';
import {
  subscribeBannerCoupons,
  isCouponLive,
  rememberCouponCode,
  type Coupon,
} from '@/services/couponService';

const createdSeconds = (c: Coupon) =>
  (c.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;

/**
 * Offers the admin chose to advertise that a customer could use right now,
 * newest first.
 *
 * Re-checked every minute as well as on every admin change, so an offer that
 * starts at midnight appears, and one that ends drops out, without a reload.
 */
export function useBannerCoupons(): Coupon[] {
  const [all, setAll] = useState<Coupon[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeBannerCoupons(setAll), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const at = new Date(now);
  return all
    .filter((c) => isCouponLive(c, at))
    .sort((a, b) => createdSeconds(b) - createdSeconds(a));
}

/**
 * Copy an offer code and remember it so checkout applies it on its own.
 *
 * The async Clipboard API needs a secure context and a focused document; the
 * textarea fallback covers older phones and plain-http previews. Either way the
 * code is remembered, which is what actually saves the customer a step.
 */
export async function copyOfferCode(code: string): Promise<void> {
  rememberCouponCode(code);
  try {
    await navigator.clipboard.writeText(code);
    return;
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    // Copying is a convenience; the remembered code still reaches checkout.
  }
}

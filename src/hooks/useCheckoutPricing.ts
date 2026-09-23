import { useEffect, useMemo, useRef, useState } from 'react';
import {
  subscribeDeliverySettings,
  subscribeGstSettings,
  computeDeliveryCharge,
  computeGst,
  DEFAULT_DELIVERY,
  DEFAULT_GST,
  type DeliverySettings,
  type GstSettings,
  type DeliverableItem,
} from '@/services/siteSettingsService';
import {
  validateCoupon,
  subscribeCoupons,
  computeCouponDiscount,
  isCouponLive,
  takeRememberedCouponCode,
  type Coupon,
} from '@/services/couponService';
import { getActiveProductsCached } from '@/services/productCache';

export interface CheckoutPricing {
  subtotal: number;
  deliveryCharge: number;
  freeDelivery: boolean;
  /**
   * What delivery would have cost without the free-delivery threshold. Lets the
   * summary show "~~₹150~~ FREE" with a real number instead of a hardcoded one.
   */
  deliveryBeforeFree: number;
  /** True while no address is chosen yet, so the quote may still rise. */
  deliveryEstimated: boolean;
  gstAmount: number;
  gstAddOnTop: boolean;
  discount: number;
  codCharge: number;
  total: number;
  appliedCoupon: Coupon | null;
  couponError: string | null;
  /**
   * True while a code is being checked.
   *
   * Lives here rather than in each screen's own state: validating a coupon hits
   * Firestore two or three times (the code, then the customer's order history
   * for per-user limits), which is slow enough to look broken. Every Apply
   * button reads this, so none of them can forget to show it.
   */
  couponLoading: boolean;
  coupons: Coupon[];
  /** Coupons a customer could actually redeem right now - what to advertise. */
  redeemableCoupons: Coupon[];
  delivery: DeliverySettings;
  gst: GstSettings;
  applyCoupon: (code: string) => Promise<{ ok: boolean; reason?: string }>;
  removeCoupon: () => void;
  setIsCod: (v: boolean) => void;
}

export interface CheckoutPricingOptions {
  /** Product ids in the cart, so per-product delivery overrides are honoured. */
  productIds?: string[];
  /** Destination state from the selected address; unknown on the cart page. */
  destinationState?: string;
  /** Categories present in the cart, for coupons restricted to some of them. */
  cartCategories?: string[];
  /** Signed-in customer, for `perUserLimit` / `firstOrderOnly` coupons. */
  userId?: string;
  /**
   * Apply a code the customer tapped in the offer ribbon or on a product page.
   * Checkout only: the cart drawer runs this same hook, and letting it consume
   * the remembered code would leave nothing for checkout to apply.
   */
  applyRememberedCode?: boolean;
}

/**
 * Centralised pricing engine consumed by Checkout / MobileCheckout / cart. All
 * numbers come from admin-managed Firestore documents (siteSettings/*) so
 * editing them in /admin/commerce-settings reflects everywhere instantly.
 *
 * Coupons are validated against the `coupons` Firestore collection managed
 * via the admin panel - the single source of truth for coupon data.
 */
export function useCheckoutPricing(
  subtotal: number,
  isEmpty: boolean,
  paymentMethod: string,
  options: CheckoutPricingOptions = {}
): CheckoutPricing {
  const { productIds, destinationState, cartCategories, userId, applyRememberedCode } = options;

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [delivery, setDelivery] = useState<DeliverySettings>(DEFAULT_DELIVERY);
  const [gst, setGst] = useState<GstSettings>(DEFAULT_GST);

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  /**
   * The discount is DERIVED from the current subtotal, never stored.
   *
   * It used to be captured once, when the code was applied. Editing the cart
   * afterwards (changing a quantity, removing a line) left a percent coupon
   * holding the discount for the old, larger subtotal - so the client total and the
   * server's independent re-price diverged and /api/create-order rejected the
   * payment outright with "Order total mismatch. Please refresh your cart".
   *
   * Recomputing here uses exactly the helper the server mirrors, so the two
   * totals agree for any cart the customer can reach.
   */
  const appliedDiscount = useMemo(
    () => (appliedCoupon ? computeCouponDiscount(appliedCoupon, subtotal) : 0),
    [appliedCoupon, subtotal],
  );

  useEffect(() => {
    const u1 = subscribeCoupons(setCoupons);
    const u2 = subscribeDeliverySettings(setDelivery);
    const u3 = subscribeGstSettings(setGst);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  // Drop coupon if cart total drops below the coupon's minimum order value
  useEffect(() => {
    if (!appliedCoupon) return;
    if (appliedCoupon.minOrderValue && subtotal < appliedCoupon.minOrderValue) {
      setAppliedCoupon(null);
      setCouponError(`Coupon removed: minimum order of ₹${appliedCoupon.minOrderValue.toLocaleString('en-IN')} required`);
    }
  }, [subtotal, appliedCoupon]);

  /**
   * Coupons worth showing in "Available Offers".
   *
   * The storefront filtered on `active` alone, which is only the admin's
   * on/off switch - so a coupon that had run past its `validTo`, or used up its
   * `maxUses`, was still advertised on the checkout page. Tapping it produced
   * "Coupon has expired", which looks like a broken site rather than a finished
   * promotion. The date window and the usage cap are part of "available".
   */
  const redeemableCoupons = useMemo(() => coupons.filter((c) => isCouponLive(c)), [coupons]);

  /**
   * Keep the applied coupon in step with admin edits.
   *
   * `coupons` is a live subscription, so if the shop owner deactivates or
   * expires a code while someone is on the checkout page, the stale object held
   * here would keep discounting - and the server, which re-reads the coupon,
   * would price the order without it. Re-checking against the live document
   * drops the coupon instead of letting the two totals diverge.
   */
  useEffect(() => {
    if (!appliedCoupon) return;
    const live = coupons.find((c) => c.id === appliedCoupon.id);
    if (!live) return; // list not loaded yet - leave the coupon alone
    const now = new Date();
    const expired =
      !live.active ||
      (live.validTo && live.validTo.toDate() < now) ||
      (live.validFrom && live.validFrom.toDate() > now) ||
      (live.maxUses > 0 && live.usedCount >= live.maxUses);
    if (expired) {
      setAppliedCoupon(null);
      setCouponError('This coupon is no longer available');
    } else if (live.value !== appliedCoupon.value || live.type !== appliedCoupon.type || live.maxDiscount !== appliedCoupon.maxDiscount) {
      setAppliedCoupon(live);
    }
  }, [coupons, appliedCoupon]);

  /**
   * Per-product delivery overrides, resolved from the shared catalog cache.
   *
   * Cart lines only carry id/name/price, so the product's delivery config is
   * looked up here rather than duplicated into every `addToCart` call site.
   * The catalog is already cached for the session, so this costs no reads.
   */
  const idsKey = (productIds || []).join(',');
  const [deliveryByProduct, setDeliveryByProduct] = useState<Record<string, DeliverableItem>>({});
  /**
   * Categories and subcategories actually in the cart, read from the catalog.
   *
   * Taken from the product documents rather than from the cart line's own
   * `category` string: cart lines are written once, at add-to-cart, and carry
   * no subcategory at all, so a coupon limited to "Jewellery -> Necklaces"
   * could never match. Resolving here uses the catalog the delivery lookup
   * below already loaded, so it costs nothing extra.
   */
  const [cartTaxonomy, setCartTaxonomy] = useState<{ categories: string[]; subcategories: string[] }>({
    categories: [],
    subcategories: [],
  });

  useEffect(() => {
    let cancelled = false;
    if (!idsKey) {
      setDeliveryByProduct({});
      setCartTaxonomy({ categories: [], subcategories: [] });
      return;
    }
    getActiveProductsCached()
      .then((products) => {
        if (cancelled) return;
        const map: Record<string, DeliverableItem> = {};
        for (const p of products) {
          if (p.id && p.delivery) map[p.id] = { delivery: p.delivery };
        }
        setDeliveryByProduct(map);

        const wanted = new Set(idsKey.split(','));
        const categories = new Set<string>();
        const subcategories = new Set<string>();
        for (const p of products) {
          if (!p.id || !wanted.has(p.id)) continue;
          if (p.category) categories.add(p.category);
          if (p.subcategory) subcategories.add(p.subcategory);
        }
        setCartTaxonomy({ categories: [...categories], subcategories: [...subcategories] });
      })
      .catch(() => {
        // Falls back to the universal charge - never blocks checkout.
      });
    return () => { cancelled = true; };
  }, [idsKey]);

  const deliveryItems = useMemo<DeliverableItem[]>(
    () => (productIds || []).map((id) => deliveryByProduct[id] || {}),
    [idsKey, deliveryByProduct] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pricing = useMemo(() => {
    if (isEmpty) {
      return {
        deliveryCharge: 0,
        freeDelivery: false,
        deliveryBeforeFree: 0,
        deliveryEstimated: false,
        gstAmount: 0,
        gstAddOnTop: false,
        codCharge: 0,
        total: 0,
      };
    }
    const { charge: deliveryCharge, freeDelivery } = computeDeliveryCharge(
      subtotal,
      delivery,
      deliveryItems,
      destinationState
    );
    const { charge: deliveryBeforeFree } = computeDeliveryCharge(
      subtotal,
      { ...delivery, freeDeliveryAbove: 0 },
      deliveryItems,
      destinationState
    );
    // `inclusive` is honoured here: when the admin says prices already contain
    // GST, `addOnTop` is false and the tax is shown as a breakdown of the
    // subtotal instead of being charged a second time. An earlier version
    // forced `inclusive: false`, so switching it on in the admin panel changed
    // the label but still added GST to the total.
    const { gstAmount, addOnTop } = computeGst(subtotal, gst);
    const total = subtotal + deliveryCharge + (addOnTop ? gstAmount : 0) - appliedDiscount;
    return {
      deliveryCharge,
      freeDelivery,
      deliveryBeforeFree,
      deliveryEstimated: !destinationState && deliveryCharge > 0,
      gstAmount,
      gstAddOnTop: addOnTop,
      codCharge: 0,
      total: Math.max(0, total),
    };
  }, [subtotal, isEmpty, delivery, gst, appliedDiscount, deliveryItems, destinationState]);

  const applyCoupon = async (code: string) => {
    setCouponLoading(true);
    try {
      // Prefer what the catalog says over the cart line's stored category.
      const categories = cartTaxonomy.categories.length ? cartTaxonomy.categories : cartCategories || [];
      const r = await validateCoupon(code, subtotal, categories, userId, cartTaxonomy.subcategories);
      if (r.valid && r.coupon) {
        setAppliedCoupon(r.coupon);
        setCouponError(null);
        return { ok: true };
      }
      setAppliedCoupon(null);
      setCouponError(r.reason || 'Invalid coupon');
      return { ok: false, reason: r.reason };
    } catch (error) {
      // A network failure must not leave the button spinning forever.
      console.error('[useCheckoutPricing] coupon check failed:', error);
      setCouponError('Could not check that coupon. Please try again.');
      return { ok: false, reason: 'Could not check that coupon. Please try again.' };
    } finally {
      setCouponLoading(false);
    }
  };

  /**
   * Apply the code the customer tapped on an offer, once, when they reach
   * checkout with something in the cart. If it does not qualify yet the normal
   * message shows ("Add ₹800 more to use this coupon"), which is itself a
   * nudge; either way the code is used up so it is never re-applied.
   */
  const rememberedTriedRef = useRef(false);
  useEffect(() => {
    if (!applyRememberedCode || rememberedTriedRef.current) return;
    if (isEmpty || subtotal <= 0 || appliedCoupon || !userId) return;
    rememberedTriedRef.current = true;
    const code = takeRememberedCouponCode();
    if (code) void applyCoupon(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyRememberedCode, isEmpty, subtotal, appliedCoupon, userId]);

  return {
    subtotal,
    ...pricing,
    discount: appliedDiscount,
    appliedCoupon,
    couponError,
    coupons,
    redeemableCoupons,
    delivery,
    gst,
    couponLoading,
    applyCoupon,
    removeCoupon: () => {
      setAppliedCoupon(null);
      setCouponError(null);
    },
    setIsCod: () => {}, // Cash on Delivery was retired; kept so callers still compile
  };
}

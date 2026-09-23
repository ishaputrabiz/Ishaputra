import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  increment,
  where,
  limit,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export type CouponType = 'percent' | 'flat';

export interface Coupon {
  id?: string;
  code: string;             // uppercase unique
  description?: string;
  type: CouponType;
  value: number;            // percent 1-100 OR flat amount
  minOrderValue: number;    // ₹ minimum cart total
  maxDiscount?: number;     // optional cap for percent type
  maxUses: number;          // 0 = unlimited
  usedCount: number;
  perUserLimit?: number;    // 0 = unlimited
  validFrom?: Timestamp | null;
  validTo?: Timestamp | null;
  active: boolean;
  /** Advertise this code in the storefront offer ribbon and product labels. */
  showInBanner?: boolean;
  applicableCategories?: string[];    // empty = every category
  /** Optional narrowing within the chosen categories. Empty = the whole category. */
  applicableSubcategories?: string[];
  firstOrderOnly?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const COUPONS = 'coupons';

export const subscribeCoupons = (cb: (items: Coupon[]) => void) => {
  const q = query(collection(db, COUPONS), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  });
};

/**
 * Coupons the admin chose to advertise, live.
 *
 * Only `showInBanner` coupons are sent to every visitor's browser - the
 * storefront has no business downloading the full list of codes just to
 * advertise one of them. Realtime, so switching an offer on in the admin panel
 * shows it on open pages at once.
 */
export const subscribeBannerCoupons = (cb: (items: Coupon[]) => void) =>
  onSnapshot(
    query(collection(db, COUPONS), where('showInBanner', '==', true)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coupon, 'id'>) }))),
    (err) => {
      // Advertising is optional; a failure must never break the page.
      console.warn('[couponService] banner coupons unavailable:', err);
      cb([]);
    },
  );

/**
 * Could a customer redeem this coupon right now?
 *
 * `active` is only the admin's on/off switch - a code past its end date, not
 * yet started, or used up is not an offer and must not be advertised.
 */
export const isCouponLive = (c: Coupon, now = new Date()): boolean =>
  !!c.active &&
  !(c.validFrom && c.validFrom.toDate() > now) &&
  !(c.validTo && c.validTo.toDate() < now) &&
  !(c.maxUses > 0 && c.usedCount >= c.maxUses);

/** "50% OFF" / "₹500 OFF" - the headline figure for an offer. */
export const couponHeadline = (c: Coupon): string =>
  c.type === 'percent' ? `${c.value}% OFF` : `₹${Number(c.value).toLocaleString('en-IN')} OFF`;

/**
 * The small print: minimum order and any cap, in plain words.
 *
 * `includeScope: false` leaves out "on Jewellery" - pointless on a product page,
 * which only ever shows the offers that apply to that product.
 */
export const couponTerms = (c: Coupon, { includeScope = true }: { includeScope?: boolean } = {}): string => {
  const parts: string[] = [];
  if (c.minOrderValue > 0) parts.push(`on orders above ₹${c.minOrderValue.toLocaleString('en-IN')}`);
  if (c.type === 'percent' && c.maxDiscount && c.maxDiscount > 0) {
    parts.push(`up to ₹${c.maxDiscount.toLocaleString('en-IN')}`);
  }
  if (includeScope && c.applicableCategories && c.applicableCategories.length > 0) {
    const where = c.applicableSubcategories && c.applicableSubcategories.length > 0
      ? c.applicableSubcategories.join(', ')
      : c.applicableCategories.join(', ');
    parts.push(`on ${where}`);
  }
  return parts.join(' · ');
};

/**
 * The one condition a customer must know, in as few words as possible:
 * where it applies and the minimum spend - "on Jewellery above ₹5,000". The
 * discount cap is left out; it only matters once they are at checkout, where
 * the exact saving is shown. For narrow screens where `couponTerms` won't fit.
 */
export const couponTermsShort = (c: Coupon): string => {
  const scope =
    c.applicableSubcategories && c.applicableSubcategories.length > 0
      ? c.applicableSubcategories
      : c.applicableCategories || [];
  const where =
    scope.length === 0 ? '' : scope.length <= 2 ? `on ${scope.join(' & ')}` : 'on selected items';
  const min = c.minOrderValue > 0 ? `above ₹${c.minOrderValue.toLocaleString('en-IN')}` : '';
  return [where, min].filter(Boolean).join(' ');
};

/** Does this coupon apply to a product in this category/subcategory? */
export const couponAppliesTo = (c: Coupon, category?: string, subcategory?: string): boolean => {
  const norm = (v?: string) => String(v ?? '').trim().toLowerCase();
  const cats = (c.applicableCategories || []).map(norm);
  const subs = (c.applicableSubcategories || []).map(norm);
  if (cats.length > 0 && !cats.includes(norm(category))) return false;
  if (subs.length > 0 && !subs.includes(norm(subcategory))) return false;
  return true;
};

// ── Remembered code ────────────────────────────────────────────────────────
// Tapping an advertised code copies it AND remembers it for this visit, so
// checkout can apply it without the customer having to paste anything. The
// ribbon's whole job is getting people to checkout with the offer in hand.

const REMEMBERED_KEY = 'ss:offerCode';

export const rememberCouponCode = (code: string) => {
  try {
    sessionStorage.setItem(REMEMBERED_KEY, code.trim().toUpperCase());
  } catch {
    // Private mode: the copy to the clipboard still happened.
  }
};

/** Read and forget the remembered code, so it is applied at most once. */
export const takeRememberedCouponCode = (): string | null => {
  try {
    const code = sessionStorage.getItem(REMEMBERED_KEY);
    if (code) sessionStorage.removeItem(REMEMBERED_KEY);
    return code;
  } catch {
    return null;
  }
};

export const getCoupons = async (): Promise<Coupon[]> => {
  const snap = await getDocs(query(collection(db, COUPONS), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
};

export const getCouponByCode = async (code: string): Promise<Coupon | null> => {
  const q = query(
    collection(db, COUPONS),
    where('code', '==', code.toUpperCase()),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as any) };
};

export const createCoupon = async (data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'usedCount'>) => {
  const payload = {
    ...data,
    code: data.code.toUpperCase().trim(),
    usedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COUPONS), payload);
  return ref.id;
};

export const updateCoupon = async (id: string, data: Partial<Coupon>) => {
  const payload: any = { ...data, updatedAt: serverTimestamp() };
  if (data.code) payload.code = data.code.toUpperCase().trim();
  await updateDoc(doc(db, COUPONS, id), payload);
};

export const deleteCoupon = async (id: string) => {
  await deleteDoc(doc(db, COUPONS, id));
};

export const incrementCouponUsage = async (id: string) => {
  await updateDoc(doc(db, COUPONS, id), { usedCount: increment(1), updatedAt: serverTimestamp() });
};

/**
 * Discount for a coupon against a subtotal.
 *
 * Extracted so the value can be recomputed whenever the cart changes rather
 * than being captured once when the code was applied. A stale figure made the
 * client total disagree with the server's re-price, and /api/create-order then
 * refused the payment with "Order total mismatch".
 *
 * Must stay in step with `couponDiscount` in api/create-order.ts.
 */
export const computeCouponDiscount = (coupon: Coupon, cartTotal: number): number => {
  if (coupon.type === 'percent') {
    let discount = Math.floor((cartTotal * coupon.value) / 100);
    if (coupon.maxDiscount && coupon.maxDiscount > 0) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
    return discount;
  }
  return Math.min(coupon.value, cartTotal);
};

export interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  discount?: number;
  coupon?: Coupon;
}

/**
 * How many orders this customer has already placed, optionally narrowed to the
 * ones that used a particular coupon code.
 *
 * Used to enforce `perUserLimit` and `firstOrderOnly`, which were previously
 * stored by the admin panel and then never checked anywhere - a coupon capped
 * at "1 per user" could be redeemed by the same account on every order until
 * the global `maxUses` ran out.
 *
 * Counted with an aggregate query (one read) and falls back to a plain query if
 * aggregates are unavailable. A counting failure must never block a paying
 * customer, so the caller treats `null` as "unknown, allow".
 */
const countUserOrders = async (userId: string, couponCode?: string): Promise<number | null> => {
  const constraints = [where('userId', '==', userId)];
  if (couponCode) constraints.push(where('couponCode', '==', couponCode.toUpperCase()));

  try {
    const snap = await getCountFromServer(query(collection(db, 'orders'), ...constraints));
    return snap.data().count;
  } catch {
    // Index merging unavailable, or aggregates blocked - read the docs instead.
    try {
      const snap = await getDocs(query(collection(db, 'orders'), where('userId', '==', userId)));
      if (!couponCode) return snap.size;
      const wanted = couponCode.toUpperCase();
      return snap.docs.filter((d) => String((d.data() as { couponCode?: string }).couponCode || '').toUpperCase() === wanted).length;
    } catch {
      return null;
    }
  }
};

export const validateCoupon = async (
  code: string,
  cartTotal: number,
  cartCategoryIds: string[] = [],
  userId?: string,
  cartSubcategories: string[] = [],
): Promise<CouponValidationResult> => {
  const coupon = await getCouponByCode(code);
  if (!coupon) return { valid: false, reason: 'Coupon code does not exist' };
  if (!coupon.active) return { valid: false, reason: 'This coupon is inactive' };

  const now = new Date();
  if (coupon.validFrom && coupon.validFrom.toDate() > now) {
    return { valid: false, reason: 'Coupon is not yet active' };
  }
  if (coupon.validTo && coupon.validTo.toDate() < now) {
    return { valid: false, reason: 'Coupon has expired' };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, reason: 'Coupon usage limit reached' };
  }
  if (cartTotal < coupon.minOrderValue) {
    return {
      valid: false,
      reason: `Add ₹${(coupon.minOrderValue - cartTotal).toLocaleString('en-IN')} more to use this coupon`,
    };
  }
  // Category restriction. Compared case-insensitively because the admin stores
  // category *names* while product documents carry whatever casing was typed.
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
    const allowed = coupon.applicableCategories.map(norm);
    if (!cartCategoryIds.map(norm).some((c) => allowed.includes(c))) {
      return { valid: false, reason: 'Coupon not valid for the items in your cart' };
    }
  }
  // Optional narrowing within those categories, e.g. "Jewellery, but only
  // Necklaces". Left empty the whole category qualifies.
  if (coupon.applicableSubcategories && coupon.applicableSubcategories.length > 0) {
    const allowedSubs = coupon.applicableSubcategories.map(norm);
    if (!cartSubcategories.map(norm).some((c) => allowedSubs.includes(c))) {
      return { valid: false, reason: 'Coupon not valid for the items in your cart' };
    }
  }

  // Per-customer limits. Both need the signed-in user; when the caller has no
  // uid (shouldn't happen at checkout, which requires auth) the limits are
  // skipped rather than guessed at.
  if (userId) {
    if (coupon.firstOrderOnly) {
      const placed = await countUserOrders(userId);
      if (placed !== null && placed > 0) {
        return { valid: false, reason: 'This coupon is only valid on your first order' };
      }
    }
    if (coupon.perUserLimit && coupon.perUserLimit > 0) {
      const used = await countUserOrders(userId, coupon.code);
      if (used !== null && used >= coupon.perUserLimit) {
        return {
          valid: false,
          reason:
            coupon.perUserLimit === 1
              ? 'You have already used this coupon'
              : `You have already used this coupon ${coupon.perUserLimit} times`,
        };
      }
    }
  }

  return { valid: true, discount: computeCouponDiscount(coupon, cartTotal), coupon };
};

export const getCoupon = async (id: string): Promise<Coupon | null> => {
  const ref = doc(db, COUPONS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
};

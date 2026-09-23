import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'twitter'
  | 'linkedin'
  | 'whatsapp'
  | 'pinterest'
  | 'telegram'
  | 'snapchat'
  | 'threads';

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  active: boolean;
}

export interface FooterSettings {
  brandTagline: string;
  addressLines: string[]; // multi-line address
  phones: string[];
  emails: string[];
  businessHours?: string;
  mapEmbedUrl: string; // Google Maps iframe `src`
  shopLinks: string[];
  categoryLinks: string[];
  socialLinks: SocialLink[];
  copyrightSuffix?: string;
  updatedAt?: unknown;
}

const SETTINGS_DOC = doc(db, 'siteSettings', 'footer');

export const DEFAULT_FOOTER: FooterSettings = {
  brandTagline:
    'Your one-stop destination for premium silver jewelry, elegant furniture, exquisite articles, unique gift items, and sacred pooja items — crafted to celebrate every moment.',
  addressLines: ['Ramasomayajulu street', 'Ramaraopeta, Kakinada, Andhra Pradesh, India, 533001'],
  phones: ['+91 6304960489'],
  emails: ['sreerasthusilvers@gmail.com'],
  businessHours: 'Mon – Sat · 10:00 AM – 9:00 PM',
  mapEmbedUrl:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2971.5777289331822!2d82.23205947387872!3d16.957781683857988!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a38290006734e2b%3A0x9f8b6cdf933bc2a!2sSreerastu%20silvers!5e1!3m2!1sen!2sin!4v1773164635883!5m2!1sen!2sin',
  shopLinks: ['Rings', 'Earrings', 'Necklaces', 'Bracelets'],
  categoryLinks: ['Jewellery', 'Furniture', 'Articles', 'Gifting', 'Pooja Items', "Men's", 'Wedding', 'Others'],
  socialLinks: [
    { platform: 'facebook', url: 'https://www.facebook.com/sreerasthusilvers', active: true },
    { platform: 'instagram', url: 'https://www.instagram.com/sreerasthu_silvers/', active: true },
  ],
  copyrightSuffix: 'Sreerasthu Silvers',
};

export async function getFooterSettings(): Promise<FooterSettings> {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (snap.exists()) {
      return { ...DEFAULT_FOOTER, ...(snap.data() as FooterSettings) };
    }
  } catch (e) {
    console.error('getFooterSettings failed', e);
  }
  return DEFAULT_FOOTER;
}

export function subscribeFooterSettings(cb: (s: FooterSettings) => void) {
  return onSnapshot(
    SETTINGS_DOC,
    (snap) => {
      if (snap.exists()) cb({ ...DEFAULT_FOOTER, ...(snap.data() as FooterSettings) });
      else cb(DEFAULT_FOOTER);
    },
    (err) => {
      console.error('subscribeFooterSettings error', err);
      cb(DEFAULT_FOOTER);
    }
  );
}

export async function saveFooterSettings(settings: FooterSettings): Promise<void> {
  await setDoc(SETTINGS_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// COUPONS
// ─────────────────────────────────────────────────────────────────────────────

export type CouponDiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  code: string; // uppercase, unique
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number; // percent (0-100) or fixed rupees
  minOrderValue?: number;
  maxDiscount?: number; // cap for percentage discounts
  validFrom?: string; // ISO date
  validTo?: string; // ISO date
  usageLimit?: number; // total redemptions allowed (0 = unlimited)
  perUserLimit?: number; // per-user redemptions (0 = unlimited)
  active: boolean;
}

export interface CouponsSettings {
  coupons: Coupon[];
  updatedAt?: unknown;
}

export const DEFAULT_COUPONS: CouponsSettings = { coupons: [] };

const COUPONS_DOC = doc(db, 'siteSettings', 'coupons');

export async function getCouponsSettings(): Promise<CouponsSettings> {
  try {
    const snap = await getDoc(COUPONS_DOC);
    if (snap.exists()) return { ...DEFAULT_COUPONS, ...(snap.data() as CouponsSettings) };
  } catch (e) {
    console.error('getCouponsSettings failed', e);
  }
  return DEFAULT_COUPONS;
}

export function subscribeCouponsSettings(cb: (s: CouponsSettings) => void) {
  return onSnapshot(
    COUPONS_DOC,
    (snap) => {
      if (snap.exists()) cb({ ...DEFAULT_COUPONS, ...(snap.data() as CouponsSettings) });
      else cb(DEFAULT_COUPONS);
    },
    (err) => {
      console.error('subscribeCouponsSettings error', err);
      cb(DEFAULT_COUPONS);
    }
  );
}

export async function saveCouponsSettings(settings: CouponsSettings): Promise<void> {
  await setDoc(COUPONS_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Validate a coupon code against current settings.
 * Returns { valid, coupon?, reason?, discount? } where discount is the rupee amount
 * to deduct given a subtotal. Time/usage validation against per-user/global counts
 * still must be enforced server-side at order placement (see orderService).
 */
export function evaluateCoupon(
  code: string,
  subtotal: number,
  coupons: Coupon[]
): { valid: boolean; coupon?: Coupon; reason?: string; discount?: number } {
  const trimmed = (code || '').trim().toUpperCase();
  if (!trimmed) return { valid: false, reason: 'Enter a coupon code' };
  const found = coupons.find((c) => c.code.toUpperCase() === trimmed);
  if (!found) return { valid: false, reason: 'Invalid coupon code' };
  if (!found.active) return { valid: false, reason: 'This coupon is no longer active' };
  const now = Date.now();
  if (found.validFrom && now < new Date(found.validFrom).getTime()) {
    return { valid: false, coupon: found, reason: 'Coupon not yet valid' };
  }
  if (found.validTo && now > new Date(found.validTo).getTime()) {
    return { valid: false, coupon: found, reason: 'Coupon has expired' };
  }
  if (found.minOrderValue && subtotal < found.minOrderValue) {
    return {
      valid: false,
      coupon: found,
      reason: `Minimum order ₹${found.minOrderValue} required`,
    };
  }
  let discount = 0;
  if (found.discountType === 'percentage') {
    discount = Math.floor((subtotal * found.discountValue) / 100);
    if (found.maxDiscount && discount > found.maxDiscount) discount = found.maxDiscount;
  } else {
    discount = Math.min(found.discountValue, subtotal);
  }
  return { valid: true, coupon: found, discount };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy order-value tiers. No longer edited anywhere - the admin panel now
 * exposes one universal charge - but kept so historic `siteSettings/delivery`
 * documents still parse and can be migrated on read.
 */
export interface DeliveryTier {
  id: string;
  label: string;
  minOrder: number;
  charge: number;
  estimatedDays?: string;
}

/** An exact charge for one destination state, overriding the outside-state rate. */
export interface StateDeliveryRate {
  id: string;
  state: string;
  charge: number;
}

/** Per-product delivery override, edited on the product form. */
export interface ProductDeliveryConfig {
  /** false => this product always ships free, whatever the universal setting says. */
  chargeEnabled: boolean;
  /** Charge when the destination is inside `homeState`. */
  withinState: number;
  /** Charge for every other state. */
  outsideState: number;
}

export interface DeliverySettings {
  /** Master switch for the universal charge. Off => free unless a product overrides. */
  enabled: boolean;
  /** Where orders ship from - destinations in this state pay `withinStateCharge`. */
  homeState: string;
  withinStateCharge: number;
  outsideStateCharge: number;
  /** Exact rates for specific far states (Delhi, Kerala, ...). */
  stateRates: StateDeliveryRate[];
  freeDeliveryAbove: number; // 0 = disabled
  estimatedDays?: string;
  /** @deprecated superseded by the universal charge; retained for old documents. */
  tiers?: DeliveryTier[];
  /** @deprecated COD was removed from checkout; retained so old orders still read. */
  codEnabled?: boolean;
  codCharge?: number;
  codMinOrder?: number;
  codMaxOrder?: number;
  updatedAt?: unknown;
}

export const DEFAULT_DELIVERY: DeliverySettings = {
  enabled: true,
  homeState: 'Andhra Pradesh',
  withinStateCharge: 50,
  outsideStateCharge: 100,
  stateRates: [],
  freeDeliveryAbove: 999,
  estimatedDays: '3-5 business days',
};

const DELIVERY_DOC = doc(db, 'siteSettings', 'delivery');

/**
 * Bring a stored delivery document up to the current shape.
 *
 * Documents written before the universal charge existed only carry `tiers`;
 * their flat rate becomes both the within- and outside-state charge so pricing
 * does not silently drop to zero the first time the new code reads an old doc.
 */
const normalizeDelivery = (raw: Partial<DeliverySettings> | undefined): DeliverySettings => {
  const merged = { ...DEFAULT_DELIVERY, ...(raw || {}) };

  if (raw && raw.withinStateCharge === undefined && Array.isArray(raw.tiers) && raw.tiers.length) {
    const legacyCharge = raw.tiers[0]?.charge ?? DEFAULT_DELIVERY.withinStateCharge;
    merged.withinStateCharge = legacyCharge;
    merged.outsideStateCharge = legacyCharge;
    merged.estimatedDays = raw.tiers[0]?.estimatedDays || merged.estimatedDays;
  }

  merged.enabled = raw?.enabled ?? true;
  merged.stateRates = Array.isArray(merged.stateRates) ? merged.stateRates : [];
  return merged;
};

export async function getDeliverySettings(): Promise<DeliverySettings> {
  try {
    const snap = await getDoc(DELIVERY_DOC);
    if (snap.exists()) return normalizeDelivery(snap.data() as DeliverySettings);
  } catch (e) {
    console.error('getDeliverySettings failed', e);
  }
  return DEFAULT_DELIVERY;
}

export function subscribeDeliverySettings(cb: (s: DeliverySettings) => void) {
  return onSnapshot(
    DELIVERY_DOC,
    (snap) => cb(snap.exists() ? normalizeDelivery(snap.data() as DeliverySettings) : DEFAULT_DELIVERY),
    (err) => {
      console.error('subscribeDeliverySettings error', err);
      cb(DEFAULT_DELIVERY);
    }
  );
}

export async function saveDeliverySettings(settings: DeliverySettings): Promise<void> {
  await setDoc(DELIVERY_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

const normalizeState = (v?: string) => (v || '').trim().toLowerCase();

/** One cart line, as far as delivery pricing is concerned. */
export interface DeliverableItem {
  delivery?: ProductDeliveryConfig | null;
}

/**
 * Charge for a single product shipped to `destinationState`.
 *
 * Precedence, highest first:
 *   1. A product marked "free delivery" ships free, always.
 *   2. A state listed in `stateRates` uses that exact charge - this is what
 *      keeps a far state like Delhi from being billed the same as a neighbour
 *      when everything ships from Andhra Pradesh.
 *   3. A product with its own charges uses them (within vs outside home state).
 *   4. Otherwise the universal charge applies, or 0 when it is switched off.
 *
 * `destinationState` is unknown until an address is chosen (the cart page), and
 * is then treated as the home state so the cart quotes the lower figure and
 * checkout adjusts it upward once the address is known.
 */
export function computeItemDeliveryCharge(
  item: DeliverableItem,
  destinationState: string | undefined,
  settings: DeliverySettings
): number {
  const cfg = item?.delivery;
  if (cfg && cfg.chargeEnabled === false) return 0;

  const isHome =
    !destinationState || normalizeState(destinationState) === normalizeState(settings.homeState);

  if (!isHome) {
    const override = (settings.stateRates || []).find(
      (r) => normalizeState(r.state) === normalizeState(destinationState)
    );
    if (override) return Math.max(0, override.charge || 0);
  }

  if (cfg && cfg.chargeEnabled) {
    return Math.max(0, (isHome ? cfg.withinState : cfg.outsideState) || 0);
  }

  if (!settings.enabled) return 0;
  return Math.max(0, (isHome ? settings.withinStateCharge : settings.outsideStateCharge) || 0);
}

/**
 * Delivery charge for a whole cart.
 *
 * The cart pays the *highest* line charge rather than the sum: a shopper buying
 * five bangles is one parcel, and summing per-product rates would quote absurd
 * shipping on a large order.
 */
export function computeDeliveryCharge(
  subtotal: number,
  settings: DeliverySettings,
  items: DeliverableItem[] = [],
  destinationState?: string
): { charge: number; freeDelivery: boolean; estimatedDays?: string } {
  if (settings.freeDeliveryAbove > 0 && subtotal >= settings.freeDeliveryAbove) {
    return { charge: 0, freeDelivery: true, estimatedDays: settings.estimatedDays };
  }

  const lines = items.length ? items : [{}];
  const charge = lines.reduce(
    (max, item) => Math.max(max, computeItemDeliveryCharge(item, destinationState, settings)),
    0
  );

  return { charge, freeDelivery: charge === 0, estimatedDays: settings.estimatedDays };
}

// ─────────────────────────────────────────────────────────────────────────────
// GST
// ─────────────────────────────────────────────────────────────────────────────

export interface GstSettings {
  enabled: boolean;
  rate: number; // percent
  inclusive: boolean; // true => price already includes GST, false => add on top
  displayInline: boolean; // show GST line in cart/checkout breakdown
  hsnCode?: string;
  updatedAt?: unknown;
}

export const DEFAULT_GST: GstSettings = {
  enabled: false,
  rate: 3,
  inclusive: false,
  displayInline: false,
};

const GST_DOC = doc(db, 'siteSettings', 'gst');

export async function getGstSettings(): Promise<GstSettings> {
  try {
    const snap = await getDoc(GST_DOC);
    if (snap.exists()) return { ...DEFAULT_GST, ...(snap.data() as GstSettings) };
  } catch (e) {
    console.error('getGstSettings failed', e);
  }
  return DEFAULT_GST;
}

export function subscribeGstSettings(cb: (s: GstSettings) => void) {
  return onSnapshot(
    GST_DOC,
    (snap) => {
      if (snap.exists()) cb({ ...DEFAULT_GST, ...(snap.data() as GstSettings) });
      else cb(DEFAULT_GST);
    },
    (err) => {
      console.error('subscribeGstSettings error', err);
      cb(DEFAULT_GST);
    }
  );
}

export async function saveGstSettings(settings: GstSettings): Promise<void> {
  await setDoc(GST_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Compute GST for a subtotal.
 * - inclusive=true : returns the GST portion already inside the subtotal (no extra charge)
 * - inclusive=false: returns the GST to be added on top of the subtotal
 */
export function computeGst(
  subtotal: number,
  settings: GstSettings
): { gstAmount: number; addOnTop: boolean } {
  if (!settings.enabled || settings.rate <= 0) return { gstAmount: 0, addOnTop: false };
  if (settings.inclusive) {
    const gstAmount = Math.round((subtotal * settings.rate) / (100 + settings.rate));
    return { gstAmount, addOnTop: false };
  }
  return { gstAmount: Math.round((subtotal * settings.rate) / 100), addOnTop: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER SUPPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export interface CustomerSupportSettings {
  phone: string;
  email: string;
  whatsapp: string;
  hours: string;
  responseTime: string;
  faqs: FaqEntry[];
  updatedAt?: unknown;
}

export const DEFAULT_SUPPORT: CustomerSupportSettings = {
  phone: '+91 6304960489',
  email: 'sreerasthusilvers@gmail.com',
  whatsapp: '+91 6304960489',
  hours: 'Mon – Sat · 10:00 AM – 9:00 PM',
  responseTime: 'Within 24 hours',
  faqs: [],
};

const SUPPORT_DOC = doc(db, 'siteSettings', 'customerSupport');

export async function getCustomerSupportSettings(): Promise<CustomerSupportSettings> {
  try {
    const snap = await getDoc(SUPPORT_DOC);
    if (snap.exists()) return { ...DEFAULT_SUPPORT, ...(snap.data() as CustomerSupportSettings) };
  } catch (e) {
    console.error('getCustomerSupportSettings failed', e);
  }
  return DEFAULT_SUPPORT;
}

export function subscribeCustomerSupportSettings(cb: (s: CustomerSupportSettings) => void) {
  return onSnapshot(
    SUPPORT_DOC,
    (snap) => {
      if (snap.exists()) cb({ ...DEFAULT_SUPPORT, ...(snap.data() as CustomerSupportSettings) });
      else cb(DEFAULT_SUPPORT);
    },
    (err) => {
      console.error('subscribeCustomerSupportSettings error', err);
      cb(DEFAULT_SUPPORT);
    }
  );
}

export async function saveCustomerSupportSettings(
  settings: CustomerSupportSettings
): Promise<void> {
  await setDoc(SUPPORT_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR PROMO BANNER
// ─────────────────────────────────────────────────────────────────────────────

export interface SidebarPromoSettings {
  active: boolean;
  headline: string;    // e.g. "Flat Rs. 500 off"
  subline: string;     // e.g. "on your first order"
  ctaLabel: string;    // e.g. "LOGIN / SIGN UP"
  updatedAt?: unknown;
}

export const DEFAULT_SIDEBAR_PROMO: SidebarPromoSettings = {
  active: true,
  headline: 'Flat Rs. 500 off',
  subline: 'on your first order',
  ctaLabel: 'LOGIN / SIGN UP',
};

const PROMO_DOC = doc(db, 'siteSettings', 'sidebarPromo');

export async function getSidebarPromo(): Promise<SidebarPromoSettings> {
  try {
    const snap = await getDoc(PROMO_DOC);
    if (snap.exists()) return { ...DEFAULT_SIDEBAR_PROMO, ...(snap.data() as SidebarPromoSettings) };
  } catch (e) {
    console.error('getSidebarPromo failed', e);
  }
  return DEFAULT_SIDEBAR_PROMO;
}

export function subscribeSidebarPromo(cb: (s: SidebarPromoSettings) => void) {
  return onSnapshot(
    PROMO_DOC,
    (snap) => {
      if (snap.exists()) cb({ ...DEFAULT_SIDEBAR_PROMO, ...(snap.data() as SidebarPromoSettings) });
      else cb(DEFAULT_SIDEBAR_PROMO);
    },
    (err) => {
      console.error('subscribeSidebarPromo error', err);
      cb(DEFAULT_SIDEBAR_PROMO);
    }
  );
}

export async function saveSidebarPromo(settings: SidebarPromoSettings): Promise<void> {
  await setDoc(PROMO_DOC, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

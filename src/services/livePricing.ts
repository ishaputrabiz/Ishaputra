import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * The one place that answers "what will this product actually cost?".
 *
 * Cart lines store the price from the moment an item was added, and every
 * `addToCart` call site (there are ~55) passes `product.price` - the stored
 * figure. For a silver-priced product that is wrong twice over: the product
 * card shows the price computed from the live rate per gram, and
 * /api/create-order charges the same live figure. So the card said one number,
 * the cart said another, and the payment was refused for "Order total mismatch"
 * because the client and server totals disagreed.
 *
 * Rather than patch all 55 call sites (and have the next one drift again), the
 * cart re-prices its lines from here, and so do the checkout preflight and the
 * server. Keep this formula identical to `computeSilverPrice` in
 * api/create-order.ts and `computeSilverOriginalPrice` in SilverRateContext.
 */
export const liveUnitPrice = (product: any, ratePerGram: number): number => {
  const sp = product?.silverPricing;
  if (sp?.enabled && ratePerGram > 0) {
    const metal = (Number(sp.weightGrams) || 0) * ratePerGram;
    const wastage = metal * ((Number(sp.wastagePercent) || 0) / 100);
    return Math.ceil(metal + wastage + (Number(sp.makingCharges) || 0));
  }
  return Number(product?.price) || 0;
};

/**
 * Current admin-set silver rate per gram, or 0 when it is not configured.
 *
 * Deliberately returns 0 rather than the storefront's display fallback: the
 * server treats a missing rate as "use the stored price", and pricing has to
 * agree with the server, not with the widget in the header.
 */
export const getSilverRatePerGram = async (): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, 'siteSettings', 'silverRate'));
    const raw = snap.exists() ? (snap.data() as any).manualPricePerGramInr : 0;
    return typeof raw === 'number' && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
};

export interface LiveProductInfo {
  price: number;
  stock: number;
  isActive: boolean;
  exists: boolean;
  name?: string;
  category?: string;
}

/**
 * Read the live price, stock and availability for a set of products.
 *
 * A read failure resolves to `exists: false` with `exists` distinguishable from
 * a genuine deletion by the absent `name`; callers treat an unreadable product
 * as "leave it alone" rather than blocking a valid checkout on a network blip.
 */
export const fetchLiveProductInfo = async (
  productIds: string[],
): Promise<Map<string, LiveProductInfo>> => {
  const ratePerGram = await getSilverRatePerGram();
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const out = new Map<string, LiveProductInfo>();

  await Promise.all(
    unique.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'products', id));
        if (!snap.exists()) {
          out.set(id, { price: 0, stock: 0, isActive: false, exists: false });
          return;
        }
        const data = snap.data() as any;
        out.set(id, {
          price: liveUnitPrice(data, ratePerGram),
          stock: Number(data?.inventory?.stock ?? 0),
          isActive: data?.flags?.isActive !== false,
          exists: true,
          name: data?.name,
          category: data?.category,
        });
      } catch {
        // Unreadable: omit it, so callers keep whatever they already had.
      }
    }),
  );

  return out;
};

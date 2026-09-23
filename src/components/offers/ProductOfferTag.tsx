import { useMemo, useState } from 'react';
import { BadgePercent, Check, Copy } from 'lucide-react';
import {
  computeCouponDiscount,
  couponAppliesTo,
  couponHeadline,
  couponTerms,
  type Coupon,
} from '@/services/couponService';
import { copyOfferCode, useBannerCoupons } from './useBannerCoupons';

/**
 * The offer, told in this product's own money, right under its price.
 *
 * "50% off at checkout" is abstract; "Get it for ₹4,500 with WELCOME50" is a
 * decision. Only advertised offers that apply to this product's category are
 * shown, best saving first. When the piece alone is below the offer's minimum
 * the label says how much more to add instead of hiding the offer.
 *
 * Styled as a small cut ticket, echoing the code chip in the site-wide ribbon.
 */

interface Props {
  /** The price the page is showing - the live silver price where that applies. */
  price: number;
  category?: string;
  subcategory?: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** What this offer is worth on this piece; unmet minimums rank last. */
const savingFor = (c: Coupon, price: number) =>
  price >= (c.minOrderValue || 0) ? computeCouponDiscount(c, price) : -1;

const ProductOfferTag = ({ price, category, subcategory }: Props) => {
  const offers = useBannerCoupons();
  const [copied, setCopied] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const applicable = useMemo(
    () =>
      offers
        .filter((c) => couponAppliesTo(c, category, subcategory))
        .sort((a, b) => savingFor(b, price) - savingFor(a, price)),
    [offers, category, subcategory, price],
  );

  if (!price || applicable.length === 0) return null;

  const visible = showAll ? applicable : applicable.slice(0, 1);

  const onCopy = async (code: string) => {
    await copyOfferCode(code);
    setCopied(code);
    window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 2200);
  };

  return (
    <div className="mt-4 space-y-2.5" aria-label="Offers on this product">
      {visible.map((c) => {
        const qualifies = price >= (c.minOrderValue || 0);
        const saving = qualifies ? computeCouponDiscount(c, price) : 0;
        const shortBy = qualifies ? 0 : (c.minOrderValue || 0) - price;
        const isCopied = copied === c.code;
        const terms = couponTerms(c, { includeScope: false });

        return (
          <div
            key={c.id}
            className="product-offer relative flex items-center gap-3 rounded-xl border border-[#d4af37]/45 px-3.5 py-3 sm:gap-4 sm:px-4"
          >
            {/* The ticket's cut-outs, punched in the page's own background. */}
            <span aria-hidden className="absolute -left-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-[#d4af37]/45 bg-background [clip-path:inset(0_0_0_50%)]" />
            <span aria-hidden className="absolute -right-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-[#d4af37]/45 bg-background [clip-path:inset(0_50%_0_0)]" />

            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#832729] text-[#f3d98f] shadow-[inset_0_0_0_1px_rgba(243,217,143,0.35)] dark:bg-[#5c1a1d]">
              <BadgePercent className="h-[18px] w-[18px]" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              {qualifies ? (
                <p className="text-sm leading-snug text-foreground">
                  Get it for{' '}
                  <span className="font-heading text-lg font-semibold text-[#832729] [font-variant-numeric:lining-nums] dark:text-[#e8c56a]">
                    {inr(price - saving)}
                  </span>{' '}
                  <span className="text-muted-foreground">with this code</span>
                </p>
              ) : (
                <p className="text-sm leading-snug text-foreground">
                  <span className="font-heading text-base font-semibold text-[#832729] [font-variant-numeric:lining-nums] dark:text-[#e8c56a]">
                    {couponHeadline(c)}
                  </span>{' '}
                  when you add {inr(shortBy)} more
                </p>
              )}
              {/* Two lines on phones rather than an ellipsis: the minimum order
                  is the part people need, and it is the part that got cut. */}
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">
                {isCopied
                  ? 'Copied - we will apply it for you at checkout'
                  : `${qualifies ? `You save ${inr(saving)} · ` : ''}${terms || couponHeadline(c)}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onCopy(c.code)}
              className="group relative inline-flex flex-shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-[#832729]/60 bg-white/70 px-2 py-1.5 text-xs font-semibold tracking-[0.08em] text-[#832729] sm:px-2.5 sm:tracking-[0.14em] transition-colors hover:bg-[#832729] hover:text-[#fbf3e4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#832729]/40 dark:border-[#e8c56a]/60 dark:bg-transparent dark:text-[#e8c56a] dark:hover:bg-[#e8c56a] dark:hover:text-zinc-900"
              aria-label={isCopied ? `Code ${c.code} copied` : `Copy code ${c.code}`}
            >
              {isCopied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  <span className="tracking-normal">Copied</span>
                </>
              ) : (
                <>
                  {c.code}
                  <Copy className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" aria-hidden />
                </>
              )}
            </button>
          </div>
        );
      })}

      {applicable.length > 1 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-medium text-[#832729] underline decoration-[#d4af37]/60 underline-offset-4 hover:text-[#5c1a1d] dark:text-[#e8c56a]"
        >
          {showAll ? 'Show fewer offers' : `+${applicable.length - 1} more offer${applicable.length > 2 ? 's' : ''}`}
        </button>
      )}

      <p className="sr-only" aria-live="polite">
        {copied ? `Code ${copied} copied. It will be applied at checkout.` : ''}
      </p>
    </div>
  );
};

export default ProductOfferTag;

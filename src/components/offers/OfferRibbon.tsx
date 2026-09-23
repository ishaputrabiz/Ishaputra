import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { couponHeadline, couponTerms, couponTermsShort, type Coupon } from '@/services/couponService';
import { toSlug } from '@/services/categoryService';
import { copyOfferCode, useBannerCoupons } from './useBannerCoupons';

/**
 * Site-wide offer ribbon, above the header.
 *
 * Until now a customer only discovered a coupon at the very last step, on the
 * checkout page. This puts the offers the admin has switched on ("Show in offer
 * banner") in front of them on every page, and tapping the code both copies it
 * and has checkout apply it automatically.
 *
 * Deliberately quiet: a slim band in the house maroon with a gold hairline,
 * rotating when there is more than one offer, pausing while hovered, and
 * dismissible for the visit. A new offer brings it back even after a dismiss.
 */

const DISMISS_KEY = 'ss:offerRibbonDismissed';
const ROTATE_MS = 5500;

/** Pages where the ribbon would be noise or would compete with the page itself. */
const HIDDEN_ON = ['/checkout', '/admin', '/delivery', '/signup', '/login', '/forgot-password'];

/** Where "Shop now" goes: the one category an offer is limited to, else everything. */
const shopLink = (c: Coupon) =>
  c.applicableCategories && c.applicableCategories.length === 1
    ? `/category/${toSlug(c.applicableCategories[0])}`
    : '/products';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
};

const OfferRibbon = () => {
  const { pathname } = useLocation();
  const offers = useBannerCoupons();
  const reduceMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // The set of offers the visitor dismissed. A different set - a new offer
  // switched on - shows the ribbon again.
  const signature = useMemo(() => offers.map((o) => o.id).join(','), [offers]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (offers.length < 2 || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % offers.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [offers.length, paused]);

  // Keep the index valid when an offer is switched off mid-rotation.
  useEffect(() => {
    if (index >= offers.length) setIndex(0);
  }, [index, offers.length]);

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;
  if (offers.length === 0 || dismissed === signature) return null;

  const offer: Coupon = offers[Math.min(index, offers.length - 1)];
  const terms = couponTerms(offer);
  const shortTerms = couponTermsShort(offer);
  const isCopied = copied === offer.code;

  // Phones name the offer on line one. With no description to show, the
  // condition moves up there instead, so neither line is ever empty filler.
  const description = offer.description?.trim() || '';
  const eyebrow = description || shortTerms || 'Limited offer';
  const secondLineTerms = description ? shortTerms : '';

  const onCopy = async () => {
    await copyOfferCode(offer.code);
    setCopied(offer.code);
    window.setTimeout(() => setCopied((c) => (c === offer.code ? null : c)), 2200);
  };

  // The code, as a small gold ticket. Tapping it is the call to action.
  const ticket = (
    <button
      type="button"
      onClick={onCopy}
      className="offer-ticket group relative inline-flex flex-shrink-0 items-center gap-1 overflow-hidden rounded-md border border-dashed border-[#e8c56a]/70 bg-[#e8c56a]/10 px-1.5 py-[3px] text-[10.5px] font-semibold tracking-[0.04em] min-[380px]:tracking-[0.08em] text-[#f3d98f] transition-colors hover:bg-[#e8c56a]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c56a]/70 md:gap-1.5 md:px-2.5 md:text-[11px] md:tracking-[0.18em]"
      aria-label={isCopied ? `Code ${offer.code} copied` : `Copy code ${offer.code}`}
    >
      <span aria-hidden className="offer-ticket__foil pointer-events-none absolute inset-0" />
      <span className="relative">{isCopied ? 'COPIED' : offer.code}</span>
      {isCopied ? (
        <Check className="relative h-3 w-3" aria-hidden />
      ) : (
        <Copy className="relative h-3 w-3 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden />
      )}
    </button>
  );

  const onDismiss = () => {
    setDismissed(signature);
    try {
      sessionStorage.setItem(DISMISS_KEY, signature);
    } catch {
      // Private mode: it stays hidden until the next page load, which is fine.
    }
  };

  return (
    <div
      role="region"
      aria-label="Current offers"
      className="offer-ribbon relative z-[60] overflow-hidden text-[#fbf3e4]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Engraved-line texture and the gold hairline that finishes the edge. */}
      <div aria-hidden className="offer-ribbon__engraving pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#e8c56a]/80 to-transparent"
      />

      <div className="relative mx-auto flex min-h-[54px] max-w-[1440px] items-center justify-center px-8 py-1.5 md:h-10 md:min-h-0 md:px-10 md:py-0 lg:h-[42px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={offer.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            {/*
              Phones: two lines. The single line used to drop the offer's name
              and its conditions below 768px, leaving just "25% OFF" and a code
              - a number with no idea what it was for. Line one names the offer;
              line two gives the value, the one condition that matters and the
              code.
            */}
            <div className="flex flex-col items-center gap-1 md:hidden">
              <span className="max-w-full truncate text-[9.5px] font-medium uppercase tracking-[0.2em] text-[#e8c56a]">
                <span aria-hidden>✦ </span>
                {eyebrow}
                <span aria-hidden> ✦</span>
              </span>
              <span className="flex max-w-full items-center gap-1 min-[380px]:gap-1.5">
                <span className="whitespace-nowrap font-heading text-[14px] italic leading-none [font-variant-numeric:lining-nums] min-[380px]:text-[15px]">
                  {couponHeadline(offer)}
                </span>
                {secondLineTerms && (
                  <span className="min-w-0 truncate text-[10px] leading-none text-[#fbf3e4]/80 min-[380px]:text-[10.5px]">
                    {secondLineTerms}
                  </span>
                )}
                {ticket}
              </span>
            </div>

            {/* Tablet and up: one line. The full small print needs a laptop's
                width, so tablets get the short form instead of nothing. */}
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <span aria-hidden className="text-[11px] text-[#e8c56a]">✦</span>

              {offer.description?.trim() && (
                <span className="truncate text-[10px] font-medium uppercase tracking-[0.28em] text-[#e8c56a]">
                  {offer.description.trim()}
                </span>
              )}

              <span className="flex min-w-0 items-baseline gap-2">
                <span className="whitespace-nowrap font-heading text-base italic leading-none [font-variant-numeric:lining-nums]">
                  {couponHeadline(offer)}
                </span>
                {terms && <span className="hidden truncate text-[11px] text-[#fbf3e4]/70 lg:inline">{terms}</span>}
                {shortTerms && (
                  <span className="truncate text-[11px] text-[#fbf3e4]/70 lg:hidden">{shortTerms}</span>
                )}
              </span>

              {ticket}

              {isCopied ? (
                <span className="whitespace-nowrap text-[11px] text-[#fbf3e4]/80">Copied · applied at checkout</span>
              ) : (
                <Link
                  to={shopLink(offer)}
                  className="hidden whitespace-nowrap text-[11px] font-medium text-[#fbf3e4] underline decoration-[#e8c56a]/60 underline-offset-4 transition-colors hover:text-[#f3d98f] lg:inline"
                >
                  Shop now →
                </Link>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <span className="sr-only" aria-live="polite">
          {isCopied ? `Code ${offer.code} copied. It will be applied at checkout.` : ''}
        </span>

        {offers.length > 1 && (
          <span aria-hidden className="absolute right-10 hidden items-center gap-1 xl:flex">
            {offers.map((o, i) => (
              <span
                key={o.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === index ? 'w-3 bg-[#e8c56a]' : 'w-1 bg-[#fbf3e4]/35'
                }`}
              />
            ))}
          </span>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-1.5 grid h-6 w-6 place-items-center rounded-full text-[#fbf3e4]/70 transition-colors hover:bg-white/10 hover:text-[#fbf3e4] md:right-3 md:h-7 md:w-7"
          aria-label="Dismiss offers"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default OfferRibbon;

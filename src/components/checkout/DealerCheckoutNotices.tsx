// ============================================
// DEALER PRICES IN THE CART AND AT CHECKOUT: pure views, props only. The
// callers read the quote with useDealerQuote() and render these in place of
// (or beside) the retail rows when it says dealer prices apply, or are within
// reach. Display only: the server charges what it works out itself.
// ============================================

import { useId } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, ChevronRight, Store } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { formatINR } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface DealerNudgeProps {
  /** The cart at regular prices, rupees. */
  regularSubtotal: number;
  /** Dealer prices apply from this much at regular prices, rupees. */
  minOrder: number;
  /** Rupees more, at regular prices, before dealer prices apply. */
  shortBy: number;
  /** What the cart's items would cost less at dealer prices, rupees. 0 hides the sentence. */
  potentialSavings: number;
  /** One line for the cart drawer: no heading, numbers row or link. */
  compact?: boolean;
  className?: string;
}

/** How full the bar is, 0 to 1. */
const progress = (regularSubtotal: number, minOrder: number) =>
  minOrder > 0 ? Math.min(1, Math.max(0, regularSubtotal / minOrder)) : 0;

/**
 * An approved dealer whose cart is below the dealer minimum: how far off it is
 * (and, when they are known, what the items would save), with a progress bar.
 */
export const DealerNudge = ({ regularSubtotal, minOrder, shortBy, potentialSavings, compact = false, className }: DealerNudgeProps) => {
  const headingId = useId();
  const ratio = progress(regularSubtotal, minOrder);
  const gap = (
    <>
      Add <span className="font-semibold tabular-nums text-foreground">{formatINR(shortBy)}</span> more to unlock dealer prices.
    </>
  );

  if (compact) {
    return (
      <div className={cn('rounded-control border border-primary/25 bg-primary/[0.06] px-3 py-2.5 text-sm text-foreground', className)}>
        <p className="flex items-start gap-2 leading-snug">
          <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{gap}</span>
        </p>
        <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${ratio})` }} />
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn('tx-sheet rounded-card border border-primary/25 p-4 shadow-panel lg:rounded-panel lg:p-6', className)}
    >
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="tx-slate flex size-10 shrink-0 items-center justify-center rounded-[8px] text-highlight-soft">
          <Store className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            Dealer prices from {formatINR(minOrder)}
          </h2>
          {/* Only facts about this cart: the gap, and what these items cost less at dealer prices. */}
          <p className="mt-0.5 text-sm leading-relaxed text-foreground/80">
            {gap}
            {potentialSavings > 0 && (
              <>
                {' '}
                These items cost <span className="font-semibold tabular-nums text-foreground">{formatINR(potentialSavings)}</span> less at dealer prices.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: ratio }}
            transition={{ duration: DUR.reveal * 1.5, ease: EASE_OUT }}
            className="h-full origin-left rounded-full bg-primary"
          />
        </div>
        <p className="mt-1.5 flex justify-between gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span>{formatINR(regularSubtotal)} at regular prices</span>
          <span>{formatINR(minOrder)}</span>
        </p>
      </div>
      <Link to="/products" className="link-arrow relative mt-3 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
        Add more items <ChevronRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
};

interface DealerAppliedNoticeProps {
  /** The cart at regular prices, rupees. */
  regularSubtotal: number;
  /** What dealer prices save on this cart, rupees. */
  savings: number;
  /** One line for the cart drawer. */
  compact?: boolean;
  className?: string;
}

/** Dealer prices are being charged for this cart. */
export const DealerAppliedNotice = ({ regularSubtotal, savings, compact = false, className }: DealerAppliedNoticeProps) => {
  if (compact) {
    return (
      <Notice tone="success" icon={BadgeCheck} compact className={className}>
        Dealer prices applied. You save <span className="font-semibold tabular-nums">{formatINR(savings)}</span>.
      </Notice>
    );
  }
  return (
    <Notice tone="success" icon={BadgeCheck} title="Dealer prices applied" className={className}>
      Your order is worth <span className="tabular-nums">{formatINR(regularSubtotal)}</span> at regular prices, so dealer prices apply.
      You save <span className="font-semibold tabular-nums">{formatINR(savings)}</span>.
      <span className="mt-1 block text-xs text-muted-foreground">Dealer-priced orders don't earn points or scratch cards.</span>
    </Notice>
  );
};

interface DealerLinePriceProps {
  /** The charged (dealer) unit price, rupees. */
  unit: number;
  /** The regular unit price, rupees. */
  regular: number;
  /**
   * 'stacked': the phone cart line (price, then the struck price and chip under it).
   * 'inline': the desktop cart line (one wrapping row).
   * 'each': the cart drawer, under the line total ("₹640 each").
   */
  layout?: 'stacked' | 'inline' | 'each';
}

/**
 * "₹640 ~~₹800~~ [Dealer −20%]" on a cart line. A line with no dealer saving
 * (its unit is not below the regular price) shows its plain price, and a saving
 * that rounds to 0% shows no chip.
 */
export const DealerLinePrice = ({ unit, regular, layout = 'stacked' }: DealerLinePriceProps) => {
  const saves = unit < regular;
  const percentOff = saves ? Math.round((1 - unit / regular) * 100) : 0;
  const chip = percentOff > 0 ? <span className="chip-off whitespace-nowrap">Dealer −{percentOff}%</span> : null;

  if (layout === 'each') {
    return (
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
        <span>
          {saves && <span className="sr-only">Dealer price </span>}
          {formatINR(unit)} each
        </span>
        {saves && (
          <span className="price-was">
            <span className="sr-only">Regular price </span>
            {formatINR(regular)}
          </span>
        )}
        {chip}
      </span>
    );
  }

  if (layout === 'inline') {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {saves && <span className="sr-only">Dealer price </span>}
        <span className="price-now">{formatINR(unit)}</span>
        {saves && (
          <span className="price-was text-sm">
            <span className="sr-only">Regular price </span>
            {formatINR(regular)}
          </span>
        )}
        {chip}
      </p>
    );
  }

  return (
    <div className="mt-1.5">
      {saves && <span className="sr-only">Dealer price </span>}
      <span className="whitespace-nowrap text-base font-bold tabular-nums text-foreground">{formatINR(unit)}</span>
      {saves && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="price-was whitespace-nowrap text-xs">
            <span className="sr-only">Regular price </span>
            {formatINR(regular)}
          </span>
          {chip}
        </div>
      )}
    </div>
  );
};

// ============================================
// DEALER PRICES ON PRODUCT SURFACES: pure views, props only. The caller reads
// the dealer unit price with useDealerUnit() and renders these instead of its
// usual price row when that returns a price; the server charges what it works
// out itself, so this is display only. A customer with no dealer price never
// reaches this file.
// ============================================

import { Info, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DealerPriceProps {
  /** The dealer unit price, rupees. */
  unit: number;
  /** The regular unit price it replaces, rupees. */
  regular: number;
  /** Whole percent saved. 0 hides the chip (a tiny discount can round to 0). */
  percentOff: number;
}

interface DealerPriceInlineProps extends DealerPriceProps {
  /**
   * 'md': product cards (15px, 18px from lg). 'sm': compact rows (14px).
   * 'lg' (18px) and 'xl' (24px): the home spotlight and mosaic tiles, whose own prices are bigger.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * 'paper' (default): the price on a card or the page background.
   * 'dark': the price on charcoal or on a photo scrim (a `text-charcoal-foreground`
   * surface): light price, softer struck price, and a chip with its own charcoal fill
   * so it reads at 7.2:1 whatever the photo behind it is.
   */
  tone?: 'paper' | 'dark';
  /** Price and struck price on one line (the struck price wraps under only when there is no room), the chip on its own line below. */
  stacked?: boolean;
  /**
   * With `stacked`: keep the chip's line even when there is no chip (a saving
   * that rounds to 0), so cards side by side share one baseline (the home row cards).
   */
  reserveChipLine?: boolean;
  className?: string;
}

const SIZES = {
  md: { now: 'text-[15px] lg:text-lg', was: 'text-xs lg:text-sm' },
  sm: { now: 'text-sm', was: 'text-[11px]' },
  lg: { now: 'text-lg', was: 'text-xs md:text-sm' },
  xl: { now: 'text-2xl', was: 'text-sm' },
} as const;

/*
 * Contrast of the dark tone, from the tokens (identical in the light and dark themes:
 * --charcoal, --charcoal-foreground and --highlight-soft do not change):
 *   price, charcoal-foreground       14.9:1 on solid charcoal
 *   struck price, foreground at 85%  11.0:1 on solid charcoal
 *   chip text, highlight-soft         7.2:1 on its own charcoal fill, so photo-independent
 * On the photo-scrim, measured on rendered tiles over a pure white photo (the worst case):
 * price 5.1:1 or better, struck price 5.2:1 or better, whatever the tile size or theme.
 */
const TONES = {
  paper: { now: 'price-now', was: 'price-was', chip: undefined },
  dark: {
    now: 'font-bold tabular-nums text-charcoal-foreground',
    was: 'tabular-nums text-charcoal-foreground/85 line-through',
    chip: 'bg-charcoal !border-highlight-soft/60 !text-highlight-soft',
  },
} as const;

/** "Dealer −20%", on one line. Nothing when the saving rounds to 0. */
const DealerChip = ({ percentOff, className }: { percentOff: number; className?: string }) =>
  percentOff > 0 ? <span className={cn('chip-off whitespace-nowrap', className)}>Dealer −{percentOff}%</span> : null;

/** "₹640 ~~₹800~~ [Dealer −20%]": the price row of a card, search row or wishlist card. */
export const DealerPriceInline = ({ unit, regular, percentOff, size = 'md', tone = 'paper', stacked = false, reserveChipLine = false, className }: DealerPriceInlineProps) => {
  const s = SIZES[size];
  const t = TONES[tone];
  const now = (
    <>
      <span className="sr-only">Dealer price </span>
      <span className={cn(t.now, s.now)}>{formatINR(unit)}</span>
    </>
  );
  const was = (
    <span className={cn(t.was, s.was)}>
      <span className="sr-only">Regular price </span>
      {formatINR(regular)}
    </span>
  );

  if (stacked) {
    return (
      <span className={cn('flex min-w-0 flex-col gap-1', className)}>
        {/* One line while it fits; in a narrow card (a 5-digit price beside the cart button) the struck price drops under it instead of running into the button. */}
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 whitespace-nowrap">
          {now}
          {was}
        </span>
        {(percentOff > 0 || reserveChipLine) && (
          <span className="flex h-[18px] items-center">
            <DealerChip percentOff={percentOff} className={t.chip} />
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1', className)}>
      {now}
      {was}
      <DealerChip percentOff={percentOff} className={t.chip} />
    </span>
  );
};

interface DealerPriceBlockProps extends DealerPriceProps {
  /** Dealer prices apply when the order is worth this much at regular prices, rupees. 0: no minimum. */
  minOrder: number;
}

/** The product page's price block for an approved dealer: the dealer price leads, the regular price is struck. */
export const DealerPriceBlock = ({ unit, regular, percentOff, minOrder }: DealerPriceBlockProps) => (
  <>
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
      <Store aria-hidden="true" className="size-4" />
      Dealer price
    </p>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="price-now text-3xl lg:text-4xl">{formatINR(unit)}</span>
      <span className="text-sm text-muted-foreground md:text-base">
        Regular{' '}
        <span className="price-was text-lg md:text-xl">
          <span className="sr-only">price </span>
          {formatINR(regular)}
        </span>
      </span>
      <DealerChip percentOff={percentOff} className="!px-2.5 !py-0.5 !text-[11px]" />
    </div>
    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:text-[11px]">
      Inclusive of all taxes
    </p>
    <p className="mt-4 flex items-start gap-2.5 rounded-control border border-primary/25 bg-primary/[0.06] p-3 text-sm leading-relaxed text-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        {minOrder > 0
          ? `Dealer prices apply on orders of ${formatINR(minOrder)} or more at regular prices.`
          : 'Dealer prices apply on every order.'}{' '}
        {/* Foreground text, underlined in copper: copper text on this tint is 4.4:1, under the 4.5:1 floor. */}
        <Link to="/dealer" className="font-semibold text-foreground underline decoration-primary underline-offset-4 hover:decoration-2">
          How it works
        </Link>
      </span>
    </p>
  </>
);

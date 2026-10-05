import { CircleAlert, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { dealerUnitPrice } from '@/lib/dealer';
import { dealerPriceError, parseDealerPrice } from '@/lib/dealerPriceForm';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Where the stored dealer price is: being read, read, or could not be read. */
export type DealerPriceLoad = 'loading' | 'ready' | 'error';

export interface DealerPriceFieldViewProps {
  /** The typed text; '' means no fixed price. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** The product's regular price in rupees (0 until it is entered). */
  regularPrice: number;
  /** The store-wide dealer discount in percent; null until it has been read. */
  storeWidePercent: number | null;
  load: DealerPriceLoad;
  /** The form's message for this field, shown under it. */
  error?: string;
}

const NO_FIXED_PRICES = {};

/**
 * The optional "Dealer price" under Price and Discount on the product form: a
 * fixed price for approved dealers, or blank to use the store-wide discount.
 * Props only (no Firestore); ProductForm reads and writes the price.
 */
export function DealerPriceFieldView({
  value,
  onChange,
  onBlur,
  regularPrice,
  storeWidePercent,
  load,
  error,
}: DealerPriceFieldViewProps) {
  const ready = load === 'ready';
  const loadFailed = load === 'error';
  const hasPrice = regularPrice > 0;

  // What dealers would pay for the typed value, or for blank, the store-wide discount.
  const storeWide =
    hasPrice && storeWidePercent !== null
      ? dealerUnitPrice('', regularPrice, { discountPercent: storeWidePercent, productPrices: NO_FIXED_PRICES })
      : null;
  const typedError = dealerPriceError(value, regularPrice);
  const typed = parseDealerPrice(value);
  const effective = typed !== null && !typedError ? typed : storeWide;
  const off = effective !== null && hasPrice ? Math.round(((regularPrice - effective) / regularPrice) * 100) : 0;

  const errorId = 'pf-dealer-price-error';
  const loadErrorId = 'pf-dealer-price-load-error';
  const describedBy = cn('pf-dealer-price-hint', error && errorId, loadFailed && loadErrorId);

  return (
    <div className="rounded-card border border-foreground/[0.08] bg-muted/40 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div data-field-error={!!error}>
          <Label htmlFor="pf-dealer-price" className="text-foreground/80">
            Dealer price (&#8377;)
            <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="pf-dealer-price"
            name="dealerPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            disabled={!ready}
            placeholder={ready ? `Store-wide ${storeWidePercent}% off` : load === 'loading' ? 'Loading…' : ''}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            className={cn('mt-2 bg-card tabular-nums', error && 'border-destructive focus-visible:border-destructive')}
          />
          {error && (
            <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-status-danger-fg">
              <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          {loadFailed && (
            <p id={loadErrorId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-status-danger-fg">
              <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {"Couldn't load the dealer price."}
            </p>
          )}
        </div>
        {ready && (
          <div className="sm:col-span-2 sm:pt-[1.625rem]">
            <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-foreground/[0.08] bg-card px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Dealers pay</span>
              {typedError ? (
                <span className="text-sm text-muted-foreground">Fix the dealer price to see it</span>
              ) : effective === null ? (
                <span className="text-sm text-muted-foreground">Enter the price first</span>
              ) : (
                <span className="flex items-baseline gap-2">
                  <span className="price-now text-base">{formatINR(effective)}</span>
                  {hasPrice && <span className="price-was text-xs">{formatINR(regularPrice)}</span>}
                  {off > 0 && <span className="chip-off">{off}% off</span>}
                </span>
              )}
              <StatusBadge tone="neutral" icon={Lock} label="Dealers only" className="ml-auto" />
            </div>
          </div>
        )}
      </div>
      <p id="pf-dealer-price-hint" className="mt-2 text-xs text-muted-foreground">
        {ready ? (
          <>
            Leave blank to use the store-wide {storeWidePercent}% off{storeWide !== null ? ` (${formatINR(storeWide)})` : ''}.{' '}
          </>
        ) : null}
        Only approved dealers see it.
      </p>
    </div>
  );
}

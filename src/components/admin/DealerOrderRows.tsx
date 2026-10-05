import { Store } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DealerOrderTotals } from '@/lib/dealerPriceForm';
import { formatINR } from '@/lib/format';

/** Next to the payment status on a dealer order (an approved dealer's cart, charged dealer prices). */
export const DealerOrderChip = () => <StatusBadge tone="neutral" icon={Store} label="Dealer order" />;

/**
 * The two rows a dealer order adds to the pricing breakdown, above Subtotal
 * (which is already at dealer prices): what the items cost at regular prices,
 * and the dealer saving. Rows of the page's `space-y-1.5 text-sm tabular-nums`
 * list. Props only; AdminOrderDetails works the totals out.
 */
export function DealerOrderTotalsRows({ totals }: { totals: DealerOrderTotals }) {
  return (
    <>
      <div className="flex justify-between text-foreground/80">
        <span>Items at regular prices</span>
        <span>{formatINR(totals.regularSubtotal)}</span>
      </div>
      <div className="flex justify-between text-status-success-fg">
        <span>Dealer prices</span>
        <span>-{formatINR(totals.savings)}</span>
      </div>
    </>
  );
}

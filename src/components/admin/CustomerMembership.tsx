import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CirclePause, CircleX, Clock, Copy, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusTone } from '@/lib/orderStatus';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DealerStatus } from '@/services/dealerService';

/** The customer's loyalty tier and progress to the next one. */
export type MembershipLoyalty =
  | { state: 'loading' }
  | { state: 'error' }
  | {
      state: 'ready';
      /** Rupees paid online on delivered orders (what the tier is worked out from). */
      spend: number;
      /** The next tier up, or null at the top. */
      next: { name: string; minSpend: number } | null;
    };

/** The customer's dealer application, if they have one. */
export type MembershipDealer =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'none' }
  | { state: 'found'; status: DealerStatus; businessName: string };

export interface CustomerMembershipViewProps {
  /** "IB 2005 5564 1996" */
  memberNumber: string;
  onCopy: () => void;
  loyalty: MembershipLoyalty;
  dealer: MembershipDealer;
  /** Read the tier and the dealer record again after a failed read. */
  onRetry: () => void;
}

const DEALER_STATUS: Record<DealerStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  pending: { label: 'Pending', tone: 'warning', icon: Clock },
  approved: { label: 'Approved', tone: 'success', icon: BadgeCheck },
  rejected: { label: 'Rejected', tone: 'danger', icon: CircleX },
  suspended: { label: 'Suspended', tone: 'neutral', icon: CirclePause },
};

/** The link-arrow is about 20px tall: give it a 44px hit area. */
const LINK_HIT = "relative after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-['']";

const money = (n: number) => Math.round(n * 100) / 100;

const RetryButton = ({ onRetry, label }: { onRetry: () => void; label: string }) => (
  <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-label={label} className="h-11 sm:h-9">
    <RefreshCw aria-hidden="true" /> Retry
  </Button>
);

/**
 * Under the name on Admin > Customers > one customer: the member number, the
 * tier progress, and the dealer status when they have applied. Props only (no
 * Firestore); useCustomerMembership supplies them.
 */
export function CustomerMembershipView({ memberNumber, onCopy, loyalty, dealer, onRetry }: CustomerMembershipViewProps) {
  const showDealer = dealer.state !== 'none';
  const dealerStatus = dealer.state === 'found' ? DEALER_STATUS[dealer.status] : null;

  return (
    <dl
      className={cn(
        'mt-5 grid grid-cols-1 gap-3 border-t border-foreground/[0.08] pt-4 text-sm sm:grid-cols-2 lg:gap-x-8',
        showDealer ? 'lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]' : 'lg:grid-cols-[auto_minmax(0,1fr)]',
      )}
    >
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-medium text-muted-foreground">Member number</dt>
        <dd className="-my-1.5 flex items-center gap-1">
          <span className="font-semibold tabular-nums tracking-[0.06em] text-foreground">{memberNumber}</span>
          <IconButton label="Copy member number" size="sm" tooltip onClick={onCopy}>
            <Copy />
          </IconButton>
        </dd>
      </div>

      <div className="flex flex-col gap-1">
        <dt className="text-xs font-medium text-muted-foreground">Tier progress</dt>
        <dd className="text-foreground">
          {loyalty.state === 'loading' && (
            <>
              <Skeleton className="h-5 w-full max-w-xs" />
              <span role="status" className="sr-only">
                Loading the tier
              </span>
            </>
          )}
          {loyalty.state === 'error' && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span role="alert" className="text-status-danger-fg">
                Couldn&rsquo;t load the tier.
              </span>
              <RetryButton onRetry={onRetry} label="Retry loading the tier" />
            </span>
          )}
          {loyalty.state === 'ready' && (
            <>
              <span className="font-semibold tabular-nums">{formatINR(loyalty.spend)}</span> paid online on delivered orders
              {' · '}
              {loyalty.next ? (
                <span className="text-muted-foreground">
                  <span className="tabular-nums">{formatINR(money(Math.max(0, loyalty.next.minSpend - loyalty.spend)))}</span> more for{' '}
                  {loyalty.next.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Top tier</span>
              )}
            </>
          )}
        </dd>
      </div>

      {showDealer && (
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <dt className="text-xs font-medium text-muted-foreground">Dealer</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {dealer.state === 'loading' && (
              <>
                <Skeleton className="h-6 w-28" />
                <span role="status" className="sr-only">
                  Loading the dealer status
                </span>
              </>
            )}
            {dealer.state === 'error' && (
              <>
                <span role="alert" className="text-status-danger-fg">
                  Couldn&rsquo;t load the dealer status.
                </span>
                <RetryButton onRetry={onRetry} label="Retry loading the dealer status" />
              </>
            )}
            {dealer.state === 'found' && dealerStatus && (
              <>
                <StatusBadge tone={dealerStatus.tone} icon={dealerStatus.icon} label={dealerStatus.label} />
                {dealer.businessName && <span className="min-w-0 break-words text-foreground/80">{dealer.businessName}</span>}
                <Link to={`/admin/dealers?tab=${dealer.status}`} className={cn('link-arrow', LINK_HIT)}>
                  View in Dealers <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

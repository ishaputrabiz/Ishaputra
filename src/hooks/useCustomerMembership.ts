import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BRAND } from '@/config/brand';
import { formatMemberNumber, memberDigits } from '@/lib/loyaltyCard';
import { useLoyaltyStatus } from '@/hooks/useLoyaltyStatus';
import { getDealerRecord } from '@/services/dealerService';
import type { CustomerMembershipViewProps, MembershipDealer, MembershipLoyalty } from '@/components/admin/CustomerMembership';

/**
 * What Admin > Customers > one customer shows about their membership: the
 * member number, the tier (worked out as the server does, see
 * useLoyaltyStatus) and their dealer application. Admins can read all of it.
 * `tier` is the position for the TierChip beside the name, null until known.
 */
export function useCustomerMembership(customerId: string | null | undefined) {
  const loyalty = useLoyaltyStatus(customerId);
  const [dealer, setDealer] = useState<MembershipDealer>({ state: customerId ? 'loading' : 'none' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!customerId) {
      setDealer({ state: 'none' });
      return;
    }
    let live = true;
    setDealer({ state: 'loading' });
    getDealerRecord(customerId)
      .then((record) => {
        if (live) setDealer(record ? { state: 'found', status: record.status, businessName: record.businessName } : { state: 'none' });
      })
      .catch((error: unknown) => {
        console.error('Error loading the dealer record:', error);
        if (live) setDealer({ state: 'error' });
      });
    return () => {
      live = false;
    };
  }, [customerId, attempt]);

  const memberNumber = useMemo(
    () => (customerId ? formatMemberNumber(memberDigits(customerId), BRAND.memberPrefix) : ''),
    [customerId],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(memberNumber.replace(/\s/g, ''));
      toast('Member number copied');
    } catch {
      toast.error('Could not copy the member number');
    }
  }, [memberNumber]);

  const { retry: retryLoyalty } = loyalty;
  const retry = useCallback(() => {
    retryLoyalty();
    setAttempt((n) => n + 1);
  }, [retryLoyalty]);

  const tierIndex = Math.min(loyalty.tierIndex, loyalty.tiers.length - 1);
  const tier = loyalty.loading || loyalty.error || !loyalty.tiers[tierIndex] ? null : { index: tierIndex, ...loyalty.tiers[tierIndex] };
  const next = loyalty.tiers[tierIndex + 1];

  const loyaltyView: MembershipLoyalty = loyalty.loading
    ? { state: 'loading' }
    : loyalty.error
      ? { state: 'error' }
      : { state: 'ready', spend: loyalty.spend, next: next ? { name: next.name, minSpend: next.minSpend } : null };

  const view: CustomerMembershipViewProps = { memberNumber, onCopy: copy, loyalty: loyaltyView, dealer, onRetry: retry };
  return { view, tier };
}

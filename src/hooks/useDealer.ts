import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { dealerQuote, dealerUnitPrice, type DealerQuote } from '@/lib/dealer';
import {
  createDealerStore,
  EMPTY_DEALER_STATE,
  LOADING_DEALER_STATE,
  type DealerState,
} from '@/lib/dealerState';
import { subscribeDealerPricing, subscribeDealerSettings, subscribeOwnDealer } from '@/services/dealerService';

/*
 * The signed-in customer's dealer state, shared by every component in the
 * session (one set of listeners, module state): the public programme
 * settings, their own application, and, only once they are an approved dealer
 * while the programme is on, the private dealer prices. Guests read nothing.
 *
 * The state machine lives in src/lib/dealerState.ts. A read that fails, or
 * that answers "missing" only from the offline cache, is `unavailable`, never
 * "not a dealer" and never the default percent; checkout holds payment on it
 * only for carts a dealer could be priced differently on (dealerPayHold) and
 * offers Retry (retryDealer).
 */

export type { DealerState };

const store = createDealerStore({
  subscribeSettings: subscribeDealerSettings,
  subscribeRecord: subscribeOwnDealer,
  subscribePricing: subscribeDealerPricing,
});

/** Checkout's "Retry" after the dealer state could not be read: subscribe again to what failed. */
export const retryDealer = store.retry;

export function useDealer(): DealerState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => store.watch(uid), [uid]);
  const snap = useSyncExternalStore(store.subscribe, store.getState, () => EMPTY_DEALER_STATE);
  if (uid && store.getUid() !== uid) return LOADING_DEALER_STATE;
  if (!uid) return EMPTY_DEALER_STATE;
  return snap;
}

/** This product's dealer unit price for an active dealer, or null (regular price shown). */
export function useDealerUnit(productId: string, regularPrice: number): { unit: number; percentOff: number } | null {
  const d = useDealer();
  return useMemo(() => {
    if (!d.active || !d.pricing || !(regularPrice > 0)) return null;
    const unit = dealerUnitPrice(productId, regularPrice, d.pricing);
    if (!(unit < regularPrice)) return null;
    return { unit, percentOff: Math.round((1 - unit / regularPrice) * 100) };
  }, [d.active, d.pricing, productId, regularPrice]);
}

/** The cart priced for this customer, as api/create-order.ts will price it. */
export function useDealerQuote(items: Array<{ id: string; price: number; quantity: number }>) {
  const d = useDealer();
  return useMemo(() => {
    const lines = items.map((i) => ({ productId: i.id, unit: Number(i.price) || 0, quantity: Number(i.quantity) || 0 }));
    const quote: DealerQuote = dealerQuote(lines, d.settings, d.active ? d.pricing : null, d.active);
    const potential = d.active ? dealerQuote(lines, { ...d.settings, minOrder: 0 }, d.pricing, true).savings : 0;
    return {
      active: d.active,
      quote,
      pricing: (quote.applies ? 'dealer' : 'retail') as 'dealer' | 'retail',
      potentialSavings: potential,
      minOrder: d.settings.minOrder,
      discountPercent: d.pricing?.discountPercent ?? 0,
    };
  }, [items, d.active, d.settings, d.pricing]);
}

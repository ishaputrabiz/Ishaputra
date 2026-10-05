import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_DEALER_SETTINGS,
  dealerQuote,
  dealerUnitPrice,
  type DealerPricing,
  type DealerQuote,
  type DealerSettings,
} from '@/lib/dealer';
import {
  subscribeDealerPricing,
  subscribeDealerSettings,
  subscribeOwnDealer,
  type DealerRecord,
} from '@/services/dealerService';

/*
 * The signed-in customer's dealer state, shared by every component in the
 * session (one set of listeners, module state): the public programme
 * settings, their own application, and, only once they are an approved dealer
 * while the programme is on, the private dealer prices. Guests read nothing.
 * A settings or application read error just means regular prices. A pricing
 * read error for an approved dealer is different: the server (Admin SDK) still
 * prices them as a dealer, so a page that sent regular prices would be refused
 * every time. It is retried once on its own, then reported as pricingError so
 * checkout can block payment and offer a retry (retryDealerPricing).
 */

export interface DealerState {
  ready: boolean;
  signedIn: boolean;
  settings: DealerSettings;
  record: DealerRecord | null;
  pricing: DealerPricing | null;
  active: boolean;
  /** An approved dealer's prices could not be read (after one retry): do not take payment at regular prices. */
  pricingError: boolean;
  showEntry: boolean;
}

const EMPTY: DealerState = {
  ready: true,
  signedIn: false,
  settings: DEFAULT_DEALER_SETTINGS,
  record: null,
  pricing: null,
  active: false,
  pricingError: false,
  showEntry: false,
};

// Returned for the render between a uid change and its effect starting the
// listeners, so one customer's record or prices never show for another.
const LOADING: DealerState = { ...EMPTY, ready: false, signedIn: true };

let currentUid: string | null = null;
let stops: Array<() => void> = [];
let stopPricing: (() => void) | null = null;
let settings: DealerSettings = DEFAULT_DEALER_SETTINGS;
let record: DealerRecord | null = null;
let pricing: DealerPricing | null = null;
let gotSettings = false;
let gotRecord = false;
// True once the pricing listener has answered with prices, or has failed for
// good (an automatic retry in flight keeps us "loading").
let gotPricing = false;
// The pricing listener failed, including its one automatic retry.
let pricingFailed = false;
// The automatic retry has been used for the current failure streak.
let pricingRetried = false;
let pricingRetryTimer: ReturnType<typeof setTimeout> | null = null;
// Lets a stopped or replaced listener's late callbacks be ignored.
let pricingGen = 0;
let state: DealerState = EMPTY;
const listeners = new Set<() => void>();

const PRICING_RETRY_MS = 2000;

function clearPricingRetry() {
  if (pricingRetryTimer) clearTimeout(pricingRetryTimer);
  pricingRetryTimer = null;
}

function stopPricingListener() {
  clearPricingRetry();
  pricingGen += 1;
  stopPricing?.();
  stopPricing = null;
  pricing = null;
  gotPricing = false;
  pricingFailed = false;
  pricingRetried = false;
}

/** (Re)start the private-prices listener. A failure is retried once after a short delay, then reported. */
function startPricing() {
  clearPricingRetry();
  stopPricing?.();
  const gen = ++pricingGen;
  gotPricing = false;
  pricingFailed = false;
  stopPricing = subscribeDealerPricing(
    (p) => {
      if (gen !== pricingGen) return;
      pricing = p;
      gotPricing = true;
      pricingFailed = false;
      pricingRetried = false;
      publish();
    },
    () => {
      if (gen !== pricingGen) return;
      pricing = null;
      if (!pricingRetried) {
        // Not ready while the one automatic retry is pending: no payment at regular prices meanwhile.
        gotPricing = false;
        pricingRetried = true;
        pricingRetryTimer = setTimeout(() => {
          pricingRetryTimer = null;
          if (gen === pricingGen && stopPricing) {
            startPricing();
            publish();
          }
        }, PRICING_RETRY_MS);
      } else {
        gotPricing = true;
        pricingFailed = true;
      }
      publish();
    },
  );
}

/** Checkout's "Retry" after an approved dealer's prices could not be read: subscribe again. */
export function retryDealerPricing() {
  if (!stopPricing || !pricingFailed) return;
  // This is the customer's own retry; it gets no further automatic one.
  pricingRetried = true;
  startPricing();
  publish();
}

function publish() {
  const signedIn = currentUid !== null;
  const approved = record?.status === 'approved';
  const wantPricing = signedIn && approved && settings.enabled;
  if (wantPricing && !stopPricing) {
    pricingRetried = false;
    startPricing();
  } else if (!wantPricing && stopPricing) {
    stopPricingListener();
  }
  state = signedIn
    ? {
        ready: gotSettings && gotRecord && (!wantPricing || gotPricing),
        signedIn,
        settings,
        record,
        pricing: wantPricing ? pricing : null,
        active: wantPricing && pricing !== null,
        pricingError: wantPricing && gotPricing && pricingFailed,
        showEntry: settings.enabled || record !== null,
      }
    : EMPTY;
  listeners.forEach((l) => l());
}

function watch(uid: string | null) {
  if (uid === currentUid) return;
  stops.forEach((s) => s());
  stops = [];
  stopPricingListener();
  currentUid = uid;
  settings = DEFAULT_DEALER_SETTINGS;
  record = null;
  pricing = null;
  gotSettings = false;
  gotRecord = false;
  if (uid) {
    stops.push(
      subscribeDealerSettings(
        (s) => {
          settings = s;
          gotSettings = true;
          publish();
        },
        () => {
          settings = DEFAULT_DEALER_SETTINGS;
          gotSettings = true;
          publish();
        },
      ),
      subscribeOwnDealer(
        uid,
        (r) => {
          record = r;
          gotRecord = true;
          publish();
        },
        () => {
          record = null;
          gotRecord = true;
          publish();
        },
      ),
    );
  }
  publish();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useDealer(): DealerState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => watch(uid), [uid]);
  const snap = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  if (uid && currentUid !== uid) return LOADING;
  if (!uid) return EMPTY;
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

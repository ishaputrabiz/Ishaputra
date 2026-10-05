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
 * Any read error just means regular prices; the server charges what it works
 * out itself either way.
 */

export interface DealerState {
  ready: boolean;
  signedIn: boolean;
  settings: DealerSettings;
  record: DealerRecord | null;
  pricing: DealerPricing | null;
  active: boolean;
  showEntry: boolean;
}

const EMPTY: DealerState = {
  ready: true,
  signedIn: false,
  settings: DEFAULT_DEALER_SETTINGS,
  record: null,
  pricing: null,
  active: false,
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
// True once the pricing listener has answered, with prices or with an error
// (an error leaves pricing null, so regular prices, but must not keep us "loading").
let gotPricing = false;
let state: DealerState = EMPTY;
const listeners = new Set<() => void>();

function publish() {
  const signedIn = currentUid !== null;
  const approved = record?.status === 'approved';
  const wantPricing = signedIn && approved && settings.enabled;
  if (wantPricing && !stopPricing) {
    gotPricing = false;
    stopPricing = subscribeDealerPricing(
      (p) => {
        pricing = p;
        gotPricing = true;
        publish();
      },
      () => {
        pricing = null;
        gotPricing = true;
        publish();
      },
    );
  } else if (!wantPricing && stopPricing) {
    stopPricing();
    stopPricing = null;
    pricing = null;
    gotPricing = false;
  }
  state = signedIn
    ? {
        ready: gotSettings && gotRecord && (!wantPricing || gotPricing),
        signedIn,
        settings,
        record,
        pricing: wantPricing ? pricing : null,
        active: wantPricing && pricing !== null,
        showEntry: settings.enabled || record !== null,
      }
    : EMPTY;
  listeners.forEach((l) => l());
}

function watch(uid: string | null) {
  if (uid === currentUid) return;
  stops.forEach((s) => s());
  stops = [];
  stopPricing?.();
  stopPricing = null;
  currentUid = uid;
  settings = DEFAULT_DEALER_SETTINGS;
  record = null;
  pricing = null;
  gotSettings = false;
  gotRecord = false;
  gotPricing = false;
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

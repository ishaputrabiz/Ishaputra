import { DEFAULT_DEALER_SETTINGS, type DealerPricing, type DealerSettings } from './dealer.ts';
import type { DealerRecord } from '@/services/dealerService';

/*
 * What checkout knows about the signed-in customer's dealer state, as a store
 * with no React or Firebase in it (src/hooks/useDealer.ts wires the real
 * listeners in, tests/dealerState.test.ts drives fake ones).
 *
 * Three reads: the public programme settings, the customer's own application,
 * and, only for an approved dealer while the programme is on, the private
 * dealer prices. A read that fails, or that answers "missing" only from the
 * offline cache (answered = false), is not an answer: it means "not
 * confirmed", never "not a dealer", programme off, or a default percent. The
 * server (Admin SDK) still prices an approved dealer as a dealer, so a page
 * that cannot tell must not send regular prices for a cart the server could
 * price differently. That is `unavailable`; dealerPayHold decides what it
 * costs the customer (payment waits only from the dealer minimum up, and only
 * when the minimum is known). The prices get one automatic retry, then
 * `pricingError`; `retry` subscribes again to whatever could not be read.
 */

export interface DealerState {
  ready: boolean;
  signedIn: boolean;
  /** The last good read of the settings (the defaults until there is one). */
  settings: DealerSettings;
  record: DealerRecord | null;
  pricing: DealerPricing | null;
  active: boolean;
  /** An approved dealer's prices could not be read (after one retry): do not take payment at regular prices. */
  pricingError: boolean;
  /**
   * The dealer state could not be confirmed (a failed or offline-cache-only
   * read of the settings, the application or the prices) while it matters.
   * Not "not a dealer"; see dealerPayHold.
   */
  unavailable: boolean;
  /** The dealer minimum from the last good read of the settings; null when they were never read. */
  minOrder: number | null;
  showEntry: boolean;
}

export const EMPTY_DEALER_STATE: DealerState = {
  ready: true,
  signedIn: false,
  settings: DEFAULT_DEALER_SETTINGS,
  record: null,
  pricing: null,
  active: false,
  pricingError: false,
  unavailable: false,
  minOrder: null,
  showEntry: false,
};

// For the render between a uid change and its effect starting the listeners,
// so one customer's record or prices never show for another.
export const LOADING_DEALER_STATE: DealerState = { ...EMPTY_DEALER_STATE, ready: false, signedIn: true };

/** The three reads. `answered` is false for a missing document that came only from the offline cache. */
export interface DealerSources {
  subscribeSettings(onNext: (s: DealerSettings, answered: boolean) => void, onError: (e: Error) => void): () => void;
  subscribeRecord(uid: string, onNext: (r: DealerRecord | null, answered: boolean) => void, onError: (e: Error) => void): () => void;
  subscribePricing(onNext: (p: DealerPricing, answered: boolean) => void, onError: (e: Error) => void): () => void;
}

/**
 * The dealer state is unconfirmed and this cart is one a dealer could be
 * priced differently on: worth the dealer minimum at regular prices. Below it
 * the server prices every customer at regular prices, so there is nothing to
 * wait for. With no known minimum there is nothing to hold on: a customer with
 * no dealer record must never be blocked.
 */
export function dealerPricingUncertain(d: Pick<DealerState, 'unavailable' | 'minOrder'>, regularSubtotal: number): boolean {
  return d.unavailable && d.minOrder !== null && regularSubtotal >= d.minOrder;
}

/**
 * Why payment waits on the dealer state, or null. While it loads, a dealer who
 * could pay would send regular prices and be refused; if it cannot be
 * confirmed, the same would happen on every try.
 */
export function dealerPayHold(d: Pick<DealerState, 'ready' | 'unavailable' | 'minOrder'>, regularSubtotal: number): string | null {
  if (!d.ready) return 'Checking your prices…';
  return dealerPricingUncertain(d, regularSubtotal) ? 'Dealer prices unavailable' : null;
}

export function createDealerStore(src: DealerSources, options: { pricingRetryMs?: number } = {}) {
  const pricingRetryMs = options.pricingRetryMs ?? 2000;

  let currentUid: string | null = null;
  let stopSettings: (() => void) | null = null;
  let stopRecord: (() => void) | null = null;
  let stopPricing: (() => void) | null = null;
  // Lets a replaced or stopped listener's late callbacks be ignored.
  let settingsGen = 0;
  let recordGen = 0;
  let pricingGen = 0;

  let settings: DealerSettings = DEFAULT_DEALER_SETTINGS;
  // A real answer (not an error, not an offline-cache miss) has been read.
  let settingsKnown = false;
  // The latest read of the settings / the application failed or was not an answer.
  let settingsBad = false;
  let recordBad = false;
  let gotSettings = false;
  let gotRecord = false;
  let record: DealerRecord | null = null;
  let pricing: DealerPricing | null = null;
  // True once the pricing listener has answered with prices, or has failed for
  // good (an automatic retry in flight keeps us "loading").
  let gotPricing = false;
  // The pricing listener failed, including its one automatic retry.
  let pricingFailed = false;
  // The automatic retry has been used for the current failure streak.
  let pricingRetried = false;
  let pricingRetryTimer: ReturnType<typeof setTimeout> | null = null;

  let state: DealerState = EMPTY_DEALER_STATE;
  const listeners = new Set<() => void>();

  const clearPricingRetry = () => {
    if (pricingRetryTimer) clearTimeout(pricingRetryTimer);
    pricingRetryTimer = null;
  };

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
    stopPricing = src.subscribePricing(
      (p, answered) => {
        if (gen !== pricingGen) return;
        if (!answered) {
          // Missing from the offline cache: not the prices, and certainly not the default percent.
          pricing = null;
          gotPricing = true;
          pricingFailed = true;
          publish();
          return;
        }
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
          }, pricingRetryMs);
        } else {
          gotPricing = true;
          pricingFailed = true;
        }
        publish();
      },
    );
  }

  function startSettings() {
    stopSettings?.();
    const gen = ++settingsGen;
    gotSettings = false;
    settingsBad = false;
    stopSettings = src.subscribeSettings(
      (s, answered) => {
        if (gen !== settingsGen) return;
        if (answered) {
          settings = s;
          settingsKnown = true;
          settingsBad = false;
        } else {
          settingsBad = true;
        }
        gotSettings = true;
        publish();
      },
      () => {
        if (gen !== settingsGen) return;
        // The last known settings stand.
        settingsBad = true;
        gotSettings = true;
        publish();
      },
    );
  }

  function startRecord(uid: string) {
    stopRecord?.();
    const gen = ++recordGen;
    gotRecord = false;
    recordBad = false;
    stopRecord = src.subscribeRecord(
      uid,
      (r, answered) => {
        if (gen !== recordGen) return;
        if (answered) {
          record = r;
          recordBad = false;
        } else {
          recordBad = true;
        }
        gotRecord = true;
        publish();
      },
      () => {
        if (gen !== recordGen) return;
        // The last known application stands.
        recordBad = true;
        gotRecord = true;
        publish();
      },
    );
  }

  /** Customer's "Retry": subscribe again to whatever could not be read. */
  function retry() {
    if (currentUid === null) return;
    if (settingsBad) startSettings();
    if (recordBad) startRecord(currentUid);
    if (stopPricing && pricingFailed) {
      // This is the customer's own retry; it gets no further automatic one.
      pricingRetried = true;
      startPricing();
    }
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
    const ready = gotSettings && gotRecord && (!wantPricing || gotPricing);
    const pricingBad = wantPricing && gotPricing && pricingFailed;
    // With the programme off the server prices everyone at regular prices, whatever else could not be read.
    const unavailable = signedIn && ready && (!settingsKnown || (settings.enabled && (settingsBad || recordBad || pricingBad)));
    state = signedIn
      ? {
          ready,
          signedIn,
          settings,
          record,
          pricing: wantPricing ? pricing : null,
          active: wantPricing && pricing !== null,
          pricingError: pricingBad,
          unavailable,
          minOrder: settingsKnown ? settings.minOrder : null,
          showEntry: settings.enabled || record !== null,
        }
      : EMPTY_DEALER_STATE;
    listeners.forEach((l) => l());
  }

  function watch(uid: string | null) {
    if (uid === currentUid) return;
    stopSettings?.();
    stopRecord?.();
    stopSettings = null;
    stopRecord = null;
    settingsGen += 1;
    recordGen += 1;
    stopPricingListener();
    currentUid = uid;
    settings = DEFAULT_DEALER_SETTINGS;
    settingsKnown = false;
    settingsBad = false;
    recordBad = false;
    gotSettings = false;
    gotRecord = false;
    record = null;
    pricing = null;
    if (uid) {
      startSettings();
      startRecord(uid);
    }
    publish();
  }

  return {
    watch,
    retry,
    getState: () => state,
    getUid: () => currentUid,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

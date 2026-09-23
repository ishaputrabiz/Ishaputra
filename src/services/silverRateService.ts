/**
 * Silver rate service.
 *
 * The live-rate / external-API system has been removed.
 * The admin sets the price-per-gram in the admin dashboard
 * (Firestore: `siteSettings/silverRate`) and ALL surfaces
 * subscribe in real-time via onSnapshot. The 10g and 1kg
 * values are derived automatically.
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';

export type SilverRate = {
  pricePerGramInr: number;
  pricePer10gInr: number;
  pricePerKgInr: number;
  change24hPct: number | null;
  source: 'manual' | 'fallback';
  fetchedAt: string;
};

const FALLBACK_RATE: SilverRate = {
  pricePerGramInr: 95,
  pricePer10gInr: 950,
  pricePerKgInr: 95000,
  change24hPct: null,
  source: 'fallback',
  fetchedAt: new Date().toISOString(),
};

const CACHE_KEY = 'silverRate.cache.v4';

function readCache(): SilverRate | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SilverRate;
    if (!parsed || typeof parsed.pricePerGramInr !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(rate: SilverRate) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rate));
  } catch {
    /* ignore quota errors */
  }
}

/** Synchronous read of the last cached rate (for first paint, no flash). */
export function getCachedSilverRate(): SilverRate | null {
  return readCache();
}

/** Build a SilverRate from a stored admin price-per-gram value. */
function buildFromPerGram(pricePerGramInr: number): SilverRate {
  return {
    pricePerGramInr,
    pricePer10gInr: pricePerGramInr * 10,
    pricePerKgInr: pricePerGramInr * 1000,
    change24hPct: null,
    source: 'manual',
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Subscribe to the admin-managed silver rate stored at
 * `siteSettings/silverRate`. The callback fires immediately with the
 * current value and again on every change in real-time.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToFirestoreSilverRate(
  callback: (rate: SilverRate) => void,
): () => void {
  // Push cached / fallback synchronously so the UI never shows a flash
  const cached = readCache();
  if (cached) callback(cached);

  const ref = doc(db, 'siteSettings', 'silverRate');
  const unsub = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const perGram =
        typeof data?.manualPricePerGramInr === 'number' && data.manualPricePerGramInr > 0
          ? data.manualPricePerGramInr
          : null;
      const rate = perGram != null ? buildFromPerGram(perGram) : FALLBACK_RATE;
      writeCache(rate);
      callback(rate);
    },
    (err) => {
      console.error('[silverRateService] onSnapshot error:', err);
      if (!cached) callback(FALLBACK_RATE);
    },
  );
  return unsub;
}

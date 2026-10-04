import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_SCRATCH_SETTINGS,
  normaliseScratchSettings,
  type ScratchCard,
  type ScratchWinSettings,
} from '@/lib/scratchWin';
import { rewardsAction } from '@/services/rewardsService';

/**
 * Scratch & Win, browser side. Cards are read-only for customers
 * (firestore.rules): api/notify-order.ts gives them on delivery (reconcile),
 * draws the prize when one is scratched and cancels them when an order ends.
 */

export type { ScratchCard };

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

const STATES: ReadonlyArray<ScratchCard['status']> = ['new', 'scratched', 'void'];
const PRIZE_STATES: ReadonlyArray<NonNullable<ScratchCard['prizeState']>> = ['active', 'held', 'void'];
const oneOf = <T extends string>(list: ReadonlyArray<T>, v: unknown): T | undefined =>
  list.find((x) => x === v);

export const toScratchCard = (id: string, d: Record<string, unknown>): ScratchCard => ({
  id,
  orderNumber: String(d.orderNumber || id),
  orderAmount: Number(d.orderAmount) || 0,
  // Anything unexpected is shown as cancelled, never as scratchable.
  status: oneOf(STATES, d.status) ?? 'void',
  points: Math.max(0, Math.floor(Number(d.points) || 0)),
  prizeState: oneOf(PRIZE_STATES, d.prizeState),
  voidReason: typeof d.voidReason === 'string' ? d.voidReason : undefined,
  createdAtMs: millis(d.createdAt),
  deliveredAtMs: millis(d.deliveredAt),
  expiresAtMs: millis(d.expiresAt),
  unlockAtMs: millis(d.unlockAt),
  scratchedAtMs: millis(d.scratchedAt),
  voidedAtMs: millis(d.voidedAt),
});

const cardsRef = (uid: string) => collection(db, 'users', uid, 'scratchCards');
const settingsRef = () => doc(db, 'siteSettings', 'scratchWin');

/** Every card of one customer, live. */
export const subscribeScratchCards = (
  uid: string,
  cb: (cards: ScratchCard[]) => void,
  onError: (err: Error) => void,
) =>
  onSnapshot(
    cardsRef(uid),
    (snap) => cb(snap.docs.map((d) => toScratchCard(d.id, d.data()))),
    onError,
  );

/** Only the cards still waiting to be scratched (expired ones included; filter by expiresAtMs). */
export const subscribeWaitingScratchCards = (
  uid: string,
  cb: (cards: ScratchCard[]) => void,
  onError: (err: Error) => void,
) =>
  onSnapshot(
    query(cardsRef(uid), where('status', '==', 'new')),
    (snap) => cb(snap.docs.map((d) => toScratchCard(d.id, d.data()))),
    onError,
  );

/** The shop's settings, live. A failed read gives the defaults, which are off. */
export const subscribeScratchSettings = (cb: (s: ScratchWinSettings) => void) =>
  onSnapshot(
    settingsRef(),
    (snap) => cb(normaliseScratchSettings(snap.exists() ? (snap.data() as Partial<ScratchWinSettings>) : null)),
    () => cb(DEFAULT_SCRATCH_SETTINGS),
  );

/** Throws when the settings cannot be read, so the admin form never mistakes defaults for saved values. */
export const getScratchSettings = async (): Promise<ScratchWinSettings> => {
  const snap = await getDoc(settingsRef());
  return normaliseScratchSettings(snap.exists() ? (snap.data() as Partial<ScratchWinSettings>) : null);
};

/**
 * Save the settings. Turning the switch on stamps enabledAt: the server gives
 * no card for an order delivered before it, so cards are not handed out for
 * orders delivered while Scratch & Win was off.
 */
export const saveScratchSettings = (s: ScratchWinSettings, wasEnabled: boolean) => {
  const next = normaliseScratchSettings(s);
  return setDoc(
    settingsRef(),
    { ...next, ...(next.enabled && !wasEnabled ? { enabledAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
};

/** One order's card (order pages). Null when there is none or it can't be read. Never throws. */
export const getScratchCard = async (uid: string, orderId: string): Promise<ScratchCard | null> => {
  try {
    const snap = await getDoc(doc(cardsRef(uid), orderId));
    return snap.exists() ? toScratchCard(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
};

export type ScratchResult =
  | {
      ok: true;
      points: number;
      held: boolean;
      unlockAtMs: number;
      /** The prize was taken back: its order was cancelled or returned. */
      taken?: boolean;
    }
  | { ok: false; reason: 'expired' | 'void' | 'missing' | 'network'; voidReason?: string; detail?: string };

/**
 * Scratch a card: the server draws the prize and writes the points. Asking
 * again for a scratched card returns the same prize. Never throws.
 */
export async function requestScratch(orderId: string): Promise<ScratchResult> {
  const r = await rewardsAction({ action: 'scratch-card', orderId });
  if (r.ok) {
    return {
      ok: true,
      points: Math.max(0, Math.floor(Number(r.data.points) || 0)),
      held: r.data.held === true,
      unlockAtMs: Number(r.data.unlockAtMs) || 0,
      taken: r.data.prizeState === 'void',
    };
  }
  if (r.status === 409) {
    return r.data?.error === 'card_expired'
      ? { ok: false, reason: 'expired' }
      : { ok: false, reason: 'void', voidReason: typeof r.data?.reason === 'string' ? r.data.reason : undefined };
  }
  if (r.status === 404) return { ok: false, reason: 'missing' };
  return { ok: false, reason: 'network', detail: r.detail };
}

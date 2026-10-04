import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  type LedgerLike,
  type RewardCurrency,
  type RewardKind,
  type RewardSettings,
} from '@/lib/rewards';

/**
 * Loyalty points + wallet cashback, browser side. The ledger is read-only for
 * customers (firestore.rules); points are reserved by api/create-order.ts,
 * confirmed by api/verify-payment.ts, and earned, frozen, voided and refunded
 * by the reconcile action in api/notify-order.ts.
 */

export type { RewardKind };

export interface RewardEntry extends LedgerLike {
  id: string;
  note: string;
  orderId?: string;
  razorpayOrderId?: string;
  /** A spend reserved for a checkout whose payment has not been confirmed yet. */
  hold?: boolean;
  /** When an unconfirmed reservation may be released. */
  holdUntilMs?: number;
  /** A spend confirmed only after its reservation had been released. */
  late?: boolean;
  /** Why the server voided it, e.g. 'payment-not-completed', 'order-returned'. */
  voidReason?: string;
  /** Where an earn entry came from: 'scratch' for a Scratch & Win prize. */
  source?: string;
  createdAtMs: number;
  createdBy: string;
}

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

const KINDS: RewardKind[] = ['earn', 'spend', 'refund', 'adjust'];

const toEntry = (id: string, d: Record<string, any>): RewardEntry => ({
  id,
  currency: d.currency === 'cashback' ? 'cashback' : 'points',
  amount: Number(d.amount) || 0,
  status: d.status === 'void' ? 'void' : 'active',
  kind: KINDS.includes(d.kind) ? d.kind : 'adjust',
  // A just-written admin entry has no server time yet; only earn entries wait anyway.
  unlockAtMs: millis(d.unlockAt),
  held: d.held === true,
  hold: d.hold === true,
  holdUntilMs: millis(d.holdUntil) || undefined,
  late: d.late === true,
  voidReason: typeof d.voidReason === 'string' ? d.voidReason : undefined,
  source: typeof d.source === 'string' ? d.source : undefined,
  note: String(d.note || ''),
  orderId: d.orderId,
  razorpayOrderId: d.razorpayOrderId,
  createdAtMs: millis(d.createdAt) || Date.now(),
  createdBy: String(d.createdBy || ''),
});

const ledgerRef = (uid: string) => collection(db, 'users', uid, 'rewardLedger');
const settingsRef = () => doc(db, 'siteSettings', 'rewards');

/** Live ledger for one customer, newest first. */
export const subscribeRewardLedger = (
  uid: string,
  cb: (entries: RewardEntry[]) => void,
  onError?: (err: Error) => void,
) =>
  onSnapshot(
    query(ledgerRef(uid), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => toEntry(d.id, d.data()))),
    (err) => {
      console.error('[rewards] ledger listener failed:', err);
      onError?.(err);
      cb([]);
    },
  );

export const subscribeRewardSettings = (cb: (s: RewardSettings) => void) =>
  onSnapshot(
    settingsRef(),
    (snap) => cb(normaliseRewardSettings(snap.exists() ? (snap.data() as Partial<RewardSettings>) : null)),
    () => cb(DEFAULT_REWARD_SETTINGS),
  );

/** Throws when the settings cannot be read, so the admin form never mistakes defaults for saved values. */
export const getRewardSettings = async (): Promise<RewardSettings> => {
  const snap = await getDoc(settingsRef());
  return normaliseRewardSettings(snap.exists() ? (snap.data() as Partial<RewardSettings>) : null);
};

export const saveRewardSettings = (s: RewardSettings) =>
  setDoc(settingsRef(), { ...normaliseRewardSettings(s), updatedAt: serverTimestamp() }, { merge: true });

/** Admin: credit (+) or debit (−) a customer's points or cashback by hand. */
export const adminAdjustRewards = async (
  uid: string,
  input: { currency: RewardCurrency; amount: number; note: string },
) => {
  const amount = Math.trunc(Number(input.amount));
  if (!amount) throw new Error('Enter a non-zero amount');
  const note = input.note.trim();
  if (!note) throw new Error('A reason is required');
  const id = `adjust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await setDoc(doc(ledgerRef(uid), id), {
    currency: input.currency,
    amount,
    kind: 'adjust',
    status: 'active',
    unlockAt: serverTimestamp(),
    note,
    createdAt: serverTimestamp(),
    createdBy: `admin:${auth.currentUser?.uid || 'unknown'}`,
  });
};

/** POST an action to /api/notify-order as the signed-in user. Never throws. */
export async function rewardsAction(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, any>; detail?: string }> {
  try {
    const current = auth.currentUser;
    if (!current) return { ok: false, status: 0, data: {}, detail: 'Not signed in' };
    const idToken = await current.getIdToken();
    const res = await fetch('/api/notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok
      ? { ok: true, status: res.status, data }
      : { ok: false, status: res.status, data, detail: data?.error || `HTTP ${res.status}` };
  } catch (err) {
    console.warn('[rewards] request failed:', err);
    return { ok: false, status: 0, data: {}, detail: err instanceof Error ? err.message : 'Network error' };
  }
}

export interface ReconcileResult {
  ok: boolean;
  /** Entries the server wrote or changed (empty: already in line). */
  changed?: string[];
  /** Why the server left this order alone, e.g. 'payment_not_verified'. */
  skipped?: string;
  detail?: string;
}

/**
 * Ask the server to bring this order's payment record and points/cashback in
 * line with its status (confirm the payment, earn on delivery, freeze during a
 * return, void + refund on cancel/return). Idempotent, so it is safe after
 * every status change. Never throws.
 */
export async function reconcileOrderRewards(orderId: string): Promise<ReconcileResult> {
  const r = await rewardsAction({ action: 'reconcile-rewards', orderId });
  if (!r.ok) return { ok: false, detail: r.detail };
  return { ok: true, changed: Array.isArray(r.data.changed) ? r.data.changed : [], skipped: r.data.skipped };
}

/**
 * Free points/cashback reserved by checkouts that were never paid. With an id,
 * only that checkout's (the customer closed the payment window); without, every
 * reservation that has run out. The server asks Razorpay first. Never throws.
 */
export async function releaseRewardHolds(razorpayOrderId?: string): Promise<{ ok: boolean; detail?: string }> {
  const r = await rewardsAction({ action: 'release-holds', ...(razorpayOrderId ? { razorpayOrderId } : {}) });
  return r.ok ? { ok: true } : { ok: false, detail: r.detail };
}

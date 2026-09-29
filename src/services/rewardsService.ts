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
  type RewardSettings,
} from '@/lib/rewards';

/**
 * Loyalty points + wallet cashback, browser side. The ledger is read-only for
 * customers (firestore.rules); points are earned, spent and refunded by the
 * payment functions and the reconcile action in api/notify-order.ts.
 */

export type RewardKind = 'earn' | 'spend' | 'refund' | 'adjust';

export interface RewardEntry extends LedgerLike {
  id: string;
  kind: RewardKind;
  note: string;
  orderId?: string;
  razorpayOrderId?: string;
  createdAtMs: number;
  createdBy: string;
}

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

const toEntry = (id: string, d: Record<string, any>): RewardEntry => ({
  id,
  currency: d.currency === 'cashback' ? 'cashback' : 'points',
  amount: Number(d.amount) || 0,
  status: d.status === 'void' ? 'void' : 'active',
  // A just-written admin entry has no server time yet: treat it as unlocked.
  unlockAtMs: millis(d.unlockAt),
  kind: (d.kind || 'adjust') as RewardKind,
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

export const getRewardSettings = async (): Promise<RewardSettings> => {
  const snap = await getDoc(settingsRef());
  return normaliseRewardSettings(snap.exists() ? (snap.data() as Partial<RewardSettings>) : null);
};

export const saveRewardSettings = (s: RewardSettings) =>
  setDoc(settingsRef(), { ...normaliseRewardSettings(s), updatedAt: serverTimestamp() });

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

/**
 * Ask the server to bring this order's points/cashback in line with its
 * status (earn on delivery, void + refund on cancel/return). Idempotent, so it
 * is safe after every status change. Never throws.
 */
export async function reconcileOrderRewards(orderId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const current = auth.currentUser;
    if (!current) return { ok: false, detail: 'Not signed in' };
    const idToken = await current.getIdToken();
    const res = await fetch('/api/notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'reconcile-rewards', orderId }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, detail: data?.error || `HTTP ${res.status}` };
  } catch (err) {
    console.warn('[rewards] reconcile failed:', err);
    return { ok: false, detail: err instanceof Error ? err.message : 'Network error' };
  }
}

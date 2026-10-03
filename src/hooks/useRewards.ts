import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_REWARD_SETTINGS,
  summariseRewards,
  type RewardBalances,
  type RewardSettings,
} from '@/lib/rewards';
import {
  releaseRewardHolds,
  subscribeRewardLedger,
  subscribeRewardSettings,
  type RewardEntry,
} from '@/services/rewardsService';

const EMPTY: RewardBalances = { points: { available: 0, pending: 0 }, cashback: { available: 0, pending: 0 } };

/** A customer's live reward ledger, balances and the shop's reward settings. */
export function useRewards(uid?: string | null) {
  const [entries, setEntries] = useState<RewardEntry[]>([]);
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [loading, setLoading] = useState(true);
  /** The ledger could not be read: balances show 0, which must not be presented as the customer's real balance. */
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeRewardSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    let failed = false;
    return subscribeRewardLedger(
      uid,
      (next) => {
        setEntries(next);
        setNow(Date.now());
        setError(failed);
        setLoading(false);
      },
      () => {
        failed = true;
      },
    );
  }, [uid]);

  // Earned points unlock by date, so re-evaluate every minute as well.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // A checkout that was never paid keeps its points/cashback reserved until the
  // server releases them (it asks Razorpay first). Ask once per visit when one
  // has run out; the ledger listener then shows the freed balance.
  const releaseAsked = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || releaseAsked.current === uid) return;
    const expired = entries.some(
      (e) => e.kind === 'spend' && e.status === 'active' && e.hold && (e.holdUntilMs ?? 0) <= now,
    );
    if (!expired) return;
    releaseAsked.current = uid;
    void releaseRewardHolds();
  }, [uid, entries, now]);

  const balances = useMemo(() => (uid ? summariseRewards(entries, now) : EMPTY), [uid, entries, now]);
  /** Points/cashback set aside for payments still in progress (already left out of available). */
  const reserved = useMemo(() => {
    const out = { points: 0, cashback: 0 };
    for (const e of entries) {
      if (e.kind === 'spend' && e.status === 'active' && e.hold) out[e.currency] += -e.amount;
    }
    return out;
  }, [entries]);
  return { entries, balances, reserved, settings, loading, error };
}

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REWARD_SETTINGS,
  summariseRewards,
  type RewardBalances,
  type RewardSettings,
} from '@/lib/rewards';
import { subscribeRewardLedger, subscribeRewardSettings, type RewardEntry } from '@/services/rewardsService';

const EMPTY: RewardBalances = { points: { available: 0, pending: 0 }, cashback: { available: 0, pending: 0 } };

/** A customer's live reward ledger, balances and the shop's reward settings. */
export function useRewards(uid?: string | null) {
  const [entries, setEntries] = useState<RewardEntry[]>([]);
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeRewardSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeRewardLedger(uid, (next) => {
      setEntries(next);
      setLoading(false);
    });
  }, [uid]);

  // Pending points unlock by date alone, so re-evaluate every minute.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const balances = useMemo(() => (uid ? summariseRewards(entries, now) : EMPTY), [uid, entries, now]);
  return { entries, balances, settings, loading };
}

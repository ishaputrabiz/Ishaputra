import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { subscribeRewardSettings } from '@/services/rewardsService';
import {
  DEFAULT_REWARD_SETTINGS,
  tierIndexForSpend,
  tierSpend,
  type LoyaltyTier,
  type RewardSettings,
} from '@/lib/rewards';

/*
 * A customer's loyalty tier, worked out the way the server does it when it
 * earns points (tierSpend in rewards-core): rupees paid online, from the
 * server-written payment records, for orders now delivered and not dealer-
 * priced. Used by /wallet, the account page and the admin customer page
 * (admins can read any customer's payments and orders).
 */
export function useLoyaltyStatus(uid: string | null | undefined) {
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [spend, setSpend] = useState(0);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => subscribeRewardSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setError(null);
      setSpend(0);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getDocs(query(collection(db, 'payments'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'orders'), where('userId', '==', uid))),
    ])
      .then(([payments, orders]) => {
        if (!live) return;
        const status = new Map(orders.docs.map((o) => [o.id, String(o.data().status || '')]));
        setSpend(
          tierSpend(
            payments.docs.map((p) => ({
              id: p.id,
              amountPaise: Number(p.data().amountPaise) || 0,
              dealer: p.data().dealer === true,
              orderStatus: status.get(p.id) || '',
            })),
          ),
        );
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load your membership');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const tiers: LoyaltyTier[] = settings.tiers;
  return { loading, error, spend, tierIndex: tierIndexForSpend(spend, tiers), tiers, settings, retry };
}

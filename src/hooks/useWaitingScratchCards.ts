import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeWaitingScratchCards, type ScratchCard } from '@/services/scratchWinService';

/*
 * How many scratch cards are waiting for the signed-in customer, for the
 * header dot. Every page renders its own header, so one listener is shared by
 * the whole session (module state) instead of a Firestore read per page view.
 * It switches when the customer signs in or out. Errors (for example before
 * the scratchCards rule is deployed) just mean no dot.
 */

let currentUid: string | null = null;
let stop: (() => void) | null = null;
let cards: ScratchCard[] = [];
let count = 0;
const listeners = new Set<() => void>();

const recount = () => {
  const now = Date.now();
  const next = cards.filter((c) => c.expiresAtMs > now).length;
  if (next === count) return;
  count = next;
  listeners.forEach((l) => l());
};

function watch(uid: string | null) {
  if (uid === currentUid) return;
  stop?.();
  stop = null;
  currentUid = uid;
  cards = [];
  recount();
  if (!uid) return;
  stop = subscribeWaitingScratchCards(
    uid,
    (next) => {
      cards = next;
      recount();
    },
    () => {
      cards = [];
      recount();
    },
  );
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useWaitingScratchCards(): number {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => watch(uid), [uid]);
  return useSyncExternalStore(subscribe, () => count, () => 0);
}

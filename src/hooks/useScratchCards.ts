import { useEffect, useMemo, useState } from 'react';
import { sortScratchCards, type ScratchCard, type ScratchWinSettings } from '@/lib/scratchWin';
import { subscribeScratchCards, subscribeScratchSettings } from '@/services/scratchWinService';

/**
 * A customer's scratch cards (live, waiting ones first) and the shop's
 * Scratch & Win settings. `settings` is null until the first read.
 */
export function useScratchCards(uid?: string | null) {
  const [cards, setCards] = useState<ScratchCard[]>([]);
  const [settings, setSettings] = useState<ScratchWinSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeScratchSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setCards([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    return subscribeScratchCards(
      uid,
      (next) => {
        setCards(next);
        setNow(Date.now());
        setError(false);
        setLoading(false);
      },
      () => {
        setCards([]);
        setError(true);
        setLoading(false);
      },
    );
  }, [uid, attempt]);

  // Cards expire and prizes unlock by date: re-evaluate every minute.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const sorted = useMemo(() => sortScratchCards(cards, now), [cards, now]);
  return { cards: sorted, settings, loading, error, now, retry: () => setAttempt((n) => n + 1) };
}

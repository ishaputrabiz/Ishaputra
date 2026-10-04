import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ScratchFoil } from '@/components/scratch/ScratchFoil';
import { formatDate, formatDayMonth, formatINR, formatNumber } from '@/lib/format';
import { voidReasonText, type ScratchCard } from '@/lib/scratchWin';
import type { ScratchResult } from '@/services/scratchWinService';
import { cn } from '@/lib/utils';

type Prize = Extract<ScratchResult, { ok: true }>;
type Gone = Extract<ScratchResult, { ok: false }>;

const points = (n: number) => `${formatNumber(n)} ${n === 1 ? 'point' : 'points'}`;

/** The sentence announced after the reveal: what was won and when it can be spent. */
function resultCopy(prize: Prize, unlockDays: number, minOrder: number | null, nowMs: number) {
  if (prize.points <= 0) {
    return {
      lead: '',
      rest:
        minOrder === null
          ? 'No prize on this card.'
          : `No prize on this card. You get a new card with every delivered order of ${formatINR(minOrder)} or more.`,
    };
  }
  const one = prize.points === 1;
  const lead = `${points(prize.points)} ${one ? 'is' : 'are'} in your wallet.`;
  if (prize.held) {
    return { lead, rest: `${one ? 'It stays' : 'They stay'} on hold while the order's return is open.` };
  }
  if (prize.unlockAtMs > nowMs) {
    return {
      lead,
      rest: `${one ? 'It unlocks' : 'They unlock'} on ${formatDayMonth(prize.unlockAtMs)}, when the order's ${unlockDays}-day return window ends.`,
    };
  }
  return { lead, rest: 'Ready to use now.' };
}

function goneCopy(g: Gone) {
  if (g.reason === 'expired') return 'This card has expired.';
  if (g.reason === 'void') return `This card was cancelled: ${voidReasonText(g.voidReason)}.`;
  return 'This card is no longer available.';
}

/** What sits under the foil: a placeholder until the server answers, then the prize. */
function PrizeFace({ prize, revealed, pointValue }: { prize: Prize | null; revealed: boolean; pointValue: number }) {
  const won = !!prize && prize.points > 0;
  return (
    <div
      className={cn(
        'tx-sheet absolute inset-0 flex flex-col items-center justify-center overflow-hidden text-center',
        revealed && 'sw-pop',
      )}
    >
      <div aria-hidden="true" className="tx-contour pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-card bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.16),transparent_68%)] ring-1 ring-inset ring-highlight-soft/30"
      />
      {!prize ? (
        <div className="relative flex flex-col items-center gap-2" aria-hidden="true">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ) : won ? (
        <>
          <p className="relative text-[10px] font-bold uppercase tracking-[0.24em] text-highlight">You won</p>
          <p className="relative mt-1 font-heading text-[64px] font-bold leading-none tracking-tight text-primary tabular-nums">
            {formatNumber(prize.points)}
          </p>
          <p className="relative mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
            {prize.points === 1 ? 'Point' : 'Points'}
          </p>
          {pointValue > 0 && (
            <p className="relative mt-1 text-xs text-muted-foreground">Worth {formatINR(prize.points * pointValue)}</p>
          )}
        </>
      ) : (
        <>
          <p className="relative text-[10px] font-bold uppercase tracking-[0.24em] text-highlight">Not this time</p>
          <p className="relative mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">Better luck next time</p>
          <p className="relative mt-1.5 text-xs text-muted-foreground">Thanks for shopping with Ishaputra.</p>
        </>
      )}
      {revealed && won && (
        <span
          aria-hidden="true"
          className="sw-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
        />
      )}
    </div>
  );
}

export interface ScratchCardStageProps {
  card: ScratchCard;
  /** "1 of 2 new", shown when more than one card is waiting. */
  position?: { index: number; total: number };
  /** Ask the server to scratch this card (it draws the prize). */
  scratch: () => Promise<ScratchResult>;
  /** Rupee value of a point, for "Worth ₹25". */
  pointValue: number;
  unlockDays: number;
  /** For the no-prize line; null while new cards are paused. */
  minOrder: number | null;
  /** Shown as "Next card" when another card is waiting. */
  onNext?: () => void;
  onDone: () => void;
}

/**
 * One scratch card: scratch the foil (or press Reveal prize) and the server
 * draws the prize. The first stroke asks; the prize shows once it is known and
 * over half the foil is gone, or Reveal was pressed. A failed request repaints
 * the foil so the card can be tried again; nothing was spent.
 */
export function ScratchCardStage({
  card,
  position,
  scratch,
  pointValue,
  unlockDays,
  minOrder,
  onNext,
  onDone,
}: ScratchCardStageProps) {
  const [prize, setPrize] = useState<Prize | null>(null);
  const [wantReveal, setWantReveal] = useState(false);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState<Gone | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [revealedAt, setRevealedAt] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const revealed = !!prize && wantReveal;
  useEffect(() => {
    if (revealed && !revealedAt) setRevealedAt(Date.now());
  }, [revealed, revealedAt]);

  const ask = async () => {
    if (prize || inFlight.current || gone) return;
    inFlight.current = true;
    setAsking(true);
    setFailed(false);
    const r = await scratch();
    inFlight.current = false;
    if (!mounted.current) return;
    setAsking(false);
    if (r.ok === true) {
      setPrize(r);
      return;
    }
    const failure = r as Gone;
    if (failure.reason === 'network') {
      // Nothing was drawn: put the foil back so the card can be tried again.
      setFailed(true);
      setWantReveal(false);
      setResetKey((k) => k + 1);
    } else {
      setGone(failure);
    }
  };

  const reveal = () => {
    setWantReveal(true);
    void ask();
  };

  const won = !!prize && prize.points > 0;
  const copy = revealed && prize ? resultCopy(prize, unlockDays, minOrder, revealedAt || Date.now()) : null;
  const waiting = wantReveal && asking;

  return (
    <div>
      <div className="tx-slate tx-contour relative overflow-hidden rounded-panel p-4 text-charcoal-foreground shadow-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Scratch &amp; Win</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-charcoal-foreground/70 tabular-nums">
            {card.orderNumber}
          </p>
        </div>
        <div
          role="img"
          aria-label={
            revealed
              ? won
                ? `You won ${points(prize!.points)}`
                : 'No prize this time'
              : 'Scratch card, not revealed yet'
          }
          className="relative aspect-[16/10] overflow-hidden rounded-card"
        >
          <PrizeFace prize={prize} revealed={revealed} pointValue={pointValue} />
          <ScratchFoil
            resetKey={resetKey}
            fading={revealed}
            onFirstStroke={() => void ask()}
            onCleared={reveal}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-charcoal-foreground/70">
          <span>{revealed ? `Scratched ${formatDate(revealedAt || Date.now())}` : `Expires ${formatDate(card.expiresAtMs)}`}</span>
          {position && position.total > 1 && (
            <span className="tabular-nums">
              {position.index} of {position.total} new
            </span>
          )}
        </div>
      </div>

      {/* Announced when the prize is revealed (polite, so it never interrupts). */}
      <div role="status" className={copy ? 'mt-4' : undefined}>
        {copy && (
          <p className="sw-pop text-center text-sm leading-relaxed text-foreground">
            {copy.lead && <span className="font-semibold">{copy.lead} </span>}
            <span className="text-muted-foreground">{copy.rest}</span>
          </p>
        )}
      </div>

      {gone ? (
        <>
          <Notice tone="warning" className="mt-4">
            {goneCopy(gone)}
          </Notice>
          <ActionRow onNext={onNext} onDone={onDone} />
        </>
      ) : revealed ? (
        <ActionRow onNext={onNext} onDone={onDone} />
      ) : (
        <>
          {failed && (
            <Notice
              tone="warning"
              role="alert"
              className="mt-4"
              action={
                <Button type="button" variant="outline" size="sm" onClick={reveal}>
                  <RefreshCw aria-hidden="true" /> Try again
                </Button>
              }
            >
              Couldn't reveal this card. Check your connection and try again.
            </Notice>
          )}
          <Button variant="outline" className="mt-4 w-full" onClick={reveal} disabled={waiting} aria-busy={waiting}>
            {waiting ? <Spinner /> : <Eye aria-hidden="true" />}
            {waiting ? 'Revealing' : 'Reveal prize'}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            Scratch the bronze foil, or press Reveal prize.
          </p>
        </>
      )}
    </div>
  );
}

function ActionRow({ onNext, onDone }: { onNext?: () => void; onDone: () => void }) {
  return (
    <div className={cn('mt-4 grid gap-3', onNext ? 'grid-cols-2' : 'grid-cols-1')}>
      {onNext && (
        <Button variant="outline" onClick={onNext}>
          Next card <ChevronRight aria-hidden="true" />
        </Button>
      )}
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}

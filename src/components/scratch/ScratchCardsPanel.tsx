import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Ticket } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { ScratchCardDialog } from '@/components/scratch/ScratchCardDialog';
import { useScratchCards } from '@/hooks/useScratchCards';
import { formatDayMonth, formatINR, formatNumber } from '@/lib/format';
import { DEFAULT_REWARD_SETTINGS, type RewardSettings } from '@/lib/rewards';
import {
  scratchCardView,
  voidReasonText,
  type ScratchCard,
  type ScratchWinSettings,
} from '@/lib/scratchWin';
import { subscribeRewardSettings } from '@/services/rewardsService';
import { requestScratch } from '@/services/scratchWinService';
import { cn } from '@/lib/utils';

/** Tiles shown until "Show all" is pressed: two rows on desktop. */
const RECENT = 10;

const TILE = 'relative flex w-[150px] shrink-0 snap-start flex-col rounded-card p-3 text-left lg:w-auto';
const TILE_FACE = 'flex aspect-[16/10] w-full flex-col items-center justify-center rounded-[8px]';
const TILE_ORDER = 'mt-2.5 truncate text-[11px] font-semibold tabular-nums';

function CardTile({ card, nowMs, onOpen }: { card: ScratchCard; nowMs: number; onOpen: (id: string) => void }) {
  const view = scratchCardView(card, nowMs);

  if (view === 'new') {
    return (
      <li className="contents">
        <button
          type="button"
          onClick={() => onOpen(card.id)}
          aria-label={`Scratch the card for order ${card.orderNumber}, expires ${formatDayMonth(card.expiresAtMs)}`}
          className={cn(TILE, 'tx-slate text-charcoal-foreground shadow-panel transition-transform duration-press ease-out active:scale-[0.97]')}
        >
          <span
            aria-hidden="true"
            className={cn(TILE_FACE, 'scratch-foil text-[9px] font-bold uppercase tracking-[0.2em] text-charcoal/75')}
          >
            <span className="mb-1 grid size-6 place-items-center rounded-full border border-charcoal/50 font-heading text-[10px]">IS</span>
            Scratch
          </span>
          <span className={cn(TILE_ORDER, 'text-charcoal-foreground/80')}>{card.orderNumber}</span>
          <span className="text-[11px] text-charcoal-foreground/70">Expires {formatDayMonth(card.expiresAtMs)}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-highlight-soft">
            Scratch now <ChevronRight aria-hidden="true" className="size-3.5" />
          </span>
        </button>
      </li>
    );
  }

  if (view === 'won-pending' || view === 'won-ready' || view === 'won-held' || view === 'won-void') {
    const voided = view === 'won-void';
    const status =
      view === 'won-pending'
        ? `Unlocks ${formatDayMonth(card.unlockAtMs)}`
        : view === 'won-ready'
          ? 'In your wallet'
          : view === 'won-held'
            ? 'On hold, return open'
            : 'Points taken back';
    return (
      <li className={cn(TILE, 'border border-foreground/[0.08] bg-card')}>
        <span className={cn(TILE_FACE, voided ? 'bg-muted' : 'bg-primary/[0.06]')}>
          <span
            className={cn(
              'font-heading text-3xl font-bold leading-none tabular-nums',
              voided ? 'text-muted-foreground line-through' : 'text-primary',
            )}
          >
            <span className="sr-only">Won </span>+{formatNumber(card.points)}
          </span>
          <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-foreground">
            {card.points === 1 ? 'Point' : 'Points'}
          </span>
        </span>
        <span className={cn(TILE_ORDER, 'text-foreground/80')}>{card.orderNumber}</span>
        <span className="text-[11px] text-muted-foreground">{status}</span>
      </li>
    );
  }

  if (view === 'nowin') {
    return (
      <li className={cn(TILE, 'border border-foreground/[0.08] bg-card')}>
        <span className={cn(TILE_FACE, 'bg-muted text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground')}>
          No prize
        </span>
        <span className={cn(TILE_ORDER, 'text-foreground/80')}>{card.orderNumber}</span>
        <span className="text-[11px] text-muted-foreground">Scratched {formatDayMonth(card.scratchedAtMs)}</span>
      </li>
    );
  }

  // Expired, or cancelled because the order ended.
  const expired = view === 'expired';
  const why = voidReasonText(card.voidReason);
  return (
    <li className={cn(TILE, 'border border-dashed border-foreground/[0.18]')}>
      <span className={cn(TILE_FACE, 'bg-foreground/[0.03] text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground')}>
        {expired ? 'Expired' : 'Cancelled'}
      </span>
      <span className={cn(TILE_ORDER, 'text-foreground/80')}>{card.orderNumber}</span>
      <span className="text-[11px] text-muted-foreground">
        {expired ? `Ended ${formatDayMonth(card.expiresAtMs)}` : why.charAt(0).toUpperCase() + why.slice(1)}
      </span>
    </li>
  );
}

export interface ScratchCardsPanelViewProps {
  /** Sorted: waiting cards first (sortScratchCards). */
  cards: ScratchCard[];
  settings: ScratchWinSettings;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpen: (cardId: string) => void;
  nowMs: number;
}

/**
 * The "Scratch cards" panel on /wallet. Hidden while Scratch & Win is off and
 * the customer has no cards (or they can't be read).
 */
export function ScratchCardsPanelView({ cards, settings, loading, error, onRetry, onOpen, nowMs }: ScratchCardsPanelViewProps) {
  const [showAll, setShowAll] = useState(false);
  if (!settings.enabled && (loading || error || cards.length === 0)) return null;

  const waiting = cards.filter((c) => scratchCardView(c, nowMs) === 'new').length;
  const shown = showAll ? cards : cards.slice(0, RECENT);
  const minOrder = formatINR(settings.minOrder);

  return (
    <section aria-labelledby="scratch-heading" className="panel tx-sheet mb-6 p-6">
      <div className="mb-4 flex items-center gap-2">
        <div aria-hidden="true" className="tx-slate flex size-10 items-center justify-center rounded-[8px] text-highlight-soft">
          <Ticket className="size-5" />
        </div>
        <h2 id="scratch-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Scratch cards
        </h2>
        {waiting > 0 && (
          <span className="ml-auto rounded-chip bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary-foreground tabular-nums">
            {formatNumber(waiting)} new
          </span>
        )}
      </div>

      {error ? (
        <Notice
          tone="warning"
          role="alert"
          action={
            <button type="button" onClick={onRetry} className="btn-line h-10 px-4 text-foreground">
              Try again
            </button>
          }
        >
          Couldn't load your scratch cards. Check your connection and try again.
        </Notice>
      ) : loading ? (
        <div aria-busy="true" className="flex gap-3">
          <span className="sr-only" role="status">Loading your scratch cards</span>
          <Skeleton className="h-[168px] w-[150px] rounded-card" />
          <Skeleton className="h-[168px] w-[150px] rounded-card" />
        </div>
      ) : cards.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your first card comes with your next delivered order of {minOrder} or more.
        </p>
      ) : (
        <>
          <ul className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
            {shown.map((c) => (
              <CardTile key={c.id} card={c} nowMs={nowMs} onOpen={onOpen} />
            ))}
          </ul>
          {cards.length > RECENT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 inline-flex min-h-[44px] items-center text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              {showAll ? 'Show recent only' : `Show all ${formatNumber(cards.length)}`}
            </button>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            {settings.enabled
              ? `One card for every delivered order of ${minOrder} or more. Scratch it within ${settings.expiryDays} days of delivery.`
              : 'New cards are paused. Cards you already have can still be scratched until they expire.'}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Scratch cards on /wallet: the panel plus the scratch sheet/dialog.
 * `/wallet?card=<orderId>` (the order page's link) opens that card at once.
 */
export function ScratchCardsPanel({ uid }: { uid: string }) {
  const { cards, settings, loading, error, now, retry } = useScratchCards(uid);
  const [rewards, setRewards] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [dialog, setDialog] = useState<{ open: boolean; startId: string | null }>({ open: false, startId: null });
  const [params, setParams] = useSearchParams();
  const linked = params.get('card');

  useEffect(() => subscribeRewardSettings(setRewards), []);

  // Open the linked card once the cards have loaded, then drop the parameter.
  useEffect(() => {
    if (!linked || loading) return;
    const card = cards.find((c) => c.id === linked);
    if (card && scratchCardView(card, Date.now()) === 'new') setDialog({ open: true, startId: linked });
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('card');
        return next;
      },
      { replace: true },
    );
  }, [linked, loading, cards, setParams]);

  if (!settings) return null;
  return (
    <>
      <ScratchCardsPanelView
        cards={cards}
        settings={settings}
        loading={loading}
        error={error}
        onRetry={retry}
        onOpen={(id) => setDialog({ open: true, startId: id })}
        nowMs={now}
      />
      <ScratchCardDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        cards={cards}
        startId={dialog.startId}
        scratch={(card) => requestScratch(card.id)}
        pointValue={rewards.pointValue}
        minOrder={settings.enabled ? settings.minOrder : null}
      />
    </>
  );
}

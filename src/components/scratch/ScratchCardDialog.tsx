import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ScratchCardStage } from '@/components/scratch/ScratchCardStage';
import { formatDayMonth } from '@/lib/format';
import { scratchCardView, type ScratchCard } from '@/lib/scratchWin';
import type { ScratchResult } from '@/services/scratchWinService';

const DESKTOP = '(min-width: 1024px)';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export interface ScratchCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The customer's cards, live. */
  cards: ScratchCard[];
  /** The card to show first. */
  startId: string | null;
  scratch: (card: ScratchCard) => Promise<ScratchResult>;
  pointValue: number;
  unlockDays: number;
  /** For the no-prize line; null while new cards are paused. */
  minOrder: number | null;
  title?: string;
  describe?: (card: ScratchCard) => string;
}

const defaultDescription = (card: ScratchCard) =>
  card.deliveredAtMs
    ? `For order ${card.orderNumber}, delivered ${formatDayMonth(card.deliveredAtMs)}`
    : `For order ${card.orderNumber}`;

/**
 * Scratching, in a bottom sheet on phones and a dialog on desktop. The cards
 * waiting when it opens form a queue ("Next card"); a card stays on screen
 * after it is scratched even though the live list now calls it scratched.
 */
export function ScratchCardDialog({
  open,
  onOpenChange,
  cards,
  startId,
  scratch,
  pointValue,
  unlockDays,
  minOrder,
  title = 'Scratch card',
  describe = defaultDescription,
}: ScratchCardDialogProps) {
  const desktop = useIsDesktop();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const latest = useRef(cards);
  latest.current = cards;

  // Fix the queue when it opens: the chosen card, then the others still waiting.
  useEffect(() => {
    if (!open || !startId) return;
    const now = Date.now();
    const waiting = latest.current.filter((c) => c.id !== startId && scratchCardView(c, now) === 'new').map((c) => c.id);
    setQueue([startId, ...waiting]);
    setIndex(0);
  }, [open, startId]);

  const card = cards.find((c) => c.id === queue[index]) ?? null;
  const nextIndex = (() => {
    const now = Date.now();
    for (let i = index + 1; i < queue.length; i++) {
      const c = cards.find((x) => x.id === queue[i]);
      if (c && scratchCardView(c, now) === 'new') return i;
    }
    return -1;
  })();

  const body = card ? (
    <ScratchCardStage
      key={card.id}
      card={card}
      position={{ index: index + 1, total: queue.length }}
      scratch={() => scratch(card)}
      pointValue={pointValue}
      unlockDays={unlockDays}
      minOrder={minOrder}
      onNext={nextIndex >= 0 ? () => setIndex(nextIndex) : undefined}
      onDone={() => onOpenChange(false)}
    />
  ) : null;

  // Focus the title, not the first button: a focus ring on Reveal looked like a pressed control.
  const focusTitle = (e: Event) => {
    e.preventDefault();
    titleRef.current?.focus();
  };

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[440px] p-6" onOpenAutoFocus={focusTitle}>
          <DialogTitle ref={titleRef} tabIndex={-1} className="font-heading text-xl font-semibold tracking-tight outline-none">
            {title}
          </DialogTitle>
          <DialogDescription className="-mt-1 mb-1">{card ? describe(card) : ''}</DialogDescription>
          {body}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="tx-paper px-5 pt-3" onOpenAutoFocus={focusTitle}>
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/15" />
        <SheetTitle ref={titleRef} tabIndex={-1} className="font-heading text-xl font-semibold tracking-tight outline-none">
          {title}
        </SheetTitle>
        <SheetDescription className="mb-4 mt-0.5">{card ? describe(card) : ''}</SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}

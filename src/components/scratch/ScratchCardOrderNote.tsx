import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { scratchCardView, type ScratchCard } from '@/lib/scratchWin';

/**
 * One line on the customer's order page about the order's scratch card: a
 * link while it waits, the prize once scratched. Nothing otherwise.
 */
export function ScratchCardOrderNote({ card, nowMs }: { card: ScratchCard | null; nowMs: number }) {
  if (!card) return null;
  const view = scratchCardView(card, nowMs);
  const won = view.startsWith('won-');
  if (view !== 'new' && !won) return null;
  const pts = `${formatNumber(card.points)} ${card.points === 1 ? 'point' : 'points'}`;

  return (
    <p className="flex items-start gap-2 px-4 pb-3 text-xs text-muted-foreground">
      <Ticket className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
      {view === 'new' ? (
        <span>
          A scratch card is waiting for this order.{' '}
          <Link
            to={`/wallet?card=${encodeURIComponent(card.id)}`}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Scratch it
          </Link>
        </span>
      ) : (
        <span>
          Scratch card: you won {pts}
          {view === 'won-void' ? ' (taken back)' : view === 'won-held' ? ' (on hold while the return is open)' : ''}
        </span>
      )}
    </p>
  );
}

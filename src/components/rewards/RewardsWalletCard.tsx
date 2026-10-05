import { useState } from 'react';
import {
  Coins,
  Wallet,
  Hourglass,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  Ticket,
} from 'lucide-react';
import { useRewards } from '@/hooks/useRewards';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import type { RewardEntry } from '@/services/rewardsService';
import { formatDate } from '@/lib/format';
import { unlockDaysAfterDelivery } from '@/lib/returnWindow';

const KIND_ICON = {
  earn: ArrowDownLeft,
  spend: ArrowUpRight,
  refund: RotateCcw,
  adjust: SlidersHorizontal,
} as const;
/** History rows shown until "Show all" is pressed. */
const RECENT = 20;

const amountLabel = (e: RewardEntry) => {
  const sign = e.amount > 0 ? '+' : '-';
  const n = Math.abs(e.amount).toLocaleString('en-IN');
  return e.currency === 'points' ? `${sign}${n} pts` : `${sign}₹${n}`;
};

/** "Gold 1.25x" under the points of an earn entry that got a tier boost; empty otherwise. */
const boostLabel = (e: RewardEntry): string =>
  e.kind === 'earn' && e.status !== 'void' && e.multiplier && e.multiplier > 1
    ? `${e.tierName ? `${e.tierName} ` : ''}${e.multiplier}x`
    : '';

/**
 * What an entry means for the balance today. Only earned points wait (until
 * they unlock, or while their order has a return open); every other entry
 * counts at once, and a void one counts for nothing.
 */
const entryState = (e: RewardEntry, now: number): { label: string; voided: boolean } => {
  if (e.status === 'void') {
    if (e.kind === 'spend' && e.voidReason === 'payment-not-completed') {
      return { label: 'released, payment not completed', voided: true };
    }
    if (e.kind === 'refund' && e.voidReason === 'order-reopened') {
      return { label: 'taken back, order reopened', voided: true };
    }
    // 'order-returned' -> "voided · order returned"
    const why = e.voidReason?.startsWith('order-') ? e.voidReason.replace(/-/g, ' ') : '';
    return { label: why ? `voided, ${why}` : 'voided', voided: true };
  }
  if (e.kind === 'spend' && e.hold) return { label: 'reserved for a payment in progress', voided: false };
  if (e.kind === 'earn' && e.amount > 0) {
    if (e.held) return { label: 'on hold, return in progress', voided: false };
    if (e.unlockAtMs > now) return { label: `unlocks ${formatDate(e.unlockAtMs)}`, voided: false };
  }
  return { label: '', voided: false };
};

/** "120 points and ₹50 cashback" + "are reserved for a payment in progress. …" */
const reservedNote = (points: number, cashback: number, payments: number) => {
  const parts = [
    points > 0 ? `${points.toLocaleString('en-IN')} point${points === 1 ? '' : 's'}` : '',
    cashback > 0 ? `₹${cashback.toLocaleString('en-IN')} cashback` : '',
  ].filter(Boolean);
  if (!parts.length) return null;
  const plural = parts.length > 1 || points > 1;
  return {
    what: parts.join(' and '),
    rest:
      `${plural ? 'are' : 'is'} reserved for ${payments > 1 ? 'payments' : 'a payment'} in progress. ` +
      (payments > 1
        ? 'If a payment is not completed, what it reserved comes back automatically.'
        : `If the payment is not completed, ${plural ? 'they come' : 'it comes'} back automatically.`),
  };
};

/**
 * Loyalty points + wallet cashback on /wallet: balances and history.
 * "Try again" remounts the card, which opens a fresh ledger listener.
 */
export const RewardsWalletCard = ({ uid }: { uid: string }) => {
  const [attempt, setAttempt] = useState(0);
  return <RewardsWalletCardBody key={attempt} uid={uid} onRetry={() => setAttempt((n) => n + 1)} />;
};

const RewardsWalletCardBody = ({ uid, onRetry }: { uid: string; onRetry: () => void }) => {
  const { entries, balances, reserved, settings, loading, error } = useRewards(uid);
  const [showAll, setShowAll] = useState(false);
  const now = Date.now();
  const points = Math.floor(balances.points.available);
  const tiles = [
    {
      label: 'Points',
      value: points.toLocaleString('en-IN'),
      sub: `Worth ₹${Math.floor(points * settings.pointValue).toLocaleString('en-IN')}`,
      icon: Coins,
    },
    {
      label: 'Pending',
      value: Math.floor(balances.points.pending).toLocaleString('en-IN'),
      sub: `Unlock ${unlockDaysAfterDelivery(settings.unlockDays)} days after delivery`,
      icon: Hourglass,
    },
    {
      label: 'Cashback',
      value: `₹${Math.floor(balances.cashback.available).toLocaleString('en-IN')}`,
      sub: 'Spend at checkout',
      icon: Wallet,
    },
  ];
  // Reserved points/cashback are already left out of the balances above, so say where they went.
  const checkouts = new Set(
    entries
      .filter((e) => e.kind === 'spend' && e.status === 'active' && e.hold)
      .map((e) => e.razorpayOrderId || e.id),
  ).size;
  const onHold = reservedNote(reserved.points, reserved.cashback, checkouts);
  const shown = showAll ? entries : entries.slice(0, RECENT);

  return (
    <section aria-labelledby="rewards-heading" className="panel tx-sheet mb-6 p-6">
      <div className="mb-5 flex items-center gap-2">
        <div aria-hidden="true" className="tx-slate flex size-10 items-center justify-center rounded-[8px] text-highlight-soft">
          <Coins className="size-5" />
        </div>
        <h2 id="rewards-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Points & cashback</h2>
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
          Unable to load your points history. Check your connection and try again.
        </Notice>
      ) : (
      <div className="mb-6">
        <div className="grid grid-cols-3 gap-3" aria-busy={loading}>
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-card border border-foreground/[0.08] bg-card/60 p-3 text-center"
            >
              <t.icon aria-hidden="true" className="mx-auto mb-1.5 size-4 text-primary" />
              {loading ? (
                <Skeleton className="mx-auto block h-7 w-12" />
              ) : (
                <p className="font-heading text-xl font-semibold text-foreground tabular-nums">
                  {t.value}
                </p>
              )}
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t.label}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.sub}</p>
            </div>
          ))}
        </div>
        {!loading && onHold && (
          <p className="mt-3 flex items-start gap-2 rounded-card border border-dashed border-foreground/[0.14] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground">{onHold.what}</span> {onHold.rest}
            </span>
          </p>
        )}
      </div>
      )}

      {error ? null : loading ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only" role="status">Loading your points history</span>
          <Skeleton className="h-10 w-full rounded-[8px]" />
          <Skeleton className="h-10 w-full rounded-[8px]" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {settings.enabled
            ? `Earn ${settings.pointsPer100} point${settings.pointsPer100 === 1 ? '' : 's'} for every ₹100 you spend, once your order is delivered. Points unlock ${unlockDaysAfterDelivery(settings.unlockDays)} days after delivery, once the return window has closed, and can cover up to ${settings.maxPointsPercent}% of your products at checkout.`
            : 'Rewards are paused right now.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-foreground/[0.07]">
            {shown.map((e) => {
              const Icon = e.source === 'scratch' ? Ticket : KIND_ICON[e.kind] || SlidersHorizontal;
              const state = entryState(e, now);
              const boost = boostLabel(e);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <Icon aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground ${state.voided ? 'opacity-50' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${state.voided ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                    >
                      {e.note}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(e.createdAtMs)}
                      {state.label ? ` · ${state.label}` : ''}
                    </p>
                  </div>
                  {/* The tier boost sits under the points so the date line stays on one row at 390px. */}
                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-sm font-semibold tabular-nums ${
                        state.voided
                          ? 'text-muted-foreground line-through'
                          : e.amount > 0
                            ? 'text-primary'
                            : 'text-foreground/70'
                      }`}
                    >
                      {amountLabel(e)}
                    </span>
                    {boost && <span className="block text-[11px] tabular-nums text-muted-foreground">{boost}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {entries.length > RECENT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 inline-flex min-h-[44px] items-center text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              {showAll ? 'Show recent only' : `Show all ${entries.length.toLocaleString('en-IN')}`}
            </button>
          )}
        </>
      )}
    </section>
  );
};

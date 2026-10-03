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
} from 'lucide-react';
import { useRewards } from '@/hooks/useRewards';
import type { RewardEntry } from '@/services/rewardsService';

const HEADING = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' };
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const KIND_ICON = {
  earn: ArrowDownLeft,
  spend: ArrowUpRight,
  refund: RotateCcw,
  adjust: SlidersHorizontal,
} as const;
/** History rows shown until "Show all" is pressed. */
const RECENT = 20;

const amountLabel = (e: RewardEntry) => {
  const sign = e.amount > 0 ? '+' : '−';
  const n = Math.abs(e.amount).toLocaleString('en-IN');
  return e.currency === 'points' ? `${sign}${n} pts` : `${sign}₹${n}`;
};

/**
 * What an entry means for the balance today. Only earned points wait (until
 * they unlock, or while their order has a return open); every other entry
 * counts at once, and a void one counts for nothing.
 */
const entryState = (e: RewardEntry, now: number): { label: string; voided: boolean } => {
  if (e.status === 'void') {
    if (e.kind === 'spend' && e.voidReason === 'payment-not-completed') {
      return { label: 'released · payment not completed', voided: true };
    }
    if (e.kind === 'refund' && e.voidReason === 'order-reopened') {
      return { label: 'taken back · order reopened', voided: true };
    }
    // 'order-returned' -> "voided · order returned"
    const why = e.voidReason?.startsWith('order-') ? e.voidReason.replace(/-/g, ' ') : '';
    return { label: why ? `voided · ${why}` : 'voided', voided: true };
  }
  if (e.kind === 'spend' && e.hold) return { label: 'reserved for a payment in progress', voided: false };
  if (e.kind === 'earn' && e.amount > 0) {
    if (e.held) return { label: 'on hold · return in progress', voided: false };
    if (e.unlockAtMs > now) return { label: `unlocks ${fmtDate(e.unlockAtMs)}`, voided: false };
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

/** Loyalty points + wallet cashback on /wallet: balances and history. */
export const RewardsWalletCard = ({ uid }: { uid: string }) => {
  const { entries, balances, reserved, settings, loading } = useRewards(uid);
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
      sub: `Unlock ${settings.unlockDays} days after delivery`,
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
    <div className="panel tx-sheet p-6 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="tx-slate w-10 h-10 rounded-[8px] flex items-center justify-center text-highlight-soft">
          <Coins className="w-5 h-5" />
        </div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Points & cashback</h3>
      </div>

      <div className="mb-6">
        <div className="grid grid-cols-3 gap-3">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-[var(--radius-card)] border border-foreground/[0.08] bg-card/60 p-3 text-center"
            >
              <t.icon className="w-4 h-4 mx-auto mb-1.5 text-primary" />
              <p className="text-xl font-semibold text-foreground tabular-nums" style={HEADING}>
                {t.value}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t.label}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/80">{t.sub}</p>
            </div>
          ))}
        </div>
        {onHold && (
          <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-card)] border border-dashed border-foreground/[0.14] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <Clock className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground">{onHold.what}</span> {onHold.rest}
            </span>
          </p>
        )}
      </div>

      {loading ? null : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {settings.enabled
            ? `Earn ${settings.pointsPer100} point${settings.pointsPer100 === 1 ? '' : 's'} for every ₹100 you spend, once your order is delivered. Points unlock after the ${settings.unlockDays}-day return window and can cover up to ${settings.maxPointsPercent}% of your products at checkout.`
            : 'Rewards are paused right now.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-foreground/[0.07]">
            {shown.map((e) => {
              const Icon = KIND_ICON[e.kind] || SlidersHorizontal;
              const state = entryState(e, now);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <Icon className={`w-4 h-4 flex-shrink-0 text-muted-foreground ${state.voided ? 'opacity-50' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${state.voided ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                    >
                      {e.note}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(e.createdAtMs)}
                      {state.label ? ` · ${state.label}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      state.voided
                        ? 'text-muted-foreground line-through'
                        : e.amount > 0
                          ? 'text-primary'
                          : 'text-foreground/70'
                    }`}
                  >
                    {amountLabel(e)}
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
              className="mt-3 rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {showAll ? 'Show recent only' : `Show all ${entries.length.toLocaleString('en-IN')}`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

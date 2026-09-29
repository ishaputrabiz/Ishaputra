import { Coins, Wallet, Hourglass, ArrowDownLeft, ArrowUpRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
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

const amountLabel = (e: RewardEntry) => {
  const sign = e.amount > 0 ? '+' : '−';
  const n = Math.abs(e.amount).toLocaleString('en-IN');
  return e.currency === 'points' ? `${sign}${n} pts` : `${sign}₹${n}`;
};

/** Loyalty points + wallet cashback on /wallet: balances and history. */
export const RewardsWalletCard = ({ uid }: { uid: string }) => {
  const { entries, balances, settings, loading } = useRewards(uid);
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

  return (
    <div className="panel tx-sheet p-6 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="tx-slate w-10 h-10 rounded-[8px] flex items-center justify-center text-highlight-soft">
          <Coins className="w-5 h-5" />
        </div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Points & cashback</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
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

      {loading ? null : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {settings.enabled
            ? `Earn ${settings.pointsPer100} point${settings.pointsPer100 === 1 ? '' : 's'} for every ₹100 you spend, once your order is delivered. Points unlock after the ${settings.unlockDays}-day return window and can cover up to ${settings.maxPointsPercent}% of your products at checkout.`
            : 'Rewards are paused right now.'}
        </p>
      ) : (
        <ul className="divide-y divide-foreground/[0.07]">
          {entries.slice(0, 20).map((e) => {
            const Icon = KIND_ICON[e.kind] || SlidersHorizontal;
            const pending = e.status === 'active' && e.unlockAtMs > now;
            return (
              <li key={e.id} className={`flex items-center gap-3 py-2.5 ${e.status === 'void' ? 'opacity-50' : ''}`}>
                <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-foreground truncate ${e.status === 'void' ? 'line-through' : ''}`}>{e.note}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(e.createdAtMs)}
                    {pending ? ` · unlocks ${fmtDate(e.unlockAtMs)}` : ''}
                    {e.status === 'void' ? ' · cancelled' : ''}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${e.amount > 0 ? 'text-primary' : 'text-foreground/70'}`}>
                  {amountLabel(e)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

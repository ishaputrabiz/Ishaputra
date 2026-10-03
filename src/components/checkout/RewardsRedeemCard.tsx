import { Switch } from '@/components/ui/switch';
import type { RewardBalances, RewardSettings } from '@/lib/rewards';
import { formatINR, formatNumber } from '@/lib/format';

const inr = (n: number) => formatINR(n);

const Row = ({
  title,
  detail,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <label className={`flex min-h-11 items-center justify-between gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-foreground tabular-nums">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground tabular-nums">{detail}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </label>
);

/**
 * "Your rewards" at checkout: opt in to spend loyalty points and wallet
 * cashback. Hidden when rewards are off or there is nothing to spend. The
 * amounts come from the same rules the server applies (src/lib/rewards.ts).
 */
export const RewardsRedeemCard = ({
  balances,
  settings,
  usePoints,
  useCashback,
  onUsePoints,
  onUseCashback,
  pointsApplied,
  pointsValue,
  cashbackApplied,
  className = '',
}: {
  balances: RewardBalances;
  settings: RewardSettings;
  usePoints: boolean;
  useCashback: boolean;
  onUsePoints: (v: boolean) => void;
  onUseCashback: (v: boolean) => void;
  pointsApplied: number;
  pointsValue: number;
  cashbackApplied: number;
  className?: string;
}) => {
  const points = Math.max(0, Math.floor(balances.points.available));
  const pending = Math.max(0, Math.floor(balances.points.pending));
  const cashback = Math.max(0, Math.floor(balances.cashback.available));
  if (!settings.enabled || (points <= 0 && cashback <= 0 && pending <= 0)) return null;

  return (
    <div
      className={`tx-sheet rounded-card border border-foreground/[0.08] shadow-panel px-4 py-2 ${className}`}
    >
      <h2 className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Your rewards</h2>
      <div className="divide-y divide-foreground/[0.08]">
        {(points > 0 || pending > 0) && (
          <Row
            title={points > 0 ? `Use ${formatNumber(points)} points` : 'Points on the way'}
            detail={
              points > 0
                ? usePoints && pointsApplied > 0
                  ? `${formatNumber(pointsApplied)} points save ${inr(pointsValue)}. Covers up to ${settings.maxPointsPercent}% of the product total.`
                  : `Worth ${inr(points * settings.pointValue)}. Covers up to ${settings.maxPointsPercent}% of the product total.`
                : `${formatNumber(pending)} points unlock after the ${settings.unlockDays}-day return window`
            }
            checked={usePoints && points > 0}
            onChange={onUsePoints}
            disabled={points <= 0}
          />
        )}
        {cashback > 0 && (
          <Row
            title={`Use wallet cashback ${inr(cashback)}`}
            detail={
              useCashback && cashbackApplied > 0 ? `${inr(cashbackApplied)} applied to this order` : 'Covers products and delivery'
            }
            checked={useCashback}
            onChange={onUseCashback}
          />
        )}
      </div>
    </div>
  );
};

/** Bill summary lines for applied points / cashback (render inside a bill). */
export const RewardsBillLines = ({
  pointsApplied,
  pointsValue,
  cashbackApplied,
  className = 'flex justify-between text-sm',
}: {
  pointsApplied: number;
  pointsValue: number;
  cashbackApplied: number;
  className?: string;
}) => (
  <>
    {pointsApplied > 0 && (
      <div className={className}>
        <span className="text-primary">Points ({formatNumber(pointsApplied)})</span>
        <span className="text-primary font-medium tabular-nums">−{inr(pointsValue)}</span>
      </div>
    )}
    {cashbackApplied > 0 && (
      <div className={className}>
        <span className="text-primary">Wallet cashback</span>
        <span className="text-primary font-medium tabular-nums">−{inr(cashbackApplied)}</span>
      </div>
    )}
  </>
);

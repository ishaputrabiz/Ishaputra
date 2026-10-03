import { Switch } from '@/components/ui/switch';
import type { RewardBalances, RewardSettings } from '@/lib/rewards';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

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
  <label className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{detail}</span>
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
      className={`tx-sheet rounded-[var(--radius-card)] border border-foreground/[0.08] shadow-[var(--shadow-panel)] px-4 py-2 ${className}`}
    >
      <p className="eyebrow-no pt-2 pb-1">
        <span>Your rewards</span>
      </p>
      <div className="divide-y divide-foreground/[0.07]">
        {(points > 0 || pending > 0) && (
          <Row
            title={points > 0 ? `Use ${points.toLocaleString('en-IN')} points` : 'Points on the way'}
            detail={
              points > 0
                ? usePoints && pointsApplied > 0
                  ? `${pointsApplied.toLocaleString('en-IN')} points save ${inr(pointsValue)} (up to ${settings.maxPointsPercent}% of products)`
                  : `Worth ${inr(points * settings.pointValue)} · up to ${settings.maxPointsPercent}% of products`
                : `${pending.toLocaleString('en-IN')} points unlock after the ${settings.unlockDays}-day return window`
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
        <span className="text-primary">Points ({pointsApplied.toLocaleString('en-IN')})</span>
        <span className="text-primary font-medium">− {inr(pointsValue)}</span>
      </div>
    )}
    {cashbackApplied > 0 && (
      <div className={className}>
        <span className="text-primary">Wallet cashback</span>
        <span className="text-primary font-medium">− {inr(cashbackApplied)}</span>
      </div>
    )}
  </>
);

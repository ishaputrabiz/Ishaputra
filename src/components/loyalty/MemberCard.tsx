// ============================================
// LOYALTY MEMBER CARD: the digital card, tier steps and the /wallet status panel.
// Pure `...View` pieces take plain props (checkable with fixture data); the
// thin `LoyaltyStatusPanel` container reads the real data.
// ============================================

import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Copy, Sparkles, Store } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealer } from '@/hooks/useDealer';
import { useLoyaltyStatus } from '@/hooks/useLoyaltyStatus';
import { useRewards } from '@/hooks/useRewards';
import { BRAND } from '@/config/brand';
import { formatMemberNumber, memberDigits } from '@/lib/loyaltyCard';
import { tierStyle } from '@/lib/tierLook';
import { formatINR, formatNumber, toDate } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';
import type { LoyaltyTier } from '@/lib/rewards';
import { cn } from '@/lib/utils';

// ─── Tier look: see src/lib/tierLook.ts ─────────────────────────────────────

const FALLBACK_TIER: LoyaltyTier = { name: 'Member', minSpend: 0, multiplier: 1 };
const tierAt = (tiers: LoyaltyTier[], index: number): LoyaltyTier =>
  tiers[Math.min(Math.max(0, index), tiers.length - 1)] ?? FALLBACK_TIER;

const mult = (m: number) => `${m}x`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 2026" from a Date, Firestore Timestamp or ISO string. Empty when the date is missing. */
function formatMemberSince(value: unknown): string {
  const d = toDate(value);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

// ─── Chips ─────────────────────────────────────────────────────────────────

const CHIP = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-chip border px-1.5 text-[10px] font-bold uppercase tracking-[0.16em]';

/** "Dealer" chip: on charcoal (the card) or on paper. */
export const DealerChip = ({ onDark = false }: { onDark?: boolean }) => (
  <span className={cn(CHIP, onDark ? 'border-charcoal-foreground/35 text-charcoal-foreground' : 'border-primary/45 text-primary')}>
    <Store aria-hidden="true" className="size-3.5" />
    Dealer
  </span>
);

/**
 * The tier's chip. On charcoal by default (tier metal on a hairline in the same
 * metal); `onPaper` gives the paper-surface version with a metal disc.
 */
export const TierChip = ({
  index,
  name,
  multiplier,
  onPaper = false,
}: {
  index: number;
  name: string;
  multiplier?: number;
  onPaper?: boolean;
}) => {
  const look = tierStyle(index);
  const Icon = look.icon;
  const hidden = (
    <span className="sr-only"> member{multiplier ? `, earns ${mult(multiplier)} points` : ''}</span>
  );
  if (onPaper) {
    return (
      <span className={cn(CHIP, 'gap-1.5 border-foreground/15 text-foreground')}>
        <span aria-hidden="true" className="grid size-4 place-items-center rounded-full text-charcoal" style={{ background: look.metal }}>
          <Icon className="size-2.5" />
        </span>
        {name}
        {hidden}
      </span>
    );
  }
  return (
    <span className={cn(CHIP, 'gap-1.5')} style={{ color: look.metal, borderColor: look.line }}>
      <Icon aria-hidden="true" className="size-3.5" />
      {name}
      {hidden}
    </span>
  );
};

// ─── The member card ───────────────────────────────────────────────────────

export interface MemberCardViewProps {
  name: string;
  /** Formatted for display, e.g. "IB 4821 7730 1956". The copy button copies its 12 digits. */
  memberNumber: string;
  /** "Oct 2026". The line is hidden when empty. */
  memberSince?: string;
  tierIndex: number;
  tiers: LoyaltyTier[];
  /** Spendable points, or null when the balance could not be loaded (never shown as 0). */
  points: number | null;
  /** What the points are worth, in rupees. */
  pointsWorth: number;
  dealer?: boolean;
}

const copyNumber = async (memberNumber: string) => {
  try {
    await navigator.clipboard.writeText(memberNumber.replace(/\D/g, '').slice(-12));
    toast('Member number copied');
  } catch {
    toast.error('Unable to copy. Select the number to copy it.');
  }
};

export const MemberCardView = ({
  name,
  memberNumber,
  memberSince,
  tierIndex,
  tiers,
  points,
  pointsWorth,
  dealer = false,
}: MemberCardViewProps) => {
  const tier = tierAt(tiers, tierIndex);
  const look = tierStyle(tierIndex);
  const Icon = look.icon;
  return (
    <div className="rounded-[14px] p-[1.5px] shadow-[0_22px_44px_-26px_rgba(0,0,0,0.75)]" style={{ backgroundImage: look.edge }}>
      <div
        role="group"
        aria-label={`${BRAND.shortName} ${tier.name} member card`}
        className="tx-slate relative flex aspect-[1.586/1] flex-col justify-between overflow-hidden rounded-[12.5px] p-4 text-charcoal-foreground sm:p-5"
      >
        {/* Foil glow in the tier metal + a faint tier mark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `radial-gradient(85% 75% at 100% 0%, ${look.glow}, transparent 62%)` }}
        />
        <Icon aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-8 size-40 opacity-[0.045]" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <img src="/white_logo.png" alt="" aria-hidden="true" width={330} height={96} className="h-5 w-auto sm:h-6" />
            <p className="mt-2 text-[11px] font-medium leading-snug text-charcoal-foreground/80">
              {mult(tier.multiplier)} points on every delivered order
            </p>
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-end gap-1.5">
            <span
              className="inline-flex max-w-[9rem] items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: look.metal }}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate" title={tier.name}>{tier.name}</span>
            </span>
            {dealer && <DealerChip onDark />}
          </div>
        </div>

        <div className="relative -my-1 flex items-center gap-1">
          <p className="font-heading text-[19px] font-semibold tracking-[0.08em] tabular-nums sm:text-[22px]">
            <span className="sr-only">Member number </span>
            {memberNumber}
          </p>
          <IconButton
            label="Copy member number"
            size="sm"
            onClick={() => void copyNumber(memberNumber)}
            className="text-charcoal-foreground/80 hover:bg-charcoal-foreground/10 hover:text-charcoal-foreground"
          >
            <Copy />
          </IconButton>
        </div>

        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold uppercase tracking-[0.1em]">{name}</p>
            {memberSince && <p className="text-[11px] text-charcoal-foreground/75">Member since {memberSince}</p>}
          </div>
          <div className="shrink-0 text-right">
            {points === null ? (
              <p className="text-[11px] text-charcoal-foreground/75">Points unavailable</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold tabular-nums">{formatNumber(points)} points</p>
                <p className="text-[11px] tabular-nums text-charcoal-foreground/75">Worth {formatINR(pointsWorth)}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Progress bar and the four tier steps ──────────────────────────────────

/**
 * Where the fill ends, 0 to 1. The steps sit at equal spacing, so each gap
 * fills by its own share of spend, clamped to 0-1 (a plain spend / top ratio
 * would leave a Gold member's fill short of the Gold step).
 */
const fillPosition = (spend: number, tiers: LoyaltyTier[]): number => {
  if (tiers.length < 2) return 0;
  let filled = 0;
  for (let i = 0; i < tiers.length - 1; i++) {
    const span = tiers[i + 1].minSpend - tiers[i].minSpend;
    filled += span > 0 ? Math.min(1, Math.max(0, (spend - tiers[i].minSpend) / span)) : spend >= tiers[i + 1].minSpend ? 1 : 0;
  }
  return filled / (tiers.length - 1);
};

/** Progress bar + the tier steps, each with its threshold and multiplier. */
export const TierSteps = ({ spend, tierIndex, tiers }: { spend: number; tierIndex: number; tiers: LoyaltyTier[] }) => (
  <div className="relative py-2">
    <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[28px] h-1 overflow-hidden rounded-full bg-charcoal-foreground/10">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: fillPosition(spend, tiers) }}
        transition={{ duration: DUR.reveal * 2, ease: EASE_OUT }}
        className="h-full origin-left rounded-full bg-gradient-to-r from-highlight-soft to-primary"
      />
    </div>
    <ol className="relative flex items-start justify-between">
      {tiers.map((t, i) => {
        const look = tierStyle(i);
        const StepIcon = look.icon;
        const isCurrent = i === tierIndex;
        const reached = spend >= t.minSpend;
        return (
          <li key={i} aria-current={isCurrent ? 'step' : undefined} className="z-10 flex min-w-0 flex-1 flex-col items-center text-center">
            <div
              aria-hidden="true"
              className={cn(
                'relative flex size-11 items-center justify-center rounded-full',
                isCurrent
                  ? 'scale-110 text-charcoal shadow-xl ring-2 ring-charcoal-foreground/40 ring-offset-2 ring-offset-charcoal'
                  : reached
                    ? 'text-charcoal shadow-md'
                    : 'border border-charcoal-foreground/15 bg-charcoal text-charcoal-foreground/60',
              )}
              style={reached ? { background: look.metal } : undefined}
            >
              <StepIcon className="size-5" />
            </div>
            <p
              className={cn(
                'mt-2.5 max-w-full text-[10px] font-bold uppercase leading-tight tracking-[0.12em] [overflow-wrap:anywhere]',
                isCurrent ? 'text-charcoal-foreground' : 'text-charcoal-foreground/70',
              )}
            >
              {t.name}
              {reached && !isCurrent && <span className="sr-only">, reached</span>}
            </p>
            <p className="mt-0.5 text-[10px] tabular-nums text-charcoal-foreground/70 lg:text-[11px]">
              <span className="sr-only">from </span>
              {formatINR(t.minSpend)}
            </p>
            <p className="text-[10px] font-semibold tabular-nums text-highlight-soft lg:text-[11px]">{mult(t.multiplier)} points</p>
          </li>
        );
      })}
    </ol>
  </div>
);

// ─── The /wallet status panel ──────────────────────────────────────────────

const PANEL =
  'tx-slate tx-contour relative mb-6 overflow-hidden rounded-panel p-4 text-charcoal-foreground shadow-[var(--shadow-panel)] sm:p-6 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-center lg:gap-10';

export interface LoyaltyStatusPanelViewProps extends MemberCardViewProps {
  /** Rupees paid online for delivered orders (what the tiers count). */
  spend: number;
}

/**
 * Today's charcoal "status" card with the member card at its top, then the
 * membership progress, the tier steps and what counts towards the tier.
 */
export const LoyaltyStatusPanelView = ({ spend, ...card }: LoyaltyStatusPanelViewProps) => {
  const headingId = useId();
  const { tiers, tierIndex, dealer = false } = card;
  const next = tiers[tierIndex + 1] ?? null;
  const top = tiers[tiers.length - 1]?.minSpend ?? 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.modal, ease: EASE_OUT }}
      aria-labelledby={headingId}
      className={PANEL}
    >
      <h2 id={headingId} className="sr-only">Your member card and tier</h2>
      <MemberCardView {...card} />

      <div className="mt-5 min-w-0 space-y-3 lg:mt-0">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-charcoal-foreground/75">Membership progress</span>
          <span className="font-semibold tabular-nums">{next ? `${formatINR(spend)} / ${formatINR(top)}` : formatINR(spend)}</span>
        </div>
        <TierSteps spend={spend} tierIndex={tierIndex} tiers={tiers} />
        {next ? (
          <p className="text-center text-xs font-medium text-charcoal-foreground/80 [text-wrap:balance]">
            Spend <span className="tabular-nums">{formatINR(next.minSpend - spend)}</span> more to reach {next.name} and earn{' '}
            <span className="tabular-nums">{mult(next.multiplier)}</span> points
          </p>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-[8px] border border-highlight-soft/30 bg-charcoal-foreground/5 p-2">
            <Sparkles aria-hidden="true" className="size-4 text-highlight-soft" />
            <p className="text-xs font-medium">You're at the top tier.</p>
          </div>
        )}
        <p className="border-t border-charcoal-foreground/15 pt-3 text-[11px] leading-relaxed text-charcoal-foreground/75">
          Your tier counts what you've paid online for delivered orders. Returned or cancelled orders don't count.
          {dealer && ' Dealer-priced orders earn no points.'}
        </p>
      </div>
    </motion.section>
  );
};

/** The panel's size and shape while the tier and points load, so nothing jumps. */
const LoyaltyStatusSkeleton = () => (
  <section aria-busy="true" className={PANEL}>
    <span className="sr-only" role="status">Loading your member card</span>
    <Skeleton className="aspect-[1.586/1] w-full rounded-[14px] bg-charcoal-foreground/10" />
    <div className="mt-5 min-w-0 space-y-3 lg:mt-0">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32 bg-charcoal-foreground/10" />
        <Skeleton className="h-4 w-24 bg-charcoal-foreground/10" />
      </div>
      <Skeleton className="h-[116px] w-full bg-charcoal-foreground/10" />
      <Skeleton className="mx-auto h-8 w-3/4 bg-charcoal-foreground/10" />
      <Skeleton className="h-[58px] w-full bg-charcoal-foreground/10" />
    </div>
  </section>
);

/**
 * Container: the signed-in customer's tier (from payment records), points and
 * dealer state. `createdAt` is the account's creation date ("Member since").
 */
export const LoyaltyStatusPanel = ({ uid, name, createdAt }: { uid: string; name: string; createdAt?: unknown }) => {
  const status = useLoyaltyStatus(uid);
  const rewards = useRewards(uid);
  const dealer = useDealer();
  const memberNumber = useMemo(() => formatMemberNumber(memberDigits(uid), BRAND.memberPrefix), [uid]);

  if (status.error) {
    return (
      <div className="mb-6">
        <Notice
          tone="danger"
          action={
            <button type="button" onClick={status.retry} className="btn-line h-10 px-4 text-foreground">
              Try again
            </button>
          }
        >
          Couldn't load your member card. Check your connection and try again.
        </Notice>
      </div>
    );
  }
  if (status.loading || rewards.loading) return <LoyaltyStatusSkeleton />;

  const points = rewards.error ? null : Math.floor(rewards.balances.points.available);
  return (
    <LoyaltyStatusPanelView
      name={name}
      memberNumber={memberNumber}
      memberSince={formatMemberSince(createdAt)}
      tierIndex={status.tierIndex}
      tiers={status.tiers}
      spend={status.spend}
      points={points}
      pointsWorth={points === null ? 0 : Math.floor(points * rewards.settings.pointValue)}
      dealer={dealer.record?.status === 'approved'}
    />
  );
};

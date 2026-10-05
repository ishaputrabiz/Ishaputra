import { motion } from 'framer-motion';
import { CircleAlert, Crown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { TIER_MAX_SPEND, tierErrors } from '@/lib/loyaltyTiersForm';
import { fadeUp } from '@/lib/motion';
import { formatINR, formatNumber } from '@/lib/format';
import { normaliseRewardSettings, pointsForBase, type LoyaltyTier } from '@/lib/rewards';
import { cn } from '@/lib/utils';

/** Metal dots by row, the same values as the member card (src/components/loyalty). Decorative only. */
const TIER_DOT = ['hsl(210 10% 78%)', 'hsl(36 48% 59%)', 'hsl(36 24% 86%)', 'hsl(23 63% 61%)'];

/** The order the last column works out points for. */
const SAMPLE_ORDER = 2000;

export interface LoyaltyTiersSectionProps {
  /** Exactly four rows, as typed (not yet saved). */
  tiers: LoyaltyTier[];
  onChange: (tiers: LoyaltyTier[]) => void;
  /** The tab's "points per ₹100" as typed, so the last column follows it. */
  pointsPer100: number;
}

/**
 * The four loyalty tiers (Admin > Commerce settings > Rewards): a controlled
 * table with no Firestore. The first tier is fixed at ₹0; each later one must
 * start above the one before it, and the tab blocks Save until it does
 * (tierErrors).
 */
export function LoyaltyTiersSection({ tiers, onChange, pointsPer100 }: LoyaltyTiersSectionProps) {
  const errors = tierErrors(tiers);
  // Clamped like the save, so the column never promises more than ₹100 can earn.
  const earn = normaliseRewardSettings({ enabled: true, pointsPer100 });
  const update = (i: number, patch: Partial<LoyaltyTier>) =>
    onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <motion.section
      {...fadeUp}
      aria-labelledby="tiers-title"
      className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-muted text-foreground/70">
          <Crown className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="tiers-title" className="text-base font-semibold text-foreground">Loyalty tiers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customers see their tier on the member card at the top of the wallet. Placeholder values until the client confirms its tiers.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-foreground/[0.08]">
        <table className="w-full table-fixed text-left">
          <caption className="sr-only">Loyalty tiers</caption>
          <thead className="bg-muted/60 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground [&_th]:align-bottom">
            <tr>
              <th scope="col" className="px-2 py-2.5 font-semibold sm:px-3">Tier name</th>
              <th scope="col" className="w-[34%] px-2 py-2.5 font-semibold sm:w-[24%] sm:px-3">Spend from (₹)</th>
              <th scope="col" className="w-[26%] px-2 py-2.5 font-semibold sm:w-[20%] sm:px-3">Points (x)</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell sm:w-[24%] sm:px-3">
                On a {formatINR(SAMPLE_ORDER)} order
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.07]">
            {tiers.map((t, i) => {
              const label = t.name.trim() || `Tier ${i + 1}`;
              return (
                <tr key={i}>
                  <td className="px-2 py-2 sm:px-3">
                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-1 ring-foreground/20"
                        style={{ background: TIER_DOT[i] }}
                      />
                      <Input
                        aria-label={`Tier ${i + 1}, name`}
                        value={t.name}
                        maxLength={24}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="h-11 w-full pl-8 sm:h-10"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <Input
                      id={`tier-${i}-min`}
                      aria-label={`${label}, spend from in rupees`}
                      aria-describedby={i === 0 ? 'tier-first-hint' : errors[i] ? `tier-${i}-error` : undefined}
                      aria-invalid={errors[i] ? true : undefined}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={TIER_MAX_SPEND}
                      value={i === 0 ? 0 : t.minSpend}
                      readOnly={i === 0}
                      onChange={(e) => update(i, { minSpend: Number(e.target.value) })}
                      className={cn('h-11 w-full tabular-nums sm:h-10', i === 0 && 'cursor-not-allowed bg-muted text-muted-foreground')}
                    />
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <Input
                      aria-label={`${label}, points multiplier`}
                      type="number"
                      inputMode="decimal"
                      step={0.05}
                      min={1}
                      max={5}
                      value={t.multiplier}
                      onChange={(e) => update(i, { multiplier: Number(e.target.value) })}
                      className="h-11 w-full tabular-nums max-sm:px-2 max-sm:[&::-webkit-inner-spin-button]:appearance-none sm:h-10"
                    />
                  </td>
                  <td className="hidden px-2 py-2 text-right text-sm sm:table-cell sm:px-3">
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNumber(pointsForBase(SAMPLE_ORDER, earn, t.multiplier))}
                    </span>{' '}
                    <span className="text-muted-foreground">points</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p id="tier-first-hint" className="mt-2 text-xs text-muted-foreground">
        The first tier always starts at ₹0. Each tier must start above the one before it.
      </p>
      {/* Always in the page, so a screen reader announces a message when it appears. */}
      <div aria-live="polite">
        {errors.map((message, i) =>
          message ? (
            <p key={i} id={`tier-${i}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-status-danger-fg">
              <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              {message}
            </p>
          ) : null,
        )}
      </div>

      <Notice tone="info" title="How tiers work" className="mt-5" role="note">
        Tier counts money paid online on delivered orders; returned or cancelled orders don&apos;t count. The multiplier
        applies to points earned when an order is delivered.
      </Notice>
    </motion.section>
  );
}

export default LoyaltyTiersSection;

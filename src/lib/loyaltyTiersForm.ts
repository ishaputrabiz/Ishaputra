import type { LoyaltyTier, RewardSettings } from './rewards';

/*
 * Form rules for the loyalty tier editor (Admin > Commerce settings > Rewards).
 * Pure and dependency-free so tests/loyaltyTiersForm.test.ts can import it.
 * The limits mirror normaliseTiers in rewards.ts, which is what the save runs.
 */

/** The highest "spend from" rewards.ts accepts. */
export const TIER_MAX_SPEND = 10_000_000;

/** A typed "spend from" as it would be stored: whole rupees from 0 to TIER_MAX_SPEND (NaN when unreadable). */
const storedSpend = (v: unknown) => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(TIER_MAX_SPEND, Math.max(0, n))) : NaN;
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * One message per row, or null when the row is fine. The first row is fixed at
 * ₹0, and each later row must start strictly above the one before it: a tie
 * would make a tier impossible to reach. Compared as they would be stored
 * (rounded and capped), so 5000 and 5000.4 count as a tie.
 */
export function tierErrors(tiers: LoyaltyTier[]): (string | null)[] {
  const label = (i: number) => tiers[i]?.name?.trim() || `Tier ${i + 1}`;
  return tiers.map((t, i) => {
    if (i === 0) return null;
    const own = storedSpend(t.minSpend);
    if (Number.isNaN(own)) return `Enter a spend amount for ${label(i)}.`;
    const before = i === 1 ? 0 : storedSpend(tiers[i - 1].minSpend);
    if (Number.isNaN(before)) return null; // the earlier row carries its own message
    return own > before ? null : `${label(i)} must start above ${rupees(before)}, where ${label(i - 1)} starts.`;
  });
}

/** True when any row has a message. */
export const hasTierErrors = (tiers: LoyaltyTier[]) => tierErrors(tiers).some((e) => e !== null);

/** Tiers compared by value, row by row (names ignoring surrounding spaces, which the save trims). */
export function tiersEqual(a: LoyaltyTier[], b: LoyaltyTier[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.name.trim() === b[i].name.trim() && t.minSpend === b[i].minSpend && t.multiplier === b[i].multiplier)
  );
}

/**
 * Whether saving changed what was typed (a value clamped into range, a blank
 * name put back to the default). `tiers` is always a fresh array after
 * normalising, so it is compared by value, not by reference.
 */
export function rewardSettingsAdjusted(typed: RewardSettings, clean: RewardSettings): boolean {
  return (Object.keys(clean) as (keyof RewardSettings)[]).some((k) =>
    k === 'tiers' ? !tiersEqual(clean.tiers, typed.tiers) : clean[k] !== typed[k],
  );
}

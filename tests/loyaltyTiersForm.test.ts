import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REWARD_SETTINGS, DEFAULT_TIERS, normaliseRewardSettings } from '../src/lib/rewards.ts';
import { hasTierErrors, rewardSettingsAdjusted, tierErrors, tiersEqual } from '../src/lib/loyaltyTiersForm.ts';

const tiers = (mins: number[]) => DEFAULT_TIERS.map((t, i) => ({ ...t, minSpend: mins[i] }));

test('the default tiers have no errors', () => {
  assert.deepEqual(tierErrors(DEFAULT_TIERS), [null, null, null, null]);
  assert.equal(hasTierErrors(DEFAULT_TIERS), false);
});

test('a tie with the tier before is an error on that row only', () => {
  const e = tierErrors(tiers([0, 5000, 5000, 30000]));
  assert.equal(e[0], null);
  assert.equal(e[1], null);
  assert.match(e[2] ?? '', /Platinum must start above ₹5,000, where Gold starts/);
  assert.equal(e[3], null);
});

test('a tier below the one before it is an error', () => {
  const e = tierErrors(tiers([0, 5000, 4000, 30000]));
  assert.match(e[2] ?? '', /Platinum must start above ₹5,000/);
  assert.equal(hasTierErrors(tiers([0, 5000, 4000, 30000])), true);
});

test('the second tier must start above ₹0, and a negative one clamps to a tie with it', () => {
  assert.match(tierErrors(tiers([0, 0, 15000, 30000]))[1] ?? '', /Gold must start above ₹0, where Silver starts/);
  assert.match(tierErrors(tiers([0, -50, 15000, 30000]))[1] ?? '', /Gold must start above ₹0/);
});

test('the first tier is fixed: whatever is typed there is not an error', () => {
  assert.equal(tierErrors(tiers([999, 5000, 15000, 30000]))[0], null);
  // The save stores row 1 as ₹0, so row 2 is measured against ₹0, not ₹999.
  assert.equal(tierErrors(tiers([999, 500, 15000, 30000]))[1], null);
});

test('values are compared as they would be stored (rounded, capped)', () => {
  assert.match(tierErrors(tiers([0, 5000, 5000.4, 30000]))[2] ?? '', /must start above ₹5,000/);
  assert.equal(tierErrors(tiers([0, 5000, 5000.6, 30000]))[2], null);
  // Both capped to ₹1,00,00,000: a tie once saved.
  assert.match(tierErrors(tiers([0, 5000, 10_000_000, 20_000_000]))[3] ?? '', /must start above ₹1,00,00,000/);
});

test('an unreadable amount asks for one, and does not blame the next row', () => {
  const e = tierErrors(tiers([0, NaN, 15000, 30000]));
  assert.match(e[1] ?? '', /Enter a spend amount for Gold/);
  assert.equal(e[2], null);
});

test('a blank name is labelled by its position', () => {
  const rows = tiers([0, 5000, 5000, 30000]);
  rows[2] = { ...rows[2], name: '  ' };
  assert.match(tierErrors(rows)[2] ?? '', /^Tier 3 must start above/);
});

test('no error means the save keeps the tiers as typed', () => {
  const typed = tiers([0, 4000, 12000.4, 25000]);
  assert.equal(hasTierErrors(typed), false);
  const saved = normaliseRewardSettings({ ...DEFAULT_REWARD_SETTINGS, tiers: typed }).tiers;
  assert.deepEqual(
    saved.map((t) => t.minSpend),
    [0, 4000, 12000, 25000],
  );
});

test('tiersEqual compares row values, not the array', () => {
  assert.equal(tiersEqual(DEFAULT_TIERS, DEFAULT_TIERS.map((t) => ({ ...t }))), true);
  assert.equal(tiersEqual(DEFAULT_TIERS, tiers([0, 5000, 15000, 30001])), false);
  assert.equal(tiersEqual(DEFAULT_TIERS, DEFAULT_TIERS.map((t, i) => (i === 1 ? { ...t, multiplier: 1.3 } : t))), false);
  assert.equal(tiersEqual(DEFAULT_TIERS, DEFAULT_TIERS.map((t, i) => (i === 3 ? { ...t, name: 'Elite' } : t))), false);
  assert.equal(tiersEqual(DEFAULT_TIERS, DEFAULT_TIERS.map((t, i) => (i === 0 ? { ...t, name: ' Silver ' } : t))), true);
  assert.equal(tiersEqual(DEFAULT_TIERS, DEFAULT_TIERS.slice(0, 3)), false);
});

test('untouched settings are not reported as adjusted, although normalising returns a new tiers array', () => {
  const typed = normaliseRewardSettings(DEFAULT_REWARD_SETTINGS);
  const clean = normaliseRewardSettings(typed);
  assert.notEqual(clean.tiers, typed.tiers);
  assert.equal(rewardSettingsAdjusted(typed, clean), false);
});

test('a clamped tier value, a clamped field and a blank name are reported as adjusted', () => {
  const base = normaliseRewardSettings(DEFAULT_REWARD_SETTINGS);
  const clamp = (patch: Partial<typeof base>) => {
    const typed = { ...base, ...patch };
    return rewardSettingsAdjusted(typed, normaliseRewardSettings(typed));
  };
  assert.equal(clamp({ tiers: tiers([0, 5000, 15000, 30000]).map((t, i) => (i === 1 ? { ...t, multiplier: 9 } : t)) }), true);
  assert.equal(clamp({ tiers: tiers([0, 5000, 15000, 30000]).map((t, i) => (i === 2 ? { ...t, minSpend: 15000.4 } : t)) }), true);
  assert.equal(clamp({ tiers: base.tiers.map((t, i) => (i === 3 ? { ...t, name: '' } : t)) }), true);
  assert.equal(clamp({ pointsPer100: 500 }), true);
  assert.equal(clamp({ pointsPer100: 2 }), false);
});

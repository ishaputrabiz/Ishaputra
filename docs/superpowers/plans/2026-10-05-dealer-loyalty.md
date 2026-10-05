# Dealer Membership and Loyalty Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approved dealers pay server-enforced dealer prices, and every customer gets a digital loyalty card whose tier (now with a points multiplier) the server works out from real payments.

**Architecture:** Two pure shared blocks hold the money rules: `dealer-core` (new, `src/lib/dealer.ts`, copied into `api/create-order.ts`) and `rewards-core` (extended with tiers, copied into `api/create-order.ts` and `api/notify-order.ts`). The server re-prices every order with them; the browser mirrors them for display. Dealer status lives in an admin-controlled `dealers/<uid>` collection and dealer prices in a private `dealerPricing/current` doc, both guarded by Firestore rules. New screens are ported from the approved mock components.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind, shadcn/ui, Firebase (client SDK and Admin SDK), Vercel functions, Razorpay, `node --test` (Node 22 strips TS types), global Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-dealer-loyalty-design.md`. **Approved mockups:** `src/pages/__mock/DealerLoyaltyMock.tsx` and `src/pages/__mock/DealerAdminMock.tsx` (git-ignored, present on disk; open them at `http://127.0.0.1:5182/__mock/dealer-loyalty` and `/__mock/dealer-admin?view=dealers|settings|tiers|product|customer`). Screenshots: `../shots/dealer-loyalty-mockup/`.

## Global Constraints

- Work on branch `dealer-loyalty`. Local commits only; never push or deploy. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit only the files your task names (`git add <paths>`, never `git add -A`). Never commit `src/App.tsx`'s lines marked `MOCKUP, do not commit` or anything under `src/pages/__mock/`. If git reports `index.lock`, wait 5 seconds and retry.
- Repo files are CRLF. Keep each file's line endings. Write scripts with the Write tool, not bash heredocs with backticks.
- `api/` files import nothing from `src/`. Shared rules are copied by `npm run sync:rewards`; never hand-edit a copied block in `api/`.
- Vercel Hobby: all 12 functions are used. No new files in `api/`.
- Never read `.env`, `*.local` or the service-account JSON (a script may load `docs/handoff/shopper.local` to sign in, but never print it). Never connect to port 5173 or to Sreerasthu's Firebase. Never write test data to live Firestore in this build: the only live writes allowed are the ones signing in as the preview shopper makes by itself (login history). The live test is a separate, approved step.
- The dev server already runs at `http://127.0.0.1:5182`; never start another (check `netstat -ano | grep :5182` first if it seems down, and tell the controller).
- Placeholders (all `TODO(client)`): dealer programme off; dealer prices from ₹2,000 at regular prices; 20% off; tiers Silver ₹0 1x, Gold ₹5,000 1.25x, Platinum ₹15,000 1.5x, Premium ₹30,000 2x.
- Real content only: no invented claims, review times, stats or ratings in any copy.
- UI: keep the current product-dense design and reuse `docs/ui-system.md` tokens and components. Accessibility floor: 4.5:1 contrast in light and dark, visible focus, labelled inputs, keyboard reachable, `prefers-reduced-motion` respected, 44px tap targets on phone, no sideways scroll at 390px.
- New UI is split into a pure `…View` component (props only, no Firestore) and a thin container, like `src/components/scratch/ScratchCardsPanel.tsx`, so screens can be checked with fixture data.
- Verification per task: `npm test` and `npm run build` pass. Type check: copy `tsconfig.app.json` with `"ignoreDeprecations": "5.0"` to a temp file, run `npx tsc -p <copy> --noEmit`, delete the copy; only the baseline errors may remain (`videoCallService` 6, `DeliveryDashboard` 1). `npx eslint <touched files>` adds no new errors.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/rewards.ts` (modify) | `rewards-core`: tiers in settings, `tierIndexForSpend`, `tierSpend`, multiplier in `pointsForBase` |
| `src/lib/dealer.ts` (new) | `dealer-core`: settings, pricing, `dealerUnitPrice`, `dealerQuote` |
| `src/lib/dealerForm.ts` (new) | Business types, GSTIN/phone patterns, `validateDealerApplication` (client-only, pure) |
| `src/lib/loyaltyCard.ts` (new) | `memberDigits`, `formatMemberNumber` |
| `scripts/sync-rewards-core.mjs`, `tests/rewards-parity.test.ts` (modify) | Sync and parity for `dealer-core` |
| `api/create-order.ts` (modify) | uid before pricing, dealer read, dealer quote, refusals, notes |
| `api/verify-payment.ts`, `api/notify-order.ts` (modify) | Payment record `dealer`/`regularSubtotal`; tier multiplier on earn; no scratch card for dealer orders |
| `tests/helpers/fakeFirestore.ts` (modify) | `where(field, '==', value).get()` |
| `firestore.rules` (modify) | `dealers/{uid}`, `dealerPricing/{docId}` |
| `src/services/dealerService.ts` (new) | Firestore reads/writes for applications, settings, pricing, product prices, admin review |
| `src/hooks/useDealer.ts` (new) | Session store: dealer settings, own application, pricing; `useDealerUnit`, `useDealerQuote` |
| `src/hooks/useLoyaltyStatus.ts` (new) | Tier spend, tier, settings for a uid |
| `src/components/loyalty/*` (new) | Member card, tier steps, tier chip |
| `src/pages/DealerProgramme.tsx`, `src/components/dealer/*` (new) | `/dealer` page and its views |
| `src/components/dealer/DealerPrice.tsx` (new) | Shared dealer price display (inline and block) |
| `src/pages/admin/AdminDealers.tsx` (new), `src/components/admin/DealerSettingsTab.tsx` (new), `src/components/admin/LoyaltyTiersSection.tsx` (new) | Admin screens |
| Existing screens (modify) | `PurchaseSummary`, `Account`, `ProductCard`, `CategoryPage`, `ProductDetail`, `MobileSearch`, `Wishlist`, `ShoppingCart`, `Checkout`, `razorpayService`, `invoiceService`, `AdminLayout`, `AdminCommerceSettings`, `ProductForm`, `AdminCustomerDetails`, `AdminOrderDetails`, `App.tsx`, `brand.ts` |

---

### Task 1: Tiers and the points multiplier in `rewards-core`

**Files:**
- Modify: `src/lib/rewards.ts` (inside `// >>> rewards-core` … `// <<< rewards-core`, plus the export lists)
- Create: `tests/loyaltyTiers.test.ts`
- Sync: `api/create-order.ts`, `api/notify-order.ts` (via `npm run sync:rewards`)

**Interfaces:**
- Produces: `LoyaltyTier { name: string; minSpend: number; multiplier: number }`, `TierSpendRow { id: string; amountPaise: number; dealer?: boolean; orderStatus: string }`, `DEFAULT_TIERS`, `RewardSettings.tiers: LoyaltyTier[]` (always 4, sorted by `minSpend`, first `minSpend` 0), `tierIndexForSpend(spend: number, tiers: LoyaltyTier[]): number`, `tierSpend(rows: TierSpendRow[], excludeId?: string): number` (rupees, 2 dp), `pointsForBase(base: number, s: RewardSettings, multiplier = 1): number`.

- [ ] **Step 1: Write the failing test** `tests/loyaltyTiers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REWARD_SETTINGS,
  DEFAULT_TIERS,
  normaliseRewardSettings,
  pointsForBase,
  tierIndexForSpend,
  tierSpend,
} from '../src/lib/rewards.ts';

test('default tiers are the placeholders', () => {
  assert.deepEqual(DEFAULT_TIERS, [
    { name: 'Silver', minSpend: 0, multiplier: 1 },
    { name: 'Gold', minSpend: 5000, multiplier: 1.25 },
    { name: 'Platinum', minSpend: 15000, multiplier: 1.5 },
    { name: 'Premium', minSpend: 30000, multiplier: 2 },
  ]);
  assert.deepEqual(DEFAULT_REWARD_SETTINGS.tiers, DEFAULT_TIERS);
  assert.deepEqual(normaliseRewardSettings(null).tiers, DEFAULT_TIERS);
});

test('tiers are normalised: always 4, first starts at 0, clamped, sorted', () => {
  const s = normaliseRewardSettings({
    tiers: [
      { name: '  Bronze ', minSpend: 999, multiplier: 0.5 },
      { name: '', minSpend: 40000, multiplier: 9 },
      { name: 'Mid', minSpend: '12000' as unknown as number, multiplier: 1.333 },
    ],
  } as never);
  assert.equal(s.tiers.length, 4);
  assert.deepEqual(s.tiers[0], { name: 'Bronze', minSpend: 0, multiplier: 1 });
  assert.deepEqual(s.tiers.map((t) => t.minSpend), [0, 12000, 30000, 40000]);
  assert.deepEqual(s.tiers.map((t) => t.name), ['Bronze', 'Mid', 'Premium', 'Gold']);
  assert.equal(s.tiers.find((t) => t.name === 'Gold')!.multiplier, 5);
  assert.equal(s.tiers.find((t) => t.name === 'Mid')!.multiplier, 1.33);
});

test('tierIndexForSpend picks the highest tier reached', () => {
  const t = DEFAULT_TIERS;
  assert.equal(tierIndexForSpend(0, t), 0);
  assert.equal(tierIndexForSpend(4999.99, t), 0);
  assert.equal(tierIndexForSpend(5000, t), 1);
  assert.equal(tierIndexForSpend(29999, t), 2);
  assert.equal(tierIndexForSpend(1e9, t), 3);
});

test('tierSpend counts delivered, non-dealer payments only, and can leave one out', () => {
  const rows = [
    { id: 'a', amountPaise: 150000, orderStatus: 'delivered' },
    { id: 'b', amountPaise: 99999, orderStatus: 'delivered' },
    { id: 'c', amountPaise: 500000, orderStatus: 'returned' },
    { id: 'd', amountPaise: 700000, orderStatus: 'delivered', dealer: true },
    { id: 'e', amountPaise: 20000, orderStatus: 'shipped' },
  ];
  assert.equal(tierSpend(rows), 2499.99);
  assert.equal(tierSpend(rows, 'a'), 999.99);
  assert.equal(tierSpend([]), 0);
});

test('pointsForBase applies the multiplier exactly', () => {
  const s = normaliseRewardSettings({ pointsPer100: 15 });
  assert.equal(pointsForBase(820, s), 123);
  assert.equal(pointsForBase(820, s, 1), 123);
  const one = normaliseRewardSettings({ pointsPer100: 1 });
  assert.equal(pointsForBase(1650, one, 1.25), 20);
  assert.equal(pointsForBase(1000, one, 1.1), 11);
  assert.equal(pointsForBase(60, one, 2), 1);
  assert.equal(pointsForBase(1000, one, 0.2), 10, 'multiplier never below 1');
  assert.equal(pointsForBase(0, one, 2), 0);
  assert.equal(pointsForBase(1000, normaliseRewardSettings({ enabled: false }), 2), 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/loyaltyTiers.test.ts`
Expected: FAIL (`DEFAULT_TIERS` is not exported).

- [ ] **Step 3: Implement.** In `src/lib/rewards.ts`, inside the `rewards-core` block:

Add after `type RewardKind …`:

```ts
interface LoyaltyTier {
  name: string;
  /** Rupees paid online on delivered orders from which the tier starts. */
  minSpend: number;
  /** Points multiplier for orders delivered while the customer is in this tier. */
  multiplier: number;
}
```

Add `tiers: LoyaltyTier[];` as the last field of `RewardSettings`, with the comment `/** Exactly 4, sorted by minSpend; the first starts at ₹0. */`.

Replace `DEFAULT_REWARD_SETTINGS` with:

```ts
// TODO(client): tier names, thresholds and multipliers.
const DEFAULT_TIERS: LoyaltyTier[] = [
  { name: 'Silver', minSpend: 0, multiplier: 1 },
  { name: 'Gold', minSpend: 5000, multiplier: 1.25 },
  { name: 'Platinum', minSpend: 15000, multiplier: 1.5 },
  { name: 'Premium', minSpend: 30000, multiplier: 2 },
];

// TODO(client): placeholders until Ishaputra confirms its rules.
const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  enabled: true,
  pointsPer100: 1,
  pointValue: 1,
  unlockDays: 7,
  maxPointsPercent: 20,
  tiers: DEFAULT_TIERS,
};
```

Add before `normaliseRewardSettings`:

```ts
/** Four tiers: missing or bad values fall back to the defaults, the first starts at ₹0, sorted by minSpend. */
function normaliseTiers(raw: unknown): LoyaltyTier[] {
  const rows = Array.isArray(raw) ? raw : [];
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const tiers = DEFAULT_TIERS.map((d, i) => {
    const r = (rows[i] && typeof rows[i] === 'object' ? rows[i] : {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 24) : d.name;
    const min = num(r.minSpend);
    const minSpend = i === 0 ? 0 : Number.isFinite(min) ? Math.round(Math.min(10_000_000, Math.max(0, min))) : d.minSpend;
    const m = num(r.multiplier);
    const multiplier = Number.isFinite(m) ? Math.round(Math.min(5, Math.max(1, m)) * 100) / 100 : d.multiplier;
    return { name, minSpend, multiplier };
  });
  return tiers.sort((a, b) => a.minSpend - b.minSpend);
}
```

In `normaliseRewardSettings`'s returned object add `tiers: normaliseTiers((raw as { tiers?: unknown } | null | undefined)?.tiers),`.

Replace `pointsForBase` with:

```ts
/** Points earned on a base from earnBase, times the customer's tier multiplier (1 to 5, in hundredths). */
function pointsForBase(base: number, s: RewardSettings, multiplier = 1): number {
  if (!s.enabled || !(base > 0)) return 0;
  const hundredths = Math.round(Math.min(5, Math.max(1, Number(multiplier) || 1)) * 100);
  // Multiply before dividing, with a hair of tolerance: ₹820 at 15 per ₹100 is 123, not 122.
  return Math.max(0, Math.floor((base * s.pointsPer100 * hundredths) / 10_000 + 1e-9));
}
```

Add after `pointsForBase`:

```ts
/** The customer's tier: the highest one whose minSpend they have reached. */
function tierIndexForSpend(spend: number, tiers: LoyaltyTier[]): number {
  let index = 0;
  for (let i = 0; i < tiers.length; i++) if (spend >= tiers[i].minSpend) index = i;
  return index;
}

interface TierSpendRow {
  /** The Razorpay order id (payments/<id>, orders/<id>). */
  id: string;
  amountPaise: number;
  /** A dealer-priced order (payments/<id>.dealer). */
  dealer?: boolean;
  /** orders/<id>.status now. */
  orderStatus: string;
}

/**
 * What tiers count: rupees paid online for delivered orders that were not
 * dealer-priced, from the server's payment records (never order.total, which
 * the browser writes). A returned or cancelled order drops out with its
 * status. excludeId leaves out the order being earned on.
 */
function tierSpend(rows: TierSpendRow[], excludeId = ''): number {
  let paise = 0;
  for (const r of rows) {
    if (r.id === excludeId || r.dealer === true || r.orderStatus !== 'delivered') continue;
    const p = Number(r.amountPaise);
    if (Number.isFinite(p) && p > 0) paise += Math.round(p);
  }
  return paise / 100;
}
```

Add `LoyaltyTier` and `TierSpendRow` to the `export type { … }` list, and `DEFAULT_TIERS`, `tierIndexForSpend`, `tierSpend` to the `export { … }` list.

- [ ] **Step 4: Sync the copies and run all tests**

Run: `npm run sync:rewards` then `npm test`
Expected: `api/create-order.ts (rewards-core): updated`, `api/notify-order.ts (rewards-core): updated`; all tests pass (the old `pointsForBase` tests keep passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rewards.ts api/create-order.ts api/notify-order.ts tests/loyaltyTiers.test.ts
git commit -m "rewards-core: loyalty tiers with a points multiplier, tier spend from payments"
```

---

### Task 2: `dealer-core`

**Files:**
- Create: `src/lib/dealer.ts`, `tests/dealer.test.ts`
- Modify: `scripts/sync-rewards-core.mjs` (BLOCKS), `tests/rewards-parity.test.ts`, `api/create-order.ts` (empty marker block, then sync)

**Interfaces:**
- Produces (exported from `src/lib/dealer.ts`, and present in `api/create-order.ts` after sync): `DealerSettings { enabled: boolean; minOrder: number }`, `DealerPricing { discountPercent: number; productPrices: Record<string, number> }`, `DealerLine { productId: string; unit: number; quantity: number }`, `DealerQuote { applies; regularSubtotal; dealerSubtotal; subtotal; savings; shortBy; units: number[] }`, `DEFAULT_DEALER_SETTINGS`, `DEFAULT_DEALER_PRICING`, `normaliseDealerSettings(raw)`, `normaliseDealerPricing(raw)`, `dealerUnitPrice(productId, regularUnit, pricing)`, `dealerQuote(lines, settings, pricing | null, approved)`.

- [ ] **Step 1: Write the failing test** `tests/dealer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DEALER_PRICING,
  DEFAULT_DEALER_SETTINGS,
  dealerQuote,
  dealerUnitPrice,
  normaliseDealerPricing,
  normaliseDealerSettings,
} from '../src/lib/dealer.ts';

const ON = { enabled: true, minOrder: 2000 };
const P = normaliseDealerPricing({ discountPercent: 20, productPrices: { shilajit: 810 } });

test('defaults are the placeholders', () => {
  assert.deepEqual(DEFAULT_DEALER_SETTINGS, { enabled: false, minOrder: 2000 });
  assert.deepEqual(DEFAULT_DEALER_PRICING, { discountPercent: 20, productPrices: {} });
  assert.deepEqual(normaliseDealerSettings(null), { enabled: false, minOrder: 2000 });
  assert.deepEqual(normaliseDealerPricing(undefined), { discountPercent: 20, productPrices: {} });
});

test('normalise clamps and drops bad product prices', () => {
  assert.deepEqual(normaliseDealerSettings({ enabled: 'yes' as never, minOrder: -5 }), { enabled: false, minOrder: 0 });
  assert.equal(normaliseDealerSettings({ minOrder: '1500.6' as never }).minOrder, 1501);
  const p = normaliseDealerPricing({ discountPercent: 95, productPrices: { a: 100.555, b: 0, c: -1, d: 'x' as never } });
  assert.equal(p.discountPercent, 90);
  assert.deepEqual(p.productPrices, { a: 100.56 });
});

test('unit price: fixed price wins, capped at regular; else percent in whole rupees', () => {
  assert.equal(dealerUnitPrice('ashwa', 800, P), 640);
  assert.equal(dealerUnitPrice('ashwa', 799, P), 639);
  assert.equal(dealerUnitPrice('shilajit', 1150, P), 810);
  assert.equal(dealerUnitPrice('shilajit', 700, P), 700, 'a later sale never makes the dealer price higher');
  assert.equal(dealerUnitPrice('x', 1, P), 1);
  assert.equal(dealerUnitPrice('x', 0.5, P), 0.5);
  assert.equal(dealerUnitPrice('x', 0, P), 0);
  assert.equal(dealerUnitPrice('x', 800, normaliseDealerPricing({ discountPercent: 0 })), 800);
});

test('quote: not a dealer, or programme off, is regular prices', () => {
  const lines = [{ productId: 'ashwa', unit: 800, quantity: 3 }];
  for (const q of [dealerQuote(lines, ON, P, false), dealerQuote(lines, { ...ON, enabled: false }, P, true), dealerQuote(lines, ON, null, true)]) {
    assert.deepEqual(q, { applies: false, regularSubtotal: 2400, dealerSubtotal: 2400, subtotal: 2400, savings: 0, shortBy: 0, units: [800] });
  }
});

test('quote: at or above the threshold at regular prices, dealer prices apply', () => {
  const q = dealerQuote([{ productId: 'ashwa', unit: 800, quantity: 2 }, { productId: 'oil', unit: 400, quantity: 1 }], ON, P, true);
  assert.deepEqual(q, { applies: true, regularSubtotal: 2000, dealerSubtotal: 1600, subtotal: 1600, savings: 400, shortBy: 0, units: [640, 320] });
});

test('quote: below the threshold, regular prices and how much more is needed', () => {
  const q = dealerQuote([{ productId: 'shilajit', unit: 1150, quantity: 1 }, { productId: 'oil', unit: 400, quantity: 1 }], ON, P, true);
  assert.equal(q.applies, false);
  assert.equal(q.subtotal, 1550);
  assert.equal(q.dealerSubtotal, 1130);
  assert.equal(q.shortBy, 450);
  assert.deepEqual(q.units, [1150, 400]);
});

test('quote: no saving means no dealer pricing', () => {
  const q = dealerQuote([{ productId: 'x', unit: 2500, quantity: 1 }], ON, normaliseDealerPricing({ discountPercent: 0 }), true);
  assert.equal(q.applies, false);
  assert.equal(q.subtotal, 2500);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/dealer.test.ts`
Expected: FAIL (cannot find `src/lib/dealer.ts`).

- [ ] **Step 3: Implement** `src/lib/dealer.ts`:

```ts
/**
 * Dealer prices, shared by the storefront and api/create-order.ts. Pure and
 * dependency-free.
 *
 * The block between the dealer-core markers is copied verbatim into
 * api/create-order.ts (npm run sync:rewards). tests/rewards-parity.test.ts
 * fails if the copy drifts.
 */

// >>> dealer-core
interface DealerSettings {
  /** The programme switch. Off: no dealer prices, and /dealer is hidden from customers with no application. */
  enabled: boolean;
  /** Dealer prices apply when the cart is worth at least this much at regular prices (rupees). */
  minOrder: number;
}

interface DealerPricing {
  /** Store-wide discount off the regular price, in percent. */
  discountPercent: number;
  /** Fixed dealer unit prices by product id (rupees). A product without one uses the percent. */
  productPrices: Record<string, number>;
}

// TODO(client): placeholders until Ishaputra confirms its dealer terms.
const DEFAULT_DEALER_SETTINGS: DealerSettings = { enabled: false, minOrder: 2000 };
const DEFAULT_DEALER_PRICING: DealerPricing = { discountPercent: 20, productPrices: {} };

interface DealerLine {
  productId: string;
  /** Regular unit price, rupees. */
  unit: number;
  quantity: number;
}

interface DealerQuote {
  /** True when this cart is charged dealer prices. */
  applies: boolean;
  regularSubtotal: number;
  /** The cart at dealer prices (the regular subtotal for a customer who is not a dealer). */
  dealerSubtotal: number;
  /** What the products are charged: dealerSubtotal when applies, otherwise regularSubtotal. */
  subtotal: number;
  /** regularSubtotal - subtotal. */
  savings: number;
  /** Rupees more, at regular prices, before dealer prices apply. 0 once met, and for non-dealers. */
  shortBy: number;
  /** The charged unit price of each line, in line order. */
  units: number[];
}

const dealerMoney = (n: number) => Math.round(n * 100) / 100;

function dealerNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normaliseDealerSettings(raw: Partial<DealerSettings> | null | undefined): DealerSettings {
  return {
    enabled: raw?.enabled === true,
    minOrder: Math.round(dealerNum(raw?.minOrder, DEFAULT_DEALER_SETTINGS.minOrder, 0, 10_000_000)),
  };
}

function normaliseDealerPricing(raw: Partial<DealerPricing> | null | undefined): DealerPricing {
  const productPrices: Record<string, number> = {};
  const source = raw?.productPrices && typeof raw.productPrices === 'object' ? raw.productPrices : {};
  for (const [id, v] of Object.entries(source)) {
    if (id && typeof v === 'number' && Number.isFinite(v) && v > 0) productPrices[id] = dealerMoney(v);
  }
  const percent = dealerNum(raw?.discountPercent, DEFAULT_DEALER_PRICING.discountPercent, 0, 90);
  return { discountPercent: Math.round(percent * 100) / 100, productPrices };
}

/**
 * One product's dealer unit price. A fixed dealer price wins, capped at the
 * regular price (a later sale never makes it dearer than the regular price).
 * Otherwise the store-wide percent off, in whole rupees, never above the
 * regular price and never below ₹1 unless the regular price is.
 */
function dealerUnitPrice(productId: string, regularUnit: number, p: DealerPricing): number {
  const regular = Number(regularUnit);
  if (!(regular > 0)) return Math.max(0, regular || 0);
  const fixed = p.productPrices[productId];
  if (typeof fixed === 'number' && fixed > 0) return Math.min(regular, dealerMoney(fixed));
  const off = Math.round((regular * (100 - p.discountPercent)) / 100);
  return Math.min(regular, Math.max(Math.min(1, regular), off));
}

/**
 * A cart priced for this customer. Dealer prices apply only to an approved
 * dealer, while the programme is on, when the cart is worth at least minOrder
 * at regular prices and the dealer total is lower.
 */
function dealerQuote(
  lines: DealerLine[],
  s: DealerSettings,
  p: DealerPricing | null,
  approved: boolean,
): DealerQuote {
  let regular = 0;
  for (const l of lines) regular += l.unit * l.quantity;
  regular = dealerMoney(regular);
  const regularUnits = lines.map((l) => l.unit);
  if (!approved || !s.enabled || !p) {
    return { applies: false, regularSubtotal: regular, dealerSubtotal: regular, subtotal: regular, savings: 0, shortBy: 0, units: regularUnits };
  }
  const units = lines.map((l) => dealerUnitPrice(l.productId, l.unit, p));
  let dealer = 0;
  for (let i = 0; i < lines.length; i++) dealer += units[i] * lines[i].quantity;
  dealer = dealerMoney(dealer);
  const met = regular >= s.minOrder;
  const applies = met && dealer < regular;
  return {
    applies,
    regularSubtotal: regular,
    dealerSubtotal: dealer,
    subtotal: applies ? dealer : regular,
    savings: applies ? dealerMoney(regular - dealer) : 0,
    shortBy: met ? 0 : dealerMoney(s.minOrder - regular),
    units: applies ? units : regularUnits,
  };
}
// <<< dealer-core

export type { DealerSettings, DealerPricing, DealerLine, DealerQuote };
export {
  DEFAULT_DEALER_SETTINGS,
  DEFAULT_DEALER_PRICING,
  normaliseDealerSettings,
  normaliseDealerPricing,
  dealerUnitPrice,
  dealerQuote,
};
```

- [ ] **Step 4: Run the unit test**

Run: `node --test tests/dealer.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the copy and the parity check.**

In `scripts/sync-rewards-core.mjs` add to `BLOCKS`:
`{ name: 'dealer-core', source: 'src/lib/dealer.ts', copies: ['api/create-order.ts'] },`
and add the line `//   dealer-core   src/lib/dealer.ts     -> api/create-order.ts` to the header comment.

In `api/create-order.ts`, directly after the line `// <<< rewards-core`, insert an empty line and then:

```ts
// >>> dealer-core
// <<< dealer-core
```

Append to `tests/rewards-parity.test.ts`:

```ts
test('api copy of dealer-core matches src/lib/dealer.ts', () => {
  assert.equal(
    marked('api/create-order.ts', 'dealer-core'),
    marked('src/lib/dealer.ts', 'dealer-core'),
    'api/create-order.ts has drifted from src/lib/dealer.ts',
  );
});
```

Run: `npm run sync:rewards` then `npm test`
Expected: `api/create-order.ts (dealer-core): updated`; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dealer.ts tests/dealer.test.ts scripts/sync-rewards-core.mjs tests/rewards-parity.test.ts api/create-order.ts
git commit -m "dealer-core: dealer unit price and cart quote, shared with create-order"
```

---

### Task 3: Member number and application form rules (pure)

**Files:**
- Create: `src/lib/loyaltyCard.ts`, `src/lib/dealerForm.ts`, `tests/loyaltyCard.test.ts`, `tests/dealerForm.test.ts`
- Modify: `src/config/brand.ts` (add `memberPrefix`, remove `loyaltyTiers` in Task 8, not here)

**Interfaces:**
- Produces: `memberDigits(uid: string): string` (12 digits), `formatMemberNumber(digits: string, prefix: string): string` (`'IB 2005 5564 1996'`); `BUSINESS_TYPES: readonly { value: BusinessType; label: string }[]`, `BusinessType`, `DealerApplicationInput { businessName; businessType; contactName; phone; city; state; gstin; message }` (all strings), `GSTIN_PATTERN`, `PHONE_PATTERN`, `cleanDealerApplication(input): DealerApplicationInput` (trims; upper-cases and strips spaces from GSTIN), `validateDealerApplication(input): Partial<Record<keyof DealerApplicationInput, string>>` (empty object when valid); `BRAND.memberPrefix = 'IB'`.

- [ ] **Step 1: Write the failing tests.**

`tests/loyaltyCard.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMemberNumber, memberDigits } from '../src/lib/loyaltyCard.ts';

test('member digits are 64-bit FNV-1a of the uid, mod 10^12, zero-padded', () => {
  assert.equal(memberDigits('a'), '200555641996');
  assert.equal(memberDigits('cust1'), '315597000457');
  assert.match(memberDigits('X9fQ2LkP0aBcDeFgHiJk'), /^\d{12}$/);
  assert.equal(memberDigits('same-uid'), memberDigits('same-uid'));
  assert.notEqual(memberDigits('uid-1'), memberDigits('uid-2'));
});

test('member number format', () => {
  assert.equal(formatMemberNumber('200555641996', 'IB'), 'IB 2005 5564 1996');
  assert.equal(formatMemberNumber('200555641996', ''), '2005 5564 1996');
});
```

`tests/dealerForm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDealerApplication, validateDealerApplication } from '../src/lib/dealerForm.ts';

const ok = {
  businessName: 'Rao Wellness Store',
  businessType: 'ayurvedic',
  contactName: 'Ananya Rao',
  phone: '98765 43210',
  city: 'Mysuru',
  state: 'Karnataka',
  gstin: '29abcde1234f1z5',
  message: '',
};

test('a complete application is valid after cleaning', () => {
  const c = cleanDealerApplication({ ...ok, businessName: '  Rao Wellness Store ', gstin: ' 29abcde1234f1z5 ' });
  assert.equal(c.businessName, 'Rao Wellness Store');
  assert.equal(c.gstin, '29ABCDE1234F1Z5');
  assert.deepEqual(validateDealerApplication(c), {});
  assert.deepEqual(validateDealerApplication(cleanDealerApplication({ ...ok, gstin: '' })), {});
});

test('each field is checked', () => {
  const e = validateDealerApplication(
    cleanDealerApplication({ businessName: 'A', businessType: 'shop', contactName: '', phone: '12345', city: '', state: '', gstin: '29ABCDE1234F1X5', message: 'x'.repeat(501) }),
  );
  assert.deepEqual(Object.keys(e).sort(), ['businessName', 'businessType', 'city', 'contactName', 'gstin', 'message', 'phone', 'state']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/loyaltyCard.test.ts tests/dealerForm.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.**

`src/lib/loyaltyCard.ts`:

```ts
/**
 * The loyalty card's member number: 12 digits derived from the account id
 * (64-bit FNV-1a of the uid, mod 10^12). Nothing is stored and the customer
 * cannot change it. Two accounts sharing a number is possible in theory and
 * harmless: it is a support reference, not a key.
 */
const FNV_OFFSET = BigInt('0xcbf29ce484222325');
const FNV_PRIME = BigInt('0x100000001b3');
const MASK_64 = BigInt('0xffffffffffffffff');
const MOD_12 = BigInt('1000000000000');

export function memberDigits(uid: string): string {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(uid)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK_64;
  }
  return (h % MOD_12).toString().padStart(12, '0');
}

/** "IB 2005 5564 1996" (the prefix is BRAND.memberPrefix). */
export function formatMemberNumber(digits: string, prefix: string): string {
  return [prefix, digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12)].filter(Boolean).join(' ');
}
```

`src/lib/dealerForm.ts`:

```ts
/**
 * The dealer application form: business types, field rules and cleaning.
 * firestore.rules (match /dealers/{uid}) enforces the same limits.
 */
export const BUSINESS_TYPES = [
  { value: 'retail', label: 'Retail store' },
  { value: 'ayurvedic', label: 'Ayurvedic or medical store' },
  { value: 'salon', label: 'Salon or spa' },
  { value: 'gym', label: 'Gym or fitness centre' },
  { value: 'online', label: 'Online seller' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'other', label: 'Other' },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value'];

export interface DealerApplicationInput {
  businessName: string;
  businessType: string;
  contactName: string;
  phone: string;
  city: string;
  state: string;
  /** '' or a 15-character GSTIN. */
  gstin: string;
  message: string;
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PHONE_PATTERN = /^\+?[0-9 ]{10,15}$/;

export const businessTypeLabel = (value: string) =>
  BUSINESS_TYPES.find((t) => t.value === value)?.label ?? 'Other';

export function cleanDealerApplication(input: Partial<Record<keyof DealerApplicationInput, unknown>>): DealerApplicationInput {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    businessName: s(input.businessName),
    businessType: s(input.businessType),
    contactName: s(input.contactName),
    phone: s(input.phone).replace(/\s+/g, ' '),
    city: s(input.city),
    state: s(input.state),
    gstin: s(input.gstin).replace(/\s+/g, '').toUpperCase(),
    message: s(input.message),
  };
}

/** Field → message for every problem; an empty object means the application can be sent. */
export function validateDealerApplication(a: DealerApplicationInput): Partial<Record<keyof DealerApplicationInput, string>> {
  const e: Partial<Record<keyof DealerApplicationInput, string>> = {};
  const len = (v: string, min: number, max: number) => v.length >= min && v.length <= max;
  if (!len(a.businessName, 2, 80)) e.businessName = 'Enter your business name (2 to 80 characters).';
  if (!BUSINESS_TYPES.some((t) => t.value === a.businessType)) e.businessType = 'Choose a business type.';
  if (!len(a.contactName, 2, 60)) e.contactName = 'Enter your name.';
  if (!PHONE_PATTERN.test(a.phone)) e.phone = 'Enter a 10-digit phone number.';
  if (!len(a.city, 2, 60)) e.city = 'Enter your city.';
  if (!len(a.state, 2, 40)) e.state = 'Choose your state.';
  if (a.gstin !== '' && !GSTIN_PATTERN.test(a.gstin)) e.gstin = 'Check the GSTIN: it has 15 characters, like 29ABCDE1234F1Z5.';
  if (a.message.length > 500) e.message = 'Keep the message under 500 characters.';
  return e;
}
```

In `src/config/brand.ts` add, directly above `loyaltyTiers`:

```ts
  /** Prefix of the loyalty card's member number ("IB 2005 5564 1996"). */
  memberPrefix: 'IB',
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loyaltyCard.ts src/lib/dealerForm.ts tests/loyaltyCard.test.ts tests/dealerForm.test.ts src/config/brand.ts
git commit -m "Member number and dealer application rules (pure, tested)"
```

---

### Task 4: Dealer pricing in `api/create-order.ts`

**Files:**
- Modify: `api/create-order.ts` (body type ~:639-654, settings fetch ~:695, line loop ~:704-739, coupon ~:742, uid check ~:822-833, notes ~:871-893; header doc comment)
- Create: `tests/create-order-dealer.test.ts`

**Interfaces:**
- Consumes: `dealerQuote`, `normaliseDealerSettings`, `normaliseDealerPricing`, `DealerQuote`, `DealerSettings`, `DealerPricing` (Task 2, already in the file's `dealer-core` copy).
- Produces (exported for tests): `dealerCheck(quote: DealerQuote, body: { pricing?: unknown; couponCode?: unknown; usePoints?: unknown; useCashback?: unknown }): { status: number; body: Record<string, unknown> } | null`. HTTP contract for the browser (Task 11): request field `pricing?: 'dealer' | 'retail'`; errors `409 { code: 'dealer_pricing_changed', pricing, error }`, `400 { code: 'dealer_no_extras', error }`, `503 { code: 'dealer_unavailable', error }`. Notes `rw_dealer: '1'`, `rw_regular: '<regular subtotal>'`, `rw_base: '0'` on dealer-priced orders.

- [ ] **Step 1: Write the failing test** `tests/create-order-dealer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealerCheck } from '../api/create-order.ts';
import { dealerQuote, normaliseDealerPricing } from '../src/lib/dealer.ts';

const ON = { enabled: true, minOrder: 2000 };
const P = normaliseDealerPricing({ discountPercent: 20 });
const big = dealerQuote([{ productId: 'a', unit: 800, quantity: 3 }], ON, P, true);
const small = dealerQuote([{ productId: 'a', unit: 800, quantity: 1 }], ON, P, true);

test('a matching dealer checkout goes on', () => {
  assert.equal(big.applies, true);
  assert.equal(dealerCheck(big, { pricing: 'dealer' }), null);
  assert.equal(dealerCheck(small, { pricing: 'retail', couponCode: 'SAVE10', usePoints: true }), null);
  assert.equal(dealerCheck(big, {}), null, 'an older page without pricing is left to the amount check');
});

test('pricing the browser did not expect is a 409 with the server pricing', () => {
  const r = dealerCheck(big, { pricing: 'retail' });
  assert.equal(r?.status, 409);
  assert.equal(r?.body.code, 'dealer_pricing_changed');
  assert.equal(r?.body.pricing, 'dealer');
  assert.equal(dealerCheck(small, { pricing: 'dealer' })?.body.pricing, 'retail');
});

test('coupons, points and cashback are refused on dealer prices', () => {
  for (const extra of [{ couponCode: 'SAVE10' }, { usePoints: true }, { useCashback: true }]) {
    const r = dealerCheck(big, { pricing: 'dealer', ...extra });
    assert.equal(r?.status, 400);
    assert.equal(r?.body.code, 'dealer_no_extras');
  }
  assert.equal(dealerCheck(big, { pricing: 'dealer', couponCode: '   ' }), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/create-order-dealer.test.ts`
Expected: FAIL (`dealerCheck` is not exported).

- [ ] **Step 3: Add `dealerCheck` and the dealer loader** after the `customerUid` function:

```ts
/**
 * What the dealer step decides for a priced cart: an error reply, or null to
 * go on. The browser says how it priced the cart (pricing); when the server
 * disagrees the customer must see the new total before paying. Dealer prices
 * take no coupon, points or cashback. Exported for tests.
 */
export function dealerCheck(
  quote: DealerQuote,
  body: { pricing?: unknown; couponCode?: unknown; usePoints?: unknown; useCashback?: unknown },
): { status: number; body: Record<string, unknown> } | null {
  const server = quote.applies ? 'dealer' : 'retail';
  if ((body.pricing === 'dealer' || body.pricing === 'retail') && body.pricing !== server) {
    return {
      status: 409,
      body: {
        code: 'dealer_pricing_changed',
        pricing: server,
        error:
          server === 'dealer'
            ? 'Dealer prices now apply to this order. Check the new total and pay again.'
            : 'Dealer prices no longer apply to this order. Check the new total and pay again.',
      },
    };
  }
  if (quote.applies) {
    const coupon = typeof body.couponCode === 'string' && body.couponCode.trim() !== '';
    if (coupon || body.usePoints === true || body.useCashback === true) {
      return {
        status: 400,
        body: { code: 'dealer_no_extras', error: "Coupons, points and cashback don't apply to dealer-priced orders." },
      };
    }
  }
  return null;
}

/**
 * Whether the customer is an approved dealer, and the private dealer prices.
 * Read with the Admin SDK: dealers/<uid> and dealerPricing/current are not
 * public. Throws when they cannot be read.
 */
async function loadDealer(
  uid: string | null,
  settings: DealerSettings,
): Promise<{ approved: boolean; pricing: DealerPricing | null }> {
  if (!uid || !settings.enabled) return { approved: false, pricing: null };
  const { db } = await adminSdk();
  const dealer = await withTimeout(db.collection('dealers').doc(uid).get(), ADMIN_TIMEOUT_MS, 'Dealer check');
  if (dealer.data()?.status !== 'approved') return { approved: false, pricing: null };
  const pricing = await withTimeout(db.collection('dealerPricing').doc('current').get(), ADMIN_TIMEOUT_MS, 'Dealer prices');
  return { approved: true, pricing: normaliseDealerPricing(pricing.exists ? (pricing.data() as Partial<DealerPricing>) : null) };
}

const DEALER_UNAVAILABLE = {
  code: 'dealer_unavailable',
  error: "We couldn't confirm your dealer prices just now. Nothing was charged. Please try again.",
};
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/create-order-dealer.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the handler.**

a) Body type: add after `useCashback?: boolean;`:

```ts
    /** How the browser priced the cart: dealer prices or regular ones. */
    pricing?: unknown;
```

b) Move the customer check before pricing. Directly after the cart-line validation loop (`for (const line of items) { … }`), insert:

```ts
  // ── Who is paying ── (before pricing: an approved dealer pays dealer prices)
  // Sent whenever the customer is signed in. It binds the payment to them
  // (rw_uid), which is what lets an order be recorded as paid and earn points.
  // A failed check is only fatal for rewards and dealer prices: otherwise the
  // customer can still pay, and the order is recorded for a manual check.
  const claimsDealer = body.pricing === 'dealer';
  let uid: string | null = null;
  let uidError: string | null = null;
  try {
    uid = await customerUid(req);
  } catch (error: unknown) {
    uidError = error instanceof Error ? error.message : 'Sign-in check failed';
  }
  if (uidError && claimsDealer) return res.status(503).json({ ...DEALER_UNAVAILABLE, detail: uidError });
```

and replace the old block (from `// ── Who is paying ──` through `if (wantsRewards && !uid) return conflict(…);`) with:

```ts
  if (uidError) {
    if (wantsRewards) return conflict('rewards_unavailable', uidError);
    console.warn('[create-order] could not verify the customer:', uidError);
  }
  if (wantsRewards && !uid) return conflict('rewards_unavailable', 'Sign in again to use your rewards');
```

c) Declare before `try {` (next to `let parts`): `let quote: DealerQuote;`

d) Settings: change the settings fetch to

```ts
    const [deliveryDoc, gstDoc, silverDoc, dealerDoc] = await Promise.all([
      getDoc('siteSettings/delivery'),
      getDoc('siteSettings/gst'),
      getDoc('siteSettings/silverRate'),
      getDoc('siteSettings/dealer'),
    ]);
```

e) Line loop: replace `let subtotal = 0;` with `const lines: DealerLine[] = [];`, and replace `subtotal += unit * Number(items[i].quantity);` with `lines.push({ productId, unit, quantity: Number(items[i].quantity) });`. After the loop insert:

```ts
    // ── Dealer prices (approved dealers, programme on, big enough at regular prices) ──
    let dealer: { approved: boolean; pricing: DealerPricing | null } = { approved: false, pricing: null };
    try {
      dealer = await loadDealer(uid, normaliseDealerSettings(dealerDoc as Partial<DealerSettings> | null));
    } catch (error: unknown) {
      if (claimsDealer) {
        return res.status(503).json({ ...DEALER_UNAVAILABLE, detail: error instanceof Error ? error.message : undefined });
      }
      console.warn('[create-order] dealer check failed, pricing at regular prices:', error instanceof Error ? error.message : error);
    }
    quote = dealerQuote(lines, normaliseDealerSettings(dealerDoc as Partial<DealerSettings> | null), dealer.pricing, dealer.approved);
    const refusal = dealerCheck(quote, body);
    if (refusal) return res.status(refusal.status).json(refusal.body);
    const subtotal = quote.subtotal;
```

(`dealerCheck` already refused a coupon on dealer prices, so the coupon block below runs unchanged.)

f) Notes: change the `base` computation to

```ts
  const base = quote.applies
    ? 0
    : earnBase({
        subtotal: parts.subtotal,
        couponDiscount: parts.discount,
        pointsValue: redemption.pointsValue,
        cashback: redemption.cashback,
        gstEnabled: parts.gst.enabled,
        gstInclusive: parts.gst.inclusive,
        gstRate: parts.gst.rate,
      });
```

and add to the `notes` object, after the `rw_uid` spread:

```ts
    ...(quote.applies ? { rw_dealer: '1', rw_regular: String(quote.regularSubtotal) } : {}),
```

g) In the header doc comment's `rw_*` list add: `rw_dealer` ('1' when the order was charged dealer prices; its points base is then 0) and `rw_regular` (the cart at regular prices).

h) Import nothing new: `DealerLine`, `DealerQuote`, `DealerSettings`, `DealerPricing`, `dealerQuote`, `normaliseDealerSettings`, `normaliseDealerPricing` come from the `dealer-core` block in the same file.

- [ ] **Step 6: Verify**

Run: `npm test` (all pass, parity included), `npm run build`, and the type check from Global Constraints (baseline only).

- [ ] **Step 7: Commit**

```bash
git add api/create-order.ts tests/create-order-dealer.test.ts
git commit -m "create-order: approved dealers are charged dealer prices, checked before payment"
```

---

### Task 5: Payment record, tier multiplier and no dealer scratch cards

**Files:**
- Modify: `api/verify-payment.ts` (payments `tx.set` ~:112-127), `api/notify-order.ts` (`PaymentRecord` ~:498, `writePaymentRecord` ~:508-533, earn ~:670-700, scratch `give` ~:866-877), `tests/helpers/fakeFirestore.ts`
- Create: `tests/dealer-loyalty-server.test.ts`

**Interfaces:**
- Consumes: `tierSpend`, `tierIndexForSpend`, `pointsForBase(base, s, multiplier)`, `RewardSettings.tiers` (Task 1).
- Produces: `payments/<rzp>.dealer: true` and `.regularSubtotal` on dealer orders; `rewardLedger/earn_<rzp>.tierName` and `.multiplier`; `FakeCollection.where(field, '==', value).get()`.

- [ ] **Step 1: Give the fake Firestore equality queries.** In `tests/helpers/fakeFirestore.ts`, add to `FakeCollection`:

```ts
  /** Equality filters only (all the server code uses). */
  where(field: string, op: '==', value: unknown) {
    if (op !== '==') throw new Error(`FakeFirestore supports only == queries, not ${op}`);
    return new FakeQuery(this, [[field, value]]);
  }
```

and add the class before `type Write`:

```ts
class FakeQuery {
  coll: FakeCollection;
  filters: Array<[string, unknown]>;
  constructor(coll: FakeCollection, filters: Array<[string, unknown]>) {
    this.coll = coll;
    this.filters = filters;
  }
  where(field: string, op: '==', value: unknown) {
    if (op !== '==') throw new Error(`FakeFirestore supports only == queries, not ${op}`);
    return new FakeQuery(this.coll, [...this.filters, [field, value]]);
  }
  async get() {
    const all = await this.coll.get();
    const docs = all.docs.filter((d) => this.filters.every(([f, v]) => d.data()?.[f] === v));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}
```

- [ ] **Step 2: Write the failing server test** `tests/dealer-loyalty-server.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { FakeFirestore } from './helpers/fakeFirestore.ts';
import { reconcileRewards } from '../api/notify-order.ts';

const T = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const UID = 'cust1';
const asDb = (db: FakeFirestore) => db as unknown as Parameters<typeof reconcileRewards>[0];

function shop() {
  const db = new FakeFirestore();
  db.applySet('siteSettings/rewards', { enabled: true, pointsPer100: 1, pointValue: 1, unlockDays: 7, maxPointsPercent: 20 }, false);
  db.applySet('siteSettings/scratchWin', { enabled: true, minOrder: 499, expiryDays: 30, prizes: [{ points: 5, weight: 1 }], noWinWeight: 0 }, false);
  return db;
}

/** A paid order with its payment record. */
function order(db: FakeFirestore, rzp: string, rupees: number, status: string, extra: Record<string, unknown> = {}) {
  db.applySet(`payments/${rzp}`, { uid: UID, amountPaise: rupees * 100, base: rupees, points: 0, pointsValue: 0, cashback: 0, ...extra }, false);
  db.applySet(`orders/${rzp}`, { userId: UID, orderId: `ORD-${rzp}`, razorpayOrderId: rzp, status, paymentStatus: 'paid', total: rupees, deliveredAt: T(Date.now()) }, false);
}
const reconcile = (db: FakeFirestore, rzp: string) => reconcileRewards(asDb(db), rzp, db.read(`orders/${rzp}`)!);

test('a Silver customer earns at 1x and the entry records the tier', async () => {
  const db = shop();
  order(db, 'o1', 1650, 'delivered');
  await reconcile(db, 'o1');
  const e = db.read(`users/${UID}/rewardLedger/earn_o1`)!;
  assert.equal(e.amount, 16);
  assert.equal(e.tierName, 'Silver');
  assert.equal(e.multiplier, 1);
});

test('earlier delivered spend sets the multiplier; this order and other statuses do not count', async () => {
  const db = shop();
  order(db, 'p1', 3000, 'delivered');
  order(db, 'p2', 2500, 'delivered');
  order(db, 'p3', 9000, 'returned');
  order(db, 'p4', 9000, 'shipped');
  order(db, 'p5', 9000, 'delivered', { dealer: true, base: 0 });
  order(db, 'o2', 1650, 'delivered');
  await reconcile(db, 'o2');
  const e = db.read(`users/${UID}/rewardLedger/earn_o2`)!;
  assert.equal(e.tierName, 'Gold', 'p1 + p2 = 5,500 reaches Gold');
  assert.equal(e.multiplier, 1.25);
  assert.equal(e.amount, 20);
});

test('a dealer-priced order earns no points and gets no scratch card', async () => {
  const db = shop();
  order(db, 'd1', 2400, 'delivered', { dealer: true, base: 0, regularSubtotal: 3000 });
  const r = await reconcile(db, 'd1');
  assert.equal(db.read(`users/${UID}/rewardLedger/earn_d1`), undefined);
  assert.equal(db.read(`users/${UID}/scratchCards/d1`), undefined);
  assert.ok(!r.changed.some((c) => c.includes('scratchCards')), r.changed.join(' '));
});

test('a retail order still gets its scratch card', async () => {
  const db = shop();
  order(db, 'r1', 600, 'delivered');
  await reconcile(db, 'r1');
  assert.ok(db.read(`users/${UID}/scratchCards/r1`));
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/dealer-loyalty-server.test.ts`
Expected: FAIL (no `tierName` on the earn entry; the dealer order gets a scratch card).

- [ ] **Step 4: Implement in `api/notify-order.ts`.**

a) `PaymentRecord`: add `dealer?: boolean;` and `regularSubtotal?: number;`.

b) `writePaymentRecord`: add to `record`, after `cartHash`:

```ts
    ...(notes.rw_dealer === '1' ? { dealer: true, regularSubtotal: money(notes.rw_regular) } : {}),
```

c) Add before `reconcileRewards`:

```ts
/**
 * The customer's tier spend without this order: rupees paid online for their
 * other delivered orders that were not dealer-priced, from the server's
 * payment records (tierSpend in rewards-core).
 */
async function tierSpendBefore(db: admin.firestore.Firestore, uid: string, rzp: string): Promise<number> {
  const payments = await db.collection('payments').where('uid', '==', uid).get();
  const others = payments.docs.filter((d) => d.id !== rzp);
  if (others.length === 0) return 0;
  const orders = await db.getAll(...others.map((d) => db.collection('orders').doc(d.id)));
  return tierSpend(
    others.map((d, i) => {
      const p = d.data() || {};
      return { id: d.id, amountPaise: Number(p.amountPaise) || 0, dealer: p.dealer === true, orderStatus: String(orders[i].data()?.status || '') };
    }),
    rzp,
  );
}
```

d) Earn: in the `if (reachedCustomer && settings.enabled) {` branch replace

```ts
      const points = pointsForBase(base, settings);
```

with

```ts
      // The tier the customer had reached before this order sets its multiplier.
      const tier = base > 0 ? settings.tiers[tierIndexForSpend(await tierSpendBefore(db, uid, rzp), settings.tiers)] : settings.tiers[0];
      const points = pointsForBase(base, settings, tier.multiplier);
```

and add to the `createOnce(earnRef, { … })` object, after `kind: 'earn',`:

```ts
          tierName: tier.name,
          multiplier: tier.multiplier,
```

e) Scratch: in the transaction that builds `give`, change

```ts
      c || paymentSnap.data()?.scratchCardGivenAt
```

to

```ts
      c || paymentSnap.data()?.scratchCardGivenAt || paymentSnap.data()?.dealer === true
```

and add the comment above it: `// One card per payment ever, and none for dealer-priced orders (no stacking).`

f) Header doc of `reconcileRewards` (the ledger list ~:559): add `tierName/multiplier` to the earn line and note "dealer-priced orders (payments.dealer) earn nothing (base 0) and get no card".

- [ ] **Step 5: `api/verify-payment.ts`.** In the `tx.set(db.collection('payments').doc(razorpayOrderId), { … })` object add, after `cartHash`:

```ts
        ...(notes.rw_dealer === '1' ? { dealer: true, regularSubtotal: money(notes.rw_regular) } : {}),
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all pass, including the existing `scratch-server` tests.

- [ ] **Step 7: Build and type check** as in Global Constraints.

- [ ] **Step 8: Commit**

```bash
git add api/notify-order.ts api/verify-payment.ts tests/helpers/fakeFirestore.ts tests/dealer-loyalty-server.test.ts
git commit -m "Tier multiplier on earned points; dealer orders recorded, earn nothing, get no card"
```

---

### Task 6: Firestore rules for dealers and dealer prices

**Files:**
- Modify: `firestore.rules` (add after the `payments` block, ~:582)

**Interfaces:**
- Produces: the access model every client task relies on (spec "Security rules"). Deployed later by the owner-approved step, not in this task.

- [ ] **Step 1: Add the rules.**

```
    // --- DEALERS (Dealer Membership) ---
    // One application per customer (doc id = uid). The customer creates it as
    // 'pending' with only the application fields, may withdraw it while it is
    // pending, and may re-apply after a rejection. Only an admin approves,
    // rejects, suspends or reinstates. api/create-order.ts reads the status
    // with the Admin SDK before charging dealer prices.
    match /dealers/{uid} {
      function dealerAppKeys() {
        return ['businessName', 'businessType', 'contactName', 'phone', 'city', 'state', 'gstin', 'message'];
      }
      function validDealerApp(d) {
        return d.businessName is string && d.businessName.size() >= 2 && d.businessName.size() <= 80
          && d.businessType in ['retail', 'ayurvedic', 'salon', 'gym', 'online', 'distributor', 'other']
          && d.contactName is string && d.contactName.size() >= 2 && d.contactName.size() <= 60
          && d.phone is string && d.phone.matches('^[+]?[0-9 ]{10,15}$')
          && d.city is string && d.city.size() >= 2 && d.city.size() <= 60
          && d.state is string && d.state.size() >= 2 && d.state.size() <= 40
          && d.gstin is string
          && (d.gstin == '' || d.gstin.matches('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'))
          && d.message is string && d.message.size() <= 500;
      }
      allow get: if isOwner(uid) || isAdmin();
      allow list: if isAdmin();
      allow create: if isOwner(uid)
        && request.resource.data.keys().hasOnly(dealerAppKeys().concat(['uid', 'status', 'appliedAt', 'updatedAt']))
        && request.resource.data.keys().hasAll(dealerAppKeys().concat(['uid', 'status', 'appliedAt']))
        && request.resource.data.uid == uid
        && request.resource.data.status == 'pending'
        && request.resource.data.appliedAt == request.time
        && validDealerApp(request.resource.data);
      allow update: if isAdmin()
        || (isOwner(uid)
          && resource.data.status == 'rejected'
          && request.resource.data.status == 'pending'
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(dealerAppKeys().concat(['status', 'appliedAt', 'updatedAt']))
          && request.resource.data.appliedAt == request.time
          && validDealerApp(request.resource.data));
      allow delete: if isAdmin() || (isOwner(uid) && resource.data.status == 'pending');
    }

    // --- DEALER PRICES (private) ---
    // The store-wide dealer discount and per-product dealer prices. Only admins
    // and approved dealers can read them; only admins write them.
    match /dealerPricing/{docId} {
      allow read: if isAdmin()
        || (isAuthenticated()
          && exists(/databases/$(database)/documents/dealers/$(request.auth.uid))
          && get(/databases/$(database)/documents/dealers/$(request.auth.uid)).data.status == 'approved');
      allow write: if isAdmin();
    }
```

- [ ] **Step 2: Check the syntax.** There is no emulator (no Java). Check by eye that braces balance and every function is defined inside the match it is used in. Then run `node -e "const s=require('fs').readFileSync('firestore.rules','utf8');let d=0;for(const c of s){if(c==='{')d++;if(c==='}')d--;if(d<0)throw new Error('unbalanced')}if(d)throw new Error('unbalanced '+d);console.log('braces ok')"`
Expected: `braces ok`. The live test (owner-approved, later) deploys and exercises these rules.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "rules: dealer applications (admin approves) and private dealer prices (not deployed yet)"
```

---

### Task 7: Client data layer: dealer service, `useDealer`, `useLoyaltyStatus`

**Files:**
- Create: `src/services/dealerService.ts`, `src/hooks/useDealer.ts`, `src/hooks/useLoyaltyStatus.ts`

**Interfaces:**
- Consumes: Task 1-3 exports; `db` from `@/config/firebase`; `useAuth()` from `@/contexts/AuthContext` (`user?.uid`); `subscribeRewardSettings(onNext, onError?)` from `@/services/rewardsService` (returns an unsubscribe; falls back to defaults on error).
- Produces:
  - `dealerService`: `DealerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'`; `DealerRecord extends DealerApplicationInput { uid; status: DealerStatus; appliedAtMs; reviewNote; reviewedAtMs; approvedAtMs }`; `subscribeOwnDealer(uid, onNext(DealerRecord | null), onError)`; `applyAsDealer(uid, input: DealerApplicationInput, reapply: boolean): Promise<void>`; `withdrawDealerApplication(uid)`; `subscribeDealerSettings(onNext(DealerSettings), onError)`; `subscribeDealerPricing(onNext(DealerPricing), onError)`; `loadDealerAdminSettings(): Promise<{ settings: DealerSettings; pricing: DealerPricing }>`; `saveDealerAdminSettings(settings: DealerSettings, discountPercent: number, wasEnabled: boolean)`; `getProductDealerPrice(productId): Promise<{ price: number | null; discountPercent: number }>`; `setProductDealerPrice(productId, price: number | null)`; `subscribeDealerApplications(onNext(DealerRecord[]), onError)` (admin, all); `subscribePendingDealerCount(onNext(n), onError)` (admin); `reviewDealer(uid, action: 'approve' | 'reject' | 'suspend' | 'reinstate', adminUid, note?)`; `getDealerRecord(uid): Promise<DealerRecord | null>`.
  - `useDealer(): { ready: boolean; signedIn: boolean; settings: DealerSettings; record: DealerRecord | null; pricing: DealerPricing | null; active: boolean; showEntry: boolean }` where `active = settings.enabled && record?.status === 'approved' && pricing !== null` and `showEntry = signedIn && (settings.enabled || record !== null)`.
  - `useDealerUnit(productId: string, regularPrice: number): { unit: number; percentOff: number } | null` (null unless active and cheaper).
  - `useDealerQuote(items: Array<{ id: string; price: number; quantity: number }>): { active: boolean; quote: DealerQuote; pricing: 'dealer' | 'retail'; potentialSavings: number; minOrder: number; discountPercent: number }`.
  - `useLoyaltyStatus(uid: string | null | undefined): { loading: boolean; error: string | null; spend: number; tierIndex: number; tiers: LoyaltyTier[]; settings: RewardSettings; retry: () => void }`.

- [ ] **Step 1: Write `src/services/dealerService.ts`:**

```ts
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  DEFAULT_DEALER_PRICING,
  DEFAULT_DEALER_SETTINGS,
  normaliseDealerPricing,
  normaliseDealerSettings,
  type DealerPricing,
  type DealerSettings,
} from '@/lib/dealer';
import type { DealerApplicationInput } from '@/lib/dealerForm';

/*
 * Dealer Membership data. dealers/<uid> holds one application per customer;
 * only an admin changes its status (firestore.rules). siteSettings/dealer is
 * public (switch, minimum); dealerPricing/current is private (admins and
 * approved dealers). api/create-order.ts charges the prices; this file only
 * shows and edits them.
 */

export type DealerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface DealerRecord extends DealerApplicationInput {
  uid: string;
  status: DealerStatus;
  appliedAtMs: number;
  reviewNote: string;
  reviewedAtMs: number;
  approvedAtMs: number;
}

const ms = (v: unknown) =>
  typeof (v as { toMillis?: () => number })?.toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const STATUSES: DealerStatus[] = ['pending', 'approved', 'rejected', 'suspended'];

function toRecord(id: string, d: DocumentData): DealerRecord {
  return {
    uid: id,
    status: STATUSES.includes(d.status) ? d.status : 'pending',
    businessName: str(d.businessName),
    businessType: str(d.businessType),
    contactName: str(d.contactName),
    phone: str(d.phone),
    city: str(d.city),
    state: str(d.state),
    gstin: str(d.gstin),
    message: str(d.message),
    appliedAtMs: ms(d.appliedAt),
    reviewNote: str(d.reviewNote),
    reviewedAtMs: ms(d.reviewedAt),
    approvedAtMs: ms(d.approvedAt),
  };
}

const dealerRef = (uid: string) => doc(db, 'dealers', uid);
const settingsRef = doc(db, 'siteSettings', 'dealer');
const pricingRef = doc(db, 'dealerPricing', 'current');

export function subscribeOwnDealer(uid: string, onNext: (r: DealerRecord | null) => void, onError: (e: Error) => void) {
  return onSnapshot(dealerRef(uid), (s) => onNext(s.exists() ? toRecord(s.id, s.data()) : null), onError);
}

/** A new application, or a fresh one after a rejection (the rules allow exactly these writes). */
export async function applyAsDealer(uid: string, input: DealerApplicationInput, reapply: boolean) {
  const fields = { ...input, status: 'pending', appliedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (reapply) await updateDoc(dealerRef(uid), fields);
  else await setDoc(dealerRef(uid), { uid, ...fields });
}

export const withdrawDealerApplication = (uid: string) => deleteDoc(dealerRef(uid));

export function subscribeDealerSettings(onNext: (s: DealerSettings) => void, onError: (e: Error) => void) {
  return onSnapshot(settingsRef, (s) => onNext(normaliseDealerSettings(s.exists() ? s.data() : null)), onError);
}

export function subscribeDealerPricing(onNext: (p: DealerPricing) => void, onError: (e: Error) => void) {
  return onSnapshot(pricingRef, (s) => onNext(normaliseDealerPricing(s.exists() ? s.data() : null)), onError);
}

export async function loadDealerAdminSettings(): Promise<{ settings: DealerSettings; pricing: DealerPricing }> {
  const [s, p] = await Promise.all([getDoc(settingsRef), getDoc(pricingRef)]);
  return {
    settings: s.exists() ? normaliseDealerSettings(s.data()) : { ...DEFAULT_DEALER_SETTINGS },
    pricing: p.exists() ? normaliseDealerPricing(p.data()) : { ...DEFAULT_DEALER_PRICING },
  };
}

/** One batch: the public switch and minimum, and the private discount. */
export async function saveDealerAdminSettings(settings: DealerSettings, discountPercent: number, wasEnabled: boolean) {
  const clean = normaliseDealerSettings(settings);
  const batch = writeBatch(db);
  batch.set(
    settingsRef,
    { ...clean, ...(clean.enabled && !wasEnabled ? { enabledAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    pricingRef,
    { discountPercent: normaliseDealerPricing({ discountPercent }).discountPercent, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}

export async function getProductDealerPrice(productId: string): Promise<{ price: number | null; discountPercent: number }> {
  const p = await getDoc(pricingRef);
  const pricing = normaliseDealerPricing(p.exists() ? p.data() : null);
  return { price: pricing.productPrices[productId] ?? null, discountPercent: pricing.discountPercent };
}

/** Set or clear (null) one product's fixed dealer price. */
export async function setProductDealerPrice(productId: string, price: number | null) {
  await setDoc(
    pricingRef,
    { productPrices: { [productId]: price === null ? deleteField() : Math.round(price * 100) / 100 }, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function subscribeDealerApplications(onNext: (rows: DealerRecord[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'dealers'),
    (snap) => onNext(snap.docs.map((d) => toRecord(d.id, d.data())).sort((a, b) => b.appliedAtMs - a.appliedAtMs)),
    onError,
  );
}

export function subscribePendingDealerCount(onNext: (n: number) => void, onError: (e: Error) => void) {
  return onSnapshot(query(collection(db, 'dealers'), where('status', '==', 'pending')), (s) => onNext(s.size), onError);
}

export async function getDealerRecord(uid: string): Promise<DealerRecord | null> {
  const s = await getDoc(dealerRef(uid));
  return s.exists() ? toRecord(s.id, s.data()) : null;
}

const NEXT: Record<'approve' | 'reject' | 'suspend' | 'reinstate', DealerStatus> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reinstate: 'approved',
};

/** An admin decision. The note (up to 300 characters) is shown to the applicant when rejected or suspended. */
export async function reviewDealer(
  uid: string,
  action: keyof typeof NEXT,
  adminUid: string,
  note = '',
  firstApproval = false,
) {
  await updateDoc(dealerRef(uid), {
    status: NEXT[action],
    reviewNote: note.trim().slice(0, 300),
    reviewedAt: serverTimestamp(),
    reviewedBy: adminUid,
    updatedAt: serverTimestamp(),
    ...(action === 'approve' && firstApproval ? { approvedAt: serverTimestamp() } : {}),
  });
}
```

- [ ] **Step 2: Write `src/hooks/useDealer.ts`** (one shared session store, like `useWaitingScratchCards`):

```ts
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_DEALER_SETTINGS,
  dealerQuote,
  dealerUnitPrice,
  type DealerPricing,
  type DealerQuote,
  type DealerSettings,
} from '@/lib/dealer';
import {
  subscribeDealerPricing,
  subscribeDealerSettings,
  subscribeOwnDealer,
  type DealerRecord,
} from '@/services/dealerService';

/*
 * The signed-in customer's dealer state, shared by every component in the
 * session (one set of listeners, module state): the public programme
 * settings, their own application, and, only once they are an approved dealer
 * while the programme is on, the private dealer prices. Guests read nothing.
 * Any read error just means regular prices; the server charges what it works
 * out itself either way.
 */

export interface DealerState {
  ready: boolean;
  signedIn: boolean;
  settings: DealerSettings;
  record: DealerRecord | null;
  pricing: DealerPricing | null;
  active: boolean;
  showEntry: boolean;
}

const EMPTY: DealerState = {
  ready: true,
  signedIn: false,
  settings: DEFAULT_DEALER_SETTINGS,
  record: null,
  pricing: null,
  active: false,
  showEntry: false,
};

let currentUid: string | null = null;
let stops: Array<() => void> = [];
let stopPricing: (() => void) | null = null;
let settings: DealerSettings = DEFAULT_DEALER_SETTINGS;
let record: DealerRecord | null = null;
let pricing: DealerPricing | null = null;
let gotSettings = false;
let gotRecord = false;
let state: DealerState = EMPTY;
const listeners = new Set<() => void>();

function publish() {
  const signedIn = currentUid !== null;
  const approved = record?.status === 'approved';
  const wantPricing = signedIn && approved && settings.enabled;
  if (wantPricing && !stopPricing) {
    stopPricing = subscribeDealerPricing(
      (p) => {
        pricing = p;
        publish();
      },
      () => {
        pricing = null;
        publish();
      },
    );
  } else if (!wantPricing && stopPricing) {
    stopPricing();
    stopPricing = null;
    pricing = null;
  }
  state = signedIn
    ? {
        ready: gotSettings && gotRecord && (!wantPricing || pricing !== null),
        signedIn,
        settings,
        record,
        pricing: wantPricing ? pricing : null,
        active: wantPricing && pricing !== null,
        showEntry: settings.enabled || record !== null,
      }
    : EMPTY;
  listeners.forEach((l) => l());
}

function watch(uid: string | null) {
  if (uid === currentUid) return;
  stops.forEach((s) => s());
  stops = [];
  stopPricing?.();
  stopPricing = null;
  currentUid = uid;
  settings = DEFAULT_DEALER_SETTINGS;
  record = null;
  pricing = null;
  gotSettings = false;
  gotRecord = false;
  if (uid) {
    stops.push(
      subscribeDealerSettings(
        (s) => {
          settings = s;
          gotSettings = true;
          publish();
        },
        () => {
          settings = DEFAULT_DEALER_SETTINGS;
          gotSettings = true;
          publish();
        },
      ),
      subscribeOwnDealer(
        uid,
        (r) => {
          record = r;
          gotRecord = true;
          publish();
        },
        () => {
          record = null;
          gotRecord = true;
          publish();
        },
      ),
    );
  }
  publish();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useDealer(): DealerState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useEffect(() => watch(uid), [uid]);
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** This product's dealer unit price for an active dealer, or null (regular price shown). */
export function useDealerUnit(productId: string, regularPrice: number): { unit: number; percentOff: number } | null {
  const d = useDealer();
  return useMemo(() => {
    if (!d.active || !d.pricing || !(regularPrice > 0)) return null;
    const unit = dealerUnitPrice(productId, regularPrice, d.pricing);
    if (!(unit < regularPrice)) return null;
    return { unit, percentOff: Math.round((1 - unit / regularPrice) * 100) };
  }, [d.active, d.pricing, productId, regularPrice]);
}

/** The cart priced for this customer, as api/create-order.ts will price it. */
export function useDealerQuote(items: Array<{ id: string; price: number; quantity: number }>) {
  const d = useDealer();
  return useMemo(() => {
    const lines = items.map((i) => ({ productId: i.id, unit: Number(i.price) || 0, quantity: Number(i.quantity) || 0 }));
    const quote: DealerQuote = dealerQuote(lines, d.settings, d.active ? d.pricing : null, d.active);
    const potential = d.active ? dealerQuote(lines, { ...d.settings, minOrder: 0 }, d.pricing, true).savings : 0;
    return {
      active: d.active,
      quote,
      pricing: (quote.applies ? 'dealer' : 'retail') as 'dealer' | 'retail',
      potentialSavings: potential,
      minOrder: d.settings.minOrder,
      discountPercent: d.pricing?.discountPercent ?? 0,
    };
  }, [items, d.active, d.settings, d.pricing]);
}
```

- [ ] **Step 3: Write `src/hooks/useLoyaltyStatus.ts`:**

```ts
import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { subscribeRewardSettings } from '@/services/rewardsService';
import {
  DEFAULT_REWARD_SETTINGS,
  tierIndexForSpend,
  tierSpend,
  type LoyaltyTier,
  type RewardSettings,
} from '@/lib/rewards';

/*
 * A customer's loyalty tier, worked out the way the server does it when it
 * earns points (tierSpend in rewards-core): rupees paid online, from the
 * server-written payment records, for orders now delivered and not dealer-
 * priced. Used by /wallet, the account page and the admin customer page
 * (admins can read any customer's payments and orders).
 */
export function useLoyaltyStatus(uid: string | null | undefined) {
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [spend, setSpend] = useState(0);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => subscribeRewardSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setSpend(0);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getDocs(query(collection(db, 'payments'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'orders'), where('userId', '==', uid))),
    ])
      .then(([payments, orders]) => {
        if (!live) return;
        const status = new Map(orders.docs.map((o) => [o.id, String(o.data().status || '')]));
        setSpend(
          tierSpend(
            payments.docs.map((p) => ({
              id: p.id,
              amountPaise: Number(p.data().amountPaise) || 0,
              dealer: p.data().dealer === true,
              orderStatus: status.get(p.id) || '',
            })),
          ),
        );
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load your membership');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const tiers: LoyaltyTier[] = settings.tiers;
  return { loading, error, spend, tierIndex: tierIndexForSpend(spend, tiers), tiers, settings, retry };
}
```

Check `subscribeRewardSettings`'s real signature in `src/services/rewardsService.ts` (~:95) and adapt the call if it differs (it must return the unsubscribe function).

- [ ] **Step 4: Verify.** `npm test`, `npm run build`, type check (baseline only), `npx eslint src/services/dealerService.ts src/hooks/useDealer.ts src/hooks/useLoyaltyStatus.ts` (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/services/dealerService.ts src/hooks/useDealer.ts src/hooks/useLoyaltyStatus.ts
git commit -m "Dealer service, shared dealer state and loyalty status hooks"
```

---

### Task 8: Loyalty card on `/wallet` and the account page

**Files:**
- Create: `src/components/loyalty/MemberCard.tsx` (`MemberCardView`, `TierSteps`, `TierChip`, `tierStyle(index)`)
- Modify: `src/pages/PurchaseSummary.tsx` (replace the tier card ~:279-383 and the browser tier maths ~:33-45, :93-148 spend, :185-215), `src/pages/Account.tsx` (mobile member card ~:971-1006; menus ~:925-946), `src/components/rewards/RewardsWalletCard.tsx` (history row multiplier), `src/config/brand.ts` (remove `loyaltyTiers`)

**Interfaces:**
- Consumes: `useLoyaltyStatus` (Task 7), `useDealer` (Task 7), `memberDigits`/`formatMemberNumber` (Task 3), `BRAND.memberPrefix`, the rewards balance the page already shows (`useRewards`).
- Produces: `MemberCardView({ name, memberNumber, memberSince, tierIndex, tiers, points, pointsWorth, dealer })`, `TierSteps({ spend, tierIndex, tiers })`, `TierChip({ index, name, multiplier })`, `tierStyle(index: number)`; the "Dealer programme" menu entry pattern reused by nothing else.

- [ ] **Step 1: Port the card.** Copy `MemberCard`, `TierSteps`, `TierChip` and the tier colour map from `src/pages/__mock/DealerLoyaltyMock.tsx` (lines ~169-456: `TIERS`, `TierChip`, `MemberCard`, `TierSteps`, `StatusPanel`) into `src/components/loyalty/MemberCard.tsx`. Replace the mock constants with props. Tier styles are keyed by **index** 0-3 (steel, gold, platinum, copper; index > 3 uses copper) because admins can rename tiers. The copy button copies the 12 digits (no spaces) with `navigator.clipboard.writeText` and a Sonner toast "Member number copied"; it is an `IconButton` with `label="Copy member number"`.
- [ ] **Step 2: Progress bar.** In `TierSteps`, fill the bar step by step: each gap between steps fills by `(spend - tiers[i].minSpend) / (tiers[i+1].minSpend - tiers[i].minSpend)` clamped to 0-1, as in the mock. The text under it: "Spend ₹X more to reach {next} and earn {m}x points" or, at the top tier, "You're in the top tier". The note: "Your tier counts what you've paid online for delivered orders. Returned or cancelled orders don't count. Dealer-priced orders earn no points." (the last sentence only when `useDealer().record?.status === 'approved'`).
- [ ] **Step 3: `/wallet`.** In `PurchaseSummary.tsx` remove the browser tier maths (`TIER_STYLE`, `LOYALTY_TIERS`, `PROGRAMME_TOP`, `getLoyaltyTier`, `getNextTierProgress`, the tier-only parts of the `totalSpent` effect; keep the order list and counts the page still shows). Replace the charcoal tier card with the mock's `StatusPanel` layout using real data: `useLoyaltyStatus(user.uid)`, the points balance from the rewards hook the page already uses (`RewardsWalletCard`'s source, `useRewards`), `userProfile.createdAt` for "Member since" (formatted `MMM yyyy`; hide the line when missing), `userProfile.name || username || displayName` for the name (upper-cased by CSS), `useDealer().record?.status === 'approved'` for the Dealer chip. While `loading`, show a `Skeleton` of the card's size; on `error`, a `Notice tone="danger"` with Retry (`retry`). Keep `ScratchCardsPanel` and `RewardsWalletCard` below it in the same order. Update the page subtitle to "Your member card, tier, points and cashback".
- [ ] **Step 4: Remove `BRAND.loyaltyTiers`** from `src/config/brand.ts` and confirm nothing else uses it: `grep -rn loyaltyTiers src api` returns nothing.
- [ ] **Step 5: History rows.** In `RewardsWalletCard.tsx`, for an earn entry with a `multiplier` > 1, show "{tierName} {multiplier}x" under the points amount (as in the mock's points stub, ~:456-505). Read the two fields from the ledger doc where the card maps entries.
- [ ] **Step 6: Account page.** In `Account.tsx`'s mobile member card add the tier chip and member number exactly as the mock's `AccountView` (~:603-820). In both menus (`menuItems` ~:925 and `accountMenu` ~:937), after "Wallet & rewards", add `{ id: 'dealer', label: 'Dealer programme', icon: Store, path: '/dealer' }` only when `useDealer().showEntry`, with a small "Approved" chip when `record?.status === 'approved'` (as in the mock).
- [ ] **Step 7: Verify.** Build, type check, eslint on touched files. Start nothing new: the dev server runs at `http://127.0.0.1:5182`. Write a temporary harness page `src/pages/__mock/LoyaltyHarness.tsx` (git-ignored folder; add a temporary DEV route marked `MOCKUP, do not commit` in `App.tsx`) that renders `MemberCardView` and `TierSteps` with fixture props for all 4 tiers, a dealer, and a top-tier member. Screenshot it at 390 and 1440 in light and dark with the global Playwright (theme via localStorage `ishaputra-theme`) into `../shots/dealer-loyalty-build/`: 0 console errors and `scrollWidth <= innerWidth`. Delete the harness file and its route afterwards.
- [ ] **Step 8: Commit**

```bash
git add src/components/loyalty/MemberCard.tsx src/pages/PurchaseSummary.tsx src/pages/Account.tsx src/components/rewards/RewardsWalletCard.tsx src/config/brand.ts
git commit -m "Loyalty card on /wallet and the account page; tiers from payment records"
```

---

### Task 9: The `/dealer` page

**Files:**
- Create: `src/pages/DealerProgramme.tsx`, `src/components/dealer/DealerViews.tsx` (pure views: `DealerBand`, `HowItWorks`, `DealerApplyForm`, `ApplicationSummary`, `DealerAccountCard`, `DealerTerms`)
- Modify: `src/App.tsx` (lazy import + route; commit only these lines, not the MOCKUP ones)

**Interfaces:**
- Consumes: `useDealer`, `applyAsDealer`, `withdrawDealerApplication` (Task 7); `BUSINESS_TYPES`, `cleanDealerApplication`, `validateDealerApplication`, `businessTypeLabel` (Task 3); the site's Indian states list (find it: `grep -rn "Andhra Pradesh" src/lib src/config src/data` and reuse it); `useAuth().userProfile` for prefill; `ConfirmDialog` for Withdraw; `usePageMeta`.
- Produces: route `/dealer` (wrapped in `ProtectedRoute requireEmailVerification={false}`, like `/wallet`).

- [ ] **Step 1: Port the views** from `src/pages/__mock/DealerLoyaltyMock.tsx` (~:823-1176: `DealerBand`, `BenefitsPanel` → `HowItWorks`, `FieldLabel`, `ApplyForm`, `ApplicationSummary`, `DealerAccountCard`, `TERMS`/`TermsPanel`, `DealerView`) into `DealerViews.tsx` as props-only components. The terms use live values: `{discountPercent}% off regular prices. Some products have their own dealer price.`, `Applies on orders of ₹{minOrder} or more at regular prices.`, `Coupons, points and cashback don't apply to dealer-priced orders, and they earn no points.`, `GST invoice with your business name and GSTIN.` The apply page's "How it works" never shows the %.
- [ ] **Step 2: The page.** `DealerProgramme.tsx` uses the same shell as `/wallet` (desktop Header and Footer, phone sticky top bar "Dealer programme" and MobileBottomNav). States from `useDealer()`:
  - `!ready` → a `PanelSkeleton`.
  - `record === null && !settings.enabled` → `EmptyState` "The dealer programme isn't open right now." with a link to `/products`.
  - `record === null` → the form. Prefill `contactName` from `userProfile.name || username`, `phone` from `userProfile.phone`. On submit: `cleanDealerApplication`, `validateDealerApplication`; show each error under its field (`aria-describedby`, `aria-invalid`) and focus the first invalid field; else `applyAsDealer(uid, cleaned, false)`, toast "Application sent", and the listener moves the page to pending. A failed write shows `toast.error(describeError(e))` and keeps the form.
  - `pending` → summary + "Withdraw application" (ConfirmDialog "Withdraw your application?"; `withdrawDealerApplication`).
  - `approved` (programme on) → account card + terms + "Shop at dealer prices" (`/products`). Approved while the programme is off → the account card with a "Dealer prices are off for now" chip and `Notice` "The shop has paused dealer prices. Your dealer account stays approved."
  - `rejected` → the team's note (`reviewNote`, or "No reason was given.") in the neutral notice, summary, "Apply again" opening the form prefilled with the old answers; submit calls `applyAsDealer(uid, cleaned, true)`.
  - `suspended` → paused account card, `reviewNote` if any, "Contact support" linking to `/support` (find the real support route in App.tsx).
  - `usePageMeta({ title: 'Dealer programme', noindex: true })` (match the hook's real options).
- [ ] **Step 3: Route.** In `App.tsx` add `const DealerProgramme = lazy(() => import('./pages/DealerProgramme'));` with the other lazy pages, and the route next to `/wallet`:

```tsx
<Route
  path="/dealer"
  element={
    <ProtectedRoute requireEmailVerification={false}>
      <DealerProgramme />
    </ProtectedRoute>
  }
/>
```

Commit only these lines: stage with `git add -p src/App.tsx` is not available (non-interactive), so instead: copy `src/App.tsx` aside, remove the `MOCKUP, do not commit` lines from the working file, `git add src/App.tsx`, then restore the copy so the mock routes stay in the working tree.
- [ ] **Step 4: Verify** with a temporary harness (as in Task 8 Step 7) that renders every state with fixture data at 390 and 1440, light and dark: 0 console errors, no sideways scroll, every input labelled, the first invalid field focused after a bad submit. Delete the harness afterwards. Build, type check, eslint.
- [ ] **Step 5: Commit**

```bash
git add src/pages/DealerProgramme.tsx src/components/dealer/DealerViews.tsx src/App.tsx
git commit -m "/dealer: apply, pending, approved, rejected and suspended states"
```

---

### Task 10: Dealer prices on product surfaces

**Files:**
- Create: `src/components/dealer/DealerPrice.tsx` (`DealerPriceInline`, `DealerPriceBlock`)
- Modify: `src/components/ProductCard.tsx`, `src/pages/CategoryPage.tsx` (its own card), `src/pages/ProductDetail.tsx` (price block and the phone "Buy at ₹X" button), `src/pages/MobileSearch.tsx`, `src/pages/Wishlist.tsx`; also `src/components/Header.tsx` if its search dropdown prints prices

**Interfaces:**
- Consumes: `useDealerUnit(productId, price)`, `useDealer().settings.minOrder` (Task 7), `formatINR`.
- Produces: `DealerPriceInline({ unit, regular, percentOff, size?: 'sm' | 'md' })` → "₹640 ~~₹800~~ [Dealer −20%]"; `DealerPriceBlock({ unit, regular, percentOff, minOrder })` → the product page block with "Dealer price", "Regular ~~₹800~~", the chip, and the line "Dealer prices apply on orders of ₹2,000 or more at regular prices." (`minOrder` formatted).

- [ ] **Step 1: Port** the mock's price block and card price row (`PdpView` ~:1241-1402 and `DealerProductCard` ~:1178-1240) into `DealerPrice.tsx`. The struck price is `<span className="price-was"><span className="sr-only">Regular price </span>₹800</span>`; the chip is `chip-off` styled with the text "Dealer −20%".
- [ ] **Step 2: Use it.** In each surface, call `const dealer = useDealerUnit(product.id, product.price)` (use the field names each file already uses) and render `DealerPriceInline` instead of the price row when `dealer` is not null; otherwise leave today's markup untouched. Hooks must be called unconditionally at the top of the card component. On the product page use `DealerPriceBlock` and change the phone buy button's label to "Buy now" when `dealer` is not null.
- [ ] **Step 3: Verify** with a temporary harness that renders `ProductCard` and the price block with a stubbed dealer state (render `DealerPriceInline`/`DealerPriceBlock` directly with fixture numbers at 390 and 1440, light and dark): 0 console errors, no overflow, chip text fits on one line at 390. Load the real `/`, `/products` and one product page signed out: 0 console errors (guests read nothing new). Build, type check, eslint. Delete the harness.
- [ ] **Step 4: Commit**

```bash
git add src/components/dealer/DealerPrice.tsx src/components/ProductCard.tsx src/pages/CategoryPage.tsx src/pages/ProductDetail.tsx src/pages/MobileSearch.tsx src/pages/Wishlist.tsx
git commit -m "Approved dealers see dealer prices on product cards, search, wishlist and the product page"
```

(Add `src/components/Header.tsx` to the `git add` only if you changed it.)

---

### Task 11: Cart drawer, checkout, payment call and invoice

**Files:**
- Create: `src/components/checkout/DealerCheckoutNotices.tsx` (`DealerNudge`, `DealerAppliedNotice`, `DealerLinePrice`)
- Modify: `src/services/razorpayService.ts` (options ~:56-90, request body ~:190-205, error mapping ~:221-228, new error class), `src/pages/Checkout.tsx` (both checkout copies: pricing ~:997 and ~:2149; cart lines; coupon UI ~:1530-1575 and ~:2625-2780; `RewardsRedeemCard` ~:1597 and ~:2799; `BillRows` ~:1614, :1713, :2818; `payWithRazorpay` calls ~:1093 and ~:2243; order write ~:1123-1170 and ~:2275-2320; error handling ~:1206 and ~:2351), `src/components/ShoppingCart.tsx` (drawer lines and subtotal), `src/services/invoiceService.ts` (buyer block ~:271-281)

**Interfaces:**
- Consumes: `useDealerQuote(items)` (Task 7), the HTTP contract of Task 4.
- Produces: `RazorpayCheckoutOptions.pricing?: 'dealer' | 'retail'`; `export class DealerPricingChangedError extends Error` (thrown for 409 `dealer_pricing_changed`, 400 `dealer_no_extras` and 503 `dealer_unavailable`, with the server's message); order fields `pricing: 'dealer'`, `regularSubtotal`, `dealerSavings`, `buyerBusiness: { name, gstin }` on dealer-priced orders.

- [ ] **Step 1: `razorpayService.ts`.** Add `pricing?: 'dealer' | 'retail';` to `RazorpayCheckoutOptions` (doc: "How this page priced the cart; the server refuses a payment priced differently"). Send `pricing: options.pricing` in the create-order body. Add the error class next to `RewardsChangedError`:

```ts
/**
 * The server priced the cart differently for dealer prices (409
 * dealer_pricing_changed), refused extras on dealer prices (400
 * dealer_no_extras), or could not confirm them (503 dealer_unavailable).
 * Nothing was charged; checkout refreshes the dealer state and the customer
 * checks the new total.
 */
export class DealerPricingChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DealerPricingChangedError';
  }
}
```

and map it before the generic error:

```ts
  if (
    (res.status === 409 && data.code === 'dealer_pricing_changed') ||
    (res.status === 400 && data.code === 'dealer_no_extras') ||
    (res.status === 503 && data.code === 'dealer_unavailable')
  ) {
    throw new DealerPricingChangedError(data.error || 'Your dealer prices changed. Check the new total and pay again.');
  }
```

- [ ] **Step 2: Checkout, in each of the two copies.**
  1. After the cart `items` are known: `const dealerCart = useDealerQuote(items);` and `const pricedSubtotal = dealerCart.quote.subtotal;`. Pass `pricedSubtotal` instead of the cart `subtotal` as the first argument of `useCheckoutPricing`.
  2. When `dealerCart.quote.applies`: if a coupon is applied, remove it (`pricing.removeCoupon()` or the hook's real remover) in an effect; disable the coupon input and Apply button with the note "Coupons, points and cashback don't apply to dealer-priced orders." (`aria-describedby` on the input); do not render `RewardsRedeemCard` and force its toggles off (pass `usePoints: false`, `useCashback: false`).
  3. Cart lines: show `DealerLinePrice` (unit `dealerCart.quote.units[i]`, the regular price struck, the chip, and "2 × ₹640" under the line total) when it applies.
  4. Above the coupon block: `DealerNudge` when `dealerCart.active && !dealerCart.quote.applies && dealerCart.quote.shortBy > 0` ("Add ₹{shortBy} more to unlock dealer prices." and, when `potentialSavings > 0`, "These items cost ₹{potentialSavings} less at dealer prices.", a progress bar `regularSubtotal / minOrder`, and "Add more items" linking to `/products`); `DealerAppliedNotice` when it applies ("Your order is worth ₹{regularSubtotal} at regular prices, so dealer prices apply. You save ₹{savings}." plus "Dealer-priced orders don't earn points or scratch cards.").
  5. Bill rows when it applies: "Items at regular prices ₹{regularSubtotal}", "Dealer prices −₹{savings}", then delivery, GST and total as today (`BillRows` gets two optional props `regularSubtotal` and `dealerSavings`; when both are set it prints those two rows instead of "Item total").
  6. `payWithRazorpay({ …, pricing: dealerCart.pricing, couponCode: dealerCart.quote.applies ? undefined : …, usePoints: dealerCart.quote.applies ? false : …, useCashback: dealerCart.quote.applies ? false : … })`. `amountBeforeRewards` and `amount` already come from `pricing` (built on `pricedSubtotal`).
  7. Order write: `items[i].price = dealerCart.quote.units[i]`, `subtotal = pricedSubtotal`, and when it applies add `pricing: 'dealer'`, `regularSubtotal: dealerCart.quote.regularSubtotal`, `dealerSavings: dealerCart.quote.savings`, `buyerBusiness: { name: dealer.record.businessName, gstin: dealer.record.gstin }` (from `useDealer()`). Make sure the coupon and rewards fields are absent on dealer orders.
  8. Errors: next to the `RewardsChangedError` branch add `if (error instanceof DealerPricingChangedError) { toast.error(error.message); /* reset the slider / button exactly as the RewardsChangedError branch does */ return; }`. The dealer state is live (listeners), so the page re-prices by itself.
- [ ] **Step 3: Cart drawer** (`ShoppingCart.tsx`): `useDealerQuote(items)`; show dealer line prices and a compact one-line version of the nudge or the applied notice above the subtotal; the subtotal shows `quote.subtotal` with the regular subtotal struck when it applies.
- [ ] **Step 4: Invoice.** In the buyer block, when `order.pricing === 'dealer' && order.buyerBusiness?.name`, print the business name as the first buyer line and `GSTIN: <gstin>` as the last (only when `gstin` is set). Nothing else changes.
- [ ] **Step 5: Verify.**
  - `npm test`, `npm run build`, type check, eslint on touched files.
  - Signed out and as a non-dealer, the real `/checkout` behaves exactly as before: with the dev server, sign in as the preview shopper through the `/login` form (credentials in `docs/handoff/shopper.local`; never print them) and stub `/api/create-order` to 500 in Playwright (`page.route`), so nothing is charged or written. One slide (390) or one click (1440) makes exactly 1 create-order call whose body has `pricing: 'retail'`; 0 page errors; width stays 390.
  - Dealer screens are checked live in the owner-approved live test; here, render `DealerNudge`, `DealerAppliedNotice`, `DealerLinePrice` and `BillRows` with fixture props in a temporary harness at 390 and 1440, light and dark (0 console errors, no overflow), then delete it.
- [ ] **Step 6: Commit**

```bash
git add src/components/checkout/DealerCheckoutNotices.tsx src/services/razorpayService.ts src/pages/Checkout.tsx src/components/ShoppingCart.tsx src/services/invoiceService.ts
git commit -m "Checkout and cart: dealer prices, nudge, no extras on dealer orders, dealer invoice"
```

---

### Task 12: Admin > Dealers

**Files:**
- Create: `src/pages/admin/AdminDealers.tsx`, `src/components/admin/DealerApplicationSheet.tsx`
- Modify: `src/pages/admin/AdminLayout.tsx` (nav item after Customers with the pending count; `pageTitle`), `src/App.tsx` (lazy import + `<Route path="dealers" element={<AdminDealers />} />` next to `customers`; commit without the MOCKUP lines as in Task 9 Step 3)

**Interfaces:**
- Consumes: `subscribeDealerApplications`, `subscribePendingDealerCount`, `reviewDealer` (Task 7); `businessTypeLabel` (Task 3); `useAuth().user.uid`; `AdminPageHeader`, `StatCard`, `ToggleGroup`, `Sheet`, `ConfirmDialog`, `Textarea`, `Notice`, `EmptyState`, `TableSkeleton`.
- Produces: `/admin/dealers`.

- [ ] **Step 1: Port** `DealersView` and the sheet from `src/pages/__mock/DealerAdminMock.tsx` (~:470-1024) with real data: `subscribeDealerApplications` drives the list; StatCards count pending, approved, and rejected + suspended; the filter (Pending default) and a search box filter by business name, contact name, phone or GSTIN (case-insensitive) in the browser. Desktop table, phone cards, as in the mock. Rows open the sheet; Approve/Reject buttons on pending rows act directly (Reject opens the sheet focused on the note field).
- [ ] **Step 2: Sheet actions.** Approve → `reviewDealer(uid, 'approve', adminUid, '', record.approvedAtMs === 0)`; Reject → `reviewDealer(uid, 'reject', adminUid, note)`; Suspend (approved) → ConfirmDialog "Suspend this dealer? They'll pay regular prices until you reinstate them." then `reviewDealer(uid, 'suspend', adminUid, note)`; Reinstate (suspended) → `reviewDealer(uid, 'reinstate', adminUid)`. Each shows a toast and keeps the sheet open on failure. The sheet links to `/admin/customers/<uid>`.
- [ ] **Step 3: Nav.** In `AdminLayout.tsx` add `{ path: '/admin/dealers', icon: Store, label: 'Dealers' }` right after Customers in `mainNavItems` (Settings stays last). Show the pending count from `subscribePendingDealerCount` (one listener in the layout; hide the badge at 0 or on error) as in the mock. Add a `pageTitle` rule for `/admin/dealers` → "Dealers".
- [ ] **Step 4: Verify** with a temporary harness rendering the list and sheet with fixture records (pending, approved, rejected, suspended, no GSTIN, a long business name) at 1440 and 390, light and dark: 0 console errors, no overflow, focus moves to the sheet title on open and back to the row on close. Build, type check, eslint. Delete the harness.
- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminDealers.tsx src/components/admin/DealerApplicationSheet.tsx src/pages/admin/AdminLayout.tsx src/App.tsx
git commit -m "Admin > Dealers: review, approve, reject, suspend and reinstate"
```

---

### Task 13: Commerce settings: Dealers tab and loyalty tiers

**Files:**
- Create: `src/components/admin/DealerSettingsTab.tsx`, `src/components/admin/LoyaltyTiersSection.tsx`
- Modify: `src/pages/admin/AdminCommerceSettings.tsx` (tab triggers ~:965-976, contents ~:979-989, `RewardsTab` ~:822-953)

**Interfaces:**
- Consumes: `loadDealerAdminSettings`, `saveDealerAdminSettings`, `subscribeDealerApplications` (Task 7); `normaliseRewardSettings`, `RewardSettings.tiers`, `DEFAULT_TIERS`, `pointsForBase` (Task 1); the Rewards tab's existing `saveRewardSettings`.
- Produces: tab value `dealers`; the Rewards tab saves `tiers` with its other fields.

- [ ] **Step 1: Dealers tab.** Port `DealerSettingsTab` from `src/pages/__mock/DealerAdminMock.tsx` (~:1088-1195). Follow the `RewardsTab` load pattern: state `null` until `loadDealerAdminSettings()` succeeds; on failure a danger `Notice` with Retry and Save disabled. Fields: switch "Dealer programme" (help "Off hides the dealer page and stops dealer prices. Approved dealers keep their status."), "Dealer discount (%)" (0-90), "Dealer prices from (₹, at regular prices)" (whole rupees). Live example: "A ₹800 item costs dealers ₹{dealerUnitPrice('x', 800, …)}". StatCards: approved dealers and applications waiting (from `subscribeDealerApplications`). The "How dealer prices work" info `Notice` lists the no-stacking rules. Placeholder subtitle "Placeholder values until the client confirms its dealer terms." Save calls `saveDealerAdminSettings(settings, discountPercent, loadedEnabled)` and toasts; report clamped values like `RewardsTab` does. A "Review applications" link goes to `/admin/dealers`.
- [ ] **Step 2: Register the tab** after Scratch & Win: trigger `value="dealers"` with a `Store` icon and label "Dealers"; content `<DealerSettingsTab />`.
- [ ] **Step 3: Loyalty tiers.** Port `RewardsWithTiers`'s tier table (~:1196-1336) into `LoyaltyTiersSection` as a controlled component `({ tiers, onChange, pointsPer100 })` with 4 fixed rows (name, spend from ₹, multiplier ×, and a read-only "on a ₹2,000 order" column using `pointsForBase(2000, { …settings, enabled: true }, multiplier)`). Row 1's "spend from" is fixed at 0 and read-only. Show the note "Tier counts money paid online on delivered orders; returned or cancelled orders don't count. The multiplier applies to points earned when an order is delivered." Mount it in `RewardsTab` under the existing fields; the tab's state now includes `tiers`, `save()` sends them through `normaliseRewardSettings` with the rest, and the "values were adjusted" report covers tier values.
- [ ] **Step 4: Verify** with a temporary harness (both sections with fixture values, a load error state) at 1440 and 390, light and dark: 0 console errors, no overflow. Load the real `/admin/commerce-settings` signed out: it redirects to the admin login with 0 console errors. Build, type check, eslint. Delete the harness.
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/DealerSettingsTab.tsx src/components/admin/LoyaltyTiersSection.tsx src/pages/admin/AdminCommerceSettings.tsx
git commit -m "Commerce settings: Dealers tab and editable loyalty tiers"
```

---

### Task 14: Product form, customer page and order page

**Files:**
- Modify: `src/pages/admin/ProductForm.tsx` (pricing grid after Discount ~:1388; save ~:724-731; load ~:349-358), `src/pages/admin/AdminCustomerDetails.tsx` (header ~:210-252), `src/pages/admin/AdminOrderDetails.tsx` (payment check data ~:725-760; totals ~:1061-1109)

**Interfaces:**
- Consumes: `getProductDealerPrice`, `setProductDealerPrice`, `getDealerRecord` (Task 7); `dealerUnitPrice` (Task 2); `useLoyaltyStatus` (Task 7); `memberDigits`, `formatMemberNumber` (Task 3); `TierChip`, `tierStyle` (Task 8).

- [ ] **Step 1: Product form.** Port the "Dealer price (₹)" field from `ProductPricingView` in `src/pages/__mock/DealerAdminMock.tsx` (~:1337-1544). On edit, `getProductDealerPrice(productId)` fills it (blank when null) and gives the store-wide percent for the hint "Leave blank to use the store-wide {p}% off (₹{dealerUnitPrice}). Only approved dealers see it." Validation (with the form's existing error pattern): blank, or a number > 0 with at most 2 decimals and below the product's Price ("Must be below the ₹{price} price"). After the product saves successfully (new products: once the id exists), call `setProductDealerPrice(id, value === '' ? null : Number(value))`; if that write fails, toast "Product saved, but the dealer price wasn't. Try saving again." A failed load of the dealer price disables only that field with "Couldn't load the dealer price."
- [ ] **Step 2: Customer details.** In the header, as in the mock's `CustomerView` (~:1547-1729): member number (`formatMemberNumber(memberDigits(customerId), BRAND.memberPrefix)`) with a copy button, the `TierChip` from `useLoyaltyStatus(customerId)`, the line "₹{spend} paid online on delivered orders · ₹{next.minSpend − spend} more for {next.name}" (or "Top tier"), and when `getDealerRecord(customerId)` returns a record: "Dealer: {status}" with a link to `/admin/dealers`.
- [ ] **Step 3: Order details.** Where the page loads `payments/<razorpayOrderId>` for the payment check, read `dealer` and `regularSubtotal`. When `dealer === true`: a "Dealer order" chip next to the payment status, and in the totals, before Discount, the rows "Items at regular prices ₹{regularSubtotal}" and "Dealer prices −₹{regularSubtotal − order.subtotal}" (rounded to paise). The existing checks (amount, cart hash) stay as they are.
- [ ] **Step 4: Verify.** Build, type check, eslint. Harness with fixture props for the dealer price field states (blank, set, error) and the customer header (each tier, dealer statuses) at 1440 and 390: 0 console errors, no overflow. Delete the harness.
- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/ProductForm.tsx src/pages/admin/AdminCustomerDetails.tsx src/pages/admin/AdminOrderDetails.tsx
git commit -m "Admin: per-product dealer price, member and tier on the customer page, dealer orders marked"
```

---

### Task 15: Clean-up, docs and full verification

**Files:**
- Delete: `src/pages/__mock/DealerLoyaltyMock.tsx`, `src/pages/__mock/DealerAdminMock.tsx` and every `MOCKUP, do not commit` line in `src/App.tsx`
- Modify: `CLIENT.md`, `docs/ui-system.md`, `docs/HANDOFF.md`

- [ ] **Step 1:** Delete the two mock files and the mock lines in `App.tsx` (after this, `git diff src/App.tsx` is empty). Check: `grep -rn "__mock\|MOCKUP" src` prints nothing.
- [ ] **Step 2: `CLIENT.md`.** Add a "Dealer Membership and Loyalty card" section in the style of "Scratch & Win" (what customers get, settings, data, placeholders, not in this version); add the placeholders to "Placeholders for the client" (programme off; 20%; ₹2,000 at regular prices; per-product prices none; tiers and multipliers; no stacking); update "Features" and "Progress" (Step 2B complete once merged); answer the open questions "Loyalty card" and "Dealer membership" with the chosen defaults marked as placeholders; replace the `BRAND.loyaltyTiers` mention with the admin setting.
- [ ] **Step 3: `docs/ui-system.md`.** Add the new shared pieces: `MemberCardView`, `TierSteps`, `TierChip`, `DealerPriceInline`, `DealerPriceBlock`, `DealerNudge`, `DealerAppliedNotice`, `useDealer`, `useDealerUnit`, `useDealerQuote`, `useLoyaltyStatus`.
- [ ] **Step 4: Full verification.** `npm test` (all), `npm run build`, type check (baseline only), `npx eslint` on every file changed on the branch (`git diff --name-only main...HEAD -- '*.ts' '*.tsx'`): no new errors versus `main`. Load `/`, `/products`, a product page, `/wallet` signed out and `/admin` signed out in Playwright at 390 and 1440: 0 console errors.
- [ ] **Step 5: Commit**

```bash
git add -u src/App.tsx CLIENT.md docs/ui-system.md docs/HANDOFF.md
git commit -m "Dealer Membership and Loyalty card: client notes, UI system docs, mockups removed"
```

---

## After the build (controller steps, not subagent tasks)

1. **Money-logic review** of `git diff main...dealer-loyalty` focused on: dealer price only for approved dealers (rules + server), no self-approval, dealer prices private, quote parity between browser and server, threshold edge cases, no stacking (coupon, points, cashback, earn, scratch), tier spend unforgeable, multiplier once per order, rounding, and regressions to retail checkout and rewards. Fix confirmed findings with tests; write the report to `docs/superpowers/reviews/2026-10-05-dealer-loyalty-money-review.md`.
2. **Rules deploy and live test** (owner's OK given 2026-10-05): `node docs/handoff/deploy-rules.mjs`; write `docs/handoff/dealer-loyalty-live.mjs` from `scratch-win-live.mjs` (REST as the shopper for rule checks; in-process real handlers; fake Razorpay; screenshots at 390 and 1440 light and dark; full cleanup in `finally`, restoring `siteSettings/dealer`, `dealerPricing/current`, `siteSettings/rewards` and the shopper's ledger exactly as found) and run it.
3. **Merge** `dealer-loyalty` into `main` with `--no-ff` (local only), then `npm test` and `npm run build` on `main`, update `docs/HANDOFF.md`.

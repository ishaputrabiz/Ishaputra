# Rewards Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers earn loyalty points on delivered orders and hold wallet cashback, and can spend both at checkout. Balances and totals are enforced on the server.

**Architecture:**
- **Ledger:** an append-only ledger per customer (`users/{uid}/rewardLedger`) whose balance is always calculated from its entries.
- **Shared rules:** pure functions in `src/lib/rewards.ts`, copied verbatim into the standalone `api/` functions.
- **Server:** `api/create-order.ts` prices the redemption, `api/verify-payment.ts` records the spend, and a new `reconcile-rewards` action in `api/notify-order.ts` keeps earn, void and refund entries in step with order status.

**Tech Stack:**
- React 18, Vite 5, TypeScript, Tailwind
- Firebase web SDK 12 (browser) and firebase-admin (server)
- Vercel functions and Razorpay
- `node --test`, which runs TypeScript natively on Node 22

Spec: `docs/superpowers/specs/2026-09-29-rewards-ledger-design.md`

## Global Constraints

- No new files in `api/`: all 12 Vercel Hobby functions are used. Changes go into existing function files only.
- `api/*.ts` imports nothing from `src/`. The shared logic is copied between `// >>> rewards-core` and `// <<< rewards-core` markers.
- `api/verify-payment.ts` must still verify signatures if `firebase-admin` fails. Load it only after the signature passes, with a dynamic `import()` inside try/catch.
- A reward failure never blocks a payment or an order.
- Default settings (TODO(client)): `enabled: true`, `pointsPer100: 1`, `pointValue: 1`, `unlockDays: 7`, `maxPointsPercent: 20`.
- At least ₹1 always stays payable; points are capped at `maxPointsPercent` of the product amount after the coupon.
- Entry IDs: `earn_<orderId>`, `spend_<razorpayOrderId>_<currency>`, `refund_<orderId>_<currency>`, `adjust_<base36time>_<rand5>`.
- Customer-facing UI uses the Step 2 design tokens (`tx-sheet`, `panel`, `btn-copper`, `eyebrow-no`, `text-primary`). Admin UI follows the existing admin panel styling.
- Never push; local commits only. Never touch port 5173 or the Sreerasthu project.

---

### Task 1: Shared reward rules

**Files:**
- Create: `src/lib/rewards.ts`
- Create: `tests/rewards.test.ts`
- Modify: `package.json` (add a `test` script)

**Interfaces:**
- Produces:
    - Types: `RewardCurrency`, `RewardSettings`, `LedgerLike { currency; amount; status; unlockAtMs }`, `RewardBalances`, `RedemptionInput`, `Redemption { points; pointsValue; cashback; payable }`.
    - `DEFAULT_REWARD_SETTINGS`
    - `normaliseRewardSettings(raw): RewardSettings`
    - `summariseRewards(entries, nowMs): RewardBalances`
    - `computeRedemption(input): Redemption`
    - `pointsForOrder(order, settings): number`

- [ ] **Step 1: Write the failing tests** in `tests/rewards.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  summariseRewards,
  computeRedemption,
  pointsForOrder,
  type RewardBalances,
} from '../src/lib/rewards.ts';

const S = DEFAULT_REWARD_SETTINGS;
const bal = (points: number, cashback: number): RewardBalances => ({
  points: { available: points, pending: 0 },
  cashback: { available: cashback, pending: 0 },
});
const base = { subtotal: 1000, couponDiscount: 0, deliveryCharge: 0, gstOnTop: 0, settings: S };

test('normaliseRewardSettings fills defaults and clamps', () => {
  assert.deepEqual(normaliseRewardSettings(null), S);
  const n = normaliseRewardSettings({ enabled: false, pointsPer100: -5, maxPointsPercent: 250, unlockDays: 'x' as unknown as number });
  assert.equal(n.enabled, false);
  assert.equal(n.pointsPer100, 0);
  assert.equal(n.maxPointsPercent, 100);
  assert.equal(n.unlockDays, S.unlockDays);
});

test('summariseRewards splits available and pending, skips void', () => {
  const now = 1_000_000;
  const b = summariseRewards([
    { currency: 'points', amount: 50, status: 'active', unlockAtMs: now - 1 },
    { currency: 'points', amount: 30, status: 'active', unlockAtMs: now + 1 },
    { currency: 'points', amount: -10, status: 'active', unlockAtMs: now },
    { currency: 'points', amount: 999, status: 'void', unlockAtMs: 0 },
    { currency: 'cashback', amount: 120, status: 'active', unlockAtMs: 0 },
  ], now);
  assert.deepEqual(b, { points: { available: 40, pending: 30 }, cashback: { available: 120, pending: 0 } });
});

test('points are capped at maxPointsPercent of products after coupon', () => {
  const r = computeRedemption({ ...base, couponDiscount: 100, deliveryCharge: 50, balances: bal(500, 0), usePoints: true, useCashback: false });
  assert.deepEqual(r, { points: 180, pointsValue: 180, cashback: 0, payable: 770 });
});

test('points are limited by the balance', () => {
  const r = computeRedemption({ ...base, balances: bal(50, 0), usePoints: true, useCashback: false });
  assert.equal(r.points, 50);
  assert.equal(r.payable, 950);
});

test('cashback comes after points, covers delivery, keeps ₹1 payable', () => {
  const r = computeRedemption({ ...base, subtotal: 100, deliveryCharge: 50, balances: bal(0, 1000), usePoints: false, useCashback: true });
  assert.deepEqual(r, { points: 0, pointsValue: 0, cashback: 149, payable: 1 });
});

test('nothing is redeemed when rewards are off or toggles are off', () => {
  const off = normaliseRewardSettings({ enabled: false });
  assert.equal(computeRedemption({ ...base, settings: off, balances: bal(500, 500), usePoints: true, useCashback: true }).payable, 1000);
  assert.equal(computeRedemption({ ...base, balances: bal(500, 500), usePoints: false, useCashback: false }).payable, 1000);
});

test('fractional point value converts the cap into more points', () => {
  const half = normaliseRewardSettings({ pointValue: 0.5 });
  const r = computeRedemption({ ...base, settings: half, balances: bal(1000, 0), usePoints: true, useCashback: false });
  assert.equal(r.points, 400);
  assert.equal(r.pointsValue, 200);
  assert.equal(r.payable, 800);
});

test('pointsForOrder earns on the product amount only', () => {
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50, taxAmount: 0 }, S), 9);
  assert.equal(pointsForOrder({ total: 1079, deliveryCharge: 50, taxAmount: 30 }, S), 9);
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50, taxAmount: 30, gstInclusive: true }, S), 9);
  assert.equal(pointsForOrder({ total: 1049, deliveryCharge: 50 }, normaliseRewardSettings({ enabled: false })), 0);
});
```

- [ ] **Step 2: Add the script and run it to see it fail.** Add `"test": "node --test \"tests/**/*.test.ts\""` to `scripts` in `package.json`, then run `npm test`.
  Expected: FAIL, because `src/lib/rewards.ts` doesn't exist.

- [ ] **Step 3: Implement `src/lib/rewards.ts`**

```ts
/**
 * Loyalty points + wallet cashback rules, shared by the storefront and the
 * payment functions. Pure and dependency-free.
 *
 * The block between the rewards-core markers is copied verbatim into
 * api/create-order.ts and api/notify-order.ts (api/ files import nothing from
 * src/). tests/rewards-parity.test.ts fails if a copy drifts.
 */

// >>> rewards-core
type RewardCurrency = 'points' | 'cashback';

interface RewardSettings {
  enabled: boolean;
  /** Points earned per ₹100 paid for products. */
  pointsPer100: number;
  /** Rupee value of one point. */
  pointValue: number;
  /** Days after delivery before earned points can be spent (the return window). */
  unlockDays: number;
  /** Share of the product amount (after coupon) that points may cover, in percent. */
  maxPointsPercent: number;
}

// TODO(client): placeholders until Ishaputra confirms its rules.
const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  enabled: true,
  pointsPer100: 1,
  pointValue: 1,
  unlockDays: 7,
  maxPointsPercent: 20,
};

interface LedgerLike {
  currency: RewardCurrency;
  amount: number;
  status: 'active' | 'void';
  unlockAtMs: number;
}

interface RewardBalances {
  points: { available: number; pending: number };
  cashback: { available: number; pending: number };
}

function normaliseRewardSettings(raw: Partial<RewardSettings> | null | undefined): RewardSettings {
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const d = DEFAULT_REWARD_SETTINGS;
  return {
    enabled: raw?.enabled === undefined ? d.enabled : raw.enabled === true,
    pointsPer100: num(raw?.pointsPer100, d.pointsPer100, 0, 100),
    pointValue: num(raw?.pointValue, d.pointValue, 0, 100),
    unlockDays: num(raw?.unlockDays, d.unlockDays, 0, 365),
    maxPointsPercent: num(raw?.maxPointsPercent, d.maxPointsPercent, 0, 100),
  };
}

function summariseRewards(entries: LedgerLike[], nowMs: number): RewardBalances {
  const out: RewardBalances = {
    points: { available: 0, pending: 0 },
    cashback: { available: 0, pending: 0 },
  };
  for (const e of entries) {
    if (e.status !== 'active') continue;
    const bucket = out[e.currency];
    if (!bucket) continue;
    const amount = Number(e.amount) || 0;
    if (e.unlockAtMs <= nowMs) bucket.available += amount;
    else bucket.pending += amount;
  }
  return out;
}

interface RedemptionInput {
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  gstOnTop: number;
  balances: RewardBalances;
  settings: RewardSettings;
  usePoints: boolean;
  useCashback: boolean;
}

interface Redemption {
  points: number;
  pointsValue: number;
  cashback: number;
  /** Left to pay; redemptions never take it below ₹1 (Razorpay's minimum). */
  payable: number;
}

function computeRedemption(i: RedemptionInput): Redemption {
  const s = i.settings;
  const productsAfterCoupon = Math.max(0, i.subtotal - i.couponDiscount);
  let payable = Math.max(0, productsAfterCoupon + i.deliveryCharge + i.gstOnTop);
  let points = 0;
  let pointsValue = 0;
  let cashback = 0;
  if (s.enabled && i.usePoints && s.pointValue > 0) {
    const capRupees = Math.floor((productsAfterCoupon * s.maxPointsPercent) / 100);
    const rupees = Math.max(0, Math.min(capRupees, Math.floor(payable - 1)));
    const affordable = Math.floor(rupees / s.pointValue);
    points = Math.max(0, Math.min(Math.floor(i.balances.points.available), affordable));
    pointsValue = points * s.pointValue;
    payable -= pointsValue;
  }
  if (s.enabled && i.useCashback) {
    cashback = Math.max(0, Math.min(Math.floor(i.balances.cashback.available), Math.floor(payable - 1)));
    payable -= cashback;
  }
  return { points, pointsValue, cashback, payable };
}

function pointsForOrder(
  order: { total?: number; deliveryCharge?: number; taxAmount?: number; gstInclusive?: boolean },
  s: RewardSettings,
): number {
  if (!s.enabled) return 0;
  const tax = order.gstInclusive ? 0 : Number(order.taxAmount) || 0;
  const base = (Number(order.total) || 0) - (Number(order.deliveryCharge) || 0) - tax;
  return Math.max(0, Math.floor((base / 100) * s.pointsPer100));
}
// <<< rewards-core

export type { RewardCurrency, RewardSettings, LedgerLike, RewardBalances, RedemptionInput, Redemption };
export { DEFAULT_REWARD_SETTINGS, normaliseRewardSettings, summariseRewards, computeRedemption, pointsForOrder };
```

- [ ] **Step 4: Run the tests.** Run `npm test`. Expected: 8 pass, 0 fail.
- [ ] **Step 5: Commit** with message `Rewards: shared rules (points, cashback, redemption) with tests`.

---

### Task 2: Lock down ledger security; remove the unsafe wallet code

**Files:**
- Modify: `firestore.rules` (the `users/{userId}` subcollections `wallets`, `transactions`, `rewards`; add `rewardLedger`)
- Delete: `src/services/walletService.ts`, `src/types/wallet.ts`
- Scratch (not committed): `deploy-rules.mjs`, `rules-check.mjs`

- [ ] **Step 1:** In `firestore.rules`, replace the `wallets`, `transactions` and `rewards` blocks under `match /users/{userId}` with:

```
      // Legacy wallet structure (unused). Admin-only writes: the old rules let a
      // customer update their own balance.
      match /wallets/{walletId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update: if isAdmin();
        allow delete: if false;
      }
      match /transactions/{txId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update: if isAdmin();
        allow delete: if false;
      }
      match /rewards/{rewardId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update: if isAdmin();
        allow delete: if false;
      }

      // --- REWARD LEDGER (loyalty points + wallet cashback) ---
      // Balance = sum of active entries (src/lib/rewards.ts). Customers only
      // read. Admins add entries and may void one; the payment functions write
      // through the Admin SDK. Entries are never otherwise edited or deleted.
      match /rewardLedger/{entryId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create: if isAdmin();
        allow update: if isAdmin()
          && resource.data.status == 'active'
          && request.resource.data.status == 'void'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'voidedAt', 'voidedBy']);
        allow delete: if false;
      }
```

- [ ] **Step 2:** Delete both unused files: `git rm src/services/walletService.ts src/types/wallet.ts`. Then check nothing references them: `grep -rn "walletService\|types/wallet" src api` should print nothing.
- [ ] **Step 3:** Run a type check: `npx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0`. Expected: only the known old errors (videoCallService, invoiceService, DeliveryDashboard, VideoCallRequestModal).
- [ ] **Step 4:** Deploy the rules with the Admin SDK (the Firebase CLI is logged in to another account). Scratch `deploy-rules.mjs`, run from `ssecommerce/`:

```js
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config();
const admin = require('firebase-admin');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const source = fs.readFileSync('firestore.rules', 'utf8');
const rs = await admin.securityRules().releaseFirestoreRulesetFromSource(source);
console.log('released', rs.name);
process.exit(0);
```

- [ ] **Step 5:** Confirm the rules from the customer's side. Scratch `rules-check.mjs` signs in the test shopper (credentials in scratch `shopper.json`) through the Identity Toolkit REST API, then:
    - `GET users/{uid}/rewardLedger` should return **200**;
    - `POST users/{uid}/rewardLedger?documentId=selfcredit` should return **403**.

```js
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config();
const creds = JSON.parse(readFileSync(new URL('./shopper.json', import.meta.url), 'utf8'));
const KEY = process.env.VITE_FIREBASE_API_KEY, P = process.env.VITE_FIREBASE_PROJECT_ID;
const s = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
})).json();
const H = { Authorization: `Bearer ${s.idToken}`, 'Content-Type': 'application/json' };
const base = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/users/${s.localId}/rewardLedger`;
const read = await fetch(base, { headers: H });
const write = await fetch(`${base}?documentId=selfcredit`, { method: 'POST', headers: H,
  body: JSON.stringify({ fields: { currency: { stringValue: 'cashback' }, amount: { integerValue: '5000' }, status: { stringValue: 'active' } } }) });
console.log('read', read.status, '(expect 200)', 'self-credit', write.status, '(expect 403)');
```

- [ ] **Step 6: Commit** with message `Rewards: ledger security rules; lock legacy wallet writes, remove unused wallet code`.

---

### Task 3: Browser service and hook

**Files:**
- Create: `src/services/rewardsService.ts`
- Create: `src/hooks/useRewards.ts`

**Interfaces:**
- Consumes (Task 1): `normaliseRewardSettings`, `summariseRewards`, `DEFAULT_REWARD_SETTINGS`, and types.
- Produces:
    - Type `RewardKind`.
    - `RewardEntry extends LedgerLike { id; kind; note; orderId?; razorpayOrderId?; createdAtMs; createdBy }`.
    - `subscribeRewardLedger(uid, cb, onError?)`
    - `subscribeRewardSettings(cb)`
    - `getRewardSettings()`
    - `saveRewardSettings(s)`
    - `adminAdjustRewards(uid, { currency, amount, note })`
    - `reconcileOrderRewards(orderId): Promise<{ ok: boolean; detail?: string }>`
    - `useRewards(uid?)`, which returns `{ entries, balances, settings, loading }`.

- [ ] **Step 1: Create `src/services/rewardsService.ts`**

```ts
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import {
  DEFAULT_REWARD_SETTINGS,
  normaliseRewardSettings,
  type LedgerLike,
  type RewardCurrency,
  type RewardSettings,
} from '@/lib/rewards';

/**
 * Loyalty points + wallet cashback, browser side. The ledger is read-only for
 * customers (firestore.rules); points are earned, spent and refunded by the
 * payment functions and the reconcile action in api/notify-order.ts.
 */

export type RewardKind = 'earn' | 'spend' | 'refund' | 'adjust';

export interface RewardEntry extends LedgerLike {
  id: string;
  kind: RewardKind;
  note: string;
  orderId?: string;
  razorpayOrderId?: string;
  createdAtMs: number;
  createdBy: string;
}

const millis = (v: unknown): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

const toEntry = (id: string, d: Record<string, any>): RewardEntry => ({
  id,
  currency: d.currency === 'cashback' ? 'cashback' : 'points',
  amount: Number(d.amount) || 0,
  status: d.status === 'void' ? 'void' : 'active',
  // A just-written admin entry has no server time yet: treat it as unlocked.
  unlockAtMs: millis(d.unlockAt),
  kind: (d.kind || 'adjust') as RewardKind,
  note: String(d.note || ''),
  orderId: d.orderId,
  razorpayOrderId: d.razorpayOrderId,
  createdAtMs: millis(d.createdAt) || Date.now(),
  createdBy: String(d.createdBy || ''),
});

const ledgerRef = (uid: string) => collection(db, 'users', uid, 'rewardLedger');
const settingsRef = () => doc(db, 'siteSettings', 'rewards');

/** Live ledger for one customer, newest first. */
export const subscribeRewardLedger = (
  uid: string,
  cb: (entries: RewardEntry[]) => void,
  onError?: (err: Error) => void,
) =>
  onSnapshot(
    query(ledgerRef(uid), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => toEntry(d.id, d.data()))),
    (err) => {
      console.error('[rewards] ledger listener failed:', err);
      onError?.(err);
      cb([]);
    },
  );

export const subscribeRewardSettings = (cb: (s: RewardSettings) => void) =>
  onSnapshot(
    settingsRef(),
    (snap) => cb(normaliseRewardSettings(snap.exists() ? (snap.data() as Partial<RewardSettings>) : null)),
    () => cb(DEFAULT_REWARD_SETTINGS),
  );

export const getRewardSettings = async (): Promise<RewardSettings> => {
  const snap = await getDoc(settingsRef());
  return normaliseRewardSettings(snap.exists() ? (snap.data() as Partial<RewardSettings>) : null);
};

export const saveRewardSettings = (s: RewardSettings) =>
  setDoc(settingsRef(), { ...normaliseRewardSettings(s), updatedAt: serverTimestamp() });

/** Admin: credit (+) or debit (−) a customer's points or cashback by hand. */
export const adminAdjustRewards = async (
  uid: string,
  input: { currency: RewardCurrency; amount: number; note: string },
) => {
  const amount = Math.trunc(Number(input.amount));
  if (!amount) throw new Error('Enter a non-zero amount');
  const note = input.note.trim();
  if (!note) throw new Error('A reason is required');
  const id = `adjust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await setDoc(doc(ledgerRef(uid), id), {
    currency: input.currency,
    amount,
    kind: 'adjust',
    status: 'active',
    unlockAt: serverTimestamp(),
    note,
    createdAt: serverTimestamp(),
    createdBy: `admin:${auth.currentUser?.uid || 'unknown'}`,
  });
};

/**
 * Ask the server to bring this order's points/cashback in line with its
 * status (earn on delivery, void + refund on cancel/return). Idempotent, so it
 * is safe after every status change. Never throws.
 */
export async function reconcileOrderRewards(orderId: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const current = auth.currentUser;
    if (!current) return { ok: false, detail: 'Not signed in' };
    const idToken = await current.getIdToken();
    const res = await fetch('/api/notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'reconcile-rewards', orderId }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, detail: data?.error || `HTTP ${res.status}` };
  } catch (err) {
    console.warn('[rewards] reconcile failed:', err);
    return { ok: false, detail: err instanceof Error ? err.message : 'Network error' };
  }
}
```

- [ ] **Step 2: Create `src/hooks/useRewards.ts`**

```ts
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REWARD_SETTINGS,
  summariseRewards,
  type RewardBalances,
  type RewardSettings,
} from '@/lib/rewards';
import { subscribeRewardLedger, subscribeRewardSettings, type RewardEntry } from '@/services/rewardsService';

const EMPTY: RewardBalances = { points: { available: 0, pending: 0 }, cashback: { available: 0, pending: 0 } };

/** A customer's live reward ledger, balances and the shop's reward settings. */
export function useRewards(uid?: string | null) {
  const [entries, setEntries] = useState<RewardEntry[]>([]);
  const [settings, setSettings] = useState<RewardSettings>(DEFAULT_REWARD_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeRewardSettings(setSettings), []);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeRewardLedger(uid, (next) => {
      setEntries(next);
      setLoading(false);
    });
  }, [uid]);

  // Pending points unlock by date alone, so re-evaluate every minute.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const balances = useMemo(() => (uid ? summariseRewards(entries, now) : EMPTY), [uid, entries, now]);
  return { entries, balances, settings, loading };
}
```

- [ ] **Step 3:** Run the type check (only the known errors) and `npm test` (still passes).
- [ ] **Step 4: Commit** with message `Rewards: browser service and useRewards hook`.

---

### Task 4: Server reconcile action and status-change triggers

**Files:**
- Modify: `api/notify-order.ts`:
    - add the rewards-core block (verbatim from `src/lib/rewards.ts`, without the two `export` lines);
    - add the helpers and the exported `reconcileRewards`;
    - add an `action: 'reconcile-rewards'` branch.
- Modify: `src/services/orderService.ts`: call `reconcileOrderRewards` after the status write in `updateOrderStatus`, `verifyDeliveryOTP`, `verifyReturnToStoreOTP`, `cancelOrder`, `rejectReturn` and `cancelReturn`.
- Scratch: `reconcile-check.mjs`

**Interfaces:**
- Consumes: the core functions (copied), and `reconcileOrderRewards` from Task 3.
- Produces:
    - `export async function reconcileRewards(db, orderId, order): Promise<{ changed: string[]; skipped?: string }>` in `api/notify-order.ts`;
    - the `POST /api/notify-order { action: 'reconcile-rewards', orderId }` endpoint.

- [ ] **Step 1:** In `api/notify-order.ts`, after `initAdmin`, insert the rewards-core block (copied exactly), followed by:

```ts
const ENDED_STATUSES = ['cancelled', 'returned', 'refunded'];
const DAY_MS = 86_400_000;

const isAlreadyExists = (err: any) => err?.code === 6 || /already exists/i.test(String(err?.message || ''));

/** Create a ledger entry unless one with this id exists. Returns true when it wrote. */
async function createOnce(ref: admin.firestore.DocumentReference, data: Record<string, unknown>): Promise<boolean> {
  try {
    await ref.create(data);
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

/** Notes stored on a Razorpay order by api/create-order.ts (rw_uid, rw_points, rw_cashback). */
async function razorpayNotes(razorpayOrderId: string): Promise<Record<string, string> | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { notes?: Record<string, string> };
  return data.notes || {};
}

const spendNote = (currency: RewardCurrency, amount: number) =>
  currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`;

/**
 * Bring a customer's reward ledger in line with one order. Idempotent:
 * deterministic entry ids + create-once, so running it twice changes nothing.
 *   paid       → spend entries exist (from the Razorpay order notes)
 *   delivered  → earn_<orderId> exists, pending until deliveredAt + unlockDays
 *   cancelled / returned / refunded → pending earn voided, spends refunded
 */
export async function reconcileRewards(
  db: admin.firestore.Firestore,
  orderId: string,
  order: Record<string, any>,
): Promise<{ changed: string[]; skipped?: string }> {
  const uid = String(order.userId || '');
  if (!uid) return { changed: [], skipped: 'no_customer' };

  const settingsSnap = await db.collection('siteSettings').doc('rewards').get();
  const settings = normaliseRewardSettings(
    settingsSnap.exists ? (settingsSnap.data() as Partial<RewardSettings>) : null,
  );
  const ledger = db.collection('users').doc(uid).collection('rewardLedger');
  const now = admin.firestore.Timestamp.now();
  const status = String(order.status || '');
  const changed: string[] = [];

  // 1. Spends for a paid order (normally already written by verify-payment).
  const spends: Record<RewardCurrency, number> = { points: 0, cashback: 0 };
  const rzp = String(order.razorpayOrderId || '');
  if (rzp) {
    const refs = {
      points: ledger.doc(`spend_${rzp}_points`),
      cashback: ledger.doc(`spend_${rzp}_cashback`),
    };
    const [p, c] = await Promise.all([refs.points.get(), refs.cashback.get()]);
    if (p.exists) spends.points = -Number(p.data()?.amount || 0);
    if (c.exists) spends.cashback = -Number(c.data()?.amount || 0);
    if (!p.exists && !c.exists) {
      const notes = await razorpayNotes(rzp);
      if (notes && notes.rw_uid === uid) {
        for (const currency of ['points', 'cashback'] as const) {
          const amount = Math.floor(Number(notes[`rw_${currency}`]) || 0);
          if (amount <= 0) continue;
          const wrote = await createOnce(refs[currency], {
            currency, amount: -amount, kind: 'spend', status: 'active', unlockAt: now,
            razorpayOrderId: rzp, orderId, note: spendNote(currency, amount),
            createdAt: now, createdBy: 'server',
          });
          if (wrote) changed.push(refs[currency].id);
          spends[currency] = amount;
        }
      }
    }
  }

  // 2. Earn on delivery, pending through the return window.
  const earnRef = ledger.doc(`earn_${orderId}`);
  if (status === 'delivered' && settings.enabled) {
    const points = pointsForOrder(order, settings);
    if (points > 0) {
      const deliveredAt =
        typeof order.deliveredAt?.toMillis === 'function' ? order.deliveredAt.toMillis() : now.toMillis();
      const wrote = await createOnce(earnRef, {
        currency: 'points', amount: points, kind: 'earn', status: 'active',
        unlockAt: admin.firestore.Timestamp.fromMillis(deliveredAt + settings.unlockDays * DAY_MS),
        orderId, note: `Earned on order ${order.orderId || orderId}`,
        createdAt: now, createdBy: 'server',
      });
      if (wrote) {
        changed.push(earnRef.id);
        await db.collection('orders').doc(orderId).update({ pointsEarned: points });
      }
    }
  }

  // 3. Cancelled / returned / refunded: void pending earn, refund what was spent.
  if (ENDED_STATUSES.includes(status)) {
    const earn = await earnRef.get();
    const e = earn.data();
    if (earn.exists && e?.status === 'active' && typeof e.unlockAt?.toMillis === 'function' && e.unlockAt.toMillis() > now.toMillis()) {
      await earnRef.update({ status: 'void', voidedAt: now, voidedBy: 'server' });
      changed.push(`${earnRef.id}:void`);
    }
    for (const currency of ['points', 'cashback'] as const) {
      const amount = spends[currency];
      if (amount <= 0) continue;
      const ref = ledger.doc(`refund_${orderId}_${currency}`);
      const wrote = await createOnce(ref, {
        currency, amount, kind: 'refund', status: 'active', unlockAt: now, orderId,
        note: currency === 'points'
          ? `${amount} points returned: order ${order.orderId || orderId} ${status}`
          : `₹${amount} cashback returned: order ${order.orderId || orderId} ${status}`,
        createdAt: now, createdBy: 'server',
      });
      if (wrote) changed.push(ref.id);
    }
  }

  return { changed };
}
```

- [ ] **Step 2:** In the handler:
    - Widen the `body` type to include `action?: string`.
    - Compute `const isReconcile = body.action === 'reconcile-rewards';`.
    - Run the `audience` and `title/body` validation only when `!isReconcile`.
    - After the authorisation block, and before resolving recipient tokens, insert:

```ts
  if (isReconcile) {
    try {
      const result = await reconcileRewards(db, orderId, order);
      return res.status(200).json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ error: 'Reward reconcile failed', detail: err?.message || String(err) });
    }
  }
```

- [ ] **Step 3:** In `src/services/orderService.ts`:
    - Add `import { reconcileOrderRewards } from '@/services/rewardsService';`.
    - In each of the six functions, add `void reconcileOrderRewards(orderId);` right after the successful `updateDoc(...)` of the new status (before the notifications). In `updateOrderStatus` that means after `await updateDoc(docRef, updateData);`.
- [ ] **Step 4:** Check reconcile against the preview project. Scratch `reconcile-check.mjs` (run from `ssecommerce/`):
    - It imports `reconcileRewards` from `./api/notify-order.ts` (Node strips the types).
    - It creates a test order `orders/rwtest-<ts>` for the shopper `{ userId, orderId: 'RW-TEST', status: 'delivered', total: 1049, deliveryCharge: 50, taxAmount: 0, deliveredAt: now, razorpayOrderId: 'order_rwtest_<ts>', demo: true }`.
    - It pre-writes `spend_order_rwtest_<ts>_points` (−10) and `…_cashback` (−20).
    - It then asserts:
        - the first reconcile gives `changed === ['earn_rwtest-<ts>']`, with an amount of 9 pending;
        - the second reconcile gives `changed === []`;
        - after setting `status: 'cancelled'`, reconcile gives `['earn_…:void', 'refund_…_points', 'refund_…_cashback']`, with refunds of +10 and +20;
        - reconcile again gives `[]`.
    - Finally it deletes the test order and its ledger entries.

```js
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const require = createRequire(`${process.cwd()}/package.json`);
require('dotenv').config();
const admin = require('firebase-admin');
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, 'base64').toString('utf8'));
if (sa.project_id !== 'ishaputrabotanicals') throw new Error(`refusing: ${sa.project_id}`);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const { reconcileRewards } = await import(`${process.cwd()}/api/notify-order.ts`);
const db = admin.firestore();
const creds = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const uid = (await admin.auth().getUserByEmail(creds.email)).uid;
const ts = Date.now(), orderId = `rwtest-${ts}`, rzp = `order_rwtest_${ts}`;
const now = admin.firestore.Timestamp.now();
const ledger = db.collection('users').doc(uid).collection('rewardLedger');
const orderRef = db.collection('orders').doc(orderId);
await orderRef.set({ userId: uid, orderId: 'RW-TEST', status: 'delivered', total: 1049, deliveryCharge: 50, taxAmount: 0, deliveredAt: now, razorpayOrderId: rzp, demo: true });
for (const [c, a] of [['points', -10], ['cashback', -20]]) {
  await ledger.doc(`spend_${rzp}_${c}`).set({ currency: c, amount: a, kind: 'spend', status: 'active', unlockAt: now, razorpayOrderId: rzp, note: 'test', createdAt: now, createdBy: 'server' });
}
const run = async () => reconcileRewards(db, orderId, (await orderRef.get()).data());
try {
  assert.deepEqual((await run()).changed, [`earn_${orderId}`]);
  const earn = (await ledger.doc(`earn_${orderId}`).get()).data();
  assert.equal(earn.amount, 9); assert.ok(earn.unlockAt.toMillis() > Date.now());
  assert.deepEqual((await run()).changed, []);
  await orderRef.update({ status: 'cancelled' });
  assert.deepEqual((await run()).changed, [`earn_${orderId}:void`, `refund_${orderId}_points`, `refund_${orderId}_cashback`]);
  assert.equal((await ledger.doc(`refund_${orderId}_points`).get()).data().amount, 10);
  assert.equal((await ledger.doc(`refund_${orderId}_cashback`).get()).data().amount, 20);
  assert.deepEqual((await run()).changed, []);
  console.log('reconcile check: PASS');
} finally {
  for (const id of [`earn_${orderId}`, `refund_${orderId}_points`, `refund_${orderId}_cashback`, `spend_${rzp}_points`, `spend_${rzp}_cashback`]) await ledger.doc(id).delete();
  await orderRef.delete();
}
process.exit(0);
```

   Run: `node <scratch>/reconcile-check.mjs <scratch>/shopper.json`. Expected: `reconcile check: PASS`.
- [ ] **Step 5:** Type check, then **commit** with message `Rewards: server reconcile action; trigger it after every order status change`.

---

### Task 5: Server-side redemption and spend recording

**Files:**
- Modify: `api/create-order.ts`:
    - rewards-core block;
    - `priceRewards`;
    - body flags;
    - `rw_*` notes;
    - 409 on failure;
    - response fields.
- Modify: `api/verify-payment.ts` (`recordRewardSpend`, lazy `firebase-admin`)
- Create: `tests/rewards-parity.test.ts`

**Interfaces:**
- Consumes: the rewards-core block (Task 1).
- Produces:
    - `POST /api/create-order` body gains `usePoints?: boolean; useCashback?: boolean`. The response gains `pointsApplied: number; cashbackApplied: number`. A 409 `{ code: 'rewards_unavailable' }` is returned when rewards can't be priced.
    - The `verify-payment` response gains `rewardsPending?: true`.

- [ ] **Step 1: Write the failing parity test** `tests/rewards-parity.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const block = (path: string) => {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf('// >>> rewards-core');
  const end = text.indexOf('// <<< rewards-core');
  assert.ok(start >= 0 && end > start, `${path} has no rewards-core block`);
  return text.slice(start, end);
};

test('api copies of rewards-core match src/lib/rewards.ts', () => {
  const source = block('src/lib/rewards.ts');
  for (const copy of ['api/create-order.ts', 'api/notify-order.ts']) {
    assert.equal(block(copy), source, `${copy} has drifted from src/lib/rewards.ts`);
  }
});
```

   Run `npm test`. Expected: FAIL (`api/create-order.ts has no rewards-core block`).

- [ ] **Step 2:** In `api/create-order.ts`, below `setCors`, insert the rewards-core block, and then:

```ts
/**
 * Price the customer's opted-in points/cashback. Needs the Admin SDK (the
 * ledger is private), loaded only on this path so an ordinary checkout never
 * depends on it. Throws when it cannot price safely; the caller answers 409.
 */
async function priceRewards(
  req: VercelRequest,
  input: Omit<RedemptionInput, 'balances' | 'settings'>,
): Promise<Redemption & { uid: string }> {
  const header = String(req.headers.authorization || '');
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) throw new Error('Sign in again to use your rewards');
  const { default: admin } = await import('firebase-admin');
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64 || '', 'base64').toString('utf8')),
        ),
      });
  const { uid } = await admin.auth(app).verifyIdToken(idToken);
  const db = admin.firestore(app);
  const [settingsSnap, ledgerSnap] = await Promise.all([
    db.collection('siteSettings').doc('rewards').get(),
    db.collection('users').doc(uid).collection('rewardLedger').get(),
  ]);
  const settings = normaliseRewardSettings(
    settingsSnap.exists ? (settingsSnap.data() as Partial<RewardSettings>) : null,
  );
  const balances = summariseRewards(
    ledgerSnap.docs.map((d) => {
      const x = d.data();
      return {
        currency: x.currency === 'cashback' ? 'cashback' : 'points',
        amount: Number(x.amount) || 0,
        status: x.status === 'void' ? 'void' : 'active',
        unlockAtMs: typeof x.unlockAt?.toMillis === 'function' ? x.unlockAt.toMillis() : 0,
      } as LedgerLike;
    }),
    Date.now(),
  );
  return { uid, ...computeRedemption({ ...input, balances, settings }) };
}
```

- [ ] **Step 3:** In the handler:
    - Add `usePoints?: boolean; useCashback?: boolean;` to the `body` type.
    - Declare `let parts = { subtotal: 0, discount: 0, deliveryCharge: 0, gstAmount: 0 };` before `let serverTotal`, and set `parts = { subtotal, discount, deliveryCharge, gstAmount };` just before `serverTotal = ...` inside the try.
    - After the pricing try/catch, and before `amountInPaise`, insert:

```ts
  // ── Loyalty points / wallet cashback (only when the customer opted in) ──
  let pointsApplied = 0;
  let cashbackApplied = 0;
  let rewardNotes: Record<string, string> = {};
  if (body.usePoints === true || body.useCashback === true) {
    try {
      const r = await priceRewards(req, {
        subtotal: parts.subtotal,
        couponDiscount: parts.discount,
        deliveryCharge: parts.deliveryCharge,
        gstOnTop: parts.gstAmount,
        usePoints: body.usePoints === true,
        useCashback: body.useCashback === true,
      });
      pointsApplied = r.points;
      cashbackApplied = r.cashback;
      serverTotal = r.payable;
      if (r.points > 0 || r.cashback > 0) {
        rewardNotes = { rw_uid: r.uid, rw_points: String(r.points), rw_cashback: String(r.cashback) };
      }
    } catch (error: unknown) {
      return res.status(409).json({
        code: 'rewards_unavailable',
        error: 'Rewards are unavailable right now. Your balance is safe - pay without them or try again shortly.',
        detail: error instanceof Error ? error.message : 'Unknown rewards error',
      });
    }
  }
```

    - Replace the Razorpay `notes` spread so that client-supplied `rw_*` keys are dropped, and the server's are added:

```ts
    const clientNotes = Object.fromEntries(
      Object.entries(body.notes || {}).filter(([k]) => !k.startsWith('rw_')),
    );
    const notes = { ...clientNotes, ...rewardNotes };
```

   Use `...(Object.keys(notes).length ? { notes } : {})` in the Razorpay request body, and add `pointsApplied, cashbackApplied` to the 200 response.

- [ ] **Step 4:** In `api/notify-order.ts` the block is already present (Task 4). Run `npm test`. Expected: parity PASS, all rule tests PASS.
- [ ] **Step 5:** In `api/verify-payment.ts`, add the following below `isValidSignature`:

```ts
/**
 * After a verified payment, record the points/cashback it used. The amounts
 * come from the notes api/create-order.ts put on the Razorpay order, not from
 * the browser. firebase-admin is imported lazily so this file still verifies
 * payments if it cannot load; a miss is repaired by the reconcile action.
 */
async function recordRewardSpend(razorpayOrderId: string): Promise<{ ok: boolean; detail?: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { ok: false, detail: 'Razorpay keys missing' };
  const basic = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const resp = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!resp.ok) return { ok: false, detail: `Razorpay order lookup failed (HTTP ${resp.status})` };
  const notes = ((await resp.json()) as { notes?: Record<string, string> }).notes || {};
  const uid = notes.rw_uid;
  const amounts = {
    points: Math.floor(Number(notes.rw_points) || 0),
    cashback: Math.floor(Number(notes.rw_cashback) || 0),
  };
  if (!uid || (amounts.points <= 0 && amounts.cashback <= 0)) return { ok: true };

  const { default: admin } = await import('firebase-admin');
  const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64 || '', 'base64').toString('utf8')),
        ),
      });
  const ledger = admin.firestore(app).collection('users').doc(uid).collection('rewardLedger');
  const now = admin.firestore.Timestamp.now();
  for (const currency of ['points', 'cashback'] as const) {
    const amount = amounts[currency];
    if (amount <= 0) continue;
    try {
      await ledger.doc(`spend_${razorpayOrderId}_${currency}`).create({
        currency, amount: -amount, kind: 'spend', status: 'active', unlockAt: now,
        razorpayOrderId,
        note: currency === 'points' ? `Used ${amount} points on an order` : `Used ₹${amount} wallet cashback on an order`,
        createdAt: now, createdBy: 'server',
      });
    } catch (err: any) {
      if (!(err?.code === 6 || /already exists/i.test(String(err?.message || '')))) throw err;
    }
  }
  return { ok: true };
}
```

   Then replace the final success response with:

```ts
  const rewards = await recordRewardSpend(orderId).catch((err: unknown) => ({
    ok: false,
    detail: err instanceof Error ? err.message : String(err),
  }));
  if (!rewards.ok) console.warn('[verify-payment] reward spend not recorded:', rewards.detail);

  return res.status(200).json({
    verified: true,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    ...(rewards.ok ? {} : { rewardsPending: true }),
  });
```

- [ ] **Step 6:** Run `npm test` (all pass) and the type check. Then **commit** with message `Rewards: server-priced redemption in create-order, spend recorded in verify-payment`.

---

### Task 6: Checkout integration

**Files:**
- Modify: `src/hooks/useCheckoutPricing.ts`: the `rewards` option and the `pointsApplied`, `pointsValue`, `cashbackApplied` and `totalBeforeRewards` fields.
- Create: `src/components/checkout/RewardsRedeemCard.tsx`, which exports `RewardsRedeemCard` and `RewardsBillLines`.
- Modify: `src/services/razorpayService.ts`: the flags, the ID token, `RewardsUnavailableError`, and the applied amounts on `VerifiedPayment`.
- Modify: `src/services/orderService.ts`: optional `pointsUsed`, `cashbackUsed` and `pointsEarned` on `Order`.
- Modify: `src/pages/Checkout.tsx`, in both the mobile and desktop components:
    - `useRewards`, the toggles and the redeem card;
    - bill lines in every summary;
    - the pay flags, the order fields, the 409 handling, and reconcile after the order is created.

**Interfaces:**
- Consumes:
    - `useRewards` (Task 3) and `computeRedemption` and its types (Task 1).
    - The create-order flags and response (Task 5).
    - `reconcileOrderRewards` (Task 3).
- Produces:
    - `CheckoutPricingOptions.rewards?: { balances: RewardBalances; settings: RewardSettings; usePoints: boolean; useCashback: boolean }`.
    - `CheckoutPricing` gains `pointsApplied`, `pointsValue`, `cashbackApplied` and `totalBeforeRewards`; `total` is now the payable amount.
    - `RazorpayCheckoutOptions` gains `usePoints` and `useCashback`; `VerifiedPayment` gains `pointsApplied`, `cashbackApplied` and `rewardsPending?`; the class `RewardsUnavailableError`.

- [ ] **Step 1: Pricing hook.**
    - Import `computeRedemption` and the types from `@/lib/rewards`.
    - Add the `rewards` option and the four fields to both interfaces.
    - In the `pricing` memo:
        - The empty branch returns `pointsApplied: 0, pointsValue: 0, cashbackApplied: 0, totalBeforeRewards: 0`.
        - The main branch computes `const beforeRewards = Math.max(0, total);` and then:

```ts
    const r = rewards
      ? computeRedemption({
          subtotal,
          couponDiscount: appliedDiscount,
          deliveryCharge,
          gstOnTop: addOnTop ? gstAmount : 0,
          balances: rewards.balances,
          settings: rewards.settings,
          usePoints: rewards.usePoints,
          useCashback: rewards.useCashback,
        })
      : null;
```

   It returns `totalBeforeRewards: beforeRewards`, `pointsApplied: r?.points ?? 0`, `pointsValue: r?.pointsValue ?? 0`, `cashbackApplied: r?.cashback ?? 0` and `total: r ? r.payable : beforeRewards`. Add `rewards?.balances, rewards?.settings, rewards?.usePoints, rewards?.useCashback` to the memo dependencies.
- [ ] **Step 2: `RewardsRedeemCard.tsx`**

```tsx
import { Switch } from '@/components/ui/switch';
import type { RewardBalances, RewardSettings } from '@/lib/rewards';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * "Your rewards" at checkout: opt in to spend loyalty points and wallet
 * cashback. Hidden when rewards are off or there is nothing to spend. The
 * amounts shown come from the same rules the server applies.
 */
export const RewardsRedeemCard = ({
  balances, settings, usePoints, useCashback, onUsePoints, onUseCashback,
  pointsApplied, pointsValue, cashbackApplied, className = '',
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

  const Row = ({ title, detail, checked, onChange, disabled }: {
    title: string; detail: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
  }) => (
    <label className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );

  return (
    <div className={`tx-sheet rounded-[var(--radius-card)] border border-foreground/[0.08] shadow-[var(--shadow-panel)] px-4 py-2 ${className}`}>
      <p className="eyebrow-no pt-2 pb-1"><span>Your rewards</span></p>
      <div className="divide-y divide-foreground/[0.07]">
        {(points > 0 || pending > 0) && (
          <Row
            title={points > 0 ? `Use ${points.toLocaleString('en-IN')} points` : 'Points on the way'}
            detail={
              points > 0
                ? usePoints && pointsApplied > 0
                  ? `${pointsApplied} points save ${inr(pointsValue)} (up to ${settings.maxPointsPercent}% of products)`
                  : `Worth ${inr(points * settings.pointValue)} · up to ${settings.maxPointsPercent}% of products`
                : `${pending} points unlock after the ${settings.unlockDays}-day return window`
            }
            checked={usePoints && points > 0}
            onChange={onUsePoints}
            disabled={points <= 0}
          />
        )}
        {cashback > 0 && (
          <Row
            title={`Use wallet cashback ${inr(cashback)}`}
            detail={useCashback && cashbackApplied > 0 ? `${inr(cashbackApplied)} applied to this order` : 'Covers products and delivery'}
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
  pointsApplied, pointsValue, cashbackApplied, className = 'flex justify-between text-sm',
}: { pointsApplied: number; pointsValue: number; cashbackApplied: number; className?: string }) => (
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
```

- [ ] **Step 3: `razorpayService.ts`.**
    - Import `auth` from `@/config/firebase`.
    - Export `class RewardsUnavailableError extends Error { constructor(message: string) { super(message); this.name = 'RewardsUnavailableError'; } }`.
    - Add `usePoints?: boolean; useCashback?: boolean;` to `RazorpayCheckoutOptions`.
    - In `createOrder`:
        - When either flag is set, add `Authorization: Bearer ${await auth.currentUser?.getIdToken()}` to the headers.
        - Send `usePoints` and `useCashback` in the body.
        - On `res.status === 409 && data.code === 'rewards_unavailable'`, throw `new RewardsUnavailableError(data.error)`.
        - Add `pointsApplied` and `cashbackApplied` to `CreateOrderResponse`.
    - `VerifiedPayment` gains `pointsApplied: number; cashbackApplied: number; rewardsPending?: boolean`.
    - In `payWithRazorpay`, pass the order's applied amounts through `verifyPayment(response, order)`, which returns them with `rewardsPending: data.rewardsPending === true`.
- [ ] **Step 4: Order type.** Add these to `interface Order` in `orderService.ts`:
    - `/** Loyalty points spent on this order (server-applied). */ pointsUsed?: number;`
    - `/** Wallet cashback in rupees spent on this order (server-applied). */ cashbackUsed?: number;`
    - `/** Points earned when delivered (set by the reconcile action). */ pointsEarned?: number;`
- [ ] **Step 5: Checkout (mobile component, then desktop component, same changes).**
    - Add imports:
        - `useRewards`;
        - `RewardsRedeemCard` and `RewardsBillLines`;
        - `RewardsUnavailableError`;
        - `reconcileOrderRewards`.
    - Add state: `const rewardsState = useRewards(user?.uid); const [usePoints, setUsePoints] = useState(false); const [useCashback, setUseCashback] = useState(false);`, declared before `useCheckoutPricing`.
    - Pass `rewards: { balances: rewardsState.balances, settings: rewardsState.settings, usePoints, useCashback }` in the options.
    - Place the redeem card:
        - **Mobile:** after the Coupon Section in step 1, as `<div className="mx-4 mb-4"><RewardsRedeemCard … /></div>`.
        - **Desktop:** after the Coupons card in the right column.
        - Props: `balances`, `settings`, `usePoints`, `useCashback`, `onUsePoints={setUsePoints}`, `onUseCashback={setUseCashback}`, `pointsApplied={pricing.pointsApplied}`, `pointsValue={pricing.pointsValue}`, `cashbackApplied={pricing.cashbackApplied}`.
    - Add `<RewardsBillLines pointsApplied={pricing.pointsApplied} pointsValue={pricing.pointsValue} cashbackApplied={pricing.cashbackApplied} />` after the coupon-discount line in each bill:
        - mobile step 1 Bill Summary;
        - mobile step 2 Bill Summary;
        - mobile payment sheet "Order details" (before the separator);
        - desktop Price Details;
        - desktop payment modal Price Breakdown. This one uses `className="flex items-center justify-between"`.
    - In `payWithRazorpay({...})`, add `usePoints: pricing.pointsApplied > 0, useCashback: pricing.cashbackApplied > 0`.
    - In `orderData`, add `...(verifiedPayment?.pointsApplied ? { pointsUsed: verifiedPayment.pointsApplied } : {}), ...(verifiedPayment?.cashbackApplied ? { cashbackUsed: verifiedPayment.cashbackApplied } : {})`.
    - After `createPaidOrder`, add `if (verifiedPayment?.pointsApplied || verifiedPayment?.cashbackApplied) void reconcileOrderRewards(docId);`. Desktop uses its own id variable.
    - In the catch, before the generic toast, add:

```ts
      if (error instanceof RewardsUnavailableError) {
        setUsePoints(false);
        setUseCashback(false);
        toast({ title: 'Rewards unavailable right now', description: error.message });
        return;
      }
```

- [ ] **Step 6:** Type check (only the known errors), `npm test`, and `npm run build`. Then **commit** with message `Rewards: spend points and cashback at checkout`.

---

### Task 7: Wallet page and admin tools

**Files:**
- Create: `src/components/rewards/RewardsWalletCard.tsx`
- Modify: `src/pages/PurchaseSummary.tsx` (render the card after the loyalty tier card)
- Create: `src/components/admin/RewardsAdminPanel.tsx`
- Modify: `src/pages/admin/AdminCustomerDetails.tsx` (render the panel below the stats grid)
- Modify: `src/pages/admin/AdminCommerceSettings.tsx` (a "Rewards" tab with a `RewardsTab`)
- Modify: `src/pages/admin/AdminOrderDetails.tsx` (reward figures and a "Recalculate rewards" button)

**Interfaces:**
- Consumes: `useRewards`, `adminAdjustRewards`, `getRewardSettings`, `saveRewardSettings` and `reconcileOrderRewards` (Task 3).

- [ ] **Step 1: `RewardsWalletCard.tsx`** shows three figures and the last 20 ledger entries:
    - **Figures:** points available, points pending, and wallet cashback.
    - **Each entry** shows its kind icon, note, date, and a signed amount (points or ₹).
    - **Pending entries** show "unlocks {date}"; void entries are struck through.
    - **When the ledger is empty**, it shows how points work (the settings, as sentences).
    - Style: `panel tx-sheet` with a charcoal icon tile, matching the other wallet cards.

```tsx
import { Coins, Wallet, Hourglass, ArrowDownLeft, ArrowUpRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useRewards } from '@/hooks/useRewards';
import type { RewardEntry } from '@/services/rewardsService';

const HEADING = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' };
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const KIND_ICON = { earn: ArrowDownLeft, spend: ArrowUpRight, refund: RotateCcw, adjust: SlidersHorizontal } as const;

const amountLabel = (e: RewardEntry) => {
  const sign = e.amount > 0 ? '+' : '−';
  const n = Math.abs(e.amount).toLocaleString('en-IN');
  return e.currency === 'points' ? `${sign}${n} pts` : `${sign}₹${n}`;
};

/** Loyalty points + wallet cashback on /wallet: balances and history. */
export const RewardsWalletCard = ({ uid }: { uid: string }) => {
  const { entries, balances, settings, loading } = useRewards(uid);
  const now = Date.now();
  const tiles = [
    { label: 'Points', value: Math.floor(balances.points.available).toLocaleString('en-IN'), sub: `Worth ₹${Math.floor(balances.points.available * settings.pointValue).toLocaleString('en-IN')}`, icon: Coins },
    { label: 'Pending', value: Math.floor(balances.points.pending).toLocaleString('en-IN'), sub: `Unlock after ${settings.unlockDays} days`, icon: Hourglass },
    { label: 'Cashback', value: `₹${Math.floor(balances.cashback.available).toLocaleString('en-IN')}`, sub: 'Spend at checkout', icon: Wallet },
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
          <div key={t.label} className="rounded-[var(--radius-card)] border border-foreground/[0.08] bg-card/60 p-3 text-center">
            <t.icon className="w-4 h-4 mx-auto mb-1.5 text-primary" />
            <p className="text-xl font-semibold text-foreground tabular-nums" style={HEADING}>{t.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/80">{t.sub}</p>
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
                    {fmtDate(e.createdAtMs)}{pending ? ` · unlocks ${fmtDate(e.unlockAtMs)}` : ''}{e.status === 'void' ? ' · cancelled' : ''}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${e.amount > 0 ? 'text-primary' : 'text-foreground/70'}`}>{amountLabel(e)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
```

   In `PurchaseSummary.tsx`, import it and render `<RewardsWalletCard uid={user.uid} />` directly after the loyalty tier `</motion.div>` (before `{/* ─── TOTAL SPENT CARD`).
- [ ] **Step 2: `RewardsAdminPanel.tsx`.**
    - It takes `customerId`, uses `useRewards(customerId)`, and shows balances. A negative available balance is shown in red with "Negative balance - review".
    - It lists the entries.
    - The adjust form has currency (Points or Cashback), amount (signed integer) and a required reason, and calls `adminAdjustRewards` with a success or error toast (`sonner`).
    - It uses the admin panel look: `rounded-2xl border border-gray-200 bg-white p-5 shadow-sm`, and the shadcn `Input`, `Button` and `Select`.

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRewards } from '@/hooks/useRewards';
import { adminAdjustRewards } from '@/services/rewardsService';
import type { RewardCurrency } from '@/lib/rewards';

const fmt = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Admin: a customer's points/cashback, history, and manual adjustments. */
export const RewardsAdminPanel = ({ customerId }: { customerId: string }) => {
  const { entries, balances, loading } = useRewards(customerId);
  const [currency, setCurrency] = useState<RewardCurrency>('points');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const now = Date.now();

  const submit = async () => {
    setSaving(true);
    try {
      await adminAdjustRewards(customerId, { currency, amount: Number(amount), note });
      toast.success('Adjustment saved');
      setAmount('');
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the adjustment');
    } finally {
      setSaving(false);
    }
  };

  const figure = (label: string, value: number, unit: 'pts' | '₹') => (
    <div className={`rounded-xl border p-4 ${value < 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${value < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {unit === '₹' ? `₹${value.toLocaleString('en-IN')}` : `${value.toLocaleString('en-IN')} pts`}
      </p>
      {value < 0 && <p className="text-[11px] text-red-600">Negative balance - review</p>}
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Coins className="h-5 w-5 text-highlight" />
        <h2 className="text-lg font-semibold text-gray-900">Rewards</h2>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {figure('Points available', balances.points.available, 'pts')}
        {figure('Points pending', balances.points.pending, 'pts')}
        {figure('Wallet cashback', balances.cashback.available, '₹')}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[140px_140px_1fr_auto] sm:items-end">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Type</p>
          <Select value={currency} onValueChange={(v) => setCurrency(v as RewardCurrency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="cashback">Cashback (₹)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Amount (− to debit)</p>
          <Input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600">Reason (shown to the customer)</p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Goodwill for a late delivery" />
        </div>
        <Button onClick={submit} disabled={saving || !amount || !note.trim()}>{saving ? 'Saving…' : 'Apply'}</Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No reward activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Kind</th><th className="py-2 pr-3">Note</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{fmt(e.createdAtMs)}</td>
                  <td className="py-2 pr-3 capitalize">{e.kind}</td>
                  <td className="py-2 pr-3">{e.note}</td>
                  <td className={`py-2 pr-3 text-right font-medium ${e.amount < 0 ? 'text-gray-700' : 'text-emerald-700'}`}>
                    {e.amount > 0 ? '+' : ''}{e.currency === 'cashback' ? `₹${e.amount}` : `${e.amount} pts`}
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {e.status === 'void' ? 'Void' : e.unlockAtMs > now ? `Pending until ${fmt(e.unlockAtMs)}` : 'Available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

   In `AdminCustomerDetails.tsx`, import it and render `<RewardsAdminPanel customerId={customerId!} />` directly after the 4-column stats grid.
- [ ] **Step 3: Rewards tab** in `AdminCommerceSettings.tsx`:
    - Add a `RewardsTab` component that loads `getRewardSettings()`, edits the five fields with `Switch`, `Input` and `Label`, and saves with `saveRewardSettings` and a toast.
    - It uses the existing `Section` component and a note: "Placeholder values until the client confirms its loyalty rules."
    - Add `<TabsTrigger value="rewards"><Coins className="w-4 h-4" /> Rewards</TabsTrigger>` and `<TabsContent value="rewards"><RewardsTab /></TabsContent>`.

```tsx
const RewardsTab = () => {
  const [s, setS] = useState<RewardSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { getRewardSettings().then(setS).catch(() => setS(DEFAULT_REWARD_SETTINGS)); }, []);
  if (!s) return <div className="py-12 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-highlight" /></div>;
  const field = (key: 'pointsPer100' | 'pointValue' | 'unlockDays' | 'maxPointsPercent', label: string, hint: string, step = 1) => (
    <div>
      <Label className="text-sm">{label}</Label>
      <Input type="number" step={step} min={0} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} className="mt-1" />
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
  const save = async () => {
    setSaving(true);
    try { await saveRewardSettings(s); toast.success('Reward settings saved'); }
    catch (err) { toast.error(describeError(err)); }
    finally { setSaving(false); }
  };
  return (
    <Section title="Loyalty points & cashback" subtitle="Placeholder values until the client confirms its loyalty rules." icon={Coins}>
      <div className="flex items-center justify-between mb-5">
        <div><p className="text-sm font-medium">Rewards on</p><p className="text-xs text-gray-500">Off hides the checkout toggles and stops new points; balances are kept.</p></div>
        <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {field('pointsPer100', 'Points per ₹100 spent', 'On products paid for, once the order is delivered.')}
        {field('pointValue', 'Value of 1 point (₹)', 'What a point is worth at checkout.', 0.5)}
        {field('unlockDays', 'Days until points unlock', 'Match the return window.')}
        {field('maxPointsPercent', 'Max % of products payable with points', 'Cashback has no cap.')}
      </div>
      <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>
    </Section>
  );
};
```

   Add these imports: `Coins` from lucide; `getRewardSettings` and `saveRewardSettings` from `@/services/rewardsService`; `DEFAULT_REWARD_SETTINGS` and `type RewardSettings` from `@/lib/rewards`.
- [ ] **Step 4: Admin order details.** Near the status controls, show "Points used / cashback used / points earned" when present. Add a `Recalculate rewards` button that calls `reconcileOrderRewards(order.id)` and toasts the result (`ok`, or `detail` on failure).
- [ ] **Step 5:** Type check, `npm test` and `npm run build`. Then **commit** with message `Rewards: wallet balances and history, admin settings, customer adjustments, order recalculation`.

---

### Task 8: Preview verification and notes

**Files:**
- Modify: `CLIENT.md` (a Step 2B section with the rewards ledger, open questions, and test notes)
- Scratch: `seed-rewards.mjs`, plus screenshots via the existing `shoot-authed.mjs` and `shoot-checkout.mjs`

- [ ] **Step 1:** Give the test shopper balances as an admin would, with the Admin SDK: `adjust_*` entries of +250 points ("Welcome points (test)") and +₹150 cashback ("Goodwill credit (test)"), `createdBy: 'admin:script'`. Mark them `demo: true` so they are easy to find and remove.
- [ ] **Step 2:** Screenshot `/wallet` in light and dark, mobile and desktop. Check the three figures (250 pts, 0 pending, ₹150) and the two history rows.
- [ ] **Step 3:** Screenshot `/checkout` (cart has items) with the redeem card visible. Then toggle both switches (Playwright clicks the two `role="switch"` elements) and screenshot again. Check the bill lines "Points (N)" (capped at 20%) and "Wallet cashback", and that the total drops by those amounts.
- [ ] **Step 4:** Run the full suite: `npm test`, the type check, `npm run build`, `reconcile-check.mjs` (PASS) and `rules-check.mjs` (200 / 403).
- [ ] **Step 5:** Record the work in `CLIENT.md`:
    - under Features, the "Rewards ledger (Step 2B part 1)" section;
    - the open questions for the reward rules;
    - "End-to-end payment with rewards: test in Step 3 once Razorpay test keys are set";
    - "Test shopper has demo reward entries (demo: true)".
- [ ] **Step 6: Commit** with message `Rewards: preview verification notes`.

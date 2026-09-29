# Rewards ledger: loyalty points and cashback

Step 2B, part 1 of 4 (then the loyalty card, Scratch & Win and dealer membership).
Approved 2026-09-29: every recommended option was accepted. All numbers are dummy
defaults set in the admin panel, marked TODO(client) until Ishaputra confirms them.

## Goal

Customers earn **loyalty points** on delivered orders and hold **cashback** (rupees) in a
wallet. Both can be spent at checkout. Totals and balances are enforced on the server,
so a modified browser cannot mint or reuse rewards.

## Rules

| Rule | Default | Setting |
|---|---|---|
| Points earned | 1 point per ₹100 paid for products (after coupon and redemptions, excluding delivery and GST), rounded down | `pointsPer100` |
| Point value | 1 point = ₹1 | `pointValue` |
| Points unlock | Pending on delivery, spendable after 7 days (the return window) | `unlockDays` |
| Points cap per order | 20% of the product amount after the coupon | `maxPointsPercent` |
| Cashback | Rupees, available immediately, can also cover delivery, no cap | none |
| Master switch | On | `enabled` |

- **Order of discounts:** coupon, then points, then cashback. At least ₹1 always stays payable, because Razorpay rejects zero-amount orders.
- **Cancel or return:**
    - Points still pending from that order are voided.
    - Points and cashback spent on it are refunded, as entries that are available immediately.
    - A return after points have unlocked is not reversed automatically; the admin can adjust by hand.
- **Not in v1:** expiry, tier multipliers, signup or review bonuses, spending gift cards at checkout.

## Data

### Ledger

Each customer has a ledger in `users/{uid}/rewardLedger/{entryId}`. Entries are written once and never edited, except that one can be voided.

```ts
interface RewardEntry {
  currency: 'points' | 'cashback';
  amount: number;            // + credit, − debit (integers; cashback in whole rupees)
  kind: 'earn' | 'spend' | 'refund' | 'adjust';
  status: 'active' | 'void';
  unlockAt: Timestamp;       // when it starts counting towards "available"
  orderId?: string;          // Firestore order id (earn/refund/adjust)
  razorpayOrderId?: string;  // spend entries are keyed by the payment's Razorpay order
  note: string;
  createdAt: Timestamp;
  createdBy: string;         // 'server' or 'admin:<uid>'
}
```

- **Balance is calculated, never stored.**
    - Available = sum of `active` entries whose `unlockAt` is now or earlier.
    - Pending = sum of `active` entries whose `unlockAt` is later.
    - Both are per currency. Nothing needs to release points, so no scheduled job is required.
- **Deterministic IDs**, so repeating a step never double-counts:
    - `earn_<orderId>`
    - `spend_<razorpayOrderId>_points` and `spend_<razorpayOrderId>_cashback`
    - `refund_<orderId>_points` and `refund_<orderId>_cashback`
    - `adjust_<timestamp>_<rand>`

### Settings

`siteSettings/rewards` holds `{ enabled, pointsPer100, pointValue, unlockDays, maxPointsPercent }`. Anyone can read it; only the admin can write it.

### Order fields (display only)

The order gets `pointsUsed`, `cashbackUsed` and `pointsEarned`. The ledger is the record; the order fields are only for display.

### Security rules

- **`rewardLedger`:**
    - Read by the owner or an admin.
    - Created only by an admin.
    - Updated only by an admin, and only `status` from `active` to `void`.
    - Never deleted.
- **The server** writes through the Admin SDK, which bypasses the rules.
- **Lock down the old wallet code:** the unused `wallets`, `transactions` and `rewards` subcollections become admin-only for writes. `src/services/walletService.ts` and `src/types/wallet.ts` are removed; nothing else imports them.

## Flows

1. **Checkout (browser):**
    - `useRewards` listens to the customer's own ledger and to the settings.
    - The checkout shows two toggles: "Use N points (−₹N)" and "Use wallet ₹X". They appear only when a balance exists and rewards are enabled.
    - Pricing previews the same caps the server applies.
2. **`POST /api/create-order`:**
    - It gets `usePoints` and `useCashback`, plus `Authorization: Bearer <ID token>`.
    - Only when a toggle is on does it:
        - verify the token and read the ledger and settings with the Admin SDK;
        - calculate the redemption with the shared rules;
        - lower the amount charged;
        - write `{rw_uid, rw_points, rw_cashback}` into the Razorpay order `notes`.
    - The response includes `pointsApplied` and `cashbackApplied`.
    - Client-sent `notes` keys starting with `rw_` are dropped, so a browser can't fake them.
    - If the Admin SDK fails, it returns 409 `rewards_unavailable` and charges nothing. The checkout turns the toggles off and says "Rewards unavailable right now"; the customer sees the full total before paying.
3. **`POST /api/verify-payment`:**
    - After the signature checks out, it fetches the Razorpay order and reads its notes.
    - It writes the spend entries (negative amounts) with create-once IDs keyed by the Razorpay order ID.
    - If that write fails, it still returns `verified: true` with `rewardsPending: true`, and reconcile repairs it.
4. **Order write (browser, unchanged path):** the order doc stores `pointsUsed` and `cashbackUsed` from the create-order response, along with the existing `razorpayOrderId`.
5. **Reconcile:** `POST /api/notify-order` with `{ action: 'reconcile-rewards', orderId }`.
    - **Who can call it:** the same checks as today (the order's customer or an admin).
    - **When it's called:** after every status change made through `orderService` (admin panel and customer self-cancel), and from an admin "Recalculate rewards" button.
    - **What it does:** reads the order and brings the ledger in line with it:
        - **Paid** (has `razorpayOrderId`): spend entries exist, recreated from the Razorpay notes if missing.
        - **Delivered:** `earn_<orderId>` exists, unlocking at `deliveredAt + unlockDays`, for `floor((total − deliveryCharge − taxAmount) / 100 × pointsPer100)` points. It also sets `pointsEarned` on the order.
        - **Cancelled, returned or refunded:** the earn entry is voided if still pending, and refund entries equal the spends.
    - Running it twice changes nothing.
6. **Admin:**
    - Commerce settings gets a "Rewards" card for the settings.
    - Customer details gets a rewards panel showing available and pending points and cashback, with the history, plus an adjust form (points or cashback, credit or debit, reason required). The form writes `adjust_*` entries through the browser, which the admin rules allow.
7. **Wallet page (`/wallet`):** a balances card (points available and pending, cashback) and the reward history, above the existing tier card.

## Shared logic

`src/lib/rewards.ts` is pure and dependency-free, and is used by both the browser and the `api/` functions:
- `normaliseRewardSettings(raw)` fills in defaults and clamps values.
- `summariseRewards(entries, nowMs)` gives available and pending per currency.
- `computeRedemption({ subtotal, couponDiscount, deliveryCharge, gstOnTop, balances, settings, usePoints, useCashback })` gives `{ points, pointsValue, cashback, payable }`.
- `pointsForOrder(order, settings)` gives the points to earn.

The `api/` files must stay standalone (CLAUDE.md: each imports nothing from `src/`):
- `create-order.ts` and `notify-order.ts` each get a copy of the whole core block.
- Each copy sits between `// >>> rewards-core` and `// <<< rewards-core` markers.
- A test checks that every marked block matches the same block in `src/lib/rewards.ts`.

`verify-payment.ts` currently uses only Node built-ins, so it "can't fail to load". It loads `firebase-admin` with a dynamic `import()` only *after* the signature check succeeds, inside try/catch, so a rewards failure can never affect payment verification.

## Error handling

- A reward failure never blocks a payment or an order. The server charges without redemption, or repairs the ledger later through reconcile.
- A spend is always recorded, because the payment is real. If the balance dropped in the meantime (for example, a second tab), it may go negative, and the admin panel highlights negative balances.
- Every ledger write uses a deterministic ID with create-if-absent semantics.

## Testing

- **Unit tests** use Node's built-in test runner (`node --test`, running TypeScript directly; no new dependency) and live in `tests/`. They cover:
    - `summariseRewards`, `computeRedemption` (caps, discount order, the ₹1 minimum, rewards off), `pointsForOrder` and `normaliseRewardSettings`;
    - the `api/` parity test above.
- **Now, on the preview:**
    - Admin credits and debits points and cashback, and the wallet page and checkout toggles reflect them.
    - A script simulates a delivered order and a cancelled paid order through reconcile, runs it twice, and checks the ledger.
    - Security-rules check: the test customer's attempt to create a ledger entry is rejected.
- **In Step 3** (Razorpay test keys are empty until then): the end-to-end payment with both toggles on, checking the amount charged and the spend entries.

## Out of scope (later parts of Step 2B)

Loyalty card UI, Scratch & Win (its prizes will be new entries in this same ledger), dealer membership, and spending gift cards at checkout.

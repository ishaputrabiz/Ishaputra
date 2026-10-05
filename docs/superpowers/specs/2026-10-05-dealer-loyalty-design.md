# Dealer Membership and Loyalty card

Step 2B, part 3 (after the rewards ledger and Scratch & Win). The owner asked for placeholder defaults and approved
the mockup on 2026-10-05 with no changes (screenshots in `../shots/dealer-loyalty-mockup/`, outside the repo; the
mock pages are `src/pages/__mock/DealerLoyaltyMock.tsx` and `DealerAdminMock.tsx`, git-ignored, deleted at the end of
the build). Every number is an admin setting shipped as a placeholder and listed in `CLIENT.md`. The dealer programme
ships **off**.

## Goal

1. **Dealer Membership.** Businesses apply on `/dealer`, an admin approves them, and approved dealers pay dealer
   prices on orders big enough to qualify. The server works out and charges the dealer price, so a modified browser
   cannot get it, and a customer cannot approve themselves.
2. **Loyalty card.** A digital member card at the top of `/wallet`: tier, member number, name, member since, points.
   Tiers now give a points multiplier, worked out by the server from what the customer really paid, so the tier
   cannot be faked.

## Rules

| Rule | Placeholder | Where |
|---|---|---|
| Dealer programme switch | Off. Off hides `/dealer` from customers with no application and stops dealer prices; dealers keep their status. | `siteSettings/dealer.enabled` (public) |
| Dealer prices from | ₹2,000, measured **at regular prices** | `siteSettings/dealer.minOrder` (public) |
| Dealer discount | 20% off the regular price, store-wide | `dealerPricing/current.discountPercent` (private) |
| Per-product dealer price | Optional fixed price per product; blank uses the % | `dealerPricing/current.productPrices[productId]` (private) |
| Tiers | Silver ₹0 1x, Gold ₹5,000 1.25x, Platinum ₹15,000 1.5x, Premium ₹30,000 2x | `siteSettings/rewards.tiers` (public) |

### Dealer prices

- **Who:** a signed-in customer whose `dealers/<uid>` has `status: 'approved'`, while the programme is on.
- **Unit price** (`dealerUnitPrice`): a valid fixed product price (a number > 0) wins, capped at the regular price
  (`min(fixed, regular)`, so a later sale never makes the dealer price higher than the regular one). Otherwise
  `round(regular × (100 − discountPercent) / 100)` to whole rupees, never above the regular price and never below
  ₹1 unless the regular price is. `discountPercent` is clamped to 0–90.
- **Threshold:** dealer prices apply only when the cart is worth at least `minOrder` **at regular prices** and the
  dealer total is lower than the regular one. Below the threshold the cart is charged regular prices and the
  shopper sees "Add ₹X more to unlock dealer prices" plus how much less the current items cost at dealer prices.
- **No stacking.** A dealer-priced order cannot use a coupon, points or cashback, earns no points (earn base 0) and
  gets no scratch card. Delivery and GST are worked out as usual on the dealer subtotal. An order below the
  threshold is a normal retail order in every way.
- **Invoice:** a dealer-priced order prints the dealer's business name and GSTIN (when given) in the buyer block.
- **Privacy:** dealer prices are readable only by admins and approved dealers. The apply page does not show the %.

### Tiers and the loyalty card

- **Tier spend** = rupees paid online (`payments/<rzp>.amountPaise / 100`) for the customer's orders whose status is
  `delivered`, excluding dealer-priced orders. Returned or cancelled orders drop out because their status changes.
  Payment records are written only by the server, so the tier cannot be faked (today's browser tier sums the
  client-written `order.total`).
- **Tier** = the highest tier whose `minSpend` ≤ tier spend. Exactly 4 tiers; the first always starts at ₹0.
- **Multiplier:** when an order first earns points (on delivery), the server uses the tier from the customer's
  **other** delivered orders (this one excluded) and earns `floor(base × pointsPer100 × multiplier / 100)`. The
  earn entry stores `tierName` and `multiplier`. Scratch prizes are not multiplied. The multiplier is fixed at that
  moment, with one exception: when a delivered order later ends (returned, cancelled, refunded), the earns of the
  customer's other orders that it helped lift above 1x are taken back to the tier they would have had without it
  (never up, and only when removing it lowers the tier). The earn keeps its status; its `amountBefore`,
  `boostRemovedAt` and `boostRemovedBy` record the change. Orders delivered close together may still count each
  other: that is accepted.
- **Member number:** 12 digits derived from the account id (64-bit FNV-1a of the uid, mod 10¹², zero-padded),
  shown as `IB 4821 7730 1956` (prefix `BRAND.memberPrefix`). Nothing is stored. Collisions are possible in theory
  (about 1 in 10¹² per pair) and harmless: it is a support reference, not a key.
- **Member since:** `users/<uid>.createdAt`.
- No QR code and no physical card.

## Data

### `dealers/<uid>` (doc id = the customer's uid)

| Field | Written by | Notes |
|---|---|---|
| `uid` | customer (create) | must equal the doc id |
| `businessName` | customer | 2–80 chars |
| `businessType` | customer | `retail`, `ayurvedic`, `salon`, `gym`, `online`, `distributor`, `other` |
| `contactName` | customer | 2–60 chars |
| `phone` | customer | `^\+?[0-9 ]{10,15}$` |
| `city` | customer | 2–60 chars |
| `state` | customer | 2–40 chars (from the site's Indian states list) |
| `gstin` | customer | `''` or `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` (upper-cased in the form) |
| `message` | customer | 0–500 chars |
| `status` | customer creates `pending`; admin changes it | `pending`, `approved`, `rejected`, `suspended` |
| `appliedAt` | customer | `request.time` on create and on re-apply |
| `updatedAt` | both | server timestamp |
| `reviewNote` | admin | 0–300 chars, shown to the applicant when rejected or suspended |
| `reviewedAt`, `reviewedBy` | admin | |
| `approvedAt` | admin | first approval |

Lifecycle: `pending` → `approved` | `rejected`; `approved` ↔ `suspended`; `rejected` → `pending` (the customer
re-applies with fresh details). The customer may delete their application only while it is `pending`
("Withdraw application").

### `siteSettings/dealer` (public read, admin write)

`{ enabled: boolean, minOrder: number, enabledAt?, updatedAt }`. Defaults `{ enabled: false, minOrder: 2000 }`.

### `dealerPricing/current` (private)

`{ discountPercent: number, productPrices: { [productId]: number }, updatedAt }`. Defaults
`{ discountPercent: 20, productPrices: {} }`. The product form sets or deletes one key (`setDoc` merge with
`deleteField()` to remove).

### `siteSettings/rewards.tiers`

`[{ name, minSpend, multiplier }] × 4`, normalised in `rewards-core` (name 1–24 chars or the default; minSpend whole
rupees 0–10,000,000; multiplier 1–5 to two decimals; the first tier's minSpend forced to 0; sorted by minSpend).
Replaces `BRAND.loyaltyTiers` (removed).

### Payment record additions

`payments/<rzp>` gains `dealer: true` and `regularSubtotal` for dealer-priced orders, copied from the Razorpay notes
`rw_dealer = '1'` and `rw_regular` by `api/verify-payment.ts` and by `writePaymentRecord` in `api/notify-order.ts`.

### Order snapshot additions (written by the browser, informational)

`pricing: 'dealer'`, `regularSubtotal`, `dealerSavings`, `buyerBusiness: { name, gstin }`, and `items[].price` at
the dealer unit price. The admin payment check still compares the total and the cart hash with the payment record;
`payments/<rzp>.dealer` is the trusted flag.

### Earn entry additions

`rewardLedger/earn_<rzp>` gains `tierName` and `multiplier`.

## Security rules

```
match /dealers/{uid} {
  allow get: if isOwner(uid) || isAdmin();
  allow list: if isAdmin();
  allow create: if isOwner(uid) && <keys exactly the application keys + uid, status, appliedAt[, updatedAt]>
    && uid field == uid && status == 'pending' && appliedAt == request.time && <valid application fields>;
  allow update: if isAdmin()
    || (isOwner(uid) && resource.data.status == 'rejected' && request.resource.data.status == 'pending'
        && <affectedKeys only application keys, status, appliedAt, updatedAt>
        && request.resource.data.appliedAt == request.time && <valid application fields>);
  allow delete: if isAdmin() || (isOwner(uid) && resource.data.status == 'pending');
}
match /dealerPricing/{docId} {
  allow read: if isAdmin() || (isAuthenticated()
    && exists(/databases/$(database)/documents/dealers/$(request.auth.uid))
    && get(/databases/$(database)/documents/dealers/$(request.auth.uid)).data.status == 'approved');
  allow write: if isAdmin();
}
```

`users/<uid>` is untouched: dealer status never lives there (customers can write most of their own profile).
Deploy with `node docs/handoff/deploy-rules.mjs` (owner's OK given 2026-10-05).

## Server

### Pure logic: `dealer-core` (`src/lib/dealer.ts`)

Copied verbatim into `api/create-order.ts`; `npm run sync:rewards` syncs it and the parity test checks it.
`DealerSettings`, `DealerPricing`, defaults, `normaliseDealerSettings`, `normaliseDealerPricing`,
`dealerUnitPrice(productId, regularUnit, pricing)`, and
`dealerQuote(lines[{ productId, unit, quantity }], settings, pricing | null, approved)` →
`{ applies, regularSubtotal, dealerSubtotal, subtotal, savings, shortBy, units[] }` (money rounded to paise;
`subtotal` is what is charged; `units` are the charged unit prices; `shortBy` is 0 once the threshold is met).

### `rewards-core` additions (`src/lib/rewards.ts`)

`LoyaltyTier`, `DEFAULT_TIERS`, `RewardSettings.tiers` (normalised as above), `tierIndexForSpend(spend, tiers)`,
`tierSpend(rows[{ id, amountPaise, dealer?, orderStatus }], excludeId?)`, and `pointsForBase(base, s, multiplier = 1)`
computed with the multiplier in hundredths so 1.1x is exact.

### `api/create-order.ts`

1. Body gains `pricing?: 'dealer' | 'retail'` (what the browser priced).
2. The customer's uid is verified **before** pricing (it used to be after). No token: retail. A failed check is still
   only fatal when rewards are used, or when the browser priced at dealer prices (503 `dealer_unavailable`).
3. `siteSettings/dealer` is read with the other public settings. When it is on and there is a uid, the server reads
   `dealers/<uid>` and, if approved, `dealerPricing/current` with the Admin SDK. A failed read is 503
   `dealer_unavailable` when the browser priced at dealer prices, otherwise retail.
4. The per-line regular unit price is worked out as today; `dealerQuote` then gives the subtotal everything else uses
   (coupon, delivery, GST, totals, rewards).
5. If the quote applies and the body has a coupon, points or cashback: 400 `dealer_no_extras`.
6. If the body says `pricing` and it differs from the server's: 409 `dealer_pricing_changed` with the server's
   `pricing`, so the browser re-prices and asks the shopper to check the new total.
7. Notes: `rw_dealer = '1'`, `rw_regular = <regular subtotal>`, `rw_base = '0'` for dealer-priced orders.

The pricing steps are pulled into an exported pure helper so they can be tested without HTTP.

### `api/verify-payment.ts` and `writePaymentRecord`

Copy `dealer` and `regularSubtotal` into `payments/<rzp>` (only when `rw_dealer === '1'`).

### `reconcileRewards` (`api/notify-order.ts`)

- **Earn:** before creating `earn_<rzp>`, read the customer's payment records (`payments where uid == uid`) and their
  orders' statuses (`getAll`), work out `tierSpend` without this order, pick the tier, and earn with its multiplier.
  The entry stores `tierName` and `multiplier`. The read happens outside the transaction; the earn is still
  `createOnce`.
- **Scratch:** no card when `payments/<rzp>.dealer === true`.
- Dealer-priced orders earn nothing because their `base` is 0.

## Customer screens

As in the approved mockup.

- **`/wallet`:** the charcoal status card becomes the member card (tier metal edge, wordmark, tier and dealer chip,
  member number with copy, name, member since, points and their worth, the tier's multiplier line), with the
  progress bar (filled step by step, fixing today's bar that fills by spend ÷ top threshold) and the four tier steps
  with their thresholds and multipliers. The note says what counts. Then Scratch cards, Points & cashback as today.
  Earn rows in the history show "Gold 1.25x" when the entry has a multiplier.
- **Phone account page:** the member card gains the tier chip and member number. Both menus gain "Dealer programme"
  (shown when the programme is on or the customer has an application), with an "Approved" chip for dealers.
- **`/dealer`** (signed in; signed out goes to login): title band, a "How it works" list, and one of: the
  application form (prefilled name and phone); pending (date, summary, Withdraw); approved (charcoal dealer account
  card, terms, "Shop at dealer prices"); rejected (the team's note, Apply again with the old details prefilled);
  suspended ("Dealer prices are paused", contact support). Programme off and no application: "The dealer programme
  isn't open right now."
- **Prices for approved dealers** (programme on): product card, products page card, search and wishlist cards show
  the dealer unit price with the regular price struck and a "Dealer −N%" chip; the product page shows "Dealer
  price", the regular price, the chip, and "Dealer prices apply on orders of ₹2,000 or more at regular prices."
  The phone buy button reads "Buy now" for dealers.
- **Cart drawer and checkout (both copies):** below the threshold, regular prices and the nudge panel with a
  progress bar. Above it, lines at dealer unit prices ("₹640, ~~₹800~~, Dealer −20%"), a "Dealer prices applied"
  notice, the coupon field disabled with "Coupons, points and cashback don't apply to dealer-priced orders", the
  rewards card hidden, and the bill rows "Items at regular prices", "Dealer prices −₹X", delivery, GST, total.
  `payWithRazorpay` sends `pricing`. On 409 `dealer_pricing_changed` or 503 `dealer_unavailable` the checkout shows
  the message, refreshes the dealer state and resets the slider.

## Admin

- **Admin > Dealers** (`/admin/dealers`, nav item after Customers with the pending count): header, three StatCards,
  a status filter (Pending, Approved, Rejected, Suspended), search by name, phone or GSTIN, a table (cards on phone),
  and a sheet with the full application, the customer account link, a note to the applicant, and Approve / Reject /
  Suspend / Reinstate (Suspend asks for confirmation). Writes go straight to `dealers/<uid>` (admin rule).
- **Commerce settings > Dealers tab:** status chip, switch (stamps `enabledAt`), dealer discount %, "Dealer prices
  from" ₹, an example line ("A ₹800 item costs dealers ₹640"), counts, the "How dealer prices work" notice, and
  "Save dealer settings" (one batch writes `siteSettings/dealer` and `dealerPricing/current`).
- **Commerce settings > Rewards tab:** a "Loyalty tiers" section (4 rows: name, spend from, multiplier, plus "on a
  ₹2,000 order" points preview) saved with the rest of the tab.
- **Product form:** "Dealer price (₹)" (optional) under Price, with "Leave blank to use the store-wide 20% off (₹640)"
  and "Must be below the regular price". Saved to `dealerPricing/current` after the product saves.
- **Customer details:** member number (copy), tier chip, tier progress line, and "Dealer: approved" with a link to
  the dealer record.
- **Order details:** a "Dealer prices" row in the totals and a "Dealer order" chip when the payment record says so.

## Error handling

- Every dealer-only read (`dealers/<uid>`, `dealerPricing/current`) fails closed: the browser shows regular prices
  and the server charges regular prices, except that a browser that priced at dealer prices gets a clear 409/503
  instead of a silent higher charge.
- Admin settings tabs follow the existing pattern: nothing editable until a successful read, a danger Notice with
  Retry on failure, Save disabled until loaded.
- Writes show a toast on failure and leave the form as it was.

## Testing

- **Unit:** `tests/dealer.test.ts` (unit price, threshold, rounding, fixed-price cap, normalise), tier and earn
  additions in `tests/rewards.test.ts`, `tests/loyaltyCard.test.ts` (member number format and stability).
- **Parity:** `dealer-core` in `api/create-order.ts`; updated `rewards-core` copies.
- **Server:** the create-order pricing helper (retail, dealer, below threshold, extras refused, pricing changed,
  not approved, programme off); `reconcileRewards` with a tier multiplier and with a dealer payment (no points, no
  card), using `tests/helpers/fakeFirestore.ts` extended with `where(field, '==', value)` queries.
- **Live** (`docs/handoff/dealer-loyalty-live.mjs`, owner's OK given): the deployed rules as the test shopper (cannot
  create an approved application, cannot approve themselves, cannot read dealer prices while pending, can after
  approval), the real create-order and verify-payment at dealer prices, reconcile (no points, no card for the dealer
  order; a retail order earns with the tier multiplier), screenshots of `/wallet`, `/dealer` and checkout at 390 and
  1440 in light and dark, and full cleanup.

## Not in this version

Dealer-only products, per-dealer discount levels, quantity price breaks, credit or cash-on-delivery terms for
dealers, email/WhatsApp/push notices about applications, a QR or physical loyalty card, admin search by member
number on the customers list (the number shows on the customer page).

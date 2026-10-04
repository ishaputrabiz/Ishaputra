# Scratch & Win

Step 2B, part 2 (after the rewards ledger). The owner approved the screens (mockup screenshots in
`../shots/scratch-win-mockup/`, outside the repo) on 2026-10-04 with no changes, and said "just complete it" for the
business rules. Every number is an admin setting shipped as a placeholder (listed in `CLIENT.md`), and the feature
ships **off**.

## Goal

A delivered online order of at least the admin's minimum gives the customer one scratch card. Scratching it wins
loyalty points (or "better luck next time"). The server draws the prize and writes the points, so a modified browser
cannot choose, repeat or keep a prize it should lose.

## Rules

| Rule | Placeholder | Setting (`siteSettings/scratchWin`) |
|---|---|---|
| Switch | Off. Off stops new cards; cards already given can still be scratched until they expire. Turning it on gives no cards for orders delivered while it was off. | `enabled`, `enabledAt` (stamped by the admin tab when the switch goes on) |
| Who gets a card | One per online order paid through Razorpay, once it is **delivered**, when the amount paid online is at least the minimum | `minOrder` (₹499) |
| Expiry | 30 days, counted from the order's delivery time | `expiryDays` |
| Prizes | 5 / 10 / 25 / 50 points at weights 40 / 35 / 20 / 5 | `prizes: [{ points, weight }]` (max 10 rows) |
| Better luck next time | Weight 0 | `noWinWeight` |

- **Chance of a prize** = its weight ÷ (sum of all prize weights + `noWinWeight`). If every weight is 0, every card is
  "better luck next time".
- **New cards also need loyalty rewards on** (`siteSettings/rewards.enabled`), because the prizes are loyalty points.
- **Won points follow their order**, exactly like the points earned on it:
    - pending until the order's unlock date (the earn entry's `unlockAt`, or as it would have been when the order
      earned no points). An unlock date is the later of "`unlockDays` after the server first sees the delivery" and
      "the order's `deliveredAt` + 7 days" (the customer's return window), so points never unlock while a return can
      still be requested (2026-10-05 review);
    - frozen while a return is open (only spendable while the order sits at `delivered`). Checkout also holds an
      unlocked earning or prize whose order is not at `delivered`, in case the reconcile after a status change never
      ran (`holdEarnedOffDelivered` in `api/create-order.ts`);
    - voided if the order is cancelled, returned or refunded; restored if the shop reopens it.
- **An unscratched card** is cancelled if its order ends, and comes back if the shop reopens the order.
- **The prize table in force when the card is scratched** is used, not the one when it was given. Expiry and unlock
  dates are fixed when the card is given.
- Placeholder average cost: 13 points a card (₹13 at today's point value, 2.6% of ₹499). 1 in 20 cards wins 50.
- **Not in v1:** coupon or cashback prizes, push notifications, admin counts of cards given and scratched, COD orders.

## Data

### Card

`users/{uid}/scratchCards/{rzp}`: one per order, keyed by the Razorpay order id (which is also the Firestore order id,
one order per payment).

```ts
interface ScratchCardDoc {
  orderId: string;            // = rzp
  orderNumber: string;        // order.orderId for display ("ORD-1042"), else rzp
  orderAmount: number;        // rupees paid online (payments/<rzp>.amountPaise / 100)
  status: 'new' | 'scratched' | 'void';
  createdAt: Timestamp;
  deliveredAt: Timestamp;     // the expiry clock: order.deliveredAt, or the time the card was given
  expiresAt: Timestamp;       // deliveredAt + expiryDays
  unlockAt: Timestamp;        // when won points unlock
  createdBy: 'server';
  // written by the scratch-card action
  points?: number;            // 0 = better luck next time
  scratchedAt?: Timestamp;
  prizeState?: 'active' | 'held' | 'void';   // points > 0 only; mirrors scratch_<rzp>
  // written by reconcile
  voidedAt?: Timestamp; voidedBy?: 'server'; voidReason?: string;  // 'order-returned', ...
  restoredAt?: Timestamp;
}
```

"Expired" is never stored: a `new` card whose `expiresAt` has passed is expired. No scheduled job is needed.

### Prize entry

`users/{uid}/rewardLedger/scratch_{rzp}`, written once, in the same transaction that marks the card scratched:

```ts
{ currency: 'points', amount: N, kind: 'earn', source: 'scratch', status: 'active', held, unlockAt: card.unlockAt,
  orderId: rzp, razorpayOrderId: rzp, note: 'Scratch card prize, order ORD-1042', createdAt, createdBy: 'server' }
```

`kind: 'earn'` means `summariseRewards` already treats it as pending until `unlockAt` and while `held`, so the
balance maths (the shared `rewards-core`) does not change. `source: 'scratch'` lets the wallet show a ticket icon.
No entry is written for "better luck next time".

### Security rules

```
match /scratchCards/{cardId} {
  allow read: if isOwner(userId) || isAdmin();
  allow write: if false;     // only the Admin SDK (api/notify-order.ts) writes cards
}
```

`siteSettings/scratchWin` is covered by the existing `siteSettings` rule (anyone reads, admins write). The new rule
must be deployed to `ishaputrabotanicals` before the feature is switched on; until then the customer screens read
nothing and stay hidden while the feature is off. **Deploying needs the owner's OK.**

## Server

All in `api/notify-order.ts` (the Vercel Hobby plan has no free function slots).

### Pure logic: `scratch-core`

`src/lib/scratchWin.ts` holds a `// >>> scratch-core` … `// <<< scratch-core` block, copied verbatim into
`api/notify-order.ts` by `npm run sync:rewards` (the script handles both blocks). The parity test checks it, like
`rewards-core`.

- `normaliseScratchSettings(raw)`: defaults and clamps. `minOrder` 0 to 1,000,000; `expiryDays` 1 to 365; prize
  `points` whole, rows below 1 dropped and above 10,000 clamped (the admin tab says so when it saves); weights whole 0
  to 1,000; at most 10 prizes; `enabled` true only when `=== true`. A missing or non-array `prizes` falls back to the
  default table.
- `scratchTotalWeight(s)` and `drawScratchPrize(s, roll)`: `roll` is a whole number in `[0, total)`; returns the
  points (0 = no prize). The server passes `crypto.randomInt(total)`.
- `scratchCardEligible({ status, amountRupees, scratch, rewardsEnabled, deliveredAtMs, enabledAtMs, nowMs })`:
  whether reconcile should give a card now, and its expiry. A delivery time in the future counts as now; an order
  delivered before `enabledAt` gets none.
- `planScratchReconcile({ status, ended, reachedCustomer, card, prize })`: what reconcile changes on the card and on
  the prize entry (create, void, restore, hold, release, mirror `prizeState`). Pure, so every transition is unit
  tested.

### Reconcile (`action: 'reconcile-rewards'`)

After the existing steps (spends, earn, refunds), and before it writes the order's display fields, one Firestore
transaction reads the order, the card, `scratch_<rzp>`, `earn_<rzp>` (for the card's unlock date) and `payments/<rzp>`,
and applies `planScratchReconcile`. A payment gets one card, ever: creating it also writes
`payments/<rzp>.scratchCardGivenAt`, and no card is created once that is set, so a card deleted by hand never comes back
for a fresh draw. A restored card loses `voidedAt`, `voidedBy` and `voidReason`.

| Order | Card | Change |
|---|---|---|
| `delivered`, card eligible | none | create the card (`new`) |
| ended | `new` | `void` (`voidedBy: 'server'`, `voidReason: 'order-<status>'`) |
| reached the customer, not ended | `void` by the server | back to `new` |
| ended | scratched, prize active | prize entry `void`; card `prizeState: 'void'` |
| reached the customer, not ended | scratched, prize voided by the server | prize restored |
| not `delivered` (return open) | scratched, prize active | prize `held: true` |
| `delivered` | scratched, prize held | prize `held: false` |

The transaction re-reads the order, so a scratch and a status change racing each other cannot leave an active prize
on an ended order. Running reconcile twice changes nothing. A transaction error fails the reconcile (503), and the
admin's "Check payment & rewards" button runs it again.

### Scratch (`action: 'scratch-card'`, `{ orderId }`)

- The caller's ID token decides whose card: `users/<callerUid>/scratchCards/<orderId>`. Nobody can scratch someone
  else's card.
- One transaction reads the card, the order and `scratch_<rzp>`, then:
    - no card: 404 `card_not_found`;
    - already scratched: 200 with the stored result (a double tap or a second tab gets the same prize);
    - void: 409 `card_void`; expired: 409 `card_expired`;
    - order missing, not the caller's, or ended: the card is voided, 409 `card_void`;
    - otherwise it draws (inside the transaction, so a retried transaction draws again and only one draw is ever
      committed), creates `scratch_<rzp>` when the prize is above 0 (`held` when the order is not at `delivered`), and
      marks the card `scratched` with `points`, `scratchedAt` and `prizeState`.
- The response is `{ ok, points, unlockAtMs, held, prizeState, scratchedAtMs }`, sent only after the commit, so a
  customer can't see a prize and cancel it. `prizeState: 'void'` means the prize was taken back (the order ended), and
  the dialog says so.
- An expired card answers `card_expired` even when its order has ended; reconcile cancels it later.
- A failure answers 503 `scratch_failed` with no detail (it is logged on the server).
- It works while the feature is off (cards already given stay scratchable).

## Customer screens

As in the approved mockup.

- **Wallet (`/wallet`):** a "Scratch cards" panel under the tier card, above Points & cashback.
    - Heading with a copper "N new" chip.
    - Phone: a horizontal swipe row of tiles. Desktop (`lg`): a 5-column grid. New cards come first (soonest expiry
      first), then the rest, newest first. The first 10 show, with "Show all N".
    - Tile states: **new** (charcoal tile with bronze foil, order number, "Expires 4 Nov", "Scratch now"); **won**
      ("+25 Points", then "Unlocks 12 Oct", "In your wallet", "On hold, return open" or, struck through, "Points
      taken back"); **no prize** ("Scratched 20 Sep"); **expired** ("Ended 2 Sep"); **cancelled** ("Order
      returned").
    - Footer line: "One card for every delivered order of ₹499 or more. Scratch it within 30 days of delivery." While
      the feature is off: "New cards are paused. Cards you already have can still be scratched until they expire."
    - The panel is hidden when the feature is off and the customer has no cards. When it is on and there are no cards
      yet: "Your first card comes with your next delivered order of ₹499 or more."
    - A load error shows "Couldn't load your scratch cards" with Try again (hidden instead while the feature is off).
    - `/wallet?card=<orderId>` opens that card straight away (the order page links there).
- **Scratching:** a bottom sheet on phones, a dialog on desktop.
    - Title "Scratch card" (focused on open), "For order ORD-1042, delivered 5 Oct".
    - The charcoal card shows "Scratch & Win", the order number, the canvas bronze foil, "Expires 4 Nov" and "1 of 2
      new".
    - Scratching past 50% reveals. "Reveal prize" is always there, for keyboards, screen readers and anyone who would
      rather not scratch.
    - The first scratch or the Reveal press asks the server. Until it answers, the face under the foil is a skeleton.
      If it fails, the foil is repainted and "Couldn't reveal this card. Check your connection and try again." shows
      with Try again (in place of Reveal prize). A 409 shows why ("This card has expired." or "This card was
      cancelled: order returned.") with Done.
    - Reveal: the foil fades, the prize pops from 0.96 and one copper sheen sweeps the number. With reduced motion,
      fades only.
    - The card has an `aria-label`, and the result is announced in a `role="status"` line: "25 points are in your
      wallet. They unlock on 12 Oct, when the order's 7-day return window ends." (or "…ready to use now", "…on hold
      while the order's return is open", or "No prize on this card. You get a new card with every delivered order of
      ₹499 or more.").
    - Buttons: "Next card" (only when another new card is waiting) and "Done".
- **Nudges (no pop-ups):**
    - A copper dot on the header Rewards icon (desktop and phone headers) while a new, unexpired card waits. Its
      label becomes "Rewards, scratch card waiting". It uses one shared listener per signed-in session (a
      `status == 'new'` query), not one per page view.
    - On a delivered order's page, under the points line: "A scratch card is waiting for this order. Scratch it", which
      links to `/wallet?card=<id>`. Once it is scratched: "Scratch card: you won 25 points" (or nothing for no prize).
- **Wallet history:** the prize entry shows "Scratch card prize, order ORD-1042" with a ticket icon.

## Admin

- **Admin > Commerce settings, new "Scratch & Win" tab** after Rewards, as in the mockup:
    - status chip (Off / Live, from the saved settings);
    - on/off switch, Minimum order (₹), Card expires after (days);
    - the prize table (points, weight, live chance % with a bar from `sm` up, remove), a fixed "Better luck next time"
      row, and Add prize (disabled at 10);
    - three StatCards: average cost per card (points, ₹ at the current point value, % of the minimum order), biggest
      prize and its odds, and the share of cards that win;
    - a "How cards work" notice, "Preview card" (a local draw in the real card dialog, labelled "Preview, gives
      nothing") and "Save Scratch & Win".
    - Like the Rewards tab, a failed load never falls back to defaults (saving stays off), and out-of-range values are
      clamped on save with a toast that says so.
- **Admin order page:** one line under the points line: "Scratch card: not scratched yet, expires 4 Nov", "won 25
  points" (+ " (on hold)" or " (voided)"), "no prize", "cancelled (order returned)" or "expired, not
  scratched".

## Error handling

- A scratch failure never loses a card: nothing is written unless the whole transaction commits, and the card stays
  `new` for another try.
- Every write uses a fixed id (`scratchCards/<rzp>`, `scratch_<rzp>`), created inside a transaction, so repeats never
  double-count.
- The header dot and the order page line fail silently (no dot, no line). The wallet panel shows a retry.

## Testing

- **Unit (`node --test`):** `normaliseScratchSettings`, `drawScratchPrize` (every roll maps to the right prize, the
  boundaries, all weights 0), `scratchCardEligible`, every row of `planScratchReconcile`, the browser's card view
  states, and the parity test for `scratch-core`.
- **Server, against an in-memory Firestore stand-in** (Java isn't installed, so the emulator can't run here): the
  `scratch-card` action (win, no win, double scratch returns the same prize, expired, void, order ended, other
  customer's card) and reconcile (card given on delivery, not below the minimum, not while off; voided on return;
  prize held, released, voided and restored; run twice changes nothing).
- **Browser:** the build, then screenshots at 390 and 1440 in light and dark of the wallet panel, the scratch sheet
  and dialog (before, during, after) and the admin tab, with 0 console errors. Customer screens are fed fixture cards
  through a temporary dev-only page (live Firestore is not written without the owner's OK, and the new rule is not
  deployed yet).
- **After the owner's OK:** deploy the rule, then a live run with the test shopper: give a card by reconcile, scratch
  it, check the ledger, return the order, check the void.

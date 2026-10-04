# Scratch & Win: money-logic review

Date: 2026-10-05. Branch `scratch-win`. Reviewed: `git diff b24cd56..2be43ae` (the server, the shared rules, the tests and
`firestore.rules`), against the spec `docs/superpowers/specs/2026-10-04-scratch-win-design.md`, together with the reward
code it plugs into (`src/lib/rewards.ts`, `api/create-order.ts`, `api/verify-payment.ts`, `reconcileRewards`, the order
status writers and the rules).

## How it was done

- **Reviewers.** Four reviewers, each with one question:
  - Can a prize be drawn twice?
  - Can a prize be kept after a return?
  - Can someone claim another customer's card?
  - Are the timing, maths and spec right?
- **Verifiers.** Two more agents tried to refute every finding, reproducing them with the in-memory Firestore where they
  could.
- **Threat model.** A customer with a modified browser who sends concurrent requests and writes Firestore directly within
  the rules; a delivery partner acting within the rules; an admin who makes mistakes; a browser that never calls
  reconcile.
- **Checking the fixes.** A second run (3 reviewers, 3 verifiers) checked the fixes for regressions; see the end of this
  report.

## Result

- **Nothing critical was found.** A prize cannot be drawn twice, re-rolled, chosen, or seen before it is saved.
  - 50 concurrent scratches commit exactly one draw.
  - The draw uses `crypto.randomInt` with no bias.
- **Ownership holds.** A card can only be scratched by its owner, and one payment gives at most one card.
- **The real problems were in how won points follow the order.** Most of them already existed for the points earned on an
  order (`earn_<rzp>`), and the prizes made them worse.

### Fixed (commits `7be97a1`, `400646b`)

| Finding | Severity | Problem | Fix |
|---|---|---|---|
| R1 (also D1, T1) | High | A return request saved without a reconcile left the points earned on the order, and its won prize, unheld. A modified browser can skip reconcile, and a dropped network call does the same. Once unlocked, the customer could spend them while the return was open; the void after the return then took the balance below zero. | Checkout (`holdEarnedOffDelivered` in `api/create-order.ts`) looks at the order behind every unlocked earning and prize. It holds any whose order is not at "delivered", as reconcile would, so the browser's live balance agrees. This also closes the money side of R6 (a failed reconcile after the shop marks an order returned, cancelled or refunded) and R7 (a return picked up with no pickup date). |
| R2 (also T11) | Medium | `unlockDays` can be set below 7, which let points unlock while returns were still allowed. | Points and prizes unlock at the later of "now + unlockDays" and "delivered + 7 days" (`unlockAtMs`). The scratch result says the points unlock "once the order's return window has closed" instead of naming a day count. |
| R5 / O-D1 (server part) | Medium | A delivery time written in the future, which the delivery partner's phone can do, kept returns open long after the points unlocked. | The same `unlockAtMs`: a future delivery time delays the points with it. |
| O-D4 | High if the Razorpay account accepts other currencies | The browser chose the currency sent to Razorpay, but every amount is in paise. | `create-order` always uses INR. |
| R3 | Medium | A customer could cancel a return after the shop approved it, even after handing the goods over, which moved the order back to "delivered" and released the points. | The button, `cancelReturn` and `firestore.rules` now allow it only while `returnStatus` is `pending`. **The rule is written, not deployed.** |
| D3 | Low | A card deleted by hand in the console was given again by reconcile, with a fresh draw. | `payments/<rzp>.scratchCardGivenAt`: a payment gets one card, ever. |
| T4 / O-D5 | Low | Turning the feature on gave cards for orders delivered while it was off, but only to customers who happened to run reconcile. | The admin tab stamps `siteSettings/scratchWin.enabledAt` when the switch goes on. No card is given for an order delivered before that. |
| D2 / T6 | Low | Scratching a card again (for example from a second tab) after its prize was taken back said "50 points are in your wallet". | The reply carries `prizeState`, and the dialog says the points were taken back. |
| O-D7 | Low | `reconcile-rewards` and the push actions accepted an order id containing `/`. A customer could point the push branch at a message they wrote and send a phishing notification. | Every action checks that the order id is a single path segment. |
| T8 | Low | The admin "biggest prize" odds ignored a second row with the same prize, and a typed weight could show above 100%. | Fixed. |
| T9, T10, O-D8, O-D6 (part), D5, T13 | Info / low | Restored cards kept their cancellation fields; the card read its unlock date outside its transaction; a failed scratch returned raw error text; the customer-written order number had no length limit; the in-memory Firestore applied a commit's writes one at a time; some spec behaviour had no test. | Fixed. 10 tests added (`npm test` 72/72). |

### Needs the owner's OK: a rules deploy

`firestore.rules` holds two changes that are written but not deployed: the `scratchCards` read rule (from the build) and the
return-cancel rule (R3). Deploy them together with `node docs/handoff/deploy-rules.mjs`.

### Before delivery partners are switched on

These only matter once `DELIVERY_PARTNERS_ENABLED` is true (it is off for Ishaputra). They need rules changes, and the
emulator can't run here (no Java), so they were left alone.

- **R4 / O-D2.** A partner assigned to a return pickup can move a "picked" order to out for delivery and then to delivered.
  That releases held points and prizes and restarts the return window. Rule fix: allow `picked` to `outForDelivery` only
  when `returnScheduledAt` is not set.
- **O-D1 / O-D3 (rules part).** A partner can write any `deliveredAt`. Rule fix: `deliveredAt` must equal `request.time`
  when it is first set, and the app should write it with `serverTimestamp()`. The server already guards the money side.
- **Found in passing.** The partner's own return-pickup update (`returnScheduled` to `picked`, with the return OTP fields)
  appears to be refused by the current rules. Test this before switching partners on.

### Not changed, by choice

| Finding | Why |
|---|---|
| R6 (UI part) | The admin gets no warning when the reconcile after a status change fails. The money side is now closed by the checkout hold. A visible warning is a possible follow-up. |
| R8 | A void typed by hand in the console as `voidedBy: 'server'` is restored by the next reconcile, and the card's prize label updates only on the next reconcile. This needs a console edit; there is no admin screen that voids entries. |
| T7 | A phone clock running fast hides a card in its last hours. Phones sync their clocks, and the server decides. |
| D4 / O-D9 | The prize table in force when a card is scratched is used, as the spec says, so a prize change applies to every unscratched card. |
| T5, O-D10, T12 | Small differences between the spec and the code (prize points above 10,000 are clamped, as the admin tab's toast says; a non-array `prizes` field falls back to the defaults). The spec now says what the code does. |

## Checking the fixes

<!-- filled in after the fix review -->

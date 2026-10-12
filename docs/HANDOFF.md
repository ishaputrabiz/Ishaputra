# Handoff: read this first

Ishaputra Botanicals is client #1 of the Dream Team Services white-label store. It is built from the Sreerasthu codebase (React + Vite + Firebase + Razorpay + Vercel).

This file holds the working state between sessions, so a new chat does not need the old one.

- **At the start of a session:** read this file, then do the first open item under "Next steps".
- **At the end of a session:** update "State" and "Next steps" before the session ends.

Last updated: 2026-10-12 (`sreerasthu-port` reviewed, fixed and merged into `main`.)

## State

- **2026-10-12 (latest): `sreerasthu-port` reviewed, fixed and MERGED into `main`** (`0997d4e`, `--no-ff`, local only, never pushed).
  - **Review:** 2 reviewers (server/security, front end), then 2 re-reviews of the fixes. Final verdict "ready to merge", 0 Critical/Important left.
  - **Fixes on the branch:** `a4dc37e`, `e2345a3`, `62627b6`, `1a5165a`, `05d26a0`, `033875e`.
    - STOP matching: phrases and repeats ("Stop these updates", "STOP STOP", "stop karo", "band karo", "remove me from your list"); "please remove it" and "stop by the store" are not opt-outs.
    - Broadcast double sends: before any send, one transaction takes a lock per channel, `broadcastLocks/{push_|wa_}<hash of audience+customers+content>`. Released only when nothing can have gone out; a sent channel keeps it 24 h; a Meta timeout or crash keeps it ("may have been sent" 409). WhatsApp template checks run before push. Send budget 40 s from handler entry, 10 s per Meta call, max 1000 WhatsApp numbers per broadcast, `vercel.json` gives `api/broadcast.ts` 60 s. Actor from the verified login. `broadcastLocks` has no rule, so browsers can't touch it (no rules deploy needed).
    - Inbox: ⋮ menu "Stop announcements to this customer" / "Turn announcements back on" plus a "No announcements" badge (desktop). A marketing template (or one of unknown category) to an opted-out number is refused. Loads the newest 500 messages.
    - Image compressor stops when the page closes (it looped forever). Customer search reads the customer list once per visit. The checkout step change jumps to the top instantly.
  - **Checks on `main` after the merge:** `npm test` 167/167, `announcement.test.mjs` 32, `whatsapp-reply.test.mjs` 15, build passes, tsc only the 7 old errors, API files type-check clean, `api/` = 12. Inbox opt-out screenshots at 390/1440 light/dark (demo data, temporary admin seeded then removed), 0 console errors: `../shots/inbox-optout/`.
  - **Review minors left open (not blocking):** see Next step 0.
- **2026-10-08: three Sreerasthu updates ported, on branch `sreerasthu-port` (merged 2026-10-12, see above).** Source: github.com/sreerastusilvers/sreerasthusilvers commits `e76fcdb`, `236e57b`, `4dd87d9` (Ishaputra was copied from Sreerasthu `4869296`). Commits `07b551b`, `4834124`, `0156bfd`, `4dbe149`, `cc5ad17`.
  - **Image compressor:** Admin > Image compressor (`/admin/image-compressor`, `src/lib/imageCompressor.ts`, new dep `fflate`), plus a link under the Product form photo upload. Restyled to the Ishaputra admin look.
  - **Mobile checkout step 3:** step 2 now ends with "Continue to payment"; step 3 shows the address (Change), payment method, every item at the price charged (dealer units when they apply) and the bill, then Slide to Pay. No pricing/order/payment logic changed. Checked as the preview shopper at 390 px light/dark (no overflow, focus/scroll reset, Back works, totals add up; cart untouched).
  - **WhatsApp:** team inbox (filters, assign, resolve, notes, quick replies, 24 h window, media both ways, ticks, setup checklist, `?demo=1` in dev), Marketing > Templates via the Meta API (create/sync/delete, picture headers), Marketing > Announcement (`store_announcement`, STOP/START opt-out), broadcast fixes (role filter, `whatsappNumber`, dedupe, opt-out). API files = Sreerasthu HEAD plus a constant-time admin-key compare. Restyled to the Ishaputra admin look. New admin-only rule `whatsappSnippets` (NOT deployed). Guide: `docs/WHATSAPP_SETUP.md`.
  - **Checks:** build passes; `npm test` 167/167; `node scripts/tests/announcement.test.mjs .` 21, `whatsapp-reply.test.mjs .` 14; tsc 7 old errors only; `api/` = 12. Admin screens shot at 390/1440 light/dark with a temporary admin (`ui-fixtures.mjs seed`, then `remove`: 13 orders + admin deleted), 0 console errors: `../shots/admin-port/`, checkout in `../shots/checkout-step3/`.
  - **Not verified:** any real Meta call (templates, media upload, webhook signing); broadcast to a large list. Picture templates need `R2_PUBLIC_URL` (the server only sends pictures from R2).
  - **Not ported (owner's choice):** add-to-cart confirmation panel, cart stock transaction fix, account sidebar/photo, image viewer, home autoplay, product-claim changes.
- **2026-10-05 (latest): Step 3 started. Client checklist ready to send:** `docs/client-checklist-steps-3-5.md` and `docs/client-checklist-steps-3-5.pdf` (A4, logo, tick boxes). Added: new-order alert number, admin emails, licence numbers (AYUSH/FSSAI, if needed), banners, videos, policy pages, all `CLIENT.md` placeholder questions, "(first)" marks, and "add us as a team member" instead of sending keys (uses thedreamteamservicespvt@gmail.com). Not yet sent; the user sends it.
- **2026-10-05 (end): Dealer + Loyalty card DONE and merged into `main`** (`5e083ec`, `--no-ff`, local only, never pushed). Ships **off**; values are placeholders in `CLIENT.md`.
  - **Rules deployed** with the owner's OK: `node docs/handoff/deploy-rules.mjs`, ruleset `61bbb448-4e54-4d30-b9ec-3c6e8cf1ea56` (`dealers`, `dealerPricing`, the dealer-fields orders rule).
  - **Live test passed: 265/265** (`node docs/handoff/dealer-loyalty-live.mjs http://127.0.0.1:5182 ../shots/dealer-loyalty-live`). Cleanup complete: 3 test orders, 3 payments, 2 ledger entries and 2 scratch cards deleted; `siteSettings/dealer`, `dealerPricing/current`, `siteSettings/rewards`, `siteSettings/scratchWin`, `dealers/<shopper>` and the reward lock deleted again (none existed before); cart and addresses restored. 36 screenshots (390/1440, light/dark) in `../shots/dealer-loyalty-live/`, 0 console errors, no sideways overflow.
  - **Verified on `main` after the merge:** `npm test` 167/167, `npm run build` passes. `CLIENT.md` Step 2B ticked.
  - **Still not tested live:** admin UI screens (Admin > Dealers, Commerce Dealers tab, tiers editor; needs an admin login), the invoice buyer block, and a real Razorpay payment (needs the owner's test keys).

- **2026-10-05 (later): Dealer + Loyalty card BUILT and money-checked on `dealer-loyalty` (HEAD `66e7e83`, not merged). Waiting on the owner to run the rules deploy (the permission checker blocked it for Claude).**
  - Lean mode (owner): one Sonnet builder per task; only Task 11 (checkout) reviewed (approved, no Critical/Important). Tasks 11-15 `6b72171`, `bab257d`, `a72838b`, `4bf08a0`, `966f847`; fix wave `2020821`, `920968d`, `ec1820b`.
  - **Money check (2 Opus agents):** reports `.superpowers/sdd/money-review-A.md` (server + rules) and `money-review-B.md` (browser/server parity). 0 Critical. **1 High, pre-existing on `main`: product id path traversal in `api/create-order.ts`** (`../reviews/<id>` let a customer price their own "product"); fixed `073db6c` (id must match `^[A-Za-z0-9_-]{1,128}$`, path encoded; same check in the other `api/*.ts`). Not live anywhere: Vercel isn't set up yet. Also fixed: L1 a returned order no longer lifts other orders' multiplier (`7c8a3e3`); orders rule: dealer fields only for an approved dealer's own business name and GSTIN; B1/B3 payment hold only at or above the dealer minimum, read errors become an explicit "unavailable" state (`ff7fb97`). Fix report `.superpowers/sdd/money-fix-report.md`. `npm test` 167/167, build passes, type check baseline.
  - **Accepted / deferred (Low):** L2 orders delivered together count each other (spec allows); L3 a Razorpay order made at dealer prices can still be paid after a suspend; B2 preflight ignores up to Rs 1 price drift (can flip the threshold; the server refuses, never undercharges); B4 an admin price change of up to Rs 1 mid-click; L5 placeholder tier multipliers apply to every customer as soon as the site ships (in the client checklist).
  - **Live test script ready, not run:** `docs/handoff/dealer-loyalty-live.mjs` (rules over REST as the shopper incl. the new orders rule, real create-order/verify/notify with fake Razorpay, tier multiplier, browser screens at 390/1440 light/dark, full snapshot + restore in `finally`). It turns the dealer programme, rewards and Scratch & Win on for a few minutes, so run it when the shop is quiet. Not covered: admin UI screens (needs an admin login) and the invoice buyer block.
  - Dev server restarted with fresh deps (`--force`; the old one served 3 React copies and crashed Radix Switch/Tabs/Select).
  - Client checklist for Steps 3-5: `docs/client-checklist-steps-3-5.md`.
  - Owner notes: pre-existing `ProductForm` blanks `inventory.sku` on every update; ConfirmDialog sits under Sheet (z-index), Admin > Dealers works around it.
- **2026-10-05: Dealer Membership and Loyalty card (rest of Step 2B): designing, no feature code yet.** The owner asked for placeholder defaults, mockups first for a yes, then build, money review, live test and merge. Code map of what they touch: 5 read-only agents (results summarised here).
  - **Map facts that drive the design:**
    - `api/create-order.ts` re-prices every order from public `products` (REST, public key) and cross-checks the browser's total within Rs 1, so dealer prices must be applied there (uid verified **before** pricing; dealer record read with the Admin SDK) and mirrored in the browser (`useCheckoutPricing`, cart), or checkout fails "Order total mismatch".
    - A customer can write **any** field on their own `users/<uid>` except `role`/`accountStatus` (rules 44-50). So dealer status can't live there: use an admin-write-only `dealers/<uid>` doc.
    - Tiers today are browser-only and display-only, from `order.total` of delivered orders (a client-written field, so forgeable). No member number exists. No QR library.
  - **Placeholder defaults chosen (shown in the mockup; the owner can change any):**
    - Dealer: shipped **off**. Signed-in customers apply on `/dealer` (business name, type, contact, phone, city, state, optional GSTIN, message); an admin approves, rejects, suspends or reinstates in a new Admin > Dealers page. Dealer price = 20% off the regular price store-wide, or an optional fixed dealer price per product (product form). Dealer prices are private (only approved dealers and admins can read them). They apply when the order is worth Rs 2,000+ at regular prices; below that, regular prices and a nudge. No stacking: dealer-priced orders take no coupon, no points or cashback, earn no points and get no scratch card. Delivery and GST as usual. Dealer orders print the business name and GSTIN on the invoice. Not in v1: dealer-only products, per-dealer levels, credit terms, email or WhatsApp notices, quantity price breaks.
    - Loyalty card: a digital member card at the top of `/wallet` (tier metal, name, member number derived from the account id, member since, points worth, tier benefit), keeping the progress bar and tier steps; tier and number also on the phone account card and the admin customer page. Tier benefit: a points multiplier (placeholder Silver 1x, Gold 1.25x, Platinum 1.5x, Premium 2x at Rs 0 / 5,000 / 15,000 / 30,000), moved from `BRAND.loyaltyTiers` into an admin setting. Tier = money paid online on delivered, not-returned orders, from the server's `payments` records; the server applies the multiplier when the order earns points. No QR or physical card (no scan target for an online shop).
  - **Building on branch `dealer-loyalty` (owner said yes to the mockup 2026-10-05). Paused after Task 10b because of usage.** Spec `docs/superpowers/specs/2026-10-05-dealer-loyalty-design.md`, plan `docs/superpowers/plans/2026-10-05-dealer-loyalty.md`. Progress ledger (git-ignored, on disk): `.superpowers/sdd/progress.md`, with the review notes and deferred Minor items per task; task briefs and reports are next to it.
    - **Done and reviewed (commits `14c263f..bda4ed8`):** 1 tiers + multiplier in `rewards-core`; 2 `dealer-core`; 3 member number + form rules; 4 create-order dealer pricing; 5 payment record `dealer`, tier multiplier on earn, no dealer scratch card; 6 rules (`dealers`, `dealerPricing`; NOT deployed); 7 `dealerService`, `useDealer`, `useLoyaltyStatus`; 8 loyalty card on `/wallet` and account; 9 `/dealer` page; 10 dealer prices on cards, search, wishlist, header, product page. **10b** (home spotlight tiles, no coupon ticket next to a dealer price; `bda4ed8`) is built but not reviewed yet. `npm test` 100/100, build passes.
    - **Left:** Task 11 checkout + cart drawer + invoice (money path), 12 Admin > Dealers, 13 Commerce Dealers tab + loyalty tiers editor (must also fix the Rewards tab "values adjusted" toast that now always fires; see ledger), 14 product form dealer price + admin customer and order pages, 15 clean-up (delete `src/pages/__mock/Dealer*Mock.tsx` and the uncommitted `MOCKUP` lines in `src/App.tsx`), CLIENT.md, docs. Then a final fix wave from the ledger, money review, rules deploy + live test (owner's OK given), merge, and the client checklist for Steps 3-5.
    - **Owner notes:** a subagent printed the preview shopper's login (`docs/handoff/shopper.local`) into its local tool output; change that password if transcripts are ever shared. `/wallet` "Total spent" counts all delivered order totals, so it can differ from the tier spend.
  - **Mockup (approved):** in `../shots/dealer-loyalty-mockup/`. Screenshots (0 console errors, no sideways scroll) in `../shots/dealer-loyalty-mockup/`: start with `board-customer-light.png`, `board-customer-dark.png`, `board-admin-light.png`, `board-admin-phone-dark.png`. Built and then critiqued by a 4-agent workflow.
    - Dev-only pages: `src/pages/__mock/DealerLoyaltyMock.tsx` and `DealerAdminMock.tsx` (git-ignored via `.git/info/exclude`) plus uncommitted `import.meta.env.DEV` routes in `src/App.tsx` marked "MOCKUP, do not commit". Open `/__mock/dealer-loyalty` (index of views) and `/__mock/dealer-admin?view=dealers|settings|tiers|product|customer`. **Delete both files and the App.tsx lines when the real build starts.** Shot scripts: scratchpad `dl-shots.cjs`, `shoot-dealer-admin.cjs` (session-only).
    - Found while mocking (fix in the build): the live `/wallet` progress bar fills by spend / top threshold, so a Gold member's fill stops short of the Gold step; the mock fills it step by step.
    - After the yes: spec `docs/superpowers/specs/2026-10-05-dealer-loyalty-design.md`, plan, build on branch `dealer-loyalty`, money review (workflow), rules deploy + live test (owner's OK), merge.

- **2026-10-05: Scratch & Win is finished and merged into `main`** (`--no-ff`, local only, never pushed). It stays **off** until the client confirms the placeholder values and an admin turns it on.
  - **Rules deployed** with the owner's OK (`node docs/handoff/deploy-rules.mjs`, ruleset `2abcb7dc-…`): the `scratchCards` read-only rule, a return request must start `pending`, and a customer can cancel a return only while it is `pending`.
  - **Live test passed** with the owner's OK: `node docs/handoff/scratch-win-live.mjs http://127.0.0.1:5182 ../shots/scratch-win-live` (dev server on 5182). It uses the real create-order, verify-payment and notify-order code, live Firestore, the deployed rules (over REST as the test shopper) and the real storefront in Chromium. The browser's `/api/notify-order` calls go to the real handler in the script's process, because the dev server doesn't serve that route. Only Razorpay is faked. It checked:
    - With the switch off, a delivered order gets points but no card. After the switch goes on, an order delivered more than 15 minutes earlier still gets no card. (The server allows 15 minutes either way for device clocks, which is by design.)
    - A delivered order of ₹1,098 gets exactly one card, even after a second reconcile, and the payment is stamped with `scratchCardGivenAt`. The shopper can read the card but cannot create or change one. The prize unlocks at the same time as the order's earned points, delivery + 7 days.
    - Scratching in the browser at 390 px with "Reveal prize" won 5 points. The ledger got `scratch_<rzp>` (earn, source scratch, active, not held), and scratching again returns the same prize.
    - Returns: a request that starts `approved` is refused (403) and a `pending` one is accepted. The prize and the earned points are held while the return is open, the customer can't cancel once the shop approves, and when the order is returned both are voided. The dialog is told the prize was taken back.
    - An unscratched card survives a cancelled (pending) return. Once the order is returned the card is void, and a scratch gets 409 `card_void` with no draw.
    - The wallet and order page with live cards at 390 and 1440, light and dark, have 0 console errors and no sideways overflow. Screenshots are in `../shots/scratch-win-live/`, including the "return approved" wording on the order page and "Points taken back" on the wallet.
    - Cleanup: the 4 test orders and their payments, cards and 5 ledger entries are deleted, and `siteSettings/scratchWin` is deleted again (it had never been set). The shopper's ledger is back to its 2 demo entries.
  - **Verified on `main` after the merge:** `npm test` 74/74, `npm run build` passes.
  - **Still not tested:** a real Razorpay payment (needs the owner's test keys).

- **2026-10-05: Scratch & Win money-logic review done; fixes committed on `scratch-win` (`7be97a1`, `400646b`, `84df237`, docs after them; local only, not merged).** Report: `docs/superpowers/reviews/2026-10-05-scratch-win-money-review.md`.
  - **How:** 4 reviewers (draws, returns, ownership, timing/spec) and 2 adversarial verifiers.
  - **Result:** nothing critical. No double draw, no re-roll, no claim on another customer's card; 50 racing scratches commit one draw.
  - **Biggest problem, fixed:** R1, high and pre-existing for earned points too. A return written without a reconcile left points and prizes spendable while the goods came back.
    - Checkout now holds any unlocked earning or prize whose order is not at "delivered" (`holdEarnedOffDelivered` in `api/create-order.ts`).
    - Points never unlock before `deliveredAt + 7 days` (`unlockAtMs` in `api/notify-order.ts`).
  - **Other fixes:** one card per payment ever (`payments/<rzp>.scratchCardGivenAt`); no cards for orders delivered while the switch was off (`siteSettings/scratchWin.enabledAt`, stamped by the admin tab); create-order always INR; order-id check on every notify-order action; the dialog says when a prize was taken back; admin odds; plus tests (`npm test` 72/72).
  - **Written, NOT deployed** (next to the `scratchCards` rule; all need the owner's OK to deploy):
    - a customer can cancel a return only while `returnStatus` is `pending`;
    - a customer's return request must start `pending`.
  - **Left for before delivery partners are switched on** (rules plus emulator; listed in the report): a partner can flip a return-pickup order back to delivered; a partner can write any `deliveredAt`; the partner's own return-pickup update seems refused by the current rules.
  - **Verified (at `84df237`):** `npm test` 74/74, `npm run build` passes, type check at baseline, ESLint unchanged on every touched file.
    - Screenshots of the new result copy (won, taken back) at 390 and 1440, light and dark, show 0 console errors and no overflow: `../shots/scratch-win-review-fixes/`. They came from a temporary harness page, since deleted.
  - **Check of the fixes** (3 reviewers, 3 verifiers, `git diff 2be43ae..400646b`): nothing critical or high. 9 small issues were confirmed and fixed in `84df237`; the report lists them. The main ones:
    - The checkout hold is now a transaction per entry with no age limit, and it also labels the order and the card as held.
    - `enabledAt` allows 15 minutes for device clocks and is stamped from the saved document.
    - The wallet and checkout say points unlock `max(unlockDays, 7)` days after delivery.
    - The order page says when a return was approved.
  - **Not shown in a browser:** the wallet, checkout and order-page wording changes. They need the live test shopper.
- **2026-10-04: Scratch & Win is built on branch `scratch-win` (11 commits from `b24cd56`, not merged, local only).** The owner approved the mockup with no changes. Spec `docs/superpowers/specs/2026-10-04-scratch-win-design.md`, plan `docs/superpowers/plans/2026-10-04-scratch-win.md`. Shipped **off**; placeholders are in `CLIENT.md` ("Scratch & Win" and "Placeholders for the client").
  - **Server (`api/notify-order.ts`):** `reconcileRewards` now gives a card on delivery (feature and rewards on, paid online at or above the minimum, not already past its expiry), cancels an unscratched card when the order ends, restores it if reopened, and keeps a won prize in line with the order (hold, release, void, restore). It's one transaction that re-reads the order. New action `scratch-card` draws with `crypto.randomInt` inside a transaction and writes `rewardLedger/scratch_<rzp>` as `kind: 'earn', source: 'scratch'`, so `summariseRewards` treats it like earned points with no change to `rewards-core`. The card id is checked (`[\w-]`) before it's used in a path.
  - **Shared rules:** `src/lib/scratchWin.ts`, whose `scratch-core` block is copied into `notify-order.ts`. `npm run sync:rewards` now syncs both blocks, and the parity test checks both.
  - **Customer:** "Scratch cards" panel on `/wallet` (between the tier card and Points & cashback), the sheet/dialog with the canvas foil, a copper dot on the header Rewards icon (one shared listener per session), and a line on the order page linking to `/wallet?card=<id>`. Ticket icon for prizes in the points history. **Admin:** Commerce settings > Scratch & Win tab, and a scratch-card line on the admin order page.
  - **Rule written, NOT deployed:** `users/{uid}/scratchCards` is read-only (owner or admin). Deploy needs the owner's OK; until then customers can't read cards (the screens stay hidden while the feature is off, and the header dot fails silently).
  - **Verified:** `npm test` 62/62, including 12 server tests against a new in-memory Firestore stand-in (`tests/helpers/fakeFirestore.ts`, with retried transactions; there's no Java for the emulator). They cover two racing scratches (one draw), refusals, return hold/release/void/restore, and cancel/restore. `npm run build` passes. Type check is at baseline (only the old `videoCallService` 6 + `DeliveryDashboard` 1). ESLint matches `main` (251 errors; `main`'s real count, the 197 below is out of date).
  - **Screens checked** through a temporary harness, since deleted, with fixture cards (nothing was written to live Firestore): 390 and 1440, light and dark, scratch by hand, keyboard reveal, a failed request and Try again, no prize, the admin tab and Preview. 0 console errors, no sideways overflow, title focused on open, no axe violations in the dialog. Real `/`, `/wallet` and `/admin/commerce-settings` load with 0 console errors. Screenshots are in `../shots/scratch-win-build/` (outside the repo).
  - **Bugs found and fixed in that check** (the mockup had the first one too): the eraser inherited a 55%-opaque colour and left a translucent trail; a mouse drag selected nearby text; a failed reveal showed two buttons for the same action.
  - **Not tested live:** a real delivered order giving a card, a real scratch, a real return. That needs the rule deployed and the owner's OK to write to the live Firestore with the test shopper.

- **2026-10-04: one slide pays (`b0c7f28`, on `main`).** The owner reported that sliding "Slide to pay" on the phone opened a second checkout screen ("Payment details", with another "Slide to place order"). Desktop had the same double step ("Place order" opened a popup with a second "Pay" button). Both extra screens only repeated the bill and the single payment method, so they are removed: the slide (phone) or the "Pay ₹…" button (desktop) opens Razorpay straight away. At the owner's request the **Payment method card** (Pay online, Razorpay) now sits on the checkout step itself, above the bill on the phone and above the Pay button on desktop. If the payment is cancelled or fails, the slider resets.
  - Verified with the test shopper, `/api/create-order` stubbed to 500 in the browser (no Razorpay or Firestore writes): one slide or one click makes exactly 1 create-order call, no "Payment details" screen, the slider or button comes back, 0 page errors, page width stays 390. Screenshots at 390 and 1440, light and dark. `npm test` 32/32, build passes. A real Razorpay payment still needs the owner's test keys.
- **2026-10-04: the mobile-first redesign was REJECTED by the owner; `main` keeps the old (pre-redesign) design.**
  - Owner's words: "the before is good, not the after. We need an e-commerce website, a product website, not an information website." The editorial direction (big type, lots of space, few products per screen) read as a brand/information site.
  - The work is kept, unmerged, on branch `redesign-mobile-first` (spec `docs/superpowers/specs/2026-10-04-mobile-first-redesign-design.md` there). Do not merge it. Individual non-visual fixes could be cherry-picked later only if the owner asks.
  - **Kept on `main`: the `>>` bug fix (`4416715`).** On phone checkout step 2, the add-ons rail's `sr-only` "Was" spans escaped the unpositioned scroller and widened the page to 927px: a blank cream page with only the slide-to-pay handle showing, and `innerWidth`-based `isMobile` flipped the phone into the desktop checkout. The rail is now `relative` and `isMobile` uses `matchMedia`. Verified with the repro script (width stays 390, phone layout stays). `npm test` 32/32, build passes.
  - `fix-row-autoscroll` is merged into `main` (`a403da8`).
- **2026-10-04: home product rows fixed** (`a7cf774`, branch `fix-row-autoscroll`, not merged yet). The owner reported the section card rows (Top Deals, Most loved, New arrivals, Trending) often did not move. Causes:
  - CSS `scroll-behavior: smooth` swallowed the per-frame writes; the hook now writes with `behavior: 'instant'`.
  - A tap's synthetic mouseenter and a click's focus left rows paused for good. Now it pauses only while held (a mouse over the row, a finger on it, or keyboard focus), and resumes 350 ms after the mouse leaves or 1.2 s after a finger lifts.
  - The loop wrapped at half the scroll width, not the period; Top Deals desktop paged every 4.5 s and now uses the same continuous loop.
  - Checked in Chromium at 1440 (3 rows) and 390 touch (4 rows): every row drifts, stops while held and resumes, with 0 page errors. `npm test` 32/32, build passes.
- **2026-10-04: owner feedback.** The owner sees no visible difference from the UI pass and wants a clearly world-class look. Cause: `CLIENT.md` locked "keep Sreerasthu's layouts exactly", so the pass polished inside the old layouts (a11y, states, consistency, bugs). **Next step: a visible redesign, home page first, with new layouts allowed.** The owner doesn't want business questions: Claude picks sensible defaults, marks placeholders, and shows before/after screenshots.
- **2026-10-04: the world-class UI pass is merged into `main`** (`f3205c3`, `--no-ff` from `ui-world-class`; local only, never pushed). The owner reviewed and approved it. After the merge: `npm test` 29/29, `npm run build` passes.
  - **How it was done:** a full-site audit (8 auditors + 1 synthesis, 295 findings, screenshots at 390 / 768 / 1440 in light and dark, `playwright-cli` checks), the owner's 14 decisions (recorded in `CLIENT.md`, "UI pass decisions"), a shared foundation (`488317e`), 9 area packages in two waves, a fresh-eyes review (70 issues, no regressions) and a fix round that closed all 70.
  - **The design system** for this and future clients is documented in `docs/ui-system.md`: tokens (motion, status, radius, z-index), skeletons, StatusBadge / `lib/orderStatus`, Notice, EmptyState, ConfirmDialog (with `returnFocusRef`), IconButton, WishlistToggle, ProductCard, AuthCard / AuthField, AdminPageHeader, StatCard, format helpers, `usePageMeta`.
  - **Behaviour changes the owner approved** are listed in `CLIENT.md` ("UI pass decisions"): old Sreerasthu URLs open `/products`; desktop `/search`; one password policy; Buy again at today's price; new visitors follow the system theme; confirmations before irreversible actions; contact form opens a prefilled email; analytics loads lazily; and more.
  - **Bugs fixed on the way:** the order page read every order to show one (now one document read; its chunk went from 686 kB to 51 kB); the wishlist heart pressed with Enter on category pages didn't save (stale state in `useWishlist`); the login form vanished on a wrong password; 'Shop by concern' and footer links led to "Category not found"; a fake fixed delivery date in the success modal; the contact form only logged to the console.
  - **Not approved, left as it was:** one product card everywhere, deleting the hidden mobile bottom nav.
- **Verification (2026-10-04, at `9dd7ddb`):**
  - `npm test` 29/29. `npm run build` passes. `tsc` (via `tsconfig.check.json`): only the old `videoCallService` (6) and `DeliveryDashboard` (1) errors; the `VideoCallRequestModal` one is fixed.
  - ESLint: 197 errors, down from 224 on `main` before the pass; nothing new (mostly old `no-explicit-any`).
  - Final capture: 52 page views (home, products, product, login, about, `/jewelry`, checkout, account, an order, wallet, admin dashboard, admin orders, the late-return order) at 390 and 1440 in light and dark: **0 console errors, 0 failed requests, 0 axe violations**.
  - The live test data is deleted (13 `ui-fx-*` orders and the temporary admin; `admin.local` is gone). The preview shopper's cart is back to its 3 lines.
- **2026-10-03: step 1 done.** `step-2b-rewards` is merged into `main` (`46aba50`).
  - Review result B is closed (owner chose rule + admin warning, `24194ef`). The 7-day rule is deployed to `ishaputrabotanicals`. `hardening-check` PASS, including the new late / undated / in-window return cases.
  - The `CLIENT.md` "Rewards (Task 8)" notes are written (`16964f8`).
- **UI tooling (kept for the next client):** `docs/handoff/ui-shots.mjs` (per-screen screenshots + console, network and axe logs), `docs/handoff/ui-fixtures.mjs` (`seed` / `remove` demo orders in all 13 states + a temporary admin; needs the owner's OK, it writes to the live Firebase), `docs/handoff/ui-profiles.mjs` (logged-in profiles for `playwright-cli`, no password on any command line).
- **Before that, branch `step-2b-rewards`:**
  - `102bef7` Rewards hardening. `9469bea` reservation timeout. `7128f23` rewards display fixes.
  - `d2573f4` (2026-10-03) Fixes found in the display screenshots (wallet total spent, out-for-delivery as pending, honest points loading state, order page card style, monochrome footer map).
- **Firestore rules:** the hardened rules, plus the 7-day return rule, are deployed to `ishaputrabotanicals`.

## Next steps (in order)

0. **`sreerasthu-port`: DONE 2026-10-12** (reviewed, fixed, merged; see "State").
   - **Optional small follow-ups from the review (Low):**
     - Webhook: one failing item returns 500 for the whole payload, so Meta redelivers it and `unreadCount` counts twice. It also never checks `metadata.phone_number_id`, which matters if one Meta app ever serves two client stores.
     - `x-admin-key` still unlocks every WhatsApp action, and the key sits in admins' `localStorage`. Consider ID tokens only.
     - "Admin init failed" returns `err.message` before auth. The webhook GET compares the verify token with `===`.
     - UI: the announcement composer reads all `users` per visit (fine for a small store); a failed opt-out query is silent; the attachment caption limit isn't enforced on pre-filled text; `WhatsAppPreviewBubble` italicises inside words (`ORD_2024_55`); scroll-to-bottom runs even when the admin scrolled up; deleting a quick reply has no confirmation; the `TemplatePictureField` file input has no accessible name; compressor "Compressing N of M" is off after an error; there is no file-size cap; there are 3 near-duplicate image compressors.
     - Checkout: Change/Edit/Back stay tappable while placing (the server check keeps it safe).
   - **Owner to-dos for WhatsApp, in `docs/WHATSAPP_SETUP.md`:** Vercel env incl. `WHATSAPP_WABA_ID`; webhook `https://[NEED: live domain]/api/whatsapp-webhook`; Firestore rules deploy for `whatsappSnippets` (`node docs/handoff/deploy-rules.mjs`, owner's OK); then Marketing > Announcement > "Create announcement template" once.
1. **No redesign.** The owner likes the current design. Any future visual change: keep the product-dense e-commerce layout, show a cheap mockup of ONE screen first, and get a yes before building.
2. **Scratch & Win: DONE 2026-10-05** (rules deployed, live test passed, merged into `main`; see "State"). To switch it on: the client confirms the values in `CLIENT.md`, then an admin turns it on in Commerce settings > Scratch & Win. Decisions (owner said "just complete it", 2026-10-04):
   - Admin-configurable (`siteSettings.scratchWin`), shipped **off**, values marked as placeholders and listed in `CLIENT.md`.
   - One card per **delivered** online order at or above an admin minimum; created by `reconcileRewards` as `users/<uid>/scratchCards/<rzp>`.
   - Prizes: loyalty points in admin-set sizes with weights, plus "better luck next time" (weight 0 by default). No coupons or cashback for now (coupons are public and not tied to a customer; cashback is the riskiest).
   - The server draws the prize **when scratched** (new `scratch-card` action in `api/notify-order.ts`, a transaction plus `crypto` randomness); points go in as a `scratch_<rzp>` ledger entry that unlocks, freezes and voids exactly like `earn_<rzp>`. An unscratched card is voided if the order is returned; cards expire after admin `expiryDays`.
   - Customers can only read their cards; only the Admin SDK writes them. The admin page shows the average cost per card.
   - **Built on branch `scratch-win` (2026-10-04, see "State").** Next, in order:
     1. ~~Money-logic review~~ **Done 2026-10-05** (see "State" and the report).
     2. ~~Fixes and the check of the fixes~~ **Done 2026-10-05.**
     3. ~~Rules deploy and live run with the test shopper~~ **Done 2026-10-05** (`docs/handoff/scratch-win-live.mjs`).
     4. ~~Merge `scratch-win` into `main`~~ **Done 2026-10-05.**
   - **Still open from the review, before delivery partners are switched on** (rules plus emulator): a partner can flip a return-pickup order back to delivered; a partner can write any `deliveredAt`; the partner's own return-pickup update seems refused by the current rules.
3. **Smaller follow-ups:**
   - Owner to do in Admin > Commerce: set Ships From = Telangana (delivery charges still assume Andhra Pradesh).
   - **Done 2026-10-04 (`4e64b8d`):** the wishlist page shows one toast on remove; cart lines keep the order they were added in. Not checked in a browser (needs the live preview shopper).
   - Generate `public/sitemap.xml` once the domain is real; set `VITE_SITE_URL` on Vercel; PERF-14's `initializeAuth` part.
   - Client placeholders: `CLIENT.md` ("Placeholders for the client").
4. **Dealer + Loyalty card: DONE 2026-10-05** (rules deployed, live test 265/265, merged into `main`; see "State"). To switch it on: the client confirms the values in `CLIENT.md`, then an admin turns it on in Commerce settings > Dealers.
5. **Step 3 accounts: STARTED 2026-10-12** (decisions in `CLIENT.md` > Accounts). Order agreed with the user:
   1. GitHub: push `main` to the client's private repo (history checked 2026-10-12: starts at the clean copy `ca03a6d`, no real keys; only dummy Razorpay test values in `.env.example` and test scripts).
   2. Vercel: the client imports the repo, pastes the env vars from `.env` (the user pastes; never print them), deploys to `*.vercel.app`; add that domain to Firebase Auth > Authorized domains.
   3. Cloudflare: add `ishaputra.in`, switch the nameservers at GoDaddy to Cloudflare's.
   4. Domain to Vercel: Vercel's records in Cloudflare DNS, proxy off; set `VITE_SITE_URL`; add `ishaputra.in` to Firebase authorized domains.
   5. Razorpay test keys into Vercel env, then a test payment.
   6. Cloudflare R2 on `images.ishaputra.in` (remove the `VITE_CLOUDINARY_*` vars).
   - Security audit (global rule, ultracode on) before live Razorpay keys.
   - The client checklist is ready (`docs/client-checklist-steps-3-5.pdf`). The user sends it to the client. As answers arrive: fill `src/config/brand.ts` and `CLIENT.md`, then follow `CLAUDE.md` "Step 3: switch to the client's accounts" (Razorpay test keys, Cloudflare R2, WhatsApp, Vercel and domain, real products). To rebuild the PDF after editing the Markdown, render it with the global `playwright` package (A4, logo `client-assets/logo-transparent.png`).

## Review result

One reviewer (2026-10-03) checked `git diff 1191020..HEAD` against the 27 findings: **all 27 are resolved.** It found 3 new issues:

- **A. Fixed (`6982afc`).** A reservation released as unpaid and then paid late was re-spent silently. The order was never flagged, so repeated late payments could push a balance far below zero unseen. Reconcile now flags such an order for review once (`rewardsLate`), and `hardening-check` covers it.
- **B. Closed 2026-10-03 (`24194ef`, owner chose both options below; rule deployed, hardening-check covers it).** It was: `firestore.rules` `isValidReturnRequest` had no time limit; only the app's button enforces the 7-day window. A customer writing straight to Firestore could spend earned points (they unlock after 7 days), then request a return; if the shop approves it, the points are voided and the balance goes negative. The shop still has to approve. Options:
  1. Add a rule: `request.time < resource.data.deliveredAt + duration.value(7, 'd')`. This needs a rules deploy to the live project, and orders without `deliveredAt` need handling.
  2. In admin, warn when a return was requested after the window.
- **C. Low, theoretical.** Someone who learned another customer's Razorpay order id before that customer saved the order could create `orders/<id>` first and block them. Razorpay ids are not guessable. No action.

## How rewards work now (short)

The full rules are in `src/lib/rewards.ts`. Its `rewards-core` block is copied into `api/create-order.ts` and `api/notify-order.ts`. After editing it, run `npm run sync:rewards`; the parity test fails if the copies drift.

- **One order per payment.** An online order is saved at `orders/<razorpay order id>`.
  - The rules let a customer create it as `paid` only when `payments/<id>` exists in their name. That record is written by `api/verify-payment.ts`.
  - A new order must start `pending`, with no delivery, return or reward fields.
- **Server-owned facts.** `create-order` writes the Razorpay notes: `rw_uid`, `rw_base` (the earn base), `rw_cart` (SHA-256 of the cart), `rw_points`, `rw_pv` and `rw_cashback`. `verify-payment` copies them into `payments/<id>`.
- **Reservations.** `create-order` reserves points and cashback as `spend_<rzp>_<currency>` entries with `hold: true`.
  - The reservation runs in a transaction on the lock document `users/<uid>/rewardState/lock`.
  - Concurrent checkouts get 409 `rewards_changed`.
  - `verify-payment` confirms the holds.
  - Unpaid holds are released after the server asks Razorpay. This happens when the payment window is closed, or by the `release-holds` sweep after 30 minutes.
  - A late payment re-spends the hold and flags the order for review.
- **Reconcile** (`api/notify-order.ts`, action `reconcile-rewards`) runs after every status change.
  - It earns `earn_<rzp>` on first delivery, unlocking `unlockDays` later.
  - It freezes earned points while a return is open, voids them when the order ends, and restores them if the order is reopened.
  - Refunds are `refund_<rzp>_<currency>`, taken back if the order is reopened.
  - It writes `pointsEarned`, `pointsEarnedState` and `pointsUnlockAt` on the order, and flips `paymentStatus` from pending to paid once the payment is verified.
- **Pending.** Only earned points can be pending, so the browser and the server agree whatever their clocks say.
- **Known limits.**
  - A customer can still create an order document with items that differ from the ones paid for. The admin "payment check" panel (fix 1) is meant to flag this by comparing the cart hash and the amount.
  - The real fix is server-side order creation. That is a bigger change and is not started.

## Skills (global toolbox)

- **Installed 2026-10-03** (vetted):
  - `emilkowalski/skills`: 12 skills (`emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `apple-design`, `mobile-native`, `break-ui`, `prototype`, `pick-ui-library`, `ask-sonner`).
  - `motiondivision/ai-kit`: `motion`.
  - `addyosmani/web-quality-skills`: 6 skills.
  - `jakubkrehel/skills`: 9 `better-*`, `interface-review` and `explain-interface` skills.
  - `shadcn-ui/ui`: `shadcn` (caution: never run its `add --overwrite`, `apply`, `init --force`, `migrate` or `eject` without asking).
  - `ChromeDevTools/chrome-devtools-mcp`: 3 skills.
- **Done 2026-10-04:**
  - MCP servers added at user scope, both connected: `motion` (https://mcp.motion.dev) and `chrome-devtools` (pinned 1.10.1, isolated profile, no usage stats, network headers redacted, update checks off).
  - Vetted by 3 read-only reviewers (SKILL.md, references, scripts, repo-level files): no prompt injection, secret reads or telemetry in the installed skills. Installed:
    - `coreyhaines31/marketingskills` @dda3841: `seo-audit`, `product-marketing`, `cro`, `copywriting`, `copy-editing`, `analytics`, `schema`, `ai-seo`, `site-architecture`, `marketing-psychology`, `popups`, `sms`.
    - `firebase/agent-skills` @de359da: `firebase-security-rules-auditor`, `firestore-rules-creation`.
    - `medusajs/medusa-agent-skills` @da659ef: `storefront-best-practices`.
    - `ibelick/ui-skills` @ebf5f26: `fixing-motion-performance`, `fixing-metadata`.
    - `currents-dev/playwright-best-practices-skill` @283d5cb: `playwright-best-practices`.
    - Playwright v1.63.0: `playwright-trace`, `playwright-component-testing` (owner OK'd 2026-10-04).
    - `googlechrome/modern-web-guidance` @84ae725: `modern-web-guidance`.
  - Owner-approved local patches, which must be re-applied after any reinstall (also listed in `~/.claude/CLAUDE.md`): `playwright-trace` only pre-approves `npx playwright trace`; `modern-web-guidance` is pinned to `@0.0.191` with `DISABLE_TELEMETRY=1`.
  - Caveats written into `~/.claude/CLAUDE.md`:
    - The marketing skills' example stats, ratings, countdowns and "selling fast" lines must never reach a client site without real data.
    - Medusa's skill must not grep `.env`.
    - Firestore rules are validated with the emulator, never with a live deploy.
    - Don't copy the Playwright samples that reset databases.
  - Not installed: Firebase's `firestore-rules-author` agent (runs commands without asking) and its `.mcp.json` (unpinned `firebase-tools@latest`).
  - Skill table in `~/.claude/CLAUDE.md` updated: Emil plus `motion` decide motion. New rows cover storefront UX, SEO, copy/CRO, Firebase rules and Chrome DevTools.
  - Catalog regenerated: `~/.claude/SKILLS-CATALOG.md`, 307 skills.
- **Still not vetted (lower priority, only if a need comes up):** `vercel-labs/agent-skills`, `antfu/skills`, `hookdeck/webhook-skills`, `google-gemini/gemini-skills`, `shadcn/improve`, `getsentry/skills`, `content-designer/ux-writing-skill`, `googleanalytics/google-analytics-mcp`.
- **Research:** the full results (50 candidates and their vetting notes) are in `~/.claude/vendor/skills-research-2026-10-03.json`.

## Screenshots

- **Script:** `docs/handoff/display-shots.mjs` (committed; holds no secrets, reads the shopper login from `shopper.local`). It waits for real content and scrolls before each shot. Full-page shots still show the footer map as an empty box (lazy iframe); in a real viewport it loads.
- **Run (only with the owner's OK, it writes to the live Firestore):**
  1. `npx vite --port 5182 --strictPort --host 127.0.0.1` (never 5173).
  2. From `ssecommerce/`: `node docs/handoff/display-shots.mjs http://127.0.0.1:5182 <output folder>`.
- **It uses** the global `playwright` package and sets the theme through the `ishaputra-theme` localStorage key.

## Gotchas

- **`tsc`.** `tsconfig.app.json` sets `ignoreDeprecations: "6.0"`, which the installed TypeScript 5.9 rejects, so `tsc -p tsconfig.app.json` stops at once. To type-check, copy the config with `"5.0"` and run `npx tsc -p <copy> --noEmit`, then delete the copy.
- **Dev server.** A background `vite` started by Claude is cut off after 30 minutes but its node process keeps port 5182. Check `netstat -ano | grep :5182` before starting another.
- **Line endings.** Working-tree files are CRLF (`core.autocrlf=true`). Git Bash `grep`, `sed` and `od` hide the `\r`. Patch scripts must normalise `\r\n` before matching.
- **Writing scripts.** Write scripts with the Write tool. Avoid bash heredocs with backticks or quotes; they broke twice.
- **Function limit.** Vercel Hobby allows 12 functions, and all 12 are used. Put new server actions inside `api/notify-order.ts`, as an `action` value.
- **Test shopper.** Credentials are in `docs/handoff/shopper.local` (git-ignored). Its demo balance is 250 points and ₹150 cashback.
- **Rules deploy.** `node docs/handoff/deploy-rules.mjs`, run from `ssecommerce/`. It refuses any project other than `ishaputrabotanicals`.
- **Never** touch port 5173 (the original Sreerasthu dev server), connect to Sreerasthu's Firebase, commit secrets, or push or deploy without being asked.
- **Waiting on the owner:**
  - Razorpay test keys, needed for a live checkout test.
  - Loyalty values: points per ₹100, point value, unlock days, maximum %.
  - GST settings and business details. The WhatsApp number and GSTIN are empty on purpose.

## Ultracode and effort per step

The rules for workflows, ultracode, effort and new chats live only in `~/.claude/CLAUDE.md`, which every project loads (moved there 2026-10-06). This table is this project's part:

| Step | Ultracode? | Effort |
|---|---|---|
| 1. (no redesign) | - | - |
| 2. Scratch & Win | Done | - |
| 3. Small follow-ups | No | Medium |
| 4. Dealer, Loyalty card | Done | - |
| 5. Step 3 accounts | No | Medium |

**Context:** read file ranges, not whole large files. `ssecommerce/CLAUDE.md` is 27 KB and loads into every session in this folder, so trimming it would cut the cost of every turn.

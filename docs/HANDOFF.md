# Handoff: read this first

Ishaputra Botanicals is client #1 of the Dream Team Services white-label store. It is built from the Sreerasthu codebase (React + Vite + Firebase + Razorpay + Vercel).

This file holds the working state between sessions, so a new chat does not need the old one.

- **At the start of a session:** read this file, then do the first open item under "Next steps".
- **At the end of a session:** update "State" and "Next steps" before the session ends.

Last updated: 2026-10-05 (Scratch & Win money-logic review done and its fixes committed on `scratch-win`; a check of the fixes is the open item).

## State

- **2026-10-05: Scratch & Win money-logic review done; fixes committed on `scratch-win` (`7be97a1`, `400646b`, docs `1e0c65c`; local only, not merged).** Report: `docs/superpowers/reviews/2026-10-05-scratch-win-money-review.md`.
  - **How:** 4 reviewers (draws, returns, ownership, timing/spec) and 2 adversarial verifiers.
  - **Result:** nothing critical. No double draw, no re-roll, no claim on another customer's card; 50 racing scratches commit one draw.
  - **Biggest problem, fixed:** R1, high and pre-existing for earned points too. A return written without a reconcile left points and prizes spendable while the goods came back.
    - Checkout now holds any unlocked earning or prize whose order is not at "delivered" (`holdEarnedOffDelivered` in `api/create-order.ts`).
    - Points never unlock before `deliveredAt + 7 days` (`unlockAtMs` in `api/notify-order.ts`).
  - **Other fixes:** one card per payment ever (`payments/<rzp>.scratchCardGivenAt`); no cards for orders delivered while the switch was off (`siteSettings/scratchWin.enabledAt`, stamped by the admin tab); create-order always INR; order-id check on every notify-order action; the dialog says when a prize was taken back; admin odds; plus tests (`npm test` 72/72).
  - **Written, NOT deployed:** the return-cancel rule (a customer can cancel a return only while `returnStatus` is `pending`), next to the `scratchCards` rule. Both need the owner's OK to deploy.
  - **Left for before delivery partners are switched on** (rules plus emulator; listed in the report): a partner can flip a return-pickup order back to delivered; a partner can write any `deliveredAt`; the partner's own return-pickup update seems refused by the current rules.
  - **Verified:** `npm test` 72/72, `npm run build` passes, type check at baseline, ESLint unchanged on every touched file.
    - Screenshots of the new result copy (won, taken back) at 390 and 1440, light and dark, show 0 console errors and no overflow: `../shots/scratch-win-review-fixes/`. They came from a temporary harness page, since deleted.
  - **A check of the fixes** (3 reviewers, 3 verifiers, `git diff 2be43ae..400646b`) was cut off twice when the window closed. See Next steps.
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

1. **No redesign.** The owner likes the current design. Any future visual change: keep the product-dense e-commerce layout, show a cheap mockup of ONE screen first, and get a yes before building.
2. **Scratch & Win: built, needs its money-logic review.** Decisions (owner said "just complete it", 2026-10-04):
   - Admin-configurable (`siteSettings.scratchWin`), shipped **off**, values marked as placeholders and listed in `CLIENT.md`.
   - One card per **delivered** online order at or above an admin minimum; created by `reconcileRewards` as `users/<uid>/scratchCards/<rzp>`.
   - Prizes: loyalty points in admin-set sizes with weights, plus "better luck next time" (weight 0 by default). No coupons or cashback for now (coupons are public and not tied to a customer; cashback is the riskiest).
   - The server draws the prize **when scratched** (new `scratch-card` action in `api/notify-order.ts`, a transaction plus `crypto` randomness); points go in as a `scratch_<rzp>` ledger entry that unlocks, freezes and voids exactly like `earn_<rzp>`. An unscratched card is voided if the order is returned; cards expire after admin `expiryDays`.
   - Customers can only read their cards; only the Admin SDK writes them. The admin page shows the average cost per card.
   - **Built on branch `scratch-win` (2026-10-04, see "State").** Next, in order:
     1. ~~Money-logic review~~ **Done 2026-10-05** (see "State" and the report).
     2. **Fixes done.** Open: a fresh-eyes check of the fixes (`git diff 2be43ae..400646b`): does the checkout hold block legitimate spending or loop on 409 `rewards_changed`, does `enabledAt` withhold legitimate cards, and does the `orderId` check reject any real caller? Then fix what it finds and fill in "Checking the fixes" in the report. Then ask the owner's OK to deploy the rules (`node docs/handoff/deploy-rules.mjs`): the `scratchCards` read rule and the return-cancel rule.
     3. With the owner's OK (it writes to live Firestore): a live run with the test shopper. Turn the feature on, take a test order to delivered, scratch it, check the ledger, return it, check the void, then turn the feature off again.
     4. Merge `scratch-win` into `main` (`--no-ff`, local only).
3. **Smaller follow-ups:**
   - Owner to do in Admin > Commerce: set Ships From = Telangana (delivery charges still assume Andhra Pradesh).
   - **Done 2026-10-04 (`4e64b8d`):** the wishlist page shows one toast on remove; cart lines keep the order they were added in. Not checked in a browser (needs the live preview shopper).
   - Generate `public/sitemap.xml` once the domain is real; set `VITE_SITE_URL` on Vercel; PERF-14's `initializeAuth` part.
   - Client placeholders: `CLIENT.md` ("Placeholders for the client").
4. **Later:** Dealer Membership, Loyalty Card (rest of Step 2B), then Step 3 accounts.

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

## Workflows, ultracode and chats (owner's standing rules)

The full rules are in `~/.claude/CLAUDE.md`, in the section "Workflows, ultracode and sessions". In short:

- **Workflows:** Claude decides, and uses them only when a single agent can't do the job well. Examples: a multi-file security review, a whole-site UI audit, or vetting many sources. Before launching one, Claude says why in one line.
- **Ultracode:** the owner switches it on. Claude asks for it at the start of a big or risky task ("please turn on ultracode and send the task again"), and says so when it can be turned off.
- **Ending a task:** Claude updates this file, then ends with one of:
  - "Next: start a new chat and send: ..." (the default);
  - "Continue in this chat: ..." (only when needed);
  - "Nothing else is needed."

Which next steps need ultracode:

| Step | Ultracode? | Effort |
|---|---|---|
| 1. (no redesign) | - | - |
| 2. Scratch & Win review | Yes, for the money-logic review | Extra high |
| 3. Small follow-ups | No | Medium |
| 4. Dealer, Loyalty card | Yes, for the plan and the money logic review | Extra high |

**Context:** read file ranges, not whole large files. `ssecommerce/CLAUDE.md` is 27 KB and loads into every session in this folder, so trimming it would cut the cost of every turn.

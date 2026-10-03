# Handoff: read this first

Ishaputra Botanicals is client #1 of the Dream Team Services white-label store. It is built from the Sreerasthu codebase (React + Vite + Firebase + Razorpay + Vercel).

This file holds the working state between sessions, so a new chat does not need the old one.

- **At the start of a session:** read this file, then do the first open item under "Next steps".
- **At the end of a session:** update "State" and "Next steps" before the session ends.

Last updated: 2026-10-03.

## State

- **Branch:** `step-2b-rewards`. Not merged into `main`, and never pushed (local commits only).
  - `102bef7` Rewards hardening. `9469bea` reservation timeout. `7128f23` rewards display fixes.
  - `d2573f4` (2026-10-03) Fixes found in the display screenshots:
    - Wallet "Total spent" was always ₹0: it summed `order.totalAmount`, a field no order has. It now uses `order.total`, so membership tiers finally move.
    - "Out for delivery" orders were never counted as pending.
    - The points card showed a false "0 points / ₹0" while loading. It now shows a shimmer, and an honest message if the ledger can't be read (`useRewards` has a new `error` flag).
    - Order page: one card style (`panel tx-sheet`) for every block, buttons in the brand palette, no old-theme blue banner, and the delivered card shows the delivery time.
    - Footer map is muted monochrome, with colour on hover or focus.
- **Firestore rules:** the hardened rules are deployed to `ishaputrabotanicals`.
- **Verification (2026-10-03, after `d2573f4`):**
  - `npm test` passes (15). `npm run build` passes. `tsc`: only the known old errors (`videoCallService`, `DeliveryDashboard`, `VideoCallRequestModal`). See the `tsc` gotcha below.
  - `hardening-check.mjs`: **PASS** against the real Firestore and rules.
  - Screenshots taken with the owner's OK (step 1, option A): `/wallet`, `/account/orders/<id>`, `/admin/orders/<id>` and the mismatch state, at 390 and 1440 px, light and dark. All look right. The demo data was deleted afterwards.
  - One reviewer checked the diff `1191020..HEAD` against the 27 findings: all resolved, one new defect fixed in `6982afc`, one open for the owner (see "Review result").
  - `6982afc` re-verified: `hardening-check` PASS (it now also checks the late-payment flag; it failed on the old code).

## Next steps (in order)

1. **Write the "Rewards (Task 8)" notes in `CLIENT.md`, then merge locally:** `git checkout main && git merge --no-ff step-2b-rewards`. The notes should cover:
   - `FIREBASE_ADMIN_SDK_BASE64` is now required on Vercel. Without it, every paid order is saved as "payment pending, needs review".
   - The `payments` collection.
   - Reservations and holds, and the "Check payment & rewards" button.
   - The known limits listed below.
   - Ask the owner about "Review result" B (return window) and note the decision. It doesn't block the merge.
2. **World-class Ishaputra UI/UX (the owner's top priority, 2026-10-03).** The owner wants people who see the site to ask "who made this?": perfect design, smooth animation and transitions, every old Sreerasthu bug fixed.
   - **Needs ultracode** for the first full-site audit.
   - **Evidence:** 84 component files still use old-theme colours. The worst are `AdminOrders`, `AdminDeliveryBoys`, `AdminOrderDetails`, `ProductForm`, `Account` and `SecurityPage`. The order page still has emerald, purple and red return-status banners.
   - **Plan:** audit the whole site (workflow, about 6 agents: home, product and listing, cart and checkout, account, admin, global header/footer/motion), then fix one area at a time with screenshots.
   - **Skills:** `ui-ux-pro-max` and the taste skills for direction; `emil-design-eng`, `animate` and `motion` for motion; `better-interface` and `web-quality-audit` for review.
   - **Rule:** keep the layout, change the design.
   - **Also fix:** the order page loads all of a customer's orders to show one (slow; use one document read). The full-page loaders are bare spinners; use skeletons.
3. **Finish the toolbox.** See "Skills" below.
4. **Later:** Scratch & Win, Dealer Membership, Loyalty Card (rest of Step 2B), then Step 3 accounts.

## Review result

One reviewer (2026-10-03) checked `git diff 1191020..HEAD` against the 27 findings: **all 27 are resolved.** It found 3 new issues:

- **A. Fixed (`6982afc`).** A reservation released as unpaid and then paid late was re-spent silently. The order was never flagged, so repeated late payments could push a balance far below zero unseen. Reconcile now flags such an order for review once (`rewardsLate`), and `hardening-check` covers it.
- **B. Open, owner decides.** `firestore.rules` `isValidReturnRequest` has no time limit; only the app's button enforces the 7-day window. A customer writing straight to Firestore could spend earned points (they unlock after 7 days), then request a return; if the shop approves it, the points are voided and the balance goes negative. The shop still has to approve. Options:
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
- **To do:**
  - Add the Motion MCP: `claude mcp add --transport http -s user motion https://mcp.motion.dev`.
  - Add the Chrome DevTools MCP, pinned: `claude mcp add chrome-devtools -s user -e CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 -e CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY=1 -- cmd /c npx -y chrome-devtools-mcp@1.10.1 --isolated --no-usage-statistics --redact-network-headers`.
  - Vet, then maybe install, the candidates that are not vetted yet:
    - `firebase/agent-skills` (rules auditor), `coreyhaines31/marketingskills` (CRO, SEO, copy), `medusajs/medusa-agent-skills` (storefront best practices).
    - `googlechrome/modern-web-guidance`, `ibelick/ui-skills`, `currents-dev/playwright-best-practices-skill`.
    - The Playwright trace and component-testing skills. The earlier install was blocked and needs the owner's OK.
  - Update the skill table in `~/.claude/CLAUDE.md`. Emil plus `motion` govern motion; the taste skills govern visual direction only.
  - Regenerate the catalog: `node ~/.claude/tools/skills-catalog.mjs out.json`, then `node ~/.claude/tools/write-catalog.mjs out.json ~/.claude/SKILLS-CATALOG.md`.
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
  - The Playwright trace skill and the two MCP additions.

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
| 1. Notes and merge | No | Medium |
| 2. World-class UI audit | Yes, for the first full-site audit; individual areas after that don't need it | High |
| 3. Toolbox | No | Medium |

**Context:** read file ranges, not whole large files. `ssecommerce/CLAUDE.md` is 27 KB and loads into every session in this folder, so trimming it would cut the cost of every turn.

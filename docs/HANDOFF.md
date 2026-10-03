# Handoff: read this first

Ishaputra Botanicals is client #1 of the Dream Team Services white-label store. It is built from the Sreerasthu codebase (React + Vite + Firebase + Razorpay + Vercel).

This file holds the working state between sessions, so a new chat does not need the old one.

- **At the start of a session:** read this file, then do the first open item under "Next steps".
- **At the end of a session:** update "State" and "Next steps" before the session ends.

Last updated: 2026-10-03.

## State

- **Branch:** `step-2b-rewards`. Not merged into `main`, and never pushed (local commits only).
  - `102bef7` Rewards hardening: one order per payment, server-owned facts, reservations.
  - `9469bea` Reservation timeout and a 20 s `maxDuration` for the 3 payment functions.
- **Firestore rules:** the hardened rules from `firestore.rules` are deployed to the `ishaputrabotanicals` project.
- **Verification:**
  - `npm test` passes (15 tests).
  - The end-to-end check `docs/handoff/hardening-check.mjs` passes against the real Firestore and rules, with Razorpay faked.
- **Not committed, not reviewed:** display fixes written by 3 agents. The workflow was stopped before its review stage to save usage. Files:
  - `src/pages/admin/AdminOrderDetails.tsx`, `src/pages/AdminOrders.tsx`
  - `src/pages/OrderDetailsPage.tsx`, `src/pages/Account.tsx`, `src/services/invoiceService.ts`
  - `src/components/rewards/RewardsWalletCard.tsx`, `src/components/admin/RewardsAdminPanel.tsx`, `src/pages/admin/AdminCommerceSettings.tsx` (RewardsTab only)

  Their exact requirements are in the `TASKS` array of `docs/handoff/rewards-ui-tasks.js`.

## Next steps (in order)

1. **Review and finish the uncommitted display fixes.** Work through them in this order:
   - `git diff --stat`, then read the diff of each file against its task in `docs/handoff/rewards-ui-tasks.js`.
   - `npx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0`. Four files have known old errors: `videoCallService`, `invoiceService` (3 old ones), `DeliveryDashboard` and `VideoCallRequestModal`.
   - Fix what is missing or wrong, then run `npm test`.
   - Take screenshots at 390 and 1440 px, light and dark, of `/wallet`, a customer order page and the admin order page.
   - Commit.
2. **Re-verify the rewards branch.**
   - From `ssecommerce/`, run `node docs/handoff/hardening-check.mjs docs/handoff/shopper.local`. Expect `hardening check: PASS`. It cleans up after itself.
   - Optionally, one reviewer (not a workflow) checks `git diff 1191020..HEAD` against the 27 findings in `docs/handoff/rewards-review-findings.txt`.
3. **Write the "Rewards (Task 8)" notes in `CLIENT.md`, then merge locally:** `git checkout main && git merge --no-ff step-2b-rewards`. The notes should cover:
   - `FIREBASE_ADMIN_SDK_BASE64` is now required on Vercel. Without it, every paid order is saved as "payment pending, needs review".
   - The `payments` collection.
   - Reservations and holds, and the "Check payment & rewards" button.
   - The known limits listed below.
4. **Finish the toolbox.** See "Skills" below.
5. **World-class Ishaputra UI/UX (the big goal).** Do one area per session: home, product page, cart and checkout, account, admin.
   - **Per area:** audit, then prioritised fixes, then screenshots.
   - **Skills:** `ui-ux-pro-max` and the taste skills for direction; `emil-design-eng`, `animate` and `motion` for motion; `better-interface` and `web-quality-audit` for review.
   - **Rule:** keep the layout, change the design.
6. **Later:** Scratch & Win, Dealer Membership, Loyalty Card (rest of Step 2B), then Step 3 accounts.

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

## Gotchas

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
| 1. Review the display fixes | No | High |
| 2. Re-verify | Optional, for an adversarial review | Extra high (it's payment logic) |
| 3. Notes and merge | No | Medium |
| 4. Toolbox | No | Medium |
| 5. World-class UI audit | Yes, for the first full-site audit; individual pages after that don't need it | High |

**Context:** read file ranges, not whole large files. `ssecommerce/CLAUDE.md` is 27 KB and loads into every session in this folder, so trimming it would cut the cost of every turn.

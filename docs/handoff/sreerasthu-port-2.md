# Sreerasthu port 2: what to take from the Source's newer changes

Date: 2026-10-15. Read-only research. Nothing was changed in any repo.

Compared:
- Source: `C:/Users/chala/upstream/sreerasthusilvers` (HEAD `a61d79b`, 2026-10-13).
- Ishaputra: `Desktop/Ishaputra Botanicals/ssecommerce` (`main`, after the 2026-10-12 port).
- Template: `Desktop/Ecommerce Template` (HEAD `6694123`).

How I checked "already present": file names, function names, collection names and routes searched in `src/`, `api/`, `firestore.rules`, `package.json`, `vite.config.ts` of both repos; the rules and API files were also diffed against each other. Result that matters for the plan: **Ishaputra and the template are near-identical in `api/` and `firestore.rules`** (the only differences are the rewards default `enabled`, `homeState`, store-name strings, and the dealer `businessType` word). So every server and rules fix is one patch that applies to both. Everything else (UI) differs only by the template's neutralising.

Important background: Ishaputra's server is far ahead of the Source's in some areas (its `api/create-order.ts` is 1,252 lines against the Source's 687; `api/notify-order.ts` 1,427 against 219: rewards, dealer pricing, Scratch & Win, payment records). So Source commits that touch these files cannot be copied; their ideas have to be re-done on our code.

Ishaputra is live at www.ishaputra.in with Razorpay live keys (handoff 2026-10-13). Money and rules findings below are therefore about production today, not a future risk.

---

## 1. Summary table

Risk: M = money/payments, S = security/permissions, U = UI only. Size S/M/L as in `docs/template/ESTIMATES.md`.

| # | Feature (Source commit) | Generic? | In Ishaputra? | In template? | Risk | Size | Recommendation |
|---|---|---|---|---|---|---|---|
| 1 | Multi-item order stock transaction bug (side fix inside `114cdb3`) | Generic | **Bug present** | **Bug present** | M | S | **Port to both, first** |
| 2 | Paid order must match the payment (`114cdb3` + `f1ac5ae`) | Generic | Partly: own design blocks unpaid "paid"; does not bind total or items | Same as Ishaputra | M | M | **Port the idea to both, adapted** |
| 3 | `isPaymentSettled` + delivery cash screens (`114cdb3`, `f1ac5ae`) | Generic | Weak spot present | Same | M | S | **Port to both** |
| 4 | Rule fixes still open (`07d5846`): reviews, gift cards, 2 list rules | Generic | 4 of 11 open | Same 4 open | S | S | **Port to both** |
| 5 | Other 7 of the 11 rule fixes (`07d5846`) | Needs team/bin | Not applicable (3 already fixed, 4 belong to team/bin) | Same | S | - | Ride with 9 and 10 |
| 6 | Rules test suite (`f3a3f77`) + emulator mode (`0967515`) | Generic harness, Source-only cases | No | No | S (tooling) | M | **Port harness to both; write our own cases; JDK install needs OK** |
| 7 | Hardcoded service-account key (`0714d3d`) | Source-only | Nothing found | Nothing found | S | - | Skip (we are clean) |
| 8 | Install as app (`bd496ac` part) | Generic | Partial (manifest has only a 192 icon, so not installable; no install card) | Same | U | S | **Port to both** |
| 9 | Team logins with page access (`bd496ac`, `c714eee`) | Generic | No | No | S | L | Template switch `teamLogins` (off); Ishaputra only if the client wants it |
| 10 | Activity log + Recycle bin (`bd496ac`) | Generic | No | No | S | M | Template switch `auditTrail`; offer to Ishaputra (accidental deletes) |
| 11 | Jewellery spend offer (`bd496ac`) | Generic idea, Sreerasthu wording | No | No | M | L | Defer: template backlog `spendOffer` (off), build when a client asks |
| 12 | Dealer (manufacturer) chats (`bd496ac`) | Sreerasthu business flow; name clashes with our Dealer Membership | No | No | S (private numbers) | L | Skip (template backlog `supplierChats` only on request) |
| 13 | WhatsApp-style inbox UI kit (`bd496ac`, `5c84b41`) | Generic UI | No (Ishaputra has its own restyled inbox with opt-out menu) | Same | U | M-L | Defer: mockup one screen first |
| 14 | Customers list order counts (`80a4f35`) | Generic | Already fixed, own version | Already | U | - | Skip |
| 15 | Dashboard buttons by permission (`c714eee`) | Needs team logins | No | No | U | S | Ride with 9 |
| 16 | Category dropdown keyboard (`e00d660`) | Generic | Already, better structure | Already | U | - | Skip |
| 17 | Row autoplay drift (`84add1b`) | Generic | Already, own hook | Already | U | - | Skip |
| 18 | Delete 89 unused files (`bbd84f6`) | Generic | 86 of 89 already gone | Same | U | S | Skip (optional: delete 2 stray files) |
| 19 | `unnamed.png` (`ff95a8d`) | Source-only image, unused | n/a | n/a | U | - | Skip |

---

## 2. The two questions you asked first

### 2a. Can a customer create a "paid" order without paying, today?

**Ishaputra and the template: no, not an order that says `paid`.** Their `firestore.rules` already require a server-recorded payment:
- `isValidOrderCreate()` lets a customer write `paymentStatus: 'paid'` only if `payments/<razorpay order id>` exists and its `uid` is that customer (`isVerifiedPaymentForCaller()`).
- `payments/*` can only be written by the server (`allow write: if false`; `api/verify-payment.ts` writes it with the Admin SDK after the Razorpay signature checks out).
- The order must be stored under the Razorpay order id, start `pending`, and carry none of the delivery, return or points fields.
- So one payment can back one order only, and nobody can forge the record. This is a different design from the Source's (record keyed by payment id, written through a service login); it came from Ishaputra's own rewards and Scratch & Win work. **The Source's `114cdb3` code cannot be dropped in; only its extra checks are worth taking.**

**But three smaller holes remain, in both repos (read from the code, not run):**
1. **Pay little, claim much (underpayment).** The rules check who paid, not what for. The payment record holds `amountPaise` and a `cartHash`, but no rule compares the order's `total` or `items` with them. A technical customer (browser console or REST with their own login) could pay for one cheap item and store the order under that payment with expensive items and a bigger total, marked paid. Only the admin order page notices ("Order does not match payment"). This is the part the Source's `114cdb3` closes (total within Rs 1 and every cart line must equal the record).
2. **Unpaid but looks prepaid.** A customer can store an order with `paymentMethod: 'Razorpay'`, no `paymentStatus` (or `pending`) and no payment at all. `isPaymentSettled()` in `src/services/orderService.ts` returns true for any prepaid-looking method, regardless of status (the same weak spot `114cdb3` fixed). The admin order page does show "No payment linked", but the orders list shows nothing, so a shop that packs from the list could ship an unpaid order. Cash on delivery does not appear in checkout, but the rules also do not stop a hand-made COD order with any total the customer likes (the browser writes it; the server prices only Razorpay orders). The Source has the same gap after its fix.
3. **No time window.** The Source lets a payment record back an order only within an hour of being written, so a deleted order's payment cannot buy another. Ours has no limit (needs an admin to delete the first order, so low).

Related smaller point: the Source sends `payment_capture: 1` when creating the Razorpay order (`f1ac5ae`). Ours leaves capture to the Razorpay dashboard setting, and `api/notify-order.ts` counts `authorized` as paid. If a client's dashboard were on manual capture, "paid" orders would never be captured and Razorpay would refund them after a few days. Cheap to fix; confirm in each client's Razorpay settings.

### 2b. Rule problems from `07d5846`: which exist in Ishaputra and the template

Same answer for both repos (their `firestore.rules` differ by one word).

| # | Source problem | Today in Ishaputra / template |
|---|---|---|
| 1 | Staff could plant `users/<id>` with role admin in the bin | Not applicable (no bin, no staff) |
| 2 | `siteSettings/adminNotification` writable by content staff | Not applicable (only admin writes). The doc is world-readable by design (the customer's browser reads it to find the owner's alert number); the Source left that too |
| 3 | Customers could set their own wallet balance | **Already fixed** here (`wallets`, `transactions`, `rewards` are admin-write) |
| 4 | New review could be created as `approved` | **OPEN.** `reviews` create only checks `userId`. A customer can publish an approved (fake) review. `createReview` already sends `pending`, so the fix is safe. Breaks the "real content only" rule |
| 5 | Shop-wide `giftCards` update by any signed-in user | **OPEN.** `giftCards/{id}` still has `allow update: if isAuthenticated()`. No app code writes that top-level collection, so no damage until a doc exists there |
| 6a | Any signed-in user could list every `accountDeletionRequests` | **OPEN.** `allow list: if isAuthenticated()`. App queries already filter by `userId`, so tightening is safe |
| 6b | Any signed-in user could list every `videoCallRequests` | **OPEN.** `allow list: if isAuthenticated()`. App customer queries filter by `customerUid` |
| 7 | Dashboard page could not read orders | Not applicable |
| 8 | Customer details orders/wishlist rule | Not applicable. The bug itself is already fixed here in both repos (`80a4f35` row 14) |
| 9 | Bin lookup by id | Not applicable |
| 10 | Owner Restore of orders/reviews/bookings | Not applicable (orders already allow admin create; reviews and bookings only matter once a bin exists) |

So **4 open items (rows 4, 5, 6a, 6b) in both repos**, about 15 lines of rules, no app change. Needs a rules deploy (owner's OK) and an emulator check.

### 2c. Hardcoded service-account key (`0714d3d`)

**None found, in either repo.** Searched tracked files and all git history of both repos (paths only; nothing printed) for private-key markers, `private_key`, `client_email`, base64-encoded service-account JSON (this is how the Source hid it), long base64 blobs, Meta tokens (`EAA...`) and `rzp_live_`.
- Ishaputra: only mentions of the *file name pattern* `firebase-adminsdk` in `.gitignore`, `CLAUDE.md`, `INTEGRATIONS_SETUP.md`, `PUSH_NOTIFICATIONS_SETUP.md`, and two plan/spec docs under `docs/superpowers/`. `INTEGRATIONS_SETUP.md` and `PUSH_NOTIFICATIONS_SETUP.md` still name **Sreerasthu's** project id and key file name (not secret, but a stale cross-client reference to clean up; the template already removed them).
- Template: only the same file-name pattern in `.gitignore`, `CLAUDE.md`, `docs/setup/INTEGRATIONS_SETUP.md`, `docs/setup/PUSH_NOTIFICATIONS_SETUP.md`, three plan docs and `scripts/qa/deploy-indexes.mjs` (reads the key file by path).
- `scripts/setup-test-accounts.mjs` (where the Source's key sat) does not exist in either repo.
- Not tracked but present on disk, in OneDrive-synced folders (so cloud-synced): `Ishaputra Botanicals/ssecommerce/ishaputrabotanicals-firebase-adminsdk-fbsvc-1994ff6322.json` and `Ecommerce Template/template-demo-8d71d-firebase-adminsdk-fbsvc-f8ecf113b6.json`. Both are git-ignored by `.gitignore:30`, and `new-client` copies committed files only. Consider keeping real admin keys outside OneDrive.
- Ishaputra's `CLIENT.md` and `docs/HANDOFF.md` contain the live Razorpay **key id** (public by design, not the secret).
- **Do not merge or fetch the Source's git history.** It still holds the live Sreerasthu service-account key (since April) and a WhatsApp token (since 2026-04-28; `scripts/test-templates.mjs`). Port by applying the diffs of the commits named here only. `0714d3d` itself must not be applied (it edits a file we do not have).

### 2d. A bug found on the way (not on your list, but it hits real orders)

`createOrder()` in `src/services/orderService.ts` (identical in both repos) reads each product inside the loop that also updates stock. The Firestore web SDK requires all reads before the first write in a transaction, so **any order with two or more different products fails the stock transaction** and falls back to a "paid order needs review" order with stock not reduced. The Source found this with its emulator tests and fixed it in `114cdb3` (read all products first, then write). Single-product orders are fine. Ishaputra is live with real keys, so this is the first thing to fix. (Read from code; the SDK rule is documented behaviour and the Source reproduced it.)

---

## 3. One section per feature

### 3.1 Multi-item order stock fix (inside `114cdb3`)
1. Orders with 2+ different products no longer end up "needs review" with no stock taken off.
2. Generic.
3. Ishaputra: bug present (`createOrder`, around lines 707-760). Template: same.
4. Files: `src/services/orderService.ts` only (about 10 lines: `Promise.all` the product reads, then write).
5. Risk: money/stock.
6. No switch. No doc change. Add a test: the template's `node --test` setup cannot run the web SDK transaction without the emulator; use the emulator harness from 3.6, or at least a static test that the reads precede the writes.
7. **S. Port to both, first.** Reason: live shop, real orders, tiny change.

### 3.2 Paid order must match the payment (`114cdb3`, `f1ac5ae`)
1. A customer's browser can no longer store an order that differs from what was actually paid (total and items), and a payment cannot buy a second order.
2. Generic.
3. Present in a different, partial form (see 2a). Present: record at `payments/<razorpay order id>` written by the server; `cartHash`; orders stored under the Razorpay order id; "start pending, no delivery or return fields" and "return request touches only return fields" (both already in our rules); a "Check payment & rewards" button that re-asks Razorpay; a flagged fallback order when the record cannot be written. Missing: total and item comparison in the rules, one-hour window, `payment_capture: 1`, and the `isPaymentSettled` fix (3.3).
4. What it would touch (adapted, not copied):
   - `api/create-order.ts`: put the priced lines in the Razorpay notes (Source packs `productId*qty` into notes, 256 chars each, 12 notes max).
   - `api/verify-payment.ts`: copy the lines into `payments/<id>` as `lines`.
   - `firestore.rules`: an `isPaidOrderMatch` check (total within Rs 1 of `amountPaise`, same number of lines, each line same `productId` and `quantity`, `verifiedAt` within an hour). The Source needed a hand-unrolled per-line check and a **25-line cart cap** because rules allow only 1,000 expressions per request; ours has more clauses already (dealer fields, forbidden keys), so the budget must be proven on the emulator.
   - Client: the order items must be written in the same order and quantities as the cart.
   - No new collection, no new env var, no new index, no new dependency.
   - Do not copy: the Source's custom-token "service identity" (`razorpay-verifier`). That was a workaround for the Source's Firebase plan (Admin SDK Firestore calls hit RESOURCE_EXHAUSTED on Spark). Our rewards code already uses the Admin SDK in `verify-payment` and passed a live test. **Gotcha for the template's Phase 5:** check the Admin SDK works on each client's Firebase plan; if it does not, orders land in "payment not confirmed" (safe, not lost).
5. Risk: money and rules (a rules bug can block real orders).
6. Template fit: no switch (core checkout). Docs: `FEATURES.md` "Cart and checkout with Razorpay" row needs one sentence; add a gotcha to `HANDOFF.md`. Tests: extend `tests/create-order-*.test.ts` and `tests/orderRulesDealer.test.ts` style, plus the emulator cases from 3.6. No conflict with template changes (no `homeBlocks`, section or switch involvement).
7. **M. Port to both (apply to Ishaputra first, it is live, then copy the patch to the template; the files are near-identical).** One adversarial review of the money path, as the Source did. Alternative considered: let the server write the paid order itself. Bigger (L), but removes the rules-size limit and the per-line checks. Not recommended now.

### 3.3 `isPaymentSettled` and delivery cash screens (`114cdb3`, `f1ac5ae`)
1. A "prepaid" order whose payment is not confirmed is no longer treated as paid; delivery partners are asked for cash only on real COD orders.
2. Generic.
3. Ishaputra / template: `isPaymentSettled` still returns true for any prepaid-looking method; `DeliveryDashboard` decides "paid" with `includes('online')` or `'upi'` only (so a "Razorpay" order could show as cash due).
4. Files: `src/services/orderService.ts`, `src/pages/delivery/DeliveryDashboard.tsx`, `src/pages/delivery/DeliveryOrderDetails.tsx`. Also add `payment_capture: 1` in `api/create-order.ts` (one line).
5. Money.
6. `deliveryPartners` is off by default in the template, so the delivery edits are low value there but harmless.
7. **S. Port to both** together with 3.2.

### 3.4 Rule fixes still open (`07d5846`)
See 2b. Reviews must start `pending`; global `giftCards` update restricted to `isAdmin()`; `accountDeletionRequests` and `videoCallRequests` lists restricted to the caller's own documents (or admin).
- Touches `firestore.rules` only. Risk: security. Template docs: none (add the cases to the new suite). **S. Port to both.** Deploy order: nothing in the app needs changing first (the review form already sends `pending`; the list queries already filter by owner). Needs the owner's OK to deploy rules.

### 3.5 Hardcoded key (`0714d3d`)
Nothing to port. See 2c. Optional S: remove the Sreerasthu project and key file names from Ishaputra's two setup docs.

### 3.6 Firestore rules suite (`f3a3f77`) and emulator dev mode (`0967515`)
1. A test run that tries every rule as the owner, a customer, a visitor and so on, against a local emulator, so a rule change cannot silently open or close something. Dev mode: `VITE_USE_EMULATORS=1` makes the dev site use local Auth and Firestore, so browser tests never touch live data.
2. Generic harness. The 340 cases are written for the Source's rules (staff pages, dealer chats, recycle bin) and cannot be reused; we need cases for our rules (orders, payments, dealers, rewardLedger, scratchCards, reviews and so on). The Source's cases for orders, order chat, checkout stock and coupon writes, push tokens and the storefront are the best starting point.
3. Neither repo has it. The template already has `emulators` ports in `firebase.json` (8080/8081/8083/8084) and a text-based rules test (`tests/orderRulesDealer.test.ts`) because there is no Java. `fakeFirestore.ts` in `tests/helpers/` covers server code only.
4. Touches: `package.json` (devDependency `@firebase/rules-unit-testing@5.0.2`, script `test:rules` via `firebase emulators:exec`), `scripts/tests/firebase.rules-test.json` (separate ports 8180/4410), `src/config/firebase.ts` (about 12 lines, dev builds only), docs. **Needs a full JDK on this PC (none installed; global install, so ask first).** No new env vars for production.
5. Risk: tooling for security.
6. Template fit: no feature switch. Put the suite in `tests/rules/` (not under `npm test`, which must stay Java-free; add `npm run test:rules`). Docs: add to `docs/template/client/CLAUDE.md` Phase 7 (security audit) and a line in `HANDOFF.md` gotchas. Client copies get the harness and write cases for their own rules changes.
7. **M. Port to both.** Do it before 3.2 and 3.4 so the holes show up as known gaps first and flip to "closed" after the fix, like the Source did.

### 3.7 Install as app (`bd496ac` part)
1. Customers can add the store to their phone's home screen; a card on the Account page shows an Install button (Android/Chrome) or the "Add to Home Screen" steps (iPhone Safari), and hides once installed.
2. Generic (Sreerasthu icons, name and colour to be replaced by `BRAND`/the logo build).
3. Partial in both: `public/manifest.webmanifest` exists and is linked, with only a 192 px icon, so Chrome will not offer install. No `beforeinstallprompt` handling, no install card, no 512 or maskable icons.
4. Touches: `src/lib/pwaInstall.ts` (new, imported in `src/main.tsx`), `src/components/account/InstallAppCard.tsx` (new), `src/pages/Account.tsx` (2 mounts), `public/manifest.webmanifest` (add `id`, 512 and maskable icons), `index.html` (a few mobile meta tags; the manifest link and apple-touch icon exist), icons 512 and maskable. Template: add the sizes to `scripts/build-logo-assets.mjs`; `tests/logo-assets.test.ts` and `tests/brand-parity.test.ts` list the asset set and manifest values and need the new files. No Firestore, API, env or dependency change.
5. UI only.
6. No switch needed (renders only where installable). Docs: `docs/template/PHASE3.md` already lists `public/manifest.webmanifest` as a hand edit; add the two icons. Conflicts: the Account page has `whatsappOtp` gating and no `MobileBottomNav` now (the Source diff's context lines mention it; ignore those).
7. **S-M. Port to both.** Real device check (Android and iPhone) is still owed, as the Source did not do one either.

### 3.8 Team logins with page access (`bd496ac`, plus `c714eee`)
1. The owner creates staff logins (role Staff or Website manager) and ticks which admin pages each may open; a staff member sees only those pages, and the owner can switch a login off at once.
2. Generic. Strip: the permission list is built around Sreerasthu's pages (`silverRate`, `dealerChats`, "Manufacturers"); our version needs keys for Dealers (membership), Rewards, Scratch & Win, Video calls and so on, hidden when the matching feature is off.
3. Not in either repo.
4. Touches:
   - New: `src/lib/permissions.ts`, `src/services/teamService.ts`, `src/pages/admin/AdminTeam.tsx`.
   - Changed: `AuthContext.tsx`, `guards/AdminRoute.tsx`, `AdminLogin.tsx`, `AdminLayout.tsx`, `Dashboard.tsx` (`c714eee`: hide buttons the login cannot use).
   - Server: `api/whatsapp-reply.ts` (`ACTION_PERMISSIONS`), `api/media.ts` (staff uploads), `api/broadcast.ts` and `announcement.ts` (staff are not customers).
   - **Rules: every admin check changes.** Ishaputra's rules have 93 `isAdmin()` sites; the Source swapped about 47 for `can('<page>')`. Plus the self-edit guard (a staff member cannot give themselves pages), and `payments`/`orders` reads for staff.
   - Data: `users/{uid}` gets `role: 'staff'`, `staffRole`, `permissions`, `isActive`. Staff accounts are created from the browser with the secondary Auth instance (already in `src/config/firebase.ts`). No new env, index or dependency.
5. Security (permissions). Highest-risk item of the set; needs the rules suite (3.6) first and a security review.
6. Template fit: switch `teamLogins`, default **off** (hides Admin > Team and the staff login path; the `can()` rules stay and are harmless with no staff). `FEATURES.md` row (size M for the client: create logins, test each page). `REQUIREMENTS.md`: one question ("does the shop have staff who need limited admin access?"). Conflict: the other agent is editing the template's auth now (removing customer 2-step in `AuthContext`/`SecurityPage`): do this after that lands. Test impact: `tests/features-doc.test.ts`, `tests/template-clean.test.ts` (no "silver" wording).
7. **L.** Port to template as an off-by-default switch. Ishaputra: only if the client asks (nothing in `CLIENT.md` mentions staff).

### 3.9 Activity log and Recycle bin (`bd496ac`)
1. The owner sees who changed or removed what in the admin panel, and can restore anything deleted (or delete it for good). A delete is copied to a bin first.
2. Generic. Strip the section labels (`Manufacturers`, `Dealer tickets`).
3. Not in either repo.
4. Touches:
   - New: `src/lib/audit/{firestore,actor,sections}.ts`, `AdminActivity.tsx`, `AdminRecycleBin.tsx`.
   - **`vite.config.ts` aliases every `firebase/firestore` import (57 files import it here, with 52 `deleteDoc` uses) to the audit layer**, which imports the real SDK as `@firebase/firestore` (declare that package explicitly in `package.json` at the version `firebase` uses, or the hoisting is fragile). `vendor-firebase` chunk name changes.
   - Collections `activityLog`, `recycleBin` with owner-only rules.
   - `productService.deleteProduct` no longer frees R2/Cloudinary photos at delete time (they are freed on "delete forever"), so media accounting in `api/media.ts` changes.
   - Seven admin delete dialogs change wording.
   - Restore writes the document back as it was, so our order, review and video-call rules must let the owner re-create them (orders already do; reviews and bookings need `isAdmin()` on create, see `07d5846` #10).
   - It records writes from the browser, so it is a safety net for honest mistakes, not tamper-proof against a staff member with the console.
5. Security-adjacent (a bad Restore path could plant data: the Source needed the `binPage()` rule so staff can only bin documents they may delete).
6. Template fit: switch `auditTrail` (default on, or off if the owner prefers; off = actor never set, so the layer passes through). Logs only; no customer data except what an order holds when binned (addresses): note it in the privacy docs. `FEATURES.md` row, S for the client.
7. **M.** Port to template; offer to Ishaputra (accidental deletes of products and banners are the common real-world pain). Can ship without team logins (the owner is the only actor).

### 3.10 Jewellery spend offer (`bd496ac`)
1. "Spend over Rs X on qualifying products and one product in the same order is free up to Rs Y" with tiers, dates, a picker for the free item, and a bill/invoice line.
2. Generic idea, Sreerasthu wording and tiers (Jewellery, Rs 25,000/50,000/1,00,000). Needs neutral names (`spendOffer`, empty categories) or `tests/template-clean.test.ts` fails.
3. Not in either repo.
4. Touches: `src/lib/jewelleryOffer.ts` (new, pure) with an exact copy inside `api/create-order.ts` (Source test: they agree on 2,000 random carts; our `sync:rewards` + parity-test pattern would be reused), `siteSettings/jewelleryOffer`, `useCheckoutPricing.ts`, `Checkout.tsx`, `ShoppingCart.tsx`, `MobileCart.tsx`, `ProductDetail.tsx` (both product-page versions), invoice service, admin order details, Admin > Commerce > Offers tab, order fields (`offerDiscount`, `offerGiftName`, ...), `razorpayService` (sends `offerGiftProductId`). **It has to be re-merged with our pricing, not copied:** dealer-priced orders (our "no stacking" rule), rewards earn base (`earnBase`), points/cashback redemption order, the `rw_cart` hash, and the Rs 1 tolerance.
5. Money.
6. Template fit: switch `spendOffer`, default off; runtime enable also off (like rewards). `FEATURES.md` row (M for client), `PHASE1.md` row only if the client wants it. Two product-page versions and the cart drawer need the offer note.
7. **L.** Defer. Not asked for by any client; build when one does, with a money review (2 agents, as for dealers).

### 3.11 Dealer (manufacturer) chats (`bd496ac`)
1. Staff open numbered tickets (T-0001) with a manufacturer over WhatsApp and chat with text, photos and documents; the manufacturer's real number and name stay owner-only.
2. Sreerasthu business flow (buys from manufacturers). The mechanism (ticketed supplier chats) could be generic, but no client has asked.
3. Not in either repo. **Name clash:** the Source's `dealers/{id}`, `dealerPrivate`, `dealerTickets`, `src/services/dealerService.ts` and `src/pages/admin/AdminDealers.tsx` use the same names as our Dealer Membership (`dealers/{uid}` applications, `dealerPricing`, same file names). A copy would overwrite our dealer programme; rename to `suppliers*` if it is ever built.
4. Touches: `api/whatsapp-reply.ts` (+360 lines), `api/whatsapp-webhook.ts` (+100; one extra `dealerPrivate where phone ==` read per inbound message), `firestore.rules`, 2 admin pages, service, unread hook, a WhatsApp template `dealer_enquiry` (Meta approval), tests.
5. Security/privacy (private numbers).
6. Template fit would be `supplierChats` (depends on `whatsappInbox`, default off, size L for the client).
7. **L. Skip.**

### 3.12 WhatsApp-style inbox kit (`bd496ac`, `5c84b41`)
1. The customer inbox and chats look and behave like WhatsApp Web (list pane, bubbles with tails, ticks, day chips) and like the Android app on phones.
2. Generic UI; hard-codes WhatsApp's own greens and fonts in `wa.css`.
3. No. Our `AdminWhatsApp.tsx` (1,080 lines, identical in both repos) is a different, restyled version that also carries the **customer opt-out UI** ("Stop announcements to this customer" menu, "No announcements" badge, newest-500 load) from the 2026-10-12 review. The Source's rewrite of that page (912 lines) would erase those unless re-applied.
4. Touches: `src/components/wa/*` (new, about 820 lines), `AdminWhatsApp.tsx`, `MessageBubble.tsx`. `5c84b41` (composer pushed off screen at 150% scaling; day chip covering messages) only matters if this ships, and must ship with it.
5. UI only.
6. Ishaputra's rule: the owner likes the current design; any visual change needs a one-screen mockup and a yes first. No switch.
7. **M-L. Defer; make one mockup screen and ask.**

### 3.13 Smaller commits
- `80a4f35` (Customers list shows real order counts): **already fixed in both repos** with the same approach (`AdminCustomers.tsx` reads `orders` by `userId`). Skip.
- `c714eee` (Dashboard hides buttons the login cannot use): only meaningful with team logins; ride with 3.8.
- `e00d660` (category dropdown keyboard): both repos already have a better structure (dropdown nested in the tab wrapper, so Tab order is natural; Escape returns focus; blur closes it). Skip.
- `84add1b` (continuous row drift): Ishaputra already has its own continuous-drift hook (`a7cf774`, speed-based, direction per row). Its only extra idea is moving the fractional pixel onto a `transform` for smoothness; port only if jank is reported. Skip.
- `bbd84f6` (89 unused files): 86 are already gone. Left in both: `src/components/NavLink.tsx` and `src/services/historyService.ts` (nothing imports them) and `InstagramGallery.tsx` (kept on purpose for the `gallery` switch). Skip, or a 2-file clean-up.
- `ff95a8d`: an unused image. Skip.
- Emulator dev mode in `0967515`: see 3.6. The rest of `0967515` (offers tab wiring, audit noise, picker overflow, bin wording, chat wallpaper) belongs to features 3.9, 3.10, 3.11, 3.12.

---

## 4. Proposed port order

Security and money first. One patch applies to both repos for steps 1 to 4 (Ishaputra first, because it is live; then the template). Nothing is pushed or deployed without your OK; rules deploys are listed separately.

1. **Stock transaction fix (3.1).** S. Both. No deploy risk beyond a normal code deploy.
2. **Test harness (3.6):** install a full JDK (global; ask), add `test:rules`, emulator dev mode, and write the first cases for our current rules. The four open rule items and the underpayment hole show as known gaps. M.
3. **Rules and payment hardening (3.2, 3.3, 3.4):** reviews pending, gift cards, the two list rules, order-matches-payment with the one-hour window, `isPaymentSettled`, delivery cash, `payment_capture`. The gaps flip to "closed". One adversarial review of the money path. M. **Deploy order: code first, then rules** (the Source's note: new rules with old code send prepaid orders to review). Rules deploy needs your OK.
4. **Run the `security-audit` skill on Ishaputra** (it is already owed before live keys, per the handoff) with these results in hand.
5. **Install as app (3.7).** S-M. Both. Real-device check afterwards.
6. **Template only, only if you want them (each its own chat):** Activity log and Recycle bin (3.9, M), then Team logins (3.8, L; after the other agent's 2-step removal lands and the suite exists). Offer to Ishaputra's client: recycle bin, and team logins if they have staff.
7. **Backlog on request:** spend offer (3.10), WhatsApp-style inbox after a mockup (3.12), supplier chats (3.11).

Docs that change with steps 1 to 5: `HANDOFF.md` of both repos (state, gotcha about Admin SDK on Spark), `docs/template/FEATURES.md` (checkout row sentence), `docs/template/client/CLAUDE.md` Phase 5 (Admin SDK and Razorpay capture checks) and Phase 7 (run the rules suite), `docs/template/PHASE3.md` (icons). New switches only come with step 6 or 7.

---

## 5. Open questions for the owner

1. Close the "pay little, claim much" hole in the rules (step 3, needs a rules deploy on the live Ishaputra project)? Recommended: yes.
2. OK to install a full Temurin JDK 21 on this PC (global install) so the rules suite and emulator can run?
3. Does Ishaputra's client want a Recycle bin / Activity log, or team logins for staff? (Not mentioned in `CLIENT.md`.)
4. Template: should Activity log + Recycle bin and Team logins become template switches now, or wait for a client to ask?
5. Spend offer: build a neutral version for the template now, or only when a client asks? (Recommended: wait.)
6. WhatsApp-style inbox: do you want a one-screen mockup, or keep the current inbox? (Recommended: keep for now.)
7. Supplier/manufacturer chats: skip entirely? (Recommended: skip.)
8. Install-as-app card on the Account page only (as the Source did), or also a banner elsewhere?

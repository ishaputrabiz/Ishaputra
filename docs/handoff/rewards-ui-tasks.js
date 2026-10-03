export const meta = {
  name: 'rewards-ui-fixes',
  description: 'Fix the rewards display findings (admin order pages, customer order page/invoice, wallet/admin panels) against the new server contract',
  phases: [
    { title: 'Implement', detail: '3 agents, disjoint files: admin orders / customer order + invoice / rewards panels + settings' },
    { title: 'Review', detail: 'one reviewer per agent checks the diff against the contract and the findings' },
  ],
}

const ROOT = 'C:/Users/chala/OneDrive/Desktop/Ishaputra Botanicals/ssecommerce'

const CONTRACT = `
You are working in the Ishaputra Botanicals storefront (React 18 + Vite + TypeScript + Tailwind + shadcn/ui, Firebase), repo root: ${ROOT}
Git branch step-2b-rewards. The server side of the loyalty points + wallet cashback feature was just hardened (commit ba8dfcc and its amend, see git log -1). Read these first, they define the contract you build against:
  - src/lib/rewards.ts (shared rules: summariseRewards, computeRedemption, earnBase, pointsForBase, cartKey)
  - src/services/rewardsService.ts (RewardEntry, reconcileOrderRewards -> ReconcileResult {ok, changed?, skipped?, detail?}, releaseRewardHolds, getRewardSettings which now THROWS on read failure, saveRewardSettings which now merges)
  - src/hooks/useRewards.ts (returns { entries, balances, reserved, settings, loading })
  - src/services/orderService.ts, the Order interface (pointsUsed, pointsValue, cashbackUsed, pointsEarned, pointsEarnedState, pointsUnlockAt, paymentVerifiedAt, needsManualReview, manualReviewReason, razorpayOrderId) and the exported isValidStatusTransition / normalizeOrderStatus helpers
  - api/notify-order.ts reconcileRewards + releaseHolds (what the server writes), api/verify-payment.ts (what payments/<razorpay order id> holds)

Data contract (facts, do not change them):
  * order.pointsUsed = number of points spent (a COUNT, not rupees). order.pointsValue = their rupee value. Orders placed before this change may lack pointsValue: then show pointsUsed as rupees ONLY as a fallback (the old default was 1 point = Rs 1).
  * order.cashbackUsed = rupees of wallet cashback spent.
  * order.total = what the customer actually paid (already AFTER points and cashback). order.subtotal = products; order.couponDiscount/discount = coupon; deliveryCharge; taxAmount (GST: added on top unless order.gstInclusive, in which case it is the GST inside the prices).
  * order.pointsEarned = points earned on delivery; order.pointsEarnedState: 'active' (unlocks at order.pointsUnlockAt, a Firestore Timestamp), 'held' (a return is open: frozen), 'void' (order cancelled/returned/refunded: not credited). Absent = nothing earned yet.
  * payments/<razorpayOrderId> (Firestore doc, readable by admins and by its own customer): { uid, razorpayOrderId, razorpayPaymentId, amountPaise, base, points, pointsValue, cashback, cartHash, status: 'verified', verifiedAt, source }. cartHash = SHA-256 hex of cartKey(items) where items are {productId, quantity}. In the browser compute it with crypto.subtle.digest('SHA-256', new TextEncoder().encode(cartKey(order.items))) and hex-encode. An online order lives at orders/<razorpayOrderId>, so order.id === order.razorpayOrderId for new orders; older test orders may differ.
  * Ledger entry (RewardEntry): kind 'earn'|'spend'|'refund'|'adjust'; status 'active'|'void'; amount (+ credit, - debit); currency 'points'|'cashback'; hold true = a spend RESERVED for a checkout whose payment is not confirmed yet (already deducted from available); holdUntilMs; held true = an earn frozen because a return is open; late true = a spend confirmed after its reservation had been released; voidReason e.g. 'payment-not-completed' (a reservation released because the checkout was never paid), 'order-cancelled' / 'order-returned' / 'order-refunded' (earn voided), 'order-reopened' (refund taken back). Only kind 'earn' entries can be pending (until unlockAtMs, or while held); every other kind counts immediately.
  * reconcileOrderRewards(orderId) skipped reasons: 'no_customer', 'not_paid_online' (no Razorpay order), 'order_not_bound_to_payment' (legacy order id != razorpayOrderId), 'payment_not_verified' (Razorpay says unpaid), 'payment_belongs_to_another_customer'. ok:false with detail = the server could not reach Razorpay or failed; say so, never claim success.

Rules for your work:
  * Edit ONLY the files assigned to you below. Other agents are editing other files at the same time. Do not run git commit/stash/checkout/reset, do not run the dev server, do not run npm install.
  * Keep the existing layout and visual language of each file (Tailwind tokens, shadcn components, existing helpers such as formatPrice / formatCurrency in that file). Match surrounding code style and comment density. Dark mode must keep working (use the theme tokens the file already uses, not hard-coded greys), and lines must fit at 390px wide.
  * Real content only: no invented copy about policies the shop has not set. Plain, short customer-facing wording.
  * When done, run: npx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 5.0 (from the repo root; takes ~2 minutes). Known pre-existing errors you must ignore: src/services/videoCallService.ts, src/services/invoiceService.ts (3 old errors around Timestamp/seconds - if invoiceService is yours, do not add NEW ones), src/pages/delivery/DeliveryDashboard.tsx, src/components/VideoCallRequestModal.tsx. Fix any new error in your files.
  * Return a short report: files changed, what each change does (one line each), anything you could not do and why.`

const TASKS = [
  {
    key: 'admin-orders',
    files: 'src/pages/admin/AdminOrderDetails.tsx and src/pages/AdminOrders.tsx',
    prompt: `Your files: src/pages/admin/AdminOrderDetails.tsx and src/pages/AdminOrders.tsx (note: the list page is src/pages/AdminOrders.tsx, not under admin/).
Fix these confirmed review findings:
 1. AdminOrderDetails pricing breakdown (around the 'Points (' line, ~line 630): the points deduction renders -formatPrice(order.pointsUsed), a point COUNT shown as rupees. Show "Points (N)" with -formatPrice(order.pointsValue ?? order.pointsUsed) so the lines add up to Total. Keep the cashback line.
 2. AdminOrderDetails rewards panel (~line 650-670, the 'points earned on delivery' text and the 'Recalculate rewards' button): show the earned points from order.pointsEarned + order.pointsEarnedState + order.pointsUnlockAt: active -> "N points earned · unlock on <date>" (or "available" once the date has passed), held -> "N points on hold while the return is open", void -> "N points voided (order <status>)". Rename the button to "Check payment & rewards". Show the real ReconcileResult: changed.length>0 -> "Updated: ..." (a readable summary, e.g. count of changes), changed empty and no skipped -> "Payment and rewards are in line with this order", skipped -> a plain explanation per reason (see contract), ok:false -> "Could not check right now: <detail>". Never show the in-line message when ok is false.
 3. NEW payment check panel on AdminOrderDetails, near the payment details: for an order with razorpayOrderId, read payments/<razorpayOrderId> with getDoc (admins may read it; import db from '@/config/firebase' and doc/getDoc from 'firebase/firestore' as the file already does or similarly). Show:
     - record missing: an amber warning "Payment not confirmed by the server" + hint to press Check payment & rewards before packing (the reconcile writes the record when Razorpay says it is paid; re-read the record after the button finishes).
     - record present: "Payment verified · Rs <amountPaise/100> · <razorpayPaymentId>" in a calm success style, and compare: (a) amountPaise/100 vs order.total (tolerance Rs 1), (b) cartHash vs SHA-256 of cartKey(order.items) (only if cartHash non-empty), (c) record.points/record.cashback vs order.pointsUsed/order.cashbackUsed (treat missing as 0), (d) record.uid vs order.userId. Any mismatch -> a red warning listing what differs ("Amount paid Rs X but order total Rs Y", "Items differ from what was paid for", ...). This is how the shop catches an order document that was edited in the browser, so make mismatches impossible to miss.
     - Also show order.needsManualReview + manualReviewReason prominently if not already shown (check first; it may already exist).
 4. AdminOrders.tsx list: the status <select> (handleStatusChange ~line 121-129, the select ~line 563-578) calls updateOrderStatus with ANY status, allowing e.g. cancelled -> processing -> delivered, which the details page refuses. Apply the same transition check the details page uses (find it in AdminOrderDetails, it uses isValidStatusTransition from orderService): only offer/allow valid next statuses (plus the current one), and show a toast if an invalid change is attempted. Also, if the list shows rows compactly, add a small visible marker for orders with needsManualReview (e.g. a small amber "Review" badge) if there is none yet.`,
  },
  {
    key: 'customer-order',
    files: 'src/pages/OrderDetailsPage.tsx, src/pages/Account.tsx and src/services/invoiceService.ts',
    prompt: `Your files: src/pages/OrderDetailsPage.tsx, src/pages/Account.tsx, src/services/invoiceService.ts.
Fix these confirmed review findings: order.total is the amount paid AFTER points and cashback, but only the admin page shows those deductions, so the customer's order page, the account payment summary and the PDF tax invoice do not add up.
 1. OrderDetailsPage.tsx price summary (~lines 1142-1163: Selling price, Discount, Total fees, Total amount): add lines "Points (N)" -Rs pointsValue (fallback pointsUsed when pointsValue missing) and "Wallet cashback" -Rs cashbackUsed, only when > 0, placed after the coupon discount and before the total, styled like the existing discount line. Also, when order.pointsEarned > 0, add one short line under the summary: active -> "You earned N points · usable from <date>" (or "N points added to your wallet" once pointsUnlockAt has passed), held -> "N points on hold while your return is open", void -> "N points were not credited because the order was <cancelled/returned/refunded>" (use the order status). Use order.pointsUnlockAt.toDate().
 2. Account.tsx payment summary (~lines 1519-1545, same idea): add the same two deduction lines so the summary adds up. Find the right spot; keep it compact.
 3. invoiceService.ts (the PDF tax invoice; buildPricing ~line 158 and the totals block ~lines 327-368): (a) show points and cashback so the invoice adds up to what was paid: keep the goods/tax computation on the GOODS value, then after the Grand Total line add "Paid with points (N)" -Rs pointsValue and "Paid with wallet cashback" -Rs cashbackUsed and a final "Amount paid" = order.total (only when either is > 0; otherwise the invoice stays exactly as today). Grand Total must then be order.total + pointsValue + cashbackUsed (the value before these payment adjustments). (b) For GST-inclusive orders buildPricing derives taxableValue as total - delivery - cod - taxAmount, which is wrong once rewards reduce total: derive it from the goods instead: subtotal - couponDiscount(or discount) - taxAmount (never below 0). Check the GST-on-top path still computes the same numbers as before for orders without rewards. invoiceService.ts has 3 pre-existing type errors; do not add new ones and do not try to fix unrelated old ones unless trivial.
Read each file's existing helpers (formatting of rupees, row builders) and reuse them.`,
  },
  {
    key: 'rewards-panels',
    files: 'src/components/rewards/RewardsWalletCard.tsx, src/components/admin/RewardsAdminPanel.tsx, src/pages/admin/AdminCommerceSettings.tsx',
    prompt: `Your files: src/components/rewards/RewardsWalletCard.tsx, src/components/admin/RewardsAdminPanel.tsx, and ONLY the RewardsTab part of src/pages/admin/AdminCommerceSettings.tsx (do not touch the other tabs).
 1. RewardsWalletCard.tsx (customer wallet on /wallet): the history computes pending as e.status==='active' && e.unlockAtMs > now for every entry; only kind 'earn' entries can be pending now. Update the history labels: earn active + unlockAtMs>now -> "unlocks <date>"; earn held -> "on hold · return in progress"; earn void -> show it struck/greyed with "voided" (+ reason if voidReason starts with 'order-': "order returned" etc.); spend with hold -> "reserved for a payment in progress"; spend void with voidReason 'payment-not-completed' -> "released · payment not completed" (greyed); refund void with 'order-reopened' -> "taken back · order reopened"; late spend -> normal. Use useRewards' new 'reserved' value: when reserved.points or reserved.cashback > 0, show a short line under the balances, e.g. "Rs X reserved for a payment in progress" / "N points reserved ...", explaining they come back automatically if the payment is not completed. Keep the card's layout; just make the states truthful. Hide nothing that affects the balance.
 2. RewardsAdminPanel.tsx (admin customer page): line ~118 shows status as e.status==='void' ? 'Void' : e.unlockAtMs > now ? 'Pending until ...' : 'Available' for EVERY entry. Apply the same truthful states as above (Reserved (payment in progress) / Held (return open) / Pending until <date> for earn only / Available / Void (+ reason) / Released / Late). If the panel shows balances, also show reserved like above.
 3. AdminCommerceSettings.tsx RewardsTab (~line 813-815): it loads with getRewardSettings().catch(() => setS(DEFAULT_REWARD_SETTINGS)), so a failed read shows defaults as if saved and Save then overwrites the real settings. Change to: a loading state until the read finishes; on failure show an error message with a Retry button and keep Save disabled (do not render the defaults as if they were the shop's values); Save only enabled after a successful load. saveRewardSettings now merges (rewardsService), keep using it. Also check the save path reports errors with a toast.`,
  },
]

phase('Implement')
const results = await pipeline(
  TASKS,
  (t) => agent(`${CONTRACT}\n\nYOUR TASK (${t.key}):\n${t.prompt}`, { label: `implement:${t.key}`, phase: 'Implement' }),
  (report, t) => agent(`${CONTRACT}\n\nYou are the REVIEWER for task ${t.key}. Another agent was asked to do this:\n---\n${t.prompt}\n---\nIts report:\n---\n${report}\n---\nReview its work: run \`git diff -- ${t.files.replace(/,? and |, /g, ' ')}\` from ${ROOT} (the files: ${t.files}). Check every numbered requirement is actually met, the numbers add up (try a worked example: subtotal 1000, coupon 100, delivery 50, GST off, 180 points worth Rs 180 or with pointValue 0.5 worth Rs 90, cashback 200 -> total paid), states are truthful per the contract, nothing outside the assigned files changed, no new type errors (run the tsc command), dark-mode tokens and 390px fit are plausible. FIX any defect you find directly in those files (you may edit them). Return: verdict (pass / fixed / problems-left), a list of the defects found and what you fixed, and anything still wrong.`, { label: `review:${t.key}`, phase: 'Review' }),
)
return TASKS.map((t, i) => ({ task: t.key, review: results[i] }))

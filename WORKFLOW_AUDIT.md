# Sreerasthu Silvers — End-to-End Workflow Audit

_Audit-only report. No code changes are described here — pair with the implementation summary docs for those._

This document walks every user-facing and admin-facing workflow currently
shipped, calls out which Firestore collections and services it touches, and
flags gaps or fragile points found during review.

Legend:
- ✅ Implemented and integrated end-to-end
- ⚠️ Implemented but with caveats listed inline
- ❌ Not implemented / placeholder only

---

## 1. Authentication & account lifecycle

### 1.1 Sign up — email + password
**Path:** `/signup` → `Signup.tsx` → `AuthContext.signup` → `auth/createUserWithEmailAndPassword` → Firestore `users/{uid}` doc with profile defaults → `sendEmailVerification`.

- ✅ Email verification gate enforced via `ProtectedRoute requireEmailVerification`.
- ✅ Password reset via `/forgot-password` → `auth/sendPasswordResetEmail` (`PASSWORD_RESET_SECURITY.md`).
- ⚠️ Phone number is collected as a free-text field (`whatsappNumber`) — no verification of ownership at signup time. WhatsApp OTP flow is now scaffolded (see §1.4) but not yet bolted onto the signup form.

### 1.2 Sign in — email / Google
- ✅ Email/password and Google OAuth (`GOOGLE_SIGNIN_SETUP.md`).
- ✅ On successful auth `AuthContext.onAuthStateChanged` now also calls
  `PushNotifications.requestPermissionAndRegisterToken(uid)` so a fresh FCM
  token lands in `userTokens/{token}` for every active session.

### 1.3 Roles
Document `users/{uid}.role ∈ { 'customer', 'admin', 'delivery' }` drives
both UI gating (`AdminRoute`, `DeliveryRoute`) and Firestore rules
(`isAdmin()`, `isAssignedDeliveryBoy()`).

### 1.4 WhatsApp OTP — newly scaffolded
**Endpoints:** `POST /api/whatsapp-send` `{ kind: 'otp', to }` →
hashed record in `whatsappOtps/{ref}` (server-only) → user enters code →
`POST /api/whatsapp-verify-otp` `{ otpRef, otp }`.

- ⚠️ Endpoints exist and are independent of the email flow. Wiring into
  `Signup.tsx` / `Account.tsx` (UI step "verify phone") is **not yet done**
  pending UX decisions: pre-signup gate vs post-signup soft prompt.
- ⚠️ Requires `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, optional
  `WHATSAPP_OTP_TEMPLATE` env vars on Vercel and an approved
  `otp_login` template in Meta WhatsApp Business Manager.

### 1.5 Sign out
- ✅ Clears React context state. **Gap:** the FCM registration token is
  not deleted from `userTokens/`. A device that later switches accounts
  could still receive notifications addressed to the previous user. Action
  item: call `PushNotifications.unregisterToken(token)` inside
  `AuthContext.logout`.

---

## 2. Browse → cart → checkout

### 2.1 Browse
- ✅ Home (`Index.tsx`) → category landing (`CategoryPage.tsx`, with new
  collapsible filter sidebar) → product detail (`ProductDetail.tsx`).
- ✅ Six dedicated subcategory pages (`ShopRings`, `ShopPendants`,
  `ShopNecklaces`, `ShopEarrings`, `ShopBracelets`, `ShopAnklets`) with
  modal-style filter overlays.
- ✅ Search via `MobileSearch` and `SearchResults`, indexed against
  Firestore `products` via `subscribeToProducts*` helpers.

### 2.2 Cart
- ✅ `CartContext` mirrors per-user state into Firestore `carts/{uid}`
  (`CART_USAGE_GUIDE.md`, `FIREBASE_CART_FIX.md`). Guests use local-only
  state until login, then merged.
- ⚠️ Quantity inputs are not throttled. A user spamming "+" produces one
  Firestore write per click. Acceptable for this scale; revisit if writes
  become a cost concern.

### 2.3 Checkout
**Path:** `/checkout` → `Checkout.tsx` → `addressService.list` for shipping
selection → `orderService.createOrder` → Firestore `orders/{orderId}`
(rules: customer can only create orders with their own `userId`).

- ✅ Address management (`ADDRESS_MANAGEMENT_GUIDE.md`,
  `FIREBASE_ADDRESS_SECURITY_RULES.md`).
- ✅ Coupons / gift cards consumed at order creation.
- ⚠️ Payment is **placeholder** — no Razorpay/Stripe integration. Orders
  default to `pending` and assume offline payment confirmation by an admin.
  This is a deliberate product choice, not a defect, but should be flagged
  to stakeholders.

---

## 3. Order lifecycle

### 3.1 Statuses
`pending → processing → shipped/assigned → picked → outForDelivery → delivered`
plus terminal states `cancelled`, `returnRequested`, `returnScheduled`,
`returned`. All transitions append to `statusHistory[]`.

### 3.2 Admin actions (`/admin/orders`)
- ✅ `updateOrderStatus` updates the doc.
- ✅ Generates 6-digit `delivery_otp` automatically when status flips to
  `outForDelivery`.
- ✅ **(New)** Every status update now fires `dispatchStatusNotifications`
  → WhatsApp text via `sendOrderStatusAlert` and (when tokens are passed)
  a web push. OTP/security messages are excluded from this path per
  product policy.
- ⚠️ The push side currently only fires when callers supply explicit FCM
  tokens. Centralised lookup (resolve `userId → tokens` from
  `userTokens` server-side) would make this automatic; today only the
  admin notifications page does that lookup.

### 3.3 Delivery partner actions
- ✅ Login at `/delivery` with role-restricted access.
- ✅ `acceptOrder` (`shipped/assigned/processing → picked`),
  `startDelivery` (`picked → outForDelivery` + OTP generation),
  `verifyOTPAndDeliver` (`outForDelivery → delivered`).
- ✅ Map view (`DeliveryMapPage`) — uses browser geolocation; no live
  ETA pushed to customer.

### 3.4 Cancellations & returns
- ✅ Customer can cancel `pending`/`processing` orders themselves
  (Firestore rules enforce this).
- ✅ Customer can request a return for `delivered` orders.
- ⚠️ Return scheduling (`returnRequested → returnScheduled → returned`) is
  admin-only. There's no admin UI listing pending return requests as a
  filtered view; today admins have to scroll the full orders list.

---

## 4. Notifications (newly added end-to-end)

### 4.1 Web push (FCM)
- ✅ `public/firebase-messaging-sw.js` background handler.
- ✅ `src/services/pushNotificationService.ts` foreground subscription
  + token persistence to `userTokens/{token}`.
- ✅ `/admin/notifications` UI for ad-hoc broadcasts (filter by role).
- ✅ `api/send-notification.ts` Vercel serverless function chunking 500
  tokens per multicast and pruning invalid ones.
- ⚠️ Service worker registration requires HTTPS — works on Vercel preview
  deployments and prod, will silently no-op on `http://localhost` other
  than `localhost` itself.

### 4.2 WhatsApp
- ✅ `/api/whatsapp-send` for text/template/OTP.
- ✅ `sendOrderStatusAlert` wired into `updateOrderStatus`.
- ❌ Admin UI to send ad-hoc WhatsApp broadcasts not yet built (FCM panel
  exists; mirroring it for WhatsApp is a small follow-up).

### 4.3 Email
- ✅ Verification + password reset only (Firebase built-in).
- ❌ No transactional email for order receipts. Recommend SendGrid or
  Resend if/when stakeholders ask for it.

---

## 5. Video call (newly scaffolded)

- ✅ Signaling via Firestore `videoCalls/{callId}` + `callerCandidates`
  / `calleeCandidates` subcollections (rules locked to the two
  participants).
- ✅ `src/services/videoCallService.ts` — `startCall`, `answerCall`,
  `endCall`, ICE/SDP plumbing, cleanup on hangup.
- ✅ `src/pages/VideoCallPage.tsx` — `/call?to=<uid>` for caller,
  `/call/:callId` for callee, with mute / camera / hangup controls.
- ⚠️ STUN-only ICE configuration. Calls between users on symmetric NATs
  will fail until a TURN server is configured (a few lines in
  `videoCallService.ts`'s `ICE_SERVERS`). Recommendation: Twilio Network
  Traversal Service or self-host coturn.
- ❌ "Incoming call" UX (admin/customer ringtone + accept screen) is not
  yet wired. The expected flow: caller invokes `startCall`, then triggers
  an FCM push to the callee with `data.url = /call/{callId}`; the SW's
  `notificationclick` handler already opens that URL.
- ❌ No admin dashboard listing of active calls / call history.

---

## 6. Admin operations

| Surface | Route | Status |
|---|---|---|
| Dashboard | `/admin/dashboard` | ✅ |
| Products + form | `/admin/products`, `/products/new` | ✅ |
| Orders | `/admin/orders` | ✅ now also dispatches notifications on status change |
| Customers | `/admin/customers` | ✅ |
| Delivery boys | `/admin/delivery-boys` | ✅ (`DELIVERY_BOYS_GUIDE.md`) |
| Banners (carousel + home) | `/admin/banners`, `/admin/home-banners` | ✅ (`ADMIN_BANNER_GUIDE.md`, `BANNER_IMPLEMENTATION_COMPLETE.md`) |
| Showcases | `/admin/showcases` | ✅ (`SHOWCASE_MANAGEMENT_GUIDE.md`) |
| Testimonials | `/admin/testimonials` | ✅ |
| Gallery | `/admin/gallery` | ✅ |
| Gift cards | `/admin/gift-cards` | ✅ |
| Reviews | `/admin/reviews` | ✅ |
| Image prompts (AI) | `/admin/image-prompts` | ✅ |
| Videos | `/admin/videos` | ✅ |
| Site settings | `/admin/site-settings` | ✅ |
| **Notifications (FCM)** | `/admin/notifications` | ✅ new |
| Settings | `/admin/settings` | ⚠️ thin shell — most config is split across the dedicated panels above |

---

## 7. Cross-cutting concerns

### 7.1 Security
- ✅ Role checks done both client-side (router guards) and server-side
  (Firestore rules + Vercel function `x-admin-key` header).
- ✅ Admin SDK JSON now `.gitignored`. **Action item:** rotate the
  service-account key if it was ever committed historically.
- ⚠️ `ADMIN_NOTIFICATION_KEY` is stored in `localStorage` for convenience
  on the admin notifications screen. Acceptable because admins themselves
  hold it, but means anyone with physical access to an admin's machine
  can read it. Consider issuing it as a Firebase custom claim instead.

### 7.2 Observability
- ❌ No structured logging or analytics beyond `console.error`. Adding a
  thin wrapper that forwards to Sentry / Logflare would make production
  triage realistic.

### 7.3 Performance
- ✅ Vite + code-splitting per route via `React.lazy` (already in place
  for several pages; not all).
- ⚠️ Hero carousels and category bands fetch images at original size. A
  Cloudinary `f_auto,q_auto,w_*` transformation pass would cut image
  bytes ~60 % on mobile.

### 7.4 Accessibility
- ⚠️ Form fields generally labelled, but icon-only buttons (carousel
  arrows, mute toggle in the call screen) need consistent `aria-label`
  attributes. Several already have them; spot-check before launch.

---

## 8. Outstanding follow-ups (prioritised)

1. **Deploy `firestore.rules`** — local file is correct; user must run
   `firebase login && firebase deploy --only firestore:rules` (the agent
   hit a 401 because the CLI's stored credentials had expired).
2. **Configure Vercel env vars** — `FIREBASE_ADMIN_SDK_BASE64`,
   `ADMIN_NOTIFICATION_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
   `VITE_FIREBASE_VAPID_KEY`. See `INTEGRATIONS_SETUP.md`.
3. **Wire WhatsApp OTP into Signup UI** — small UX decision required
   (mandatory pre-signup vs optional post-signup verification).
4. **Add TURN server to video calls** before promising the feature to
   non-LAN users.
5. **Hook FCM "incoming call" push** into `startCall` so the callee
   actually rings.
6. **Server-side `userId → tokens` resolution** for order push
   notifications (current path requires callers to pass tokens).
7. **Logout token cleanup** (`PushNotifications.unregisterToken`).

---

_Last updated alongside the FCM / WhatsApp / WebRTC scaffolding work._

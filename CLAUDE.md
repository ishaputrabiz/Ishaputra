# CLAUDE.md: turning this store into a new client's store

Read this whole file before doing anything. Then read `CLIENT.md` if it exists. It holds this client's details and where the last session stopped.

## What this folder is

This folder is a fresh copy of the **Sreerasthu Silvers** codebase, a live silver-jewellery store. It is being turned into an online store for a **different business** (the client). Anything that mentions Sreerasthu, silver, jewellery, Kakinada or the maroon/gold look is left over from the original. It must be replaced or removed.

The code works in production. The job is to **rebrand, retheme and redesign the look**. It is not a rewrite of the logic.

| Part | What it is | Where |
| --- | --- | --- |
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, shadcn/ui, framer-motion, react-router 6 | `src/` |
| Backend | 12 Vercel serverless functions, each a standalone file that imports nothing from `src/` | `api/` |
| Firebase | Auth (email/password + Google), Firestore, Cloud Messaging (web push) | `src/config/firebase.ts`, `firestore.rules`, `public/firebase-messaging-sw.js` |
| Cloudflare R2 | Every image, plus the `catalog/products.json` snapshot the storefront reads products from | `api/media.ts`, `src/services/mediaStorage.ts`, `src/services/productCache.ts` |
| WhatsApp Cloud API (Meta) | OTP for 2-step verification, order messages, admin inbox, broadcasts | `api/whatsapp-*.ts`, `api/broadcast.ts`, `src/services/whatsappService.ts` |
| Razorpay | Payments | `api/create-order.ts`, `api/verify-payment.ts`, `src/services/razorpayService.ts` |
| Optional | Gemini (admin AI prompts), Metered TURN (video calls) | `api/gemini-generate.ts`, `VITE_METERED_TURN_*` |

Commands: `npm install`, `npm run dev` (http://localhost:5173), `npm run build`, `npm run lint`.

## Hard rules

1. **Never keep or reuse Sreerasthu secrets, data or accounts.** Phase 0 removes them. Never point local dev at Sreerasthu's Firebase: the admin panel writes to the real store.
2. **Restyle, don't re-plumb.** Leave the logic of these areas alone unless the user asks: cart, checkout totals, pricing, orders, returns, wallet, coupons, gift cards, auth, `firestore.rules` and `api/`. You may freely change class names, layout markup, copy, and the visual structure of components.
3. **Keep these names exactly as they are:**
    - Firestore collection and field names
    - Env var names
    - WhatsApp template names and variable order (table in Phase 4)
    - Route paths. WhatsApp buttons link to `/account/orders/:id`, `/admin/orders/:id`, `/call/:id` and `/deliverypartner`.
4. **Add no files to `api/`.** It already has 12 functions, the Vercel Hobby limit. Files in `api/` must stay standalone, so brand text inside them is edited in place.
5. **Handle secrets carefully.** Only `VITE_*` vars reach the browser. Never give a secret a `VITE_` prefix. Real keys go only in `.env`, which git ignores.
6. **Design for light and dark mode.** The site has both (`ThemeToggle`, `.dark` class), so every colour needs a dark-mode value.
7. **Design mobile first.** Most customers shop on phones. Check every page at 390px and 1440px wide.
8. **Work one phase at a time.** At the end of each phase:
    - `npm run build` must pass.
    - Update `CLIENT.md`.
    - Make a local git commit (never push).
    - Stop and let the user review before starting the next phase.
9. **Ask only about things that block you.** Missing colours or fonts never block: derive them (Phase 2). For missing legal or business facts, write `TODO(client)` and list them in `CLIENT.md`.

## At the start of every session

1. Read `CLIENT.md`. If it doesn't exist, this is a new client: start Phase 0.
2. If it exists, continue from its **Next step** line.
3. Client files (logo, photos, brand guide) are in `client-assets/`. Look at the logo image yourself before any design work.

## Phase 0: intake and clean-up

1. **Create `CLIENT.md`** from the user's prompt, using the template at the end of this file. List missing info under Open questions.
2. **Set up git.** If the folder is not a git repo, run `git init`. Confirm `.gitignore` covers `.env`, `.env.local`, `.vercel` and `dist`.
3. **Delete Sreerasthu leftovers:**
    - `.env`: it holds Sreerasthu's live keys. Recreate it from `.env.example` with empty values, and add these fixes:
        - Add the missing lines `WHATSAPP_APP_SECRET=` and `WHATSAPP_VERIFY_TOKEN=`. The webhook needs both.
        - Set `WHATSAPP_OTP_LANG=en`.
        - Set `R2_BUCKET` to empty; it is `ssstorage` in the example.
    - `.env.local`: it links the folder to Sreerasthu's Vercel project. Also delete `.vercel/` if it exists.
    - `dist/`, `TEST_CREDENTIALS.md` and `test-homepage-mobile.png`.
    - Sreerasthu product data in `scripts/`: `stock-*.json`, `image-status.*`, `image-migration-review.csv`, `visual-*.json`, `cloudinary-backup.json` and `sheets/`.
    - Hard-coded values in `scripts/test-*.mjs`. `test-templates.mjs` has Sreerasthu's WhatsApp token typed in as a fallback, plus their phone numbers and URLs. Make every script read these from env only.
    - `README.md`: replace it with a short README for the client.
4. **Delete unused pages.** 66 page files are not imported anywhere, because category pages render through `src/pages/CategoryPage.tsx`. They are:
    - All of `src/pages/categories/`
    - In `src/pages/`: `Silver*.tsx`, `Shop*.tsx`, `AntiqueSilver*.tsx`, `RoyalSilver*.tsx`, `*Jewelry*.tsx`, `*Collections.tsx`, `JewelrySale.tsx`, `BabyItems.tsx`, `CustomOrders.tsx`, `NewArrivals.tsx` and `WalletPage.tsx`. The `/wallet` route renders `PurchaseSummary.tsx`.

   Before deleting each file, search to confirm nothing imports it. Run `npm run build` afterwards.
5. **Apply the security fixes the Sreerasthu code lacks.** In `api/send-notification.ts` and `api/whatsapp-send.ts`, the admin-key check is skipped when `ADMIN_NOTIFICATION_KEY` is unset. Make both refuse when the key is missing, and compare the key with `crypto.timingSafeEqual`. Two deeper fixes belong to Phase 4:
    - The public order templates in `whatsapp-send`: require a Firebase ID token and check the recipient.
    - OTP sends: add a per-phone rate limit.
6. **Get the client's Firebase config.** The site will not start without the `VITE_FIREBASE_*` values: `src/config/firebase.ts` throws an error if any of the 6 required ones is missing. Ask the user for the client's Firebase web config (section "Firebase" in Phase 4).
7. Commit: `Phase 0: clean Sreerasthu copy`.

## Phase 1: brand text and business details

Goal: no Sreerasthu, silver or jewellery text is visible anywhere.

1. **Create `src/config/brand.ts`** with no imports. It holds:
    - name, shortName, legalName, tagline
    - domain, siteUrl
    - email, phones, whatsapp
    - addressLines, hours, mapEmbedUrl
    - gstin, social links
    - themeStorageKey

   Import it wherever `src/` files hard-code these today.
2. **Replace hard-coded text.** Search case-insensitively for `sreerasthu|sree rasthu|srs-|silver|jewel|kakinada|6304960489|sreerasthusilvers-kkd` and keep going until nothing client-facing is left. The known places are:
    - `src/services/siteSettingsService.ts`: `DEFAULT_FOOTER`
    - `src/services/invoiceService.ts`: `SELLER` (GSTIN is blank today)
    - `src/services/whatsappService.ts` and `src/services/geminiService.ts`. The AI prompts describe silver jewellery; rewrite them for the client's products.
    - `src/data/content.json`, `src/data/defaultHomeCollections.ts`
    - `src/services/categoryService.ts`: `DEFAULT_CATEGORIES`. These are seeded when Firestore has no categories; use the client's category tree.
    - `src/contexts/ThemeContext.tsx`: key `sreerasthu-theme`
    - `src/lib/siteUrl.ts`: default URL
    - Pages: About, Contact, PrivacyPolicy, TermsConditions, ShippingPolicy, CancellationRefundPolicy, auth/Login, auth/Signup, auth/VerifyEmail, admin/AdminLogin, admin/AdminLayout, admin/Settings
    - Components: Header, MobileHeader, Footer, LoadingScreen, HeroBanner, FeatureIcons, CollectionBanner, AboutSection, PromoSection, YouTubeShowcase, WhatsAppEnquiryButton, VideoCallRequestModal
3. **Edit the `api/` files in place**, since they cannot import `brand.ts`:
    - `api/media.ts`: link-preview title and `og:site_name`
    - `api/whatsapp-send.ts`: the plain-text OTP message
    - `api/send-call-notification.ts`: the fallback caller name
4. **Update site config:**
    - `index.html`: title, description, author, canonical URL, `og:*` tags, `og:image` (currently a Sreerasthu product photo) and `twitter:site`
    - `public/firebase-messaging-sw.js`: fallback title and the `srs-notification` tag
    - `vercel.json`: point the `/catalog/products.json` rewrite at `https://images.<client-domain>/catalog/products.json`
    - `.firebaserc`: the client's Firebase project id
5. **Rewrite the policy pages** with the client's details. Mark legal points you had to assume with `TODO(client)`.
6. **Remove or switch off business-specific features:**
    - **Silver-rate pricing.** For a business that doesn't sell precious metal:
        - Remove `SilverRateWidget` from `Header.tsx`.
        - Remove the `/admin/silver-rate` route and its admin nav link.
        - Leave `SilverRateProvider`, `src/services/livePricing.ts` and `api/create-order.ts` as they are. Products without `silverPricing.enabled` already use their stored price.
    - `src/config/features.ts` → `DELIVERY_PARTNERS_ENABLED`: set it to `true` only if the client has their own delivery staff.
    - Video calls, wallet/gift cards and AI prompts: hide the ones the client does not want. Hide links and routes; don't delete services.
7. Commit: `Phase 1: brand text`.

## Phase 2: theme

### 2a. Choose colours and fonts

Use the user's colours and fonts if they gave them. Otherwise derive them:

1. **Get the logo's colours.** Look at the logo in `client-assets/`, then extract its colours with sharp, which is already installed:

   ```bash
   node --input-type=module -e "import sharp from 'sharp'; const s = await sharp('client-assets/logo.png').stats(); console.log(s.dominant)"
   ```

   For more colours, resize the logo to 8×8 with `.raw()` and read the pixels.
2. **Build a palette:**
    - primary: the main logo colour
    - highlight: the second logo colour, or a harmonious accent
    - background/surface: a neutral tinted towards the brand, not always pure white
    - foreground, muted and border
    - destructive: stays red

   Make a dark-mode version of every colour.
3. **Check contrast** with a small node script. Body text on the background, and button text on primary, must both be at least 4.5:1. Adjust lightness until they pass.
4. **Pick fonts:** one heading font and one body font from Google Fonts that fit the business. **Never use Playfair Display with Poppins; that is Sreerasthu's pair.** Starting points:

| Business type | Heading + body pairs to consider |
| --- | --- |
| Herbal, ayurveda, organic, skincare | Cormorant Garamond + Nunito Sans; Fraunces + Karla |
| Fashion, boutique, sarees | Bodoni Moda + Jost; Italiana + Mulish |
| Food, sweets, bakery, spices | DM Serif Display + DM Sans; Young Serif + Figtree |
| Electronics, hardware, tools | Space Grotesk + Inter; Manrope (both) |
| Kids, toys, gifts | Fredoka + Nunito; Baloo 2 + Quicksand |
| Home decor, furniture, handicrafts | Marcellus + Lato; Libre Caslon Text + Work Sans |
| Regional-language text | Add the matching Noto Sans script (Telugu, Devanagari, Tamil) |

5. **Show the user 2 options** as a small table: hex values, font pair and a one-line mood for each. Recommend one, then wait for their pick.

### 2b. Apply the tokens

- **Colour tokens.** In `src/index.css`, set the `:root` and `.dark` tokens as HSL without `hsl()`, e.g. `358 52% 33%`. Besides the shadcn tokens, the file has `--cream`, `--cream-dark`, `--primary-light`, `--primary-dark`, `--shadow-gold` and `--gradient-gold`. Re-point all of them, and fix the header comment.
- **Highlight token.** Add a `--highlight` / `--highlight-foreground` pair to the CSS and to `tailwind.config.ts` colours. It replaces the job gold did.
- **Fonts.**
    - Load them with the Google Fonts `@import` on line 2 of `src/index.css`.
    - Set `--font-heading` and `--font-body`.
    - In `tailwind.config.ts`, set `fontFamily`: `heading`, `body`, `sans`, `serif`, and `poppins`. Keep the `poppins` key name but point it at the new body font.
- **Logos and images.** Generate each size from the client logo with sharp:

| File | Used as |
| --- | --- |
| `public/black_logo.png` | Logo on light backgrounds (10 places) |
| `public/white_logo.png` | Logo on dark backgrounds (11 places) |
| `public/logo-new.png` | Main logo, also on the invoice PDF |
| `src/assets/dark.png` | Logo in Login, Signup, VerifyEmail, Account, ProductDetail, MobileCategories, ProfileEditPage |
| `public/favicon.ico`, `public/favicon.png` | Browser tab |
| `public/icon-192.png` | Push-notification icon. **Missing today, so create it** |
| `public/loading_black.png`, `public/loading_white.png` | Loading screen |
| `public/login-image.png`, `src/assets/login-cart.png` | Login side image, empty-cart image |

### 2c. Replace hard-coded colours

Changing the tokens alone does not retheme the site. About **990 `amber-*` classes** and **565 hex codes in 47 files** hard-code Sreerasthu's look:

| Hard-coded value | Count | Replace with |
| --- | --- | --- |
| `#d4af37` (gold) | 129 | `highlight` |
| `#F5EFE6`, `#FFF9E6` (cream) | 67 | `cream` or `secondary` |
| `#832729` (maroon) | 40 | `primary` |
| `#e8c56a` (light gold) | 21 | `highlight` with opacity (`highlight/70`) |
| `amber-*`, `yellow-*`, `stone-*`, `rose-*` | about 1,200 | `highlight`, `primary`, `cream` or `muted` by role |

- **Keep** `red-*` where it means an error, cancellation or delete. Keep grey neutrals, and keep status colours such as green for delivered.
- **Work customer-facing files first.** The heaviest are `OrderDetailsPage` (40), `Checkout` (18), `CustomerSupport` (17), `MobileOrders` (16), `SecurityPage` (14), `Account`, `Footer` and `TestimonialsCarousel` (13 each). The top admin files are `AdminImagePrompts` (73), `AdminOrderDetails` and `ProductForm`. Do admin screens after them.
- **Search again when done**, and record what's left in `CLIENT.md`.
- **Review with the user.** Show the home page at 390px and 1440px, in light and dark mode. Use Playwright or a browser tool if you have one; otherwise ask the user to check.
- Commit: `Phase 2: theme`.

## Phase 3: page-by-page UI/UX

Work in this order:
1. The shared shell: Header, MobileHeader, MobileBottomNav, Footer, LoadingScreen, Login, Signup
2. Home
3. Products listing
4. Product detail
5. Checkout
6. Wishlist
7. Profile and its sub-pages

For each page:

1. Read the page and the components it uses.
2. Propose **2-3 clearly different layout directions**, a few lines each (an ASCII sketch helps). Base them on the client's products and customers. Recommend one, then wait for the user's pick.
3. Build it. Keep the existing data hooks and services; change how things look.
4. Check it:
    - `npm run build` passes.
    - It looks right at 390px and 1440px, in light and dark mode.
    - The page's main actions still work: add to cart, wishlist toggle, filters, sorting, payment.
5. Log the decisions in `CLIENT.md` and commit `Phase 3: <page>`.

**The store must look unique.** It must not look like Sreerasthu: maroon and gold, Playfair Display + Poppins, a centred luxury hero, gold dividers. It must also not look like the earlier clients listed in `CLIENT.md`. To make it different, vary:
- the hero layout
- the category navigation style
- the product card's shape, image ratio and hover effect
- section rhythm and spacing
- heading treatment and button shape
- icons, image treatment and motion

| Page | Files | Change freely | Do not touch |
| --- | --- | --- | --- |
| Home | `src/pages/Index.tsx` (imports 17 section components) | Choose, reorder, restyle or replace sections; hero; category nav; add a brand-story section; drop jewellery sections such as `LuxurySofaSection` and `SilverRateWidget` | The admin data sources (home banners, home collections, showcases, testimonials, videos). The client edits the homepage through them |
| Products | `src/pages/CategoryPage.tsx`, `src/components/ProductCard.tsx`, `MobileProductsGrid.tsx`, `ProductQuickView.tsx`, `ProductPagination.tsx` | Card design, grid, badges, filter panel look, business-specific filters | `matchesTaxon` in `src/lib/taxonomy.ts`; sort and filter logic |
| Product detail | `src/pages/ProductDetail.tsx`, `ProductDetailSection.tsx`, `WhatsAppEnquiryButton.tsx` | Gallery layout, order of information, trust badges; business blocks such as ingredients, how to use or a size chart | The price from `liveUnitPrice`, stock checks, reviews. If you need a new product field, make it optional and add it to `admin/ProductForm.tsx` too |
| Checkout | `src/pages/Checkout.tsx` (3,440 lines), `MobileCart.tsx`, `ShoppingCart.tsx` | Colours, spacing, step indicator, trust and delivery messages | Totals, `useCheckoutPricing`, coupon, wallet, GST, shipping, Razorpay calls. Restyle only |
| Wishlist | `src/pages/Wishlist.tsx` | Card style, empty state, move-to-cart button | `useWishlist`, `wishlistService` |
| Profile | `Profile.tsx`, `Account.tsx`, `ProfileEditPage.tsx`, `SavedAddresses.tsx`, `MobileOrders.tsx`, `OrderDetailsPage.tsx`, `PurchaseSummary.tsx` (the `/wallet` page), `SecurityPage.tsx`, `BuyAgain.tsx` | Header card, icons, order-timeline style, layout | Order status logic, cancel and return flows, the 2-step verification flow |

## Phase 4: integrations and launch prep

The user creates the accounts; you wire them up and tell the user exactly what to click. Keep the account steps short and ask for values only when you need them.

### Env vars

Everything below is server-only except the `VITE_*` vars:

| Group | Vars |
| --- | --- |
| Firebase | `VITE_FIREBASE_*` (7 values, 6 required, from Firebase console → Project settings → Web app), `VITE_FIREBASE_VAPID_KEY` (Cloud Messaging → Web Push certificates), `FIREBASE_ADMIN_SDK_BASE64` (service-account JSON, base64-encoded), `ADMIN_NOTIFICATION_KEY` (a random string) |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (`https://images.<domain>`, no trailing slash), `R2_BILLING_CYCLE_DAY`, `CLOUDFLARE_ANALYTICS_TOKEN` (Account Analytics Read + Zone Cache Purge), `CLOUDFLARE_ZONE_ID` |
| WhatsApp | `WHATSAPP_TOKEN` (system-user token that never expires), `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_OTP_TEMPLATE=otp_login`, `WHATSAPP_OTP_LANG=en` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID` (test keys first, live keys at launch) |
| Other | `VITE_SITE_URL`, optional `GEMINI_API_KEY`, optional `VITE_METERED_TURN_*` |

### Firebase

- **Deploy rules and indexes:** `firebase use --add`, then `firebase deploy --only firestore:rules,firestore:indexes`.
- **Enable sign-in:** turn on the Email/Password and Google providers. Add the client domain and `*.vercel.app` to Authorized domains.
- **Create the first admin:** sign up on the site, then in the Firestore console open `users/{uid}` and set `role` to `admin`. The rules block users from doing this themselves.
- **Stay on the free plan:** it allows 50,000 Firestore reads a day, which is why products are read from the R2 snapshot.

### Cloudflare

- **Use one Cloudflare account per client.** The upload guard in `api/media.ts` measures the whole account against the free tier (10 GB, 1M writes, 10M reads a month).
- **DNS:** the domain's DNS is on Cloudflare. The site's A and CNAME records point to Vercel with the proxy **off** (DNS only).
- **Images:** the R2 bucket is served from its own custom domain, `images.<domain>`. The `r2.dev` URL stays off.
- **Catalog snapshot:** once products exist, run `node scripts/publish-catalog.mjs`. Until R2 is ready, the storefront falls back to reading Firestore. For local dev you can also set `CATALOG_DEV_FILE=<path to JSON>`.
- **Sample products before R2 exists:** the admin product form accepts pasted image URLs, so products can be added before R2 is set up.

### WhatsApp templates

- Create every template with language **English (`en`)**, not English (US).
- Webhook URL: `https://<domain>/api/whatsapp-webhook`, subscribed to the `messages` field.
- Button base URLs use the client domain.
- A deleted template name can't be reused for 4 weeks, so get names right the first time.
- Before going live, close two abuse holes in `api/whatsapp-send.ts`. Both let a stranger run up the store's WhatsApp bill:
    - Order templates are public today. Require a Firebase ID token, and check that `to` is that order's customer or the admin notification number.
    - OTP sends have no rate limit. Add a per-phone limit.

| Template | Category | Variables in order | Button 0 |
| --- | --- | --- | --- |
| `otp_login` | Authentication | code | Copy code |
| `order_confirmed` | Utility | name, order no., items, total | URL `/account/orders/{{1}}` |
| `order_out_for_delivery`, `order_delivered`, `order_cancelled`, `order_refunded` | Utility | name, order no., items | URL `/account/orders/{{1}}` |
| `order_return_update` | Utility | name, order no., items, result | URL `/account/orders/{{1}}` |
| `order_timeslot` | Utility | name, order no., date, time range | URL `/account/orders/{{1}}` |
| `admin_order_alert` | Utility | order no., items, total, customer | URL `/admin/orders/{{1}}` |
| `admin_order_delivered` | Utility | order no., customer | URL `/admin/orders/{{1}}` |
| `admin_return_requested`, `admin_returned` | Utility | order no., customer, items | URL `/admin/orders/{{1}}` |
| `admin_return_picked` | Utility | order no., items | URL `/admin/orders/{{1}}` |
| `admin_low_stock_alert` | Utility | order no., product, stock left | URL `/admin/orders/{{1}}` |
| `delivery_new_task` (only if the delivery app is on) | Utility | partner, order no., items, address | Static URL `/deliverypartner` |
| `video_call_inapp` (only if video calls are on) | Utility | name, product | URL `/call/{{1}}` |
| `video_call_meet` (only if video calls are on) | Utility | name, product | URL `https://meet.google.com/{{1}}` |

The owner's alert number is set after launch in the admin settings page (`siteSettings/adminNotification.whatsappNumber`).

### Launch test

Test each of these on the deployed site, in order:
- Sign up, verify the email, reset the password, sign in with Google.
- Turn on 2-step verification: the WhatsApp OTP must arrive.
- Receive a push notification while the phone is locked.
- Add to cart and wishlist, apply a coupon, pay with Razorpay test keys.
- Confirm the order WhatsApp messages reach both the customer and the owner, and that their buttons open the right page.
- Move the order through its statuses.
- Test a return and a cancellation.
- Check the invoice PDF shows the client's name and GSTIN.
- Upload an image and confirm its URL starts with `https://images.<domain>`.
- Share a product link on WhatsApp and check the preview.
- Send a customer reply and confirm it appears in the admin WhatsApp inbox.
- Search the live site for any leftover Sreerasthu text.

## CLIENT.md template

Create this in Phase 0 and keep it current. It is the memory between sessions.

```markdown
# Client: <business name>

## Business
- Sells: <products> to <customers> in <city/region>
- Legal name / GSTIN:
- Address, phone, email, WhatsApp, hours:
- Domain:
- Social links:
- Categories: <main → sub>

## Brand
- Logo: client-assets/<file>
- Colours: <given | derived from logo> primary #…, highlight #…, background #… (dark: …)
- Fonts: heading …, body …
- Feel: <3-5 words>
- Must not look like: Sreerasthu Silvers (maroon/gold, Playfair + Poppins), <earlier clients>

## Features
- Delivery-partner app: on/off
- Video calls: on/off
- Wallet / gift cards: on/off
- Silver-rate pricing: off (unless they sell metal)
- AI prompt tool: on/off

## Accounts and env
- Firebase: not started / in progress / done
- Cloudflare R2 + images domain:
- WhatsApp (Meta verification, number, templates approved):
- Razorpay (KYC, test keys, live keys):
- Vercel + domain:

## Decisions log
- <date>: <decision and why>

## Progress
- [ ] Phase 0: clean-up
- [ ] Phase 1: brand text
- [ ] Phase 2: theme
- [ ] Phase 3: shell, home, products, product detail, checkout, wishlist, profile
- [ ] Phase 4: integrations and launch test

## Next step
<one line: exactly where the next session should start>

## Open questions
- <question> (blocking / not blocking)
```

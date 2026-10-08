# CLAUDE.md: turning this store into a new client's store

Read this whole file before doing anything. Then read `CLIENT.md` if it exists. It holds this client's brief, decisions, and where the last session stopped.

## What this folder is

This folder is a copy of the **Sreerasthu Silvers** codebase, a live silver-jewellery store. It is being turned into an online store for a **different business** (the client). Anything that mentions Sreerasthu, silver, jewellery or Kakinada, or uses the maroon/gold look, is left over and must go.

The code, its layout and its features are proven in production. That is why it is reused. **The job is to give it the client's look and feel, not to rebuild it.**

| Part | What it is | Where |
| --- | --- | --- |
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, shadcn/ui, framer-motion, react-router 6 | `src/` |
| Backend | 12 Vercel serverless functions, each a standalone file that imports nothing from `src/` | `api/` |
| Firebase | Auth (email/password + Google), Firestore, Cloud Messaging (web push) | `src/config/firebase.ts`, `firestore.rules`, `public/firebase-messaging-sw.js` |
| Cloudflare R2 | Images, plus the `catalog/products.json` snapshot the storefront reads products from | `api/media.ts`, `src/services/mediaStorage.ts`, `src/services/productCache.ts` |
| WhatsApp Cloud API | OTP for 2-step verification, order messages, admin inbox, broadcasts | `api/whatsapp-*.ts`, `api/broadcast.ts`, `src/services/whatsappService.ts` |
| Razorpay | Payments | `api/create-order.ts`, `api/verify-payment.ts`, `src/services/razorpayService.ts` |

Commands: `npm install`, `npm run dev` (http://localhost:5173), `npm run build`, `npm run lint`.

**After any `.env` change, fully stop and restart `npm run dev`.** `vite.config.ts` copies `.env` into `process.env` only for keys not already set. Vite's automatic reload on a `.env` change reuses the same process, so old values win and only new keys get added. A dev server started before Step 0 keeps talking to Sreerasthu's Firebase until it's restarted. To check which project a running server uses, fetch `http://localhost:<port>/src/services/mediaStorage.ts` and look for `VITE_FIREBASE_PROJECT_ID`.

## The main rule: keep the layout, change the design

Every page keeps the same sections, in the same order, doing the same job. What changes is how they look.

**You may change:**
- Colours, fonts, font sizes and weights, letter spacing
- Spacing, corner radius, borders, frames, shadows
- Image treatment. Example: the home hero carousel sits in a rounded frame; remove the frame so the images run full-width like a background.
- Backgrounds and textures
- Card styling, button and badge styling, icons
- Hover states, transitions and animation
- Wording, including removing jewellery wording

**You may not, without the user's explicit OK:**
- Add, remove or reorder sections on a page
- Change what a section shows or does
- Change the navigation, routes or user flows

If you are unsure whether a change counts as layout, ask. Never propose alternative layouts.

## Other hard rules

1. **Nothing of Sreerasthu's stays.**
    - Never keep or reuse Sreerasthu's secrets, data or accounts.
    - Never point this copy at Sreerasthu's Firebase, R2 or Vercel: the admin panel writes to wherever it is pointed.
2. **Restyle, don't re-plumb.** Leave the logic alone unless the user asks. That covers:
    - Cart and checkout totals, pricing
    - Orders, returns, wallet and loyalty points, coupons, gift cards
    - Auth, `firestore.rules`, and everything in `api/`
3. **Keep these names exactly as they are:**
    - Firestore collection and field names
    - Env var names
    - WhatsApp template names and variable order (see Reference)
    - Route paths. WhatsApp buttons link to `/account/orders/:id`, `/admin/orders/:id`, `/call/:id` and `/deliverypartner`.
4. **Add no files to `api/`.** It already has 12 functions, the Vercel Hobby limit, and those files must stay standalone. Brand text inside them is edited in place.
5. **Only `VITE_*` vars reach the browser.** Never give a secret a `VITE_` prefix. Real keys go only in `.env`, which git ignores.
6. **Support 3 themes: Light, Dark and System.** They already exist (`ThemeContext`, `ThemeToggle`, `.dark` class). Every colour needs a dark-mode value.
7. **Mobile first.** Check every page at 390px, 768px and 1440px wide, in light and dark mode.
8. **Work one step at a time.** At the end of each step or page:
    - `npm run build` must pass.
    - Update `CLIENT.md`.
    - Make a local git commit (never push).
    - Stop so the user can review.
9. **Don't build new features during Steps 1 and 2.** List anything the client wants that doesn't exist under "Build after Step 2" in `CLIENT.md`.
10. **Keep demo data easy to remove.** Every demo document gets `demo: true`. Demo testimonials or reviews must never be live after launch.
11. **Ask only about what blocks you.** For missing legal or business facts, write `TODO(client)` and list them in `CLIENT.md`.

## At the start of every session

1. Read `CLIENT.md`. If it doesn't exist, this is a new client: start at Step 0.
2. If it exists, continue from its **Next step** line.
3. Client files (logo, photos, brand guide) are in `client-assets/`. Look at the logo image itself before any design work.

## The steps

| Step | What | Ends with |
| --- | --- | --- |
| 0 | Safe preview: remove Sreerasthu data, connect the client's Firebase, add demo products | Site runs on the client's Firebase with demo products |
| 1 | New look: logo, business details, colours, fonts, loading animation; remove features the business doesn't need | Client reviews the new look |
| 2 | Design each page, one at a time, with no layout change | Client reviews each page |
| 2B | Build the client's missing features | Features working |
| 3 | Switch to the client's own accounts; load real products | Everything runs on client accounts |
| 4 | Full test, publish on the real domain, send to the client | Client has the link |
| 5 | Make the client's changes, then launch publicly | Public launch |

## Step 0: safe preview

1. **Create `CLIENT.md`** from the user's prompt, using the template in Reference.
2. **Set up git.** If the folder is not a git repo, run `git init`. Confirm `.gitignore` covers `.env`, `.env.local`, `.vercel`, `dist` and `*firebase-adminsdk*.json`.
3. **Delete Sreerasthu leftovers:**
    - `.env`, which holds Sreerasthu's live keys. Recreate it from `.env.example` with empty values, then:
        - Add `WHATSAPP_APP_SECRET=` and `WHATSAPP_VERIFY_TOKEN=`.
        - Set `WHATSAPP_OTP_LANG=en`.
        - Leave `R2_BUCKET` empty.
    - `.env.local`, which links the folder to Sreerasthu's Vercel project. Also `.vercel/` if it exists.
    - `dist/`, `TEST_CREDENTIALS.md` and `test-homepage-mobile.png`.
    - Sreerasthu data in `scripts/`: `stock-*.json`, `image-status.*`, `image-migration-review.csv`, `visual-*.json`, `cloudinary-backup.json` and `sheets/`.
    - Hard-coded tokens, phone numbers and URLs in `scripts/test-*.mjs`. For example, `test-templates.mjs` has Sreerasthu's WhatsApp token. Make these scripts read everything from env.
    - `README.md`: replace it with a short README for the client.
4. **Delete unused pages.** 66 page files are imported nowhere; categories render through `src/pages/CategoryPage.tsx`. They are:
    - All of `src/pages/categories/`
    - In `src/pages/`: `Silver*.tsx`, `Shop*.tsx`, `AntiqueSilver*.tsx`, `RoyalSilver*.tsx`, `*Jewelry*.tsx`, `*Collections.tsx`, `JewelrySale.tsx`, `BabyItems.tsx`, `CustomOrders.tsx`, `NewArrivals.tsx` and `WalletPage.tsx`. The `/wallet` route renders `PurchaseSummary.tsx`.

   Search to confirm nothing imports a file before deleting it.
5. **Check the admin-key functions fail closed.**
    - Which: `api/send-notification.ts` and `api/whatsapp-send.ts`.
    - Why: both skip the `x-admin-key` check when `ADMIN_NOTIFICATION_KEY` is unset.
    - Fix: return 503 when the key is missing, and compare with `timingSafeEqual`.
6. **Connect the client's Firebase.**
    - Put the client's 7 web config values in `.env` as `VITE_FIREBASE_*`. The site won't start without them.
    - Ask the user to do these in the Firebase console:
        - Firestore Database → Create database → production mode → region `asia-south1`.
        - Authentication → enable Email/Password and Google.
        - Project settings → Service accounts → Generate new private key. Save the JSON in this folder; git ignores `*firebase-adminsdk*.json`.
    - Put the JSON into `.env` as `FIREBASE_ADMIN_SDK_BASE64`.
    - Deploy the rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes --project <id>`. Point `GOOGLE_APPLICATION_CREDENTIALS` at the JSON, or ask the user to run `firebase login` once.
    - Update `.firebaserc`.
    - **First admin:** the user signs up on the local site; then a script sets `role: 'admin'` on their `users/{uid}` document with the Admin SDK.
7. **Images before Cloudflare is ready: Cloudinary.**
    - Why it's needed: every upload goes through `/api/media` to R2, so without R2 nothing uploads.
    - When `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` are set, `uploadImage` and `uploadDocument` in `src/services/mediaStorage.ts` upload directly to `https://api.cloudinary.com/v1_1/<cloud>/auto/upload` with the unsigned preset. They return the same `UploadedMedia` shape.
    - Cloudinary URLs already render through `src/lib/cloudinaryUrl.ts`.
    - Deleting a product removes its Firestore document. Cloudinary files stay, because an unsigned preset can't delete; that's fine for demo data.
    - In Step 3, remove these 2 vars and uploads go back to R2.
8. **Add demo content**, so the new look can be judged with realistic products.
    - Write `scripts/seed-demo.mjs`, which uses the Admin SDK:
        - It creates the client's categories, about 12 products (2-3 per category), 3 hero banners, and whatever else each home section needs to show.
        - Find what each section reads in `homeContentService`, `bannerService`, `showcaseService` and `testimonialService`.
        - Copy the product shape from `src/pages/admin/ProductForm.tsx`, so the admin panel can edit and delete the products.
        - Mark every document `demo: true`.
        - `--remove` deletes everything marked `demo: true`.
    - **Images:** generate them with a free AI image service.
        - From the terminal, Pollinations needs no key: `https://image.pollinations.ai/prompt/<prompt>?width=1024&height=1024&nologo=true&seed=<n>`.
        - If the user prefers Puter.js, make a small local HTML page that calls `puter.ai.txt2img`. The user opens it in a browser and signs in to Puter.
        - Write prompts in the client's style, and respect their "avoid" list.
        - Compress each image with sharp to under 500 KB (banners under 1 MB), then upload it to Cloudinary.
    - If products don't appear, remember there is no R2 catalog snapshot yet. The dev proxy returns 404 and the storefront reads Firestore instead.
9. Run the site, check that products show on Home, Products and Product detail, and commit: `Step 0: safe preview`.

## Step 1: new look (for client review)

The layout stays exactly as it is. Only brand, colour, type and motion change.

1. **Business details and brand text**
    - **Create `src/config/brand.ts`** with no imports. It holds:
        - name, shortName, legalName, tagline
        - domain, siteUrl
        - email, phones, whatsapp
        - addressLines, hours, mapEmbedUrl
        - gstin, social links
        - themeStorageKey

      Import it wherever `src/` files hard-code these today.
    - **Replace hard-coded text.** Search case-insensitively for `sreerasthu|sree rasthu|srs-|silver|jewel|kakinada|6304960489|sreerasthusilvers-kkd` until nothing client-facing is left. The known places are:
        - `src/services/siteSettingsService.ts`: `DEFAULT_FOOTER`
        - `src/services/invoiceService.ts`: `SELLER`
        - `src/services/whatsappService.ts`
        - `src/services/geminiService.ts`: rewrite its AI prompts for the client's products
        - `src/data/content.json`, `src/data/defaultHomeCollections.ts`
        - `src/services/categoryService.ts`: `DEFAULT_CATEGORIES`
        - `src/contexts/ThemeContext.tsx`: key `sreerasthu-theme`
        - `src/lib/siteUrl.ts`
        - The policy, auth, About and Contact pages
        - Header, MobileHeader, Footer, LoadingScreen, HeroBanner, FeatureIcons, CollectionBanner, AboutSection, PromoSection, YouTubeShowcase, WhatsAppEnquiryButton, VideoCallRequestModal
    - **Edit the `api/` files in place**, since they can't import `brand.ts`:
        - `api/media.ts`: link-preview title and `og:site_name`
        - `api/whatsapp-send.ts`: the plain-text OTP message
        - `api/send-call-notification.ts`: the fallback caller name
    - **Update site config:**
        - `index.html`: title, meta description, author, canonical URL, `og:*` tags (including the `og:image`), `twitter:site`
        - `public/firebase-messaging-sw.js`: fallback title and the `srs-notification` tag
        - `vercel.json`: point the catalog rewrite at `https://images.<client-domain>/catalog/products.json`
    - **Rewrite the policy pages** with the client's details. Mark assumed legal points `TODO(client)`.
2. **Features the business doesn't need.** Remove them. Where a feature leaves a visible gap, put something relevant to the client in that same spot; otherwise just remove it. Record each choice in `CLIENT.md`.
    - **Silver-rate pricing** (for any business that doesn't sell precious metal):
        - Remove `SilverRateWidget` from `Header.tsx`, and fill its slot with something relevant, e.g. a loyalty-points icon linking to `/wallet`.
        - Remove the `/admin/silver-rate` route and its nav link.
        - Hide the silver-pricing fields in `admin/ProductForm.tsx`.
        - Leave `SilverRateProvider`, `livePricing.ts` and `api/create-order.ts` as they are. Products without `silverPricing.enabled` already use their stored price.
    - **Delivery-partner app:** set `DELIVERY_PARTNERS_ENABLED` in `src/config/features.ts` according to `CLIENT.md`.
    - **Video calls, AI prompt tool, gift cards:** keep, reword or hide, according to `CLIENT.md`. Hide links and routes; don't delete services.
3. **Colours and fonts**
    - Use the client's colours and fonts if given. If they're only described (e.g. "rust copper"), turn them into exact values and show the user a small table before applying.
    - If nothing is given, derive them:
        - Colours: extract the logo's colours with sharp (`sharp(file).stats()`, or resize to 8×8 `.raw()` and read the pixels). Build primary, highlight, background, surface, foreground, muted and border.
        - Fonts: pick a heading font and a body font from Google Fonts that fit the business's feel.
        - Show 2 options, recommend one, and wait for the user's pick.
    - **Check contrast:** body text and button text must be at least 4.5:1. Check with a small node script.
    - **Never use Playfair Display with Poppins** (Sreerasthu's pair), or the colours of earlier clients listed in `CLIENT.md`.
4. **Apply the tokens**
    - **Colour tokens.** In `src/index.css`, set the `:root` and `.dark` tokens as HSL without `hsl()`, e.g. `20 60% 45%`. Besides the shadcn tokens, the file has `--cream`, `--cream-dark`, `--primary-light`, `--primary-dark`, `--shadow-gold` and `--gradient-gold`. Re-point all of them, and fix the header comment.
    - **Highlight token.** Add `--highlight` / `--highlight-foreground` to the CSS and to `tailwind.config.ts`. It replaces the job gold did.
    - **Fonts.** Load them with the Google Fonts `@import` on line 2 of `src/index.css` and set `--font-heading` and `--font-body`. In `tailwind.config.ts`, set `fontFamily`: `heading`, `body`, `sans`, `serif`, and `poppins`. Keep the `poppins` key name but point it at the new body font.
    - **Textures.** If the brief asks for texture or grain, add it as a CSS utility (e.g. an SVG-noise background at low opacity). Don't bake it into images.
5. **Replace hard-coded colours.** New tokens alone won't retheme the site: about 990 `amber-*` classes and 565 hex codes in 47 files hard-code Sreerasthu's look.
    - Use the table in Reference.
    - Keep `red-*` where it means an error, cancellation or delete, and keep status colours such as green for delivered.
    - Do customer-facing files first. The heaviest are `OrderDetailsPage`, `Checkout`, `CustomerSupport`, `MobileOrders`, `SecurityPage`, `Account`, `TestimonialsCarousel` and `Footer`. Then do the admin screens.
6. **Logos.** Generate each size from the client logo with sharp (see Reference).
7. **Loading animation.** `src/components/LoadingScreen.tsx` (framer-motion, uses `public/loading_black.png` and `public/loading_white.png`). Give it an animation that fits the brand. Keep its timing and when it shows.
8. **Check and hand over for review.**
    - Look at every main page at 390px and 1440px, in Light, Dark and System mode.
    - Search again for leftover Sreerasthu text and gold/maroon colours.
    - Commit `Step 1: new look`, and stop for client review.

## Step 2: page-by-page design (no layout change)

Order:
1. Home
2. Products listing
3. Product detail
4. Checkout
5. Profile and its sub-pages
6. The remaining pages: auth, cart, wishlist, orders, policies, search, and so on

Do each page for mobile, tablet and desktop.

For each page:

1. **Read** the page and every component it uses.
2. **List the sections top to bottom** in `CLIENT.md`. With each section, give a one-line design change that keeps its layout. Aim for a modern, world-class result in the client's feel. Get the user's approval.
3. **Build it.** Keep the data hooks, services and handlers; change only the presentation.
4. **Check it:**
    - `npm run build` passes.
    - It looks right at 390px, 768px and 1440px, in Light, Dark and System mode.
    - The page's actions still work: add to cart, wishlist, filters, sorting, coupon, payment.
5. **Commit** `Step 2: <page>` and stop for review.

| Page | Main files | Do not touch |
| --- | --- | --- |
| Home | `src/pages/Index.tsx` (stacks 17 section components) | The section list and order; the admin data sources (home banners, home collections, showcases, testimonials, videos) |
| Products | `src/pages/CategoryPage.tsx`, `ProductCard.tsx`, `MobileProductsGrid.tsx`, `ProductQuickView.tsx`, `ProductPagination.tsx` | `matchesTaxon` in `src/lib/taxonomy.ts`; the filter and sort logic |
| Product detail | `src/pages/ProductDetail.tsx`, `ProductDetailSection.tsx`, `WhatsAppEnquiryButton.tsx` | Price (`liveUnitPrice`), stock checks, reviews |
| Checkout | `src/pages/Checkout.tsx` (3,440 lines), `MobileCart.tsx`, `ShoppingCart.tsx` | Totals, `useCheckoutPricing`, coupons, wallet, GST, shipping, Razorpay calls. Restyle only |
| Profile | `Profile.tsx`, `Account.tsx`, `ProfileEditPage.tsx`, `SavedAddresses.tsx`, `MobileOrders.tsx`, `OrderDetailsPage.tsx`, `PurchaseSummary.tsx` (the `/wallet` page with loyalty tiers), `SecurityPage.tsx`, `BuyAgain.tsx` | Order status logic, cancel and return flows, 2-step verification |
| Wishlist | `src/pages/Wishlist.tsx` | `useWishlist`, `wishlistService` |

## Step 2B: build the client's missing features

Take them from "Build after Step 2" in `CLIENT.md`. For each feature:

1. Plan it: data model, Firestore rules, customer screens, admin screens, and how it hooks into orders or the wallet.
2. Get the user's approval, then build it in the same design as Step 2.
3. There are no free `api/` slots. Put server logic into an existing function (for example as a new `action` in `api/media.ts`), or check with the user before upgrading Vercel.

## Step 3: switch to the client's accounts

See Reference for all env vars.

- **Firebase:** already the client's since Step 0. Now add:
    - The Web Push key (`VITE_FIREBASE_VAPID_KEY`)
    - The OAuth consent screen: name, logo, support email
    - Authorized domains: the real domain and `*.vercel.app`
- **Cloudflare R2:**
    - Fill the `R2_*` and `CLOUDFLARE_*` vars, then remove the 2 `VITE_CLOUDINARY_*` vars so uploads go back to `/api/media`.
    - Use one Cloudflare account per client: the free-tier guard measures the whole account.
    - Serve the bucket from `images.<domain>`, with the r2.dev URL off.
    - The site's own DNS records point to Vercel, with the Cloudflare proxy off.
- **WhatsApp:** Meta app, number, permanent token, app secret, webhook `https://<domain>/api/whatsapp-webhook` (subscribe to `messages`), and the templates in Reference.
- **Razorpay:** test keys first, live keys at launch.
- **Vercel and domain:** paste `.env` into the Vercel env settings, deploy, then add the domain.
- **Real products:**
    - Run `node scripts/seed-demo.mjs --remove` to delete the demo data.
    - The client or admin uploads the real products, banners and categories.
    - Run `node scripts/publish-catalog.mjs` once.
    - Set the owner's WhatsApp alert number in the admin settings.

## Step 4: test, publish, send to the client

Test on the deployed site:
- Sign up, verify the email, reset the password, Google sign-in.
- The WhatsApp OTP for 2-step verification.
- A push notification arrives while the phone is locked.
- Cart and wishlist.
- Coupon, loyalty points and wallet.
- A Razorpay payment.
- The order WhatsApp messages to the customer and the owner, including their buttons.
- Every order status, a return and a cancellation.
- The invoice PDF shows the client's name and GSTIN.
- An image upload lands on `images.<domain>`.
- A shared product link's preview on WhatsApp.
- A customer reply reaches the admin WhatsApp inbox.
- The Step 2B features.

Then publish on the real domain and give the client the link.

## Step 5: client changes, then public launch

- Log each round of client feedback in `CLIENT.md`.
- Apply the changes under the same rules.
- Before going public:
    - Confirm no demo data or `TODO(client)` is left.
    - Switch Razorpay to live keys.
    - Put the Meta app in Live mode, with all templates approved.

## Reference

### Env vars

Everything below is server-only except the `VITE_*` vars.

| Group | Vars |
| --- | --- |
| Firebase | `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`, `VITE_FIREBASE_VAPID_KEY`, `FIREBASE_ADMIN_SDK_BASE64`, `ADMIN_NOTIFICATION_KEY` (a random string) |
| Cloudinary (until R2) | `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` (an unsigned preset) |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (`https://images.<domain>`), `R2_BILLING_CYCLE_DAY`, `CLOUDFLARE_ANALYTICS_TOKEN` (Account Analytics Read + Zone Cache Purge), `CLOUDFLARE_ZONE_ID` |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WABA_ID` (templates), `WHATSAPP_OTP_TEMPLATE=otp_login`, `WHATSAPP_OTP_LANG=en`; optional `WHATSAPP_APP_ID` (picture templates) |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID` |
| Other | `VITE_SITE_URL`, optional `GEMINI_API_KEY`, optional `VITE_METERED_TURN_*` |

### WhatsApp templates

Create every template with language **English (`en`)**, and set button URLs to the client domain. A deleted template name can't be reused for 4 weeks.

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

### Hard-coded Sreerasthu colours

| Value | Count | Replace with |
| --- | --- | --- |
| `#d4af37` (gold) | 129 | `highlight` |
| `#F5EFE6`, `#FFF9E6` (cream) | 67 | `cream` or `secondary` |
| `#832729` (maroon) | 40 | `primary` |
| `#e8c56a` (light gold) | 21 | `highlight/70` |
| `amber-*`, `yellow-*`, `stone-*`, `rose-*` | about 1,200 | `highlight`, `primary`, `cream` or `muted`, by role |

### Logo and image files

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

### CLIENT.md template

```markdown
# Client: <business name>

## Brief
- Business: <what they are>
- Products: <product types>
- Customers: <who buys, where>
- Style: <keywords>
- Colours: <names/hex>   Fonts: <given or "choose">
- Texture / imagery: <notes>
- Visual feel: <one line>
- Avoid: <list>
- Must not look like: Sreerasthu Silvers (maroon/gold, Playfair + Poppins), <earlier clients>

## Business details
- Legal name / GSTIN:
- Address, phone, email, WhatsApp, hours:
- Domain, social links:
- Categories: <main → sub>

## Features
- Already in the code and kept: <list>
- Removed or replaced (and what went in its place): <list>
- Build after Step 2: <features the client wants that don't exist yet>

## Accounts
- Firebase: <project id>, status
- Images: Cloudinary <cloud> (temporary) → Cloudflare R2
- WhatsApp / Razorpay / Vercel / domain: status

## Design decisions
- Colours (light / dark):
- Fonts:
- Per page: <page → sections and the design change for each>

## Progress
- [ ] Step 0 safe preview   - [ ] Step 1 new look (client OK?)
- [ ] Step 2: Home, Products, Product detail, Checkout, Profile, remaining pages
- [ ] Step 2B features   - [ ] Step 3 accounts   - [ ] Step 4 test and publish   - [ ] Step 5 client changes

## Next step
<one line: exactly where the next session starts>

## Open questions
- <question> (blocking / not blocking)
```

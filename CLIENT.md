# Client: Ishaputra Botanicals

## Brief
- Business: premium men's Ayurveda and botanical wellness brand
- Products: energy, personal care, hair care, skin care, herbal/Ayurvedic products
- Customers: men in India (TODO(client): age range, cities, online-only or also retail)
- Style: premium, masculine, earthy, contemporary
- Colours: black, charcoal grey, rust copper, white/cream (exact values chosen in Step 1)
- Fonts: bold modern sans-serif headings + clean readable sans-serif body (exact fonts chosen in Step 1)
- Texture / imagery: subtle botanical/natural textures, premium product photography, soft grain
- Visual feel: luxury men's wellness + modern botanical science
- Avoid: generic Ayurveda look, excessive leaves, mandalas, orange gradients, yoga imagery
- Themes: Light + Dark + System. Mobile first, then tablet and desktop.
- Must not look like: Sreerasthu Silvers (maroon/gold, Playfair Display + Poppins, framed luxury hero)
- Layout: keep Sreerasthu's layouts exactly; change only the design (see CLAUDE.md)

## Business details
- Brand name: Ishaputra Botanicals. Tagline (from the logo): "Pure wellness for a stronger you"
- Location: **Hyderabad** (confirmed by the user, 2026-09-27). State Telangana (code 36) is set for invoices.
- Everything else in `src/config/brand.ts` is **dummy data**, as the user asked, and must be replaced before launch:
    - Address: Road No. 12, Banjara Hills, Hyderabad 500034
    - Phone: +91 98765 43210
    - Email: hello@ishaputra.com
    - Hours: Mon–Sat 10–7
    - Domain: ishaputra.com
    - Map: a city-level embed of Banjara Hills
- Deliberately left empty (hidden on the site):
    - WhatsApp: the Enquire button would message whoever owns a dummy number
    - GSTIN: a made-up number must never print on an invoice
    - Social links
- Legal name: TODO(client)
- Categories (a first guess, confirm with the client; in `DEFAULT_CATEGORIES` and seeded to Firestore):
    - Energy & Vitality → Capsules, Powders, Shilajit
    - Hair Care → Hair Oils, Shampoos, Hair Serums
    - Skin Care → Face Wash, Face Serums, Moisturisers
    - Personal Care → Body Wash, Deodorants, Beard Care
    - Ayurvedic Essentials → Churnas, Herbal Teas, Immunity

## Logo
- **Master file: `client-assets/logo-transparent.png`** (1975 × 796, transparent, added by the user 2026-09-23). A clean cut-out: bronze-gold metallic "ISHAPUTRA" wordmark, an I/S monogram with a profile face, and the tagline "Pure wellness for a stronger you". It reads well on both cream and black, so one file serves Light and Dark mode.
- Mockups on textured black (not for the site): `client-assets/logo-original-16k.png` and `logo-mockup-16k-v2.png` (both git-ignored), plus `logo-preview-1200.png`.
- The logo metal reads bronze/antique gold, while the brief says rust copper. Step 1 picks a copper accent that sits well next to it.
- Step 1 generates every logo file in `public/` and `src/assets/dark.png` from the master (see Reference in CLAUDE.md). The monogram alone (the I/S with the face) makes the favicon and the 192px push icon.

## Features
- Already in the code and kept: shop, product detail, cart, checkout, wishlist, account, coupons, wallet with loyalty points and tiers (`/wallet`, `PurchaseSummary.tsx`), cashback (wallet transaction type), gift cards, Light/Dark/System themes.
- Removed or replaced in Step 1 (user decision, 2026-09-23):
    - Silver-rate widget in the header → a loyalty-points icon linking to `/wallet`. Remove the silver-rate admin page and the silver-weight pricing fields on the product form.
    - Delivery-partner app → off (`DELIVERY_PARTNERS_ENABLED = false`); assume courier shipping.
    - Video-call shopping → reworded as "video consultation with an expert" (user may still ask to remove it).
    - Gift cards and the admin AI prompt tool → kept; rewrite the AI prompts for Ishaputra's products.
- Build after Step 2: Scratch & Win, Dealer Membership, Loyalty Card (TODO(client): a digital tier card on `/wallet`, or a separate card?). Business rules are open questions below.

## Rewards (Task 8)
Loyalty points and wallet cashback, built in Step 2B and merged into `main` on 2026-10-03. The rules are in `src/lib/rewards.ts`; `docs/HANDOFF.md` explains how they work.

- **Vercel needs `FIREBASE_ADMIN_SDK_BASE64`.** The payment functions use it to record payments and rewards. Without it, every paid order is saved as "payment pending, needs review", and the shop has to confirm each one by hand.
- **The `payments` collection.**
    - `payments/<Razorpay order id>` is the server's record of a payment: who paid, the amount, and the points and cashback spent.
    - Only `api/verify-payment.ts` writes it, with the Admin SDK. Customers can read their own records; admins can read all of them.
    - A customer can save an order as paid only when this record exists in their name.
- **Reservations and holds.**
    - At checkout, the server reserves the points and cashback the customer chose. After the payment, they are spent for good.
    - If the customer closes the payment window, the reservation is released at once (the server asks Razorpay first).
    - A checkout that is never paid is released after 30 minutes. The release runs the next time that customer's rewards load, for example on `/wallet` or at checkout.
    - If a payment arrives after its reservation was released, the points are spent again and the order is flagged for review ("rewards late").
- **"Check payment & rewards" (admin order page).** It asks Razorpay about the payment, records it if it went through, and brings the order's points and cashback in line with its status. Press it before packing any order marked "payment not confirmed" or "needs manual review".
- **Return window (review result B, decided 2026-10-03).** The owner chose both fixes:
    - The security rules refuse a customer's return request more than 7 days after delivery, or when the order has no delivery time. This is deployed to `ishaputrabotanicals`, and `docs/handoff/hardening-check.mjs` tests it.
    - The admin order page shows a red notice above Approve / Reject when a return came after the window, or its timing can't be checked.
    - The shop can still record a return by hand from the admin panel.
- **Known limits.**
    - A customer could still save an order whose items differ from the ones paid for. The admin payment check compares the cart and the amount with the payment record, and flags a mismatch.
    - The real fix is to create orders on the server. That is a bigger change and is not started.
    - Keep "Days until points unlock" (Admin > Commerce settings) at 7 or more. Points that unlock before the return window closes could be spent and then voided by a return.
    - Review result C, low risk, no action: someone who learned another customer's Razorpay order id could create that order first and block it. These ids can't be guessed.

## Accounts
- Firebase: project `ishaputrabotanicals`.
    - Web config, VAPID key and service account are in `.env`. The service-account JSON is in the project folder, git-ignored.
    - Firestore (asia-south1) created and Email/Password + Google sign-in enabled by the user.
    - Security rules deployed 2026-09-23 with the Admin SDK. The Firebase CLI on this PC is logged in as the Sreerasthu account, so `firebase deploy` can't reach this project.
    - All 12 indexes in `firestore.indexes.json` created by the user in the console (2026-09-23). The service account has no index permission, so future index changes are made in the console; `scripts/` can print create-links.
    - Admin: `admin@ishaputra.com` (created in the console; profile + admin role + verified email set by `scripts/make-admin.mjs` and the Admin SDK).
- Images: Cloudinary `dcoimqij`, unsigned preset `levelupingup`, until Cloudflare R2 is set up (`VITE_MEDIA_PROVIDER=cloudinary`). Uploads go to the folder `ishaputrabotanicals/<category>`.
- WhatsApp, Razorpay, Vercel, domain: not started (Step 3).

## Decisions log
- 2026-09-23: The user reverted an earlier session's Step 0 because the site showed nothing. The cause was the new Firebase having no security rules (every read denied) and no indexes; the code was fine. Step 0 was redone from scratch.
- 2026-09-23: `firestore.indexes.json` listed only 5 of Sreerasthu's 10 live indexes (the rest were created by hand in their console). Merged the live list in, so the file now holds all 12 the code needs.
- 2026-09-23: While on Cloudinary, the storefront reads products straight from Firestore. The R2 catalog snapshot, its refresh and the R2 usage popup are skipped. Deleting a product leaves its Cloudinary file behind (an unsigned preset can't delete).
- 2026-09-23: Removed the `vercel.json` rewrite that served Sreerasthu's `catalog/products.json`. Add it back with `images.<ishaputra-domain>` when moving to R2.
- 2026-09-23: Demo content comes from `scripts/seed-demo.mjs` with data in `scripts/demo/content.mjs`.
    - It writes 12 products, 3 hero banners, 3 showcases, 5 collection cards, 1 wide banner and 3 placeholder testimonials, all marked `demo: true`.
    - Images (2026-09-27): **real Pexels photos**, because the user disliked the AI images. Pexels licence: free for commercial use, no attribution required.
        - They are set per item in the "Real photos" section of `scripts/demo/content.mjs`, cropped to each slot by the seed script, and uploaded to Cloudinary.
        - URLs are cached in `scripts/demo/images.json`; sources are listed in `scripts/demo/credits.json`.
        - The same photos serve the About, Contact and Wishlist pages, the collection-banner fallback and the default collection cards.
        - Photos were rejected for visible brand logos (a gym-vest logo, an essential-oil label, Tom Ford, Calvin Klein, The Man Company) and for the generic Ayurveda look (a bright turmeric flat lay).
        - Items without `photo` fall back to Pollinations AI generation.
    - Remove everything with `node scripts/seed-demo.mjs --remove` before launch.
    - The AI product photos have made-up label text. Replace them with real photos in Step 3.
- 2026-09-23: Security fix: `api/send-notification.ts` and `api/whatsapp-send.ts` now refuse requests when `ADMIN_NOTIFICATION_KEY` is unset, and compare the key in constant time. Still to do in Step 3, when WhatsApp is connected:
    - Order templates in `whatsapp-send` can be sent by anyone to any number.
    - OTP sends have no per-phone rate limit.
- 2026-09-23: The YouTube section stays hidden until the client has videos.

- 2026-09-27 (Step 1):
    - Business details live in `src/config/brand.ts`. Empty fields are hidden on the site (footer, contact, invoice, policies), never shown as placeholders.
    - Deleted 13 unused components (`AboutSection`, `HeroCarousel`, `LuxurySofaSection`, `ProductDetailSection`...), unused `src/data/content.json`, and 40 unused jewellery images.
    - Leftover unused jewellery images in `src/assets/` were deleted once the user asked to "complete remaining things" (2026-09-27).
    - `SILVER_PRICING_ENABLED = false` in `src/config/features.ts` hides the silver-rate widget, `/admin/silver-rate` and the product-form calculator. The headers show `LoyaltyPointsButton` (links to `/wallet`) instead.
    - Bare `/products` now lists the whole catalogue (it used to say "Category not found"; Sreerasthu's own links hit this too).
    - The mobile Categories page now reads the store's Firestore categories instead of a hard-coded jewellery list.
    - About page rewritten: the fake team became "What We Stand For" and the fake testimonial became the brand promise. Its images now use Cloudinary URLs; the old `/src/assets/...` paths broke in production.
    - Logo files, favicon, push icon, OG image and the empty-cart illustration all come from `node scripts/build-logo-assets.mjs`.
    - The admin AI prompt tool (`src/services/geminiService.ts` + `AdminImagePrompts.tsx`) was rewritten for men's wellness (2026-09-27): packaging fidelity, Indian male models, natural product use, brand palette, the brief's "avoid" list. It still needs `GEMINI_API_KEY` to run.

## Design decisions
- Colours, light mode:
    - Background: cream `#F6F2EB`
    - Primary: rust copper `#A4532C`
    - Highlight: bronze `#8C6834` (deep enough for small text)
    - Highlight soft: `#C9A266`, for text on dark bands
    - Charcoal bands: `#1B1A18`
- Colours, dark mode:
    - Background: near-black `#0E0D0C`
    - Primary: copper `#C97542`
    - Highlight: bronze `#C9A266`
- Every text pair passes WCAG AA (checked with a script).
- Fonts: **Archivo** headings at 112% width (`--font-heading-stretch`) and **Manrope** body. All 262 inline font styles now use `var(--font-heading)` / `var(--font-body)`.
- Texture: a subtle film-grain overlay (`body::after`, `--grain-opacity`).
- Logo: the deep-bronze version (brightness 0.72) on light backgrounds, the original on dark. The favicon and app icons use the monogram.
- Loading screen (mobile only): the monogram is revealed bottom-up with a copper light sweep, the tagline settles in, and a copper progress line runs underneath. It respects reduced motion.
- Step 2 design language, "the modern apothecary" (all in the Ishaputra block at the end of `src/index.css`, no image files):
    - **Surfaces:**
        - `tx-paper`: cream paper with mottling and fibres, the page background.
        - `tx-sheet`: a lighter sheet for panels.
        - `tx-slate`: charcoal stone for dark bands (Featured, marquee, testimonials, footer, feature icons).
        - `tx-contour`: faint topographic rings, used in place of leaves or mandalas.
        - In dark mode, paper turns into soft slate.
    - **Shapes:** panels 18px, cards 12px, buttons 6px (squared-off, masculine). Round is kept only for icon buttons.
    - **Numbered eyebrows:** "01 Top deals" through "10 Watch" run down the home page (`eyebrow-no`, plus `eyebrow-center` and `on-dark`).
    - **Buttons:**
        - `btn-copper`: the main call to action, tracked caps with a foil sweep on hover.
        - `btn-line`: the outline version, used on photos.
        - `link-arrow`: "View all" links.
    - **Cards:** `card-product` lifts and gains a copper edge on hover. `tile-img` is a lit plinth, so mixed product photos sit together. Prices use `price-now`, `price-was` and `chip-off`. Labels on photos use `tag-dark` ("No. 01", "New").
    - **Home:**
        - The hero is full-bleed with no frame.
        - The marquee alternates solid and hollow copper type.
        - The footer ends with a hollow "ISHAPUTRA" wordmark.
        - The collection banner now shows apothecary vials, replacing the spice bowls (Pexels 7978130).
    - **Products page:**
        - Big title band on paper with a product count.
        - Filters in a panel; the selected filter has a copper rule.
        - Hairline "Add to cart" buttons.
        - The price filter uses wellness price bands (Under ₹400 up to Above ₹2,000). They now live in `BRAND.priceRanges`; the old bands were jewellery ones (Under ₹5,000 up to Above ₹1,00,000).
    - **Product page:**
        - Gallery on a plinth with a "01 / 04" counter.
        - Category eyebrow and a large heading-font title.
        - Every specification shows as a spec sheet (net quantity, key ingredients, how to use).
        - Copper "Buy now", which fixes the low-contrast black button in dark mode.
        - "Read more" link, which replaces the blue "more".
        - Squared trust badges and review cards.
    - **Checkout (mobile and desktop, cart drawer):**
        - Paper background with sheet cards; copper stepper, totals and savings. Replaces the green stepper and totals, blue links and blue-to-purple button.
        - Copper "Proceed to checkout" and "Place order" buttons. The old buttons were black, and white in dark mode.
        - Slide-to-pay is a charcoal-stone track with a copper handle.
        - The GST line now follows Admin > Commerce settings: it shows only when GST is on and "show GST line" is on. It used to print "GST (3%) ₹0.00" even with GST off, and 3% is the jewellery rate.
        - Cart and wishlist browser storage keys are now per store (`BRAND.storageKeys`); they were still `sree_rasthu_*`.
    - **Account, login and profile:**
        - The mobile account page opens with a charcoal-stone member card (monogram initial or photo, "Ishaputra member"). It replaces the pink ticket.
        - The desktop sidebar and panels use the sheet style; the selected menu item has a copper rule.
        - A new "Wallet & Rewards" menu item links to `/wallet` (loyalty points and cashback). It wasn't reachable from the account menus.
        - Login, signup and profile-edit use paper, sheet cards and small-caps labels, with copper buttons. Signup's Terms and Privacy links pointed to pages that don't exist; fixed.
        - `/profile` was a static mock-up that nothing linked to: no working buttons, "Venkat Plus", a hard-coded offer. It now redirects to `/account`, and the mock page is removed.
    - **Remaining pages** (wishlist, orders, order details, cancel, addresses, wallet, security, support, video calls, buy again, search, categories, reviews, password and email pages, policies, 404):
        - Paper background with sheet cards.
        - Neutrals, blues and greens mapped to brand tokens. Order-status colours (green delivered, red cancelled, purple returns) are kept.
        - Empty states use a charcoal icon tile with copper buttons. This replaces the pink heart and gray "Tanishq style" drawing on the wishlist.
    - **Wallet (`/wallet`):**
        - The loyalty tier is now a charcoal-stone card: metal-toned tier badges, copper top tier, and each tier's threshold shown under it.
        - Tiers now live in `BRAND.loyaltyTiers`, with DUMMY wellness-sized thresholds (₹0 / ₹5,000 / ₹15,000 / ₹30,000). The jewellery store's started at ₹50,000.
        - "Total investment" is renamed "Total spent".
        - Its "View all" link went to `/orders`, which doesn't exist; fixed.
    - **Customer support:** WhatsApp no longer falls back to the phone number. The option shows only once a WhatsApp number is set in Admin > Customer support.
    - **Policy pages:** charcoal header band and sheet card. The privacy policy's sections 2 and 3 were numbered the wrong way round.
- Not screenshot-checked yet (need a real order): order details and cancel order. Their colours were mapped with the rest.
- Preview test account for screenshots: `preview-shopper@ishaputra.test`, created through the site's signup with one dummy Hyderabad address and items in its cart. The password is kept outside the repo. **Delete it in Firebase Authentication (and its `users`/`carts` docs) before launch.**

## Progress
- [x] Step 0 safe preview (2026-09-23): home, products and product pages show demo content on Ishaputra Firebase; only the YouTube section is hidden (no videos yet)
- [ ] Step 1 new look: done 2026-09-27, waiting for client review
- [x] Step 2 design (2026-09-29): Home, Products, Product detail, Checkout, Profile and the remaining pages; waiting for client review
- [ ] Step 2B features: rewards (points and cashback) merged 2026-10-03; Scratch & Win, Dealer Membership and the loyalty card still to build
- [ ] Step 3 accounts   - [ ] Step 4 test and publish   - [ ] Step 5 client changes

## Next step
The world-class UI/UX pass across the whole site (the owner's top priority, 2026-10-03): audit, then fix area by area with screenshots, keeping every layout. Then the rest of Step 2B, which needs the open loyalty and cashback answers below.

## Open questions
- Real business details to replace the dummy ones in `src/config/brand.ts`: legal name, address, phone, WhatsApp, email, hours, GSTIN, domain, social links (blocking for launch, not for review)
- GST: which rate(s) apply (Ayurvedic medicines and cosmetics differ), are prices GST-inclusive, and should the GST line show at checkout? Set in Admin > Commerce settings; GST is off until then (blocking for launch, not for review)
- Vector (SVG/AI) logo file? A transparent PNG is in; a vector would give a sharper favicon (not blocking)
- Category tree correct? (not blocking)
- Loyalty card: a digital tier card or a physical/QR card? (Step 2B)
- Scratch & Win: when a card is earned, prizes (points, coupon, cashback), odds, daily limit (Step 2B)
- Dealer membership: dealer pricing (separate price or % off), how dealers apply and get approved, minimum order, dealer-only products (Step 2B)
- Loyalty tiers: names and spend thresholds (dummy now: Silver ₹0, Gold ₹5,000, Platinum ₹15,000, Premium ₹30,000 in `BRAND.loyaltyTiers`), and what each tier gets (Step 2B)
- Cashback and loyalty points rules: earn rate, value per point, expiry, caps (Step 2B, before touching the wallet)

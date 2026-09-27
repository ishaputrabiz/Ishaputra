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
- Per page: Step 2.
    - Noted for Step 2: the copper marquee band is bold in dark mode; the product page's "more" link is still blue; the black "Buy" button is low-contrast in dark mode; product specifications (net quantity, ingredients) don't show on the product page yet.

## Progress
- [x] Step 0 safe preview (2026-09-23): home, products and product pages show demo content on Ishaputra Firebase; only the YouTube section is hidden (no videos yet)
- [ ] Step 1 new look: done 2026-09-27, waiting for client review
- [ ] Step 2: Home, Products, Product detail, Checkout, Profile, remaining pages
- [ ] Step 2B features   - [ ] Step 3 accounts   - [ ] Step 4 test and publish   - [ ] Step 5 client changes

## Next step
Client reviews the Step 1 look (light and dark, mobile and desktop). After their OK: Step 2, starting with the Home page.

## Open questions
- Real business details to replace the dummy ones in `src/config/brand.ts`: legal name, address, phone, WhatsApp, email, hours, GSTIN, domain, social links (blocking for launch, not for review)
- Vector (SVG/AI) logo file? A transparent PNG is in; a vector would give a sharper favicon (not blocking)
- Category tree correct? (not blocking)
- Loyalty card: a digital tier card or a physical/QR card? (Step 2B)
- Scratch & Win: when a card is earned, prizes (points, coupon, cashback), odds, daily limit (Step 2B)
- Dealer membership: dealer pricing (separate price or % off), how dealers apply and get approved, minimum order, dealer-only products (Step 2B)
- Cashback and loyalty points rules: earn rate, value per point, expiry, caps (Step 2B, before touching the wallet)

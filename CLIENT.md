# Client: Ishaputra Botanicals

## Business
- Sells: premium men's Ayurveda and botanical wellness products (energy, personal care, hair care, skin care, herbal/Ayurvedic) to men in India
- Tagline (from the logo): "Pure wellness for a stronger you"
- Legal name / GSTIN: TODO(client)
- Address, phone, email, WhatsApp, hours: TODO(client)
- Domain: TODO(client)
- Social links: TODO(client)
- Categories (seeded from `DEFAULT_CATEGORIES`, editable in admin):
  - Energy & Vitality → Capsules, Powders, Shilajit
  - Hair Care → Hair Oils, Shampoos, Hair Serums
  - Skin Care → Face Wash, Face Serums, Moisturisers
  - Personal Care → Body Wash, Deodorants, Beard Care
  - Ayurvedic Essentials → Churnas, Herbal Teas, Immunity

## Brand
- Logo: `client-assets/logo-original-16k.png` (15360 × 8640, not in git) and `client-assets/logo-preview-1200.png`. It is a rendered mockup: copper/bronze serif "ISHAPUTRA" wordmark, an "I/S" monogram with a profile face, and the tagline on textured black. **No transparent version exists yet**: make light and dark versions in Phase 2 (or ask the client for the vector file).
- Style: premium, masculine, earthy, contemporary. Luxury men's wellness + modern botanical science.
- Colours (given): black, charcoal grey, rust copper, white/cream. Exact hex values are picked in Phase 2 from the logo's copper.
- Texture: subtle botanical/natural textures, premium product photography, soft grain.
- Fonts (given as a direction): bold modern sans-serif headings + clean readable sans-serif body. Exact fonts are picked in Phase 2.
- Themes: light + dark + system (already supported by `ThemeContext`).
- Responsive: mobile first, then tablet and desktop.
- Avoid: generic Ayurveda look, lots of leaves, mandalas, orange gradients, yoga imagery.
- Must not look like: Sreerasthu Silvers (maroon/gold, Playfair Display + Poppins, centred luxury hero, gold dividers).

## Features
- Keep: shop, product detail, cart, checkout, wishlist, account, coupons (exists), wallet (exists, used for cashback).
- **New, not in the Sreerasthu code:** loyalty points, loyalty card, scratch & win, cashback, dealer membership. Their business rules are Open questions below.
- Delivery-partner app: off (`DELIVERY_PARTNERS_ENABLED = false`)
- Video calls: TODO(client)
- Gift cards: TODO(client)
- Silver-rate pricing: off. Remove the widget and admin page in Phase 1.
- AI prompt tool (Gemini): TODO(client)

## Accounts and env
- Firebase: project `ishaputrabotanicals`; web config is in `.env`.
    - Still to do in the console (by the user): create the Firestore database, enable Auth providers, deploy rules and indexes, create the first admin.
    - The Firebase CLI on this PC is logged in as the Sreerasthu account, which cannot see this project.
    - VAPID key and service account: not yet provided.
- Images: **Cloudinary for now** (`VITE_MEDIA_PROVIDER=cloudinary`, cloud `dcoimqij`, unsigned preset `levelupingup`). Cloudflare R2 comes later.
- WhatsApp: not started.
- Razorpay: not started.
- Vercel + domain: not started.

## Decisions log
- 2026-09-23: Temporary image storage is Cloudinary. The `VITE_MEDIA_PROVIDER=cloudinary` switch (`src/lib/mediaProvider.ts`) does four things:
    - Uploads go straight from the browser to Cloudinary.
    - The storefront reads products from Firestore (no R2 catalog snapshot).
    - The catalog refresh and the R2 usage popup are skipped.
    - Deleting a product can't delete its Cloudinary file (unsigned preset); the file is simply left behind.

  Switching to R2 later means: set the `R2_*` vars and `VITE_MEDIA_PROVIDER=r2`, re-add the `/catalog/products.json` rewrite in `vercel.json` with the client's image domain, then run `node scripts/publish-catalog.mjs`.
- 2026-09-23: Removed the `vercel.json` rewrite that sent `/catalog/products.json` to Sreerasthu's image domain; on Vercel it would have shown Sreerasthu's products.
- 2026-09-23: AI images come from Pollinations (free, no key). Puter.js only runs in a browser, so it can't be used from scripts.
    - Pollinations adds a watermark; the bottom 56px is cropped off.
    - Generator script and prompts: `client-assets/generated/generate-products.mjs`.
    - Cleaned images: `client-assets/generated/products-clean/`. Their Cloudinary URLs: `client-assets/generated/cloudinary-urls.json`.
- 2026-09-23: Sample catalog: 10 products in `src/data/sampleProducts.ts`, all marked `isSample: true`. Admin → Products has one button that switches between "Add sample products" and "Remove sample products (N)". Each sample can also be edited or deleted individually.
    - The placeholder photos have fake AI lettering on the labels. Replace them with real product photos before launch.
- 2026-09-23: Security fix, found by an automated review. `api/send-notification.ts` and `api/whatsapp-send.ts` used to skip the admin-key check entirely when `ADMIN_NOTIFICATION_KEY` was unset, so anyone could push to all customers or send any WhatsApp text. Both now refuse when the key is missing and compare it in constant time. **Still open (Phase 4, when WhatsApp is connected):**
    - The 15 order templates in `whatsapp-send` are public, so anyone can send them to any number at the store's cost. Require a Firebase ID token and check that `to` is that order's customer or the admin number.
    - OTP sends have no per-phone rate limit. Add Firestore counters, e.g. 3 an hour and 10 a day.
- 2026-09-23: New features (loyalty, scratch & win, cashback, dealer) will be built when their pages come up in Phase 3, not as a separate layer, so each is designed and built once.

## Progress
- [x] Phase 0: clean-up (secrets, `.env.local`, `dist/`, Sreerasthu data and scripts, 66 unused pages). Also done: new `.env`, Cloudinary switch, categories, sample products.
- [ ] Phase 1: brand text (blocked on business details for the footer, policies and invoice; the brand name and tagline are known)
- [ ] Phase 2: theme
- [ ] Phase 3: shell, home, products, product detail, wishlist; then the new features with checkout and profile
- [ ] Phase 4: integrations and launch test

## Next step
The user completes the Firebase console steps and sends the business details. Then do Phase 1 (brand text, remove silver-rate UI) and Phase 2 (theme from the logo's copper + black/charcoal/cream).

## Open questions
- Business details: legal name, address, phone, email, WhatsApp, hours, GSTIN, domain, social links (blocking for Phase 1 footer, invoice and policies)
- Transparent/vector logo file? (not blocking: we can cut one from the mockup)
- Loyalty points: points earned per ₹100, value of 1 point, expiry, the maximum share of an order that points can pay (not blocking until Phase 3)
- Loyalty card: a digital membership card with tiers (e.g. Silver/Gold/Black by yearly spend), or a card number/QR for use in a physical store?
- Scratch & win: when a card is earned (every order? above ₹X?), which prizes (points, coupon, cashback), how often people win, and a daily limit
- Cashback: % per order, credited to the wallet after delivery? Any cap?
- Dealer membership: how dealers get lower prices (a separate dealer price per product, or a flat % off), how they apply (GST certificate + admin approval), minimum order, whether some products are dealer-only
- Video calls, gift cards, AI prompt tool: keep or hide?

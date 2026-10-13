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
    - Email: hello@ishaputra.in
    - Hours: Mon to Sat, 10 am to 7 pm
    - Domain: ishaputra.in
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
- Dealer Membership and Loyalty card: merged into `main` 2026-10-05 after a passing live test; shipped **off** (see "Dealer Membership and Loyalty card" below). Every value is a placeholder.
- Scratch & Win: built 2026-10-04, money-reviewed and live-tested 2026-10-05, merged into `main`; shipped **off** (see "Scratch & Win" below). Its rules are deployed.

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

## Scratch & Win
Built 2026-10-04 on branch `scratch-win` (not merged yet). Spec: `docs/superpowers/specs/2026-10-04-scratch-win-design.md`. Shipped **off**; every value is a placeholder.

- **What the customer gets.** One scratch card for each online order that is delivered, when the amount paid online is at least the minimum. The card shows on `/wallet` ("Scratch cards"), with a copper dot on the header Rewards icon and a line on the order page while it waits.
- **Prizes are loyalty points** in admin-set sizes and weights, or "better luck next time". The server draws the prize when the card is scratched, never the browser.
- **Won points follow their order**, exactly like the points earned on it: pending until the order's unlock date, frozen while a return is open, taken back if the order is cancelled, returned or refunded. An unscratched card is cancelled if its order ends.
- **Cards expire** a set number of days after delivery. Turning the feature off stops new cards; cards already given can still be scratched until they expire. New cards also need loyalty rewards on (Rewards tab).
- **Settings:** Admin > Commerce settings > Scratch & Win. It shows the average cost per card, the biggest prize and its odds, and has a "Preview card" that gives nothing.
- **Before switching it on:** the new `scratchCards` security rule must be deployed (`node docs/handoff/deploy-rules.mjs`, needs the owner's OK). Until then customers can't read their cards.
- **Data:** `users/<uid>/scratchCards/<Razorpay order id>` (only the server writes it) and the prize as `rewardLedger/scratch_<Razorpay order id>`.
- **Not in this version:** coupon or cashback prizes, push notifications, admin counts of cards given and scratched, cash-on-delivery orders.

## Dealer Membership and Loyalty card
Built 2026-10-05 and merged into `main` the same day after the rules deploy and a passing live test. Spec: `docs/superpowers/specs/2026-10-05-dealer-loyalty-design.md`. The dealer programme ships **off**; every value is a placeholder.

**Loyalty card**
- **What the customer gets.** A digital member card at the top of `/wallet` and on the phone account page: tier, member number, name, "Member since" and points. Under it, a progress bar and the four tier steps with their spend thresholds and points multipliers. No QR code and no physical card.
- **Member number.** `IB` and 12 digits, worked out from the customer's account. Nothing is stored. It is a support reference, not a login.
- **What sets the tier.** The money the customer paid online on orders that are now **delivered**. Returned or cancelled orders stop counting. Dealer-priced orders don't count. It is worked out from the server's payment records, so it can't be faked.
- **What the tier gives.** A points multiplier. It applies to the points earned when an order is delivered, using the tier from the customer's other delivered orders. Scratch & Win prizes are not multiplied. The history shows "Gold 1.25x" (for example) on earned points.
- **Settings:** Admin > Commerce settings > Rewards > "Loyalty tiers": a name, "spend from" and multiplier for each of the 4 tiers. Admin > Customers > one customer shows the member number, tier and progress.

**Dealer membership**
- **Applying.** A signed-in customer applies on `/dealer` (business name and type, contact name, phone, city, state, optional GSTIN, optional message). They see their application's state there: pending (they can withdraw), approved, rejected (with the team's note, and they can apply again) or suspended. A customer can't approve themselves.
- **Reviewing.** Admin > Dealers (the nav item shows the number waiting): filter by status, search by name, phone or GSTIN, open an application, add a note for the applicant, then Approve, Reject, Suspend or Reinstate.
- **Dealer prices.** Approved dealers see a dealer price (regular price struck, "Dealer −N%") on product cards, search, wishlist and the product page, while the programme is on. At checkout, dealer prices apply when the cart is worth at least the minimum **at regular prices**. Below it they are charged regular prices and see how much more to add. The server works out and charges the dealer price, so changing the browser can't get it.
- **No stacking.** A dealer-priced order takes no coupon, points or cashback, earns no points and gets no scratch card. Delivery and GST are worked out as usual. An order below the minimum is a normal retail order in every way.
- **Invoices.** A dealer-priced order prints the dealer's business name and GSTIN (when they gave one) in the buyer block. On the admin order page it shows a "Dealer order" chip and the dealer saving.
- **Privacy.** Dealer prices can be read only by admins and approved dealers. The apply page doesn't show the percentage.
- **Settings:** Admin > Commerce settings > Dealers: the on/off switch, the dealer discount (%) and "Dealer prices from" (₹). Per product, an optional "Dealer price (₹)" in the product form; blank uses the store-wide discount. Switching the programme off hides `/dealer` from customers with no application and stops dealer prices; approved dealers keep their status.
- **Security rules:** the `dealers` and `dealerPricing` rules are deployed (2026-10-05, ruleset `61bbb448-…`), so it can be switched on once the client confirms the values.
- **Data:** `dealers/<account id>` (the application), `siteSettings/dealer` (public: switch and minimum), `dealerPricing/current` (private: discount and per-product prices), `siteSettings/rewards` (the tiers), and `payments/<Razorpay order id>` marks a dealer-priced order.
- **Not in this version:** dealer-only products, per-dealer levels, credit terms (dealers pay online like everyone else), email or WhatsApp notices about applications, quantity price breaks, a physical or QR card, searching customers by member number.

## Accounts
- Firebase: project `ishaputrabotanicals`.
    - Web config, VAPID key and service account are in `.env`. The service-account JSON is in the project folder, git-ignored.
    - Firestore (asia-south1) created and Email/Password + Google sign-in enabled by the user.
    - Security rules deployed 2026-09-23 with the Admin SDK. The Firebase CLI on this PC is logged in as the Sreerasthu account, so `firebase deploy` can't reach this project.
    - All 12 indexes in `firestore.indexes.json` created by the user in the console (2026-09-23). The service account has no index permission, so future index changes are made in the console; `scripts/` can print create-links.
    - Admin: `admin@ishaputra.com` (created in the console; profile + admin role + verified email set by `scripts/make-admin.mjs` and the Admin SDK).
- Images: Cloudinary `dcoimqij`, unsigned preset `levelupingup`, until Cloudflare R2 is set up (`VITE_MEDIA_PROVIDER=cloudinary`). Uploads go to the folder `ishaputrabotanicals/<category>`.
- Step 3 accounts (decided 2026-10-12), all under the client's `ishaputrabiz@gmail.com`:
    - GitHub: the client's account, private repo (Dream Team added as collaborator).
    - Vercel: the client's account (Dream Team as team member). Hobby for testing; Pro before launch (Hobby forbids commercial sites).
    - Domain: `ishaputra.in`, bought on GoDaddy. DNS moves to the client's Cloudflare (nameservers), then Vercel records in Cloudflare with the proxy off; R2 images on `images.ishaputra.in`.
    - Razorpay: account created and approved. Test keys in local `.env` (checked 2026-10-13: API answers 200); to be added to Vercel by the user. Live key ID `rzp_live_TnKepxeYTRT8BB` generated 2026-10-13 (the client keeps the secret; never in chat or git). Live keys go into Vercel only at launch, after the security audit.
    - WhatsApp: not started.

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

- 2026-10-04: Scratch & Win built as designed in the approved mockup (owner: "just complete it", no changes to the screens). Prizes are points only; coupons are public and not tied to a customer, and cashback was the riskiest. Shipped off with placeholder values.
- 2026-10-05: Dealer Membership and the Loyalty card built as designed in the approved mockup (owner approved with no changes and asked for placeholder defaults for every number). The dealer programme ships off. Dealer orders take no coupon, points or cashback and earn nothing, because stacking them on a 20% price is the riskiest part.
- 2026-10-04: Checkout pays in one step. The phone slide and the desktop button open Razorpay directly (the separate "Payment details" screen and popup are gone); the payment method card shows on the checkout step. Owner's request.

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
    - **Eyebrows (changed 2026-10-04, world-class pass):** the numbers ("01 Top deals" to "10 Watch", "12 The full range") and the star glyphs are gone; eyebrows show words only. On home only Top deals, Shop by concern and Testimonials keep one; other pages have at most one (in the title band). Every section stays.
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
        - Neutrals, blues and greens mapped to brand tokens. Order-status colours (green delivered, red cancelled, purple returns) are kept, now as the muted status palette below.
        - Empty states use a charcoal icon tile with copper buttons. This replaces the pink heart and gray "Tanishq style" drawing on the wishlist.
    - **Wallet (`/wallet`):**
        - The loyalty tier is now a charcoal-stone card: metal-toned tier badges, copper top tier, and each tier's threshold shown under it.
        - Tiers are now an admin setting (Admin > Commerce settings > Rewards > Loyalty tiers), with DUMMY wellness-sized thresholds (₹0 / ₹5,000 / ₹15,000 / ₹30,000). They used to live in `BRAND.loyaltyTiers`; the jewellery store's started at ₹50,000.
        - "Total investment" is renamed "Total spent".
        - Its "View all" link went to `/orders`, which doesn't exist; fixed.
    - **Customer support:** WhatsApp no longer falls back to the phone number. The option shows only once a WhatsApp number is set in Admin > Customer support.
    - **Policy pages:** charcoal header band and sheet card. The privacy policy's sections 2 and 3 were numbered the wrong way round.
- Not screenshot-checked yet (need a real order): order details and cancel order. Their colours were mapped with the rest.
- **World-class UI pass, shared system (2026-10-04).** Guide for developers: `docs/ui-system.md`.
    - **Theme:** new visitors follow their device (System); Light and Dark still work. The saved theme is applied before the first paint, so dark visitors never see a light flash, and the browser bar and native controls follow the theme.
    - **Status palette:** six muted tones with light and dark values, all at least 5:1: success (green), danger (red), warning (amber), info (blue), returns (plum, still the "purple" for returns), neutral. Every status chip shows an icon and a label, never colour alone. One map (`src/lib/orderStatus.ts`) so the order list, order page and admin agree.
    - **Motion:** one set of speeds and curves for the whole site (presses 140 ms, menus 200 ms, dialogs 240 ms, drawers 300 ms, exits faster than entries). Pages fade in over 200 ms. Visitors who ask their device for less motion get fades only, and moving rows stop for them; rows also stop while off screen or in a hidden tab. Product rows still drift for everyone else (owner decision).
    - **Loading:** pages and sections show a grey outline of their final layout (skeletons) instead of spinners; spinners appear only inside buttons.
    - **Toasts:** one system (Sonner), on the paper card, following the site theme, bottom-centre on phones.
    - **Focus:** a copper keyboard ring on everything (light bronze on charcoal), and form fields get a copper border with a soft glow.
    - **Shapes:** panels and dialogs 18 px, cards and menus 12 px, buttons and fields 6 px, chips 4 px.
    - **Product cards:** the card title is now a real link (keyboard, screen readers, open in new tab), names wrap to two lines, the saved heart is copper (was red), prices use one Indian format. The products page keeps its own card and the empty grey stars stay (owner decisions, 2026-10-04).
    - **Product gallery:** the "01 / 04" counter becomes hidden text for screen readers; the dots stay. One label at most on each product photo.
    - **Old Sreerasthu links** (`/jewelry`, `/shop/rings`, `/gifts`, `/furniture`, `/home-decor`, `/articles`...) now open the full catalogue at `/products` (owner decision, 2026-10-04).
    - **Faster first visit:** Google Analytics loads after the page is ready, and the second sign-in instance (used only when an admin creates a delivery partner) is created only when needed.
- Preview test account for screenshots: `preview-shopper@ishaputra.test`, created through the site's signup with one dummy Hyderabad address and items in its cart. The password is kept outside the repo. **Delete it in Firebase Authentication (and its `users`/`carts` docs) before launch.**

## Placeholders for the client
Shown or used on the site but not confirmed. Each must be replaced or confirmed before launch.
- **Contact details (dummy on purpose, owner's choice):** phone `+91 98765 43210`, address `Road No. 12, Banjara Hills, Hyderabad 500034`, email `hello@ishaputra.in`, hours "Mon to Sat, 10 am to 7 pm", map of Banjara Hills (the domain `ishaputra.in` is real, confirmed 2026-10-12). All in `src/config/brand.ts`.
- **Demo testimonials:** the 3 seeded testimonials (`demo: true`). Remove with `node scripts/seed-demo.mjs --remove`.
- **Claims to confirm or remove:** "24 h support" / "Within 24 hours" response time, "100% secure", "Insured" delivery, "wellness experts", "video consultation with an expert".
- **Policies:** policy dates, and the return and replacement wording (7-day window) on the policy pages and checkout.
- **Loyalty tiers (Admin > Commerce settings > Rewards > Loyalty tiers), all placeholders:** Silver ₹0 at 1x, Gold ₹5,000 at 1.25x, Platinum ₹15,000 at 1.5x, Premium ₹30,000 at 2x (names, spend thresholds and points multipliers). The client should confirm them and whether a tier should give anything besides the multiplier.
- **GST rate** and whether prices include GST (Admin > Commerce settings).
- **"Ships from" state** on invoices and the product page (Telangana today).
- **Products flagged "New arrival":** 7 of the 12 demo products carry the flag, so the "New" tag shows on most cards. Set it only on real new arrivals.
- **Category photos:** on /categories, Powders and Shilajit borrow the same product photo; each needs its own image.
- **Scratch & Win (Admin > Commerce settings > Scratch & Win), all placeholders, feature off:** minimum order ₹499; cards expire 30 days after delivery; prizes 5 / 10 / 25 / 50 points at weights 40 / 35 / 20 / 5; "better luck next time" weight 0 (every card wins). That averages 13 points a card (₹13 at today's point value, 2.6% of ₹499), and about 1 card in 20 wins 50 points. The client should confirm the budget, the prizes and whether some cards should win nothing.
- **Dealer Membership (Admin > Commerce settings > Dealers), all placeholders, programme off:** dealer prices from ₹2,000 at regular prices; 20% off the regular price store-wide; no per-product dealer prices (none set); dealer orders take no coupon, points or cashback and earn no points or scratch card (no stacking). The client should confirm the discount, the minimum, whether some products need their own fixed dealer price, and whether stacking should stay off.
- **Dealer programme, other wording to confirm:** the "How it works" list and the terms on `/dealer`, and which business types the form offers (retail, ayurvedic, salon, gym, online, distributor, other).

## UI pass decisions (owner, 2026-10-04)
The full-site UI audit (295 findings) raised 14 questions. The owner approved:
- Dead links and search: the gift icon is gone from the search bars; old Sreerasthu URLs (/jewelry, /shop/..., /gifts, /furniture, /home-decor, /articles) open /products; /search works on desktop and search results have the normal header and footer.
- Checkout and cart: one bill block with the same rows everywhere, "Done" after an order goes to the last product, "100% secure" on the Back row, the cart drawer's dead scan and mic buttons hidden, guests told why they were sent to sign in, one remove button on the wishlist. (Wishlist "Add to cart" behaviour unchanged.)
- Login and content: "Forgot your password?" opens its own page with the email; the site header on all auth pages; after a reset the shopper lands on sign-in with "Password updated"; broken call links hide the call controls; About's buttons and range cards link to the products; no eyebrow above the logo on auth cards.
- Account settings: Light / Dark / System on the account hub, "Add address" in the empty state, and new visitors follow their device's theme.
- Small additions: "Show all reviews", a category link in the product breadcrumb, "Browse all products" on "Category not found", brand loading screen minimum 0.7 s, admin header search goes to products.
- Admin: switched-off silver-rate and delivery-partner pieces hidden behind their flags; a styled confirmation before admin status changes, Approve / Reject return and the customer's "Cancel return".
- Contact form opens a prefilled email (it used to only log to the browser console).
- Logic: Buy again uses today's price; one password policy (8+ characters with upper, lower, number and symbol) for sign-up and reset; analytics and the second sign-in instance load later for a faster first visit.
Not approved (left as they were): stopping the home product rows' drift and a hero pause control (the rows stay still on screen, as they always have: a CSS setting swallows the drift); one product card everywhere and hiding the empty stars; deleting the hidden mobile bottom nav.
Owner to do: set Ships From = Telangana in Admin > Commerce (the delivery-charge home state still defaults to Andhra Pradesh).

## Progress
- [x] Step 0 safe preview (2026-09-23): home, products and product pages show demo content on Ishaputra Firebase; only the YouTube section is hidden (no videos yet)
- [ ] Step 1 new look: done 2026-09-27, waiting for client review
- [x] Step 2 design (2026-09-29): Home, Products, Product detail, Checkout, Profile and the remaining pages; waiting for client review
- [x] Step 2B features (2026-10-05): rewards (points and cashback) merged 2026-10-03; Scratch & Win merged 2026-10-05 (shipped off, values are placeholders); Dealer Membership and the Loyalty card merged 2026-10-05 after the rules deploy and a passing live test (shipped off, values are placeholders).
- [ ] Step 3 accounts   - [ ] Step 4 test and publish   - [ ] Step 5 client changes

## Next step
Step 2B is done. Scratch & Win and the dealer programme stay off until the client confirms their values and an admin turns them on. Step 3 started 2026-10-05: the checklist (`docs/client-checklist-steps-3-5.pdf`) is ready to send. Next: collect the client's answers and accounts.

## Open questions
- Real business details to replace the dummy ones in `src/config/brand.ts`: legal name, address, phone, WhatsApp, email, hours, GSTIN, domain, social links (blocking for launch, not for review)
- GST: which rate(s) apply (Ayurvedic medicines and cosmetics differ), are prices GST-inclusive, and should the GST line show at checkout? Set in Admin > Commerce settings; GST is off until then (blocking for launch, not for review)
- Vector (SVG/AI) logo file? A transparent PNG is in; a vector would give a sharper favicon (not blocking)
- Category tree correct? (not blocking)
- Loyalty card: built as a digital card on `/wallet` and the account page, with no QR code and no physical card (placeholder choice, to confirm). (Step 2B)
- Scratch & Win: when a card is earned, prizes (points, coupon, cashback), odds, daily limit (Step 2B)
- Dealer membership: built with placeholder choices, to confirm: 20% off the regular price store-wide (with an optional fixed price per product), dealers apply on `/dealer` and an admin approves them, dealer prices from ₹2,000 at regular prices, no dealer-only products, no stacking with coupons, points or cashback. (Step 2B)
- Loyalty tiers: names, spend thresholds and what each tier gets (placeholders now: Silver ₹0 at 1x, Gold ₹5,000 at 1.25x, Platinum ₹15,000 at 1.5x, Premium ₹30,000 at 2x; editable in Admin > Commerce settings > Rewards > Loyalty tiers). The multiplier is the only benefit built. (Step 2B)
- Cashback and loyalty points rules: earn rate, value per point, expiry, caps (Step 2B, before touching the wallet)

# Media storage (Cloudflare R2)

Every image upload goes through one server endpoint, `api/media.ts`. The browser never gets storage keys.

## How it works

| Piece | File |
| --- | --- |
| Upload, delete, usage endpoint (+ free-tier guard) | `api/media.ts` |
| Browser client: size checks, compression, previews | `src/services/mediaStorage.ts` |
| Preview URL helper (`__w600.webp`) | `src/lib/mediaUrl.ts` |
| Image component (uses previews in small slots) | `src/components/ui/smart-image.tsx` |
| Admin usage page | `src/pages/admin/AdminStorage.tsx` (`/admin/storage`) |
| Admin warning popup | `src/components/admin/StorageLimitWatcher.tsx` |

Rules:

- Images: JPG, PNG, WebP, **500 KB max**, except **hero banners, which may be 1 MB** (`banners` category - there are only a few and they run the full width). Admin screens reject bigger files. Customer screens (review photos, profile picture) shrink photos in the browser first.
- Hero banners: upload a **16:9** desktop image (1920 × 1080 is ideal) and an optional 4:5 mobile crop. The hero frame is 16:9 on desktop and 4:5 on phones, so a 16:9 upload is shown whole.
- PDFs (refund receipts only): 1 MB max.
- Products: **5 photos max**. The product form and `firestore.rules` both enforce this.
- Each photo is stored with a 600px preview next to it (`m<id>.jpg` + `m<id>__w600.webp`). Product cards load the preview.
- Product photos also get a small JPEG for link previews (`m<id>__og.jpg`, 800px, ~70 KB). WhatsApp drops preview images much above 300 KB and doesn't reliably accept WebP. `scripts/backfill-og-images.mjs` makes these for photos uploaded before this existed.
- Review videos are turned off. A few phone videos would use up the free 10 GB.

Free-tier guard: before each upload the server checks usage for the current billing month.
- **80%** of any limit: admins see a popup.
- **95%**: uploads are refused (HTTP 429, code `LIMIT_REACHED`).

Limits are 10 GB storage, 1M Class A operations, and 10M Class B operations. The numbers come from the Cloudflare GraphQL analytics API when `CLOUDFLARE_ANALYTICS_TOKEN` is set. Without it, storage is measured by listing the bucket, and Class B can't be measured.

Deletes are free on R2. Deleting a product, or removing a photo and saving, deletes the file if no other product uses it.

## Catalog snapshot (keeps Firestore on the free plan)

The storefront does not query Firestore for the product list. It downloads `catalog/products.json` from R2, served same-origin at `/catalog/products.json` (rewrite in `vercel.json`; `vite.config.ts` does the same in dev).

Why: the Spark plan allows 50,000 Firestore reads a day, and the catalog is ~600 documents. Reading it once per visitor caps the site at about 80 visitors a day. Before this change, the header, two homepage sections and the product page each read the whole catalog, so a single visitor used several thousand reads.

| Piece | File |
| --- | --- |
| Loads the snapshot, falls back to Firestore if it's missing | `src/services/productCache.ts` |
| Builds and refreshes the snapshot | `publish-catalog` in `api/media.ts` |
| Asks for a refresh after a product write | `src/services/catalogPublisher.ts` |
| Full rebuild from the command line | `scripts/publish-catalog.mjs` |

How it stays current: admin create/edit/delete, order stock changes, cancellations and review-count updates each ask the server to refresh just those products (one Firestore read per product). Concurrent refreshes can't overwrite each other: the write is conditional on the file's ETag. Visitors may see a change up to about a minute later. Checkout still checks stock against Firestore, so a stale stock count can't cause overselling. The product page also reads its own product once to show current price and stock.

Run `node scripts/publish-catalog.mjs` (~600 reads) once to create the snapshot, and again after anything that edits products outside the app: bulk scripts or the Firebase console. If the snapshot is missing, the site keeps working by reading Firestore, and the browser console warns `catalog snapshot unavailable`.

Scripts that only read the catalog use the snapshot too, through `scripts/lib/catalog.mjs` - `stock-build-manifest.mjs` and `stock-visual-match.mjs --refresh` now cost nothing. Pass `--firestore` to read the collection instead, which is needed only when the snapshot is stale or a product is hidden from the storefront. Scripts that write products (`stock-upload.mjs`, `stock-duplicates.mjs`, `sync-product-ratings.mjs`, `migrate-categories.mjs`) still read Firestore, so run those when the day's read budget allows.

## Link previews (WhatsApp, Facebook, Telegram)

Crawlers never run JavaScript, so they would only see the generic tags in `index.html`. `vercel.json` sends link-preview bots requesting `/product/:id` to `/api/media?og=product&id=...`, which returns the product's title, price and `__og.jpg` photo as Open Graph tags. Everyone else, including Googlebot, gets the normal app. The "Enquire on WhatsApp" button (`src/components/WhatsAppEnquiryButton.tsx`) puts the product link on the last line of the message, so WhatsApp shows that preview card.

## Keys

```
products/2026/09/m3f9c...e1.jpg          admin categories: <category>/<yyyy>/<mm>/<id>.<ext>
avatars/<uid>/2026/09/m81ab...77.webp    per-user categories: <category>/<uid>/<yyyy>/<mm>/<id>.<ext>
```

The keys don't depend on any provider. Firestore stores `R2_PUBLIC_URL + "/" + key`.

## Environment variables (Vercel → Settings → Environment Variables, and local `.env`)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_BILLING_CYCLE_DAY`, `CLOUDFLARE_ANALYTICS_TOKEN`, `CLOUDFLARE_ZONE_ID`. See `.env.example`.

`CLOUDFLARE_ANALYTICS_TOKEN` needs two permissions on the same token (Cloudflare dashboard → profile icon → API Tokens → edit the token → Add more → add a second permission group):
- **Account → Account Analytics → Read** — powers the live usage numbers on `/admin/storage`.
- **Zone → Cache Purge → Purge**, scoped to the zone that owns your `R2_PUBLIC_URL` domain — without this, deleting a photo removes it from R2 but a cached copy can keep being served from Cloudflare's edge for up to a year (deletes still work; they just aren't instant at the edge).

## Moving the files later

Applies both to switching from the r2.dev link to a custom domain and to moving to AWS S3 or another S3-compatible store:

1. Copy the bucket and keep the same keys. For example, with rclone: `rclone sync r2:ssstorage s3:new-bucket`. If only the domain changes, there's nothing to copy.
2. Point the env vars at the new store. `api/media.ts` uses plain S3 SigV4 (`aws4fetch`), so an S3 endpoint works after changing `bucketUrl` in `r2()`.
3. Rewrite the stored URLs:
   ```
   node scripts/rewrite-media-urls.mjs --from=<old R2_PUBLIC_URL> --to=<new base URL>          # dry run
   node scripts/rewrite-media-urls.mjs --from=<old R2_PUBLIC_URL> --to=<new base URL> --apply
   ```
4. Update `R2_PUBLIC_URL` on Vercel and redeploy.

Legacy Cloudinary URLs already in Firestore still render through `src/lib/cloudinaryUrl.ts`.

# Ecommerce Template, Part 1: Clean Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `Desktop\Ecommerce Template\`, a copy of Ishaputra `main` with every client-specific name, text, image, colour and account removed, and every optional feature behind one on/off switch.

**Architecture:** Export the tracked files of Ishaputra `main` (`git archive`, so no keys, `.env`, `node_modules` or history come along) into a new git repo. A guard test (`tests/template-clean.test.ts`) lists banned client words. It fails first, then each cleanup task removes one group of hits until it passes. Feature switches move into one typed object, `FEATURES` in `src/config/features.ts`, with labels and dependencies. Routes use a `<FeatureGate>` wrapper, so a switched-off page is never loaded.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind, shadcn/ui, Firebase, Vercel functions, Razorpay. Tests run with `node --test` (Node 22 runs `.ts` directly). Logo files are built with `sharp`.

**Spec:** `docs/template/build/2026-10-13-ecommerce-template-design.md` (copied into the template in Task 1).

## Global Constraints

- Source: Ishaputra repo at `C:\Users\chala\OneDrive\Desktop\Ishaputra Botanicals\ssecommerce`, branch `main`. **Never edit that repo** during this plan (read only), except the final handoff note in Task 10.
- Target: `C:\Users\chala\OneDrive\Desktop\Ecommerce Template\`. All paths below are relative to it.
- No keys or secrets in the template: no `.env`, no `*firebase-adminsdk*.json`, no Ishaputra project IDs, no Ishaputra Cloudinary URLs (`dcoimqij`).
- Real content only: no invented reviews, ratings, stats, badges, stock or deadlines. Unknown client facts are `[NEED: ...]` or an empty value (the site hides empty contact fields).
- Demo brand name: `Demo Store`, short name `Demo`, slug `demo-store`, member prefix `DS`.
- Features are switched off, never deleted. A switched-off page's route is not rendered, so its lazy chunk never loads.
- Money features (rewards, scratch & win, dealers) ship with their **runtime** setting off; an admin turns them on.
- `api/*.ts` files stay standalone (they import nothing from `src/`). Shared values are copied and checked by a parity test.
- Accessibility floor: 4.5:1 text contrast, visible focus, keyboard reachable, `prefers-reduced-motion` respected.
- Local git commits only. Never push or deploy. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Git Bash: prefix `MSYS_NO_PATHCONV=1` when a node command takes a URL path such as `/`.
- Baseline on the source today: `npm test` passes (23 test files), `npm run build` passes. The template must keep both green after every task.

## Execution notes (usage)

- One builder agent per task (Sonnet; Haiku is fine for Tasks 2, 4 and 6). The controller checks tests, build and the guard test itself.
- A separate reviewer agent **only** for Task 8 Step 6 (the rewards default is money code).
- No workflow and no ultracode needed: the tasks run in order and each one depends on the last.
- Effort High. Do Tasks 1 to 5 in one chat and Tasks 6 to 10 in a second chat; the handoff file carries state between them.

## File map

| Path | What changes |
|---|---|
| `tests/template-clean.test.ts` | **New.** Fails while any banned client word is in tracked text files. |
| `tests/features.test.ts` | **New.** Checks the `FEATURES` object, labels and dependencies. |
| `tests/brand-parity.test.ts` | **New.** `api/*` store-name copies equal `BRAND.name`. |
| `src/config/features.ts` | Rewritten: `FEATURES`, `FEATURE_INFO`, `isOn()`. |
| `src/components/FeatureGate.tsx` | **New.** Route wrapper that redirects when a feature is off. |
| `src/config/brand.ts` | Neutral demo brand with a `slug`; storage keys derived from it. |
| `index.html`, `public/manifest.webmanifest`, `public/robots.txt`, `public/firebase-messaging-sw.js` | Neutral name, meta and theme key. |
| `api/media.ts`, `api/whatsapp-send.ts`, `api/send-call-notification.ts` | `const STORE_NAME = 'Demo Store'` instead of the literal. |
| ~50 files in `src/` | Hard-coded name → `BRAND.name` / `BRAND.shortName`. |
| `src/pages/About.tsx`, policy pages, `src/services/geminiService.ts`, home copy | Neutral copy with `[NEED: ...]` markers. |
| `public/demo/*.svg`, `scripts/make-placeholders.mjs` | **New.** Neutral placeholder images (no paid image API). |
| `brand-assets/logo.svg`, `scripts/build-logo-assets.mjs` | Placeholder logo; the script builds every logo file from `brand-assets/`. |
| `src/index.css`, `tailwind.config.ts` | Neutral default palette and fonts; token names unchanged. |
| `scripts/demo/content.mjs`, `src/data/defaultHomeCollections.ts` | Neutral demo catalogue. |
| `src/lib/rewards.ts` (+ synced copies in `api/create-order.ts`, `api/notify-order.ts`) | Rewards runtime default `enabled: false`. |
| `docs/setup/` | Setup guides kept from the old root docs. |
| `scripts/qa/` | Screenshot and fixture scripts moved from `docs/handoff/`. |
| `CLAUDE.md`, `README.md`, `docs/HANDOFF.md` | Short template versions (the full runbook is Part 2). |

---

### Task 1: Create the template repo

**Files:**
- Create: the whole `Desktop\Ecommerce Template\` folder
- Create: `docs/template/build/` (spec and this plan)

- [ ] **Step 1: Export Ishaputra `main` (tracked files only)**

```bash
SRC="/c/Users/chala/OneDrive/Desktop/Ishaputra Botanicals/ssecommerce"
DST="/c/Users/chala/OneDrive/Desktop/Ecommerce Template"
test ! -e "$DST" || { echo "STOP: $DST already exists"; exit 1; }
mkdir -p "$DST"
git -C "$SRC" archive main | tar -x -C "$DST"
mkdir -p "$DST/docs/template/build"
cp "$SRC/docs/superpowers/specs/2026-10-13-ecommerce-template-design.md" "$SRC/docs/superpowers/plans/2026-10-13-ecommerce-template-part1-clean-base.md" "$DST/docs/template/build/"
```

- [ ] **Step 2: Confirm no secrets came along**

```bash
cd "/c/Users/chala/OneDrive/Desktop/Ecommerce Template"
ls -a | grep -E '^\.env$|^\.env\.local$|adminsdk' ; echo "exit=$?"
```
Expected: no file names printed, `exit=1`. Then `grep -n -E '^[A-Z_]+=.+' .env.example` and read each line: only non-secret defaults (such as `VITE_MEDIA_PROVIDER=cloudinary`) may have a value. Blank anything that looks like a key, ID, token, password or Ishaputra URL.

- [ ] **Step 3: Fresh git repo, install, baseline**

```bash
git init -q && git add -A && git commit -q -m "chore: template starts from Ishaputra main (files only, no history)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm install
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"
```
Expected: tests `# fail 0`, build ends with `built in`. Record the pass count and the type-error count in `docs/HANDOFF.md` (created in Task 2) as the baseline.

---

### Task 2: Remove client-only and legacy files

**Files:**
- Delete: `CLIENT.md`, `client-assets/`, `docs/HANDOFF.md` (replaced below), `docs/client-checklist-steps-3-5.*`, `docs/superpowers/` (Ishaputra specs, plans and reviews), `docs/handoff/rewards-review-findings.txt`, `docs/handoff/rewards-ui-tasks.js`, `src/services/cloudFunctions.reference.ts`, `src/services/passwordResetCloudFunctions.reference.ts`, `bun.lockb`
- Delete (progress notes, stale): `ADDRESS_IMPLEMENTATION_SUMMARY.md`, `BANNER_IMPLEMENTATION_COMPLETE.md`, `CART_FIX_PROGRESS.md`, `FIREBASE_CART_FIX.md`, `IMPLEMENTATION_SUMMARY.md`, `ORDER_SYSTEM_IMPLEMENTATION.md`, `QUICK_START_CART.md`, `WORKFLOW_AUDIT.md`, `firestore-delivery-rules.txt`
- Move to `docs/setup/`: `ADDRESS_MANAGEMENT_GUIDE.md`, `ADMIN_BANNER_GUIDE.md`, `CART_USAGE_GUIDE.md`, `DELIVERY_BOYS_GUIDE.md`, `DEPLOY_FIRESTORE_RULES.md`, `FIREBASE_ADDRESS_SECURITY_RULES.md`, `FIREBASE_EMAIL_SETUP.md`, `FIREBASE_SECURITY_RULES.md`, `FIREBASE_STORAGE_CORS_FIX.md`, `GOOGLE_SIGNIN_SETUP.md`, `INTEGRATIONS_SETUP.md`, `MEDIA_STORAGE.md`, `PASSWORD_RESET_SECURITY.md`, `PUSH_NOTIFICATIONS_SETUP.md`, `SHOWCASE_MANAGEMENT_GUIDE.md`, `TESTING_GUIDE.md`, `WHATSAPP_TEMPLATE_MANAGER_GUIDE.md`, `docs/WHATSAPP_SETUP.md`
- Move to `scripts/qa/`: everything left in `docs/handoff/` (`deploy-rules.mjs`, `display-shots.mjs`, `hardening-check.mjs`, `ui-fixtures.mjs`, `ui-profiles.mjs`, `ui-shots.mjs`, `scratch-win-live.mjs`, `dealer-loyalty-live.mjs`)
- Modify: `src/App.tsx` (remove the legacy Sreerasthu redirects), `.gitignore`, every moved script's paths
- Create: `CLAUDE.md`, `README.md`, `docs/HANDOFF.md`

- [ ] **Step 1: Delete and move**

```bash
cd "/c/Users/chala/OneDrive/Desktop/Ecommerce Template"
git rm -q -r CLIENT.md client-assets docs/HANDOFF.md docs/client-checklist-steps-3-5.md docs/client-checklist-steps-3-5.pdf docs/superpowers docs/handoff/rewards-review-findings.txt docs/handoff/rewards-ui-tasks.js src/services/cloudFunctions.reference.ts src/services/passwordResetCloudFunctions.reference.ts bun.lockb ADDRESS_IMPLEMENTATION_SUMMARY.md BANNER_IMPLEMENTATION_COMPLETE.md CART_FIX_PROGRESS.md FIREBASE_CART_FIX.md IMPLEMENTATION_SUMMARY.md ORDER_SYSTEM_IMPLEMENTATION.md QUICK_START_CART.md WORKFLOW_AUDIT.md firestore-delivery-rules.txt
mkdir -p docs/setup scripts/qa
for f in ADDRESS_MANAGEMENT_GUIDE ADMIN_BANNER_GUIDE CART_USAGE_GUIDE DELIVERY_BOYS_GUIDE DEPLOY_FIRESTORE_RULES FIREBASE_ADDRESS_SECURITY_RULES FIREBASE_EMAIL_SETUP FIREBASE_SECURITY_RULES FIREBASE_STORAGE_CORS_FIX GOOGLE_SIGNIN_SETUP INTEGRATIONS_SETUP MEDIA_STORAGE PASSWORD_RESET_SECURITY PUSH_NOTIFICATIONS_SETUP SHOWCASE_MANAGEMENT_GUIDE TESTING_GUIDE WHATSAPP_TEMPLATE_MANAGER_GUIDE; do git mv "$f.md" "docs/setup/$f.md"; done
git mv docs/WHATSAPP_SETUP.md docs/setup/WHATSAPP_SETUP.md
for f in docs/handoff/*; do git mv "$f" scripts/qa/; done
```

- [ ] **Step 2: Check nothing imported the deleted reference files**

Run: `grep -rn "cloudFunctions.reference\|passwordResetCloudFunctions.reference" src api scripts tests`
Expected: no output. If anything prints, remove that import (the files were reference-only).

- [ ] **Step 3: Fix paths in the moved QA scripts**

In every file in `scripts/qa/`, replace the text `docs/handoff/` with `scripts/qa/` (usage comments, `shopper.local` / `admin.local` paths, imports between them):
```bash
sed -i 's#docs/handoff/#scripts/qa/#g' scripts/qa/*.mjs
grep -rn "docs/handoff" . --include=*.mjs --include=*.ts --include=*.md --exclude-dir=node_modules --exclude-dir=build
```
Expected: no output. In `.gitignore`, replace any `docs/handoff/*.local` line with `scripts/qa/*.local`.

- [ ] **Step 4: Remove the legacy redirects from `src/App.tsx`**

Delete the `LegacyRedirect` constant with its comment, and these routes: `/jewelry`, `/furniture`, `/articles`, `/articles/:articleSlug`, `/home-decor`, `/home-decor/:itemSlug`, `/gifts`, `/gifts/:giftSlug`, `/shop/:shopSlug`, `/furniture/:itemSlug`, `/other-products/:itemSlug`, `/jewelry-collections`. A new store has no old links, and unknown URLs already reach the `*` (NotFound) route. Run `grep -n "LegacyRedirect" src/App.tsx`; expected: no output.

- [ ] **Step 5: Write the short `CLAUDE.md`, `README.md` and `docs/HANDOFF.md`**

`CLAUDE.md` (Part 2 replaces it with the full runbook):
```markdown
# Ecommerce Template

The master copy every Dream Team client store starts from. Built from the Ishaputra Botanicals store (itself from Sreerasthu Silvers), with all client details removed.

- No client work happens in this folder. Client stores are copies (Part 2 adds `scripts/new-client`).
- Read `docs/HANDOFF.md` first. Build spec and plans: `docs/template/build/`.
- Rules: no client names, keys, products or invented content here; unknown facts are `[NEED: ...]`. Features are switched off in `src/config/features.ts`, never deleted.
- Checks: `npm test` (includes the template-clean guard), `npm run build`.
```

`README.md`:
```markdown
# Ecommerce Template (Dream Team Services)

React 18 + Vite + TypeScript + Tailwind + shadcn/ui storefront with Firebase, Vercel functions and Razorpay. This is the neutral master copy; see `CLAUDE.md`.

- `npm install`, then `npm run dev`
- `npm test` and `npm run build` must pass before any commit
- Setup guides: `docs/setup/`
```

`docs/HANDOFF.md`: copy `C:/Users/chala/.claude/templates/HANDOFF.md` and fill in: State = "Part 1 (clean base) in progress, Task 2 done; baseline `npm test` <N> pass"; Next steps = "Part 1 Task 3 (`docs/template/build/2026-10-13-ecommerce-template-part1-clean-base.md`)".

- [ ] **Step 6: Test, build, commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -2
git add -A && git commit -q -m "chore: remove Ishaputra-only files, legacy redirects and stale docs; move setup guides and QA scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `# fail 0`, build passes.

---

### Task 3: The template-clean guard test (fails first)

**Files:**
- Create: `tests/template-clean.test.ts`

**Interfaces:**
- Produces: `npm test` fails with a list of `file:line: word` until Tasks 4 to 7 remove every hit. Later tasks run `node --test tests/template-clean.test.ts` to see what's left.

- [ ] **Step 1: Write the test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Words that only belong to past clients. Built from parts so this file doesn't match itself.
const BANNED = [
  ['isha', 'putra'], ['sree', 'rasthu'], ['dcoim', 'qij'],
  ['ayur', 'ved'], ['botan', 'ical'], ['shila', 'jit'], ['ashwa', 'gandha'],
  ['apothe', 'cary'], ['bhring', 'raj'], ['tri', 'phala'], ['tul', 'si'],
  ['her', 'bal'], ['banjara', ' hills'], ['98765', ' 43210'],
].map((p) => p.join(''));

const SKIP = [/^docs\/template\/build\//, /^package-lock\.json$/, /\.(png|jpe?g|ico|webp|gif|pdf|woff2?|lockb)$/i];

test('no past-client words in tracked text files', () => {
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((f) => !SKIP.some((re) => re.test(f)));
  const hits: string[] = [];
  const re = new RegExp(BANNED.join('|'), 'i');
  for (const f of files) {
    let text: string;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      const m = line.match(re);
      if (m) hits.push(`${f}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(hits, [], `${hits.length} past-client words left:\n${hits.slice(0, 80).join('\n')}`);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/template-clean.test.ts 2>&1 | grep -E "past-client words left" `
Expected: FAIL with roughly 200+ hits (names in about 60 files, copy in about 40, Cloudinary URLs in 49 places).

- [ ] **Step 3: Commit (the suite is red on purpose until Task 7)**

```bash
git add tests/template-clean.test.ts && git commit -q -m "test: template-clean guard (red until client words are gone)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Note in `docs/HANDOFF.md`: "`npm test` is red only on template-clean until Task 7; every other test must stay green."

---

### Task 4: Neutral brand config and the store name everywhere

**Files:**
- Modify: `src/config/brand.ts`, `index.html`, `public/manifest.webmanifest`, `public/robots.txt`, `public/firebase-messaging-sw.js`, `.firebaserc`
- Modify: `api/media.ts`, `api/whatsapp-send.ts`, `api/send-call-notification.ts`
- Modify: every `src/` file printed by the grep in Step 4
- Create: `tests/brand-parity.test.ts`

**Interfaces:**
- Produces: `BRAND.name`, `BRAND.shortName`, `BRAND.slug` (`'demo-store'`), `BRAND.storageKeys.*` = `` `${slug}-theme` `` etc. Each api file has `const STORE_NAME = 'Demo Store';` near the top.

- [ ] **Step 1: Write the failing parity test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND } from '../src/config/brand.ts';

for (const f of ['api/media.ts', 'api/whatsapp-send.ts', 'api/send-call-notification.ts']) {
  test(`${f} STORE_NAME matches BRAND.name`, () => {
    const m = readFileSync(f, 'utf8').match(/const STORE_NAME = '([^']*)';/);
    assert.ok(m, `${f} has no "const STORE_NAME = '...';"`);
    assert.equal(m[1], BRAND.name);
  });
}

test('index.html theme key matches BRAND.storageKeys.theme', () => {
  assert.ok(readFileSync('index.html', 'utf8').includes(`localStorage.getItem('${BRAND.storageKeys.theme}')`));
});
```
Run: `node --test tests/brand-parity.test.ts`. Expected: FAIL (no `STORE_NAME` yet).

- [ ] **Step 2: Rewrite the identity part of `src/config/brand.ts`**

Keep the header comment, `social`, `priceRanges` and the field order. Change the top of the comment to note the api copies are checked by `tests/brand-parity.test.ts`. Replace the values:
```ts
const SLUG = 'demo-store';

export const BRAND = {
  /** [NEED: store name] Also update STORE_NAME in api/media.ts, api/whatsapp-send.ts, api/send-call-notification.ts. */
  name: 'Demo Store',
  shortName: 'Demo',
  /** Used for localStorage keys so two stores on one device don't share state. Also update index.html's theme key. */
  slug: SLUG,
  /** [NEED: registered business name for invoices and policies] */
  legalName: '',
  /** [NEED: tagline] */
  tagline: '',
  /** [NEED: one-sentence description of what the store sells] */
  description: 'An online store.',

  /** [NEED: live domain] VITE_SITE_URL overrides it, e.g. on a preview. */
  siteUrl: 'https://example.com',

  /** [NEED: contact details] Empty values are hidden on the site. */
  email: '',
  phones: [] as string[],
  whatsapp: '',
  addressLines: [] as string[],
  hours: '',
  mapEmbedUrl: '',
  /** Never a made-up GSTIN: an empty value prints nothing on invoices. */
  gstin: '',
  /** [NEED: the business's state] Decides IGST vs CGST+SGST on invoices. */
  state: 'Telangana',
  stateCode: '36',
  // social, priceRanges: unchanged
  /** Prefix of the loyalty card's member number. */
  memberPrefix: 'DS',
  storageKeys: {
    theme: `${SLUG}-theme`,
    searchHistory: `${SLUG}_search_history`,
    cart: `${SLUG}_cart`,
    wishlist: `${SLUG}_wishlist`,
  },
} as const;
```
Then check every reader of the fields that became empty (`legalName`, `tagline`, `mapEmbedUrl`, `hours`): `grep -rn "BRAND\.\(legalName\|tagline\|mapEmbedUrl\|hours\)" src`. Each reader must hide its element when the value is empty, or fall back (`BRAND.legalName || BRAND.name`). Fix any that would render an empty label, an empty `<iframe>` or a blank line.

- [ ] **Step 3: Static files and the api copies**

- `index.html`: theme key `'demo-store-theme'`; `<title>Demo Store</title>`; author `Demo Store`; delete the `keywords` meta; description and `og:*` read "Demo Store: an online store." (`[NEED]` comment above them in HTML).
- `public/manifest.webmanifest`: `"name": "Demo Store"`, `"short_name": "Demo"`.
- `public/robots.txt`: header comment `# Demo Store`; `Sitemap: https://example.com/sitemap.xml` with a comment `# [NEED: live domain]`.
- `public/firebase-messaging-sw.js`: fallback title `'Demo Store'`, tag `'store-notification'`.
- `.firebaserc`: `"default": "template-demo"` (Task 10 creates that project; client copies change it).
- In each of the three api files, add `const STORE_NAME = 'Demo Store'; // must equal BRAND.name (tests/brand-parity.test.ts)` below the imports and use it in place of every literal store name, e.g. `` `${name} | ${STORE_NAME}` `` and `` `Your ${STORE_NAME} verification code is ${otp}. Valid for 10 minutes.` ``. In `api/media.ts` the default title becomes `STORE_NAME`.

- [ ] **Step 4: Replace the hard-coded name across `src/`**

List the files: `grep -rln -i "isha""putra" src`. In each one:
- Text that names the store → `{BRAND.name}` in JSX or `` `${BRAND.name}` `` in strings (import `BRAND` from `@/config/brand` if missing). Examples: `alt={BRAND.name}`, `` aria-label={`${BRAND.name} home`} ``, `` toast.success(`Account created. Welcome to ${BRAND.name}.`) ``, Razorpay `name: BRAND.name`, schema `brand: { "@type": "Brand", name: BRAND.name }`.
- Short forms ("Thanks for shopping with Ishaputra.", AdminLogin eyebrow, footer wordmark) → `BRAND.shortName`.
- Named programmes ("The Ishaputra Circle", "The Ishaputra film reel", "The Ishaputra range") → `` `The ${BRAND.shortName} circle` `` style, keeping the sentence.
- localStorage keys (e.g. `'ishaputra-admin-orders-view'` in `src/pages/AdminOrders.tsx`) → `` `${BRAND.slug}-admin-orders-view` ``.
- Comments that mention the client → reword neutrally ("the client", "this store") or delete. `TODO(client): placeholders until Ishaputra confirms ...` becomes `TODO(client): placeholder values until the client confirms them.`
- `src/App.tsx` comment about old Sreerasthu URLs is already gone (Task 2).
- `src/services/geminiService.ts` and `src/index.css` comments are handled in Tasks 5 and 7; leave them.

If you change a line inside a marked sync block (`// >>> rewards-core`, `scratch-core`, `dealer-core` in `src/lib/`), run `npm run sync:rewards` afterwards.

- [ ] **Step 5: Run tests and the guard**

```bash
node --test tests/brand-parity.test.ts 2>&1 | tail -3
npm test 2>&1 | grep -E "^# (pass|fail)"
node --test tests/template-clean.test.ts 2>&1 | grep -c -i "isha""putra"
npm run build 2>&1 | tail -2
```
Expected: brand-parity passes; the only failing test is template-clean; the name count is 0 outside `src/services/geminiService.ts` and `src/index.css` comments; build passes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -q -m "feat: neutral Demo Store brand; store name read from BRAND everywhere; api copies parity-checked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Neutral copy (text written for the old client)

**Files:**
- Modify: `src/pages/About.tsx`, `src/pages/PrivacyPolicy.tsx`, `src/pages/TermsConditions.tsx`, `src/pages/ShippingPolicy.tsx`, `src/pages/CancellationRefundPolicy.tsx`, `src/pages/CustomerSupport.tsx`, `src/pages/CategoryPage.tsx`, `src/pages/MobileCategories.tsx`, `src/components/HeroBanner.tsx`, `src/components/MarqueeBand.tsx`, `src/components/CategoryIconNav.tsx`, `src/components/MobileSearchBar.tsx`, `src/pages/SearchResults.tsx`, `src/pages/MobileSearch.tsx`, `src/services/categoryService.ts`, `src/services/siteSettingsService.ts`, `src/services/geminiService.ts`, `src/pages/admin/AdminImagePrompts.tsx`, `api/media.ts`, and any other file the guard lists for copy words
- Test: `tests/template-clean.test.ts`

- [ ] **Step 1: List what's left**

Run: `node --test tests/template-clean.test.ts 2>&1 | grep -v -i "dcoim""qij" | grep -E "^\s*[a-zA-Z].*:[0-9]+: "`
This prints every copy hit (Cloudinary URLs are Task 6).

- [ ] **Step 2: Rewrite each hit by these rules**

- **Policy pages:** keep every section and legal structure. The business is `{BRAND.name}` (or `BRAND.legalName || BRAND.name`). `effectiveDate="[NEED: client review and effective date]"`. Remove product-category examples specific to wellness products; use "products" generically.
- **About page:** keep the layout and every section. Replace story text with short neutral copy in the same length band, marked: e.g. heading "Our story", body `[NEED: the client's story in 2 to 3 sentences]`. Section headings name `BRAND.shortName` where they named the old brand.
- **Search suggestions, marquee, category icons, home collections, hero eyebrow, category descriptions:** generic retail wording ("New arrivals", "Best sellers", "Shop all", `` `Shop ${pageTitle} from ${BRAND.name}.` ``). Category lists that were wellness-specific become four neutral demo categories: `Category One` (`category-one`), `Category Two`, `Category Three`, `Category Four`, matching what Task 9 seeds.
- **Customer support preset messages:** "Hello, could you help me choose the right products?" style.
- **`geminiService.ts` / `AdminImagePrompts.tsx` art direction:** build the brand line from `BRAND.name` and `BRAND.description`, and drop the old palette text ("black, charcoal, rust copper and cream"). Use: `` `${BRAND.name}: ${BRAND.description} Match the store's own colours and mood.` ``
- **`api/media.ts` share-card default title and description:** `STORE_NAME` and "An online store."
- Never invent facts (years in business, customer counts, certifications, ingredient claims).

- [ ] **Step 3: Check, build, commit**

```bash
node --test tests/template-clean.test.ts 2>&1 | grep -v -i "dcoim""qij" | grep -c -E ":[0-9]+: "
npm test 2>&1 | grep -E "^# (pass|fail)"; npm run build 2>&1 | tail -2
git add -A && git commit -q -m "feat: neutral store copy with [NEED] markers (policies, about, search, home, AI prompts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: copy-hit count 0 (only Cloudinary and `index.css` comment hits remain); only template-clean fails; build passes.

---

### Task 6: Neutral images and logo

**Files:**
- Create: `scripts/make-placeholders.mjs`, `public/demo/*.svg`, `brand-assets/logo.svg`, `brand-assets/mark.svg`
- Modify: `scripts/build-logo-assets.mjs`, `scripts/demo/images.json`, and every file with a Cloudinary demo URL (`src/components/CollectionBanner.tsx`, `src/data/defaultHomeCollections.ts`, `src/pages/About.tsx`, `src/pages/Contact.tsx`, `src/pages/Wishlist.tsx`, plus any the guard lists)
- Regenerate: `public/black_logo.png`, `white_logo.png`, `logo-new.png`, `loading_black.png`, `loading_white.png`, `favicon.png`, `favicon.ico`, `icon-192.png`, `apple-touch-icon.png`, `og-image.jpg`, `src/assets/dark.png` (whatever the script outputs today)

**Interfaces:**
- Produces: `public/demo/<name>.svg` placeholders, named after the use (`hero-1.svg`, `collection-1.svg` … `collection-5.svg`, `about-1.svg` … `about-14.svg`, `contact.svg`, `wishlist.svg`, `banner.svg`). `node scripts/build-logo-assets.mjs` builds every logo file from `brand-assets/logo.svg` and `brand-assets/mark.svg`.

- [ ] **Step 1: Write the placeholder generator**

```js
// node scripts/make-placeholders.mjs
// Neutral SVG placeholders for demo images: a soft two-tone panel with a label.
// Client copies replace them with real photos (or URLs from their media store).
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/demo';
const SIZES = { hero: [1600, 900], collection: [800, 1000], about: [1200, 900], contact: [1600, 900], wishlist: [1600, 900], banner: [1600, 600] };
const LIST = [
  ['hero-1', 'hero'], ['banner', 'banner'], ['contact', 'contact'], ['wishlist', 'wishlist'],
  ...Array.from({ length: 5 }, (_, i) => [`collection-${i + 1}`, 'collection']),
  ...Array.from({ length: 14 }, (_, i) => [`about-${i + 1}`, 'about']),
];

mkdirSync(OUT, { recursive: true });
for (const [name, kind] of LIST) {
  const [w, h] = SIZES[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7e5e4"/><stop offset="1" stop-color="#d6d3d1"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="${Math.round(h / 18)}" fill="#57534e">[NEED: ${name} image]</text>
</svg>`;
  writeFileSync(`${OUT}/${name}.svg`, svg);
}
console.log(`wrote ${LIST.length} placeholders to ${OUT}`);
```
Run: `node scripts/make-placeholders.mjs`. Expected: `wrote 23 placeholders to public/demo`.

- [ ] **Step 2: Swap every Cloudinary demo URL**

List: `grep -rn "dcoim""qij" src scripts api`. Replace each URL with the matching local file, in the order it appears: hero/banner images → `/demo/hero-1.svg` or `/demo/banner.svg`; the five home collections → `/demo/collection-1.svg` … `-5.svg`; the 14 About images → `/demo/about-1.svg` … `-14.svg`; Contact → `/demo/contact.svg`; Wishlist → `/demo/wishlist.svg`. Remove the now-unused `CLD` constant in `About.tsx`. If a component builds a Cloudinary transform URL from a base (e.g. `f_auto,q_auto,w_1600`), pass the local path straight through. Set `scripts/demo/images.json` to `{}` (the cache of the old client's generated images).

- [ ] **Step 3: Placeholder logo and the logo script**

`brand-assets/logo.svg` (wordmark, dark ink, transparent background):
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300"><text x="600" y="190" text-anchor="middle" font-family="Georgia, serif" font-size="150" letter-spacing="6" fill="#1c1917">Demo Store</text></svg>
```
`brand-assets/mark.svg` (monogram for favicon and loader):
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#1c1917"/><text x="256" y="330" text-anchor="middle" font-family="Georgia, serif" font-size="260" fill="#fafaf9">D</text></svg>
```
Rewrite `scripts/build-logo-assets.mjs` so it reads these two SVGs instead of cropping `client-assets/logo-transparent.png`, and produces the **same output files** it lists in its header today: the wordmark in dark ink (`black_logo.png`, `logo-new.png`) and recoloured light (`white_logo.png`, `src/assets/dark.png`: replace `#1c1917` with `#fafaf9` in the SVG text before rendering); the mark for `loading_*`, `favicon.png` (48), `icon-192.png` (192), `apple-touch-icon.png` (180), `favicon.ico` (copy of the 48 px PNG is acceptable); `og-image.jpg` = 1200×630 `#fafaf9` with the wordmark centred. Keep `src/assets/login-cart.png` and `shopping-bags.png` as they are if they hold no brand mark; if they do, render the mark in their place. Header comment: "For a new client, replace brand-assets/logo.svg and mark.svg (or PNGs of the same names) and run this."

Run: `node scripts/build-logo-assets.mjs` then open `public/black_logo.png` and `public/favicon.png` with the Read tool to confirm they show "Demo Store" / "D".

- [ ] **Step 4: Check, build, commit**

```bash
grep -rn "dcoim""qij" src scripts api public | wc -l
npm test 2>&1 | grep -E "^# (pass|fail)"; npm run build 2>&1 | tail -2
git add -A && git commit -q -m "feat: neutral placeholder images and Demo Store logo; logo files built from brand-assets/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: 0; only template-clean fails (index.css comments); build passes.

---

### Task 7: Neutral default theme (guard goes green)

**Files:**
- Modify: `src/index.css` (token values and comments), `tailwind.config.ts` (font families only if they name the old fonts), `index.html` (Google Fonts link)
- Modify: `docs/ui-system.md` (neutral wording)

- [ ] **Step 1: See the current tokens and fonts**

Run: `sed -n 1,140p src/index.css` and `grep -n "fonts.googleapis" index.html` and `grep -n "fontFamily" -A 8 tailwind.config.ts`. Note every colour token in `:root` and `.dark`, and the heading/body fonts.

- [ ] **Step 2: Neutral values, same token names**

- Light: background `#fafaf9`, foreground `#1c1917`, card `#ffffff`, muted `#f5f5f4` / muted-foreground `#57534e`, border `#e7e5e4`, primary `#1c1917` / primary-foreground `#fafaf9`, accent/highlight `#2563eb` (blue 600) with foreground `#ffffff`, destructive unchanged.
- Dark: background `#0c0a09`, foreground `#fafaf9`, card `#1c1917`, muted `#292524` / muted-foreground `#a8a29e`, border `#292524`, primary `#fafaf9` / primary-foreground `#0c0a09`, accent `#60a5fa` with foreground `#0c0a09`.
- Any other brand token (charcoal, copper, cream, bronze…) maps to its closest neutral above; keep the names so components keep working (Part 3 renames if needed).
- Fonts: headings `"Fraunces", Georgia, serif`, body `"Inter", system-ui, sans-serif` via one Google Fonts link (`family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..700&display=swap`).
- Comments: "Ishaputra … design system" → "Store design system (template defaults; each client gets their own values)". "the modern apothecary" → "surfaces and textures". Keep the CSS rules.
- Use the same HSL/hex format the file already uses (convert if the file stores HSL triplets like `24 10% 10%`).

- [ ] **Step 3: Contrast check**

For each text/background pair (foreground/background, muted-foreground/background, primary-foreground/primary, accent-foreground/accent, in light and dark), compute the WCAG ratio:
```bash
node -e '
const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const r=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return ((x+0.05)/(y+0.05)).toFixed(2)};
for (const [n,a,b] of [["fg/bg","#1c1917","#fafaf9"],["muted","#57534e","#fafaf9"],["accent","#ffffff","#2563eb"],["d fg/bg","#fafaf9","#0c0a09"],["d muted","#a8a29e","#0c0a09"],["d accent","#0c0a09","#60a5fa"]]) console.log(n, r(a,b));'
```
Expected: every ratio ≥ 4.5.

- [ ] **Step 4: Guard green, full suite, build, commit**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
npm run build 2>&1 | tail -2
git add -A && git commit -q -m "feat: neutral default theme and fonts; template-clean guard passes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `# fail 0` (template-clean now passes); build passes.

---

### Task 8: Feature switches

**Files:**
- Rewrite: `src/config/features.ts`
- Create: `src/components/FeatureGate.tsx`, `tests/features.test.ts`
- Modify: `src/App.tsx`, `src/pages/admin/AdminLayout.tsx`, `src/components/Header.tsx`, `src/components/MobileHeader.tsx`, `src/pages/Account.tsx`, `src/pages/Index.tsx` (home sections), `src/components/Footer.tsx`, and the other current readers of the two old constants (`grep -rln "DELIVERY_PARTNERS_ENABLED\|SILVER_PRICING_ENABLED" src`)
- Modify (money default): `src/lib/rewards.ts` (then `npm run sync:rewards` updates `api/create-order.ts`, `api/notify-order.ts`)

**Interfaces:**
- Produces:
  - `type FeatureKey = 'deliveryPartners' | 'silverPricing' | 'dealers' | 'rewards' | 'scratchWin' | 'giftCards' | 'videoCalls' | 'newsletter' | 'whatsappInbox' | 'whatsappEnquiry' | 'aiImagePrompts' | 'testimonials' | 'videoStories' | 'gallery'`
  - `FEATURES: Record<FeatureKey, boolean>`, `FEATURE_INFO: Record<FeatureKey, { label: string; description: string; dependsOn?: FeatureKey[] }>`, `isOn(key: FeatureKey): boolean`
  - `<FeatureGate feature={key} fallback="/">{children}</FeatureGate>`
  - Part 2's `FEATURES.md` is written from `FEATURE_INFO`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, FEATURE_INFO, isOn, type FeatureKey } from '../src/config/features.ts';

const keys = Object.keys(FEATURES) as FeatureKey[];

test('every feature has a label and description', () => {
  assert.deepEqual(Object.keys(FEATURE_INFO).sort(), [...keys].sort());
  for (const k of keys) {
    assert.ok(FEATURE_INFO[k].label.length > 0, k);
    assert.ok(FEATURE_INFO[k].description.length > 10, k);
  }
});

test('dependencies point at real features and have no cycles', () => {
  const visit = (k: FeatureKey, seen: Set<FeatureKey>) => {
    assert.ok(!seen.has(k), `cycle at ${k}`);
    for (const d of FEATURE_INFO[k].dependsOn ?? []) {
      assert.ok(keys.includes(d), `${k} depends on unknown ${d}`);
      visit(d, new Set([...seen, k]));
    }
  };
  keys.forEach((k) => visit(k, new Set()));
});

test('isOn is false when a dependency is off', () => {
  for (const k of keys) {
    const deps = FEATURE_INFO[k].dependsOn ?? [];
    if (deps.some((d) => !isOn(d))) assert.equal(isOn(k), false, k);
    else assert.equal(isOn(k), FEATURES[k], k);
  }
});

test('scratch & win depends on rewards', () => {
  assert.ok(FEATURE_INFO.scratchWin.dependsOn?.includes('rewards'));
});

test('template defaults', () => {
  assert.equal(FEATURES.deliveryPartners, false);
  assert.equal(FEATURES.silverPricing, false);
});
```
Run: `node --test tests/features.test.ts`. Expected: FAIL (`FEATURES` not exported).

- [ ] **Step 2: Rewrite `src/config/features.ts`**

```ts
/**
 * Feature switches: one place to turn whole product areas on or off for a store.
 *
 * Off means: the pages redirect away (and are never loaded), the menu, footer,
 * account and admin links are hidden, and home-page sections don't render. The
 * code stays, so a client can turn a feature on later without a rebuild of it.
 *
 * Money features (rewards, scratchWin, dealers) also have a runtime setting an
 * admin turns on in the admin panel; it starts off. This switch decides whether
 * the feature exists in the store at all.
 */
export type FeatureKey =
  | 'deliveryPartners' | 'silverPricing' | 'dealers' | 'rewards' | 'scratchWin'
  | 'giftCards' | 'videoCalls' | 'newsletter' | 'whatsappInbox' | 'whatsappEnquiry'
  | 'aiImagePrompts' | 'testimonials' | 'videoStories' | 'gallery';

export const FEATURES: Record<FeatureKey, boolean> = {
  deliveryPartners: false,
  silverPricing: false,
  dealers: true,
  rewards: true,
  scratchWin: true,
  giftCards: true,
  videoCalls: true,
  newsletter: true,
  whatsappInbox: true,
  whatsappEnquiry: true,
  aiImagePrompts: true,
  testimonials: true,
  videoStories: true,
  gallery: true,
};

export interface FeatureInfo {
  label: string;
  description: string;
  dependsOn?: FeatureKey[];
}

export const FEATURE_INFO: Record<FeatureKey, FeatureInfo> = {
  deliveryPartners: { label: 'Delivery partners', description: 'In-house delivery staff: delivery login, dashboard, route map and OTP handover; Admin > Delivery boys. Off = the admin updates order progress directly.' },
  silverPricing: { label: 'Live metal-rate pricing', description: 'Silver jewellery only: header rate widget, Admin > Silver rate, grams x rate on the product form.' },
  dealers: { label: 'Dealer membership', description: 'Businesses apply on /dealer; admin approves; approved dealers see dealer prices above a minimum order. Admin > Dealers.' },
  rewards: { label: 'Rewards and loyalty card', description: 'Points earned on delivered orders, the wallet page, tiers and the member card; points can be redeemed at checkout.' },
  scratchWin: { label: 'Scratch & Win', description: 'A scratch card after a delivered order, with point prizes.', dependsOn: ['rewards'] },
  giftCards: { label: 'Gift cards', description: 'Gift cards customers buy and redeem; Admin > Gift cards.' },
  videoCalls: { label: 'Video consultations', description: 'Customers request a video call; /call pages, My video calls, Admin > Video calls.' },
  newsletter: { label: 'Newsletter', description: 'Footer sign-up form and Admin > Newsletter subscriber list.' },
  whatsappInbox: { label: 'WhatsApp inbox', description: 'Two-way WhatsApp messages and templates in Admin > WhatsApp (needs a WhatsApp Business API account).' },
  whatsappEnquiry: { label: 'WhatsApp enquiry button', description: 'The "Enquire on WhatsApp" button on product pages and support (needs BRAND.whatsapp).' },
  aiImagePrompts: { label: 'AI image prompts', description: 'Admin > AI prompts: writes banner image prompts with Gemini (needs GEMINI_API_KEY).' },
  testimonials: { label: 'Testimonials', description: 'Home-page testimonials section and Admin > Testimonials. Real testimonials only; the section hides when there are none.' },
  videoStories: { label: 'Video stories', description: 'Home-page YouTube showcase and Admin > Video stories.' },
  gallery: { label: 'Gallery', description: 'Home-page gallery and Admin > Gallery.' },
};

export function isOn(key: FeatureKey): boolean {
  return FEATURES[key] && (FEATURE_INFO[key].dependsOn ?? []).every(isOn);
}
```
Run: `node --test tests/features.test.ts`. Expected: PASS.

- [ ] **Step 3: `src/components/FeatureGate.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isOn, type FeatureKey } from '@/config/features';

/** Renders children only when the feature is on; otherwise redirects (the page chunk never loads). */
export function FeatureGate({ feature, fallback = '/', children }: { feature: FeatureKey; fallback?: string; children: ReactNode }) {
  return isOn(feature) ? <>{children}</> : <Navigate to={fallback} replace />;
}
```

- [ ] **Step 4: Move the two old constants to `isOn()`**

Replace `DELIVERY_PARTNERS_ENABLED` with `isOn('deliveryPartners')` and `SILVER_PRICING_ENABLED` with `isOn('silverPricing')` in every file from `grep -rln "DELIVERY_PARTNERS_ENABLED\|SILVER_PRICING_ENABLED" src`, updating the imports to `import { isOn } from '@/config/features'`. Then `grep -rn "DELIVERY_PARTNERS_ENABLED\|SILVER_PRICING_ENABLED" src` must print nothing. Build to confirm.

- [ ] **Step 5: Wire each new switch**

For each feature below, find its touch points with the grep given and apply the same pattern everywhere:
- **Customer route:** `element={<FeatureGate feature="KEY"><Page /></FeatureGate>}`.
- **Admin route:** `element={<FeatureGate feature="KEY" fallback="/admin/dashboard"><Page /></FeatureGate>}`.
- **Admin sidebar** (`AdminLayout.tsx`): `...(isOn('KEY') ? [{ ...entry }] : [])`, as the delivery-boys entry does today.
- **Links, buttons and home sections:** `{isOn('KEY') && <Thing />}`.

| Key | Find touch points with |
|---|---|
| `dealers` | `grep -rln -i "dealer" src --include=*.tsx` (route `/dealer`, admin `dealers`, account link, Commerce > Dealers tab, product-form dealer price field) |
| `rewards` | `grep -rln -E "wallet|LoyaltyPoints|loyalty|rewards" src --include=*.tsx` (route `/wallet`, header points button, account card tier, checkout redeem block, admin customer tier, Commerce > Rewards tab) |
| `scratchWin` | `grep -rln -i "scratch" src --include=*.tsx` (wallet/order-page cards, Commerce > Scratch tab) |
| `giftCards` | `grep -rln -i "giftcard\|gift-card\|gift card" src --include=*.tsx` (admin `gift-cards`, checkout gift-card field) |
| `videoCalls` | `grep -rln -E "VideoCall|/call|my-video-calls" src --include=*.tsx` (routes `/call`, `/call/:callId`, `/my-video-calls`, admin `video-calls`, request button/modal) |
| `newsletter` | `grep -rln -i "newsletter" src --include=*.tsx` (footer form, admin `newsletter`) |
| `whatsappInbox` | admin route `whatsapp` and its sidebar entry (`grep -n "whatsapp" src/App.tsx src/pages/admin/AdminLayout.tsx`) |
| `whatsappEnquiry` | `grep -rln "WhatsAppEnquiryButton" src` |
| `aiImagePrompts` | admin route `image-prompts`, its sidebar entry, and any "generate prompt" button outside that page (`grep -rln "geminiService" src`) |
| `testimonials` | `grep -rln -i "testimonial" src --include=*.tsx` (home section, admin `testimonials`) |
| `videoStories` | `grep -rln -E "YouTubeShowcase|videos" src --include=*.tsx` (home section, admin `videos`) |
| `gallery` | `grep -rln -i "gallery" src --include=*.tsx` (home section, admin `gallery`) |

Rules:
- Don't gate shared logic (cart, checkout pricing, order totals, `api/*`). Only UI that shows or links to the feature.
- Checkout with `rewards` or `giftCards` off: hide the redeem / gift-card inputs; the request sends no points or gift card, which the server already handles as "none".
- **Testimonials real-content check:** with the section on and no testimonials in Firestore, the home page must render nothing for it (no sample quotes). If it falls back to hard-coded examples, remove the fallback.
- After each feature: `npm run build 2>&1 | tail -2`.

- [ ] **Step 6: Rewards runtime default off (money code)**

In `src/lib/rewards.ts`, inside the `rewards-core` block, change the default settings `enabled: true` to `enabled: false` and add the comment `// Off until an admin turns rewards on (template default).` Then:
```bash
npm run sync:rewards
grep -n "enabled: true" api/create-order.ts api/notify-order.ts
npm test 2>&1 | grep -E "^# (pass|fail)"
```
The rewards defaults in the api copies now read `enabled: false` (any remaining `enabled: true` there must be a different setting; check its context). If existing tests assumed rewards on by default, give those tests explicit `enabled: true` settings rather than changing the default back. Scratch & Win (`src/lib/scratchWin.ts`) and dealers (`src/lib/dealer.ts`) already default to `enabled: false`; confirm with `grep -n "enabled:" src/lib/scratchWin.ts src/lib/dealer.ts`.

**Reviewer agent (money):** one agent reads `api/create-order.ts` and `api/notify-order.ts` and confirms, citing lines, that with **no** `siteSettings/rewards` document: no points are earned on delivery, no points can be redeemed at checkout, no scratch card is issued, and no other default flips. Fix anything it confirms, re-run tests.

- [ ] **Step 7: Switch-off smoke check (build-level)**

Temporarily set every switch to `false` in `FEATURES`, run `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` and `npm run build`. Expected: the error count is no higher than the Task 1 baseline (the source has some pre-existing type errors) and the build passes. Restore the defaults. (The visual check with switches off is in Task 10.)

- [ ] **Step 8: Tests, build, commit**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"; npm run build 2>&1 | tail -2
git add -A && git commit -q -m "feat: one feature-switch object with labels and dependencies; FeatureGate on every optional page; rewards runtime default off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `# fail 0`; build passes.

---

### Task 9: Neutral demo catalogue

**Files:**
- Modify: `scripts/demo/content.mjs`, `src/data/defaultHomeCollections.ts`, `scripts/seed-demo.mjs` (only if it reads old-client fields), `scripts/lib/catalog.mjs` (only if it hard-codes old categories)

**Interfaces:**
- Consumes: placeholder images from Task 6 (`/demo/*.svg`).
- Produces: `scripts/demo/content.mjs` exports the same names and shapes as today (`STYLE`, `CATEGORIES`, product lists…) so `seed-demo.mjs` keeps working; Task 10 seeds it into the demo project.

- [ ] **Step 1: Read the current shapes**

Run: `grep -n "^export" scripts/demo/content.mjs` and `sed -n 1,40p src/data/defaultHomeCollections.ts`.

- [ ] **Step 2: Rewrite the content**

- `STYLE`: `'clean, neutral product photography on a light background, soft daylight'`.
- `CATEGORIES`: the four from Task 5 (`Category One` … `Category Four`, slugs `category-one` …).
- Products: 3 per category (12 total), named `Sample product 1` … `Sample product 12`, prices spread ₹299 to ₹2,499 so every `priceRanges` band has items, descriptions `[NEED: product description]`, image `/demo/collection-N.svg` (reuse 1 to 5). Keep any required fields the seed script expects (stock, SKU, weight…) with plain neutral values.
- **No ratings or review counts** in demo products (real content only). If the shape requires a rating field, use `0` / empty, matching what the UI treats as "no reviews yet".
- `src/data/defaultHomeCollections.ts`: the four categories plus "Shop all", images `/demo/collection-1.svg` … `-5.svg`.
- If `seed-demo.mjs` calls the paid image generator when `images.json` lacks an entry, make it skip generation when the image is a local `/demo/` path. **Never run the paid generator.**

- [ ] **Step 3: Check, build, commit**

```bash
node -e "import('./scripts/demo/content.mjs').then(m => console.log(Object.keys(m)))"
npm test 2>&1 | grep -E "^# (pass|fail)"; npm run build 2>&1 | tail -2
git add -A && git commit -q -m "feat: neutral demo catalogue (4 categories, 12 sample products, no ratings)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: the same export names as before; `# fail 0`; build passes.

---

### Task 10: Demo Firebase project, visual check, handoff

**Files:**
- Create: `.env` (git-ignored, demo project keys only), `scripts/qa/template-shots.sh`
- Modify: `docs/HANDOFF.md`, `CLAUDE.md` (one line: demo project id)
- Modify (source repo, docs only): `C:\Users\chala\OneDrive\Desktop\Ishaputra Botanicals\ssecommerce\docs\HANDOFF.md`

- [ ] **Step 1: The owner creates the free demo project (owner action, about 10 minutes)**

Give the owner these steps and wait:
1. Open console.firebase.google.com with the Dream Team Google account → **Add project** → name `template-demo` (if taken, Firebase adds a suffix; tell Claude the final ID) → turn Google Analytics off → Create. Stay on the free Spark plan.
2. **Build > Firestore Database** → Create database → production mode → region `asia-south1`.
3. **Build > Authentication** → Get started → enable **Email/Password**.
4. **Project settings > General > Your apps** → add a **Web app** (`template-demo-web`) → copy the `firebaseConfig` values.
5. **Project settings > Service accounts** → Generate new private key → save the file into the template folder (it is git-ignored by `*firebase-adminsdk*.json`).
6. Tell Claude "demo project ready" (don't paste keys into chat; Claude reads them from the files).

- [ ] **Step 2: Local `.env` and rules (owner OK required for the deploy)**

Create `.env` from `.env.example` with the six `VITE_FIREBASE_*` values from the owner's web-app config (the owner pastes them into `.env` directly, or Claude reads them from a file the owner saves), and `FIREBASE_ADMIN_SDK_BASE64` from the service-account file (`base64 -w0 <file>`). Confirm `.env` is ignored: `git check-ignore .env` prints `.env`. Update `.firebaserc` if the final project ID differs from `template-demo`, and `CLAUDE.md` line: "Demo Firebase project: `<id>` (Dream Team's, free; demo data only)."

Ask the owner before deploying rules and indexes to the demo project, then: `npx firebase deploy --only firestore:rules,firestore:indexes,storage --project <id>` (or `node scripts/qa/deploy-rules.mjs` if that is the deploy path the scripts use; check its header).

- [ ] **Step 3: Seed demo data**

Run `node scripts/seed-demo.mjs` (check its header for flags; it must target the demo project from `.env`). Confirm 4 categories and 12 products exist (the script's own summary, or a REST read of `products`).

- [ ] **Step 4: Screenshots, switches on**

Start the dev server on port 5182 (never 5173, never `0.0.0.0`): `npx vite --port 5182 --strictPort --host 127.0.0.1` in the background. Then:
```bash
MSYS_NO_PATHCONV=1 node scripts/qa/ui-shots.mjs --out ../template-shots/on --widths 390,1440 --themes light,dark --fold / /products /product/<first-id> /cart /about /contact /privacy-policy /auth/login
```
Read a sample of the images (home, product, about at 390 and 1440, light and dark). Check: "Demo Store" logo and name, neutral colours, placeholder images, `[NEED: ...]` markers where expected, no old-client word anywhere, no sideways overflow, no console errors in the log next to the images.

- [ ] **Step 5: Screenshots, switches off**

Set every new switch to `false`, restart the dev server, run the same command with `--out ../template-shots/off` plus `/wallet /dealer /call`. Expected: `/wallet`, `/dealer`, `/call` land on `/`; header, footer and account show no links to switched-off features; home shows no testimonials, video or gallery sections. Restore the defaults afterwards.

- [ ] **Step 6: Final checks and commit**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
npm run build 2>&1 | tail -2
git status --short | grep -E "\.env$|adminsdk" ; echo "secrets-staged-exit=$?"
git add -A && git commit -q -m "chore: demo project wiring docs; Part 1 clean base complete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `# fail 0`; build passes; `secrets-staged-exit=1` (nothing secret listed).

- [ ] **Step 7: Handoffs**

- Template `docs/HANDOFF.md`: State = "Part 1 done (commit <hash>): neutral Demo Store, 14 feature switches, demo project `<id>` seeded, screenshots in `Desktop/template-shots/`." Next steps = "Part 2: write the plan for instruction files and scripts (spec section 'Building the template', item 2)."
- Ishaputra `ssecommerce/docs/HANDOFF.md`: one line under State: "Ecommerce Template Part 1 done; the template lives in `Desktop\Ecommerce Template\` (its own repo and handoff)." Commit it in the Ishaputra repo (docs only).

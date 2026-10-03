# Ishaputra UI system

The shared pieces every page builds on. Rule zero is still CLAUDE.md: keep the layout, change the design. Use these instead of one-off classes; if something is missing, add it here rather than inventing a local version.

## 1. Tokens

All colours are HSL triplets in `src/index.css` with light and dark values, so Tailwind opacity modifiers work (`bg-primary/10`).

| Role | Tailwind | Notes |
|---|---|---|
| Page, text | `bg-background`, `text-foreground` | |
| Raised surface | `bg-card text-card-foreground` | `tx-sheet` adds the paper texture |
| Inset, hover | `bg-muted` | row hover `hover:bg-muted/60` |
| Secondary text | `text-muted-foreground` | at least 4.5:1 on background, card and muted. Never `text-muted-foreground/NN` |
| Accent (copper) | `bg-primary`, `text-primary` | the only accent. Bronze `highlight` is for small emphasis text, never fills |
| Menu highlight, ghost hover | `bg-accent` | now a soft paper tone, not copper |
| Borders | `border-border`; fields `border-input` (3:1) | hairlines inside panels `border-foreground/[0.08]` |
| Charcoal bands | `bg-charcoal`, `text-charcoal-foreground` | on charcoal, text at least `/60` |
| Destructive | `text-destructive`, `bg-destructive` | filled only in ConfirmDialog |

**Status tones** (`--status-<tone>-fg/-bg/-line`): `success`, `danger`, `warning`, `info`, `returns`, `neutral`.
Classes: `text-status-success-fg`, `bg-status-success-bg`, `border-status-success-line`, `border-l-status-danger-fg` ... All fg-on-bg pairs measure 5.2 to 8.6:1 in both themes.

**Radius**: `rounded-panel` (18px: dialogs, sheets, panels, notices), `rounded-card` (12px: product cards, menus, popovers, toasts, list tiles), `rounded-control` (6px: buttons, inputs, selects, segmented controls, filter chips), `rounded-chip` (4px: badges, status chips, `tag-dark`, `chip-off`). `rounded-full` only for icon buttons, avatars, switches, dots. No `rounded-2xl/3xl/[22px]`.

**Opacity steps** added: 6, 7, 8, 11, 12, 18, 28, 42 (`bg-foreground/8` now works).

**Z-index** (`z-*` utilities, CSS `var(--z-*)`): `raised` 10 (buttons above a card's stretched link) · `sticky` 30 · `header` 40 · `overlay` 50 (dialog + scrim) · `drawer` 60 (Sheet, Drawer) · `popover` 70 (menus, selects, tooltips) · `toast` 80 · `loader` 90 · `grain` 100 (pointer-events none). Never `z-[999]`. Sticky sidebars: `top-[var(--sticky-top)]` (80px, 136px from lg).

**Surfaces and helpers** (in `src/index.css`): `tx-paper`, `tx-sheet`, `tx-slate`, `tx-contour`, `panel` (rounded-panel + hairline + `--shadow-panel`; Tailwind `shadow-panel`), `card-product`, `tile-img`, `price-now`, `price-was`, `chip-off`, `tag-dark` (10px, charcoal/90), `eyebrow-no` (words only, no numbers), `btn-copper`, `btn-line`, `btn-round`, `link-arrow`.
Text on photos: `photo-scrim` (bottom, charcoal 90% to transparent) or `photo-scrim-side` (desktop hero), plus `on-photo` on the text. Google Maps iframe: class `map-embed` (dimmed in dark mode).

**Icons**: lucide only. Every `svg.lucide` is stroke 1.5 globally; per-icon `strokeWidth` props no longer do anything, delete them when you touch a file. Override with a utility (`[stroke-width:2.5]`) when truly needed. Sizes: 16px inline, 20px in controls, 24px nav. Decorative icons get `aria-hidden="true"`.

## 2. Motion

CSS tokens and Tailwind keys:

| Use | Tailwind | Value |
|---|---|---|
| Press feedback | `duration-press` | 140ms |
| Hover colour | `duration-hover` | 150ms |
| Tooltip | `duration-tooltip` | 160ms |
| Menu, select, popover | `duration-dropdown` | 200ms |
| Dialog | `duration-modal` | 240ms |
| Sheet / drawer | `duration-drawer` + `ease-drawer` | 300ms |
| Any exit | `duration-exit` | 180ms |
| Scroll reveal | `duration-reveal` | 320ms |

`ease-out` and `ease-in-out` are overridden globally with the strong curves (`cubic-bezier(0.23,1,0.32,1)`, `(0.77,0,0.175,1)`). `future.hoverOnlyWhenSupported` is on: every `hover:` utility only applies on devices that can hover.

Rules: animate only `transform` and `opacity`; name the properties (`transition-[transform,background-color]`, never `transition-all`); never start from `scale(0)` (min 0.9); popovers scale from their trigger, dialogs stay centred; exits faster than entries; nothing over 300ms except reveals; never animate keyboard-initiated or very frequent actions; every pressable gets `active:scale-[0.97]`.

`src/lib/motion.ts` (import from `framer-motion`, not `motion/react`):

| Export | Use |
|---|---|
| `EASE_OUT`, `EASE_IN_OUT`, `EASE_DRAWER`, `DUR` | raw values |
| `fadeUp` | content appearing in place (message, swapped panel): `<motion.div {...fadeUp}>` |
| `pop` | small things popping in (badge, check mark) |
| `sheetBottom`, `sheetRight` | hand-built panels only; prefer the Sheet primitive |
| `reveal` | whole-section scroll reveal; use `<Reveal>` |
| `staggerDelay(i)` | 40ms per item, capped at 8 |
| `tap` | `whileTap={tap}` on `motion.button` |

**Reduced motion**: `<MotionConfig reducedMotion="user">` at the app root makes framer drop transforms and keep fades. A global CSS block keeps colour/opacity transitions (150ms) and stops marquee, foil sweeps, `animate-ping/pulse/bounce`; Radix enter/exit animations keep their fade but lose slide and zoom. Infinite loops you write must also check `useReducedMotion()` and stop when off screen or the tab is hidden (`useAutoScroll` does this).

**Route transitions** (App.tsx): navigation runs in a React transition (old page stays until the next chunk is ready); the Suspense fallback is `RouteSkeleton`, visible only after 150ms; each page fades in 200ms on a keyed wrapper (`.route-enter`, opacity only). Admin pages share one key, so the admin shell does not refade on every click.

`<Reveal>` (`src/components/Reveal.tsx`): wraps a whole section, fades up 12px once when 10% is visible. Never wrap individual products. Props: `delay` (seconds) plus any `motion.div` props.

## 3. Loading: skeletons, not spinners

`src/components/skeletons/index.tsx`. Each root has `aria-busy="true"` and a screen-reader label (`label` prop; pass `label=""` when nested inside another skeleton). Render them inside the normal page chrome (Header/Footer stay) at the final height.

`RouteSkeleton` · `ProductCardSkeleton` · `ProductGridSkeleton({count=8})` · `ProductRowSkeleton({count=5, itemClassName="w-[230px]"})` · `HeroSkeleton` (tx-slate at hero size, no text) · `SectionSkeleton({title, children})` · `PanelSkeleton({lines=3})` · `ListSkeleton({rows=3, thumb})` · `TableSkeleton({rows=8, cols=5})` · `FormSkeleton({fields=6})` · `DetailSkeleton` (order/customer page) · `StatCardsSkeleton({count=4})` · `MediaGridSkeleton({count=8})` · `AuthCardSkeleton`.

`<Skeleton className="h-4 w-1/2" />` (`ui/skeleton`) is the single block: `bg-foreground/[0.06]`, 6px radius, still under reduced motion.

`<Spinner size={16} label? />` (`ui/spinner`) only inside buttons: `<Button disabled={saving}>{saving && <Spinner />}Save</Button>`.

## 4. Status and feedback

**`getOrderStatus(status, order?)`** (`src/lib/orderStatus.ts`) returns `{ label, tone, icon }` for every Order status: pending (warning), processing/packed/shipped/outForDelivery (info), delivered/refunded (success), cancelled/deliveryFailed "Delivery attempted" (danger), returnRequested/returnScheduled/picked/returned (returns). Pass the order to get "Pending, COD", "Needs review" (danger, for `needsManualReview`), outbound `picked` as "Out for delivery", and "Late return" (neutral) when a return came after the 7-day window. `ORDER_STATUSES` lists them in order. `getProductStatus({ isActive, stock })` gives Live / Hidden / Sold out.

**`<StatusBadge tone label icon? dot? pulse? />`** (`ui/status-badge`): 24px chip, icon + label. `<OrderStatusBadge status={o.status} order={o} />` wraps the map. `STATUS_TONE_CLASSES[tone]` gives the chip classes for custom rows.

**`<Notice tone title? icon? action? compact?>`** (`ui/notice`): every banner, callout and inline error. Paper sheet, 3px left rule in the tone colour, tone icon, normal body text. `role="alert"` for danger, `role="status"` otherwise (override with `role`). Replaces gradient banners and red/green/purple boxes. (`ui/alert` is restyled to the same look for old callers.)

**`<EmptyState icon title description? action? secondaryAction? as? />`** (`src/components/EmptyState.tsx`): charcoal 56px tile with a bronze icon, heading-font title, one muted line, one `btn-copper` action (`{ label, to }` or `{ label, onClick }`) and an optional `link-arrow`.

**Toasts**: Sonner only (`<Sonner />` in App). `import { toast } from 'sonner'`; `toast('Saved')`, `toast.success()`, `toast.error()`. Undo: `toast('Removed from cart', { action: { label: 'Undo', onClick } })`. Old `useToast()` calls still work (`src/hooks/use-toast.ts` adapter; `variant: 'destructive'` becomes `toast.error`). Copy: say what happened, sentence case, no "!" or emoji.

## 5. Overlays

All Radix. Dialog: centred, fade + zoom from 0.96 (240ms in, 180ms out), charcoal/60 scrim with 2px blur, `rounded-panel bg-card`, built-in 40px Close button labelled "Close" (`hideClose` to drop it). Sheet (`side`): drawer curve 300ms, exit 180ms, bottom sheets `rounded-t-panel` with a safe-area pad (`hideClose` available). Menus, popovers, selects, tooltips scale from their trigger (`origin-[var(--radix-*-transform-origin)]`), `rounded-card`, highlighted item `bg-accent`. Tooltip: charcoal chip, 400ms delay then instant between tooltips (set on the `TooltipProvider` in App). Escape closes, focus is trapped and returned.

**`<ConfirmDialog open onOpenChange title description confirmLabel cancelLabel="Cancel" tone="danger"|"default" onConfirm />`** (`src/components/ConfirmDialog.tsx`): every destructive or irreversible action. Title names the object ("Delete this address?"), confirm label 1-3 words. Cancel has focus on open. If `onConfirm` returns a promise, the button shows a spinner and the dialog closes when it resolves (stays open if it throws).

**Focus return for dialogs opened from state.** Radix returns focus to the opener only when a `*Trigger` opened the dialog. When one opens from state (`open={x}`), focus falls to `<body>` on close. For ConfirmDialog pass `returnFocusRef={buttonRef}`; for a Dialog or Sheet add `onCloseAutoFocus={(e) => { e.preventDefault(); triggerRef.current?.focus(); }}` to its Content.

## 6. Buttons

| Level | Use |
|---|---|
| Primary (one per view) | `<Button>` (copper, h-11, 11px bold caps, `rounded-control`) or `className="btn-copper"` |
| Secondary | `<Button variant="outline">` (border-input, hover muted) or `variant="line"` / `btn-line` (current colour, for photos) |
| Tertiary | `<Button variant="ghost">` (sentence case) or `link-arrow`; `variant="link"` for inline text links |
| Destructive in a flow | `<Button variant="destructive">` (outlined danger) |
| Confirm inside ConfirmDialog | `variant="destructiveSolid"` (only there) |

Sizes: `default` h-11, `sm` h-9 (12px semibold, normal case), `lg` h-12, `icon` size-10. All have press scale 0.97 and `disabled:opacity-60 cursor-not-allowed`. Never black, bronze, blue, pink or emerald CTAs, never `rounded-full` text buttons. CTA labels at most 3 words, no wrapping. `secondary` is kept for old callers (muted fill).

**`<IconButton label variant="ghost"|"solid"|"onPhoto" size="default"|"sm"|"lg" tooltip? asChild?>`** (`ui/icon-button`): every icon-only control. `label` is required and becomes `aria-label` ("Close", "Open menu", "Add Shilajit to cart"); `tooltip` (true or a string) shows it on hover/focus. Round; default 44px on touch, 40px with a mouse; an invisible 4px ring extends the hit area. `asChild` to render a `<Link>`. Pass the icon as the child: `<IconButton label="Close"><X /></IconButton>` (the icon is sized by the button).

**`<WishlistToggle name saved onToggle variant? size? />`** (`src/components/WishlistToggle.tsx`): the heart. Controlled: the parent calls `useWishlist()` once (each instance syncs with Firestore, so never one per card) and passes `saved={isInWishlist(id)}` and `onToggle={() => toggleWishlist(id, name)}`. Labels "Save {name} to wishlist" / "Remove {name} from wishlist", `aria-pressed`, copper filled heart when saved. It stops click propagation, so it works inside a card link.

## 7. Product card

`<ProductCard product index? size="grid"|"row" showEmptyRating={true} className? />` (`src/components/ProductCard.tsx`).

- The title is a `<Link to="/product/:id">` stretched over the card (`after:absolute after:inset-0`); the card shows a copper outline when the link has keyboard focus. Buttons inside sit above it with `relative z-raised`. Do not add `onClick` navigation to the card.
- Title: `h3`, 13px (14px from md), two lines max, `title` attribute with the full name.
- Price: `formatINR`, was-price inline whenever `oldPrice > price`, `chip-off` when `discount > 0`.
- `grid` (default): category label, star row (kept even with no reviews, owner decision; `showEmptyRating={false}` hides it until there are reviews), full-width "Add to cart" that becomes a 40px-tall quantity stepper ("Decrease/Increase quantity of {name}").
- `row`: 230px wide home-row card, no category or stars, round 40px "Add {name} to cart" IconButton beside the price.
- Entrance: opacity + 8px, 240ms, `staggerDelay(index)`. Hover lift only with a mouse.
- The products page (`CategoryPage`) keeps its own card (owner decision); restyle it to this spec, do not swap it.

## 8. Forms and auth

- `Input`, `Textarea`, `SelectTrigger`: h-11, `rounded-control`, 16px text on phones (14px from md), `border-input`, focus = copper border + soft ring (`focus-visible:border-ring ring-2 ring-ring/30`), `aria-invalid="true"` turns the border red.
- `Checkbox` 18px `rounded-chip`, `RadioGroupItem` 18px with copper dot, `Switch` (visible track in dark mode). Checkbox, radio and slider thumb have a 44px invisible hit area. `Slider` and native `input[type=range]` share one look (4px track, 18px thumb). `Tabs` and `ToggleGroup`: muted track, selected item on card with a small shadow.
- **`<AuthCard title description? as="h1" footer?>`** (`src/components/auth/AuthCard.tsx`): panel + paper + contour, 448px, `p-6 sm:p-9`. The title is the page's h1 by default.
- **`<AuthField id label type hint? error? labelAction? passwordToggle? autoComplete inputMode ...>`** (`src/components/auth/AuthField.tsx`): small-caps label tied by `htmlFor`, 48px input, error/hint wired with `aria-describedby`, `aria-invalid` on error, Show/Hide password IconButton with `aria-pressed` for `type="password"`. Always pass `autoComplete` (`email`, `current-password`, `new-password`, `name`, `tel`) and `inputMode` where it helps. Forwards its ref to the input.

## 9. Admin

**`<AdminPageHeader title eyebrow? description? actions? leading?>{children}</AdminPageHeader>`** (`src/components/admin/AdminPageHeader.tsx`): the page's h1 in the heading font, muted description, actions on the right (one filled Button at most), `leading` for a back IconButton, `children` after the title for counts, Live indicators (`<StatusBadge tone="success" label="Live" dot pulse />`).

Raw palette classes map by role: page `bg-background`; raised `bg-card text-card-foreground`; inset `bg-muted`; row hover `hover:bg-muted/60`; borders `border-border`, inputs `border-input`; text gray-900/800 `text-foreground`, 700/600 `text-foreground/80`, 500/400 `text-muted-foreground`; primary actions `<Button>`; links `text-primary`; overlays `bg-charcoal/60`; statuses StatusBadge; category/stat chips `bg-muted text-foreground/70`.

Interim: `.dark .admin-panel` in `src/index.css` re-points the old gray/white/amber/blue/green/purple/red classes to these tokens so dark admin is on-brand today. Remove raw classes file by file; the last admin package deletes that CSS block.

## 10. Formatting and page meta

`src/lib/format.ts` (display only, never to compute a total):

- `formatINR(1499)` "₹1,499" · `formatINR(1499.5)` "₹1,499.50" · missing values "₹0"
- `formatNumber(1200)` "1,200"
- `formatDate(ts)` "3 Oct 2026" · `formatTime(ts)` "8:01 pm" · `formatDateTime(ts)` "3 Oct 2026, 8:01 pm" (Firestore Timestamp, `{seconds}`, Date, ISO or millis; "" when missing)
- `plural(3, 'item')` "3 items" · `plural(2, 'box', 'boxes')`
- `toDate(value)` for the same inputs

Prices and stats use `tabular-nums` (`price-now` and `chip-off` already do).

**`usePageMeta({ title, description, canonicalPath, image, noindex, jsonLd })`** (`src/hooks/usePageMeta.ts`): sets `document.title` ("{title} | Ishaputra Botanicals"), meta description, canonical (`SITE_URL` + path; defaults to the current path), Open Graph and Twitter tags, `robots` (noindex for account, checkout, admin, search results) and one JSON-LD script; restores the index.html defaults on unmount. The static canonical was removed from index.html, so pages that matter for search should call it.

## 11. Focus and accessibility rules

- A copper 2px outline, 2px offset, on every focusable element (`:focus-visible`), light bronze inside `tx-slate`, `bg-charcoal` and `footer`. Rows inside `overflow-hidden` panels: add `focus-inset` (outline drawn inside).
- Never `focus:outline-none` or `focus-visible:outline-none` without a replacement (fields use border + ring). The count must not grow.
- Skip link and landmarks: the shell package adds "Skip to content" to Header/MobileHeader pointing at `#main`; each page's content wrapper becomes `<main id="main" tabIndex={-1}>` (tabindex -1 never shows a ring). One h1 per page.
- Colour is never the only signal (status chips have icons, errors have text).
- Touch targets at least 44px (use IconButton or a hit-area `after:` pseudo-element).
- Copy: no em or en dashes anywhere a user sees or hears (text, toasts, placeholders, alt, aria-label); ranges "3-7 days" or "₹400 to ₹700"; sentence case; no "!" or emoji; "Sign in", "Sign up", "Create account".

## 12. Theme

Light / Dark / System (default System for new visitors). `index.html` applies the saved theme before first paint (`ishaputra-theme` in localStorage) and sets `color-scheme`; `ThemeContext` keeps the `dark`/`light` class, `color-scheme` and the `theme-color` metas in sync, and switches all transitions off for one frame during a swap so the page snaps instead of smearing. `useTheme()` gives `{ theme, setTheme, resolvedTheme }`. Every colour needs a light and a dark value; use tokens, not `dark:` overrides.

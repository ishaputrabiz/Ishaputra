# Ecommerce Template: design

Date: 2026-10-13. Status: approved in chat by the owner (Dream Team Services). Next step: the implementation plan.

## Goal

Make one master copy of the store, `Desktop\Ecommerce Template\`, that every future client store starts from. Each new store must:

- take less time and usage than building from scratch, by reusing the finished UI/UX, features and functionality;
- look unique to the client's business, not like a reskinned template;
- show the plan, a time and usage estimate, and progress from brief to launch.

The flow for a new client: run one command to make a client copy, drop the client's documents into `client-brief\`, open the folder in VS Code, and type "Proceed".

## Decisions (owner, 2026-10-13)

| Question | Decision |
|---|---|
| Base code | Ishaputra `main` (commit `4c0270f` or later), not the original Sreerasthu code. Dealer Membership and Loyalty card join later as optional features. |
| Requirements input | Both: drop any documents (PDF, Word, WhatsApp notes) into `client-brief\`. Claude reads them once, fills in `REQUIREMENTS.md`, marks gaps `[NEED: ...]` and asks only about those. Later sessions read only `REQUIREMENTS.md`. The owner can also fill in the form by hand. |
| Uniqueness | Look plus built-in section versions: 2 or 3 versions each of header, homepage hero, product card, category display, product page layout and footer, combined with per-client colours, fonts, radius, shadows, spacing and motion. Each new version built for a client goes back into the template. |
| Unused features | Turned off with a switch, never deleted. Off means hidden from customers, menus and admin, and not loaded (lazy routes). Client copies stay in step with the template. |

## Folders

- `Desktop\Ecommerce Template\`: the master copy. Its own git repo. No client work happens here, only template improvements.
- `Desktop\Ishaputra Botanicals\`: unchanged. It is a live store.
- `Desktop\<Client Name>\`: one per client, made by `scripts/new-client`. The client copy keeps the template as a git remote named `template`, so template fixes can be pulled in.

## Template contents

```
Ecommerce Template\
  CLAUDE.md          short runbook: what "Proceed" does, phase rules, hard rules
  REQUIREMENTS.md    client form: business, accounts and env, features (keep/off/new), look and feel, content
  PROGRESS.md        start-to-launch checklist with ✅ / ⏳ / ⛔ (waiting on client) and overall %
  client-brief\      the client's raw documents (read once, in Phase 0)
  docs\HANDOFF.md    working state between chats
  docs\template\
    FEATURES.md      feature map: feature, files, switch, size (S/M/L), what turning it off hides
    SECTIONS.md      section versions with screenshots and how to pick one
    ESTIMATES.md     size-to-chats table, plus actual results from past clients
  scripts\
    new-client       makes a clean client copy (see below)
    check            build + tests + screenshots in light and dark at 390 px and 1440 px
  src\ ...           neutral store code, every feature on a switch
```

`CLAUDE.md` stays short because it loads every turn; long reference lives in `docs\template\` and is read only when a phase needs it. Global rules from `~/.claude/CLAUDE.md` are not copied in.

### `scripts/new-client`

- Copies the template to a new folder, leaving out `node_modules`, `dist`, `.env*`, `*firebase-adminsdk*.json`, screenshots and any client folders.
- Runs `git init`, makes the first commit, and adds the template as the `template` remote.
- Creates an empty `client-brief\`, a fresh `PROGRESS.md` and a fresh `docs\HANDOFF.md`.
- Runs `npm install`.

## Client phases (one phase per chat)

| Phase | Work | Needs from the owner or client |
|---|---|---|
| 0. Brief | Read `client-brief\`, fill in `REQUIREMENTS.md`, list gaps, write the plan with a time and usage estimate into `PROGRESS.md` | Answers to the gaps |
| 1. Setup | Store name and details in config, feature switches, neutral demo data | — |
| 2. Look | Pick section versions, colours and fonts (using `ui-ux-pro-max`); one homepage mockup at 390 px and 1440 px | The client's yes |
| 3. Apply look | Every page in the new look, verified with `scripts/check` | — |
| 4. New features | Only what the template lacks; each feature gets its own short spec and plan | Decisions per feature |
| 5. Accounts | The client's Firebase, Razorpay, Vercel, domain and env vars | Logins and keys |
| 6. Content | Real products, policies and photos; the list of `[NEED: ...]` placeholders | Client content |
| 7. Launch | Full check, security audit, go live, admin guide for the client | Go-ahead |

Every chat ends with a three-line progress summary (done, next, waiting on), an updated `PROGRESS.md` and `docs\HANDOFF.md`, and the "new chat or continue" line from the global rules.

## Estimates

- Every feature in `FEATURES.md` and every phase has a size: S, M or L. `ESTIMATES.md` maps each size to a number of chats.
- Phase 0 adds up the client's sizes and gives a range: chats, working days, and a rough share of the weekly usage allowance.
- Exact credits can't be known in advance. After each client, the owner reads `/usage` and the actual numbers are recorded in `ESTIMATES.md`, so estimates improve with each client.
- The trial run (Part 4 below) gives the first real numbers.

## How usage stays low

- The feature map replaces exploring the codebase each session.
- Scripts do the routine work (copy, check, screenshots).
- Switched-off features are skipped when reading code.
- One phase per chat, with the handoff file instead of long chat history.
- Lean builds: one builder agent per task. A separate reviewer only for payment, money or security code.
- A mockup of one screen comes before any large build or redesign.

## Rules carried into the template

- No client names, keys, products, photos or invented content in the template. Placeholders are `[NEED: ...]` and listed for the client.
- No invented reviews, ratings, stats, badges, stock or deadlines; no `aggregateRating` schema without real reviews.
- Accessibility floor: 4.5:1 contrast, visible focus, keyboard reachable, reduced motion respected.
- Local git commits only; never deploy or touch a client's live accounts without asking.

## Building the template (four parts, in order)

1. **Clean base.** Copy Ishaputra `main` into `Desktop\Ecommerce Template\` (code only: no keys, `.env`, `node_modules`, screenshots or client assets). Remove everything client-specific (name, colours, logo, products, photos, policy text, Firebase project IDs, domain, emails, phone numbers). Use a neutral demo brand with `[NEED: ...]` placeholders. Survey every feature and put each one behind a switch in `src/config/features.ts` (today only `DELIVERY_PARTNERS_ENABLED` and `SILVER_PRICING_ENABLED` exist); off means hidden and not loaded. Done when the build and all tests pass, a search for "Ishaputra", "Sreerasthu" and the old project IDs finds nothing in the code, and `scripts/check` screenshots look right. Needs ultracode.
2. **Instruction files and scripts.** `CLAUDE.md`, `REQUIREMENTS.md`, `PROGRESS.md`, `FEATURES.md`, `ESTIMATES.md`, `scripts/new-client`, `scripts/check`. Done when `new-client` makes a working copy that builds.
3. **Section versions.** First, one mockup of one section's versions for the owner's yes. Then 2 or 3 versions each of header, hero, product card, category display, product page and footer, chosen through config (for example `sections.header = "centered"`). Each version is tested at 390 px and 1440 px in light and dark. Needs ultracode.
4. **Trial run.** A made-up test client, clearly marked as a test, goes through Phases 0 to 3 in a throwaway folder. Done when the flow works without manual fixes and the first actual time and usage numbers are in `ESTIMATES.md`.

## Out of scope for now

- Dealer Membership and Loyalty card (added to the template once finished on Ishaputra).
- Automatic syncing of fixes from client copies back to the template (done by hand, with the `template` remote).
- A web dashboard for progress (`PROGRESS.md` is enough for now).

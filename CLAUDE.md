# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Firefox MV3 WebExtension ("Lease Real Cost") that annotates UK car-lease sites
(leasing.com, leaseloco.com) with the true effective monthly cost of each deal:

```
real monthly = (initial rental + monthly × (term − 1) + admin fees) / term
```

Firefox-only by deliberate decision (personal use; Chrome deferred unless it's ever
shipped). There is no backend/webapp — the extension is the whole project. PLAN.md's
webapp section is obsolete; its leasing.com API notes are still accurate.

## Commands

```
npm run build        # esbuild bundle src/ -> dist/ (load dist/manifest.json in Firefox)
npm test             # all vitest tests (happy-dom)
npx vitest run tests/cost.test.ts        # one file
npx vitest run -t "substring of name"    # one test by name
npm run typecheck    # tsc --noEmit (strict)
```

Install for development: `about:debugging#/runtime/this-firefox` → Load Temporary
Add-on → `dist/manifest.json`.

`build.mjs` bundles the two entry points (`content`, `popup`) and **explicitly copies**
static files (manifest.json, content.css, popup.html, popup.css) into `dist/` — any new
non-TS asset must be added there or it silently won't ship. Bump the version in both
`package.json` and `src/manifest.json` when adding a feature.

## Architecture

Two bundles from `src/`: `content.ts` (injected into both sites) and `popup/popup.ts`
(toolbar settings popup). No background script; only the `storage` permission.

**Site adapter pattern.** `content.ts` picks the adapter whose `matches(hostname)` is
true from `src/sites/` (each implements `SiteAdapter` in `sites/types.ts`) and calls
`scan(settings)` on load, on settings change, and from a MutationObserver (debounced
150 ms — both sites are client-side rendered). Therefore **scan() must be idempotent**:
every annotation path guards with `hasBadge()` or a `dataset` marker
(`lrcTerm`/`lrcCfg`/`lrcKey`) before touching a card, and re-applies filtering
unconditionally so settings changes take effect on already-badged cards.

**Settings flow.** `src/settings.ts` owns the `Settings` shape (min/max term, min-only
mileage, dim|hide mode), validation (`sanitizeSettings`), and `storage.sync`
load/save/subscribe. Every access is guarded by `storageAvailable()` (`typeof browser
!== "undefined"`), so the content bundle also runs when injected into a plain page with
no extension APIs (used for live verification) — it just falls back to defaults. There
is deliberately **no max mileage** setting: more allowance at the same price is never
worse (user decision — don't re-add it).

**Shared core.** `core/cost.ts` (pure lease maths + severity thresholds for badge
colour), `core/money.ts` (GBP parse/format), `ui/badge.ts` (badge DOM),
`sites/filter.ts` (dim/hide of cards outside the term/mileage range).

**leasing.com adapter** (`sites/leasingcom/`) handles three page types:
- Deal cards: all four numbers are on the card (data attributes with regex-over-text
  fallbacks in `dom.ts`).
- Individual deal pages: numbers from the `ul.data-table.summary` table.
- Model cards on category pages (which show "from" prices possibly taken from *two
  different deals*): `api.ts` queries leasing.com's own internal search API once per
  contract length (18/24/36/48), one result each sorted by lowest total cost — within a
  fixed term, lowest total = lowest real monthly, so the answer is exact. Results
  cached in sessionStorage (`lrc:` keys, 6 h TTL), fetched through a concurrency-2
  queue. Term-filter changes re-badge from cache (fetch all terms, filter at display);
  the mileage bound must go **into the API query** as a Mileage facet, so the cache key
  includes it.

**leaseloco adapter** (`sites/leaseloco/`): the card's advertised "£X total" is all-in
(verified live: equals payments + broker fee), so badges are just total/term — no API.
Deal-config URLs encode the profile as e.g. `2-24-5000-12-1`
(finance-term-mileage-initialMonths-flag; the flag does NOT indicate fees). Config
pages (`…/config`) never show the broker fee anywhere (not in DOM, __NEXT_DATA__, or
any API), so card annotation caches each deal's total in sessionStorage
(`lrcT:<hash>`, hash from the config URL) and config pages badge the exact figure on a
cache hit, else payments-only maths explicitly labelled "excl. broker fee".

## Verified site facts (don't re-derive)

- leasing.com API: `POST https://leasing.com/api/deals/search/`; body shape captured in
  `api.ts`. Facet values are **case-sensitive**. `DealCosts.TotalLeaseCost` is all-in.
- leasing.com displayed initial rental **excludes** the admin fee; the API's
  `InitialRental` **includes** it. Card badges add fees separately; API totals don't.
- Mileage facet values are discrete: 5000, 6000, 8000, 10000, 12000, 15000, 20000,
  25000, 30000.

## Testing conventions

Tests live in `tests/` with real captured site markup in `tests/fixtures/` (trimmed,
not synthetic). Each extraction suite includes "simulated redesign" tests that strip
the data attributes/classes to prove the text-regex fallback paths work. Network is
mocked with `vi.stubGlobal("fetch", …)`. `cost.test.ts` is pinned to a live-verified
deal (Corsa: total 5374, effective ≈223.92) — if those numbers fail, the maths broke,
not the test.

## Environment gotchas

- PowerShell 5.1 `Get-Content`/`Set-Content` round-trips corrupt UTF-8 (em dashes →
  mojibake). Edit source/JSON with the Write/Edit tools, never PS regex. Multi-line
  git commit messages: write to a file and use `git commit -F <path>`.
- When live-verifying in a browser pane on leasing.com: screenshots time out and
  IntersectionObserver callbacks never fire (ad-heavy page stalls rendering). Verify
  via DOM checks in the JS console, and avoid IntersectionObserver-dependent code.

# Adding a new site

Every supported site is a `SiteAdapter` under `src/sites/`. This is the process that
produced the five existing adapters, and the candidate sites still unbuilt.

## What has to be true to badge a card

Per deal we need **term, initial rental, monthly, fees** — or an all-in total. Where
those numbers come from decides how much of a site can be supported, and there's a
fallback ladder:

1. **Exact from the page** — everything is on the card, or the site publishes an all-in
   total (leasing.com deal cards, LeaseLoco cards, Select cards).
2. **Exact from embedded state** — the card DOM is thin but the page ships the profile
   in `__NEXT_DATA__` or similar (Leasing Options).
3. **Exact via the site's own API** — cards are incomplete but there's a queryable
   search endpoint (leasing.com model cards).
4. **Exact via cache** — the card can't be resolved alone, but a deal page visited
   earlier in the session can fill it in, and only when the numbers corroborate
   (Nationwide cards).
5. **Payments-only, honestly labelled** — the fee genuinely isn't obtainable, so the
   badge says "excl. fee" and never silently understates (LeaseLoco config pages).

Broker sites add one wrinkle the aggregators don't have: most charge a single fixed
admin fee that never appears on listing cards. Where it's verified fixed across several
deals from **different funders**, bake it in as a constant and label it *assumed,
site-wide* in the tooltip. Otherwise drop to tier 5. Never guess a fee silently.

## The process

1. **Investigate live, in a real browser.** Inspect card DOM and data attributes,
   embedded JSON, and XHR traffic. This step is not optional and not skippable with
   static fetches — see the warning below.
2. **Capture real markup** into `tests/fixtures/` (trimmed, never synthetic).
3. **Write the adapter**: `dom.ts` for extraction with text-regex fallbacks, `index.ts`
   for annotation with dataset idempotency guards and `applyDealFilter`. Register it in
   `content.ts`, and add both `www` and bare hostnames to `content_scripts.matches` in
   `src/manifest.json`.
4. **Test**: a fixture extraction suite plus simulated-redesign tests that strip the
   classes and data attributes, proving the fallbacks fire. Mock any fetch with
   `vi.stubGlobal`.
5. **Decide the fee tier** from live evidence, per the ladder above.
6. **Live-verify the rendered badges** against the site's own totals, then bump the
   version in `package.json` and `src/manifest.json` and add a README section.

### Two traps that green tests will not catch

Both of these shipped as bugs and were only caught by verifying on the real site:

- **Responsive duplicates.** Nationwide renders its price block twice, one copy hidden
  at any given viewport. `querySelector` picked the hidden one and the badge was
  invisible. Badge *all* matches.
- **Multiple same-prefixed panels.** Leasing Options deal pages have about five elements
  sharing the `vehicle-aside_summary` prefix, and the populated Finance Summary is not
  the first. Select the panel by a row it must contain, not by position.

A fixture is one clean snapshot of one page. Live pages have duplicates, variants, and
empty decoys. Always verify in the browser before committing an adapter.

## Candidate sites

### Vanarama (vanarama.com) — most likely next

Cards show monthly only, but it's a Next.js app (Auto Trader-owned), so `__NEXT_DATA__`
very likely carries each card's full default profile — the Leasing Options playbook
should apply almost directly. Needs the usual investigation first to decide whether
it's tier 2 (full card support) or deal-pages-only.

### Moneyshake (moneyshake.com) — low priority

An aggregator overlapping what LeaseLoco already covers. Listing grid is JS-rendered;
deal pages are configurable like LeaseLoco's. Feasible but duplicative.

### Assessed and parked

- **AllCarLeasing** — blocks non-browser fetches (403), so it couldn't be assessed
  remotely. An extension would run fine in-browser; revisit with live access.
- **Hippo Leasing** — marketing-heavy, listings JS-rendered with no pricing detail, and
  it mixes in used and lease-purchase products that don't fit the real-monthly model.
- **Rivervale** — probed URLs 404'd; small player.
- **What Car? leasing** — no deal listings of its own, just editorial and links out.

## Worth doing at some point

- Extract the "payments-only, excl. fee" badge wording and tooltip into a shared helper.
  Several candidate sites will need it.
- Give each adapter a `feeNote` constant carrying the verified fee **and the date it was
  verified**, surfaced in the tooltip, so stale constants are auditable rather than
  quietly wrong.

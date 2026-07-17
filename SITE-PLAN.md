# New site support — feasibility & implementation plan

Investigated 2026-07-17 by fetching each site's listing pages and inspecting what the
deal cards expose statically. **Caveat:** these were static-HTML probes, not live DOM
inspection — each site still needs the standard first step (browse it live, inspect
card markup / embedded JSON / XHR traffic, capture fixtures) before its adapter is
built. Findings below are what the cards *render*; data attributes and embedded state
may carry more.

## What "feasible" means here

To badge a card we need, per deal: **term, initial rental, monthly, fees** (or an
all-in total). The existing adapters set the pattern and the fallback ladder:

1. **Exact** — everything on the card or in an all-in total (leasing.com deal cards,
   LeaseLoco cards).
2. **Exact via site API** — cards are incomplete but the site has a queryable API
   (leasing.com model cards).
3. **Payments-only, honestly labelled** — fee unknowable → badge says "excl. fee",
   never silently understates (LeaseLoco config pages).

A new decision for broker sites (vs the two aggregators we support): most brokers
charge one **fixed admin/processing fee**. Where the fee is confirmed fixed on the
live site, we can bake it in as a verified constant (shown in the tooltip); otherwise
fall back to tier 3 labelling.

## Per-site findings

### 1. Select Car Leasing (selectcarleasing.co.uk) — HIGH feasibility, do first

UK's largest broker by volume. Special-offers cards render **term, initial payment
(£), annual mileage and monthly** directly, e.g.:

> "36 month contract £2,892.36 initial payment 5,000 miles p/a £241.03 Per month inc. VAT"

That's everything except the fee — same shape as a leasing.com deal card. Missing
pieces to confirm live: their admin/processing fee (believed fixed — verify amount
and whether it's per-order), what the *search* result cards show (the obvious
`/car-leasing/search` URL serves a manufacturer directory; the real search UI is
likely JS-rendered — needs live inspection), and individual deal pages (configurable
profile → same treatment as LeaseLoco config pages, but initial is in £ so
payments-only maths is exact).

**Plan:** adapter with card badges on special-offers/model listings (exact payments +
fee constant or "excl. fee" label), deal-page badge for selected options.
**Effort:** ~half a day including fixtures, tests, live verification.

### 2. Nationwide Vehicle Contracts (nationwidevehiclecontracts.co.uk) — MEDIUM-HIGH

Cards on the leasing hub show **monthly, initial rental (£) and — unusually — the
processing fee (£357 inc VAT)**, but not term or mileage:

> "Alfa Romeo Junior … From £205.63 Personal price per month inc VAT … Initial Rental
> £2,467.56 inc VAT — Processing Fee: £357.00 inc VAT"

Manufacturer pages show model-overview cards ("From £261.13 … 11 model variations") —
the leasing.com model-card problem again. Term/mileage are probably in small print,
data attributes, or embedded state (needs live check); if truly absent, deal pages
will have the full profile.

**Plan:** start with deal pages (full data, exact incl. their published fee — tier 1),
then card badges if live inspection finds term/mileage in the markup. Model-overview
cards only if an internal search API turns up.
**Effort:** ~half a day for deal pages + cards; model cards unknown until
investigated.

### 3. Leasing Options (leasingoptions.co.uk) — MEDIUM

Special-offers cards show **monthly and term** but no initial rental, mileage, fees
or total. Deal pages presumably carry the full breakdown.

**Plan:** deal-page badges first (likely exact); card badges only if data
attributes/embedded JSON provide the initial rental. Otherwise cards stay unbadged —
partial support is still useful since the deal page is where the decision happens.
**Effort:** a few hours for deal pages; cards depend on what live inspection finds.

### 4. Vanarama (vanarama.com) — MEDIUM, investigation-dependent

Cards show **monthly only** ("£166.61 Per Month Inc.VAT" + vehicle specs). But
Vanarama is a Next.js app (now Auto Trader-owned), so `__NEXT_DATA__` very likely
carries each card's full default profile — the LeaseLoco playbook (profile from
URL/embedded state) may apply directly.

**Plan:** live investigation first: check `__NEXT_DATA__`/XHR for per-card term,
initial months, mileage and fee. If present → full card support like LeaseLoco. If
not → deal-page-only badges.
**Effort:** unknown until the investigation (an hour) is done; then likely ~half a
day.

### 5. Moneyshake (moneyshake.com) — LOW priority

Aggregator (overlaps what LeaseLoco already gives us). Listing grid is JS-rendered
with thin static content; deal pages are configurable like LeaseLoco's. Feasible but
duplicative — park unless the user actually browses it.

### Not worth pursuing now

- **Hippo Leasing** — marketing-heavy pages, listings JS-rendered with no pricing
  detail statically; also mixes in used/lease-purchase products that don't fit the
  real-monthly model.
- **AllCarLeasing** — blocks non-browser fetches (403), so couldn't be assessed
  remotely. The extension itself would run fine in-browser; revisit only with live
  access and actual user demand.
- **Rivervale** — probed URLs 404'd; small player.
- **What Car? leasing** — no deal listings of its own found on the main site (just
  editorial + links out); nothing to badge.

## Recommended order

1. **Select Car Leasing** — best data-per-card of any broker, biggest broker, least
   unknowns.
2. **Nationwide Vehicle Contracts** — only site that publishes its fee on the card;
   deal pages give exact tier-1 badges.
3. **Leasing Options** — deal pages first, cards opportunistically.
4. **Vanarama** — after its 1-hour `__NEXT_DATA__` investigation decides the scope.
5. Moneyshake/others — on demand.

## Per-site implementation checklist (established pattern)

1. Live investigation in the browser: card DOM (data attributes), embedded JSON
   (`__NEXT_DATA__` etc.), XHR APIs; capture real card/page markup into
   `tests/fixtures/`.
2. `src/sites/<site>/dom.ts` — extraction with text-regex fallbacks;
   `index.ts` — annotation with dataset idempotency guards + `applyDealFilter`;
   register the adapter in `content.ts`; add both `www` and bare hostnames to
   `content_scripts.matches` in `src/manifest.json`.
3. Tests: fixture extraction suite + simulated-redesign fallback tests; mock any
   fetch with `vi.stubGlobal`.
4. Decide the fee tier (exact / verified constant / "excl. fee" label) from live
   evidence — never silently understate.
5. Version bump in `package.json` + `src/manifest.json`; README section; live-verify
   badges against the site's own totals before committing.

## Shared prep worth doing once (small)

- Extract the "payments-only, excl. fee" badge wording/tooltip from the LeaseLoco
  config path into a shared helper — three of the four candidate sites will need it.
- Consider a per-adapter `feeNote` constant (verified fixed broker fee + date
  verified) surfaced in tooltips, so stale constants are auditable.

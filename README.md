# Lease Real Cost — Firefox extension

Annotates every deal card on [leasing.com](https://leasing.com) and
[leaseloco.com](https://www.leaseloco.com) with the **true effective monthly cost**,
spreading the initial rental and admin fees across the full contract term:

```
real monthly = (initial rental + monthly × (term − 1) + additional fees) / term
```

Admin fees are **included** — the badge answers "what does this car actually cost me per
month of the contract".

## leaseloco.com

Deal cards advertise a headline monthly and an all-in total (verified to equal the lease
payments plus the broker's admin fee where one is charged), so the badge is simply
`total / term`. The lease profile (term, initial months, mileage) is read from the
card's deal-configuration URL, which encodes it as e.g. `2-24-5000-12-1`
(finance–term–mileage–initial months–flag), with text parsing as fallback. The hover
breakdown shows the fee implied by the total. Term/mileage settings filters apply.

**Deal-configuration pages** (`…/config`) are badged too, for the currently selected
options — the badge rebuilds when you change term/mileage/initial. LeaseLoco doesn't
show the broker fee anywhere on these pages, so: card annotation remembers each deal's
all-in total (sessionStorage, keyed by the deal hash in the URL), and a config page
reached from the search results badges the **exact** figure, fee included. Opened
directly (no cache), the badge falls back to payments-only maths and says
"excl. broker fee" so it never silently understates.

## leasing.com

Three kinds of pages are handled:

0. **Individual deal pages** — the summary table lists everything including the site's
   own all-in "Total lease cost", so the badge (`total / term`) appears right under the
   headline price, for both the desktop and mobile layouts. Each deal page is a fixed
   deal, so the term/mileage filters don't apply there.

1. **Deal cards** (search results, model pages) — all four numbers are on the card, so
   the badge is computed directly from what you see.
2. **Model cards** (category pages like `/cars/electric-leases/`, which only show
   "Monthly cost from" and "Total lease cost from" — often taken from *two different
   deals*, with no term shown) — the extension queries leasing.com's own search API once
   per contract length (18/24/36/48 months, one result each, sorted by lowest total
   cost) and shows the **best real monthly across all terms**. Within a fixed term,
   lowest total cost is exactly lowest real monthly, so the result is exact, and it
   frequently belongs to a different deal than either number on the card (e.g. a
   category card advertising "£288.56 p/m from" whose genuine cheapest ownership cost is
   a 48-month deal at £362.06 p/m real). Hover the badge for the per-term breakdown.
   Results are cached in sessionStorage for 6 hours; requests run at most two cards at
   a time.

Each badge shows the real monthly figure, the total lease cost, and the markup vs the
advertised headline price, colour-coded:

- 🟢 green — under +15% vs headline
- 🟡 amber — +15% to +40%
- 🔴 red — over +40%

Hover the badge for the full breakdown. Deals whose cards lack a term/initial rental
(e.g. model-level "from £X p/m" tiles) are left untouched.

## selectcarleasing.co.uk

Deal cards (special-offers and browse pages) show the term, initial payment, mileage
and monthly directly, so they're badged from what's on the card. Select is a broker
and charges a **site-wide £354 arrangement fee** (inc VAT, verified across deals from
different funders) that the cards never display, so it's added into the real monthly
and the hover breakdown notes it as "assumed, site-wide" rather than silently
understating.

**Individual deal pages** are badged for the currently selected term/mileage/initial
options, and here the arrangement fee is read **exactly** from the "Your Deal Summary"
table (falling back to the £354 constant only if that row is ever missing). The badge
rebuilds when you change options (the page soft-navigates without a full reload). Deal
pages are a fixed deal, so the term/mileage filters don't apply there.

Not yet handled: model/derivative listing pages (they show only a "from" monthly and
term) and the business ex-VAT toggle.

## nationwidevehiclecontracts.co.uk

**Individual deal pages** are the exact surface: monthly, initial rental, contract
length, annual mileage and the processing fee are all in the "Order summary" panel for
whatever term/mileage/options are currently selected, so the badge is always precise.
Changing an option swaps the page in place (no reload, no JSON quote API), and the
badge rebuilds to match.

**Listing cards** (`/car-leasing/deals` and manufacturer/search pages) show a "From"
monthly, the initial rental and the processing fee — but no term and no mileage, so a
card alone can't be badged exactly. Instead, every deal page you open gets its exact
quote remembered (sessionStorage, keyed by the deal's URL) so that when you're back on
a listing, a card for that same deal is badged from the cached quote — but **only**
when the cached quote's monthly matches the card's advertised price; if they differ
(the cache reflects whichever term you last viewed, not necessarily the card's "From"
profile), the card is left unbadged rather than guessing. In practice: cards get badged
progressively as you browse into deals and back, not on first load.

## leasingoptions.co.uk

Two kinds of pages are handled:

**Individual deal pages** are badged exactly from what's on the page: the headline
monthly, and the Finance Summary panel's contract length, annual mileage and initial
rental (note the panel shows contract length in **years**, converted to months for the
maths). leasingoptions.co.uk charges a **site-wide £399.99 processing fee** (inc VAT,
verified across three deals/terms); the Finance Summary panel usually shows the exact
figure, and the badge uses it — falling back to the constant only on the rare page
missing that row. The badge rebuilds when you change options (the page soft-navigates
without a full reload). Deal pages are a fixed deal, so the term/mileage filters don't
apply there.

**Special-offers listing cards** (`/car-leasing/special-offers`) show no lease numbers
at all on the card itself — the profile (term, mileage, initial months, monthly) lives
in the page's embedded `__NEXT_DATA__`, keyed by the vehicle reference in the card's
title link. Personal Contract Hire (PCH) deals are used; business pricing is ignored.
The £399.99 fee (never present in `__NEXT_DATA__`, DOM-only elsewhere) is folded in the
same way as on deal pages, so these badges are exact too. Term/mileage settings filters
apply.

Not yet handled: manufacturer/category "model preview" pages, which show model-level
"from" prices in a different data shape.

## Settings

Click the toolbar button for a popup with:

- **Min / max contract length** (18–48 months, or Any) — deal cards outside the range
  are dimmed or hidden, and model-card badges show the best real monthly among the
  allowed terms only (excluded terms stay visible in the hover breakdown, marked).
- **Min mileage per year** (5,000–30,000, or Any) — deal cards below the minimum are
  dimmed or hidden, and model-card lookups constrain the search itself (the "cheapest
  real" for each term is then the cheapest *at an acceptable mileage*, not the
  site-wide 5k-mile floor). There is deliberately no maximum: more allowance at the
  same price is never worse.
- **Deals outside range: dim or hide.**

Changes save on select and apply immediately to open leasing.com tabs — no refresh.
Settings live in `storage.sync`. All four term buckets are fetched and cached per
mileage range, so adjusting the *term* range re-badges instantly with no new requests,
while changing the *mileage* range triggers one fresh (small, cached thereafter) query
set per model card.

## Build

The extension is written in TypeScript and bundled with esbuild into `dist/`:

```
npm install
npm run build      # bundles src/ -> dist/ (content.js + content.css + manifest.json)
npm test           # vitest unit tests (happy-dom, real-markup fixtures)
npm run typecheck  # tsc --noEmit
```

## Install (temporary, for development)

1. Run `npm run build`
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select `dist/manifest.json`
5. Browse leasing.com — badges appear on all deal listings

Temporary add-ons are removed when Firefox restarts; just reload it the same way.

## Install (permanent)

Regular Firefox only runs signed extensions. Options:

- **Firefox Developer Edition or Nightly**: set `xpinstall.signatures.required` to
  `false` in `about:config`, zip the contents of `dist/` (files at the zip root, not
  inside a subfolder), rename to `.xpi`, and open it with Firefox.
- **Self-sign via AMO**: create a free account at addons.mozilla.org, submit the zip as
  an *unlisted* add-on, and install the signed `.xpi` it returns. No review queue for
  unlisted self-distribution.

## Code layout

```
src/
  content.ts             entry point: picks a site adapter, MutationObserver re-scan loop
  settings.ts            user settings: storage.sync load/save/subscribe + validation
  popup/                 toolbar popup (popup.html/.ts/.css) editing the settings
  core/money.ts          money parsing + GBP formatting
  core/cost.ts           the lease maths (pure, unit-tested)
  ui/badge.ts            badge DOM construction
  sites/types.ts         SiteAdapter interface (one per supported site)
  sites/filter.ts        shared dim/hide filtering for the settings ranges
  sites/leasingcom/      leasing.com adapter: dom.ts (card extraction),
                         api.ts (search API client + cache), index.ts (annotation)
  sites/leaseloco/       leaseloco.com adapter: dom.ts (card extraction),
                         index.ts (annotation)
tests/                   vitest suites; fixtures/ holds real captured card markup
```

New sites get their own folder under `src/sites/` implementing `SiteAdapter`, plus
fixture-based extraction tests.

## How it reads the page

Cards are located via `li.deal-card-v2` / `[data-test="search-result-item"]`. The numbers
come from leasing.com's own data attributes (`data-term`, `data-initialrental`) and the
`.price` / "Additional fees" elements, with a regex-over-text fallback if the markup
changes. Note the site's displayed initial rental **excludes** the admin fee, so the fee
is added separately (verified against the site's internal API `TotalLeaseCost` field).

A `MutationObserver` re-scans (debounced, 150 ms) when the client-side app renders new
cards; full-page navigations re-run the content script automatically.

## Known limitations

- Maintenance cost (where a deal includes it) is not folded into the real monthly.
- Business deals show ex-VAT figures; the badge maths is still correct but don't compare
  a business badge against a personal one.
- Mileage differences aren't normalised — a 5k-mile deal will look cheaper than an
  8k-mile one. On model cards the "real cost from" is almost always a 5,000-mile deal,
  matching the "from" semantics of the card's own numbers.
- Model-card lookups depend on leasing.com's unofficial search API (payload shape
  captured 2026-07; facet names are case-sensitive). If the API changes, deal-card
  badges keep working and model-card badges silently stop appearing.
- Model cards inherit only the `fuel` filter from the card's link; other category
  filters (body type, budget) aren't passed through yet, so on those pages the badge
  reflects the model's overall cheapest deals rather than the filtered subset.

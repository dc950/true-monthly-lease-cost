# Lease Deal Finder — Plan

## Problem

UK lease listings advertise a headline monthly price, but the true cost depends on the
initial rental (typically 1, 3, 6, 9 or 12 months' payments upfront), the contract length,
and one-off broker/admin fees. Comparing deals means doing this by hand:

```
effective monthly = (initial rental + monthly × (term − 1) + admin fees) / term
```

Real example from leasing.com (July 2026): a Vauxhall Corsa advertised at **£145.00 p/m**
on a 12+23 profile (24-month term, £1,740 initial, £299 fee) actually costs
**£5,374 total = £223.92 p/m effective** — 54% more than the headline.

leasing.com has a "Lowest total cost" sort, but it never *shows* the effective monthly per
deal, and total cost isn't comparable across different term lengths. Effective monthly is
the right normaliser.

## Key research finding (changes the whole approach)

leasing.com's deal pages are a client-side app fed by an **internal JSON API** — no HTML
scraping needed:

- `POST https://leasing.com/api/deals/search/` → paginated JSON deal list
- `POST https://leasing.com/api/deals/search/facets/` → available filters/counts

Each deal object contains everything we need, already computed:

| Field | Example (Corsa deal) |
|---|---|
| `DealCosts.MonthlyPrice` | 145.0 |
| `DealCosts.InitialRental` | 2039.0 (*includes* the admin fee: 1740 + 299) |
| `DealCosts.AdditionalFees` | 299.0 |
| `DealCosts.TotalLeaseCost` | 5374.0 ✅ (= initial incl. fees + monthly × (term − 1)) |
| `DealProfile.ContractLengthMonths` | 24 |
| `DealProfile.DepositMonths` | 12 (initial = N × monthly) |
| `DealProfile.AnnualMileage` | 5000 |
| `Vehicle.*` | make/range/model/derivative/fuel/transmission/image URL |
| `DealIdentifier`, `LeasingUrl` | stable ID + link back to the deal |
| `InStock`, `AdvertiserCompanyName`, `LeasingValueScore` | extras worth showing |

So for the webapp: **`effective monthly = TotalLeaseCost / ContractLengthMonths`** — one
division per deal, the site's own numbers, no arithmetic drift.

Note the display quirk: the *page* shows initial rental excluding fees (£1,740), the API's
`InitialRental` includes them (£2,039). The Firefox extension (which reads the page) must
add `Additional fees` itself; the webapp gets `TotalLeaseCost` for free.

## Option A — Webapp (fetch + rank)

Best for: "show me the genuinely cheapest deals across everything", saved searches,
watching prices over time.

### Architecture (deliberately small)

```
fetcher (script, run on demand / nightly)
   └─ POST /api/deals/search/ with filter payload, paginate
   └─ upsert into SQLite keyed by DealIdentifier (keep first_seen/last_seen for price history)
web UI (single small server)
   └─ table of deals with EffectiveMonthly column, sort/filter
```

Suggested stack — one Node project (no build step for the fetcher, minimal for UI):
- **Fetcher**: plain Node script using `fetch`. Mimic the browser's request (JSON body,
  realistic headers). Throttle to ~1 req/sec; a filtered search (e.g. one body style,
  budget cap) is a few dozen pages, not millions of deals.
- **Store**: SQLite via `better-sqlite3`. One `deals` table + `price_history` table.
- **UI**: small Express/Fastify server + one page (htmx or vanilla JS table — this is a
  single-user tool, no framework needed). Columns: car, derivative, term, profile
  (e.g. "12+23"), mileage, headline £/m, **effective £/m**, total cost, fees, stock,
  advertiser, link. Default sort: effective £/m ascending.

### Steps
1. Capture the exact request payload for `POST /api/deals/search/` (DevTools → copy as
   fetch from a filtered search on the site). ~30 min.
2. Fetcher script: replay with pagination, dump raw JSON to disk first (so parsing can be
   reworked without re-fetching). Handle 403/429 gracefully.
3. SQLite schema + upsert; compute `effective_monthly` on insert.
4. Web UI table with sort/filter (term, mileage, fuel, budget, in-stock only).
5. Nice-to-haves later: nightly scheduled fetch, price-drop highlighting, cross-mileage
   normalisation (p/m per 1k miles), second site.

### Risks
- **Unofficial API**: shape or auth could change any time; it may sit behind Cloudflare
  bot checks. Mitigation: keep the fetcher isolated, fall back to Playwright (drive a real
  browser, read the same JSON responses) if plain requests get blocked.
- **ToS**: comparison sites typically prohibit automated access. Personal use, low volume,
  polite rate limiting — acceptable personal risk, but don't publish the data or hammer it.

## Option B — Firefox extension (annotate in place)

Best for: normal browsing on leasing.com with the real number visible on every card.
No servers, no fetching, no ToS grey area — it only rearranges numbers already on your
screen. This is the **quickest win** (~a day).

### How
- Manifest V3 WebExtension, one content script matched to `https://leasing.com/*`.
- For each deal card, parse the four visible numbers: `24 month term`,
  `£1,740.00 initial rental`, `£145.00 p/m`, `Additional fees: £299.00`.
- Compute `(initial + monthly × (term − 1) + fees) / term` and inject a badge next to the
  headline price: **"≈ £223.92 p/m real"** (colour-coded vs headline markup %).
- `MutationObserver` to catch cards added by "Load more" / filter changes (the list is
  client-rendered).
- Optional: a toolbar toggle to re-sort the visible cards by effective monthly.

### Risks
- Selector/markup churn when the site redesigns — trivial to patch, and text like
  "initial rental" / "month term" can be matched by regex on card text rather than brittle
  CSS classes, which survives most redesigns.
- Only sees deals on the current page — no global "cheapest overall" view.

## Recommendation

Build **both, extension first**:
1. The extension solves the daily-browsing pain immediately with ~150 lines of JS and zero
   infrastructure, and forces us to nail the maths/edge cases (VAT, maintenance cost,
   business vs personal) on real data.
2. The webapp is the proper answer to "what's actually the cheapest deal for my
   constraints" — and the JSON API discovery makes it a fetch-and-divide job rather than a
   scraping project.

They share nothing but the formula, so neither blocks the other.

## Open questions
- Include the £299-ish admin fee in the effective monthly? (Plan assumes **yes** — it's
  real money.) Some brokers also charge a returnable-ish "processing fee" shown elsewhere.
- Maintenance: `MaintenanceCost` is separate — show effective monthly with and without?
- Business (ex-VAT) deals: compare separately or gross them up? Default: filter to
  Personal to start.
- Mileage normalisation: a 5k-mile deal isn't comparable to a 10k one. Phase 2: show
  "£/m at your target mileage" using `ExcessMileageCharge` where present.

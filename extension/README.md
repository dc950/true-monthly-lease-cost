# Lease Real Cost — Firefox extension

Annotates every deal card on [leasing.com](https://leasing.com) with the **true effective
monthly cost**, spreading the initial rental and admin fees across the full contract term:

```
real monthly = (initial rental + monthly × (term − 1) + additional fees) / term
```

Admin fees are **included** — the badge answers "what does this car actually cost me per
month of the contract".

Two kinds of cards are handled:

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

## Install (temporary, for development)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` in this folder
4. Browse leasing.com — badges appear on all deal listings

Temporary add-ons are removed when Firefox restarts; just reload it the same way.

## Install (permanent)

Regular Firefox only runs signed extensions. Options:

- **Firefox Developer Edition or Nightly**: set `xpinstall.signatures.required` to
  `false` in `about:config`, zip this folder's contents (files at the zip root, not
  inside a subfolder), rename to `.xpi`, and open it with Firefox.
- **Self-sign via AMO**: create a free account at addons.mozilla.org, submit the zip as
  an *unlisted* add-on, and install the signed `.xpi` it returns. No review queue for
  unlisted self-distribution.

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

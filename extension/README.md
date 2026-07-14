# Lease Real Cost — Firefox extension

Annotates every deal card on [leasing.com](https://leasing.com) with the **true effective
monthly cost**, spreading the initial rental and admin fees across the full contract term:

```
real monthly = (initial rental + monthly × (term − 1) + additional fees) / term
```

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
  8k-mile one.

# True Monthly Lease Cost

A Firefox extension that shows what a UK car lease **actually** costs per month, on the
listing pages of the big lease sites — with the initial rental and admin fees spread
across the contract instead of hidden behind the headline price.

<!-- TODO: screenshot of a badged deal card goes here before publishing. -->

## The problem

Lease sites advertise the monthly payment. That number leaves out the initial rental
(often 6–12 months' payments up front) and the broker's admin fee, so two deals showing
the same "£219 per month" can differ by thousands over the contract.

A real example, from a live listing:

| | |
|---|---|
| Advertised | **£218.76** per month |
| Initial rental | £2,625.12 (12 months up front) |
| Processing fee | £399.99 |
| Term | 24 months |
| **Total cost** | **£8,056.59** |
| **True monthly** | **£335.69** — 53% more than advertised |

The extension puts that £335.69 on the card, next to the £218.76, on every deal you
look at.

## What it does

Every deal card and deal page gets a badge showing:

- the **true monthly** cost,
- the **total** cost of the contract,
- the **markup** against the advertised headline price, colour-coded:
  🟢 under +15% · 🟡 +15–40% · 🔴 over +40%

Hover the badge for the full breakdown of how the figure was reached.

The maths is just:

```
true monthly = (initial rental + monthly × (term − 1) + fees) / term
```

## Supported sites

| Site | Deal pages | Listing cards | Notes |
|---|---|---|---|
| leasing.com | ✅ exact | ✅ exact | Category "from price" cards resolved via the site's own search API |
| leaseloco.com | ✅ | ✅ exact | Config pages exact after visiting via a card (see below) |
| selectcarleasing.co.uk | ✅ exact | ✅ | Cards assume the site-wide £354 fee |
| nationwidevehiclecontracts.co.uk | ✅ exact | ⚠️ partial | Cards lack term/mileage; badged from cache after visiting the deal |
| leasingoptions.co.uk | ✅ exact | ✅ exact | Card data read from the page's embedded JSON |

"Exact" means every figure in the badge came from the site's own numbers for that
specific deal, with nothing estimated.

## Honesty about fees

Admin fees are the whole reason the headline price misleads, so the extension never
quietly drops one:

- Where the site states the fee, it is used **exactly**.
- Where the site charges a fixed site-wide fee but doesn't show it on cards
  (Select £354, Leasing Options £399.99 — both verified across several deals from
  different funders), it is included and the hover breakdown labels it *assumed,
  site-wide*.
- Where a fee is known to exist but its value genuinely isn't available on the page
  (LeaseLoco configuration pages opened directly), the badge is computed without it
  and says **"excl. broker fee"** rather than understating the cost.

That last case is why LeaseLoco cards cache each deal's all-in total: open a deal from
a search-results card and its config page badges the exact figure, fee included.

Figures are computed from what each site publishes, and sites change their markup
without warning. Always confirm against the broker's own quote before signing anything.

## Settings

Click the toolbar button:

- **Min / max contract length** — deals outside the range are dimmed or hidden, and
  "from price" lookups only consider terms you'd accept.
- **Min mileage per year** — same, and on leasing.com the bound goes into the search
  query itself, so the cheapest deal found is the cheapest *at a mileage you'd accept*
  rather than the site-wide 5,000-mile floor. There is deliberately **no maximum**:
  more allowance at the same price is never worse.
- **Deals outside range: dim or hide.**

Changes save immediately and apply to open tabs without a refresh. Settings sync across
your Firefox profiles via `storage.sync`.

## Install

Not yet published to addons.mozilla.org — store links will go here when it is.

To run it now, build it and load it as a temporary add-on:

```
npm install
npm run build
```

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `dist/manifest.json`
3. Browse any supported site

Temporary add-ons are removed when Firefox restarts. For something that sticks around,
zip the *contents* of `dist/` (files at the zip root), then either submit it to
addons.mozilla.org as an **unlisted** add-on and install the signed `.xpi` it returns
(free, no review queue), or run Firefox Developer Edition with
`xpinstall.signatures.required` set to `false`.

## Limitations

- **Firefox only.** A Chrome build is plausible — the code is MV3 and uses no
  Firefox-specific APIs beyond the `browser` namespace — but isn't done.
- Maintenance cost, where a deal bundles it, isn't folded into the true monthly.
- Business deals show ex-VAT figures. The maths is still right, but don't compare a
  business badge against a personal one.
- Mileage isn't normalised: a 5,000-mile deal will look cheaper than a 10,000-mile one,
  because it is.
- leasing.com "from price" cards depend on that site's unofficial search API. If it
  changes, those badges stop appearing; every other badge keeps working.
- Some pages show only a "from" monthly with no term or initial rental anywhere on the
  page (Nationwide's model search, Select's derivative rows). Those cards are left
  untouched rather than guessed at.

## Development

```
npm run build      # esbuild: src/ -> dist/
npm test           # vitest (happy-dom, real captured markup as fixtures)
npm run typecheck  # tsc --noEmit, strict
```

```
src/
  content.ts        entry point: picks a site adapter, debounced MutationObserver rescan
  settings.ts       storage.sync load/save/subscribe + validation
  popup/            toolbar settings popup
  core/cost.ts      the lease maths (pure, unit-tested)
  core/money.ts     GBP parse/format
  ui/badge.ts       badge DOM
  sites/types.ts    SiteAdapter interface — one folder per site
  sites/filter.ts   shared dim/hide filtering
tests/              vitest suites; fixtures/ holds real captured page markup
```

Each site is a `SiteAdapter` with a `matches(hostname)` and a `scan(settings)`. Because
these sites are client-rendered, `scan()` runs on load, on settings changes, and from a
MutationObserver — so **it must be idempotent**: every annotation path checks a dataset
marker before touching a card.

Adding a site means investigating its real pages first (where do the four numbers live —
DOM, embedded JSON, or an internal API?), capturing real markup into `tests/fixtures/`,
then writing the adapter against it. Extraction tests include deliberately
class-stripped copies of each fixture, to prove the text-regex fallbacks still work when
a site redesigns. See `CLAUDE.md` for the conventions and the site-specific facts worth
not re-deriving.

Bug reports are most useful with the page URL and what the badge showed versus what the
site's own checkout says.

## Licence

MIT — see [LICENSE](LICENSE).

/**
 * Lease Real Cost — leasing.com content script.
 *
 * 1. Deal cards (search/model pages): computes the effective monthly cost
 *      (initial rental + monthly x (term - 1) + admin fees) / term
 *    from the numbers on the card and injects a badge next to the price.
 *    (The initial rental replaces the first month's payment; leasing.com
 *    displays the initial rental excluding fees, so fees are added here.)
 *
 * 2. Model cards (category pages like /cars/electric-leases/, which show
 *    "Monthly cost from" with no term): queries leasing.com's own search API
 *    once per contract-length bucket (18/24/36/48 months, itemsPerPage=1,
 *    sorted by lowest total cost) and shows the best effective monthly across
 *    buckets. Within a fixed term, lowest total cost IS lowest effective
 *    monthly, so this is exact — and it regularly surfaces a different deal
 *    than either "from" figure on the card. The API's TotalLeaseCost already
 *    includes initial rental and admin fees (verified against deal cards).
 */
(() => {
  "use strict";

  const BADGE_CLASS = "lrc-badge";
  const DEAL_CARD_SELECTOR = 'li.deal-card-v2, [data-test="search-result-item"]';
  const MODEL_CARD_SELECTOR = "div.deal-card[data-test-manufacturer-slug]";
  const TERMS = [18, 24, 36, 48];
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const MAX_CONCURRENT_CARDS = 2;

  const gbp = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  });
  const gbpWhole = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

  function parseMoney(s) {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    return cleaned ? parseFloat(cleaned) : NaN;
  }

  function severityClass(realMonthly, headlineMonthly) {
    const pct = Math.round((realMonthly / headlineMonthly - 1) * 100);
    return {
      pct,
      cls: pct < 15 ? "lrc-low" : pct < 40 ? "lrc-mid" : "lrc-high",
    };
  }

  /* ------------------------------------------------------------------ *
   * Part 1: deal cards — everything needed is on the card itself.
   * ------------------------------------------------------------------ */

  function extractDeal(card) {
    // Preferred source: the data attributes leasing.com puts on the term list.
    const termEl = card.querySelector("[data-term]");
    const initEl = card.querySelector("[data-initialrental]");
    let term = termEl ? parseInt(termEl.getAttribute("data-term"), 10) : NaN;
    let initial = initEl
      ? parseMoney(initEl.getAttribute("data-initialrental"))
      : NaN;

    const priceEl = card.querySelector(".price");
    let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;

    let fees = 0;
    for (const label of card.querySelectorAll(".label")) {
      if (/additional fees/i.test(label.textContent)) {
        const valueEl =
          label.nextElementSibling ||
          label.parentElement.querySelector(".value");
        const parsed = valueEl ? parseMoney(valueEl.textContent) : NaN;
        if (isFinite(parsed)) fees = parsed;
      }
    }

    // Fallback: regex over the card's visible text, in case the markup changes.
    const text = card.textContent || "";
    if (!isFinite(term)) {
      const m = text.match(/(\d+)\s*month term/i);
      if (m) term = parseInt(m[1], 10);
    }
    if (!isFinite(initial)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*initial rental/i);
      if (m) initial = parseMoney(m[1]);
    }
    if (!isFinite(monthly)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*p\/m/i);
      if (m) monthly = parseMoney(m[1]);
    }

    return { term, initial, monthly, fees };
  }

  function annotateDealCard(card) {
    if (card.querySelector("." + BADGE_CLASS)) return;

    const { term, initial, monthly, fees } = extractDeal(card);
    if (!isFinite(term) || !isFinite(initial) || !isFinite(monthly) || term <= 0)
      return; // e.g. grouped "from £X p/m" tiles with no term/initial

    const total = initial + monthly * (term - 1) + fees;
    const real = total / term;
    const { pct, cls } = severityClass(real, monthly);

    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} ${cls}`;

    const main = document.createElement("div");
    main.className = "lrc-main";
    main.textContent = `${gbp.format(real)} p/m real`;

    const sub = document.createElement("div");
    sub.className = "lrc-sub";
    sub.textContent = `${gbpWhole.format(total)} total · +${pct}% vs headline`;

    badge.append(main, sub);
    badge.title =
      `Initial rental ${gbp.format(initial)}\n` +
      `+ ${term - 1} payments of ${gbp.format(monthly)}\n` +
      `+ fees ${gbp.format(fees)}\n` +
      `= ${gbp.format(total)} over ${term} months`;

    const anchor =
      card.querySelector(".price-wrapper") ||
      (card.querySelector(".price") &&
        card.querySelector(".price").parentElement);
    if (anchor) anchor.appendChild(badge);
  }

  /* ------------------------------------------------------------------ *
   * Part 2: model cards — no term on the card, so ask the search API.
   * ------------------------------------------------------------------ */

  function modelCardInfo(card) {
    const mfrSlug = card.getAttribute("data-test-manufacturer-slug");
    const titleEl = card.querySelector(".deal-vehicle, h3");
    const link = card.querySelector('a[href*="/car-leasing/"]');
    if (!mfrSlug || !titleEl) return null;

    // Title is "<Manufacturer> <Range>". The facet API is case-sensitive, so
    // split the display name using the manufacturer slug's word count
    // (e.g. "alfa-romeo" -> take 2 words -> "Alfa Romeo" + "Giulia").
    const words = titleEl.textContent.trim().split(/\s+/);
    const mfrWords = mfrSlug.split("-").filter(Boolean).length;
    const manufacturer = words.slice(0, mfrWords).join(" ");
    const range = words.slice(mfrWords).join(" ");
    if (!manufacturer || !range) return null;

    let fuel = null;
    let finance = "Personal";
    if (link) {
      const u = new URL(link.getAttribute("href"), location.origin);
      fuel = u.searchParams.get("fuel");
      if (/business/i.test(u.searchParams.get("finance") || "")) {
        finance = "Business";
      }
    }
    return { manufacturer, range, fuel, finance };
  }

  async function cheapestForTerm(info, term) {
    const facets = [
      { fieldName: "ContractLength", selections: [String(term)] },
      { fieldName: "Manufacturer", selections: [info.manufacturer] },
      { fieldName: "Range", selections: [info.range] },
    ];
    if (info.fuel) facets.push({ fieldName: "FuelType", selections: [info.fuel] });

    const body = {
      searchCriteria: {
        facets,
        matches: [
          { matchWith: "Car", fieldName: "vehicleType" },
          { matchWith: info.finance, fieldName: "FinanceType" },
        ],
        ranges: [],
        partialMatches: [],
      },
      pagination: { itemsPerPage: 1, pageNumber: 1 },
      orderBy: {
        fieldName: "totalLeaseCost",
        friendlyName: "Lowest total cost",
        direction: "ascending",
      },
    };

    const resp = await fetch(location.origin + "/api/deals/search/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`search API ${resp.status}`);
    const json = await resp.json();
    const deal = json.Deals && json.Deals[0];
    if (!deal) return null;
    return {
      term,
      total: deal.DealCosts.TotalLeaseCost, // includes initial rental + fees
      monthly: deal.DealCosts.MonthlyPrice,
      effective: deal.DealCosts.TotalLeaseCost / term,
      mileage: deal.DealProfile.AnnualMileage,
    };
  }

  function cacheKey(info) {
    return `lrc:${info.manufacturer}|${info.range}|${info.fuel || ""}|${info.finance}`;
  }

  async function bestRealCost(info) {
    const key = cacheKey(info);
    try {
      const hit = JSON.parse(sessionStorage.getItem(key));
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
    } catch (e) {
      /* corrupt/absent cache entry — refetch */
    }

    const settled = await Promise.allSettled(
      TERMS.map((t) => cheapestForTerm(info, t))
    );
    const perTerm = settled
      .filter((s) => s.status === "fulfilled" && s.value)
      .map((s) => s.value);
    if (!perTerm.length) return null;

    const best = perTerm.reduce((a, b) => (a.effective <= b.effective ? a : b));
    const data = { best, perTerm };
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
      /* storage full — fine, just uncached */
    }
    return data;
  }

  function annotateModelCard(card, data) {
    if (card.querySelector("." + BADGE_CLASS)) return;
    const { best, perTerm } = data;
    const { pct, cls } = severityClass(best.effective, best.monthly);

    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} lrc-model ${cls}`;

    const main = document.createElement("div");
    main.className = "lrc-main";
    main.textContent = `real cost from ${gbp.format(best.effective)} p/m`;

    const sub = document.createElement("div");
    sub.className = "lrc-sub";
    sub.textContent =
      `${best.term} mo · ${best.mileage / 1000}k mi/yr · ` +
      `${gbpWhole.format(best.total)} total · +${pct}% vs its ${gbp.format(best.monthly)} headline`;

    badge.append(main, sub);
    badge.title =
      "Cheapest real monthly per term:\n" +
      perTerm
        .map(
          (r) =>
            `${r.term} mo: ${gbp.format(r.effective)} p/m real ` +
            `(headline ${gbp.format(r.monthly)}, ${r.mileage / 1000}k mi/yr)`
        )
        .join("\n");

    const anchor = card.querySelector(".deal-body") || card;
    anchor.appendChild(badge);
  }

  // Process a couple of cards at a time — each card costs one small API
  // request per term bucket, and results are cached in sessionStorage.
  const cardQueue = [];
  let inFlight = 0;

  function pumpQueue() {
    while (inFlight < MAX_CONCURRENT_CARDS && cardQueue.length) {
      const card = cardQueue.shift();
      const info = modelCardInfo(card);
      if (!info) continue;
      inFlight++;
      bestRealCost(info)
        .then((data) => data && annotateModelCard(card, data))
        .catch((e) => console.debug("lease-real-cost:", e))
        .finally(() => {
          inFlight--;
          pumpQueue();
        });
    }
  }

  /* ------------------------------------------------------------------ */

  function scan() {
    document.querySelectorAll(DEAL_CARD_SELECTOR).forEach(annotateDealCard);
    document.querySelectorAll(MODEL_CARD_SELECTOR).forEach((card) => {
      if (card.dataset.lrcSeen) return;
      card.dataset.lrcSeen = "1";
      cardQueue.push(card);
    });
    pumpQueue();
  }

  // Lists are client-rendered and extended via "Load more" / filter changes,
  // so re-scan (debounced) on DOM mutations. Already-processed cards are
  // skipped, so the rescan our own insertions trigger terminates immediately.
  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      scan();
    }, 150);
  });

  scan();
  observer.observe(document.body, { childList: true, subtree: true });
})();

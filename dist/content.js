"use strict";
(() => {
  // src/settings.ts
  var TERM_OPTIONS = [18, 24, 36, 48];
  var MILEAGE_OPTIONS = [
    5e3,
    6e3,
    8e3,
    1e4,
    12e3,
    15e3,
    2e4,
    25e3,
    3e4
  ];
  var DEFAULT_SETTINGS = {
    minTerm: 0,
    maxTerm: 0,
    minMileage: 0,
    mode: "dim"
  };
  var VALID_TERMS = /* @__PURE__ */ new Set([0, ...TERM_OPTIONS]);
  var VALID_MILEAGES = /* @__PURE__ */ new Set([0, ...MILEAGE_OPTIONS]);
  function sanitizeBound(value, valid) {
    return typeof value === "number" && valid.has(value) ? value : 0;
  }
  function sanitizeSettings(raw) {
    const r = raw ?? {};
    let minTerm = sanitizeBound(r.minTerm, VALID_TERMS);
    let maxTerm = sanitizeBound(r.maxTerm, VALID_TERMS);
    if (minTerm !== 0 && maxTerm !== 0 && minTerm > maxTerm) {
      [minTerm, maxTerm] = [maxTerm, minTerm];
    }
    const minMileage = sanitizeBound(r.minMileage, VALID_MILEAGES);
    const mode = r.mode === "hide" ? "hide" : "dim";
    return { minTerm, maxTerm, minMileage, mode };
  }
  function termAllowed(term, s) {
    if (s.minTerm !== 0 && term < s.minTerm) return false;
    if (s.maxTerm !== 0 && term > s.maxTerm) return false;
    return true;
  }
  function mileageAllowed(mileage, s) {
    return s.minMileage === 0 || mileage >= s.minMileage;
  }
  function hasMileageBound(s) {
    return s.minMileage !== 0;
  }
  function mileagesInRange(s) {
    return MILEAGE_OPTIONS.filter((m) => mileageAllowed(m, s));
  }
  function settingsSignature(s) {
    return `${s.minTerm}-${s.maxTerm}-${s.minMileage}-${s.mode}`;
  }
  function storageAvailable() {
    return typeof browser !== "undefined" && !!browser.storage?.sync;
  }
  async function loadSettings() {
    if (!storageAvailable()) return DEFAULT_SETTINGS;
    try {
      const stored = await browser.storage.sync.get("settings");
      return sanitizeSettings(stored.settings);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  function onSettingsChanged(cb) {
    if (typeof browser === "undefined" || !browser.storage?.onChanged) return;
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) {
        cb(sanitizeSettings(changes.settings.newValue));
      }
    });
  }

  // src/core/cost.ts
  function isViableDeal(t) {
    return Number.isFinite(t.term) && t.term > 0 && Number.isFinite(t.initial) && Number.isFinite(t.monthly) && Number.isFinite(t.fees);
  }
  function totalLeaseCost(t) {
    return t.initial + t.monthly * (t.term - 1) + t.fees;
  }
  function effectiveMonthly(t) {
    return totalLeaseCost(t) / t.term;
  }
  function markupPct(realMonthly, headlineMonthly) {
    return Math.round((realMonthly / headlineMonthly - 1) * 100);
  }
  function severity(pct) {
    return pct < 15 ? "low" : pct < 40 ? "mid" : "high";
  }

  // src/core/money.ts
  var gbp = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  });
  var gbpWhole = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  });
  function parseMoney(s) {
    const cleaned = String(s ?? "").replace(/[^0-9.]/g, "");
    return cleaned ? parseFloat(cleaned) : NaN;
  }
  function formatGBP(n) {
    return gbp.format(n);
  }
  function formatGBPWhole(n) {
    return gbpWhole.format(n);
  }

  // src/ui/badge.ts
  var BADGE_CLASS = "lrc-badge";
  function hasBadge(card) {
    return card.querySelector("." + BADGE_CLASS) !== null;
  }
  function buildBadge(spec) {
    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} lrc-${spec.severity}`;
    if (spec.modelCard) badge.classList.add("lrc-model");
    const main = document.createElement("div");
    main.className = "lrc-main";
    main.textContent = spec.main;
    const sub = document.createElement("div");
    sub.className = "lrc-sub";
    sub.textContent = spec.sub;
    badge.append(main, sub);
    badge.title = spec.title;
    return badge;
  }

  // src/sites/leasingcom/api.ts
  var TERMS = [18, 24, 36, 48];
  var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
  function pickBest(perTerm, allowed) {
    const candidates = perTerm.filter((q) => allowed(q.term));
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => a.effective <= b.effective ? a : b);
  }
  async function cheapestForTerm(info, term, mileages = null) {
    const facets = [
      { fieldName: "ContractLength", selections: [String(term)] },
      { fieldName: "Manufacturer", selections: [info.manufacturer] },
      { fieldName: "Range", selections: [info.range] }
    ];
    if (info.fuel) {
      facets.push({ fieldName: "FuelType", selections: [info.fuel] });
    }
    if (mileages && mileages.length > 0) {
      facets.push({ fieldName: "Mileage", selections: mileages.map(String) });
    }
    const body = {
      searchCriteria: {
        facets,
        matches: [
          { matchWith: "Car", fieldName: "vehicleType" },
          { matchWith: info.finance, fieldName: "FinanceType" }
        ],
        ranges: [],
        partialMatches: []
      },
      pagination: { itemsPerPage: 1, pageNumber: 1 },
      orderBy: {
        fieldName: "totalLeaseCost",
        friendlyName: "Lowest total cost",
        direction: "ascending"
      }
    };
    const resp = await fetch(location.origin + "/api/deals/search/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`search API ${resp.status}`);
    const json = await resp.json();
    const deal = json.Deals?.[0];
    if (!deal) return null;
    return {
      term,
      total: deal.DealCosts.TotalLeaseCost,
      monthly: deal.DealCosts.MonthlyPrice,
      effective: deal.DealCosts.TotalLeaseCost / term,
      mileage: deal.DealProfile.AnnualMileage
    };
  }
  function cacheKey(info, settings) {
    return `lrc:${info.manufacturer}|${info.range}|${info.fuel ?? ""}|${info.finance}|m${settings.minMileage}`;
  }
  async function bestRealCost(info, settings) {
    const key = cacheKey(info, settings);
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) ?? "");
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        return hit.data;
      }
    } catch {
    }
    const mileages = hasMileageBound(settings) ? mileagesInRange(settings) : null;
    const settled = await Promise.allSettled(
      TERMS.map((t) => cheapestForTerm(info, t, mileages))
    );
    const perTerm = settled.filter(
      (s) => s.status === "fulfilled" && s.value !== null
    ).map((s) => s.value);
    if (perTerm.length === 0) return null;
    const best = perTerm.reduce((a, b) => a.effective <= b.effective ? a : b);
    const data = { best, perTerm };
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
    }
    return data;
  }

  // src/sites/leasingcom/dom.ts
  var DEAL_CARD_SELECTOR = 'li.deal-card-v2, [data-test="search-result-item"]';
  var MODEL_CARD_SELECTOR = "div.deal-card[data-test-manufacturer-slug]";
  function parseMileage(s) {
    const cleaned = String(s ?? "").trim().replace(/,/g, "");
    const m = cleaned.match(/^(\d+(?:\.\d+)?)(k?)$/i);
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2] ? 1e3 : 1);
  }
  function extractDealTerms(card) {
    const termEl = card.querySelector("[data-term]");
    const initEl = card.querySelector("[data-initialrental]");
    const mileageEl = card.querySelector("[data-mileage]");
    let term = termEl ? parseInt(termEl.getAttribute("data-term") ?? "", 10) : NaN;
    let initial = initEl ? parseMoney(initEl.getAttribute("data-initialrental")) : NaN;
    let mileage = mileageEl ? parseMileage(mileageEl.getAttribute("data-mileage")) : NaN;
    const priceEl = card.querySelector(".price");
    let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;
    let fees = NaN;
    for (const label of card.querySelectorAll(".label")) {
      if (/additional fees/i.test(label.textContent ?? "")) {
        const valueEl = label.nextElementSibling ?? label.parentElement?.querySelector(".value");
        const parsed = parseMoney(valueEl?.textContent);
        if (Number.isFinite(parsed)) fees = parsed;
      }
    }
    const text = card.textContent ?? "";
    if (!Number.isFinite(term)) {
      const m = text.match(/(\d+)\s*month term/i);
      if (m) term = parseInt(m[1], 10);
    }
    if (!Number.isFinite(initial)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*initial rental/i);
      if (m) initial = parseMoney(m[1]);
    }
    if (!Number.isFinite(monthly)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*p\/m/i);
      if (m) monthly = parseMoney(m[1]);
    }
    if (!Number.isFinite(fees)) {
      const m = text.match(/additional fees:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
      fees = m ? parseMoney(m[1]) : 0;
    }
    if (!Number.isFinite(mileage)) {
      const m = text.match(/([\d,]+k?)\s*miles\s*p\/a/i);
      if (m) mileage = parseMileage(m[1]);
    }
    return { term, initial, monthly, fees, mileage };
  }
  function extractModelCardInfo(card, origin = location.origin) {
    const mfrSlug = card.getAttribute("data-test-manufacturer-slug");
    const titleEl = card.querySelector(".deal-vehicle, h3");
    const link = card.querySelector('a[href*="/car-leasing/"]');
    if (!mfrSlug || !titleEl) return null;
    const words = (titleEl.textContent ?? "").trim().split(/\s+/);
    const mfrWords = mfrSlug.split("-").filter(Boolean).length;
    const manufacturer = words.slice(0, mfrWords).join(" ");
    const range = words.slice(mfrWords).join(" ");
    if (!manufacturer || !range) return null;
    let fuel = null;
    let finance = "Personal";
    const href = link?.getAttribute("href");
    if (href) {
      const u = new URL(href, origin);
      fuel = u.searchParams.get("fuel");
      if (/business/i.test(u.searchParams.get("finance") ?? "")) {
        finance = "Business";
      }
    }
    return { manufacturer, range, fuel, finance };
  }

  // src/sites/leasingcom/index.ts
  var MAX_CONCURRENT_CARDS = 2;
  function applyDealFilter(card, term, mileage, settings) {
    const excluded = Number.isFinite(term) && !termAllowed(term, settings) || Number.isFinite(mileage) && !mileageAllowed(mileage, settings);
    card.classList.toggle("lrc-dim", excluded && settings.mode === "dim");
    card.classList.toggle("lrc-hide", excluded && settings.mode === "hide");
  }
  function annotateDealCard(card, settings) {
    let term;
    let mileage;
    if (hasBadge(card)) {
      term = parseInt(card.dataset.lrcTerm ?? "", 10);
      mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
    } else {
      const terms = extractDealTerms(card);
      term = terms.term;
      mileage = terms.mileage;
      if (!isViableDeal(terms)) return;
      const total = totalLeaseCost(terms);
      const real = effectiveMonthly(terms);
      const pct = markupPct(real, terms.monthly);
      const badge = buildBadge({
        main: `${formatGBP(real)} p/m real`,
        sub: `${formatGBPWhole(total)} total \xB7 +${pct}% vs headline`,
        title: `Initial rental ${formatGBP(terms.initial)}
+ ${terms.term - 1} payments of ${formatGBP(terms.monthly)}
+ fees ${formatGBP(terms.fees)}
= ${formatGBP(total)} over ${terms.term} months`,
        severity: severity(pct)
      });
      const anchor = card.querySelector(".price-wrapper") ?? card.querySelector(".price")?.parentElement;
      anchor?.appendChild(badge);
      card.dataset.lrcTerm = String(terms.term);
      if (Number.isFinite(terms.mileage)) {
        card.dataset.lrcMileage = String(terms.mileage);
      }
    }
    applyDealFilter(card, term, mileage, settings);
  }
  function annotateModelCard(card, data, settings) {
    card.querySelectorAll("." + BADGE_CLASS).forEach((b) => b.remove());
    const best = pickBest(data.perTerm, (t) => termAllowed(t, settings));
    if (!best) return;
    const pct = markupPct(best.effective, best.monthly);
    const badge = buildBadge({
      main: `real cost from ${formatGBP(best.effective)} p/m`,
      sub: `${best.term} mo \xB7 ${best.mileage / 1e3}k mi/yr \xB7 ${formatGBPWhole(best.total)} total \xB7 +${pct}% vs its ${formatGBP(best.monthly)} headline`,
      title: "Cheapest real monthly per term:\n" + data.perTerm.map(
        (r) => `${r.term} mo: ${formatGBP(r.effective)} p/m real (headline ${formatGBP(r.monthly)}, ${r.mileage / 1e3}k mi/yr)` + (termAllowed(r.term, settings) ? "" : " \u2014 outside your term range")
      ).join("\n"),
      severity: severity(pct),
      modelCard: true
    });
    (card.querySelector(".deal-body") ?? card).appendChild(badge);
  }
  var cardQueue = [];
  var inFlight = 0;
  function pumpQueue() {
    while (inFlight < MAX_CONCURRENT_CARDS && cardQueue.length > 0) {
      const { card, settings } = cardQueue.shift();
      const info = extractModelCardInfo(card);
      if (!info) continue;
      inFlight++;
      bestRealCost(info, settings).then((data) => {
        if (data && card.dataset.lrcCfg === settingsSignature(settings)) {
          annotateModelCard(card, data, settings);
        }
      }).catch((e) => console.debug("lease-real-cost:", e)).finally(() => {
        inFlight--;
        pumpQueue();
      });
    }
  }
  var leasingCom = {
    name: "leasing.com",
    matches(hostname) {
      return hostname === "leasing.com" || hostname.endsWith(".leasing.com");
    },
    scan(settings) {
      const sig = settingsSignature(settings);
      document.querySelectorAll(DEAL_CARD_SELECTOR).forEach((card) => annotateDealCard(card, settings));
      document.querySelectorAll(MODEL_CARD_SELECTOR).forEach((card) => {
        if (card.dataset.lrcCfg === sig) return;
        card.dataset.lrcCfg = sig;
        cardQueue.push({ card, settings });
      });
      pumpQueue();
    }
  };

  // src/content.ts
  var adapters = [leasingCom];
  var active = adapters.filter((a) => a.matches(location.hostname));
  if (active.length > 0) {
    void (async () => {
      let settings = await loadSettings();
      const scanAll = () => active.forEach((a) => a.scan(settings));
      onSettingsChanged((s) => {
        settings = s;
        scanAll();
      });
      let pending = null;
      const observer = new MutationObserver(() => {
        if (pending !== null) return;
        pending = window.setTimeout(() => {
          pending = null;
          scanAll();
        }, 150);
      });
      scanAll();
      observer.observe(document.body, { childList: true, subtree: true });
    })();
  }
})();

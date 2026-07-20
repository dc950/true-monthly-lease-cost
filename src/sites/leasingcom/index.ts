import {
  effectiveMonthly,
  isViableDeal,
  markupPct,
  severity,
  totalLeaseCost,
} from "../../core/cost";
import { formatGBP, formatGBPWhole } from "../../core/money";
import {
  settingsSignature,
  termAllowed,
  type Settings,
} from "../../settings";
import { BADGE_CLASS, buildBadge, hasBadge } from "../../ui/badge";
import { applyDealFilter } from "../filter";
import type { SiteAdapter } from "../types";
import { bestRealCost, pickBest, type BestRealCost } from "./api";
import {
  DEAL_CARD_SELECTOR,
  DEAL_PAGE_PRICE_SELECTOR,
  MODEL_CARD_SELECTOR,
  extractDealPageInfo,
  extractDealTerms,
  extractModelCardInfo,
} from "./dom";

const MAX_CONCURRENT_CARDS = 2;

/** Deal cards carry every number we need; compute and badge synchronously. */
function annotateDealCard(card: HTMLElement, settings: Settings): void {
  let term: number;
  let mileage: number;
  if (hasBadge(card)) {
    // Badge content doesn't depend on settings; only the filter needs
    // re-applying, using the numbers remembered from the first pass.
    term = parseInt(card.dataset.lrcTerm ?? "", 10);
    mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
  } else {
    const terms = extractDealTerms(card);
    term = terms.term;
    mileage = terms.mileage;
    if (!isViableDeal(terms)) return; // e.g. grouped "from £X p/m" tiles

    const total = totalLeaseCost(terms);
    const real = effectiveMonthly(terms);
    const pct = markupPct(real, terms.monthly);

    const badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
      title:
        `Initial rental ${formatGBP(terms.initial)}\n` +
        `+ ${terms.term - 1} payments of ${formatGBP(terms.monthly)}\n` +
        `+ fees ${formatGBP(terms.fees)}\n` +
        `= ${formatGBP(total)} over ${terms.term} months`,
      severity: severity(pct),
    });

    const anchor =
      card.querySelector(".price-wrapper") ??
      card.querySelector(".price")?.parentElement;
    anchor?.appendChild(badge);
    card.dataset.lrcTerm = String(terms.term);
    if (Number.isFinite(terms.mileage)) {
      card.dataset.lrcMileage = String(terms.mileage);
    }
  }
  applyDealFilter(card, term, mileage, settings);
}

function annotateModelCard(
  card: HTMLElement,
  data: BestRealCost,
  settings: Settings
): void {
  // Settings may have changed since the previous annotation: replace.
  card.querySelectorAll("." + BADGE_CLASS).forEach((b) => b.remove());

  const best = pickBest(data.perTerm, (t) => termAllowed(t, settings));
  if (!best) return; // no deals within the configured term range

  const pct = markupPct(best.effective, best.monthly);
  const badge = buildBadge({
    main: `real cost from ${formatGBP(best.effective)} p/m`,
    sub:
      `${best.term} mo · ${best.mileage / 1000}k mi/yr · ` +
      `${formatGBPWhole(best.total)} total · +${pct}% vs its ${formatGBP(best.monthly)} headline`,
    title:
      "Cheapest real monthly per term:\n" +
      data.perTerm
        .map(
          (r) =>
            `${r.term} mo: ${formatGBP(r.effective)} p/m real ` +
            `(headline ${formatGBP(r.monthly)}, ${r.mileage / 1000}k mi/yr)` +
            (termAllowed(r.term, settings) ? "" : " — outside your term range")
        )
        .join("\n"),
    severity: severity(pct),
    modelCard: true,
  });

  (card.querySelector(".deal-body") ?? card).appendChild(badge);
}

/**
 * Individual deal pages: badge the price header(s) with total / term. The
 * page shows a single fixed deal (other options are separate pages), so no
 * dim/hide filtering applies here.
 */
function annotateDealPage(): void {
  const info = extractDealPageInfo(document);
  if (
    !info ||
    !Number.isFinite(info.term) ||
    info.term <= 0 ||
    !Number.isFinite(info.monthly) ||
    !Number.isFinite(info.total)
  ) {
    return;
  }

  const real = info.total / info.term;
  const pct = markupPct(real, info.monthly);

  // Desktop and mobile layouts each have their own price wrap.
  document
    .querySelectorAll<HTMLElement>(DEAL_PAGE_PRICE_SELECTOR)
    .forEach((wrap) => {
      if (hasBadge(wrap)) return;
      const badge = buildBadge({
        main: `${formatGBP(real)} p/m real`,
        sub: `${formatGBPWhole(info.total)} total · +${pct}% vs headline`,
        title:
          `Initial rental ${formatGBP(info.initial)}\n` +
          `+ ${info.term - 1} payments of ${formatGBP(info.monthly)}\n` +
          `+ fees ${formatGBP(info.fees)}\n` +
          `= ${formatGBP(info.total)} over ${info.term} months`,
        severity: severity(pct),
      });
      badge.classList.add("lrc-deal-page");
      wrap.appendChild(badge);
    });
}

// Model cards cost one small API request per term bucket, so process a
// couple of cards at a time; results are cached in sessionStorage, which also
// makes re-annotation after a settings change instant.
const cardQueue: Array<{ card: HTMLElement; settings: Settings }> = [];
let inFlight = 0;

function pumpQueue(): void {
  while (inFlight < MAX_CONCURRENT_CARDS && cardQueue.length > 0) {
    const { card, settings } = cardQueue.shift()!;
    const info = extractModelCardInfo(card);
    if (!info) continue;
    inFlight++;
    bestRealCost(info, settings)
      .then((data) => {
        // Skip if the settings changed again while this was in flight;
        // the newer queue entry will do the annotation.
        if (data && card.dataset.lrcCfg === settingsSignature(settings)) {
          annotateModelCard(card, data, settings);
        }
      })
      .catch((e) => console.debug("true-monthly-lease-cost:", e))
      .finally(() => {
        inFlight--;
        pumpQueue();
      });
  }
}

export const leasingCom: SiteAdapter = {
  name: "leasing.com",
  matches(hostname) {
    return hostname === "leasing.com" || hostname.endsWith(".leasing.com");
  },
  scan(settings) {
    const sig = settingsSignature(settings);
    annotateDealPage();
    document
      .querySelectorAll<HTMLElement>(DEAL_CARD_SELECTOR)
      .forEach((card) => annotateDealCard(card, settings));
    document
      .querySelectorAll<HTMLElement>(MODEL_CARD_SELECTOR)
      .forEach((card) => {
        if (card.dataset.lrcCfg === sig) return;
        card.dataset.lrcCfg = sig;
        cardQueue.push({ card, settings });
      });
    pumpQueue();
  },
};

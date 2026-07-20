import {
  effectiveMonthly,
  isViableDeal,
  markupPct,
  severity,
  totalLeaseCost,
  type DealTerms,
} from "../../core/cost";
import { formatGBP, formatGBPWhole } from "../../core/money";
import type { Settings } from "../../settings";
import { BADGE_CLASS, buildBadge, hasBadge } from "../../ui/badge";
import { applyDealFilter } from "../filter";
import type { SiteAdapter } from "../types";
import {
  DEAL_CARD_SELECTOR,
  DEAL_PAGE_PRICE_SELECTOR,
  SELECT_ARRANGEMENT_FEE,
  extractDealCard,
  extractDealPageInfo,
} from "./dom";

/**
 * Deal cards never show the arrangement fee (verified live 2026-07-17), so
 * the badge always assumes the site-wide constant and says so in the
 * tooltip rather than silently understating the real cost.
 */
function annotateDealCard(card: HTMLElement, settings: Settings): void {
  let term: number;
  let mileage: number;
  if (hasBadge(card)) {
    // Badge content doesn't depend on settings; only the filter needs
    // re-applying, using the numbers remembered from the first pass.
    term = parseInt(card.dataset.lrcTerm ?? "", 10);
    mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
  } else {
    const deal = extractDealCard(card);
    term = deal.term;
    mileage = deal.mileage;
    if (!isViableDeal(deal)) return; // e.g. teaser tiles without a full deal

    const total = totalLeaseCost(deal);
    const real = effectiveMonthly(deal);
    const pct = markupPct(real, deal.monthly);

    const badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
      title:
        `Initial payment ${formatGBP(deal.initial)}\n` +
        `+ ${deal.term - 1} payments of ${formatGBP(deal.monthly)}\n` +
        `+ ${formatGBPWhole(SELECT_ARRANGEMENT_FEE)} arrangement fee (assumed, site-wide)\n` +
        `= ${formatGBP(total)} over ${deal.term} months`,
      severity: severity(pct),
    });
    badge.classList.add("lrc-select");

    const anchor = card.querySelector('[class*="card-car__offer"]') ?? card;
    anchor.appendChild(badge);

    card.dataset.lrcTerm = String(deal.term);
    if (Number.isFinite(deal.mileage)) {
      card.dataset.lrcMileage = String(deal.mileage);
    }
  }
  applyDealFilter(card, term, mileage, settings);
}

/**
 * Individual deal pages: badge the price block with the real monthly for
 * the currently selected term/mileage/initial options. Exact when the
 * "Your Deal Summary" table has an arrangement-fee row; otherwise falls
 * back to the site-wide constant. The page is a fixed deal (other options
 * are separate pages/soft-navigations), so no dim/hide filtering applies.
 */
function annotateDealPage(): void {
  const anchor = document.querySelector<HTMLElement>(DEAL_PAGE_PRICE_SELECTOR);
  if (!anchor) return;

  const info = extractDealPageInfo(document);
  if (!info) return;

  const feeExact = Number.isFinite(info.feeFromPage);
  const terms: DealTerms = {
    term: info.term,
    initial: info.initial,
    monthly: info.monthly,
    fees: feeExact ? info.feeFromPage : SELECT_ARRANGEMENT_FEE,
  };
  if (!isViableDeal(terms)) return;

  // Stimulus/Turbo re-renders the price block (and updates the URL) in
  // place when the user changes term/mileage/initial options without a
  // full reload; key the badge on the selection so it rebuilds exactly
  // when the numbers change (the debounced MutationObserver rescan calls
  // back in here — this just needs to be idempotent per key).
  const key = `${location.pathname}${location.search}|${terms.monthly}`;
  const existing = anchor.querySelector<HTMLElement>("." + BADGE_CLASS);
  if (existing?.dataset.lrcKey === key) return;
  existing?.remove();

  const total = totalLeaseCost(terms);
  const real = effectiveMonthly(terms);
  const pct = markupPct(real, terms.monthly);
  const feeLine = feeExact
    ? `+ ${formatGBP(terms.fees)} arrangement fee`
    : `+ ${formatGBPWhole(terms.fees)} arrangement fee (assumed, site-wide)`;

  const badge = buildBadge({
    main: `${formatGBP(real)} p/m real`,
    sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
    title:
      `Initial payment ${formatGBP(terms.initial)}\n` +
      `+ ${terms.term - 1} payments of ${formatGBP(terms.monthly)}\n` +
      `${feeLine}\n` +
      `= ${formatGBP(total)} over ${terms.term} months`,
    severity: severity(pct),
  });
  badge.classList.add("lrc-select-deal");
  badge.dataset.lrcKey = key;
  anchor.appendChild(badge);
}

export const selectCarLeasing: SiteAdapter = {
  name: "selectcarleasing.co.uk",
  matches(hostname) {
    return (
      hostname === "selectcarleasing.co.uk" ||
      hostname.endsWith(".selectcarleasing.co.uk")
    );
  },
  scan(settings) {
    annotateDealPage();
    document
      .querySelectorAll<HTMLElement>(DEAL_CARD_SELECTOR)
      .forEach((card) => annotateDealCard(card, settings));
  },
};

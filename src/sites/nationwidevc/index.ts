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
import { recallQuote, rememberQuote, type NvcQuote } from "./cache";
import {
  PRICE_BLOCK_SELECTOR,
  cardHref,
  extractCardQuote,
  extractDealPageInfo,
  findCards,
  pathnameFromHref,
} from "./dom";

function dealTermsFromQuote(quote: NvcQuote): DealTerms {
  return {
    term: quote.term,
    initial: quote.initial,
    monthly: quote.monthly,
    fees: quote.fee,
  };
}

function badgeTitle(terms: DealTerms, total: number, mileage: number): string {
  return (
    `Initial rental ${formatGBP(terms.initial)}\n` +
    `+ ${terms.term - 1} payments of ${formatGBP(terms.monthly)}\n` +
    `+ ${formatGBP(terms.fees)} processing fee\n` +
    `= ${formatGBP(total)} over ${terms.term} months at ${mileage.toLocaleString()} mi/yr`
  );
}

/**
 * Listing cards carry no term/mileage, so they can only be badged from a
 * cached deal-page quote for the same deal — and only when that quote's
 * monthly matches what the card itself advertises, since the cache holds
 * whatever profile the user last viewed on the deal page, which may not be
 * the card's "From" profile. No cache hit (or a mismatched monthly) means
 * the card is left unbadged and unfiltered rather than guessing a term.
 */
function annotateCard(card: HTMLElement, settings: Settings): void {
  if (hasBadge(card)) {
    const term = parseInt(card.dataset.lrcTerm ?? "", 10);
    const mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
    applyDealFilter(card, term, mileage, settings);
    return;
  }

  const quote = extractCardQuote(card);
  if (!Number.isFinite(quote.monthly)) return;

  const href = cardHref(card);
  if (!href) return;
  const cached = recallQuote(pathnameFromHref(href));
  if (!cached || Math.abs(cached.monthly - quote.monthly) > 0.01) return;

  const terms = dealTermsFromQuote(cached);
  if (!isViableDeal(terms)) return;

  const total = totalLeaseCost(terms);
  const real = effectiveMonthly(terms);
  const pct = markupPct(real, terms.monthly);

  const badge = buildBadge({
    main: `${formatGBP(real)} p/m real`,
    sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
    title: badgeTitle(terms, total, cached.mileage),
    severity: severity(pct),
  });
  badge.classList.add("lrc-nvc");
  card.appendChild(badge);

  card.dataset.lrcTerm = String(cached.term);
  if (Number.isFinite(cached.mileage)) {
    card.dataset.lrcMileage = String(cached.mileage);
  }

  applyDealFilter(card, cached.term, cached.mileage, settings);
}

/**
 * Individual deal pages are the exact surface: every figure (monthly, term,
 * mileage, initial rental, processing fee) is on the page for the currently
 * selected options, so the badge is always precise. Also remembers the
 * quote in sessionStorage so a listing card for the same deal can badge
 * itself later. Option changes swap this DOM in place (no reload), so the
 * badge is keyed on the selection and rebuilt when it changes.
 */
function annotateDealPage(): void {
  const info = extractDealPageInfo(document);
  if (!info) return;

  const terms: DealTerms = {
    term: info.term,
    initial: info.initial,
    monthly: info.monthly,
    fees: info.fee,
  };
  const viable = isViableDeal(terms) && Number.isFinite(info.mileage);
  if (viable) {
    rememberQuote(location.pathname, {
      monthly: terms.monthly,
      term: terms.term,
      mileage: info.mileage,
      initial: terms.initial,
      fee: terms.fees,
    });
  }
  if (!viable) return;

  const anchor = document.querySelector<HTMLElement>(PRICE_BLOCK_SELECTOR);
  if (!anchor) return;

  const key = `${terms.monthly}|${terms.term}|${info.mileage}|${terms.initial}`;
  const existing = anchor.querySelector<HTMLElement>("." + BADGE_CLASS);
  if (existing?.dataset.lrcKey === key) return;
  existing?.remove();

  const total = totalLeaseCost(terms);
  const real = effectiveMonthly(terms);
  const pct = markupPct(real, terms.monthly);

  const badge = buildBadge({
    main: `${formatGBP(real)} p/m real`,
    sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
    title: badgeTitle(terms, total, info.mileage),
    severity: severity(pct),
  });
  badge.classList.add("lrc-nvc-deal");
  badge.dataset.lrcKey = key;
  anchor.appendChild(badge);
}

export const nationwideVc: SiteAdapter = {
  name: "nationwidevehiclecontracts.co.uk",
  matches(hostname) {
    return (
      hostname === "nationwidevehiclecontracts.co.uk" ||
      hostname.endsWith(".nationwidevehiclecontracts.co.uk")
    );
  },
  scan(settings) {
    annotateDealPage();
    findCards(document).forEach((card) =>
      annotateCard(card as HTMLElement, settings)
    );
  },
};

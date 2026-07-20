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
  DEAL_PAGE_PRICE_SELECTOR,
  LEASINGOPTIONS_FEE,
  SPECIAL_OFFER_CARD_SELECTOR,
  extractDealPageInfo,
  vehicleRefFromCard,
} from "./dom";
import { extractOfferProfiles, type SpecialOfferProfile } from "./nextdata";

/**
 * Individual deal pages: badge the price block with the real monthly for
 * the currently selected term/mileage options. Exact when the Finance
 * Summary panel has a Processing fee row; otherwise falls back to the
 * site-wide constant. The page is a fixed deal (other options are separate
 * pages/soft-navigations), so no dim/hide filtering applies.
 */
function annotateDealPage(): void {
  const priceEl = document.querySelector<HTMLElement>(DEAL_PAGE_PRICE_SELECTOR);
  if (!priceEl) return;

  const info = extractDealPageInfo(document);
  if (!info) return;

  const feeExact = Number.isFinite(info.feeFromPage);
  const terms: DealTerms = {
    term: info.term,
    initial: info.initial,
    monthly: info.monthly,
    fees: feeExact ? info.feeFromPage : LEASINGOPTIONS_FEE,
  };
  if (!isViableDeal(terms)) return;

  // Changing term/mileage/options re-renders the price block in place (and
  // updates the URL); key the badge on the selection so it rebuilds exactly
  // when the numbers change - the debounced MutationObserver rescan calls
  // back in here, so this just needs to be idempotent per key.
  const anchor = priceEl.parentElement ?? priceEl;
  const key = `${location.pathname}${location.search}|${terms.monthly}`;
  const existing = anchor.querySelector<HTMLElement>("." + BADGE_CLASS);
  if (existing?.dataset.lrcKey === key) return;
  existing?.remove();

  const total = totalLeaseCost(terms);
  const real = effectiveMonthly(terms);
  const pct = markupPct(real, terms.monthly);
  const feeLine = feeExact
    ? `+ ${formatGBP(terms.fees)} processing fee`
    : `+ ${formatGBPWhole(terms.fees)} processing fee (assumed, site-wide)`;

  const badge = buildBadge({
    main: `${formatGBP(real)} p/m real`,
    sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
    title:
      `Initial rental ${formatGBP(terms.initial)}\n` +
      `+ ${terms.term - 1} payments of ${formatGBP(terms.monthly)}\n` +
      `${feeLine}\n` +
      `= ${formatGBP(total)} over ${terms.term} months`,
    severity: severity(pct),
  });
  badge.classList.add("lrc-lo-deal");
  badge.dataset.lrcKey = key;
  anchor.appendChild(badge);
}

/**
 * Special-offers listing cards: the card DOM has no lease numbers at all,
 * only vehicle identity, so the profile comes from __NEXT_DATA__ looked up
 * by the vehicleRef embedded in the card's title link. The map is parsed at
 * most once per scan (only if there's at least one un-badged card to look
 * up). Cards with no matching profile (e.g. business-only, or the data
 * genuinely absent) are left untouched, as are non-PCH-only vehicles that
 * never resolve to a profile.
 */
function annotateSpecialOfferCards(settings: Settings): void {
  const cards = document.querySelectorAll<HTMLElement>(SPECIAL_OFFER_CARD_SELECTOR);
  if (cards.length === 0) return;

  let profiles: Map<number, SpecialOfferProfile> | null = null;

  cards.forEach((card) => {
    let term: number;
    let mileage: number;
    if (hasBadge(card)) {
      term = parseInt(card.dataset.lrcTerm ?? "", 10);
      mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
      applyDealFilter(card, term, mileage, settings);
      return;
    }

    const ref = vehicleRefFromCard(card);
    if (ref === null) return; // no title link to identify the vehicle

    profiles ??= extractOfferProfiles(document);
    const profile = profiles.get(ref);
    if (!profile) return; // no PCH profile for this card - leave it alone

    term = profile.term;
    mileage = profile.mileage;

    const total = totalLeaseCost(profile);
    const real = effectiveMonthly(profile);
    const pct = markupPct(real, profile.monthly);

    const badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(total)} total · +${pct}% vs headline`,
      title:
        `Initial rental ${formatGBP(profile.initial)}\n` +
        `+ ${profile.term - 1} payments of ${formatGBP(profile.monthly)}\n` +
        `+ ${formatGBP(profile.fees)} processing fee (site-wide)\n` +
        `= ${formatGBP(total)} over ${profile.term} months`,
      severity: severity(pct),
    });
    badge.classList.add("lrc-lo");
    card.appendChild(badge);

    card.dataset.lrcTerm = String(term);
    card.dataset.lrcMileage = String(mileage);

    applyDealFilter(card, term, mileage, settings);
  });
}

export const leasingOptions: SiteAdapter = {
  name: "leasingoptions.co.uk",
  matches(hostname) {
    return (
      hostname === "leasingoptions.co.uk" ||
      hostname.endsWith(".leasingoptions.co.uk")
    );
  },
  scan(settings) {
    annotateDealPage();
    annotateSpecialOfferCards(settings);
  },
};

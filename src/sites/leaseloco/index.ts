import { markupPct, severity } from "../../core/cost";
import { formatGBP, formatGBPWhole } from "../../core/money";
import type { Settings } from "../../settings";
import { buildBadge, hasBadge } from "../../ui/badge";
import { applyDealFilter } from "../filter";
import type { SiteAdapter } from "../types";
import {
  LEASELOCO_CARD_SELECTOR,
  extractLeaseLocoDeal,
  impliedFees,
} from "./dom";

/**
 * LeaseLoco cards advertise both a headline monthly and an all-in total
 * (payments plus broker admin fee), so the real monthly is simply
 * total / term — no API calls needed.
 */
function annotateCard(card: HTMLElement, settings: Settings): void {
  let term: number;
  let mileage: number;
  if (hasBadge(card)) {
    // Badge content doesn't depend on settings; only the filter needs
    // re-applying, using the numbers remembered from the first pass.
    term = parseInt(card.dataset.lrcTerm ?? "", 10);
    mileage = parseInt(card.dataset.lrcMileage ?? "", 10);
  } else {
    const deal = extractLeaseLocoDeal(card);
    term = deal.term;
    mileage = deal.mileage;
    if (
      !Number.isFinite(deal.term) ||
      deal.term <= 0 ||
      !Number.isFinite(deal.monthly) ||
      !Number.isFinite(deal.total)
    ) {
      return; // e.g. teaser tiles without a full deal on them
    }

    const real = deal.total / deal.term;
    const pct = markupPct(real, deal.monthly);
    const fees = impliedFees(deal);

    const titleLines = [
      `${deal.initialMonths}-month initial payment`,
      `+ ${deal.term - 1} payments of ${formatGBP(deal.monthly)}`,
    ];
    if (Number.isFinite(fees) && fees > 1) {
      titleLines.push(`+ ~${formatGBP(fees)} fees (already in the total)`);
    }
    titleLines.push(`= ${formatGBP(deal.total)} over ${deal.term} months`);

    const badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(deal.total)} total · +${pct}% vs headline`,
      title: titleLines.join("\n"),
      severity: severity(pct),
    });
    badge.classList.add("lrc-loco");
    card.appendChild(badge);

    card.dataset.lrcTerm = String(deal.term);
    if (Number.isFinite(deal.mileage)) {
      card.dataset.lrcMileage = String(deal.mileage);
    }
  }
  applyDealFilter(card, term, mileage, settings);
}

export const leaseLoco: SiteAdapter = {
  name: "leaseloco.com",
  matches(hostname) {
    return hostname === "leaseloco.com" || hostname.endsWith(".leaseloco.com");
  },
  scan(settings) {
    document
      .querySelectorAll<HTMLElement>(LEASELOCO_CARD_SELECTOR)
      .forEach((card) => annotateCard(card, settings));
  },
};

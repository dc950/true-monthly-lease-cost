import { parseMoney } from "../../core/money";

/**
 * LeaseLoco deal cards (CSS-module class names, so selectors match on the
 * stable prefix). Every card links to a deal-configuration URL whose
 * penultimate-but-one segment encodes the full lease profile:
 *   /car-leasing/<make>/<range>/<derivative>/<id>/2-24-5000-12-1/<hash>/config
 *                                                 ^ finance-term-mileage-initialMonths-flag
 */
export const LEASELOCO_CARD_SELECTOR = '[class*="vehicle-card_container"]';

export interface LeaseLocoDeal {
  /** Contract length in months. */
  term: number;
  /** Initial payment expressed in months of the headline monthly. */
  initialMonths: number;
  /** Annual mileage allowance. */
  mileage: number;
  /** Advertised headline monthly price. */
  monthly: number;
  /**
   * LeaseLoco's advertised total lease cost. Verified against live cards to
   * equal (initialMonths + term - 1) x monthly plus the broker's admin fee
   * where one is charged — i.e. it is already all-in.
   */
  total: number;
}

/**
 * Pull the lease profile and prices out of a card. Preferred sources are the
 * config-link URL segment and the price elements; each value independently
 * falls back to a regex over the card's text so a markup change degrades
 * gracefully. Missing values come back NaN.
 */
export function extractLeaseLocoDeal(card: Element): LeaseLocoDeal {
  const href =
    card.querySelector('a[href*="/config"]')?.getAttribute("href") ?? "";
  const profile = href.match(/\/(\d+)-(\d+)-(\d+)-(\d+)-(\d+)\//);
  let term = profile ? parseInt(profile[2], 10) : NaN;
  let mileage = profile ? parseInt(profile[3], 10) : NaN;
  let initialMonths = profile ? parseInt(profile[4], 10) : NaN;

  // Desktop price element reads "£225.56 per month"; its first span holds
  // just the amount. (The mobile variant also contains the total, so it is
  // not safe for parseMoney directly.)
  const monthlyEl = card.querySelector('[class*="vehicle-card_monthly-price"]');
  const monthlySpan = monthlyEl?.querySelector("span");
  let monthly = monthlySpan ? parseMoney(monthlySpan.textContent) : NaN;

  const totalEl = card.querySelector('[class*="vehicle-card_total"]');
  let total = totalEl ? parseMoney(totalEl.textContent) : NaN;

  // Text fallbacks. textContent includes the responsive hidden spans, so the
  // profile line reads "2 years, 12 months initial · 5,000 mi." in full.
  const text = card.textContent ?? "";
  if (!Number.isFinite(term)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*y(?:ea)?rs?/i);
    if (m) term = Math.round(parseFloat(m[1]) * 12);
  }
  if (!Number.isFinite(initialMonths)) {
    const m = text.match(/(\d+)\s*mo(?:nth)?s?\s*initial/i);
    if (m) initialMonths = parseInt(m[1], 10);
  }
  if (!Number.isFinite(mileage)) {
    const m = text.match(/([\d,]+)\s*mi\b/i);
    if (m) mileage = parseMoney(m[1]);
  }
  if (!Number.isFinite(monthly)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*(?:per month|monthly)/i);
    if (m) monthly = parseMoney(m[1]);
  }
  if (!Number.isFinite(total)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*total/i);
    if (m) total = parseMoney(m[1]);
  }

  return { term, initialMonths, mileage, monthly, total };
}

/**
 * The part of the advertised total not explained by the lease payments —
 * in practice the broker's admin fee (0 for fee-free brokers). NaN when the
 * inputs are incomplete.
 */
export function impliedFees(deal: LeaseLocoDeal): number {
  return deal.total - (deal.initialMonths + deal.term - 1) * deal.monthly;
}

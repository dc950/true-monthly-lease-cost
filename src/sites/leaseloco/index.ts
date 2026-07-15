import { markupPct, severity } from "../../core/cost";
import { formatGBP, formatGBPWhole } from "../../core/money";
import type { Settings } from "../../settings";
import { BADGE_CLASS, buildBadge, hasBadge } from "../../ui/badge";
import { applyDealFilter } from "../filter";
import type { SiteAdapter } from "../types";
import { hashFromHref, recallTotal, rememberTotal } from "./cache";
import {
  CONFIG_PRICE_HEADER_SELECTOR,
  LEASELOCO_CARD_SELECTOR,
  extractConfigPageInfo,
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

    // Remember the all-in total for this deal so the config page (which
    // never shows the broker fee) can badge the exact figure on click-through.
    const href = card.querySelector('a[href*="/config"]')?.getAttribute("href");
    const hash = href ? hashFromHref(href) : null;
    if (hash) rememberTotal(hash, deal.total);
  }
  applyDealFilter(card, term, mileage, settings);
}

/**
 * Deal-configuration pages: badge the price header with the real monthly for
 * the currently selected options. Exact when the deal's all-in total was
 * cached from a search card; otherwise payments-only and labelled as such,
 * since the broker fee isn't available anywhere on the page.
 */
function annotateConfigPage(): void {
  if (!/\/config\/?$/.test(location.pathname)) return;
  const anchor = document.querySelector<HTMLElement>(
    CONFIG_PRICE_HEADER_SELECTOR
  );
  if (!anchor) return;

  const info = extractConfigPageInfo(document, location.pathname);
  if (
    !Number.isFinite(info.term) ||
    info.term <= 0 ||
    !Number.isFinite(info.monthly) ||
    !Number.isFinite(info.initialAmount)
  ) {
    return;
  }

  // Option changes re-render in place and/or soft-navigate; key the badge on
  // the selection so it is rebuilt exactly when the numbers change.
  const key = `${location.pathname}|${info.monthly}`;
  const existing = anchor.querySelector<HTMLElement>("." + BADGE_CLASS);
  if (existing?.dataset.lrcKey === key) return;
  existing?.remove();

  const payments = info.initialAmount + info.monthly * (info.term - 1);
  const hash = hashFromHref(location.pathname);
  const cachedTotal = hash ? recallTotal(hash) : null;

  let badge: HTMLElement;
  if (cachedTotal !== null) {
    const real = cachedTotal / info.term;
    const pct = markupPct(real, info.monthly);
    const fee = cachedTotal - payments;
    const titleLines = [
      `${formatGBP(info.initialAmount)} initial payment`,
      `+ ${info.term - 1} payments of ${formatGBP(info.monthly)}`,
    ];
    if (fee > 1) {
      titleLines.push(`+ ~${formatGBP(fee)} broker fee`);
    }
    titleLines.push(`= ${formatGBP(cachedTotal)} over ${info.term} months`);
    badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(cachedTotal)} total · +${pct}% vs headline`,
      title: titleLines.join("\n"),
      severity: severity(pct),
    });
  } else {
    const real = payments / info.term;
    const pct = markupPct(real, info.monthly);
    badge = buildBadge({
      main: `${formatGBP(real)} p/m real`,
      sub: `${formatGBPWhole(payments)} payments · excl. broker fee`,
      title:
        `${formatGBP(info.initialAmount)} initial payment\n` +
        `+ ${info.term - 1} payments of ${formatGBP(info.monthly)}\n` +
        `= ${formatGBP(payments)} over ${info.term} months\n\n` +
        `LeaseLoco doesn't show the broker's admin fee on this page, so the\n` +
        `true all-in cost is slightly higher (fees are typically £0-£400).\n` +
        `Open this deal from the search results for the exact figure.`,
      severity: severity(pct),
    });
  }
  badge.classList.add("lrc-loco-config");
  badge.dataset.lrcKey = key;
  anchor.appendChild(badge);
}

export const leaseLoco: SiteAdapter = {
  name: "leaseloco.com",
  matches(hostname) {
    return hostname === "leaseloco.com" || hostname.endsWith(".leaseloco.com");
  },
  scan(settings) {
    annotateConfigPage();
    document
      .querySelectorAll<HTMLElement>(LEASELOCO_CARD_SELECTOR)
      .forEach((card) => annotateCard(card, settings));
  },
};

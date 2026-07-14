import {
  effectiveMonthly,
  isViableDeal,
  markupPct,
  severity,
  totalLeaseCost,
} from "../../core/cost";
import { formatGBP, formatGBPWhole } from "../../core/money";
import { buildBadge, hasBadge } from "../../ui/badge";
import type { SiteAdapter } from "../types";
import { bestRealCost, type BestRealCost } from "./api";
import {
  DEAL_CARD_SELECTOR,
  MODEL_CARD_SELECTOR,
  extractDealTerms,
  extractModelCardInfo,
} from "./dom";

const MAX_CONCURRENT_CARDS = 2;

/** Deal cards carry every number we need; compute and badge synchronously. */
function annotateDealCard(card: Element): void {
  if (hasBadge(card)) return;

  const terms = extractDealTerms(card);
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
}

function annotateModelCard(card: Element, data: BestRealCost): void {
  if (hasBadge(card)) return;
  const { best, perTerm } = data;
  const pct = markupPct(best.effective, best.monthly);

  const badge = buildBadge({
    main: `real cost from ${formatGBP(best.effective)} p/m`,
    sub:
      `${best.term} mo · ${best.mileage / 1000}k mi/yr · ` +
      `${formatGBPWhole(best.total)} total · +${pct}% vs its ${formatGBP(best.monthly)} headline`,
    title:
      "Cheapest real monthly per term:\n" +
      perTerm
        .map(
          (r) =>
            `${r.term} mo: ${formatGBP(r.effective)} p/m real ` +
            `(headline ${formatGBP(r.monthly)}, ${r.mileage / 1000}k mi/yr)`
        )
        .join("\n"),
    severity: severity(pct),
    modelCard: true,
  });

  (card.querySelector(".deal-body") ?? card).appendChild(badge);
}

// Model cards cost one small API request per term bucket, so process a
// couple of cards at a time; results are cached in sessionStorage.
const cardQueue: Element[] = [];
let inFlight = 0;

function pumpQueue(): void {
  while (inFlight < MAX_CONCURRENT_CARDS && cardQueue.length > 0) {
    const card = cardQueue.shift()!;
    const info = extractModelCardInfo(card);
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

export const leasingCom: SiteAdapter = {
  name: "leasing.com",
  matches(hostname) {
    return hostname === "leasing.com" || hostname.endsWith(".leasing.com");
  },
  scan() {
    document.querySelectorAll(DEAL_CARD_SELECTOR).forEach(annotateDealCard);
    document.querySelectorAll(MODEL_CARD_SELECTOR).forEach((card) => {
      if ((card as HTMLElement).dataset.lrcSeen) return;
      (card as HTMLElement).dataset.lrcSeen = "1";
      cardQueue.push(card);
    });
    pumpQueue();
  },
};

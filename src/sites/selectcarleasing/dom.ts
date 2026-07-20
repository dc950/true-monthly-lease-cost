import { parseMoney } from "../../core/money";
import type { DealTerms } from "../../core/cost";

/**
 * Select Car Leasing charges a site-wide arrangement fee that deal cards
 * never show (verified live on two deals from different funders,
 * 2026-07-17: £354.00 inc VAT both times). Deal pages show the exact figure
 * in the "Your Deal Summary" table when present; this constant is the
 * fallback for cards and for the rare deal page missing that row.
 */
export const SELECT_ARRANGEMENT_FEE = 354;

export const DEAL_CARD_SELECTOR = "article.drv-car-card";

/** Deal cost terms plus the annual mileage (NaN when extraction fails). */
export interface ExtractedDeal extends DealTerms {
  mileage: number;
}

/**
 * Pull term, initial payment, monthly price and mileage out of a deal card.
 * Class-name prefixes are transposed between the card shell
 * (drv-car-card__*) and the pricing block (drv-card-car__*), with yet a
 * third prefix on the pence span (c-card-car__text-price-pence) — verified
 * live 2026-07-17, not a typo. Every value independently falls back to a
 * regex over the card's visible text ("36 month contract £2,892.36 initial
 * payment 5,000 miles p/a £241.03 Per month inc. VAT") so a markup change
 * degrades gracefully. The arrangement fee is never on the card, so it is
 * always the site-wide constant.
 */
export function extractDealCard(card: Element): ExtractedDeal {
  const offer = card.querySelector('[class*="card-car__offer"]') ?? card;

  const findSpan = (re: RegExp): Element | undefined =>
    Array.from(offer.querySelectorAll("span")).find((el) =>
      re.test(el.textContent ?? "")
    );

  const termSpan = findSpan(/month contract/i);
  let term = NaN;
  const termStrong = termSpan?.querySelector("strong");
  if (termStrong) term = parseInt(termStrong.textContent ?? "", 10);

  const initialSpan = findSpan(/initial payment/i);
  let initial = NaN;
  const initialStrong = initialSpan?.querySelector("strong");
  if (initialStrong) initial = parseMoney(initialStrong.textContent);

  const mileageSpan = findSpan(/miles\s*p\/a/i);
  let mileage = NaN;
  const mileageStrong = mileageSpan?.querySelector("strong");
  if (mileageStrong) mileage = parseMoney(mileageStrong.textContent);

  // The pence lives in a nested span with a *different* class prefix
  // (c-card-car__text-price-pence), so the price div's own textContent
  // already includes it: "£241" + ".03" -> "£241.03".
  const priceEl = offer.querySelector('[class*="card-car__text-price"]');
  let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;

  const text = card.textContent ?? "";
  if (!Number.isFinite(term)) {
    const m = text.match(/(\d+)\s*month contract/i);
    if (m) term = parseInt(m[1], 10);
  }
  if (!Number.isFinite(initial)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*initial payment/i);
    if (m) initial = parseMoney(m[1]);
  }
  if (!Number.isFinite(mileage)) {
    const m = text.match(/([\d,]+)\s*miles\s*p\/a/i);
    if (m) mileage = parseMoney(m[1]);
  }
  if (!Number.isFinite(monthly)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*Per\s*month/i);
    if (m) monthly = parseMoney(m[1]);
  }

  return { term, initial, monthly, fees: SELECT_ARRANGEMENT_FEE, mileage };
}

/** Link to the individual deal page, however the card exposes it. */
export function dealCardHref(card: Element): string | null {
  return (
    (card as HTMLElement).dataset?.gaCarCardItemLink ??
    card.querySelector("a.drv-car-card__link")?.getAttribute("href") ??
    null
  );
}

// The A/B test suffixes variant classes ("--variant-a"), so every selector
// below matches on the stable, unsuffixed portion via a contains-match.
export const DEAL_PAGE_PRICE_SELECTOR = '[class*="g-deal-enquire__price"]';
const SUMMARY_CONTAINER_SELECTOR = '[class*="list-table"]';

/** The lease-profile numbers read from the "Your Deal Summary" table. */
export interface DealSummaryInfo {
  term: number;
  initialMonths: number;
  mileage: number;
  /** NaN when the row is absent (fall back to SELECT_ARRANGEMENT_FEE). */
  fee: number;
}

/** Direct text-node content of an element, skipping nested elements. */
function directText(el: Element): string {
  let text = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent ?? "";
  });
  return text.trim();
}

/**
 * The "Your Deal Summary" sidebar table: li rows pair a title (first
 * element child) with a data value (last element child). Several titles
 * carry a nested tooltip with long prose *inside the title element itself*
 * (e.g. "Arrangement fee<div class='drv-tooltip'>...</div>"), so the label
 * must come from the title's own text nodes only — not its full textContent,
 * which would swallow the tooltip prose and break the label match. Reading
 * structurally (first/last child) rather than off the __title/__data class
 * names also means this keeps working if those classes are renamed.
 */
export function extractDealSummary(root: ParentNode): DealSummaryInfo {
  const container = root.querySelector(SUMMARY_CONTAINER_SELECTOR) ?? root;
  let term = NaN;
  let initialMonths = NaN;
  let mileage = NaN;
  let fee = NaN;

  for (const li of container.querySelectorAll("li")) {
    const title = li.firstElementChild;
    const data = li.lastElementChild;
    if (!title || !data || title === data) continue;
    const label = directText(title);
    const dataText = data.textContent ?? "";

    if (/^Contract Length$/i.test(label)) {
      const m = dataText.match(/(\d+)/);
      if (m) term = parseInt(m[1], 10);
    } else if (/^Initial Payment$/i.test(label)) {
      const m = dataText.match(/(\d+)/);
      if (m) initialMonths = parseInt(m[1], 10);
    } else if (/^Annual mileage$/i.test(label)) {
      mileage = parseMoney(dataText);
    } else if (/^Arrangement fee$/i.test(label)) {
      fee = parseMoney(dataText);
    }
  }

  return { term, initialMonths, mileage, fee };
}

/** Everything needed to badge an individual deal page. */
export interface DealPageInfo {
  term: number;
  initialMonths: number;
  mileage: number;
  monthly: number;
  initial: number;
  /** NaN when the summary table has no fee row. */
  feeFromPage: number;
}

/**
 * Individual deal pages: the price block gives monthly + initial (displayed
 * excluding the admin fee), the deal-summary sidebar gives term / initial
 * months / mileage / the exact fee. Returns null when the price block isn't
 * on the page at all (i.e. this isn't a deal page).
 */
export function extractDealPageInfo(root: ParentNode): DealPageInfo | null {
  const anchor = root.querySelector(DEAL_PAGE_PRICE_SELECTOR);
  if (!anchor) return null;

  // Whole pounds are a text node in the .monthly-price element, pence is a
  // child span (g-deal-enquire__pence) — parseMoney over the whole
  // element's textContent picks up both and ignores the further sibling
  // mobile " p/m" span (letters/slashes aren't digits or dots).
  const monthlyEl = anchor.querySelector('[class*="monthly-price"]');
  let monthly = monthlyEl ? parseMoney(monthlyEl.textContent) : NaN;

  // The upfront block's first span holds just the amount; "(Plus admin
  // fee)" and the mobile label follow in later spans.
  const upfrontEl = anchor.querySelector('[class*="deal-enquire__upfront"]');
  let initial = NaN;
  const upfrontSpan = upfrontEl?.querySelector("span");
  if (upfrontSpan) initial = parseMoney(upfrontSpan.textContent);

  const text = anchor.textContent ?? "";
  if (!Number.isFinite(monthly)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*p\/m/i);
    if (m) monthly = parseMoney(m[1]);
  }
  if (!Number.isFinite(initial)) {
    const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*\(Plus admin fee\)/i);
    if (m) initial = parseMoney(m[1]);
  }

  const summary = extractDealSummary(root);

  return {
    term: summary.term,
    initialMonths: summary.initialMonths,
    mileage: summary.mileage,
    monthly,
    initial,
    feeFromPage: summary.fee,
  };
}

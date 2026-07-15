import { parseMoney } from "../../core/money";
import type { DealTerms } from "../../core/cost";

export const DEAL_CARD_SELECTOR =
  'li.deal-card-v2, [data-test="search-result-item"]';
export const MODEL_CARD_SELECTOR = "div.deal-card[data-test-manufacturer-slug]";

/** Deal cost terms plus the annual mileage (NaN when the card omits it). */
export interface ExtractedDeal extends DealTerms {
  mileage: number;
}

/** "5,000" or "5k" -> 5000. */
function parseMileage(s: unknown): number {
  const cleaned = String(s ?? "").trim().replace(/,/g, "");
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(k?)$/i);
  if (!m) return NaN;
  return parseFloat(m[1]) * (m[2] ? 1000 : 1);
}

/**
 * Pull term, initial rental, monthly price, fees and mileage out of a deal
 * card. Preferred source is the data attributes leasing.com puts on the term
 * list (data-term, data-initialrental, data-mileage); each number
 * independently falls back to a regex over the card's visible text so a
 * markup change degrades gracefully.
 */
export function extractDealTerms(card: Element): ExtractedDeal {
  const termEl = card.querySelector("[data-term]");
  const initEl = card.querySelector("[data-initialrental]");
  const mileageEl = card.querySelector("[data-mileage]");
  let term = termEl
    ? parseInt(termEl.getAttribute("data-term") ?? "", 10)
    : NaN;
  let initial = initEl
    ? parseMoney(initEl.getAttribute("data-initialrental"))
    : NaN;
  let mileage = mileageEl
    ? parseMileage(mileageEl.getAttribute("data-mileage"))
    : NaN;

  const priceEl = card.querySelector(".price");
  let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;

  let fees = NaN;
  for (const label of card.querySelectorAll(".label")) {
    if (/additional fees/i.test(label.textContent ?? "")) {
      const valueEl =
        label.nextElementSibling ??
        label.parentElement?.querySelector(".value");
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
    fees = m ? parseMoney(m[1]) : 0; // some deals genuinely have no fee line
  }
  if (!Number.isFinite(mileage)) {
    const m = text.match(/([\d,]+k?)\s*miles\s*p\/a/i);
    if (m) mileage = parseMileage(m[1]);
  }

  return { term, initial, monthly, fees, mileage };
}

export const DEAL_PAGE_SUMMARY_SELECTOR = "ul.data-table.summary";
export const DEAL_PAGE_PRICE_SELECTOR = ".deal-page-price-wrap";

/** The numbers on an individual deal page's summary table. */
export interface DealPageInfo {
  term: number;
  mileage: number;
  monthly: number;
  initial: number;
  fees: number;
  /** The page's own all-in "Total lease cost". */
  total: number;
}

/**
 * Individual deal pages list everything in a label/value summary table,
 * including leasing.com's own all-in total. Returns null when the page has
 * no summary table (i.e. it isn't a deal page).
 */
export function extractDealPageInfo(root: ParentNode): DealPageInfo | null {
  const summary = root.querySelector(DEAL_PAGE_SUMMARY_SELECTOR);
  if (!summary) return null;

  const valueOf = (labelRe: RegExp): string => {
    for (const li of summary.querySelectorAll("li")) {
      const label = li.querySelector(".label");
      if (label && labelRe.test(label.textContent ?? "")) {
        return li.querySelector(".value")?.textContent ?? "";
      }
    }
    return "";
  };
  // "12 months = £2,001.48" — take the £ amount, not every digit in the text.
  const poundsIn = (s: string): number => {
    const m = s.match(/£\s*([\d,]+(?:\.\d+)?)/);
    return m ? parseMoney(m[1]) : NaN;
  };

  const term = parseInt(valueOf(/contract length/i), 10); // "24 months"
  const mileage = parseMoney(valueOf(/annual mileage/i)); // "5,000 p/a"
  const monthly = poundsIn(valueOf(/monthly payment/i));
  const initial = poundsIn(valueOf(/initial rental/i));
  const feesText = valueOf(/additional fees/i);
  const fees = /£/.test(feesText) ? poundsIn(feesText) : 0; // absent line = no fee
  let total = poundsIn(valueOf(/total lease cost/i));
  if (
    !Number.isFinite(total) &&
    Number.isFinite(initial) &&
    Number.isFinite(monthly) &&
    Number.isFinite(term)
  ) {
    total = initial + monthly * (term - 1) + fees;
  }

  return { term, mileage, monthly, initial, fees, total };
}

export interface ModelCardInfo {
  manufacturer: string;
  range: string;
  fuel: string | null;
  finance: "Personal" | "Business";
}

/**
 * Model cards (category pages) name the car in an h3 and carry the
 * manufacturer as a slug. The search API's facets are case-sensitive, so the
 * display name is split using the slug's word count (e.g. "alfa-romeo" ->
 * first two words are the manufacturer, the rest is the range).
 */
export function extractModelCardInfo(
  card: Element,
  origin = location.origin
): ModelCardInfo | null {
  const mfrSlug = card.getAttribute("data-test-manufacturer-slug");
  const titleEl = card.querySelector(".deal-vehicle, h3");
  const link = card.querySelector('a[href*="/car-leasing/"]');
  if (!mfrSlug || !titleEl) return null;

  const words = (titleEl.textContent ?? "").trim().split(/\s+/);
  const mfrWords = mfrSlug.split("-").filter(Boolean).length;
  const manufacturer = words.slice(0, mfrWords).join(" ");
  const range = words.slice(mfrWords).join(" ");
  if (!manufacturer || !range) return null;

  let fuel: string | null = null;
  let finance: ModelCardInfo["finance"] = "Personal";
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

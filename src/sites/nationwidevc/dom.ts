import { parseMoney } from "../../core/money";

/**
 * Listing cards (`/car-leasing/deals` and manufacturer/search pages). The
 * primary hook is the analytics data attribute; a redesign that drops it
 * still leaves the `.article.full-article` shell with "Initial Rental" in
 * its text, so the fallback filters on that instead of guessing a new class.
 */
const CARD_SELECTOR = '[data-analytics-desc="vehicle card"]';
const CARD_FALLBACK_SELECTOR = ".article.full-article";

export function findCards(root: ParentNode): Element[] {
  const primary = Array.from(root.querySelectorAll(CARD_SELECTOR));
  if (primary.length > 0) return primary;
  return Array.from(root.querySelectorAll(CARD_FALLBACK_SELECTOR)).filter(
    (el) => /Initial Rental/i.test(el.textContent ?? "")
  );
}

/** What a listing card alone can tell us: no term, no mileage. */
export interface CardQuote {
  monthly: number;
  initial: number;
  fee: number;
}

/**
 * Pull the "From" monthly, initial rental and processing fee out of a card.
 * The monthly is preferably read from the `data-price` attribute (present on
 * the same element the card selector matches), then the price element, then
 * a text regex; initial/fee always come from the small-print block's text
 * since they aren't broken out into their own elements.
 */
export function extractCardQuote(card: Element): CardQuote {
  let monthly = parseMoney((card as HTMLElement).dataset?.price);

  const priceEl = card.querySelector('[class*="article-price__value"]');
  if (!Number.isFinite(monthly) && priceEl) {
    monthly = parseMoney(priceEl.textContent);
  }

  const smallPrint = card.querySelector('[class*="article-price__small-print"]');
  const smallText = smallPrint?.textContent ?? "";

  let initial = NaN;
  const initMatch = smallText.match(/Initial Rental:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
  if (initMatch) initial = parseMoney(initMatch[1]);

  let fee = NaN;
  const feeMatch = smallText.match(/Processing Fee:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
  if (feeMatch) fee = parseMoney(feeMatch[1]);

  const text = card.textContent ?? "";
  if (!Number.isFinite(monthly)) {
    const m = text.match(
      /£\s*([\d,]+(?:\.\d+)?)\s*(?:Personal price)?\s*per month/i
    );
    if (m) monthly = parseMoney(m[1]);
  }
  if (!Number.isFinite(initial)) {
    const m = text.match(/Initial Rental:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) initial = parseMoney(m[1]);
  }
  if (!Number.isFinite(fee)) {
    const m = text.match(/Processing Fee:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) fee = parseMoney(m[1]);
  }

  return { monthly, initial, fee };
}

/** The deal-page pathname a card links to, however it's exposed. */
export function cardHref(card: Element): string | null {
  return (
    (card as HTMLElement).dataset?.link ??
    card.querySelector('a[href^="/car-leasing/"]')?.getAttribute("href") ??
    card.querySelector("a[href]")?.getAttribute("href") ??
    null
  );
}

/** Strip any query/hash so a card's href matches a deal page's location.pathname. */
export function pathnameFromHref(href: string): string {
  return href.replace(/[?#].*$/, "");
}

/**
 * Individual deal pages. The `-old` suffix on the price-block classes is a
 * refactor/AB flag (verified live 2026-07-17) — match on the stable
 * contains-fragments only, never the full class name.
 */
export const PRICE_BLOCK_SELECTOR =
  '[class*="variant-order-details"][class*="price-block"]';
const SUMMARY_SELECTOR = "dl.details-panel";

export interface OrderSummary {
  initial: number;
  term: number;
  mileage: number;
  fee: number;
}

/**
 * The "Order summary" `dl`: dt/dd pairs read structurally (tag order, not
 * classes) so a redesign that renames every class still works. Several dt
 * elements ("Excess Mileage:", "Roadside Assist:", "Standard Delivery:")
 * carry a nested tooltip `<span>`/`<button>` *inside the dt itself* (the
 * explanatory prose lives in the button's `data-tooltip` attribute, so it
 * doesn't leak into `dt.textContent`, but the nested elements still mean the
 * label isn't a plain text node) — labels are matched with a prefix regex
 * over the dt's full (whitespace-collapsed) textContent, and dt/dd pairing
 * is purely structural (next element sibling), so neither the nesting nor a
 * class rename can break it.
 */
export function extractOrderSummary(root: ParentNode): OrderSummary {
  const container = root.querySelector(SUMMARY_SELECTOR) ?? root;
  let initial = NaN;
  let term = NaN;
  let mileage = NaN;
  let fee = NaN;

  container.querySelectorAll("dt").forEach((dt) => {
    const label = (dt.textContent ?? "").replace(/\s+/g, " ").trim();
    const value = dt.nextElementSibling?.textContent ?? "";
    if (/^Initial Rental:?/i.test(label)) {
      initial = parseMoney(value);
    } else if (/^Contract Length:?/i.test(label)) {
      const m = value.match(/(\d+)/);
      if (m) term = parseInt(m[1], 10);
    } else if (/^Annual Mileage:?/i.test(label)) {
      mileage = parseMoney(value);
    } else if (/^Processing Fee:?/i.test(label)) {
      fee = parseMoney(value);
    }
  });

  // Text fallback for when the dl/dt/dd structure itself doesn't survive a
  // redesign; same field patterns, applied to the whole summary's text.
  // (Document.textContent is empty, not populated, so fall back to body
  // text when the container selector missed and container is the root
  // document — `||` rather than `??` since the empty string isn't nullish.)
  const text =
    (container as Element).textContent ||
    ((root as Document).body ?? (root as unknown as Element)).textContent ||
    "";
  if (!Number.isFinite(initial)) {
    const m = text.match(/Initial Rental:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) initial = parseMoney(m[1]);
  }
  if (!Number.isFinite(term)) {
    const m = text.match(/Contract Length:?\s*(\d+)\s*Months/i);
    if (m) term = parseInt(m[1], 10);
  }
  if (!Number.isFinite(mileage)) {
    const m = text.match(/Annual Mileage:?\s*([\d,]+)/i);
    if (m) mileage = parseMoney(m[1]);
  }
  if (!Number.isFinite(fee)) {
    const m = text.match(/Processing Fee:?\s*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) fee = parseMoney(m[1]);
  }

  return { initial, term, mileage, fee };
}

/** Everything needed to badge an individual deal page. */
export interface DealPageInfo extends OrderSummary {
  monthly: number;
}

/**
 * Reads the price block + order summary. Returns null when the price block
 * isn't on the page at all (i.e. this isn't a deal page).
 */
export function extractDealPageInfo(root: ParentNode): DealPageInfo | null {
  const anchor = root.querySelector(PRICE_BLOCK_SELECTOR);
  if (!anchor) return null;

  const priceEl = anchor.querySelector('[class*="__price"]');
  let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;
  if (!Number.isFinite(monthly)) {
    const m = (anchor.textContent ?? "").match(
      /£\s*([\d,]+(?:\.\d+)?)\s*(?:Personal price)?\s*per month/i
    );
    if (m) monthly = parseMoney(m[1]);
  }

  const summary = extractOrderSummary(root);
  return { monthly, ...summary };
}

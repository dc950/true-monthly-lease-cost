import { parseMoney } from "../../core/money";

/**
 * leasingoptions.co.uk charges a site-wide processing fee that neither deal
 * cards nor __NEXT_DATA__ ever carry (verified live 2026-07-17 across three
 * different deals/terms: £399.99 inc VAT every time). Deal pages show the
 * exact figure in the Finance Summary panel when present; this constant is
 * the fallback for that rare missing row and the only source for
 * special-offers cards, which never show it at all.
 */
export const LEASINGOPTIONS_FEE = 399.99;

// CSS-module hashed class names (e.g. card-deal_price__zHgZI) change per
// build, so every selector below matches on the stable prefix via a
// contains-match, never the full hashed class.
export const DEAL_PAGE_PRICE_SELECTOR = '[class*="card-deal_price"]';
const SUMMARY_SELECTOR = '[class*="vehicle-aside_summary"]';

/** Everything needed to badge an individual deal page. */
export interface DealPageInfo {
  /** Contract length in MONTHS (the page shows years; this is x12). */
  term: number;
  mileage: number;
  monthly: number;
  initial: number;
  /** NaN when the Finance Summary panel has no Processing fee row. */
  feeFromPage: number;
}

/**
 * Find the row in the Finance Summary panel whose <small> label matches
 * labelRe and return its value span's text. Rows are div blocks with a
 * <small> label (values contain React comment nodes such as
 * "3<!-- --> Years", which textContent already collapses to "3 Years") and
 * a sibling <span class="text-end"> value in the same row.
 */
/**
 * Full text of a ParentNode. Node.textContent is null for a Document itself
 * (only Elements concatenate their descendants' text), so when the panel
 * selector isn't found and root falls back to the whole document, read
 * document.body's text instead.
 */
function fullText(node: ParentNode): string {
  const body = (node as Partial<Document>).body;
  return (body ?? (node as Element)).textContent ?? "";
}

function rowValue(panel: ParentNode, labelRe: RegExp): string | null {
  for (const small of panel.querySelectorAll("small")) {
    const label = (small.textContent ?? "").trim();
    if (!labelRe.test(label)) continue;
    const value = small.parentElement?.querySelector('[class*="text-end"]');
    if (value) return value.textContent ?? "";
  }
  return null;
}

/**
 * A live deal page has several elements sharing the vehicle-aside_summary
 * prefix (colour/extras selectors, a "Configure your deal" stub, etc.); only
 * one is the populated Finance Summary. Pick the panel that actually holds
 * the "Contract length:" row, then the one containing the "Finance Summary"
 * heading, and finally fall back to the whole root so the text-regex
 * fallbacks still fire if the classes were renamed wholesale.
 */
function findSummaryPanel(root: ParentNode): ParentNode {
  const panels = Array.from(root.querySelectorAll(SUMMARY_SELECTOR));
  const withRows = panels.find((p) =>
    Array.from(p.querySelectorAll("small")).some((s) =>
      /^Contract length:/i.test((s.textContent ?? "").trim())
    )
  );
  if (withRows) return withRows;
  const withHeading = panels.find((p) =>
    /Finance Summary/i.test(p.textContent ?? "")
  );
  return withHeading ?? root;
}

/**
 * Individual deal pages: the card-deal price block gives the headline
 * monthly, and the Finance Summary aside panel gives contract length
 * (in YEARS - multiplied by 12 here), annual mileage, initial rental
 * (displayed excluding the processing fee) and the exact fee. Returns null
 * when the price block isn't on the page at all (i.e. this isn't a deal
 * page).
 */
export function extractDealPageInfo(root: ParentNode): DealPageInfo | null {
  const priceEl = root.querySelector(DEAL_PAGE_PRICE_SELECTOR);
  if (!priceEl) return null;

  let monthly = parseMoney(priceEl.textContent);
  if (!Number.isFinite(monthly)) {
    const block = priceEl.parentElement?.textContent ?? priceEl.textContent ?? "";
    const m = block.match(/£\s*([\d,]+\.\d\d)\s*Per\s*month/i);
    if (m) monthly = parseMoney(m[1]);
  }

  const panel = findSummaryPanel(root);

  let term = NaN;
  const termVal = rowValue(panel, /^Contract length:/i);
  if (termVal) {
    const m = termVal.match(/(\d+)/);
    if (m) term = parseInt(m[1], 10) * 12;
  }

  let mileage = NaN;
  const mileageVal = rowValue(panel, /^Annual mileage:/i);
  if (mileageVal) mileage = parseMoney(mileageVal);

  let initial = NaN;
  const initialVal = rowValue(panel, /^Initial rental/i);
  if (initialVal) initial = parseMoney(initialVal);

  let feeFromPage = NaN;
  const feeVal = rowValue(panel, /^Processing fee:/i);
  if (feeVal) feeFromPage = parseMoney(feeVal);

  // Text fallbacks over the panel's full text, for a redesign that renames
  // every class (both the summary container and the row/value classes).
  const panelText = fullText(panel);
  if (!Number.isFinite(term)) {
    const m = panelText.match(/Contract length:\s*(\d+)\s*Years/i);
    if (m) term = parseInt(m[1], 10) * 12;
  }
  if (!Number.isFinite(mileage)) {
    const m = panelText.match(/Annual mileage:\s*([\d,]+)/i);
    if (m) mileage = parseMoney(m[1]);
  }
  if (!Number.isFinite(initial)) {
    const m = panelText.match(/Initial rental[^£]*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) initial = parseMoney(m[1]);
  }
  if (!Number.isFinite(feeFromPage)) {
    const m = panelText.match(/Processing fee:\s*£\s*([\d,]+(?:\.\d+)?)/i);
    if (m) feeFromPage = parseMoney(m[1]);
  }

  return { term, mileage, monthly, initial, feeFromPage };
}

/**
 * Special-offers listing cards (/car-leasing/special-offers). The card DOM
 * carries no term/initial/fee, only vehicle identity - the lease profile is
 * looked up from __NEXT_DATA__ (see nextdata.ts) by vehicleRef, which is
 * embedded in the title anchor's href.
 */
export const SPECIAL_OFFER_CARD_SELECTOR = '[class*="card-vehicle_wrapper"]';

/**
 * The vehicleRef embedded in a special-offers card's stretched-link href,
 * e.g. ".../1100427683/vehicle?isdefault=1..." -> 1100427683. Null when the
 * card has no such link (e.g. an unrelated element).
 */
export function vehicleRefFromCard(card: Element): number | null {
  const href = card.querySelector("a.stretched-link")?.getAttribute("href") ?? "";
  const m = href.match(/\/(\d{6,})\/vehicle/);
  return m ? parseInt(m[1], 10) : null;
}

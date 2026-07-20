import type { DealTerms } from "../../core/cost";
import { LEASINGOPTIONS_FEE } from "./dom";

/**
 * A vehicle/model card's lease profile, resolved from __NEXT_DATA__. Used
 * for both special-offers cards (keyed by vehicleRef) and model-preview
 * cards on category pages (keyed by make/shortModelUrl slug too).
 */
export interface OfferProfile extends DealTerms {
  mileage: number;
}

/**
 * The two lookup tables built by buildOfferMap: byRef for cards whose href
 * carries a vehicleRef (special-offers cards, and derivative cards on
 * category pages), bySlug for model cards, whose href has no vehicleRef at
 * all and must be matched by make/shortModelUrl instead (see
 * dom.ts#modelSlugFromCard).
 */
export interface OfferProfileMaps {
  byRef: Map<number, OfferProfile>;
  bySlug: Map<string, OfferProfile>;
}

/** Personal Contract Hire - the only contract type this adapter badges. */
const PCH_CONTRACT_TYPE = 2;

interface RawDeal {
  contractType: number;
  mileage: number;
  /** Contract length in YEARS. */
  term: number;
  initialRentalMonths: number;
  monthlyPrice: number;
}

interface RawOfferEntry {
  vehicleRef: number;
  deals: RawDeal[];
  /**
   * Only present on modelPreviews.dataItems entries (absent on
   * topSpecialOffers ones) - the model-card slug fields used for bySlug
   * keying. shortModel is the display name ("ID.7") and can mismatch the
   * URL slug ("id-7"), so always key off shortModelUrl, never shortModel.
   */
  make?: string;
  shortModelUrl?: string;
}

function isRawDeal(x: unknown): x is RawDeal {
  const d = x as Partial<RawDeal> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.contractType === "number" &&
    typeof d.mileage === "number" &&
    typeof d.term === "number" &&
    typeof d.initialRentalMonths === "number" &&
    typeof d.monthlyPrice === "number"
  );
}

function isRawOfferEntry(x: unknown): x is RawOfferEntry {
  const e = x as Partial<RawOfferEntry> | null;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.vehicleRef === "number" &&
    Array.isArray(e.deals)
  );
}

/**
 * PCH deal -> lease profile. term is in years on the wire (x12 here);
 * initial rental isn't given as an amount, only as a number of months of
 * the headline monthly, so it's derived (matches the deal-page's own
 * "Initial rental (First months payment)" wording). The processing fee is
 * never in __NEXT_DATA__ (DOM-only, site-wide), so it's always the constant.
 */
function profileFromEntry(entry: RawOfferEntry): OfferProfile | null {
  const pch = entry.deals.find(
    (d) => isRawDeal(d) && d.contractType === PCH_CONTRACT_TYPE
  );
  if (!pch) return null;

  const monthly = pch.monthlyPrice;
  return {
    term: pch.term * 12,
    mileage: pch.mileage,
    monthly,
    initial: pch.initialRentalMonths * monthly,
    fees: LEASINGOPTIONS_FEE,
  };
}

/**
 * Scan every array-of-offer-entries found under
 * __NEXT_DATA__.props.pageProps for entries shaped like {vehicleRef,
 * deals: [...]}. Two shapes are seen live: topSpecialOffers is a plain
 * array (special-offers listing page); modelPreviews is an OBJECT that
 * wraps its array in a `dataItems` property (category/model pages) - so a
 * pageProps value that isn't itself an array is also scanned one level
 * down for an array of entries, rather than hard-coding the `dataItems`
 * key, to stay defensive about other wrapper shapes. Entries with
 * make/shortModelUrl (model-preview entries) are additionally indexed into
 * bySlug, since model cards have no vehicleRef in their href at all (see
 * dom.ts#modelSlugFromCard).
 */
export function buildOfferMap(nextData: unknown): OfferProfileMaps {
  const byRef = new Map<number, OfferProfile>();
  const bySlug = new Map<string, OfferProfile>();
  const pageProps = (nextData as { props?: { pageProps?: unknown } } | null)
    ?.props?.pageProps;
  if (!pageProps || typeof pageProps !== "object") return { byRef, bySlug };

  const addEntries = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (!isRawOfferEntry(entry)) continue;
      const profile = profileFromEntry(entry);
      if (!profile) continue;
      byRef.set(entry.vehicleRef, profile);
      if (entry.make && entry.shortModelUrl) {
        bySlug.set(`${entry.make.toLowerCase()}/${entry.shortModelUrl.toLowerCase()}`, profile);
      }
    }
  };

  for (const value of Object.values(pageProps as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      addEntries(value);
      continue;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        addEntries(nested);
      }
    }
  }
  return { byRef, bySlug };
}

/** Parse and JSON-decode a document's __NEXT_DATA__ script tag, if present. */
export function nextDataFromDocument(doc: Document): unknown | null {
  const script = doc.querySelector("script#__NEXT_DATA__");
  if (!script?.textContent) return null;
  try {
    return JSON.parse(script.textContent);
  } catch {
    return null;
  }
}

/**
 * True for a Document, checked via nodeType (9) rather than `instanceof
 * Document` - the happy-dom test environment's global Document class isn't
 * always the same object the document global was constructed with, which
 * makes instanceof unreliable there.
 */
function isDocument(x: unknown): x is Document {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { nodeType?: number }).nodeType === 9
  );
}

/**
 * Build the byRef/bySlug lease profile maps from either a live Document
 * (reads its __NEXT_DATA__ script tag) or an already-parsed __NEXT_DATA__
 * object (for tests). Defensive throughout: absent/malformed data yields
 * empty maps rather than throwing.
 */
export function extractOfferProfiles(source: Document | unknown): OfferProfileMaps {
  const nextData = isDocument(source) ? nextDataFromDocument(source) : source;
  if (nextData == null) return { byRef: new Map(), bySlug: new Map() };
  return buildOfferMap(nextData);
}

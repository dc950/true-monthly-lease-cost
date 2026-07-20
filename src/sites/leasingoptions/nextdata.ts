import type { DealTerms } from "../../core/cost";
import { LEASINGOPTIONS_FEE } from "./dom";

/** A special-offers card's lease profile, resolved from __NEXT_DATA__. */
export interface SpecialOfferProfile extends DealTerms {
  mileage: number;
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
function profileFromEntry(entry: RawOfferEntry): SpecialOfferProfile | null {
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
 * Scan every array under __NEXT_DATA__.props.pageProps whose entries look
 * like {vehicleRef, deals: [...]}. topSpecialOffers is the one seen live
 * (special-offers listing page), but this stays defensive about other
 * pageProps arrays shaped the same way rather than hard-coding just that key.
 */
export function buildOfferMap(nextData: unknown): Map<number, SpecialOfferProfile> {
  const map = new Map<number, SpecialOfferProfile>();
  const pageProps = (nextData as { props?: { pageProps?: unknown } } | null)
    ?.props?.pageProps;
  if (!pageProps || typeof pageProps !== "object") return map;

  for (const value of Object.values(pageProps as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!isRawOfferEntry(entry)) continue;
      const profile = profileFromEntry(entry);
      if (profile) map.set(entry.vehicleRef, profile);
    }
  }
  return map;
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
 * Build the vehicleRef -> lease profile map from either a live Document
 * (reads its __NEXT_DATA__ script tag) or an already-parsed __NEXT_DATA__
 * object (for tests). Defensive throughout: absent/malformed data yields an
 * empty map rather than throwing.
 */
export function extractOfferProfiles(
  source: Document | unknown
): Map<number, SpecialOfferProfile> {
  const nextData = isDocument(source) ? nextDataFromDocument(source) : source;
  if (nextData == null) return new Map();
  return buildOfferMap(nextData);
}

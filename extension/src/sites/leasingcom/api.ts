import type { ModelCardInfo } from "./dom";

/** Contract lengths leasing.com offers as search filters. */
export const TERMS = [18, 24, 36, 48] as const;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** The slice of a /api/deals/search/ response we rely on. */
interface SearchResponse {
  TotalResultCount: number;
  Deals?: Array<{
    DealCosts: {
      MonthlyPrice: number;
      TotalLeaseCost: number; // includes initial rental AND admin fees
      InitialRental: number;
      AdditionalFees: number;
    };
    DealProfile: {
      ContractLengthMonths: number;
      DepositMonths: number;
      AnnualMileage: number;
    };
  }>;
}

/** The cheapest deal for one contract-length bucket. */
export interface TermQuote {
  term: number;
  total: number;
  monthly: number;
  effective: number;
  mileage: number;
}

export interface BestRealCost {
  best: TermQuote;
  perTerm: TermQuote[];
}

/**
 * Cheapest deal for one term, via leasing.com's own search API sorted by
 * lowest total cost — within a fixed term that is exactly the lowest
 * effective monthly, so one result per bucket suffices.
 */
export async function cheapestForTerm(
  info: ModelCardInfo,
  term: number
): Promise<TermQuote | null> {
  const facets = [
    { fieldName: "ContractLength", selections: [String(term)] },
    { fieldName: "Manufacturer", selections: [info.manufacturer] },
    { fieldName: "Range", selections: [info.range] },
  ];
  if (info.fuel) {
    facets.push({ fieldName: "FuelType", selections: [info.fuel] });
  }

  const body = {
    searchCriteria: {
      facets,
      matches: [
        { matchWith: "Car", fieldName: "vehicleType" },
        { matchWith: info.finance, fieldName: "FinanceType" },
      ],
      ranges: [],
      partialMatches: [],
    },
    pagination: { itemsPerPage: 1, pageNumber: 1 },
    orderBy: {
      fieldName: "totalLeaseCost",
      friendlyName: "Lowest total cost",
      direction: "ascending",
    },
  };

  const resp = await fetch(location.origin + "/api/deals/search/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`search API ${resp.status}`);
  const json = (await resp.json()) as SearchResponse;
  const deal = json.Deals?.[0];
  if (!deal) return null;
  return {
    term,
    total: deal.DealCosts.TotalLeaseCost,
    monthly: deal.DealCosts.MonthlyPrice,
    effective: deal.DealCosts.TotalLeaseCost / term,
    mileage: deal.DealProfile.AnnualMileage,
  };
}

function cacheKey(info: ModelCardInfo): string {
  return `lrc:${info.manufacturer}|${info.range}|${info.fuel ?? ""}|${info.finance}`;
}

/**
 * Best (lowest) effective monthly across all term buckets, with the per-term
 * breakdown. Cached in sessionStorage so repeated visits within a session
 * don't re-query.
 */
export async function bestRealCost(
  info: ModelCardInfo
): Promise<BestRealCost | null> {
  const key = cacheKey(info);
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? "");
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return hit.data as BestRealCost;
    }
  } catch {
    /* absent or corrupt cache entry — refetch */
  }

  const settled = await Promise.allSettled(
    TERMS.map((t) => cheapestForTerm(info, t))
  );
  const perTerm = settled
    .filter(
      (s): s is PromiseFulfilledResult<TermQuote> =>
        s.status === "fulfilled" && s.value !== null
    )
    .map((s) => s.value);
  if (perTerm.length === 0) return null;

  const best = perTerm.reduce((a, b) => (a.effective <= b.effective ? a : b));
  const data: BestRealCost = { best, perTerm };
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* storage full — fine, just uncached */
  }
  return data;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bestRealCost,
  cheapestForTerm,
  pickBest,
  type TermQuote,
} from "../src/sites/leasingcom/api";
import type { ModelCardInfo } from "../src/sites/leasingcom/dom";

const ioniq: ModelCardInfo = {
  manufacturer: "Hyundai",
  range: "Ioniq 5",
  fuel: "Electric",
  finance: "Personal",
};

function apiResponse(totalLeaseCost: number, term: number, monthly = 300) {
  return {
    ok: true,
    json: async () => ({
      TotalResultCount: 1,
      Deals: [
        {
          DealCosts: {
            MonthlyPrice: monthly,
            TotalLeaseCost: totalLeaseCost,
            InitialRental: monthly * 12,
            AdditionalFees: 299,
          },
          DealProfile: {
            ContractLengthMonths: term,
            DepositMonths: 12,
            AnnualMileage: 5000,
          },
        },
      ],
    }),
  };
}

function requestedTerm(body: unknown): number {
  const parsed = JSON.parse(body as string);
  const facet = parsed.searchCriteria.facets.find(
    (f: { fieldName: string }) => f.fieldName === "ContractLength"
  );
  return parseInt(facet.selections[0], 10);
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cheapestForTerm", () => {
  it("sends the payload shape leasing.com expects", async () => {
    const fetchMock = vi.fn(async () => apiResponse(5374, 24, 145));
    vi.stubGlobal("fetch", fetchMock);

    await cheapestForTerm(ioniq, 24);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/deals/search/");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body as string);
    expect(body.searchCriteria.facets).toContainEqual({
      fieldName: "ContractLength",
      selections: ["24"],
    });
    expect(body.searchCriteria.facets).toContainEqual({
      fieldName: "Manufacturer",
      selections: ["Hyundai"],
    });
    expect(body.searchCriteria.facets).toContainEqual({
      fieldName: "Range",
      selections: ["Ioniq 5"],
    });
    expect(body.searchCriteria.facets).toContainEqual({
      fieldName: "FuelType",
      selections: ["Electric"],
    });
    expect(body.searchCriteria.matches).toContainEqual({
      matchWith: "Personal",
      fieldName: "FinanceType",
    });
    expect(body.pagination).toEqual({ itemsPerPage: 1, pageNumber: 1 });
    expect(body.orderBy.fieldName).toBe("totalLeaseCost");
    expect(body.orderBy.direction).toBe("ascending");
  });

  it("computes effective monthly from the API's all-in total", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => apiResponse(5374, 24, 145)));
    const quote = await cheapestForTerm(ioniq, 24);
    expect(quote).not.toBeNull();
    expect(quote!.effective).toBeCloseTo(223.92, 2);
    expect(quote!.mileage).toBe(5000);
  });

  it("returns null when the term bucket has no deals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ TotalResultCount: 0, Deals: [] }),
      }))
    );
    expect(await cheapestForTerm(ioniq, 18)).toBeNull();
  });
});

describe("bestRealCost", () => {
  // Totals chosen so the per-term effectives are 500, 400, 300, 400:
  // the 36-month bucket must win even though 18 months has the lowest total.
  const totals: Record<number, number> = {
    18: 9000,
    24: 9600,
    36: 10800,
    48: 19200,
  };

  function fetchByTerm() {
    return vi.fn(async (_url: string, opts: RequestInit) => {
      const term = requestedTerm(opts.body);
      return apiResponse(totals[term], term);
    });
  }

  it("picks the lowest effective monthly across term buckets", async () => {
    const fetchMock = fetchByTerm();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bestRealCost(ioniq);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result!.best.term).toBe(36);
    expect(result!.best.effective).toBe(300);
    expect(result!.perTerm).toHaveLength(4);
  });

  it("serves repeat lookups from the session cache", async () => {
    const fetchMock = fetchByTerm();
    vi.stubGlobal("fetch", fetchMock);

    await bestRealCost(ioniq);
    const again = await bestRealCost(ioniq);
    expect(fetchMock).toHaveBeenCalledTimes(4); // no extra requests
    expect(again!.best.term).toBe(36);
  });

  it("survives individual term buckets failing", async () => {
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      const term = requestedTerm(opts.body);
      if (term === 36) return { ok: false, status: 500 };
      return apiResponse(totals[term], term);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bestRealCost(ioniq);
    expect(result!.perTerm).toHaveLength(3);
    expect(result!.best.term).toBe(24); // 36 gone, next best effective is 400 (tie -> earlier term)
  });

  it("returns null when no bucket has deals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ TotalResultCount: 0, Deals: [] }),
      }))
    );
    expect(await bestRealCost(ioniq)).toBeNull();
  });
});

describe("pickBest", () => {
  const quote = (term: number, effective: number): TermQuote => ({
    term,
    effective,
    total: effective * term,
    monthly: effective * 0.8,
    mileage: 5000,
  });
  const perTerm = [
    quote(18, 500),
    quote(24, 400),
    quote(36, 300),
    quote(48, 350),
  ];

  it("picks the lowest effective among allowed terms", () => {
    expect(pickBest(perTerm, () => true)?.term).toBe(36);
    expect(pickBest(perTerm, (t) => t <= 24)?.term).toBe(24);
    expect(pickBest(perTerm, (t) => t >= 48)?.term).toBe(48);
  });

  it("returns null when no term is allowed", () => {
    expect(pickBest(perTerm, () => false)).toBeNull();
    expect(pickBest([], () => true)).toBeNull();
  });
});

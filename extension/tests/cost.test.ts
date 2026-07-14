import { describe, expect, it } from "vitest";
import {
  effectiveMonthly,
  isViableDeal,
  markupPct,
  severity,
  totalLeaseCost,
} from "../src/core/cost";

// Real deal from leasing.com (Corsa, 12+23 profile): the site's own API
// reports TotalLeaseCost 5374.00 for these inputs, so the formula must
// reproduce that exactly.
const corsa = { term: 24, initial: 1740, monthly: 145, fees: 299 };

describe("totalLeaseCost / effectiveMonthly", () => {
  it("matches the site's own total for a verified real deal", () => {
    expect(totalLeaseCost(corsa)).toBe(5374);
    expect(effectiveMonthly(corsa)).toBeCloseTo(223.92, 2);
  });

  it("initial rental replaces the first monthly payment", () => {
    // 1-month "term" degenerates to just the initial rental + fees
    expect(totalLeaseCost({ term: 1, initial: 500, monthly: 999, fees: 10 })).toBe(510);
  });

  it("handles zero fees", () => {
    expect(totalLeaseCost({ term: 24, initial: 1740, monthly: 145, fees: 0 })).toBe(5075);
  });
});

describe("markupPct", () => {
  it("rounds to whole percent", () => {
    expect(markupPct(223.92, 145)).toBe(54);
    expect(markupPct(145, 145)).toBe(0);
    expect(markupPct(362.06, 288.56)).toBe(25);
  });
});

describe("severity", () => {
  it("buckets at <15 / <40 / rest", () => {
    expect(severity(0)).toBe("low");
    expect(severity(14)).toBe("low");
    expect(severity(15)).toBe("mid");
    expect(severity(39)).toBe("mid");
    expect(severity(40)).toBe("high");
    expect(severity(54)).toBe("high");
  });
});

describe("isViableDeal", () => {
  it("accepts complete deals", () => {
    expect(isViableDeal(corsa)).toBe(true);
  });

  it("rejects NaNs and nonsense terms", () => {
    expect(isViableDeal({ ...corsa, term: NaN })).toBe(false);
    expect(isViableDeal({ ...corsa, term: 0 })).toBe(false);
    expect(isViableDeal({ ...corsa, initial: NaN })).toBe(false);
    expect(isViableDeal({ ...corsa, monthly: NaN })).toBe(false);
    expect(isViableDeal({ ...corsa, fees: NaN })).toBe(false);
  });
});

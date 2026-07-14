/**
 * One concrete lease deal as advertised: an N-month term, an initial rental
 * paid upfront in place of the first monthly payment, and one-off admin fees
 * (leasing sites display the initial rental excluding those fees).
 */
export interface DealTerms {
  term: number;
  initial: number;
  monthly: number;
  fees: number;
}

/** False when extraction produced NaNs or a nonsense term. */
export function isViableDeal(t: DealTerms): boolean {
  return (
    Number.isFinite(t.term) &&
    t.term > 0 &&
    Number.isFinite(t.initial) &&
    Number.isFinite(t.monthly) &&
    Number.isFinite(t.fees)
  );
}

/** Everything paid over the life of the lease. */
export function totalLeaseCost(t: DealTerms): number {
  return t.initial + t.monthly * (t.term - 1) + t.fees;
}

/** The number that makes deals comparable: total cost spread over the term. */
export function effectiveMonthly(t: DealTerms): number {
  return totalLeaseCost(t) / t.term;
}

/** Whole-percent markup of the real monthly cost over the advertised one. */
export function markupPct(realMonthly: number, headlineMonthly: number): number {
  return Math.round((realMonthly / headlineMonthly - 1) * 100);
}

export type Severity = "low" | "mid" | "high";

export function severity(pct: number): Severity {
  return pct < 15 ? "low" : pct < 40 ? "mid" : "high";
}

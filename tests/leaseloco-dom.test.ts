import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  extractLeaseLocoDeal,
  impliedFees,
} from "../src/sites/leaseloco/dom";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.join(here, "fixtures", "leaseloco-deal-card.html"),
  "utf8"
);

describe("extractLeaseLocoDeal", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture;
  });

  const card = () => document.querySelector('[class*="vehicle-card_container"]')!;

  it("reads the profile from the config-link URL and prices from the card", () => {
    const deal = extractLeaseLocoDeal(card());
    expect(deal).toEqual({
      term: 24,
      initialMonths: 12,
      mileage: 5000,
      monthly: 225.56,
      total: 8157.4,
    });
  });

  it("computes the real monthly and the fee implied by the all-in total", () => {
    const deal = extractLeaseLocoDeal(card());
    expect(deal.total / deal.term).toBeCloseTo(339.89, 2);
    // 35 payments of £225.56 = £7,894.60; the £8,157.40 total implies £262.80 fees.
    expect(impliedFees(deal)).toBeCloseTo(262.8, 2);
  });

  it("falls back to text parsing when the URL profile and price classes go", () => {
    const c = card();
    c.querySelector('a[href*="/config"]')!.setAttribute("href", "#");
    c.querySelectorAll('[class*="vehicle-card_monthly-price"]').forEach(
      (el) => (el.className = "price-x")
    );
    c.querySelectorAll('[class*="vehicle-card_total"]').forEach(
      (el) => (el.className = "total-x")
    );

    // "2 years, 12 months initial · 5,000 mi." (textContent includes the
    // responsive hidden spans) plus "£225.56 per month" / "£8,157.40 total".
    expect(extractLeaseLocoDeal(c)).toEqual({
      term: 24,
      initialMonths: 12,
      mileage: 5000,
      monthly: 225.56,
      total: 8157.4,
    });
  });

  it("returns NaNs (not throws) on an unrelated element", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    const deal = extractLeaseLocoDeal(document.querySelector("div")!);
    expect(deal.term).toBeNaN();
    expect(deal.initialMonths).toBeNaN();
    expect(deal.mileage).toBeNaN();
    expect(deal.monthly).toBeNaN();
    expect(deal.total).toBeNaN();
  });
});

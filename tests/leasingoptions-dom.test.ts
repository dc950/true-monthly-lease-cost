import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { effectiveMonthly, totalLeaseCost } from "../src/core/cost";
import {
  DEAL_PAGE_PRICE_SELECTOR,
  LEASINGOPTIONS_FEE,
  extractDealPageInfo,
} from "../src/sites/leasingoptions/dom";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "fixtures", name), "utf8");

describe("extractDealPageInfo", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("leasingoptions-deal-page.html");
  });

  it("reads monthly from the price block and term/mileage/initial/fee from the Finance Summary panel", () => {
    // Contract length is shown in YEARS ("3 Years") - must come back as
    // months (36), and values carry React comment nodes
    // ("£399.99<!-- --> <!-- -->Inc. VAT") which textContent already
    // collapses, so parsing straight off textContent is correct.
    expect(extractDealPageInfo(document)).toEqual({
      term: 36,
      mileage: 5000,
      monthly: 190.91,
      initial: 2290.92,
      feeFromPage: 399.99,
    });
  });

  it("picks the populated Finance Summary among several same-prefixed panels", () => {
    // Live deal pages render ~5 elements sharing the vehicle-aside_summary
    // class prefix (colour/extras selectors, a "Configure your deal" stub);
    // only one holds the finance rows, and it is NOT first. Prepend a decoy
    // empty panel so a naive querySelector would grab the wrong one.
    const decoy =
      '<div class="vehicle-aside_summary__decoy p-3">' +
      "<h6>Configure your deal</h6><small>This vehicle is available now</small>" +
      "</div>";
    document.body.innerHTML = decoy + document.body.innerHTML;
    expect(extractDealPageInfo(document)).toEqual({
      term: 36,
      mileage: 5000,
      monthly: 190.91,
      initial: 2290.92,
      feeFromPage: 399.99,
    });
  });

  it("falls back to text parsing when the Finance Summary panel's classes are stripped", () => {
    // Simulate a redesign: strip every class inside (and on) the summary
    // panel, but leave the card-deal_price block alone - that's the "is
    // this a deal page" signal (see the null-check test below), so a
    // redesign that renames only the summary panel's markup should still
    // recover every field via the regex-over-text fallback.
    document
      .querySelectorAll('[class*="vehicle-aside_summary"], [class*="vehicle-aside_summary"] *')
      .forEach((el) => el.removeAttribute("class"));
    const info = extractDealPageInfo(document)!;
    expect(info.term).toBe(36);
    expect(info.mileage).toBe(5000);
    expect(info.initial).toBeCloseTo(2290.92, 2);
    expect(info.feeFromPage).toBeCloseTo(399.99, 2);
  });

  it("returns null when the price block isn't on the page", () => {
    document.body.innerHTML = "<div><p>not a deal page</p></div>";
    expect(extractDealPageInfo(document)).toBeNull();
  });

  it("finds the price block via the documented selector", () => {
    expect(document.querySelector(DEAL_PAGE_PRICE_SELECTOR)?.textContent).toBe(
      "£190.91"
    );
  });
});

describe("cost pinning (verified 2026-07-17 live figures)", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("leasingoptions-deal-page.html");
  });

  it("matches the real total/effective monthly for the captured deal", () => {
    // 2290.92 initial + 190.91 x 35 payments + 399.99 processing fee.
    const info = extractDealPageInfo(document)!;
    const terms = {
      term: info.term,
      initial: info.initial,
      monthly: info.monthly,
      fees: info.feeFromPage,
    };
    expect(terms.fees).toBe(LEASINGOPTIONS_FEE);
    expect(totalLeaseCost(terms)).toBeCloseTo(9372.76, 2);
    expect(effectiveMonthly(terms)).toBeCloseTo(260.35, 2);
  });
});

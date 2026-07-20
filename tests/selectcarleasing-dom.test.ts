import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { effectiveMonthly, totalLeaseCost } from "../src/core/cost";
import {
  SELECT_ARRANGEMENT_FEE,
  dealCardHref,
  extractDealCard,
  extractDealPageInfo,
  extractDealSummary,
} from "../src/sites/selectcarleasing/dom";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "fixtures", name), "utf8");

describe("extractDealCard", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("selectcarleasing-deal-card.html");
  });

  const card = () => document.querySelector("article.drv-car-card")!;

  it("reads term, initial payment, mileage and monthly, assuming the site-wide fee", () => {
    expect(extractDealCard(card())).toEqual({
      term: 36,
      initial: 2892.36,
      mileage: 5000,
      monthly: 241.03,
      fees: SELECT_ARRANGEMENT_FEE,
    });
  });

  it("finds the deal link from the card's data attribute", () => {
    expect(dealCardHref(card())).toBe(
      "/car-leasing/jaecoo/7/suv/16t-deluxe-5dr-7dct?model_year=2025"
    );
  });

  it("falls back to text parsing when every class attribute disappears", () => {
    // Simulate a redesign: strip every class in the card (including the
    // transposed drv-car-card__/drv-card-car__/c-card-car__ prefixes), keep
    // the tag structure.
    const c = card();
    c.querySelectorAll("*").forEach((el) => el.removeAttribute("class"));
    expect(extractDealCard(c)).toEqual({
      term: 36,
      initial: 2892.36,
      mileage: 5000,
      monthly: 241.03,
      fees: SELECT_ARRANGEMENT_FEE,
    });
  });

  it("recovers every field from plain text when no markup survives at all", () => {
    // The visible text of the card's offer block, verbatim.
    const c = document.createElement("article");
    c.textContent =
      "36 month contract £2,892.36 initial payment 5,000 miles p/a " +
      "£241.03 Per month inc. VAT";
    expect(extractDealCard(c)).toEqual({
      term: 36,
      initial: 2892.36,
      mileage: 5000,
      monthly: 241.03,
      fees: SELECT_ARRANGEMENT_FEE,
    });
  });

  it("returns NaNs (not throws) on an unrelated element, fee still assumed", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    const deal = extractDealCard(document.querySelector("div")!);
    expect(deal.term).toBeNaN();
    expect(deal.initial).toBeNaN();
    expect(deal.mileage).toBeNaN();
    expect(deal.monthly).toBeNaN();
    expect(deal.fees).toBe(SELECT_ARRANGEMENT_FEE);
  });
});

describe("extractDealSummary", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("selectcarleasing-deal-page.html");
  });

  it("reads term, initial months, mileage and the exact arrangement fee", () => {
    expect(extractDealSummary(document)).toEqual({
      term: 36,
      initialMonths: 12,
      mileage: 5000,
      fee: 354,
    });
  });

  it("ignores tooltip prose nested inside the title even with every class stripped", () => {
    // The "Arrangement fee" (and "Lease Type") row titles carry a nested
    // <div class="drv-tooltip"> with several sentences of prose *inside the
    // title element itself*. A naive `title.textContent` read would prepend
    // that prose to the label and never match "Arrangement fee". Stripping
    // every class (simulated redesign) also removes any hook to skip the
    // tooltip by class name, so this proves the structural (first/last
    // element child, title's own text nodes only) reading is what actually
    // avoids the trap, not a class-name special case.
    document.querySelectorAll("*").forEach((el) => el.removeAttribute("class"));
    expect(extractDealSummary(document)).toEqual({
      term: 36,
      initialMonths: 12,
      mileage: 5000,
      fee: 354,
    });
  });

  it("returns NaN for the fee when the summary has no arrangement-fee row", () => {
    document
      .querySelectorAll("li.drv-list-table__item")
      .forEach((li) => {
        if (/arrangement fee/i.test(li.querySelector(".drv-list-table__title")?.textContent ?? "")) {
          li.remove();
        }
      });
    expect(extractDealSummary(document).fee).toBeNaN();
  });
});

describe("extractDealPageInfo", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("selectcarleasing-deal-page.html");
  });

  it("reads monthly, initial and the deal-summary numbers, exact fee included", () => {
    expect(extractDealPageInfo(document)).toEqual({
      term: 36,
      initialMonths: 12,
      mileage: 5000,
      monthly: 241.03,
      initial: 2892.36,
      feeFromPage: 354,
    });
  });

  it("falls back to text parsing for monthly/initial when the variant classes are stripped", () => {
    // Keep the outer g-deal-enquire__price wrapper (that's how the badge
    // anchor is found in the first place) but strip the inner
    // monthly-price/upfront classes, as a redesign might rename them.
    document
      .querySelectorAll('[class*="monthly-price"], [class*="deal-enquire__upfront"]')
      .forEach((el) => el.removeAttribute("class"));
    const info = extractDealPageInfo(document)!;
    expect(info.monthly).toBeCloseTo(241.03, 2);
    expect(info.initial).toBeCloseTo(2892.36, 2);
  });

  it("returns null when the price block isn't on the page", () => {
    document.body.innerHTML = "<div><p>not a deal page</p></div>";
    expect(extractDealPageInfo(document)).toBeNull();
  });
});

describe("cost pinning (verified 2026-07-17 live figures)", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("selectcarleasing-deal-page.html");
  });

  it("matches the real total/effective monthly for the captured deal", () => {
    // 2892.36 initial + 241.03 x 35 payments + 354 arrangement fee.
    const info = extractDealPageInfo(document)!;
    const terms = {
      term: info.term,
      initial: info.initial,
      monthly: info.monthly,
      fees: info.feeFromPage,
    };
    expect(totalLeaseCost(terms)).toBeCloseTo(11682.41, 2);
    expect(effectiveMonthly(terms)).toBeCloseTo(324.51, 2);
  });
});

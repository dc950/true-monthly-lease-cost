import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  hashFromHref,
  recallTotal,
  rememberTotal,
} from "../src/sites/leaseloco/cache";
import {
  extractConfigPageInfo,
  extractLeaseLocoDeal,
  impliedFees,
} from "../src/sites/leaseloco/dom";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  path.join(here, "fixtures", "leaseloco-deal-card.html"),
  "utf8"
);
const configFixture = readFileSync(
  path.join(here, "fixtures", "leaseloco-config-page.html"),
  "utf8"
);

const CONFIG_PATH =
  "/car-leasing/peugeot/e-3008/157kw-gt-73kwh-5dr-auto/45449/2-24-5000-12-1/1727c075b68e4362ca8cb327f392789e/config";

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

describe("extractConfigPageInfo", () => {
  beforeEach(() => {
    document.body.innerHTML = configFixture;
  });

  it("reads the profile from the URL and prices from the page", () => {
    expect(extractConfigPageInfo(document, CONFIG_PATH)).toEqual({
      term: 24,
      mileage: 5000,
      initialMonths: 12,
      monthly: 225.56,
      initialAmount: 2706.72,
    });
  });

  it("falls back to page text when the URL has no profile segment", () => {
    // e.g. a future URL scheme change; term/mileage come from
    // "for 24 months at 5,000 miles per annum", initial months from
    // "12 mos initial".
    document.querySelectorAll('[class*="profile-selector-trigger-group_title"]')
      .forEach((el) => (el.className = "title-x"));
    const info = extractConfigPageInfo(document, "/some/other/config");
    expect(info).toEqual({
      term: 24,
      mileage: 5000,
      initialMonths: 12,
      monthly: 225.56,
      initialAmount: 2706.72,
    });
  });

  it("derives the initial amount when the page omits it", () => {
    document
      .querySelectorAll('[class*="compare-deals_sub-title"]')
      .forEach((el) => el.remove());
    const info = extractConfigPageInfo(document, CONFIG_PATH);
    expect(info.initialAmount).toBeCloseTo(12 * 225.56, 2);
  });
});

describe("deal-total cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("extracts the deal hash from config hrefs", () => {
    expect(hashFromHref(CONFIG_PATH)).toBe("1727c075b68e4362ca8cb327f392789e");
    expect(hashFromHref("/car-leasing/foo/bar")).toBeNull();
  });

  it("round-trips a remembered total", () => {
    rememberTotal("abc123def4567890", 8157.4);
    expect(recallTotal("abc123def4567890")).toBe(8157.4);
    expect(recallTotal("unknown-hash")).toBeNull();
  });

  it("expires stale entries", () => {
    sessionStorage.setItem(
      "lrcT:oldhash",
      JSON.stringify({ ts: Date.now() - 7 * 60 * 60 * 1000, total: 8157.4 })
    );
    expect(recallTotal("oldhash")).toBeNull();
  });

  it("ignores non-finite totals", () => {
    rememberTotal("nanhash", NaN);
    expect(recallTotal("nanhash")).toBeNull();
  });
});

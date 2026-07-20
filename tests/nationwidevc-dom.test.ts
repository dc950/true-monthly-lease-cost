import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  effectiveMonthly,
  markupPct,
  severity,
  totalLeaseCost,
} from "../src/core/cost";
import { DEFAULT_SETTINGS } from "../src/settings";
import { nationwideVc } from "../src/sites/nationwidevc";
import { recallQuote, rememberQuote } from "../src/sites/nationwidevc/cache";
import {
  PRICE_BLOCK_SELECTOR,
  cardHref,
  extractCardQuote,
  extractDealPageInfo,
  extractOrderSummary,
  findCards,
} from "../src/sites/nationwidevc/dom";
import { hasBadge } from "../src/ui/badge";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "fixtures", name), "utf8");

const CARD_PATH =
  "/car-leasing/alfa-romeo/junior/1-2-turbo-hybrid-145-ibrida-sport-speciale-auto-free-metallic-paint";

describe("extractCardQuote", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("nationwidevc-deal-card.html");
  });

  const card = () => document.querySelector('[data-analytics-desc="vehicle card"]')!;

  it("reads monthly (data-price), initial rental and processing fee", () => {
    expect(extractCardQuote(card())).toEqual({
      monthly: 205.63,
      initial: 2467.56,
      fee: 357,
    });
  });

  it("finds the deal-page href from the data-link attribute", () => {
    expect(cardHref(card())).toBe(CARD_PATH);
  });

  it("falls back to the price element and anchor href when data attributes disappear", () => {
    const c = card();
    c.removeAttribute("data-price");
    c.removeAttribute("data-link");
    c.removeAttribute("data-analytics-desc");
    expect(extractCardQuote(c)).toEqual({
      monthly: 205.63,
      initial: 2467.56,
      fee: 357,
    });
    expect(cardHref(c)).toBe(CARD_PATH);
  });

  it("still finds the card via the class + text fallback when the data attribute goes", () => {
    const c = card();
    c.removeAttribute("data-analytics-desc");
    const found = findCards(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(c);
  });

  it("recovers every field from plain text when no markup survives at all", () => {
    const c = document.createElement("div");
    c.textContent =
      "From £205.63 Personal price per month inc VAT " +
      "Initial Rental £2,467.56 inc VAT " +
      "Processing Fee: £357.00 inc VAT Subject to status and conditions";
    expect(extractCardQuote(c)).toEqual({
      monthly: 205.63,
      initial: 2467.56,
      fee: 357,
    });
  });

  it("returns NaNs (not throws) on an unrelated element", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    const quote = extractCardQuote(document.querySelector("div")!);
    expect(quote.monthly).toBeNaN();
    expect(quote.initial).toBeNaN();
    expect(quote.fee).toBeNaN();
    expect(cardHref(document.querySelector("div")!)).toBeNull();
  });
});

describe("extractOrderSummary", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("nationwidevc-deal-page.html");
  });

  it("reads initial rental, contract length, annual mileage and processing fee", () => {
    expect(extractOrderSummary(document)).toEqual({
      initial: 2744.52,
      term: 24,
      mileage: 5000,
      fee: 357,
    });
  });

  it("ignores nested tooltip markup in other dt rows even with every class stripped", () => {
    // "Excess Mileage:", "Roadside Assist:" and "Standard Delivery:" carry a
    // nested tooltip <span>/<button> *inside the dt itself*. This function
    // only ever matches the four labels it cares about with a prefix regex
    // over the dt's own textContent, so those unrelated rows never get a
    // chance to collide. Stripping every class also removes any hook to
    // filter the tooltip out by class name and breaks the
    // `dl.details-panel` container selector itself (falls back to querying
    // the whole document), proving the structural tag-order reading is what
    // actually works, not a class-name special case.
    document.querySelectorAll("*").forEach((el) => el.removeAttribute("class"));
    expect(extractOrderSummary(document)).toEqual({
      initial: 2744.52,
      term: 24,
      mileage: 5000,
      fee: 357,
    });
  });

  it("falls back to text parsing when the dt/dd structure itself doesn't survive", () => {
    document.body.innerHTML = `<div>
      Lease Type: Personal Contract Hire
      Initial Rental: £2,744.52 (inc VAT)
      Contract Length: 24 Months
      Annual Mileage: 5,000
      Processing Fee: £357.00 (inc VAT)
    </div>`;
    expect(extractOrderSummary(document)).toEqual({
      initial: 2744.52,
      term: 24,
      mileage: 5000,
      fee: 357,
    });
  });
});

describe("extractDealPageInfo", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("nationwidevc-deal-page.html");
  });

  it("reads the monthly price plus the order-summary numbers", () => {
    expect(extractDealPageInfo(document)).toEqual({
      monthly: 228.71,
      initial: 2744.52,
      term: 24,
      mileage: 5000,
      fee: 357,
    });
  });

  it("finds the price block despite the -old variant-flag class suffix", () => {
    expect(document.querySelector(PRICE_BLOCK_SELECTOR)).not.toBeNull();
  });

  it("falls back to text parsing for monthly when the inner price class is stripped", () => {
    const anchor = document.querySelector(PRICE_BLOCK_SELECTOR)!;
    anchor
      .querySelectorAll('[class*="__price"]')
      .forEach((el) => el.removeAttribute("class"));
    const info = extractDealPageInfo(document)!;
    expect(info.monthly).toBeCloseTo(228.71, 2);
  });

  it("returns null when the price block isn't on the page at all", () => {
    document.body.innerHTML = "<div><p>not a deal page</p></div>";
    expect(extractDealPageInfo(document)).toBeNull();
  });
});

describe("cost pinning (verified 2026-07-17 live figures)", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("nationwidevc-deal-page.html");
  });

  it("matches the real total/effective monthly for the captured deal", () => {
    // 2744.52 initial + 228.71 x 23 payments + 357 processing fee.
    const info = extractDealPageInfo(document)!;
    const terms = {
      term: info.term,
      initial: info.initial,
      monthly: info.monthly,
      fees: info.fee,
    };
    expect(totalLeaseCost(terms)).toBeCloseTo(8361.85, 2);
    expect(effectiveMonthly(terms)).toBeCloseTo(348.41, 2);
    const pct = markupPct(effectiveMonthly(terms), terms.monthly);
    expect(pct).toBe(52);
    expect(severity(pct)).toBe("high");
  });
});

describe("quote cache", () => {
  const quote = {
    monthly: 228.71,
    term: 24,
    mileage: 5000,
    initial: 2744.52,
    fee: 357,
  };

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a remembered quote", () => {
    rememberQuote(CARD_PATH, quote);
    expect(recallQuote(CARD_PATH)).toEqual(quote);
    expect(recallQuote("/unknown/path")).toBeNull();
  });

  it("expires stale entries", () => {
    sessionStorage.setItem(
      "lrcN:/stale",
      JSON.stringify({ ts: Date.now() - 7 * 60 * 60 * 1000, quote })
    );
    expect(recallQuote("/stale")).toBeNull();
  });

  it("ignores non-finite quotes", () => {
    rememberQuote("/nan", { ...quote, monthly: NaN });
    expect(recallQuote("/nan")).toBeNull();
  });
});

describe("card monthly-mismatch guard", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("nationwidevc-deal-card.html");
    sessionStorage.clear();
  });

  const card = () => document.querySelector('[data-analytics-desc="vehicle card"]')!;

  it("badges the card when the cached quote's monthly matches the card's advertised price", () => {
    rememberQuote(CARD_PATH, {
      monthly: 205.63,
      term: 24,
      mileage: 8000,
      initial: 2467.56,
      fee: 357,
    });
    nationwideVc.scan(DEFAULT_SETTINGS);
    expect(hasBadge(card())).toBe(true);
    expect((card() as HTMLElement).dataset.lrcTerm).toBe("24");
    expect((card() as HTMLElement).dataset.lrcMileage).toBe("8000");
  });

  it("leaves the card unbadged when the cached quote's monthly differs from the card's price", () => {
    rememberQuote(CARD_PATH, {
      monthly: 210.0,
      term: 24,
      mileage: 8000,
      initial: 2467.56,
      fee: 357,
    });
    nationwideVc.scan(DEFAULT_SETTINGS);
    expect(hasBadge(card())).toBe(false);
  });

  it("leaves the card unbadged on a cache miss", () => {
    nationwideVc.scan(DEFAULT_SETTINGS);
    expect(hasBadge(card())).toBe(false);
  });
});

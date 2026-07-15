import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  extractDealPageInfo,
  extractDealTerms,
  extractModelCardInfo,
} from "../src/sites/leasingcom/dom";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "fixtures", name), "utf8");

const ORIGIN = "https://leasing.com";

describe("extractDealTerms", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("leasingcom-deal-card.html");
  });

  const card = () => document.querySelector("li.deal-card-v2")!;

  it("reads the numbers from data attributes and price markup", () => {
    expect(extractDealTerms(card())).toEqual({
      term: 24,
      initial: 1740,
      monthly: 145,
      fees: 299,
      mileage: 5000,
    });
  });

  it("falls back to text parsing when the markup hooks disappear", () => {
    // Simulate a site redesign: data attributes gone, price/label classes renamed.
    const c = card();
    c.querySelectorAll("[data-term], [data-initialrental], [data-mileage]").forEach(
      (el) => {
        el.removeAttribute("data-term");
        el.removeAttribute("data-initialrental");
        el.removeAttribute("data-mileage");
      }
    );
    c.querySelectorAll(".price").forEach((el) => (el.className = "cost"));
    c.querySelectorAll(".label").forEach((el) => (el.className = "caption"));

    // "5k miles p/a" is the only mileage left in the text.
    expect(extractDealTerms(c)).toEqual({
      term: 24,
      initial: 1740,
      monthly: 145,
      fees: 299,
      mileage: 5000,
    });
  });

  it("returns NaNs (not throws) on an unrelated element", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    const terms = extractDealTerms(document.querySelector("div")!);
    expect(terms.term).toBeNaN();
    expect(terms.initial).toBeNaN();
    expect(terms.monthly).toBeNaN();
    expect(terms.mileage).toBeNaN();
    expect(terms.fees).toBe(0); // no fee line means no fee
  });
});

describe("extractDealPageInfo", () => {
  beforeEach(() => {
    document.body.innerHTML = fixture("leasingcom-deal-page.html");
  });

  it("reads every number from the summary table", () => {
    expect(extractDealPageInfo(document)).toEqual({
      term: 24,
      mileage: 5000,
      monthly: 166.79,
      initial: 2001.48, // "12 months = £2,001.48" — the £ amount, not "122001.48"
      fees: 348,
      total: 6185.65,
    });
  });

  it("yields the real monthly from the page's own total", () => {
    const info = extractDealPageInfo(document)!;
    expect(info.total / info.term).toBeCloseTo(257.74, 2);
  });

  it("computes the total when the summary lacks that row", () => {
    document
      .querySelectorAll("li")
      .forEach((li) =>
        /total lease cost/i.test(
          li.querySelector(".label")?.textContent ?? ""
        ) ? li.remove() : undefined
      );
    const info = extractDealPageInfo(document)!;
    expect(info.total).toBeCloseTo(2001.48 + 166.79 * 23 + 348, 2);
  });

  it("returns null on pages without a summary table", () => {
    document.body.innerHTML = "<div><p>a search page</p></div>";
    expect(extractDealPageInfo(document)).toBeNull();
  });
});

describe("extractModelCardInfo", () => {
  it("extracts manufacturer, range, fuel and finance from a category card", () => {
    document.body.innerHTML = fixture("leasingcom-model-card.html");
    const card = document.querySelector("div.deal-card")!;
    expect(extractModelCardInfo(card, ORIGIN)).toEqual({
      manufacturer: "Hyundai",
      range: "Ioniq 5",
      fuel: "Electric",
      finance: "Personal",
    });
  });

  it("splits multi-word manufacturers using the slug word count", () => {
    document.body.innerHTML = `
      <div class="deal-card" data-test-manufacturer-slug="alfa-romeo">
        <div class="deal-body"><h3 class="deal-vehicle">Alfa Romeo Giulia</h3></div>
        <a href="/car-leasing/alfa-romeo/giulia/">View deals</a>
      </div>`;
    const card = document.querySelector("div.deal-card")!;
    expect(extractModelCardInfo(card, ORIGIN)).toEqual({
      manufacturer: "Alfa Romeo",
      range: "Giulia",
      fuel: null,
      finance: "Personal",
    });
  });

  it("detects business finance from the link", () => {
    document.body.innerHTML = `
      <div class="deal-card" data-test-manufacturer-slug="ford">
        <div class="deal-body"><h3 class="deal-vehicle">Ford Transit</h3></div>
        <a href="/car-leasing/ford/transit/?finance=business">View deals</a>
      </div>`;
    const card = document.querySelector("div.deal-card")!;
    expect(extractModelCardInfo(card, ORIGIN)?.finance).toBe("Business");
  });

  it("returns null when the card has no title", () => {
    document.body.innerHTML = `
      <div class="deal-card" data-test-manufacturer-slug="ford"></div>`;
    const card = document.querySelector("div.deal-card")!;
    expect(extractModelCardInfo(card, ORIGIN)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectiveMonthly, totalLeaseCost } from "../src/core/cost";
import { LEASINGOPTIONS_FEE, vehicleRefFromCard } from "../src/sites/leasingoptions/dom";
import {
  buildOfferMap,
  extractOfferProfiles,
} from "../src/sites/leasingoptions/nextdata";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(path.join(here, "fixtures", name), "utf8");

// The captured fixture is __NEXT_DATA__.props.pageProps.topSpecialOffers
// itself (see the file's _comment), so wrap it the way it actually sits in
// the page's __NEXT_DATA__ blob for the tests below.
const pageProps = JSON.parse(fixture("leasingoptions-nextdata.json"));
const nextData = { props: { pageProps } };

describe("buildOfferMap", () => {
  it("picks the PCH deal over Business, converts years to months, and derives the initial rental", () => {
    const map = buildOfferMap(nextData);

    // Pinned: Cupra Terramar (ref 1100427683) PCH -> term 24mo, initial
    // 2567.28 (=12 x 213.94), monthly 213.94. initial is a floating-point
    // product (12 x monthly), so compare with toBeCloseTo like the other
    // derived-initial cases in this codebase (see leaseloco-dom.test.ts).
    const terramar = map.get(1100427683)!;
    expect(terramar.term).toBe(24);
    expect(terramar.mileage).toBe(5000);
    expect(terramar.monthly).toBe(213.94);
    expect(terramar.initial).toBeCloseTo(2567.28, 2);
    expect(terramar.fees).toBe(LEASINGOPTIONS_FEE);

    // Second fixture entry (Geely Starray), same shape, different numbers -
    // confirms PCH selection isn't a one-off fluke of ordering.
    const starray = map.get(1100438399)!;
    expect(starray.term).toBe(24);
    expect(starray.mileage).toBe(5000);
    expect(starray.monthly).toBe(208.82);
    expect(starray.initial).toBeCloseTo(2505.84, 2);
    expect(starray.fees).toBe(LEASINGOPTIONS_FEE);
  });

  it("returns an empty map when pageProps has no offer-shaped arrays", () => {
    expect(buildOfferMap({ props: { pageProps: {} } }).size).toBe(0);
    expect(buildOfferMap({ props: { pageProps: { topSpecialOffers: [] } } }).size).toBe(
      0
    );
  });

  it("is defensive about missing/malformed __NEXT_DATA__", () => {
    expect(buildOfferMap(null).size).toBe(0);
    expect(buildOfferMap(undefined).size).toBe(0);
    expect(buildOfferMap({}).size).toBe(0);
    expect(buildOfferMap({ props: {} }).size).toBe(0);
  });

  it("skips an entry with no PCH (contractType 2) deal", () => {
    const businessOnly = {
      props: {
        pageProps: {
          topSpecialOffers: [
            {
              vehicleRef: 999,
              deals: [
                {
                  contractType: 1,
                  mileage: 5000,
                  term: 2,
                  initialRentalMonths: 12,
                  monthlyPrice: 100,
                },
              ],
            },
          ],
        },
      },
    };
    expect(buildOfferMap(businessOnly).size).toBe(0);
  });
});

describe("extractOfferProfiles", () => {
  it("parses __NEXT_DATA__ out of a Document's script tag", () => {
    document.body.innerHTML =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(nextData) +
      "</script>";
    const map = extractOfferProfiles(document);
    expect(map.get(1100427683)?.monthly).toBe(213.94);
  });

  it("returns an empty map when the document has no __NEXT_DATA__ script", () => {
    document.body.innerHTML = "<div>nothing here</div>";
    expect(extractOfferProfiles(document).size).toBe(0);
  });

  it("returns an empty map when the __NEXT_DATA__ script isn't valid JSON", () => {
    document.body.innerHTML =
      '<script id="__NEXT_DATA__" type="application/json">not json</script>';
    expect(extractOfferProfiles(document).size).toBe(0);
  });

  it("also accepts an already-parsed object directly (not a Document)", () => {
    const map = extractOfferProfiles(nextData);
    expect(map.get(1100427683)?.monthly).toBe(213.94);
  });
});

describe("card ref -> offer profile lookup", () => {
  it("resolves the special-offers card fixture to its __NEXT_DATA__ profile and pins the total/effective cost", () => {
    document.body.innerHTML = fixture("leasingoptions-deal-card.html");
    const card = document.querySelector('[class*="card-vehicle_wrapper"]')!;

    const ref = vehicleRefFromCard(card);
    expect(ref).toBe(1100427683);

    const map = buildOfferMap(nextData);
    const profile = map.get(ref!)!;

    // Pinned: total 2567.28 + 213.94 x 23 + 399.99 = 7887.89, effective
    // 7887.89 / 24 = 328.66.
    expect(totalLeaseCost(profile)).toBeCloseTo(7887.89, 2);
    expect(effectiveMonthly(profile)).toBeCloseTo(328.66, 2);
  });

  it("returns null when the card has no stretched-link title anchor", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    expect(vehicleRefFromCard(document.querySelector("div")!)).toBeNull();
  });
});

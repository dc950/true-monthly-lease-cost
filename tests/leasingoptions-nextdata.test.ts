import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectiveMonthly, totalLeaseCost } from "../src/core/cost";
import {
  LEASINGOPTIONS_FEE,
  modelSlugFromCard,
  vehicleRefFromCard,
} from "../src/sites/leasingoptions/dom";
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

// The captured fixture is __NEXT_DATA__.props.pageProps itself (see the
// file's _comment) - unlike topSpecialOffers, modelPreviews is an OBJECT
// wrapping its entries in `dataItems`, which is the shape buildOfferMap must
// dig one level into.
const modelPreviewsPageProps = JSON.parse(fixture("leasingoptions-modelpreviews.json"));
const modelPreviewsNextData = { props: { pageProps: modelPreviewsPageProps } };

describe("buildOfferMap", () => {
  it("picks the PCH deal over Business, converts years to months, and derives the initial rental", () => {
    const map = buildOfferMap(nextData);

    // Pinned: Cupra Terramar (ref 1100427683) PCH -> term 24mo, initial
    // 2567.28 (=12 x 213.94), monthly 213.94. initial is a floating-point
    // product (12 x monthly), so compare with toBeCloseTo like the other
    // derived-initial cases in this codebase (see leaseloco-dom.test.ts).
    const terramar = map.byRef.get(1100427683)!;
    expect(terramar.term).toBe(24);
    expect(terramar.mileage).toBe(5000);
    expect(terramar.monthly).toBe(213.94);
    expect(terramar.initial).toBeCloseTo(2567.28, 2);
    expect(terramar.fees).toBe(LEASINGOPTIONS_FEE);

    // Second fixture entry (Geely Starray), same shape, different numbers -
    // confirms PCH selection isn't a one-off fluke of ordering.
    const starray = map.byRef.get(1100438399)!;
    expect(starray.term).toBe(24);
    expect(starray.mileage).toBe(5000);
    expect(starray.monthly).toBe(208.82);
    expect(starray.initial).toBeCloseTo(2505.84, 2);
    expect(starray.fees).toBe(LEASINGOPTIONS_FEE);
  });

  it("returns empty maps when pageProps has no offer-shaped arrays", () => {
    expect(buildOfferMap({ props: { pageProps: {} } }).byRef.size).toBe(0);
    expect(
      buildOfferMap({ props: { pageProps: { topSpecialOffers: [] } } }).byRef.size
    ).toBe(0);
  });

  it("is defensive about missing/malformed __NEXT_DATA__", () => {
    expect(buildOfferMap(null).byRef.size).toBe(0);
    expect(buildOfferMap(undefined).byRef.size).toBe(0);
    expect(buildOfferMap({}).byRef.size).toBe(0);
    expect(buildOfferMap({ props: {} }).byRef.size).toBe(0);
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
    expect(buildOfferMap(businessOnly).byRef.size).toBe(0);
  });

  it("digs one level into a non-array pageProps value for entries wrapped in a property like dataItems", () => {
    // modelPreviews is an OBJECT (not an array like topSpecialOffers), with
    // its entries wrapped in `dataItems` - this is the live shape on
    // category/model pages (e.g. /car-leasing/electric) that the naive
    // Object.values-only-arrays scan skipped entirely.
    const map = buildOfferMap(modelPreviewsNextData);

    // Pinned: Peugeot 3008 (ref 1100417231) PCH -> term 24mo, mileage 5000,
    // monthly 218.76, initial 2625.12 (=12 x 218.76), fee 399.99 -> total
    // 8056.59, effective 335.69.
    const threeThousandEight = map.byRef.get(1100417231)!;
    expect(threeThousandEight.term).toBe(24);
    expect(threeThousandEight.mileage).toBe(5000);
    expect(threeThousandEight.monthly).toBe(218.76);
    expect(threeThousandEight.initial).toBeCloseTo(2625.12, 2);
    expect(threeThousandEight.fees).toBe(LEASINGOPTIONS_FEE);
    expect(totalLeaseCost(threeThousandEight)).toBeCloseTo(8056.59, 2);
    expect(effectiveMonthly(threeThousandEight)).toBeCloseTo(335.69, 2);
  });

  it("also keys model-preview entries by make/shortModelUrl slug (lowercased)", () => {
    const map = buildOfferMap(modelPreviewsNextData);

    const threeThousandEight = map.bySlug.get("peugeot/3008")!;
    expect(threeThousandEight.monthly).toBe(218.76);

    // Volkswagen ID.7: shortModel is "ID.7" but shortModelUrl is "id-7" -
    // keying must use shortModelUrl, never shortModel.
    const idSeven = map.bySlug.get("volkswagen/id-7")!;
    expect(idSeven.monthly).toBe(312.93);
    expect(map.bySlug.has("volkswagen/id.7")).toBe(false);
  });

  it("does not slug-key topSpecialOffers entries, which have no make/shortModelUrl", () => {
    const map = buildOfferMap(nextData);
    expect(map.bySlug.size).toBe(0);
  });
});

describe("extractOfferProfiles", () => {
  it("parses __NEXT_DATA__ out of a Document's script tag", () => {
    document.body.innerHTML =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify(nextData) +
      "</script>";
    const map = extractOfferProfiles(document);
    expect(map.byRef.get(1100427683)?.monthly).toBe(213.94);
  });

  it("returns empty maps when the document has no __NEXT_DATA__ script", () => {
    document.body.innerHTML = "<div>nothing here</div>";
    expect(extractOfferProfiles(document).byRef.size).toBe(0);
  });

  it("returns empty maps when the __NEXT_DATA__ script isn't valid JSON", () => {
    document.body.innerHTML =
      '<script id="__NEXT_DATA__" type="application/json">not json</script>';
    expect(extractOfferProfiles(document).byRef.size).toBe(0);
  });

  it("also accepts an already-parsed object directly (not a Document)", () => {
    const map = extractOfferProfiles(nextData);
    expect(map.byRef.get(1100427683)?.monthly).toBe(213.94);
  });
});

describe("card ref -> offer profile lookup", () => {
  it("resolves the special-offers card fixture to its __NEXT_DATA__ profile and pins the total/effective cost", () => {
    document.body.innerHTML = fixture("leasingoptions-deal-card.html");
    const card = document.querySelector('[class*="card-vehicle_wrapper"]')!;

    const ref = vehicleRefFromCard(card);
    expect(ref).toBe(1100427683);

    const map = buildOfferMap(nextData);
    const profile = map.byRef.get(ref!)!;

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

describe("card model-slug -> offer profile lookup", () => {
  it("resolves the model-card fixture to its __NEXT_DATA__ profile via the slug path and pins the total/effective cost", () => {
    document.body.innerHTML = fixture("leasingoptions-model-card.html");
    const card = document.querySelector('[class*="card-vehicle_wrapper"]')!;

    // The model card's href has no vehicleRef segment at all.
    expect(vehicleRefFromCard(card)).toBeNull();

    const slug = modelSlugFromCard(card);
    expect(slug).toBe("peugeot/3008");

    const map = buildOfferMap(modelPreviewsNextData);
    const profile = map.bySlug.get(slug!)!;

    expect(totalLeaseCost(profile)).toBeCloseTo(8056.59, 2);
    expect(effectiveMonthly(profile)).toBeCloseTo(335.69, 2);
  });

  it("does not treat a deeper derivative href (ending /<ref>/vehicle) as a model slug", () => {
    document.body.innerHTML = fixture("leasingoptions-deal-card.html");
    const card = document.querySelector('[class*="card-vehicle_wrapper"]')!;

    // This is the special-offers card fixture: 4+ path segments, ending
    // /<ref>/vehicle - the slug path must defer to vehicleRefFromCard for it.
    expect(modelSlugFromCard(card)).toBeNull();
    expect(vehicleRefFromCard(card)).toBe(1100427683);
  });

  it("returns null when the card has no stretched-link, or its href isn't a two-segment model path", () => {
    document.body.innerHTML = "<div><p>nothing to see</p></div>";
    expect(modelSlugFromCard(document.querySelector("div")!)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { formatGBP, formatGBPWhole, parseMoney } from "../src/core/money";

describe("parseMoney", () => {
  it("parses plain currency amounts", () => {
    expect(parseMoney("£299.00")).toBe(299);
    expect(parseMoney("£1,740.00")).toBe(1740);
    expect(parseMoney("5,000")).toBe(5000);
  });

  it("ignores surrounding text", () => {
    expect(parseMoney("£145.00 p/m")).toBe(145);
    expect(parseMoney("£1,740.00 initial rental")).toBe(1740);
  });

  it("returns NaN when there is nothing numeric", () => {
    expect(parseMoney("")).toBeNaN();
    expect(parseMoney(null)).toBeNaN();
    expect(parseMoney(undefined)).toBeNaN();
    expect(parseMoney("no digits here")).toBeNaN();
  });
});

describe("formatGBP", () => {
  it("formats to pence", () => {
    expect(formatGBP(223.91666)).toBe("£223.92");
    expect(formatGBP(145)).toBe("£145.00");
  });

  it("formats whole pounds with grouping", () => {
    expect(formatGBPWhole(5374)).toBe("£5,374");
    expect(formatGBPWhole(17379.04)).toBe("£17,379");
  });
});

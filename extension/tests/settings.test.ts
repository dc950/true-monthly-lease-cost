import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  mileageAllowed,
  mileagesInRange,
  sanitizeSettings,
  settingsSignature,
  termAllowed,
} from "../src/settings";

describe("sanitizeSettings", () => {
  it("passes through valid settings", () => {
    const s = {
      minTerm: 24,
      maxTerm: 48,
      minMileage: 8000,
      mode: "hide",
    };
    expect(sanitizeSettings(s)).toEqual(s);
  });

  it("falls back to defaults for garbage", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({
        minTerm: "24",
        maxTerm: 12.5,
        minMileage: "8000",
        mode: "sparkle",
      })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects term and mileage values the sites don't offer", () => {
    expect(
      sanitizeSettings({ minTerm: 23, maxTerm: 49, minMileage: 7000 })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("drops the retired maxMileage field from previously stored settings", () => {
    expect(
      sanitizeSettings({ minMileage: 8000, maxMileage: 15000 })
    ).toEqual({ ...DEFAULT_SETTINGS, minMileage: 8000 });
  });

  it("swaps an inverted term pair", () => {
    expect(sanitizeSettings({ minTerm: 48, maxTerm: 24 })).toEqual({
      ...DEFAULT_SETTINGS,
      minTerm: 24,
      maxTerm: 48,
    });
  });

  it("does not swap when one term bound is 'any'", () => {
    expect(sanitizeSettings({ minTerm: 48, minMileage: 30000 })).toEqual({
      ...DEFAULT_SETTINGS,
      minTerm: 48,
      minMileage: 30000,
    });
  });
});

describe("termAllowed", () => {
  it("allows everything by default", () => {
    for (const t of [18, 24, 36, 48]) {
      expect(termAllowed(t, DEFAULT_SETTINGS)).toBe(true);
    }
  });

  it("applies min and max bounds inclusively", () => {
    const s = { ...DEFAULT_SETTINGS, minTerm: 24, maxTerm: 36 };
    expect(termAllowed(18, s)).toBe(false);
    expect(termAllowed(24, s)).toBe(true);
    expect(termAllowed(36, s)).toBe(true);
    expect(termAllowed(48, s)).toBe(false);
  });

  it("treats 0 as unbounded on either side", () => {
    expect(termAllowed(18, { ...DEFAULT_SETTINGS, maxTerm: 24 })).toBe(true);
    expect(termAllowed(48, { ...DEFAULT_SETTINGS, minTerm: 36 })).toBe(true);
  });
});

describe("mileageAllowed / mileagesInRange", () => {
  it("applies the minimum inclusively, with no upper bound", () => {
    const s = { ...DEFAULT_SETTINGS, minMileage: 8000 };
    expect(mileageAllowed(6000, s)).toBe(false);
    expect(mileageAllowed(8000, s)).toBe(true);
    expect(mileageAllowed(30000, s)).toBe(true);
  });

  it("returns the catalogue subset for the API facet", () => {
    expect(mileagesInRange({ ...DEFAULT_SETTINGS, minMileage: 8000 })).toEqual([
      8000, 10000, 12000, 15000, 20000, 25000, 30000,
    ]);
    expect(mileagesInRange({ ...DEFAULT_SETTINGS, minMileage: 25000 })).toEqual([
      25000, 30000,
    ]);
    expect(mileagesInRange(DEFAULT_SETTINGS)).toEqual([
      5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000,
    ]);
  });
});

describe("settingsSignature", () => {
  it("differs when any field differs", () => {
    const base = { ...DEFAULT_SETTINGS, minTerm: 24, maxTerm: 48 };
    expect(settingsSignature(base)).not.toBe(
      settingsSignature({ ...base, minTerm: 36 })
    );
    expect(settingsSignature(base)).not.toBe(
      settingsSignature({ ...base, minMileage: 8000 })
    );
    expect(settingsSignature(base)).not.toBe(
      settingsSignature({ ...base, mode: "hide" })
    );
    expect(settingsSignature(base)).toBe(settingsSignature({ ...base }));
  });
});

describe("loadSettings outside an extension context", () => {
  it("returns defaults when browser.storage is unavailable", async () => {
    // vitest/happy-dom has no `browser` global, which is exactly the case
    // of the bundle being injected manually for debugging.
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

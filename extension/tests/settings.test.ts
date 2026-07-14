import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  settingsSignature,
  termAllowed,
} from "../src/settings";

describe("sanitizeSettings", () => {
  it("passes through valid settings", () => {
    expect(sanitizeSettings({ minTerm: 24, maxTerm: 48, mode: "hide" })).toEqual({
      minTerm: 24,
      maxTerm: 48,
      mode: "hide",
    });
  });

  it("falls back to defaults for garbage", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({ minTerm: "24", maxTerm: 12.5, mode: "sparkle" })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects term values the sites don't offer", () => {
    expect(sanitizeSettings({ minTerm: 23, maxTerm: 49 })).toEqual(
      DEFAULT_SETTINGS
    );
  });

  it("swaps an inverted min/max pair", () => {
    expect(sanitizeSettings({ minTerm: 48, maxTerm: 24 })).toEqual({
      minTerm: 24,
      maxTerm: 48,
      mode: "dim",
    });
  });

  it("does not swap when one bound is 'any'", () => {
    expect(sanitizeSettings({ minTerm: 48, maxTerm: 0 })).toEqual({
      minTerm: 48,
      maxTerm: 0,
      mode: "dim",
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
    const s = { minTerm: 24, maxTerm: 36, mode: "dim" as const };
    expect(termAllowed(18, s)).toBe(false);
    expect(termAllowed(24, s)).toBe(true);
    expect(termAllowed(36, s)).toBe(true);
    expect(termAllowed(48, s)).toBe(false);
  });

  it("treats 0 as unbounded on either side", () => {
    expect(termAllowed(18, { minTerm: 0, maxTerm: 24, mode: "dim" })).toBe(true);
    expect(termAllowed(48, { minTerm: 36, maxTerm: 0, mode: "dim" })).toBe(true);
  });
});

describe("settingsSignature", () => {
  it("differs when any field differs", () => {
    const base = { minTerm: 24, maxTerm: 48, mode: "dim" as const };
    expect(settingsSignature(base)).not.toBe(
      settingsSignature({ ...base, minTerm: 36 })
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

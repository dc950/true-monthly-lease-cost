/**
 * User settings, persisted in browser.storage.sync and editable from the
 * toolbar popup. Every accessor degrades to defaults outside an extension
 * context (e.g. when the bundle is injected manually for debugging).
 */

/** Contract lengths leasing sites offer; 0 means "no limit" in settings. */
export const TERM_OPTIONS = [18, 24, 36, 48] as const;

/** Annual mileage allowances leasing.com offers as search filters. */
export const MILEAGE_OPTIONS = [
  5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000,
] as const;

export interface Settings {
  /** Minimum contract length in months; 0 = no minimum. */
  minTerm: number;
  /** Maximum contract length in months; 0 = no maximum. */
  maxTerm: number;
  /**
   * Minimum annual mileage; 0 = no minimum. There is deliberately no
   * maximum: a bigger allowance at the same price is never worse.
   */
  minMileage: number;
  /** What to do with deal cards outside the term/mileage range. */
  mode: "dim" | "hide";
}

export const DEFAULT_SETTINGS: Settings = {
  minTerm: 0,
  maxTerm: 0,
  minMileage: 0,
  mode: "dim",
};

const VALID_TERMS = new Set<number>([0, ...TERM_OPTIONS]);
const VALID_MILEAGES = new Set<number>([0, ...MILEAGE_OPTIONS]);

function sanitizeBound(value: unknown, valid: Set<number>): number {
  return typeof value === "number" && valid.has(value) ? value : 0;
}

/** Coerce anything (stored value, form input) into a valid Settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  let minTerm = sanitizeBound(r.minTerm, VALID_TERMS);
  let maxTerm = sanitizeBound(r.maxTerm, VALID_TERMS);
  if (minTerm !== 0 && maxTerm !== 0 && minTerm > maxTerm) {
    [minTerm, maxTerm] = [maxTerm, minTerm];
  }
  const minMileage = sanitizeBound(r.minMileage, VALID_MILEAGES);
  const mode = r.mode === "hide" ? "hide" : "dim";
  return { minTerm, maxTerm, minMileage, mode };
}

export function termAllowed(term: number, s: Settings): boolean {
  if (s.minTerm !== 0 && term < s.minTerm) return false;
  if (s.maxTerm !== 0 && term > s.maxTerm) return false;
  return true;
}

export function mileageAllowed(mileage: number, s: Settings): boolean {
  return s.minMileage === 0 || mileage >= s.minMileage;
}

export function hasMileageBound(s: Settings): boolean {
  return s.minMileage !== 0;
}

/** The catalogue mileages inside the configured range, for API facets. */
export function mileagesInRange(s: Settings): number[] {
  return MILEAGE_OPTIONS.filter((m) => mileageAllowed(m, s));
}

/** Stable key for "annotations were made under these settings". */
export function settingsSignature(s: Settings): string {
  return `${s.minTerm}-${s.maxTerm}-${s.minMileage}-${s.mode}`;
}

function storageAvailable(): boolean {
  return typeof browser !== "undefined" && !!browser.storage?.sync;
}

export async function loadSettings(): Promise<Settings> {
  if (!storageAvailable()) return DEFAULT_SETTINGS;
  try {
    const stored = await browser.storage.sync.get("settings");
    return sanitizeSettings(stored.settings);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  if (!storageAvailable()) return;
  await browser.storage.sync.set({ settings: sanitizeSettings(s) });
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  if (typeof browser === "undefined" || !browser.storage?.onChanged) return;
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
      cb(sanitizeSettings(changes.settings.newValue));
    }
  });
}

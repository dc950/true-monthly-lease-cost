/**
 * User settings, persisted in browser.storage.sync and editable from the
 * toolbar popup. Every accessor degrades to defaults outside an extension
 * context (e.g. when the bundle is injected manually for debugging).
 */

/** Contract lengths leasing sites offer; 0 means "no limit" in settings. */
export const TERM_OPTIONS = [18, 24, 36, 48] as const;

export interface Settings {
  /** Minimum contract length in months; 0 = no minimum. */
  minTerm: number;
  /** Maximum contract length in months; 0 = no maximum. */
  maxTerm: number;
  /** What to do with deal cards outside the term range. */
  mode: "dim" | "hide";
}

export const DEFAULT_SETTINGS: Settings = { minTerm: 0, maxTerm: 0, mode: "dim" };

const VALID_TERMS = new Set<number>([0, ...TERM_OPTIONS]);

/** Coerce anything (stored value, form input) into a valid Settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  let minTerm =
    typeof r.minTerm === "number" && VALID_TERMS.has(r.minTerm) ? r.minTerm : 0;
  let maxTerm =
    typeof r.maxTerm === "number" && VALID_TERMS.has(r.maxTerm) ? r.maxTerm : 0;
  if (minTerm !== 0 && maxTerm !== 0 && minTerm > maxTerm) {
    [minTerm, maxTerm] = [maxTerm, minTerm];
  }
  const mode = r.mode === "hide" ? "hide" : "dim";
  return { minTerm, maxTerm, mode };
}

export function termAllowed(term: number, s: Settings): boolean {
  if (s.minTerm !== 0 && term < s.minTerm) return false;
  if (s.maxTerm !== 0 && term > s.maxTerm) return false;
  return true;
}

/** Stable key for "annotations were made under these settings". */
export function settingsSignature(s: Settings): string {
  return `${s.minTerm}-${s.maxTerm}-${s.mode}`;
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

import type { Settings } from "../settings";

/**
 * One supported leasing site. content.ts picks the adapter whose matches()
 * accepts the current hostname and calls scan() on load, (debounced) on every
 * DOM mutation, and again whenever the user changes settings — so scan() must
 * be idempotent for a given settings value: skip cards already processed
 * under the same settings, refresh ones processed under different settings.
 */
export interface SiteAdapter {
  name: string;
  matches(hostname: string): boolean;
  scan(settings: Settings): void;
}

/**
 * One supported leasing site. content.ts picks the adapter whose matches()
 * accepts the current hostname and calls scan() on load and (debounced) on
 * every DOM mutation, so scan() must be idempotent: skip cards that were
 * already processed.
 */
export interface SiteAdapter {
  name: string;
  matches(hostname: string): boolean;
  scan(): void;
}

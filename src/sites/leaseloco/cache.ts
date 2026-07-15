/**
 * LeaseLoco's config pages don't show the broker admin fee anywhere (not in
 * the DOM, the Next.js page data, or any API response) — but the search-page
 * cards advertise an all-in total. So while annotating cards we remember
 * each deal's total, keyed by the deal hash from its config URL, and the
 * config page looks it up to badge the exact figure. Direct visits without
 * a cache hit fall back to payments-only maths, clearly labelled.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const PREFIX = "lrcT:";

/** ".../2-24-5000-12-1/1727c075b68e4362ca8cb327f392789e/config" -> the hash. */
export function hashFromHref(href: string): string | null {
  const m = href.match(/\/([0-9a-f]{16,})\/config/i);
  return m ? m[1] : null;
}

export function rememberTotal(hash: string, total: number): void {
  if (!Number.isFinite(total)) return;
  try {
    sessionStorage.setItem(
      PREFIX + hash,
      JSON.stringify({ ts: Date.now(), total })
    );
  } catch {
    /* storage full — fine, just uncached */
  }
}

export function recallTotal(hash: string): number | null {
  try {
    const hit = JSON.parse(sessionStorage.getItem(PREFIX + hash) ?? "");
    if (hit && Date.now() - hit.ts < TTL_MS && Number.isFinite(hit.total)) {
      return hit.total;
    }
  } catch {
    /* absent or corrupt entry */
  }
  return null;
}

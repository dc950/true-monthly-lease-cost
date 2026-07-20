/**
 * Nationwide Vehicle Contracts' listing cards show a "From" monthly for an
 * unknown term/mileage profile, with no way to badge them exactly on their
 * own. But an individual deal page shows the exact profile for whatever
 * term/mileage the user has selected, so while annotating a deal page we
 * remember its quote here, keyed by the page's pathname (stable across the
 * term/mileage option changes that re-render the page in place). A listing
 * card then looks up its deal-page pathname and badges on a cache hit —
 * gated by the card annotation matching the cached monthly, since the cache
 * only reflects whatever profile was last viewed, not necessarily the
 * card's advertised "From" profile.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const PREFIX = "lrcN:";

export interface NvcQuote {
  monthly: number;
  term: number;
  mileage: number;
  initial: number;
  fee: number;
}

function isViableQuote(q: NvcQuote): boolean {
  return (
    Number.isFinite(q.monthly) &&
    Number.isFinite(q.term) &&
    Number.isFinite(q.mileage) &&
    Number.isFinite(q.initial) &&
    Number.isFinite(q.fee)
  );
}

export function rememberQuote(pathname: string, quote: NvcQuote): void {
  if (!isViableQuote(quote)) return;
  try {
    sessionStorage.setItem(
      PREFIX + pathname,
      JSON.stringify({ ts: Date.now(), quote })
    );
  } catch {
    /* storage full — fine, just uncached */
  }
}

export function recallQuote(pathname: string): NvcQuote | null {
  try {
    const hit = JSON.parse(sessionStorage.getItem(PREFIX + pathname) ?? "");
    if (hit && Date.now() - hit.ts < TTL_MS && isViableQuote(hit.quote)) {
      return hit.quote;
    }
  } catch {
    /* absent or corrupt entry */
  }
  return null;
}

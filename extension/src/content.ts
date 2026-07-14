/**
 * Lease Real Cost — content script entry point.
 *
 * Picks the adapter for the current site and re-scans (debounced) on DOM
 * mutations, since deal lists are client-rendered and extended in place.
 * Adapters skip already-processed cards, so the rescan triggered by our own
 * badge insertions terminates immediately.
 */
import { leasingCom } from "./sites/leasingcom";
import type { SiteAdapter } from "./sites/types";

const adapters: SiteAdapter[] = [leasingCom];

const active = adapters.filter((a) => a.matches(location.hostname));

if (active.length > 0) {
  const scanAll = () => active.forEach((a) => a.scan());

  let pending: number | null = null;
  const observer = new MutationObserver(() => {
    if (pending !== null) return;
    pending = window.setTimeout(() => {
      pending = null;
      scanAll();
    }, 150);
  });

  scanAll();
  observer.observe(document.body, { childList: true, subtree: true });
}

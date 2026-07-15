/**
 * Lease Real Cost — content script entry point.
 *
 * Picks the adapter for the current site and re-scans (debounced) on DOM
 * mutations, since deal lists are client-rendered and extended in place, and
 * again whenever the user changes settings in the toolbar popup. Adapters
 * skip cards already processed under the current settings, so the rescan
 * triggered by our own badge insertions terminates immediately.
 */
import { loadSettings, onSettingsChanged, type Settings } from "./settings";
import { leaseLoco } from "./sites/leaseloco";
import { leasingCom } from "./sites/leasingcom";
import type { SiteAdapter } from "./sites/types";

const adapters: SiteAdapter[] = [leasingCom, leaseLoco];

const active = adapters.filter((a) => a.matches(location.hostname));

if (active.length > 0) {
  void (async () => {
    let settings: Settings = await loadSettings();
    const scanAll = () => active.forEach((a) => a.scan(settings));

    onSettingsChanged((s) => {
      settings = s;
      scanAll();
    });

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
  })();
}

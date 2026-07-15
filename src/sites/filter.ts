import { mileageAllowed, termAllowed, type Settings } from "../settings";

/**
 * Dim or hide a deal card outside the configured term/mileage range.
 * NaN term or mileage means "unknown" and never excludes a card.
 */
export function applyDealFilter(
  card: HTMLElement,
  term: number,
  mileage: number,
  settings: Settings
): void {
  const excluded =
    (Number.isFinite(term) && !termAllowed(term, settings)) ||
    (Number.isFinite(mileage) && !mileageAllowed(mileage, settings));
  card.classList.toggle("lrc-dim", excluded && settings.mode === "dim");
  card.classList.toggle("lrc-hide", excluded && settings.mode === "hide");
}

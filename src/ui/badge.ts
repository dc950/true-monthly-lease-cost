import type { Severity } from "../core/cost";

export const BADGE_CLASS = "lrc-badge";

export interface BadgeSpec {
  main: string;
  sub: string;
  title: string;
  severity: Severity;
  /** Model-card variant (left-aligned, slightly smaller). */
  modelCard?: boolean;
}

export function hasBadge(card: Element): boolean {
  return card.querySelector("." + BADGE_CLASS) !== null;
}

export function buildBadge(spec: BadgeSpec): HTMLElement {
  const badge = document.createElement("div");
  badge.className = `${BADGE_CLASS} lrc-${spec.severity}`;
  if (spec.modelCard) badge.classList.add("lrc-model");

  const main = document.createElement("div");
  main.className = "lrc-main";
  main.textContent = spec.main;

  const sub = document.createElement("div");
  sub.className = "lrc-sub";
  sub.textContent = spec.sub;

  badge.append(main, sub);
  badge.title = spec.title;
  return badge;
}

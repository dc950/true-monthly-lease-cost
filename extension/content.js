/**
 * Lease Real Cost — leasing.com content script.
 *
 * For every deal card, computes the effective monthly cost:
 *   (initial rental + monthly x (term - 1) + admin fees) / term
 * (the initial rental replaces the first month's payment; leasing.com shows
 * the initial rental excluding fees, so fees are added separately)
 * and injects a badge next to the advertised price.
 */
(() => {
  "use strict";

  const BADGE_CLASS = "lrc-badge";
  const CARD_SELECTOR = 'li.deal-card-v2, [data-test="search-result-item"]';

  const gbp = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  });
  const gbpWhole = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

  function parseMoney(s) {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    return cleaned ? parseFloat(cleaned) : NaN;
  }

  /** Pull term, initial rental, monthly price and fees out of a deal card. */
  function extract(card) {
    // Preferred source: the data attributes leasing.com puts on the term list.
    const termEl = card.querySelector("[data-term]");
    const initEl = card.querySelector("[data-initialrental]");
    let term = termEl ? parseInt(termEl.getAttribute("data-term"), 10) : NaN;
    let initial = initEl
      ? parseMoney(initEl.getAttribute("data-initialrental"))
      : NaN;

    const priceEl = card.querySelector(".price");
    let monthly = priceEl ? parseMoney(priceEl.textContent) : NaN;

    let fees = 0;
    for (const label of card.querySelectorAll(".label")) {
      if (/additional fees/i.test(label.textContent)) {
        const valueEl =
          label.nextElementSibling ||
          label.parentElement.querySelector(".value");
        const parsed = valueEl ? parseMoney(valueEl.textContent) : NaN;
        if (isFinite(parsed)) fees = parsed;
      }
    }

    // Fallback: regex over the card's visible text, in case the markup changes.
    const text = card.textContent || "";
    if (!isFinite(term)) {
      const m = text.match(/(\d+)\s*month term/i);
      if (m) term = parseInt(m[1], 10);
    }
    if (!isFinite(initial)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*initial rental/i);
      if (m) initial = parseMoney(m[1]);
    }
    if (!isFinite(monthly)) {
      const m = text.match(/£\s*([\d,]+(?:\.\d+)?)\s*p\/m/i);
      if (m) monthly = parseMoney(m[1]);
    }

    return { term, initial, monthly, fees };
  }

  function annotate(card) {
    if (card.querySelector("." + BADGE_CLASS)) return;

    const { term, initial, monthly, fees } = extract(card);
    if (!isFinite(term) || !isFinite(initial) || !isFinite(monthly) || term <= 0)
      return; // e.g. model-level "from £X p/m" cards with no term/initial

    const total = initial + monthly * (term - 1) + fees;
    const real = total / term;
    const markupPct = Math.round((real / monthly - 1) * 100);

    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    badge.classList.add(
      markupPct < 15 ? "lrc-low" : markupPct < 40 ? "lrc-mid" : "lrc-high"
    );

    const main = document.createElement("div");
    main.className = "lrc-main";
    main.textContent = `${gbp.format(real)} p/m real`;

    const sub = document.createElement("div");
    sub.className = "lrc-sub";
    sub.textContent = `${gbpWhole.format(total)} total · +${markupPct}% vs headline`;

    badge.append(main, sub);
    badge.title =
      `Initial rental ${gbp.format(initial)}\n` +
      `+ ${term - 1} payments of ${gbp.format(monthly)}\n` +
      `+ fees ${gbp.format(fees)}\n` +
      `= ${gbp.format(total)} over ${term} months`;

    const anchor =
      card.querySelector(".price-wrapper") ||
      (card.querySelector(".price") &&
        card.querySelector(".price").parentElement);
    if (anchor) anchor.appendChild(badge);
  }

  function scan() {
    document.querySelectorAll(CARD_SELECTOR).forEach(annotate);
  }

  // Deal lists are client-rendered and extended via "Load more" / filter
  // changes, so re-scan (debounced) on DOM mutations. annotate() is a no-op on
  // cards that already have a badge, so the rescan our own insertions trigger
  // terminates immediately.
  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      scan();
    }, 150);
  });

  scan();
  observer.observe(document.body, { childList: true, subtree: true });
})();

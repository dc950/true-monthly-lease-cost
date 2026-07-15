"use strict";
(() => {
  // src/settings.ts
  var TERM_OPTIONS = [18, 24, 36, 48];
  var MILEAGE_OPTIONS = [
    5e3,
    6e3,
    8e3,
    1e4,
    12e3,
    15e3,
    2e4,
    25e3,
    3e4
  ];
  var DEFAULT_SETTINGS = {
    minTerm: 0,
    maxTerm: 0,
    minMileage: 0,
    mode: "dim"
  };
  var VALID_TERMS = /* @__PURE__ */ new Set([0, ...TERM_OPTIONS]);
  var VALID_MILEAGES = /* @__PURE__ */ new Set([0, ...MILEAGE_OPTIONS]);
  function sanitizeBound(value, valid) {
    return typeof value === "number" && valid.has(value) ? value : 0;
  }
  function sanitizeSettings(raw) {
    const r = raw ?? {};
    let minTerm = sanitizeBound(r.minTerm, VALID_TERMS);
    let maxTerm = sanitizeBound(r.maxTerm, VALID_TERMS);
    if (minTerm !== 0 && maxTerm !== 0 && minTerm > maxTerm) {
      [minTerm, maxTerm] = [maxTerm, minTerm];
    }
    const minMileage = sanitizeBound(r.minMileage, VALID_MILEAGES);
    const mode = r.mode === "hide" ? "hide" : "dim";
    return { minTerm, maxTerm, minMileage, mode };
  }
  function storageAvailable() {
    return typeof browser !== "undefined" && !!browser.storage?.sync;
  }
  async function loadSettings() {
    if (!storageAvailable()) return DEFAULT_SETTINGS;
    try {
      const stored = await browser.storage.sync.get("settings");
      return sanitizeSettings(stored.settings);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  async function saveSettings(s) {
    if (!storageAvailable()) return;
    await browser.storage.sync.set({ settings: sanitizeSettings(s) });
  }

  // src/popup/popup.ts
  var minTermSel = document.getElementById("minTerm");
  var maxTermSel = document.getElementById("maxTerm");
  var minMileageSel = document.getElementById("minMileage");
  var modeSel = document.getElementById("mode");
  var selects = [minTermSel, maxTermSel, minMileageSel, modeSel];
  function render(s) {
    minTermSel.value = String(s.minTerm);
    maxTermSel.value = String(s.maxTerm);
    minMileageSel.value = String(s.minMileage);
    modeSel.value = s.mode;
  }
  function save() {
    const clean = sanitizeSettings({
      minTerm: parseInt(minTermSel.value, 10),
      maxTerm: parseInt(maxTermSel.value, 10),
      minMileage: parseInt(minMileageSel.value, 10),
      mode: modeSel.value
    });
    render(clean);
    void saveSettings(clean);
  }
  void loadSettings().then((s) => {
    render(s);
    for (const el of selects) {
      el.addEventListener("change", save);
    }
  });
})();

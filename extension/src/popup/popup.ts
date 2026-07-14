import {
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from "../settings";

const minSel = document.getElementById("minTerm") as HTMLSelectElement;
const maxSel = document.getElementById("maxTerm") as HTMLSelectElement;
const modeSel = document.getElementById("mode") as HTMLSelectElement;

function render(s: { minTerm: number; maxTerm: number; mode: string }): void {
  minSel.value = String(s.minTerm);
  maxSel.value = String(s.maxTerm);
  modeSel.value = s.mode;
}

function save(): void {
  const clean = sanitizeSettings({
    minTerm: parseInt(minSel.value, 10),
    maxTerm: parseInt(maxSel.value, 10),
    mode: modeSel.value,
  });
  render(clean); // reflect sanitisation (e.g. min/max swapped) back into the UI
  void saveSettings(clean);
}

void loadSettings().then((s) => {
  render(s);
  for (const el of [minSel, maxSel, modeSel]) {
    el.addEventListener("change", save);
  }
});

import {
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type Settings,
} from "../settings";

const minTermSel = document.getElementById("minTerm") as HTMLSelectElement;
const maxTermSel = document.getElementById("maxTerm") as HTMLSelectElement;
const minMileageSel = document.getElementById("minMileage") as HTMLSelectElement;
const modeSel = document.getElementById("mode") as HTMLSelectElement;

const selects = [minTermSel, maxTermSel, minMileageSel, modeSel];

function render(s: Settings): void {
  minTermSel.value = String(s.minTerm);
  maxTermSel.value = String(s.maxTerm);
  minMileageSel.value = String(s.minMileage);
  modeSel.value = s.mode;
}

function save(): void {
  const clean = sanitizeSettings({
    minTerm: parseInt(minTermSel.value, 10),
    maxTerm: parseInt(maxTermSel.value, 10),
    minMileage: parseInt(minMileageSel.value, 10),
    mode: modeSel.value,
  });
  render(clean); // reflect sanitisation (e.g. min/max swapped) back into the UI
  void saveSettings(clean);
}

void loadSettings().then((s) => {
  render(s);
  for (const el of selects) {
    el.addEventListener("change", save);
  }
});

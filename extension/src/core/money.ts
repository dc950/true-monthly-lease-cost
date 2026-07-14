const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

const gbpWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** "£1,740.00 initial rental" -> 1740. NaN when the input has no digits. */
export function parseMoney(s: unknown): number {
  const cleaned = String(s ?? "").replace(/[^0-9.]/g, "");
  return cleaned ? parseFloat(cleaned) : NaN;
}

export function formatGBP(n: number): string {
  return gbp.format(n);
}

export function formatGBPWhole(n: number): string {
  return gbpWhole.format(n);
}

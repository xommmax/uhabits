// Dates cross the Kotlin bridge as "days since 2000-01-01" (core's LocalDate).

const DAY_MS = 86_400_000;
const EPOCH_2000 = Date.UTC(2000, 0, 1);

export function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(EPOCH_2000 + day * DAY_MS).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function frequencyText(num: number, den: number): string {
  if (num === den) return "Every day";
  if (num === 1 && den === 7) return "Every week";
  if (den === 7) return `${num} times per week`;
  if (den === 30 || den === 31) return `${num} times per month`;
  if (num === 1) return `Every ${den} days`;
  return `${num} times in ${den} days`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function signedPercent(value: number): string {
  const p = Math.round(value * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

// Entry values from core (org.isoron.uhabits.core.models.Entry)
export const Entry = { UNKNOWN: -1, NO: 0, YES_AUTO: 1, YES_MANUAL: 2, SKIP: 3 } as const;

// Light-theme palette from core's Theme.color(); used by the color picker.
export const PALETTE = [
  "#D32F2F", "#E64A19", "#F57C00", "#FF8F00", "#F9A825", "#AFB42B", "#7CB342",
  "#388E3C", "#00897B", "#00ACC1", "#039BE5", "#1976D2", "#303F9F", "#5E35B1",
  "#8E24AA", "#D81B60", "#5D4037", "#424242", "#757575", "#9E9E9E",
];

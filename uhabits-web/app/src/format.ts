// Dates cross the Kotlin bridge as "days since 2000-01-01" (core's LocalDate).

const DAY_MS = 86_400_000;
const EPOCH_2000 = Date.UTC(2000, 0, 1);

export function formatDay(day: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(EPOCH_2000 + day * DAY_MS).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** Same wording and rules as Android's formatFrequency (EditHabitActivity.kt). */
export function frequencyText(num: number, den: number): string {
  if (num === 1 && (den === 30 || den === 31)) return "Every month";
  if (den === 30 || den === 31) return `${num} times per month`;
  if (num === 1 && den === 1) return "Every day";
  if (num === 1 && den === 7) return "Every week";
  if (num === 1 && den > 1) return `Every ${den} days`;
  if (den === 7) return `${num} times per week`;
  return `${num} times in ${den} days`;
}

/** Port of core's Double.toShortString (NumberButton.kt). */
export function shortNumber(v: number): string {
  const trim = (x: number, digits: number) => String(Number(x.toFixed(digits)));
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}G`;
  if (v >= 1e8) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e5) return `${(v / 1e3).toFixed(0)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (v >= 1e2) return trim(v, 0);
  if (v >= 1e1) return trim(v, 1);
  return trim(v, 2);
}

// Entry values from core (org.isoron.uhabits.core.models.Entry)
export const Entry = { UNKNOWN: -1, NO: 0, YES_AUTO: 1, YES_MANUAL: 2, SKIP: 3 } as const;

// Light-theme palette from core's Theme.color(); used by the color picker.
export const PALETTE = [
  "#D32F2F", "#E64A19", "#F57C00", "#FF8F00", "#F9A825", "#AFB42B", "#7CB342",
  "#388E3C", "#00897B", "#00ACC1", "#039BE5", "#1976D2", "#303F9F", "#5E35B1",
  "#8E24AA", "#D81B60", "#5D4037", "#424242", "#757575", "#9E9E9E",
];

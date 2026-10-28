import { describe, expect, it } from "vitest";
import { Entry, formatDay, frequencyText, PALETTE, shortNumber } from "../../src/format";

describe("formatDay", () => {
  it("day 0 is Saturday 2000-01-01", () => {
    expect(formatDay(0, { weekday: "short", day: "numeric", month: "short", year: "numeric" })).toBe("Sat, Jan 1, 2000");
  });

  it("counts whole days, across leap years", () => {
    expect(formatDay(59, { month: "short", day: "numeric" })).toBe("Feb 29");
    expect(formatDay(366, { year: "numeric", month: "short", day: "numeric" })).toBe("Jan 1, 2001");
    // 2026-10-28 (a Wednesday)
    const day = Math.round((Date.UTC(2026, 9, 28) - Date.UTC(2000, 0, 1)) / 86_400_000);
    expect(formatDay(day, { weekday: "short" })).toBe("Wed");
    expect(formatDay(day, { day: "numeric" })).toBe("28");
  });

  it("does not depend on the device time zone (formatted in UTC)", () => {
    // Midnight UTC would be the previous evening in America; the label must still be the same day
    expect(formatDay(9797, { day: "numeric", month: "numeric", year: "numeric" })).toBe("10/28/2026");
  });
});

describe("frequencyText (Android's formatFrequency)", () => {
  it.each([
    [1, 1, "Every day"],
    [1, 7, "Every week"],
    [1, 30, "Every month"],
    [1, 31, "Every month"],
    [10, 30, "10 times per month"],
    [2, 31, "2 times per month"],
    [1, 2, "Every 2 days"],
    [1, 5, "Every 5 days"],
    [3, 7, "3 times per week"],
    [6, 7, "6 times per week"],
    [3, 14, "3 times in 14 days"],
    [2, 3, "2 times in 3 days"],
  ])("%i/%i → %s", (num, den, text) => {
    expect(frequencyText(num, den)).toBe(text);
  });
});

describe("shortNumber (core's Double.toShortString)", () => {
  it.each([
    [0, "0"],
    [3, "3"],
    [0.5, "0.5"],
    [2.1, "2.1"],
    [1.25, "1.25"],
    [1.255, "1.25"], // %.2f of the binary value (sprintf-js, which core uses on the web)
    [0.001, "0.00"],
    [9.999, "10.00"],
    [10, "10"],
    [12.34, "12.3"],
    [12.04, "12.0"], // Android keeps the decimal once the value has one
    [99.95, "100.0"],
    [100, "100"],
    [123.4, "123"],
    [999, "999"],
    [1000, "1.0k"],
    [1500, "1.5k"],
    [12_345, "12.3k"],
    [99_999, "100.0k"],
    [100_000, "100k"],
    [999_999, "1000k"],
    [1_000_000, "1.0M"],
    [2_500_000, "2.5M"],
    [12_340_000, "12.3M"],
    [100_000_000, "100M"],
    [1_000_000_000, "1.0G"],
    [12_300_000_000, "12.3G"],
  ])("%d → %s", (value, text) => {
    expect(shortNumber(value)).toBe(text);
  });
});

describe("constants", () => {
  it("Entry values are core's", () => {
    expect(Entry).toEqual({ UNKNOWN: -1, NO: 0, YES_AUTO: 1, YES_MANUAL: 2, SKIP: 3 });
  });

  it("PALETTE is Loop's 20 light-theme colours", () => {
    expect(PALETTE).toHaveLength(20);
    expect(new Set(PALETTE).size).toBe(20);
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    expect(PALETTE[0]).toBe("#D32F2F");
    expect(PALETTE[8]).toBe("#00897B"); // the default habit colour
    expect(PALETTE[19]).toBe("#9E9E9E");
  });
});

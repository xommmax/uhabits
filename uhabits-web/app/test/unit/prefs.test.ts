import { describe, expect, it } from "vitest";
import { applyDefaults, getBool, getString, Pref, setBool, setString } from "../../src/prefs";

describe("prefs", () => {
  it("stores Android's keys under pref: in localStorage, shared with Kotlin", () => {
    setBool(Pref.skipEnabled, true);
    setString(Pref.firstWeekday, "4");
    expect(localStorage.getItem("pref:pref_skip_enabled")).toBe("true");
    expect(localStorage.getItem("pref:pref_first_weekday")).toBe("4");
  });

  it("reads booleans with a default", () => {
    expect(getBool("missing")).toBe(false);
    expect(getBool("missing", true)).toBe(true);
    setBool("x", false);
    expect(getBool("x", true)).toBe(false);
    localStorage.setItem("pref:y", "true");
    expect(getBool("y")).toBe(true);
    localStorage.setItem("pref:z", "garbage");
    expect(getBool("z", true)).toBe(false);
  });

  it("reads strings with a default", () => {
    expect(getString("missing", "d")).toBe("d");
    setString("s", "");
    expect(getString("s", "d")).toBe("");
  });

  it("uses Android's key names", () => {
    expect(Pref).toEqual({
      shortToggle: "pref_short_toggle",
      skipEnabled: "pref_skip_enabled",
      questionMarks: "pref_unknown_enabled",
      disableAnimation: "pref_disable_animation",
      reverseDays: "pref_checkmark_reverse_order",
      pureBlack: "pref_pure_black",
      firstWeekday: "pref_first_weekday",
      midnightDelay: "pref_midnight_delay",
    });
  });

  it("applies the app's defaults on a new install", () => {
    applyDefaults();
    expect(getBool(Pref.shortToggle)).toBe(true);
    expect(getBool(Pref.reverseDays)).toBe(true);
    expect(getString(Pref.firstWeekday, "-1")).toBe("2"); // Monday
    expect(getBool(Pref.skipEnabled)).toBe(false);
  });

  it("never overrides what the user chose", () => {
    setBool(Pref.shortToggle, false);
    setBool(Pref.reverseDays, false);
    setString(Pref.firstWeekday, "1");
    applyDefaults();
    expect(getBool(Pref.shortToggle, true)).toBe(false);
    expect(getBool(Pref.reverseDays, true)).toBe(false);
    expect(getString(Pref.firstWeekday, "-1")).toBe("1");
  });
});

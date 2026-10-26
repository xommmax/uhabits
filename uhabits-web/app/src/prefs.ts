// Android's preference keys (core's Preferences.kt), stored in localStorage
// under "pref:" by LocalStoragePreferences.kt, so Kotlin and the UI share them.

const key = (name: string) => `pref:${name}`;

export function getBool(name: string, defaultValue = false): boolean {
  const value = localStorage.getItem(key(name));
  return value === null ? defaultValue : value === "true";
}

export function setBool(name: string, value: boolean) {
  localStorage.setItem(key(name), String(value));
}

export function getString(name: string, defaultValue: string): string {
  return localStorage.getItem(key(name)) ?? defaultValue;
}

export function setString(name: string, value: string) {
  localStorage.setItem(key(name), value);
}

export const Pref = {
  shortToggle: "pref_short_toggle",
  skipEnabled: "pref_skip_enabled",
  questionMarks: "pref_unknown_enabled",
  disableAnimation: "pref_disable_animation",
  reverseDays: "pref_checkmark_reverse_order",
  pureBlack: "pref_pure_black",
  firstWeekday: "pref_first_weekday",
  midnightDelay: "pref_midnight_delay",
} as const;

/**
 * Defaults chosen for this app, applied to any preference not set yet:
 * tap toggles, days in reverse order, and weeks starting on Monday.
 */
export function applyDefaults() {
  const unset = (name: string) => localStorage.getItem(key(name)) === null;
  if (unset(Pref.shortToggle)) setBool(Pref.shortToggle, true);
  if (unset(Pref.reverseDays)) setBool(Pref.reverseDays, true);
  if (unset(Pref.firstWeekday)) setString(Pref.firstWeekday, "2"); // Calendar numbering: 1 = Sunday, 2 = Monday
}

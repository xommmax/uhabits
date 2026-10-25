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

/** Tap toggles by default here (Android's "Toggle with short press" on), as agreed for the iPhone. */
export function applyDefaults() {
  if (localStorage.getItem(key(Pref.shortToggle)) === null) setBool(Pref.shortToggle, true);
}

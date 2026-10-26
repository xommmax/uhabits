import { useEffect, useState } from "preact/hooks";
import { getString, setString } from "./prefs";

// Port of core's ThemeSwitcher: pref_theme is 0 = follow system, 1 = dark, 2 = light.
const THEME_AUTOMATIC = 0;
const THEME_DARK = 1;
const THEME_LIGHT = 2;

const systemQuery = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

const userTheme = () => Number(getString("pref_theme", String(THEME_AUTOMATIC)));
const systemTheme = () => (systemQuery.matches ? THEME_DARK : THEME_LIGHT);

export function isNightMode(): boolean {
  const user = userTheme();
  return user === THEME_DARK || (user === THEME_AUTOMATIC && systemTheme() === THEME_DARK);
}

/** Sets data-theme on <html> so the CSS follows the in-app choice instead of the system. */
export function applyTheme() {
  const user = userTheme();
  const root = document.documentElement;
  if (user === THEME_AUTOMATIC) delete root.dataset.theme;
  else root.dataset.theme = user === THEME_DARK ? "dark" : "light";
  root.classList.toggle("pure-black", getString("pref_pure_black", "false") === "true");
  // Status bar on Android: colorPrimaryDark of the light and dark themes
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isNightMode() ? "#000000" : "#303030");
  listeners.forEach((l) => l());
}

/** Same transitions as ThemeSwitcher.toggleNightMode. */
export function toggleNightMode() {
  const user = userTheme();
  const system = systemTheme();
  let next = user;
  if (user === THEME_AUTOMATIC) next = system === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
  else if (user === THEME_LIGHT) next = system === THEME_LIGHT ? THEME_DARK : THEME_AUTOMATIC;
  else if (user === THEME_DARK) next = system === THEME_LIGHT ? THEME_AUTOMATIC : THEME_LIGHT;
  setString("pref_theme", String(next));
  applyTheme();
}

systemQuery.addEventListener("change", applyTheme);

/** True when the app is showing its dark theme; updates on theme changes. */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(isNightMode);
  useEffect(() => {
    const update = () => setDark(isNightMode());
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);
  return dark;
}

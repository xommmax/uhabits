import { act, render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// theme.ts reads the system setting when it loads, so each test loads it fresh with a fake matchMedia
let systemDark = false;
let systemListeners: (() => void)[] = [];
async function loadTheme(dark: boolean) {
  systemDark = dark;
  systemListeners = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, l: () => void) => systemListeners.push(l),
    removeEventListener: () => {},
  }));
  vi.resetModules();
  return import("../../src/theme");
}
const setUserTheme = (v: number | null) => (v === null ? localStorage.removeItem("pref:pref_theme") : localStorage.setItem("pref:pref_theme", String(v)));

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#303030">';
});

describe("isNightMode", () => {
  it.each([
    [null, false, false],
    [null, true, true],
    [0, false, false],
    [0, true, true],
    [1, false, true],
    [1, true, true],
    [2, false, false],
    [2, true, false],
  ])("pref_theme=%s, system dark=%s → %s", async (pref, system, expected) => {
    const theme = await loadTheme(system);
    setUserTheme(pref);
    expect(theme.isNightMode()).toBe(expected);
  });
});

describe("toggleNightMode (ThemeSwitcher.toggleNightMode)", () => {
  it.each([
    // [current, system dark, next]
    [0, false, 1],
    [0, true, 2],
    [2, false, 1],
    [2, true, 0],
    [1, false, 0],
    [1, true, 2],
  ])("pref_theme %i with system dark=%s → %i", async (current, system, next) => {
    const theme = await loadTheme(system);
    setUserTheme(current);
    theme.toggleNightMode();
    expect(localStorage.getItem("pref:pref_theme")).toBe(String(next));
  });

  it("always flips what is shown", async () => {
    for (const system of [false, true]) {
      const theme = await loadTheme(system);
      for (const start of [0, 1, 2]) {
        setUserTheme(start);
        const before = theme.isNightMode();
        theme.toggleNightMode();
        expect(theme.isNightMode()).toBe(!before);
      }
    }
  });
});

describe("applyTheme", () => {
  it("follows the system when automatic", async () => {
    const theme = await loadTheme(true);
    document.documentElement.dataset.theme = "light";
    theme.applyTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#000000");
  });

  it("sets data-theme and the status bar colour for a chosen theme", async () => {
    const theme = await loadTheme(false);
    setUserTheme(1);
    theme.applyTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#000000");
    setUserTheme(2);
    theme.applyTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#303030");
  });

  it("toggles pure black", async () => {
    const theme = await loadTheme(false);
    localStorage.setItem("pref:pref_pure_black", "true");
    theme.applyTheme();
    expect(document.documentElement.classList.contains("pure-black")).toBe(true);
    localStorage.setItem("pref:pref_pure_black", "false");
    theme.applyTheme();
    expect(document.documentElement.classList.contains("pure-black")).toBe(false);
  });

  it("re-applies when the system theme changes", async () => {
    const theme = await loadTheme(false);
    void theme;
    expect(systemListeners).toHaveLength(1);
    systemDark = true;
    systemListeners[0]();
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#000000");
  });
});

describe("useDarkMode", () => {
  it("updates components when the theme changes, and stops after unmount", async () => {
    const theme = await loadTheme(false);
    let renders = 0;
    const Probe = () => {
      renders++;
      return <span>{theme.useDarkMode() ? "dark" : "light"}</span>;
    };
    const { container, unmount } = render(<Probe />);
    expect(container.textContent).toBe("light");
    act(() => theme.toggleNightMode());
    expect(container.textContent).toBe("dark");
    act(() => theme.toggleNightMode());
    expect(container.textContent).toBe("light");
    unmount();
    const count = renders;
    theme.toggleNightMode();
    expect(renders).toBe(count);
  });
});

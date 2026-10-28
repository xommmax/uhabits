// The Kotlin core expects a browser: localStorage (preferences), window.devicePixelRatio and canvases (charts).
import { beforeEach } from "vitest";
import { fakeCanvas } from "./helpers";

const store = new Map<string, string>();
const localStorageShim = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
Object.assign(globalThis, {
  localStorage: localStorageShim,
  window: Object.assign(globalThis, { devicePixelRatio: 2 }),
  document: { createElement: (tag: string) => (tag === "canvas" ? fakeCanvas(10, 10) : {}) },
});

beforeEach(() => {
  store.clear();
  // Monday, like the app's default (prefs.ts applyDefaults)
  store.set("pref:pref_first_weekday", "2");
});

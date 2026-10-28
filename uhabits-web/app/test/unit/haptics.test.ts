import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHaptics(vibrate?: (ms: number) => boolean) {
  if (vibrate) Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
  else Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
  vi.resetModules();
  return import("../../src/haptics");
}
afterEach(() => {
  Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
});

describe("haptic", () => {
  it("vibrates like Android's performHapticFeedback where the Vibration API exists", async () => {
    const vibrate = vi.fn(() => true);
    const h = await loadHaptics(vibrate);
    expect(h.canVibrate).toBe(true);
    h.haptic("toggle");
    h.haptic("key");
    expect(vibrate.mock.calls).toEqual([[20], [10]]);
  });

  it("on an iPhone, clicks the label of a hidden switch and removes it again", async () => {
    const h = await loadHaptics();
    expect(h.canVibrate).toBe(false);
    const clicked: HTMLLabelElement[] = [];
    vi.spyOn(HTMLLabelElement.prototype, "click").mockImplementation(function (this: HTMLLabelElement) {
      expect(this.isConnected).toBe(true); // a detached label plays nothing
      clicked.push(this);
    });
    h.haptic("toggle");
    expect(clicked).toHaveLength(1);
    const input = clicked[0].querySelector("input")!;
    expect(input.type).toBe("checkbox");
    expect(input.hasAttribute("switch")).toBe(true);
    expect(clicked[0].style.display).toBe("none");
    expect(clicked[0].isConnected).toBe(false);
    expect(document.querySelectorAll("input[switch]")).toHaveLength(0);
  });
});

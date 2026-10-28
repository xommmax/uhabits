import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const konfetti = vi.hoisted(() => vi.fn());
vi.mock("../../src/confetti", () => ({ konfetti }));

import { celebrate, ColorPicker, EntryPopup, GLYPH, HabitTypePicker, type PopupRequest, usePress } from "../../src/popups";
import type { HabitsCore } from "../../src/core";
import { PALETTE } from "../../src/format";

const setPref = (name: string, on: boolean) => localStorage.setItem(`pref:${name}`, String(on));
let reducedMotion = false;
beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ media: q, matches: q.includes("reduce") && reducedMotion, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  konfetti.mockReset();
});

describe("usePress", () => {
  function Button(props: { tap: () => void; long: () => void }) {
    return <button {...usePress(props.tap, props.long)}>b</button>;
  }

  it("a short press is a tap", () => {
    vi.useFakeTimers();
    const tap = vi.fn(), long = vi.fn();
    render(<Button tap={tap} long={long} />);
    const b = screen.getByText("b");
    fireEvent.pointerDown(b);
    vi.advanceTimersByTime(499);
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    vi.advanceTimersByTime(1000);
    expect(tap).toHaveBeenCalledOnce();
    expect(long).not.toHaveBeenCalled();
  });

  it("holding for 500 ms is a long press, and the click that follows is not a tap", () => {
    vi.useFakeTimers();
    const tap = vi.fn(), long = vi.fn();
    render(<Button tap={tap} long={long} />);
    const b = screen.getByText("b");
    fireEvent.pointerDown(b);
    vi.advanceTimersByTime(500);
    expect(long).toHaveBeenCalledOnce();
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    expect(tap).not.toHaveBeenCalled();
    // the next short press is a tap again
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    fireEvent.click(b);
    expect(tap).toHaveBeenCalledOnce();
  });

  it.each(["pointerLeave", "pointerCancel"] as const)("%s cancels the long press", (event) => {
    vi.useFakeTimers();
    const long = vi.fn();
    render(<Button tap={vi.fn()} long={long} />);
    const b = screen.getByText("b");
    fireEvent.pointerDown(b);
    fireEvent[event](b);
    vi.advanceTimersByTime(1000);
    expect(long).not.toHaveBeenCalled();
  });

  it("blocks the context menu (iOS callout on long press)", () => {
    render(<Button tap={vi.fn()} long={vi.fn()} />);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByText("b").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("celebrate", () => {
  it("shows confetti in the habit colour at the tap", () => {
    celebrate("#00897B", 10, 20);
    expect(konfetti).toHaveBeenCalledWith("#00897B", 10, 20);
  });

  it("is off with 'Disable animations'", () => {
    setPref("pref_disable_animation", true);
    celebrate("#00897B", 10, 20);
    expect(konfetti).not.toHaveBeenCalled();
  });

  it("is off when the system asks for reduced motion, like Android with animations off", () => {
    reducedMotion = true;
    celebrate("#00897B", 10, 20);
    expect(konfetti).not.toHaveBeenCalled();
  });
});

function popupCore(value: number, notes = "") {
  return {
    entry: vi.fn(() => ({ value, notes })),
    setEntry: vi.fn(),
  } as unknown as HabitsCore & { entry: ReturnType<typeof vi.fn>; setEntry: ReturnType<typeof vi.fn> };
}
const request = (extra: Partial<PopupRequest> = {}): PopupRequest => ({ habitId: 3, day: 9797, numerical: false, color: "#00897B", x: 5, y: 6, ...extra });
const glyphButtons = (container: HTMLElement) => [...container.querySelectorAll(".popup-glyph")].map((b) => b.textContent);

describe("check-in popup (CheckmarkDialog)", () => {
  it("offers yes and no by default, plus skip and ? when enabled", () => {
    const { container, unmount } = render(<EntryPopup core={popupCore(-1)} request={request()} onClose={vi.fn()} />);
    expect(glyphButtons(container)).toEqual([GLYPH.check, GLYPH.times]);
    unmount();
    setPref("pref_skip_enabled", true);
    setPref("pref_unknown_enabled", true);
    const again = render(<EntryPopup core={popupCore(-1)} request={request()} onClose={vi.fn()} />);
    expect(glyphButtons(again.container)).toEqual([GLYPH.check, GLYPH.skipped, GLYPH.times, GLYPH.question]);
  });

  it.each([
    [0, 2],
    [1, 3],
    [2, 0],
    [3, -1],
  ])("button %i stores value %i with the trimmed notes", (index, value) => {
    setPref("pref_skip_enabled", true);
    setPref("pref_unknown_enabled", true);
    const core = popupCore(-1);
    const onClose = vi.fn();
    const { container } = render(<EntryPopup core={core} request={request()} onClose={onClose} />);
    fireEvent.input(container.querySelector(".popup-notes")!, { target: { value: "  nice  " } });
    fireEvent.click(container.querySelectorAll(".popup-glyph")[index]);
    expect(core.setEntry).toHaveBeenCalledWith(3, 9797, value, "nice");
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("confetti only when a new tick is added", () => {
    const { container, unmount } = render(<EntryPopup core={popupCore(-1)} request={request()} onClose={vi.fn()} />);
    fireEvent.click(container.querySelectorAll(".popup-glyph")[0]);
    expect(konfetti).toHaveBeenCalledWith("#00897B", 5, 6);
    unmount();
    konfetti.mockReset();
    const again = render(<EntryPopup core={popupCore(2)} request={request()} onClose={vi.fn()} />);
    fireEvent.click(again.container.querySelectorAll(".popup-glyph")[0]);
    expect(konfetti).not.toHaveBeenCalled();
  });

  it("shows the existing notes", () => {
    const { container } = render(<EntryPopup core={popupCore(2, "great chapter")} request={request()} onClose={vi.fn()} />);
    expect((container.querySelector(".popup-notes") as HTMLTextAreaElement).value).toBe("great chapter");
  });

  it("closing outside without changes stores nothing", () => {
    const core = popupCore(2, "n");
    const onClose = vi.fn();
    const { container } = render(<EntryPopup core={core} request={request()} onClose={onClose} />);
    fireEvent.click(container.querySelector(".popup-notes")!); // inside: stays open
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".overlay")!);
    expect(core.setEntry).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("closing outside keeps edited notes, with the value unchanged", () => {
    const core = popupCore(1, "");
    const { container } = render(<EntryPopup core={core} request={request()} onClose={vi.fn()} />);
    fireEvent.input(container.querySelector(".popup-notes")!, { target: { value: "tired " } });
    fireEvent.click(container.querySelector(".overlay")!);
    expect(core.setEntry).toHaveBeenCalledWith(3, 9797, 1, "tired");
  });
});

describe("number popup (NumberDialog)", () => {
  const numberInput = (c: HTMLElement) => c.querySelector(".popup-number input") as HTMLInputElement;

  it.each([
    [-1, "0"],
    [0, "0"],
    [9, "0"],
    [1500, "1.5"],
    [2250, "2.25"],
    [1234, "1.23"],
    [12_000, "12"],
  ])("value %i is shown as %s", (value, text) => {
    const { container } = render(<EntryPopup core={popupCore(value)} request={request({ numerical: true })} onClose={vi.fn()} />);
    expect(numberInput(container).value).toBe(text);
  });

  it("focuses and selects the number", () => {
    const select = vi.spyOn(HTMLInputElement.prototype, "select");
    const { container } = render(<EntryPopup core={popupCore(1500)} request={request({ numerical: true })} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(numberInput(container));
    expect(select).toHaveBeenCalled();
  });

  it.each([
    ["1.5", 1500],
    ["2,25", 2250],
    ["0", 0],
    ["10", 10_000],
    ["0.0005", 1],
    ["", -1],
    ["  ", -1],
    ["abc", 700],
  ])("typing %j stores %i", (typed, stored) => {
    const core = popupCore(700);
    const { container } = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={vi.fn()} />);
    fireEvent.input(numberInput(container), { target: { value: typed } });
    fireEvent.click(screen.getByText("Save"));
    expect(core.setEntry).toHaveBeenCalledWith(3, 9797, stored, "");
  });

  it("Enter saves", () => {
    const core = popupCore(0);
    const { container } = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={vi.fn()} />);
    fireEvent.input(numberInput(container), { target: { value: "3" } });
    fireEvent.keyDown(numberInput(container), { key: "Enter" });
    expect(core.setEntry).toHaveBeenCalledWith(3, 9797, 3000, "");
  });

  it("confetti when an 'at least' value changes, not for 'at most'", () => {
    const { container, unmount } = render(<EntryPopup core={popupCore(0)} request={request({ numerical: true, atLeast: true })} onClose={vi.fn()} />);
    fireEvent.input(numberInput(container), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Save"));
    expect(konfetti).toHaveBeenCalledOnce();
    unmount();
    const again = render(<EntryPopup core={popupCore(0)} request={request({ numerical: true, atLeast: false })} onClose={vi.fn()} />);
    fireEvent.input(numberInput(again.container), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Save"));
    expect(konfetti).toHaveBeenCalledOnce();
  });

  it("no confetti when saving the same value", () => {
    render(<EntryPopup core={popupCore(3000)} request={request({ numerical: true, atLeast: true })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Save"));
    expect(konfetti).not.toHaveBeenCalled();
  });

  it("has 'Skip day' and ? buttons only when enabled", () => {
    const core = popupCore(5000, "x");
    const { container, unmount } = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={vi.fn()} />);
    expect(container.querySelector(".popup-buttons")).toBeNull();
    unmount();
    setPref("pref_skip_enabled", true);
    setPref("pref_unknown_enabled", true);
    const again = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Skip day"));
    expect(core.setEntry).toHaveBeenLastCalledWith(3, 9797, 3, "x");
    fireEvent.click(again.container.querySelector(".popup-buttons .popup-glyph")!);
    expect(core.setEntry).toHaveBeenLastCalledWith(3, 9797, -1, "x");
  });

  it("closing outside keeps edited notes, or stores nothing", () => {
    const core = popupCore(5000, "a");
    const onClose = vi.fn();
    const { container, unmount } = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={onClose} />);
    fireEvent.click(container.querySelector(".overlay")!);
    expect(core.setEntry).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
    unmount();
    const again = render(<EntryPopup core={core} request={request({ numerical: true })} onClose={onClose} />);
    fireEvent.input(again.container.querySelector(".popup-notes")!, { target: { value: "b" } });
    fireEvent.click(again.container.querySelector(".overlay")!);
    expect(core.setEntry).toHaveBeenCalledWith(3, 9797, 5000, "b");
  });
});

describe("HabitTypePicker", () => {
  it("picks yes-or-no or measurable, and closes outside", () => {
    const onPick = vi.fn(), onClose = vi.fn();
    const { container } = render(<HabitTypePicker onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getByText("Yes or No"));
    fireEvent.click(screen.getByText("Measurable"));
    expect(onPick.mock.calls).toEqual([[false], [true]]);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".overlay")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ColorPicker", () => {
  it("shows the 20 palette colours and marks the selected one", () => {
    const { container } = render(<ColorPicker selected={8} onPick={vi.fn()} onPickCustom={vi.fn()} onClose={vi.fn()} />);
    const swatches = container.querySelectorAll(".swatches .swatch");
    expect(swatches).toHaveLength(20);
    expect(container.querySelectorAll(".swatch.selected")).toHaveLength(1);
    expect(swatches[8].classList.contains("selected")).toBe(true);
    expect(swatches[3].getAttribute("aria-label")).toBe("Color 4");
    expect((container.querySelector("input[type=color]") as HTMLInputElement).value.toUpperCase()).toBe(PALETTE[8]);
  });

  it("marks the custom swatch instead when the habit has a custom colour", () => {
    const { container } = render(<ColorPicker selected={15} custom="#FF69B4" onPick={vi.fn()} onPickCustom={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector(".swatches .swatch.selected")).toBeNull();
    const custom = container.querySelector(".custom-swatch") as HTMLElement;
    expect(custom.classList.contains("selected")).toBe(true);
    expect(custom.style.background).toMatch(/#FF69B4|rgb\(255, 105, 180\)/i);
    expect((container.querySelector("input[type=color]") as HTMLInputElement).value.toLowerCase()).toBe("#ff69b4");
  });

  it("picks a palette colour by index, or a custom one in upper case", () => {
    const onPick = vi.fn(), onPickCustom = vi.fn();
    const { container } = render(<ColorPicker onPick={onPick} onPickCustom={onPickCustom} onClose={vi.fn()} />);
    fireEvent.click(container.querySelectorAll(".swatches .swatch")[13]);
    expect(onPick).toHaveBeenCalledWith(13);
    fireEvent.change(container.querySelector("input[type=color]")!, { target: { value: "#abcdef" } });
    expect(onPickCustom).toHaveBeenCalledWith("#ABCDEF");
  });

  it("without a selection the colour input starts at the first colour", () => {
    const { container } = render(<ColorPicker onPick={vi.fn()} onPickCustom={vi.fn()} onClose={vi.fn()} />);
    expect((container.querySelector("input[type=color]") as HTMLInputElement).value.toUpperCase()).toBe(PALETTE[0]);
    expect(container.querySelectorAll(".swatch.selected")).toHaveLength(0);
  });

  it("closes when tapping outside, not inside", () => {
    const onClose = vi.fn();
    const { container } = render(<ColorPicker onPick={vi.fn()} onPickCustom={vi.fn()} onClose={onClose} />);
    fireEvent.click(container.querySelector(".dialog-title")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".overlay")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const konfetti = vi.hoisted(() => vi.fn());
const haptic = vi.hoisted(() => ({ fn: vi.fn(), canVibrate: true }));
vi.mock("../../src/confetti", () => ({ konfetti }));
vi.mock("../../src/haptics", () => ({
  haptic: haptic.fn,
  get canVibrate() {
    return haptic.canVibrate;
  },
}));

import { ListScreen } from "../../src/ListScreen";
import type { HabitsCore } from "../../src/core";
import { GLYPH } from "../../src/popups";
import { createFakeCore, fakeHabit, type FakeCore, TODAY } from "./fake-core";

const DAY = 86_400_000;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
const setPref = (name: string, v: boolean | string) => localStorage.setItem(`pref:${name}`, String(v));

function renderList(core: FakeCore, extra: Partial<Parameters<typeof ListScreen>[0]> = {}) {
  const props = {
    core: core as unknown as HabitsCore,
    rev: 0,
    refresh: vi.fn(),
    toast: vi.fn(),
    onOpen: vi.fn(),
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onSettings: vi.fn(),
    onAbout: vi.fn(),
    ...extra,
  };
  // refresh() re-renders like App does (bumps rev)
  let rev = 0;
  const result = render(<ListScreen {...props} />);
  props.refresh.mockImplementation(() => result.rerender(<ListScreen {...props} rev={++rev} />));
  return { ...result, props };
}
const row = (c: HTMLElement, name: string) => [...c.querySelectorAll(".habit-row")].find((r) => r.querySelector(".habit-name")!.textContent === name) as HTMLElement;
const cells = (r: HTMLElement) => [...r.querySelectorAll(".check")] as HTMLElement[];
const names = (c: HTMLElement) => [...c.querySelectorAll(".habit-name span")].map((s) => s.textContent);
const tap = (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.click(el);
};
const longPress = (el: Element) => {
  fireEvent.pointerDown(el);
  act(() => void vi.advanceTimersByTime(500));
  fireEvent.pointerUp(el);
  fireEvent.click(el);
};
const labels = (c: HTMLElement) => [...c.querySelectorAll(".list-header .day-label")].map((l) => l.textContent);

beforeEach(() => {
  setWidth(411); // 5 day columns, like the owner's Android phone
  setPref("pref_short_toggle", true);
  setPref("pref_checkmark_reverse_order", true);
  haptic.canVibrate = true;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  vi.stubGlobal("matchMedia", (q: string) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  konfetti.mockReset();
  haptic.fn.mockReset();
});

describe("ListScreen: empty states and layout", () => {
  it("shows Android's empty message without habits", () => {
    const { container } = renderList(createFakeCore());
    expect(container.querySelector(".empty p")!.textContent).toBe("You have no active habits");
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
  });

  it("says 'all done' when every habit is hidden by a filter", () => {
    const core = createFakeCore([fakeHabit({ name: "A", archived: true })]);
    const { container } = renderList(core);
    expect(container.querySelector(".empty p")!.textContent).toBe("You're all done for today!");
  });

  it.each([
    [320, 3],
    [390, 4],
    [411, 5],
    [768, 10],
    [1024, 14],
    [2000, 14],
  ])("at %i px wide shows %i day columns (getCheckmarkCount)", (width, columns) => {
    setWidth(width);
    const { container } = renderList(createFakeCore([fakeHabit()]));
    // plus one hidden day on each side for scrolling
    expect(container.querySelectorAll(".list-header .day-label")).toHaveLength(columns + 2);
    expect((container.querySelector(".list-header .days") as HTMLElement).style.width).toBe(`${columns * 48}px`);
  });

  it("puts today on the right by default, on the left with reverse order off", () => {
    const { container, unmount } = renderList(createFakeCore([fakeHabit()]));
    // 2026-10-28 is a Wednesday; hidden days: one older on the left, an empty one on the right
    expect(labels(container)).toEqual(["FRI23", "SAT24", "SUN25", "MON26", "TUE27", "WED28", ""]);
    unmount();
    setPref("pref_checkmark_reverse_order", false);
    const again = renderList(createFakeCore([fakeHabit()]));
    expect(labels(again.container)).toEqual(["", "WED28", "TUE27", "MON26", "SUN25", "SAT24", "FRI23"]);
  });

  it("re-counts the columns when the window is resized", () => {
    const { container } = renderList(createFakeCore([fakeHabit()]));
    setWidth(1024);
    act(() => void window.dispatchEvent(new Event("resize")));
    expect(container.querySelectorAll(".list-header .day-label")).toHaveLength(16);
  });

  it("asks core only for the days it shows", () => {
    const core = createFakeCore([fakeHabit()]);
    renderList(core);
    expect(core.listHabits).toHaveBeenLastCalledWith("", 7, -1);
  });
});

describe("ListScreen: rows", () => {
  it("shows each habit's name in its colour, with its score ring", () => {
    const core = createFakeCore([fakeHabit({ name: "Read", colorLight: "#1976d2", score: 0.5 })]);
    const { container } = renderList(core);
    const r = row(container, "Read");
    expect((r.querySelector(".habit-name span") as HTMLElement).style.color).toMatch(/#1976d2|rgb\(25, 118, 210\)/);
    const arc = r.querySelectorAll(".ring circle")[1];
    const [filled, total] = arc.getAttribute("stroke-dasharray")!.split(" ").map(Number);
    expect(filled / total).toBeCloseTo(0.5);
  });

  it("uses the dark colour in the dark theme", () => {
    localStorage.setItem("pref:pref_theme", "1");
    const core = createFakeCore([fakeHabit({ name: "Read", colorLight: "#1976d2", colorDark: "#90caf9" })]);
    const { container } = renderList(core);
    expect((row(container, "Read").querySelector(".habit-name span") as HTMLElement).style.color).toMatch(/#90caf9|rgb\(144, 202, 249\)/);
  });

  it("shows each value with Android's glyphs", () => {
    const h = fakeHabit({ name: "A" });
    h.entries.set(TODAY, { value: 2, notes: "" });
    h.entries.set(TODAY - 1, { value: 1, notes: "" });
    h.entries.set(TODAY - 2, { value: 3, notes: "" });
    h.entries.set(TODAY - 3, { value: 0, notes: "" });
    const { container } = renderList(createFakeCore([h]));
    const c = cells(row(container, "A"));
    // [older hidden, 4 days ago, 3 ago, 2 ago, yesterday, today, future hidden]
    expect(c.map((x) => x.textContent)).toEqual([GLYPH.times, GLYPH.times, GLYPH.times, GLYPH.skipped, GLYPH.check, GLYPH.check, ""]);
    expect(c[4].querySelector(".auto")).not.toBeNull();
    expect(c[5].querySelector(".auto")).toBeNull();
  });

  it("shows question marks for days without data when enabled", () => {
    setPref("pref_unknown_enabled", true);
    const h = fakeHabit({ name: "A" });
    h.entries.set(TODAY, { value: 0, notes: "" });
    const { container } = renderList(createFakeCore([h]));
    const c = cells(row(container, "A"));
    expect(c[4].textContent).toBe(GLYPH.question);
    expect(c[5].textContent).toBe(GLYPH.times);
  });

  it("shows measurable values as short numbers with the unit", () => {
    const h = fakeHabit({ name: "Run", numerical: true, unit: "km", targetValue: 5 });
    h.entries.set(TODAY, { value: 12_040, notes: "" });
    h.entries.set(TODAY - 1, { value: 3, notes: "" });
    h.entries.set(TODAY - 2, { value: 1_500_000, notes: "" });
    h.entries.set(TODAY - 3, { value: 3, notes: "" });
    h.entries.set(TODAY - 3, { value: 3, notes: "" });
    h.entries.set(TODAY - 4, { value: 3, notes: "" });
    const { container } = renderList(createFakeCore([h]));
    const c = cells(row(container, "Run"));
    expect(c[5].querySelector(".number")!.textContent).toBe("12.0");
    expect(c[5].querySelector(".unit")!.textContent).toBe("km");
    expect(c[3].querySelector(".number")!.textContent).toBe("1.5k");
    expect(c[0].querySelector(".number")!.textContent).toBe("0"); // no data
  });

  it("marks days with notes with a dot", () => {
    const h = fakeHabit({ name: "A" });
    h.entries.set(TODAY, { value: 2, notes: "good" });
    h.entries.set(TODAY - 1, { value: 2, notes: "  " });
    const { container } = renderList(createFakeCore([h]));
    const c = cells(row(container, "A"));
    expect(c[5].querySelector(".notes-dot")).not.toBeNull();
    expect(c[4].querySelector(".notes-dot")).toBeNull();
  });

  it("dims archived habits", () => {
    const core = createFakeCore([fakeHabit({ name: "Old", archived: true })]);
    core.state.showArchived = true;
    const { container } = renderList(core);
    expect(row(container, "Old").classList.contains("archived")).toBe(true);
  });

  it("puts category headers between groups", () => {
    const core = createFakeCore([
      fakeHabit({ name: "A", category: "Mind" }),
      fakeHabit({ name: "B", category: "Mind" }),
      fakeHabit({ name: "C", category: " Body " }),
      fakeHabit({ name: "D", category: "" }),
    ]);
    const { container } = renderList(core);
    const order = [...container.querySelectorAll(".category-header, .habit-row")].map((e) =>
      e.classList.contains("category-header") ? `[${e.textContent}]` : e.querySelector(".habit-name")!.textContent,
    );
    expect(order).toEqual(["[Mind]", "A", "B", "[Body]", "C", "D"]);
  });
});

describe("ListScreen: check-ins", () => {
  it("a tap toggles the day, with a haptic tick and confetti for a new tick", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A", colorLight: "#00897b" })]);
    const { container, props } = renderList(core);
    tap(cells(row(container, "A"))[5]);
    expect(core.toggle).toHaveBeenCalledWith(1, TODAY);
    expect(haptic.fn).toHaveBeenCalledWith("toggle");
    expect(konfetti).toHaveBeenCalledOnce();
    expect(konfetti.mock.calls[0][0]).toBe("#00897b");
    expect(props.refresh).toHaveBeenCalled();
    expect(cells(row(container, "A"))[5].textContent).toBe(GLYPH.check);
    tap(cells(row(container, "A"))[5]);
    expect(konfetti).toHaveBeenCalledOnce(); // unticking: no confetti
    tap(cells(row(container, "A"))[2]);
    expect(core.toggle).toHaveBeenLastCalledWith(1, TODAY - 3);
  });

  it("on an iPhone the cell is a label with a hidden switch, and the tick comes from the tap itself", () => {
    haptic.canVibrate = false;
    const core = createFakeCore([fakeHabit({ name: "A" })]);
    const { container } = renderList(core);
    const cell = cells(row(container, "A"))[5];
    expect(cell.tagName).toBe("LABEL");
    const sw = cell.querySelector("input.haptic-switch") as HTMLInputElement;
    expect(sw.type).toBe("checkbox");
    expect(sw.hasAttribute("switch")).toBe(true);
    tap(cell);
    expect(core.toggle).toHaveBeenCalledOnce();
    expect(haptic.fn).not.toHaveBeenCalled();
  });

  it("no switch where the browser can vibrate", () => {
    const { container } = renderList(createFakeCore([fakeHabit({ name: "A" })]));
    expect(container.querySelector("input.haptic-switch")).toBeNull();
  });

  it("a long press opens the popup with a tick, and stores what is picked", () => {
    vi.useFakeTimers();
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    const { container } = renderList(core);
    longPress(cells(row(container, "A"))[5]);
    expect(core.toggle).not.toHaveBeenCalled();
    expect(haptic.fn).toHaveBeenCalledWith("toggle");
    expect(container.querySelector(".entry-popup")).not.toBeNull();
    fireEvent.input(container.querySelector(".popup-notes")!, { target: { value: "note" } });
    fireEvent.click(container.querySelectorAll(".entry-popup .popup-glyph")[0]);
    expect(core.setEntry).toHaveBeenCalledWith(1, TODAY, 2, "note");
    expect(container.querySelector(".entry-popup")).toBeNull();
    expect(cells(row(container, "A"))[5].querySelector(".notes-dot")).not.toBeNull();
  });

  it("with 'Toggle with short press' off, a tap opens the popup and a long press toggles", () => {
    vi.useFakeTimers();
    setPref("pref_short_toggle", false);
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    const { container } = renderList(core);
    tap(cells(row(container, "A"))[5]);
    expect(container.querySelector(".entry-popup")).not.toBeNull();
    expect(core.toggle).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".overlay")!);
    longPress(cells(row(container, "A"))[5]);
    expect(core.toggle).toHaveBeenCalledWith(1, TODAY);
    expect(haptic.fn).toHaveBeenCalledTimes(1);
  });

  it("measurable habits always open the number popup", () => {
    vi.useFakeTimers();
    const core = createFakeCore([fakeHabit({ id: 1, name: "Run", numerical: true, unit: "km", targetValue: 5 })]);
    const { container } = renderList(core);
    tap(cells(row(container, "Run"))[5]);
    expect(core.toggle).not.toHaveBeenCalled();
    expect(haptic.fn).not.toHaveBeenCalled();
    fireEvent.input(container.querySelector(".popup-number input")!, { target: { value: "6" } });
    fireEvent.click(screen.getByText("Save"));
    expect(core.setEntry).toHaveBeenCalledWith(1, TODAY, 6000, "");
    expect(konfetti).toHaveBeenCalledOnce();
    longPress(cells(row(container, "Run"))[4]);
    expect(haptic.fn).toHaveBeenCalledWith("toggle");
    expect(container.querySelector(".popup-number")).not.toBeNull();
  });
});

describe("ListScreen: toolbar and menus", () => {
  it("+ asks for the habit type, then opens the editor", () => {
    const { props } = renderList(createFakeCore());
    fireEvent.click(screen.getByLabelText("Add habit"));
    fireEvent.click(screen.getByText("Measurable"));
    expect(props.onAdd).toHaveBeenCalledWith(true);
    expect(document.querySelector(".type-picker")).toBeNull();
  });

  it("⋮ has Dark theme, Settings and About", () => {
    const { container, props } = renderList(createFakeCore());
    fireEvent.click(screen.getByLabelText("More options"));
    expect([...container.querySelectorAll(".menu-item")].map((m) => m.textContent)).toEqual(["Dark theme", "Settings", "About"]);
    expect(container.querySelector(".menu-item .checkbox.on")).toBeNull();
    fireEvent.click(screen.getByText("Settings"));
    expect(props.onSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("About"));
    expect(props.onAbout).toHaveBeenCalled();
  });

  it("'Dark theme' switches the theme", () => {
    const { container } = renderList(createFakeCore());
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Dark theme"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByLabelText("More options"));
    expect(container.querySelector(".menu-item .checkbox.on")).not.toBeNull();
  });

  it("filters hide archived and completed habits", () => {
    const open = fakeHabit({ name: "Open" });
    const done = fakeHabit({ name: "Done" });
    done.entries.set(TODAY, { value: 2, notes: "" });
    const core = createFakeCore([open, done, fakeHabit({ name: "Old", archived: true })]);
    const { container } = renderList(core);
    expect(names(container)).toEqual(["Open", "Done"]);
    fireEvent.click(screen.getByLabelText("Filter"));
    const items = [...container.querySelectorAll(".menu-item")];
    expect(items.map((i) => i.textContent)).toEqual(["Hide archived", "Hide completed", "Sort"]);
    expect(items[0].querySelector(".checkbox.on")).not.toBeNull();
    expect(items[1].querySelector(".checkbox.on")).toBeNull();
    expect(items[2].querySelector(".menu-arrow")).not.toBeNull();
    fireEvent.click(screen.getByText("Hide archived"));
    expect(core.setShowArchived).toHaveBeenCalledWith(true);
    expect(names(container)).toEqual(["Open", "Done", "Old"]);
    fireEvent.click(screen.getByLabelText("Filter"));
    fireEvent.click(screen.getByText("Hide completed"));
    expect(core.setShowCompleted).toHaveBeenCalledWith(false);
    expect(names(container)).toEqual(["Open", "Old"]);
  });

  it.each([
    ["Manually", "manual"],
    ["By name", "name"],
    ["By color", "color"],
    ["By score", "score"],
    ["By status", "status"],
  ])("Sort → %s", (label, by) => {
    const core = createFakeCore([fakeHabit()]);
    renderList(core);
    fireEvent.click(screen.getByLabelText("Filter"));
    fireEvent.click(screen.getByText("Sort"));
    fireEvent.click(screen.getByText(label));
    expect(core.sortBy).toHaveBeenCalledWith(by);
  });

  it("tapping a name opens the habit", () => {
    const core = createFakeCore([fakeHabit({ id: 7, name: "A" })]);
    const { container, props } = renderList(core);
    const name = row(container, "A").querySelector(".habit-name")!;
    fireEvent.pointerDown(name);
    fireEvent.pointerUp(name);
    expect(props.onOpen).toHaveBeenCalledWith(7);
  });

  it("shows a 'Did you know?' hint until tapped", () => {
    const core = createFakeCore([fakeHabit()]);
    core.state.hints = ["Hint one"];
    const { container } = renderList(core);
    expect(core.nextHint).toHaveBeenCalledOnce();
    expect(core.nextHint.mock.calls[0][0][0]).toMatch(/press-and-hold on the name/);
    expect(container.querySelector(".hint-card")!.textContent).toBe("Did you know?Hint one");
    fireEvent.click(container.querySelector(".hint-card")!);
    expect(container.querySelector(".hint-card")).toBeNull();
  });
});

describe("ListScreen: backup reminder", () => {
  beforeEach(() => localStorage.setItem("backup:firstUse", String(Date.now() - 15 * DAY)));

  it("is shown after 14 days without a backup, only when there are habits", () => {
    const { container, unmount } = renderList(createFakeCore());
    expect(container.querySelector(".banner")).toBeNull();
    unmount();
    const again = renderList(createFakeCore([fakeHabit()]));
    expect(again.container.querySelector(".banner")).not.toBeNull();
  });

  it("'Not now' snoozes it", () => {
    const { container } = renderList(createFakeCore([fakeHabit()]));
    fireEvent.click(screen.getByText("Not now"));
    expect(container.querySelector(".banner")).toBeNull();
    expect(Number(localStorage.getItem("backup:snoozeUntil"))).toBeGreaterThan(Date.now());
  });

  it("'Save a copy' saves a backup and says so", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: () => true, share });
    const { container, props } = renderList(createFakeCore([fakeHabit()]));
    fireEvent.click(screen.getByText("Save a copy"));
    await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Backup saved"));
    expect(share).toHaveBeenCalled();
    expect(container.querySelector(".banner")).toBeNull();
    delete (navigator as { canShare?: unknown }).canShare;
  });

  it("says when the backup failed", async () => {
    const core = createFakeCore([fakeHabit()]);
    core.exportBackup.mockImplementation(() => {
      throw new Error("x");
    });
    const { container, props } = renderList(core);
    fireEvent.click(screen.getByText("Save a copy"));
    await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Could not create the backup"));
    expect(container.querySelector(".banner")).not.toBeNull();
  });
});

describe("ListScreen: selection", () => {
  function select(container: HTMLElement, name: string) {
    const el = row(container, name).querySelector(".habit-name")!;
    fireEvent.pointerDown(el, { clientY: 10 });
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(el, { clientY: 10 });
  }
  const confirm = vi.fn(() => true);
  beforeEach(() => {
    vi.useFakeTimers();
    confirm.mockReset().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
  });

  it("a long press on a name selects it; the toolbar changes", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    const { container, props } = renderList(core);
    select(container, "A");
    expect(haptic.fn).not.toHaveBeenCalled();
    expect(row(container, "A").classList.contains("selected")).toBe(true);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("1");
    expect([...container.querySelectorAll(".topbar-right .bar-button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Edit", "Change color", "More options"]);
    // a tap on another name adds it; Edit is only for one habit
    const b = row(container, "B").querySelector(".habit-name")!;
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(container.querySelector(".topbar-title")!.textContent).toBe("2");
    expect(screen.queryByLabelText("Edit")).toBeNull();
    // and a tap on a selected one removes it
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("1");
    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
  });

  it("Edit opens the editor for the selected habit", () => {
    const core = createFakeCore([fakeHabit({ id: 4, name: "A" })]);
    const { container, props } = renderList(core);
    select(container, "A");
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(props.onEdit).toHaveBeenCalledWith(4);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
  });

  it("changes the colour of all selected habits, palette or custom", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    const { container } = renderList(core);
    select(container, "A");
    select(container, "B");
    fireEvent.click(screen.getByLabelText("Change color"));
    fireEvent.click(container.querySelectorAll(".color-picker .swatches .swatch")[13]);
    expect(core.changeColor).toHaveBeenCalledWith([1, 2], 13, null);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
    select(container, "A");
    fireEvent.click(screen.getByLabelText("Change color"));
    fireEvent.change(container.querySelector(".color-picker input[type=color]")!, { target: { value: "#123456" } });
    expect(core.changeColor).toHaveBeenLastCalledWith([1], 0, "#123456");
  });

  it("the overflow menu archives or unarchives, depending on the selection", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B", archived: true })]);
    core.state.showArchived = true;
    const { container } = renderList(core);
    const menu = () => {
      fireEvent.click(screen.getByLabelText("More options"));
      const items = [...container.querySelectorAll(".menu-item")].map((m) => m.textContent);
      return items;
    };
    select(container, "A");
    expect(menu()).toEqual(["Archive", "Categorize", "Delete"]);
    fireEvent.click(container.querySelector(".menu-overlay")!);
    select(container, "B");
    expect(menu()).toEqual(["Categorize", "Delete"]); // mixed: neither
    fireEvent.click(container.querySelector(".menu-overlay")!);
    fireEvent.click(screen.getByLabelText("Cancel"));
    select(container, "B");
    expect(menu()).toEqual(["Unarchive", "Categorize", "Delete"]);
    fireEvent.click(screen.getByText("Unarchive"));
    expect(core.unarchive).toHaveBeenCalledWith([2]);
    select(container, "A");
    menu();
    fireEvent.click(screen.getByText("Archive"));
    expect(core.archive).toHaveBeenCalledWith([1]);
  });

  it("deletes after confirming, with the right wording", () => {
    confirm.mockReturnValue(false);
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    const { container } = renderList(core);
    select(container, "A");
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Delete"));
    expect(confirm).toHaveBeenLastCalledWith("Delete this habit? This cannot be undone.");
    expect(core.delete).not.toHaveBeenCalled();
    select(container, "B");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Delete"));
    expect(confirm).toHaveBeenLastCalledWith("Delete 2 habits? This cannot be undone.");
    expect(core.delete).toHaveBeenCalledWith([1, 2]);
    expect(names(container)).toEqual([]);
  });

  it("Categorize suggests existing categories and starts from the selection's", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A", category: "Mind" }), fakeHabit({ id: 2, name: "B", category: "Body" }), fakeHabit({ id: 3, name: "C" })]);
    const { container } = renderList(core);
    select(container, "C");
    select(container, "A");
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Categorize"));
    expect(container.querySelector(".dialog-title")!.textContent).toBe("Categorize");
    const input = container.querySelector(".dialog-input") as HTMLInputElement;
    expect(input.value).toBe("Mind");
    expect([...container.querySelectorAll(".category-dialog .chip")].map((c) => c.textContent)).toEqual(["Body", "Mind"]);
    fireEvent.click(screen.getByText("Body", { selector: ".chip" }));
    expect(input.value).toBe("Body");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(core.changeCategory).toHaveBeenCalledWith([3, 1], "Body");
    expect(container.querySelector(".category-dialog")).toBeNull();
  });

  it("Cancel in the category dialog changes nothing", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    const { container } = renderList(core);
    select(container, "A");
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Categorize"));
    fireEvent.click(screen.getByText("Cancel", { selector: ".dialog-buttons button" }));
    expect(core.changeCategory).not.toHaveBeenCalled();
    expect(container.querySelector(".category-dialog")).toBeNull();
  });

  it("a long press on a category header renames it; a tap does nothing", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A", category: "Mind" })]);
    const { container } = renderList(core);
    const header = container.querySelector(".category-header")!;
    tap(header);
    expect(container.querySelector(".category-dialog")).toBeNull();
    longPress(header);
    expect(haptic.fn).toHaveBeenCalledWith("toggle");
    expect(container.querySelector(".dialog-title")!.textContent).toBe("Rename category");
    fireEvent.input(container.querySelector(".dialog-input")!, { target: { value: "Brain" } });
    fireEvent.click(screen.getByText("Save"));
    expect(core.renameCategory).toHaveBeenCalledWith("Mind", "Brain");
    expect(container.querySelector(".category-header")!.textContent).toBe("Brain");
  });

  it("renaming a category to nothing is ignored", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A", category: "Mind" })]);
    const { container } = renderList(core);
    longPress(container.querySelector(".category-header")!);
    fireEvent.input(container.querySelector(".dialog-input")!, { target: { value: "  " } });
    fireEvent.click(screen.getByText("Save"));
    expect(core.renameCategory).not.toHaveBeenCalled();
  });

  it("hides the banner and hint while selecting", () => {
    localStorage.setItem("backup:firstUse", String(Date.now() - 15 * DAY));
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    core.state.hints = ["h"];
    const { container } = renderList(core);
    expect(container.querySelector(".banner")).not.toBeNull();
    select(container, "A");
    expect(container.querySelector(".banner")).toBeNull();
    expect(container.querySelector(".hint-card")).toBeNull();
  });
});

describe("ListScreen: drag to reorder", () => {
  const rect = (top: number) => ({ top, height: 56, bottom: top + 56, left: 0, right: 400, width: 400, x: 0, y: top, toJSON() {} }) as DOMRect;
  function layout(container: HTMLElement) {
    [...container.querySelectorAll(".habit-row")].forEach((r, i) => vi.spyOn(r, "getBoundingClientRect").mockReturnValue(rect(100 + i * 59)));
  }
  beforeEach(() => vi.useFakeTimers());

  it("drags a habit to a new place in manual order", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" }), fakeHabit({ id: 3, name: "C" })]);
    const { container } = renderList(core);
    layout(container);
    const name = row(container, "C").querySelector(".habit-name")!;
    fireEvent.pointerDown(name, { clientY: 250 });
    act(() => void vi.advanceTimersByTime(500));
    expect(row(container, "C").classList.contains("dragging")).toBe(true);
    expect(row(container, "A").classList.contains("shifting")).toBe(true);
    fireEvent.pointerMove(name, { clientY: 140 });
    // C moved up 110 px: rows A and B make room
    expect(row(container, "C").style.transform).toBe("translateY(-110px)");
    expect(row(container, "A").style.transform).toBe("translateY(59px)");
    expect(row(container, "B").style.transform).toBe("translateY(59px)");
    fireEvent.pointerUp(name, { clientY: 140 });
    expect(core.move).toHaveBeenCalledWith(3, 1, true);
    expect(names(container)).toEqual(["C", "A", "B"]);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
  });

  it("dropping in the same place changes nothing", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    const { container } = renderList(core);
    layout(container);
    const name = row(container, "A").querySelector(".habit-name")!;
    fireEvent.pointerDown(name, { clientY: 120 });
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerMove(name, { clientY: 130 });
    fireEvent.pointerUp(name, { clientY: 130 });
    expect(core.move).not.toHaveBeenCalled();
    expect(container.querySelector(".topbar-title")!.textContent).toBe("1"); // still selected
  });

  it("does not drag when sorted by name, only selects", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    core.state.order = "BY_NAME_ASC";
    const { container } = renderList(core);
    layout(container);
    const name = row(container, "B").querySelector(".habit-name")!;
    fireEvent.pointerDown(name, { clientY: 180 });
    act(() => void vi.advanceTimersByTime(500));
    expect(row(container, "B").classList.contains("dragging")).toBe(false);
    fireEvent.pointerMove(name, { clientY: 100 });
    fireEvent.pointerUp(name, { clientY: 100 });
    expect(core.move).not.toHaveBeenCalled();
    expect(container.querySelector(".topbar-title")!.textContent).toBe("1");
  });

  it("moving the finger before the long press is a scroll, not a drag", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    const { container, props } = renderList(core);
    const name = row(container, "A").querySelector(".habit-name")!;
    fireEvent.pointerDown(name, { clientY: 120 });
    fireEvent.pointerMove(name, { clientY: 140 });
    act(() => void vi.advanceTimersByTime(600));
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Alichka Habits 🩵");
    fireEvent.pointerCancel(name);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("stops the page from scrolling only while dragging", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" }), fakeHabit({ id: 2, name: "B" })]);
    const { container } = renderList(core);
    layout(container);
    const touch = () => {
      const e = new Event("touchmove", { cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(touch()).toBe(false);
    const name = row(container, "A").querySelector(".habit-name")!;
    fireEvent.pointerDown(name, { clientY: 120 });
    act(() => void vi.advanceTimersByTime(500));
    expect(touch()).toBe(true);
    fireEvent.pointerCancel(name);
    expect(touch()).toBe(false);
  });
});

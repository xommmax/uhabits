import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const haptic = vi.hoisted(() => vi.fn());
vi.mock("../../src/haptics", () => ({ haptic, canVibrate: true }));
vi.mock("../../src/confetti", () => ({ konfetti: vi.fn() }));

import { HabitScreen } from "../../src/HabitScreen";
import type { HabitsCore } from "../../src/core";
import { createFakeCore, fakeHabit, type FakeCore, TODAY } from "./fake-core";

function renderHabit(core: FakeCore, id: number) {
  const props = { core: core as unknown as HabitsCore, id, rev: 0, refresh: vi.fn(), toast: vi.fn(), onBack: vi.fn(), onEdit: vi.fn() };
  let rev = 0;
  const result = render(<HabitScreen {...props} />);
  props.refresh.mockImplementation(() => result.rerender(<HabitScreen {...props} rev={++rev} />));
  return { ...result, props };
}
const cardTitles = (c: HTMLElement) => [...c.querySelectorAll(".card h2")].map((h) => h.textContent);
const confirm = vi.fn(() => true);
beforeEach(() => {
  confirm.mockReset().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
});
afterEach(() => vi.unstubAllGlobals());

describe("HabitScreen: yes-or-no habit", () => {
  const habit = () => fakeHabit({ id: 1, name: "Read", question: "Did you read?", description: "20 pages", freqNum: 3, freqDen: 7, category: "Mind", score: 0.456, colorLight: "#1976d2" });

  it("shows Android's cards in Android's order", () => {
    const { container } = renderHabit(createFakeCore([habit()]), 1);
    expect(cardTitles(container)).toEqual(["Overview", "Calendar", "Score", "History", "Best streaks", "Frequency"]);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Read");
    expect((container.querySelector(".topbar") as HTMLElement).style.background).toMatch(/#1976d2|rgb\(25, 118, 210\)/);
  });

  it("shows question, frequency, category and notes", () => {
    const { container } = renderHabit(createFakeCore([habit()]), 1);
    expect(container.querySelector(".question")!.textContent).toBe("Did you read?");
    expect(container.querySelector(".subtitle-row")!.textContent).toContain("3 times per week");
    expect(container.querySelector(".subtitle-row")!.textContent).toContain("Mind");
    expect(container.querySelector(".notes")!.textContent).toBe("20 pages");
    expect(container.querySelector(".subtitle .muted")).toBeNull();
  });

  it("overview: score, signed month/year changes and total", () => {
    const h = habit();
    h.entries.set(TODAY, { value: 2, notes: "" });
    h.entries.set(TODAY - 1, { value: 2, notes: "" });
    const { container } = renderHabit(createFakeCore([h]), 1);
    // fake core: month +0.1, year −0.25
    expect([...container.querySelectorAll(".overview-value")].map((v) => v.textContent)).toEqual(["46%", "+10%", "−25%", "2"]);
    const values = container.querySelectorAll(".overview-value") as NodeListOf<HTMLElement>;
    expect(values[2].style.color).toBe("var(--muted)"); // a drop is grey, like Android
  });

  it("draws every chart in the theme, and hides streaks without any", () => {
    const core = createFakeCore([habit()]);
    renderHabit(core, 1);
    expect(core.historyChart).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1, false, 0);
    expect(core.scoreChart).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1, false, 0);
    expect(core.barChart).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1, false, 1);
    expect(core.streakChart).toHaveBeenCalled();
    expect(core.frequencyChart).toHaveBeenCalled();
    expect(core.targetChart).not.toHaveBeenCalled();
    core.habitDetail.mockImplementation((id: number) => ({ ...createFakeCore([habit()]).habitDetail(id), streakCount: 0 }));
    const again = renderHabit(core, 1);
    expect(cardTitles(again.container)).not.toContain("Best streaks");
  });

  it("score and history periods use Android's spinners and are remembered by core", () => {
    const core = createFakeCore([habit()]);
    const { container } = renderHabit(core, 1);
    const spinners = container.querySelectorAll(".spinner");
    expect(spinners[0].textContent).toBe("Day");
    expect(spinners[1].textContent).toBe("Month"); // bar spinner 1 of Week, Month, Quarter, Year
    fireEvent.click(spinners[0]);
    expect([...container.querySelectorAll(".spinner-item")].map((i) => i.textContent)).toEqual(["Day", "Week", "Month", "Quarter", "Year"]);
    fireEvent.click(screen.getByText("Quarter", { selector: ".spinner-item" }));
    expect(core.scoreChart).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 1, false, 3);
    fireEvent.click(container.querySelectorAll(".spinner")[1]);
    expect([...container.querySelectorAll(".spinner-item")].map((i) => i.textContent)).toEqual(["Week", "Month", "Quarter", "Year"]);
    fireEvent.click(screen.getByText("Year", { selector: ".spinner-item" }));
    expect(core.barChart).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 1, false, 3);
  });

  it("the calendar's Edit opens the big editable calendar; Done closes it", () => {
    const core = createFakeCore([habit()]);
    const { container } = renderHabit(core, 1);
    fireEvent.click(screen.getByText("Edit", { selector: ".card-action" }));
    expect(container.querySelector(".history-editor canvas")).not.toBeNull();
    expect(core.historyChart).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 1, false, 10);
    fireEvent.click(screen.getByText("Done"));
    expect(container.querySelector(".history-editor")).toBeNull();
  });

  it("a day changed in the calendar ticks and refreshes; a popup request opens the check-in popup", () => {
    const core = createFakeCore([habit()]);
    const { container, props } = renderHabit(core, 1);
    const chart = core.historyChart.mock.results[0].value;
    const onEdited = chart.setOnEdited.mock.calls[0][0];
    act(() => onEdited());
    expect(haptic).toHaveBeenCalledWith("key");
    expect(props.refresh).toHaveBeenCalled();
    const latest = core.historyChart.mock.results.at(-1)!.value;
    act(() => latest.setOnPopup.mock.calls[0][0](TODAY - 2));
    expect(haptic).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".entry-popup")).not.toBeNull();
    fireEvent.click(container.querySelectorAll(".entry-popup .popup-glyph")[0]);
    expect(core.setEntry).toHaveBeenCalledWith(1, TODAY - 2, 2, "");
  });

  it("menu: export CSV of this habit", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: () => true, share });
    const core = createFakeCore([habit()]);
    renderHabit(core, 1);
    fireEvent.click(screen.getByLabelText("More options"));
    expect([...document.querySelectorAll(".menu-item")].map((m) => m.textContent)).toEqual(["Export", "Archive", "Delete"]);
    fireEvent.click(screen.getByText("Export"));
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    expect(core.exportCsv).toHaveBeenCalledWith([1]);
    delete (navigator as { canShare?: unknown }).canShare;
  });

  it("menu: a failed export says so", async () => {
    const core = createFakeCore([habit()]);
    core.exportCsv.mockRejectedValue(new Error("x"));
    const { props } = renderHabit(core, 1);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Export"));
    await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Could not export. Please try again."));
  });

  it("menu: archive goes back to the list", () => {
    const core = createFakeCore([habit()]);
    const { props } = renderHabit(core, 1);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Archive"));
    expect(core.archive).toHaveBeenCalledWith([1]);
    expect(props.onBack).toHaveBeenCalled();
  });

  it("menu: an archived habit says so and can be unarchived in place", () => {
    const core = createFakeCore([{ ...habit(), archived: true }]);
    const { container, props } = renderHabit(core, 1);
    expect(container.querySelector(".subtitle .muted")!.textContent).toBe("Archived");
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Unarchive"));
    expect(core.unarchive).toHaveBeenCalledWith([1]);
    expect(props.onBack).not.toHaveBeenCalled();
    expect(container.querySelector(".subtitle .muted")).toBeNull();
  });

  it("menu: delete asks first", () => {
    const core = createFakeCore([habit()]);
    const { props, unmount } = renderHabit(core, 1);
    props.onBack.mockImplementation(() => unmount()); // App leaves the screen in the same update
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Delete"));
    expect(confirm).toHaveBeenCalledWith('Delete "Read"? This cannot be undone.');
    expect(core.delete).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Delete"));
    expect(core.delete).toHaveBeenCalledWith([1]);
    expect(props.onBack).toHaveBeenCalled();
  });

  it("Edit and Back", () => {
    const { props } = renderHabit(createFakeCore([habit()]), 1);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(props.onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("a swipe from the left edge goes back, like iOS", () => {
    const { container, props } = renderHabit(createFakeCore([habit()]), 1);
    const el = container.querySelector(".screen")!;
    const swipe = (from: number, to: number) => {
      fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 300 }] });
      fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: 300 }] });
    };
    swipe(100, 300); // not from the edge
    swipe(10, 60); // too short
    expect(props.onBack).not.toHaveBeenCalled();
    swipe(10, 120);
    expect(props.onBack).toHaveBeenCalledOnce();
  });
});

describe("HabitScreen: measurable habit", () => {
  const habit = () => fakeHabit({ id: 2, name: "Run", numerical: true, unit: "km", targetValue: 5, targetType: 0 });

  it("has Calendar and Target first, no Overview, and Android's numerical spinner", () => {
    const core = createFakeCore([habit()]);
    const { container } = renderHabit(core, 2);
    expect(cardTitles(container)).toEqual(["Calendar", "Target", "Score", "History", "Best streaks", "Frequency"]);
    expect(core.targetChart).toHaveBeenCalled();
    fireEvent.click(container.querySelectorAll(".spinner")[1]);
    expect([...container.querySelectorAll(".spinner-item")].map((i) => i.textContent)).toEqual(["Day", "Week", "Month", "Quarter", "Year"]);
  });

  it("shows the target with an arrow for at least / at most", () => {
    const { container } = renderHabit(createFakeCore([habit()]), 2);
    expect(container.querySelector(".subtitle-row")!.textContent).toContain(" 5 km");
    const atMost = renderHabit(createFakeCore([{ ...habit(), id: 3, targetType: 1, targetValue: 1.5 }]), 3);
    expect(atMost.container.querySelector(".subtitle-row")!.textContent).toContain(" 1.5 km");
  });

  it("the target card's height follows its rows", () => {
    const { container } = renderHabit(createFakeCore([habit()]), 2);
    const target = [...container.querySelectorAll(".card")].find((c) => c.querySelector("h2")?.textContent === "Target")!;
    expect((target.querySelector("canvas") as HTMLElement).style.height).toBe("100px"); // 5 rows × 20 dp
  });
});

describe("HabitScreen: dark theme", () => {
  it("uses the dark colours and asks core for dark charts", () => {
    localStorage.setItem("pref:pref_theme", "1");
    const core = createFakeCore([fakeHabit({ id: 1, colorLight: "#1976d2", colorDark: "#90caf9" })]);
    const { container } = renderHabit(core, 1);
    expect((container.querySelector(".card h2") as HTMLElement).style.color).toMatch(/#90caf9|rgb\(144, 202, 249\)/);
    expect(core.scoreChart).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 1, true, 0);
    // The toolbar keeps the light colour, like Android's habit screen
    expect((container.querySelector(".topbar") as HTMLElement).style.background).toMatch(/#1976d2|rgb\(25, 118, 210\)/);
  });
});

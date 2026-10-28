import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/haptics", () => ({ haptic: vi.fn(), canVibrate: true }));
vi.mock("../../src/confetti", () => ({ konfetti: vi.fn() }));

import { App } from "../../src/App";
import { AboutScreen } from "../../src/AboutScreen";
import { Intro } from "../../src/Intro";
import type { HabitsCore } from "../../src/core";
import { createFakeCore, fakeHabit, type FakeCore, TODAY } from "./fake-core";

const title = () => document.querySelector(".topbar-title")!.textContent;
const renderApp = (core: FakeCore) => render(<App core={core as unknown as HabitsCore} />);

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 411, configurable: true });
  localStorage.setItem("pref:pref_checkmark_reverse_order", "true");
  localStorage.setItem("pref:pref_short_toggle", "true");
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Intro", () => {
  it("walks through Android's three slides", () => {
    const onDone = vi.fn();
    const { container } = render(<Intro onDone={onDone} />);
    const slide = () => [container.querySelector("h1")!.textContent, (container.querySelector(".intro") as HTMLElement).style.background];
    expect(slide()[0]).toBe("Welcome");
    expect(container.querySelectorAll(".intro-dots span")).toHaveLength(3);
    expect(container.querySelector(".intro-dots .active")).toBe(container.querySelectorAll(".intro-dots span")[0]);
    fireEvent.click(screen.getByText("Next"));
    expect(slide()[0]).toBe("Create some new habits");
    fireEvent.click(screen.getByText("Next"));
    expect(slide()[0]).toBe("Track your progress");
    expect(screen.queryByText("Next")).toBeNull();
    expect(screen.queryByText("Skip")).toBeNull();
    fireEvent.click(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("can be skipped", () => {
    const onDone = vi.fn();
    render(<Intro onDone={onDone} />);
    fireEvent.click(screen.getByText("Skip"));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("AboutScreen", () => {
  it("shows the build, the credit line and Android's links and developers", () => {
    const onBack = vi.fn();
    const { container } = render(<AboutScreen onBack={onBack} />);
    const lines = [...container.querySelectorAll(".about-header .muted")].map((l) => l.textContent);
    expect(lines[0]).toMatch(/^Version 9\.9\.9 \(abc1234\) · built Oct 28, 2026/);
    expect(lines[1]).toBe("by Masichek with Love");
    expect(lines[2]).toMatch(/iPhone web version/);
    const links = [...container.querySelectorAll("a.link")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("target")]);
    expect(links).toContainEqual(["View source code at GitHub", "https://github.com/iSoron/uhabits", "_blank"]);
    expect(links).toContainEqual(["View privacy policy", "https://loophabits.org/privacy", "_blank"]);
    expect(links).toHaveLength(5);
    expect(container.textContent).toContain("Álinson S. Xavier (@iSoron)");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("App", () => {
  it("shows the intro on the very first run only", () => {
    const core = createFakeCore();
    core.state.firstRun = true;
    const { container, unmount } = renderApp(core);
    expect(container.querySelector(".intro")).not.toBeNull();
    fireEvent.click(screen.getByText("Skip"));
    expect(container.querySelector(".intro")).toBeNull();
    unmount();
    const again = renderApp(core);
    expect(again.container.querySelector(".intro")).toBeNull();
  });

  it("navigates list → habit → edit → habit → list", () => {
    const core = createFakeCore([fakeHabit({ id: 1, name: "Read" })]);
    renderApp(core);
    expect(title()).toBe("Alichka Habits 🩵");
    const name = document.querySelector(".habit-name")!;
    fireEvent.pointerDown(name);
    fireEvent.pointerUp(name);
    expect(title()).toBe("Read");
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(title()).toBe("Edit habit");
    fireEvent.input(document.querySelector(".field-input")!, { target: { value: "Read more" } });
    fireEvent.click(screen.getByText("Save", { selector: ".outlined-button" }));
    expect(title()).toBe("Read more");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(title()).toBe("Alichka Habits 🩵");
  });

  it("creating a habit returns to the list, which shows it", () => {
    const core = createFakeCore();
    renderApp(core);
    fireEvent.click(screen.getByLabelText("Add habit"));
    fireEvent.click(screen.getByText("Yes or No"));
    expect(title()).toBe("Create habit");
    fireEvent.input(document.querySelector(".field-input")!, { target: { value: "Walk" } });
    fireEvent.click(screen.getByText("Save", { selector: ".outlined-button" }));
    expect(title()).toBe("Alichka Habits 🩵");
    expect(document.querySelector(".habit-name")!.textContent).toBe("Walk");
  });

  it("creating a measurable habit opens the measurable form", () => {
    renderApp(createFakeCore());
    fireEvent.click(screen.getByLabelText("Add habit"));
    fireEvent.click(screen.getByText("Measurable"));
    expect(screen.getByText("Unit")).not.toBeNull();
  });

  it("selection Edit opens the editor and returns to the habit", () => {
    vi.useFakeTimers();
    const core = createFakeCore([fakeHabit({ id: 3, name: "Gym" })]);
    renderApp(core);
    const name = document.querySelector(".habit-name")!;
    fireEvent.pointerDown(name);
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(name);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(title()).toBe("Edit habit");
    fireEvent.click(screen.getByText("Save", { selector: ".outlined-button" }));
    expect(title()).toBe("Gym");
  });

  it("About goes back to where it was opened from", () => {
    renderApp(createFakeCore());
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("About"));
    expect(title()).toBe("About");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(title()).toBe("Alichka Habits 🩵");
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Settings"));
    expect(title()).toBe("Settings");
    fireEvent.click(screen.getByText("About"));
    expect(title()).toBe("About");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(title()).toBe("Settings");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(title()).toBe("Alichka Habits 🩵");
  });

  it("shows a toast for 2.5 s", () => {
    vi.useFakeTimers();
    const core = createFakeCore();
    renderApp(core);
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Settings"));
    fireEvent.click(screen.getByText("Repair database"));
    expect(document.querySelector(".toast")!.textContent).toBe("Database repaired");
    act(() => void vi.advanceTimersByTime(2499));
    expect(document.querySelector(".toast")).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(document.querySelector(".toast")).toBeNull();
  });

  it("checks the date every minute and when the app comes back, and redraws when the day changed", () => {
    vi.useFakeTimers();
    const core = createFakeCore([fakeHabit({ id: 1, name: "A" })]);
    renderApp(core);
    const label = () => document.querySelectorAll(".list-header .day-label")[5].textContent;
    expect(label()).toBe("WED28");
    act(() => void vi.advanceTimersByTime(60_000));
    expect(core.refreshToday).toHaveBeenCalledTimes(1);
    core.state.today = TODAY + 1;
    core.refreshToday.mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(core.refreshToday).toHaveBeenCalledTimes(2);
    expect(label()).toBe("THU29");
  });

  it("stops checking the date after it is closed", () => {
    vi.useFakeTimers();
    const core = createFakeCore();
    const { unmount } = renderApp(core);
    unmount();
    vi.advanceTimersByTime(120_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(core.refreshToday).not.toHaveBeenCalled();
  });
});

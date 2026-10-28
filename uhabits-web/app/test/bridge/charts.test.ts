// Charts (ChartHandle.kt, AndroidCharts.kt) drawn by the real core on a recording canvas.
import { describe, expect, it, vi } from "vitest";
import { Entry, fakeCanvas, type FakeCanvas, form, openCore, setPref } from "./helpers";

type Handle = { draw(): void; click(x: number, y: number): void; longClick(x: number, y: number): void; scrollBy(c: number): boolean; columnWidth: number; setOnEdited(cb: () => void): void; setOnPopup(cb: (day: number) => void): void };
const as = (c: FakeCanvas) => c as unknown as HTMLCanvasElement;

async function habitWithData(numerical = false) {
  const core = await openCore();
  const id = core.saveHabit(form(numerical ? { name: "Run", numerical: true, unit: "km", targetValue: 5 } : { name: "Read", colorIndex: 11 }));
  const t = core.today();
  for (let i = 0; i < 400; i++) if (i % 3) core.setEntry(id, t - i, numerical ? 1000 * (i % 7) : Entry.YES_MANUAL, "");
  return { core, id, t };
}

describe("every chart draws, light and dark", () => {
  const charts: [string, (core: Awaited<ReturnType<typeof openCore>>, c: HTMLCanvasElement, id: number, dark: boolean) => Handle][] = [
    ["history", (core, c, id, dark) => core.historyChart(c, id, dark, 0) as unknown as Handle],
    ["bar", (core, c, id, dark) => core.barChart(c, id, dark, 1) as unknown as Handle],
    ["score", (core, c, id, dark) => core.scoreChart(c, id, dark, 0) as unknown as Handle],
    ["frequency", (core, c, id, dark) => core.frequencyChart(c, id, dark) as unknown as Handle],
    ["streak", (core, c, id, dark) => core.streakChart(c, id, dark) as unknown as Handle],
    ["target", (core, c, id, dark) => core.targetChart(c, id, dark) as unknown as Handle],
  ];
  it.each(charts.flatMap(([name, make]) => [false, true].map((dark) => [name, dark, make] as const)))("%s chart (dark %s)", async (name, dark, make) => {
    const { core, id } = await habitWithData(name === "target");
    const canvas = fakeCanvas(360, 200);
    const handle = make(core, as(canvas), id, dark);
    handle.draw();
    // sized for the device pixel ratio (2 in these tests)
    expect([canvas.width, canvas.height]).toEqual([720, 400]);
    expect(canvas.calls.length).toBeGreaterThan(10);
  });

  it("draws with the habit's colour, or its custom colour", async () => {
    const { core, id } = await habitWithData();
    const strokes = () => {
      const canvas = fakeCanvas(360, 200);
      const seen: string[] = [];
      Object.defineProperty(canvas.getContext(), "strokeStyle", { set: (v: string) => seen.push(v), get: () => seen.at(-1), configurable: true });
      (core.scoreChart(as(canvas), id, false, 0) as unknown as Handle).draw();
      return seen;
    };
    expect(strokes()).toContain("rgba(25,118,210,1)"); // palette colour 11
    core.changeColor([id], 0, "#FF69B4");
    expect(strokes()).toContain("rgba(255,105,180,1)");
  });
});

describe("scrolling", () => {
  it("scrolls back in whole columns, never past today", async () => {
    const { core, id } = await habitWithData();
    const canvas = fakeCanvas(360, 200);
    const handle = core.barChart(as(canvas), id, false, 0) as unknown as Handle;
    handle.draw();
    expect(handle.columnWidth).toBeGreaterThan(0);
    expect(handle.scrollBy(-1)).toBe(false); // already at today
    expect(handle.scrollBy(3)).toBe(true);
    expect(handle.scrollBy(-2)).toBe(true);
    expect(handle.scrollBy(-5)).toBe(true); // clamped at today
    expect(handle.scrollBy(-1)).toBe(false);
  });

  it("charts that don't scroll say so", async () => {
    const { core, id } = await habitWithData();
    const handle = core.streakChart(as(fakeCanvas(360, 100)), id, false) as unknown as Handle;
    handle.draw();
    expect(handle.columnWidth).toBe(0);
    expect(handle.scrollBy(1)).toBe(false);
  });

  it("the scrolled chart shows older labels", async () => {
    const { core, id } = await habitWithData();
    const canvas = fakeCanvas(360, 200);
    const handle = core.barChart(as(canvas), id, false, 1) as unknown as Handle;
    handle.draw();
    const before = [...canvas.texts];
    canvas.texts.length = 0;
    handle.scrollBy(6);
    expect(canvas.texts).not.toEqual(before);
  });
});

describe("spinners are remembered like on Android", () => {
  it("score and bar periods are stored in preferences and come back in habitDetail", async () => {
    const { core, id } = await habitWithData();
    core.scoreChart(as(fakeCanvas(10, 10)), id, false, 3);
    core.barChart(as(fakeCanvas(10, 10)), id, false, 2);
    expect(core.habitDetail(id)).toMatchObject({ scoreSpinner: 3, barSpinner: 2 });
    expect(localStorage.getItem("pref:pref_score_view_interval")).toBe("3");
  });

  it("measurable habits remember their own bar period", async () => {
    const { core } = await habitWithData();
    const yes = core.saveHabit(form({ name: "Y" }));
    const num = core.saveHabit(form({ name: "N", numerical: true, targetValue: 1 }));
    core.barChart(as(fakeCanvas(10, 10)), yes, false, 1);
    core.barChart(as(fakeCanvas(10, 10)), num, false, 4);
    expect(core.habitDetail(yes).barSpinner).toBe(1);
    expect(core.habitDetail(num).barSpinner).toBe(4);
  });
});

describe("calendar (HistoryChart) presses", () => {
  /** Finds where a day is drawn by long-pressing every square until the popup callback reports it. */
  function locate(handle: Handle, wanted: number, width: number, height: number): [number, number] {
    let found: number | null = null;
    handle.setOnPopup((day) => (found = day));
    for (let x = width - 2; x > 0; x -= 4) {
      for (let y = 2; y < height; y += 4) {
        found = null;
        handle.longClick(x, y);
        if (found === wanted) return [x, y];
      }
    }
    throw new Error(`day ${wanted} not found`);
  }

  it("with short toggle on, a tap toggles the day and a long press asks for the popup", async () => {
    setPref("pref_short_toggle", true);
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    const canvas = fakeCanvas(360, 160);
    const handle = core.historyChart(as(canvas), id, false, 0) as unknown as Handle;
    handle.draw();
    const [x, y] = locate(handle, t, 360, 160);
    expect(core.entry(id, t).value).toBe(Entry.UNKNOWN); // long presses changed nothing
    const edited = vi.fn();
    handle.setOnEdited(edited);
    handle.click(x, y);
    expect(core.entry(id, t).value).toBe(Entry.YES_MANUAL);
    expect(edited).toHaveBeenCalledOnce();
    handle.click(x, y);
    expect(core.entry(id, t).value).toBe(Entry.NO);
  });

  it("with short toggle off, a tap asks for the popup and a long press toggles", async () => {
    setPref("pref_short_toggle", false);
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    const handle = core.historyChart(as(fakeCanvas(360, 160)), id, false, 0) as unknown as Handle;
    handle.draw();
    let popup: number | null = null;
    handle.setOnPopup((d) => (popup = d));
    // find today's square with taps (which only ask for the popup now)
    let at: [number, number] | null = null;
    for (let x = 358; x > 0 && !at; x -= 4) for (let y = 2; y < 160 && !at; y += 4) {
      popup = null;
      handle.click(x, y);
      if (popup === t) at = [x, y];
    }
    expect(at).not.toBeNull();
    expect(core.entry(id, t).value).toBe(Entry.UNKNOWN);
    handle.longClick(...at!);
    expect(core.entry(id, t).value).toBe(Entry.YES_MANUAL);
  });

  it("measurable habits always ask for the popup", async () => {
    setPref("pref_short_toggle", true);
    const core = await openCore();
    const id = core.saveHabit(form({ numerical: true, targetValue: 3 }));
    const t = core.today();
    const handle = core.historyChart(as(fakeCanvas(360, 160)), id, false, 0) as unknown as Handle;
    handle.draw();
    const [x, y] = locate(handle, t, 360, 160);
    let popup: number | null = null;
    handle.setOnPopup((d) => (popup = d));
    handle.click(x, y);
    expect(popup).toBe(t);
    expect(core.entry(id, t).value).toBe(Entry.UNKNOWN);
  });

  it("the toggle follows the skip and question-mark settings", async () => {
    setPref("pref_short_toggle", true);
    setPref("pref_skip_enabled", true);
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    const handle = core.historyChart(as(fakeCanvas(360, 160)), id, false, 0) as unknown as Handle;
    handle.draw();
    const [x, y] = locate(handle, t - 1, 360, 160);
    handle.click(x, y);
    handle.click(x, y);
    expect(core.entry(id, t - 1).value).toBe(Entry.SKIP);
  });

  it("future days can't be pressed", async () => {
    setPref("pref_short_toggle", true); // long press = popup, which reports the day without changing it
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    const handle = core.historyChart(as(fakeCanvas(360, 160)), id, false, 0) as unknown as Handle;
    handle.draw();
    const days = new Set<number>();
    handle.setOnPopup((d) => days.add(d));
    for (let x = 1; x < 360; x += 6) for (let y = 1; y < 160; y += 6) handle.longClick(x, y);
    expect(Math.max(...days)).toBe(t);
    expect(days.size).toBeGreaterThan(50);
  });
});

describe("chart content", () => {
  it("the streak chart lists the best streaks with their lengths", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    for (let i = 0; i < 5; i++) core.setEntry(id, t - i, Entry.YES_MANUAL, "");
    for (let i = 10; i < 13; i++) core.setEntry(id, t - i, Entry.YES_MANUAL, "");
    const canvas = fakeCanvas(360, 40);
    const handle = core.streakChart(as(canvas), id, false) as unknown as Handle;
    handle.draw();
    expect(canvas.texts).toContain("5");
    expect(canvas.texts).toContain("3");
  });

  it("the target chart shows today's, this week's … progress against the target", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ numerical: true, unit: "km", targetValue: 5 }));
    core.setEntry(id, core.today(), 2500, "");
    const canvas = fakeCanvas(360, 100);
    const handle = core.targetChart(as(canvas), id, false) as unknown as Handle;
    handle.draw();
    const text = canvas.texts.join(" | ");
    expect(text).toMatch(/Today/);
    expect(text).toMatch(/2\.5/);
  });
});

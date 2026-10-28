// The HabitsCore API (HabitsCore.kt) on the real Kotlin core: what the screens rely on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Entry, form, openCore, query, setPref, userVersion } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("opening the database", () => {
  it("creates a new database at core's version 26, with no habits", async () => {
    const core = await openCore();
    const bytes = core.snapshot();
    expect(userVersion(bytes)).toBe(26);
    expect(await query(bytes, "SELECT count(*) FROM Habits")).toEqual([[0]]);
    expect(core.listOptions()).toEqual({ showArchived: false, showCompleted: true, order: "BY_POSITION", hasHabits: false });
  });

  it("reopens its own snapshot with the same habits and check-ins", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ name: "Read" }));
    core.setEntry(id, core.today(), Entry.YES_MANUAL, "note");
    const again = await openCore(core.snapshot());
    expect(again.listHabits("", 1, 0).map((h) => [h.name, h.values[0], h.notes[0]])).toEqual([["Read", 2, "note"]]);
  });

  it("migrates an older (v25) database when opening it", async () => {
    const core = await openCore();
    core.saveHabit(form({ name: "Old" }));
    const v25 = core.exportBackup(false);
    expect(userVersion(v25)).toBe(25);
    const reopened = await openCore(v25);
    expect(userVersion(reopened.snapshot())).toBe(26);
    expect(reopened.listHabits("", 1, 0).map((h) => h.name)).toEqual(["Old"]);
  });

  it("keeps working after a snapshot (sql.js export frees prepared statements)", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    for (let i = 0; i < 5; i++) {
      core.snapshot();
      core.setEntry(id, core.today() - i, Entry.YES_MANUAL, "");
      expect(core.listHabits("", 5, 0)[0].values[i]).toBe(Entry.YES_MANUAL);
    }
    expect(core.habitDetail(id).totalCount).toBe(5);
  });

  it("reports writes, and only writes", async () => {
    const core = await openCore();
    const onWrite = vi.fn();
    core.setOnWrite(onWrite);
    core.listHabits("", 7, 0);
    core.listOptions();
    expect(onWrite).not.toHaveBeenCalled();
    const id = core.saveHabit(form());
    expect(onWrite).toHaveBeenCalled();
    onWrite.mockClear();
    core.habitDetail(id);
    expect(onWrite).not.toHaveBeenCalled();
    core.toggle(id, core.today());
    expect(onWrite).toHaveBeenCalled();
  });
});

describe("creating and editing habits", () => {
  it("stores every field of the form", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ name: "Run", question: "Did you run?", description: "Slowly", colorIndex: 3, freqNum: 3, freqDen: 7, category: " Body ", numerical: true, unit: "km", targetValue: 5.5, targetType: 1 }));
    const d = core.habitDetail(id);
    expect(d).toMatchObject({
      id, name: "Run", question: "Did you run?", description: "Slowly", colorIndex: 3, colorLight: "#ff8f00", customColor: null,
      freqNum: 3, freqDen: 7, category: "Body", numerical: true, unit: "km", targetValue: 5.5, targetType: 1, archived: false, hasReminder: false,
    });
  });

  it("ignores measurable fields of yes-or-no habits", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ unit: "km", targetValue: 9, targetType: 1 }));
    expect(core.habitDetail(id)).toMatchObject({ numerical: false, unit: "" });
  });

  it("edits keep the habit's check-ins and id", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ name: "A" }));
    const today = core.today();
    core.setEntry(id, today, Entry.YES_MANUAL, "kept");
    expect(core.saveHabit(form({ id, name: "B", freqNum: 1, freqDen: 2 }))).toBe(id);
    const row = core.listHabits("", 1, 0)[0];
    expect(row).toMatchObject({ id, name: "B", freqNum: 1, freqDen: 2 });
    expect(core.entry(id, today)).toEqual({ value: Entry.YES_MANUAL, notes: "kept" });
    expect(core.listHabits("", 1, 0)).toHaveLength(1);
  });

  it("new habits go to the end of the manual order", async () => {
    const core = await openCore();
    for (const name of ["A", "B", "C"]) core.saveHabit(form({ name }));
    expect(core.listHabits("", 1, 0).map((h) => h.name)).toEqual(["A", "B", "C"]);
  });

  it("habitDetail fails for a habit that doesn't exist", async () => {
    const core = await openCore();
    expect(() => core.habitDetail(999)).toThrow(/Habit not found/);
  });
});

describe("check-ins", () => {
  it.each([
    [false, false, [Entry.YES_MANUAL, Entry.NO, Entry.YES_MANUAL]],
    [true, false, [Entry.YES_MANUAL, Entry.SKIP, Entry.NO, Entry.YES_MANUAL]],
    [false, true, [Entry.YES_MANUAL, Entry.NO, Entry.UNKNOWN, Entry.YES_MANUAL]],
    [true, true, [Entry.YES_MANUAL, Entry.SKIP, Entry.NO, Entry.UNKNOWN, Entry.YES_MANUAL]],
  ])("toggle cycles like Android (skip %s, question marks %s)", async (skip, question, cycle) => {
    setPref("pref_skip_enabled", skip);
    setPref("pref_unknown_enabled", question);
    const core = await openCore();
    const id = core.saveHabit(form());
    const day = core.today() - 2;
    const seen = cycle.map(() => core.toggle(id, day));
    expect(seen).toEqual(cycle);
    expect(core.entry(id, day).value).toBe(cycle.at(-1));
  });

  it("toggling an auto-checked day makes it a real check", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ freqNum: 1, freqDen: 7 }));
    const today = core.today();
    core.setEntry(id, today - 3, Entry.YES_MANUAL, "");
    expect(core.entry(id, today).value).toBe(Entry.YES_AUTO);
    expect(core.toggle(id, today)).toBe(Entry.YES_MANUAL);
  });

  it("toggle keeps the day's notes", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    core.setEntry(id, core.today(), Entry.NO, "sick");
    core.toggle(id, core.today());
    expect(core.entry(id, core.today())).toEqual({ value: Entry.YES_MANUAL, notes: "sick" });
  });

  it("toggle does nothing to measurable habits", async () => {
    const core = await openCore();
    const id = core.saveHabit(form({ numerical: true, targetValue: 5 }));
    core.setEntry(id, core.today(), 3000, "");
    expect(core.toggle(id, core.today())).toBe(3000);
    expect(core.entry(id, core.today()).value).toBe(3000);
  });

  it("listHabits returns the requested window of days, newest first", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    const today = core.today();
    for (let i = 0; i < 20; i++) core.setEntry(id, today - i, i % 2 ? Entry.NO : Entry.YES_MANUAL, i === 12 ? "n12" : "");
    const all = core.listHabits("", 20, 0)[0];
    expect(all.values).toHaveLength(20);
    const window = core.listHabits("", 5, 10)[0];
    expect(window.values).toEqual(all.values.slice(10, 15));
    expect(window.notes[2]).toBe("n12");
    // one future day (the hidden column right of today) is allowed and empty
    const future = core.listHabits("", 3, -1)[0];
    expect(future.values[0]).toBe(Entry.UNKNOWN);
    expect(future.values.slice(1)).toEqual(all.values.slice(0, 2));
  });

  it("measurable values are thousandths, and 'completed' follows the target", async () => {
    const core = await openCore();
    const atLeast = core.saveHabit(form({ name: "Run", numerical: true, unit: "km", targetValue: 5 }));
    const atMost = core.saveHabit(form({ name: "Sugar", numerical: true, unit: "cups", targetValue: 2, targetType: 1 }));
    const t = core.today();
    core.setEntry(atLeast, t, 5000, "");
    core.setEntry(atLeast, t - 1, 4999, "");
    core.setEntry(atMost, t, 2000, "");
    core.setEntry(atMost, t - 1, 2500, "");
    const [run, sugar] = core.listHabits("", 2, 0);
    expect(run.values).toEqual([5000, 4999]);
    expect(run.completed).toEqual([true, false]);
    expect(sugar.completed).toEqual([true, false]);
  });

  it("the score follows Loop's formula", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    for (let i = 0; i < 10; i++) core.setEntry(id, core.today() - i, Entry.YES_MANUAL, "");
    expect(core.habitDetail(id).score).toBeCloseTo(1 - Math.pow(0.5, 10 / 13), 10);
    expect(core.listHabits("", 1, 0)[0].score).toBeCloseTo(1 - Math.pow(0.5, 10 / 13), 10);
  });

  it("detail numbers: total, streaks, month and year change, target rows", async () => {
    const core = await openCore();
    const id = core.saveHabit(form());
    const t = core.today();
    for (const i of [0, 1, 2, 10, 11]) core.setEntry(id, t - i, Entry.YES_MANUAL, "");
    const d = core.habitDetail(id);
    expect(d.totalCount).toBe(5);
    expect(d.streakCount).toBe(2);
    expect(d.scoreMonthDiff).toBeCloseTo(d.score, 10); // nothing a month ago
    expect(d.scoreYearDiff).toBeCloseTo(d.score, 10);
    const weekly = core.saveHabit(form({ numerical: true, targetValue: 10, freqNum: 1, freqDen: 7 }));
    expect(core.habitDetail(weekly).targetRows).toBe(4);
  });
});

describe("list filters and sorting", () => {
  async function three() {
    const core = await openCore();
    const t = core.today();
    const b = core.saveHabit(form({ name: "Banana", colorIndex: 5 }));
    const a = core.saveHabit(form({ name: "apple", colorIndex: 10 }));
    const c = core.saveHabit(form({ name: "Cherry", colorIndex: 1 }));
    for (let i = 0; i < 30; i++) core.setEntry(c, t - i, Entry.YES_MANUAL, "");
    core.setEntry(a, t, Entry.YES_MANUAL, "");
    return { core, a, b, c };
  }
  const names = (core: Awaited<ReturnType<typeof openCore>>) => core.listHabits("", 1, 0).map((h) => h.name);

  it("searches by name", async () => {
    const { core } = await three();
    expect(core.listHabits("an", 1, 0).map((h) => h.name)).toEqual(["Banana"]);
  });

  it("hides archived habits unless asked", async () => {
    const { core, b } = await three();
    core.archive([b]);
    expect(names(core)).toEqual(["apple", "Cherry"]);
    core.setShowArchived(true);
    expect(core.listOptions().showArchived).toBe(true);
    expect(core.listHabits("", 1, 0).find((h) => h.name === "Banana")!.archived).toBe(true);
    core.unarchive([b]);
    core.setShowArchived(false);
    expect(names(core)).toEqual(["Banana", "apple", "Cherry"]);
  });

  it("'Hide completed' hides habits done today", async () => {
    const { core } = await three();
    core.setShowCompleted(false);
    expect(names(core)).toEqual(["Banana"]);
    expect(core.listOptions()).toMatchObject({ showCompleted: false, hasHabits: true });
  });

  it("with question marks, 'Hide completed' hides habits with any entry today", async () => {
    setPref("pref_unknown_enabled", true);
    const { core, b } = await three();
    core.setEntry(b, core.today(), Entry.NO, "");
    core.setShowCompleted(false);
    expect(names(core)).toEqual([]);
  });

  it("sorts by name, colour, score and status; again reverses", async () => {
    const { core } = await three();
    core.sortBy("name");
    expect(core.listOptions().order).toBe("BY_NAME_ASC");
    // String.compareTo, like Android: capitals first
    expect(names(core)).toEqual(["Banana", "Cherry", "apple"]);
    core.sortBy("name");
    expect(core.listOptions().order).toBe("BY_NAME_DESC");
    expect(names(core)).toEqual(["apple", "Cherry", "Banana"]);
    core.sortBy("color");
    expect(names(core)).toEqual(["Cherry", "Banana", "apple"]);
    core.sortBy("color");
    expect(names(core)).toEqual(["apple", "Banana", "Cherry"]);
    core.sortBy("score");
    expect(core.listOptions().order).toBe("BY_SCORE_DESC");
    // Upstream quirk, same on Android: core's "descending" score comparator puts the lowest score first
    expect(names(core)[2]).toBe("Cherry");
    core.sortBy("score");
    expect(core.listOptions().order).toBe("BY_SCORE_ASC");
    expect(names(core)[0]).toBe("Cherry");
    core.sortBy("status");
    expect(core.listOptions().order).toBe("BY_STATUS_ASC");
    core.sortBy("manual");
    expect(names(core)).toEqual(["Banana", "apple", "Cherry"]);
  });

  it("keeps categories together whatever the order", async () => {
    const core = await openCore();
    core.saveHabit(form({ name: "z", category: "Mind" }));
    core.saveHabit(form({ name: "a", category: "" }));
    core.saveHabit(form({ name: "m", category: "Mind" }));
    core.sortBy("name");
    const rows = core.listHabits("", 1, 0).map((h) => `${h.category}:${h.name}`);
    const mind = rows.filter((r) => r.startsWith("Mind:"));
    expect(rows.indexOf(mind[1]) - rows.indexOf(mind[0])).toBe(1);
  });
});

describe("reorder, archive, delete, colours and categories", () => {
  it("moves a habit before or after another", async () => {
    const core = await openCore();
    const [a, b, c] = ["A", "B", "C"].map((name) => core.saveHabit(form({ name })));
    core.move(c, a, true);
    expect(core.listHabits("", 1, 0).map((h) => h.name)).toEqual(["C", "A", "B"]);
    core.move(c, b, false);
    expect(core.listHabits("", 1, 0).map((h) => h.name)).toEqual(["A", "B", "C"]);
    void b;
    const reopened = await openCore(core.snapshot());
    expect(reopened.listHabits("", 1, 0).map((h) => h.name)).toEqual(["A", "B", "C"]);
  });

  it("deletes habits and their check-ins", async () => {
    const core = await openCore();
    const a = core.saveHabit(form({ name: "A" }));
    const b = core.saveHabit(form({ name: "B" }));
    core.setEntry(a, core.today(), Entry.YES_MANUAL, "");
    core.delete([a]);
    expect(core.listHabits("", 1, 0).map((h) => h.id)).toEqual([b]);
    expect(await query(core.snapshot(), "SELECT count(*) FROM Repetitions")).toEqual([[0]]);
  });

  it("changes the palette colour of several habits", async () => {
    const core = await openCore();
    const ids = ["A", "B"].map((name) => core.saveHabit(form({ name })));
    core.changeColor(ids, 13, null);
    expect(core.listHabits("", 1, 0).map((h) => [h.colorIndex, h.colorLight])).toEqual([[13, "#5e35b1"], [13, "#5e35b1"]]);
  });

  it("lists, sets and renames categories (trimmed, sorted, no blanks)", async () => {
    const core = await openCore();
    const a = core.saveHabit(form({ name: "A", category: "Mind" }));
    const b = core.saveHabit(form({ name: "B" }));
    core.saveHabit(form({ name: "C", category: "Body" }));
    expect(core.categories()).toEqual(["Body", "Mind"]);
    core.changeCategory([a, b], "  Fitness ");
    expect(core.categories()).toEqual(["Body", "Fitness"]);
    core.renameCategory("Fitness", " Sport ");
    expect(core.listHabits("", 1, 0).map((h) => h.category).sort()).toEqual(["Body", "Sport", "Sport"]);
    core.changeCategory([a, b], "");
    expect(core.categories()).toEqual(["Body"]);
  });
});

describe("first run, hints and repair", () => {
  it("consumeFirstRun is true once", async () => {
    const core = await openCore();
    expect(core.consumeFirstRun()).toBe(true);
    expect(core.consumeFirstRun()).toBe(false);
    expect((await openCore()).consumeFirstRun()).toBe(false); // preferences live in localStorage
  });

  it("shows at most one new hint a day, each once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    const core = await openCore();
    core.consumeFirstRun();
    const hints = ["one", "two"];
    expect(core.nextHint(hints)).toBeNull(); // not on the first day
    vi.setSystemTime(new Date(2026, 9, 29, 12));
    core.refreshToday();
    expect(core.nextHint(hints)).toBe("one");
    expect(core.nextHint(hints)).toBeNull();
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    core.refreshToday();
    expect(core.nextHint(hints)).toBe("two");
    vi.setSystemTime(new Date(2026, 9, 31, 12));
    core.refreshToday();
    expect(core.nextHint(hints)).toBeNull();
  });

  it("repairDatabase keeps the habits", async () => {
    const core = await openCore();
    core.saveHabit(form({ name: "A" }));
    core.repairDatabase();
    expect(core.listHabits("", 1, 0).map((h) => h.name)).toEqual(["A"]);
  });
});

describe("today, midnight and first weekday", () => {
  const day = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 1)) / 86_400_000);

  it("today is the local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59));
    const core = await openCore();
    expect(core.today()).toBe(day(2026, 10, 28));
  });

  it("rolls over at midnight, and only then reports a change", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 23, 59));
    const core = await openCore();
    const id = core.saveHabit(form());
    core.toggle(id, core.today());
    expect(core.refreshToday()).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 29, 0, 1));
    expect(core.refreshToday()).toBe(true);
    expect(core.today()).toBe(day(2026, 10, 29));
    expect(core.refreshToday()).toBe(false);
    // yesterday's tick is now one day back
    expect(core.listHabits("", 2, 0)[0].values).toEqual([Entry.UNKNOWN, Entry.YES_MANUAL]);
  });

  it("'Extend day past midnight' keeps yesterday until 3:00", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 29, 2, 30));
    const core = await openCore();
    expect(core.today()).toBe(day(2026, 10, 29));
    setPref("pref_midnight_delay", true);
    core.applyPreferences();
    expect(core.today()).toBe(day(2026, 10, 28));
    vi.setSystemTime(new Date(2026, 9, 29, 3, 0));
    expect(core.refreshToday()).toBe(true);
    expect(core.today()).toBe(day(2026, 10, 29));
  });
});

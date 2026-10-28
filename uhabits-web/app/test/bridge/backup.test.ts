// Backups, imports and CSV export through the web bridge (WebDatabase, WebPlatform file storage, CustomColors).
import fs from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { Entry, form, openCore, query, SQL, TEST_ASSETS, userVersion } from "./helpers";

const day = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 1)) / 86_400_000);
const asset = (name: string) => new Uint8Array(fs.readFileSync(`${TEST_ASSETS}/${name}`));

async function sample() {
  const core = await openCore();
  const t = core.today();
  const read = core.saveHabit(form({ name: "Read", question: "Read?", description: "notes", category: "Mind", colorIndex: 11, freqNum: 3, freqDen: 7 }));
  const run = core.saveHabit(form({ name: "Run", numerical: true, unit: "km", targetValue: 5, category: "Body" }));
  for (let i = 0; i < 40; i++) core.setEntry(read, t - i, i % 3 ? Entry.YES_MANUAL : Entry.NO, i === 0 ? "today" : "");
  for (let i = 0; i < 40; i++) core.setEntry(run, t - i, i * 250, "");
  core.setEntry(read, t - 50, Entry.SKIP, "");
  return { core, read, run };
}
// By name: without categories the list is no longer grouped, so the order can differ
const snapshotOf = (core: Awaited<ReturnType<typeof openCore>>) =>
  [...core.listHabits("", 60, 0)].sort((a, b) => a.name.localeCompare(b.name)).map((h) => ({ name: h.name, values: h.values, notes: h.notes, score: h.score, freq: [h.freqNum, h.freqDen], numerical: h.numerical, unit: h.unit, target: h.targetValue }));

describe("backup export", () => {
  it("by default is an Android 2.3.2 (v25) database without categories", async () => {
    const { core } = await sample();
    const bytes = core.exportBackup(false);
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe("SQLite format 3");
    expect(userVersion(bytes)).toBe(25);
    const columns = (await query(bytes, "PRAGMA table_info(Habits)")).map((r) => r[1]);
    expect(columns).not.toContain("category");
    expect(columns).toEqual(expect.arrayContaining(["name", "question", "description", "color", "freq_num", "freq_den", "type", "target_value", "unit", "uuid"]));
    expect(await query(bytes, "SELECT count(*) FROM Repetitions")).toEqual([[81]]);
    expect(await query(bytes, "PRAGMA integrity_check")).toEqual([["ok"]]);
  });

  it("with categories is v26 and keeps them", async () => {
    const { core } = await sample();
    const bytes = core.exportBackup(true);
    expect(userVersion(bytes)).toBe(26);
    expect(await query(bytes, "SELECT name, category FROM Habits ORDER BY position")).toEqual([["Read", "Mind"], ["Run", "Body"]]);
  });

  it("doesn't change the live database", async () => {
    const { core } = await sample();
    core.exportBackup(false);
    expect(userVersion(core.snapshot())).toBe(26);
    expect(core.categories()).toEqual(["Body", "Mind"]);
  });

  it.each([false, true])("round-trips every habit and check-in (categories %s)", async (categories) => {
    const { core } = await sample();
    const fresh = await openCore();
    expect(await fresh.importBackup(core.exportBackup(categories))).toBe(true);
    expect(snapshotOf(fresh)).toEqual(snapshotOf(core));
    expect(fresh.categories()).toEqual(categories ? ["Body", "Mind"] : []);
  });

  it("merges into existing habits by UUID instead of duplicating them", async () => {
    const { core, read } = await sample();
    const backup = core.exportBackup(false);
    core.setEntry(read, core.today() - 100, Entry.YES_MANUAL, "only here");
    expect(await core.importBackup(backup)).toBe(true);
    expect(core.listHabits("", 1, 0)).toHaveLength(2);
    expect(core.entry(read, core.today() - 100).notes).toBe("only here");
    const other = await openCore();
    other.saveHabit(form({ name: "Mine" }));
    await other.importBackup(backup);
    await other.importBackup(backup);
    expect(other.listHabits("", 1, 0).map((h) => h.name)).toEqual(["Mine", "Read", "Run"]);
  });

  it("rejects files it doesn't know, and changes nothing", async () => {
    const { core } = await sample();
    const before = snapshotOf(core);
    expect(await core.importBackup(new TextEncoder().encode("hello"))).toBe(false);
    expect(await core.importBackup(new Uint8Array())).toBe(false);
    expect(await core.importBackup(asset("hello.txt"))).toBe(false);
    const db = new (await SQL()).Database();
    db.run("CREATE TABLE foo (x)");
    expect(await core.importBackup(db.export())).toBe(false);
    expect(snapshotOf(core)).toEqual(before);
  });
});

describe("imports from other apps (core's ImportTest, through the web's file plumbing)", () => {
  const byName = (core: Awaited<ReturnType<typeof openCore>>) => Object.fromEntries(core.listHabits("", 1, 0).map((h) => [h.name, h]));

  it("Loop for Android backup (loop.db)", async () => {
    const core = await openCore();
    core.setShowArchived(true);
    expect(await core.importBackup(asset("loop.db"))).toBe(true);
    const habits = core.listHabits("", 1, 0);
    expect(habits).toHaveLength(9);
    const wake = habits[0];
    expect(wake).toMatchObject({ name: "Wake up early", freqNum: 3, freqDen: 7 });
    expect(core.entry(wake.id, day(2016, 3, 14)).value).toBe(Entry.YES_MANUAL);
    expect(core.entry(wake.id, day(2016, 3, 16)).value).toBe(Entry.YES_MANUAL);
    expect(core.entry(wake.id, day(2016, 3, 17)).value).not.toBe(Entry.YES_MANUAL);
  });

  it.each(["databases/021.db", "databases/022.db"])("older Loop databases (%s)", async (file) => {
    const core = await openCore();
    core.setShowArchived(true);
    expect(await core.importBackup(asset(file))).toBe(true);
    expect(core.listHabits("", 1, 0).length).toBeGreaterThan(0);
  });

  it("Rewire", async () => {
    const core = await openCore();
    expect(await core.importBackup(asset("rewire.db"))).toBe(true);
    const h = byName(core);
    expect(Object.keys(h)).toHaveLength(3);
    expect(h["Wake up early"]).toMatchObject({ freqNum: 3, freqDen: 7, hasReminder: false });
    expect(core.entry(h["Wake up early"].id, day(2016, 1, 18)).value).toBe(Entry.YES_MANUAL);
    expect(core.entry(h["Wake up early"].id, day(2016, 3, 10)).value).not.toBe(Entry.YES_MANUAL);
    expect(h["brush teeth"].hasReminder).toBe(true);
  });

  it("Tickmate", async () => {
    const core = await openCore();
    expect(await core.importBackup(asset("tickmate.db"))).toBe(true);
    const h = byName(core);
    expect(Object.keys(h).sort()).toEqual(["I love you", "Sport", "Vegan"]);
    expect(h.Vegan.category).toBe("Exercise");
    expect(core.entry(h.Vegan.id, day(2016, 2, 5)).value).toBe(Entry.YES_MANUAL);
    expect(core.entry(h.Vegan.id, day(2016, 3, 14)).value).not.toBe(Entry.YES_MANUAL);
  });

  it("HabitBull CSV, with notes", async () => {
    const core = await openCore();
    expect(await core.importBackup(asset("habitbull.csv"))).toBe(true);
    const h = byName(core);
    expect(Object.keys(h)).toHaveLength(4);
    const dragons = h["Breed dragons"];
    expect(dragons).toMatchObject({ description: "with love and fire", category: "Diet & Food", freqNum: 1, freqDen: 1 });
    expect(core.entry(dragons.id, day(2016, 3, 18))).toEqual({ value: Entry.YES_MANUAL, notes: "text" });
    expect(core.entry(dragons.id, day(2016, 3, 20)).value).not.toBe(Entry.YES_MANUAL);
  });

  it("HabitBull CSV with measurable habits", async () => {
    const core = await openCore();
    expect(await core.importBackup(asset("habitbull3.csv"))).toBe(true);
    const h = byName(core);
    expect(h.Pushups.numerical).toBe(true);
    expect(core.entry(h.Pushups.id, day(2021, 9, 1)).value).toBe(30_000);
    expect(h.run.numerical).toBe(false);
  });
});

describe("Android compatibility of the web's own tables", () => {
  it("a backup has Android's tables plus only WebCustomColors, which Android ignores", async () => {
    const { core, read } = await sample();
    core.changeColor([read], 0, "#FF69B4");
    const tables = (await query(core.exportBackup(false), "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r[0]);
    // Android's own tables (core's schema) plus the web-only one
    expect(tables).toEqual(["Events", "Habits", "Repetitions", "WebCustomColors"]);
    expect(await query(core.exportBackup(false), "SELECT color, palette_index FROM WebCustomColors")).toEqual([[0xff69b4, 15]]);
  });
});

describe("CSV export (HabitsCSVExporter)", () => {
  it("zips Habits.csv, Checkmarks.csv, Scores.csv and a folder per habit", async () => {
    const { core, read } = await sample();
    const zip = await JSZip.loadAsync(await core.exportCsv([]));
    const files = Object.keys(zip.files).filter((f) => !f.endsWith("/")).sort();
    // Numbered in list order (grouped by category: Body, then Mind)
    expect(files).toEqual(["001 Run/Checkmarks.csv", "001 Run/Scores.csv", "002 Read/Checkmarks.csv", "002 Read/Scores.csv", "Checkmarks.csv", "Habits.csv", "Scores.csv"]);
    const habits = await zip.file("Habits.csv")!.async("string");
    expect(habits.split("\n")[0]).toMatch(/^Position,Name,/);
    expect(habits).toContain("Read");
    const checks = (await zip.file("002 Read/Checkmarks.csv")!.async("string")).trim().split("\n");
    expect(checks.length).toBeGreaterThan(30);
    void read;
  });

  it("exports only the given habits", async () => {
    const { core, run } = await sample();
    const zip = await JSZip.loadAsync(await core.exportCsv([run]));
    expect(Object.keys(zip.files).some((f) => f.includes("Read"))).toBe(false);
    expect(Object.keys(zip.files).some((f) => f.includes("Run"))).toBe(true);
  });
});

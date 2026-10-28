// Custom (non-palette) habit colors: display, backups, Android compatibility, bulk change, delete.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(`${ROOT}/uhabits-web/app/package.json`);
const initSqlJs = require("sql.js");
const store = new Map();
globalThis.localStorage = { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window ??= globalThis;
const { openHabitsCore } = await import(`${ROOT}/uhabits-web/build/dist/js/productionLibrary/habits-core.mjs`);
const SQL = await initSqlJs({ locateFile: (f) => `${ROOT}/uhabits-web/app/node_modules/sql.js/dist/${f}` });
const migDir = `${ROOT}/uhabits-core/assets/main/migrations`;
const resources = Object.fromEntries(fs.readdirSync(migDir).map((f) => [`migrations/${f}`, fs.readFileSync(path.join(migDir, f), "utf8")]));
let fails = 0;
const check = (name, ok, detail = "") => { if (!ok) fails++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  " + detail}`); };
const form = (o) => ({ id: null, name: "x", question: "", description: "", colorIndex: 8, customColor: null, freqNum: 1, freqDen: 1, numerical: false, unit: "", targetValue: 0, targetType: 0, category: "", ...o });
const row = (core, id) => core.listHabits("", 1, 0).find((h) => h.id === id);

const core = await openHabitsCore(SQL, null, resources);
const a = core.saveHabit(form({ name: "Pink", customColor: "#FF69B4" }));
const b = core.saveHabit(form({ name: "Teal", colorIndex: 8 }));
let d = core.habitDetail(a);
check("custom: colorLight is the custom color", d.colorLight === "#ff69b4", d.colorLight);
check("custom: colorDark is lightened", d.colorDark === "#ffb4da", d.colorDark);
check("custom: customColor returned", d.customColor === "#ff69b4", d.customColor);
check("custom: palette index = nearest (15 pink)", d.colorIndex === 15, d.colorIndex);
check("list row uses custom color", row(core, a).colorLight === "#ff69b4");
d = core.habitDetail(b);
check("palette habit unchanged", d.colorLight === "#00897b" && d.colorDark === "#80cbc4" && d.customColor == null, JSON.stringify([d.colorLight, d.colorDark, d.customColor]));

// edit keeps it; picking a palette color clears it
core.saveHabit(form({ id: a, name: "Pink2", colorIndex: 15, customColor: "#FF69B4" }));
check("edit keeps custom", core.habitDetail(a).colorLight === "#ff69b4");

// backup round trip (both formats) into a fresh core
for (const cats of [false, true]) {
  const bytes = core.exportBackup(cats);
  const db = new SQL.Database(bytes);
  const rows = db.exec("SELECT color FROM WebCustomColors")[0]?.values ?? [];
  const pal = db.exec("SELECT color FROM Habits WHERE name='Pink2'")[0].values[0][0];
  check(`backup v${cats ? 26 : 25}: has table + nearest palette color in Habits`, rows.length === 1 && pal === 15, JSON.stringify([rows, pal]));
  const fresh = await openHabitsCore(SQL, null, resources);
  check("import recognised", await fresh.importBackup(bytes));
  const h = fresh.listHabits("", 1, 0).find((x) => x.name === "Pink2");
  check(`backup v${cats ? 26 : 25}: custom color survives import`, h?.colorLight === "#ff69b4", h?.colorLight);
  // Android-made backup of the same habits: no extra table → back to palette color
  db.run("DROP TABLE WebCustomColors");
  const android = db.export();
  await fresh.importBackup(android);
  const h2 = fresh.listHabits("", 1, 0).find((x) => x.name === "Pink2");
  check(`backup v${cats ? 26 : 25}: Android backup resets to nearest palette color`, h2?.colorLight === "#d81b60" && h2?.customColor == null, JSON.stringify(h2 && [h2.colorLight, h2.customColor]));
  db.close();
}

// palette color changed elsewhere (stale row ignored)
const raw = new SQL.Database(core.exportBackup(true));
raw.run("UPDATE Habits SET color = 3 WHERE name = 'Pink2'");
const stale = await openHabitsCore(SQL, raw.export(), resources);
check("stale custom row ignored when palette color changed", stale.listHabits("", 1, 0).find((x) => x.name === "Pink2").colorLight === "#ff8f00");

// live DB snapshot (what the app persists) keeps it after reload
const reopened = await openHabitsCore(SQL, core.snapshot(), resources);
check("survives app reload", reopened.habitDetail(a).colorLight === "#ff69b4");

// bulk change
core.changeColor([a, b], 0, "#123456");
check("bulk custom", row(core, a).colorLight === "#123456" && row(core, b).colorLight === "#123456");
core.changeColor([a, b], 2, null);
check("bulk palette clears custom", row(core, a).colorLight === "#f57c00" && row(core, a).customColor == null);
core.saveHabit(form({ id: a, name: "Pink2", customColor: "#ABCDEF" }));
core.delete([a]);
const left = new SQL.Database(core.snapshot()).exec("SELECT count(*) FROM WebCustomColors")[0].values[0][0];
check("delete removes the row", left === 0, left);

// sort by color still works
core.saveHabit(form({ name: "C", customColor: "#00FF00" }));
core.sortBy("color");
check("sort by color works", core.listHabits("", 1, 0).length === 2);
console.log(fails ? `${fails} FAILED` : "all passed");

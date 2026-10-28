// Drives the built web core (Kotlin/JS bridge + sql.js storage) in Node, without the UI.
// 1. Builds habits with every frequency type and known data.
// 2. Checks closed-form expectations and an independent re-implementation of the score rules.
// 3. Exports the backup + the web's numbers for the JVM (Android core) cross-check.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = process.argv[2];
const require = createRequire(`${ROOT}/uhabits-web/app/package.json`);
const initSqlJs = require("sql.js");

// localStorage shim for the bridge's preferences
const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window ??= globalThis;
store.set("pref:pref_first_weekday", "2");

const { openHabitsCore } = await import(`${ROOT}/uhabits-web/build/dist/js/productionLibrary/habits-core.mjs`);
const SQL = await initSqlJs({ locateFile: (f) => `${ROOT}/uhabits-web/app/node_modules/sql.js/dist/${f}` });
const migDir = `${ROOT}/uhabits-core/assets/main/migrations`;
const resources = Object.fromEntries(fs.readdirSync(migDir).map((f) => [`migrations/${f}`, fs.readFileSync(path.join(migDir, f), "utf8")]));
const core = await openHabitsCore(SQL, null, resources);

const YES = 2, AUTO = 1, NO = 0, UNKNOWN = -1, SKIP = 3;
const today = core.today();
const weekday = (d) => (d + 6) % 7; // 0 = Sunday (2000-01-01 was a Saturday)
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL ${name} ${detail}`);
};
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const form = (name, extra) => ({
  id: null, name, question: "", description: "", colorIndex: 8, freqNum: 1, freqDen: 1,
  numerical: false, unit: "", targetValue: 0, targetType: 0, category: "", ...extra,
});
const habits = {};
const add = (name, extra, entries) => {
  const id = core.saveHabit(form(name, extra));
  for (const [day, value] of entries) core.setEntry(id, day, value, "");
  habits[name] = { id, extra, entries };
  return id;
};
const range = (n) => Array.from({ length: n }, (_, i) => i);

// --- Dataset ---
add("daily-50", {}, range(50).map((i) => [today - i, YES]));
add("daily-none", {}, []);
add("every-5-days", { freqNum: 1, freqDen: 5 }, range(41).map((k) => [today - 5 * k, YES]));
add("every-2-days", { freqNum: 1, freqDen: 2 }, range(60).map((k) => [today - 2 * k, YES]));
add("3-per-week-MWF", { freqNum: 3, freqDen: 7 },
  range(140).filter((i) => [1, 3, 5].includes(weekday(today - i))).map((i) => [today - i, YES]));
add("weekly-with-gap", { freqNum: 1, freqDen: 7 },
  range(20).filter((k) => k < 5 || k > 7).map((k) => [today - 7 * k, YES]));
add("10-per-month", { freqNum: 10, freqDen: 30 }, range(300).filter(() => rand() < 0.33).map((i) => [today - i, YES]));
add("monthly", { freqNum: 1, freqDen: 30 }, range(12).map((k) => [today - 30 * k - 3, YES]));
add("3-in-14", { freqNum: 3, freqDen: 14 }, range(200).filter(() => rand() < 0.2).map((i) => [today - i, YES]));
add("daily-random-2y", {}, range(800).map((i) => [today - i, rand() < 0.6 ? YES : rand() < 0.5 ? NO : UNKNOWN]).filter(([, v]) => v !== UNKNOWN));
add("daily-skip-sundays", {}, range(60).map((i) => [today - i, weekday(today - i) === 0 ? SKIP : YES]));
add("num-at-least-5", { numerical: true, unit: "km", targetValue: 5, targetType: 0 },
  range(120).filter(() => rand() < 0.8).map((i) => [today - i, Math.round(rand() * 10) * 1000]));
add("num-at-most-2", { numerical: true, unit: "cups", targetValue: 2, targetType: 1 },
  range(120).filter(() => rand() < 0.8).map((i) => [today - i, Math.round(rand() * 4) * 1000]));
add("num-weekly-20", { numerical: true, unit: "km", targetValue: 20, targetType: 0, freqNum: 1, freqDen: 7 },
  range(100).filter(() => rand() < 0.5).map((i) => [today - i, Math.round(rand() * 8000)]));
add("num-decimal", { numerical: true, unit: "h", targetValue: 1.5, targetType: 0 },
  range(40).map((i) => [today - i, [500, 1250, 1500, 2750, 0][i % 5]]));

// --- Read back what the web app shows ---
const DAYS = 900;
core.setShowArchived(true);
const rows = Object.fromEntries(core.listHabits("", DAYS, 0).map((r) => [r.name, r]));
const web = {};
for (const [name, h] of Object.entries(habits)) {
  const d = core.habitDetail(h.id);
  web[name] = {
    id: h.id, values: [...rows[name].values], score: d.score, monthDiff: d.scoreMonthDiff, yearDiff: d.scoreYearDiff,
    total: d.totalCount, streakCount: d.streakCount, targetRows: d.targetRows, freqNum: d.freqNum, freqDen: d.freqDen,
  };
}

// --- Independent re-implementation of core's score rules (ScoreList.recompute + Score.compute) ---
function scoreSeries(values, h) {
  // values[i] = value for today - i; returns score for each day from the oldest known day to today
  const numerical = !!h.extra.numerical;
  const atMost = h.extra.targetType === 1;
  let num = h.extra.freqNum ?? 1, den = h.extra.freqDen ?? 1;
  const freq = num / den;
  if (!numerical && freq < 1) { num *= 2; den *= 2; }
  let oldest = -1;
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== UNKNOWN) { oldest = i; break; }
  if (oldest < 0) oldest = 0;
  const mult = Math.pow(0.5, Math.sqrt(freq) / 13);
  let prev = numerical && atMost ? 1 : 0, sum = 0;
  const window = [];
  const series = {};
  for (let i = oldest; i >= 0; i--) {
    const v = values[i];
    if (v !== SKIP) {
      window.push(v);
      if (window.length > den) {
        const old = window.shift();
        if (numerical) sum -= Math.max(0, old); else if (old === YES) sum -= 1;
      }
      let pct;
      if (numerical) {
        sum += Math.max(0, v);
        const s = sum / 1000, t = h.extra.targetValue;
        pct = !atMost ? (t > 0 ? Math.min(1, s / t) : 1) : (t > 0 ? Math.min(1, Math.max(0, 1 - (s - t) / t)) : (s > 0 ? 0 : 1));
      } else {
        if (v === YES) sum += 1;
        pct = Math.min(1, sum / num);
      }
      prev = prev * mult + pct * (1 - mult);
    }
    series[i] = prev;
  }
  return series; // keyed by days-ago
}

const m = Math.pow(0.5, 1 / 13);
for (const [name, h] of Object.entries(habits)) {
  const w = web[name];
  const s = scoreSeries(w.values, h);
  const at = (daysAgo) => s[daysAgo] ?? 0; // core: days before the history score 0 (ScoreList.get)
  check(`${name}: score today matches independent model`, approx(w.score, at(0)), `web=${w.score} model=${at(0)}`);
  check(`${name}: month change matches model`, approx(w.monthDiff, at(0) - at(30), 1e-5), `web=${w.monthDiff} model=${at(0) - at(30)}`);
  check(`${name}: year change matches model`, approx(w.yearDiff, at(0) - at(365), 1e-5), `web=${w.yearDiff} model=${at(0) - at(365)}`);
  const manual = h.entries.filter(([, v]) => v === YES).length;
  check(`${name}: total = number of manual ticks`, w.total === manual, `web=${w.total} expected=${manual}`);
  web[name].modelScores = s;
}

// --- Closed-form and rule checks ---
check("daily-50: score = 1 - 0.5^(50/13)", approx(web["daily-50"].score, 1 - Math.pow(m, 50)), `${web["daily-50"].score} vs ${1 - Math.pow(m, 50)}`);
check("daily-50: all 50 days ticked manually", web["daily-50"].values.slice(0, 50).every((v) => v === YES));
check("daily-none: score 0, total 0, no streaks", web["daily-none"].score === 0 && web["daily-none"].total === 0 && web["daily-none"].streakCount === 0);
const e5 = web["every-5-days"].values;
check("every-5-days: check days are manual", range(41).every((k) => e5[5 * k] === YES));
check("every-5-days: 4 days after each check are auto-ticked", range(40).every((k) => [1, 2, 3, 4].every((j) => e5[5 * k + j] === AUTO || e5[5 * k + j] === YES)),
  JSON.stringify(e5.slice(0, 20)));
check("every-5-days: no unticked day inside the covered period", e5.slice(0, 200).every((v) => v === YES || v === AUTO));
const mwf = web["3-per-week-MWF"].values;
check("3-per-week-MWF: Mon/Wed/Fri manual", range(140).filter((i) => [1, 3, 5].includes(weekday(today - i))).every((i) => mwf[i] === YES));
check("3-per-week-MWF: all other days within the last 18 weeks auto-ticked", range(126).filter((i) => ![1, 3, 5].includes(weekday(today - i)) && i > 6).every((i) => mwf[i] === AUTO),
  JSON.stringify(mwf.slice(0, 21)));
const wk = web["weekly-with-gap"].values;
check("weekly-with-gap: gap weeks are not auto-ticked", range(7).some((j) => wk[7 * 6 + j] !== AUTO && wk[7 * 6 + j] !== YES), JSON.stringify(wk.slice(35, 56)));
check("daily-skip-sundays: Sundays stay skipped", range(60).filter((i) => weekday(today - i) === 0).every((i) => web["daily-skip-sundays"].values[i] === SKIP));
check("daily-skip-sundays: one unbroken streak (skips don't break it)", web["daily-skip-sundays"].streakCount === 1, `streaks=${web["daily-skip-sundays"].streakCount}`);
check("daily-skip-sundays: score as if every non-skip day was done", approx(web["daily-skip-sundays"].score, 1 - Math.pow(m, 60 - range(60).filter((i) => weekday(today - i) === 0).length)));
check("num-decimal: values kept with 3 decimals", web["num-decimal"].values.slice(0, 5).join(",") === "500,1250,1500,2750,0", web["num-decimal"].values.slice(0, 5).join(","));
check("num-at-most-2: score between 0 and 1", web["num-at-most-2"].score >= 0 && web["num-at-most-2"].score <= 1);
// TargetCardPresenter: the "Today" row only for daily habits
check("daily measurable habits show 5 target rows", ["num-at-least-5", "num-at-most-2", "num-decimal"].every((n) => web[n].targetRows === 5));
check("weekly measurable habit shows 4 target rows (no Today)", web["num-weekly-20"].targetRows === 4, `${web["num-weekly-20"].targetRows}`);
for (const [name, h] of Object.entries(habits)) {
  const f = h.extra;
  check(`${name}: frequency saved as ${f.freqNum ?? 1}/${f.freqDen ?? 1}`, web[name].freqNum === (f.freqNum ?? 1) && web[name].freqDen === (f.freqDen ?? 1));
}

// --- Persistence through the storage layer: snapshot -> reopen -> same numbers ---
const reopened = await openHabitsCore(SQL, core.snapshot(), resources);
const rows2 = Object.fromEntries(reopened.listHabits("", DAYS, 0).map((r) => [r.name, r]));
for (const name of Object.keys(habits)) {
  const d2 = reopened.habitDetail(web[name].id);
  check(`${name}: identical after save + reload`, d2.score === web[name].score && d2.totalCount === web[name].total && rows2[name].values.join() === web[name].values.join());
}

// --- Backup round trip: export (v25) -> import into an empty app -> same numbers ---
const backup = core.exportBackup(false);
fs.writeFileSync(`${OUT}/backup-v25.db`, backup);
fs.writeFileSync(`${OUT}/backup-v26.db`, core.exportBackup(true));
const fresh = await openHabitsCore(SQL, null, resources);
check("backup v25 is recognised and imported", await fresh.importBackup(backup));
const rows3 = Object.fromEntries(fresh.listHabits("", DAYS, 0).map((r) => [r.name, r]));
for (const name of Object.keys(habits)) {
  const r = rows3[name];
  check(`${name}: identical after backup export + import`, !!r && r.values.join() === web[name].values.join() && approx(r.score, web[name].score, 1e-12),
    r ? `score ${r.score} vs ${web[name].score}` : "missing");
}
// Importing the same backup twice must not duplicate habits (merged by UUID)
await fresh.importBackup(backup);
check("re-importing the same backup does not duplicate habits", fresh.listHabits("", 1, 0).length === Object.keys(habits).length, `${fresh.listHabits("", 1, 0).length}`);

if (core.debugChartData) fs.writeFileSync(`${OUT}/web-charts.json`, core.debugChartData(DAYS));
if (core.debugChartData) {
  // Best streaks against answers known from the data (each streak is [start, end, length] in days since 2000)
  const st = Object.fromEntries(Object.entries(JSON.parse(core.debugChartData(DAYS))).map(([n, h]) => [n, h.streaks]));
  const one = (n) => st[n].length === 1 ? st[n][0] : null;
  const covers = (s, a, b) => s && s[0] <= a && s[1] >= b && s[2] === s[1] - s[0] + 1;
  check("daily-50: one streak of exactly 50 days ending today", JSON.stringify(st["daily-50"]) === JSON.stringify([[today - 49, today, 50]]), JSON.stringify(st["daily-50"]));
  check("daily-none: no streaks", st["daily-none"].length === 0);
  check("every-5-days: one streak covering all 41 check-ins (today-200 .. today)", covers(one("every-5-days"), today - 200, today), JSON.stringify(st["every-5-days"]));
  check("every-2-days: one streak covering all 60 check-ins", covers(one("every-2-days"), today - 118, today), JSON.stringify(st["every-2-days"]));
  const firstMwf = Math.max(...range(140).filter((i) => [1, 3, 5].includes(weekday(today - i))));
  check("3-per-week-MWF: one streak from the first Mon/Wed/Fri to today", covers(one("3-per-week-MWF"), today - firstMwf, today), JSON.stringify(st["3-per-week-MWF"]));
  check("monthly: one streak covering all 12 check-ins", covers(one("monthly"), today - 333, today), JSON.stringify(st["monthly"]));
  check("daily-skip-sundays: one 60-day streak (skips don't break it)", JSON.stringify(st["daily-skip-sundays"]) === JSON.stringify([[today - 59, today, 60]]), JSON.stringify(st["daily-skip-sundays"]));
  const g = st["weekly-with-gap"];
  // check-ins every 7 days for weeks 0-4 and 8-19 back: missing weeks 5, 6, 7 must split it into exactly two streaks
  check("weekly-with-gap: exactly two streaks, split by the missed weeks", g.length === 2 &&
    g.some((s) => covers(s, today - 28, today) && s[0] > today - 42) && g.some((s) => covers(s, today - 133, today - 56) && s[1] < today - 42), JSON.stringify(g));
  const wv = web["weekly-with-gap"].values;
  check("weekly-with-gap: the missed check-in day (6 weeks ago) is not ticked or auto-ticked", wv[42] !== YES && wv[42] !== AUTO, String(wv[42]));
}
fs.writeFileSync(`${OUT}/web.json`, JSON.stringify({ today, days: DAYS, habits: Object.fromEntries(Object.entries(web).map(([n, w]) => [n, { ...w, modelScores: undefined }])),
  model: Object.fromEntries(Object.entries(web).map(([n, w]) => [n, w.modelScores])) }));
const failed = results.filter((r) => !r.ok);
console.log(`\nbridge checks: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

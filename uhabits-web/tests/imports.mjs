import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(`${ROOT}/uhabits-web/app/package.json`);
const initSqlJs = require("sql.js");
const store = new Map();
globalThis.localStorage = { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { openHabitsCore } = await import(`${ROOT}/uhabits-web/build/dist/js/productionLibrary/habits-core.mjs`);
const SQL = await initSqlJs({ locateFile: (f) => `${ROOT}/uhabits-web/app/node_modules/sql.js/dist/${f}` });
const migDir = `${ROOT}/uhabits-core/assets/main/migrations`;
const resources = Object.fromEntries(fs.readdirSync(migDir).map((f) => [`migrations/${f}`, fs.readFileSync(path.join(migDir, f), "utf8")]));
const A = `${ROOT}/uhabits-core/assets/test`;
let fail = 0;
for (const f of process.argv.slice(2)) {
  const core = await openHabitsCore(SQL, null, resources);
  core.setShowArchived(true);
  let ok, err = "";
  try { ok = await core.importBackup(new Uint8Array(fs.readFileSync(`${A}/${f}`))); } catch (e) { ok = false; err = String(e).slice(0, 160); }
  const rows = core.listHabits("", 3650, 0);
  const ticks = rows.reduce((n, r) => n + core.habitDetail(r.id).totalCount, 0);
  const bad = rows.filter((r) => !(r.score >= 0 && r.score <= 1));
  console.log(`${f}: recognised=${ok} habits=${rows.length} check-ins(10y)=${ticks} scores-in-range=${bad.length === 0} ${err}`);
  if (!ok || rows.length === 0 || bad.length) fail++;
  // the imported data must survive a v25 export -> import round trip
  const back = await openHabitsCore(SQL, null, resources);
  back.setShowArchived(true);
  await back.importBackup(core.exportBackup(false));
  const same = back.listHabits("", 3650, 0).map((r) => r.values.join()).join("|") === rows.map((r) => r.values.join()).join("|");
  console.log(`   -> re-exported as v25 and re-imported: identical=${same}`);
  if (!same) fail++;
}
process.exit(fail ? 1 : 0);

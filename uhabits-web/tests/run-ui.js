// Runs every Playwright UI test against `vite preview` (started here on port 4173 unless one is running).
// Needs a build (npm run build) and, for flingtest.js, the Kotlin build (bridge.mjs makes its data).
// Usage: node run-ui.js [outDir]   ENGINES=chromium,webkit to choose browsers.  Exit code 1 if any failed.
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "ui-tests-"));
const SCRIPTS = [
  ["e2e.js", [OUT]],
  ["dayscroll.js", [OUT]],
  ["haptics.js", []],
  ["fixes.js", [OUT]],
  ["flingtest.js", []],
  ["offline.js", [OUT]], // last: starts and stops its own server on 4174
];

const up = () => fetch("http://localhost:4173/").then(() => true, () => false);

(async () => {
  let server = null;
  if (!(await up())) {
    server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { cwd: path.join(__dirname, "../app"), stdio: "ignore", detached: true });
    for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const results = [];
  for (const [script, args] of SCRIPTS) {
    console.log(`\n=== ${script} ===`);
    const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: "inherit", cwd: __dirname });
    results.push([script, r.status === 0]);
  }
  if (server) process.kill(-server.pid);
  console.log("\n=== Summary ===");
  for (const [script, ok] of results) console.log(`${ok ? "  ok  " : "  FAIL"} ${script}`);
  console.log(`Screenshots and files: ${OUT}`);
  process.exitCode = results.every(([, ok]) => ok) ? 0 : 1;
})();

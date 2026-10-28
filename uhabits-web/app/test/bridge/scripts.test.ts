// The original Node scripts in ../tests (bridge.mjs: scores against an independent model, streaks, frequencies;
// customcolor.mjs: custom colours; imports.mjs: every import fixture survives a v25 round trip), run here too.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";

const LIB = `${ROOT}/uhabits-web/build/dist/js/productionLibrary`;
const TESTS = `${ROOT}/uhabits-web/tests`;

// Plain Node resolves the Kotlin output's npm imports (sprintf-js, jszip) next to it; link the app's packages there
if (!fs.existsSync(`${LIB}/node_modules`)) fs.symlinkSync(path.relative(LIB, `${ROOT}/uhabits-web/app/node_modules`), `${LIB}/node_modules`);

const run = (script: string, ...args: string[]) => execFileSync(process.execPath, [`${TESTS}/${script}`, ...args], { cwd: TESTS, encoding: "utf8" });

describe("Node scripts", () => {
  it("bridge.mjs: every check passes", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
    const output = run("bridge.mjs", out);
    const [, passed, total] = output.match(/bridge checks: (\d+)\/(\d+) passed/)!;
    expect(Number(total)).toBeGreaterThan(100);
    expect(passed).toBe(total);
    // and it wrote the files for the JVM cross-check
    expect(fs.readdirSync(out).sort()).toEqual(expect.arrayContaining(["backup-v25.db", "backup-v26.db", "web.json"]));
  });

  it("imports.mjs: every fixture of core's ImportTest imports and survives a v25 export and import", () => {
    const output = run("imports.mjs");
    expect(output.match(/recognised=true/g)).toHaveLength(9);
    expect(output).not.toMatch(/identical=false|scores-in-range=false/);
  });

  it("customcolor.mjs: every check passes", () => {
    const output = run("customcolor.mjs");
    expect(output).toMatch(/all passed/);
    expect(output).not.toMatch(/✗/);
  });
});

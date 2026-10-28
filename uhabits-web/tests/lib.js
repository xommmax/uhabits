// Shared by the Playwright UI tests: the browser to launch and the app's address.
const fs = require("fs");
const path = require("path");
// playwright-core is a dev dependency of the app
const pw = require(require.resolve("playwright-core", { paths: [__dirname, path.join(__dirname, "../app")] }));

const URL = process.env.APP_URL || "http://localhost:4173/";
const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Chromium (the installed Google Chrome on a Mac, else Playwright's) or WebKit, from ENGINE or [engine]. */
function launch(engine = process.env.ENGINE || "chromium") {
  if (engine === "webkit") return pw.webkit.launch();
  const executablePath = process.env.CHROME || (fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined);
  return pw.chromium.launch(executablePath ? { executablePath } : {});
}

/** Engines to test: ENGINES="chromium,webkit" (default both), leaving out WebKit when it isn't installed. */
function engines() {
  const wanted = (process.env.ENGINES || "chromium,webkit").split(",").map((e) => e.trim());
  return wanted.filter((e) => {
    if (e !== "webkit") return true;
    const ok = fs.existsSync(pw.webkit.executablePath());
    if (!ok) console.log("(WebKit is not installed: `npx playwright-core install webkit`; skipping it)");
    return ok;
  });
}

/** A fresh app in [browser], past the intro. */
async function openApp(browser, contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(URL);
  await page.waitForSelector(".intro, .topbar");
  await page.getByRole("button", { name: "Skip" }).click();
  return { context, page };
}

async function addHabit(page, name) {
  await page.getByLabel("Add habit").click();
  await page.getByText("Yes or No").click();
  await page.locator(".field-input").first().fill(name);
  await page.getByRole("button", { name: "Save" }).first().click();
  await page.waitForTimeout(400);
}

/** Tiny check/report helper: prints each check, and exits non-zero if any failed. */
function checker(title) {
  let pass = 0, fail = 0;
  const check = (name, ok, detail = "") => {
    ok ? pass++ : fail++;
    console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : "  -> " + detail}`);
  };
  const done = () => {
    console.log(`\n${title}: ${pass}/${pass + fail} passed`);
    process.exitCode = fail ? 1 : 0;
  };
  return { check, done };
}

module.exports = { pw, URL, launch, engines, openApp, addHabit, checker };

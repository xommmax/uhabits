const pw = require("playwright-core");
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${ok ? "" : "  -> " + d}`); };
(async () => {
  for (const engine of ["chromium", "webkit"]) {
    console.log(`# ${engine}`);
    const b = engine === "webkit" ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await c.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:4173/"); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
    await p.getByLabel("More options").click(); await p.getByRole("button", { name: "Settings" }).click();
    const [ch] = await Promise.all([p.waitForEvent("filechooser"), p.getByText("Import data").click()]);
    await ch.setFiles(process.argv[2]); await p.waitForTimeout(1500); await p.getByLabel("Back").click(); await p.waitForTimeout(500);
    await p.locator(".habit-name", { hasText: /^daily-random-2y$/ }).click(); await p.waitForTimeout(600);
    const chart = p.locator(".card", { hasText: "History" }).locator("canvas");
    const snap = () => chart.evaluate((cv) => cv.toDataURL());
    const swipe = async (dx, ms, holdMs = 0) => {
      await chart.scrollIntoViewIfNeeded(); const bx = await chart.boundingBox(); const x0 = bx.x + bx.width / 2 - dx / 2, y = bx.y + bx.height / 2;
      await p.mouse.move(x0, y); await p.mouse.down();
      const steps = 8;
      for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (dx * i) / steps, y); await p.waitForTimeout(ms > 100 ? ms / steps : 5); }
      if (holdMs) await p.waitForTimeout(holdMs);
      await p.mouse.up(); return snap(); // right after lifting
    };
    // fast swipe to the right = back in time
    const r1 = await swipe(220, 0);
    await p.waitForTimeout(300); const t300 = await snap();
    check("fast swipe keeps scrolling after the finger lifts", t300 !== r1, "no change after release");
    await p.waitForTimeout(2500); const a = await snap(); await p.waitForTimeout(400);
    check("…and comes to a stop", a === (await snap()), "still moving");
    // slow drag that stops before lifting: no coasting
    const r2 = await swipe(-120, 800, 120); await p.waitForTimeout(500);
    check("drag that stops before lifting does not coast", (await snap()) === r2);
    // fast swipe back towards today stops at today
    for (let i = 0; i < 4; i++) { await swipe(-250, 50); await p.waitForTimeout(150); }
    await p.waitForTimeout(2500);
    const end = await snap(); await swipe(-250, 50); await p.waitForTimeout(1500);
    check("coasting towards today stops at today", (await snap()) === end);
    // touching a coasting calendar (Edit view) only stops it
    await p.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }).click(); await p.waitForTimeout(300);
    const total = async () => Number((await p.locator(".overview-value").allInnerTexts())[3]);
    const before = await total();
    const ed = p.locator(".history-editor canvas"); const eb = await ed.boundingBox();
    await p.mouse.move(eb.x + 60, eb.y + 150); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(eb.x + 60 + i * 25, eb.y + 150); await p.waitForTimeout(7); }
    await p.mouse.up(); const c0 = await ed.evaluate((cv) => cv.toDataURL()); await p.waitForTimeout(60);
    const coasting = await ed.evaluate((cv) => cv.toDataURL());
    check("the calendar coasts after a fast swipe", coasting !== c0);
    await p.mouse.click(eb.x + 120, eb.y + 150); await p.waitForTimeout(150);
    const stopped = await ed.evaluate((cv) => cv.toDataURL()); await p.waitForTimeout(400);
    check("tap while coasting stops the calendar", stopped === (await ed.evaluate((cv) => cv.toDataURL())));
    await p.getByRole("button", { name: "Done" }).click(); await p.waitForTimeout(200);
    check("…without ticking a day", (await total()) === before, `${before} -> ${await total()}`);
    // a normal tap still ticks
    await p.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }).click(); await p.waitForTimeout(300);
    const eb2 = await p.locator(".history-editor canvas").boundingBox();
    await p.mouse.click(eb2.x + 60, eb2.y + 150); await p.waitForTimeout(200);
    await p.getByRole("button", { name: "Done" }).click(); await p.waitForTimeout(200);
    check("a normal tap still changes a day", (await total()) !== before);
    check("no page errors", errors.length === 0, errors.join(" | "));
    await b.close();
  }
  console.log(`\nfling checks: ${pass}/${pass + fail} passed`);
})();

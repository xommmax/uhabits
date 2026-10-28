// iOS fixes: the painted status band, no zoom, the confetti burst.
// Usage: node fixes.js <outDir>   (ENGINES=chromium,webkit; WebKit is closest to the iPhone)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { launch, engines, URL, checker } = require("./lib");
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "fixes-"));
const { check, done } = checker("fix checks");
(async () => {
 for (const engine of engines()) {
  console.log(`# ${engine}`);
  const b = await launch(engine);
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: engine === "chromium", hasTouch: true, timezoneId: "Europe/Madrid" });
  const p = await c.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(URL); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
  for (const [name, color] of [["Reading", 3], ["Vocal", 9]]) {
    await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
    await p.locator(".field-input").first().fill(name);
    await p.getByLabel("Change color").click(); await p.locator(".color-picker .swatch").nth(color).click();
    await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(500);
  }
  // What WebKit's fixedContainerEdges would find at the top edge: the element hit 4px below the top centre
  // [dialog]: a menu or dialog is open, which covers (and dims) the band by design (IOS-NOTES.md)
  const band = async (where, { dialog = false } = {}) => {
    const r = await p.evaluate(() => {
      const bands = [...document.querySelectorAll(".status-band")];
      bands.forEach((b) => (b.style.pointerEvents = "auto")); // WebKit's first pass ignores pointer-events
      const hit = document.elementFromPoint(innerWidth / 2, 4);
      bands.forEach((b) => (b.style.pointerEvents = ""));
      const bar = document.querySelector("header.topbar");
      const rect = hit?.getBoundingClientRect();
      return {
        isBand: !!hit?.classList.contains("status-band"), count: bands.length,
        width: rect?.width, height: rect?.height, vw: innerWidth,
        position: hit && getComputedStyle(hit).position,
        bandColor: hit && getComputedStyle(hit).backgroundColor,
        hitClass: hit?.className,
        barColor: bar && getComputedStyle(bar).backgroundColor,
      };
    });
    if (dialog) {
      check(`${where}: the dialog's overlay covers the band, which is still there`, !r.isBand && r.count === 1 && /overlay/.test(r.hitClass), JSON.stringify(r));
      return null;
    }
    check(`${where}: fixed band at the top edge in the toolbar colour`, r.isBand && r.count === 1 && r.position === "fixed" && r.height > 10 && r.width >= 0.9 * r.vw && r.bandColor === r.barColor && !/rgba\(.*, 0\)/.test(r.bandColor), JSON.stringify(r));
    // invisible: identical pixels with and without it
    await p.evaluate(() => document.activeElement?.blur()); // a blinking text cursor would differ between shots
    const a = await p.screenshot();
    await p.evaluate(() => document.querySelectorAll(".status-band").forEach((b) => (b.style.display = "none")));
    const bShot = await p.screenshot();
    await p.evaluate(() => document.querySelectorAll(".status-band").forEach((b) => (b.style.display = "")));
    const same = Buffer.compare(a, bShot) === 0;
    if (!same) { const f = `${engine}-${where.replace(/[^a-z]+/gi, "-")}`; fs.writeFileSync(`${OUT}/with-${f}.png`, a); fs.writeFileSync(`${OUT}/without-${f}.png`, bShot); }
    // Without a status-bar inset (here, and probably on the iPhone with the opaque status bar) the 12px band covers
    // the top 12px of the toolbar: anything drawn there (the edit screen's Save outline) is hidden. Reported, not failed.
    if (same) check(`${where}: band hides nothing (pixel-identical)`, true);
    else console.log(`  WARN ${where}: the band covers part of the toolbar's content (see ${OUT}/with-…png vs without-…png)`);
    return r.bandColor;
  };
  await band("list");
  await p.getByLabel("More options").click(); await p.waitForTimeout(200);
  await band("list with ⋮ menu open", { dialog: true }); await p.mouse.click(200, 800); await p.waitForTimeout(200);
  const nm = p.locator(".habit-name", { hasText: "Reading" });
  const bx = await nm.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 10); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); await p.waitForTimeout(200);
  await band("selection mode"); await p.getByLabel("Cancel").click().catch(() => {}); await p.waitForTimeout(200);
  await nm.click(); await p.waitForTimeout(500);
  const purple = await band("habit screen (Reading)");
  await p.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }).click(); await p.waitForTimeout(300);
  await band("habit screen with calendar editor open", { dialog: true }); await p.getByRole("button", { name: "Done" }).click();
  await p.getByLabel("Edit").click(); await p.waitForTimeout(300);
  await band("edit screen"); await p.getByLabel("Back").click(); await p.waitForTimeout(200);
  await p.getByLabel("Back").click(); await p.waitForTimeout(200);
  await p.locator(".habit-name", { hasText: "Vocal" }).click(); await p.waitForTimeout(400);
  const teal = await band("habit screen (Vocal)");
  check("band follows the habit colour", purple !== teal, `${purple} vs ${teal}`);
  await p.getByLabel("Back").click(); await p.waitForTimeout(200);
  await p.getByLabel("More options").click(); await p.getByRole("button", { name: "Settings" }).click(); await p.waitForTimeout(200);
  await band("settings");
  await p.getByLabel("Back").click(); await p.getByLabel("More options").click(); await p.getByRole("button", { name: "Dark theme" }).click(); await p.waitForTimeout(300);
  await band("list, dark theme");
  await p.getByLabel("More options").click(); await p.getByRole("button", { name: "Dark theme" }).click(); await p.waitForTimeout(300);

  // Zoom
  const z = await p.evaluate(() => {
    const ev = document.createEvent("Event"); ev.initEvent("gesturestart", true, true);
    const ev2 = document.createEvent("Event"); ev2.initEvent("gesturechange", true, true);
    document.querySelector(".topbar-title").dispatchEvent(ev); document.querySelector(".topbar-title").dispatchEvent(ev2);
    return { meta: document.querySelector('meta[name="viewport"]').content, touch: getComputedStyle(document.documentElement).touchAction,
      chartTouch: getComputedStyle(document.querySelector(".habit-row") ?? document.body).touchAction, gesturestart: ev.defaultPrevented, gesturechange: ev2.defaultPrevented };
  });
  check("viewport: maximum-scale=1, user-scalable=no", /maximum-scale=1/.test(z.meta) && /user-scalable=no/.test(z.meta), z.meta);
  check("page touch-action allows only panning (no pinch / double-tap zoom)", z.touch === "pan-x pan-y", z.touch);
  check("Safari pinch gestures are cancelled", z.gesturestart && z.gesturechange, JSON.stringify(z));

  // Confetti frames: tick Vocal's today cell and capture the burst
  const cell = p.locator(".habit-row", { hasText: "Vocal" }).locator(".check").last();
  const cb = await cell.boundingBox();
  await cell.click();
  const t0 = Date.now(); const shots = [];
  for (let i = 0; i < 9; i++) { await p.waitForTimeout(Math.max(0, i * 125 - (Date.now() - t0))); shots.push(await p.screenshot({ clip: { x: Math.max(0, cb.x + cb.width / 2 - 150), y: cb.y + cb.height / 2 - 150, width: 300, height: 300 } })); }
  shots.forEach((s, i) => fs.writeFileSync(`${OUT}/burst-${i}.png`, s));
  const gone = await p.waitForFunction(() => !document.querySelector("body > canvas"), null, { timeout: 4000 }).then(() => Date.now() - t0, () => -1);
  check("confetti canvas removed after the burst", gone > 0, String(gone));
  console.log(`  confetti finished after ~${gone} ms`);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await b.close();
 }
  done();
})();

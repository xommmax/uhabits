// Dragging the date header scrolls the list's days smoothly and settles on a whole day (dayScroll.ts).
// Usage: node dayscroll.js [outDir]   (screenshots go to outDir when given)
const { launch, openApp, addHabit, checker } = require("./lib");
const { check, done } = checker("day scroll checks");
const OUT = process.argv[2];

(async () => {
  const browser = await launch();
  const { page: p } = await openApp(browser, { viewport: { width: 390, height: 600 } });
  await addHabit(p, "Run");
  const visibleLabels = () => p.$$eval(".list-header .day-label", (els) => els.slice(1, -1).map((l) => l.innerText.replace(/\s+/g, " ").trim()));
  const shift = () => p.$eval(".habit-list", (e) => e.style.getPropertyValue("--day-shift"));
  const header = await p.locator(".list-header .days").boundingBox();
  const y = header.y + header.height / 2;
  const start = await visibleLabels();
  check("starts with today on the right", start.length === 4, start.join(" | "));
  const select = await p.$eval(".list-header", (e) => getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect);
  check("the dates can't be selected (a selection would turn the next drag into a native text drag)", select === "none", select);

  // Slow drag of 70 px to the right (older days come in from the left), holding still before lifting
  await p.mouse.move(header.x + 100, y);
  await p.mouse.down();
  for (let i = 1; i <= 16; i++) { await p.mouse.move(header.x + 100 + i * 5, y); await p.waitForTimeout(25); }
  const mid = await shift();
  check("mid-drag the days follow the finger by a fraction of a day", /^-?\d+(\.\d+)?px$/.test(mid) && mid !== "0px", mid);
  if (OUT) await p.screenshot({ path: `${OUT}/dayscroll-mid.png`, clip: { x: 0, y: 0, width: 390, height: 200 } });
  await p.waitForTimeout(200);
  await p.mouse.up();
  await p.waitForTimeout(600);
  const after = await visibleLabels();
  check("settles on a whole day (no shift left)", (await shift()) === "0px", await shift());
  check("moved back by one day (72 px minus the 8 px slop = 64 px ≈ 1.3 days → 1)", after[after.length - 1] === start[start.length - 2], `${start.join(" | ")} → ${after.join(" | ")}`);

  // The cells move with the labels: tapping the rightmost visible cell now ticks yesterday
  const cells = p.locator(".habit-row .check");
  await cells.nth(4).click();
  await p.waitForTimeout(300);
  await p.locator(".habit-name", { hasText: "Run" }).click();
  await p.waitForTimeout(500);
  const total = await p.locator(".overview-value").nth(3).innerText();
  check("the cell under a label is that label's day (one tick counted)", total === "1", total);
  await p.getByLabel("Back").click();
  await p.waitForTimeout(400);
  check("the scroll position is kept after visiting a habit", (await visibleLabels()).join() === after.join(), (await visibleLabels()).join(" | "));

  // A vertical move scrolls the page, not the days
  await p.mouse.move(header.x + 100, y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(header.x + 100 + i, y + i * 6);
  await p.mouse.up();
  await p.waitForTimeout(400);
  check("a vertical move doesn't scroll the days", (await visibleLabels()).join() === after.join());

  // Dragging far back stops at Android's 60 days
  for (let k = 0; k < 6; k++) {
    await p.mouse.move(header.x + 10, y);
    await p.mouse.down();
    for (let i = 1; i <= 20; i++) await p.mouse.move(header.x + 10 + i * 30, y);
    await p.mouse.up();
    await p.waitForTimeout(700);
  }
  const far = await visibleLabels();
  // The oldest day shown is 59 days ago (60 days in all, like Android's MAX_CHECKMARK_COUNT)
  const oldest = new Date(Date.now() - 59 * 86400000);
  const want = `${oldest.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${oldest.getDate()}`;
  check("can't scroll past 60 days in all (the oldest shown is 59 days ago)", far[0] === want, `${far.join(" | ")} (want ${want} first)`);
  // and back to today
  // (from the right edge of the screen to the left one: the drag continues outside the header)
  for (let k = 0; k < 10; k++) {
    await p.mouse.move(385, y);
    await p.mouse.down();
    for (let i = 1; i <= 20; i++) await p.mouse.move(385 - i * 19, y);
    await p.mouse.up();
    await p.waitForTimeout(700);
  }
  check("dragging the other way comes back to today, not past it", (await visibleLabels()).join() === start.join(), (await visibleLabels()).join(" | "));
  check("no page errors", p.errors.length === 0, p.errors.join(" | "));
  await browser.close();
  done();
})();

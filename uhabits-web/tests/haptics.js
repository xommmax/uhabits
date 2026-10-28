// Which haptic path runs (haptics.ts): the Vibration API where it exists (Android browsers), and on an iPhone
// (no Vibration API) the hidden iOS switch: inside each check cell for taps, a temporary one for other ticks.
// Usage: node haptics.js   (ENGINES=chromium,webkit; the iPhone path is also simulated in Chromium)
const { launch, engines, URL, checker } = require("./lib");
const { check, done } = checker("haptic checks");

// [engine, label, remove the Vibration API (like Safari)]
const setups = engines().flatMap((e) => (e === "chromium" ? [["chromium", "Android Chrome (vibrate)", false], ["chromium", "iPhone path, simulated", true]] : [["webkit", "WebKit, like Safari (no vibrate)", true]]));

(async () => {
  for (const [engine, label, noVibrate] of setups) {
    console.log(`# ${label}`);
    const b = await launch(engine);
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: engine === "chromium", hasTouch: true });
    await c.addInitScript((noVibrate) => {
      window.__h = [];
      if (noVibrate) delete Navigator.prototype.vibrate;
      if (navigator.vibrate) navigator.vibrate = (ms) => (window.__h.push(`vibrate ${ms}`), true);
      // Temporary switches clicked from code (haptics.ts) are recorded
      const click = HTMLLabelElement.prototype.click;
      HTMLLabelElement.prototype.click = function () {
        const sw = this.querySelector('input[type="checkbox"][switch]');
        window.__h.push(sw ? `switch label${this.isConnected ? "" : " (detached!)"}` : "label");
        return click.call(this);
      };
    }, noVibrate);
    const p = await c.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(URL); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
    await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
    await p.locator(".field-input").first().fill("A"); await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(500);
    const take = () => p.evaluate(() => window.__h.splice(0));
    await take();
    const cell = p.locator(".habit-row .check").nth(4); // today (4 visible days, one hidden on each side)
    const sw = cell.locator("input.haptic-switch");
    check("check cells have a hidden switch only on the iPhone path", (await sw.count()) === (noVibrate ? 1 : 0));
    const switchOn = async () => (noVibrate ? await sw.isChecked() : null);
    const before = await switchOn();
    await cell.click(); await p.waitForTimeout(100);
    let h = await take();
    if (noVibrate) {
      check("tick: the tap itself toggles the cell's switch (iOS plays its tick); nothing from code", h.length === 0 && (await switchOn()) !== before, `${h.join(", ")} switch ${before} → ${await switchOn()}`);
    } else {
      check(`tick vibrates 20 ms: ${h.join(", ")}`, h.join() === "vibrate 20", h.join());
    }
    check("…and the day is ticked", (await cell.innerText()).trim() === "");
    await cell.click(); await p.waitForTimeout(100);
    h = await take();
    check(`untick also: ${h.join(", ") || "switch toggled"}`, noVibrate ? h.length === 0 : h.join() === "vibrate 20", h.join());
    const bx = await cell.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 20); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); await p.waitForTimeout(200);
    h = await take();
    const want = noVibrate ? "switch label" : "vibrate 20";
    check(`long press (opens the popup): ${h.join(", ")}`, h.join() === want && (await p.locator(".entry-popup").count()) === 1, h.join());
    await p.mouse.click(10, 830); await p.waitForTimeout(200); await take();
    await p.locator(".habit-name").first().click(); await p.waitForTimeout(400);
    await p.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }).click(); await p.waitForTimeout(300);
    const eb = await p.locator(".history-editor canvas").boundingBox();
    await p.mouse.click(eb.x + 60, eb.y + 150); await p.waitForTimeout(200);
    h = await take();
    check(`day pressed in the calendar: ${h.join(", ")}`, h.join() === (noVibrate ? "switch label" : "vibrate 10"), h.join());
    await p.getByRole("button", { name: "Done" }).click(); await p.waitForTimeout(200); await take();
    await p.locator(".card", { hasText: "Score" }).locator("canvas").click(); await p.waitForTimeout(200);
    h = await take(); check("no tick when just tapping a chart", h.length === 0, h.join());
    check("no stray temporary switches left in the page", (await p.locator("head input[switch]").count()) === 0);
    check("no page errors", errors.length === 0, errors.join(" | "));
    await b.close();
  }
  done();
})();

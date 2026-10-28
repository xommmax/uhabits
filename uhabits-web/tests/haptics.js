const pw = require("playwright-core");
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${ok ? "" : "  -> " + d}`); };
(async () => {
  for (const engine of ["chromium", "webkit"]) {
    console.log(`# ${engine} (${engine === "webkit" ? "no Vibration API, like iOS Safari: switch-label path" : "Vibration API, like Android Chrome"})`);
    const b = engine === "webkit" ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: engine === "chromium", hasTouch: true });
    await c.addInitScript(() => {
      window.__h = [];
      if (navigator.vibrate) navigator.vibrate = (ms) => { window.__h.push(`vibrate ${ms}`); return true; };
      const click = HTMLLabelElement.prototype.click;
      HTMLLabelElement.prototype.click = function () {
        const sw = this.querySelector('input[type="checkbox"][switch]');
        window.__h.push(sw ? `switch label${this.isConnected ? "" : " (detached!)"}` : "label");
        return click.call(this);
      };
    });
    const p = await c.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:4173/"); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
    await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
    await p.locator(".field-input").first().fill("A"); await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(500);
    const take = () => p.evaluate(() => window.__h.splice(0));
    await take();
    const cell = p.locator(".habit-row .check").nth(2);
    await cell.click(); await p.waitForTimeout(100);
    const want = engine === "chromium" ? "vibrate 20" : "switch label";
    let h = await take(); check(`tick on a checkmark: ${h.join(", ")}`, h.join() === want, h.join());
    await cell.click(); await p.waitForTimeout(100);
    h = await take(); check(`untick also: ${h.join(", ")}`, h.join() === want, h.join());
    const bx = await cell.boundingBox(); await p.mouse.move(bx.x + 20, bx.y + 20); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up(); await p.waitForTimeout(200);
    h = await take(); check(`long press (opens the popup): ${h.join(", ")}`, h.join() === want && (await p.locator(".entry-popup").count()) === 1, h.join());
    await p.mouse.click(10, 830); await p.waitForTimeout(200); await take();
    await p.locator(".habit-name").first().click(); await p.waitForTimeout(400);
    await p.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }).click(); await p.waitForTimeout(300);
    const eb = await p.locator(".history-editor canvas").boundingBox();
    await p.mouse.click(eb.x + 60, eb.y + 150); await p.waitForTimeout(200);
    h = await take(); check(`day toggled in the calendar: ${h.join(", ")}`, h.join() === (engine === "chromium" ? "vibrate 10" : "switch label"), h.join());
    await p.getByRole("button", { name: "Done" }).click(); await p.waitForTimeout(200); await take();
    await p.locator(".card", { hasText: "Score" }).locator("canvas").click(); await p.waitForTimeout(200);
    h = await take(); check("no tick when just tapping a chart", h.length === 0, h.join());
    check("no stray switch elements left in the page", (await p.locator("input[switch]").count()) === 0);
    check("no page errors", errors.length === 0, errors.join(" | "));
    await b.close();
  }
  console.log(`\nhaptic checks: ${pass}/${pass + fail} passed`);
})();

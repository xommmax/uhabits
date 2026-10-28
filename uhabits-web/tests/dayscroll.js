const pw = require("playwright-core");
const OUT = process.argv[2];
(async () => {
  const b = await pw.chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const c = await b.newContext({ viewport: { width: 390, height: 600 } });
  const p = await c.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:4173/"); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
  await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
  await p.locator(".field-input").first().fill("Run");
  await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(500);
  const labels = () => p.$$eval(".list-header .days", (els) => {
    const box = els[0].getBoundingClientRect();
    return [Math.round(box.left), Math.round(box.width), ...[...els[0].querySelectorAll(".day-label")].map((l) => Math.round(l.getBoundingClientRect().left) + ":" + l.innerText.replace(/\s+/g, " ").trim())];
  });
  console.log("start:", await labels());
  const h = await p.locator(".list-header .days").boundingBox();
  const y = h.y + h.height / 2;
  // slow drag 70px toward older days (today is on the left by default -> drag left)
  await p.mouse.move(h.x + 150, y); await p.mouse.down();
  for (let i = 1; i <= 14; i++) { await p.mouse.move(h.x + 150 + i * 5, y); await p.waitForTimeout(30); }
  console.log("mid-drag shift:", await p.$eval(".habit-list", (e) => e.style.getPropertyValue("--day-shift")));
  await p.screenshot({ path: `${OUT}/mid.png`, clip: { x: 0, y: 0, width: 390, height: 200 } });
  await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(600);
  console.log("after release:", await labels(), "shift:", await p.$eval(".habit-list", (e) => e.style.getPropertyValue("--day-shift")));
  // check the first visible cell; its date should be the first label
  const first = "";
  const cells = p.locator(".habit-row .days .check");
  const box = await p.locator(".habit-row .days").first().boundingBox();
  await p.mouse.click(box.x + 24, box.y + 24); await p.waitForTimeout(400);
  await p.getByText("Run").click(); await p.waitForTimeout(800);
  const marked = await p.$$eval(".calendar, canvas", (e) => e.length);
  await p.goBack?.(); 
  console.log("first label:", first, "errors:", errors);
  await b.close();
})();

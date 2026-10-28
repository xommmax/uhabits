// Real offline: load the app, let the service worker take over, then the server is shut down and the app reloaded.
const pw = require("playwright-core");
const { execSync } = require("child_process");
(async () => {
  const name = process.argv[2];
  const b = name === "webkit" ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://localhost:4174/"); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
  await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
  await p.locator(".field-input").first().fill("Offline test"); await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(600);
  await p.locator(".habit-row .check").last().click(); await p.waitForTimeout(600);
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => {});
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload(); await p.waitForTimeout(1500); }
  console.log("service worker in control:", await p.evaluate(() => !!navigator.serviceWorker.controller));
  execSync("lsof -tiTCP:4174 -sTCP:LISTEN | xargs kill");
  await new Promise((r) => setTimeout(r, 1000));
  try { execSync("curl -s -m 2 http://localhost:4174/"); console.log("server still up?!"); } catch { console.log("server is down"); }
  try {
    await p.reload({ timeout: 15000 }); await p.waitForSelector(".habit-row", { timeout: 10000 });
    const rows = await p.locator(".habit-name").allInnerTexts();
    console.log(`${name}: app loaded offline, habits: ${rows.join(", ")}, today ticked: ${(await p.locator(".habit-row .check").last().innerText()).trim() !== ""}`);
    await p.locator(".habit-row .check").nth(0).click(); await p.waitForTimeout(800);
    await p.reload(); await p.waitForSelector(".habit-row", { timeout: 10000 });
    console.log(`${name}: change made offline survives a reload: ${await p.locator(".habit-row .check").nth(0).innerText() !== ""}`);
    await p.screenshot({ path: `${process.argv[3]}/offline-${name}.png` });
  } catch (e) { console.log(`${name}: FAILED offline: ${e.message.split("\n")[0]}`); }
  console.log("page errors:", errors.length ? errors : "none");
  await b.close();
})();

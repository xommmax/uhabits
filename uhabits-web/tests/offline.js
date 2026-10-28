// Real offline: the app is loaded, the service worker takes over, then the server is shut down and the app reloaded.
// Starts its own `vite preview` on port 4174 (needs a build: npm run build). Usage: node offline.js [outDir]
const { spawn } = require("child_process");
const path = require("path");
const { launch, engines, checker } = require("./lib");
const { check, done } = checker("offline checks");
const PORT = 4174;
const APP = `http://localhost:${PORT}/`;
const OUT = process.argv[2];

function startServer() {
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: path.join(__dirname, "../app"), stdio: "ignore", detached: true });
  return server;
}
async function waitFor(up) {
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(APP).then(() => true, () => false);
    if (ok === up) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
const stopServer = (server) => { try { process.kill(-server.pid); } catch { /* already gone */ } };

(async () => {
  for (const engine of engines()) {
    console.log(`# ${engine}`);
    const server = startServer();
    check("preview server started", await waitFor(true));
    const b = await launch(engine);
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(APP); await p.waitForSelector(".intro, .topbar"); await p.getByRole("button", { name: "Skip" }).click();
    await p.getByLabel("Add habit").click(); await p.getByText("Yes or No").click();
    await p.locator(".field-input").first().fill("Offline test"); await p.getByRole("button", { name: "Save" }).first().click(); await p.waitForTimeout(600);
    const today = p.locator(".habit-row .check").nth(4);
    await today.click(); await p.waitForTimeout(600);
    await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => {});
    if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload(); await p.waitForTimeout(1500); }
    check("service worker in control", await p.evaluate(() => !!navigator.serviceWorker.controller));
    stopServer(server);
    check("server is down", await waitFor(false));
    try {
      await p.reload({ timeout: 15000 }); await p.waitForSelector(".habit-row", { timeout: 10000 });
      check("the app loads with the server gone", (await p.locator(".habit-name").allInnerTexts()).join() === "Offline test");
      check("…with the data saved before", (await today.innerText()).trim() !== "" && (await today.innerText()).trim() !== "");
      const yesterday = p.locator(".habit-row .check").nth(3);
      await yesterday.click(); await p.waitForTimeout(800);
      await p.reload(); await p.waitForSelector(".habit-row", { timeout: 10000 });
      check("a change made offline survives a reload", (await yesterday.innerText()).trim() === "", await yesterday.innerText());
      if (OUT) await p.screenshot({ path: `${OUT}/offline-${engine}.png` });
    } catch (e) {
      check("works offline", false, e.message.split("\n")[0]);
    }
    check("no page errors", errors.length === 0, errors.join(" | "));
    await b.close();
  }
  done();
})();

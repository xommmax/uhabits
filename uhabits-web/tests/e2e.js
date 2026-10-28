// End-to-end UI tests for the web app, driven like a person would use it.
// Usage: node e2e.js <outDir>
const { URL, launch } = require("./lib");
const ENGINE = process.env.ENGINE || "chromium";
const fs = require("fs");
const OUT = process.argv[2];
const ANDROID = { viewport: { width: 411, height: 854 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "Europe/Berlin" };
const G = { check: "", times: "", skip: "", q: "" };

const results = [];
let current = "";
function check(name, ok, detail = "") {
  results.push({ group: current, name, ok: !!ok, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : "  -> " + detail}`);
}
async function group(name, fn) {
  current = name;
  console.log(`\n# ${name}`);
  try { await fn(); } catch (e) { check("no unexpected error", false, String(e.message).split("\n")[0]); }
}

async function newApp(browser, opts = {}, { skipIntro = true } = {}) {
  const context = await browser.newContext({ ...ANDROID, acceptDownloads: true, ...opts });
  await context.addInitScript(() => { navigator.canShare = () => false; });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/404|favicon/.test(m.text()) && page.errors.push(m.text()));
  page.on("dialog", (d) => (page.dialogAnswer === false ? d.dismiss() : d.accept()));
  await page.goto(URL);
  await page.waitForSelector(".intro, .topbar");
  if (skipIntro) await page.getByRole("button", { name: "Skip" }).click();
  return { context, page };
}
const tap = (loc) => loc.click();
async function longPress(page, loc, ms = 650) {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + Math.min(40, b.width / 2), b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(150);
}
async function createHabit(page, { name, numerical = false, color, freq, unit, target, atMost, question, notes, category }) {
  await tap(page.getByLabel("Add habit"));
  await tap(page.getByText(numerical ? "Measurable" : "Yes or No"));
  await page.locator(".field-input").first().fill(name);
  if (question) await page.locator("textarea.field-input").first().fill(question);
  if (color !== undefined) { await tap(page.getByLabel("Change color")); await tap(page.locator(".color-picker .swatch").nth(color)); }
  if (numerical) {
    if (unit) await page.getByPlaceholder("e.g. miles").fill(unit);
    if (target) await page.getByPlaceholder("e.g. 15").fill(String(target));
    if (atMost) { await tap(page.locator(".field-dropdown").nth(1)); await tap(page.getByRole("button", { name: "At most" })); }
  } else if (freq) {
    await tap(page.locator(".field-dropdown"));
    await freq(page);
    await tap(page.locator(".frequency-dialog").getByRole("button", { name: "Save" }));
  }
  if (notes) await page.getByPlaceholder("(Optional)").first().fill(notes);
  if (category) await page.getByPlaceholder("(Optional)").last().fill(category);
  await tap(page.getByRole("button", { name: "Save" }).first());
  await page.waitForTimeout(500);
}
const row = (page, name) => page.locator(".habit-row", { hasText: name });
async function cellState(page, name, col) {
  const c = cellAt(page, name, col);
  const text = (await c.innerText()).trim();
  if (text === G.check) return (await c.locator(".auto").count()) ? "auto" : "yes";
  if (text === G.times) return "no";
  if (text === G.skip) return "skip";
  if (text === G.q) return "unknown";
  return text; // number cells
}
// The day row renders one hidden day on each side of the visible ones (for smooth scrolling)
const columns = async (page) => (await page.locator(".list-header .day-label").count()) - 2;
const todayCol = async (page) => (await columns(page)) - 1; // days are reversed by default: today is on the right
/** Cell of habit [name] in visible column [col] (0 = leftmost visible day). */
const cellAt = (page, name, col) => row(page, name).locator(".check").nth(col + 1);
/** Visible day labels, left to right, like "WED 28". */
const dayLabels = async (page) => (await page.locator(".list-header .day-label").allInnerTexts()).slice(1, -1).map((t) => t.replace(/\s+/g, " ").trim());
async function openHabit(page, name) { await tap(page.locator(".habit-name", { hasText: name })); await page.waitForTimeout(400); }
async function overview(page) {
  const v = await page.locator(".overview-value").allInnerTexts();
  return { score: v[0], month: v[1], year: v[2], total: Number(v[3]) };
}
async function back(page) { await tap(page.getByLabel("Back")); await page.waitForTimeout(200); }
async function noOverflow(page, where) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check(`no sideways scrolling on ${where}`, w[0] <= w[1], `${w[0]} > ${w[1]}`);
}
async function openSettings(page) { await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Settings" })); await page.waitForTimeout(200); }
async function setSwitch(page, title, on) {
  const r = page.locator(".settings-row", { hasText: title });
  const isOn = (await r.locator(".switch").getAttribute("class")).includes("on");
  if (isOn !== on) await tap(r.locator(".switch"));
}
function userVersion(buf) { return buf.readUInt32BE(60); }
// Reads backup files with the app's sql.js (no sqlite3 command needed)
const initSqlJs = require(require.resolve("sql.js", { paths: [require("path").join(__dirname, "../app")] }));
let SQL;
async function sqlite(bytes) { SQL ??= await initSqlJs(); return new SQL.Database(bytes); }

(async () => {
  const browser = await launch(ENGINE);
  console.log(`engine: ${ENGINE} ${browser.version()}`);
  const { context, page } = await newApp(browser, {}, { skipIntro: false });

  await group("First run", async () => {
    check("intro is shown on first start", await page.locator(".intro").isVisible());
    let pages = 1;
    while (await page.getByRole("button", { name: "Next" }).count()) { await tap(page.getByRole("button", { name: "Next" })); pages++; }
    check(`intro pages: ${pages}`, pages >= 2);
    await tap(page.getByRole("button", { name: "Done" }));
    check("intro closes with Done", !(await page.locator(".intro").count()));
    await page.reload(); await page.waitForTimeout(600);
    check("intro does not come back after reload", !(await page.locator(".intro").count()));
    check("toolbar title is Alichka Habits 🩵", (await page.locator(".topbar-title").innerText()) === "Alichka Habits 🩵");
    check("empty list shows the star and message", (await page.locator(".empty p").innerText()) === "You have no active habits");
    check("5 day columns at S22 Ultra width", (await columns(page)) === 5);
    const labels = await dayLabels(page);
    const now = new Date();
    const todayLabel = `${now.toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Berlin" }).toUpperCase()} ${Number(now.toLocaleDateString("en-US", { day: "numeric", timeZone: "Europe/Berlin" }))}`;
    check("days in reverse order by default: today on the right", labels[4] === todayLabel, `${labels.join(" | ")} vs ${todayLabel}`);
    await noOverflow(page, "empty list");
  });

  await group("Create habits and validation", async () => {
    await tap(page.getByLabel("Add habit")); await tap(page.getByText("Yes or No"));
    await tap(page.getByRole("button", { name: "Save" }).first());
    check("saving without a name shows 'Cannot be blank'", await page.locator(".field-error").isVisible());
    check("stays on the edit screen", (await page.locator(".topbar-title").innerText()) === "Create habit");
    await back(page);
    await createHabit(page, {
      name: "Read", question: "Did you read today?", color: 11, notes: "20 pages", category: "Mind",
      freq: async (p) => { const r = p.locator(".frequency-row").nth(2); await r.locator(".frequency-input").fill("3"); await r.locator(".frequency-input").focus(); },
    });
    check("habit appears in the list", await row(page, "Read").isVisible());
    check("category header shown", (await page.locator(".category-header").allInnerTexts()).includes("Mind"));
    await createHabit(page, { name: "Water", numerical: true, unit: "l", target: 2, color: 9 });
    await createHabit(page, { name: "Sugar", numerical: true, unit: "cups", target: 1, atMost: true, color: 0 });
    await createHabit(page, { name: "Stretch", color: 4 });
    check("4 habits listed", (await page.locator(".habit-row").count()) === 4);
    await openHabit(page, "Read");
    const sub = await page.locator(".subtitle").innerText();
    check("detail shows question, frequency and category", sub.includes("Did you read today?") && sub.includes("3 times per week") && sub.includes("Mind"), sub.replace(/\n/g, " "));
    check("detail shows notes", (await page.locator(".notes").innerText()) === "20 pages");
    check("card order: Overview, Calendar, Score, History", (await page.locator(".card h2").allInnerTexts()).slice(0, 4).join(",") === "Overview,Calendar,Score,History");
    await noOverflow(page, "habit screen");
    await back(page);
    await openHabit(page, "Water");
    check("measurable: Calendar first, then Target", (await page.locator(".card h2").allInnerTexts()).slice(0, 2).join(",") === "Calendar,Target");
    check("measurable subtitle shows the target", (await page.locator(".subtitle").innerText()).includes("2 l"));
    await back(page);
  });

  await group("Check-ins on the list", async () => {
    const t = await todayCol(page);
    check("today starts unticked", (await cellState(page, "Stretch", t)) === "no");
    await tap(cellAt(page, "Stretch", t)); await page.waitForTimeout(150);
    check("tap ticks today (short press on by default)", (await cellState(page, "Stretch", t)) === "yes");
    await openHabit(page, "Stretch");
    let o = await overview(page);
    check("total = 1 after one tick", o.total === 1, JSON.stringify(o));
    check("score after one daily tick = 5%", o.score === "5%", o.score);
    await back(page);
    await tap(cellAt(page, "Stretch", t)); await page.waitForTimeout(150);
    check("second tap unticks", (await cellState(page, "Stretch", t)) === "no");
    for (let c = 0; c <= t; c++) { await tap(cellAt(page, "Stretch", c)); await page.waitForTimeout(80); }
    await openHabit(page, "Stretch");
    o = await overview(page);
    const expected = Math.round((1 - Math.pow(0.5, (t + 1) / 13)) * 100);
    check(`score after ${t + 1} daily ticks = ${expected}% (1 - 0.5^(n/13))`, o.score === `${expected}%`, o.score);
    check(`total = ${t + 1}`, o.total === t + 1);
    await back(page);
    await longPress(page, cellAt(page, "Read", t));
    check("long press opens the check-in popup", await page.locator(".entry-popup").isVisible());
    await page.locator(".popup-notes").fill("great chapter");
    await tap(page.locator(".entry-popup .popup-glyph").first());
    await page.waitForTimeout(150);
    check("popup tick saved", (await cellState(page, "Read", t)) === "yes");
    check("note dot shown", (await cellAt(page, "Read", t).locator(".notes-dot").count()) === 1);
    await longPress(page, cellAt(page, "Read", t));
    check("note kept when reopening", (await page.locator(".popup-notes").inputValue()) === "great chapter");
    await page.mouse.click(10, 840); await page.waitForTimeout(150);
    await tap(cellAt(page, "Water", t));
    check("measurable tap opens number popup", await page.locator(".popup-number input").isVisible());
    await page.locator(".popup-number input").fill("1.5");
    await tap(page.getByRole("button", { name: "Save" }));
    await page.waitForTimeout(150);
    check("measurable value shown as 1.5", (await cellAt(page, "Water", t).locator(".number").innerText()) === "1.5");
    await tap(cellAt(page, "Water", t - 1));
    await page.locator(".popup-number input").fill("2,25");
    await tap(page.getByRole("button", { name: "Save" })); await page.waitForTimeout(150);
    check("comma decimal accepted (2,25)", (await cellAt(page, "Water", t - 1).locator(".number").innerText()) === "2.25",
      await cellAt(page, "Water", t - 1).locator(".number").innerText());
    await openHabit(page, "Water");
    check("target card drawn", (await page.locator(".card", { hasText: "Target" }).locator("canvas").count()) === 1);
    await back(page);
    await noOverflow(page, "list with habits");
  });

  await group("Habit screen: calendar, periods, export, archive", async () => {
    await openHabit(page, "Stretch");
    const before = (await overview(page)).total;
    const cal = await page.locator(".card", { hasText: "Calendar" }).locator("canvas").boundingBox();
    await page.mouse.click(cal.x + cal.width - 70, cal.y + 50); await page.waitForTimeout(300);
    check("tapping the calendar card changes nothing", (await overview(page)).total === before);
    await tap(page.locator(".card", { hasText: "Calendar" }).getByRole("button", { name: "Edit" }));
    // The chart attaches its tap handler in an effect after the first paint: a tap within a few ms of opening
    // (machine speed, not human speed) is ignored, so wait like a person would.
    await page.waitForTimeout(100);
    const ed = await page.locator(".history-editor canvas").boundingBox();
    await page.screenshot({ path: `${OUT}/suite-editor-before.png` });
    await page.mouse.click(ed.x + 60, ed.y + 100); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/suite-editor-after.png` });
    await tap(page.getByRole("button", { name: "Done" }));
    check("Edit view tick counts (+1 total)", (await overview(page)).total === before + 1, `${before} -> ${(await overview(page)).total}`);
    await tap(page.locator(".spinner").first()); await tap(page.locator(".spinner-item", { hasText: "Month" }));
    check("score period switches to Month", (await page.locator(".spinner").first().innerText()).includes("Month"));
    await back(page); await openHabit(page, "Stretch");
    check("chosen period remembered", (await page.locator(".spinner").first().innerText()).includes("Month"));
    await tap(page.getByLabel("More options"));
    const [dl] = await Promise.all([page.waitForEvent("download"), tap(page.getByRole("button", { name: "Export" }))]);
    const zip = fs.readFileSync(await dl.path());
    check("CSV export downloads a zip", dl.suggestedFilename().endsWith(".zip") && zip.slice(0, 2).toString() === "PK", dl.suggestedFilename());
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Archive" }));
    await page.waitForTimeout(300);
    check("archive returns to the list", (await page.locator(".topbar-title").innerText()) === "Alichka Habits 🩵");
    check("archived habit hidden", !(await row(page, "Stretch").count()));
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Hide archived" }));
    check("shown again when 'Hide archived' is off", await row(page, "Stretch").isVisible());
    check("archived habit is dimmed", (await row(page, "Stretch").getAttribute("class")).includes("archived"));
    await longPress(page, page.locator(".habit-name", { hasText: "Stretch" }));
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Unarchive" }));
    await page.waitForTimeout(200);
    check("unarchive from selection menu", !(await row(page, "Stretch").getAttribute("class")).includes("archived"));
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Hide archived" }));
  });

  await group("Selection: colour, categories, delete", async () => {
    await longPress(page, page.locator(".habit-name", { hasText: "Stretch" }));
    check("selection toolbar shows count 1", (await page.locator(".topbar-title").innerText()) === "1");
    check("edit, colour, more buttons", (await page.locator(".topbar-right .bar-button").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label")))).join() === "Edit,Change color,More options");
    await tap(page.locator(".habit-name", { hasText: "Sugar" }));
    check("tapping another habit selects it (count 2, no edit)", (await page.locator(".topbar-title").innerText()) === "2" && !(await page.getByLabel("Edit").count()));
    await tap(page.getByLabel("Change color")); await tap(page.locator(".color-picker .swatch").nth(13));
    await page.waitForTimeout(200);
    const color = await page.locator(".habit-name", { hasText: "Stretch" }).locator("span").last().evaluate((e) => getComputedStyle(e).color);
    check("colour change applied", color === "rgb(94, 53, 177)", color);
    await longPress(page, page.locator(".habit-name", { hasText: "Stretch" }));
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Categorize" }));
    await page.locator(".dialog-input").fill("Body"); await tap(page.getByRole("button", { name: "Save" }));
    await page.waitForTimeout(200);
    check("categorize creates a category header", (await page.locator(".category-header").allInnerTexts()).includes("Body"));
    await tap(page.locator(".category-header", { hasText: "Body" })); await page.waitForTimeout(200);
    check("tapping a category header does nothing (easy to hit by accident)", (await page.locator(".dialog-input").count()) === 0);
    check("category header text can't be selected", (await page.locator(".category-header").first().evaluate((e) => getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect)) === "none");
    await longPress(page, page.locator(".category-header", { hasText: "Body" }));
    check("long press opens the rename dialog", (await page.locator(".dialog-input").count()) === 1);
    await page.locator(".dialog-input").fill("Fitness"); await tap(page.getByRole("button", { name: "Save" }));
    await page.waitForTimeout(200);
    check("rename category from its header", (await page.locator(".category-header").allInnerTexts()).includes("Fitness"));
    await createHabit(page, { name: "Temp" });
    await longPress(page, page.locator(".habit-name", { hasText: "Temp" }));
    page.dialogAnswer = false;
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Delete" }));
    page.dialogAnswer = true;
    check("cancelling delete keeps the habit", await row(page, "Temp").count() === 1);
    if ((await page.locator(".topbar-title").innerText()) !== "1") await longPress(page, page.locator(".habit-name", { hasText: "Temp" }));
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Delete" }));
    await page.waitForTimeout(200);
    check("confirmed delete removes the habit", !(await row(page, "Temp").count()));
  });

  await group("Sort and reorder", async () => {
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Sort" })); await tap(page.getByRole("button", { name: "By name" }));
    await page.waitForTimeout(200);
    const groups = await page.evaluate(() => {
      const out = [[]];
      for (const el of document.querySelectorAll(".habit-list > *")) {
        if (el.classList.contains("category-header")) out.push([]);
        else if (el.classList.contains("habit-row")) out[out.length - 1].push(el.querySelector(".habit-name span:last-child").textContent);
      }
      return out.filter((g) => g.length);
    });
    check("sort by name (inside each category group)", groups.every((g) => JSON.stringify(g) === JSON.stringify([...g].sort((a, b) => a.localeCompare(b)))), JSON.stringify(groups));
    const scoreGroups = () => page.evaluate(() => {
      const out = [[]];
      for (const el of document.querySelectorAll(".habit-list > *")) {
        if (el.classList.contains("category-header")) out.push([]);
        else if (el.classList.contains("habit-row")) {
          const arc = el.querySelectorAll(".ring circle")[1], r = Number(arc.getAttribute("r"));
          out[out.length - 1].push(Number(arc.getAttribute("stroke-dasharray").split(" ")[0]) / (2 * Math.PI * r));
        }
      }
      return out.filter((g) => g.length);
    });
    const sorted = (groups, dir) => groups.every((g) => g.every((v, i) => i === 0 || dir * (v - g[i - 1]) >= -1e-9));
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Sort" })); await tap(page.getByRole("button", { name: "By score" }));
    await page.waitForTimeout(200);
    const sc1 = await scoreGroups();
    const dir1 = sorted(sc1, 1) ? 1 : sorted(sc1, -1) ? -1 : 0;
    check("sort by score: scores ordered inside each category group", dir1 !== 0 && sc1.flat().some((v) => v > 0), JSON.stringify(sc1));
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Sort" })); await tap(page.getByRole("button", { name: "By score" }));
    await page.waitForTimeout(200);
    const sc2 = await scoreGroups();
    check("sort by score again reverses the order", dir1 !== 0 && sorted(sc2, -dir1), JSON.stringify(sc2));
    await tap(page.getByLabel("Filter")); await tap(page.getByRole("button", { name: "Sort" })); await tap(page.getByRole("button", { name: "Manually" }));
    await createHabit(page, { name: "Alpha" }); await createHabit(page, { name: "Beta" }); await createHabit(page, { name: "Gamma" });
    const order = async () => (await page.locator(".habit-name span:last-child").allInnerTexts()).filter((n) => ["Alpha", "Beta", "Gamma"].includes(n));
    check("new habits added at the end", (await order()).join() === "Alpha,Beta,Gamma", (await order()).join());
    const src = await page.locator(".habit-name", { hasText: "Gamma" }).boundingBox();
    const dst = await page.locator(".habit-name", { hasText: "Alpha" }).boundingBox();
    await page.mouse.move(src.x + 40, src.y + src.height / 2); await page.mouse.down(); await page.waitForTimeout(650);
    for (let i = 1; i <= 10; i++) await page.mouse.move(src.x + 40, src.y + src.height / 2 + ((dst.y - src.y - 10) * i) / 10);
    await page.mouse.up(); await page.waitForTimeout(300);
    check("drag Gamma above Alpha", (await order()).join() === "Gamma,Alpha,Beta", (await order()).join());
    if ((await page.locator(".topbar-title").innerText()) !== "Alichka Habits 🩵") await tap(page.getByLabel("Cancel"));
    await page.reload(); await page.waitForTimeout(800);
    check("order kept after reload", (await order()).join() === "Gamma,Alpha,Beta", (await order()).join());
  });

  await group("Settings", async () => {
    await openSettings(page);
    const sw = async (t) => (await page.locator(".settings-row", { hasText: t }).locator(".switch").getAttribute("class")).includes("on");
    check("defaults: short press on, reverse on", (await sw("Toggle with short press")) && (await sw("Reverse order of days")));
    check("default first day Monday", (await page.locator(".settings-row", { hasText: "First day" }).locator("select").evaluate((s) => s.options[s.selectedIndex].text)) === "Monday");
    const db = page.locator(".form-group").nth(1).locator(".settings-row");
    const titles = await db.evaluateAll((rows) => rows.map((r) => (r.querySelector(".settings-text > div") || r).textContent.trim()));
    check("backup settings order", titles.join(" | ").startsWith("Export full backup") && titles[titles.length - 1].startsWith("Include categories"), titles.join(" | "));
    await setSwitch(page, "Enable skip days", true);
    await setSwitch(page, "Show question marks", true);
    await setSwitch(page, "Reverse order of days", false);
    await back(page);
    const labels = (await dayLabels(page)).map((x) => x.split(" ")[0]);
    const today = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Europe/Berlin" }).toUpperCase();
    check("reverse off: today on the left", labels[0] === today, labels.join(","));
    check("question marks shown for days without data", (await cellState(page, "Beta", 1)) === "unknown");
    await tap(cellAt(page, "Beta", 0)); const s1 = await cellState(page, "Beta", 0);
    await tap(cellAt(page, "Beta", 0)); const s2 = await cellState(page, "Beta", 0);
    await tap(cellAt(page, "Beta", 0)); const s3 = await cellState(page, "Beta", 0);
    await tap(cellAt(page, "Beta", 0)); const s4 = await cellState(page, "Beta", 0);
    check("toggle cycle with skips and ?: yes → skip → no → ?", [s1, s2, s3, s4].join() === "yes,skip,no,unknown", [s1, s2, s3, s4].join());
    await openSettings(page);
    await setSwitch(page, "Toggle with short press", false);
    await back(page);
    await tap(cellAt(page, "Beta", 0));
    check("short press off: tap opens popup instead", await page.locator(".entry-popup").isVisible());
    await page.mouse.click(10, 840);
    await longPress(page, cellAt(page, "Beta", 0));
    check("short press off: long press ticks", (await cellState(page, "Beta", 0)) === "yes");
    await openSettings(page);
    await setSwitch(page, "Toggle with short press", true); await setSwitch(page, "Enable skip days", false);
    await setSwitch(page, "Show question marks", false); await setSwitch(page, "Reverse order of days", true);
    await back(page);
    await page.waitForFunction(() => !document.querySelector("body > canvas"), null, { timeout: 8000 }).catch(() => {});
    await tap(cellAt(page, "Gamma", await todayCol(page))); await page.waitForTimeout(150);
    check("confetti when ticking (animations on)", (await page.locator("body > canvas").count()) === 1);
    // canvas-confetti removes its canvas after 80 animation frames, so how long that takes depends on the frame rate
    const gone = await page.waitForFunction(() => !document.querySelector("body > canvas"), null, { timeout: 8000 }).then(() => true, () => false);
    check("confetti canvas removed afterwards", gone);
    await openSettings(page); await setSwitch(page, "Disable animations", true); await back(page);
    await tap(cellAt(page, "Alpha", await todayCol(page))); await page.waitForTimeout(150);
    check("disable animations: no confetti", (await page.locator("body > canvas").count()) === 0);
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Dark theme" }));
    await page.waitForTimeout(200);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check("dark theme", bg === "rgb(33, 33, 33)", bg);
    check("status bar colour black in dark theme", (await page.locator('meta[name="theme-color"]').getAttribute("content")) === "#000000");
    await openSettings(page); await setSwitch(page, "Use pure black", true); await back(page);
    check("pure black", (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(0, 0, 0)");
    await page.screenshot({ path: `${OUT}/dark-list.png` });
    await openSettings(page); await setSwitch(page, "Use pure black", false); await back(page);
    await tap(page.getByLabel("More options")); await tap(page.getByRole("button", { name: "Dark theme" }));
    check("back to light", (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== "rgb(33, 33, 33)");
  });

  let backupPath;
  await group("Backup, import, persistence, offline", async () => {
    await openSettings(page);
    check("Settings says 'No backup yet'", (await page.locator(".settings-row", { hasText: "Export full backup" }).innerText()).includes("No backup yet"));
    const [dl] = await Promise.all([page.waitForEvent("download"), tap(page.getByText("Export full backup"))]);
    backupPath = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(backupPath);
    const buf = fs.readFileSync(backupPath);
    check("backup file name like Android's", /^Loop Habits Backup \d{4}-\d{2}-\d{2} \d{6}\.db$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    check("backup is SQLite version 25", buf.slice(0, 15).toString() === "SQLite format 3" && userVersion(buf) === 25, String(userVersion(buf)));
    await page.waitForTimeout(200);
    check("Settings now says 'Last backup: today'", (await page.locator(".settings-row", { hasText: "Export full backup" }).innerText()).includes("Last backup: today"));
    const [csv] = await Promise.all([page.waitForEvent("download"), tap(page.getByText("Export as CSV"))]);
    check("CSV export from Settings", csv.suggestedFilename().endsWith(".zip"));
    await back(page);
    const snapshot = {};
    const numbers = async (p) => (await p.locator(".overview-value").allInnerTexts()).join(" ") + "|" + (await p.locator(".subtitle .subtitle-row span").first().innerText());
    for (const n of ["Read", "Water", "Sugar", "Stretch"]) { await openHabit(page, n); snapshot[n] = await numbers(page); await back(page); }
    await page.reload(); await page.waitForTimeout(800);
    let same = true;
    for (const n of Object.keys(snapshot)) { await openHabit(page, n); same &&= snapshot[n] === (await numbers(page)); await back(page); }
    check("all data kept after reload", same);
    // fresh install, import the backup
    const fresh = await newApp(browser);
    await openSettings(fresh.page);
    const [chooser] = await Promise.all([fresh.page.waitForEvent("filechooser"), tap(fresh.page.getByText("Import data"))]);
    await chooser.setFiles(backupPath); await fresh.page.waitForTimeout(1200);
    await back(fresh.page);
    const names = await fresh.page.locator(".habit-name span:last-child").allInnerTexts();
    check("import into a fresh app restores all habits", ["Read", "Water", "Sugar", "Stretch", "Alpha", "Beta", "Gamma"].every((n) => names.includes(n)), names.join(","));
    let identical = true;
    const mismatch = [];
    for (const n of Object.keys(snapshot)) { await openHabit(fresh.page, n); const v = await numbers(fresh.page); if (v !== snapshot[n]) mismatch.push(`${n}: ${snapshot[n]} vs ${v}`); await back(fresh.page); }
    check("imported habits show identical scores, totals and frequencies", mismatch.length === 0, mismatch.join(" ; "));
    check("default backup (Android 2.3.2 format) leaves categories out", (await fresh.page.locator(".category-header").count()) === 0);
    await openSettings(fresh.page);
    const [ch2] = await Promise.all([fresh.page.waitForEvent("filechooser"), tap(fresh.page.getByText("Import data"))]);
    await ch2.setFiles(backupPath); await fresh.page.waitForTimeout(1200); await back(fresh.page);
    check("importing again does not duplicate", (await fresh.page.locator(".habit-row").count()) === names.length);
    const [ch3] = await Promise.all([fresh.page.waitForEvent("filechooser"), openSettings(fresh.page).then(() => tap(fresh.page.getByText("Import data")))]);
    fs.writeFileSync(`${OUT}/not-a-backup.txt`, "hello");
    await ch3.setFiles(`${OUT}/not-a-backup.txt`); await fresh.page.waitForTimeout(800);
    check("importing a wrong file shows a message", (await fresh.page.locator(".toast").count()) === 1, await fresh.page.locator(".toast").allInnerTexts().then((t) => t.join()));
    await back(fresh.page);
    const after = await fresh.page.locator(".habit-name span:last-child").allInnerTexts();
    check("…and changes nothing", JSON.stringify(after) === JSON.stringify(names), after.join(","));
    let unchanged = true;
    for (const n of Object.keys(snapshot)) { await openHabit(fresh.page, n); unchanged &&= (await numbers(fresh.page)) === snapshot[n]; await back(fresh.page); }
    check("…and every habit still shows the same numbers", unchanged);
    check("no errors in the fresh app", fresh.page.errors.length === 0, fresh.page.errors.join(" | "));
    await fresh.context.close();
    // with "Include categories in backups" on, categories survive
    await openSettings(page); await setSwitch(page, "Include categories in backups", true);
    const [dl26] = await Promise.all([page.waitForEvent("download"), tap(page.getByText("Export full backup"))]);
    const path26 = `${OUT}/with-categories.db`; await dl26.saveAs(path26);
    check("backup with categories is version 26", userVersion(fs.readFileSync(path26)) === 26);
    await setSwitch(page, "Include categories in backups", false); await back(page);
    const fresh2 = await newApp(browser);
    await openSettings(fresh2.page);
    const [ch4] = await Promise.all([fresh2.page.waitForEvent("filechooser"), tap(fresh2.page.getByText("Import data"))]);
    await ch4.setFiles(path26); await fresh2.page.waitForTimeout(1200); await back(fresh2.page);
    const cats = await fresh2.page.locator(".category-header").allInnerTexts();
    check("backup with categories restores them", cats.includes("Mind") && cats.includes("Fitness"), cats.join(","));
    await fresh2.context.close();
    // offline (Playwright's simulated offline breaks WebKit's own reload; offline.js tests WebKit with the server really gone)
    if (ENGINE === "webkit") return;
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => {});
    await context.setOffline(true);
    await page.reload(); await page.waitForTimeout(1200);
    check("works offline after the first visit", (await page.locator(".habit-row").count()) >= 7);
    await context.setOffline(false);
  });

  await group("About and navigation", async () => {
    await tap(page.getByLabel("More options"));
    const items = await page.locator(".menu-item").allInnerTexts();
    check("⋮ menu: Dark theme, Settings, About", items.map((s) => s.trim()).join() === "Dark theme,Settings,About", items.join());
    await tap(page.getByRole("button", { name: "About" }));
    const lines = await page.locator(".about-header .muted").allInnerTexts();
    check("About shows version, credit line, description", lines.length === 3 && lines[1] === "by Masichek with Love", lines.join(" / "));
    await noOverflow(page, "About");
    await back(page);
    check("About → back returns to the list", (await page.locator(".topbar-title").innerText()) === "Alichka Habits 🩵");
    await openSettings(page); await tap(page.locator(".settings-row", { hasText: "About" })); await back(page);
    check("Settings → About → back returns to Settings", (await page.locator(".topbar-title").innerText()) === "Settings");
    await noOverflow(page, "Settings");
    await back(page);
    await openHabit(page, "Read"); const totalBefore = (await overview(page)).total; await tap(page.getByLabel("Edit"));
    check("edit screen pre-filled", (await page.locator(".field-input").first().inputValue()) === "Read");
    await tap(page.locator(".field-dropdown"));
    const r = page.locator(".frequency-row").nth(1); await r.locator(".frequency-input").fill("5"); await r.locator(".frequency-input").focus();
    await tap(page.locator(".frequency-dialog").getByRole("button", { name: "Save" }));
    await tap(page.getByRole("button", { name: "Save" }).first()); await page.waitForTimeout(300);
    check("frequency edited to every 5 days", (await page.locator(".subtitle").innerText()).includes("Every 5 days"));
    check("check-ins kept after editing (same total)", (await overview(page)).total === totalBefore, `${totalBefore} -> ${(await overview(page)).total}`);
    await noOverflow(page, "habit screen after edit");
    check("no console errors during the whole session", page.errors.length === 0, page.errors.join(" | "));
  });

  await context.close();

  await group("Backup reminder", async () => {
    const { context: c, page: p } = await newApp(browser);
    await createHabit(p, { name: "One" });
    check("no reminder on a new install", !(await p.locator(".banner").count()));
    await p.evaluate(() => localStorage.setItem("backup:firstUse", String(Date.now() - 15 * 86400000)));
    await p.reload(); await p.waitForTimeout(700);
    check("reminder after 14 days without backup", await p.locator(".banner").isVisible());
    await tap(p.getByRole("button", { name: "Not now" }));
    await p.reload(); await p.waitForTimeout(700);
    check("'Not now' hides it (for 3 days)", !(await p.locator(".banner").count()));
    await p.evaluate(() => localStorage.setItem("backup:snoozeUntil", String(Date.now() - 1000)));
    await p.reload(); await p.waitForTimeout(700);
    check("comes back after the snooze", await p.locator(".banner").isVisible());
    const [dl] = await Promise.all([p.waitForEvent("download"), tap(p.getByRole("button", { name: "Save a copy" }))]);
    await p.waitForTimeout(300);
    check("'Save a copy' saves a backup and hides the reminder", dl.suggestedFilename().endsWith(".db") && !(await p.locator(".banner").count()));
    await c.close();
  });

  await group("Hide completed", async () => {
    const { context: c, page: p } = await newApp(browser);
    await createHabit(p, { name: "Solo" });
    await tap(cellAt(p, "Solo", await todayCol(p)));
    await tap(p.getByLabel("Filter")); await tap(p.getByRole("button", { name: "Hide completed" }));
    check("done habit hidden, umbrella message", (await p.locator(".empty p").innerText()) === "You're all done for today!");
    await c.close();
  });

  await group("Dates: rollover at midnight, midnight delay, time zones, daylight saving", async () => {
    const label = async (p) => (await dayLabels(p)).at(-1);
    for (const [tz, iso, expect, note] of [
      ["Europe/Berlin", "2026-03-29T12:00:00+02:00", "SUN 29", "Berlin, day clocks go forward"],
      ["Europe/Berlin", "2026-10-25T12:00:00+01:00", "SUN 25", "Berlin, day clocks go back"],
      ["America/Los_Angeles", "2026-11-01T23:30:00-08:00", "SUN 1", "Los Angeles, late evening on DST change day"],
      ["Asia/Tokyo", "2026-12-31T23:50:00+09:00", "THU 31", "Tokyo, New Year's Eve"],
      ["Pacific/Kiritimati", "2026-06-15T00:10:00+14:00", "MON 15", "UTC+14, just after midnight"],
      ["Pacific/Pago_Pago", "2026-06-15T23:50:00-11:00", "MON 15", "UTC−11, just before midnight"],
    ]) {
      const context2 = await browser.newContext({ ...ANDROID, timezoneId: tz });
      await context2.addInitScript(() => { navigator.canShare = () => false; });
      const p = await context2.newPage();
      await p.clock.install({ time: new Date(iso) });
      await p.goto(URL); await p.getByRole("button", { name: "Skip" }).click();
      await createHabit(p, { name: "T" });
      const labels = await dayLabels(p);
      check(`${note}: today is ${expect}`, labels[4] === expect, labels.join(" | "));
      const nums = labels.map((l) => Number(l.split(" ")[1]));
      const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1 || nums[i] === 1);
      check(`${note}: 5 consecutive days, none skipped or repeated`, consecutive && new Set(labels).size === 5, labels.join(" | "));
      await tap(cellAt(p, "T", 4));
      const [dl] = await Promise.all([p.waitForEvent("download"), openSettings(p).then(() => tap(p.getByText("Export full backup")))]);
      const f = `${OUT}/tz-${tz.replace("/", "_")}.db`; await dl.saveAs(f);
      const ts = Number((await sqlite(fs.readFileSync(f))).exec("select timestamp from Repetitions")[0].values[0][0]);
      const stored = new Date(ts).toISOString().slice(0, 10);
      const want = new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
      check(`${note}: tick stored for the local date ${want}`, stored === want, `stored ${stored}`);
      await context2.close();
    }
    const c3 = await browser.newContext({ ...ANDROID, timezoneId: "Europe/Berlin" });
    const p3 = await c3.newPage();
    await p3.clock.install({ time: new Date("2026-10-27T23:58:30+01:00") });
    await p3.goto(URL); await p3.getByRole("button", { name: "Skip" }).click();
    await createHabit(p3, { name: "T" });
    check("before midnight: today TUE 27", (await label(p3)) === "TUE 27", await label(p3));
    await p3.clock.runFor(150_000); await p3.waitForTimeout(300);
    check("app open over midnight rolls over to WED 28", (await label(p3)) === "WED 28", await label(p3));
    await openSettings(p3); await setSwitch(p3, "Extend day", true); await back(p3);
    await p3.clock.runFor(60_000); await p3.waitForTimeout(300);
    check("'Extend day past midnight': 00:01 still counts as TUE 27", (await label(p3)) === "TUE 27", await label(p3));
    await p3.clock.runFor(3 * 3600_000); await p3.waitForTimeout(300);
    check("…and switches to WED 28 after 3:00", (await label(p3)) === "WED 28", await label(p3));
    await c3.close();
  });

  await group("Custom colours (1.0.10)", async () => {
    const { context: c, page: p } = await newApp(browser);
    await createHabit(p, { name: "Pink" });
    await openHabit(p, "Pink"); await tap(p.getByLabel("Edit"));
    await tap(p.getByLabel("Change color"));
    check("colour picker has 20 colours and Custom…", (await p.locator(".color-picker .swatches .swatch").count()) === 20 && (await p.getByText("Custom…").count()) === 1);
    await p.locator(".color-picker input[type=color]").fill("#ff69b4");
    await p.waitForTimeout(200);
    const button = await p.locator(".color-button").evaluate((e) => getComputedStyle(e).backgroundColor);
    check("custom colour shown on the colour button", button === "rgb(255, 105, 180)", button);
    await tap(p.getByRole("button", { name: "Save" }).first()); await p.waitForTimeout(300);
    const bar = await p.locator(".topbar").evaluate((e) => getComputedStyle(e).backgroundColor);
    check("habit screen toolbar in the custom colour", bar === "rgb(255, 105, 180)", bar);
    await back(p);
    const name = await p.locator(".habit-name span", { hasText: "Pink" }).evaluate((e) => getComputedStyle(e).color);
    check("list name in the custom colour", name === "rgb(255, 105, 180)", name);
    await tap(p.getByLabel("More options")); await tap(p.getByRole("button", { name: "Dark theme" })); await p.waitForTimeout(200);
    const darkName = await p.locator(".habit-name span", { hasText: "Pink" }).evaluate((e) => getComputedStyle(e).color);
    check("dark theme: the custom colour is lightened (#ffb4da)", darkName === "rgb(255, 180, 218)", darkName);
    await openHabit(p, "Pink"); await tap(p.getByLabel("Edit"));
    const editBar = await p.locator(".topbar").evaluate((e) => getComputedStyle(e).backgroundColor);
    check("dark theme: the edit toolbar is in the habit's colour too", editBar === "rgb(255, 105, 180)", editBar);
    await back(p); await back(p);
    await tap(p.getByLabel("More options")); await tap(p.getByRole("button", { name: "Dark theme" }));
    // the backup keeps it (web-only table) and stays Android-compatible (palette colour = nearest)
    await openSettings(p);
    const [dl] = await Promise.all([p.waitForEvent("download"), tap(p.getByText("Export full backup"))]);
    const file = `${OUT}/custom-colour.db`; await dl.saveAs(file);
    const db = await sqlite(fs.readFileSync(file));
    check("backup: Habits.color is the nearest palette colour (pink, 15)", db.exec("select color from Habits where name='Pink'")[0].values[0][0] === 15);
    check("backup: the custom colour is in WebCustomColors", db.exec("select color from WebCustomColors")[0].values[0][0] === 0xff69b4);
    const fresh = await newApp(browser);
    await openSettings(fresh.page);
    const [ch] = await Promise.all([fresh.page.waitForEvent("filechooser"), tap(fresh.page.getByText("Import data"))]);
    await ch.setFiles(file); await fresh.page.waitForTimeout(1200); await back(fresh.page);
    const imported = await fresh.page.locator(".habit-name span", { hasText: "Pink" }).evaluate((e) => getComputedStyle(e).color);
    check("import into a fresh app keeps the custom colour", imported === "rgb(255, 105, 180)", imported);
    await fresh.context.close();
    check("no console errors", p.errors.length === 0, p.errors.join(" | "));
    await c.close();
  });

  await group("Import of an old Loop backup", async () => {
    const ASSETS = require("path").join(__dirname, "../../uhabits-core/assets/test");
    const importFile = async (p, file) => {
      await openSettings(p);
      const [ch] = await Promise.all([p.waitForEvent("filechooser"), tap(p.getByText("Import data"))]);
      await ch.setFiles(file);
      await p.locator(".toast").waitFor({ timeout: 5000 }).catch(() => {});
      const toast = await p.locator(".toast").allInnerTexts();
      await back(p);
      return toast.join();
    };
    const { context: c, page: p } = await newApp(browser);
    check("a 2016 Loop backup (database v12) imports", (await importFile(p, `${ASSETS}/loop.db`)) === "Import successful");
    await tap(p.getByLabel("Filter")); await tap(p.getByRole("button", { name: "Hide archived" }));
    check("…with all its 9 habits", (await p.locator(".habit-row").count()) === 9, String(await p.locator(".habit-row").count()));
    check("…the first is 'Wake up early', 3 times per week", (await p.locator(".habit-name span").first().innerText()) === "Wake up early");
    await openHabit(p, "Wake up early");
    check("…with its history", Number((await p.locator(".overview-value").allInnerTexts())[3]) > 0);
    await back(p);
    check("no console errors", p.errors.length === 0, p.errors.join(" | "));
    await c.close();
  });

  await group("Imports from other apps", async () => {
    const ASSETS = require("path").join(__dirname, "../../uhabits-core/assets/test");
    const importFile = async (p, file) => {
      await openSettings(p);
      const [ch] = await Promise.all([p.waitForEvent("filechooser"), tap(p.getByText("Import data"))]);
      await ch.setFiles(file);
      await p.locator(".toast").waitFor({ timeout: 5000 }).catch(() => {});
      const toast = await p.locator(".toast").allInnerTexts();
      await back(p);
      return toast.join();
    };
    const { context: c, page: p } = await newApp(browser);
    check("Rewire import", (await importFile(p, `${ASSETS}/rewire.db`)) === "Import successful");
    await openHabit(p, "brush teeth");
    check("Rewire check-ins show right away, without reopening the app", Number((await p.locator(".overview-value").allInnerTexts())[3]) > 0);
    await back(p);
    check("Tickmate import", (await importFile(p, `${ASSETS}/tickmate.db`)) === "Import successful");
    await openHabit(p, "Vegan");
    check("Tickmate check-ins show right away", Number((await p.locator(".overview-value").allInnerTexts())[3]) > 0);
    await back(p);
    check("HabitBull CSV import", (await importFile(p, `${ASSETS}/habitbull.csv`)) === "Import successful");
    check("a text file is not recognized", (await importFile(p, `${ASSETS}/hello.txt`)) === "File not recognized");
    check("no console errors", p.errors.length === 0, p.errors.join(" | "));
    await c.close();
  });

  await group("Measurable numbers like Android", async () => {
    const { context: c, page: p } = await newApp(browser);
    await createHabit(p, { name: "Km", numerical: true, unit: "km", target: 10 });
    const t = await todayCol(p);
    for (const [typed, shown] of [["12.04", "12.0"], ["12", "12"], ["0.5", "0.5"], ["1500", "1.5k"]]) {
      await tap(cellAt(p, "Km", t)); await p.locator(".popup-number input").fill(typed);
      await tap(p.getByRole("button", { name: "Save" })); await p.waitForTimeout(150);
      const v = await cellAt(p, "Km", t).locator(".number").innerText();
      check(`${typed} is shown as ${shown}`, v === shown, v);
    }
    await c.close();
  });

  await group("iPhone size (390 × 844)", async () => {
    const { context: c, page: p } = await newApp(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    check("4 day columns on iPhone", (await columns(p)) === 4);
    await createHabit(p, { name: "🧘🏻 Meditation with a really long name that wraps", color: 11, category: "Mind" });
    await createHabit(p, { name: "Run", numerical: true, unit: "km", target: 5 });
    await noOverflow(p, "iPhone list"); await p.screenshot({ path: `${OUT}/iphone-list.png` });
    await openHabit(p, "Meditation"); await noOverflow(p, "iPhone habit screen"); await p.screenshot({ path: `${OUT}/iphone-habit.png` });
    await tap(p.getByLabel("Edit")); await noOverflow(p, "iPhone edit screen");
    await tap(p.locator(".field-dropdown")); await p.screenshot({ path: `${OUT}/iphone-frequency.png` }); await p.mouse.click(10, 830);
    await back(p); await back(p);
    await openSettings(p); await noOverflow(p, "iPhone settings");
    check("no console errors on iPhone size", p.errors.length === 0, p.errors.join(" | "));
    await c.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 1));
  console.log(`\nUI checks: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

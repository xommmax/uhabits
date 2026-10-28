# Architecture

## The big picture

```
┌──────────────── Preact UI (uhabits-web/app/src, TypeScript) ────────────────┐
│ ListScreen  HabitScreen  EditScreen  SettingsScreen  AboutScreen  Intro      │
│ components.tsx (TopBar, Menu, Spinner, Chart canvas)  popups.tsx  styles.css │
│ platform helpers: core.ts storage.ts backup.ts prefs.ts theme.ts haptics.ts  │
│                   dayScroll.ts fling.ts confetti.ts format.ts                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ import { openHabitsCore } from "habits-core"
┌──────────────────────────────▼─── Kotlin bridge (uhabits-web/src/jsMain) ────┐
│ HabitsCore.kt   @JsExport API: list, toggle, save, charts, import/export     │
│ ChartHandle.kt  core chart Views drawn on a <canvas>, click/scroll forwarding│
│ AndroidCharts.kt ports of Android-only charts (score, frequency, streak, …)  │
│ CustomColors.kt colors outside Loop's palette (web-only table)               │
│ WebDatabase.kt  sql.js adapter that survives export()                        │
│ WebPlatform.kt  resource files, localStorage-backed Preferences              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Kotlin/JS IR, compiled together
┌──────────────────────────────▼─── uhabits-core (unchanged upstream code) ────┐
│ models (Habit, Entry, Frequency, scores, streaks), commands, importers,       │
│ exporters, presenters, chart Views drawing on platform Canvas (JsCanvas)     │
└──────────────────────────────────────────────────────────────────────────────┘
          sql.js (SQLite in WebAssembly) ── bytes saved to IndexedDB
```

The rule: **business logic lives in core, and the bridge only adapts it.** If Android computes something in
`uhabits-core`, call it through the bridge rather than reimplementing it in TypeScript. Android-only logic (in
`uhabits-android`) is ported. Kotlin goes into `AndroidCharts.kt` when it draws; otherwise the port goes to TypeScript with a
comment naming the Android source it copies (e.g. `// Same rule as ListHabitsRootView.getCheckmarkCount`).

## Build pipeline

1. `./gradlew :uhabits-web:jsBrowserProductionLibraryDistribution` (`npm run core`) compiles `uhabits-web` +
   `uhabits-core` with Kotlin/JS IR into an ES module at
   `uhabits-web/build/dist/js/productionLibrary/habits-core.mjs`, with TypeScript definitions
   (`generateTypeScriptDefinitions()`). Kotlin/JS npm deps (sprintf-js, jszip…) are pinned by the root
   `kotlin-js-store/yarn.lock`. **Keep it committed.** Without it, CI resolves packages on every build and
   once failed on a yarn registry 502.
2. Vite (`app/vite.config.ts`) aliases `habits-core` to that file and dedupes its npm imports. It also injects
   `__BUILD_INFO__` (package.json version, git commit, build time; shown on the About screen), and
   uses `BASE_PATH` (`/uhabits/` on GitHub Pages).
3. vite-plugin-pwa generates the manifest and a Workbox service worker that precaches everything (js, css,
   wasm, fonts, png), so the app works fully offline. `registerType: "autoUpdate"`: a new deploy replaces the
   old cache the next time the app is opened.
4. SQL migrations are not copied by Gradle. `core.ts` bundles `uhabits-core/assets/main/migrations/*.sql`
   through `import.meta.glob(..., "?raw")` and passes them to Kotlin as a `resources` map.

## Startup (`main.tsx` → `core.ts`)

1. Register the service worker, record the first-use time (for the backup reminder), apply default prefs
   (`prefs.ts applyDefaults`), apply the theme, and ask for persistent storage.
2. Wait for the chart fonts (NotoSans, NotoSansBold, FontAwesome from core's assets): core's `JsCanvas`
   draws text with them, so the first chart draw needs them ready.
3. `startCore`: init sql.js → `loadDatabase()` from IndexedDB → `openHabitsCore(SQL, bytes, migrations)`.
   A new DB starts at version 8 and is migrated to core's `DATABASE_VERSION` (26), exactly like Android.
4. Persistence: `WebDatabase.onWrite` fires after every non-SELECT statement. `core.ts` debounces it
   (300 ms) and saves `core.snapshot()` (the whole DB as bytes) to IndexedDB, and flushes immediately when
   the page is hidden. A save error shows an alert asking to back up.

## Kotlin bridge (`uhabits-web/src/jsMain/kotlin/org/isoron/uhabits/web`)

### HabitsCore.kt: the API used by the UI
One instance, built by `openHabitsCore`. It owns the `WebDatabase`, `SQLModelFactory`, `HabitList`,
`Preferences` (backed by localStorage), themes, and `CustomColors`. Methods return plain JS objects
(`dynamic`) whose shapes are declared in `app/src/types.ts`. Keep those two in sync.

- **Dates** cross the bridge as `Int` days since 2000-01-01 (core's `LocalDate.daysSince2000`).
  `format.ts formatDay` converts them for display.
- **Entry values** are core's: `-1` unknown, `0` no, `1` yes (auto), `2` yes (manual), `3` skip. Measurable
  habits store thousandths (`value / 1000`).
- `listHabits(search, days, firstDaysAgo)`: filtered and sorted like Android's list (filters and sort
  order are in Preferences). Each row has `values/notes/completed[i]` for the day `firstDaysAgo + i`
  days before today, so the scrolled list loads only the days it shows.
- Mutations go through **core Commands** (`CreateRepetitionCommand`, `EditHabitCommand`,
  `ReorderHabitCommand`, …) via `execute()`, the same commands Android runs. Commands update the
  cached computed entries/scores.
- `toggle` uses `Entry.nextToggleValue` with the skip/question-mark preferences, like Android's short toggle.
- Charts: `historyChart/barChart/scoreChart/frequencyChart/streakChart/targetChart(canvas, id, dark, …)`
  return a `ChartHandle`. Spinner positions are saved in Preferences, as on Android.
- `exportBackup(includeCategories)`: copies the DB. Unless categories are wanted, it **drops `Habits.category`
  and sets version 25**, because released Android (2.3.2) rejects v26. Then `VACUUM`.
  Setting: "Include categories in backups" (`web_backup_categories`).
- `importBackup(bytes)`: core's `GenericImporter` (Loop `.db`, Rewire, Tickmate, HabitBull CSV). It
  **merges** by habit UUID, like Android's "Import data". Then it imports custom colors from the file (see below).
- `exportCsv(ids)`: core's `HabitsCSVExporter` zip.
- `refreshToday()` is called every minute and on visibility change, so the day rolls over while the app stays open
  (honours the midnight-delay pref). `applyPreferences()` recomputes after first-weekday/midnight changes.

### WebDatabase.kt: the sql.js adapter
Implements core's `Database`/`PreparedStatement` on sql.js. **Trap:** sql.js `db.export()` frees
every prepared statement, but core's repositories cache theirs forever. `WebDatabase` therefore keeps a
`generation` counter, and each statement re-prepares itself (and re-binds) when the generation changed.
Never call the raw sql.js `export()` on the live DB anywhere else. `onWrite` is fired for non-read statements.

### WebPlatform.kt
`BundledResourceFile`/`WebFileOpener` serve the bundled migrations and an in-memory `JsFileStorage`, which the
importers use to read the uploaded file. `LocalStoragePreferences` stores core's `Preferences` in
localStorage under `pref:<android key>`. The UI reads the same keys (`prefs.ts`), so Kotlin and TS share
settings. Preferences are not in backups (same as Android).

### ChartHandle.kt + AndroidCharts.kt: charts
Core's chart `View`s (HistoryChart, BarChart) draw on core's `Canvas`, implemented for HTML canvas by core's
`JsCanvas`. Charts that exist only in `uhabits-android` (Score, Frequency, Streak, Target) are **ported to Kotlin**
in `AndroidCharts.kt` and drawn through the same Canvas, so they look identical. `ChartPalette` mirrors
Android's `?attr/contrastNN` colours for light/dark/pure-black.

`ChartHandle` exposes `draw()` (sizes the canvas for devicePixelRatio), `click/longClick(x, y)`,
`scrollBy(columns)` (DataView `dataOffset`), `columnWidth`, and callbacks `setOnEdited`/`setOnPopup`. The
calendar (HistoryChart) toggles a day or asks the app to show the check-in popup, with the same short/long
press rules as Android's `HistoryCardPresenter`.

### CustomColors.kt: colours outside the 20-colour palette (web only)
Loop stores a habit's colour as a palette index (0–19, `Habits.color`). The web app adds "Custom…" (the
native `<input type=color>`):
- A web-only table `WebCustomColors(habit_uuid, color, palette_index)` holds the RGB. Android ignores unknown
  tables, so backups stay valid.
- `Habits.color` is set to the **nearest palette colour (CIELAB distance)**, so Android, sorting by colour
  and anything palette-based still behave sensibly.
- A row applies only while the habit's palette index still equals the stored `palette_index`. If the colour
  was changed elsewhere (Android, or picking a palette colour), the row is stale and ignored.
- Dark theme colour = custom colour mixed 50% with white (approximates Loop's dark palette).
- Charts get the colour through per-habit `Theme` subclasses (`lightTheme/darkTheme`). Core's `PureBlackTheme`
  is final, hence `CustomPureBlackTheme`, which `ChartPalette` also recognises.
- Import: for each habit in the imported Loop file, the file's custom colour wins (or is cleared if the
  file has none, e.g. an Android backup).
- `habitSummary` returns `colorLight`, `colorDark` (already resolved) and `customColor`. **The UI must always use
  `colorLight/colorDark`, never `PALETTE[colorIndex]`**, except in the colour picker itself.

## UI (`uhabits-web/app/src`)

Plain Preact with hooks, with no router or state library. `App.tsx` keeps a `route` state (`types.ts Route`) and a
`rev` counter. Screens call core synchronously during render, so after a mutation they call `refresh()`
(bumps `rev`), and everything re-reads from core. Simple and fast enough (core caches computed data).

| File | Role |
|---|---|
| `main.tsx` | Startup (see above), blocks pinch-zoom gestures, fatal-error screen |
| `core.ts` | sql.js + bridge startup, debounced persistence |
| `storage.ts` | IndexedDB get/put of the DB bytes (`loop-habits` / `files` / `uhabits.db`), `persist()` |
| `App.tsx` | Routing, toast, day rollover timer, intro on first run |
| `ListScreen.tsx` | Main list: toolbar/selection mode, rows, category headers, check cells, drag-to-reorder, backup banner, hints, filter/sort menus, bulk colour/category/archive/delete |
| `HabitScreen.tsx` | Habit detail: overview ring, target, calendar (+ full editor), score, history bars, streaks, frequency, notes; edge swipe back |
| `EditScreen.tsx` | Create/edit form like `EditHabitActivity`: name, colour, question, frequency dialog, measurable unit/target, category chips, notes |
| `SettingsScreen.tsx` | Android's settings minus reminders/widgets, plus backup/CSV/import/repair |
| `AboutScreen.tsx`, `Intro.tsx` | Android's About (plus build info) and intro slides |
| `components.tsx` | `TopBar` (+ status band), `BarIcon`, `Menu`, `Spinner`, `Ring`, `Chart` (canvas with drag/fling/tap/long-press) |
| `popups.tsx` | `usePress` (tap vs 500 ms long press), check-in popups (`CheckmarkDialog`/`NumberDialog` ports), `HabitTypePicker`, `ColorPicker`, `celebrate` |
| `dayScroll.ts` | Smooth drag-and-snap of the list's days (see below) |
| `fling.ts` | Port of `android.widget.Scroller` fling spline + Android's LSQ2 velocity estimator |
| `confetti.ts` | Port of Konfetti 2.0.2 burst Android shows when checking a habit |
| `haptics.ts` | Vibration API on Android browsers; iOS switch trick on iPhone (see IOS-NOTES.md) |
| `theme.ts` | Light/dark/auto (`pref_theme`, port of `ThemeSwitcher`), pure black, `useDarkMode` |
| `prefs.ts` | localStorage prefs shared with Kotlin, app defaults |
| `backup.ts` | Backup reminder (14 days, snooze 3), share sheet export, CSV export, file picker |
| `format.ts` | Dates, frequency text, short numbers, Entry constants, light `PALETTE` |
| `styles.css` | All styles. CSS variables per theme on `:root` / `[data-theme]` / `.pure-black` |

### Main list details
- **Columns**: `useDayColumns` = Android's `getCheckmarkCount` (name takes max(1/3 width, 160px); 48px per day,
  3–14 days). Day order is reversed by default (today on the right, `pref_checkmark_reverse_order`).
- **Day scrolling** (`dayScroll.ts`): like Android, dragging the **date header** scrolls all rows back in time.
  Unlike Android's jump-per-day, it moves with the finger and settles on a whole day (Android fling curve
  stretched to land on a day, or a 220 ms ease-out). Position is in px. The list renders the current
  whole-day offset ±1 hidden day, and the sub-day remainder is the CSS variable `--day-shift` on `.habit-list`,
  applied by `.days-track { transform }`. Limit: 60 days in total, like Android's `MAX_CHECKMARK_COUNT`.
  Slop 8px; a mostly-vertical move lets the page scroll instead. The position is kept in a module variable
  so returning from a habit doesn't jump back to today.
- **Check cells**: `usePress` gives tap and long press. With `pref_short_toggle` (default on), tap toggles
  and long press opens the popup; measurable habits always open the popup. Toggling to YES_MANUAL fires
  confetti. On an iPhone each cell is a `<label>` containing a hidden `<input type=checkbox switch>`
  for haptics.
- **Reorder**: long-press a name (500 ms) → selection + drag. Only in manual sort order. Rows shift with
  transforms, and the drop calls `core.move`. A non-passive `touchmove` listener stops iOS scrolling while dragging.
- **Categories**: headers between groups (like `HabitCardListAdapter.buildRows`); long press renames.
- The header row is sticky under the toolbar. `TopBar` publishes its height as `--topbar-height`.

### Theme and colours
CSS variables match core's `LightTheme`/`DarkTheme` so cards and charts agree. `theme.ts` sets
`data-theme` on `<html>` when the user overrides the system, toggles `.pure-black`, and updates
`meta[theme-color]`. Charts take `dark: boolean` and are re-created when it changes (`deps`).

## Data compatibility checklist (don't break these)
- Never change core's schema. Web-only data goes into web-only tables (like `WebCustomColors`) or localStorage.
- Default backups must be **v25** without the `category` column. Test: export → import into the Android app.
- Import must keep working for Android v25/v26 backups and for our own exports (round trip identical).
- Prefs use Android's key names, so behaviour matches when reading Android code.

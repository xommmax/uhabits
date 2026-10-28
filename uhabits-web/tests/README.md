# Tests

Three layers, from fast to slow. None of them run in CI (the deploy workflow only builds), so run them by hand,
at least before a risky deploy.

| Layer | Where | What it needs | Command (in `uhabits-web/app`) | Time |
|---|---|---|---|---|
| Unit | `app/test/unit` | `npm install` only (no Kotlin build) | `npm run test:unit` | ~10 s |
| Bridge | `app/test/bridge` + the Node scripts here | the Kotlin build (`npm run core`) | `npm run test:bridge` | ~15 s |
| UI | the Playwright scripts here | Kotlin build + Chromium | `npm run test:ui` | ~6 min |

`npm test` runs unit + bridge. `npm run test:coverage` shows the unit tests' coverage of `app/src` (about 99% of lines).

Last result (2026-10-28, 1.0.12): unit 347, bridge 82 (including bridge.mjs 123/123, customcolor.mjs, imports.mjs),
UI 233 checks in Chromium. All pass.

## Unit tests (`app/test/unit`, Vitest + happy-dom)
Every source file of `app/src` except `main.tsx`. Screens run against `fake-core.ts`, an in-memory stand-in for
`HabitsCore` whose methods are all `vi.fn`, so tests check both what is shown and what the UI asked core to do.
`habits-core-stub.ts` replaces the Kotlin build, so these run on a fresh checkout.

| File | Covers |
|---|---|
| `format.test.ts` | Day labels, `frequencyText` (Android's wording), `shortNumber` (core's `toShortString`), palette |
| `fling.test.ts` | Scroller port against Android's formulas, LSQ2 release velocity |
| `dayScroll.test.tsx` | Drag/slop/settle/fling of the day header, limits, position kept between visits |
| `prefs.test.ts`, `theme.test.tsx` | Android keys and app defaults; ThemeSwitcher transitions, `data-theme`, pure black |
| `backup.test.ts`, `storage.test.ts`, `core.test.ts` | Reminder timing, file names, share sheet/download; IndexedDB; startup and debounced saving |
| `haptics.test.ts`, `confetti.test.ts` | Vibrate vs iOS switch; Konfetti burst, colours, cleanup |
| `popups.test.tsx`, `components.test.tsx` | Tap/long press, check-in and number popups, colour picker; Ring, TopBar, Menu, Spinner, Chart gestures |
| `ListScreen`, `EditScreen`, `HabitScreen`, `SettingsScreen`, `App` `.test.tsx` | Each screen's behaviour, menus, dialogs, validation, navigation, day rollover |

## Bridge tests (`app/test/bridge`, Vitest in Node, real Kotlin core on sql.js)
`helpers.ts` opens the built core like `core.ts` does, plus a recording canvas so charts draw in Node.

| File | Covers |
|---|---|
| `habits.test.ts` | Database creation/migration/snapshot, create/edit, toggle cycles, windows of days, filters, every sort order, reorder, categories, hints, midnight and midnight delay |
| `backup.test.ts` | v25/v26 export, round trips, merge by UUID, unknown files; core's ImportTest fixtures (Loop 2016/v21/v22, Rewire, Tickmate, HabitBull) through the web's file plumbing; CSV zip |
| `charts.test.ts` | All six charts in light/dark, colours, scrolling, spinners, calendar tap/long press rules |
| `scripts.test.ts` | Runs the Node scripts below and checks they pass |

### Node scripts (also run by `scripts.test.ts`)
| Script | Checks | Run (in `tests`) |
|---|---|---|
| `bridge.mjs` | Every frequency type, scores against an independent re-implementation, streaks, measurable habits, backup round trip. Writes backups and numbers to `<out>` for the JVM cross-check | `node bridge.mjs <out>` |
| `customcolor.mjs` | Custom colours: nearest palette index, dark variant, backups, Android-style import, stale rows, bulk change, delete | `node customcolor.mjs` |
| `imports.mjs` | Imports files (paths, or names in core's test assets; all of core's fixtures by default), then a v25 round trip | `node imports.mjs [file…]` |

## UI tests (Playwright, against `vite preview`)
`run-ui.js` starts `vite preview` on :4173 (unless running), runs every script and prints a summary.
`lib.js` picks the browser: the installed Google Chrome on a Mac, otherwise Playwright's Chromium (`CHROME=<path>`
to override). `ENGINES=chromium,webkit` chooses engines; WebKit is skipped when not installed
(`npx playwright-core install webkit`). `playwright-core` is an app dev dependency.

| Script | Checks |
|---|---|
| `e2e.js` | The full suite (166 checks): first run, create/edit/delete, toggles, popups, measurable habits, categories, sorting, filters, reorder, charts, settings, backup export/import, time zones and midnight, custom colours, old Loop and other apps' imports, number display. `node e2e.js <out>` |
| `dayscroll.js` | Dragging the dates moves the days smoothly, snaps to a day, keeps the cells aligned, stops at 60 days and at today |
| `haptics.js` | Vibrate on Android; on the iPhone path (no Vibration API, also simulated in Chromium) the cell's own switch and the temporary one |
| `fixes.js` | Status band (painted, in the toolbar colour, covered by dialogs, hiding nothing of the toolbar), zoom blocking, confetti |
| `flingtest.js` | Chart fling. Makes its own data with `bridge.mjs`, or `node flingtest.js <backup.db>` |
| `offline.js` | Works offline after the service worker installs: starts its own server on :4174, stops it, reloads |

## Testing tips learned the hard way
- Playwright mouse moves can't exceed ~1200 px/s. Test the fling velocity estimator in Node, not by flicking.
- Playwright's fake clock gives wrong rAF timestamps. Step animations manually.
- `setOffline` breaks WebKit reloads. Kill the server instead (as `offline.js` does).
- Charts must be scrolled into view before interacting. Taps within ~10 ms of opening the calendar editor are
  ignored (the handler attaches after paint), which is a test artefact.
- WebKit `innerText` adds trailing spaces to day labels. Trim them.
- The list renders one hidden day on each side of the visible ones: visible column `c` is `.check` number `c + 1`
  (`cellAt` and `dayLabels` in `e2e.js`).
- Selected text turns a mouse drag into a native drag (`pointercancel`). The date header is `user-select: none`.
- The Kotlin core checks `instanceof CanvasRenderingContext2D`; the Node canvas in `bridge/helpers.ts` fakes that.
- Plain Node can't resolve the Kotlin output's npm imports; `scripts.test.ts` links `app/node_modules` next to it.
- iOS-only behaviour (real status bar, haptics, share sheet, colour sheet) can only be checked on a real iPhone.

## Building the Kotlin core in a restricted network
`npm run core` needs Google's Maven (the root build declares the Android plugin) and Maven Central. Where
`dl.google.com` is blocked or Maven Central rate-limits (HTTP 429), build only core + web: temporarily remove the
`agp` and `ksp` plugin lines from the root `build.gradle.kts` and `:uhabits-android` from `settings.gradle.kts`, use
an init script that puts `https://maven-central.storage-download.googleapis.com/maven2/` first, and add
`-x kotlinNpmInstall -x kotlinStoreYarnLock` (Karma, a test-only package, comes from codeload.github.com). Revert
the two files afterwards. Not needed on the owner's Mac or in CI.

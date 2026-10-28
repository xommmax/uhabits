# Tests

Scripts written while building and verifying the web app. Not wired into CI. Run them by hand when a
change is risky. Output folders are passed as arguments.

## Setup

```bash
cd uhabits-web/app && npm install && npm run core && npm run build   # the Node tests need build/dist + node_modules
npm run preview &                                                    # the UI tests expect http://localhost:4173
cd ../tests && npm install --no-save playwright-core@1.48.2          # UI tests only
```

UI tests launch the installed Google Chrome (`/Applications/Google Chrome.app`, macOS path; change it on other
systems) or Playwright WebKit (`ENGINE=webkit`, needs `npx playwright-core install webkit`).

## Node tests (no browser; fast, run these first)

| Script | Checks | Run |
|---|---|---|
| `bridge.mjs` | The built bridge on sql.js: every frequency type, scores against an independent re-implementation, streaks, measurable habits, backup v25/v26 round trip, re-import doesn't duplicate. Writes backups and numbers to `<out>` | `node bridge.mjs <out>` |
| `customcolor.mjs` | Custom colours: nearest palette index, display, dark variant, backup round trip, Android-style import resets them, stale rows ignored, bulk change, delete | `node customcolor.mjs` |
| `imports.mjs` | Imports given Loop/Rewire/Tickmate/HabitBull files, then checks they survive a v25 export→import round trip | `node imports.mjs file1.db …` |

Last result (2026-10-28, 1.0.11): bridge 123/123, customcolor all pass.

## UI tests (Playwright, against `vite preview`)

| Script | Checks |
|---|---|
| `e2e.js` | The full suite (~140 checks): create/edit/delete, toggles, popups, measurable habits, categories, sorting, filters, reorder, charts, settings, backup export/import, time zones. `node e2e.js <out>`; `ENGINE=webkit` for WebKit |
| `dayscroll.js` | Dragging the date header moves the days smoothly and snaps to a whole day |
| `flingtest.js` | Chart fling distances/behaviour. Needs a backup file with data: `node flingtest.js <backup.db>` |
| `haptics.js` | Which haptic path runs (vibrate vs iOS switch) |
| `fixes.js` | Status band, zoom blocking, confetti (WebKit) |
| `offline.js` | Works offline after the service worker installs: serve on :4174, `node offline.js chromium <out>`. The script kills the server, then reloads |

**Caveat:** `e2e.js`, `haptics.js` and `fixes.js` last passed at 1.0.4–1.0.6. Later changes (status band
painted, check cells as labels with switches, day header track, custom colour row) probably need
selector or expectation updates before they pass again. Fix the tests, not the app, unless the failure is real.

## Testing tips learned the hard way
- Playwright mouse moves can't exceed ~1200 px/s. Test the fling velocity estimator in Node, not by flicking.
- Playwright's fake clock gives wrong rAF timestamps. Step animations manually.
- `setOffline` breaks WebKit reloads. Kill the server instead (as `offline.js` does).
- Charts must be scrolled into view before interacting. Taps within ~10 ms of opening the calendar editor are
  ignored (the handler attaches after paint), which is a test artefact.
- WebKit `innerText` adds trailing spaces to day labels. Trim them.
- iOS-only behaviour (status bar, haptics, share sheet, colour sheet) can only be checked on a real iPhone.

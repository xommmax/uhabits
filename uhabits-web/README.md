# Alichka Habits: Loop Habit Tracker for iPhone (web app)

An installable web app (PWA) that runs Loop Habit Tracker on an iPhone. It reuses the Android app's
shared Kotlin module, `uhabits-core`, compiled to JavaScript, so scores, streaks, frequencies and charts
are computed by the same code as on Android. The UI is a small Preact app that copies the Android app's
look and behaviour.

- Live: https://xommmax.github.io/uhabits/ (deployed by GitHub Actions on every push to `web-pwa`)
- Data stays on the phone: a SQLite database (sql.js/WebAssembly) saved in IndexedDB.
- Backups use the same `.db` format as Android's "Export full backup". They are exported at database version
  25, so the released Android app (2.3.2) can import them, and Android backups can be imported here.
- No server, no account, no notifications (iOS web apps can't do Loop-style reminders reliably).

More documentation:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it works, file by file
- [docs/IOS-NOTES.md](docs/IOS-NOTES.md): Safari/iOS quirks and workarounds
- [docs/HISTORY.md](docs/HISTORY.md): versions, decisions, open questions
- [tests/README.md](tests/README.md): tests

## Layout

```
uhabits-web/
  build.gradle.kts            Kotlin/JS module (depends on :uhabits-core)
  src/jsMain/kotlin/…/web/    Kotlin bridge: HabitsCore (the API the UI calls), DB adapter, charts, custom colors
  app/                        Preact + TypeScript UI, built with Vite and vite-plugin-pwa
    index.html                iOS meta tags (status bar, home-screen title, no zoom)
    vite.config.ts            PWA manifest, service worker, build info, "habits-core" alias
    src/                      screens, components, platform helpers (see ARCHITECTURE.md)
    public/                   icons, intro images
    test/unit, test/bridge    Vitest: UI logic with a fake core; the real Kotlin core in Node (npm test)
  tests/                      Node scripts and Playwright UI tests (npm run test:ui); README explains all tests
  docs/                       this documentation
```

## Build and run

Needs JDK 17 and Node 22.

```bash
cd uhabits-web/app
npm install
npm run core      # compiles the Kotlin bridge into ../build/dist/js/productionLibrary
npm run build     # type-checks and builds the PWA into dist/
npm run preview   # serves dist/ on http://localhost:4173
```

Run `npm run core` again after changing any Kotlin code (in `uhabits-web` or `uhabits-core`).
`npm run dev` also works, but the service worker and some iOS behaviour only show up in a built `preview`.

CI (`.github/workflows/web-pages.yml`) does the same on Ubuntu: Gradle builds the bridge (Kotlin/JS
packages pinned by `kotlin-js-store/yarn.lock`, which must stay committed), then `npm ci && npm run build`
with `BASE_PATH=/uhabits/`, then it publishes `app/dist` to GitHub Pages.

## Releasing a version

1. Bump `version` in `app/package.json` and `app/package-lock.json`, and commit.
2. Push `web-pwa`. The site updates in 3–5 minutes. The installed app picks up the new service worker the next time
   it is opened (`registerType: autoUpdate`); closing and reopening it once more may be needed.
3. Check the version in the app: menu → About (version, commit, build time).

## Installing on iPhone

Open the site in Safari → Share → **Add to Home Screen**. iOS never refreshes a home-screen icon or the
status-bar style of an installed app. To pick up changes to those: back up, delete the app, re-add it, import.

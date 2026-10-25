# Loop Habit Tracker — web (iPhone PWA)

An installable web app that reuses `uhabits-core` (compiled to JavaScript) with a Preact UI.
Data stays on the device (SQLite via sql.js, saved in IndexedDB). Backups are the same
`.db` format as Loop for Android, exported at database version 25 so the released Android
app (2.3.2) can import them.

## Layout

- `src/jsMain/kotlin` — Kotlin bridge (`HabitsCore`) exposing core to JavaScript
- `app/` — Preact + TypeScript app built with Vite and vite-plugin-pwa

## Build and run

Needs JDK 17 and Node 22.

```bash
cd uhabits-web/app
npm install
npm run core      # compiles the Kotlin bridge into ../build/dist/js/productionLibrary
npm run build     # type-checks and builds the PWA into dist/
npm run preview   # serves dist/ on http://localhost:4173
```

Run `npm run core` again after changing any Kotlin code.

## Installing on iPhone

Open the hosted URL in Safari → Share → **Add to Home Screen**.

# CLAUDE.md: start here

This repo is a fork of [Loop Habit Tracker](https://github.com/iSoron/uhabits) (Android, Kotlin). On the
`web-pwa` branch it also contains **uhabits-web**, an iPhone web app (PWA) called **"Alichka Habits"**. The
owner built it for their wife, who has an iPhone and wanted Loop. It is private, for one person.
Live at https://xommmax.github.io/uhabits/.

Everything you need to work on the web app is in these files. Read them before changing anything:

| File | What's in it |
|---|---|
| `uhabits-web/README.md` | What the app is, how to build, run and install it |
| `uhabits-web/docs/ARCHITECTURE.md` | How it works: Kotlin bridge, data flow, every source file, key mechanisms |
| `uhabits-web/docs/IOS-NOTES.md` | iPhone/Safari quirks and the workarounds in the code (status bar, haptics, zoom, storage) |
| `uhabits-web/docs/HISTORY.md` | Version history, decisions and the reasons for them, what is still unverified |
| `uhabits-web/tests/README.md` | Test scripts (Node bridge tests + Playwright UI tests) and how to run them |

## Branches and deploying

- `dev`: upstream Loop. **Don't change `uhabits-core` or `uhabits-android`**; the web app only adds
  `uhabits-web/`, `.github/workflows/web-pages.yml`, `kotlin-js-store/yarn.lock` and one line in
  `settings.gradle.kts`, so upstream merges stay easy.
- `web-pwa`: the web app. **Every push to it deploys to the live site**, and the installed app updates
  itself on the iPhone. The deploy runs only when a push touches `uhabits-web/**`, `uhabits-core/**`,
  `kotlin-js-store/**` or the workflow.
- `web-pwa-stable`: the last known-good version (1.0.6 at the time of writing). Move it only when the owner asks.

## Working rules (from the owner)

1. **Work directly on `web-pwa`**, not on a separate `claude/...` session branch: check it out at the start and
   commit there. **Never push to it without an explicit "deploy"** from the owner. Committing locally is fine.
   "Sounds good" about a plan is not approval. (Owner's choice, 2026-10-28: keep the deploy gate.)
2. Bump `version` in `uhabits-web/app/package.json` (and `package-lock.json`) for every deploy. The About
   screen shows the version, commit and build time, so the owner can tell which build is installed.
3. After pushing, say which version/commit was pushed. Don't poll CI unless asked.
4. Keep it lean: don't run the whole test suite after every small change; test risky changes and say so.
   Don't produce review pages/artifacts unless asked.
5. The look follows the **official Android app 1:1** (sizes in dp = CSS px). When in doubt, read the Android
   source in `uhabits-android/` and port its behaviour, constants and wording. iOS-specific choices are
   listed in `docs/HISTORY.md`.
6. Backups must stay importable by the released Android app (database v25). See ARCHITECTURE.md → Backups.

## Quick commands

```bash
# Needs JDK 17 and Node 22. On the owner's Mac:
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=~/Library/Android/sdk
cd uhabits-web/app
npm install
npm run core      # Kotlin bridge → uhabits-web/build/dist/js/productionLibrary (rerun after Kotlin changes)
npm run build     # tsc + vite → dist/
npm run preview   # http://localhost:4173
node ../tests/bridge.mjs /tmp/out   # quick logic check without a browser
```

Owner's machine quirk: `~/.npm` has root-owned files. Use `npm --cache <some temp dir> install`.

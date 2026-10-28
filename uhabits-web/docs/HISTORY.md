# History and decisions

## Why this exists
The owner uses Loop on Android. Their wife has an iPhone, and Loop has no iOS app. Goal: the same app for
the wife, private, with backups interchangeable with Android (to check correctness and to migrate later to an
official iOS app if one appears). Started 2026-10-25, built with Claude Code.

## Settled decisions (don't re-ask)
- **Stack:** reuse `uhabits-core` via Kotlin/JS + a thin `@JsExport` bridge + Preact/TypeScript. Core is left
  untouched so upstream merges stay easy.
- **Hosting:** GitHub Pages from the owner's fork (`xommmax/uhabits`), deployed by Actions on push to `web-pwa`.
- **Backups:** byte-compatible SQLite `.db` (Android backups are raw DB copies). Export **v25** (drop
  `category`) because Android 2.3.2 rejects newer versions. Optional v26 with categories in Settings. Switch the
  default to v26 once Android releases it. Import = core's importers, merging by UUID.
- **Scope:** everything in Android's app except reminders/notifications, widgets, Tasker, sync, translations
  (English only), search, Help & FAQ.
- **Look:** since 2026-10-26, the official Android app **1:1**. Android dp = CSS px; reference screenshots came from a
  Galaxy S22 Ultra (411×854 @2.625). Kept on purpose: blue tint for selected habits, card styling/titles on the
  habit screen, Calendar card after Overview (first for measurable habits).
- **Name:** "Alichka Habits" (home screen and title); list toolbar title "Alichka Habits 🩵".
- **Defaults** (`prefs.ts applyDefaults`): tap toggles (short toggle on), days in reverse order (today right),
  week starts Monday.
- **Icons:** from Android's adaptive `ic_launcher_foreground` on #1976D2. Regular icons = centre 288px crop,
  maskable = centre 330px crop (launchers crop ~13%).
- **Backup reminder:** gentle banner after 14 days without a backup, "Save a copy" → share sheet. No tutorials.

## Versions
| Version | Date | What |
|---|---|---|
| (MVP) | 2026-10-25 | Bridge + Preact app, all detail charts, popups, measurable habits, categories, settings, importers |
| 1.0.0 | 2026-10-27 | Release after a deep test pass (JVM vs JS numbers identical, backups verified with Android) |
| 1.0.1 | 10-27 | iOS 27 status-bar band, no zoom, Konfetti port, sticky day row |
| 1.0.2 | 10-27 | Chart fling (Android Scroller), smooth confetti, 🩵 title |
| 1.0.3 | 10-27 | Android LSQ2 fling velocity, haptics, confetti 3D flip speed |
| 1.0.4 | 10-27 | Rename category by long press only |
| 1.0.5 | 10-27 | Day-row shadow, outlined auto checks |
| 1.0.6 | 10-27 | Softer day-row shadow (tuned against Android pixels). |
| 1.0.7 | 10-27 | Paint the status band (invisible band didn't work on iOS 27) |
| 1.0.8 | 10-27 | `apple-mobile-web-app-status-bar-style` = black (needs re-install) |
| 1.0.9 | 10-27 | iPhone haptics via real hidden switches in check cells |
| 1.0.10 | 10-28 | Custom habit colours; habit-coloured edit toolbar in dark mode too |
| 1.0.11 | 10-28 | Smooth drag-and-snap day scrolling on the date header, 60-day limit; CI lockfile fix |
| 1.0.12 | 10-28 | Test suite (unit, bridge, UI) and fixes it found: old Loop backups (before DB v24) failed to import; Rewire/Tickmate check-ins only showed after reopening; failed imports said nothing; numbers like 12.04 showed "12" (Android: "12.0"); dates in the header were selectable; the status band cropped the top of the edit screen's Save button (now 32px tall instead of Android's 36dp). **`web-pwa-stable` points here** |

Owner confirmed on Android: confetti, vibration, and fling feel identical to Android. On the iPhone everything in
1.0.11 was reported working by the owner (2026-10-28).

## Things tried and dropped
- Swiping anywhere on the check cells to page through days: dropped. The owner preferred Android's
  behaviour (drag only the date header), made smooth.
- Invisible status band (background-clip:text): iOS 27 ignored it. Painted band instead.
- `black-translucent` status bar: caused the iOS 27 blur. Switched to `black`.
- Programmatic switch click for iOS haptics: silent on iOS 27. Real tap on a label instead.
- Redmean RGB distance for nearest palette colour mapped hot pink to grey. CIELAB is used instead.

## Open items / ideas
- Calendar-day haptics on iPhone (calendar is a canvas, so the label/switch trick doesn't apply directly).
- CI: `ubuntu-latest` is moving to a newer image, and some actions are on deprecated Node versions. Pin
  `ubuntu-24.04` and bump actions if builds break.
- When Android releases DB v26, make v26 (with categories) the default backup.
- Tests don't run in CI. Running `npm test` in the deploy workflow before the build would stop a broken deploy.
- WebKit UI tests were not run in the cloud session that wrote them (WebKit not installed); run with
  `ENGINES=webkit` on the Mac.

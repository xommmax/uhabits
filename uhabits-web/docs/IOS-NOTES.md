# iPhone / Safari notes

What we learned while making a home-screen web app feel native on iOS (iOS 27 on the owner's wife's iPhone).
Each item names the code that handles it.

## Status bar (iOS 27)
- **Problem:** iOS 27 blurs/gradients the status bar of home-screen web apps over scrolling content.
- WebKit (`LocalFrameView::fixedContainerEdges`) instead paints the status bar in the colour of a **fixed element
  at the top edge** (≥10px tall, ~full width, hit 4px below the top centre).
- `components.tsx TopBar` renders `.status-band`: a fixed 12px band in the toolbar's colour, **outside**
  the toolbar's stacking context (z-index 15, below dialogs, which dim it). An invisible band
  (background-clip:text) did not work on a real iPhone. Use `backgroundColor`, never the `background`
  shorthand (it resets background-clip).
- `index.html`: `apple-mobile-web-app-status-bar-style` is **`black`** (opaque), not `black-translucent`.
  Translucent lets content go under the status bar, which is where the blur came from. The style is read
  only when the app is added to the home screen, so changing it needs a re-install.
- `theme-color` meta is updated by `theme.ts` (#303030 light, #000 dark), like Android's colorPrimaryDark.

## Haptics
- Safari has no Vibration API. Since iOS 18, toggling an `<input type="checkbox" switch>` **by a real user tap**
  plays the system haptic tick. Toggling it from code (`label.click()`) is silent on iOS 26.5+/27.
- `ListScreen.tsx CheckButton`: on iPhone (`!canVibrate`), each check cell is a `<label>` that contains a hidden
  but rendered switch (`.haptic-switch`: 1px, opacity 0, pointer-events none). The real tap on the label
  toggles the switch → tick. The input's click is stopped from propagating so a tap toggles the habit once.
- Pass `switch` as a boolean property (`{...{ switch: true }}`). In Preact, `switch=""` sets it to false.
- `haptics.ts haptic()` still uses the programmatic trick elsewhere (long press, calendar). It may do
  nothing on new iOS; it is harmless. Calendar day haptics on iPhone are therefore likely silent (open item).
- Android browsers: `navigator.vibrate` 20 ms (toggle/long press) and 10 ms (calendar key), as in Android's
  `performHapticFeedback`.

## Zoom and gestures
- `index.html` viewport `maximum-scale=1, user-scalable=no` (Safari ignores it partly), `html { touch-action:
  pan-x pan-y }` (no double-tap zoom), and `main.tsx` cancels `gesturestart/gesturechange` (pinch).
- Habit screen: edge swipe (start within 24px of the left edge, 80px right) goes back, because a standalone
  PWA has no system back gesture.
- Drag-to-reorder needs a **non-passive** `touchmove` listener calling `preventDefault` (`ListScreen.tsx`).
- `.list-header { touch-action: pan-y }` so horizontal drags on the dates reach our pointer handlers.
- Use pointer capture on the element that started a drag, and `getCoalescedEvents()` for velocity samples.

## Storage and lifecycle
- The DB is saved to IndexedDB, and `navigator.storage.persist()` is requested. iOS can still evict data of
  web apps that aren't used for weeks. That's why there is a **backup reminder** (every 14 days, snooze
  3) and why backups go through the share sheet (`navigator.share({files})` → "Save to Files").
- Saves are debounced 300 ms and flushed on `visibilitychange: hidden`, because iOS can kill a backgrounded app.
- The day can change while the app sits in memory: `App.tsx` checks every minute and on visibility.
- Home-screen icons and status-bar style are captured at install. To change them: back up → delete →
  re-add → import.

## Rendering details
- Fonts: charts need NotoSans/NotoSansBold/FontAwesome loaded before the first draw (`main.tsx`).
- Canvases are sized by devicePixelRatio in `ChartHandle.draw()`.
- Konfetti physics are per frame on Android, so `confetti.ts` uses a fixed 120 Hz step with interpolation
  between steps to avoid judder on variable frame times. Never mix `performance.now()` with rAF timestamps.
- Auto checkmarks: Android strokes the glyph 5 device px in the habit colour and fills it with the card
  colour → `.glyph.auto { -webkit-text-stroke: 1.9px; paint-order: stroke fill }`.
- Safe areas: `viewport-fit=cover` + `env(safe-area-inset-*)` paddings throughout.

## Testing on a desktop
Playwright WebKit approximates Safari, but **not** iOS-only behaviour (status bar, haptics, share sheet,
native colour sheet). Those can only be verified on a real iPhone.

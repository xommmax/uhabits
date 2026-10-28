import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { fling, MIN_FLING_VELOCITY, releaseVelocity } from "./fling";

/**
 * Android's Header (a ScrollableChart): dragging the row of dates scrolls the days back in time, and the
 * habits' checkmarks follow. Unlike Android, which jumps a whole day at a time, the days move with the finger
 * and settle on a whole day when it lifts.
 *
 * The scroll position is in px (0 = today in its usual place). The list renders only the days of the
 * current whole-day offset plus one on each side, and a CSS variable (--day-shift) moves them by the rest,
 * so a drag is smooth while only the visible days are ever loaded.
 */

// Android's touch slop (8dp), before which a touch isn't a scroll
const SLOP_PX = 8;
const SETTLE_MS = 220;

/** Kept while the list screen is closed, so returning from a habit doesn't jump back to today. */
let savedPos = 0;
/** [maxOffset] is how many days it can scroll back (Android: 60 days in all, the visible ones included). */
export function useDayScroll(columnWidth: number, reversed: boolean, maxOffset: number) {
  const [offset, setOffset] = useState(() => Math.floor(savedPos / columnWidth));
  const listRef = useRef<HTMLDivElement>(null);
  const s = useRef({
    pos: savedPos,
    offset,
    frame: undefined as number | undefined,
    gesture: null as null | { startX: number; startY: number; startPos: number; scrolling: boolean; samples: { t: number; x: number }[] },
  }).current;
  // Moving the finger right moves the days right: older days when today is on the right (reversed)
  const direction = reversed ? 1 : -1;

  const apply = (pos: number) => {
    s.pos = savedPos = Math.min(maxOffset * columnWidth, Math.max(0, pos));
    const whole = Math.floor(s.pos / columnWidth);
    const rest = s.pos - whole * columnWidth;
    listRef.current?.style.setProperty("--day-shift", `${direction * rest}px`);
    if (whole !== s.offset) {
      s.offset = whole;
      setOffset(whole);
    }
  };
  useLayoutEffect(() => apply(s.pos), [columnWidth, reversed, maxOffset]);

  const stop = () => {
    if (s.frame === undefined) return false;
    cancelAnimationFrame(s.frame);
    s.frame = undefined;
    return true;
  };

  /** Coasts with [velocity] (px/s along the scroll position), ending on a whole day. */
  const settle = (velocity: number) => {
    stop();
    const from = s.pos;
    const f = Math.abs(velocity) >= MIN_FLING_VELOCITY ? fling(velocity) : null;
    const total = f ? f.distanceAt(f.duration) : 0;
    const to = Math.min(maxOffset, Math.max(0, Math.round((from + total) / columnWidth))) * columnWidth;
    if (to === from) return;
    // Android's fling curve, stretched to land on the day; a short ease-out when there was no fling
    const useFling = f !== null && Math.abs(total) > columnWidth / 2;
    const duration = useFling ? f.duration : SETTLE_MS;
    const progress = (t: number) => (useFling ? f.distanceAt(t) / total : 1 - Math.pow(1 - Math.min(1, t / duration), 3));
    let start = -1;
    const frame = (time: number) => {
      if (start < 0) start = time;
      const t = time - start;
      apply(from + (to - from) * progress(t));
      s.frame = t < duration ? requestAnimationFrame(frame) : undefined;
      if (s.frame === undefined) apply(to);
    };
    s.frame = requestAnimationFrame(frame);
  };

  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      if (!e.isPrimary || e.button > 0) return;
      // Touching moving days stops them, like on Android
      stop();
      s.gesture = { startX: e.clientX, startY: e.clientY, startPos: s.pos, scrolling: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
    },
    onPointerMove: (e: PointerEvent) => {
      const g = s.gesture;
      if (!g) return;
      const events = e.getCoalescedEvents?.() ?? [];
      for (const c of events.length ? events : [e]) g.samples.push({ t: c.timeStamp, x: c.clientX });
      if (g.samples.length > 40) g.samples.splice(0, g.samples.length - 40);
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.scrolling) {
        if (Math.abs(dy) > SLOP_PX && Math.abs(dy) >= Math.abs(dx)) {
          s.gesture = null; // vertical: the page scrolls instead
          return;
        }
        if (Math.abs(dx) <= SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return;
        // Starts from here, so the days don't jump by the slop
        g.scrolling = true;
        g.startX = e.clientX;
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          // The pointer may already be gone
        }
      }
      apply(g.startPos + direction * (e.clientX - g.startX));
    },
    onPointerUp: (e: PointerEvent) => {
      const g = s.gesture;
      s.gesture = null;
      if (!g) return;
      settle(g.scrolling ? (direction * releaseVelocity(g.samples, e.timeStamp)) / 2 : 0);
    },
    onPointerCancel: () => {
      if (!s.gesture) return;
      s.gesture = null;
      settle(0);
    },
  };

  return { offset, listRef, handlers };
}

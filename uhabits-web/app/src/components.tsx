import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChartHandle } from "habits-core";
import { fling, MIN_FLING_VELOCITY, releaseVelocity } from "./fling";

export { useDarkMode } from "./theme";

/** Score ring like Android's RingView: grey track, colored arc from 12 o'clock. */
export function Ring({ value, color, size = 24, thickness = 4 }: { value: number; color: string; size?: number; thickness?: number }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--faint)" stroke-width={thickness} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width={thickness}
        stroke-dasharray={`${c * Math.min(1, Math.max(0, value))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/** Glyphs from FontAwesome 4 (the icon font Android uses), see res/values/fontawesome.xml. */
export const FA = {
  calendar: "\uf073",
  bell: "\uf0f3",
  tag: "\uf02b",
  arrowUp: "\uf0aa",
  arrowDown: "\uf0ab",
} as const;

export const Icon = ({ glyph }: { glyph: string }) => <span class="fa">{glyph}</span>;

/** Material icons used by Android's toolbars (ic_action_add, ic_action_filter, overflow, back arrow). */
const MATERIAL = {
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  filter: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  dropDown: "M7 10l5 5 5-5z",
  palette: "M12 3a9 9 0 000 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
} as const;

export const MaterialIcon = ({ name }: { name: keyof typeof MATERIAL }) => (
  <svg class="material-icon" width="24" height="24" viewBox="0 0 24 24"><path d={MATERIAL[name]} fill="currentColor" /></svg>
);

/** Toolbar button showing a material icon. */
export const BarIcon = (props: { name: keyof typeof MATERIAL; label: string; onClick: () => void }) => (
  <button class="bar-button" aria-label={props.label} onClick={props.onClick}><MaterialIcon name={props.name} /></button>
);

/** Android's toolbar: colorPrimary (or the habit's color), white title on the left. */
export function TopBar(props: { left?: ComponentChildren; title?: ComponentChildren; right?: ComponentChildren; color?: string }) {
  const background = props.color ? { background: props.color } : undefined;
  const ref = useRef<HTMLElement>(null);
  // Its height (taller under an iPhone's status bar) is where sticky content below it, like the list's day row, stops
  useEffect(() => {
    const header = ref.current!;
    const update = () => document.documentElement.style.setProperty("--topbar-height", `${header.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {/* Outside the toolbar's stacking context, so menus and dialogs never cover it */}
      <div class="status-band" aria-hidden="true" style={props.color ? { backgroundColor: props.color } : undefined} />
      <header ref={ref} class={`topbar${props.left ? "" : " no-left"}`} style={background}>
        {props.left}
        <div class="topbar-title">{props.title}</div>
        <div class="topbar-right">{props.right}</div>
      </header>
    </>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Shows a checkbox, like Android's checkable menu items. */
  checked?: boolean;
  /** Shows an arrow, like Android's items that open a submenu. */
  submenu?: boolean;
}

const SPINNER_ITEM_HEIGHT = 48;

/** Android's AppCompatSpinner: the current value with an arrow, opening a dropdown on top of itself. */
export function Spinner(props: { options: string[]; value: number; onChange: (index: number) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const height = props.options.length * SPINNER_ITEM_HEIGHT + 12;
  return (
    <>
      <button class="spinner" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        {props.options[props.value]}
        <MaterialIcon name="dropDown" />
      </button>
      {anchor && (
        <div class="menu-overlay" onClick={() => setAnchor(null)}>
          <div
            class="menu spinner-dropdown"
            style={{ top: `${Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8))}px`, left: `${anchor.left}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {props.options.map((label, i) => (
              <button class="spinner-item" onClick={() => { setAnchor(null); props.onChange(i); }}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Android-style popup menu in the top-right corner, over the toolbar button that opened it. */
export function Menu(props: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div class="menu-overlay" onClick={props.onClose}>
      <div class="menu" onClick={(e) => e.stopPropagation()}>
        {props.items.map((item) => (
          <button
            class="menu-item"
            onClick={() => {
              props.onClose();
              item.onClick();
            }}
          >
            {item.label}
            {item.checked !== undefined && <span class={`checkbox${item.checked ? " on" : ""}`} />}
            {item.submenu && <span class="menu-arrow" />}
          </button>
        ))}
      </div>
    </div>
  );
}

const TAP_SLOP_PX = 8;
const LONG_PRESS_MS = 500;

/**
 * Canvas showing a core chart. Drag sideways to scroll back in time (a fast swipe keeps coasting, as on Android),
 * tap to click (e.g. toggle a day in the calendar) unless [readOnly]. With
 * [keepScroll], the chart stays scrolled where it was when its data changes.
 */
export function Chart(props: {
  create: (canvas: HTMLCanvasElement) => ChartHandle;
  deps: unknown[];
  height: number;
  readOnly?: boolean;
  keepScroll?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const drag = useRef({ startX: 0, columns: 0, moved: false, active: false, longPressed: false, stoppedFling: false, samples: [] as { t: number; x: number }[] });
  const flingFrame = useRef<number>();
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  // Columns scrolled back in time, mirroring the view's dataOffset (never below 0)
  const scrolled = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const handle = props.create(canvas);
    handleRef.current = handle;
    handle.draw();
    if (props.keepScroll && scrolled.current > 0) handle.scrollBy(scrolled.current);
    else scrolled.current = 0;
    const observer = new ResizeObserver(() => handle.draw());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      stopFling();
    };
  }, props.deps);

  /** Scrolls by [columns] (positive = back in time); false once it can't go further. */
  const scroll = (columns: number) => {
    if (!handleRef.current?.scrollBy(columns)) return false;
    scrolled.current = Math.max(0, scrolled.current + columns);
    return true;
  };
  const stopFling = () => {
    if (flingFrame.current === undefined) return false;
    cancelAnimationFrame(flingFrame.current);
    flingFrame.current = undefined;
    return true;
  };
  /** ScrollableChart.onFling: coasts with half the release velocity, in whole columns, from [offset] px past the last one. */
  const startFling = (velocity: number, offset: number) => {
    const width = handleRef.current?.columnWidth ?? 0;
    if (width <= 0 || Math.abs(velocity) < MIN_FLING_VELOCITY) return;
    const f = fling(velocity / 2);
    let applied = 0, start = -1;
    const frame = (time: number) => {
      if (start < 0) start = time;
      const elapsed = time - start;
      const columns = Math.round((offset + f.distanceAt(elapsed)) / width);
      if (columns !== applied && !scroll(columns - applied)) { flingFrame.current = undefined; return; }
      applied = columns;
      flingFrame.current = elapsed < f.duration ? requestAnimationFrame(frame) : undefined;
    };
    flingFrame.current = requestAnimationFrame(frame);
  };

  const onPointerDown = (e: PointerEvent) => {
    // Touching a coasting chart only stops it, like on Android
    const stoppedFling = stopFling();
    drag.current = { startX: e.clientX, columns: 0, moved: false, active: true, longPressed: false, stoppedFling, samples: [{ t: e.timeStamp, x: e.clientX }] };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (props.readOnly || stoppedFling) return;
    longPressTimer.current = setTimeout(() => {
      if (drag.current.moved || !drag.current.active) return;
      drag.current.longPressed = true;
      handleRef.current?.longClick(x, y);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const handle = handleRef.current;
    if (!d.active || !handle || handle.columnWidth <= 0) return;
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    if (d.samples.length > 20) d.samples.shift();
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP_PX) {
      d.moved = true;
      clearTimeout(longPressTimer.current);
    }
    const columns = Math.round(dx / handle.columnWidth);
    if (columns !== d.columns) {
      scroll(columns - d.columns);
      d.columns = columns;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    d.active = false;
    clearTimeout(longPressTimer.current);
    if (d.moved && handleRef.current) {
      const width = handleRef.current.columnWidth;
      startFling(releaseVelocity(d.samples, e.timeStamp), e.clientX - d.startX - d.columns * width);
      return;
    }
    if (props.readOnly || d.stoppedFling || d.longPressed || !handleRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    handleRef.current.click(e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <canvas
      ref={canvasRef}
      class="chart"
      style={{ height: `${props.height}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current.active = false;
        clearTimeout(longPressTimer.current);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

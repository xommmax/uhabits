import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChartHandle } from "habits-core";

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
  return (
    <header class={`topbar${props.left ? "" : " no-left"}`} style={props.color ? { background: props.color } : undefined}>
      {props.left}
      <div class="topbar-title">{props.title}</div>
      <div class="topbar-right">{props.right}</div>
    </header>
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
 * Canvas showing a core chart. Drag sideways to scroll back in time, tap to
 * click (e.g. toggle a day in the calendar).
 */
export function Chart(props: { create: (canvas: HTMLCanvasElement) => ChartHandle; deps: unknown[]; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ChartHandle | null>(null);
  const drag = useRef({ startX: 0, columns: 0, moved: false, active: false, longPressed: false });
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const handle = props.create(canvas);
    handleRef.current = handle;
    handle.draw();
    const observer = new ResizeObserver(() => handle.draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, props.deps);

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { startX: e.clientX, columns: 0, moved: false, active: true, longPressed: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > TAP_SLOP_PX) {
      d.moved = true;
      clearTimeout(longPressTimer.current);
    }
    const columns = Math.round(dx / handle.columnWidth);
    if (columns !== d.columns) {
      handle.scrollBy(columns - d.columns);
      d.columns = columns;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    d.active = false;
    clearTimeout(longPressTimer.current);
    if (d.moved || d.longPressed || !handleRef.current) return;
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

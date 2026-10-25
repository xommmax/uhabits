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

export function TopBar(props: { left?: ComponentChildren; title?: ComponentChildren; right?: ComponentChildren; color?: string }) {
  return (
    <header class={`topbar${props.color ? " colored" : ""}`} style={props.color ? { background: props.color } : undefined}>
      <div class="topbar-side">{props.left}</div>
      <div class="topbar-title">{props.title}</div>
      <div class="topbar-side right">{props.right}</div>
    </header>
  );
}

export interface SheetItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  checked?: boolean;
}

/** iOS-style action sheet. */
export function Sheet(props: { items: SheetItem[]; footer?: string; onClose: () => void }) {
  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-group">
          {props.items.map((item) => (
            <button
              class={`sheet-item${item.destructive ? " destructive" : ""}`}
              onClick={() => {
                props.onClose();
                item.onClick();
              }}
            >
              {item.label}
              {item.checked && <span class="sheet-check">✓</span>}
            </button>
          ))}
          {props.footer && <div class="sheet-footer">{props.footer}</div>}
        </div>
        <div class="sheet-group">
          <button class="sheet-item bold" onClick={props.onClose}>Cancel</button>
        </div>
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

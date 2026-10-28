// Android's ListHabitsActivity: the habit list with one column per day, its toolbars, menus and dialogs.
// Layout and gestures follow ListHabitsRootView, HabitCardView, CheckmarkButtonView and HeaderView.

import { useEffect, useRef, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitRow } from "./types";
import { BarIcon, Menu, type MenuItem, Ring, TopBar, useDarkMode } from "./components";
import { shareBackup, shouldRemind, snoozeReminder } from "./backup";
import { Entry, formatDay, shortNumber } from "./format";
import { celebrate, ColorPicker, EntryPopup, GLYPH, HabitTypePicker, type PopupRequest, usePress } from "./popups";
import { canVibrate, haptic } from "./haptics";
import { useDayScroll } from "./dayScroll";
import { getBool, Pref } from "./prefs";
import { isNightMode, toggleNightMode } from "./theme";

// Android's checkmarkWidth and habitNameWidth (res/values/dimens.xml)
const COLUMN_WIDTH = 48;
const NAME_MIN_WIDTH = 160;
const LONG_PRESS_MS = 500;
// ListHabitsRootView.MAX_CHECKMARK_COUNT: the days can be scrolled back until the oldest shown is 59 days ago
const MAX_CHECKMARK_COUNT = 60;

// Android's res/values/strings.xml "hints" array
const HINTS = [
  "To rearrange the entries, press-and-hold on the name of the habit, then drag it to the correct place.",
  "You can see more days by putting your phone in landscape mode.",
];

// FontAwesome glyphs of Android's empty list (EmptyListView)
const ICON = { starHalf: "", umbrellaBeach: "" };

/** A category's header; a long press (not a tap, which is easy to make by accident) renames it. */
function CategoryHeader(props: { category: string; onRename: () => void }) {
  const press = usePress(() => {}, () => {
    haptic("toggle");
    props.onRename();
  });
  return <button class="category-header" {...press}>{props.category}</button>;
}

function useDayColumns(): number {
  // Same rule as ListHabitsRootView.getCheckmarkCount
  const compute = () => {
    const nameWidth = Math.max(window.innerWidth / 3, NAME_MIN_WIDTH);
    return Math.max(3, Math.min(14, Math.floor((window.innerWidth - nameWidth) / COLUMN_WIDTH)));
  };
  const [n, setN] = useState(compute);
  useEffect(() => {
    const onResize = () => setN(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return n;
}

// While a habit is being dragged, stop the page from scrolling (iOS needs a non-passive listener).
let dragging = false;
document.addEventListener("touchmove", (e) => dragging && e.preventDefault(), { passive: false });

interface Props {
  core: HabitsCore;
  rev: number;
  refresh: () => void;
  toast: (message: string) => void;
  onOpen: (id: number) => void;
  onAdd: (numerical: boolean) => void;
  onEdit: (id: number) => void;
  onSettings: () => void;
  onAbout: () => void;
}

type Dialog =
  | { kind: "menu" }
  | { kind: "filter" }
  | { kind: "sort" }
  | { kind: "color" }
  | { kind: "selectionMenu" }
  | { kind: "category"; title: string; initial: string; onSave: (name: string) => void }
  | { kind: "type" }
  | null;

export function ListScreen({ core, rev, refresh, toast, onOpen, onAdd, onEdit, onSettings, onAbout }: Props) {
  const dark = useDarkMode();
  const columns = useDayColumns();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [popup, setPopup] = useState<PopupRequest | null>(null);
  const [remind, setRemind] = useState(shouldRemind);
  const [hint, setHint] = useState<string | null>(() => core.nextHint(HINTS) ?? null);
  const [drag, setDrag] = useState<{ id: number; dy: number; rects: DOMRect[]; start: number } | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  void rev;

  const reversed = getBool(Pref.reverseDays);
  const dayScroll = useDayScroll(COLUMN_WIDTH, reversed, Math.max(0, MAX_CHECKMARK_COUNT - columns));
  // The visible days plus one on each side, which come into view while scrolling
  const firstDaysAgo = dayScroll.offset - 1;
  const habits = core.listHabits("", columns + 2, firstDaysAgo) as HabitRow[];
  const options = core.listOptions() as { showArchived: boolean; showCompleted: boolean; order: string; hasHabits: boolean };
  const manualOrder = options.order === "BY_POSITION";
  const today = core.today();
  // Left to right, one hidden day on each side; index is the day's position in each habit's values
  const days: Day[] = Array.from({ length: columns + 2 }, (_, j) => {
    const daysAgo = dayScroll.offset + (reversed ? columns - j : j - 1);
    return { daysAgo, index: daysAgo - firstDaysAgo };
  });
  const colorOf = (h: HabitRow) => (dark ? h.colorDark : h.colorLight);
  const selectedHabits = habits.filter((h) => selected.has(h.id));
  const selecting = selected.size > 0;

  const clearSelection = () => setSelected(new Set());
  const toggleSelected = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // --- Drag to reorder (press and hold the name, then drag), like Android ---
  const dragTarget = (() => {
    if (!drag) return -1;
    const center = drag.rects[drag.start].top + drag.rects[drag.start].height / 2 + drag.dy;
    let best = drag.start;
    drag.rects.forEach((r, i) => {
      if (Math.abs(r.top + r.height / 2 - center) < Math.abs(drag.rects[best].top + drag.rects[best].height / 2 - center)) best = i;
    });
    return best;
  })();
  const dragShift = (i: number) => {
    if (!drag || i === drag.start) return 0;
    const h = drag.rects[drag.start].height + 3;
    if (drag.start < i && i <= dragTarget) return -h;
    if (dragTarget <= i && i < drag.start) return h;
    return 0;
  };
  const startDrag = (id: number) => {
    if (!manualOrder) return;
    const rects = habits.map((h) => rowRefs.current.get(h.id)!.getBoundingClientRect());
    dragging = true;
    setDrag({ id, dy: 0, rects, start: habits.findIndex((h) => h.id === id) });
  };
  const endDrag = () => {
    dragging = false;
    if (drag && dragTarget !== drag.start && dragTarget >= 0) {
      core.move(drag.id, habits[dragTarget].id, dragTarget < drag.start);
      clearSelection();
      refresh();
    }
    setDrag(null);
  };

  // --- Actions ---
  const backUp = async () => {
    try {
      if (await shareBackup(core)) {
        setRemind(false);
        toast("Backup saved");
      }
    } catch {
      toast("Could not create the backup");
    }
  };
  const ids = () => [...selected];
  const afterBulk = () => {
    clearSelection();
    refresh();
  };
  const deleteSelected = () => {
    const n = selected.size;
    if (!confirm(n === 1 ? "Delete this habit? This cannot be undone." : `Delete ${n} habits? This cannot be undone.`)) return;
    core.delete(ids());
    afterBulk();
  };
  const categorize = () => {
    const current = selectedHabits.find((h) => h.category.trim())?.category ?? "";
    setDialog({ kind: "category", title: "Categorize", initial: current, onSave: (name) => { core.changeCategory(ids(), name); afterBulk(); } });
  };
  const renameCategory = (name: string) =>
    setDialog({ kind: "category", title: "Rename category", initial: name, onSave: (next) => { if (next.trim()) core.renameCategory(name, next); refresh(); } });

  const pickSort = (by: string) => {
    core.sortBy(by);
    refresh();
  };

  // --- Top bar: normal or selection mode ---
  let topBar;
  let selectionMenu: MenuItem[] = [];
  if (selecting) {
    const canArchive = selectedHabits.every((h) => !h.archived);
    const canUnarchive = selectedHabits.every((h) => h.archived);
    // Android's ListHabitsSelectionMenu: edit and color as icons, the rest in the overflow menu
    selectionMenu = [
      ...(canArchive ? [{ label: "Archive", onClick: () => { core.archive(ids()); afterBulk(); } }] : []),
      ...(canUnarchive ? [{ label: "Unarchive", onClick: () => { core.unarchive(ids()); afterBulk(); } }] : []),
      { label: "Categorize", onClick: categorize },
      { label: "Delete", onClick: deleteSelected },
    ];
    topBar = (
      <TopBar
        color="var(--action-mode)"
        left={<BarIcon name="back" label="Cancel" onClick={clearSelection} />}
        title={String(selected.size)}
        right={
          <>
            {selected.size === 1 && <BarIcon name="edit" label="Edit" onClick={() => { const [id] = ids(); clearSelection(); onEdit(id); }} />}
            <BarIcon name="palette" label="Change color" onClick={() => setDialog({ kind: "color" })} />
            <BarIcon name="more" label="More options" onClick={() => setDialog({ kind: "selectionMenu" })} />
          </>
        }
      />
    );
  } else {
    topBar = (
      <TopBar
        title="Alichka Habits 🩵"
        right={
          <>
            <BarIcon name="add" label="Add habit" onClick={() => setDialog({ kind: "type" })} />
            <BarIcon name="filter" label="Filter" onClick={() => setDialog({ kind: "filter" })} />
            <BarIcon name="more" label="More options" onClick={() => setDialog({ kind: "menu" })} />
          </>
        }
      />
    );
  }

  // --- Rows, with category headers like HabitCardListAdapter.buildRows ---
  const rows: preact.JSX.Element[] = [];
  let lastCategory: string | null = null;
  habits.forEach((h, i) => {
    const category = h.category.trim();
    if (category && category !== lastCategory) {
      rows.push(<CategoryHeader key={`c:${category}`} category={category} onRename={() => renameCategory(category)} />);
      lastCategory = category;
    }
    const isDragged = drag?.id === h.id;
    rows.push(
      <HabitRowView
        key={h.id}
        rowRef={(el) => (el ? rowRefs.current.set(h.id, el) : rowRefs.current.delete(h.id))}
        habit={h}
        color={colorOf(h)}
        days={days}
        selected={selected.has(h.id)}
        style={drag ? { transform: `translateY(${isDragged ? drag.dy : dragShift(i)}px)` } : undefined}
        dragClass={drag ? (isDragged ? " dragging" : " shifting") : ""}
        onTapName={() => (selecting ? toggleSelected(h.id) : onOpen(h.id))}
        onLongPressName={() => {
          setSelected(new Set([...selected, h.id]));
          startDrag(h.id);
        }}
        onDragMove={(dy) => drag && setDrag({ ...drag, dy })}
        onDragEnd={endDrag}
        onToggle={(daysAgo, x, y) => {
          const value = core.toggle(h.id, today - daysAgo);
          if (value === Entry.YES_MANUAL) celebrate(colorOf(h), x, y);
          refresh();
        }}
        onPopup={(daysAgo, x, y) =>
          setPopup({ habitId: h.id, day: today - daysAgo, numerical: h.numerical, color: colorOf(h), atLeast: h.targetType === 0, x, y })
        }
      />,
    );
  });

  // Android's res/menu/list_habits.xml
  const menuItems: MenuItem[] = [
    { label: "Dark theme", checked: isNightMode(), onClick: toggleNightMode },
    { label: "Settings", onClick: onSettings },
    { label: "About", onClick: onAbout },
  ];

  return (
    <div class="screen">
      {topBar}

      {remind && habits.length > 0 && !selecting && (
        <div class="banner">
          <div class="banner-text">💾 It's been a while since you saved a copy of your habits.</div>
          <div class="banner-actions">
            <button class="banner-primary" onClick={backUp}>Save a copy</button>
            <button class="banner-secondary" onClick={() => { snoozeReminder(); setRemind(false); }}>Not now</button>
          </div>
        </div>
      )}

      {hint && !selecting && (
        <button class="hint-card" onClick={() => setHint(null)}>
          <div class="hint-title">Did you know?</div>
          <div>{hint}</div>
        </button>
      )}

      <div class="habit-list" ref={dayScroll.listRef}>
        <div class="list-header" {...dayScroll.handlers}>
          <div class="list-header-spacer" />
          <div class="days" style={{ width: `${columns * COLUMN_WIDTH}px` }}>
            <div class="days-track">
              {days.map(({ daysAgo }) => (
                <div key={daysAgo} class="day-label">
                  {daysAgo >= 0 && <span>{formatDay(today - daysAgo, { weekday: "short" }).toUpperCase()}</span>}
                  {daysAgo >= 0 && <span>{formatDay(today - daysAgo, { day: "numeric" })}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        {rows}
      </div>

      {habits.length === 0 && (
        <div class="empty">
          <span class="fa empty-icon">{options.hasHabits ? ICON.umbrellaBeach : ICON.starHalf}</span>
          <p>{options.hasHabits ? "You're all done for today!" : "You have no active habits"}</p>
        </div>
      )}

      {popup && <EntryPopup core={core} request={popup} onClose={(changed) => { setPopup(null); if (changed) refresh(); }} />}
      {dialog?.kind === "type" && <HabitTypePicker onClose={() => setDialog(null)} onPick={(numerical) => { setDialog(null); onAdd(numerical); }} />}
      {dialog?.kind === "menu" && <Menu onClose={() => setDialog(null)} items={menuItems} />}
      {dialog?.kind === "selectionMenu" && <Menu onClose={() => setDialog(null)} items={selectionMenu} />}
      {dialog?.kind === "filter" && (
        <Menu
          onClose={() => setDialog(null)}
          items={[
            { label: "Hide archived", checked: !options.showArchived, onClick: () => { core.setShowArchived(!options.showArchived); refresh(); } },
            { label: "Hide completed", checked: !options.showCompleted, onClick: () => { core.setShowCompleted(!options.showCompleted); refresh(); } },
            { label: "Sort", submenu: true, onClick: () => setDialog({ kind: "sort" }) },
          ]}
        />
      )}
      {dialog?.kind === "sort" && (
        <Menu
          onClose={() => setDialog(null)}
          items={[
            { label: "Manually", onClick: () => pickSort("manual") },
            { label: "By name", onClick: () => pickSort("name") },
            { label: "By color", onClick: () => pickSort("color") },
            { label: "By score", onClick: () => pickSort("score") },
            { label: "By status", onClick: () => pickSort("status") },
          ]}
        />
      )}
      {dialog?.kind === "color" && (
        <ColorPicker
          onClose={() => setDialog(null)}
          onPick={(index) => { setDialog(null); core.changeColor(ids(), index, null); afterBulk(); }}
          onPickCustom={(hex) => { setDialog(null); core.changeColor(ids(), 0, hex); afterBulk(); }}
        />
      )}
      {dialog?.kind === "category" && (
        <CategoryDialog
          title={dialog.title}
          initial={dialog.initial}
          suggestions={core.categories()}
          onClose={() => setDialog(null)}
          onSave={(name) => { setDialog(null); dialog.onSave(name); }}
        />
      )}
    </div>
  );
}

interface Day {
  daysAgo: number;
  /** Position of the day in the habit's values, notes and completed arrays. */
  index: number;
}

interface RowProps {
  habit: HabitRow;
  color: string;
  days: Day[];
  selected: boolean;
  style?: Record<string, string>;
  dragClass: string;
  rowRef: (el: HTMLDivElement | null) => void;
  onTapName: () => void;
  onLongPressName: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  onToggle: (daysAgo: number, x: number, y: number) => void;
  onPopup: (daysAgo: number, x: number, y: number) => void;
}

function HabitRowView(props: RowProps) {
  const { habit, color } = props;
  const press = useRef({ timer: 0 as unknown as ReturnType<typeof setTimeout>, startY: 0, long: false });

  return (
    <div
      ref={props.rowRef}
      class={`habit-row${habit.archived ? " archived" : ""}${props.selected ? " selected" : ""}${props.dragClass}`}
      style={props.style}
    >
      <button
        class="habit-name"
        onPointerDown={(e) => {
          const p = press.current;
          p.long = false;
          p.startY = e.clientY;
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          } catch {
            // The pointer may already be gone; dragging then just ends early.
          }
          p.timer = setTimeout(() => {
            p.long = true;
            props.onLongPressName();
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p.long) props.onDragMove(e.clientY - p.startY);
          else if (Math.abs(e.clientY - p.startY) > 8) clearTimeout(p.timer);
        }}
        onPointerUp={() => {
          const p = press.current;
          clearTimeout(p.timer);
          if (p.long) props.onDragEnd();
          else props.onTapName();
        }}
        onPointerCancel={() => {
          clearTimeout(press.current.timer);
          if (press.current.long) props.onDragEnd();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Ring value={habit.score} color={color} size={15} thickness={3} />
        <span style={{ color }}>{habit.name}</span>
      </button>
      <div class="days" style={{ width: `${(props.days.length - 2) * COLUMN_WIDTH}px` }}>
        <div class="days-track">
          {props.days.map(({ daysAgo, index }) =>
            daysAgo < 0 ? (
              <div key={daysAgo} class="check" />
            ) : (
              <CheckButton
                key={daysAgo}
                habit={habit}
                index={index}
                value={habit.values[index]}
                color={color}
                onToggle={(x, y) => props.onToggle(daysAgo, x, y)}
                onPopup={(x, y) => props.onPopup(daysAgo, x, y)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Android's CheckmarkButtonView / NumberButtonView, with the same tap and long-press rules. */
function CheckButton(props: {
  habit: HabitRow;
  index: number;
  value: number;
  color: string;
  onToggle: (x: number, y: number) => void;
  onPopup: (x: number, y: number) => void;
}) {
  const { habit, value, color } = props;
  const ref = useRef<HTMLLabelElement>(null);
  const at = (fn: (x: number, y: number) => void) => () => {
    const r = ref.current!.getBoundingClientRect();
    fn(r.left + r.width / 2, r.top + r.height / 2);
  };
  const shortToggle = getBool(Pref.shortToggle);
  // Like Android: a tick on every toggle (CheckmarkButton.performToggle) and on every long press (View.performLongClick)
  const toggle = (x: number, y: number) => {
    if (canVibrate) haptic("toggle"); // on an iPhone the tap on the cell's switch plays it
    props.onToggle(x, y);
  };
  const longPressed = (fn: (x: number, y: number) => void) => (x: number, y: number) => {
    if (fn !== toggle) haptic("toggle");
    fn(x, y);
  };
  const press = habit.numerical
    ? usePress(at(props.onPopup), at(longPressed(props.onPopup)))
    : usePress(at(shortToggle ? toggle : props.onPopup), at(longPressed(shortToggle ? props.onPopup : toggle)));
  const hasNotes = habit.notes[props.index].trim() !== "";
  return (
    // A label: on an iPhone, a real tap on it toggles the hidden iOS switch inside, and iOS plays its haptic tick
    // (Safari has no vibration API, and switches toggled from code stay silent)
    <label ref={ref} class="check" {...press}>
      {!canVibrate && <input type="checkbox" class="haptic-switch" tabIndex={-1} aria-hidden="true" {...{ switch: true }} onClick={(e) => e.stopPropagation()} />}
      {habit.numerical ? (
        <NumberCell value={value} completed={habit.completed[props.index]} unit={habit.unit} color={color} />
      ) : (
        <CheckCell value={value} color={color} />
      )}
      {hasNotes && <span class="notes-dot" style={{ background: color }} />}
    </label>
  );
}

function CheckCell({ value, color }: { value: number; color: string }) {
  const questionMarks = getBool(Pref.questionMarks);
  switch (value) {
    case Entry.YES_MANUAL:
      return <span class="fa glyph" style={{ color }}>{GLYPH.check}</span>;
    case Entry.YES_AUTO:
      return <span class="fa glyph auto" style={{ WebkitTextStrokeColor: color }}>{GLYPH.check}</span>;
    case Entry.SKIP:
      return <span class="fa glyph" style={{ color }}>{GLYPH.skipped}</span>;
    case Entry.NO:
      return <span class={`fa glyph ${questionMarks ? "medium" : "low"}`}>{GLYPH.times}</span>;
    default:
      return questionMarks ? <span class="fa glyph question low">{GLYPH.question}</span> : <span class="fa glyph low">{GLYPH.times}</span>;
  }
}

function NumberCell(props: { value: number; completed: boolean; unit: string; color: string }) {
  const { value, completed, unit } = props;
  const style = { color: completed ? props.color : value < 0 ? "var(--contrast40)" : "var(--muted)" };
  let label;
  if (value === Entry.SKIP) label = <span class="fa">{GLYPH.skipped}</span>;
  else if (value >= 0) label = shortNumber(value / 1000);
  else if (getBool(Pref.questionMarks)) label = <span class="fa">{GLYPH.question}</span>;
  else label = "0";
  return (
    <span class="number-cell" style={style}>
      <span class="number">{label}</span>
      {unit.trim() && <span class="unit">{unit}</span>}
    </span>
  );
}

/** Android's CategoryDialog, with existing categories as suggestions. */
function CategoryDialog(props: { title: string; initial: string; suggestions: string[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(props.initial);
  return (
    <div class="overlay center" onClick={props.onClose}>
      <div class="category-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="dialog-title">{props.title}</div>
        <input
          class="dialog-input"
          placeholder="Category"
          value={name}
          autoFocus
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && props.onSave(name)}
        />
        {props.suggestions.length > 0 && (
          <div class="chips">
            {props.suggestions.map((s) => <button class="chip" onClick={() => setName(s)}>{s}</button>)}
          </div>
        )}
        <div class="dialog-buttons">
          <button onClick={props.onClose}>Cancel</button>
          <button class="bold" onClick={() => props.onSave(name)}>Save</button>
        </div>
      </div>
    </div>
  );
}

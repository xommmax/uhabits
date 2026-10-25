import { useEffect, useRef, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitRow } from "./types";
import { Ring, Sheet, TopBar, useDarkMode } from "./components";
import { celebrate, EntryPopup, GLYPH, HabitTypePicker, type PopupRequest, usePress } from "./popups";
import { getBool, Pref } from "./prefs";
import { daysSinceBackup, pickBackupFile, shareBackup, shouldRemind, snoozeReminder } from "./backup";
import { Entry, formatDay, shortNumber } from "./format";

const COLUMN_WIDTH = 44;
const NAME_MIN_WIDTH = 150;

function useDayColumns(): number {
  const compute = () => Math.max(3, Math.min(7, Math.floor((window.innerWidth - NAME_MIN_WIDTH - 24) / COLUMN_WIDTH)));
  const [n, setN] = useState(compute);
  useEffect(() => {
    const onResize = () => setN(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return n;
}

function lastBackupText(): string {
  const days = daysSinceBackup();
  if (days === null) return "No backup yet";
  if (days === 0) return "Last backup: today";
  return `Last backup: ${days} day${days === 1 ? "" : "s"} ago`;
}

function versionText(): string {
  const { version, commit, time } = __BUILD_INFO__;
  const built = new Date(time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `Version ${version} (${commit}) · built ${built}`;
}

interface Props {
  core: HabitsCore;
  rev: number;
  refresh: () => void;
  toast: (message: string) => void;
  onOpen: (id: number) => void;
  onAdd: (numerical: boolean) => void;
}

export function ListScreen({ core, rev, refresh, toast, onOpen, onAdd }: Props) {
  const dark = useDarkMode();
  const columns = useDayColumns();
  const [showArchived, setShowArchived] = useState(localStorage.getItem("ui:showArchived") === "1");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [remind, setRemind] = useState(shouldRemind);
  const [popup, setPopup] = useState<PopupRequest | null>(null);
  const [pickingType, setPickingType] = useState(false);

  const habits = core.listHabits(showArchived, columns) as HabitRow[];
  const today = core.today();
  void rev;

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

  const restore = async () => {
    const data = await pickBackupFile();
    if (!data) return;
    if (await core.importBackup(data)) {
      refresh();
      toast("Backup imported");
    } else {
      toast("This file is not a Loop backup");
    }
  };

  const toggleArchived = () => {
    localStorage.setItem("ui:showArchived", showArchived ? "0" : "1");
    setShowArchived(!showArchived);
  };

  return (
    <div class="screen">
      <TopBar
        title={<span class="large-title">Habits</span>}
        right={
          reordering ? (
            <button class="bar-button bold" onClick={() => setReordering(false)}>Done</button>
          ) : (
            <>
              <button class="bar-button icon" aria-label="Add habit" onClick={() => setPickingType(true)}>＋</button>
              <button class="bar-button icon" aria-label="Menu" onClick={() => setMenuOpen(true)}>⋯</button>
            </>
          )
        }
      />

      {remind && habits.length > 0 && (
        <div class="banner">
          <div class="banner-text">💾 It's been a while since you saved a copy of your habits.</div>
          <div class="banner-actions">
            <button class="banner-primary" onClick={backUp}>Save a copy</button>
            <button class="banner-secondary" onClick={() => { snoozeReminder(); setRemind(false); }}>Not now</button>
          </div>
        </div>
      )}

      {habits.length === 0 ? (
        <div class="empty">
          <p>You have no habits yet.</p>
          <button class="primary-button" onClick={() => setPickingType(true)}>Add a habit</button>
        </div>
      ) : (
        <div class="habit-list">
          {!reordering && (
            <div class="list-header">
              <div class="list-header-spacer" />
              {Array.from({ length: columns }, (_, i) => (
                <div class="day-label">
                  <span>{formatDay(today - i, { weekday: "short" }).toUpperCase()}</span>
                  <span>{formatDay(today - i, { day: "numeric" })}</span>
                </div>
              ))}
            </div>
          )}
          {reordering ? (
            <ReorderList habits={habits} dark={dark} onMove={(id, refId, before) => { core.move(id, refId, before); refresh(); }} />
          ) : (
            habits.map((h) => (
              <HabitRowView
                key={h.id}
                habit={h}
                dark={dark}
                onOpen={() => onOpen(h.id)}
                onToggle={(i, x, y) => {
                  const value = core.toggle(h.id, today - i);
                  if (value === Entry.YES_MANUAL) celebrate(dark ? h.colorDark : h.colorLight, x, y);
                  refresh();
                }}
                onPopup={(i, x, y) =>
                  setPopup({
                    habitId: h.id,
                    day: today - i,
                    numerical: h.numerical,
                    color: dark ? h.colorDark : h.colorLight,
                    atLeast: h.targetType === 0,
                    x,
                    y,
                  })
                }
              />
            ))
          )}
        </div>
      )}

      {popup && <EntryPopup core={core} request={popup} onClose={(changed) => { setPopup(null); if (changed) refresh(); }} />}
      {pickingType && <HabitTypePicker onClose={() => setPickingType(false)} onPick={(numerical) => { setPickingType(false); onAdd(numerical); }} />}

      {menuOpen && (
        <Sheet
          onClose={() => setMenuOpen(false)}
          footer={`${lastBackupText()}\n${versionText()}`}
          items={[
            { label: "Show archived", checked: showArchived, onClick: toggleArchived },
            { label: "Reorder habits", onClick: () => setReordering(true) },
            { label: "Back up now", onClick: backUp },
            { label: "Restore from backup", onClick: restore },
          ]}
        />
      )}
    </div>
  );
}

interface RowProps {
  habit: HabitRow;
  dark: boolean;
  onOpen: () => void;
  onToggle: (daysAgo: number, x: number, y: number) => void;
  onPopup: (daysAgo: number, x: number, y: number) => void;
}

function HabitRowView(props: RowProps) {
  const { habit, dark } = props;
  const color = dark ? habit.colorDark : habit.colorLight;
  return (
    <div class={`habit-row${habit.archived ? " archived" : ""}`}>
      <button class="habit-name" onClick={props.onOpen}>
        <Ring value={habit.score} color={color} />
        <span style={{ color }}>{habit.name}</span>
      </button>
      {habit.values.map((value, i) => (
        <CheckButton
          habit={habit}
          index={i}
          value={value}
          color={color}
          onToggle={(x, y) => props.onToggle(i, x, y)}
          onPopup={(x, y) => props.onPopup(i, x, y)}
        />
      ))}
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
  const ref = useRef<HTMLButtonElement>(null);
  const at = (fn: (x: number, y: number) => void) => () => {
    const r = ref.current!.getBoundingClientRect();
    fn(r.left + r.width / 2, r.top + r.height / 2);
  };
  const shortToggle = getBool(Pref.shortToggle);
  const press = habit.numerical
    ? usePress(at(props.onPopup), at(props.onPopup))
    : usePress(at(shortToggle ? props.onToggle : props.onPopup), at(shortToggle ? props.onPopup : props.onToggle));
  const hasNotes = habit.notes[props.index].trim() !== "";
  return (
    <button ref={ref} class="check" {...press}>
      {habit.numerical ? (
        <NumberCell value={value} completed={habit.completed[props.index]} unit={habit.unit} color={color} />
      ) : (
        <CheckCell value={value} color={color} />
      )}
      {hasNotes && <span class="notes-dot" style={{ background: color }} />}
    </button>
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

/** Drag the ≡ handle to move a habit. */
function ReorderList(props: { habits: HabitRow[]; dark: boolean; onMove: (id: number, refId: number, before: boolean) => void }) {
  const [drag, setDrag] = useState<{ index: number; dy: number; rowHeight: number } | null>(null);
  const startY = useRef(0);
  const target = drag ? Math.max(0, Math.min(props.habits.length - 1, drag.index + Math.round(drag.dy / drag.rowHeight))) : -1;

  const shift = (i: number) => {
    if (!drag || i === drag.index) return 0;
    if (drag.index < i && i <= target) return -drag.rowHeight;
    if (target <= i && i < drag.index) return drag.rowHeight;
    return 0;
  };

  const finish = () => {
    if (drag && target !== drag.index) {
      props.onMove(props.habits[drag.index].id, props.habits[target].id, target < drag.index);
    }
    setDrag(null);
  };

  return (
    <>
      {props.habits.map((h, i) => (
        <div
          key={h.id}
          class={`habit-row reorder${drag?.index === i ? " dragging" : ""}`}
          style={{ transform: `translateY(${drag?.index === i ? drag.dy : shift(i)}px)` }}
        >
          <span class="habit-name">
            <Ring value={h.score} color={props.dark ? h.colorDark : h.colorLight} />
            <span style={{ color: props.dark ? h.colorDark : h.colorLight }}>{h.name}</span>
          </span>
          <span
            class="drag-handle"
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              startY.current = e.clientY;
              const row = (e.currentTarget as HTMLElement).parentElement!;
              setDrag({ index: i, dy: 0, rowHeight: row.offsetHeight });
            }}
            onPointerMove={(e) => drag && setDrag({ ...drag, dy: e.clientY - startY.current })}
            onPointerUp={finish}
            onPointerCancel={() => setDrag(null)}
          >
            ≡
          </span>
        </div>
      ))}
    </>
  );
}

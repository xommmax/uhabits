import { useEffect, useRef, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitRow } from "./types";
import { CheckIcon, CrossIcon, Ring, Sheet, TopBar, useDarkMode } from "./components";
import { daysSinceBackup, pickBackupFile, shareBackup, shouldRemind, snoozeReminder } from "./backup";
import { Entry, formatDay } from "./format";

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
  onAdd: () => void;
}

export function ListScreen({ core, rev, refresh, toast, onOpen, onAdd }: Props) {
  const dark = useDarkMode();
  const columns = useDayColumns();
  const [showArchived, setShowArchived] = useState(localStorage.getItem("ui:showArchived") === "1");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [remind, setRemind] = useState(shouldRemind);

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
              <button class="bar-button icon" aria-label="Add habit" onClick={onAdd}>＋</button>
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
          <button class="primary-button" onClick={onAdd}>Add a habit</button>
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
              <HabitRowView key={h.id} habit={h} dark={dark} onOpen={() => onOpen(h.id)} onToggle={(i) => { core.toggle(h.id, today - i); refresh(); }} />
            ))
          )}
        </div>
      )}

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

function HabitRowView(props: { habit: HabitRow; dark: boolean; onOpen: () => void; onToggle: (daysAgo: number) => void }) {
  const { habit, dark } = props;
  const color = dark ? habit.colorDark : habit.colorLight;
  return (
    <div class={`habit-row${habit.archived ? " archived" : ""}`}>
      <button class="habit-name" onClick={props.onOpen}>
        <Ring value={habit.score} color={color} />
        <span style={{ color }}>{habit.name}</span>
      </button>
      {habit.values.map((value, i) => (
        <button class="check" onClick={() => props.onToggle(i)} disabled={habit.numerical}>
          <CheckCell value={value} color={color} numerical={habit.numerical} />
        </button>
      ))}
    </div>
  );
}

function CheckCell({ value, color, numerical }: { value: number; color: string; numerical: boolean }) {
  if (numerical) return <span class="number">{value > 0 ? value / 1000 : ""}</span>;
  switch (value) {
    case Entry.YES_MANUAL:
      return <span style={{ color }}><CheckIcon /></span>;
    case Entry.YES_AUTO:
      return <span style={{ color, opacity: 0.4 }}><CheckIcon /></span>;
    case Entry.SKIP:
      return <span style={{ color }}>»</span>;
    default:
      return <span class="unchecked"><CrossIcon /></span>;
  }
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

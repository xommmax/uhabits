import { useRef, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitDetail } from "./types";
import { Chart, Ring, Sheet, TopBar, useDarkMode } from "./components";
import { formatDay, frequencyText, percent, signedPercent } from "./format";

const BAR_BUCKETS = ["Week", "Month", "Quarter", "Year"];
const EDGE_SWIPE_START_PX = 24;
const EDGE_SWIPE_DISTANCE_PX = 80;

interface Props {
  core: HabitsCore;
  id: number;
  rev: number;
  refresh: () => void;
  onBack: () => void;
  onEdit: () => void;
}

export function HabitScreen({ core, id, rev, refresh, onBack, onEdit }: Props) {
  const dark = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bucket, setBucket] = useState(() => Number(localStorage.getItem("pref:pref_bar_card_bool_spinner") ?? 0));
  const swipe = useRef<number | null>(null);

  const habit = core.habitDetail(id) as HabitDetail;
  const color = dark ? habit.colorDark : habit.colorLight;
  const best = Math.max(1, ...habit.streaks.map((s) => s.length));

  const remove = () => {
    if (!confirm(`Delete "${habit.name}"? This cannot be undone.`)) return;
    core.delete([id]);
    onBack();
  };

  return (
    <div
      class="screen"
      onTouchStart={(e) => (swipe.current = e.touches[0].clientX < EDGE_SWIPE_START_PX ? e.touches[0].clientX : null)}
      onTouchEnd={(e) => {
        if (swipe.current !== null && e.changedTouches[0].clientX - swipe.current > EDGE_SWIPE_DISTANCE_PX) onBack();
        swipe.current = null;
      }}
    >
      <TopBar
        color={habit.colorLight}
        left={<button class="bar-button" onClick={onBack}>‹ Habits</button>}
        title={habit.name}
        right={
          <>
            <button class="bar-button" onClick={onEdit}>Edit</button>
            <button class="bar-button icon" aria-label="Menu" onClick={() => setMenuOpen(true)}>⋯</button>
          </>
        }
      />

      <div class="cards">
        <section class="card subtitle">
          {habit.question && <div class="question">{habit.question}</div>}
          <div class="muted">
            {frequencyText(habit.freqNum, habit.freqDen)}
            {habit.archived && " · Archived"}
          </div>
        </section>

        <section class="card">
          <h2 style={{ color }}>Overview</h2>
          <div class="overview">
            <div class="overview-item">
              <Ring value={habit.score} color={color} size={44} />
              <div class="overview-value" style={{ color }}>{percent(habit.score)}</div>
              <div class="muted">Score</div>
            </div>
            <div class="overview-item">
              <div class="overview-value" style={{ color }}>{signedPercent(habit.scoreMonthDiff)}</div>
              <div class="muted">Month</div>
            </div>
            <div class="overview-item">
              <div class="overview-value" style={{ color }}>{signedPercent(habit.scoreYearDiff)}</div>
              <div class="muted">Year</div>
            </div>
            <div class="overview-item">
              <div class="overview-value" style={{ color }}>{habit.totalCount}</div>
              <div class="muted">Total</div>
            </div>
          </div>
        </section>

        <section class="card">
          <h2 style={{ color }}>Calendar</h2>
          <Chart
            height={180}
            deps={[id, rev, dark]}
            create={(canvas) => {
              const chart = core.historyChart(canvas, id, dark);
              chart.setOnEdited(refresh);
              return chart;
            }}
          />
          <div class="hint">Tap a day to check or uncheck it. Swipe sideways to see older days.</div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 style={{ color }}>History</h2>
            <select value={bucket} onChange={(e) => setBucket(Number(e.currentTarget.value))}>
              {BAR_BUCKETS.map((label, i) => <option value={i}>{label}</option>)}
            </select>
          </div>
          <Chart height={200} deps={[id, rev, dark, bucket]} create={(canvas) => core.barChart(canvas, id, dark, bucket)} />
        </section>

        {habit.streaks.length > 0 && (
          <section class="card">
            <h2 style={{ color }}>Best streaks</h2>
            {habit.streaks.map((s) => (
              <div class="streak">
                <span class="muted">{formatDay(s.start, { month: "short", day: "numeric", year: "numeric" })}</span>
                <div class="streak-bar" style={{ width: `${(s.length / best) * 100}%`, background: color }}>{s.length}</div>
                <span class="muted">{formatDay(s.end, { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            ))}
          </section>
        )}

        {habit.description && (
          <section class="card">
            <h2 style={{ color }}>Notes</h2>
            <p class="notes">{habit.description}</p>
          </section>
        )}
      </div>

      {menuOpen && (
        <Sheet
          onClose={() => setMenuOpen(false)}
          items={[
            habit.archived
              ? { label: "Unarchive", onClick: () => { core.unarchive([id]); refresh(); } }
              : { label: "Archive", onClick: () => { core.archive([id]); onBack(); } },
            { label: "Delete", destructive: true, onClick: remove },
          ]}
        />
      )}
    </div>
  );
}

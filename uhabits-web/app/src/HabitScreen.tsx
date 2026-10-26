import { useRef, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitDetail } from "./types";
import { BarIcon, Chart, FA, Icon, Menu, Ring, TopBar, useDarkMode } from "./components";
import { shareCsv } from "./backup";
import { EntryPopup, type PopupRequest } from "./popups";
import { frequencyText, shortNumber } from "./format";

// Spinner options, as in Android's res/values/constants.xml
const SCORE_BUCKETS = ["Day", "Week", "Month", "Quarter", "Year"];
const BAR_BUCKETS_BOOLEAN = ["Week", "Month", "Quarter", "Year"];
const BAR_BUCKETS_NUMERICAL = ["Day", "Week", "Month", "Quarter", "Year"];

// Chart heights from Android's show_habit_*.xml layouts (dp)
const SCORE_HEIGHT = 220;
const BAR_HEIGHT = 220;
const CALENDAR_HEIGHT = 160;
const CALENDAR_EDITOR_HEIGHT = 350;
const FREQUENCY_HEIGHT = 200;
const ROW_HEIGHT = 20;

const EDGE_SWIPE_START_PX = 24;
const EDGE_SWIPE_DISTANCE_PX = 80;

/** Like Android's OverviewCardView.formatPercentageDiff. */
const percentageDiff = (diff: number) => `${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff) * 100)}%`;

interface Props {
  core: HabitsCore;
  id: number;
  rev: number;
  refresh: () => void;
  toast: (message: string) => void;
  onBack: () => void;
  onEdit: () => void;
}

export function HabitScreen({ core, id, rev, refresh, toast, onBack, onEdit }: Props) {
  const dark = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState(false);
  const [popup, setPopup] = useState<PopupRequest | null>(null);
  const habit = core.habitDetail(id) as HabitDetail;
  const [scoreBucket, setScoreBucket] = useState(habit.scoreSpinner);
  const [barBucket, setBarBucket] = useState(habit.barSpinner);
  const swipe = useRef<number | null>(null);

  const color = dark ? habit.colorDark : habit.colorLight;
  const titleStyle = { color };
  const diffStyle = (diff: number) => ({ color: diff >= 0 ? color : "var(--muted)" });

  const showPopup = (day: number) =>
    setPopup({
      habitId: id,
      day,
      numerical: habit.numerical,
      color,
      atLeast: habit.targetType === 0,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  const calendar = (canvas: HTMLCanvasElement, padding: number) => {
    const chart = core.historyChart(canvas, id, dark, padding);
    chart.setOnEdited(refresh);
    chart.setOnPopup(showPopup);
    return chart;
  };

  const remove = () => {
    if (!confirm(`Delete "${habit.name}"? This cannot be undone.`)) return;
    core.delete([id]);
    onBack();
  };

  const exportCsv = async () => {
    try {
      await shareCsv(core, [id]);
    } catch {
      toast("Could not export. Please try again.");
    }
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
        left={<BarIcon name="back" label="Back" onClick={onBack} />}
        title={habit.name}
        right={
          <>
            <BarIcon name="edit" label="Edit" onClick={onEdit} />
            <BarIcon name="more" label="More options" onClick={() => setMenuOpen(true)} />
          </>
        }
      />

      <div class="cards">
        <section class="card subtitle">
          {habit.question && <div class="question" style={titleStyle}>{habit.question}</div>}
          <div class="subtitle-row">
            <span><Icon glyph={FA.calendar} /> {frequencyText(habit.freqNum, habit.freqDen)}</span>
            {habit.numerical && (
              <span>
                <Icon glyph={habit.targetType === 0 ? FA.arrowUp : FA.arrowDown} /> {shortNumber(habit.targetValue)} {habit.unit}
              </span>
            )}
            {habit.category.trim() && <span><Icon glyph={FA.tag} /> {habit.category}</span>}
          </div>
          {habit.archived && <div class="muted">Archived</div>}
        </section>

        {habit.description && (
          <section class="card">
            <p class="notes">{habit.description}</p>
          </section>
        )}

        {habit.numerical ? (
          <section class="card">
            <h2 style={titleStyle}>Target</h2>
            <Chart height={habit.targetRows * ROW_HEIGHT} deps={[id, rev, dark]} create={(c) => core.targetChart(c, id, dark)} />
          </section>
        ) : (
          <section class="card">
            <h2 style={titleStyle}>Overview</h2>
            <div class="overview">
              <div class="overview-item ring-item">
                <Ring value={habit.score} color={color} size={30} thickness={5} />
                <div>
                  <div class="overview-value" style={titleStyle}>{Math.round(habit.score * 100)}%</div>
                  <div class="muted">Score</div>
                </div>
              </div>
              <div class="overview-item">
                <div class="overview-value" style={diffStyle(habit.scoreMonthDiff)}>{percentageDiff(habit.scoreMonthDiff)}</div>
                <div class="muted">Month</div>
              </div>
              <div class="overview-item">
                <div class="overview-value" style={diffStyle(habit.scoreYearDiff)}>{percentageDiff(habit.scoreYearDiff)}</div>
                <div class="muted">Year</div>
              </div>
              <div class="overview-item">
                <div class="overview-value" style={titleStyle}>{habit.totalCount}</div>
                <div class="muted">Total</div>
              </div>
            </div>
          </section>
        )}

        <section class="card">
          <div class="card-header">
            <h2 style={titleStyle}>Score</h2>
            <select value={scoreBucket} onChange={(e) => setScoreBucket(Number(e.currentTarget.value))}>
              {SCORE_BUCKETS.map((label, i) => <option value={i}>{label}</option>)}
            </select>
          </div>
          <Chart height={SCORE_HEIGHT} deps={[id, rev, dark, scoreBucket]} create={(c) => core.scoreChart(c, id, dark, scoreBucket)} />
        </section>

        <section class="card">
          <div class="card-header">
            <h2 style={titleStyle}>History</h2>
            <select value={barBucket} onChange={(e) => setBarBucket(Number(e.currentTarget.value))}>
              {(habit.numerical ? BAR_BUCKETS_NUMERICAL : BAR_BUCKETS_BOOLEAN).map((label, i) => <option value={i}>{label}</option>)}
            </select>
          </div>
          <Chart height={BAR_HEIGHT} deps={[id, rev, dark, barBucket]} create={(c) => core.barChart(c, id, dark, barBucket)} />
        </section>

        <section class="card">
          <div class="card-header">
            <h2 style={titleStyle}>Calendar</h2>
            <button class="card-action" onClick={() => setEditingHistory(true)}>Edit</button>
          </div>
          <Chart height={CALENDAR_HEIGHT} deps={[id, rev, dark]} create={(c) => calendar(c, 0)} />
        </section>

        {habit.streakCount > 0 && (
          <section class="card">
            <h2 style={titleStyle}>Best streaks</h2>
            <Chart height={habit.streakCount * ROW_HEIGHT} deps={[id, rev, dark]} create={(c) => core.streakChart(c, id, dark)} />
          </section>
        )}

        <section class="card">
          <h2 style={titleStyle}>Frequency</h2>
          <Chart height={FREQUENCY_HEIGHT} deps={[id, rev, dark]} create={(c) => core.frequencyChart(c, id, dark)} />
        </section>
      </div>

      {editingHistory && (
        <div class="overlay center" onClick={() => setEditingHistory(false)}>
          <div class="history-editor" onClick={(e) => e.stopPropagation()}>
            <Chart
              height={CALENDAR_EDITOR_HEIGHT}
              deps={[id, rev, dark]}
              create={(c) => calendar(c, 10)}
            />
            <button class="sheet-item bold" onClick={() => setEditingHistory(false)}>Done</button>
          </div>
        </div>
      )}

      {popup && <EntryPopup core={core} request={popup} onClose={(changed) => { setPopup(null); if (changed) refresh(); }} />}

      {menuOpen && (
        <Menu
          onClose={() => setMenuOpen(false)}
          items={[
            { label: "Export", onClick: exportCsv },
            habit.archived
              ? { label: "Unarchive", onClick: () => { core.unarchive([id]); refresh(); } }
              : { label: "Archive", onClick: () => { core.archive([id]); onBack(); } },
            { label: "Delete", onClick: remove },
          ]}
        />
      )}
    </div>
  );
}

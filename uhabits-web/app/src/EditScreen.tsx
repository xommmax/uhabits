import { useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitDetail, HabitForm } from "./types";
import { TopBar } from "./components";
import { PALETTE } from "./format";

type FrequencyKind = "daily" | "weekly" | "perWeek" | "perMonth" | "everyN" | "custom";

const FREQUENCY_LABELS: Record<FrequencyKind, string> = {
  daily: "Every day",
  weekly: "Every week",
  perWeek: "Times per week",
  perMonth: "Times per month",
  everyN: "Every few days",
  custom: "Custom",
};

function frequencyKind(num: number, den: number): FrequencyKind {
  if (num === den) return "daily";
  if (num === 1 && den === 7) return "weekly";
  if (den === 7) return "perWeek";
  if (den === 30 || den === 31) return "perMonth";
  if (num === 1) return "everyN";
  return "custom";
}

/** The number the user types for each kind, and the fraction it maps to. */
function frequencyFromKind(kind: FrequencyKind, n: number, current: [number, number]): [number, number] {
  switch (kind) {
    case "daily": return [1, 1];
    case "weekly": return [1, 7];
    case "perWeek": return [n, 7];
    case "perMonth": return [n, 30];
    case "everyN": return [1, n];
    case "custom": return current;
  }
}

const DEFAULT_COLOR = 8;

interface Props {
  core: HabitsCore;
  id: number | null;
  onDone: () => void;
}

export function EditScreen({ core, id, onDone }: Props) {
  const [form, setForm] = useState<HabitForm>(() => {
    if (id === null) {
      return { id: null, name: "", question: "", description: "", colorIndex: DEFAULT_COLOR, freqNum: 1, freqDen: 1 };
    }
    const h = core.habitDetail(id) as HabitDetail;
    return { id, name: h.name, question: h.question, description: h.description, colorIndex: h.colorIndex, freqNum: h.freqNum, freqDen: h.freqDen };
  });
  const kind = frequencyKind(form.freqNum, form.freqDen);
  const count = kind === "everyN" ? form.freqDen : form.freqNum;
  const update = (patch: Partial<HabitForm>) => setForm({ ...form, ...patch });

  const setFrequency = (k: FrequencyKind, n: number) => {
    const safe = Math.max(1, Math.min(k === "perWeek" ? 6 : 30, Math.round(n) || 1));
    const [freqNum, freqDen] = frequencyFromKind(k, safe, [form.freqNum, form.freqDen]);
    update({ freqNum, freqDen });
  };

  const save = () => {
    core.saveHabit({ ...form, name: form.name.trim() });
    onDone();
  };

  return (
    <div class="screen">
      <TopBar
        left={<button class="bar-button" onClick={onDone}>Cancel</button>}
        title={id === null ? "New habit" : "Edit habit"}
        right={<button class="bar-button bold" disabled={!form.name.trim()} onClick={save}>Save</button>}
      />
      <div class="form">
        <div class="form-group">
          <input
            placeholder="Name (e.g. Exercise)"
            value={form.name}
            onInput={(e) => update({ name: e.currentTarget.value })}
            style={{ color: PALETTE[form.colorIndex] }}
          />
          <input
            placeholder="Question (e.g. Did you exercise today?)"
            value={form.question}
            onInput={(e) => update({ question: e.currentTarget.value })}
          />
        </div>

        <div class="form-label">Color</div>
        <div class="form-group swatches">
          {PALETTE.map((hex, i) => (
            <button
              class={`swatch${form.colorIndex === i ? " selected" : ""}`}
              style={{ background: hex }}
              aria-label={`Color ${i + 1}`}
              onClick={() => update({ colorIndex: i })}
            />
          ))}
        </div>

        <div class="form-label">Frequency</div>
        <div class="form-group">
          <select value={kind} onChange={(e) => setFrequency(e.currentTarget.value as FrequencyKind, count === 1 ? 3 : count)}>
            {(Object.keys(FREQUENCY_LABELS) as FrequencyKind[])
              .filter((k) => k !== "custom" || kind === "custom")
              .map((k) => <option value={k}>{FREQUENCY_LABELS[k]}</option>)}
          </select>
          {(kind === "perWeek" || kind === "perMonth" || kind === "everyN") && (
            <label class="form-row">
              <span>{kind === "everyN" ? "Every how many days?" : "How many times?"}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={count}
                onChange={(e) => setFrequency(kind, Number(e.currentTarget.value))}
              />
            </label>
          )}
          {kind === "custom" && <div class="form-row muted">{form.freqNum} times in {form.freqDen} days</div>}
        </div>

        <div class="form-label">Notes</div>
        <div class="form-group">
          <textarea
            rows={3}
            placeholder="Optional"
            value={form.description}
            onInput={(e) => update({ description: e.currentTarget.value })}
          />
        </div>
      </div>
    </div>
  );
}

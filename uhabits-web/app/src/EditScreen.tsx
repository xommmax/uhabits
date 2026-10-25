import { useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitDetail, HabitForm } from "./types";
import { TopBar } from "./components";
import { PALETTE } from "./format";

// Options of Android's FrequencyPickerDialog
type FrequencyKind = "daily" | "everyX" | "perWeek" | "perMonth" | "perYDays";

const FREQUENCY_LABELS: Record<FrequencyKind, string> = {
  daily: "Every day",
  everyX: "Every X days",
  perWeek: "X times per week",
  perMonth: "X times per month",
  perYDays: "X times in Y days",
};

function frequencyKind(num: number, den: number): FrequencyKind {
  if (den === 30 || den === 31) return "perMonth";
  if (num === 1) return den === 1 ? "daily" : "everyX";
  if (den === 7) return "perWeek";
  return "perYDays";
}

/** Same rules as FrequencyPickerDialog.onSaveClicked. */
function frequencyFrom(kind: FrequencyKind, x: number, y: number): [number, number] {
  let [num, den] = (() => {
    switch (kind) {
      case "daily": return [1, 1];
      case "everyX": return [1, x];
      case "perWeek": return [x, 7];
      case "perMonth": return [x, 30];
      case "perYDays": return [x, y];
    }
  })();
  if (num >= den || num < 1) [num, den] = [1, 1];
  return [num, den];
}

// Android's numerical frequency choices (EditHabitActivity)
const NUMERICAL_FREQUENCIES: [number, string][] = [[1, "Every day"], [7, "Every week"], [30, "Every month"]];

const DEFAULT_COLOR = 8;

interface Props {
  core: HabitsCore;
  id: number | null;
  numerical: boolean;
  onDone: () => void;
}

export function EditScreen({ core, id, numerical, onDone }: Props) {
  const [form, setForm] = useState<HabitForm>(() => {
    if (id === null) {
      return {
        id: null, name: "", question: "", description: "", colorIndex: DEFAULT_COLOR,
        freqNum: 1, freqDen: 1, numerical, unit: "", targetValue: 0, targetType: 0, category: "",
      };
    }
    const h = core.habitDetail(id) as HabitDetail;
    return {
      id, name: h.name, question: h.question, description: h.description, colorIndex: h.colorIndex,
      freqNum: h.freqNum, freqDen: h.freqDen, numerical: h.numerical, unit: h.unit,
      targetValue: h.targetValue, targetType: h.targetType, category: h.category,
    };
  });
  const [targetText, setTargetText] = useState(form.numerical && form.id !== null ? String(form.targetValue) : "");
  const [kind, setKind] = useState(frequencyKind(form.freqNum, form.freqDen));
  const [x, setX] = useState(kind === "everyX" ? form.freqDen : form.freqNum);
  const [y, setY] = useState(form.freqDen);
  const update = (patch: Partial<HabitForm>) => setForm({ ...form, ...patch });

  const target = Number(targetText.replace(",", "."));
  const valid = form.name.trim() !== "" && (!form.numerical || (targetText.trim() !== "" && Number.isFinite(target)));

  const save = () => {
    const [freqNum, freqDen] = form.numerical ? [1, form.freqDen] : frequencyFrom(kind, x, y);
    core.saveHabit({
      ...form,
      name: form.name.trim(),
      question: form.question.trim(),
      description: form.description.trim(),
      unit: form.unit.trim(),
      targetValue: form.numerical ? target : form.targetValue,
      freqNum,
      freqDen,
    });
    onDone();
  };

  const numberInput = (value: number, onChange: (n: number) => void) => (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      value={value}
      onChange={(e) => onChange(Math.max(1, Math.round(Number(e.currentTarget.value)) || 1))}
    />
  );

  return (
    <div class="screen">
      <TopBar
        color={PALETTE[form.colorIndex]}
        left={<button class="bar-button" onClick={onDone}>Cancel</button>}
        title={id === null ? "Create habit" : "Edit habit"}
        right={<button class="bar-button bold" disabled={!valid} onClick={save}>Save</button>}
      />
      <div class="form">
        <div class="form-group">
          <input
            placeholder={form.numerical ? "Name (e.g. Run)" : "Name (e.g. Exercise)"}
            value={form.name}
            onInput={(e) => update({ name: e.currentTarget.value })}
            style={{ color: PALETTE[form.colorIndex] }}
          />
          <input
            placeholder={form.numerical ? "Question (e.g. How many miles did you run today?)" : "Question (e.g. Did you exercise today?)"}
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

        {form.numerical ? (
          <>
            <div class="form-label">Target</div>
            <div class="form-group">
              <label class="form-row">
                <span>Unit</span>
                <input class="wide" placeholder="e.g. miles" value={form.unit} onInput={(e) => update({ unit: e.currentTarget.value })} />
              </label>
              <label class="form-row">
                <span>Target</span>
                <input class="wide" inputMode="decimal" placeholder="e.g. 15" value={targetText} onInput={(e) => setTargetText(e.currentTarget.value)} />
              </label>
              <label class="form-row">
                <span>Frequency</span>
                <select value={form.freqDen} onChange={(e) => update({ freqDen: Number(e.currentTarget.value), freqNum: 1 })}>
                  {NUMERICAL_FREQUENCIES.map(([den, label]) => <option value={den}>{label}</option>)}
                </select>
              </label>
              <label class="form-row">
                <span>Target type</span>
                <select value={form.targetType} onChange={(e) => update({ targetType: Number(e.currentTarget.value) })}>
                  <option value={0}>At least</option>
                  <option value={1}>At most</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <>
            <div class="form-label">Frequency</div>
            <div class="form-group">
              <select value={kind} onChange={(e) => setKind(e.currentTarget.value as FrequencyKind)}>
                {(Object.keys(FREQUENCY_LABELS) as FrequencyKind[]).map((k) => <option value={k}>{FREQUENCY_LABELS[k]}</option>)}
              </select>
              {kind === "everyX" && <label class="form-row"><span>Every how many days?</span>{numberInput(x, setX)}</label>}
              {(kind === "perWeek" || kind === "perMonth" || kind === "perYDays") && (
                <label class="form-row"><span>How many times?</span>{numberInput(x, setX)}</label>
              )}
              {kind === "perYDays" && <label class="form-row"><span>In how many days?</span>{numberInput(y, setY)}</label>}
            </div>
          </>
        )}

        <div class="form-label">Category</div>
        <div class="form-group">
          <input
            list="categories"
            placeholder="(Optional)"
            value={form.category}
            onInput={(e) => update({ category: e.currentTarget.value })}
          />
          <datalist id="categories">
            {core.categories().map((c) => <option value={c} />)}
          </datalist>
        </div>

        <div class="form-label">Notes</div>
        <div class="form-group">
          <textarea rows={3} placeholder="(Optional)" value={form.description} onInput={(e) => update({ description: e.currentTarget.value })} />
        </div>
      </div>
    </div>
  );
}

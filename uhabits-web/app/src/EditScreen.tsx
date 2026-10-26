import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { HabitDetail, HabitForm } from "./types";
import { BarIcon, MaterialIcon, TopBar, useDarkMode } from "./components";
import { frequencyText, PALETTE } from "./format";
import { ColorPicker } from "./popups";

// Android's numerical frequency choices (EditHabitActivity)
const NUMERICAL_FREQUENCIES: [number, string][] = [[1, "Every day"], [7, "Every week"], [30, "Every month"]];
const TARGET_TYPES = ["At least", "At most"];

const DEFAULT_COLOR = 8;

type Dialog = "color" | "frequency" | "numericalFrequency" | "targetType" | null;

interface Props {
  core: HabitsCore;
  id: number | null;
  numerical: boolean;
  onDone: () => void;
}

/** Android's EditHabitActivity (activity_edit_habit.xml), without the reminder. */
export function EditScreen({ core, id, numerical, onDone }: Props) {
  const dark = useDarkMode();
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
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showErrors, setShowErrors] = useState(false);
  const update = (patch: Partial<HabitForm>) => setForm({ ...form, ...patch });

  const target = Number(targetText.replace(",", "."));
  const nameError = form.name.trim() === "";
  const targetError = form.numerical && (targetText.trim() === "" || !Number.isFinite(target));

  // Same checks as EditHabitActivity.validate
  const save = () => {
    if (nameError || targetError) {
      setShowErrors(true);
      return;
    }
    core.saveHabit({
      ...form,
      name: form.name.trim(),
      question: form.question.trim(),
      description: form.description.trim(),
      unit: form.unit.trim(),
      targetValue: form.numerical ? target : form.targetValue,
      freqNum: form.numerical ? 1 : form.freqNum,
    });
    onDone();
  };

  const numericalFrequency = NUMERICAL_FREQUENCIES.find(([den]) => den === form.freqDen)?.[1] ?? `${form.freqNum}/${form.freqDen}`;

  return (
    <div class="screen edit-screen">
      <TopBar
        color={dark ? undefined : PALETTE[form.colorIndex]}
        left={<BarIcon name="back" label="Back" onClick={onDone} />}
        title={id === null ? "Create habit" : "Edit habit"}
        right={<button class="outlined-button" onClick={save}>Save</button>}
      />
      <div class="edit-form">
        <div class="field-row">
          <Field label="Name" error={showErrors && nameError}>
            <input
              class="field-input"
              maxLength={50}
              placeholder={form.numerical ? "e.g. Run" : "e.g. Exercise"}
              value={form.name}
              onInput={(e) => update({ name: e.currentTarget.value })}
            />
          </Field>
          <Field label="Color" narrow>
            <button class="color-button" style={{ background: PALETTE[form.colorIndex] }} aria-label="Change color" onClick={() => setDialog("color")} />
          </Field>
        </div>
        <Field label="Question">
          <AutoGrow
            placeholder={form.numerical ? "e.g. How many miles did you run today?" : "e.g. Did you exercise today?"}
            value={form.question}
            onInput={(question) => update({ question })}
          />
        </Field>

        {form.numerical ? (
          <>
            <Field label="Unit">
              <input class="field-input" placeholder="e.g. miles" value={form.unit} onInput={(e) => update({ unit: e.currentTarget.value })} />
            </Field>
            <div class="field-row">
              <Field label="Target" error={showErrors && targetError}>
                <input class="field-input" inputMode="decimal" placeholder="e.g. 15" value={targetText} onInput={(e) => setTargetText(e.currentTarget.value)} />
              </Field>
              <Field label="Frequency">
                <Dropdown text={numericalFrequency} onClick={() => setDialog("numericalFrequency")} />
              </Field>
            </div>
            <Field label="Target Type">
              <Dropdown text={TARGET_TYPES[form.targetType] ?? TARGET_TYPES[0]} onClick={() => setDialog("targetType")} />
            </Field>
          </>
        ) : (
          <Field label="Frequency">
            <Dropdown text={frequencyText(form.freqNum, form.freqDen)} onClick={() => setDialog("frequency")} />
          </Field>
        )}

        <Field label="Notes">
          <AutoGrow placeholder="(Optional)" value={form.description} onInput={(description) => update({ description })} />
        </Field>
        <Field label="Category">
          <input class="field-input" list="categories" placeholder="(Optional)" value={form.category} onInput={(e) => update({ category: e.currentTarget.value })} />
          <datalist id="categories">
            {core.categories().map((c) => <option value={c} />)}
          </datalist>
        </Field>
      </div>

      {dialog === "color" && (
        <ColorPicker selected={form.colorIndex} onClose={() => setDialog(null)} onPick={(colorIndex) => { setDialog(null); update({ colorIndex }); }} />
      )}
      {dialog === "frequency" && (
        <FrequencyDialog
          num={form.freqNum}
          den={form.freqDen}
          onClose={() => setDialog(null)}
          onSave={(freqNum, freqDen) => { setDialog(null); update({ freqNum, freqDen }); }}
        />
      )}
      {dialog === "numericalFrequency" && (
        <ListDialog
          items={NUMERICAL_FREQUENCIES.map(([, label]) => label)}
          onClose={() => setDialog(null)}
          onPick={(i) => { setDialog(null); update({ freqDen: NUMERICAL_FREQUENCIES[i][0] }); }}
        />
      )}
      {dialog === "targetType" && (
        <ListDialog items={TARGET_TYPES} onClose={() => setDialog(null)} onPick={(targetType) => { setDialog(null); update({ targetType }); }} />
      )}
    </div>
  );
}

/** Android's FormOuterBox/FormInnerBox: an outlined box with its label on the border. */
function Field(props: { label: string; narrow?: boolean; error?: boolean; children: ComponentChildren }) {
  return (
    <div class={`field${props.narrow ? " narrow" : ""}${props.error ? " error" : ""}`}>
      <div class="field-box">
        <span class="field-label">{props.label}</span>
        {props.children}
        {props.error && <div class="field-error">Cannot be blank</div>}
      </div>
    </div>
  );
}

/** Android's FormDropdown: the current value with a drop-down arrow. */
function Dropdown(props: { text: string; onClick: () => void }) {
  return (
    <button class="field-dropdown" onClick={props.onClick}>
      <span>{props.text}</span>
      <MaterialIcon name="dropDown" />
    </button>
  );
}

/** Multi-line input that grows with its text, like Android's EditText. */
function AutoGrow(props: { placeholder: string; value: string; onInput: (value: string) => void }) {
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  return (
    <textarea
      class="field-input"
      rows={1}
      ref={fit}
      placeholder={props.placeholder}
      value={props.value}
      onInput={(e) => {
        fit(e.currentTarget);
        props.onInput(e.currentTarget.value);
      }}
    />
  );
}

/** Android's AlertDialog with a plain list (select_dialog_item). */
function ListDialog(props: { items: string[]; onPick: (index: number) => void; onClose: () => void }) {
  return (
    <div class="overlay center dim" onClick={props.onClose}>
      <div class="android-dialog list-dialog" onClick={(e) => e.stopPropagation()}>
        {props.items.map((item, i) => <button class="list-dialog-item" onClick={() => props.onPick(i)}>{item}</button>)}
      </div>
    </div>
  );
}

type FrequencyOption = "everyDay" | "everyXDays" | "perWeek" | "perMonth" | "perYDays";

/** Android's FrequencyPickerDialog (frequency_picker_dialog.xml), with the same defaults and rules. */
function FrequencyDialog(props: { num: number; den: number; onSave: (num: number, den: number) => void; onClose: () => void }) {
  const { num, den } = props;
  // populateViews
  const initial: FrequencyOption =
    den === 30 || den === 31 ? "perMonth"
    : num === 1 ? (den === 1 ? "everyDay" : "everyXDays")
    : den === 7 ? "perWeek"
    : "perYDays";
  const [option, setOption] = useState<FrequencyOption>(initial);
  const [values, setValues] = useState({
    everyXDays: initial === "everyXDays" ? String(den) : "3",
    perWeek: initial === "perWeek" ? String(num) : "3",
    perMonth: initial === "perMonth" ? String(num) : "10",
    perYDaysX: initial === "perYDays" ? String(num) : "3",
    perYDaysY: initial === "perYDays" ? String(den) : "14",
  });

  // onSaveClicked
  const save = () => {
    const n = (s: string) => parseInt(s, 10);
    let numerator = 1;
    let denominator = 1;
    if (option === "everyXDays" && values.everyXDays) denominator = n(values.everyXDays);
    else if (option === "perWeek" && values.perWeek) [numerator, denominator] = [n(values.perWeek), 7];
    else if (option === "perYDays" && values.perYDaysX && values.perYDaysY) [numerator, denominator] = [n(values.perYDaysX), n(values.perYDaysY)];
    else if (option === "perMonth" && values.perMonth) [numerator, denominator] = [n(values.perMonth), 30];
    if (numerator >= denominator || numerator < 1) [numerator, denominator] = [1, 1];
    props.onSave(numerator, denominator);
  };

  const input = (key: keyof typeof values, owner: FrequencyOption) => (
    <input
      class="frequency-input"
      inputMode="numeric"
      value={values[key]}
      onFocus={() => setOption(owner)}
      onInput={(e) => setValues({ ...values, [key]: e.currentTarget.value.replace(/\D/g, "") })}
    />
  );
  const row = (owner: FrequencyOption, children: ComponentChildren) => (
    <label class="frequency-row">
      <input type="radio" class="radio" name="frequency" checked={option === owner} onChange={() => setOption(owner)} />
      {children}
    </label>
  );

  return (
    <div class="overlay center dim" onClick={props.onClose}>
      <div class="android-dialog frequency-dialog" onClick={(e) => e.stopPropagation()}>
        {row("everyDay", <span>Every day</span>)}
        {row("everyXDays", <><span>Every</span>{input("everyXDays", "everyXDays")}<span>days</span></>)}
        {row("perWeek", <>{input("perWeek", "perWeek")}<span>times per week</span></>)}
        {row("perMonth", <>{input("perMonth", "perMonth")}<span>times per month</span></>)}
        {row("perYDays", <>{input("perYDaysX", "perYDays")}<span>times in</span>{input("perYDaysY", "perYDays")}<span>days</span></>)}
        <div class="dialog-actions">
          <button class="dialog-action" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

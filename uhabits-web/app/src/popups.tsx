import { useEffect, useRef, useState } from "preact/hooks";
import confetti from "canvas-confetti";
import type { HabitsCore } from "./core";
import { Entry } from "./format";
import { getBool, Pref } from "./prefs";

// Ports of Android's CheckmarkDialog and NumberDialog (checkmark_popup.xml).

export const GLYPH = { check: "", times: "", skipped: "", question: "" } as const;

const LONG_PRESS_MS = 500;

/** Calls [onTap] or [onLongPress], like Android's onClick / onLongClick. */
export function usePress(onTap: () => void, onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerCancel: () => clearTimeout(timer.current),
    onClick: () => {
      if (!fired.current) onTap();
    },
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}

/** Konfetti burst shown by Android when a habit is checked. */
export function celebrate(color: string, x: number, y: number) {
  if (getBool(Pref.disableAnimation)) return;
  void confetti({
    particleCount: 40,
    spread: 70,
    startVelocity: 25,
    ticks: 80,
    scalar: 0.7,
    colors: [color],
    origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    disableForReducedMotion: true,
  });
}

export interface PopupRequest {
  habitId: number;
  day: number;
  numerical: boolean;
  color: string;
  /** Where the tap happened, for the confetti. */
  x: number;
  y: number;
  /** Measurable habits only: confetti is shown when "at least" values change. */
  atLeast?: boolean;
}

/** Shows the right popup for [request] and stores the result. */
export function EntryPopup(props: { core: HabitsCore; request: PopupRequest; onClose: (changed: boolean) => void }) {
  const { core, request } = props;
  const entry = core.entry(request.habitId, request.day) as { value: number; notes: string };
  const save = (value: number, notes: string) => {
    core.setEntry(request.habitId, request.day, value, notes);
    props.onClose(true);
  };
  return request.numerical ? (
    <NumberPopup
      value={entry.value}
      notes={entry.notes}
      color={request.color}
      onSave={(value, notes) => {
        if (value !== entry.value && request.atLeast) celebrate(request.color, request.x, request.y);
        save(value, notes);
      }}
      onCancel={() => props.onClose(false)}
    />
  ) : (
    <CheckmarkPopup
      value={entry.value}
      notes={entry.notes}
      color={request.color}
      onSave={(value, notes) => {
        if (value !== entry.value && value === Entry.YES_MANUAL) celebrate(request.color, request.x, request.y);
        save(value, notes);
      }}
      onCancel={() => props.onClose(false)}
    />
  );
}

interface PopupProps {
  value: number;
  notes: string;
  color: string;
  onSave: (value: number, notes: string) => void;
  onCancel: () => void;
}

function PopupFrame(props: { onDismiss: () => void; children: preact.ComponentChildren }) {
  return (
    <div class="overlay center" onClick={props.onDismiss}>
      <div class="entry-popup" onClick={(e) => e.stopPropagation()}>{props.children}</div>
    </div>
  );
}

function CheckmarkPopup({ value, notes, color, onSave, onCancel }: PopupProps) {
  const [text, setText] = useState(notes);
  const pick = (v: number) => onSave(v, text.trim());
  // Like Android: closing without a choice still keeps edited notes.
  const dismiss = () => (text.trim() !== notes ? onSave(value, text.trim()) : onCancel());
  return (
    <PopupFrame onDismiss={dismiss}>
      <textarea class="popup-notes" placeholder="Notes" value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <div class="popup-buttons">
        <button class="fa popup-glyph" style={{ color }} onClick={() => pick(Entry.YES_MANUAL)}>{GLYPH.check}</button>
        {getBool(Pref.skipEnabled) && (
          <button class="fa popup-glyph" style={{ color }} onClick={() => pick(Entry.SKIP)}>{GLYPH.skipped}</button>
        )}
        <button class="fa popup-glyph muted-glyph" onClick={() => pick(Entry.NO)}>{GLYPH.times}</button>
        {getBool(Pref.questionMarks) && (
          <button class="fa popup-glyph muted-glyph" onClick={() => pick(Entry.UNKNOWN)}>{GLYPH.question}</button>
        )}
      </div>
    </PopupFrame>
  );
}

function NumberPopup({ value, notes, color, onSave, onCancel }: PopupProps) {
  const initial = value < 10 ? "0" : String(Number((value / 1000).toFixed(2)));
  const [text, setText] = useState(initial);
  const [noteText, setNoteText] = useState(notes);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const save = () => {
    const parsed = Number(text.replace(",", "."));
    const thousands = text.trim() === "" ? Entry.UNKNOWN : Number.isFinite(parsed) ? Math.round(parsed * 1000) : value;
    onSave(thousands, noteText.trim());
  };
  const dismiss = () => (noteText.trim() !== notes ? onSave(value, noteText.trim()) : onCancel());

  return (
    <PopupFrame onDismiss={dismiss}>
      <textarea class="popup-notes" placeholder="Notes" value={noteText} onInput={(e) => setNoteText(e.currentTarget.value)} />
      <div class="popup-number">
        <input
          ref={input}
          type="text"
          inputMode="decimal"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button class="popup-save" style={{ color }} onClick={save}>Save</button>
      </div>
      {(getBool(Pref.skipEnabled) || getBool(Pref.questionMarks)) && (
        <div class="popup-buttons">
          {getBool(Pref.skipEnabled) && <button class="popup-text-button" onClick={() => onSave(Entry.SKIP, noteText.trim())}>Skip day</button>}
          {getBool(Pref.questionMarks) && (
            <button class="fa popup-glyph muted-glyph" onClick={() => onSave(Entry.UNKNOWN, noteText.trim())}>{GLYPH.question}</button>
          )}
        </div>
      )}
    </PopupFrame>
  );
}

/** Android's HabitTypeDialog, shown before creating a habit. */
export function HabitTypePicker(props: { onPick: (numerical: boolean) => void; onClose: () => void }) {
  return (
    <div class="overlay center" onClick={props.onClose}>
      <div class="type-picker" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => props.onPick(false)}>
          <div class="type-title">Yes or No</div>
          <div class="muted">e.g. Did you wake up early today? Did you exercise? Did you play chess?</div>
        </button>
        <button onClick={() => props.onPick(true)}>
          <div class="type-title">Measurable</div>
          <div class="muted">e.g. How many miles did you run today? How many pages did you read?</div>
        </button>
      </div>
    </div>
  );
}

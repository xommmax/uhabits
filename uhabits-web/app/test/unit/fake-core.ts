// An in-memory stand-in for HabitsCore (HabitsCore.kt), with just enough behaviour for screen tests.
// Every method is a vi.fn, so tests can check what the UI asked core to do.
import { vi } from "vitest";
import type { HabitDetail, HabitForm, HabitRow } from "../../src/types";
import { PALETTE } from "../../src/format";

export const TODAY = 9797; // 2026-10-28, a Wednesday

export interface FakeHabit extends Omit<HabitRow, "values" | "notes" | "completed"> {
  position: number;
  entries: Map<number, { value: number; notes: string }>;
}

let nextId = 1;

export function fakeHabit(extra: Partial<FakeHabit> = {}): FakeHabit {
  const id = extra.id ?? nextId++;
  const colorIndex = extra.colorIndex ?? 8;
  return {
    id, name: `Habit ${id}`, question: "", description: "", colorIndex,
    colorLight: PALETTE[colorIndex].toLowerCase(), colorDark: "#80cbc4", customColor: null,
    archived: false, numerical: false, unit: "", freqNum: 1, freqDen: 1, category: "",
    targetValue: 0, targetType: 0, hasReminder: false, score: 0, position: id, entries: new Map(), ...extra,
  };
}

export function createFakeCore(habits: FakeHabit[] = []) {
  const state = {
    habits,
    showArchived: false,
    showCompleted: true,
    order: "BY_POSITION",
    firstRun: false,
    hints: [] as string[],
    today: TODAY,
  };
  const find = (id: number) => {
    const h = state.habits.find((x) => x.id === id);
    if (!h) throw new Error(`Habit not found: ${id}`);
    return h;
  };
  const value = (h: FakeHabit, day: number) => h.entries.get(day)?.value ?? (h.numerical ? -1 : -1);
  const handle = () => ({ draw: vi.fn(), click: vi.fn(), longClick: vi.fn(), scrollBy: vi.fn(() => true), columnWidth: 20, setOnEdited: vi.fn(), setOnPopup: vi.fn() });

  const core = {
    state,
    today: vi.fn(() => state.today),
    refreshToday: vi.fn(() => false),
    applyPreferences: vi.fn(),
    repairDatabase: vi.fn(),
    listHabits: vi.fn((search: string, days: number, firstDaysAgo: number): HabitRow[] => {
      let list = state.habits.filter((h) => (state.showArchived || !h.archived) && h.name.includes(search));
      if (!state.showCompleted) list = list.filter((h) => value(h, state.today) !== 2);
      list = [...list].sort((a, b) => (state.order === "BY_NAME_ASC" ? a.name.localeCompare(b.name) : a.position - b.position));
      return list.map(({ entries, position, ...h }) => {
        void position;
        const daysList = Array.from({ length: days }, (_, i) => state.today - firstDaysAgo - i);
        return {
          ...h,
          values: daysList.map((d) => entries.get(d)?.value ?? -1),
          notes: daysList.map((d) => entries.get(d)?.notes ?? ""),
          completed: daysList.map((d) => (entries.get(d)?.value ?? -1) >= h.targetValue * 1000 && h.numerical),
        };
      });
    }),
    listOptions: vi.fn(() => ({ showArchived: state.showArchived, showCompleted: state.showCompleted, order: state.order, hasHabits: state.habits.length > 0 })),
    setShowArchived: vi.fn((v: boolean) => (state.showArchived = v)),
    setShowCompleted: vi.fn((v: boolean) => (state.showCompleted = v)),
    sortBy: vi.fn((by: string) => (state.order = by === "manual" ? "BY_POSITION" : by === "name" ? "BY_NAME_ASC" : `BY_${by.toUpperCase()}`)),
    categories: vi.fn(() => [...new Set(state.habits.map((h) => h.category.trim()).filter(Boolean))].sort()),
    changeColor: vi.fn((ids: number[], colorIndex: number, custom: string | null) =>
      ids.forEach((id) => Object.assign(find(id), { colorIndex, customColor: custom, colorLight: (custom ?? PALETTE[colorIndex]).toLowerCase() }))),
    changeCategory: vi.fn((ids: number[], category: string) => ids.forEach((id) => (find(id).category = category.trim()))),
    renameCategory: vi.fn((from: string, to: string) => state.habits.forEach((h) => h.category === from && (h.category = to.trim()))),
    consumeFirstRun: vi.fn(() => {
      const first = state.firstRun;
      state.firstRun = false;
      return first;
    }),
    nextHint: vi.fn((_: string[]) => state.hints.shift() ?? null),
    habitDetail: vi.fn((id: number): HabitDetail => {
      const { entries, position, ...h } = find(id);
      void entries;
      void position;
      return { ...h, scoreMonthDiff: 0.1, scoreYearDiff: -0.25, totalCount: [...find(id).entries.values()].filter((e) => e.value === 2).length, streakCount: 2, targetRows: 5, scoreSpinner: 0, barSpinner: 1 };
    }),
    saveHabit: vi.fn((form: HabitForm) => {
      if (form.id !== null) {
        Object.assign(find(form.id), { ...form, id: form.id });
        return form.id;
      }
      const h = fakeHabit({ ...form, id: undefined, position: state.habits.length + 1 } as Partial<FakeHabit>);
      state.habits.push(h);
      return h.id;
    }),
    toggle: vi.fn((id: number, day: number) => {
      const h = find(id);
      const next = value(h, day) === 2 ? 0 : 2;
      h.entries.set(day, { value: next, notes: h.entries.get(day)?.notes ?? "" });
      return next;
    }),
    entry: vi.fn((id: number, day: number) => find(id).entries.get(day) ?? { value: -1, notes: "" }),
    setEntry: vi.fn((id: number, day: number, v: number, notes: string) => find(id).entries.set(day, { value: v, notes })),
    archive: vi.fn((ids: number[]) => ids.forEach((id) => (find(id).archived = true))),
    unarchive: vi.fn((ids: number[]) => ids.forEach((id) => (find(id).archived = false))),
    delete: vi.fn((ids: number[]) => (state.habits = state.habits.filter((h) => !ids.includes(h.id)))),
    move: vi.fn((id: number, refId: number, before: boolean) => {
      const list = [...state.habits].sort((a, b) => a.position - b.position).filter((h) => h.id !== id);
      const at = list.findIndex((h) => h.id === refId) + (before ? 0 : 1);
      list.splice(at, 0, find(id));
      list.forEach((h, i) => (h.position = i + 1));
    }),
    historyChart: vi.fn(handle),
    barChart: vi.fn(handle),
    scoreChart: vi.fn(handle),
    frequencyChart: vi.fn(handle),
    streakChart: vi.fn(handle),
    targetChart: vi.fn(handle),
    exportCsv: vi.fn(async () => new Uint8Array([80, 75])),
    exportBackup: vi.fn(() => new Uint8Array([1])),
    importBackup: vi.fn(async () => true),
    snapshot: vi.fn(() => new Uint8Array([1])),
    setOnWrite: vi.fn(),
  };
  return core;
}

export type FakeCore = ReturnType<typeof createFakeCore>;

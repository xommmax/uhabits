// Shapes of the plain objects returned by HabitsCore (see HabitsCore.kt).

export interface HabitSummary {
  id: number;
  name: string;
  question: string;
  description: string;
  colorIndex: number;
  colorLight: string;
  colorDark: string;
  /** "#RRGGBB" picked outside the palette (colorIndex is then the nearest palette color), or null. */
  customColor: string | null;
  archived: boolean;
  numerical: boolean;
  unit: string;
  freqNum: number;
  freqDen: number;
  category: string;
  targetValue: number;
  /** 0 = at least, 1 = at most (core's NumericalHabitType). */
  targetType: number;
  hasReminder: boolean;
  score: number;
}

export interface HabitRow extends HabitSummary {
  /** Check-in values, index 0 = today (thousandths for measurable habits). */
  values: number[];
  notes: string[];
  completed: boolean[];
}

export interface HabitDetail extends HabitSummary {
  scoreMonthDiff: number;
  scoreYearDiff: number;
  totalCount: number;
  streakCount: number;
  targetRows: number;
  /** Positions in Android's spinners, remembered in preferences. */
  scoreSpinner: number;
  barSpinner: number;
}

export interface HabitForm {
  id: number | null;
  name: string;
  question: string;
  description: string;
  colorIndex: number;
  customColor: string | null;
  freqNum: number;
  freqDen: number;
  numerical: boolean;
  unit: string;
  targetValue: number;
  targetType: number;
  category: string;
}

export type Route = { screen: "list" } | { screen: "habit"; id: number } | { screen: "edit"; id: number | null; numerical: boolean }
  | { screen: "settings" }
  // About opens from the list menu or from Settings, and goes back there
  | { screen: "about"; from: "list" | "settings" };

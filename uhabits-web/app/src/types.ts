// Shapes of the plain objects returned by HabitsCore (see HabitsCore.kt).

export interface HabitSummary {
  id: number;
  name: string;
  question: string;
  description: string;
  colorIndex: number;
  colorLight: string;
  colorDark: string;
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
  /** Check-in values, index 0 = today. */
  values: number[];
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
  freqNum: number;
  freqDen: number;
}

export type Route = { screen: "list" } | { screen: "habit"; id: number } | { screen: "edit"; id: number | null };

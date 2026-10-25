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
  score: number;
}

export interface HabitRow extends HabitSummary {
  /** Check-in values, index 0 = today. */
  values: number[];
}

export interface Streak {
  start: number;
  end: number;
  length: number;
}

export interface HabitDetail extends HabitSummary {
  scoreMonthDiff: number;
  scoreYearDiff: number;
  totalCount: number;
  streaks: Streak[];
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

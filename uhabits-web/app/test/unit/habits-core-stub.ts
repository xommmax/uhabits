// Stands in for the Kotlin build (habits-core) in unit tests, which use a fake core (fake-core.ts) or vi.mock.
export type HabitsCore = Record<string, (...args: never[]) => unknown>;
export type ChartHandle = {
  draw(): void;
  click(x: number, y: number): void;
  longClick(x: number, y: number): void;
  scrollBy(columns: number): boolean;
  columnWidth: number;
};
export function openHabitsCore(): never {
  throw new Error("The real core is not loaded in unit tests");
}

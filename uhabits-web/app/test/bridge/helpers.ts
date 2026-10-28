// Opens the real Kotlin core (habits-core, built by `npm run core`) on sql.js in Node.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { openHabitsCore, type HabitsCore } from "habits-core";
import type { HabitDetail, HabitForm, HabitRow } from "../../src/types";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../../..");
export const TEST_ASSETS = `${ROOT}/uhabits-core/assets/test`;

const migrations = Object.fromEntries(
  fs.readdirSync(`${ROOT}/uhabits-core/assets/main/migrations`).map((f) => [`migrations/${f}`, fs.readFileSync(`${ROOT}/uhabits-core/assets/main/migrations/${f}`, "utf8")]),
);

let sql: SqlJsStatic | undefined;
export async function SQL(): Promise<SqlJsStatic> {
  sql ??= await initSqlJs({ locateFile: (f: string) => `${ROOT}/uhabits-web/app/node_modules/sql.js/dist/${f}` });
  return sql;
}

/** Typed view of the parts of HabitsCore the tests use (the generated .d.mts types results as any). */
export type Core = HabitsCore & {
  listHabits(search: string, days: number, firstDaysAgo: number): HabitRow[];
  habitDetail(id: number): HabitDetail;
  listOptions(): { showArchived: boolean; showCompleted: boolean; order: string; hasHabits: boolean };
  entry(id: number, day: number): { value: number; notes: string };
};

export async function openCore(bytes: Uint8Array | null = null): Promise<Core> {
  return (await openHabitsCore(await SQL(), bytes as never, migrations)) as unknown as Core;
}

export const Entry = { UNKNOWN: -1, NO: 0, YES_AUTO: 1, YES_MANUAL: 2, SKIP: 3 } as const;

export function form(extra: Partial<HabitForm> = {}): HabitForm {
  return {
    id: null, name: "Habit", question: "", description: "", colorIndex: 8, customColor: null, freqNum: 1, freqDen: 1,
    numerical: false, unit: "", targetValue: 0, targetType: 0, category: "", ...extra,
  };
}

/** SQLite user_version of a database file. */
export function userVersion(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(60);
}

export async function query(bytes: Uint8Array, sqlText: string): Promise<unknown[][]> {
  const db = new (await SQL()).Database(bytes);
  try {
    return db.exec(sqlText)[0]?.values ?? [];
  } finally {
    db.close();
  }
}

export const setPref = (name: string, value: string | boolean | number) => localStorage.setItem(`pref:${name}`, String(value));

// Kotlin checks `as CanvasRenderingContext2D` / `as HTMLCanvasElement` with instanceof
class FakeContext2D {}
class FakeCanvasElement {}
Object.assign(globalThis, { CanvasRenderingContext2D: FakeContext2D, HTMLCanvasElement: FakeCanvasElement });

/** A canvas good enough for core's JsCanvas: it records the drawing calls and the text drawn. */
export function fakeCanvas(clientWidth: number, clientHeight: number) {
  const calls: { op: string; args: unknown[] }[] = [];
  const texts: string[] = [];
  const state = new FakeContext2D() as Record<string, unknown>;
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return (t: string) => ({ width: t.length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 2 });
      return (...args: unknown[]) => {
        calls.push({ op: prop, args });
        if (prop === "fillText") texts.push(String(args[0]));
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return Object.assign(new FakeCanvasElement(), { clientWidth, clientHeight, width: 0, height: 0, getContext: () => ctx, calls, texts });
}
export type FakeCanvas = ReturnType<typeof fakeCanvas>;

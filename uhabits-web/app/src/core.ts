// Starts the Kotlin core (habits-core = uhabits-web compiled to JS) on sql.js, and saves the database
// to IndexedDB after every change. See docs/ARCHITECTURE.md for the whole picture.

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { openHabitsCore, type HabitsCore } from "habits-core";
import { loadDatabase, saveDatabase } from "./storage";

export type { HabitsCore };

const migrations = import.meta.glob<string>("../../../uhabits-core/assets/main/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

function bundledResources(): Record<string, string> {
  const resources: Record<string, string> = {};
  for (const [path, sql] of Object.entries(migrations)) {
    resources[`migrations/${path.split("/").pop()}`] = sql;
  }
  return resources;
}

const SAVE_DELAY_MS = 300;

/** Loads the saved database (or creates one) and saves it again after every change. */
export async function startCore(onSaveError: (e: unknown) => void): Promise<HabitsCore> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await loadDatabase();
  const core = await openHabitsCore(SQL, saved, bundledResources());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    try {
      await saveDatabase(core.snapshot());
    } catch (e) {
      onSaveError(e);
    }
  };
  core.setOnWrite(() => {
    timer ??= setTimeout(flush, SAVE_DELAY_MS);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer !== undefined) void flush();
  });

  if (!saved) await flush();
  return core;
}

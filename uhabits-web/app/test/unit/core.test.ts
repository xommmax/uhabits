import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initSqlJs: vi.fn(async (_: unknown) => ({ name: "SQL" })),
  openHabitsCore: vi.fn(),
  loadDatabase: vi.fn(),
  saveDatabase: vi.fn(),
}));
vi.mock("sql.js", () => ({ default: mocks.initSqlJs }));
vi.mock("sql.js/dist/sql-wasm.wasm?url", () => ({ default: "/assets/sql-wasm.wasm" }));
vi.mock("habits-core", () => ({ openHabitsCore: mocks.openHabitsCore }));
vi.mock("../../src/storage", () => ({ loadDatabase: mocks.loadDatabase, saveDatabase: mocks.saveDatabase }));

import { startCore } from "../../src/core";

let onWrite: () => void;
let snapshots: number;
const fakeCore = {
  setOnWrite: (cb: () => void) => (onWrite = cb),
  snapshot: () => new Uint8Array([++snapshots]),
};
let hidden = false;

beforeEach(() => {
  snapshots = 0;
  hidden = false;
  Object.defineProperty(document, "visibilityState", { get: () => (hidden ? "hidden" : "visible"), configurable: true });
  mocks.openHabitsCore.mockResolvedValue(fakeCore);
  mocks.loadDatabase.mockResolvedValue(new Uint8Array([42]));
  mocks.saveDatabase.mockResolvedValue(undefined);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("startCore", () => {
  it("opens the saved database with sql.js and the bundled migrations", async () => {
    const core = await startCore(vi.fn());
    expect(core).toBe(fakeCore);
    const locate = (mocks.initSqlJs.mock.calls[0][0] as { locateFile: () => string }).locateFile;
    expect(locate()).toBe("/assets/sql-wasm.wasm");
    const [sql, bytes, resources] = mocks.openHabitsCore.mock.calls[0];
    expect(sql).toEqual({ name: "SQL" });
    expect(bytes).toEqual(new Uint8Array([42]));
    // Every migration from version 9 up to core's DATABASE_VERSION (26), keyed like Android's assets
    const keys = Object.keys(resources).sort();
    expect(keys).toContain("migrations/09.sql");
    expect(keys).toContain("migrations/26.sql");
    for (let v = 9; v <= 26; v++) expect(keys).toContain(`migrations/${String(v).padStart(2, "0")}.sql`);
    expect(resources["migrations/26.sql"]).toMatch(/category/i);
    expect(mocks.saveDatabase).not.toHaveBeenCalled();
  });

  it("saves a new database right away", async () => {
    mocks.loadDatabase.mockResolvedValue(null);
    await startCore(vi.fn());
    expect(mocks.openHabitsCore.mock.calls[0][1]).toBeNull();
    expect(mocks.saveDatabase).toHaveBeenCalledWith(new Uint8Array([1]));
  });

  it("saves 300 ms after a change, once for a burst of changes", async () => {
    await startCore(vi.fn());
    onWrite();
    vi.advanceTimersByTime(100);
    onWrite();
    onWrite();
    vi.advanceTimersByTime(199);
    expect(mocks.saveDatabase).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.saveDatabase).toHaveBeenCalledTimes(1);
    onWrite();
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.saveDatabase).toHaveBeenCalledTimes(2);
    expect(mocks.saveDatabase).toHaveBeenLastCalledWith(new Uint8Array([2]));
  });

  it("saves at once when the app goes to the background with a change pending", async () => {
    await startCore(vi.fn());
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.saveDatabase).not.toHaveBeenCalled(); // nothing pending
    onWrite();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.saveDatabase).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.saveDatabase).toHaveBeenCalledTimes(1); // the pending timer was cancelled
  });

  it("does not save when the app comes back to the foreground", async () => {
    await startCore(vi.fn());
    onWrite();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.saveDatabase).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    const onError = vi.fn();
    const error = new Error("QuotaExceeded");
    mocks.saveDatabase.mockRejectedValue(error);
    await startCore(onError);
    onWrite();
    await vi.advanceTimersByTimeAsync(300);
    expect(onError).toHaveBeenCalledWith(error);
    // and keeps trying on the next change
    onWrite();
    await vi.advanceTimersByTimeAsync(300);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

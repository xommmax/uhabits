import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDatabase, requestPersistence, saveDatabase } from "../../src/storage";

afterEach(() => {
  Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
});

describe("IndexedDB storage", () => {
  it("has nothing on a new install, then keeps the last saved bytes", async () => {
    expect(await loadDatabase()).toBeNull();
    await saveDatabase(new Uint8Array([1, 2, 3]));
    expect(await loadDatabase()).toEqual(new Uint8Array([1, 2, 3]));
    await saveDatabase(new Uint8Array([4, 5]));
    expect(await loadDatabase()).toEqual(new Uint8Array([4, 5]));
  });

  it("uses the database name, store and key the installed app already has", async () => {
    await saveDatabase(new Uint8Array([7]));
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("loop-habits");
      req.onsuccess = () => resolve(req.result);
    });
    const value = await new Promise((resolve) => {
      const req = db.transaction("files").objectStore("files").get("uhabits.db");
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    expect(value).toEqual(new Uint8Array([7]));
  });

  it("handles large databases", async () => {
    const big = new Uint8Array(5_000_000).map((_, i) => i % 251);
    await saveDatabase(big);
    expect((await loadDatabase())!.length).toBe(big.length);
  });

  it("rejects when IndexedDB fails", async () => {
    const open = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        Object.defineProperty(req, "error", { value: new DOMException("quota", "QuotaExceededError") });
        req.onerror?.(new Event("error"));
      });
      return req;
    });
    await expect(saveDatabase(new Uint8Array([1]))).rejects.toThrow("quota");
    open.mockRestore();
  });
});

describe("requestPersistence", () => {
  it("asks the browser to keep the data", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    expect(await requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("is false when refused, unsupported or failing", async () => {
    Object.defineProperty(navigator, "storage", { value: { persist: vi.fn().mockResolvedValue(false) }, configurable: true });
    expect(await requestPersistence()).toBe(false);
    Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
    expect(await requestPersistence()).toBe(false);
    Object.defineProperty(navigator, "storage", { value: {}, configurable: true });
    expect(await requestPersistence()).toBe(false);
    Object.defineProperty(navigator, "storage", { value: { persist: vi.fn().mockRejectedValue(new Error("x")) }, configurable: true });
    expect(await requestPersistence()).toBe(false);
  });
});

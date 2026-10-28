import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HabitsCore } from "../../src/core";
import { daysSinceBackup, pickBackupFile, recordFirstUse, shareBackup, shareCsv, shareFile, shouldRemind, snoozeReminder } from "../../src/backup";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 28, 14, 5, 9).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

describe("backup reminder", () => {
  it("records the first use once", () => {
    recordFirstUse();
    expect(localStorage.getItem("backup:firstUse")).toBe(String(NOW));
    vi.setSystemTime(NOW + DAY);
    recordFirstUse();
    expect(localStorage.getItem("backup:firstUse")).toBe(String(NOW));
  });

  it("counts whole days since the last backup", () => {
    expect(daysSinceBackup()).toBeNull();
    localStorage.setItem("backup:last", String(NOW));
    expect(daysSinceBackup()).toBe(0);
    localStorage.setItem("backup:last", String(NOW - DAY + 1));
    expect(daysSinceBackup()).toBe(0);
    localStorage.setItem("backup:last", String(NOW - 3 * DAY - 5));
    expect(daysSinceBackup()).toBe(3);
  });

  it("does not remind on a new install", () => {
    expect(shouldRemind()).toBe(false);
    recordFirstUse();
    expect(shouldRemind()).toBe(false);
  });

  it("reminds 14 days after the first use when there was never a backup", () => {
    localStorage.setItem("backup:firstUse", String(NOW - 14 * DAY + 1));
    expect(shouldRemind()).toBe(false);
    localStorage.setItem("backup:firstUse", String(NOW - 14 * DAY));
    expect(shouldRemind()).toBe(true);
  });

  it("counts from the last backup, not the first use, once there is one", () => {
    localStorage.setItem("backup:firstUse", String(NOW - 100 * DAY));
    localStorage.setItem("backup:last", String(NOW - 13 * DAY));
    expect(shouldRemind()).toBe(false);
    localStorage.setItem("backup:last", String(NOW - 15 * DAY));
    expect(shouldRemind()).toBe(true);
  });

  it("'Not now' snoozes it for 3 days", () => {
    localStorage.setItem("backup:firstUse", String(NOW - 30 * DAY));
    snoozeReminder();
    expect(localStorage.getItem("backup:snoozeUntil")).toBe(String(NOW + 3 * DAY));
    expect(shouldRemind()).toBe(false);
    vi.setSystemTime(NOW + 3 * DAY - 1);
    expect(shouldRemind()).toBe(false);
    vi.setSystemTime(NOW + 3 * DAY);
    expect(shouldRemind()).toBe(true);
  });
});

describe("shareFile", () => {
  const file = new File(["x"], "a.db");

  it("opens the share sheet when files can be shared", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { canShare: vi.fn(() => true), share });
    expect(await shareFile(file)).toBe(true);
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  it("returns false when the share sheet is cancelled", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("no", "AbortError")) });
    expect(await shareFile(file)).toBe(false);
  });

  it("passes on other share errors", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) });
    await expect(shareFile(file)).rejects.toThrow("denied");
  });

  it("downloads the file where sharing files is unsupported", async () => {
    Object.assign(navigator, { canShare: () => false });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("a.db");
      expect(this.href).toMatch(/^blob:/);
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.useFakeTimers();
    expect(await shareFile(file)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("downloads when the browser has no canShare at all", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    expect(await shareFile(file)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});

describe("shareBackup and shareCsv", () => {
  const fakeCore = () =>
    ({
      exportBackup: vi.fn(() => new Uint8Array([1, 2, 3])),
      exportCsv: vi.fn(async () => new Uint8Array([80, 75])),
    }) as unknown as HabitsCore & { exportBackup: ReturnType<typeof vi.fn>; exportCsv: ReturnType<typeof vi.fn> };

  const captureShare = (result: Promise<void> = Promise.resolve()) => {
    const shared: File[] = [];
    Object.assign(navigator, {
      canShare: () => true,
      share: vi.fn(async ({ files }: { files: File[] }) => {
        shared.push(...files);
        return result;
      }),
    });
    return shared;
  };

  it("names the backup like Android and records the time", async () => {
    const core = fakeCore();
    const shared = captureShare();
    localStorage.setItem("backup:snoozeUntil", String(NOW + DAY));
    expect(await shareBackup(core)).toBe(true);
    expect(shared[0].name).toBe("Loop Habits Backup 2026-10-28 140509.db");
    expect(shared[0].type).toBe("application/octet-stream");
    expect(new Uint8Array(await shared[0].arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(localStorage.getItem("backup:last")).toBe(String(NOW));
    expect(localStorage.getItem("backup:snoozeUntil")).toBeNull();
  });

  it("exports the Android 2.3.2 format unless categories are wanted", async () => {
    const core = fakeCore();
    captureShare();
    await shareBackup(core);
    expect(core.exportBackup).toHaveBeenLastCalledWith(false);
    localStorage.setItem("pref:web_backup_categories", "true");
    await shareBackup(core);
    expect(core.exportBackup).toHaveBeenLastCalledWith(true);
  });

  it("records nothing when the share sheet is cancelled", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("", "AbortError")) });
    localStorage.setItem("backup:snoozeUntil", "5");
    expect(await shareBackup(fakeCore())).toBe(false);
    expect(localStorage.getItem("backup:last")).toBeNull();
    expect(localStorage.getItem("backup:snoozeUntil")).toBe("5");
  });

  it("pads single-digit months, days and times", async () => {
    vi.setSystemTime(new Date(2027, 0, 2, 3, 4, 5));
    const shared = captureShare();
    await shareBackup(fakeCore());
    expect(shared[0].name).toBe("Loop Habits Backup 2027-01-02 030405.db");
  });

  it("names the CSV zip like Android and passes the selected habits", async () => {
    const core = fakeCore();
    const shared = captureShare();
    expect(await shareCsv(core, [4, 7])).toBe(true);
    expect(core.exportCsv).toHaveBeenCalledWith([4, 7]);
    expect(shared[0].name).toBe("Loop Habits CSV 2026-10-28.zip");
    expect(shared[0].type).toBe("application/zip");
  });
});

describe("pickBackupFile", () => {
  it("resolves to the picked file's bytes", async () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    const picked = pickBackupFile();
    expect(input!.type).toBe("file");
    Object.defineProperty(input!, "files", { value: [new File([new Uint8Array([9, 8])], "b.db")] });
    input!.onchange!(new Event("change"));
    expect(await picked).toEqual(new Uint8Array([9, 8]));
  });

  it("resolves to null when cancelled", async () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    const picked = pickBackupFile();
    input!.oncancel!(new Event("cancel"));
    expect(await picked).toBeNull();
  });

  it("resolves to null when the change has no file", async () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    const picked = pickBackupFile();
    Object.defineProperty(input!, "files", { value: [] });
    input!.onchange!(new Event("change"));
    expect(await picked).toBeNull();
  });
});

import type { HabitsCore } from "./core";

const LAST_BACKUP = "backup:last";
const FIRST_USE = "backup:firstUse";
const SNOOZE_UNTIL = "backup:snoozeUntil";

const DAY_MS = 86_400_000;
const REMIND_AFTER_DAYS = 14;
const SNOOZE_DAYS = 3;

const readTime = (key: string) => {
  const value = localStorage.getItem(key);
  return value === null ? null : Number(value);
};

export function recordFirstUse() {
  if (readTime(FIRST_USE) === null) localStorage.setItem(FIRST_USE, String(Date.now()));
}

/** Whole days since the last backup, or null if there was never one. */
export function daysSinceBackup(): number | null {
  const last = readTime(LAST_BACKUP);
  return last === null ? null : Math.floor((Date.now() - last) / DAY_MS);
}

export function shouldRemind(): boolean {
  const now = Date.now();
  if ((readTime(SNOOZE_UNTIL) ?? 0) > now) return false;
  const since = readTime(LAST_BACKUP) ?? readTime(FIRST_USE) ?? now;
  return now - since >= REMIND_AFTER_DAYS * DAY_MS;
}

export function snoozeReminder() {
  localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_DAYS * DAY_MS));
}

// Same name pattern as Android: "Loop Habits Backup yyyy-MM-dd HHmmss.db"
function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `Loop Habits Backup ${date} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
}

/**
 * Opens the iOS share sheet with [file] (or downloads it where sharing files is
 * unsupported). Returns false if the user cancelled.
 */
export async function shareFile(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      throw e;
    }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  return true;
}

/** Shares an Android-compatible backup. Returns false if the user cancelled. */
export async function shareBackup(core: HabitsCore): Promise<boolean> {
  const bytes = core.exportBackup() as Uint8Array<ArrayBuffer>;
  const file = new File([bytes], backupFileName(), { type: "application/octet-stream" });
  if (!(await shareFile(file))) return false;
  localStorage.setItem(LAST_BACKUP, String(Date.now()));
  localStorage.removeItem(SNOOZE_UNTIL);
  return true;
}

/** Shares a zip of CSV files, named like Android's "Loop Habits CSV yyyy-MM-dd.zip". */
export async function shareCsv(core: HabitsCore, ids: number[]): Promise<boolean> {
  const bytes = (await core.exportCsv(ids)) as Uint8Array<ArrayBuffer>;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `Loop Habits CSV ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
  return shareFile(new File([bytes], name, { type: "application/zip" }));
}

/** Lets the user pick a backup file and merges it into the current habits. */
export function pickBackupFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? new Uint8Array(await file.arrayBuffer()) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

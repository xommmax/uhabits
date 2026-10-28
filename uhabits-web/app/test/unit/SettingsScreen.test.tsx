import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "../../src/SettingsScreen";
import type { HabitsCore } from "../../src/core";
import { createFakeCore, type FakeCore } from "./fake-core";

const DAY = 86_400_000;
function renderSettings(core: FakeCore = createFakeCore()) {
  const props = { core: core as unknown as HabitsCore, refresh: vi.fn(), toast: vi.fn(), onBack: vi.fn(), onAbout: vi.fn() };
  return { ...render(<SettingsScreen {...props} />), props, core };
}
const settingsRow = (title: string) => screen.getByText(title).closest(".settings-row") as HTMLElement;
const isOn = (title: string) => settingsRow(title).querySelector(".switch")!.classList.contains("on");

beforeEach(() => {
  delete (navigator as { canShare?: unknown }).canShare;
});
afterEach(() => vi.unstubAllGlobals());

describe("SettingsScreen", () => {
  it("has Android's sections and rows in order", () => {
    const { container } = renderSettings();
    expect([...container.querySelectorAll(".form-label")].map((l) => l.textContent)).toEqual(["Interface", "Database", "Troubleshooting", "Links"]);
    const titles = [...container.querySelectorAll(".settings-text > div:first-child")].map((t) => t.textContent);
    expect(titles).toEqual([
      "Toggle with short press",
      "Extend day a few hours past midnight",
      "Enable skip days",
      "Show question marks for missing data",
      "Reverse order of days",
      "Use pure black in dark theme",
      "Disable animations",
      "First day of the week",
      "Export full backup",
      "Export as CSV",
      "Import data",
      "Include categories in backups",
      "Repair database",
      "Help & FAQ",
      "About",
    ]);
  });

  it.each([
    ["Toggle with short press", "pref_short_toggle"],
    ["Enable skip days", "pref_skip_enabled"],
    ["Show question marks for missing data", "pref_unknown_enabled"],
    ["Reverse order of days", "pref_checkmark_reverse_order"],
    ["Disable animations", "pref_disable_animation"],
    ["Include categories in backups", "web_backup_categories"],
  ])("'%s' switches %s", (title, key) => {
    const { props } = renderSettings();
    expect(isOn(title)).toBe(false);
    expect(settingsRow(title).querySelector(".switch")!.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(settingsRow(title));
    expect(localStorage.getItem(`pref:${key}`)).toBe("true");
    expect(isOn(title)).toBe(true);
    expect(props.refresh).toHaveBeenCalled();
    fireEvent.click(settingsRow(title));
    expect(localStorage.getItem(`pref:${key}`)).toBe("false");
    expect(isOn(title)).toBe(false);
  });

  it("the midnight delay recomputes today in core", () => {
    const { core } = renderSettings();
    fireEvent.click(settingsRow("Extend day a few hours past midnight"));
    expect(localStorage.getItem("pref:pref_midnight_delay")).toBe("true");
    expect(core.applyPreferences).toHaveBeenCalledOnce();
  });

  it("pure black is applied at once", () => {
    renderSettings();
    fireEvent.click(settingsRow("Use pure black in dark theme"));
    expect(document.documentElement.classList.contains("pure-black")).toBe(true);
  });

  it("first day of the week lists Default and the 7 days, with Android's values", () => {
    localStorage.setItem("pref:pref_first_weekday", "2");
    const { core, props } = renderSettings();
    const select = settingsRow("First day of the week").querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => `${o.value}:${o.text}`)).toEqual(["-1:Default", "1:Sunday", "2:Monday", "3:Tuesday", "4:Wednesday", "5:Thursday", "6:Friday", "7:Saturday"]);
    expect(select.value).toBe("2");
    fireEvent.change(select, { target: { value: "1" } });
    expect(localStorage.getItem("pref:pref_first_weekday")).toBe("1");
    expect(core.applyPreferences).toHaveBeenCalledOnce();
    expect(props.refresh).toHaveBeenCalled();
  });

  describe("backups", () => {
    const summary = () => settingsRow("Export full backup").querySelector(".settings-summary")!.textContent;
    it.each([
      [null, "No backup yet."],
      [0, "Last backup: today."],
      [1, "Last backup: 1 day ago."],
      [5, "Last backup: 5 days ago."],
    ])("last backup %s days ago → %s", (days, text) => {
      if (days !== null) localStorage.setItem("backup:last", String(Date.now() - days * DAY - 1000));
      renderSettings();
      expect(summary()).toMatch(new RegExp(`${text.replace(".", "\\.")}$`));
    });

    it("exports a backup, says so and updates the summary", async () => {
      Object.assign(navigator, { canShare: () => true, share: vi.fn().mockResolvedValue(undefined) });
      const { props } = renderSettings();
      fireEvent.click(settingsRow("Export full backup"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Backup saved"));
      await vi.waitFor(() => expect(summary()).toMatch(/Last backup: today\.$/));
    });

    it("cancelling the share sheet says nothing", async () => {
      const share = vi.fn().mockRejectedValue(new DOMException("", "AbortError"));
      Object.assign(navigator, { canShare: () => true, share });
      const { props } = renderSettings();
      fireEvent.click(settingsRow("Export full backup"));
      await vi.waitFor(() => expect(share).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 10));
      expect(props.toast).not.toHaveBeenCalled();
      expect(summary()).toMatch(/No backup yet\.$/);
    });

    it("a failed backup says so", async () => {
      const core = createFakeCore();
      core.exportBackup.mockImplementation(() => {
        throw new Error("x");
      });
      const { props } = renderSettings(core);
      fireEvent.click(settingsRow("Export full backup"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Could not create the backup"));
    });

    it("exports all habits as CSV, or says it could not", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { canShare: () => true, share });
      const { core, props } = renderSettings();
      fireEvent.click(settingsRow("Export as CSV"));
      await vi.waitFor(() => expect(share).toHaveBeenCalled());
      expect(core.exportCsv).toHaveBeenCalledWith([]);
      core.exportCsv.mockRejectedValue(new Error("x"));
      fireEvent.click(settingsRow("Export as CSV"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Could not export. Please try again."));
    });

    const pickFile = (bytes: Uint8Array | null) =>
      vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
        if (bytes === null) return void this.oncancel!(new Event("cancel"));
        Object.defineProperty(this, "files", { value: [new File([bytes as Uint8Array<ArrayBuffer>], "b.db")] });
        this.onchange!(new Event("change"));
      });

    it("imports a file and says so", async () => {
      pickFile(new Uint8Array([1, 2]));
      const { core, props } = renderSettings();
      fireEvent.click(settingsRow("Import data"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Import successful"));
      expect(core.importBackup).toHaveBeenCalledWith(new Uint8Array([1, 2]));
      expect(props.refresh).toHaveBeenCalled();
    });

    it("says when the file is not recognized", async () => {
      pickFile(new Uint8Array([1]));
      const core = createFakeCore();
      core.importBackup.mockResolvedValue(false);
      const { props } = renderSettings(core);
      fireEvent.click(settingsRow("Import data"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("File not recognized"));
    });

    it("says when the import failed half-way, and shows what was imported", async () => {
      pickFile(new Uint8Array([1]));
      const core = createFakeCore();
      core.importBackup.mockRejectedValue(new Error("no such column: uuid"));
      const { props } = renderSettings(core);
      fireEvent.click(settingsRow("Import data"));
      await vi.waitFor(() => expect(props.toast).toHaveBeenCalledWith("Failed to import data."));
      expect(props.refresh).toHaveBeenCalled();
    });

    it("does nothing when no file is picked", async () => {
      pickFile(null);
      const { core, props } = renderSettings();
      fireEvent.click(settingsRow("Import data"));
      await new Promise((r) => setTimeout(r, 10));
      expect(core.importBackup).not.toHaveBeenCalled();
      expect(props.toast).not.toHaveBeenCalled();
    });
  });

  it("repairs the database", () => {
    const { core, props } = renderSettings();
    fireEvent.click(settingsRow("Repair database"));
    expect(core.repairDatabase).toHaveBeenCalledOnce();
    expect(props.toast).toHaveBeenCalledWith("Database repaired");
  });

  it("links to the FAQ and About, and goes back", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { props } = renderSettings();
    fireEvent.click(settingsRow("Help & FAQ"));
    expect(open).toHaveBeenCalledWith("https://loophabits.org/faq.html", "_blank");
    fireEvent.click(settingsRow("About"));
    expect(props.onAbout).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(props.onBack).toHaveBeenCalled();
  });
});

import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { HabitsCore } from "./core";
import { TopBar } from "./components";
import { daysSinceBackup, pickBackupFile, shareBackup, shareCsv } from "./backup";
import { getBool, getString, Pref, setBool, setString } from "./prefs";
import { applyTheme } from "./theme";

const HELP_URL = "https://loophabits.org/faq.html";
const BACKUP_CATEGORIES = "web_backup_categories";

// Android's pref_first_weekday values: -1 = locale default, 1 = Sunday ... 7 = Saturday
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  core: HabitsCore;
  refresh: () => void;
  toast: (message: string) => void;
  onBack: () => void;
  onAbout: () => void;
}

/** Android's SettingsFragment (res/xml/preferences.xml), minus reminders and widgets. */
export function SettingsScreen({ core, refresh, toast, onBack, onAbout }: Props) {
  const [, setVersion] = useState(0);
  const rerender = () => setVersion((v) => v + 1);

  const toggle = (name: string, after?: () => void) => () => {
    setBool(name, !getBool(name));
    after?.();
    rerender();
    refresh();
  };

  const backUp = async () => {
    try {
      if (await shareBackup(core)) toast("Backup saved");
    } catch {
      toast("Could not create the backup");
    }
    rerender();
  };
  const exportCsv = async () => {
    try {
      await shareCsv(core, []);
    } catch {
      toast("Could not export. Please try again.");
    }
  };
  const importData = async () => {
    const data = await pickBackupFile();
    if (!data) return;
    if (await core.importBackup(data)) {
      refresh();
      toast("Import successful");
    } else {
      toast("File not recognized");
    }
  };
  const repair = () => {
    core.repairDatabase();
    refresh();
    toast("Database repaired");
  };

  const days = daysSinceBackup();
  const lastBackup = days === null ? "No backup yet" : days === 0 ? "Last backup: today" : `Last backup: ${days} day${days === 1 ? "" : "s"} ago`;

  return (
    <div class="screen">
      <TopBar left={<button class="bar-button" onClick={onBack}>‹ Habits</button>} title="Settings" />
      <div class="form settings">
        <div class="form-label">Interface</div>
        <div class="form-group">
          <Switch title="Toggle with short press" summary="Put checkmarks with a single tap instead of press-and-hold." on={getBool(Pref.shortToggle)} onChange={toggle(Pref.shortToggle)} />
          <Switch
            title="Extend day a few hours past midnight"
            summary="Wait until 3:00 AM to show a new day. Useful if you typically go to sleep after midnight."
            on={getBool(Pref.midnightDelay)}
            onChange={toggle(Pref.midnightDelay, () => core.applyPreferences())}
          />
          <Switch title="Enable skip days" summary="Toggle twice to add a skip instead of a checkmark. Skips keep your score unchanged and don't break your streak." on={getBool(Pref.skipEnabled)} onChange={toggle(Pref.skipEnabled)} />
          <Switch title="Show question marks for missing data" summary="Differentiate days without data from actual lapses. To enter a lapse, toggle twice." on={getBool(Pref.questionMarks)} onChange={toggle(Pref.questionMarks)} />
          <Switch title="Reverse order of days" summary="Show days in reverse order on the main screen." on={getBool(Pref.reverseDays)} onChange={toggle(Pref.reverseDays)} />
          <Switch title="Use pure black in dark theme" summary="Replaces gray backgrounds with pure black in dark theme." on={getBool(Pref.pureBlack)} onChange={toggle(Pref.pureBlack, applyTheme)} />
          <Switch title="Disable animations" summary="Disable confetti animation after adding a checkmark." on={getBool(Pref.disableAnimation)} onChange={toggle(Pref.disableAnimation)} />
          <label class="settings-row">
            <div class="settings-text"><div>First day of the week</div></div>
            <select
              value={getString(Pref.firstWeekday, "-1")}
              onChange={(e) => {
                setString(Pref.firstWeekday, e.currentTarget.value);
                core.applyPreferences();
                rerender();
                refresh();
              }}
            >
              <option value="-1">Default</option>
              {WEEKDAYS.map((day, i) => <option value={String(i + 1)}>{day}</option>)}
            </select>
          </label>
        </div>

        <div class="form-label">Database</div>
        <div class="form-group">
          <Action title="Export full backup" summary={`Generates a file that contains all your data. This file can be imported back. ${lastBackup}.`} onClick={backUp} />
          <Switch
            title="Include categories in backups"
            summary="Only for Loop versions that support categories. The current Android app (2.3.2) cannot import these backups."
            on={getBool(BACKUP_CATEGORIES)}
            onChange={toggle(BACKUP_CATEGORIES)}
          />
          <Action title="Export as CSV" summary="Generates files that can be opened by spreadsheet software such as Microsoft Excel or OpenOffice Calc. This file cannot be imported back." onClick={exportCsv} />
          <Action title="Import data" summary="Supports full backups exported by this app, as well as files generated by Tickmate, HabitBull or Rewire." onClick={importData} />
        </div>

        <div class="form-label">Troubleshooting</div>
        <div class="form-group">
          <Action title="Repair database" onClick={repair} />
        </div>

        <div class="form-label">Links</div>
        <div class="form-group">
          <Action title="Help & FAQ" onClick={() => window.open(HELP_URL, "_blank")} />
          <Action title="About" onClick={onAbout} />
        </div>
      </div>
    </div>
  );
}

function Row(props: { title: string; summary?: string; children?: ComponentChildren; onClick?: () => void }) {
  return (
    <div class="settings-row" onClick={props.onClick} role={props.onClick ? "button" : undefined}>
      <div class="settings-text">
        <div>{props.title}</div>
        {props.summary && <div class="settings-summary">{props.summary}</div>}
      </div>
      {props.children}
    </div>
  );
}

const Action = (props: { title: string; summary?: string; onClick: () => void }) => <Row {...props} />;

function Switch(props: { title: string; summary?: string; on: boolean; onChange: () => void }) {
  return (
    <Row title={props.title} summary={props.summary} onClick={props.onChange}>
      <span class={`switch${props.on ? " on" : ""}`} role="switch" aria-checked={props.on} />
    </Row>
  );
}

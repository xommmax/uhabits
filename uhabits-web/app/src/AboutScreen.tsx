import { BarIcon, TopBar } from "./components";

// Android's AboutActivity (res/layout/about.xml and res/values/constants.xml)
const LINKS = [
  { label: "Send feedback", url: "mailto:dev@loophabits.org?subject=Feedback%20about%20Loop%20Habit%20Tracker" },
  { label: "Help translate this app", url: "https://translate.loophabits.org/" },
  { label: "View source code at GitHub", url: "https://github.com/iSoron/uhabits" },
  { label: "View privacy policy", url: "https://loophabits.org/privacy" },
];

const DEVELOPERS = [
  "Álinson S. Xavier (@iSoron)", "Quentin Hibon (@hiqua)", "Oleg Ivashchenko (@olegivo)", "Kristian Tashkov (@KristianTashkov)",
  "Jakub Kalinowski (@kalina559)", "Rechee Jozil (@recheej)", "Sebastian Gallese (@sgallese)", "Luboš Luňák (@llunak)",
  "Bindu (@vbh)", "Victor Yu (@vyu1)", "Christoph Hennemann (@chennemann)", "Денис (@sciamano)", "Joseph Tran (@JotraN)",
  "Nikhil (@regularcoder)", "JanetQC",
];

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const { version, commit, time } = __BUILD_INFO__;
  const built = new Date(time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div class="screen">
      <TopBar left={<BarIcon name="back" label="Back" onClick={onBack} />} title="About" />
      <div class="form about">
        <div class="about-header">
          <img src="icon-192.png" alt="" width={72} height={72} />
          <h1>Loop Habit Tracker</h1>
          <div class="muted">Version {version} ({commit}) · built {built}</div>
          <div class="muted">iPhone web version, built on the Android app's open-source code (GPLv3).</div>
        </div>

        <div class="form-label">Links</div>
        <div class="form-group">
          {LINKS.map((l) => (
            <a class="settings-row link" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
          ))}
        </div>

        <div class="form-label">Developers</div>
        <div class="form-group">
          {DEVELOPERS.map((d) => <div class="settings-row">{d}</div>)}
          <a class="settings-row link" href="https://github.com/iSoron/uhabits/graphs/contributors" target="_blank" rel="noreferrer">
            View all contributors
          </a>
        </div>
      </div>
    </div>
  );
}

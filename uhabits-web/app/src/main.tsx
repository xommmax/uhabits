import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { startCore } from "./core";
import { recordFirstUse } from "./backup";
import { requestPersistence } from "./storage";
import { applyDefaults } from "./prefs";
import { applyTheme } from "./theme";
import "./styles.css";

const root = document.getElementById("app")!;

function showError(title: string, detail: unknown) {
  render(
    <div class="fatal">
      <h1>{title}</h1>
      <p>{String(detail)}</p>
    </div>,
    root,
  );
}

async function main() {
  registerSW({ immediate: true });
  recordFirstUse();
  applyDefaults();
  applyTheme();
  void requestPersistence();
  // Charts draw text with these fonts, so they must be ready before the first draw.
  await Promise.all([document.fonts.load("12px NotoSans"), document.fonts.load("bold 12px NotoSansBold"), document.fonts.load("12px FontAwesome")]);
  const core = await startCore((e) => alert(`Your last change could not be saved (${e}). Please back up your habits.`));
  render(<App core={core} />, root);
}

main().catch((e) => showError("Could not start the app", e));

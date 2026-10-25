import { useEffect, useState } from "preact/hooks";
import type { HabitsCore } from "./core";
import type { Route } from "./types";
import { ListScreen } from "./ListScreen";
import { HabitScreen } from "./HabitScreen";
import { EditScreen } from "./EditScreen";
import { Intro } from "./Intro";
import { SettingsScreen } from "./SettingsScreen";
import { AboutScreen } from "./AboutScreen";

const TOAST_MS = 2500;
const CLOCK_CHECK_MS = 60_000;

export function App({ core }: { core: HabitsCore }) {
  const [route, setRoute] = useState<Route>({ screen: "list" });
  const [rev, setRev] = useState(0);
  const [toastText, setToastText] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(() => core.consumeFirstRun());
  const refresh = () => setRev((r) => r + 1);

  const toast = (message: string) => {
    setToastText(message);
    setTimeout(() => setToastText((t) => (t === message ? null : t)), TOAST_MS);
  };

  // Roll over to the next day while the app stays open.
  useEffect(() => {
    const check = () => core.refreshToday() && refresh();
    const timer = setInterval(check, CLOCK_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => window.scrollTo(0, 0), [route]);

  let screen;
  switch (route.screen) {
    case "list":
      screen = (
        <ListScreen
          core={core}
          rev={rev}
          refresh={refresh}
          toast={toast}
          onOpen={(id) => setRoute({ screen: "habit", id })}
          onAdd={(numerical) => setRoute({ screen: "edit", id: null, numerical })}
          onEdit={(id) => setRoute({ screen: "edit", id, numerical: false })}
          onSettings={() => setRoute({ screen: "settings" })}
          onAbout={() => setRoute({ screen: "about" })}
        />
      );
      break;
    case "habit":
      screen = (
        <HabitScreen
          core={core}
          id={route.id}
          rev={rev}
          refresh={refresh}
          toast={toast}
          onBack={() => setRoute({ screen: "list" })}
          onEdit={() => setRoute({ screen: "edit", id: route.id, numerical: false })}
        />
      );
      break;
    case "edit":
      screen = (
        <EditScreen
          core={core}
          id={route.id}
          numerical={route.numerical}
          onDone={() => {
            refresh();
            setRoute(route.id === null ? { screen: "list" } : { screen: "habit", id: route.id });
          }}
        />
      );
      break;
  }

  if (route.screen === "settings") {
    screen = (
      <SettingsScreen
        core={core}
        refresh={refresh}
        toast={toast}
        onBack={() => setRoute({ screen: "list" })}
        onAbout={() => setRoute({ screen: "about" })}
      />
    );
  } else if (route.screen === "about") {
    screen = <AboutScreen onBack={() => setRoute({ screen: "settings" })} />;
  }

  return (
    <>
      {screen}
      {toastText && <div class="toast">{toastText}</div>}
      {showIntro && <Intro onDone={() => setShowIntro(false)} />}
    </>
  );
}

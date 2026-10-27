// Android's performHapticFeedback: a firm tick when a checkmark is toggled or a cell long-pressed (LONG_PRESS),
// a light one when a day is pressed in the calendar (VIRTUAL_KEY).
// Android browsers have the Vibration API. Safari has none, but since iOS 18 clicking the label of a
// <input type="checkbox" switch> plays the system's haptic tick; this is undocumented and Apple may have
// limited it in later versions, so on an iPhone it may do nothing.

const VIBRATION_MS = { toggle: 20, key: 10 } as const;

export function haptic(kind: keyof typeof VIBRATION_MS) {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(VIBRATION_MS[kind]);
    return;
  }
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

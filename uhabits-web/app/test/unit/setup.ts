import { cleanup } from "@testing-library/preact";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
  document.body.innerHTML = "";
});

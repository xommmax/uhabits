import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A canvas context that records what is drawn
function recordingContext() {
  const calls: string[] = [];
  const fills: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(prop);
        if (prop === "fillRect" || prop === "fill") fills.push(String(target.fillStyle));
        void args;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx, calls, fills };
}

let frames: ((t: number) => void)[] = [];
let contexts: ReturnType<typeof recordingContext>[] = [];
async function load() {
  vi.resetModules();
  return import("../../src/confetti");
}
/** Runs the queued animation frame at [time] ms. */
function runFrame(time: number) {
  const queued = frames;
  frames = [];
  queued.forEach((f) => f(time));
}

beforeEach(() => {
  frames = [];
  contexts = [];
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => (frames.push(f), frames.length));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const c = recordingContext();
    contexts.push(c);
    return c.ctx as unknown as CanvasRenderingContext2D;
  });
  Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("konfetti", () => {
  it("adds a small canvas around the tap, capped at 2x pixels", async () => {
    const { konfetti } = await load();
    konfetti("#00897B", 300, 400);
    const canvas = document.querySelector("body > canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(640);
    expect(canvas.style.left).toBe("200px");
    expect(canvas.style.top).toBe("300px");
    expect(canvas.style.width).toBe("200px");
    expect(canvas.style.height).toBe("320px");
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.style.position).toBe("fixed");
  });

  it("draws particles in the habit colour and three hue-shifted ones, then removes the canvas", async () => {
    const { konfetti } = await load();
    konfetti("#FF0000", 100, 100);
    expect(frames).toHaveLength(1);
    let t = 0;
    runFrame(t);
    for (let i = 0; i < 20; i++) runFrame((t += 16));
    const colors = new Set(contexts[0].fills);
    // changeHue(red, 180) = cyan, ±20 degrees = orange-ish and pink-ish
    expect([...colors].every((c) => ["#FF0000", "rgb(0, 255, 255)", "rgb(255, 85, 0)", "rgb(255, 0, 85)"].includes(c))).toBe(true);
    expect(colors.has("#FF0000")).toBe(true);
    expect(colors.size).toBeGreaterThan(1);
    // Particles fade 5 alpha steps per 1/60 s, from 255: all gone in a bit over 0.85 s
    for (let i = 0; i < 120 && frames.length; i++) runFrame((t += 16));
    expect(document.querySelector("body > canvas")).toBeNull();
    expect(frames).toHaveLength(0);
    expect(t).toBeLessThan(1500);
  });

  it("emits 25 particles over the first 25 ms", async () => {
    const { konfetti } = await load();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    konfetti("#00897B", 100, 100);
    runFrame(0);
    runFrame(100);
    // Each drawn particle is one fill (circle) or fillRect (square); Math.random 0.5 makes them all squares
    const squares = contexts[0].calls.filter((c) => c === "fillRect").length;
    expect(squares).toBe(25);
    random.mockRestore();
  });

  it("runs several bursts on one animation loop", async () => {
    const { konfetti } = await load();
    konfetti("#00897B", 100, 100);
    konfetti("#D32F2F", 200, 100);
    expect(frames).toHaveLength(1);
    expect(document.querySelectorAll("body > canvas")).toHaveLength(2);
    let t = 0;
    for (let i = 0; i < 200 && frames.length; i++) runFrame((t += 16));
    expect(document.querySelectorAll("body > canvas")).toHaveLength(0);
  });

  it("drops particles that fall below the screen", async () => {
    Object.defineProperty(window, "innerHeight", { value: 120, configurable: true });
    const { konfetti } = await load();
    konfetti("#00897B", 100, 100);
    let t = 0;
    for (let i = 0; i < 200 && frames.length; i++) runFrame((t += 16));
    expect(document.querySelector("body > canvas")).toBeNull();
  });
});

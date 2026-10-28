import { act, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let frames: ((t: number) => void)[] = [];
async function load() {
  vi.resetModules(); // the scroll position is kept in a module variable
  return import("../../src/dayScroll");
}
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => (frames.push(f), frames.length));
  vi.stubGlobal("cancelAnimationFrame", () => (frames = []));
  HTMLElement.prototype.setPointerCapture ??= () => {};
});
afterEach(() => vi.unstubAllGlobals());

const W = 48;
async function setup(reversed = true, maxOffset = 55, mod?: Awaited<ReturnType<typeof load>>) {
  const loaded = mod ?? (await load());
  const { useDayScroll } = loaded;
  const offsets: number[] = [];
  function List() {
    const s = useDayScroll(W, reversed, maxOffset);
    offsets.push(s.offset);
    return (
      <div class="habit-list" ref={s.listRef}>
        <div class="list-header" {...s.handlers} />
        <span class="offset">{s.offset}</span>
      </div>
    );
  }
  const r = render(<List />);
  const header = r.container.querySelector(".list-header") as HTMLElement;
  const list = r.container.querySelector(".habit-list") as HTMLElement;
  const offset = () => Number(r.container.querySelector(".offset")!.textContent);
  const shift = () => list.style.getPropertyValue("--day-shift");
  return { ...r, header, offset, shift, offsets, mod: loaded };
}
const pointer = (el: HTMLElement, type: string, x: number, y = 0, t = 0, extra: PointerEventInit = {}) => {
  const e = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, isPrimary: true, pointerId: 1, ...extra });
  Object.defineProperty(e, "timeStamp", { value: t });
  act(() => void el.dispatchEvent(e));
};
const runFrames = (step = 16, max = 500) => {
  let t = 1000;
  for (let i = 0; i < max && frames.length; i++) {
    const queued = frames;
    frames = [];
    act(() => queued.forEach((f) => f(t)));
    t += step;
  }
};

describe("useDayScroll", () => {
  it("starts at today with no shift", async () => {
    const { offset, shift } = await setup();
    expect(offset()).toBe(0);
    expect(shift()).toBe("0px");
  });

  it("follows the finger after the 8 px slop, moving older days in from the left when reversed", async () => {
    const { header, offset, shift } = await setup(true);
    pointer(header, "pointerdown", 100, 0, 0);
    pointer(header, "pointermove", 108, 0, 10);
    expect(shift()).toBe("0px"); // still within the slop
    pointer(header, "pointermove", 120, 0, 20);
    // the drag starts where the slop ended, so the days don't jump by it
    expect(shift()).toBe("0px");
    pointer(header, "pointermove", 150, 0, 30);
    expect(shift()).toBe("30px");
    pointer(header, "pointermove", 190, 0, 40);
    expect(offset()).toBe(1);
    expect(shift()).toBe("22px"); // 70 px = 1 day + 22 px
  });

  it("drags the other way when today is on the left", async () => {
    const { header, offset, shift } = await setup(false);
    pointer(header, "pointerdown", 300);
    pointer(header, "pointermove", 280);
    pointer(header, "pointermove", 200);
    expect(offset()).toBe(1);
    expect(shift()).toBe("-32px");
  });

  it("cannot go past today or past the oldest day", async () => {
    const { header, offset, shift } = await setup(true, 5);
    pointer(header, "pointerdown", 300);
    pointer(header, "pointermove", 280);
    pointer(header, "pointermove", 100);
    expect(offset()).toBe(0);
    expect(shift()).toBe("0px");
    pointer(header, "pointerup", 100, 0, 5000);
    pointer(header, "pointerdown", 0, 0, 6000);
    pointer(header, "pointermove", 20, 0, 6010);
    pointer(header, "pointermove", 1000, 0, 6020);
    expect(offset()).toBe(5);
    expect(shift()).toBe("0px");
  });

  it("a mostly vertical move lets the page scroll instead", async () => {
    const { header, shift } = await setup();
    pointer(header, "pointerdown", 100, 100);
    pointer(header, "pointermove", 106, 120);
    pointer(header, "pointermove", 200, 120);
    expect(shift()).toBe("0px");
  });

  it("settles on the nearest whole day after a slow release", async () => {
    const { header, offset, shift } = await setup();
    pointer(header, "pointerdown", 100, 0, 0);
    pointer(header, "pointermove", 110, 0, 100);
    pointer(header, "pointermove", 140, 0, 600); // 30 px: more than half a day
    pointer(header, "pointerup", 140, 0, 1200);
    expect(frames).toHaveLength(1);
    runFrames();
    expect(offset()).toBe(1);
    expect(shift()).toBe("0px");

    pointer(header, "pointerdown", 100, 0, 2000);
    pointer(header, "pointermove", 110, 0, 2100);
    pointer(header, "pointermove", 120, 0, 2600); // 10 px: back to the same day
    pointer(header, "pointerup", 120, 0, 3200);
    runFrames();
    expect(offset()).toBe(1);
    expect(shift()).toBe("0px");
  });

  it("a flick coasts several days with Android's fling and lands on a whole day", async () => {
    const { header, offset, shift } = await setup();
    pointer(header, "pointerdown", 0, 0, 0);
    for (let i = 1; i <= 10; i++) pointer(header, "pointermove", 10 + i * 15, 0, i * 10); // 1500 px/s
    pointer(header, "pointerup", 160, 0, 100);
    const before = offset();
    runFrames();
    expect(offset()).toBeGreaterThan(before + 1);
    expect(shift()).toBe("0px");
    expect(frames).toHaveLength(0);
  });

  it("touching moving days stops them", async () => {
    const { header, offset } = await setup();
    pointer(header, "pointerdown", 0, 0, 0);
    for (let i = 1; i <= 10; i++) pointer(header, "pointermove", 10 + i * 15, 0, i * 10);
    pointer(header, "pointerup", 160, 0, 100);
    runFrames(16, 3);
    pointer(header, "pointerdown", 50, 0, 200);
    expect(frames).toHaveLength(0);
    const stopped = offset();
    pointer(header, "pointerup", 50, 0, 210); // a tap: settles where it is
    runFrames();
    expect(Math.abs(offset() - stopped)).toBeLessThanOrEqual(1);
  });

  it("ignores secondary pointers and buttons", async () => {
    const { header, shift } = await setup();
    pointer(header, "pointerdown", 100, 0, 0, { isPrimary: false });
    pointer(header, "pointermove", 200);
    expect(shift()).toBe("0px");
    pointer(header, "pointerdown", 100, 0, 0, { button: 2 });
    pointer(header, "pointermove", 200);
    expect(shift()).toBe("0px");
  });

  it("pointer cancel settles on a day", async () => {
    const { header, offset, shift } = await setup();
    pointer(header, "pointerdown", 100);
    pointer(header, "pointermove", 110);
    pointer(header, "pointermove", 175);
    pointer(header, "pointercancel", 175);
    runFrames();
    expect(offset()).toBe(1);
    expect(shift()).toBe("0px");
  });

  it("keeps the position when the list is closed and opened again", async () => {
    const first = await setup();
    pointer(first.header, "pointerdown", 0);
    pointer(first.header, "pointermove", 10);
    pointer(first.header, "pointermove", 10 + 3 * W);
    pointer(first.header, "pointerup", 10 + 3 * W, 0, 5000);
    runFrames();
    expect(first.offset()).toBe(3);
    first.unmount();
    const second = await setup(true, 55, first.mod);
    expect(second.offset()).toBe(3);
  });

  it("re-clamps when fewer days can be scrolled (e.g. the phone was rotated)", async () => {
    const first = await setup(true, 55);
    pointer(first.header, "pointerdown", 0);
    pointer(first.header, "pointermove", 10);
    pointer(first.header, "pointermove", 10 + 10 * W);
    pointer(first.header, "pointerup", 10 + 10 * W, 0, 5000);
    expect(first.offset()).toBe(10);
    first.unmount();
    const second = await setup(true, 4, first.mod);
    expect(second.offset()).toBe(4);
  });
});

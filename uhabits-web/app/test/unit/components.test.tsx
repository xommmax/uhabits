import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarIcon, Chart, Menu, Ring, Spinner, TopBar } from "../../src/components";
import type { ChartHandle } from "habits-core";

let resizeCallbacks: (() => void)[] = [];
beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: () => void) {}
      observe() {
        resizeCallbacks.push(this.cb);
      }
      disconnect() {
        resizeCallbacks = resizeCallbacks.filter((c) => c !== this.cb);
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Ring", () => {
  const arc = (value: number) => {
    const { container } = render(<Ring value={value} color="#f00" size={30} thickness={5} />);
    const circles = container.querySelectorAll("circle");
    const [filled, total] = circles[1].getAttribute("stroke-dasharray")!.split(" ").map(Number);
    return { filled, total, track: circles[0], arc: circles[1] };
  };

  it("draws the score as a fraction of the circle from 12 o'clock", () => {
    const { filled, total, arc: a, track } = arc(0.25);
    expect(total).toBeCloseTo(2 * Math.PI * 12.5);
    expect(filled / total).toBeCloseTo(0.25);
    expect(a.getAttribute("stroke")).toBe("#f00");
    expect(a.getAttribute("transform")).toBe("rotate(-90 15 15)");
    expect(track.getAttribute("stroke")).toBe("var(--faint)");
  });

  it("clamps to 0..1", () => {
    expect(arc(-0.5).filled).toBe(0);
    const over = arc(1.7);
    expect(over.filled).toBeCloseTo(over.total);
  });
});

describe("TopBar", () => {
  it("shows title and buttons, with a status band in the bar colour", () => {
    const onClick = vi.fn();
    const { container } = render(<TopBar title="Hi" color="rgb(1, 2, 3)" left={<BarIcon name="back" label="Back" onClick={onClick} />} right={<span>r</span>} />);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Hi");
    expect((container.querySelector(".topbar") as HTMLElement).style.background).toBe("rgb(1, 2, 3)");
    const band = container.querySelector(".status-band") as HTMLElement;
    expect(band.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(band.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(container.querySelector(".topbar")!.classList.contains("no-left")).toBe(false);
  });

  it("without a colour uses the theme's, and marks a bar without a left button", () => {
    const { container } = render(<TopBar title="x" />);
    expect((container.querySelector(".status-band") as HTMLElement).getAttribute("style")).toBeNull();
    expect(container.querySelector(".topbar")!.classList.contains("no-left")).toBe(true);
  });

  it("publishes its height for the sticky day row, and updates it on resize", () => {
    let height = 56;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
    const { unmount } = render(<TopBar title="x" />);
    expect(document.documentElement.style.getPropertyValue("--topbar-height")).toBe("56px");
    height = 103;
    resizeCallbacks.forEach((c) => c());
    expect(document.documentElement.style.getPropertyValue("--topbar-height")).toBe("103px");
    unmount();
    expect(resizeCallbacks).toHaveLength(0);
  });
});

describe("Menu", () => {
  it("closes first, then runs the item", () => {
    const order: string[] = [];
    render(<Menu onClose={() => order.push("close")} items={[{ label: "A", onClick: () => order.push("A") }]} />);
    fireEvent.click(screen.getByText("A"));
    expect(order).toEqual(["close", "A"]);
  });

  it("shows checkboxes and submenu arrows like Android", () => {
    const { container } = render(
      <Menu
        onClose={vi.fn()}
        items={[
          { label: "On", checked: true, onClick: vi.fn() },
          { label: "Off", checked: false, onClick: vi.fn() },
          { label: "Sub", submenu: true, onClick: vi.fn() },
          { label: "Plain", onClick: vi.fn() },
        ]}
      />,
    );
    const items = container.querySelectorAll(".menu-item");
    expect(items[0].querySelector(".checkbox.on")).not.toBeNull();
    expect(items[1].querySelector(".checkbox")!.classList.contains("on")).toBe(false);
    expect(items[2].querySelector(".menu-arrow")).not.toBeNull();
    expect(items[3].querySelector(".checkbox, .menu-arrow")).toBeNull();
  });

  it("closes when tapping outside, not inside", () => {
    const onClose = vi.fn();
    const { container } = render(<Menu onClose={onClose} items={[]} />);
    fireEvent.click(container.querySelector(".menu")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".menu-overlay")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Spinner", () => {
  it("shows the value, opens over itself and picks an option", () => {
    const onChange = vi.fn();
    const { container } = render(<Spinner options={["Day", "Week", "Month"]} value={1} onChange={onChange} />);
    const button = container.querySelector(".spinner") as HTMLElement;
    expect(button.textContent).toBe("Week");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top: 300, left: 40 } as DOMRect);
    fireEvent.click(button);
    const dropdown = container.querySelector(".spinner-dropdown") as HTMLElement;
    expect(dropdown.style.top).toBe("300px");
    expect(dropdown.style.left).toBe("40px");
    fireEvent.click(screen.getByText("Month"));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(container.querySelector(".spinner-dropdown")).toBeNull();
  });

  it("stays inside the window near the bottom", () => {
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });
    const { container } = render(<Spinner options={["A", "B", "C", "D", "E"]} value={0} onChange={vi.fn()} />);
    const button = container.querySelector(".spinner") as HTMLElement;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top: 480, left: 0 } as DOMRect);
    fireEvent.click(button);
    // 5 items × 48 + 12 = 252 px tall
    expect((container.querySelector(".spinner-dropdown") as HTMLElement).style.top).toBe(`${500 - 252 - 8}px`);
    fireEvent.click(container.querySelector(".menu-overlay")!);
    expect(container.querySelector(".spinner-dropdown")).toBeNull();
  });
});

describe("Chart", () => {
  function fakeHandle(columnWidth = 20, maxColumns = 100) {
    let offset = 0;
    const handle = {
      columnWidth,
      draw: vi.fn(),
      click: vi.fn(),
      longClick: vi.fn(),
      scrollBy: vi.fn((columns: number) => {
        const next = offset + columns;
        if (next < 0 || next > maxColumns) return false;
        offset = next;
        return true;
      }),
      get offset() {
        return offset;
      },
    };
    return handle;
  }
  let frames: ((t: number) => void)[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => (frames.push(f), frames.length));
    vi.stubGlobal("cancelAnimationFrame", () => (frames = []));
    HTMLElement.prototype.setPointerCapture ??= () => {};
  });
  const runFrames = (from: number, step: number, count: number) => {
    let t = from;
    for (let i = 0; i < count && frames.length; i++) {
      const queued = frames;
      frames = [];
      queued.forEach((f) => f(t));
      t += step;
    }
  };
  const setup = (props: { readOnly?: boolean; keepScroll?: boolean } = {}, handle = fakeHandle()) => {
    const create = vi.fn(() => handle as unknown as ChartHandle);
    const result = render(<Chart create={create} deps={[1]} height={160} {...props} />);
    const canvas = result.container.querySelector("canvas") as HTMLCanvasElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 10, top: 100, width: 300, height: 160 } as DOMRect);
    return { ...result, canvas, handle, create };
  };
  const pointer = (type: string, canvas: HTMLElement, x: number, y = 150, timeStamp = 0) => {
    const e = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true });
    Object.defineProperty(e, "timeStamp", { value: timeStamp });
    canvas.dispatchEvent(e);
  };

  it("creates and draws the chart, with the given height", () => {
    const { canvas, handle, create } = setup();
    expect(create).toHaveBeenCalledWith(canvas);
    expect(handle.draw).toHaveBeenCalledOnce();
    expect(canvas.style.height).toBe("160px");
    resizeCallbacks.forEach((c) => c());
    expect(handle.draw).toHaveBeenCalledTimes(2);
  });

  it("a tap clicks at the position inside the canvas", () => {
    const { canvas, handle } = setup();
    pointer("pointerdown", canvas, 60);
    pointer("pointerup", canvas, 60);
    expect(handle.click).toHaveBeenCalledWith(50, 50);
    expect(handle.longClick).not.toHaveBeenCalled();
  });

  it("holding 500 ms is a long click, and releasing then does not click", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { canvas, handle } = setup();
    pointer("pointerdown", canvas, 60);
    vi.advanceTimersByTime(500);
    expect(handle.longClick).toHaveBeenCalledWith(50, 50);
    pointer("pointerup", canvas, 60);
    expect(handle.click).not.toHaveBeenCalled();
  });

  it("read-only charts neither click nor long click", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { canvas, handle } = setup({ readOnly: true });
    pointer("pointerdown", canvas, 60);
    vi.advanceTimersByTime(600);
    pointer("pointerup", canvas, 60);
    expect(handle.click).not.toHaveBeenCalled();
    expect(handle.longClick).not.toHaveBeenCalled();
  });

  it("dragging sideways scrolls whole columns and is not a click", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { canvas, handle } = setup();
    pointer("pointerdown", canvas, 100, 150, 0);
    pointer("pointermove", canvas, 105, 150, 10);
    expect(handle.scrollBy).not.toHaveBeenCalled(); // within the tap slop
    pointer("pointermove", canvas, 150, 150, 20);
    expect(handle.scrollBy).toHaveBeenLastCalledWith(3); // round(50 / 20)
    pointer("pointermove", canvas, 170, 150, 30);
    expect(handle.scrollBy).toHaveBeenLastCalledWith(1);
    pointer("pointermove", canvas, 130, 150, 40);
    expect(handle.scrollBy).toHaveBeenLastCalledWith(-2);
    expect(handle.offset).toBe(2);
    vi.advanceTimersByTime(1000);
    pointer("pointerup", canvas, 130, 150, 1000); // finger rested: no fling
    expect(handle.longClick).not.toHaveBeenCalled();
    expect(handle.click).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it("a fast swipe keeps coasting, and a touch stops it without clicking", () => {
    const { canvas, handle } = setup();
    pointer("pointerdown", canvas, 50, 150, 0);
    for (let i = 1; i <= 8; i++) pointer("pointermove", canvas, 50 + i * 20, 150, i * 10); // 2000 px/s
    pointer("pointerup", canvas, 210, 150, 80);
    const afterDrag = handle.offset;
    expect(afterDrag).toBe(8);
    expect(frames).toHaveLength(1);
    runFrames(0, 16, 10);
    expect(handle.offset).toBeGreaterThan(afterDrag);
    pointer("pointerdown", canvas, 60);
    pointer("pointerup", canvas, 60);
    expect(handle.click).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it("the coasting stops at the end of the data", () => {
    const { canvas, handle } = setup({}, fakeHandle(20, 10));
    pointer("pointerdown", canvas, 50, 150, 0);
    for (let i = 1; i <= 8; i++) pointer("pointermove", canvas, 50 + i * 20, 150, i * 10);
    pointer("pointerup", canvas, 210, 150, 80);
    runFrames(0, 16, 200);
    expect(handle.offset).toBe(10);
    expect(frames).toHaveLength(0);
  });

  it("keepScroll keeps the position when the chart is re-created", () => {
    const handle = fakeHandle();
    const create = vi.fn(() => handle as unknown as ChartHandle);
    const { container, rerender } = render(<Chart create={create} deps={[1]} height={100} keepScroll />);
    const canvas = container.querySelector("canvas")!;
    pointer("pointerdown", canvas, 100, 150, 0);
    pointer("pointermove", canvas, 160, 150, 500);
    pointer("pointerup", canvas, 160, 150, 1000);
    expect(handle.offset).toBe(3);
    handle.scrollBy.mockClear();
    rerender(<Chart create={create} deps={[2]} height={100} keepScroll />);
    expect(create).toHaveBeenCalledTimes(2);
    expect(handle.scrollBy).toHaveBeenCalledWith(3);
  });

  it("without keepScroll a re-created chart starts at today", () => {
    const handle = fakeHandle();
    const create = vi.fn(() => handle as unknown as ChartHandle);
    const { container, rerender } = render(<Chart create={create} deps={[1]} height={100} />);
    const canvas = container.querySelector("canvas")!;
    pointer("pointerdown", canvas, 100, 150, 0);
    pointer("pointermove", canvas, 160, 150, 500);
    pointer("pointerup", canvas, 160, 150, 1000);
    handle.scrollBy.mockClear();
    rerender(<Chart create={create} deps={[2]} height={100} />);
    expect(handle.scrollBy).not.toHaveBeenCalled();
  });

  it("pointer cancel ends the gesture without a click", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { canvas, handle } = setup();
    pointer("pointerdown", canvas, 60);
    pointer("pointercancel", canvas, 60);
    vi.advanceTimersByTime(1000);
    expect(handle.longClick).not.toHaveBeenCalled();
    pointer("pointermove", canvas, 200);
    expect(handle.scrollBy).not.toHaveBeenCalled();
  });

  it("blocks the context menu", () => {
    const { canvas } = setup();
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => void canvas.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
  });
});

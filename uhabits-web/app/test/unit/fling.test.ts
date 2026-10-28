import { describe, expect, it } from "vitest";
import { fling, MAX_FLING_VELOCITY, MIN_FLING_VELOCITY, releaseVelocity } from "../../src/fling";

// android.widget.Scroller at density 1 (160 ppi): getSplineDeceleration / getSplineFlingDuration / getSplineFlingDistance
const DECELERATION_RATE = Math.log(0.78) / Math.log(0.9);
const PHYSICAL_COEFF = 9.80665 * 39.37 * 160 * 0.84;
const androidDuration = (v: number) => {
  const l = Math.log((0.35 * Math.abs(v)) / (0.015 * PHYSICAL_COEFF));
  return Math.trunc(1000 * Math.exp(l / (DECELERATION_RATE - 1)));
};
const androidDistance = (v: number) => {
  const l = Math.log((0.35 * Math.abs(v)) / (0.015 * PHYSICAL_COEFF));
  return 0.015 * PHYSICAL_COEFF * Math.exp((DECELERATION_RATE / (DECELERATION_RATE - 1)) * l);
};

describe("fling (Scroller port)", () => {
  it.each([100, 500, 1000, 3000, 8000])("duration and total distance for %i px/s match Android", (v) => {
    const f = fling(v);
    expect(f.duration).toBe(androidDuration(v));
    expect(f.distanceAt(f.duration)).toBeCloseTo(androidDistance(v), 6);
  });

  it("has known values for a 1000 px/s fling", () => {
    const f = fling(1000);
    expect(f.duration).toBe(555);
    expect(Math.round(f.distanceAt(f.duration))).toBe(194);
  });

  it("starts at 0, ends at the total, and never goes backwards", () => {
    const f = fling(2500);
    // Android's SPLINE_POSITION[0] is a hair above 0 (its bisection stops within 1e-5), so is this port's
    expect(f.distanceAt(0)).toBeCloseTo(0, 1);
    let last = 0;
    for (let t = 0; t <= f.duration + 50; t += 5) {
      const d = f.distanceAt(t);
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      last = d;
    }
    expect(f.distanceAt(f.duration * 10)).toBe(f.distanceAt(f.duration));
  });

  it("decelerates: covers more distance early than late", () => {
    const f = fling(2000);
    const total = f.distanceAt(f.duration);
    expect(f.distanceAt(f.duration / 4)).toBeGreaterThan(total / 2);
  });

  it("is symmetric for negative velocities", () => {
    const a = fling(1500), b = fling(-1500);
    expect(b.duration).toBe(a.duration);
    for (const t of [0, 50, 200, a.duration]) expect(b.distanceAt(t)).toBeCloseTo(-a.distanceAt(t), 9);
  });

  it("faster flings go further and last longer", () => {
    const slow = fling(MIN_FLING_VELOCITY), fast = fling(MAX_FLING_VELOCITY);
    expect(fast.duration).toBeGreaterThan(slow.duration);
    expect(fast.distanceAt(fast.duration)).toBeGreaterThan(slow.distanceAt(slow.duration));
  });
});

describe("releaseVelocity (VelocityTracker LSQ2)", () => {
  const line = (v: number, n = 10, dt = 10, x0 = 0) => Array.from({ length: n }, (_, i) => ({ t: i * dt, x: x0 + (v * i * dt) / 1000 }));

  it("gives the exact speed of a steady move", () => {
    const s = line(600);
    expect(releaseVelocity(s, s[s.length - 1].t)).toBeCloseTo(600, 6);
    const back = line(-1200);
    expect(releaseVelocity(back, back[back.length - 1].t + 5)).toBeCloseTo(-1200, 6);
  });

  it("gives the speed at the moment of lifting, not the average, for a flick that speeds up", () => {
    // x = 0.5 a t² with a = 20000 px/s²: speed at t = 90 ms is 1800 px/s, the average only 900
    const s = Array.from({ length: 10 }, (_, i) => ({ t: i * 10, x: 0.5 * 20000 * ((i * 10) / 1000) ** 2 }));
    expect(releaseVelocity(s, 90)).toBeCloseTo(1800, 3);
  });

  it("is 0 when the finger stopped for more than 40 ms before lifting", () => {
    const s = line(800);
    expect(releaseVelocity(s, s[s.length - 1].t + 41)).toBe(0);
    expect(releaseVelocity(s, s[s.length - 1].t + 40)).not.toBe(0);
  });

  it("is 0 with fewer than two samples", () => {
    expect(releaseVelocity([], 0)).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 5 }], 0)).toBe(0);
  });

  it("uses a straight line with two samples", () => {
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 10, x: 5 }], 10)).toBeCloseTo(500, 6);
  });

  it("only looks at the last 100 ms", () => {
    // A fast move long ago, then a slow steady one for the last 100 ms
    const old = line(5000, 10, 10).map((s) => ({ ...s, t: s.t - 500 }));
    const recent = line(200, 11, 10, old[old.length - 1].x);
    expect(releaseVelocity([...old, ...recent], 100)).toBeCloseTo(200, 6);
  });

  it("is capped at Android's maximum fling velocity", () => {
    const s = line(50_000);
    expect(releaseVelocity(s, s[s.length - 1].t)).toBe(MAX_FLING_VELOCITY);
    expect(releaseVelocity(line(-50_000), 90)).toBe(-MAX_FLING_VELOCITY);
  });

  it("is 0 when all samples have the same time (no solution)", () => {
    expect(releaseVelocity([{ t: 5, x: 0 }, { t: 5, x: 10 }, { t: 5, x: 20 }], 5)).toBe(0);
  });
});

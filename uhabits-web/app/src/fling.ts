// Port of android.widget.Scroller's fling, which Android's ScrollableChart uses when a chart is swiped:
// the same spline every Android list coasts on. CSS px are treated as dp (density 1).

const INFLEXION = 0.35;
const START_TENSION = 0.5;
const END_TENSION = 1;
const P1 = START_TENSION * INFLEXION;
const P2 = 1 - END_TENSION * (1 - INFLEXION);
const DECELERATION_RATE = Math.log(0.78) / Math.log(0.9);
const NB_SAMPLES = 100;
const SCROLL_FRICTION = 0.015; // ViewConfiguration.getScrollFriction()
const PHYSICAL_COEFF = 9.80665 * 39.37 * 160 * 0.84; // GRAVITY_EARTH * inches per meter * ppi * tuning
/** ViewConfiguration's minimum and maximum fling velocities, in dp per second */
export const MIN_FLING_VELOCITY = 50;
export const MAX_FLING_VELOCITY = 8000;

/** Fraction of the fling distance covered at each hundredth of its duration (Scroller's SPLINE_POSITION). */
const SPLINE_POSITION = (() => {
  const table = new Float64Array(NB_SAMPLES + 1);
  let xMin = 0;
  for (let i = 0; i < NB_SAMPLES; i++) {
    const alpha = i / NB_SAMPLES;
    let xMax = 1, x = 0, coef = 0;
    for (;;) {
      x = xMin + (xMax - xMin) / 2;
      coef = 3 * x * (1 - x);
      const tx = coef * ((1 - x) * P1 + x * P2) + x * x * x;
      if (Math.abs(tx - alpha) < 1e-5) break;
      if (tx > alpha) xMax = x;
      else xMin = x;
    }
    table[i] = coef * ((1 - x) * START_TENSION + x) + x * x * x;
  }
  table[NB_SAMPLES] = 1;
  return table;
})();

export interface Fling {
  /** Total time in ms. */
  duration: number;
  /** Signed distance covered [elapsed] ms after the start, in px. */
  distanceAt(elapsed: number): number;
}

/** Scroller.fling for a [velocity] in px per second. */
export function fling(velocity: number): Fling {
  const l = Math.log((INFLEXION * Math.abs(velocity)) / (SCROLL_FRICTION * PHYSICAL_COEFF));
  const duration = Math.trunc(1000 * Math.exp(l / (DECELERATION_RATE - 1)));
  const total = Math.sign(velocity) * SCROLL_FRICTION * PHYSICAL_COEFF * Math.exp((DECELERATION_RATE / (DECELERATION_RATE - 1)) * l);
  return {
    duration,
    distanceAt(elapsed: number) {
      const t = Math.min(1, elapsed / duration);
      const index = Math.floor(NB_SAMPLES * t);
      if (index >= NB_SAMPLES) return total;
      const tInf = index / NB_SAMPLES;
      const dInf = SPLINE_POSITION[index];
      const velocityCoef = (SPLINE_POSITION[index + 1] - dInf) * NB_SAMPLES;
      return total * (dInf + (t - tInf) * velocityCoef);
    },
  };
}

/**
 * Release velocity in px per second from recent pointer samples, like Android's VelocityTracker: a least-squares
 * fit over the last 100 ms, and 0 if the finger stopped for 40 ms before lifting.
 */
export function releaseVelocity(samples: { t: number; x: number }[], upTime: number): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (upTime - last.t > 40) return 0;
  const recent = samples.filter((s) => last.t - s.t <= 100);
  if (recent.length < 2) return 0;
  const n = recent.length;
  const meanT = recent.reduce((s, p) => s + p.t, 0) / n;
  const meanX = recent.reduce((s, p) => s + p.x, 0) / n;
  let num = 0, den = 0;
  for (const p of recent) {
    num += (p.t - meanT) * (p.x - meanX);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return 0;
  const v = (num / den) * 1000;
  return Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, v));
}

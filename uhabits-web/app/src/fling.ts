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
 * Release velocity in px per second from recent pointer samples, like Android's default VelocityTracker strategy
 * (LSQ2): positions over the last 100 ms (at most 20 samples) fitted with a quadratic in time, and the velocity
 * at the newest sample is its slope there; 0 if the finger stopped for 40 ms before lifting. A straight-line fit
 * would give the average speed instead, which in a flick is well below the speed at the moment of lifting.
 */
export function releaseVelocity(samples: { t: number; x: number }[], upTime: number): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (upTime - last.t > 40) return 0;
  const recent = samples.filter((s) => last.t - s.t <= 100).slice(-20);
  // Time in seconds relative to the newest sample; with only two samples, the fit is a straight line
  const degree = recent.length >= 3 ? 2 : 1;
  if (recent.length < 2) return 0;
  const size = degree + 1;
  const sums = new Array(2 * degree + 1).fill(0), rhs = new Array(size).fill(0);
  for (const s of recent) {
    const t = (s.t - last.t) / 1000;
    for (let k = 0; k < sums.length; k++) sums[k] += t ** k;
    for (let k = 0; k < size; k++) rhs[k] += s.x * t ** k;
  }
  // Normal equations, solved by Gaussian elimination: coefficient 1 is the velocity
  const m = Array.from({ length: size }, (_, i) => [...sums.slice(i, i + size), rhs[i]]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let r = col + 1; r < size; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return 0;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < size; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= size; c++) m[r][c] -= f * m[col][c];
    }
  }
  const v = m[1][size] / m[1][1];
  return Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, v));
}

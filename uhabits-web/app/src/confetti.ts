// Port of the Konfetti 2.0.2 burst Android shows when a habit is checked
// (ListHabitsScreen.showConfetti + konfetti-core's PartyEmitter, Confetti and KonfettiView).
// Konfetti's physics run once per frame, so the burst depends on the refresh rate; it is stepped at a fixed
// 120 Hz here to look like Android on a 120 Hz phone whatever the iPhone's refresh rate. Sizes are in dp = CSS px.

const STEP = 1 / 120;
const SPEED_F = 60;
const GRAVITY = 0.02;
const SIZES = [
  { dp: 6, mass: 4 },
  { dp: 8, mass: 5 },
  { dp: 10, mass: 6 },
];
// Each burst draws on a small canvas around its origin, big enough for where particles can still be seen
// (at most 80 dp sideways or up before they stop, further down as they fall), instead of a full-screen one.
const BOX = { side: 100, up: 100, down: 220 };
// Tiny moving particles look the same at 2x; a 3x canvas would cost more than twice the pixels
const MAX_RATIO = 2;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  ax: number; ay: number;
  width: number; mass: number;
  circle: boolean; color: string;
  alpha: number;
  rotation: number; rotationWidth: number; scaleX: number;
  rotationSpeed2D: number; rotationSpeed3D: number;
}

interface Burst {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ratio: number;
  x: number; y: number; // origin in the viewport
  colors: string[];
  particles: Particle[];
  pending: number; elapsedMs: number; // emitter state
}

let bursts: Burst[] = [];
let lastTime = -1;
let accumulator = 0;

/** Like Android's ColorUtils.changeHue: rotates the HSV hue by [delta] degrees. */
function changeHue(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
  let h = c === 0 ? 0 : max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h = (((h * 60 + delta) % 360) + 360) % 360;
  const s = max === 0 ? 0 : c / max, v = max;
  const f = (k: number) => {
    const kk = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1))) * 255);
  };
  return `rgb(${f(5)}, ${f(3)}, ${f(1)})`;
}

/** A particle at the burst's origin; x and y are relative to it. */
function createParticle(burst: Burst): Particle {
  const size = SIZES[Math.floor(Math.random() * SIZES.length)];
  const speed = 16 * Math.random(); // speed 0, maxSpeed 16
  const angle = Math.random() * 2 * Math.PI; // spread 360
  const rotationSpeed = () => 1 + 0.5 * (Math.random() * 2 - 1);
  return {
    x: 0, y: 0,
    vx: speed * Math.cos(angle), vy: speed * Math.sin(angle),
    ax: 0, ay: 0,
    width: size.dp, mass: size.mass + size.mass * Math.random() * 0.2,
    circle: Math.random() < 0.5,
    color: burst.colors[Math.floor(Math.random() * burst.colors.length)],
    alpha: 255,
    rotation: 0, rotationWidth: size.dp, scaleX: 0,
    rotationSpeed2D: rotationSpeed() * 8, rotationSpeed3D: rotationSpeed() * 1.5,
  };
}

/** One physics step of [dt] seconds (PartyEmitter.createConfetti + Confetti.render). */
function step(burst: Burst, dt: number, height: number) {
  // Emitter(duration = 25 ms).max(25): one particle per ms while the 25 ms last
  burst.pending += dt;
  if (burst.pending >= 0.001 && burst.elapsedMs < 25) {
    const amount = Math.floor(burst.pending / 0.001);
    for (let i = 0; i < amount; i++) burst.particles.push(createParticle(burst));
    burst.pending %= 0.001;
  }
  burst.elapsedMs += dt * 1000;
  for (const p of burst.particles) {
    if (burst.y + p.y > height) { p.alpha = 0; continue; }
    p.ay += GRAVITY / p.mass; // Konfetti never resets the acceleration
    p.vx += p.ax; p.vy += p.ay;
    p.vx *= 0.9; p.vy *= 0.9;
    p.x += p.vx * dt * SPEED_F; p.y += p.vy * dt * SPEED_F;
    p.alpha = Math.max(0, p.alpha - Math.trunc(5 * dt * SPEED_F)); // timeToLive 0: fades from the start
    p.rotation += p.rotationSpeed2D * dt * SPEED_F;
    if (p.rotation >= 360) p.rotation = 0;
    p.rotationWidth -= Math.abs(p.rotationSpeed3D) * dt * SPEED_F;
    if (p.rotationWidth < 0) p.rotationWidth = p.width;
    p.scaleX = Math.abs(p.rotationWidth / p.width - 0.5) * 2;
  }
  burst.particles = burst.particles.filter((p) => p.alpha > 0);
}

/** KonfettiView.display, with the origin at (BOX.side, BOX.up) of the burst's canvas. */
function draw(burst: Burst) {
  const { ctx, ratio } = burst;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, burst.canvas.width, burst.canvas.height);
  for (const p of burst.particles) {
    const centerX = (p.scaleX * p.width) / 2;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.translate(BOX.side + p.x - centerX, BOX.up + p.y);
    ctx.translate(centerX, p.width / 2);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -p.width / 2);
    ctx.scale(p.scaleX, 1);
    ctx.globalAlpha = p.alpha / 255;
    ctx.fillStyle = p.color;
    if (p.circle) {
      ctx.beginPath();
      ctx.ellipse(p.width / 2, p.width / 2, p.width / 2, p.width / 2, 0, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, p.width, p.width);
    }
  }
}

function frame(time: number) {
  // Like Konfetti's TimerIntegration, the first frame only starts the clock (rAF times only, never mixed with performance.now)
  accumulator = lastTime < 0 ? 0 : Math.min(accumulator + (time - lastTime) / 1000, 0.25);
  lastTime = time;
  while (accumulator >= STEP) {
    for (const burst of bursts) step(burst, STEP, window.innerHeight);
    accumulator -= STEP;
  }
  for (const burst of bursts) {
    if (burst.particles.length || burst.elapsedMs < 25) draw(burst);
    else burst.canvas.remove();
  }
  bursts = bursts.filter((b) => b.canvas.isConnected);
  if (bursts.length) requestAnimationFrame(frame);
  else lastTime = -1;
}

/** Starts a burst at (x, y) in the habit's [color] and three hue-shifted variants, as Android does. */
export function konfetti(color: string, x: number, y: number) {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const width = 2 * BOX.side, height = BOX.up + BOX.down;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  Object.assign(canvas.style, {
    position: "fixed", left: `${x - BOX.side}px`, top: `${y - BOX.up}px`, width: `${width}px`, height: `${height}px`,
    pointerEvents: "none", zIndex: "30",
  });
  document.body.appendChild(canvas);
  bursts.push({
    canvas, ctx: canvas.getContext("2d")!, ratio, x, y,
    colors: [changeHue(color, 180), changeHue(color, 20), changeHue(color, -20), color],
    particles: [], pending: 0, elapsedMs: 0,
  });
  if (bursts.length === 1) requestAnimationFrame(frame);
}

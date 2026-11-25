export type SceneVariant = "hero" | "wide" | "banner";

export interface Scene {
  /** Sizes the scene for a canvas of `width` x `height` CSS pixels and repaints the still layers. */
  resize: (width: number, height: number, dpr: number) => void;
  /** Draws one frame. `seconds` is any steadily increasing clock. */
  draw: (seconds: number) => void;
}

type Ctx = CanvasRenderingContext2D;
type Rgb = readonly [number, number, number];

interface Fall {
  x: number;
  top: number;
  bottom: number;
  widthTop: number;
  widthBottom: number;
}

// The scene is drawn on an 800 x 900 canvas, then scaled to cover whatever space it is given.
const W = 800;
const H = 900;
// Which part stays in view when the space is shorter than 800:900 (1 = the bottom, 0 = the top).
const FOCUS: Record<SceneVariant, number> = {
  hero: 1,
  wide: 0.7,
  banner: 0.62,
};

const UPPER_FALL: Fall = {
  x: 578,
  top: 300,
  bottom: 452,
  widthTop: 16,
  widthBottom: 22,
};
const LOWER_FALL: Fall = {
  x: 562,
  top: 452,
  bottom: 716,
  widthTop: 38,
  widthBottom: 96,
};
const POOL_Y = 716;
const IMPACT_X = 562;
const FOG_W = 1200;
const LEDGES = [330, 390, 452, 520, 590, 660];

/* ---------- small helpers ---------- */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rgba = (color: Rgb, alpha: number): string =>
  `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;

/** A tiny seeded random generator, so the scene looks the same every time it is drawn. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth, natural-looking noise between 0 and 1. */
function makeNoise(seed: number): (x: number) => number {
  const rand = mulberry32(seed);
  const table = Array.from({ length: 256 }, () => rand());
  const at = (i: number): number => table[((i % 256) + 256) % 256];
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const value = (x: number): number => {
    const i = Math.floor(x);
    return lerp(at(i), at(i + 1), smooth(x - i));
  };
  return (x) =>
    value(x) * 0.6 + value(x * 2.1 + 11) * 0.28 + value(x * 4.3 + 23) * 0.12;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): Ctx {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser can't draw the background scene.");
  return context;
}

/** A soft round glow, used for mist and fireflies. */
function makeSprite(size: number, color: Rgb, core: number): HTMLCanvasElement {
  const canvas = makeCanvas(size, size);
  const g = get2d(canvas);
  const gradient = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, rgba(color, core));
  gradient.addColorStop(0.4, rgba(color, core * 0.4));
  gradient.addColorStop(1, rgba(color, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return canvas;
}

/** A strip of soft fog wisps that wraps seamlessly, scrolled sideways to make fog drift. */
function makeFogTexture(): HTMLCanvasElement {
  const rand = mulberry32(9);
  const canvas = makeCanvas(FOG_W, 240);
  const g = get2d(canvas);
  for (let i = 0; i < 22; i++) {
    const cx = rand() * FOG_W;
    const cy = 240 * (0.3 + rand() * 0.4);
    const rx = 120 + rand() * 220;
    const ry = 24 + rand() * 46;
    const alpha = 0.3 + rand() * 0.3;
    // each wisp is also drawn one tile to the left and right so the strip wraps without a seam
    for (const shift of [-FOG_W, 0, FOG_W]) {
      g.save();
      g.translate(cx + shift, cy);
      g.scale(rx, ry);
      const gradient = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, rgba([190, 225, 220], alpha));
      gradient.addColorStop(1, rgba([190, 225, 220], 0));
      g.fillStyle = gradient;
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  return canvas;
}

/* ---------- fir trees ---------- */

/** Adds one fir tree to the current path: a jagged silhouette with drooping branch tiers. */
function firPath(
  ctx: Ctx,
  x: number,
  baseY: number,
  height: number,
  width: number,
  rand: () => number,
): void {
  const tiers = Math.max(3, Math.round(height / 13));
  const step = height / tiers;
  const top = baseY - height;
  const right: Array<[number, number]> = [];
  const left: Array<[number, number]> = [];
  for (let i = 1; i <= tiers; i++) {
    const y = top + i * step;
    const reach = (width / 2) * (i / tiers) * (0.85 + rand() * 0.3);
    right.push([x + reach * 0.4, y - step * 0.45], [x + reach, y]);
    left.push([x - reach * 0.4, y - step * 0.45], [x - reach, y]);
  }
  ctx.moveTo(x, top);
  for (const [px, py] of right) ctx.lineTo(px, py);
  for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
  ctx.closePath();
}

interface FirLineOptions {
  seed: number;
  ground: (x: number) => number;
  minHeight: number;
  maxHeight: number;
  spacing: number;
  fill: string;
  from?: number;
  to?: number;
  /** Also fill solid ground below the trees (default true). */
  solid?: boolean;
  skip?: (x: number) => boolean;
}

/** A whole row of fir trees along a ridge, drawn as one shape. */
function firLine(ctx: Ctx, o: FirLineOptions): void {
  const from = o.from ?? -20;
  const to = o.to ?? W + 20;
  ctx.fillStyle = o.fill;

  if (o.solid !== false) {
    ctx.beginPath();
    ctx.moveTo(from, H + 20);
    for (let x = from; x <= to; x += 8) ctx.lineTo(x, o.ground(x) + 2);
    ctx.lineTo(to, H + 20);
    ctx.closePath();
    ctx.fill();
  }

  const rand = mulberry32(o.seed);
  ctx.beginPath();
  for (let x = from; x <= to; x += o.spacing * (0.7 + rand() * 0.6)) {
    if (o.skip?.(x)) continue;
    const height = lerp(o.minHeight, o.maxHeight, rand());
    firPath(ctx, x, o.ground(x), height, height * 0.4, rand);
  }
  ctx.fill();
}

function fogBand(
  ctx: Ctx,
  y0: number,
  y1: number,
  color: Rgb,
  alpha: number,
): void {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, rgba(color, 0));
  gradient.addColorStop(0.55, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y0, W, y1 - y0);
}

/* ---------- ferns ---------- */

/** A fan of fern fronds, drawn as near-black silhouettes with a faint rim of light. */
function fernCluster(
  ctx: Ctx,
  x: number,
  y: number,
  fronds: number,
  size: number,
  spread: number,
  seed: number,
): void {
  const rand = mulberry32(seed);
  const stems = new Path2D();
  const leaflets = new Path2D();

  for (let i = 0; i < fronds; i++) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * spread;
    const length = size * (0.55 + rand() * 0.5);
    const bend = (rand() - 0.5) * 1.1 + (angle + Math.PI / 2) * 0.5;
    const cx = x + Math.cos(angle) * length * 0.6;
    const cy = y + Math.sin(angle) * length * 0.6;
    const ex = x + Math.cos(angle + bend) * length;
    const ey = y + Math.sin(angle + bend) * length;

    stems.moveTo(x, y);
    stems.quadraticCurveTo(cx, cy, ex, ey);

    for (let t = 0.12; t <= 0.98; t += 0.04) {
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * ex;
      const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ey;
      const tx = 2 * (1 - t) * (cx - x) + 2 * t * (ex - cx);
      const ty = 2 * (1 - t) * (cy - y) + 2 * t * (ey - cy);
      const heading = Math.atan2(ty, tx);
      const reach = length * 0.3 * (1 - t * 0.82) * (0.8 + rand() * 0.4);
      for (const side of [-1, 1]) {
        const a = heading + side * 1.15;
        leaflets.moveTo(px, py);
        leaflets.lineTo(px + Math.cos(a) * reach, py + Math.sin(a) * reach);
      }
    }
  }

  ctx.lineCap = "round";
  ctx.save();
  ctx.translate(-0.9, -1.1);
  ctx.strokeStyle = "rgba(120,200,160,0.18)";
  ctx.lineWidth = 1.1;
  ctx.stroke(leaflets);
  ctx.restore();
  ctx.strokeStyle = "#030c0a";
  ctx.lineWidth = 2.4;
  ctx.stroke(leaflets);
  ctx.lineWidth = 3;
  ctx.stroke(stems);
}

/* ---------- the still layers: far scenery, the cliff, and the foreground ---------- */

function paintHood(ctx: Ctx): void {
  const noise = makeNoise(5);
  const edge: Array<[number, number]> = [];
  for (let x = -20; x <= 580; x += 8) {
    const t = (x - 250) / (x < 250 ? 270 : 330);
    const shape = 1 - Math.min(1, Math.abs(t)) ** 0.85;
    edge.push([x, 610 - shape * 280 - (noise(x / 30) - 0.5) * 24 * shape]);
  }

  // the mountain itself, lit from the left by the moon
  const body = ctx.createLinearGradient(0, 330, 0, 640);
  body.addColorStop(0, "#628f9a");
  body.addColorStop(1, "#25535b");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-20, 640);
  for (const [x, y] of edge) ctx.lineTo(x, y);
  ctx.lineTo(580, 640);
  ctx.closePath();
  ctx.fill();

  // the right flank in shadow
  ctx.fillStyle = "rgba(5,20,28,0.3)";
  ctx.beginPath();
  ctx.moveTo(250, 330);
  for (const [x, y] of edge) {
    if (x >= 250) ctx.lineTo(x, y);
  }
  ctx.lineTo(580, 640);
  ctx.lineTo(320, 640);
  ctx.closePath();
  ctx.fill();

  // snow near the summit, with a ragged lower edge
  const jag = makeNoise(8);
  const snowy = edge.filter(([, y]) => y < 440);
  ctx.fillStyle = "rgba(214,232,238,0.6)";
  ctx.beginPath();
  for (const [index, [x, y]] of snowy.entries()) {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = snowy.length - 1; i >= 0; i--) {
    const [x, y] = snowy[i];
    ctx.lineTo(x, y + 36 + jag(x / 12) * 44);
  }
  ctx.closePath();
  ctx.fill();
}

function paintFar(ctx: Ctx): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#050c14");
  sky.addColorStop(0.3, "#0b2230");
  sky.addColorStop(0.52, "#17414a");
  sky.addColorStop(0.7, "#2f6760");
  sky.addColorStop(0.84, "#6c8f7e");
  sky.addColorStop(1, "#a9c3b0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // a last warm glow low in the haze
  const afterglow = ctx.createRadialGradient(640, 580, 0, 640, 580, 340);
  afterglow.addColorStop(0, "rgba(222,166,112,0.30)");
  afterglow.addColorStop(1, "rgba(222,166,112,0)");
  ctx.fillStyle = afterglow;
  ctx.fillRect(0, 240, W, 600);

  // the moon
  const halo = ctx.createRadialGradient(190, 170, 0, 190, 170, 170);
  halo.addColorStop(0, "rgba(214,236,240,0.32)");
  halo.addColorStop(1, "rgba(214,236,240,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 420, 420);
  ctx.fillStyle = "#e9f3f1";
  ctx.beginPath();
  ctx.arc(190, 170, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(146,176,184,0.4)";
  for (const [x, y, r] of [
    [183, 164, 5],
    [198, 176, 4],
    [190, 184, 3],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  paintHood(ctx);
  fogBand(ctx, 470, 650, [150, 196, 190], 0.38);

  // three rows of distant firs, each hazier than the next
  const hills = makeNoise(3);
  firLine(ctx, {
    seed: 21,
    ground: (x) => 600 - hills(x / 90) * 46,
    minHeight: 28,
    maxHeight: 54,
    spacing: 6,
    fill: "#1a454c",
  });
  fogBand(ctx, 560, 700, [140, 188, 182], 0.34);
  firLine(ctx, {
    seed: 22,
    ground: (x) => 660 - hills(x / 70 + 9) * 38,
    minHeight: 42,
    maxHeight: 76,
    spacing: 8,
    fill: "#123b41",
  });
  fogBand(ctx, 640, 760, [120, 170, 165], 0.3);
  firLine(ctx, {
    seed: 23,
    ground: (x) => 716 - hills(x / 60 + 21) * 30,
    minHeight: 58,
    maxHeight: 96,
    spacing: 10,
    fill: "#0d2f35",
  });
}

const cliffTopNoise = makeNoise(41);
const cliffEdgeNoise = makeNoise(57);

/** The top edge of the cliff, with a dip where the creek spills over. */
function cliffTop(x: number): number {
  const base = 262 + (cliffTopNoise(x / 60) - 0.5) * 48;
  const notch = 34 * Math.exp(-(((x - 578) / 24) ** 2));
  return base + notch;
}

/** The left edge of the cliff face. */
function cliffLeft(y: number): number {
  return 322 + (cliffEdgeNoise(y / 55) - 0.5) * 56;
}

function paintCliff(ctx: Ctx): void {
  const slope = makeNoise(61);

  // the forested hillside on the left, in two rows
  firLine(ctx, {
    seed: 71,
    to: 400,
    ground: (x) => 760 - slope(x / 80) * 40,
    minHeight: 90,
    maxHeight: 160,
    spacing: 12,
    fill: "#0b262a",
  });
  firLine(ctx, {
    seed: 73,
    to: 440,
    ground: (x) => 820 - slope(x / 60 + 4) * 30,
    minHeight: 110,
    maxHeight: 200,
    spacing: 15,
    fill: "#081c20",
  });

  // the cliff
  const outline = new Path2D();
  outline.moveTo(cliffLeft(780), 780);
  for (let y = 770; y >= 270; y -= 10) outline.lineTo(cliffLeft(y), y);
  for (let x = cliffLeft(270); x <= W + 10; x += 8)
    outline.lineTo(x, cliffTop(x));
  outline.lineTo(W + 10, 780);
  outline.closePath();

  const rock = ctx.createLinearGradient(0, 260, 0, 780);
  rock.addColorStop(0, "#1a3a42");
  rock.addColorStop(0.5, "#112a31");
  rock.addColorStop(1, "#0a1b20");
  ctx.fillStyle = rock;
  ctx.fill(outline);

  ctx.save();
  ctx.clip(outline);
  const rand = mulberry32(88);

  // basalt columns
  for (let x = 300; x < W + 10; x += 5 + rand() * 6) {
    const top = cliffTop(x);
    ctx.fillStyle =
      rand() < 0.5
        ? `rgba(0,0,0,${(0.12 + rand() * 0.2).toFixed(2)})`
        : `rgba(140,190,200,${(0.02 + rand() * 0.04).toFixed(3)})`;
    ctx.fillRect(x, top, 2 + rand() * 5, 780 - top);
  }

  // cracks
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const x = 320 + rand() * 480;
    const y = 300 + rand() * 440;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + rand() * 38, y + (rand() - 0.5) * 4);
  }
  ctx.stroke();

  // moss, gathered along the ledges
  for (let i = 0; i < 120; i++) {
    const ledge = LEDGES[Math.floor(rand() * LEDGES.length)];
    const red = Math.round(50 + rand() * 30);
    const green = Math.round(112 + rand() * 40);
    const blue = Math.round(62 + rand() * 20);
    ctx.fillStyle = `rgba(${red},${green},${blue},${(0.12 + rand() * 0.18).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(
      320 + rand() * 480,
      ledge + (rand() - 0.3) * 26,
      10 + rand() * 26,
      3 + rand() * 9,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();

  // moonlight along the left edge and the top
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(160,212,218,0.2)";
  ctx.beginPath();
  ctx.moveTo(cliffLeft(780), 780);
  for (let y = 770; y >= 270; y -= 10) ctx.lineTo(cliffLeft(y), y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(170,215,215,0.14)";
  ctx.beginPath();
  ctx.moveTo(cliffLeft(270), cliffTop(cliffLeft(270)));
  for (let x = cliffLeft(270); x <= W + 10; x += 8) ctx.lineTo(x, cliffTop(x));
  ctx.stroke();

  // the creek just before it goes over the edge
  ctx.fillStyle = "rgba(150,204,214,0.4)";
  ctx.fillRect(560, 294, 36, 6);

  // the ledge the upper fall lands on, with a little basin and moss
  ctx.fillStyle = "#0c1d21";
  ctx.beginPath();
  ctx.moveTo(466, 456);
  ctx.lineTo(490, 447);
  ctx.lineTo(540, 444);
  ctx.lineTo(600, 446);
  ctx.lineTo(652, 450);
  ctx.lineTo(676, 459);
  ctx.lineTo(660, 470);
  ctx.lineTo(500, 472);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(76,150,86,0.55)";
  ctx.beginPath();
  ctx.moveTo(490, 447);
  ctx.lineTo(540, 444);
  ctx.lineTo(600, 446);
  ctx.lineTo(652, 450);
  ctx.lineTo(650, 454);
  ctx.lineTo(494, 452);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(150,204,214,0.28)";
  ctx.beginPath();
  ctx.ellipse(578, 449, 40, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // the pool at the bottom, with a pale reflection of the fall
  const pool = ctx.createLinearGradient(0, POOL_Y, 0, 810);
  pool.addColorStop(0, "#245358");
  pool.addColorStop(1, "#091a1d");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(560, 760, 280, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  const reflection = ctx.createLinearGradient(0, POOL_Y, 0, 800);
  reflection.addColorStop(0, "rgba(206,236,242,0.28)");
  reflection.addColorStop(1, "rgba(206,236,242,0)");
  ctx.fillStyle = reflection;
  ctx.fillRect(520, POOL_Y, 84, 84);

  // dark rocks around the pool
  ctx.fillStyle = "#050f10";
  for (const [x, y, rx, ry] of [
    [336, 772, 44, 15],
    [790, 768, 46, 16],
    [470, 806, 40, 12],
    [690, 810, 52, 14],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // firs along the top of the cliff, with a gap where the creek flows
  firLine(ctx, {
    seed: 91,
    from: 330,
    ground: (x) => cliffTop(x) + 8,
    minHeight: 60,
    maxHeight: 120,
    spacing: 9,
    solid: false,
    skip: (x) => x > 548 && x < 608,
    fill: "#091d21",
  });
}

function paintFront(ctx: Ctx): void {
  // dark firs framing both edges
  const frame = mulberry32(5);
  ctx.fillStyle = "#030a09";
  ctx.beginPath();
  firPath(ctx, 24, 990, 1060, 210, frame);
  firPath(ctx, 806, 970, 800, 180, frame);
  ctx.fill();

  // ferns in the foreground
  fernCluster(ctx, 130, 905, 13, 210, 2.3, 101);
  fernCluster(ctx, 690, 910, 13, 200, 2.3, 102);
  fernCluster(ctx, 330, 812, 7, 110, 2.0, 103);
  fernCluster(ctx, 770, 830, 8, 120, 2.0, 104);
  fernCluster(ctx, 520, 905, 8, 130, 2.4, 105);

  // darkened edges
  const vignette = ctx.createRadialGradient(
    W / 2,
    H * 0.55,
    W * 0.25,
    W / 2,
    H * 0.55,
    W * 0.95,
  );
  vignette.addColorStop(0, "rgba(2,8,8,0)");
  vignette.addColorStop(1, "rgba(2,8,8,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // a dark veil at the top so the headline stays readable
  const veil = ctx.createLinearGradient(0, 0, 0, 340);
  veil.addColorStop(0, "rgba(5,12,14,0.55)");
  veil.addColorStop(1, "rgba(5,12,14,0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, 340);
}

/* ---------- the animated parts ---------- */

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  base: number;
}

interface Streak {
  u: number;
  speed: number;
  length: number;
  alpha: number;
  width: number;
  phase: number;
  dark: boolean;
}

interface Puff {
  dx: number;
  rise: number;
  size: number;
  alpha: number;
  period: number;
  phase: number;
}

interface Drop {
  x0: number;
  vx: number;
  vy: number;
  size: number;
  period: number;
  phase: number;
}

interface Glint {
  x: number;
  y: number;
  width: number;
  phase: number;
  speed: number;
}

interface Firefly {
  bx: number;
  by: number;
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  phase: number;
  tw: number;
  size: number;
}

interface Shaft {
  top: readonly [number, number];
  bottom: readonly [number, number];
  alpha: number;
  phase: number;
}

const SHAFTS: Shaft[] = [
  { top: [90, 190], bottom: [380, 230], alpha: 0.075, phase: 0 },
  { top: [250, 310], bottom: [520, 420], alpha: 0.055, phase: 2 },
  { top: [20, 60], bottom: [170, 90], alpha: 0.06, phase: 4 },
];

function makeStreaks(
  count: number,
  speedMin: number,
  speedMax: number,
  seed: number,
): Streak[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    u: rand(),
    speed: lerp(speedMin, speedMax, rand()),
    length: 18 + rand() * 60,
    alpha: 0.14 + rand() * 0.42,
    width: 0.7 + rand() * 1.8,
    phase: rand(),
    dark: rand() < 0.28,
  }));
}

function makePuffs(
  count: number,
  spread: number,
  seed: number,
  scale: number,
): Puff[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    dx: (rand() - 0.5) * spread,
    rise: (90 + rand() * 90) * scale,
    size: (90 + rand() * 90) * scale,
    alpha: 0.1 + rand() * 0.12,
    period: 5 + rand() * 4,
    phase: rand(),
  }));
}

function makeDrops(count: number, spread: number, seed: number): Drop[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x0: (rand() - 0.5) * spread,
    vx: (rand() - 0.5) * 90,
    vy: 70 + rand() * 90,
    size: 0.7 + rand() * 1.3,
    period: 1.2 + rand() * 1.2,
    phase: rand(),
  }));
}

export function createScene(
  canvas: HTMLCanvasElement,
  variant: SceneVariant,
): Scene {
  const ctx = get2d(canvas);
  const focus = FOCUS[variant];

  // everything that moves, generated once
  const starRand = mulberry32(17);
  const stars: Star[] = [];
  while (stars.length < 46) {
    const x = starRand() * W;
    const y = starRand() * 300;
    if (Math.hypot(x - 190, y - 170) < 48) continue;
    stars.push({
      x,
      y,
      size: 0.7 + starRand() * 1.1,
      phase: starRand() * 6.28,
      speed: 0.5 + starRand() * 1.4,
      base: 0.35 + starRand() * 0.5,
    });
  }

  const upperStreaks = makeStreaks(46, 150, 260, 31);
  const lowerStreaks = makeStreaks(120, 240, 400, 32);
  const mist = makePuffs(18, 150, 33, 1);
  const ledgeMist = makePuffs(7, 70, 34, 0.5);
  const spray = makeDrops(36, 80, 35);
  const ledgeSpray = makeDrops(16, 40, 36);

  const glintRand = mulberry32(37);
  const shimmer: Glint[] = Array.from({ length: 26 }, () => ({
    x: 430 + glintRand() * 260,
    y: 730 + glintRand() * 52,
    width: 8 + glintRand() * 22,
    phase: glintRand() * 6.28,
    speed: 0.8 + glintRand() * 1.6,
  }));

  const flyRand = mulberry32(38);
  const fireflies: Firefly[] = Array.from({ length: 26 }, () => ({
    bx: 40 + flyRand() * 720,
    by: 520 + flyRand() * 330,
    ax: 14 + flyRand() * 26,
    ay: 10 + flyRand() * 18,
    sx: 0.15 + flyRand() * 0.3,
    sy: 0.2 + flyRand() * 0.35,
    phase: flyRand() * 6.28,
    tw: 0.6 + flyRand() * 1.2,
    size: 10 + flyRand() * 16,
  }));

  const mistSprite = makeSprite(128, [205, 232, 238], 0.5);
  const fireSprite = makeSprite(64, [228, 242, 118], 0.9);
  const fogTexture = makeFogTexture();

  // the three still layers are painted once per size, then reused every frame
  const far = makeCanvas(1, 1);
  const cliff = makeCanvas(1, 1);
  const front = makeCanvas(1, 1);
  let k = 1;
  let ox = 0;
  let oy = 0;
  let ready = false;

  const place = (): void => ctx.setTransform(k, 0, 0, k, ox, oy);
  const reset = (): void => ctx.setTransform(1, 0, 0, 1, 0, 0);

  function resize(width: number, height: number, dpr: number): void {
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const scale = Math.max(width / W, height / H);
    k = scale * dpr;
    ox = ((width - W * scale) / 2) * dpr;
    oy = (height - H * scale) * focus * dpr;

    const stills: Array<[HTMLCanvasElement, (layer: Ctx) => void]> = [
      [far, paintFar],
      [cliff, paintCliff],
      [front, paintFront],
    ];
    for (const [layer, paint] of stills) {
      layer.width = pixelWidth;
      layer.height = pixelHeight;
      const layerCtx = get2d(layer);
      layerCtx.setTransform(k, 0, 0, k, ox, oy);
      paint(layerCtx);
    }
    ready = true;
  }

  function drawStars(t: number): void {
    for (const star of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * star.speed + star.phase);
      ctx.fillStyle = `rgba(226,240,246,${(star.base * twinkle).toFixed(3)})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
  }

  function drawFog(
    y: number,
    height: number,
    speed: number,
    alpha: number,
    t: number,
  ): void {
    const shift = (t * speed) % FOG_W;
    ctx.globalAlpha = alpha;
    ctx.drawImage(fogTexture, -shift, y, FOG_W, height);
    ctx.drawImage(fogTexture, FOG_W - shift, y, FOG_W, height);
    ctx.globalAlpha = 1;
  }

  function drawFall(fall: Fall, streaks: Streak[], t: number): void {
    const height = fall.bottom - fall.top;
    const trapezoid = (grow: number): void => {
      ctx.beginPath();
      ctx.moveTo(fall.x - (fall.widthTop / 2) * grow, fall.top);
      ctx.lineTo(fall.x + (fall.widthTop / 2) * grow, fall.top);
      ctx.lineTo(fall.x + (fall.widthBottom / 2) * grow, fall.bottom);
      ctx.lineTo(fall.x - (fall.widthBottom / 2) * grow, fall.bottom);
      ctx.closePath();
    };

    // a soft glow around the water, then the body of the fall
    ctx.fillStyle = "rgba(190,226,234,0.10)";
    trapezoid(1.5);
    ctx.fill();
    const body = ctx.createLinearGradient(0, fall.top, 0, fall.bottom);
    body.addColorStop(0, "rgba(176,214,226,0.55)");
    body.addColorStop(0.5, "rgba(206,235,242,0.62)");
    body.addColorStop(1, "rgba(238,250,252,0.78)");
    ctx.fillStyle = body;
    trapezoid(1);
    ctx.fill();

    // streaks of water pouring down, some bright and some dark for depth
    ctx.lineCap = "round";
    for (const streak of streaks) {
      const travel = height + streak.length;
      const position = (streak.phase * travel + t * streak.speed) % travel;
      const y = fall.top + position - streak.length;
      const y0 = Math.max(y, fall.top);
      const y1 = Math.min(y + streak.length, fall.bottom);
      if (y1 <= y0) continue;
      const mix = (y0 - fall.top) / height;
      const half =
        (fall.widthTop + (fall.widthBottom - fall.widthTop) * mix) / 2;
      const x =
        fall.x +
        (streak.u - 0.5) * 2 * half * 0.92 +
        Math.sin(t * 1.3 + streak.phase * 40 + y * 0.03) * 1.2;
      ctx.strokeStyle = streak.dark
        ? `rgba(40,92,108,${(streak.alpha * 0.7).toFixed(3)})`
        : `rgba(240,251,255,${streak.alpha.toFixed(3)})`;
      ctx.lineWidth = streak.width;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }

    // slow pulses running down the fall
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i < 3; i++) {
      const y = fall.top + ((t * 55 + (i * height) / 3) % height);
      const mix = (y - fall.top) / height;
      const half =
        (fall.widthTop + (fall.widthBottom - fall.widthTop) * mix) / 2;
      ctx.fillRect(fall.x - half, y, half * 2, 10);
    }
  }

  function drawPuff(puff: Puff, x: number, y: number, t: number): void {
    const life = (t / puff.period + puff.phase) % 1;
    const px =
      x + puff.dx * (0.3 + life) + Math.sin(t * 0.4 + puff.phase * 9) * 8;
    const py = y - 6 - life * puff.rise;
    const size = puff.size * (0.7 + life * 1.1);
    ctx.globalAlpha = Math.sin(life * Math.PI) * puff.alpha;
    ctx.drawImage(mistSprite, px - size / 2, py - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function drawSpray(
    drops: Drop[],
    originX: number,
    originY: number,
    t: number,
  ): void {
    for (const drop of drops) {
      const life = (t / drop.period + drop.phase) % 1;
      const x = originX + drop.x0 + drop.vx * life;
      const y = originY - 4 - (drop.vy * life - 130 * life * life);
      if (y > originY) continue;
      ctx.fillStyle = `rgba(240,252,255,${(0.75 * (1 - life)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, drop.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWaterExtras(t: number): void {
    // light dancing on the pool
    ctx.fillStyle = "rgb(214,242,246)";
    for (const glint of shimmer) {
      ctx.globalAlpha =
        Math.max(0, Math.sin(t * glint.speed + glint.phase)) * 0.35;
      ctx.fillRect(glint.x, glint.y, glint.width, 1);
    }
    ctx.globalAlpha = 1;

    // ripples spreading from where the water lands
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const life = (t / 4.2 + i / 4) % 1;
      const radius = 18 + life * 150;
      ctx.strokeStyle = `rgba(214,242,246,${(0.38 * (1 - life)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(
        IMPACT_X,
        POOL_Y + 14,
        radius,
        radius * 0.17,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    drawSpray(spray, IMPACT_X, POOL_Y, t);
    drawSpray(ledgeSpray, 578, 452, t);
    for (const puff of mist) drawPuff(puff, IMPACT_X, POOL_Y, t);
    for (const puff of ledgeMist) drawPuff(puff, 578, 452, t);
  }

  function drawShafts(t: number): void {
    for (const shaft of SHAFTS) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.35 + shaft.phase);
      const gradient = ctx.createLinearGradient(0, 0, 0, 760);
      gradient.addColorStop(
        0,
        `rgba(220,245,235,${(shaft.alpha * pulse).toFixed(3)})`,
      );
      gradient.addColorStop(1, "rgba(220,245,235,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(shaft.top[0], 0);
      ctx.lineTo(shaft.top[1], 0);
      ctx.lineTo(shaft.bottom[1], 760);
      ctx.lineTo(shaft.bottom[0], 760);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawFireflies(t: number): void {
    for (const fly of fireflies) {
      const x = fly.bx + Math.sin(t * fly.sx + fly.phase) * fly.ax;
      const y = fly.by + Math.cos(t * fly.sy + fly.phase * 1.7) * fly.ay;
      const glow = Math.max(0, Math.sin(t * fly.tw + fly.phase * 3));
      const size = fly.size * (0.8 + glow * 0.5);
      ctx.globalAlpha = (0.15 + 0.85 * glow * glow) * 0.9;
      ctx.drawImage(fireSprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function draw(t: number): void {
    if (!ready) return;

    reset();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(far, 0, 0);

    place();
    drawStars(t);
    drawFog(470, 190, 7, 0.55, t);

    reset();
    ctx.drawImage(cliff, 0, 0);

    place();
    drawFall(UPPER_FALL, upperStreaks, t);
    drawFall(LOWER_FALL, lowerStreaks, t);
    drawWaterExtras(t);
    drawShafts(t);
    drawFog(690, 150, 12, 0.4, t);

    reset();
    ctx.drawImage(front, 0, 0);

    place();
    drawFireflies(t);
    reset();
  }

  return { resize, draw };
}

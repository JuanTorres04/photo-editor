import {
  FOG_W,
  H,
  W,
  firLine,
  firPath,
  fogBand,
  get2d,
  lerp,
  makeCanvas,
  makeFogTexture,
  makeNoise,
  makeSprite,
  mulberry32,
} from "./shared";
import type { Ctx, Extents, Scene } from "./shared";

export type { Scene } from "./shared";

/** "full" fits the whole scene to the screen's height (for page backgrounds); "wide" crops to fill a box. */
export type SceneVariant = "full" | "wide";

interface Mode {
  fit: "height" | "cover";
  focus: number;
  /** The part of the scene to keep centred when the screen is narrower than the scene. */
  centerX: number;
}

const MODES: Record<SceneVariant, Mode> = {
  full: { fit: "height", focus: 1, centerX: 540 },
  wide: { fit: "cover", focus: 0.7, centerX: 560 },
};

interface Fall {
  x: number;
  top: number;
  bottom: number;
  widthTop: number;
  widthBottom: number;
}

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
const LEDGES = [330, 390, 452, 520, 590, 660];

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

function paintFar(ctx: Ctx, ext: Extents): void {
  const span = ext.x1 - ext.x0;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#050c14");
  sky.addColorStop(0.3, "#0b2230");
  sky.addColorStop(0.52, "#17414a");
  sky.addColorStop(0.7, "#2f6760");
  sky.addColorStop(0.84, "#6c8f7e");
  sky.addColorStop(1, "#a9c3b0");
  ctx.fillStyle = sky;
  ctx.fillRect(ext.x0, 0, span, H);

  // a last warm glow low in the haze
  const afterglow = ctx.createRadialGradient(640, 580, 0, 640, 580, 340);
  afterglow.addColorStop(0, "rgba(222,166,112,0.30)");
  afterglow.addColorStop(1, "rgba(222,166,112,0)");
  ctx.fillStyle = afterglow;
  ctx.fillRect(ext.x0, 240, span, 600);

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
  fogBand(ctx, ext.x0, ext.x1, 470, 650, [150, 196, 190], 0.38);

  // three rows of distant firs, each hazier than the next
  const hills = makeNoise(3);
  firLine(ctx, {
    seed: 21,
    from: ext.x0,
    to: ext.x1,
    ground: (x) => 600 - hills(x / 90) * 46,
    minHeight: 28,
    maxHeight: 54,
    spacing: 6,
    fill: "#1a454c",
  });
  fogBand(ctx, ext.x0, ext.x1, 560, 700, [140, 188, 182], 0.34);
  firLine(ctx, {
    seed: 22,
    from: ext.x0,
    to: ext.x1,
    ground: (x) => 660 - hills(x / 70 + 9) * 38,
    minHeight: 42,
    maxHeight: 76,
    spacing: 8,
    fill: "#123b41",
  });
  fogBand(ctx, ext.x0, ext.x1, 640, 760, [120, 170, 165], 0.3);
  firLine(ctx, {
    seed: 23,
    from: ext.x0,
    to: ext.x1,
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

function paintCliff(ctx: Ctx, ext: Extents): void {
  const slope = makeNoise(61);
  const reach = (ext.x1 - 320) / 480; // how much wider than the original scene the cliff has to be

  // the forested hillside on the left, in two rows
  firLine(ctx, {
    seed: 71,
    from: ext.x0,
    to: 400,
    ground: (x) => 760 - slope(x / 80) * 40,
    minHeight: 90,
    maxHeight: 160,
    spacing: 12,
    fill: "#0b262a",
  });
  firLine(ctx, {
    seed: 73,
    from: ext.x0,
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
  for (let x = cliffLeft(270); x <= ext.x1; x += 8)
    outline.lineTo(x, cliffTop(x));
  outline.lineTo(ext.x1, 780);
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
  for (let x = 300; x < ext.x1; x += 5 + rand() * 6) {
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
  for (let i = 0; i < Math.round(70 * reach); i++) {
    const x = 320 + rand() * (ext.x1 - 320);
    const y = 300 + rand() * 440;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + rand() * 38, y + (rand() - 0.5) * 4);
  }
  ctx.stroke();

  // moss, gathered along the ledges
  for (let i = 0; i < Math.round(120 * reach); i++) {
    const ledge = LEDGES[Math.floor(rand() * LEDGES.length)];
    const red = Math.round(50 + rand() * 30);
    const green = Math.round(112 + rand() * 40);
    const blue = Math.round(62 + rand() * 20);
    ctx.fillStyle = `rgba(${red},${green},${blue},${(0.12 + rand() * 0.18).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(
      320 + rand() * (ext.x1 - 320),
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
  for (let x = cliffLeft(270); x <= ext.x1; x += 8) ctx.lineTo(x, cliffTop(x));
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
    to: ext.x1,
    ground: (x) => cliffTop(x) + 8,
    minHeight: 60,
    maxHeight: 120,
    spacing: 9,
    solid: false,
    skip: (x) => x > 548 && x < 608,
    fill: "#091d21",
  });
}

function paintFront(ctx: Ctx, ext: Extents): void {
  const span = ext.x1 - ext.x0;

  // dark firs framing both edges
  const frame = mulberry32(5);
  ctx.fillStyle = "#030a09";
  ctx.beginPath();
  firPath(ctx, ext.x0 + 44, 990, 1060, 210, frame);
  firPath(ctx, ext.x1 - 14, 970, 800, 180, frame);
  ctx.fill();

  // ferns in the foreground
  fernCluster(ctx, ext.x0 + 150, 905, 13, 210, 2.3, 101);
  fernCluster(ctx, ext.x1 - 130, 910, 13, 200, 2.3, 102);
  fernCluster(ctx, 330, 812, 7, 110, 2.0, 103);
  fernCluster(ctx, ext.x1 - 50, 830, 8, 120, 2.0, 104);
  fernCluster(ctx, 520, 905, 8, 130, 2.4, 105);

  // darkened edges, stretched to the width of the view
  ctx.save();
  ctx.translate((ext.x0 + ext.x1) / 2, H * 0.55);
  ctx.scale(span / W, 1);
  const vignette = ctx.createRadialGradient(0, 0, W * 0.25, 0, 0, W * 0.95);
  vignette.addColorStop(0, "rgba(2,8,8,0)");
  vignette.addColorStop(1, "rgba(2,8,8,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(-W * 1.2, -H, W * 2.4, H * 2);
  ctx.restore();

  // a dark veil at the top so any text over it stays readable
  const veil = ctx.createLinearGradient(0, 0, 0, 340);
  veil.addColorStop(0, "rgba(5,12,14,0.55)");
  veil.addColorStop(1, "rgba(5,12,14,0)");
  ctx.fillStyle = veil;
  ctx.fillRect(ext.x0, 0, span, 340);
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
  const mode = MODES[variant];

  // everything that moves, generated once (stars and fireflies cover a wide range for wide screens)
  const starRand = mulberry32(17);
  const stars: Star[] = [];
  while (stars.length < 110) {
    const x = -700 + starRand() * 2200;
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
  const fireflies: Firefly[] = Array.from({ length: 40 }, () => ({
    bx: -500 + flyRand() * 1800,
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
  let ext: Extents = { x0: -20, x1: 820 };
  let ready = false;

  const place = (): void => ctx.setTransform(k, 0, 0, k, ox, oy);
  const reset = (): void => ctx.setTransform(1, 0, 0, 1, 0, 0);

  function resize(width: number, height: number, dpr: number): void {
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const scale =
      mode.fit === "height" ? height / H : Math.max(width / W, height / H);
    const sceneWidth = W * scale;
    // centred when the screen is wider than the scene; otherwise keep the waterfall's side in view
    const left =
      sceneWidth <= width
        ? (width - sceneWidth) / 2
        : Math.min(
            0,
            Math.max(width - sceneWidth, width / 2 - mode.centerX * scale),
          );
    const top = mode.fit === "height" ? 0 : (height - H * scale) * mode.focus;

    k = scale * dpr;
    ox = left * dpr;
    oy = top * dpr;
    ext = {
      x0: Math.min(0, -left / scale) - 20,
      x1: Math.max(W, (width - left) / scale) + 20,
    };

    const stills: Array<[HTMLCanvasElement, (layer: Ctx) => void]> = [
      [far, (layer) => paintFar(layer, ext)],
      [cliff, (layer) => paintCliff(layer, ext)],
      [front, (layer) => paintFront(layer, ext)],
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
    for (
      let x = Math.floor(ext.x0 / FOG_W) * FOG_W - shift;
      x < ext.x1;
      x += FOG_W
    ) {
      ctx.drawImage(fogTexture, x, y, FOG_W, height);
    }
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

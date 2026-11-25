export type Ctx = CanvasRenderingContext2D;
export type Rgb = readonly [number, number, number];

export interface Scene {
  /** Sizes the scene for a canvas of `width` x `height` CSS pixels and repaints the still layers. */
  resize: (width: number, height: number, dpr: number) => void;
  /** Draws one frame. `seconds` is any steadily increasing clock. */
  draw: (seconds: number) => void;
}

/** The range of the 800 x 900 scene that is visible, so scenery can be painted beyond its edges. */
export interface Extents {
  x0: number;
  x1: number;
}

export const W = 800;
export const H = 900;
export const FOG_W = 1200;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const rgba = (color: Rgb, alpha: number): string =>
  `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;

/** A tiny seeded random generator, so the scenery looks the same every time it is drawn. */
export function mulberry32(seed: number): () => number {
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
export function makeNoise(seed: number): (x: number) => number {
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

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function get2d(canvas: HTMLCanvasElement): Ctx {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser can't draw the background scene.");
  return context;
}

/** A soft round glow, used for mist and fireflies. */
export function makeSprite(
  size: number,
  color: Rgb,
  core: number,
): HTMLCanvasElement {
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
export function makeFogTexture(): HTMLCanvasElement {
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

/** Adds one fir tree to the current path: a jagged silhouette with drooping branch tiers. */
export function firPath(
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

export interface FirLineOptions {
  seed: number;
  from: number;
  to: number;
  ground: (x: number) => number;
  minHeight: number;
  maxHeight: number;
  spacing: number;
  fill: string;
  /** Where the solid ground below the trees ends (default: just below the scene). */
  bottom?: number;
  /** Set to false to draw only the trees, with no solid ground below them. */
  solid?: boolean;
  skip?: (x: number) => boolean;
}

/** A whole row of fir trees along a ridge, drawn as one shape. */
export function firLine(ctx: Ctx, o: FirLineOptions): void {
  const bottom = o.bottom ?? H + 20;
  ctx.fillStyle = o.fill;

  if (o.solid !== false) {
    ctx.beginPath();
    ctx.moveTo(o.from, bottom);
    for (let x = o.from; x <= o.to; x += 8) ctx.lineTo(x, o.ground(x) + 2);
    ctx.lineTo(o.to, bottom);
    ctx.closePath();
    ctx.fill();
  }

  const rand = mulberry32(o.seed);
  ctx.beginPath();
  for (let x = o.from; x <= o.to; x += o.spacing * (0.7 + rand() * 0.6)) {
    if (o.skip?.(x)) continue;
    const height = lerp(o.minHeight, o.maxHeight, rand());
    firPath(ctx, x, o.ground(x), height, height * 0.4, rand);
  }
  ctx.fill();
}

export function fogBand(
  ctx: Ctx,
  x0: number,
  x1: number,
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
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

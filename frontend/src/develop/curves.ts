export type Point = [number, number];
export type CurveChannel = "master" | "red" | "green" | "blue";

// A type alias (not an interface) so it can be stored in the database's JSON column.
export type CurveSet = {
  master: Point[];
  red: Point[];
  green: Point[];
  blue: Point[];
};

export const CHANNELS: CurveChannel[] = ["master", "red", "green", "blue"];
/** Points can't sit closer together than this (as a fraction of the curve's width). */
export const MIN_GAP = 0.02;
export const MAX_POINTS = 12;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const linearPoints = (): Point[] => [
  [0, 0],
  [1, 1],
];

export const DEFAULT_CURVES: CurveSet = {
  master: linearPoints(),
  red: linearPoints(),
  green: linearPoints(),
  blue: linearPoints(),
};

export const S_CURVES = [
  { id: "soft", label: "Soft S", strength: 0.45 },
  { id: "medium", label: "Medium S", strength: 0.8 },
  { id: "strong", label: "Strong S", strength: 1.2 },
] as const;

/** An S-curve darkens the shadows and brightens the highlights, which adds contrast. */
export function sCurve(strength: number): Point[] {
  return [
    [0, 0],
    [0.25, 0.25 - 0.11 * strength],
    [0.5, 0.5],
    [0.75, 0.75 + 0.11 * strength],
    [1, 1],
  ];
}

export function isLinear(points: Point[]): boolean {
  return points.length === 2 && points[0][1] === 0 && points[1][1] === 1;
}

export function curvesAreIdentity(curves: CurveSet): boolean {
  return CHANNELS.every((channel) => isLinear(curves[channel]));
}

/** Adds a point where the curve was clicked, or returns null if it is too close to another point. */
export function insertPoint(
  points: Point[],
  at: Point,
): { points: Point[]; index: number } | null {
  if (points.length >= MAX_POINTS) return null;
  if (at[0] <= MIN_GAP || at[0] >= 1 - MIN_GAP) return null;
  if (points.some(([x]) => Math.abs(x - at[0]) < MIN_GAP)) return null;
  const next = [...points, at].sort((a, b) => a[0] - b[0]);
  return { points: next, index: next.indexOf(at) };
}

/** Turns whatever came out of the database into safe curves: endpoints fixed at both ends, points spaced out. */
function normalizePoints(value: unknown): Point[] {
  if (!Array.isArray(value)) return linearPoints();
  const list: unknown[] = value;

  const cleaned: Point[] = [];
  for (const item of list.slice(0, MAX_POINTS * 2)) {
    if (
      Array.isArray(item) &&
      item.length === 2 &&
      typeof item[0] === "number" &&
      typeof item[1] === "number" &&
      Number.isFinite(item[0]) &&
      Number.isFinite(item[1])
    ) {
      cleaned.push([clamp01(item[0]), clamp01(item[1])]);
    }
  }
  cleaned.sort((a, b) => a[0] - b[0]);

  const start =
    cleaned.length > 0 && cleaned[0][0] <= MIN_GAP ? cleaned[0][1] : 0;
  const end =
    cleaned.length > 0 && cleaned[cleaned.length - 1][0] >= 1 - MIN_GAP
      ? cleaned[cleaned.length - 1][1]
      : 1;

  const result: Point[] = [[0, start]];
  let previous = 0;
  for (const [x, y] of cleaned) {
    if (
      x - previous >= MIN_GAP &&
      1 - x >= MIN_GAP &&
      result.length < MAX_POINTS - 1
    ) {
      result.push([x, y]);
      previous = x;
    }
  }
  result.push([1, end]);
  return result;
}

export function normalizeCurves(value: unknown): CurveSet {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return DEFAULT_CURVES;
  const source = value as Record<string, unknown>;
  return {
    master: normalizePoints(source.master),
    red: normalizePoints(source.red),
    green: normalizePoints(source.green),
    blue: normalizePoints(source.blue),
  };
}

/** A smooth curve through the points that never overshoots between them (monotone cubic interpolation). */
export function makeCurve(points: Point[]): (x: number) => number {
  const n = points.length;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const gaps: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    gaps.push(xs[i + 1] - xs[i]);
    slopes.push((ys[i + 1] - ys[i]) / gaps[i]);
  }

  const tangents: number[] = new Array<number>(n).fill(0);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / slopes[i];
      const b = tangents[i + 1] / slopes[i];
      const sum = a * a + b * b;
      if (sum > 9) {
        const scale = 3 / Math.sqrt(sum);
        tangents[i] = scale * a * slopes[i];
        tangents[i + 1] = scale * b * slopes[i];
      }
    }
  }

  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = gaps[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const value =
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * tangents[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * tangents[i + 1];
    return clamp01(value);
  };
}

/** Points along the curve, for drawing it. */
export function curveSamples(points: Point[], steps = 64): Point[] {
  const curve = makeCurve(points);
  return Array.from(
    { length: steps + 1 },
    (_, i): Point => [i / steps, curve(i / steps)],
  );
}

/** A 256-entry lookup table for the graphics card: the RGB curve first, then each colour channel's own curve. */
export function buildLut(curves: CurveSet): Uint8Array {
  const master = makeCurve(curves.master);
  const red = makeCurve(curves.red);
  const green = makeCurve(curves.green);
  const blue = makeCurve(curves.blue);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const m = master(i / 255);
    lut[i * 4] = Math.round(red(m) * 255);
    lut[i * 4 + 1] = Math.round(green(m) * 255);
    lut[i * 4 + 2] = Math.round(blue(m) * 255);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

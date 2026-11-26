// A type alias (not an interface) so it can be stored in the database's JSON column.
export type CropSettings = {
  /** The crop box inside the straightened picture, as fractions (0 to 1) of its width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Straighten angle in degrees. Positive tilts the picture clockwise. */
  angle: number;
  /** Quarter turns clockwise, 0 to 3. */
  quarter: number;
  flipH: boolean;
  flipV: boolean;
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_CROP = 0.03;

export const DEFAULT_CROP: CropSettings = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  angle: 0,
  quarter: 0,
  flipH: false,
  flipV: false,
};

export const rectOf = (crop: CropSettings): Rect => ({
  x: crop.x,
  y: crop.y,
  w: crop.w,
  h: crop.h,
});

export function cropIsIdentity(crop: CropSettings): boolean {
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.w === 1 &&
    crop.h === 1 &&
    crop.angle === 0 &&
    crop.quarter === 0 &&
    !crop.flipH &&
    !crop.flipV
  );
}

/** Turns whatever came out of the database into a safe crop: numbers clamped, the box kept inside the frame. */
export function normalizeCrop(value: unknown): CropSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return DEFAULT_CROP;
  const source = value as Record<string, unknown>;
  const read = (
    key: string,
    fallback: number,
    low: number,
    high: number,
  ): number => {
    const raw = source[key];
    return typeof raw === "number" && Number.isFinite(raw)
      ? Math.min(high, Math.max(low, raw))
      : fallback;
  };
  const w = read("w", 1, MIN_CROP, 1);
  const h = read("h", 1, MIN_CROP, 1);
  return {
    x: Math.min(1 - w, read("x", 0, 0, 1)),
    y: Math.min(1 - h, read("y", 0, 0, 1)),
    w,
    h,
    angle: read("angle", 0, -45, 45),
    quarter: Math.round(read("quarter", 0, 0, 3)) % 4,
    flipH: source.flipH === true,
    flipV: source.flipV === true,
  };
}

/** The size of a picture after its quarter turns. */
export function orientedSize(
  width: number,
  height: number,
  quarter: number,
): Size {
  return quarter % 2 === 1
    ? { width: height, height: width }
    : { width, height };
}

/** The size of the picture left after cropping, for a photo of the given size. */
export function croppedSize(
  width: number,
  height: number,
  crop: CropSettings,
): Size {
  const oriented = orientedSize(width, height, crop.quarter);
  return {
    width: Math.max(1, Math.round(crop.w * oriented.width)),
    height: Math.max(1, Math.round(crop.h * oriented.height)),
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  };
}

/** True if every corner of the crop box lies on the (straightened) photo, so no empty corners show. */
export function fits(rect: Rect, angleDegrees: number, frame: Size): boolean {
  const angle = (angleDegrees * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const halfWidth = frame.width / 2 + 0.01;
  const halfHeight = frame.height / 2 + 0.01;
  const corners: Array<[number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  for (const [cx, cy] of corners) {
    const px = (cx - 0.5) * frame.width;
    const py = (cy - 0.5) * frame.height;
    // undo the straighten rotation, the same way the graphics code does
    const qx = c * px + s * py;
    const qy = -s * px + c * py;
    if (Math.abs(qx) > halfWidth || Math.abs(qy) > halfHeight) return false;
  }
  return true;
}

/** Moves from a valid crop box towards a new one, stopping where it would leave the photo. */
export function clampToFit(
  previous: Rect,
  next: Rect,
  angle: number,
  frame: Size,
): Rect {
  if (fits(next, angle, frame)) return next;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (fits(lerpRect(previous, next, mid), angle, frame)) low = mid;
    else high = mid;
  }
  return lerpRect(previous, next, low);
}

/** Shrinks a crop box towards the middle of the photo until it fits. Used after the angle changes. */
export function shrinkToFit(rect: Rect, angle: number, frame: Size): Rect {
  if (fits(rect, angle, frame)) return rect;
  const tiny: Rect = {
    x: 0.5 - (rect.w * 0.001) / 2,
    y: 0.5 - (rect.h * 0.001) / 2,
    w: rect.w * 0.001,
    h: rect.h * 0.001,
  };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (fits(lerpRect(rect, tiny, mid), angle, frame)) high = mid;
    else low = mid;
  }
  return lerpRect(rect, tiny, high);
}

/** A box of roughly the same size and place, reshaped to the given width-to-height ratio. */
export function rectWithRatio(rect: Rect, ratio: number, frame: Size): Rect {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const area = rect.w * frame.width * rect.h * frame.height;
  let heightPx = Math.sqrt(area / ratio);
  let widthPx = heightPx * ratio;
  const k = Math.min(1, frame.width / widthPx, frame.height / heightPx);
  widthPx *= k;
  heightPx *= k;
  const w = widthPx / frame.width;
  const h = heightPx / frame.height;
  return {
    x: Math.min(1 - w, Math.max(0, cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, cy - h / 2)),
    w,
    h,
  };
}

/** Rotates the photo a quarter turn. Rotation and the straighten angle commute, so the angle stays as it is. */
export function rotateGeometry(
  crop: CropSettings,
  clockwise: boolean,
): CropSettings {
  const rect: Rect = clockwise
    ? { x: 1 - (crop.y + crop.h), y: crop.x, w: crop.h, h: crop.w }
    : { x: crop.y, y: 1 - (crop.x + crop.w), w: crop.h, h: crop.w };
  return {
    ...crop,
    ...rect,
    quarter: (crop.quarter + (clockwise ? 1 : 3)) % 4,
    // a quarter turn swaps which axis an existing mirror acts on
    flipH: crop.flipV,
    flipV: crop.flipH,
  };
}

/** Mirrors what you see. Mirroring reverses a tilt, so the angle changes sign. */
export function flipGeometry(
  crop: CropSettings,
  axis: "h" | "v",
): CropSettings {
  return axis === "h"
    ? {
        ...crop,
        x: 1 - crop.x - crop.w,
        angle: -crop.angle,
        flipH: !crop.flipH,
      }
    : {
        ...crop,
        y: 1 - crop.y - crop.h,
        angle: -crop.angle,
        flipV: !crop.flipV,
      };
}

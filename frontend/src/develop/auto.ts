import type { ScopeData } from "./scopes";
import type { EditSettings } from "./settings";

export type AutoSettings = Pick<
  EditSettings,
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "vibrance"
  | "sharpen"
>;

const NEUTRAL: AutoSettings = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  sharpen: 0,
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** The brightness (0 to 1) below which the given share of pixels fall. */
function percentile(bins: Uint32Array, total: number, share: number): number {
  const target = total * share;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += bins[i];
    if (sum >= target) return i / 255;
  }
  return 1;
}

function mean(bins: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * bins[i];
  return sum / total;
}

/** Works out starting settings from how the photo was shot: where its tones sit, how spread out and colourful they are. */
export function autoSettings(scope: ScopeData): AutoSettings {
  const { luma } = scope;
  let total = 0;
  for (let i = 0; i < 256; i++) total += luma[i];
  if (total === 0) return NEUTRAL;

  const median = percentile(luma, total, 0.5);
  const low = percentile(luma, total, 0.005);
  const high = percentile(luma, total, 0.995);
  const spread = percentile(luma, total, 0.95) - percentile(luma, total, 0.05);

  let dark = 0;
  for (let i = 0; i < 38; i++) dark += luma[i];
  const darkShare = dark / total;
  const clipped = luma[255] / total;

  // Brightness: move the middle of the photo towards a comfortable middle, gently
  const target = toLinear(0.46);
  const now = toLinear(Math.max(median, 0.02));
  const ev = clamp(Math.log2(target / now) * 0.7, -1.5, 1.5);

  // Contrast, depending on how flat or harsh the tones are
  let contrast = clamp((0.62 - spread) * 90, 0, 24);
  if (spread > 0.85) contrast = -clamp((spread - 0.85) * 100, 0, 15);

  // White balance from the average colour, kept small so deliberate colour casts survive
  const meanR = mean(scope.r, total);
  const meanG = mean(scope.g, total);
  const meanB = mean(scope.b, total);
  const temperature = clamp(((meanB - meanR) / 255) * 70, -12, 12);
  const tint = clamp(((meanG - (meanR + meanB) / 2) / 255) * 55, -8, 8);

  return {
    exposure: Math.round(ev * 20) / 20,
    contrast: Math.round(contrast),
    highlights: -Math.round(
      clamp(clipped * 900, 0, 55) + clamp(Math.max(0, ev) * 18, 0, 20),
    ),
    shadows: Math.round(clamp((darkShare - 0.2) * 120, 0, 40)),
    whites: Math.round(clamp((0.97 - high) * 260, 0, 45)),
    blacks: -Math.round(clamp((low - 0.03) * 260, 0, 50)),
    temperature: Math.round(temperature),
    tint: Math.round(tint),
    vibrance: Math.round(clamp((0.34 - scope.meanSat) * 110 + 6, 0, 36)),
    sharpen: 22,
  };
}

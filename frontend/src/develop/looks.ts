import { DEFAULT_CROP } from "./geometry";
import type { EditSettings } from "./settings";

/** A copy of the settings with the crop and rotation removed: what a preset or a pasted edit carries. */
export function lookOnly(settings: EditSettings): EditSettings {
  return { ...settings, crop: DEFAULT_CROP };
}

/** Puts a look onto a photo while keeping that photo's own crop and rotation. */
export function applyLook(
  look: EditSettings,
  target: EditSettings,
): EditSettings {
  return { ...look, crop: target.crop };
}

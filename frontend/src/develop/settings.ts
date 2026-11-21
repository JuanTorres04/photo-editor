// A type alias (not an interface) so it can be stored in the database's JSON column.
export type EditSettings = {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
};

export type SettingKey = keyof EditSettings;

export const DEFAULT_SETTINGS: EditSettings = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
};

export interface SliderSpec {
  key: SettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export interface SliderGroup {
  id: string;
  title: string;
  sliders: SliderSpec[];
}

const percent = (key: SettingKey, label: string): SliderSpec => ({
  key,
  label,
  min: -100,
  max: 100,
  step: 1,
  decimals: 0,
});

export const SLIDER_GROUPS: SliderGroup[] = [
  {
    id: "light",
    title: "Light",
    sliders: [
      {
        key: "exposure",
        label: "Exposure",
        min: -5,
        max: 5,
        step: 0.05,
        decimals: 2,
      },
      percent("contrast", "Contrast"),
      percent("highlights", "Highlights"),
      percent("shadows", "Shadows"),
      percent("whites", "Whites"),
      percent("blacks", "Blacks"),
    ],
  },
  {
    id: "color",
    title: "Color",
    sliders: [
      percent("temperature", "Temperature"),
      percent("tint", "Tint"),
      percent("vibrance", "Vibrance"),
      percent("saturation", "Saturation"),
    ],
  },
];

const ALL_SPECS = SLIDER_GROUPS.flatMap((group) => group.sliders);

export function isDefault(settings: EditSettings): boolean {
  return ALL_SPECS.every(
    (spec) => settings[spec.key] === DEFAULT_SETTINGS[spec.key],
  );
}

/** Turns whatever came out of the database into safe settings: unknown keys dropped, numbers clamped. */
export function normalizeSettings(value: unknown): EditSettings {
  const result: EditSettings = { ...DEFAULT_SETTINGS };
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result;

  const source = value as Record<string, unknown>;
  for (const spec of ALL_SPECS) {
    const raw = source[spec.key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      result[spec.key] = Math.min(spec.max, Math.max(spec.min, raw));
    }
  }
  return result;
}

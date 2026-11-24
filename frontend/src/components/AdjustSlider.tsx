import type { CSSProperties } from "react";
import type { SettingKey, SliderSpec } from "../develop/settings";

interface AdjustSliderProps {
  spec: SliderSpec;
  value: number;
  onChange: (key: SettingKey, value: number) => void;
  onReset: (key: SettingKey) => void;
}

function formatValue(value: number, decimals: number, signed: boolean): string {
  const text = value.toFixed(decimals);
  return signed && value > 0 ? `+${text}` : text;
}

export function AdjustSlider({
  spec,
  value,
  onChange,
  onReset,
}: AdjustSliderProps) {
  const id = `adjust-${spec.key}`;
  const changed = value !== 0;
  const text = formatValue(value, spec.decimals, spec.min < 0);

  // The coloured part of the track runs from zero to the handle, so you can see the direction at a glance
  const range = spec.max - spec.min;
  const at = ((value - spec.min) / range) * 100;
  const zero = ((0 - spec.min) / range) * 100;
  const style = {
    "--s": `${Math.min(at, zero)}%`,
    "--e": `${Math.max(at, zero)}%`,
  } as CSSProperties;

  return (
    <div className={changed ? "adjust changed" : "adjust"}>
      <div className="adjust-row">
        <label htmlFor={id}>{spec.label}</label>
        <span className="adjust-value">{text}</span>
        <button
          type="button"
          className="ghost adjust-reset"
          onClick={() => onReset(spec.key)}
          aria-label={`Reset ${spec.label}`}
        >
          ↺
        </button>
      </div>
      <input
        id={id}
        className="adjust-range"
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        style={style}
        aria-valuetext={text}
        onChange={(event) => onChange(spec.key, Number(event.target.value))}
        onDoubleClick={() => onReset(spec.key)}
      />
    </div>
  );
}

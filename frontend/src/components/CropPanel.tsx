import type { CSSProperties } from "react";
import {
  DEFAULT_CROP,
  cropIsIdentity,
  fits,
  flipGeometry,
  rectOf,
  rectWithRatio,
  rotateGeometry,
  shrinkToFit,
} from "../develop/geometry";
import type { CropSettings, Size } from "../develop/geometry";

const PRESETS = [
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "5:4", ratio: 5 / 4 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "2:3", ratio: 2 / 3 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
];

const matches = (current: number | null, target: number): boolean =>
  current !== null && Math.abs(current - target) < 0.002;

interface CropPanelProps {
  crop: CropSettings;
  frame: Size;
  cropping: boolean;
  ratio: number | null;
  onCropping: (on: boolean) => void;
  onRatio: (ratio: number | null) => void;
  onChange: (next: CropSettings, key: string, discrete?: boolean) => void;
}

export function CropPanel({
  crop,
  frame,
  cropping,
  ratio,
  onCropping,
  onRatio,
  onChange,
}: CropPanelProps) {
  const original = frame.width / frame.height;

  const toggle = () => {
    if (cropping) {
      onCropping(false);
      return;
    }
    const rect = rectOf(crop);
    if (!fits(rect, crop.angle, frame)) {
      onChange(
        { ...crop, ...shrinkToFit(rect, crop.angle, frame) },
        "fit",
        true,
      );
    }
    onCropping(true);
  };

  const chooseRatio = (next: number | null) => {
    onCropping(true);
    onRatio(next);
    if (next === null) return;
    const reshaped = shrinkToFit(
      rectWithRatio(rectOf(crop), next, frame),
      crop.angle,
      frame,
    );
    onChange({ ...crop, ...reshaped }, "ratio", true);
  };

  const rotate = (clockwise: boolean) => {
    onChange(rotateGeometry(crop, clockwise), "rotate", true);
    if (ratio !== null) onRatio(1 / ratio);
  };

  const setAngle = (value: number) => {
    const angle = Math.min(45, Math.max(-45, value));
    const rect = shrinkToFit(rectOf(crop), angle, frame);
    onChange({ ...crop, ...rect, angle }, "angle");
  };

  const reset = () => {
    onChange(DEFAULT_CROP, "reset", true);
    onRatio(null);
  };

  // the coloured part of the straighten track runs from zero to the handle
  const at = ((crop.angle + 45) / 90) * 100;
  const style = {
    "--s": `${Math.min(at, 50)}%`,
    "--e": `${Math.max(at, 50)}%`,
  } as CSSProperties;
  const angleText = `${crop.angle > 0 ? "+" : ""}${crop.angle.toFixed(1)}°`;

  return (
    <div className="crop-panel">
      <button
        type="button"
        className={cropping ? "primary" : undefined}
        aria-pressed={cropping}
        onClick={toggle}
      >
        {cropping ? "Done cropping" : "Crop"}
      </button>

      <div className="crop-actions" role="group" aria-label="Crop shape">
        <button
          type="button"
          className="seg"
          aria-pressed={cropping && ratio === null}
          onClick={() => chooseRatio(null)}
        >
          Free
        </button>
        <button
          type="button"
          className="seg"
          aria-pressed={matches(ratio, original)}
          onClick={() => chooseRatio(original)}
        >
          Original
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="seg"
            aria-pressed={matches(ratio, preset.ratio)}
            onClick={() => chooseRatio(preset.ratio)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="crop-actions" role="group" aria-label="Rotate and flip">
        <button type="button" onClick={() => rotate(false)}>
          Rotate left
        </button>
        <button type="button" onClick={() => rotate(true)}>
          Rotate right
        </button>
        <button
          type="button"
          onClick={() => onChange(flipGeometry(crop, "h"), "flip", true)}
        >
          Flip horizontal
        </button>
        <button
          type="button"
          onClick={() => onChange(flipGeometry(crop, "v"), "flip", true)}
        >
          Flip vertical
        </button>
      </div>

      <div className={crop.angle !== 0 ? "adjust changed" : "adjust"}>
        <div className="adjust-row">
          <label htmlFor="straighten">Straighten</label>
          <span className="adjust-value">{angleText}</span>
          <button
            type="button"
            className="ghost adjust-reset"
            aria-label="Reset straighten"
            onClick={() => setAngle(0)}
          >
            ↺
          </button>
        </div>
        <input
          id="straighten"
          className="adjust-range"
          type="range"
          min={-45}
          max={45}
          step={0.1}
          value={crop.angle}
          style={style}
          aria-valuetext={angleText}
          onChange={(event) => setAngle(Number(event.target.value))}
          onDoubleClick={() => setAngle(0)}
        />
      </div>

      <button
        type="button"
        className="ghost"
        disabled={cropIsIdentity(crop)}
        onClick={reset}
      >
        Reset crop and rotation
      </button>
      <p className="muted">
        Drag the corners or edges to crop, and drag inside the box to move it.
        With the box focused, use the arrow keys to move it and plus or minus to
        resize it. Press C to switch the crop tool on or off.
      </p>
    </div>
  );
}

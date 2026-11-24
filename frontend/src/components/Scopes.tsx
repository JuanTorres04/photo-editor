import { useEffect, useRef, useState } from "react";
import type { ScopeData } from "../develop/scopes";

type Mode = "histogram" | "waveform";

interface ScopesProps {
  data: ScopeData | null;
}

function drawHistogram(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  data: ScopeData | null,
) {
  canvas.width = 256;
  canvas.height = 100;
  ctx.fillStyle = "#141414";
  ctx.fillRect(0, 0, 256, 100);

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  for (const x of [64, 128, 192]) ctx.fillRect(x, 0, 1, 100);
  if (!data) return;

  // Overlapping channels add up, so neutral areas show as white
  ctx.globalCompositeOperation = "lighter";
  const channels: Array<[Uint32Array, string]> = [
    [data.r, "rgba(255, 70, 70, 0.75)"],
    [data.g, "rgba(60, 220, 110, 0.75)"],
    [data.b, "rgba(70, 130, 255, 0.75)"],
  ];
  for (const [bins, color] of channels) {
    ctx.fillStyle = color;
    for (let v = 0; v < 256; v++) {
      const height = Math.min(100, (bins[v] / data.histMax) * 96);
      ctx.fillRect(v, 100 - height, 1, height);
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  data: ScopeData | null,
) {
  const width = data ? data.columns : 256;
  canvas.width = width;
  canvas.height = 256;

  const image = ctx.createImageData(width, 256);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 20;
    pixels[i + 1] = 20;
    pixels[i + 2] = 20;
    pixels[i + 3] = 255;
  }

  if (data) {
    for (let x = 0; x < width; x++) {
      for (let level = 0; level < 256; level++) {
        const count = data.waveform[x * 256 + level];
        if (count === 0) continue;
        const intensity = Math.min(1, Math.sqrt(count / data.waveMax) * 1.4);
        const offset = ((255 - level) * width + x) * 4;
        pixels[offset] = 20 + (240 - 20) * intensity;
        pixels[offset + 1] = 20 + (180 - 20) * intensity;
        pixels[offset + 2] = 20 + (76 - 20) * intensity;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function Scopes({ data }: ScopesProps) {
  const [mode, setMode] = useState<Mode>("histogram");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (mode === "histogram") drawHistogram(canvas, context, data);
    else drawWaveform(canvas, context, data);
  }, [data, mode]);

  return (
    <div className="scopes">
      <div className="scopes-head" role="group" aria-label="Scope type">
        <button
          type="button"
          className="seg"
          aria-pressed={mode === "histogram"}
          onClick={() => setMode("histogram")}
        >
          Histogram
        </button>
        <button
          type="button"
          className="seg"
          aria-pressed={mode === "waveform"}
          onClick={() => setMode("waveform")}
        >
          Waveform
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="scope-canvas"
        role="img"
        aria-label={
          mode === "histogram"
            ? "Histogram of the photo's red, green and blue values"
            : "Waveform showing the photo's brightness across its width"
        }
      />
    </div>
  );
}

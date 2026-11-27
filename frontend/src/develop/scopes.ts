export interface ScopeData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  /** How many pixels sit at each of 256 brightness levels */
  luma: Uint32Array;
  /** The average colour strength of the photo, from 0 (grey) to 1 (vivid) */
  meanSat: number;
  /** Tallest bin, ignoring the two end bins so clipped pixels don't flatten the rest */
  histMax: number;
  columns: number;
  /** For each column of the photo, how many pixels sit at each of 256 brightness levels */
  waveform: Uint16Array;
  waveMax: number;
}

export function computeScopes(
  pixels: Uint8Array,
  width: number,
  height: number,
): ScopeData {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  const waveform = new Uint16Array(width * 256);
  let satSum = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      r[red]++;
      g[green]++;
      b[blue]++;
      const level = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      luma[level]++;
      waveform[x * 256 + level]++;
      const top = Math.max(red, green, blue);
      if (top > 0) satSum += (top - Math.min(red, green, blue)) / top;
    }
  }

  let histMax = 1;
  for (let v = 1; v < 255; v++) histMax = Math.max(histMax, r[v], g[v], b[v]);

  let waveMax = 1;
  for (let k = 0; k < waveform.length; k++) {
    if (waveform[k] > waveMax) waveMax = waveform[k];
  }

  return {
    r,
    g,
    b,
    luma,
    meanSat: width * height > 0 ? satSum / (width * height) : 0,
    histMax,
    columns: width,
    waveform,
    waveMax,
  };
}

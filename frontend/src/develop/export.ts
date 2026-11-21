import { DevelopRenderer } from "./renderer";
import type { EditSettings } from "./settings";

export type ExportFormat = "jpeg" | "png" | "webp";

export const FORMAT_INFO: Record<
  ExportFormat,
  { label: string; mime: string; lossy: boolean }
> = {
  jpeg: { label: "JPEG", mime: "image/jpeg", lossy: true },
  png: { label: "PNG", mime: "image/png", lossy: false },
  webp: { label: "WebP", mime: "image/webp", lossy: true },
};

export interface ExportSize {
  id: string;
  label: string;
  width: number;
  height: number;
}

export type ExportPhase = "decoding" | "rendering" | "encoding";

let cachedMaxEdge: number | null = null;

/** The largest width or height this device's graphics card can handle. */
export function gpuMaxEdge(): number {
  if (cachedMaxEdge !== null) return cachedMaxEdge;
  let edge = 4096;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (gl) {
    const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    edge = Math.min(texture, viewport[0], viewport[1]);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  cachedMaxEdge = edge;
  return edge;
}

function fit(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The sizes offered in the export dialog: the full size (or the biggest this device can do) and a few smaller ones. */
export function exportSizes(
  width: number,
  height: number,
  maxEdge: number,
): ExportSize[] {
  const full = fit(width, height, maxEdge);
  const limited = full.width !== width || full.height !== height;
  const sizes: ExportSize[] = [
    {
      id: "original",
      label: limited ? "Largest this device supports" : "Original size",
      ...full,
    },
  ];
  const fullEdge = Math.max(full.width, full.height);
  for (const edge of [4096, 2048, 1080]) {
    if (edge < fullEdge) {
      sizes.push({
        id: String(edge),
        label: `${edge} px on the long edge`,
        ...fit(width, height, edge),
      });
    }
  }
  return sizes;
}

/** Renders the edited original at the chosen size and returns the encoded file. */
export async function renderExport(
  source: Blob,
  settings: EditSettings,
  size: ExportSize,
  format: ExportFormat,
  quality: number,
  onPhase: (phase: ExportPhase) => void,
): Promise<Blob> {
  onPhase("decoding");
  let bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  if (bitmap.width !== size.width || bitmap.height !== size.height) {
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: "high",
    });
    bitmap.close();
    bitmap = resized;
  }

  onPhase("rendering");
  const canvas = document.createElement("canvas");
  let renderer: DevelopRenderer | null = null;
  try {
    renderer = new DevelopRenderer(canvas, bitmap);
    renderer.render(settings);
    // toBlob must be called in the same task as the draw, before the browser clears the canvas
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Your browser couldn't create the image file.")),
        FORMAT_INFO[format].mime,
        quality,
      );
      onPhase("encoding");
    });
  } finally {
    renderer?.release();
    bitmap.close();
  }
}

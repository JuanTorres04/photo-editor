import { cropIsIdentity, croppedSize } from "./geometry";
import type { CropSettings } from "./geometry";
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
  /** The size of the finished picture. */
  width: number;
  height: number;
  /** How much the original photo is scaled before cropping. 1 means full resolution. */
  scale: number;
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

/** The sizes offered in the export dialog, for the cropped picture: full resolution and a few smaller ones. */
export function exportSizes(
  photoWidth: number,
  photoHeight: number,
  crop: CropSettings,
  maxEdge: number,
): ExportSize[] {
  const full = croppedSize(photoWidth, photoHeight, crop);
  // the whole photo is loaded into the graphics card, so it is what has to stay under the device's limit
  const limit = Math.min(1, maxEdge / Math.max(photoWidth, photoHeight));

  const make = (id: string, label: string, scale: number): ExportSize => ({
    id,
    label,
    scale,
    width: Math.max(1, Math.round(full.width * scale)),
    height: Math.max(1, Math.round(full.height * scale)),
  });

  const fullLabel =
    limit < 1
      ? "Largest this device supports"
      : cropIsIdentity(crop)
        ? "Original size"
        : "Full resolution";
  const sizes = [make("original", fullLabel, limit)];
  const fullEdge = Math.max(sizes[0].width, sizes[0].height);
  for (const edge of [4096, 2048, 1080]) {
    if (edge < fullEdge) {
      sizes.push(
        make(
          String(edge),
          `${edge} px on the long edge`,
          edge / Math.max(full.width, full.height),
        ),
      );
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
  if (Math.abs(size.scale - 1) > 1e-6) {
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * size.scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * size.scale)),
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
    renderer.render(settings); // the renderer sizes the canvas to the crop
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

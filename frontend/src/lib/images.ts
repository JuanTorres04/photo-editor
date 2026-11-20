export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 20000;
export const MAX_PIXELS = 50_000_000;
const PREVIEW_EDGE = 2048;
const THUMB_EDGE = 480;

export type ImageKind = "jpeg" | "png" | "webp";

export const MIME_BY_KIND: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A problem with the photo itself, with a message that is safe to show to the person. */
export class ImageValidationError extends Error {}

/** Looks at the first bytes of the file to find out what it really is, ignoring its name and declared type. */
export async function detectImageKind(file: File): Promise<ImageKind | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (...signature: number[]) =>
    signature.every((byte, i) => bytes[i] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return "jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  const isRiff = startsWith(0x52, 0x49, 0x46, 0x46);
  const isWebp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isRiff && isWebp) return "webp";
  return null;
}

export interface ProcessedImage {
  kind: ImageKind;
  width: number;
  height: number;
  preview: Blob;
  thumb: Blob;
}

async function renderScaled(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new ImageValidationError("Your browser can't process images.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new ImageValidationError(
                "Could not create a preview of that photo.",
              ),
            ),
      "image/webp",
      quality,
    );
  });
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (file.size === 0) throw new ImageValidationError("That file is empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new ImageValidationError("Photos can be at most 10 MB.");

  const kind = await detectImageKind(file);
  if (!kind)
    throw new ImageValidationError(
      "Only JPEG, PNG, and WebP photos are supported.",
    );

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageValidationError(
      "That file looks damaged and could not be opened.",
    );
  }

  try {
    const { width, height } = bitmap;
    if (
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION ||
      width * height > MAX_PIXELS
    ) {
      throw new ImageValidationError(
        "That photo is too large. The limit is 50 megapixels.",
      );
    }
    const preview = await renderScaled(bitmap, PREVIEW_EDGE, 0.88);
    const thumb = await renderScaled(bitmap, THUMB_EDGE, 0.8);
    return { kind, width, height, preview, thumb };
  } finally {
    bitmap.close();
  }
}

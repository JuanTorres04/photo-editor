/** A safe download name made from the photo's title. */
export function exportFileName(title: string, mime: string): string {
  const base =
    title
      .replace(/[^\p{L}\p{N}\-_. ]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 80) || "photo";
  const extension =
    mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `${base}-edited.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

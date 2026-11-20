import type { Database } from "../types/database";
import { MIME_BY_KIND, processImage } from "./images";
import { supabase } from "./supabase";

export type Photo = Database["public"]["Tables"]["photos"]["Row"];

/** Matches the limit enforced by the database trigger. */
export const MAX_PHOTOS = 30;

const BUCKET = "photos";
const URL_TTL_SECONDS = 60 * 60;

export async function listPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** The bucket is private, so thumbnails are shown through short-lived signed links. */
export async function signThumbs(
  photos: Photo[],
): Promise<Record<string, string>> {
  if (photos.length === 0) return {};
  const paths = photos.map((photo) => photo.thumb_path);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, URL_TTL_SECONDS);
  if (error) throw error;

  const urlByPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }
  const result: Record<string, string> = {};
  for (const photo of photos) {
    const url = urlByPath.get(photo.thumb_path);
    if (url) result[photo.id] = url;
  }
  return result;
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 120);
}

export async function importPhoto(file: File, userId: string): Promise<Photo> {
  const processed = await processImage(file);
  const id = crypto.randomUUID();
  const folder = `${userId}/${id}`;
  const extension = processed.kind === "jpeg" ? "jpg" : processed.kind;

  const original = `${folder}/original.${extension}`;
  const preview = `${folder}/preview`;
  const thumb = `${folder}/thumb`;

  const uploads: Array<{ path: string; body: Blob; contentType: string }> = [
    { path: original, body: file, contentType: MIME_BY_KIND[processed.kind] },
    { path: preview, body: processed.preview, contentType: "image/webp" },
    { path: thumb, body: processed.thumb, contentType: "image/webp" },
  ];

  const uploaded: string[] = [];
  try {
    for (const { path, body, contentType } of uploads) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType, upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }

    const { data, error } = await supabase
      .from("photos")
      .insert({
        id,
        title: titleFromName(file.name),
        original_path: original,
        preview_path: preview,
        thumb_path: thumb,
        width: processed.width,
        height: processed.height,
        size_bytes: file.size,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    // Don't leave orphaned files behind when part of an import fails
    if (uploaded.length > 0)
      await supabase.storage.from(BUCKET).remove(uploaded);
    throw err;
  }
}

export async function deletePhoto(photo: Photo): Promise<void> {
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage
    .from(BUCKET)
    .remove([photo.original_path, photo.preview_path, photo.thumb_path]);
}

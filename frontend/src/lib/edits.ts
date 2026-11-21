import { normalizeSettings } from "../develop/settings";
import type { EditSettings } from "../develop/settings";
import { supabase } from "./supabase";

export async function loadEdit(photoId: string): Promise<EditSettings> {
  const { data, error } = await supabase
    .from("edits")
    .select("settings")
    .eq("photo_id", photoId)
    .maybeSingle();
  if (error) throw error;
  return normalizeSettings(data?.settings);
}

export async function saveEdit(
  photoId: string,
  settings: EditSettings,
): Promise<void> {
  const { error } = await supabase
    .from("edits")
    .upsert({
      photo_id: photoId,
      settings,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

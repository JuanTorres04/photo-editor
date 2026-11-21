import { normalizeSettings } from "../develop/settings";
import type { EditSettings } from "../develop/settings";
import { supabase } from "./supabase";

export interface EditVersion {
  id: string;
  name: string;
  settings: EditSettings;
  created_at: string;
}

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

const VERSION_COLUMNS = "id, name, settings, created_at";

function toVersion(row: {
  id: string;
  name: string;
  settings: unknown;
  created_at: string;
}): EditVersion {
  return {
    id: row.id,
    name: row.name,
    settings: normalizeSettings(row.settings),
    created_at: row.created_at,
  };
}

export async function listVersions(photoId: string): Promise<EditVersion[]> {
  const { data, error } = await supabase
    .from("edit_versions")
    .select(VERSION_COLUMNS)
    .eq("photo_id", photoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toVersion);
}

export async function createVersion(
  photoId: string,
  name: string,
  settings: EditSettings,
): Promise<EditVersion> {
  const { data, error } = await supabase
    .from("edit_versions")
    .insert({ photo_id: photoId, name, settings })
    .select(VERSION_COLUMNS)
    .single();
  if (error) throw error;
  return toVersion(data);
}

export async function deleteVersion(id: string): Promise<void> {
  const { error } = await supabase.from("edit_versions").delete().eq("id", id);
  if (error) throw error;
}

import { normalizeSettings } from "../develop/settings";
import type { EditSettings } from "../develop/settings";
import { supabase } from "./supabase";

export interface Preset {
  id: string;
  name: string;
  settings: EditSettings;
  builtin: boolean;
}

const COLUMNS = "id, name, settings, owner_id";

function toPreset(row: {
  id: string;
  name: string;
  settings: unknown;
  owner_id: string | null;
}): Preset {
  return {
    id: row.id,
    name: row.name,
    settings: normalizeSettings(row.settings),
    builtin: row.owner_id === null,
  };
}

export async function listPresets(): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("presets")
    .select(COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(toPreset);
}

export async function createPreset(
  name: string,
  settings: EditSettings,
): Promise<Preset> {
  const { data, error } = await supabase
    .from("presets")
    .insert({ name, settings })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toPreset(data);
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await supabase.from("presets").delete().eq("id", id);
  if (error) throw error;
}

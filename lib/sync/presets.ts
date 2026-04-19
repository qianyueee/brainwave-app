import { supabase } from "@/lib/supabase";
import type { SynthPreset } from "@/lib/synth-engine";

interface PresetRow {
  id: string;
  user_id: string;
  name: string;
  data: {
    layers?: SynthPreset["layers"];
    leftLayers?: SynthPreset["leftLayers"];
    rightLayers?: SynthPreset["rightLayers"];
    vibrato: SynthPreset["vibrato"];
    editorMode?: SynthPreset["editorMode"];
  };
  created_at: string;
}

function rowToPreset(row: PresetRow): SynthPreset {
  return {
    id: row.id,
    name: row.name,
    layers: row.data.layers ?? [],
    leftLayers: row.data.leftLayers,
    rightLayers: row.data.rightLayers,
    vibrato: row.data.vibrato,
    editorMode: row.data.editorMode,
    createdAt: row.created_at,
  };
}

function presetToData(p: SynthPreset): PresetRow["data"] {
  return {
    layers: p.layers,
    leftLayers: p.leftLayers,
    rightLayers: p.rightLayers,
    vibrato: p.vibrato,
    editorMode: p.editorMode,
  };
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

export async function listPresets(userId: string): Promise<SynthPreset[]> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_synth_presets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PresetRow[]).map(rowToPreset);
}

export async function upsertPreset(userId: string, preset: SynthPreset): Promise<SynthPreset> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_synth_presets")
    .upsert({
      id: preset.id,
      user_id: userId,
      name: preset.name,
      data: presetToData(preset),
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPreset(data as PresetRow);
}

export async function deletePreset(userId: string, presetId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_synth_presets")
    .delete()
    .eq("user_id", userId)
    .eq("id", presetId);
  if (error) throw error;
}

export async function bulkInsertPresets(userId: string, presets: SynthPreset[]): Promise<void> {
  if (presets.length === 0) return;
  const sb = assertClient();
  const { error } = await sb.from("user_synth_presets").insert(
    presets.map((p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      data: presetToData(p),
      created_at: p.createdAt,
    }))
  );
  if (error) throw error;
}

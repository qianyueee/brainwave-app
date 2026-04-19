import { supabase } from "@/lib/supabase";
import type { CustomProgram } from "@/lib/programs";
import type { SynthPreset } from "@/lib/synth-engine";

interface ProgramRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  icon: string;
  default_duration: number;
  preset: SynthPreset;
  created_at: string;
}

function rowToProgram(row: ProgramRow): CustomProgram {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    defaultDuration: row.default_duration,
    preset: row.preset,
    createdAt: row.created_at,
  };
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

export async function listPrograms(userId: string): Promise<CustomProgram[]> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_synth_programs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ProgramRow[]).map(rowToProgram);
}

export async function upsertProgram(userId: string, program: CustomProgram): Promise<CustomProgram> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_synth_programs")
    .upsert({
      id: program.id,
      user_id: userId,
      name: program.name,
      description: program.description,
      icon: program.icon,
      default_duration: program.defaultDuration,
      preset: program.preset,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToProgram(data as ProgramRow);
}

export async function deleteProgram(userId: string, programId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_synth_programs")
    .delete()
    .eq("user_id", userId)
    .eq("id", programId);
  if (error) throw error;
}

export async function bulkInsertPrograms(userId: string, programs: CustomProgram[]): Promise<void> {
  if (programs.length === 0) return;
  const sb = assertClient();
  const { error } = await sb.from("user_synth_programs").insert(
    programs.map((p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      description: p.description,
      icon: p.icon,
      default_duration: p.defaultDuration,
      preset: p.preset,
      created_at: p.createdAt,
    }))
  );
  if (error) throw error;
}

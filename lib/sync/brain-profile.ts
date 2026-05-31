import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import { normalizeMeasurements } from "@/lib/brain-measurements";

interface ProfileRow {
  user_id: string;
  // Current shape is BrainProfile[]; older rows stored a single BrainProfile.
  data: unknown;
  updated_at: string;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

/**
 * Load all brain measurements for a user (oldest→newest), tolerating the
 * legacy single-object blob shape via `normalizeMeasurements`.
 */
export async function getBrainMeasurements(userId: string): Promise<BrainProfile[]> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_brain_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return normalizeMeasurements((data as ProfileRow).data);
}

/** Replace the user's full measurements blob (one JSONB row per user). */
export async function upsertBrainMeasurements(
  userId: string,
  measurements: BrainProfile[]
): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_brain_profile")
    .upsert({ user_id: userId, data: measurements });
  if (error) throw error;
}

/** Delete the user's entire brain-profile row (clears all history). */
export async function deleteBrainProfile(userId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_brain_profile")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

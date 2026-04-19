import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";

interface ProfileRow {
  user_id: string;
  data: BrainProfile;
  updated_at: string;
}

function assertClient() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

export async function getBrainProfile(userId: string): Promise<BrainProfile | null> {
  const sb = assertClient();
  const { data, error } = await sb
    .from("user_brain_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (data as ProfileRow).data;
}

export async function upsertBrainProfile(userId: string, profile: BrainProfile): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_brain_profile")
    .upsert({ user_id: userId, data: profile });
  if (error) throw error;
}

export async function deleteBrainProfile(userId: string): Promise<void> {
  const sb = assertClient();
  const { error } = await sb
    .from("user_brain_profile")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

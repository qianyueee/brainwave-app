import { supabase } from "@/lib/supabase";

export type UserRole = "user" | "admin" | "super_admin";

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  is_disabled: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface UserWithGroups extends Profile {
  groups: Group[];
}

// ─── Profile / Role ───────────────────────────────────────

export async function fetchUserRole(userId: string): Promise<UserRole> {
  if (!supabase) return "user";
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error || !data) return "user";
  return data.role as UserRole;
}

export async function fetchAllUsers(): Promise<UserWithGroups[]> {
  if (!supabase) return [];
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !profiles) return [];

  const { data: memberships } = await supabase
    .from("user_groups")
    .select("user_id, group_id, groups(*)");

  const groupMap = new Map<string, Group[]>();
  if (memberships) {
    for (const m of memberships as unknown as { user_id: string; group_id: string; groups: Group }[]) {
      const existing = groupMap.get(m.user_id) ?? [];
      existing.push(m.groups);
      groupMap.set(m.user_id, existing);
    }
  }

  return profiles.map((p) => ({
    ...p,
    role: p.role as UserRole,
    groups: groupMap.get(p.id) ?? [],
  }));
}

export async function updateUserRole(userId: string, role: UserRole) {
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) console.error("[admin] updateUserRole error:", error.message);
}

// ─── Groups ───────────────────────────────────────────────

export async function fetchGroups(): Promise<Group[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[admin] fetchGroups error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function createGroup(name: string, description: string, createdBy: string): Promise<Group | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("groups")
    .insert({ name, description, created_by: createdBy })
    .select()
    .single();
  if (error) {
    console.error("[admin] createGroup error:", error.message);
    return null;
  }
  return data;
}

export async function updateGroup(id: string, patch: { name?: string; description?: string }) {
  if (!supabase) return;
  const { error } = await supabase
    .from("groups")
    .update(patch)
    .eq("id", id);
  if (error) console.error("[admin] updateGroup error:", error.message);
}

export async function deleteGroup(id: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("groups")
    .delete()
    .eq("id", id);
  if (error) console.error("[admin] deleteGroup error:", error.message);
}

// ─── User ↔ Group assignments ─────────────────────────────

export async function assignUserToGroup(userId: string, groupId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("user_groups")
    .insert({ user_id: userId, group_id: groupId });
  if (error) console.error("[admin] assignUserToGroup error:", error.message);
}

export async function removeUserFromGroup(userId: string, groupId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("user_groups")
    .delete()
    .eq("user_id", userId)
    .eq("group_id", groupId);
  if (error) console.error("[admin] removeUserFromGroup error:", error.message);
}

export async function fetchUserGroups(userId: string): Promise<Group[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("user_groups")
    .select("group_id, groups(*)")
    .eq("user_id", userId);
  if (error || !data) return [];
  return (data as unknown as { group_id: string; groups: Group }[]).map((d) => d.groups);
}

// ─── Program ↔ Group assignments ──────────────────────────

export async function fetchGroupPrograms(groupId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("group_programs")
    .select("program_id")
    .eq("group_id", groupId);
  if (error || !data) return [];
  return data.map((d) => d.program_id);
}

export async function fetchAllGroupPrograms(): Promise<{ group_id: string; program_id: string }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("group_programs")
    .select("group_id, program_id");
  if (error || !data) return [];
  return data;
}

export async function assignProgramToGroup(programId: string, groupId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("group_programs")
    .insert({ program_id: programId, group_id: groupId });
  if (error) console.error("[admin] assignProgramToGroup error:", error.message);
}

export async function removeProgramFromGroup(programId: string, groupId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("group_programs")
    .delete()
    .eq("program_id", programId)
    .eq("group_id", groupId);
  if (error) console.error("[admin] removeProgramFromGroup error:", error.message);
}

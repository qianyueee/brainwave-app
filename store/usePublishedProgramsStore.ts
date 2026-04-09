import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { CustomProgram } from "@/lib/programs";
import type { SynthPreset } from "@/lib/synth-engine";

interface DbRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  default_duration: number;
  preset: SynthPreset;
  created_at: string;
  published_at: string;
  sort_order: number;
}

function rowToProgram(row: DbRow): CustomProgram {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    defaultDuration: row.default_duration,
    preset: row.preset as SynthPreset,
    createdAt: row.created_at,
  };
}

function programToRow(p: CustomProgram): Omit<DbRow, "published_at"> {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    default_duration: p.defaultDuration,
    preset: p.preset,
    created_at: p.createdAt,
    sort_order: 0,
  };
}

interface PublishedProgramsState {
  programs: CustomProgram[];
  groupProgramIds: string[];
  loading: boolean;
  fetchPrograms: () => Promise<void>;
  fetchGroupProgramIds: (groupIds: string[]) => Promise<void>;
  publishProgram: (program: CustomProgram) => Promise<void>;
  unpublishProgram: (id: string) => Promise<void>;
}

export const usePublishedProgramsStore = create<PublishedProgramsState>()(
  (set, get) => ({
    programs: [],
    groupProgramIds: [],
    loading: false,

    fetchPrograms: async () => {
      if (!supabase) return;
      set({ loading: true });
      const { data, error } = await supabase
        .from("published_programs")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("[published_programs] fetch error:", error.message);
        set({ loading: false });
        return;
      }
      set({ programs: (data as DbRow[]).map(rowToProgram), loading: false });
    },

    fetchGroupProgramIds: async (groupIds) => {
      if (!supabase || groupIds.length === 0) {
        set({ groupProgramIds: [] });
        return;
      }
      const { data, error } = await supabase
        .from("group_programs")
        .select("program_id")
        .in("group_id", groupIds);
      if (error) {
        console.error("[published_programs] fetchGroupProgramIds error:", error.message);
        return;
      }
      const ids = [...new Set((data ?? []).map((d) => d.program_id))];
      set({ groupProgramIds: ids });
    },

    publishProgram: async (program) => {
      if (!supabase) return;
      set({ loading: true });
      const { error } = await supabase
        .from("published_programs")
        .upsert(programToRow(program));
      if (error) {
        console.error("[published_programs] publish error:", error.message);
        set({ loading: false });
        return;
      }
      await get().fetchPrograms();
    },

    unpublishProgram: async (id) => {
      if (!supabase) return;
      set({ loading: true });
      const { error } = await supabase
        .from("published_programs")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[published_programs] unpublish error:", error.message);
        set({ loading: false });
        return;
      }
      await get().fetchPrograms();
    },
  })
);

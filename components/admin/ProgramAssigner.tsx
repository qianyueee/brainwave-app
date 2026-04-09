"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchGroups,
  fetchAllGroupPrograms,
  assignProgramToGroup,
  removeProgramFromGroup,
  type Group,
} from "@/lib/admin";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import type { CustomProgram } from "@/lib/programs";
import { Waves, Plus, X } from "lucide-react";

export default function ProgramAssigner() {
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);

  const [groups, setGroups] = useState<Group[]>([]);
  const [assignments, setAssignments] = useState<{ group_id: string; program_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [g, a] = await Promise.all([
      fetchGroups(),
      fetchAllGroupPrograms(),
    ]);
    setGroups(g);
    setAssignments(a);
    await fetchPrograms();
    setLoading(false);
  }, [fetchPrograms]);

  useEffect(() => {
    load();
  }, [load]);

  const getGroupsForProgram = (programId: string) => {
    const groupIds = assignments
      .filter((a) => a.program_id === programId)
      .map((a) => a.group_id);
    return groups.filter((g) => groupIds.includes(g.id));
  };

  const getAvailableGroups = (programId: string) => {
    const assigned = getGroupsForProgram(programId);
    return groups.filter((g) => !assigned.some((ag) => ag.id === g.id));
  };

  const handleAssign = async (programId: string, groupId: string) => {
    await assignProgramToGroup(programId, groupId);
    await load();
  };

  const handleRemove = async (programId: string, groupId: string) => {
    await removeProgramFromGroup(programId, groupId);
    await load();
  };

  if (loading) {
    return <p className="text-sm text-text-muted text-center py-8">読み込み中...</p>;
  }

  if (publishedPrograms.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        公開済みプログラムがありません。<br />
        ホーム画面でプログラムを公開してください。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {publishedPrograms.map((program: CustomProgram) => {
        const assignedGroups = getGroupsForProgram(program.id);
        const availableGroups = getAvailableGroups(program.id);

        return (
          <div key={program.id} className="bg-surface border border-surface-border rounded-2xl p-4 neu-raised">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-navy neu-inset flex items-center justify-center shrink-0">
                <Waves size={20} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">{program.name}</p>
                <p className="text-xs text-text-secondary">{program.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-text-muted">グループ:</span>
              {assignedGroups.length === 0 && (
                <span className="text-xs text-text-muted">未割当</span>
              )}
              {assignedGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleRemove(program.id, g.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary/15 text-primary text-xs font-medium"
                >
                  {g.name}
                  <X size={12} />
                </button>
              ))}
              {availableGroups.length > 0 && (
                <select
                  className="px-2.5 py-1 rounded-xl bg-navy text-text-secondary text-xs border border-surface-border"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleAssign(program.id, e.target.value);
                  }}
                >
                  <option value="">+ 追加</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

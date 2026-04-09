"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  type Group,
} from "@/lib/admin";
import { useAuthStore } from "@/store/useAuthStore";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

export default function GroupManager() {
  const user = useAuthStore((s) => s.user);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const g = await fetchGroups();
    setGroups(g);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    await createGroup(newName.trim(), newDesc.trim(), user.id);
    setNewName("");
    setNewDesc("");
    await load();
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await updateGroup(id, { name: editName.trim(), description: editDesc.trim() });
    setEditingId(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteGroup(id);
    await load();
  };

  const startEdit = (g: Group) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditDesc(g.description);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Create new group */}
      <div className="bg-surface border border-surface-border rounded-2xl p-4 neu-raised flex flex-col gap-3">
        <p className="text-sm font-bold text-text-primary">新規グループ作成</p>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="グループ名"
          className="w-full px-4 py-2.5 rounded-xl bg-navy text-text-primary text-sm border border-surface-border focus:outline-none focus:border-primary"
        />
        <input
          type="text"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="説明（任意）"
          className="w-full px-4 py-2.5 rounded-xl bg-navy text-text-primary text-sm border border-surface-border focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold neu-raised-sm disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          作成
        </button>
      </div>

      {/* Group list */}
      {loading ? (
        <p className="text-sm text-text-muted text-center py-8">読み込み中...</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">グループがありません</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-surface border border-surface-border rounded-2xl p-4 neu-raised">
              {editingId === g.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-navy text-text-primary text-sm border border-surface-border focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="説明"
                    className="w-full px-3 py-2 rounded-xl bg-navy text-text-primary text-sm border border-surface-border focus:outline-none focus:border-primary"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="w-9 h-9 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={() => handleUpdate(g.id)}
                      className="w-9 h-9 rounded-xl bg-primary neu-raised-sm flex items-center justify-center text-white"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-primary">{g.name}</p>
                    {g.description && (
                      <p className="text-xs text-text-secondary mt-0.5">{g.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(g)}
                    className="w-9 h-9 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="w-9 h-9 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-red-400 active:scale-95"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

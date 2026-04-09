"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAllUsers,
  fetchGroups,
  updateUserRole,
  assignUserToGroup,
  removeUserFromGroup,
  type UserWithGroups,
  type Group,
  type UserRole,
} from "@/lib/admin";
import { useAdminStore } from "@/store/useAdminStore";
import { Search, Shield, ShieldCheck, User, Plus, X } from "lucide-react";

export default function UserList() {
  const isSuperAdmin = useAdminStore((s) => s.isSuperAdmin);
  const [users, setUsers] = useState<UserWithGroups[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, g] = await Promise.all([fetchAllUsers(), fetchGroups()]);
    setUsers(u);
    setGroups(g);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  );

  const handleRoleChange = async (userId: string, role: UserRole) => {
    await updateUserRole(userId, role);
    await load();
  };

  const handleAssignGroup = async (userId: string, groupId: string) => {
    await assignUserToGroup(userId, groupId);
    await load();
  };

  const handleRemoveGroup = async (userId: string, groupId: string) => {
    await removeUserFromGroup(userId, groupId);
    await load();
  };

  const roleIcon = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return <ShieldCheck size={16} className="text-amber-400" />;
      case "admin":
        return <Shield size={16} className="text-blue-400" />;
      default:
        return <User size={16} className="text-text-muted" />;
    }
  };

  const roleLabel = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return "スーパー管理者";
      case "admin":
        return "管理者";
      default:
        return "一般ユーザー";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="メールで検索..."
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-navy text-text-primary text-base border border-surface-border focus:outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <p className="text-sm text-text-muted text-center py-8">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">ユーザーが見つかりません</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((user) => {
            const isExpanded = expandedUser === user.id;
            const availableGroups = groups.filter(
              (g) => !user.groups.some((ug) => ug.id === g.id)
            );

            return (
              <div key={user.id} className="bg-surface border border-surface-border rounded-2xl p-4 neu-raised">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                    {user.email?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-primary truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {roleIcon(user.role)}
                      <span className="text-xs text-text-secondary">{roleLabel(user.role)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {user.groups.map((g) => (
                      <span key={g.id} className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                        {g.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-surface-border flex flex-col gap-3">
                    {/* Role management (super_admin only) */}
                    {isSuperAdmin && user.role !== "super_admin" && (
                      <div>
                        <p className="text-xs text-text-muted mb-2">ロール変更</p>
                        <div className="flex gap-2">
                          {(["user", "admin"] as UserRole[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => handleRoleChange(user.id, r)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                                user.role === r
                                  ? "bg-primary text-white"
                                  : "bg-navy text-text-secondary neu-raised-sm"
                              }`}
                            >
                              {roleLabel(r)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Group management */}
                    <div>
                      <p className="text-xs text-text-muted mb-2">グループ</p>
                      <div className="flex flex-wrap gap-2">
                        {user.groups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => handleRemoveGroup(user.id, g.id)}
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
                              if (e.target.value) handleAssignGroup(user.id, e.target.value);
                            }}
                          >
                            <option value="">
                              <Plus size={12} /> 追加...
                            </option>
                            {availableGroups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

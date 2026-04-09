"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/store/useAdminStore";
import { useAuthStore } from "@/store/useAuthStore";
import UserList from "@/components/admin/UserList";
import GroupManager from "@/components/admin/GroupManager";
import ProgramAssigner from "@/components/admin/ProgramAssigner";
import { ArrowLeft, Users, FolderTree, Music2 } from "lucide-react";

type AdminTab = "users" | "groups" | "programs";

const TABS: { key: AdminTab; label: string; icon: typeof Users }[] = [
  { key: "users", label: "ユーザー", icon: Users },
  { key: "groups", label: "グループ", icon: FolderTree },
  { key: "programs", label: "プログラム", icon: Music2 },
];

export default function AdminPage() {
  const router = useRouter();
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const roleLoaded = useAdminStore((s) => s.roleLoaded);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const [tab, setTab] = useState<AdminTab>("users");

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && roleLoaded && (!user || !isAdmin)) {
      router.replace("/");
    }
  }, [authLoading, roleLoaded, user, isAdmin, router]);

  if (authLoading || !roleLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-text-muted">読み込み中...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 pt-6 pb-24" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="w-10 h-10 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">管理パネル</h1>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "users" && <UserList />}
      {tab === "groups" && <GroupManager />}
      {tab === "programs" && <ProgramAssigner />}
    </div>
  );
}

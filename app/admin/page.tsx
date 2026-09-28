"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/store/useAdminStore";
import { useAuthStore } from "@/store/useAuthStore";
import UserList from "@/components/admin/UserList";
import GroupManager from "@/components/admin/GroupManager";
import ProgramAssigner from "@/components/admin/ProgramAssigner";
import AudioStudio from "@/components/admin/AudioStudio";
import { BareColumn } from "@/components/PageColumn";
import { useT, type LocalizedText } from "@/lib/i18n";
import { ArrowLeft, Users, FolderTree, Music2, Waves } from "lucide-react";

type AdminTab = "users" | "groups" | "audio" | "programs";

/**
 * 「音源」＝つくる・公開する（旧 Sync Session の管理者ブロック）、
 * 「配信」＝公開済みをグループへ割り当てる。もとの「プログラム」という名前は
 * 音源タブができると指す先が曖昧なので、役割どおり配信に改めた。
 */
const TABS: { key: AdminTab; label: LocalizedText; icon: typeof Users }[] = [
  { key: "users", label: { ja: "ユーザー", en: "Users" }, icon: Users },
  { key: "groups", label: { ja: "グループ", en: "Groups" }, icon: FolderTree },
  { key: "audio", label: { ja: "音源", en: "Audio" }, icon: Waves },
  { key: "programs", label: { ja: "配信", en: "Assign" }, icon: Music2 },
];

export default function AdminPage() {
  const router = useRouter();
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const roleLoaded = useAdminStore((s) => s.roleLoaded);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const [tab, setTab] = useState<AdminTab>("users");
  const t = useT();

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && roleLoaded && (!user || !isAdmin)) {
      router.replace("/");
    }
  }, [authLoading, roleLoaded, user, isAdmin, router]);

  if (authLoading || !roleLoaded) {
    return (
      <BareColumn>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-sm text-text-muted">{t("読み込み中...", "Loading...")}</p>
        </div>
      </BareColumn>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <BareColumn>
    <div className="flex flex-col gap-4 pt-6 pb-24" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t("管理パネル", "Admin panel")}</h1>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
      </div>

      {/* Tab navigation — 4枚は横1列だと狭い端末で潰れるので、モバイルは2×2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`min-h-12 flex items-center justify-center gap-1.5 px-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-on-primary"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {t(item.label)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "users" && <UserList />}
      {tab === "groups" && <GroupManager />}
      {tab === "audio" && <AudioStudio />}
      {tab === "programs" && <ProgramAssigner />}
    </div>
    </BareColumn>
  );
}

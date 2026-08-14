"use client";

import { useState, useEffect, useMemo } from "react";
import { PROGRAMS } from "@/lib/programs";
import ProgramCard from "@/components/ProgramCard";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAuthStore } from "@/store/useAuthStore";
import WaterMandalaHero from "@/components/WaterMandalaHero";

/**
 * Sync Session — 聴くための画面。今日の星座周波数の水マンダラ、Sync Sound の
 * 3節目、グループに配信されたプログラムが並ぶ。
 *
 * 音源をつくる・公開する管理者向けの操作（カスタムプログラム、合成器の新規
 * 作成、公開／取り下げ）はここには置かない——管理パネルの「音源」タブに集約
 * した。再生自体は /player、脳波測定は Sync Brain。
 */
export default function SessionPage() {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const userGroups = useAdminStore((s) => s.userGroups);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const groupProgramIds = usePublishedProgramsStore((s) => s.groupProgramIds);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);
  const fetchGroupProgramIds = usePublishedProgramsStore((s) => s.fetchGroupProgramIds);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const isLoggedIn = !!user;

  // Guard against hydration mismatch from persist middleware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Fetch group→program assignments when user groups change
  useEffect(() => {
    if (userGroups.length > 0) {
      fetchGroupProgramIds(userGroups.map((g) => g.id));
    }
  }, [userGroups, fetchGroupProgramIds]);

  // Filter published programs: admins see all, regular users see only programs assigned to their groups
  const visiblePrograms = useMemo(() => {
    if (isAdmin) return publishedPrograms;
    if (!isLoggedIn || groupProgramIds.length === 0) return [];
    return publishedPrograms.filter((p) => groupProgramIds.includes(p.id));
  }, [isAdmin, isLoggedIn, publishedPrograms, groupProgramIds]);

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sync Session</h1>
        <p className="text-sm text-text-secondary mt-1">シンク・セッション｜プログラム選択・再生</p>
      </div>

      {/* Mobile: single column. Desktop: mandala + built-ins | published + custom. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-6">
      {/* Today's frequency as a water mandala — the first thing on entry */}
      <WaterMandalaHero />

      {/* Programs — the "Sync Sound" lineup */}
      <div className="flex flex-col gap-3 breathe-stagger">
        <p className="text-sm text-text-secondary">Sync Sound（シンク・サウンド / 脳波同期サウンド）</p>
        {PROGRAMS.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>
      </div>

      <div className="flex flex-col gap-6">
      {/* Published Programs (filtered by group) */}
      {hydrated && visiblePrograms.length > 0 && (
        <div className="flex flex-col gap-3 breathe-stagger">
          <p className="text-sm text-text-secondary">配信プログラム</p>
          {visiblePrograms.map((program) => (
            <PublishedProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}

      {/* Login CTA for unauthenticated users */}
      {!isLoggedIn && !authLoading && (
        <button
          onClick={() => openAuthModal("login")}
          className="w-full py-4 rounded-3xl bg-surface border border-surface-border text-center neu-raised neu-press active:scale-[0.98] transition-transform"
        >
          <p className="text-base font-bold text-text-primary">ログインしてもっと体験</p>
          {/* 合成器づくりは管理者の作業になったので、一般利用者に約束するのは
              「所属グループに配信されたプログラムが聴ける」こと */}
          <p className="text-sm text-text-secondary mt-1">
            グループに配信されたプログラムを再生できます
          </p>
        </button>
      )}
      </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { PROGRAMS } from "@/lib/programs";
import ProgramCard from "@/components/ProgramCard";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAuthStore } from "@/store/useAuthStore";
import WaterMandalaHero from "@/components/WaterMandalaHero";
import { ArrowRight, User } from "lucide-react";
import PageHeader from "@/components/PageHeader";

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
    <div className="flex flex-col gap-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader title="Sync Session" subtitle="プログラム選択・再生" />

      {/* Mobile: single column. Desktop: mandala + built-ins | published + custom. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <div className="flex flex-col gap-6">
      {/* Today's frequency as a water mandala — the first thing on entry */}
      <WaterMandalaHero />

      {/* Programs — the "Sync Sound" lineup */}
      <div className="flex flex-col gap-3 breathe-stagger">
        <p className="text-sm text-text-secondary">Sync Sound｜脳波同期サウンド</p>
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

      {/* Login CTA for unauthenticated users.
          未ログインのこの枠は、ログインすると「配信プログラム」の一覧に
          置き換わる場所。だから誘い文句ではなく、そこに何が入るのかを
          先に書いておく（合成器づくりは管理者の作業なので、一般利用者に
          約束するのは「所属グループに配信されたプログラムが聴ける」こと）。 */}
      {!isLoggedIn && !authLoading && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            ログインして配信されたプログラムを再生
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="w-full min-h-14 px-5 rounded-3xl bg-navy flex items-center justify-center gap-3 neu-raised neu-press active:scale-[0.98] transition-transform"
          >
            <span className="flex-1 flex items-center justify-center gap-2 text-base font-bold text-primary">
              <User size={20} strokeWidth={1.5} />
              ログイン
            </span>
            <span className="shrink-0 w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center">
              <ArrowRight size={20} strokeWidth={2} />
            </span>
          </button>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

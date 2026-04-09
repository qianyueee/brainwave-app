"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";
import BrainWeather from "@/components/BrainWeather";
import MoodSelector from "@/components/MoodSelector";
import ProgramCard from "@/components/ProgramCard";
import SynthPresetCard from "@/components/SynthPresetCard";
import CustomProgramCard from "@/components/CustomProgramCard";
import BrainRadarChart from "@/components/BrainRadarChart";
import { useSynthStore } from "@/store/useSynthStore";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { BrainCircuit, Plus, User, LogOut, Settings } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

export default function HomePage() {
  const router = useRouter();
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const resetEditor = useSynthStore((s) => s.resetEditor);
  const profile = useBrainProfileStore((s) => s.profile);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const userGroups = useAdminStore((s) => s.userGroups);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const groupProgramIds = usePublishedProgramsStore((s) => s.groupProgramIds);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);
  const fetchGroupProgramIds = usePublishedProgramsStore((s) => s.fetchGroupProgramIds);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const signOut = useAuthStore((s) => s.signOut);
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

  const handleNewSynth = () => {
    resetEditor();
    router.push("/synth");
  };

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">脳波チューニング</h1>
          <p className="text-sm text-text-secondary mt-1">
            バイノーラルビートで脳をチューニング
          </p>
        </div>
        {!authLoading && (
          isLoggedIn ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => router.push("/admin")}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-amber-400 active:scale-95"
                  title="管理パネル"
                >
                  <Settings size={20} strokeWidth={1.5} />
                </button>
              )}
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                {user.email?.charAt(0).toUpperCase() ?? "U"}
              </div>
              <button
                onClick={signOut}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted active:scale-95"
                title="ログアウト"
              >
                <LogOut size={20} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openAuthModal("login")}
              className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press active:scale-95"
            >
              <User size={18} strokeWidth={1.5} />
              ログイン
            </button>
          )
        )}
      </div>

      <BrainWeather />
      <MoodSelector />

      {/* Brain Profile Card */}
      {hydrated && (
        profile ? (
          <Link href="/profile" className="block bg-surface border border-surface-border rounded-3xl p-4 neu-raised neu-press transition-transform breathe">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-text-secondary">脳特性チャート</p>
              <span className="text-xs text-primary font-medium">詳細 →</span>
            </div>
            <BrainRadarChart indicators={profile.indicators} size="small" />
            <p className="text-xs text-text-muted text-center">
              最終更新: {new Date(profile.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
          </Link>
        ) : (
          <Link
            href="/profile"
            className="block w-full bg-surface border border-surface-border rounded-3xl p-4 text-center neu-raised neu-press transition-transform breathe"
          >
            <div className="flex justify-center mb-2">
              <BrainCircuit size={36} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-text-primary">脳波データをアップロード</p>
            <p className="text-sm text-text-secondary mt-1">
              パーソナライズされたプログラムを体験
            </p>
          </Link>
        )
      )}

      {/* Programs */}
      <div className="flex flex-col gap-3 breathe-stagger">
        <p className="text-sm text-text-secondary">プログラム一覧</p>
        {PROGRAMS.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>

      {/* Published Programs (filtered by group) */}
      {hydrated && visiblePrograms.length > 0 && (
        <div className="flex flex-col gap-3 breathe-stagger">
          {visiblePrograms.map((program) => (
            <PublishedProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}

      {/* Custom Programs (admin only) */}
      {isLoggedIn && isAdmin && hydrated && savedPrograms.length > 0 && (
        <div className="flex flex-col gap-3 breathe-stagger">
          <p className="text-sm text-text-secondary">カスタムプログラム</p>
          {savedPrograms.map((program) => (
            <CustomProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}

      {/* Custom Synth (admin only) */}
      {isLoggedIn && isAdmin && (
        <div className="flex flex-col gap-3 breathe-stagger">
          <p className="text-sm text-text-secondary">カスタム</p>
          <button
            onClick={handleNewSynth}
            className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2} />
            新規作成
          </button>
          {hydrated &&
            savedPresets.map((preset) => (
              <SynthPresetCard key={preset.id} preset={preset} />
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
          <p className="text-sm text-text-secondary mt-1">
            カスタム合成器・プログラムを利用できます
          </p>
        </button>
      )}
    </div>
  );
}

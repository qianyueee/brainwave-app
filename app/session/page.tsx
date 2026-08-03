"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROGRAMS } from "@/lib/programs";
import ProgramCard from "@/components/ProgramCard";
import SynthPresetCard from "@/components/SynthPresetCard";
import CustomProgramCard from "@/components/CustomProgramCard";
import PublishedProgramCard from "@/components/PublishedProgramCard";
import { useSynthStore } from "@/store/useSynthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { useAuthStore } from "@/store/useAuthStore";
import WaterMandalaHero from "@/components/WaterMandalaHero";
import { Plus } from "lucide-react";

/**
 * Sync Session — every program/audio entry point lives here (moved off the
 * home page): the water-mandala hero for today's zodiac frequency, the
 * Sync Sound built-ins, group-published programs, and the admin-only custom
 * program / synth tooling. Playback itself stays on /player, reached through
 * the cards. The live EEG measurement lives on Sync Brain.
 */
export default function SessionPage() {
  const router = useRouter();
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const resetEditor = useSynthStore((s) => s.resetEditor);
  const setTimelineMode = useSynthStore((s) => s.setTimelineMode);
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

  const handleNewSynth = () => {
    resetEditor();
    router.push("/synth");
  };

  const handleNewTimeline = () => {
    resetEditor();
    setTimelineMode(true); // seeds segment 0 from the (reset) editor buffer
    router.push("/synth");
  };

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
          <div className="flex gap-2">
            <button
              onClick={handleNewSynth}
              className="flex-1 py-3 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
            >
              <Plus size={18} strokeWidth={2} />
              新規作成
            </button>
            <button
              onClick={handleNewTimeline}
              className="flex-1 py-3 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
            >
              <Plus size={18} strokeWidth={2} />
              タイムライン
            </button>
          </div>
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
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
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
import { BrainCircuit, Plus } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const resetEditor = useSynthStore((s) => s.resetEditor);
  const profile = useBrainProfileStore((s) => s.profile);

  // Guard against hydration mismatch from persist middleware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleNewSynth = () => {
    resetEditor();
    router.push("/synth");
  };

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">脳波チューニング</h1>
        <p className="text-sm text-text-secondary mt-1">
          バイノーラルビートで脳をチューニング
        </p>
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

      {/* Custom Programs */}
      {hydrated && savedPrograms.length > 0 && (
        <div className="flex flex-col gap-3 breathe-stagger">
          <p className="text-sm text-text-secondary">カスタムプログラム</p>
          {savedPrograms.map((program) => (
            <CustomProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}

      {/* Custom Synth */}
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
    </div>
  );
}

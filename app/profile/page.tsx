"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainBandPie from "@/components/BrainBandPie";
import IndicatorHelp from "@/components/IndicatorHelp";
import EegUploader from "@/components/EegUploader";
import { BrainCircuit, Lock } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const profile = useBrainProfileStore((s) => s.profile);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const clearProfile = useBrainProfileStore((s) => s.clearProfile);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  // Guard hydration mismatch from persist
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 pt-24" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="w-20 h-20 rounded-full bg-surface border border-surface-border flex items-center justify-center neu-raised">
          <Lock size={36} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">ログインが必要です</p>
          <p className="text-sm text-text-secondary mt-2">
            脳特性データはアカウントに保存されます
          </p>
        </div>
        <button
          onClick={() => openAuthModal("login")}
          className="h-12 px-8 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press"
        >
          ログイン
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          脳特性チャート
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          脳波データから6つの指標を分析
        </p>
      </div>

      {profile ? (
        <>
          {/* Mobile: single column. Desktop: radar (scores) | 8-band pie. */}
          <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="flex flex-col gap-6">
          {/* Radar chart — scores shown directly on each vertex */}
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <div className="flex items-center justify-center gap-2 mb-1">
              <h2 className="text-base font-bold text-text-primary">大脳特性</h2>
              <IndicatorHelp />
            </div>
            <BrainRadarChart indicators={profile.indicators} size="large" showScores />
            <p className="text-xs text-text-muted text-center mt-2">
              セッション: {profile.sessionTag} ・ 最終更新:{" "}
              {new Date(profile.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
          </div>

          {measurements.length > 0 && (
            <Link
              href="/log"
              className="block text-sm text-primary text-center underline underline-offset-4 active:opacity-70"
            >
              全 {measurements.length} 件の測定記録を見る →
            </Link>
          )}
          </div>

          <div className="flex flex-col gap-6">
          {/* 8-band balance pie (when the measurement carries band data) */}
          {profile.bands && (
            <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
              <p className="text-base font-bold text-text-primary mb-2 text-center">
                8種類の脳波バランス
              </p>
              <BrainBandPie powers={profile.bands} />
            </div>
          )}

          {/* Re-upload & Clear */}
          <div className="flex flex-col gap-3">
            <EegUploader />
            <button
              onClick={() => {
                if (window.confirm("すべての脳波記録を削除しますか？")) {
                  clearProfile().catch((err) => console.error(err));
                }
              }}
              className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-base font-medium neu-raised-sm neu-press transition-transform"
            >
              すべての記録を削除
            </button>
          </div>
          </div>
          </div>
        </>
      ) : (
        <>
          {/* Empty state */}
          <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised md:max-w-2xl md:mx-auto md:w-full">
            <div className="flex justify-center mb-4">
              <BrainCircuit size={48} className="text-primary" strokeWidth={1.5} />
            </div>
            <p className="text-lg font-bold text-text-primary mb-2">
              脳波データを分析しましょう
            </p>
            <p className="text-sm text-text-secondary mb-6">
              BrainLinkデバイスで測定したExcelまたはCSVファイルをアップロードすると、あなたの脳特性を6つの指標で可視化します。
            </p>
            <EegUploader />
          </div>
        </>
      )}
    </div>
  );
}

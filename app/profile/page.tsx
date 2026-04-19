"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import { INDICATOR_META } from "@/lib/brain-profile";
import BrainRadarChart from "@/components/BrainRadarChart";
import EegUploader from "@/components/EegUploader";
import { BrainCircuit, Lock } from "lucide-react";

export default function ProfilePage() {
  const profile = useBrainProfileStore((s) => s.profile);
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
          {/* Radar Chart */}
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <BrainRadarChart indicators={profile.indicators} size="large" />
            <p className="text-xs text-text-muted text-center mt-2">
              セッション: {profile.sessionTag} ・ 最終更新:{" "}
              {new Date(profile.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
          </div>

          {/* 6 Indicator Cards */}
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">各指標の詳細</p>
            {INDICATOR_META.map((meta) => {
              const score = profile.indicators[meta.key];
              return (
                <div key={meta.key} className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-base font-bold text-text-primary">{meta.label}</p>
                    <p className="text-lg font-mono font-bold text-primary tabular-nums">
                      {score}
                    </p>
                  </div>
                  {/* Score bar */}
                  <div className="w-full h-2 bg-navy-lighter rounded-full overflow-hidden mb-2 neu-inset">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score}%`,
                        backgroundColor:
                          score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444",
                      }}
                    />
                  </div>
                  <p className="text-sm text-text-secondary">{meta.description}</p>
                </div>
              );
            })}
          </div>

          {/* Re-upload & Clear */}
          <div className="flex flex-col gap-3">
            <EegUploader />
            <button
              onClick={clearProfile}
              className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-base font-medium neu-raised-sm neu-press transition-transform"
            >
              データをクリア
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Empty state */}
          <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised">
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

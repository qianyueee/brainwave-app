"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { INDICATOR_META } from "@/lib/brain-profile";
import BrainRadarChart from "@/components/BrainRadarChart";
import EegUploader from "@/components/EegUploader";

export default function ProfilePage() {
  const profile = useBrainProfileStore((s) => s.profile);
  const clearProfile = useBrainProfileStore((s) => s.clearProfile);

  // Guard hydration mismatch from persist
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">脳特性チャート</h1>
        <p className="text-sm text-text-secondary mt-1">
          脳波データから6つの指標を分析
        </p>
      </div>

      {profile ? (
        <>
          {/* Radar Chart */}
          <div className="bg-navy-light rounded-2xl p-4">
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
                <div key={meta.key} className="bg-navy-light rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-base font-bold text-text-primary">{meta.label}</p>
                    <p className="text-lg font-mono font-bold text-primary tabular-nums">
                      {score}
                    </p>
                  </div>
                  {/* Score bar */}
                  <div className="w-full h-2 bg-navy-lighter rounded-full overflow-hidden mb-2">
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
              className="w-full py-3 rounded-2xl border-2 border-text-muted text-text-secondary text-base font-medium transition-colors active:bg-navy-light"
            >
              データをクリア
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Empty state */}
          <div className="bg-navy-light rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🧠</div>
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

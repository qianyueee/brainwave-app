"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainBandPie from "@/components/BrainBandPie";
import BrainSpectrumChart from "@/components/BrainSpectrumChart";
import Fullscreenable from "@/components/Fullscreenable";
import IndicatorHelp from "@/components/IndicatorHelp";
import EegUploader from "@/components/EegUploader";
import { BrainCircuit, Lock } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const profile = useBrainProfileStore((s) => s.profile);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const clearProfile = useBrainProfileStore((s) => s.clearProfile);
  const viewingUploadedAt = useBrainProfileStore((s) => s.viewingUploadedAt);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  // Guard hydration mismatch from persist
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Which measurement to show: a past one picked from the log page (if it still
  // exists), otherwise the latest. `profile` is always the latest.
  const viewed = viewingUploadedAt
    ? measurements.find((m) => m.uploadedAt === viewingUploadedAt) ?? null
    : null;
  const displayed = viewed ?? profile;
  const isViewingPast = Boolean(viewed && profile && viewed.uploadedAt !== profile.uploadedAt);

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

      {/* Viewing a past measurement (opened from the log) — offer a way back. */}
      {isViewingPast && displayed && (
        <div className="flex items-center justify-between gap-3 bg-surface border border-primary rounded-2xl px-4 py-3 neu-raised">
          <p className="text-sm text-text-secondary">
            過去の測定を表示中：
            <span className="font-bold text-text-primary">
              {new Date(displayed.uploadedAt).toLocaleString("ja-JP", {
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
          <button
            onClick={() => setViewingMeasurement(null)}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-white text-sm font-bold neu-raised-sm neu-press transition-transform"
          >
            最新に戻る
          </button>
        </div>
      )}

      {displayed ? (
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
            <Fullscreenable title="大脳特性">
              <BrainRadarChart indicators={displayed.indicators} size="large" showScores />
            </Fullscreenable>
            <p className="text-xs text-text-muted text-center mt-2">
              セッション: {displayed.sessionTag} ・ 測定日:{" "}
              {new Date(displayed.uploadedAt).toLocaleDateString("ja-JP")}
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
          {/* 8-band balance pie — always shown, with an explanation when the
              measurement predates band data (legacy records omit it) */}
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <p className="text-base font-bold text-text-primary mb-2 text-center">
              8種類の脳波バランス
            </p>
            {displayed.bands ? (
              <Fullscreenable title="8種類の脳波バランス">
                <BrainBandPie powers={displayed.bands} />
              </Fullscreenable>
            ) : (
              <p className="text-sm text-text-secondary text-center py-8">
                この測定には脳波バランスのデータが含まれていません。
                <br />
                マインドマップで再測定するか、脳波ファイルを再アップロードすると表示されます。
              </p>
            )}
          </div>

          {/* Per-Hz frequency spectrum (realtime measurements only). */}
          {displayed.spectrum && displayed.spectrum.length > 0 && (
            <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
              <p className="text-base font-bold text-text-primary mb-1 text-center">
                周波数スペクトル
              </p>
              <p className="text-xs text-text-muted text-center mb-2">
                1〜{displayed.spectrum.length}Hz の相対振幅
              </p>
              <Fullscreenable title="周波数スペクトル">
                <BrainSpectrumChart spectrum={displayed.spectrum} />
              </Fullscreenable>
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

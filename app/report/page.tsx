"use client";

import { useState, useEffect } from "react";
import { useMindStore } from "@/store/useMindStore";
import { DummySource } from "@/lib/mind/dummy-source";
import { RealtimeSource } from "@/lib/mind/realtime-source";
import type { MindDataSource, MindSourceHandlers } from "@/lib/mind/data-source";
import { rawBandPowers, EMPTY_BAND_POWERS, type BandKey } from "@/lib/mind/types";
import MindMapCanvas from "@/components/mind/MindMapCanvas";
import MindArtCanvas from "@/components/mind/MindArtCanvas";
import MindStatusText from "@/components/mind/MindStatusText";
import BandEqualizer from "@/components/mind/BandEqualizer";
import MindTrendChart from "@/components/mind/MindTrendChart";
import MindRecorder from "@/components/mind/MindRecorder";
import SourceDialog from "@/components/mind/SourceDialog";
import SessionList from "@/components/mind/SessionList";
import SubjectSelector from "@/components/mind/SubjectSelector";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainBandPie from "@/components/BrainBandPie";
import BrainSpectrumChart from "@/components/BrainSpectrumChart";
import Fullscreenable from "@/components/Fullscreenable";
import IndicatorHelp from "@/components/IndicatorHelp";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { isLowQuality } from "@/lib/brain-profile";
import { BrainCircuit, Lock } from "lucide-react";
import Link from "next/link";

/**
 * Sync Report — the live EEG measurement (formerly the /session page) and the
 * 脳特性チャート analysis (the former report) merged into one page: measure at
 * the top, analyze below. /session now hosts the program/audio catalogue.
 */
export default function ReportPage() {
  // ── Live measurement (mind) wiring ──
  const sourceKind = useMindStore((s) => s.sourceKind);
  const latestSample = useMindStore((s) => s.latestSample);
  const history = useMindStore((s) => s.history);
  const pairingCode = useMindStore((s) => s.pairingCode);
  const gammaBoost = useMindStore((s) => s.gammaBoost);
  // Combined gamma + program pull toward the Zone (the displayed position).
  const zoneBoost = useMindStore((s) => s.zoneBoost);
  const isRecording = useMindStore((s) => s.isRecording);

  // 脳波バランス always shows the instantaneous latest sample so the bars stay
  // live and moving, during recording and idle alike. The 脳特性 import
  // separately summarizes the whole session as a full average (computed at stop).
  const bandPowers = latestSample ? rawBandPowers(latestSample) : EMPTY_BAND_POWERS;

  // Create/destroy the active data source. getState() actions are stable
  // references, so the handlers never go stale.
  useEffect(() => {
    const handlers: MindSourceHandlers = {
      onSample: (s) => useMindStore.getState().pushSample(s),
      onStatus: (status, detail) => useMindStore.getState().setStatus(status, detail),
      onBridgeOnline: (online) => useMindStore.getState().setBridgeOnline(online),
    };
    let source: MindDataSource | null = null;
    if (sourceKind === "demo") {
      source = new DummySource(handlers);
    } else if (pairingCode) {
      source = new RealtimeSource(pairingCode, handlers);
    } else {
      handlers.onStatus("idle");
    }
    source?.start();
    return () => {
      source?.stop();
      useMindStore.getState().setStatus("idle");
      useMindStore.getState().setBridgeOnline(false);
    };
  }, [sourceKind, pairingCode]);

  // ── Analysis (脳特性チャート) wiring ──
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

  // Bands hidden from the balance pie (δ usually dwarfs the rest). Held here,
  // not in the chart, so the inline and fullscreen copies stay in sync.
  const [hiddenBands, setHiddenBands] = useState<BandKey[]>([]);

  // Which measurement to show: a past one picked from the history page (if it
  // still exists), otherwise the latest. `profile` is always the latest.
  const viewed = viewingUploadedAt
    ? measurements.find((m) => m.uploadedAt === viewingUploadedAt) ?? null
    : null;
  const displayed = viewed ?? profile;
  const isViewingPast = Boolean(viewed && profile && viewed.uploadedAt !== profile.uploadedAt);

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sync Report</h1>
        <p className="text-sm text-text-secondary mt-1">シンク・レポート｜脳波同期・測定と分析</p>
      </div>

      {/* ══ Live measurement (moved here from the old /session page) ══ */}

      {/* Who is being measured — chosen before recording, since the session is
          stamped with it and the history is grouped by it. */}
      <SubjectSelector />

      {/* Top bar: 測定 + データソース side by side. */}
      <div className="flex gap-3">
        <div className="flex-1">
          <MindRecorder />
        </div>
        <div className="flex-1">
          <SourceDialog />
        </div>
      </div>

      {/* Mobile: single column. Desktop: map+meters (left) | art+history (right). */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="flex flex-col gap-6">
          {/* マインドマップ（四象限マップ + 状態）— ブレインアートと左右対称 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-text-primary">マインドマップ</h2>
            <MindMapCanvas sample={latestSample} boost={zoneBoost} isRecording={isRecording} />
            <MindStatusText sample={latestSample} boost={zoneBoost} gammaBoost={gammaBoost} />
          </section>

          <BandEqualizer powers={bandPowers} />

          <MindTrendChart history={history} />
        </div>

        <div className="flex flex-col gap-6">
          {/* リアルタイム脳波アート（ニューロフィードバック）— マインドマップと左右対称：
              見出し → 正方形キャンバス → 下に説明文 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-text-primary">ブレインアート</h2>
            <MindArtCanvas sample={latestSample} boost={zoneBoost} />
            <p className="text-sm text-text-secondary text-center">
              脳波がリアルタイムに幾何学模様として紡ぎ出されます
            </p>
          </section>

          {/* 過去の測定（タップで脳特性チャートを表示） */}
          <SessionList />
        </div>
      </div>

      {/* ══ Analysis — 脳特性チャート (the former report body) ══ */}

      <div className="border-t border-surface-border pt-6">
        <h2 className="text-xl font-bold text-text-primary">脳特性チャート</h2>
        <p className="text-sm text-text-secondary mt-1">脳波データから6つの指標を分析</p>
      </div>

      {!hydrated ? null : !authLoading && !user ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center neu-inset">
            <Lock size={28} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-text-secondary">
            ログインすると脳特性データをアカウントに保存・分析できます
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="h-12 px-8 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            ログイン
          </button>
        </div>
      ) : displayed ? (
        <>
          {/* Viewing a past measurement (opened from the history) — offer a way back. */}
          {isViewingPast && (
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

          {/* Mobile: single column. Desktop: radar (scores) | 8-band pie. */}
          <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="flex flex-col gap-6">
          {/* Radar chart — scores shown directly on each vertex */}
          <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
            <div className="flex items-center justify-center gap-2 mb-1">
              <h3 className="text-base font-bold text-text-primary">大脳特性</h3>
              <IndicatorHelp />
            </div>
            <Fullscreenable title="大脳特性">
              <BrainRadarChart indicators={displayed.indicators} size="large" showScores />
            </Fullscreenable>
            {displayed.subject && (
              <p className="text-sm font-bold text-primary text-center mt-2">
                測定者: {displayed.subject}
              </p>
            )}
            <p className="text-xs text-text-muted text-center mt-2">
              セッション: {displayed.sessionTag} ・ 測定日:{" "}
              {new Date(displayed.uploadedAt).toLocaleDateString("ja-JP")}
            </p>
            {displayed.qualityPct !== undefined && (
              <div className="flex flex-col items-center gap-1 mt-2">
                <SignalQualityBadge qualityPct={displayed.qualityPct} />
                {isLowQuality(displayed.qualityPct) && (
                  <p className="text-xs text-amber-400 text-center">
                    装着が不安定だったため、スコアは目安としてご覧ください
                  </p>
                )}
              </div>
            )}
          </div>

          {measurements.length > 0 && (
            <Link
              href="/history"
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
                <BrainBandPie
                  powers={displayed.bands}
                  hiddenKeys={hiddenBands}
                  onChangeHidden={setHiddenBands}
                />
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
              上の測定を実行するか、BrainLinkデバイスで測定したExcelまたはCSVファイルをアップロードすると、あなたの脳特性を6つの指標で可視化します。
            </p>
            <EegUploader />
          </div>
        </>
      )}
    </div>
  );
}

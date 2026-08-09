"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BrainProfile } from "@/lib/brain-profile";
import type { BandKey } from "@/lib/mind/types";
import { compositeScore, scoreColor, measurementLabel } from "@/lib/brain-measurements";
import BrainConditionMetrics from "@/components/BrainConditionMetrics";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainBandPie from "@/components/BrainBandPie";
import BrainSpectrumChart from "@/components/BrainSpectrumChart";
import BrainSpectrumCompare from "@/components/BrainSpectrumCompare";
import BrainRadarCompare from "@/components/BrainRadarCompare";
import Fullscreenable from "@/components/Fullscreenable";
import IndicatorHelp from "@/components/IndicatorHelp";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { isLowQuality } from "@/lib/brain-profile";
import { BrainCircuit, Lock, CheckSquare, Square, X } from "lucide-react";
import Link from "next/link";

function CompareCandidateRow({
  m,
  selected,
  onToggle,
}: {
  m: BrainProfile;
  selected: boolean;
  onToggle: (uploadedAt: string) => void;
}) {
  // Only measurements with a per-Hz spectrum can be compared.
  const selectable = Boolean(m.spectrum?.length);
  const total = compositeScore(m.indicators);

  return (
    <button
      onClick={() => onToggle(m.uploadedAt)}
      disabled={!selectable}
      aria-label={selected ? "選択を解除" : "比較に選択"}
      className={`w-full bg-surface border rounded-3xl p-4 flex items-center gap-3 text-left neu-raised transition-colors ${
        selected ? "border-primary" : "border-surface-border"
      } ${selectable ? "neu-press" : "opacity-50"}`}
    >
      {selectable && (
        <span className="shrink-0 text-primary">
          {selected ? <CheckSquare size={22} /> : <Square size={22} className="text-text-muted" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-text-primary">{measurementLabel(m)}</p>
        {m.subject && (
          <p className="text-sm font-bold text-primary truncate">{m.subject}</p>
        )}
        <p className="text-sm text-text-secondary truncate">{m.sessionTag}</p>
        <SignalQualityBadge qualityPct={m.qualityPct} className="mt-1" />
        {!selectable && (
          <p className="text-xs text-text-muted mt-1">比較対象外（スペクトルなし）</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-xl font-mono font-bold tabular-nums"
          style={{ color: scoreColor(total) }}
        >
          {total}
        </p>
        <p className="text-xs text-text-muted">総合</p>
      </div>
    </button>
  );
}

/**
 * Sync Report — the 脳特性チャート analysis (formerly on Sync Brain) merged
 * with the measurement comparison (formerly Sync Compare): read this
 * measurement at the top, compare measurements below. The 3 condition tiles
 * share data and computation with the home tiles (same store, same
 * computeBrainConditionMetrics), so the numbers always agree.
 */
export default function ReportPage() {
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

  // ── Comparison (the former Sync Compare page) ──
  // Up to three measurements picked (by uploadedAt). Stale ids (measurements
  // replaced out-of-band on an account switch) are ignored downstream —
  // `picked` derives from the current measurements, so a stale selection
  // never drives wrong feedback and ages out within a couple of picks.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-3)
    );

  // Newest first for the list
  const ordered = [...measurements].reverse();

  // The picked measurements (2–3), ordered oldest→newest for the chart.
  const picked = selectedIds
    .map((id) => measurements.find((m) => m.uploadedAt === id))
    .filter((m): m is BrainProfile => Boolean(m?.spectrum?.length))
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const canCompare = picked.length >= 2;

  const compareSection = (
    <>
      {canCompare && (
        <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-text-primary">測定の比較</p>
            <button
              onClick={() => setSelectedIds([])}
              aria-label="選択を解除"
              className="w-12 h-12 rounded-lg bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-text-secondary mb-1 text-center">6指標</p>
            <Fullscreenable title="6指標の比較">
              <BrainRadarCompare
                series={picked.map((m) => ({
                  indicators: m.indicators,
                  label: measurementLabel(m),
                }))}
              />
            </Fullscreenable>
          </div>

          <div>
            <p className="text-sm font-medium text-text-secondary mb-1 text-center">
              周波数スペクトル
            </p>
            <Fullscreenable title="周波数スペクトル比較">
              <BrainSpectrumCompare
                series={picked.map((m) => ({
                  spectrum: m.spectrum!,
                  label: measurementLabel(m),
                }))}
              />
            </Fullscreenable>
          </div>
        </div>
      )}
      {picked.length === 1 && (
        <p className="text-sm text-text-secondary text-center">
          もう1件選ぶと比較を表示します
        </p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Sync Report</h1>
        <p className="text-sm text-text-secondary mt-1">シンク・レポート｜脳特性分析・効果比較</p>
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
            className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            ログイン
          </button>
        </div>
      ) : (
        <>
          {/* ══ 脳特性チャート — the current measurement ══ */}

          <div>
            <h2 className="text-xl font-bold text-text-primary">脳特性チャート</h2>
            <p className="text-sm text-text-secondary mt-1">脳波データから6つの指標を分析</p>
          </div>

          {displayed ? (
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
                    className="shrink-0 min-h-12 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold neu-raised-sm neu-press transition-transform"
                  >
                    最新に戻る
                  </button>
                </div>
              )}

              {/* Condition tiles — same store + computeBrainConditionMetrics as the
                  home tiles, so the numbers always match; while a past measurement
                  is displayed they describe that measurement. */}
              <BrainConditionMetrics profile={displayed} asLink={false} />

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
                      <p className="text-xs text-warning text-center">
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
            /* Empty state */
            <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised md:max-w-2xl md:mx-auto md:w-full">
              <div className="flex justify-center mb-4">
                <BrainCircuit size={48} className="text-primary" strokeWidth={1.5} />
              </div>
              <p className="text-lg font-bold text-text-primary mb-2">
                脳波データを分析しましょう
              </p>
              <p className="text-sm text-text-secondary mb-6">
                シンク・ブレインで測定するか、BrainLinkデバイスで測定したExcelまたはCSVファイルをアップロードすると、あなたの脳特性を6つの指標で可視化します。
              </p>
              <EegUploader />
            </div>
          )}

          {/* ══ 測定の比較 — the former Sync Compare ══ */}

          {measurements.length > 0 && (
            <>
              <div className="border-t border-surface-border pt-6">
                <h2 className="text-xl font-bold text-text-primary">測定の比較</h2>
                <p className="text-sm text-text-secondary mt-1">
                  周波数スペクトルのある測定を2〜3件選ぶと、6指標とスペクトルを比較できます
                </p>
              </div>

              {/* Mobile: list then comparison below. Desktop: candidates | comparison. */}
              <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
                <div className="flex flex-col gap-3">
                  {ordered.map((m) => (
                    <CompareCandidateRow
                      key={m.uploadedAt}
                      m={m}
                      selected={selectedIds.includes(m.uploadedAt)}
                      onToggle={toggleSelect}
                    />
                  ))}
                </div>

                <div className="flex flex-col gap-6">{compareSection}</div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

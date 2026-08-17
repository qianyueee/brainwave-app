"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BrainProfile } from "@/lib/brain-profile";
import type { BandKey } from "@/lib/mind/types";
import {
  compositeScore,
  scoreColor,
  measurementLabel,
  measurementTitle,
  measurementSeriesLabel,
} from "@/lib/brain-measurements";
import { formatTargetHz } from "@/lib/mind/resonance";
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
import { BrainCircuit, Lock, CheckSquare, Square, X, GitCompare } from "lucide-react";
import Link from "next/link";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/** 大見出しの直下で切り替える2ページ。 */
type ReportTab = "profile" | "compare";

const REPORT_TABS: {
  key: ReportTab;
  label: string;
  icon: typeof BrainCircuit;
  /** タブ直下に出す説明（旧 h2 のリード文をそのまま使う） */
  lead: string;
}[] = [
  {
    key: "profile",
    label: "脳特性チャート",
    icon: BrainCircuit,
    lead: "脳波データから6つの指標を分析",
  },
  {
    key: "compare",
    label: "測定の比較",
    icon: GitCompare,
    lead: "周波数スペクトルのある測定を選ぶと6指標とスペクトルを表示します。2〜3件選ぶと重ねて比較できます",
  },
];

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
  // 下に添える小さい行。日時は見出しがメモに入れ替わったときだけ——メモが
  // 無ければ見出し自体が日時なので、同じ文字列を2度書かない。sessionTag も
  // 取り込んだ測定では同じ日時の文字列になるため、違うとき（アップロードした
  // ファイルの Tag 列）だけ添える。
  const when = measurementLabel(m);
  const meta = [
    m.note?.trim() ? when : null,
    m.sessionTag && m.sessionTag !== when ? m.sessionTag : null,
  ]
    .filter(Boolean)
    .join("・");

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
        {/* 取り込みのときに書いたメモを見出しに、測定者名をその下に立てる。
            同じ人の似た回が並ぶ一覧なので、まず本人の言葉と名前で拾えるように——
            日時は小さく最後の行へ回す（無くさない、順位を下げるだけ）。 */}
        <p className="text-base font-bold text-text-primary break-words">
          {measurementTitle(m)}
        </p>
        <p className="text-sm font-bold text-primary truncate">
          測定者: {m.subject ?? "未設定"}
        </p>
        {meta && <p className="text-xs text-text-muted truncate">{meta}</p>}
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
 * Sync Report — the 脳特性チャート analysis (formerly on Sync Brain) and the
 * measurement comparison (formerly Sync Compare). The two used to stack on one
 * long scroll; they are now two pages switched by tabs under the page title —
 * reading one measurement and comparing several are separate errands, and the
 * comparison list sat far below the fold. The 3 condition tiles share data and
 * computation with the home tiles (same store, same computeBrainConditionMetrics),
 * so the numbers always agree.
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

  // 既定は脳特性チャート — ヒストリーの「レポートで見る」やホームの
  // 「詳細へ」はこの1件を読みに来る導線なので、そちらを先に見せる。
  const [tab, setTab] = useState<ReportTab>("profile");

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

  // 1件だけ選んだときも同じ2枚（6指標・スペクトル）を描く。選んだ瞬間に何も
  // 出ないと「押しても反応がない」画面になるし、2件目を足したときに同じ枠へ
  // 線が1本増えるだけなので、比較の読み方がそのまま続く。
  const compareSection = picked.length > 0 && (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-text-primary truncate">
            {canCompare ? "測定の比較" : measurementTitle(picked[0])}
          </p>
          {!canCompare && (
            <p className="text-xs text-text-muted">もう1件選ぶと重ねて比較できます</p>
          )}
        </div>
        <button
          onClick={() => setSelectedIds([])}
          aria-label="選択を解除"
          className="shrink-0 w-12 h-12 rounded-lg bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
        >
          <X size={18} />
        </button>
      </div>

      <div>
        <p className="text-sm font-medium text-text-secondary mb-1 text-center">6指標</p>
        <Fullscreenable title={canCompare ? "6指標の比較" : "6指標"}>
          <BrainRadarCompare
            series={picked.map((m) => ({
              indicators: m.indicators,
              label: measurementSeriesLabel(m),
            }))}
          />
        </Fullscreenable>
      </div>

      <div>
        <p className="text-sm font-medium text-text-secondary mb-1 text-center">
          周波数スペクトル
        </p>
        <Fullscreenable title={canCompare ? "周波数スペクトル比較" : "周波数スペクトル"}>
          <BrainSpectrumCompare
            series={picked.map((m) => ({
              spectrum: m.spectrum!,
              label: measurementSeriesLabel(m),
            }))}
          />
        </Fullscreenable>
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader title="Sync Report" subtitle="脳特性分析・効果比較" />

      <PageColumn>
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
          {/* 大見出し直下の2ページ切り替え。矢印キーでも移動できるよう
              tablist の作法どおりに組む（ボタン自体は48px確保）。 */}
          <div
            role="tablist"
            aria-label="レポートの表示切り替え"
            className="flex gap-2"
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = REPORT_TABS.findIndex((t) => t.key === tab);
              const next =
                REPORT_TABS[
                  (i + (e.key === "ArrowRight" ? 1 : REPORT_TABS.length - 1)) %
                    REPORT_TABS.length
                ];
              setTab(next.key);
              document.getElementById(`report-tab-${next.key}`)?.focus();
            }}
          >
            {REPORT_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  id={`report-tab-${t.key}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`report-panel-${t.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 min-h-12 flex items-center justify-center gap-2 px-3 rounded-2xl text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "bg-navy text-text-secondary neu-raised-sm neu-press"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} className="shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <p className="text-sm text-text-secondary -mt-2">
            {REPORT_TABS.find((t) => t.key === tab)!.lead}
          </p>
        </>
      )}

      {/* ══ 脳特性チャート — the current measurement ══ */}
      {hydrated && (authLoading || user) && tab === "profile" && (
        <div
          id="report-panel-profile"
          role="tabpanel"
          aria-labelledby="report-tab-profile"
          className="flex flex-col gap-6"
        >
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
                {/* Rate の共鳴率をどの Hz で見たか。入力があった回だけ出す
                    （無い回は既定の 40Hz で、これまでと同じ判定）。 */}
                {displayed.targetHz != null && (
                  <p className="text-xs text-text-muted text-center">
                    誘導周波数: {formatTargetHz(displayed.targetHz)}Hz
                  </p>
                )}
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
        </div>
      )}

      {/* ══ 測定の比較 — the former Sync Compare ══ */}
      {hydrated && (authLoading || user) && tab === "compare" && (
        <div
          id="report-panel-compare"
          role="tabpanel"
          aria-labelledby="report-tab-compare"
          className="flex flex-col gap-6"
        >
          {measurements.length > 0 ? (
            /* Mobile: list then comparison below. Desktop: candidates | comparison. */
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
          ) : (
            /* Empty state — 比較は測定が2件ないと始まらないので測定へ送る */
            <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised md:max-w-2xl md:mx-auto md:w-full">
              <div className="flex justify-center mb-4">
                <GitCompare size={48} className="text-primary" strokeWidth={1.5} />
              </div>
              <p className="text-lg font-bold text-text-primary mb-2">
                比較できる測定がまだありません
              </p>
              <p className="text-sm text-text-secondary mb-6">
                測定を2件以上ためると、6指標と周波数スペクトルを重ねて見比べられます。
              </p>
              <Link
                href="/brain"
                className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
              >
                測定へ
              </Link>
            </div>
          )}
        </div>
      )}
      </PageColumn>
    </div>
  );
}

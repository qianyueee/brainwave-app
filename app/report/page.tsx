"use client";

import { useState, useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useRefreshAccountViewsOnMount } from "@/lib/sync/account-views";
import { displayedSpectrum, type BandKey } from "@/lib/mind/types";
import { sessionTagLabel } from "@/lib/brain-measurements";
import { formatTargetHz } from "@/lib/mind/resonance";
import { subjectDisplayName } from "@/lib/subject-groups";
import { intlLocale, useLocale, useT, type LocalizedText } from "@/lib/i18n";
import BrainConditionMetrics from "@/components/BrainConditionMetrics";
import BrainRadarChart from "@/components/BrainRadarChart";
import BrainBandPie from "@/components/BrainBandPie";
import BrainSpectrumChart from "@/components/BrainSpectrumChart";
import BrainAiAnalysis from "@/components/BrainAiAnalysis";
import MeasurementCompare from "@/components/MeasurementCompare";
import Fullscreenable from "@/components/Fullscreenable";
import IndicatorHelp from "@/components/IndicatorHelp";
import EegUploader from "@/components/EegUploader";
import SignalQualityBadge from "@/components/SignalQualityBadge";
import { isLowQuality } from "@/lib/brain-profile";
import { BrainCircuit, Lock, GitCompare } from "lucide-react";
import Link from "next/link";
import PageColumn from "@/components/PageColumn";
import PageHeader from "@/components/PageHeader";

/** 大見出しの直下で切り替える2ページ。 */
type ReportTab = "profile" | "compare";

const REPORT_TABS: {
  key: ReportTab;
  label: LocalizedText;
  icon: typeof BrainCircuit;
  /** タブ直下に出す説明（旧 h2 のリード文をそのまま使う） */
  lead: LocalizedText;
}[] = [
  {
    key: "profile",
    label: { ja: "脳特性チャート", en: "Brain profile" },
    icon: BrainCircuit,
    lead: {
      ja: "脳波データから6つの指標を分析",
      en: "Your brainwave data analyzed as 6 indicators",
    },
  },
  {
    key: "compare",
    label: { ja: "測定の比較", en: "Compare" },
    icon: GitCompare,
    lead: {
      ja: "測定者と測定データを選ぶと6指標と脳波バランスを表示します。比較する測定データを選ぶと並べて比較できます（3件まで）",
      en: "Choose a person and a measurement to see its 6 indicators and brainwave balance. Add measurements to compare them side by side (up to 3).",
    },
  },
];

/**
 * Sync Report — the 脳特性チャート analysis (formerly on Sync Brain) and the
 * measurement comparison (formerly Sync Compare). The two used to stack on one
 * long scroll; they are now two pages switched by tabs under the page title —
 * reading one measurement and comparing several are separate errands, and the
 * comparison list sat far below the fold. The comparison picks its records with
 * the 測定者 → 測定データ pickers that used to live on Sync History
 * (components/MeasurementCompare). The 3 condition tiles share data and
 * computation with the home tiles (same store, same computeBrainConditionMetrics),
 * so the numbers always agree.
 */
export default function ReportPage() {
  const t = useT();
  const locale = useLocale();
  const profile = useBrainProfileStore((s) => s.profile);
  const measurements = useBrainProfileStore((s) => s.measurements);
  const clearProfile = useBrainProfileStore((s) => s.clearProfile);
  const viewingUploadedAt = useBrainProfileStore((s) => s.viewingUploadedAt);
  const setViewingMeasurement = useBrainProfileStore((s) => s.setViewingMeasurement);
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  // Pick up records measured on another device (the desktop app) since the
  // last read — navigating here inside the app fires no focus event.
  useRefreshAccountViewsOnMount();

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

  return (
    <div style={{ animation: "fade-in 0.3s ease-out" }}>
      <PageHeader
        title="Sync Report"
        subtitle={t("脳特性分析・効果比較", "Brain profile analysis & comparison")}
      />

      <PageColumn>
      {!hydrated ? null : !authLoading && !user ? (
        <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center neu-inset">
            <Lock size={28} className="text-text-muted" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-text-secondary">
            {t(
              "ログインすると脳特性データをアカウントに保存・分析できます",
              "Log in to save your brain profile data to your account and analyze it"
            )}
          </p>
          <button
            onClick={() => openAuthModal("login")}
            className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
          >
            {t("ログイン", "Log in")}
          </button>
        </div>
      ) : (
        <>
          {/* 大見出し直下の2ページ切り替え。矢印キーでも移動できるよう
              tablist の作法どおりに組む（ボタン自体は48px確保）。 */}
          <div
            role="tablist"
            aria-label={t("レポートの表示切り替え", "Report views")}
            className="flex gap-2"
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = REPORT_TABS.findIndex((rt) => rt.key === tab);
              const next =
                REPORT_TABS[
                  (i + (e.key === "ArrowRight" ? 1 : REPORT_TABS.length - 1)) %
                    REPORT_TABS.length
                ];
              setTab(next.key);
              document.getElementById(`report-tab-${next.key}`)?.focus();
            }}
          >
            {REPORT_TABS.map((rt) => {
              const Icon = rt.icon;
              const isActive = tab === rt.key;
              return (
                <button
                  key={rt.key}
                  id={`report-tab-${rt.key}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`report-panel-${rt.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(rt.key)}
                  className={`flex-1 min-h-12 flex items-center justify-center gap-2 px-3 rounded-2xl text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "bg-navy text-text-secondary neu-raised-sm neu-press"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} className="shrink-0" />
                  {t(rt.label)}
                </button>
              );
            })}
          </div>

          <p className="text-sm text-text-secondary -mt-2">
            {t(REPORT_TABS.find((rt) => rt.key === tab)!.lead)}
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
                    {t("過去の測定を表示中：", "Viewing a past measurement: ")}
                    <span className="font-bold text-text-primary">
                      {new Date(displayed.uploadedAt).toLocaleString(intlLocale(locale), {
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
                    {t("最新に戻る", "Back to latest")}
                  </button>
                </div>
              )}

              {/* Condition tiles — same store + computeBrainConditionMetrics as the
                  home tiles, so the numbers always match; while a past measurement
                  is displayed they describe that measurement. */}
              <BrainConditionMetrics profile={displayed} asLink={false} />

              {/* モバイル：1列（大脳特性 → AI 分析 → 記録へ → 脳波バランス → スペクトル →
                  アップロード）。デスクトップ：2×2 のグリッドに置き直す——1段目＝大脳特性｜
                  脳波バランス、2段目＝AI 分析｜スペクトル。左右を別々の縦列にすると、隣り合う
                  2枚の高さが中身しだいでずれる（大脳特性のほうが長い）。同じ段に入れれば
                  グリッドが2枚を同じ高さに揃え、2段目も同じ線から始まる。DOM の順番は変えず
                  row/col の指定だけで並べ替えるので、モバイルの順は従来どおり。 */}
              <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6">
              {/* Radar chart — scores shown directly on each vertex */}
              <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col md:col-start-1 md:row-start-1">
                {/* 見出しの行は2枚とも 48px（右の？ボタンの高さ）——見出しと全画面ボタンの
                    高さが隣のカードと揃う。 */}
                <div className="flex items-center justify-center gap-2 min-h-12 mb-1">
                  <h3 className="text-base font-bold text-text-primary">
                    {t("大脳特性", "Brain profile")}
                  </h3>
                  <IndicatorHelp />
                </div>
                {/* 段の高さに引き伸ばされたときは、中身をその真ん中に置く。 */}
                <div className="flex-1 flex flex-col justify-center">
                <Fullscreenable title={t("大脳特性", "Brain profile")}>
                  <BrainRadarChart indicators={displayed.indicators} size="large" showScores />
                </Fullscreenable>
                {displayed.subject && (
                  <p className="text-sm font-bold text-primary text-center mt-2">
                    {t("測定者", "Person")}: {subjectDisplayName(displayed.subject, locale)}
                  </p>
                )}
                <p className="text-xs text-text-muted text-center mt-2">
                  {t("セッション", "Session")}: {sessionTagLabel(displayed, locale)}
                  {t(" ・ 測定日:", " · Measured:")}{" "}
                  {new Date(displayed.uploadedAt).toLocaleDateString(intlLocale(locale))}
                </p>
                {/* Rate の共鳴率をどの Hz で見たか。セッションを流しながら測った回
                    （以前の記録は手で入力した回）だけ出す——無い回は既定の 40Hz。 */}
                {displayed.targetHz != null && (
                  <p className="text-xs text-text-muted text-center">
                    {t("誘導周波数", "Target frequency")}: {formatTargetHz(displayed.targetHz)}Hz
                  </p>
                )}
                {displayed.qualityPct !== undefined && (
                  <div className="flex flex-col items-center gap-1 mt-2">
                    <SignalQualityBadge qualityPct={displayed.qualityPct} />
                    {isLowQuality(displayed.qualityPct) && (
                      <p className="text-xs text-warning text-center">
                        {t(
                          "装着が不安定だったため、スコアは目安としてご覧ください",
                          "The headset fit was unstable, so treat these scores as a rough guide."
                        )}
                      </p>
                    )}
                  </div>
                )}
                </div>
              </div>

              <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2 md:self-start">
              {/* AI（DeepSeek）による分析——大脳特性の読み解きなので、その真下に置く。 */}
              <BrainAiAnalysis measurement={displayed} />

              {measurements.length > 0 && (
                <Link
                  href="/history"
                  className="block text-sm text-primary text-center underline underline-offset-4 active:opacity-70"
                >
                  {t(
                    `全 ${measurements.length} 件の測定記録を見る →`,
                    measurements.length === 1
                      ? "See your 1 measurement record →"
                      : `See all ${measurements.length} measurement records →`
                  )}
                </Link>
              )}
              </div>

              {/* 8-band balance pie — always shown, with an explanation when the
                  measurement predates band data (legacy records omit it) */}
              <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised flex flex-col md:col-start-2 md:row-start-1">
                <div className="flex items-center justify-center min-h-12 mb-1">
                  <h3 className="text-base font-bold text-text-primary text-center">
                    {t("8種類の脳波バランス", "Brainwave balance (8 types)")}
                  </h3>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                {displayed.bands ? (
                  <Fullscreenable title={t("8種類の脳波バランス", "Brainwave balance (8 types)")}>
                    <BrainBandPie
                      powers={displayed.bands}
                      hiddenKeys={hiddenBands}
                      onChangeHidden={setHiddenBands}
                    />
                  </Fullscreenable>
                ) : (
                  <p className="text-sm text-text-secondary text-center py-8">
                    {t(
                      "この測定には脳波バランスのデータが含まれていません。",
                      "This measurement has no brainwave balance data."
                    )}
                    <br />
                    {t(
                      "マインドマップで再測定するか、脳波ファイルを再アップロードすると表示されます。",
                      "Measure again with the mind map, or upload the brainwave file again, to see it."
                    )}
                  </p>
                )}
                </div>
              </div>

              <div className="flex flex-col gap-6 md:col-start-2 md:row-start-2 md:self-start">
              {/* Per-Hz frequency spectrum (realtime measurements only). */}
              {displayed.spectrum && displayed.spectrum.length > 0 && (
                <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
                  <p className="text-base font-bold text-text-primary mb-1 text-center">
                    {t("周波数スペクトル", "Frequency spectrum")}
                  </p>
                  <p className="text-xs text-text-muted text-center mb-2">
                    {t(
                      `1〜${displayedSpectrum(displayed.spectrum).length}Hz の相対振幅`,
                      `Relative amplitude, 1–${displayedSpectrum(displayed.spectrum).length} Hz`
                    )}
                  </p>
                  <Fullscreenable title={t("周波数スペクトル", "Frequency spectrum")}>
                    <BrainSpectrumChart spectrum={displayed.spectrum} />
                  </Fullscreenable>
                </div>
              )}

              {/* Re-upload & Clear */}
              <div className="flex flex-col gap-3">
                <EegUploader />
                <button
                  onClick={() => {
                    if (window.confirm(t("すべての脳波記録を削除しますか？", "Delete all brainwave records?"))) {
                      clearProfile().catch((err) => console.error(err));
                    }
                  }}
                  className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-base font-medium neu-raised-sm neu-press transition-transform"
                >
                  {t("すべての記録を削除", "Delete all records")}
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
                {t("脳波データを分析しましょう", "Let's analyze your brainwave data")}
              </p>
              <p className="text-sm text-text-secondary mb-6">
                {t(
                  "シンク・ブレインや PC の測定アプリ（ログインして測定）で測るか、BrainLinkデバイスで測定したExcelまたはCSVファイルをアップロードすると、あなたの脳特性を6つの指標で可視化します。",
                  "Measure with Sync Brain or the PC measurement app (log in to measure), or upload an Excel or CSV file recorded with a BrainLink device, and your brain profile will be shown as 6 indicators."
                )}
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
            <MeasurementCompare />
          ) : (
            /* Empty state — 比較は測定が2件ないと始まらないので測定へ送る */
            <div className="bg-surface border border-surface-border rounded-3xl p-8 text-center neu-raised md:max-w-2xl md:mx-auto md:w-full">
              <div className="flex justify-center mb-4">
                <GitCompare size={48} className="text-primary" strokeWidth={1.5} />
              </div>
              <p className="text-lg font-bold text-text-primary mb-2">
                {t("比較できる測定がまだありません", "No measurements to compare yet")}
              </p>
              <p className="text-sm text-text-secondary mb-6">
                {t(
                  "測定を2件以上ためると、6指標と脳波バランスを並べて見比べられます。",
                  "Once you have 2 or more measurements, you can compare their 6 indicators and brainwave balance side by side."
                )}
              </p>
              <Link
                href="/brain"
                className="inline-flex items-center justify-center min-h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
              >
                {t("測定へ", "Take a measurement")}
              </Link>
            </div>
          )}
        </div>
      )}
      </PageColumn>
    </div>
  );
}

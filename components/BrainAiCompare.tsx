"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { BrainProfile } from "@/lib/brain-profile";
import {
  COMPARISON_MIN,
  buildComparisonInput,
  comparisonKeys,
  comparisonTreatmentPairs,
  samePairs,
  type BrainComparisonContent,
  type CurrentTreatmentPair,
  type TreatmentPair,
} from "@/lib/brain-analysis";
import { measurementLabel } from "@/lib/brain-measurements";
import { mainProgramLabel } from "@/lib/mind/playback-label";
import { treatmentPhaseLabel, treatmentPhasesTitle } from "@/lib/treatment-phase-label";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import {
  EMPTY_AI_ENTRY,
  comparisonKey,
  useBrainAnalysisStore,
} from "@/store/useBrainAnalysisStore";
import AiAnalysisCard, { AiList, AiSection } from "@/components/AiAnalysisCard";

/** 英語の見出し（"Before and after the session"）を文の途中に入れる。 */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * 「施術前 11月12日 10:00 → 施術中 11月12日 10:20・♪リセット＆ディープ」——AI が施術の
 * 時点どうしとして比べた組（保存された pairs）。どの測定がどの時点かを本文の前に示す。
 */
function PairCaption({ pairs, measurements }: { pairs: TreatmentPair[]; measurements: BrainProfile[] }) {
  const t = useT();
  const locale = useLocale();
  const lines = pairs.flatMap((p) => {
    const from = measurements.find((m) => m.uploadedAt === p.from);
    const to = measurements.find((m) => m.uploadedAt === p.to);
    if (!from || !to) return [];
    const program = mainProgramLabel(to.playback, locale);
    const a = `${treatmentPhaseLabel(p.fromPhase, locale, { short: true })} ${measurementLabel(from, locale)}`;
    const b = `${treatmentPhaseLabel(p.toPhase, locale, { short: true })} ${measurementLabel(to, locale)}`;
    return [t(`${a} → ${b}${program ? `・${program}` : ""}`, `${a} → ${b}${program ? ` · ${program}` : ""}`)];
  });
  if (lines.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-text-secondary">
          {line}
        </p>
      ))}
    </div>
  );
}

function ComparisonBody({
  content,
  samePerson,
  measurements,
  currentPairs,
}: {
  content: BrainComparisonContent;
  samePerson: boolean;
  measurements: BrainProfile[];
  /** いまの記録で組んだ施術の時点どうしの組（lib/before-after.ts の決まり）。 */
  currentPairs: CurrentTreatmentPair[];
}) {
  const t = useT();
  const locale = useLocale();
  const hasSection = content.beforeAfter.length > 0;
  // 見出しは比べた時点で：「施術前と施術後」「施術前と施術中」「施術前・施術中・施術後」。
  // 組が読めない（保存の形が崩れた）ときは施術前後と呼ぶ（以前の分析と同じ）。
  const savedPhases = content.pairs.flatMap((p) => [p.fromPhase, p.toPhase]);
  const sectionTitle = treatmentPhasesTitle(
    savedPhases.length ? savedPhases : ["before", "after"],
    locale
  );
  return (
    <div className="flex flex-col gap-4">
      {/* 施術の節より前に作った分析（または関数が施術の時点を知らないとき）。 */}
      {currentPairs.length > 0 && !hasSection && (
        <p className="text-sm text-text-secondary bg-navy rounded-xl px-3 py-2">
          {t(
            "もう一度分析すると、施術による変化の比較も入ります。",
            "Analyze again to add how things changed across the session."
          )}
        </p>
      )}
      {/* 分析した後に施術のタイミングを選び直した（または組み方が変わった）。 */}
      {hasSection && !samePairs(content.pairs, currentPairs) && (
        <p className="text-sm text-text-secondary bg-navy rounded-xl px-3 py-2">
          {t(
            "施術のタイミングの組み合わせが、分析した時と変わっています。もう一度分析すると、いまの組み合わせで比べ直します。",
            "The session timings have changed since this analysis. Analyze again to compare them as they are now."
          )}
        </p>
      )}
      <AiSection title={t("総評", "Overview")}>
        <p className="text-base text-text-primary">{content.summary}</p>
      </AiSection>
      {hasSection && (
        // 施術前→施術中・施術後、施術中→施術後。組は関数が決めて保存したもの
        // （lib/before-after.ts と同じ決まり）。
        <AiSection title={sectionTitle}>
          <PairCaption pairs={content.pairs} measurements={measurements} />
          <AiList items={content.beforeAfter} />
        </AiSection>
      )}
      {content.differences.length > 0 && (
        <AiSection title={t("主な違い", "Main differences")}>
          <AiList items={content.differences} />
        </AiSection>
      )}
      {content.strengths.length > 0 && (
        // 同じ人なら古い測定から新しい測定への変化、別の人どうしなら横並びの比較
        // として AI に頼んでいる（analyze-brain の buildCompareMessages）。見出しも合わせる。
        <AiSection
          title={
            samePerson
              ? t("良くなった点", "What improved")
              : t("それぞれの良いところ", "What each did well")
          }
        >
          <AiList items={content.strengths} />
        </AiSection>
      )}
      {content.cautions.length > 0 && (
        <AiSection title={t("気をつけたい点", "Things to watch")}>
          <AiList items={content.cautions} />
        </AiSection>
      )}
      {content.suggestions.length > 0 && (
        <AiSection title={t("おすすめ", "Suggestions")}>
          <AiList items={content.suggestions} />
        </AiSection>
      )}
    </div>
  );
}

/**
 * Sync Report「測定の比較」の「AIによる比較分析」。選んだ 2〜3件の数値を DeepSeek に
 * 送って（Edge Function analyze-brain の比較分析）、違いを言葉にしてもらう。結果は
 * アカウントに組ごとに1件残る——同じ測定の組を選び直せば、別の端末でも同じものが出る。
 * どれか1件の測定を消すと、その組の分析も一緒に消える（migration 007）。
 *
 * 送るのは数値と日時だけ（lib/brain-analysis.ts の buildComparisonInput）。メモと
 * 名前は送らない。測った人が選んだ施術のタイミングと、測定中にプレーヤーにプログラムが
 * 入っていた秒も送り、施術前・施術中・施術後の測定があれば、AI がその変化を
 * 「施術前と施術後」などの節にまとめる（lib/before-after.ts）。
 */
export default function BrainAiCompare({ measurements }: { measurements: BrainProfile[] }) {
  const t = useT();
  const locale = useLocale();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // 古い順のキー。保存された分析の並び（uploaded_a / b / c）と同じ。
  const keys = comparisonKeys(measurements);
  const signature = keys.join("\u0000");
  const entry = useBrainAnalysisStore((s) =>
    userId ? s.comparisons[comparisonKey(userId, keys)] ?? EMPTY_AI_ENTRY : EMPTY_AI_ENTRY
  );
  const loadComparison = useBrainAnalysisStore((s) => s.loadComparison);
  const compare = useBrainAnalysisStore((s) => s.compare);

  useEffect(() => {
    const picked = signature.split("\u0000");
    if (supabase && userId && picked.length >= COMPARISON_MIN) void loadComparison(userId, picked);
  }, [userId, signature, loadComparison]);

  // Supabase が無いビルド・ログアウト中・1件しか選んでいないときは出さない。
  if (!supabase || !userId || keys.length < COMPARISON_MIN) return null;

  // 測定者の無い記録（アップロード・測定者より前の記録）は「名前の無い人」1人として
  // 数える——送る形の person と同じ数え方。
  const samePerson = new Set(measurements.map((m) => m.subject ?? "")).size === 1;
  // 施術の時点どうしの組（同じ人で、早い時点が先）。選んだタイミングが無い回は
  // プレーヤーの状態から推し量る——そのときは分析の前に読み方を書いておく。
  const currentPairs = comparisonTreatmentPairs(measurements);
  const pairedPhases = currentPairs.flatMap((p) => [p.fromPhase, p.toPhase]);
  const guessed = currentPairs.some((p) => p.guessed);

  return (
    <AiAnalysisCard
      titleId="ai-compare-title"
      title={t("AIによる比較分析", "AI comparison")}
      intro={
        t(
          "選んだ測定の数値をAI（DeepSeek）が見比べて、違いを分かりやすい言葉でまとめます。メモや名前は送りません。",
          "The AI (DeepSeek) compares the numbers of the chosen measurements and sums up the differences in plain words. Your notes and names are not sent."
        ) +
        (currentPairs.length > 0
          ? t(
              `${treatmentPhasesTitle(pairedPhases, locale)}の変化もまとめます。`,
              ` It also sums up the change ${lowerFirst(treatmentPhasesTitle(pairedPhases, locale))}.`
            ) +
            (guessed
              ? t(
                  "施術のタイミングを選んでいない回は、プログラムを流さずに測った回を施術前、流しながら測った回を施術中、一時停止したまま測った回を施術後とみなします。",
                  " For a measurement without a chosen timing, one taken without a program counts as before the session, one with a program playing as during, and one with a program paused as after."
                )
              : "")
          : "")
      }
      runLabel={t("AIで比較分析する", "Compare with AI")}
      entry={entry}
      renderBody={(comparison) => (
        <ComparisonBody
          content={comparison.content}
          samePerson={samePerson}
          measurements={measurements}
          currentPairs={currentPairs}
        />
      )}
      errorText={{
        not_configured: {
          ja: "AIによる比較分析はまだ準備中です。",
          en: "AI comparison isn't available yet.",
        },
        not_saved: {
          ja: "選んだ測定の中に、まだアカウントに保存されていないものがあります。少し待ってからお試しください。",
          en: "One of the chosen measurements isn't saved to your account yet. Please wait a moment and try again.",
        },
      }}
      onRun={() => void compare(userId, buildComparisonInput(measurements, locale))}
      onReload={() => void loadComparison(userId, keys)}
    />
  );
}
